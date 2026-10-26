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
	IsDeleted   bool   `json:"isDeleted"`
}

type brandRecord struct {
	ID        int64  `json:"id"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	IsActive  bool   `json:"isActive"`
	IsDeleted bool   `json:"isDeleted"`
}

type optionRecord struct {
	ID                    int64  `json:"id"`
	AttributeDefinitionID int64  `json:"attributeDefinitionId"`
	Value                 string `json:"value"`
	ColorHex              string `json:"colorHex"`
	IsActive              bool   `json:"isActive"`
	IsDeleted             bool   `json:"isDeleted"`
}

type attributeRecord struct {
	ID        int64          `json:"id"`
	Code      string         `json:"code"`
	Name      string         `json:"name"`
	Scope     string         `json:"scope"`
	IsActive  bool           `json:"isActive"`
	IsDeleted bool           `json:"isDeleted"`
	Options   []optionRecord `json:"options"`
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
	mux.HandleFunc("DELETE /api/admin/catalog/categories/{id}", service.trashCategory)
	mux.HandleFunc("POST /api/admin/catalog/categories/{id}/restore", service.restoreCategory)
	mux.HandleFunc("POST /api/admin/catalog/brands", service.createBrand)
	mux.HandleFunc("PUT /api/admin/catalog/brands/{id}", service.updateBrand)
	mux.HandleFunc("DELETE /api/admin/catalog/brands/{id}", service.trashBrand)
	mux.HandleFunc("POST /api/admin/catalog/brands/{id}/restore", service.restoreBrand)
	mux.HandleFunc("POST /api/admin/catalog/attributes", service.createAttribute)
	mux.HandleFunc("PUT /api/admin/catalog/attributes/{id}", service.updateAttribute)
	mux.HandleFunc("DELETE /api/admin/catalog/attributes/{id}", service.trashAttribute)
	mux.HandleFunc("POST /api/admin/catalog/attributes/{id}/restore", service.restoreAttribute)
	mux.HandleFunc("POST /api/admin/catalog/attributes/{id}/options", service.createOption)
	mux.HandleFunc("PUT /api/admin/catalog/options/{id}", service.updateOption)
	mux.HandleFunc("DELETE /api/admin/catalog/options/{id}", service.trashOption)
	mux.HandleFunc("POST /api/admin/catalog/options/{id}/restore", service.restoreOption)
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
	rows, err := pool.Query(ctx, `SELECT id, slug, name, COALESCE(description, ''), is_active,
		deleted_at IS NOT NULL
		FROM categories ORDER BY sort_order, id`)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var item categoryRecord
		if err := rows.Scan(&item.ID, &item.Slug, &item.Name, &item.Description, &item.IsActive, &item.IsDeleted); err != nil {
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

	rows, err = pool.Query(ctx, `SELECT id, slug, name, is_active, deleted_at IS NOT NULL FROM brands ORDER BY id`)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var item brandRecord
		if err := rows.Scan(&item.ID, &item.Slug, &item.Name, &item.IsActive, &item.IsDeleted); err != nil {
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

	rows, err = pool.Query(ctx, `SELECT id, code, name, scope, is_active, deleted_at IS NOT NULL
		FROM attribute_definitions ORDER BY sort_order, id`)
	if err != nil {
		return result, err
	}
	indexes := map[int64]int{}
	for rows.Next() {
		var item attributeRecord
		if err := rows.Scan(&item.ID, &item.Code, &item.Name, &item.Scope, &item.IsActive, &item.IsDeleted); err != nil {
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
		COALESCE(color_hex, ''), is_active, deleted_at IS NOT NULL FROM attribute_options
		ORDER BY sort_order, id`)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var item optionRecord
		if err := rows.Scan(&item.ID, &item.AttributeDefinitionID, &item.Value, &item.ColorHex, &item.IsActive, &item.IsDeleted); err != nil {
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
	if (input.Slug != "" && !vocabularyCodePattern.MatchString(input.Slug)) || !validVocabularyName(input.Name) || len(input.Description) > 1000 {
		http.Error(w, "categoría inválida", http.StatusBadRequest)
		return
	}
	var id int64
	var err error
	base := codeFromName(input.Name)
	for attempt := 1; attempt <= 100; attempt++ {
		slug := input.Slug
		if slug == "" {
			slug = codeWithSuffix(base, attempt)
		}
		err = service.pool.QueryRow(r.Context(), `INSERT INTO categories (slug, name, description)
			VALUES ($1, $2, NULLIF($3, '')) ON CONFLICT (slug) DO NOTHING RETURNING id`,
			slug, input.Name, input.Description).Scan(&id)
		if err == nil || input.Slug != "" || !errors.Is(err, pgx.ErrNoRows) {
			break
		}
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "identificador ocupado", http.StatusConflict)
			return
		}
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
		Slug        string `json:"slug"`
		Name        string `json:"name"`
		Description string `json:"description"`
		IsActive    *bool  `json:"isActive"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Slug = strings.TrimSpace(input.Slug)
	input.Description = strings.TrimSpace(input.Description)
	if (input.Slug != "" && !vocabularyCodePattern.MatchString(input.Slug)) || !validVocabularyName(input.Name) || len(input.Description) > 1000 || input.IsActive == nil {
		http.Error(w, "categoría inválida", http.StatusBadRequest)
		return
	}
	var found int64
	err := service.pool.QueryRow(r.Context(), `UPDATE categories SET slug=COALESCE(NULLIF($2,''),slug), name=$3,
		description=NULLIF($4, ''), is_active=$5, updated_at=now()
		WHERE id=$1 AND deleted_at IS NULL RETURNING id`, id, input.Slug, input.Name, input.Description, *input.IsActive).Scan(&found)
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
	if (input.Slug != "" && !vocabularyCodePattern.MatchString(input.Slug)) || !validVocabularyName(input.Name) {
		http.Error(w, "marca inválida", http.StatusBadRequest)
		return
	}
	var id int64
	var err error
	base := codeFromName(input.Name)
	for attempt := 1; attempt <= 100; attempt++ {
		slug := input.Slug
		if slug == "" {
			slug = codeWithSuffix(base, attempt)
		}
		err = service.pool.QueryRow(r.Context(), `INSERT INTO brands (slug, name)
			VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING id`, slug, input.Name).Scan(&id)
		if err == nil || input.Slug != "" || !errors.Is(err, pgx.ErrNoRows) {
			break
		}
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "identificador ocupado", http.StatusConflict)
			return
		}
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
		Slug     string `json:"slug"`
		Name     string `json:"name"`
		IsActive *bool  `json:"isActive"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Slug = strings.TrimSpace(input.Slug)
	if (input.Slug != "" && !vocabularyCodePattern.MatchString(input.Slug)) || !validVocabularyName(input.Name) || input.IsActive == nil {
		http.Error(w, "marca inválida", http.StatusBadRequest)
		return
	}
	var found int64
	err := service.pool.QueryRow(r.Context(), `UPDATE brands SET slug=COALESCE(NULLIF($2,''),slug), name=$3, is_active=$4,
		updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id`, id, input.Slug, input.Name, *input.IsActive).Scan(&found)
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
	if (input.Code != "" && !vocabularyCodePattern.MatchString(input.Code)) || !validVocabularyName(input.Name) ||
		(input.Scope != "product" && input.Scope != "variant") {
		http.Error(w, "atributo inválido", http.StatusBadRequest)
		return
	}
	var id int64
	var err error
	base := codeFromName(input.Name)
	for attempt := 1; attempt <= 100; attempt++ {
		code := input.Code
		if code == "" {
			code = codeWithSuffix(base, attempt)
		}
		err = service.pool.QueryRow(r.Context(), `INSERT INTO attribute_definitions
			(code, name, scope) VALUES ($1, $2, $3)
			ON CONFLICT (code) DO NOTHING RETURNING id`, code, input.Name, input.Scope).Scan(&id)
		if err == nil || input.Code != "" || !errors.Is(err, pgx.ErrNoRows) {
			break
		}
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "identificador ocupado", http.StatusConflict)
			return
		}
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
		Code     string `json:"code"`
		Name     string `json:"name"`
		IsActive *bool  `json:"isActive"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Code = strings.TrimSpace(input.Code)
	if (input.Code != "" && !vocabularyCodePattern.MatchString(input.Code)) || !validVocabularyName(input.Name) || input.IsActive == nil {
		http.Error(w, "atributo inválido", http.StatusBadRequest)
		return
	}
	var found int64
	err := service.pool.QueryRow(r.Context(), `UPDATE attribute_definitions
		SET code=COALESCE(NULLIF($2,''),code), name=$3, is_active=$4, updated_at=now()
		WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
		id, input.Code, input.Name, *input.IsActive).Scan(&found)
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
		SELECT id, $2, NULLIF($3, '') FROM attribute_definitions
		WHERE id=$1 AND is_active AND deleted_at IS NULL
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
		WHERE id=$1 AND deleted_at IS NULL RETURNING id`, id, input.Value, input.ColorHex, *input.IsActive).Scan(&found)
	if err != nil {
		vocabularyDBError(w, "update attribute option", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *vocabularyService) changeTrash(w http.ResponseWriter, r *http.Request, table string, restore bool) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	// table is always a constant supplied by a registered handler below.
	query := "UPDATE " + table + " SET deleted_at=now(), updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id"
	if restore {
		query = "UPDATE " + table + " SET deleted_at=NULL, updated_at=now() WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id"
	}
	var found int64
	if err := service.pool.QueryRow(r.Context(), query, id).Scan(&found); err != nil {
		vocabularyDBError(w, "change catalog recycle bin", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *vocabularyService) trashCategory(w http.ResponseWriter, r *http.Request) {
	service.changeTrash(w, r, "categories", false)
}
func (service *vocabularyService) restoreCategory(w http.ResponseWriter, r *http.Request) {
	service.changeTrash(w, r, "categories", true)
}
func (service *vocabularyService) trashBrand(w http.ResponseWriter, r *http.Request) {
	service.changeTrash(w, r, "brands", false)
}
func (service *vocabularyService) restoreBrand(w http.ResponseWriter, r *http.Request) {
	service.changeTrash(w, r, "brands", true)
}
func (service *vocabularyService) trashAttribute(w http.ResponseWriter, r *http.Request) {
	service.changeTrash(w, r, "attribute_definitions", false)
}
func (service *vocabularyService) restoreAttribute(w http.ResponseWriter, r *http.Request) {
	service.changeTrash(w, r, "attribute_definitions", true)
}
func (service *vocabularyService) trashOption(w http.ResponseWriter, r *http.Request) {
	service.changeTrash(w, r, "attribute_options", false)
}
func (service *vocabularyService) restoreOption(w http.ResponseWriter, r *http.Request) {
	service.changeTrash(w, r, "attribute_options", true)
}
