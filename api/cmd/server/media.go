package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

const (
	maxImageBytes  = 8 << 20
	maxImagePixels = 12_000_000
)

var storageKeyPattern = regexp.MustCompile(`^[a-f0-9]{32}\.(jpg|png|webp)$`)
var variantKeyPattern = regexp.MustCompile(`^[a-f0-9]{32}-(thumb|card|detail)\.webp$`)

func validStoredImageKey(key, mimeType string) bool {
	if !storageKeyPattern.MatchString(key) && !variantKeyPattern.MatchString(key) {
		return false
	}
	switch filepath.Ext(key) {
	case ".jpg":
		return mimeType == "image/jpeg"
	case ".png":
		return mimeType == "image/png"
	case ".webp":
		return mimeType == "image/webp"
	}
	return false
}

func decodeUploadedImage(data []byte) (image.Image, string, string, error) {
	if len(data) == 0 || len(data) > maxImageBytes {
		return nil, "", "", errors.New("archivo demasiado grande o vacío")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "jpeg" && format != "png") {
		return nil, "", "", errors.New("solo se admiten imágenes JPEG o PNG")
	}
	if config.Width < 1 || config.Height < 1 ||
		int64(config.Width)*int64(config.Height) > maxImagePixels {
		return nil, "", "", errors.New("dimensiones de imagen no permitidas")
	}
	decoded, decodedFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil || decodedFormat != format {
		return nil, "", "", errors.New("imagen dañada o inválida")
	}
	if format == "jpeg" {
		return decoded, "image/jpeg", ".jpg", nil
	}
	return decoded, "image/png", ".png", nil
}

