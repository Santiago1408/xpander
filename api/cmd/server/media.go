package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
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

var storageKeyPattern = regexp.MustCompile(`^[a-f0-9]{32}\.(jpg|png)$`)

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
	decoded, mimeType, extension, err := decodeUploadedImage(data)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := os.MkdirAll(service.mediaDir, 0700); err != nil {
		serverError(w, "create media directory", err)
		return
	}
	randomName := make([]byte, 16)
	if _, err := rand.Read(randomName); err != nil {
		serverError(w, "generate media name", err)
		return
	}
	key := hex.EncodeToString(randomName) + extension
	path := filepath.Join(service.mediaDir, key)
	output, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		serverError(w, "open media file", err)
		return
	}
	removeFile := true
	defer func() {
		if removeFile {
			_ = os.Remove(path)
		}
	}()
	if mimeType == "image/jpeg" {
		err = jpeg.Encode(output, decoded, &jpeg.Options{Quality: 85})
	} else {
		err = png.Encode(output, decoded)
	}
	closeErr := output.Close()
	if err != nil || closeErr != nil {
		serverError(w, "encode media file", errors.Join(err, closeErr))
		return
	}
	stat, err := os.Stat(path)
	if err != nil || stat.Size() > maxImageBytes*2 {
		http.Error(w, "imagen codificada demasiado grande", http.StatusBadRequest)
		return
	}
	var id int64
	err = service.pool.QueryRow(r.Context(), `INSERT INTO media
		(kind, source_type, storage_key, mime_type, alt_text,
		file_size_bytes, width_px, height_px)
		VALUES ('image', 'local', $1, $2, $3, $4, $5, $6) RETURNING id`,
		key, mimeType, altText, stat.Size(), decoded.Bounds().Dx(), decoded.Bounds().Dy()).Scan(&id)
	if err != nil {
		serverError(w, "record uploaded media", err)
		return
	}
	removeFile = false
	writeJSON(w, http.StatusCreated, landingMedia{
		ID: id, Kind: "image", URL: fmt.Sprintf("/api/admin/media/%d", id), AltText: altText,
	})
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
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.NotFound(w, r)
		return
	}
	var key, mimeType string
	query := `SELECT storage_key, mime_type FROM media
		WHERE id=$1 AND source_type='local' AND kind='image'`
	if !admin {
		query += ` AND (
			EXISTS (SELECT 1 FROM page_publication_media WHERE media_id=$1)
			OR EXISTS (SELECT 1 FROM product_media pm
				JOIN products p ON p.id=pm.product_id
				WHERE pm.media_id=$1 AND p.status='active'
				AND EXISTS (SELECT 1 FROM product_variants v
					WHERE v.product_id=p.id AND v.is_active))
		)`
	}
	err = service.pool.QueryRow(r.Context(), query, id).Scan(&key, &mimeType)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		serverError(w, "find media", err)
		return
	}
	if !storageKeyPattern.MatchString(key) || (mimeType != "image/jpeg" && mimeType != "image/png") {
		serverError(w, "invalid stored media metadata", errors.New("bad media key or type"))
		return
	}
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if admin {
		w.Header().Set("Cache-Control", "no-store")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	http.ServeFile(w, r, filepath.Join(service.mediaDir, key))
}
