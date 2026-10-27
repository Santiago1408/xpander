package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type landingService struct {
	pool     *pgxpool.Pool
	admin    *adminAuth
	mediaDir string
}

type landingMedia struct {
	ID      int64  `json:"id"`
	Kind    string `json:"kind"`
	URL     string `json:"url"`
	AltText string `json:"altText"`
	Removed bool   `json:"removed,omitempty"`
}

type landingSection struct {
	ID        int64          `json:"id"`
	Key       string         `json:"key"`
	Type      string         `json:"type"`
	Title     string         `json:"title"`
	Body      string         `json:"body"`
	IsVisible bool           `json:"isVisible"`
	IsDeleted bool           `json:"isDeleted"`
	Media     []landingMedia `json:"media"`
}

type landingDraft struct {
	DraftRevision    int64            `json:"draftRevision"`
	PublishedVersion int64            `json:"publishedVersion"`
	Title            string           `json:"title"`
	SeoTitle         string           `json:"seoTitle"`
	SeoDescription   string           `json:"seoDescription"`
	Sections         []landingSection `json:"sections"`
}

type sectionInput struct {
	ID        int64   `json:"id"`
	Type      string  `json:"type"`
	Title     string  `json:"title"`
	Body      string  `json:"body"`
	IsVisible bool    `json:"isVisible"`
	IsDeleted bool    `json:"isDeleted"`
	MediaIDs  []int64 `json:"mediaIds"`
}

type draftInput struct {
	DraftRevision  int64           `json:"draftRevision"`
	Title          string          `json:"title"`
	SeoTitle       string          `json:"seoTitle"`
	SeoDescription string          `json:"seoDescription"`
	Sections       *[]sectionInput `json:"sections"`
}

type publishedSection struct {
	Key   string         `json:"key"`
	Type  string         `json:"type"`
	Title string         `json:"title"`
	Body  string         `json:"body"`
	Media []landingMedia `json:"media"`
}

type publishedLanding struct {
	Title          string             `json:"title"`
	SeoTitle       string             `json:"seoTitle"`
	SeoDescription string             `json:"seoDescription"`
	Sections       []publishedSection `json:"sections"`
}

func registerLandingRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth, mediaDir string) {
	service := &landingService{pool: pool, admin: admin, mediaDir: mediaDir}
	mux.HandleFunc("GET /api/landing", service.publicLanding)
	mux.HandleFunc("GET /api/admin/landing", service.getDraft)
	mux.HandleFunc("PUT /api/admin/landing", service.saveDraft)
	mux.HandleFunc("POST /api/admin/landing/publish", service.publish)
	mux.HandleFunc("GET /api/admin/landing/publications", service.publications)
	mux.HandleFunc("POST /api/admin/media", service.uploadMedia)
	mux.HandleFunc("GET /api/admin/media", service.listMedia)
	mux.HandleFunc("DELETE /api/admin/media/{id}", service.trashMedia)
	mux.HandleFunc("POST /api/admin/media/{id}/restore", service.restoreMedia)
	mux.HandleFunc("GET /api/admin/media/{id}", service.serveAdminMedia)
	mux.HandleFunc("GET /api/media/{id}", service.serveMedia)
}

func (service *landingService) requireOwner(w http.ResponseWriter, r *http.Request, mutating bool) (adminUser, bool) {
	w.Header().Set("Cache-Control", "no-store")
	if mutating && !service.admin.sameOrigin(r) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return adminUser{}, false
	}
	user, ok := service.admin.currentUser(w, r)
	if !ok {
		return adminUser{}, false
	}
	if user.Role != "owner" {
		http.Error(w, "permiso insuficiente", http.StatusForbidden)
		return adminUser{}, false
	}
	return user, true
}

