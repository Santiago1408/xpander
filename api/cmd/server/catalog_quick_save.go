package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type quickVariantInput struct {
	ID                int64             `json:"id"`
	SizeAlpha         string            `json:"sizeAlpha"`
	SizeNumeric       string            `json:"sizeNumeric"`
	RegularPriceMinor int64             `json:"regularPriceMinor"`
	OfferPriceMinor   *int64            `json:"offerPriceMinor"`
	StockEntries      []quickStockEntry `json:"stockEntries"`
	IsActive          bool              `json:"isActive"`
}

type quickStockEntry struct {
	BranchID      int64 `json:"branchId"`
	Quantity      int64 `json:"quantity"`
	UnitCostMinor int64 `json:"unitCostMinor"`
}

type quickProductInput struct {
	RequestKey  string              `json:"requestKey"`
	Revision    int64               `json:"revision"`
	Slug        string              `json:"slug"`
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Style       string              `json:"style"`
	Audience    string              `json:"audience"`
	Color       string              `json:"color"`
	BrandID     int64               `json:"brandId"`
	Status      string              `json:"status"`
	IsFeatured  bool                `json:"isFeatured"`
	MediaIDs    []int64             `json:"mediaIds"`
	Variants    []quickVariantInput `json:"variants"`
}

func containsLetter(value string) bool {
	for _, char := range value {
		if unicode.IsLetter(char) {
			return true
		}
	}
	return false
}

func containsDigit(value string) bool {
	for _, char := range value {
		if unicode.IsDigit(char) {
			return true
		}
	}
	return false
}

func normalizeQuickProduct(input *quickProductInput) error {
	input.Name = displayLabel(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	input.Slug = strings.TrimSpace(input.Slug)
	input.Style = displayLabel(input.Style)
	input.Audience = displayLabel(input.Audience)
	input.Color = displayLabel(input.Color)
	if input.Revision < 0 || !validVocabularyName(input.Name) || len(input.Description) > 10000 ||
		(input.Slug != "" && !vocabularyCodePattern.MatchString(input.Slug)) ||
		(input.Status != "draft" && input.Status != "active" && input.Status != "archived") ||
		!validUniqueIDs(input.MediaIDs, 12) || len(input.Variants) < 1 || len(input.Variants) > 99 {
		return errors.New("datos del producto inválidos")
	}
	if input.BrandID < 0 {
		return errors.New("marca inválida")
	}
	for _, label := range []string{input.Style, input.Audience, input.Color} {
		if len(label) > 120 || (label != "" && catalogKey(label) == "") {
			return errors.New("estilo, público o color inválido")
		}
	}
	if input.RequestKey != "" && !stockRequestKeyPattern.MatchString(input.RequestKey) {
		return errors.New("clave de solicitud inválida")
	}
	seenIDs := map[int64]bool{}
	seenAlpha := map[string]bool{}
	seenNumeric := map[string]bool{}
	activeCount := 0
	for index := range input.Variants {
		variant := &input.Variants[index]
		variant.SizeAlpha = displayLabel(variant.SizeAlpha)
		variant.SizeNumeric = displayLabel(variant.SizeNumeric)
		alphaKey := catalogKey(variant.SizeAlpha)
		numericKey := catalogKey(variant.SizeNumeric)
		if variant.ID < 0 || (variant.ID > 0 && seenIDs[variant.ID]) ||
			(alphaKey == "" && numericKey == "") ||
			len(variant.SizeAlpha) > 40 || len(variant.SizeNumeric) > 40 ||
			(alphaKey != "" && (seenAlpha[alphaKey] || alphaKey == "UNICA")) ||
			(numericKey != "" && seenNumeric[numericKey]) ||
			(variant.SizeAlpha != "" && !containsLetter(variant.SizeAlpha)) ||
			(variant.SizeNumeric != "" && !containsDigit(variant.SizeNumeric)) ||
			variant.RegularPriceMinor <= 0 || variant.RegularPriceMinor > 1_000_000_000 ||
			(variant.OfferPriceMinor != nil && (*variant.OfferPriceMinor <= 0 || *variant.OfferPriceMinor >= variant.RegularPriceMinor)) || len(variant.StockEntries) > 100 {
			return errors.New("talla, precio, oferta o inventario inválido")
		}
		seenBranches := map[int64]bool{}
		for _, entry := range variant.StockEntries {
			if entry.BranchID <= 0 || seenBranches[entry.BranchID] || entry.Quantity <= 0 ||
				entry.Quantity > 1_000_000 || entry.UnitCostMinor < 0 || entry.UnitCostMinor > 1_000_000_000 {
				return errors.New("sucursal, cantidad o costo inválido")
			}
			seenBranches[entry.BranchID] = true
		}
		seenIDs[variant.ID] = true
		if alphaKey != "" {
			seenAlpha[alphaKey] = true
		}
		if numericKey != "" {
			seenNumeric[numericKey] = true
		}
		if variant.IsActive {
			activeCount++
		}
	}
	if input.Status == "active" && activeCount == 0 {
		return errors.New("un producto visible necesita una talla activa")
	}
	return nil
}

func (service *productService) createQuick(w http.ResponseWriter, r *http.Request) {
	service.saveQuick(w, r, 0)
}

func (service *productService) updateQuick(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	service.saveQuick(w, r, id)
}

func (service *productService) quickError(w http.ResponseWriter, operation string, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23505" {
			http.Error(w, "identificador o talla ya registrados", http.StatusConflict)
			return
		}
		if pgErr.Code == "23514" || pgErr.Code == "23503" {
			http.Error(w, "código agotado, saldo inválido o datos relacionados inexistentes", http.StatusBadRequest)
			return
		}
	}
	vocabularyDBError(w, operation, err)
}

