package main

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/text/unicode/norm"
)

func displayLabel(value string) string {
	return strings.ToUpper(strings.Join(strings.Fields(value), " "))
}

func catalogKey(value string) string {
	var result strings.Builder
	for _, char := range norm.NFD.String(displayLabel(value)) {
		if unicode.Is(unicode.Mn, char) {
			continue
		}
		if unicode.IsLetter(char) || unicode.IsDigit(char) {
			result.WriteRune(char)
		}
	}
	return result.String()
}

type quickOptions struct {
	Styles    []quickTerm `json:"styles"`
	Audiences []quickTerm `json:"audiences"`
	Brands    []quickTerm `json:"brands"`
	Colors    []quickTerm `json:"colors"`
}

type quickTerm struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

func registerQuickCatalogRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &productService{pool: pool, admin: admin}
	mux.HandleFunc("GET /api/admin/catalog/quick/options", service.quickOptions)
	mux.HandleFunc("POST /api/admin/catalog/quick/products", service.createQuick)
	mux.HandleFunc("PUT /api/admin/catalog/quick/products/{id}", service.updateQuick)
	mux.HandleFunc("DELETE /api/admin/catalog/quick/colors/{id}", service.trashQuickColor)
}

func appendUniqueLabel(items []quickTerm, seen map[string]bool, id int64, value string) []quickTerm {
	key := catalogKey(value)
	if key == "" || seen[key] {
		return items
	}
	seen[key] = true
	return append(items, quickTerm{ID: id, Name: displayLabel(value)})
}

func sortQuickTerms(items []quickTerm) {
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })
}

func (service *productService) quickOptions(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	result := quickOptions{Styles: []quickTerm{}, Audiences: []quickTerm{}, Brands: []quickTerm{}, Colors: []quickTerm{}}
	rows, err := service.pool.Query(r.Context(), `SELECT id, kind, name FROM categories
		WHERE deleted_at IS NULL AND is_active ORDER BY name, id`)
	if err != nil {
		serverError(w, "list category suggestions", err)
		return
	}
	stylesSeen, audiencesSeen := map[string]bool{}, map[string]bool{}
	for rows.Next() {
		var kind, name string
		var id int64
		if err := rows.Scan(&id, &kind, &name); err != nil {
			rows.Close()
			serverError(w, "scan category suggestion", err)
			return
		}
		if kind == "style" {
			result.Styles = appendUniqueLabel(result.Styles, stylesSeen, id, name)
		} else {
			result.Audiences = appendUniqueLabel(result.Audiences, audiencesSeen, id, name)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "list category suggestions", err)
		return
	}
	rows, err = service.pool.Query(r.Context(), `SELECT id, name FROM brands WHERE deleted_at IS NULL AND is_active ORDER BY name, id`)
	if err != nil {
		serverError(w, "list brand suggestions", err)
		return
	}
	seen := map[string]bool{}
	for rows.Next() {
		var name string
		var id int64
		if err := rows.Scan(&id, &name); err != nil {
			rows.Close()
			serverError(w, "scan brand suggestion", err)
			return
		}
		result.Brands = appendUniqueLabel(result.Brands, seen, id, name)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "list brand suggestions", err)
		return
	}
	rows, err = service.pool.Query(r.Context(), `SELECT id, name FROM colors WHERE deleted_at IS NULL ORDER BY name, id`)
	if err != nil {
		serverError(w, "list color suggestions", err)
		return
	}
	seen = map[string]bool{}
	for rows.Next() {
		var name string
		var id int64
		if err := rows.Scan(&id, &name); err != nil {
			rows.Close()
			serverError(w, "scan color suggestion", err)
			return
		}
		result.Colors = appendUniqueLabel(result.Colors, seen, id, name)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "list color suggestions", err)
		return
	}
	sortQuickTerms(result.Styles)
	sortQuickTerms(result.Audiences)
	sortQuickTerms(result.Brands)
	sortQuickTerms(result.Colors)
	writeJSON(w, http.StatusOK, result)
}

func (service *productService) trashQuickColor(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var found int64
	err := service.pool.QueryRow(r.Context(), `UPDATE colors SET deleted_at=now(), updated_at=now()
		WHERE id=$1 AND deleted_at IS NULL RETURNING id`, id).Scan(&found)
	if err != nil {
		vocabularyDBError(w, "trash color", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func findTerm(ctx context.Context, tx pgx.Tx, table, kind, key string) (int64, error) {
	query := "SELECT id, name FROM " + table + " WHERE deleted_at IS NULL"
	args := []any{}
	if table == "categories" {
		query += " AND kind=$1 AND is_active"
		args = append(args, kind)
	} else if table == "brands" {
		query += " AND is_active"
	}
	query += " ORDER BY id"
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return 0, err
		}
		if catalogKey(name) == key {
			return id, nil
		}
	}
	return 0, rows.Err()
}

func resolveTerm(ctx context.Context, tx pgx.Tx, table, kind, raw string) (int64, error) {
	label := displayLabel(raw)
	if label == "" {
		return 0, nil
	}
	key := catalogKey(label)
	if key == "" || len(label) > 120 || len(key) > 120 {
		return 0, errors.New("etiqueta inválida")
	}
	if id, err := findTerm(ctx, tx, table, kind, key); id > 0 || err != nil {
		return id, err
	}
	if table == "colors" {
		var id int64
		err := tx.QueryRow(ctx, `INSERT INTO colors (name, canonical_key)
			VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`, label, key).Scan(&id)
		if err == nil {
			return id, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return 0, err
		}
		return idForKey(ctx, tx, table, kind, key)
	}
	base := codeFromName(label)
	for attempt := 1; attempt <= 100; attempt++ {
		slug := codeWithSuffix(base, attempt)
		var id int64
		var err error
		if table == "categories" {
			err = tx.QueryRow(ctx, `INSERT INTO categories (slug, name, kind, canonical_key)
				VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`, slug, label, kind, key).Scan(&id)
		} else {
			err = tx.QueryRow(ctx, `INSERT INTO brands (slug, name, canonical_key)
				VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`, slug, label, key).Scan(&id)
		}
		if err == nil {
			return id, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return 0, err
		}
		if existing, err := idForKey(ctx, tx, table, kind, key); err == nil {
			return existing, nil
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return 0, err
		}
	}
	return 0, errors.New("no se pudo asignar un identificador a la etiqueta")
}

func idForKey(ctx context.Context, tx pgx.Tx, table, kind, key string) (int64, error) {
	var id int64
	query := "SELECT id FROM " + table + " WHERE canonical_key=$1 AND deleted_at IS NULL"
	args := []any{key}
	if table == "categories" {
		query += " AND kind=$2"
		args = append(args, kind)
	}
	err := tx.QueryRow(ctx, query, args...).Scan(&id)
	return id, err
}