func (service *landingService) publicLanding(w http.ResponseWriter, r *http.Request) {
	var snapshot []byte
	err := service.pool.QueryRow(r.Context(), `SELECT pub.snapshot
		FROM pages p JOIN page_publications pub ON pub.page_id = p.id
		WHERE p.slug = 'inicio' AND p.is_published
		ORDER BY pub.version DESC LIMIT 1`).Scan(&snapshot)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "landing no publicada", http.StatusNotFound)
		return
	}
	if err != nil {
		serverError(w, "read public landing", err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(snapshot)
}

func (service *landingService) getDraft(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.requireOwner(w, r, false); !ok {
		return
	}
	draft, err := service.loadDraft(r.Context())
	if err != nil {
		serverError(w, "read landing draft", err)
		return
	}
	writeJSON(w, http.StatusOK, draft)
}

func (service *landingService) loadDraft(ctx context.Context) (landingDraft, error) {
	var draft landingDraft
	var pageID int64
	err := service.pool.QueryRow(ctx, `SELECT p.id, p.draft_revision, p.title,
		COALESCE(p.seo_title, ''), COALESCE(p.seo_description, ''),
		COALESCE((SELECT max(version) FROM page_publications WHERE page_id = p.id), 0)
		FROM pages p WHERE p.slug = 'inicio'`).Scan(&pageID, &draft.DraftRevision,
		&draft.Title, &draft.SeoTitle, &draft.SeoDescription, &draft.PublishedVersion)
	if err != nil {
		return draft, err
	}
	rows, err := service.pool.Query(ctx, `SELECT id, section_key, section_type,
		COALESCE(title, ''), COALESCE(body, ''), is_visible, deleted_at IS NOT NULL
		FROM page_sections WHERE page_id = $1 ORDER BY sort_order, id`, pageID)
	if err != nil {
		return draft, err
	}
	draft.Sections = []landingSection{}
	for rows.Next() {
		var section landingSection
		if err := rows.Scan(&section.ID, &section.Key, &section.Type, &section.Title,
			&section.Body, &section.IsVisible, &section.IsDeleted); err != nil {
			rows.Close()
			return draft, err
		}
		draft.Sections = append(draft.Sections, section)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return draft, err
	}
	rows.Close()
	for index := range draft.Sections {
		media, err := service.sectionMedia(ctx, service.pool, draft.Sections[index].ID, true)
		if err != nil {
			return draft, err
		}
		draft.Sections[index].Media = media
	}
	return draft, nil
}

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func (service *landingService) sectionMedia(ctx context.Context, db queryer, sectionID int64, adminURL bool) ([]landingMedia, error) {
	rows, err := db.Query(ctx, `SELECT m.id, m.kind, m.source_type, COALESCE(m.external_url, ''),
		COALESCE(m.alt_text, '') FROM page_section_media sm
		JOIN media m ON m.id = sm.media_id
		WHERE sm.section_id = $1 ORDER BY sm.sort_order, m.id`, sectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	media := []landingMedia{}
	for rows.Next() {
		var item landingMedia
		var source, external string
		if err := rows.Scan(&item.ID, &item.Kind, &source, &external, &item.AltText); err != nil {
			return nil, err
		}
		if source == "local" {
			if adminURL {
				item.URL = fmt.Sprintf("/api/admin/media/%d", item.ID)
			} else {
				item.URL = fmt.Sprintf("/api/media/%d", item.ID)
			}
		} else {
			item.URL = external
		}
		media = append(media, item)
	}
	return media, rows.Err()
}

func validSectionType(value string) bool {
	switch value {
	case "hero", "text", "gallery", "contact":
		return true
	default:
		return false
	}
}

func validateDraft(input draftInput) error {
	if input.DraftRevision < 0 || input.Sections == nil || len(*input.Sections) > 30 {
		return errors.New("borrador inválido")
	}
	if strings.TrimSpace(input.Title) == "" || len(input.Title) > 180 || len(input.SeoTitle) > 180 || len(input.SeoDescription) > 500 {
		return errors.New("título o metadatos inválidos")
	}
	seen := map[int64]bool{}
	for _, section := range *input.Sections {
		if section.ID < 0 || !validSectionType(section.Type) || len(section.Title) > 180 || len(section.Body) > 10000 || len(section.MediaIDs) > 12 {
			return errors.New("sección inválida")
		}
		if section.ID != 0 {
			if seen[section.ID] {
				return errors.New("sección repetida")
			}
			seen[section.ID] = true
		}
		mediaSeen := map[int64]bool{}
		for _, mediaID := range section.MediaIDs {
			if mediaID <= 0 || mediaSeen[mediaID] {
				return errors.New("imagen repetida o inválida")
			}
			mediaSeen[mediaID] = true
		}
	}
	return nil
}

func decodeJSON(w http.ResponseWriter, r *http.Request, output any, maxBytes int64) bool {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		http.Error(w, "se requiere JSON", http.StatusUnsupportedMediaType)
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(output); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return false
	}
	return true
}

func (service *landingService) saveDraft(w http.ResponseWriter, r *http.Request) {
	user, ok := service.requireOwner(w, r, true)
	if !ok {
		return
	}
	var input draftInput
	if !decodeJSON(w, r, &input, 512*1024) {
		return
	}
	if err := validateDraft(input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin draft save", err)
		return
	}
	defer tx.Rollback(context.Background())
	var pageID, revision int64
	err = tx.QueryRow(r.Context(), `SELECT id, draft_revision FROM pages
		WHERE slug = 'inicio' FOR UPDATE`).Scan(&pageID, &revision)
	if err != nil {
		serverError(w, "lock draft", err)
		return
	}
	if revision != input.DraftRevision {
		http.Error(w, "el borrador cambió; recarga antes de guardar", http.StatusConflict)
		return
	}
	rows, err := tx.Query(r.Context(), `SELECT id FROM page_sections WHERE page_id = $1`, pageID)
	if err != nil {
		serverError(w, "list sections", err)
		return
	}
	existing := map[int64]bool{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			serverError(w, "scan sections", err)
			return
		}
		existing[id] = true
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		serverError(w, "list sections", err)
		return
	}
	rows.Close()
	for _, section := range *input.Sections {
		if section.ID != 0 && !existing[section.ID] {
			http.Error(w, "sección ajena o inexistente", http.StatusBadRequest)
			return
		}
		delete(existing, section.ID)
	}
	if len(existing) != 0 {
		http.Error(w, "faltan secciones del borrador; recarga", http.StatusConflict)
		return
	}
	for index, section := range *input.Sections {
		sectionID := section.ID
		if sectionID == 0 {
			key, err := randomSectionKey()
			if err != nil {
				serverError(w, "generate section key", err)
				return
			}
			err = tx.QueryRow(r.Context(), `INSERT INTO page_sections
				(page_id, section_key, section_type, title, body, sort_order, is_visible, deleted_at, deleted_by_user_id)
				VALUES ($1, $2, $3, $4, $5, $6, $7,
				CASE WHEN $8::boolean THEN now() ELSE NULL END,
				CASE WHEN $8::boolean THEN $9::bigint ELSE NULL END) RETURNING id`,
				pageID, key, section.Type, section.Title, section.Body, index*10,
				section.IsVisible, section.IsDeleted, user.ID).Scan(&sectionID)
		} else {
			_, err = tx.Exec(r.Context(), `UPDATE page_sections SET section_type=$2,
				title=$3, body=$4, sort_order=$5, is_visible=$6,
				deleted_at=CASE WHEN $7::boolean THEN COALESCE(deleted_at, now()) ELSE NULL END,
				deleted_by_user_id=CASE WHEN $7::boolean THEN COALESCE(deleted_by_user_id, $8::bigint) ELSE NULL END,
				updated_at=now() WHERE id=$1`, sectionID, section.Type, section.Title,
				section.Body, index*10, section.IsVisible, section.IsDeleted, user.ID)
		}
		if err != nil {
			serverError(w, "save section", err)
			return
		}
		if _, err := tx.Exec(r.Context(), `DELETE FROM page_section_media WHERE section_id=$1`, sectionID); err != nil {
			serverError(w, "replace section images", err)
			return
		}
		for mediaIndex, mediaID := range section.MediaIDs {
			var kind string
			if err := tx.QueryRow(r.Context(), `SELECT kind FROM media WHERE id=$1`, mediaID).Scan(&kind); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					http.Error(w, "imagen inexistente", http.StatusBadRequest)
				} else {
					serverError(w, "find draft image", err)
				}
				return
			}
			if kind != "image" {
				http.Error(w, "solo se admiten imágenes en esta etapa", http.StatusBadRequest)
				return
			}
			if _, err := tx.Exec(r.Context(), `INSERT INTO page_section_media (section_id, media_id, sort_order)
				VALUES ($1, $2, $3)`, sectionID, mediaID, mediaIndex*10); err != nil {
				serverError(w, "link section image", err)
				return
			}
		}
	}
	_, err = tx.Exec(r.Context(), `UPDATE pages SET title=$2, seo_title=NULLIF($3, ''),
		seo_description=NULLIF($4, ''), draft_revision=draft_revision+1, updated_at=now()
		WHERE id=$1`, pageID, strings.TrimSpace(input.Title), strings.TrimSpace(input.SeoTitle),
		strings.TrimSpace(input.SeoDescription))
	if err != nil {
		serverError(w, "save draft page", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit draft", err)
		return
	}
	draft, err := service.loadDraft(r.Context())
	if err != nil {
		serverError(w, "reload draft", err)
		return
	}
	writeJSON(w, http.StatusOK, draft)
}

