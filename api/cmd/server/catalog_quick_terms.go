package main

import (
	"net/http"
	"sort"
	"strings"
	"unicode"

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
	Styles    []string `json:"styles"`
	Audiences []string `json:"audiences"`
	Colors    []string `json:"colors"`
}

func registerQuickCatalogRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &productService{pool: pool, admin: admin}
	mux.HandleFunc("GET /api/admin/catalog/suggestions", service.quickOptions)
	mux.HandleFunc("POST /api/admin/catalog/quick/products", service.createQuick)
	mux.HandleFunc("PUT /api/admin/catalog/quick/products/{id}", service.updateQuick)
}

func (service *productService) quickOptions(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	result := quickOptions{Styles: []string{}, Audiences: []string{}, Colors: []string{}}
	rows, err := service.pool.Query(r.Context(), `SELECT kind, name FROM catalog_terms ORDER BY kind, name`)
	if err != nil {
		serverError(w, "list managed product terms", err)
		return
	}
	for rows.Next() {
		var kind, name string
		if err := rows.Scan(&kind, &name); err != nil {
			rows.Close()
			serverError(w, "scan managed product term", err)
			return
		}
		if kind == "style" {
			result.Styles = append(result.Styles, name)
		} else {
			result.Audiences = append(result.Audiences, name)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "list managed product terms", err)
		return
	}
	rows, err = service.pool.Query(r.Context(), `SELECT color_label FROM products
		WHERE deleted_at IS NULL ORDER BY id`)
	if err != nil {
		serverError(w, "list product colors", err)
		return
	}
	seenColor := map[string]bool{}
	appendTerm := func(items []string, seen map[string]bool, raw string) []string {
		key := catalogKey(raw)
		if key == "" || seen[key] {
			return items
		}
		seen[key] = true
		return append(items, displayLabel(raw))
	}
	for rows.Next() {
		var color string
		if err := rows.Scan(&color); err != nil {
			rows.Close()
			serverError(w, "scan product suggestions", err)
			return
		}
		result.Colors = appendTerm(result.Colors, seenColor, color)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "list product suggestions", err)
		return
	}
	sort.Strings(result.Styles)
	sort.Strings(result.Audiences)
	sort.Strings(result.Colors)
	writeJSON(w, http.StatusOK, result)
}