func (service *productService) saveQuick(w http.ResponseWriter, r *http.Request, productID int64) {
	wasUpdate := productID > 0
	if !service.requireOwner(w, r) {
		return
	}
	user, ok := service.admin.currentUser(w, r)
	if !ok {
		return
	}
	var input quickProductInput
	if !decodeJSON(w, r, &input, 128*1024) {
		return
	}
	if productID == 0 && input.RequestKey == "" {
		http.Error(w, "clave de solicitud requerida", http.StatusBadRequest)
		return
	}
	if err := normalizeQuickProduct(&input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if productID == 0 {
		var previousID, revision int64
		err := service.pool.QueryRow(r.Context(), `SELECT id, revision FROM products
			WHERE create_request_key=$1::uuid`, input.RequestKey).Scan(&previousID, &revision)
		if err == nil {
			writeJSON(w, http.StatusOK, map[string]int64{"id": previousID, "revision": revision})
			return
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			serverError(w, "check product request key", err)
			return
		}
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin quick product", err)
		return
	}
	defer tx.Rollback(context.Background())
	var oldSlug string
	var revision int64
	if productID > 0 {
		err = tx.QueryRow(r.Context(), `SELECT revision, slug FROM products
			WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, productID).Scan(&revision, &oldSlug)
		if err != nil {
			vocabularyDBError(w, "lock quick product", err)
			return
		}
		if revision != input.Revision {
			http.Error(w, "producto modificado en otra sesión; recarga", http.StatusConflict)
			return
		}
		if input.Slug == "" {
			input.Slug = oldSlug
		}
	}
	if input.BrandID > 0 {
		var found int64
		if err := tx.QueryRow(r.Context(), `SELECT id FROM brands WHERE id=$1`, input.BrandID).Scan(&found); err != nil {
			vocabularyDBError(w, "find product brand", err)
			return
		}
	}
	branchIDs := map[int64]bool{}
	for _, variant := range input.Variants {
		for _, entry := range variant.StockEntries {
			branchIDs[entry.BranchID] = true
		}
	}
	for branchID := range branchIDs {
		var active bool
		err = tx.QueryRow(r.Context(), `SELECT is_active FROM branches WHERE id=$1`, branchID).Scan(&active)
		if errors.Is(err, pgx.ErrNoRows) || err == nil && !active {
			http.Error(w, "sucursal inactiva o inexistente", http.StatusBadRequest)
			return
		}
		if err != nil {
			serverError(w, "check stock branch", err)
			return
		}
	}
	if len(input.MediaIDs) > 0 {
		rows, err := tx.Query(r.Context(), `SELECT id FROM media WHERE id=ANY($1)
			AND kind='image' AND source_type='local' AND deleted_at IS NULL`, input.MediaIDs)
		if err != nil {
			serverError(w, "check quick product images", err)
			return
		}
		count := 0
		for rows.Next() {
			count++
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			serverError(w, "check quick product images", err)
			return
		}
		if count != len(input.MediaIDs) {
			http.Error(w, "imagen inexistente o en papelera", http.StatusBadRequest)
			return
		}
	}
	if productID == 0 {
		base := codeFromName(input.Name)
		for attempt := 1; attempt <= 100; attempt++ {
			slug := input.Slug
			if slug == "" {
				slug = codeWithSuffix(base, attempt)
			}
			err = tx.QueryRow(r.Context(), `INSERT INTO products
				(style_label, audience_label, brand_id, color_label, slug, name,
				description, status, is_featured, create_request_key)
				VALUES ($1,$2,NULLIF($3::bigint,0),$4,$5,$6,NULLIF($7,''),$8,$9,$10::uuid)
				ON CONFLICT DO NOTHING RETURNING id`, input.Style, input.Audience, input.BrandID, input.Color,
				slug, input.Name, input.Description, input.Status, input.IsFeatured, input.RequestKey).Scan(&productID)
			if err == nil {
				break
			}
			if !errors.Is(err, pgx.ErrNoRows) {
				service.quickError(w, "create quick product", err)
				return
			}
			var previous int64
			if lookupErr := tx.QueryRow(r.Context(), `SELECT id FROM products
				WHERE create_request_key=$1::uuid`, input.RequestKey).Scan(&previous); lookupErr == nil {
				writeJSON(w, http.StatusOK, map[string]int64{"id": previous})
				return
			}
			if input.Slug != "" {
				http.Error(w, "identificador ocupado", http.StatusConflict)
				return
			}
		}
		if productID == 0 {
			http.Error(w, "no se pudo asignar identificador al producto", http.StatusConflict)
			return
		}
	} else {
		_, err = tx.Exec(r.Context(), `UPDATE products SET style_label=$2,
			audience_label=$3, brand_id=NULLIF($4::bigint,0),
			color_label=$5, slug=$6, name=$7, description=NULLIF($8,''),
			status=$9, is_featured=$10, revision=revision+1, updated_at=now()
			WHERE id=$1`, productID, input.Style, input.Audience, input.BrandID, input.Color, input.Slug,
			input.Name, input.Description, input.Status, input.IsFeatured)
		if err != nil {
			service.quickError(w, "update quick product", err)
			return
		}
	}
	var existingIDs = map[int64]bool{}
	if productID > 0 {
		rows, err := tx.Query(r.Context(), `SELECT id FROM product_variants
			WHERE product_id=$1 AND deleted_at IS NULL`, productID)
		if err != nil {
			serverError(w, "list existing quick variants", err)
			return
		}
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				serverError(w, "scan existing quick variant", err)
				return
			}
			existingIDs[id] = true
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			serverError(w, "list existing quick variants", err)
			return
		}
	}
	// Free the unique size keys so two existing variants can exchange sizes in one save.
	for id := range existingIDs {
		if _, err := tx.Exec(r.Context(), `UPDATE product_variants SET size_alpha_key=NULL,
			size_numeric_key=NULL WHERE id=$1`, id); err != nil {
			service.quickError(w, "prepare variant sizes", err)
			return
		}
	}
	seenExisting := map[int64]bool{}
	for index, variant := range input.Variants {
		variantID := variant.ID
		price := variant.RegularPriceMinor
		var compareAt *int64
		if variant.OfferPriceMinor != nil {
			price = *variant.OfferPriceMinor
			compareAt = &variant.RegularPriceMinor
		}
		if variantID > 0 {
			if !existingIDs[variantID] || seenExisting[variantID] {
				http.Error(w, "variante ajena, eliminada o repetida", http.StatusBadRequest)
				return
			}
			seenExisting[variantID] = true
			_, err = tx.Exec(r.Context(), `UPDATE product_variants SET size_alpha=NULLIF($2,''),
				size_numeric=NULLIF($3,''), size_alpha_key=NULLIF($4,''),
				size_numeric_key=NULLIF($5,''), price_minor=$6, compare_at_price_minor=$7,
				is_active=$8, sort_order=$9, updated_at=now() WHERE id=$1`, variantID,
				variant.SizeAlpha, variant.SizeNumeric, catalogKey(variant.SizeAlpha),
				catalogKey(variant.SizeNumeric), price, compareAt, variant.IsActive, index*10)
			if err != nil {
				service.quickError(w, "update quick variant", err)
				return
			}
		} else {
			sku, err := generatedSKU(r.Context(), tx)
			if err != nil {
				serverError(w, "generate variant SKU", err)
				return
			}
			err = tx.QueryRow(r.Context(), `INSERT INTO product_variants
				(product_id, sku, size_alpha, size_numeric, size_alpha_key,
				size_numeric_key, price_minor, compare_at_price_minor, is_active, sort_order)
				VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),NULLIF($6,''),$7,$8,$9,$10)
				RETURNING id`, productID, sku, variant.SizeAlpha, variant.SizeNumeric,
				catalogKey(variant.SizeAlpha), catalogKey(variant.SizeNumeric), price,
				compareAt, variant.IsActive, index*10).Scan(&variantID)
			if err != nil {
				service.quickError(w, "create quick variant", err)
				return
			}
		}
		for _, entry := range variant.StockEntries {
			_, err = tx.Exec(r.Context(), `INSERT INTO stock_movements
				(branch_id, variant_id, kind, delta, unit_cost_minor, recorded_by_user_id, note)
				VALUES ($1,$2,'purchase',$3,$4,$5,$6)`, entry.BranchID, variantID,
				entry.Quantity, entry.UnitCostMinor, user.ID,
				fmt.Sprintf("Carga desde ficha de producto %d", productID))
			if err != nil {
				service.quickError(w, "record initial stock", err)
				return
			}
		}
	}
	if len(existingIDs) != len(seenExisting) {
		http.Error(w, "faltan variantes existentes; recarga la ficha", http.StatusConflict)
		return
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM product_media WHERE product_id=$1`, productID); err != nil {
		serverError(w, "replace quick product images", err)
		return
	}
	for index, mediaID := range input.MediaIDs {
		if _, err := tx.Exec(r.Context(), `INSERT INTO product_media (product_id, media_id, sort_order, is_primary)
			VALUES ($1,$2,$3,$4)`, productID, mediaID, index*10, index == 0); err != nil {
			service.quickError(w, "link quick product image", err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		service.quickError(w, "commit quick product", err)
		return
	}
	if wasUpdate {
		revision++
	}
	writeJSON(w, http.StatusOK, map[string]int64{"id": productID, "revision": revision})
}