func randomSectionKey() (string, error) {
	raw := make([]byte, 12)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return "section-" + hex.EncodeToString(raw), nil
}

func (service *landingService) publish(w http.ResponseWriter, r *http.Request) {
	user, ok := service.requireOwner(w, r, true)
	if !ok {
		return
	}
	var input struct {
		DraftRevision int64 `json:"draftRevision"`
	}
	if !decodeJSON(w, r, &input, 1024) {
		return
	}
	if input.DraftRevision < 0 {
		http.Error(w, "revisión inválida", http.StatusBadRequest)
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin publication", err)
		return
	}
	defer tx.Rollback(context.Background())
	var pageID, draftRevision int64
	var title, seoTitle, seoDescription string
	err = tx.QueryRow(r.Context(), `SELECT id, draft_revision, title,
		COALESCE(seo_title, ''), COALESCE(seo_description, '')
		FROM pages WHERE slug='inicio' FOR UPDATE`).Scan(
		&pageID, &draftRevision, &title, &seoTitle, &seoDescription)
	if err != nil {
		serverError(w, "lock page for publication", err)
		return
	}
	if draftRevision != input.DraftRevision {
		http.Error(w, "el borrador cambió; recarga antes de publicar", http.StatusConflict)
		return
	}
	var lastPublishedRevision int64
	if err := tx.QueryRow(r.Context(), `SELECT COALESCE(
		(SELECT draft_revision FROM page_publications WHERE page_id=$1
		 ORDER BY version DESC LIMIT 1), -1)`, pageID).Scan(&lastPublishedRevision); err != nil {
		serverError(w, "check current publication", err)
		return
	}
	if lastPublishedRevision == draftRevision {
		http.Error(w, "no hay cambios nuevos para publicar", http.StatusConflict)
		return
	}
	rows, err := tx.Query(r.Context(), `SELECT id, section_key, section_type,
		COALESCE(title, ''), COALESCE(body, '') FROM page_sections
		WHERE page_id=$1 AND is_visible AND deleted_at IS NULL ORDER BY sort_order, id`, pageID)
	if err != nil {
		serverError(w, "read visible sections", err)
		return
	}
	type sectionRow struct {
		id int64
		publishedSection
	}
	var sectionRows []sectionRow
	for rows.Next() {
		var section sectionRow
		if err := rows.Scan(&section.id, &section.Key, &section.Type,
			&section.Title, &section.Body); err != nil {
			rows.Close()
			serverError(w, "read visible sections", err)
			return
		}
		sectionRows = append(sectionRows, section)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		serverError(w, "read visible sections", err)
		return
	}
	rows.Close()
	if len(sectionRows) == 0 {
		http.Error(w, "agrega al menos una sección visible antes de publicar", http.StatusBadRequest)
		return
	}
	snapshot := publishedLanding{Title: title, SeoTitle: seoTitle,
		SeoDescription: seoDescription, Sections: []publishedSection{}}
	mediaIDs := map[int64]bool{}
	for _, section := range sectionRows {
		media, err := service.sectionMedia(r.Context(), tx, section.id, false)
		if err != nil {
			serverError(w, "read section images", err)
			return
		}
		section.Media = media
		for _, item := range media {
			mediaIDs[item.ID] = true
		}
		snapshot.Sections = append(snapshot.Sections, section.publishedSection)
	}
	body, err := json.Marshal(snapshot)
	if err != nil {
		serverError(w, "encode publication", err)
		return
	}
	var version, publicationID int64
	err = tx.QueryRow(r.Context(), `SELECT COALESCE(max(version), 0)+1
		FROM page_publications WHERE page_id=$1`, pageID).Scan(&version)
	if err != nil {
		serverError(w, "choose publication version", err)
		return
	}
	err = tx.QueryRow(r.Context(), `INSERT INTO page_publications
		(page_id, version, draft_revision, snapshot, published_by_user_id)
		VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id`,
		pageID, version, draftRevision, string(body), user.ID).Scan(&publicationID)
	if err != nil {
		serverError(w, "insert publication", err)
		return
	}
	for mediaID := range mediaIDs {
		if _, err := tx.Exec(r.Context(), `INSERT INTO page_publication_media
			(publication_id, media_id) VALUES ($1, $2)`, publicationID, mediaID); err != nil {
			serverError(w, "retain publication media", err)
			return
		}
	}
	if _, err := tx.Exec(r.Context(), `UPDATE pages SET is_published=TRUE, updated_at=now()
		WHERE id=$1`, pageID); err != nil {
		serverError(w, "mark page published", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit publication", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"version": version, "publishedAt": time.Now().UTC()})
}

func (service *landingService) publications(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.requireOwner(w, r, false); !ok {
		return
	}
	rows, err := service.pool.Query(r.Context(), `SELECT pub.version, pub.published_at,
		COALESCE(u.username, '') FROM page_publications pub
		JOIN pages p ON p.id=pub.page_id
		LEFT JOIN users u ON u.id=pub.published_by_user_id
		WHERE p.slug='inicio' ORDER BY pub.version DESC LIMIT 20`)
	if err != nil {
		serverError(w, "list publications", err)
		return
	}
	defer rows.Close()
	entries := []map[string]any{}
	for rows.Next() {
		var version int64
		var at time.Time
		var username string
		if err := rows.Scan(&version, &at, &username); err != nil {
			serverError(w, "scan publications", err)
			return
		}
		entries = append(entries, map[string]any{"version": version, "publishedAt": at, "username": username})
	}
	if err := rows.Err(); err != nil {
		serverError(w, "list publications", err)
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func serverError(w http.ResponseWriter, operation string, err error) {
	slog.Error(operation, "error", err)
	http.Error(w, "error del servidor", http.StatusInternalServerError)
}
