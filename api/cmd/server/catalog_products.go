package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type productVariant struct {
	ID                  int64  `json:"id"`
	Code                string `json:"code"`
	SizeAlpha           string `json:"sizeAlpha"`
	SizeNumeric         string `json:"sizeNumeric"`
	PriceMinor          int64  `json:"priceMinor"`
	CompareAtPriceMinor *int64 `json:"compareAtPriceMinor"`
	IsActive            bool   `json:"isActive"`
	IsDeleted           bool   `json:"isDeleted"`
}

type productRecord struct {
	ID          int64            `json:"id"`
	Code        string           `json:"code"`
	Revision    int64            `json:"revision"`
	Slug        string           `json:"slug"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Style       string           `json:"style"`
	Audience    string           `json:"audience"`
	Color       string           `json:"color"`
	BrandID     int64            `json:"brandId"`
	BrandName   string           `json:"brandName"`
	Status      string           `json:"status"`
	IsFeatured  bool             `json:"isFeatured"`
	IsDeleted   bool             `json:"isDeleted"`
	Variants    []productVariant `json:"variants"`
	Media       []landingMedia   `json:"media"`
}

type productService struct {
	pool  *pgxpool.Pool
	admin *adminAuth
}

func registerProductRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &productService{pool: pool, admin: admin}
	mux.HandleFunc("GET /api/admin/catalog/products", service.listAdmin)
	mux.HandleFunc("DELETE /api/admin/catalog/products/{id}", service.trashProduct)
	mux.HandleFunc("POST /api/admin/catalog/products/{id}/restore", service.restoreProduct)
	mux.HandleFunc("DELETE /api/admin/catalog/variants/{id}", service.trashVariant)
	mux.HandleFunc("POST /api/admin/catalog/variants/{id}/restore", service.restoreVariant)
	mux.HandleFunc("GET /api/catalog/products", service.listPublic)
}

func (service *productService) requireOwner(w http.ResponseWriter, r *http.Request) bool {
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

func (service *productService) listAdmin(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	products, err := readProducts(r.Context(), service.pool, false)
	if err != nil {
		serverError(w, "list admin products", err)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

func (service *productService) listPublic(w http.ResponseWriter, r *http.Request) {
	products, err := readProducts(r.Context(), service.pool, true)
	if err != nil {
		serverError(w, "list public products", err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, products)
}

func readProducts(ctx context.Context, pool *pgxpool.Pool, public bool) ([]productRecord, error) {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	query := `SELECT p.id, p.code, p.revision, p.slug, p.name, COALESCE(p.description,''),
		p.style_label, p.audience_label, p.color_label, COALESCE(p.brand_id,0),
		COALESCE(b.name,''), p.status, p.is_featured, p.deleted_at IS NOT NULL
		FROM products p LEFT JOIN brands b ON b.id=p.brand_id`
	if public {
		query += ` WHERE p.status='active' AND p.deleted_at IS NULL AND EXISTS (
			SELECT 1 FROM product_variants v WHERE v.product_id=p.id
			AND v.is_active AND v.deleted_at IS NULL)`
	}
	query += ` ORDER BY p.is_featured DESC, p.sort_order, p.id DESC`
	rows, err := tx.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	products := []productRecord{}
	indexes := map[int64]int{}
	ids := []int64{}
	for rows.Next() {
		var item productRecord
		var code int64
		if err := rows.Scan(&item.ID, &code, &item.Revision, &item.Slug, &item.Name,
			&item.Description, &item.Style, &item.Audience, &item.Color, &item.BrandID,
			&item.BrandName, &item.Status, &item.IsFeatured, &item.IsDeleted); err != nil {
			rows.Close()
			return nil, err
		}
		item.Code = fmt.Sprintf("%04d", code)
		item.Variants = []productVariant{}
		item.Media = []landingMedia{}
		indexes[item.ID] = len(products)
		ids = append(ids, item.ID)
		products = append(products, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return products, tx.Commit(ctx)
	}
	query = `SELECT id, product_id, code, COALESCE(size_alpha,''), COALESCE(size_numeric,''),
		price_minor, compare_at_price_minor, is_active, deleted_at IS NOT NULL
		FROM product_variants WHERE product_id=ANY($1)`
	if public {
		query += ` AND is_active AND deleted_at IS NULL`
	}
	query += ` ORDER BY sort_order, id`
	rows, err = tx.Query(ctx, query, ids)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var variant productVariant
		var productID int64
		if err := rows.Scan(&variant.ID, &productID, &variant.Code, &variant.SizeAlpha,
			&variant.SizeNumeric, &variant.PriceMinor, &variant.CompareAtPriceMinor,
			&variant.IsActive, &variant.IsDeleted); err != nil {
			rows.Close()
			return nil, err
		}
		products[indexes[productID]].Variants = append(products[indexes[productID]].Variants, variant)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	query = `SELECT pm.product_id, m.id, m.kind, COALESCE(m.alt_text,'')
		FROM product_media pm JOIN media m ON m.id=pm.media_id
		WHERE pm.product_id=ANY($1) AND m.kind='image' AND m.source_type='local'`
	if public {
		query += ` AND m.deleted_at IS NULL`
	}
	query += ` ORDER BY pm.sort_order, m.id`
	rows, err = tx.Query(ctx, query, ids)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var productID int64
		var item landingMedia
		if err := rows.Scan(&productID, &item.ID, &item.Kind, &item.AltText); err != nil {
			rows.Close()
			return nil, err
		}
		if public {
			item.URL = fmt.Sprintf("/api/media/%d", item.ID)
		} else {
			item.URL = fmt.Sprintf("/api/admin/media/%d", item.ID)
		}
		products[indexes[productID]].Media = append(products[indexes[productID]].Media, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	return products, tx.Commit(ctx)
}

func validUniqueIDs(ids []int64, max int) bool {
	if len(ids) > max {
		return false
	}
	seen := map[int64]bool{}
	for _, id := range ids {
		if id <= 0 || seen[id] {
			return false
		}
		seen[id] = true
	}
	return true
}

func generatedSKU(ctx context.Context, tx pgx.Tx) (string, error) {
	var number int64
	if err := tx.QueryRow(ctx, `SELECT nextval('xpander_variant_sku_seq')`).Scan(&number); err != nil {
		return "", err
	}
	return fmt.Sprintf("XP-%08d", number), nil
}

func (service *productService) trashProduct(w http.ResponseWriter, r *http.Request) {
	service.changeProductTrash(w, r, false)
}

func (service *productService) restoreProduct(w http.ResponseWriter, r *http.Request) {
	service.changeProductTrash(w, r, true)
}

func (service *productService) changeProductTrash(w http.ResponseWriter, r *http.Request, restore bool) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	query := `UPDATE products SET deleted_at=now(), revision=revision+1,
		updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id`
	if restore {
		query = `UPDATE products SET deleted_at=NULL, revision=revision+1,
			updated_at=now() WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id`
	}
	var found int64
	if err := service.pool.QueryRow(r.Context(), query, id).Scan(&found); err != nil {
		vocabularyDBError(w, "change product recycle bin", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *productService) trashVariant(w http.ResponseWriter, r *http.Request) {
	service.changeVariantTrash(w, r, false)
}

func (service *productService) restoreVariant(w http.ResponseWriter, r *http.Request) {
	service.changeVariantTrash(w, r, true)
}

func (service *productService) changeVariantTrash(w http.ResponseWriter, r *http.Request, restore bool) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin variant recycle bin", err)
		return
	}
	defer tx.Rollback(context.Background())
	var productID int64
	err = tx.QueryRow(r.Context(), `SELECT p.id FROM products p
		JOIN product_variants v ON v.product_id=p.id
		WHERE v.id=$1 AND p.deleted_at IS NULL FOR UPDATE OF p`, id).Scan(&productID)
	if err != nil {
		vocabularyDBError(w, "find variant product", err)
		return
	}
	query := `UPDATE product_variants SET deleted_at=now(), updated_at=now()
		WHERE id=$1 AND deleted_at IS NULL RETURNING id`
	if restore {
		query = `UPDATE product_variants SET deleted_at=NULL, updated_at=now()
			WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id`
	}
	var found int64
	if err := tx.QueryRow(r.Context(), query, id).Scan(&found); err != nil {
		var pgErr *pgconn.PgError
		if restore && errors.As(err, &pgErr) && pgErr.Code == "23505" {
			http.Error(w, "ya existe otra variante con esa talla", http.StatusConflict)
			return
		}
		vocabularyDBError(w, "change variant recycle bin", err)
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE products SET revision=revision+1,
		updated_at=now() WHERE id=$1`, productID); err != nil {
		serverError(w, "update product revision", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit variant recycle bin", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
