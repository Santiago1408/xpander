package main

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type adminBranch struct {
	ID           int64  `json:"id"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	Address      string `json:"address"`
	Instructions string `json:"instructions"`
}

type branchService struct {
	pool  *pgxpool.Pool
	admin *adminAuth
}

func registerBranchRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &branchService{pool: pool, admin: admin}
	mux.HandleFunc("GET /api/admin/branches", service.list)
	mux.HandleFunc("PUT /api/admin/branches/{id}", service.update)
}

func (service *branchService) list(w http.ResponseWriter, r *http.Request) {
	if !(&productService{pool: service.pool, admin: service.admin}).requireOwner(w, r) {
		return
	}
	rows, err := service.pool.Query(r.Context(), `SELECT id, code, name, COALESCE(address,''),
		COALESCE(pickup_instructions,'') FROM branches WHERE is_active ORDER BY name, id`)
	if err != nil {
		serverError(w, "list active branches", err)
		return
	}
	defer rows.Close()
	items := []adminBranch{}
	for rows.Next() {
		var item adminBranch
		if err := rows.Scan(&item.ID, &item.Code, &item.Name, &item.Address, &item.Instructions); err != nil {
			serverError(w, "scan active branch", err)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		serverError(w, "list active branches", err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (service *branchService) update(w http.ResponseWriter, r *http.Request) {
	if !(&productService{pool: service.pool, admin: service.admin}).requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var input struct {
		Name         string `json:"name"`
		Address      string `json:"address"`
		Instructions string `json:"instructions"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Name = displayLabel(input.Name)
	input.Address = strings.TrimSpace(input.Address)
	input.Instructions = strings.TrimSpace(input.Instructions)
	if !validVocabularyName(input.Name) || len(input.Address) > 300 || len(input.Instructions) > 500 {
		http.Error(w, "nombre, dirección o instrucciones inválidas", http.StatusBadRequest)
		return
	}
	var item adminBranch
	err := service.pool.QueryRow(r.Context(), `UPDATE branches SET name=$2,
		address=NULLIF($3,''), pickup_instructions=NULLIF($4,''), updated_at=now()
		WHERE id=$1 AND is_active RETURNING id, code, name, COALESCE(address,''),
		COALESCE(pickup_instructions,'')`, id, input.Name, input.Address,
		input.Instructions).Scan(&item.ID, &item.Code, &item.Name, &item.Address, &item.Instructions)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "sucursal activa inexistente", http.StatusNotFound)
		return
	}
	if err != nil {
		serverError(w, "update active branch", err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}