func (service *landingService) uploadMedia(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.requireOwner(w, r, true); !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes+(1<<20))
	if err := r.ParseMultipartForm(maxImageBytes + (1 << 20)); err != nil {
		http.Error(w, "carga inválida o demasiado grande", http.StatusBadRequest)
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	altText := strings.TrimSpace(r.FormValue("altText"))
	purpose := strings.TrimSpace(r.FormValue("purpose"))
	if purpose == "" {
		purpose = "photo"
	}
	if purpose != "photo" && purpose != "qr" {
		http.Error(w, "tipo de imagen no admitido", http.StatusBadRequest)
		return
	}
	if len(altText) > 200 {
		http.Error(w, "texto alternativo demasiado largo", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "selecciona una imagen", http.StatusBadRequest)
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxImageBytes+1))
	if err != nil {
		http.Error(w, "no se pudo leer la imagen", http.StatusBadRequest)
		return
	}
	processed, err := processUploadedImage(r.Context(), service.mediaDir, data, purpose)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			serverError(w, "process uploaded image", err)
		} else {
			slog.Warn("image upload rejected", "error", err)
			http.Error(w, "imagen inválida o no se pudo procesar; usa JPEG, PNG o WebP de hasta 8 MiB", http.StatusBadRequest)
		}
		return
	}
	removeFile := true
	defer func() {
		if removeFile {
			processed.removeFiles(service.mediaDir)
		}
	}()
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin media upload", err)
		return
	}
	defer tx.Rollback(context.Background())
	var id int64
	err = tx.QueryRow(r.Context(), `INSERT INTO media
		(kind, source_type, purpose, storage_key, mime_type, alt_text,
		file_size_bytes, width_px, height_px)
		VALUES ('image', 'local', $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		purpose, processed.Main.Key, processed.Main.Mime, altText, processed.Main.Bytes,
		processed.Main.Width, processed.Main.Height).Scan(&id)
	if err != nil {
		serverError(w, "record uploaded media", err)
		return
	}
	for _, variant := range processed.Variants {
		if _, err := tx.Exec(r.Context(), `INSERT INTO media_variants
			(media_id, size_key, storage_key, mime_type, file_size_bytes, width_px, height_px)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`, id, variant.SizeKey, variant.Key,
			variant.Mime, variant.Bytes, variant.Width, variant.Height); err != nil {
			serverError(w, "record image variant", err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit media upload", err)
		return
	}
	removeFile = false
	writeJSON(w, http.StatusCreated, landingMedia{
		ID: id, Kind: "image", URL: fmt.Sprintf("/api/admin/media/%d", id), AltText: altText,
	})
}

type mediaLibraryItem struct {
	ID        int64  `json:"id"`
	Kind      string `json:"kind"`
	URL       string `json:"url"`
	AltText   string `json:"altText"`
	IsDeleted bool   `json:"isDeleted"`
	UseCount  int64  `json:"useCount"`
	Purpose   string `json:"purpose"`
	Bytes     int64  `json:"bytes"`
}

func (service *landingService) listMedia(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.requireOwner(w, r, false); !ok {
		return
	}
	rows, err := service.pool.Query(r.Context(), `SELECT m.id, COALESCE(m.alt_text,''),
		m.deleted_at IS NOT NULL, m.purpose,
		COALESCE(m.file_size_bytes,0) + COALESCE((SELECT sum(v.file_size_bytes)
			FROM media_variants v WHERE v.media_id=m.id),0),
		(SELECT count(*) FROM product_media pm WHERE pm.media_id=m.id)
		+ (SELECT count(*) FROM page_section_media sm WHERE sm.media_id=m.id)
		+ (SELECT count(*) FROM page_publication_media pubm WHERE pubm.media_id=m.id)
		+ (SELECT count(*) FROM business_profile bp WHERE bp.qr_media_id=m.id)
		FROM media m WHERE m.kind='image' AND m.source_type='local'
		ORDER BY m.id DESC`)
	if err != nil {
		serverError(w, "list media library", err)
		return
	}
	defer rows.Close()
	items := []mediaLibraryItem{}
	for rows.Next() {
		var item mediaLibraryItem
		if err := rows.Scan(&item.ID, &item.AltText, &item.IsDeleted,
			&item.Purpose, &item.Bytes, &item.UseCount); err != nil {
			serverError(w, "scan media library", err)
			return
		}
		item.URL = fmt.Sprintf("/api/admin/media/%d", item.ID)
		item.Kind = "image"
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		serverError(w, "list media library", err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (service *landingService) trashMedia(w http.ResponseWriter, r *http.Request) {
	service.changeMediaTrash(w, r, false)
}

func (service *landingService) restoreMedia(w http.ResponseWriter, r *http.Request) {
	service.changeMediaTrash(w, r, true)
}

func (service *landingService) changeMediaTrash(w http.ResponseWriter, r *http.Request, restore bool) {
	if _, ok := service.requireOwner(w, r, true); !ok {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	query := `UPDATE media SET deleted_at=now() WHERE id=$1 AND kind='image'
		AND source_type='local' AND deleted_at IS NULL RETURNING id`
	if restore {
		query = `UPDATE media SET deleted_at=NULL WHERE id=$1 AND kind='image'
			AND source_type='local' AND deleted_at IS NOT NULL RETURNING id`
	}
	var found int64
	if err := service.pool.QueryRow(r.Context(), query, id).Scan(&found); err != nil {
		vocabularyDBError(w, "change media recycle bin", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *landingService) serveAdminMedia(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.requireOwner(w, r, false); !ok {
		return
	}
	service.serveStoredMedia(w, r, true)
}

func (service *landingService) serveMedia(w http.ResponseWriter, r *http.Request) {
	service.serveStoredMedia(w, r, false)
}

func (service *landingService) serveStoredMedia(w http.ResponseWriter, r *http.Request, admin bool) {
	size := r.URL.Query().Get("size")
	if size != "" && size != "thumb" && size != "card" && size != "detail" {
		http.Error(w, "tamaño de imagen inválido", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.NotFound(w, r)
		return
	}
	var key, mimeType string
	query := `SELECT COALESCE(v.storage_key,m.storage_key), COALESCE(v.mime_type,m.mime_type)
		FROM media m LEFT JOIN media_variants v ON v.media_id=m.id AND v.size_key=$2
		WHERE m.id=$1 AND m.source_type='local' AND m.kind='image'`
	if !admin {
		query += ` AND (
			EXISTS (SELECT 1 FROM page_publication_media WHERE media_id=$1)
			OR EXISTS (SELECT 1 FROM business_profile WHERE qr_media_id=$1
				AND qr_expires_on >= (now() AT TIME ZONE 'America/La_Paz')::date
				AND m.deleted_at IS NULL)
			OR EXISTS (SELECT 1 FROM product_media pm
				JOIN products p ON p.id=pm.product_id
				WHERE pm.media_id=$1 AND p.status='active'
				AND p.deleted_at IS NULL
				AND m.deleted_at IS NULL
				AND EXISTS (SELECT 1 FROM product_variants v
					WHERE v.product_id=p.id AND v.is_active AND v.deleted_at IS NULL))
		)`
	}
	err = service.pool.QueryRow(r.Context(), query, id, size).Scan(&key, &mimeType)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		serverError(w, "find media", err)
		return
	}
	if !validStoredImageKey(key, mimeType) {
		serverError(w, "invalid stored media metadata", errors.New("bad media key or type"))
		return
	}
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if admin {
		w.Header().Set("Cache-Control", "no-store")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=60")
	}
	http.ServeFile(w, r, filepath.Join(service.mediaDir, key))
}
