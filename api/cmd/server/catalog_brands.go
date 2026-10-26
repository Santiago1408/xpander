package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type brandRecord struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	ProductCount int64  `json:"productCount"`
}

type brandInput struct {
	Name string `json:"name"`
}

type brandService struct {
	pool  *pgxpool.Pool
	admin *adminAuth
}

func registerBrandRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &brandService{pool: pool, admin: admin}
	mux.HandleFunc("GET /api/admin/catalog/brands", service.list)
	mux.HandleFunc("POST /api/admin/catalog/brands", service.create)
	mux.HandleFunc("PUT /api/admin/catalog/brands/{id}", service.update)
	mux.HandleFunc("DELETE /api/admin/catalog/brands/{id}", service.remove)
}

func (service *brandService) requireOwner(w http.ResponseWriter, r *http.Request) bool {
	return (&productService{pool: service.pool, admin: service.admin}).requireOwner(w, r)
}

func (service *brandService) list(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	rows, err := service.pool.Query(r.Context(), `SELECT b.id, b.name, count(p.id)
		FROM brands b LEFT JOIN products p ON p.brand_id=b.id
		GROUP BY b.id ORDER BY b.name, b.id`)
	if err != nil {
		serverError(w, "list brands", err)
		return
	}
	defer rows.Close()
	items := []brandRecord{}
	for rows.Next() {
		var item brandRecord
		if err := rows.Scan(&item.ID, &item.Name, &item.ProductCount); err != nil {
			serverError(w, "scan brand", err)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		serverError(w, "list brands", err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (service *brandService) readInput(w http.ResponseWriter, r *http.Request) (brandInput, bool) {
	var input brandInput
	if !decodeJSON(w, r, &input, 2048) {
		return input, false
	}
	input.Name = displayLabel(input.Name)
	if !validVocabularyName(input.Name) || catalogKey(input.Name) == "" {
		http.Error(w, "nombre de marca inválido", http.StatusBadRequest)
		return input, false
	}
	return input, true
}

func findBrandByKey(ctx context.Context, tx pgx.Tx, key string) (int64, error) {
	rows, err := tx.Query(ctx, `SELECT id, name FROM brands ORDER BY id`)
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

func (service *brandService) create(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	input, ok := service.readInput(w, r)
	if !ok {
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin brand creation", err)
		return
	}
	defer tx.Rollback(context.Background())
	key := catalogKey(input.Name)
	if existing, err := findBrandByKey(r.Context(), tx, key); err != nil {
		serverError(w, "check brand name", err)
		return
	} else if existing > 0 {
		http.Error(w, "la marca ya existe", http.StatusConflict)
		return
	}
	base := codeFromName(input.Name)
	var id int64
	for attempt := 1; attempt <= 100; attempt++ {
		err = tx.QueryRow(r.Context(), `INSERT INTO brands (slug, name, canonical_key)
			VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`,
			codeWithSuffix(base, attempt), input.Name, key).Scan(&id)
		if err == nil {
			break
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			vocabularyDBError(w, "create brand", err)
			return
		}
	}
	if id == 0 {
		http.Error(w, "no se pudo registrar la marca; revisa si ya existe", http.StatusConflict)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		vocabularyDBError(w, "commit brand", err)
		return
	}
	writeJSON(w, http.StatusCreated, brandRecord{ID: id, Name: input.Name})
}

func (service *brandService) update(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	input, ok := service.readInput(w, r)
	if !ok {
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin brand update", err)
		return
	}
	defer tx.Rollback(context.Background())
	var found int64
	if err := tx.QueryRow(r.Context(), `SELECT id FROM brands WHERE id=$1 FOR UPDATE`, id).Scan(&found); err != nil {
		vocabularyDBError(w, "find brand", err)
		return
	}
	key := catalogKey(input.Name)
	if existing, err := findBrandByKey(r.Context(), tx, key); err != nil {
		serverError(w, "check brand name", err)
		return
	} else if existing > 0 && existing != id {
		http.Error(w, "la marca ya existe", http.StatusConflict)
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE brands SET name=$2, canonical_key=$3,
		updated_at=now() WHERE id=$1`, id, input.Name, key); err != nil {
		vocabularyDBError(w, "update brand", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		vocabularyDBError(w, "commit brand update", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *brandService) remove(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin brand removal", err)
		return
	}
	defer tx.Rollback(context.Background())
	var found int64
	if err := tx.QueryRow(r.Context(), `SELECT id FROM brands WHERE id=$1 FOR UPDATE`, id).Scan(&found); err != nil {
		vocabularyDBError(w, "find brand", err)
		return
	}
	var count int64
	if err := tx.QueryRow(r.Context(), `SELECT count(*) FROM products WHERE brand_id=$1`, id).Scan(&count); err != nil {
		serverError(w, "count products using brand", err)
		return
	}
	expectedCount, expectedErr := strconv.ParseInt(r.URL.Query().Get("expectedCount"), 10, 64)
	if count > 0 && (r.URL.Query().Get("confirm") != "1" || expectedErr != nil || expectedCount != count) {
		writeJSON(w, http.StatusConflict, map[string]any{"productCount": count,
			"message": "la marca está asociada a productos; confirma para quitarla de ellos"})
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE products SET brand_id=NULL,
		revision=revision+1, updated_at=now() WHERE brand_id=$1`, id); err != nil {
		serverError(w, "unlink brand from products", err)
		return
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM brands WHERE id=$1`, id); err != nil {
		vocabularyDBError(w, "delete brand", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		vocabularyDBError(w, "commit brand removal", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
