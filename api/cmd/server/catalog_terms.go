package main

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type catalogTerm struct {
	ID           int64  `json:"id"`
	Kind         string `json:"kind"`
	Name         string `json:"name"`
	ProductCount int64  `json:"productCount"`
}

type termService struct {
	pool  *pgxpool.Pool
	admin *adminAuth
}

var errUnregisteredTerm = errors.New("estilo o público no registrado")

func registerTermRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &termService{pool: pool, admin: admin}
	mux.HandleFunc("GET /api/admin/catalog/terms", service.list)
	mux.HandleFunc("POST /api/admin/catalog/terms", service.create)
	mux.HandleFunc("PUT /api/admin/catalog/terms/{id}", service.update)
	mux.HandleFunc("DELETE /api/admin/catalog/terms/{id}", service.remove)
}

func (service *termService) requireOwner(w http.ResponseWriter, r *http.Request) bool {
	return (&productService{pool: service.pool, admin: service.admin}).requireOwner(w, r)
}

func validTermKind(kind string) bool { return kind == "style" || kind == "audience" }

func (service *termService) list(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	rows, err := service.pool.Query(r.Context(), `SELECT t.id, t.kind, t.name,
		(SELECT count(*) FROM products p WHERE CASE t.kind
			WHEN 'style' THEN p.style_label=t.name ELSE p.audience_label=t.name END)
		FROM catalog_terms t ORDER BY t.kind, t.name, t.id`)
	if err != nil {
		serverError(w, "list catalog terms", err)
		return
	}
	defer rows.Close()
	items := []catalogTerm{}
	for rows.Next() {
		var item catalogTerm
		if err := rows.Scan(&item.ID, &item.Kind, &item.Name, &item.ProductCount); err != nil {
			serverError(w, "scan catalog term", err)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		serverError(w, "list catalog terms", err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func readTermName(w http.ResponseWriter, r *http.Request) (string, bool) {
	var input struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &input, 2048) {
		return "", false
	}
	name := displayLabel(input.Name)
	if !validVocabularyName(name) || catalogKey(name) == "" {
		http.Error(w, "nombre inválido", http.StatusBadRequest)
		return "", false
	}
	return name, true
}

func lockTermWrites(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(21180314, 2)`)
	return err
}

func findTermByKey(ctx context.Context, tx pgx.Tx, kind, key string) (int64, error) {
	rows, err := tx.Query(ctx, `SELECT id, name FROM catalog_terms WHERE kind=$1 ORDER BY id`, kind)
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

func (service *termService) create(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	var input struct {
		Kind string `json:"kind"`
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &input, 2048) {
		return
	}
	input.Name = displayLabel(input.Name)
	if !validTermKind(input.Kind) || !validVocabularyName(input.Name) || catalogKey(input.Name) == "" {
		http.Error(w, "tipo o nombre inválido", http.StatusBadRequest)
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin term create", err)
		return
	}
	defer tx.Rollback(context.Background())
	if err := lockTermWrites(r.Context(), tx); err != nil {
		serverError(w, "lock term writes", err)
		return
	}
	if id, err := findTermByKey(r.Context(), tx, input.Kind, catalogKey(input.Name)); err != nil {
		serverError(w, "check term name", err)
		return
	} else if id > 0 {
		http.Error(w, "el elemento ya existe", http.StatusConflict)
		return
	}
	var id int64
	if err := tx.QueryRow(r.Context(), `INSERT INTO catalog_terms (kind,name) VALUES ($1,$2) RETURNING id`,
		input.Kind, input.Name).Scan(&id); err != nil {
		vocabularyDBError(w, "create term", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		vocabularyDBError(w, "commit term create", err)
		return
	}
	writeJSON(w, http.StatusCreated, catalogTerm{ID: id, Kind: input.Kind, Name: input.Name})
}

func (service *termService) update(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	name, ok := readTermName(w, r)
	if !ok {
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin term update", err)
		return
	}
	defer tx.Rollback(context.Background())
	if err := lockTermWrites(r.Context(), tx); err != nil {
		serverError(w, "lock term writes", err)
		return
	}
	var kind, oldName string
	if err := tx.QueryRow(r.Context(), `SELECT kind,name FROM catalog_terms WHERE id=$1 FOR UPDATE`, id).
		Scan(&kind, &oldName); err != nil {
		vocabularyDBError(w, "find term", err)
		return
	}
	if existing, err := findTermByKey(r.Context(), tx, kind, catalogKey(name)); err != nil {
		serverError(w, "check term name", err)
		return
	} else if existing > 0 && existing != id {
		http.Error(w, "el elemento ya existe", http.StatusConflict)
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE catalog_terms SET name=$2,updated_at=now() WHERE id=$1`, id, name); err != nil {
		vocabularyDBError(w, "update term", err)
		return
	}
	column := "style_label"
	if kind == "audience" {
		column = "audience_label"
	}
	if _, err := tx.Exec(r.Context(), `UPDATE products SET `+column+`=$2,revision=revision+1,updated_at=now()
		WHERE `+column+`=$1`, oldName, name); err != nil {
		serverError(w, "rename term in products", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		vocabularyDBError(w, "commit term update", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *termService) remove(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin term removal", err)
		return
	}
	defer tx.Rollback(context.Background())
	if err := lockTermWrites(r.Context(), tx); err != nil {
		serverError(w, "lock term writes", err)
		return
	}
	var kind, name string
	if err := tx.QueryRow(r.Context(), `SELECT kind,name FROM catalog_terms WHERE id=$1 FOR UPDATE`, id).
		Scan(&kind, &name); err != nil {
		vocabularyDBError(w, "find term", err)
		return
	}
	column := "style_label"
	if kind == "audience" {
		column = "audience_label"
	}
	var count int64
	if err := tx.QueryRow(r.Context(), `SELECT count(*) FROM products WHERE `+column+`=$1`, name).Scan(&count); err != nil {
		serverError(w, "count term products", err)
		return
	}
	expected, parseErr := strconv.ParseInt(r.URL.Query().Get("expectedCount"), 10, 64)
	if count > 0 && (r.URL.Query().Get("confirm") != "1" || parseErr != nil || expected != count) {
		writeJSON(w, http.StatusConflict, map[string]any{"productCount": count,
			"message": "hay productos registrados con este elemento; confirma para quitarlo de ellos"})
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE products SET `+column+`='',revision=revision+1,updated_at=now()
		WHERE `+column+`=$1`, name); err != nil {
		serverError(w, "unlink term from products", err)
		return
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM catalog_terms WHERE id=$1`, id); err != nil {
		vocabularyDBError(w, "delete term", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		vocabularyDBError(w, "commit term removal", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *productService) checkManagedTerm(ctx context.Context, tx pgx.Tx, kind, name string) error {
	if name == "" {
		return nil
	}
	var found int64
	err := tx.QueryRow(ctx, `SELECT id FROM catalog_terms WHERE kind=$1 AND name=$2 FOR KEY SHARE`, kind, name).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return errUnregisteredTerm
	}
	return err
}
