package main

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var vocabularyCodePattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{1,63}$`)
var colorPattern = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

type categoryRecord struct {
	ID          int64  `json:"id"`
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Description string `json:"description"`
	IsActive    bool   `json:"isActive"`
}

type brandRecord struct {
	ID       int64  `json:"id"`
	Slug     string `json:"slug"`
	Name     string `json:"name"`
	IsActive bool   `json:"isActive"`
}

type optionRecord struct {
	ID                    int64  `json:"id"`
	AttributeDefinitionID int64  `json:"attributeDefinitionId"`
	Value                 string `json:"value"`
	ColorHex              string `json:"colorHex"`
	IsActive              bool   `json:"isActive"`
}

type attributeRecord struct {
	ID       int64          `json:"id"`
	Code     string         `json:"code"`
	Name     string         `json:"name"`
	Scope    string         `json:"scope"`
	IsActive bool           `json:"isActive"`
	Options  []optionRecord `json:"options"`
}

type vocabularyResponse struct {
	Categories []categoryRecord  `json:"categories"`
	Brands     []brandRecord     `json:"brands"`
	Attributes []attributeRecord `json:"attributes"`
}

type vocabularyService struct {
	pool  *pgxpool.Pool
	admin *adminAuth
}

func registerVocabularyRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &vocabularyService{pool: pool, admin: admin}
	mux.HandleFunc("GET /api/admin/catalog/vocabulary", service.list)
	mux.HandleFunc("POST /api/admin/catalog/categories", service.createCategory)
	mux.HandleFunc("PUT /api/admin/catalog/categories/{id}", service.updateCategory)
	mux.HandleFunc("POST /api/admin/catalog/brands", service.createBrand)
	mux.HandleFunc("PUT /api/admin/catalog/brands/{id}", service.updateBrand)
	mux.HandleFunc("POST /api/admin/catalog/attributes", service.createAttribute)
	mux.HandleFunc("PUT /api/admin/catalog/attributes/{id}", service.updateAttribute)
	mux.HandleFunc("POST /api/admin/catalog/attributes/{id}/options", service.createOption)
	mux.HandleFunc("PUT /api/admin/catalog/options/{id}", service.updateOption)
}

func (service *vocabularyService) requireOwner(w http.ResponseWriter, r *http.Request) bool {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet && !service.admin.sameOrigin(r) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return false
	}
	user, ok := service.admin.currentUser(w, r)
	if !ok {
		return false
	}
	if user.Role != "owner" {
		http.Error(w, "permiso insuficiente", http.StatusForbidden)
		return false
	}
	return true
}

func readVocabulary(ctx context.Context, pool *pgxpool.Pool) (vocabularyResponse, error) {
	result := vocabularyResponse{
		Categories: []categoryRecord{}, Brands: []brandRecord{}, Attributes: []attributeRecord{},
	}
	rows, err := pool.Query(ctx, `SELECT id, slug, name, COALESCE(description, ''), is_active
		FROM categories ORDER BY sort_order, id`)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var item categoryRecord
		if err := rows.Scan(&item.ID, &item.Slug, &item.Name, &item.Description, &item.IsActive); err != nil {
			rows.Close()
			return result, err
		}
		result.Categories = append(result.Categories, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}

	rows, err = pool.Query(ctx, `SELECT id, slug, name, is_active FROM brands ORDER BY id`)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var item brandRecord
		if err := rows.Scan(&item.ID, &item.Slug, &item.Name, &item.IsActive); err != nil {
			rows.Close()
			return result, err
		}
		result.Brands = append(result.Brands, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}

	rows, err = pool.Query(ctx, `SELECT id, code, name, scope, is_active
		FROM attribute_definitions ORDER BY sort_order, id`)
	if err != nil {
		return result, err
	}
	indexes := map[int64]int{}
	for rows.Next() {
		var item attributeRecord
		if err := rows.Scan(&item.ID, &item.Code, &item.Name, &item.Scope, &item.IsActive); err != nil {
			rows.Close()
			return result, err
		}
		item.Options = []optionRecord{}
		indexes[item.ID] = len(result.Attributes)
		result.Attributes = append(result.Attributes, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}

	rows, err = pool.Query(ctx, `SELECT id, attribute_definition_id, value,
		COALESCE(color_hex, ''), is_active FROM attribute_options
		ORDER BY sort_order, id`)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var item optionRecord
		if err := rows.Scan(&item.ID, &item.AttributeDefinitionID, &item.Value, &item.ColorHex, &item.IsActive); err != nil {
			rows.Close()
			return result, err
		}
		if index, ok := indexes[item.AttributeDefinitionID]; ok {
			result.Attributes[index].Options = append(result.Attributes[index].Options, item)
		}
	}
	err = rows.Err()
	rows.Close()
	return result, err
}

func (service *vocabularyService) list(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	result, err := readVocabulary(r.Context(), service.pool)
	if err != nil {
		serverError(w, "list catalog vocabulary", err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func validVocabularyName(value string) bool {
	return value == strings.TrimSpace(value) && value != "" && len(value) <= 120
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.NotFound(w, r)
		return 0, false
	}
	return id, true
}

func vocabularyDBError(w http.ResponseWriter, operation string, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "registro inexistente", http.StatusNotFound)
		return
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			http.Error(w, "ya existe un registro con ese identificador o valor", http.StatusConflict)
			return
		case "23503", "23514":
			http.Error(w, "datos relacionados o valores inválidos", http.StatusBadRequest)
			return
		}
	}
	serverError(w, operation, err)
}

func (service *vocabularyService) createCategory(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	var input struct {
		Slug        string `json:"slug"`
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Slug = strings.TrimSpace(input.Slug)
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	if !vocabularyCodePattern.MatchString(input.Slug) || !validVocabularyName(input.Name) || len(input.Description) > 1000 {
		http.Error(w, "categoría inválida", http.StatusBadRequest)
		return
	}
	var id int64
	err := service.pool.QueryRow(r.Context(), `INSERT INTO categories (slug, name, description)
		VALUES ($1, $2, NULLIF($3, '')) RETURNING id`, input.Slug, input.Name, input.Description).Scan(&id)
	if err != nil {
		vocabularyDBError(w, "create category", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (service *vocabularyService) updateCategory(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		IsActive    *bool  `json:"isActive"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	if !validVocabularyName(input.Name) || len(input.Description) > 1000 || input.IsActive == nil {
		http.Error(w, "categoría inválida", http.StatusBadRequest)
		return
	}
	var found int64
	err := service.pool.QueryRow(r.Context(), `UPDATE categories SET name=$2,
		description=NULLIF($3, ''), is_active=$4, updated_at=now()
		WHERE id=$1 RETURNING id`, id, input.Name, input.Description, *input.IsActive).Scan(&found)
	if err != nil {
		vocabularyDBError(w, "update category", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *vocabularyService) createBrand(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	var input struct {
		Slug string `json:"slug"`
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Slug = strings.TrimSpace(input.Slug)
	input.Name = strings.TrimSpace(input.Name)
	if !vocabularyCodePattern.MatchString(input.Slug) || !validVocabularyName(input.Name) {
		http.Error(w, "marca inválida", http.StatusBadRequest)
		return
	}
	var id int64
	err := service.pool.QueryRow(r.Context(), `INSERT INTO brands (slug, name)
		VALUES ($1, $2) RETURNING id`, input.Slug, input.Name).Scan(&id)
	if err != nil {
		vocabularyDBError(w, "create brand", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (service *vocabularyService) updateBrand(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var input struct {
		Name     string `json:"name"`
		IsActive *bool  `json:"isActive"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if !validVocabularyName(input.Name) || input.IsActive == nil {
		http.Error(w, "marca inválida", http.StatusBadRequest)
		return
	}
	var found int64
	err := service.pool.QueryRow(r.Context(), `UPDATE brands SET name=$2, is_active=$3,
		updated_at=now() WHERE id=$1 RETURNING id`, id, input.Name, *input.IsActive).Scan(&found)
	if err != nil {
		vocabularyDBError(w, "update brand", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *vocabularyService) createAttribute(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	var input struct {
		Code  string `json:"code"`
		Name  string `json:"name"`
		Scope string `json:"scope"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Code = strings.TrimSpace(input.Code)
	input.Name = strings.TrimSpace(input.Name)
	if !vocabularyCodePattern.MatchString(input.Code) || !validVocabularyName(input.Name) ||
		(input.Scope != "product" && input.Scope != "variant") {
		http.Error(w, "atributo inválido", http.StatusBadRequest)
		return
	}
	var id int64
	err := service.pool.QueryRow(r.Context(), `INSERT INTO attribute_definitions
		(code, name, scope) VALUES ($1, $2, $3) RETURNING id`,
		input.Code, input.Name, input.Scope).Scan(&id)
	if err != nil {
		vocabularyDBError(w, "create attribute", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (service *vocabularyService) updateAttribute(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var input struct {
		Name     string `json:"name"`
		IsActive *bool  `json:"isActive"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if !validVocabularyName(input.Name) || input.IsActive == nil {
		http.Error(w, "atributo inválido", http.StatusBadRequest)
		return
	}
	var found int64
	err := service.pool.QueryRow(r.Context(), `UPDATE attribute_definitions
		SET name=$2, is_active=$3, updated_at=now() WHERE id=$1 RETURNING id`,
		id, input.Name, *input.IsActive).Scan(&found)
	if err != nil {
		vocabularyDBError(w, "update attribute", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func validOption(value, color string) bool {
	return validVocabularyName(value) && (color == "" || colorPattern.MatchString(color))
}

func (service *vocabularyService) createOption(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	attributeID, ok := pathID(w, r)
	if !ok {
		return
	}
	var input struct {
		Value    string `json:"value"`
		ColorHex string `json:"colorHex"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Value = strings.TrimSpace(input.Value)
	input.ColorHex = strings.TrimSpace(input.ColorHex)
	if !validOption(input.Value, input.ColorHex) {
		http.Error(w, "opción inválida", http.StatusBadRequest)
		return
	}
	var id int64
	err := service.pool.QueryRow(r.Context(), `INSERT INTO attribute_options
		(attribute_definition_id, value, color_hex)
		SELECT id, $2, NULLIF($3, '') FROM attribute_definitions WHERE id=$1
		RETURNING id`, attributeID, input.Value, input.ColorHex).Scan(&id)
	if err != nil {
		vocabularyDBError(w, "create attribute option", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (service *vocabularyService) updateOption(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var input struct {
		Value    string `json:"value"`
		ColorHex string `json:"colorHex"`
		IsActive *bool  `json:"isActive"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Value = strings.TrimSpace(input.Value)
	input.ColorHex = strings.TrimSpace(input.ColorHex)
	if !validOption(input.Value, input.ColorHex) || input.IsActive == nil {
		http.Error(w, "opción inválida", http.StatusBadRequest)
		return
	}
	var found int64
	err := service.pool.QueryRow(r.Context(), `UPDATE attribute_options SET value=$2,
		color_hex=NULLIF($3, ''), is_active=$4, updated_at=now()
		WHERE id=$1 RETURNING id`, id, input.Value, input.ColorHex, *input.IsActive).Scan(&found)
	if err != nil {
		vocabularyDBError(w, "update attribute option", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
