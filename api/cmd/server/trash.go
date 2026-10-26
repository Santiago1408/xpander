package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type trashItem struct {
	Kind      string    `json:"kind"`
	ID        int64     `json:"id"`
	Label     string    `json:"label"`
	DeletedAt time.Time `json:"deletedAt"`
}

type trashService struct {
	pool     *pgxpool.Pool
	admin    *adminAuth
	mediaDir string
}

func registerTrashRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth, mediaDir string) {
	service := &trashService{pool: pool, admin: admin, mediaDir: mediaDir}
	mux.HandleFunc("GET /api/admin/trash", service.list)
	mux.HandleFunc("POST /api/admin/trash/{kind}/{id}/restore", service.restore)
	mux.HandleFunc("DELETE /api/admin/trash/{kind}/{id}", service.purge)
}

func (service *trashService) requireOwner(w http.ResponseWriter, r *http.Request) bool {
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

func (service *trashService) list(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	rows, err := service.pool.Query(r.Context(), `
		SELECT kind, id, label, deleted_at FROM (
			SELECT 'category'::text kind, id, name label, deleted_at FROM categories WHERE deleted_at IS NOT NULL
			UNION ALL SELECT 'brand', id, name, deleted_at FROM brands WHERE deleted_at IS NOT NULL
			UNION ALL SELECT 'color', id, name, deleted_at FROM colors WHERE deleted_at IS NOT NULL
			UNION ALL SELECT 'attribute', id, name, deleted_at FROM attribute_definitions WHERE deleted_at IS NOT NULL
			UNION ALL SELECT 'option', o.id, d.name || ': ' || o.value, o.deleted_at
				FROM attribute_options o JOIN attribute_definitions d ON d.id=o.attribute_definition_id
				WHERE o.deleted_at IS NOT NULL
			UNION ALL SELECT 'product', id, name, deleted_at FROM products WHERE deleted_at IS NOT NULL
			UNION ALL SELECT 'variant', v.id, p.name || ' · ' || v.sku, v.deleted_at
				FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.deleted_at IS NOT NULL
			UNION ALL SELECT 'media', id, COALESCE(NULLIF(alt_text,''), 'Imagen ' || id::text), deleted_at
				FROM media WHERE deleted_at IS NOT NULL AND kind='image' AND source_type='local'
			UNION ALL SELECT 'section', id, COALESCE(NULLIF(title,''), 'Sección ' || id::text), deleted_at
				FROM page_sections WHERE deleted_at IS NOT NULL
		) trashed ORDER BY deleted_at DESC, kind, id DESC`)
	if err != nil {
		serverError(w, "list trash", err)
		return
	}
	defer rows.Close()
	items := []trashItem{}
	for rows.Next() {
		var item trashItem
		if err := rows.Scan(&item.Kind, &item.ID, &item.Label, &item.DeletedAt); err != nil {
			serverError(w, "scan trash", err)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		serverError(w, "list trash", err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

var trashTables = map[string]string{
	"category": "categories", "brand": "brands", "color": "colors", "attribute": "attribute_definitions",
	"option": "attribute_options", "product": "products", "variant": "product_variants",
	"media": "media", "section": "page_sections",
}

func (service *trashService) identify(w http.ResponseWriter, r *http.Request) (string, int64, bool) {
	kind := r.PathValue("kind")
	if _, ok := trashTables[kind]; !ok {
		http.NotFound(w, r)
		return "", 0, false
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.NotFound(w, r)
		return "", 0, false
	}
	return kind, id, true
}

func trashError(w http.ResponseWriter, operation string, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "el elemento no está en la papelera", http.StatusNotFound)
		return
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23503" {
			http.Error(w, "este elemento tiene referencias; elimina primero los elementos dependientes o conserva el historial", http.StatusConflict)
			return
		}
		if pgErr.Code == "23505" {
			http.Error(w, "ya existe otro elemento con esos datos; resuelve el duplicado antes de restaurar", http.StatusConflict)
			return
		}
	}
	serverError(w, operation, err)
}

func (service *trashService) restore(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	kind, id, ok := service.identify(w, r)
	if !ok {
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin trash restore", err)
		return
	}
	defer tx.Rollback(context.Background())
	if kind == "variant" {
		var parentID int64
		err := tx.QueryRow(r.Context(), `SELECT p.id FROM products p
			JOIN product_variants v ON v.product_id=p.id
			WHERE v.id=$1 AND p.deleted_at IS NULL FOR UPDATE OF p`, id).Scan(&parentID)
		if err != nil {
			trashError(w, "lock variant product", err)
			return
		}
	} else if kind == "section" {
		var pageID int64
		err := tx.QueryRow(r.Context(), `SELECT p.id FROM pages p
			JOIN page_sections s ON s.page_id=p.id WHERE s.id=$1 FOR UPDATE OF p`, id).Scan(&pageID)
		if err != nil {
			trashError(w, "lock section page", err)
			return
		}
	}
	table := trashTables[kind] // The table is selected from constants, never from user input.
	var parentID int64
	query := "UPDATE " + table + " SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id"
	if kind == "product" {
		query = `UPDATE products SET deleted_at=NULL, revision=revision+1, updated_at=now()
			WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id`
	} else if kind == "variant" {
		query = `UPDATE product_variants SET deleted_at=NULL, updated_at=now()
			WHERE id=$1 AND deleted_at IS NOT NULL RETURNING product_id`
	} else if kind == "section" {
		query = `UPDATE page_sections SET deleted_at=NULL, deleted_by_user_id=NULL, updated_at=now()
			WHERE id=$1 AND deleted_at IS NOT NULL RETURNING page_id`
	}
	if err := tx.QueryRow(r.Context(), query, id).Scan(&parentID); err != nil {
		trashError(w, "restore trash item", err)
		return
	}
	if kind == "variant" {
		if _, err := tx.Exec(r.Context(), `UPDATE products SET revision=revision+1, updated_at=now() WHERE id=$1`, parentID); err != nil {
			serverError(w, "update product revision", err)
			return
		}
	} else if kind == "section" {
		if _, err := tx.Exec(r.Context(), `UPDATE pages SET draft_revision=draft_revision+1, updated_at=now() WHERE id=$1`, parentID); err != nil {
			serverError(w, "update page revision", err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		trashError(w, "commit trash restore", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *trashService) purge(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	kind, id, ok := service.identify(w, r)
	if !ok {
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin permanent deletion", err)
		return
	}
	defer tx.Rollback(context.Background())
	var parentID int64
	var storageKey string
	if kind == "variant" {
		err := tx.QueryRow(r.Context(), `SELECT p.id FROM products p
			JOIN product_variants v ON v.product_id=p.id
			WHERE v.id=$1 FOR UPDATE OF p`, id).Scan(&parentID)
		if err != nil {
			trashError(w, "lock variant product", err)
			return
		}
	} else if kind == "section" {
		err := tx.QueryRow(r.Context(), `SELECT p.id FROM pages p
			JOIN page_sections s ON s.page_id=p.id WHERE s.id=$1 FOR UPDATE OF p`, id).Scan(&parentID)
		if err != nil {
			trashError(w, "lock section page", err)
			return
		}
	}
	if kind == "product" {
		if err := tx.QueryRow(r.Context(), `SELECT id FROM products
			WHERE id=$1 AND deleted_at IS NOT NULL FOR UPDATE`, id).Scan(&parentID); err != nil {
			trashError(w, "lock deleted product", err)
			return
		}
		var hasOrders bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS (
			SELECT 1 FROM order_items oi JOIN product_variants v ON v.id=oi.variant_id
			WHERE v.product_id=$1)`, id).Scan(&hasOrders); err != nil {
			serverError(w, "check product order history", err)
			return
		}
		if hasOrders {
			http.Error(w, "el producto aparece en pedidos históricos y no puede borrarse definitivamente", http.StatusConflict)
			return
		}
		if _, err := tx.Exec(r.Context(), `DELETE FROM product_variants WHERE product_id=$1`, id); err != nil {
			trashError(w, "delete product variants", err)
			return
		}
	}
	if kind == "variant" {
		var hasOrders bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM order_items WHERE variant_id=$1)`, id).Scan(&hasOrders); err != nil {
			serverError(w, "check variant order history", err)
			return
		}
		if hasOrders {
			http.Error(w, "la variante aparece en pedidos históricos y no puede borrarse definitivamente", http.StatusConflict)
			return
		}
	}
	table := trashTables[kind]
	query := "DELETE FROM " + table + " WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id"
	if kind == "variant" {
		query = `DELETE FROM product_variants WHERE id=$1 AND deleted_at IS NOT NULL RETURNING product_id`
	} else if kind == "section" {
		query = `DELETE FROM page_sections WHERE id=$1 AND deleted_at IS NOT NULL RETURNING page_id`
	} else if kind == "media" {
		query = `DELETE FROM media WHERE id=$1 AND deleted_at IS NOT NULL
			AND kind='image' AND source_type='local' RETURNING storage_key`
	}
	if kind == "media" {
		if err := tx.QueryRow(r.Context(), query, id).Scan(&storageKey); err != nil {
			trashError(w, "delete media", err)
			return
		}
		if !storageKeyPattern.MatchString(storageKey) {
			serverError(w, "delete media", errors.New("invalid stored media key"))
			return
		}
	} else if err := tx.QueryRow(r.Context(), query, id).Scan(&parentID); err != nil {
		trashError(w, "delete trash item", err)
		return
	}
	if kind == "variant" {
		if _, err := tx.Exec(r.Context(), `UPDATE products SET revision=revision+1, updated_at=now() WHERE id=$1`, parentID); err != nil {
			serverError(w, "update product revision", err)
			return
		}
	} else if kind == "section" {
		if _, err := tx.Exec(r.Context(), `UPDATE pages SET draft_revision=draft_revision+1, updated_at=now() WHERE id=$1`, parentID); err != nil {
			serverError(w, "update page revision", err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		trashError(w, "commit permanent deletion", err)
		return
	}
	if kind == "media" {
		if err := os.Remove(filepath.Join(service.mediaDir, storageKey)); err != nil && !errors.Is(err, os.ErrNotExist) {
			slog.Error("media record deleted but file removal failed", "media_id", id, "storage_key", storageKey, "error", err)
			http.Error(w, "el registro se borró, pero falló la limpieza del archivo; revisa el servidor", http.StatusInternalServerError)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
