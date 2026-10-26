package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var skuPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)

type productVariant struct {
	ID                  int64    `json:"id"`
	SKU                 string   `json:"sku"`
	PriceMinor          int64    `json:"priceMinor"`
	CompareAtPriceMinor *int64   `json:"compareAtPriceMinor"`
	IsActive            bool     `json:"isActive"`
	IsDeleted           bool     `json:"isDeleted"`
	OptionIDs           []int64  `json:"optionIds"`
	OptionLabels        []string `json:"optionLabels"`
	optionSignature     string
}

type productRecord struct {
	ID               int64            `json:"id"`
	Revision         int64            `json:"revision"`
	Slug             string           `json:"slug"`
	Name             string           `json:"name"`
	Description      string           `json:"description"`
	CategoryID       int64            `json:"categoryId"`
	CategoryName     string           `json:"categoryName"`
	BrandID          int64            `json:"brandId"`
	BrandName        string           `json:"brandName"`
	Status           string           `json:"status"`
	IsFeatured       bool             `json:"isFeatured"`
	IsDeleted        bool             `json:"isDeleted"`
	ProductOptionIDs []int64          `json:"productOptionIds"`
	ProductLabels    []string         `json:"productLabels"`
	Variants         []productVariant `json:"variants"`
	Media            []landingMedia   `json:"media"`
}

type productInput struct {
	Revision         int64            `json:"revision"`
	Slug             string           `json:"slug"`
	Name             string           `json:"name"`
	Description      string           `json:"description"`
	CategoryID       int64            `json:"categoryId"`
	BrandID          int64            `json:"brandId"`
	Status           string           `json:"status"`
	IsFeatured       bool             `json:"isFeatured"`
	ProductOptionIDs []int64          `json:"productOptionIds"`
	Variants         []productVariant `json:"variants"`
	MediaIDs         []int64          `json:"mediaIds"`
}

type productService struct {
	pool  *pgxpool.Pool
	admin *adminAuth
}

func registerProductRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &productService{pool: pool, admin: admin}
	mux.HandleFunc("GET /api/admin/catalog/products", service.listAdmin)
	mux.HandleFunc("POST /api/admin/catalog/products", service.create)
	mux.HandleFunc("PUT /api/admin/catalog/products/{id}", service.update)
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
	query := `SELECT p.id, p.revision, p.slug, p.name, COALESCE(p.description, ''),
		p.category_id, c.name, COALESCE(p.brand_id, 0), COALESCE(b.name, ''),
		p.status, p.is_featured, p.deleted_at IS NOT NULL FROM products p
		JOIN categories c ON c.id=p.category_id
		LEFT JOIN brands b ON b.id=p.brand_id AND b.deleted_at IS NULL`
	if public {
		query += ` WHERE p.status='active' AND p.deleted_at IS NULL
			AND c.deleted_at IS NULL AND EXISTS (
			SELECT 1 FROM product_variants v WHERE v.product_id=p.id
			AND v.is_active AND v.deleted_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM variant_option_values vov
				JOIN attribute_options o ON o.id=vov.option_id
				JOIN attribute_definitions d ON d.id=vov.attribute_definition_id
				WHERE vov.variant_id=v.id AND (o.deleted_at IS NOT NULL OR d.deleted_at IS NOT NULL)))`
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
		if err := rows.Scan(&item.ID, &item.Revision, &item.Slug, &item.Name,
			&item.Description, &item.CategoryID, &item.CategoryName, &item.BrandID,
			&item.BrandName, &item.Status, &item.IsFeatured, &item.IsDeleted); err != nil {
			rows.Close()
			return nil, err
		}
		item.ProductOptionIDs = []int64{}
		item.ProductLabels = []string{}
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

	productOptionsQuery := `SELECT pov.product_id, pov.option_id, d.name, o.value
		FROM product_option_values pov JOIN attribute_options o ON o.id=pov.option_id
		JOIN attribute_definitions d ON d.id=pov.attribute_definition_id
		WHERE pov.product_id=ANY($1)`
	if public {
		productOptionsQuery += ` AND o.deleted_at IS NULL AND d.deleted_at IS NULL`
	}
	productOptionsQuery += ` ORDER BY d.sort_order, d.id`
	rows, err = tx.Query(ctx, productOptionsQuery, ids)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var productID, optionID int64
		var name, value string
		if err := rows.Scan(&productID, &optionID, &name, &value); err != nil {
			rows.Close()
			return nil, err
		}
		item := &products[indexes[productID]]
		item.ProductOptionIDs = append(item.ProductOptionIDs, optionID)
		item.ProductLabels = append(item.ProductLabels, name+": "+value)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}

	variantQuery := `SELECT v.id, v.product_id, v.sku, v.price_minor, v.compare_at_price_minor,
		v.is_active, v.option_signature, v.deleted_at IS NOT NULL
		FROM product_variants v WHERE v.product_id=ANY($1)`
	if public {
		variantQuery += ` AND v.is_active AND v.deleted_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM variant_option_values vov
				JOIN attribute_options o ON o.id=vov.option_id
				JOIN attribute_definitions d ON d.id=vov.attribute_definition_id
				WHERE vov.variant_id=v.id AND (o.deleted_at IS NOT NULL OR d.deleted_at IS NOT NULL))`
	}
	variantQuery += ` ORDER BY v.sort_order, v.id`
	rows, err = tx.Query(ctx, variantQuery, ids)
	if err != nil {
		return nil, err
	}
	variantIndexes := map[int64][2]int{}
	variantIDs := []int64{}
	for rows.Next() {
		var variant productVariant
		var productID int64
		if err := rows.Scan(&variant.ID, &productID, &variant.SKU, &variant.PriceMinor,
			&variant.CompareAtPriceMinor, &variant.IsActive, &variant.optionSignature, &variant.IsDeleted); err != nil {
			rows.Close()
			return nil, err
		}
		variant.OptionIDs = []int64{}
		variant.OptionLabels = []string{}
		index := indexes[productID]
		variantIndexes[variant.ID] = [2]int{index, len(products[index].Variants)}
		variantIDs = append(variantIDs, variant.ID)
		products[index].Variants = append(products[index].Variants, variant)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if len(variantIDs) > 0 {
		rows, err = tx.Query(ctx, `SELECT vov.variant_id, vov.option_id, d.name, o.value
			FROM variant_option_values vov JOIN attribute_options o ON o.id=vov.option_id
			JOIN attribute_definitions d ON d.id=vov.attribute_definition_id
			WHERE vov.variant_id=ANY($1) ORDER BY d.sort_order, d.id`, variantIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var variantID, optionID int64
			var name, value string
			if err := rows.Scan(&variantID, &optionID, &name, &value); err != nil {
				rows.Close()
				return nil, err
			}
			location := variantIndexes[variantID]
			variant := &products[location[0]].Variants[location[1]]
			variant.OptionIDs = append(variant.OptionIDs, optionID)
			variant.OptionLabels = append(variant.OptionLabels, name+": "+value)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
	}

	mediaQuery := `SELECT pm.product_id, m.id, m.kind, COALESCE(m.alt_text, '')
		FROM product_media pm JOIN media m ON m.id=pm.media_id
		WHERE pm.product_id=ANY($1) AND m.kind='image' AND m.source_type='local'`
	if public {
		mediaQuery += ` AND m.deleted_at IS NULL`
	}
	mediaQuery += ` ORDER BY pm.sort_order, m.id`
	rows, err = tx.Query(ctx, mediaQuery, ids)
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

func validateProductInput(input productInput) error {
	if input.Revision < 0 || (input.Slug != "" && !vocabularyCodePattern.MatchString(input.Slug)) ||
		!validVocabularyName(input.Name) || len(input.Description) > 10000 ||
		input.CategoryID <= 0 || input.BrandID < 0 ||
		(input.Status != "draft" && input.Status != "active" && input.Status != "archived") ||
		!validUniqueIDs(input.ProductOptionIDs, 20) || !validUniqueIDs(input.MediaIDs, 12) ||
		len(input.Variants) > 100 {
		return errors.New("datos del producto inválidos")
	}
	seenVariants := map[int64]bool{}
	seenSKUs := map[string]bool{}
	for _, variant := range input.Variants {
		if variant.ID < 0 || (variant.ID > 0 && seenVariants[variant.ID]) ||
			(variant.ID > 0 && (!skuPattern.MatchString(variant.SKU) || seenSKUs[variant.SKU])) ||
			variant.PriceMinor < 0 || variant.PriceMinor > 1_000_000_000 ||
			(variant.CompareAtPriceMinor != nil && (*variant.CompareAtPriceMinor < variant.PriceMinor || *variant.CompareAtPriceMinor > 1_000_000_000)) ||
			!validUniqueIDs(variant.OptionIDs, 20) {
			return errors.New("variante, SKU o precio inválido")
		}
		seenVariants[variant.ID] = true
		if variant.ID > 0 {
			seenSKUs[variant.SKU] = true
		}
	}
	return nil
}

func validateVisibleVariants(input productInput, existing map[int64]productVariant) error {
	if input.Status != "active" {
		return nil
	}
	visible := 0
	for _, variant := range input.Variants {
		if !variant.IsActive || existing[variant.ID].IsDeleted {
			continue
		}
		if variant.PriceMinor == 0 {
			return errors.New("una variante activa debe tener precio mayor a cero")
		}
		visible++
	}
	if visible == 0 {
		return errors.New("restaura o agrega una variante activa antes de publicar")
	}
	return nil
}

type optionInfo struct {
	definitionID int64
	scope        string
	active       bool
}

func loadOptionInfo(ctx context.Context, tx pgx.Tx, input productInput) (map[int64]optionInfo, error) {
	ids := append([]int64{}, input.ProductOptionIDs...)
	for _, variant := range input.Variants {
		ids = append(ids, variant.OptionIDs...)
	}
	options := map[int64]optionInfo{}
	if len(ids) == 0 {
		return options, nil
	}
	rows, err := tx.Query(ctx, `SELECT o.id, o.attribute_definition_id, d.scope,
		o.is_active AND d.is_active AND o.deleted_at IS NULL AND d.deleted_at IS NULL FROM attribute_options o
		JOIN attribute_definitions d ON d.id=o.attribute_definition_id WHERE o.id=ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id int64
		var item optionInfo
		if err := rows.Scan(&id, &item.definitionID, &item.scope, &item.active); err != nil {
			rows.Close()
			return nil, err
		}
		options[id] = item
	}
	err = rows.Err()
	rows.Close()
	return options, err
}

func selectionSignature(ids []int64, options map[int64]optionInfo, scope string, mustBeActive bool) (string, error) {
	parts := map[int64]int64{}
	definitionIDs := []int64{}
	for _, id := range ids {
		option, ok := options[id]
		if !ok || option.scope != scope || (mustBeActive && !option.active) {
			return "", errors.New("opción inexistente, inactiva o de otro tipo")
		}
		if _, exists := parts[option.definitionID]; exists {
			return "", errors.New("elige solo una opción por atributo")
		}
		parts[option.definitionID] = id
		definitionIDs = append(definitionIDs, option.definitionID)
	}
	slices.Sort(definitionIDs)
	ordered := make([]string, 0, len(definitionIDs))
	for _, id := range definitionIDs {
		ordered = append(ordered, strconv.FormatInt(id, 10)+":"+strconv.FormatInt(parts[id], 10))
	}
	return strings.Join(ordered, "|"), nil
}

func generatedSKU(ctx context.Context, tx pgx.Tx) (string, error) {
	var number int64
	if err := tx.QueryRow(ctx, `SELECT nextval('xpander_variant_sku_seq')`).Scan(&number); err != nil {
		return "", err
	}
	return fmt.Sprintf("XP-%08d", number), nil
}

func (service *productService) create(w http.ResponseWriter, r *http.Request) {
	service.save(w, r, 0)
}

func (service *productService) update(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	service.save(w, r, id)
}

func (service *productService) save(w http.ResponseWriter, r *http.Request, productID int64) {
	if !service.requireOwner(w, r) {
		return
	}
	var input productInput
	if !decodeJSON(w, r, &input, 128*1024) {
		return
	}
	input.Slug = strings.TrimSpace(input.Slug)
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	for index := range input.Variants {
		if input.Variants[index].ID == 0 {
			input.Variants[index].SKU = ""
		} else {
			input.Variants[index].SKU = strings.TrimSpace(input.Variants[index].SKU)
		}
	}
	if err := validateProductInput(input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin product save", err)
		return
	}
	defer tx.Rollback(context.Background())
	var oldCategoryID, oldBrandID, revision int64
	var oldSlug string
	existingVariants := map[int64]productVariant{}
	existingProductOptions := map[int64]bool{}
	existingMedia := map[int64]bool{}
	if productID > 0 {
		err = tx.QueryRow(r.Context(), `SELECT revision, slug, category_id, COALESCE(brand_id,0)
			FROM products WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, productID).Scan(
			&revision, &oldSlug, &oldCategoryID, &oldBrandID)
		if err != nil {
			vocabularyDBError(w, "lock product", err)
			return
		}
		if revision != input.Revision {
			http.Error(w, "producto modificado en otra sesión; recarga", http.StatusConflict)
			return
		}
		if input.Slug == "" {
			input.Slug = oldSlug
		}
		rows, err := tx.Query(r.Context(), `SELECT id, sku, option_signature, deleted_at IS NOT NULL
			FROM product_variants WHERE product_id=$1`, productID)
		if err != nil {
			serverError(w, "read existing variants", err)
			return
		}
		for rows.Next() {
			var variant productVariant
			if err := rows.Scan(&variant.ID, &variant.SKU, &variant.optionSignature, &variant.IsDeleted); err != nil {
				rows.Close()
				serverError(w, "scan existing variants", err)
				return
			}
			existingVariants[variant.ID] = variant
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			serverError(w, "read existing variants", err)
			return
		}
		rows, err = tx.Query(r.Context(), `SELECT option_id FROM product_option_values WHERE product_id=$1`, productID)
		if err != nil {
			serverError(w, "read existing product options", err)
			return
		}
		for rows.Next() {
			var optionID int64
			if err := rows.Scan(&optionID); err != nil {
				rows.Close()
				serverError(w, "scan existing product options", err)
				return
			}
			existingProductOptions[optionID] = true
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			serverError(w, "read existing product options", err)
			return
		}
		rows, err = tx.Query(r.Context(), `SELECT media_id FROM product_media WHERE product_id=$1`, productID)
		if err != nil {
			serverError(w, "read existing product media", err)
			return
		}
		for rows.Next() {
			var mediaID int64
			if err := rows.Scan(&mediaID); err != nil {
				rows.Close()
				serverError(w, "scan existing product media", err)
				return
			}
			existingMedia[mediaID] = true
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			serverError(w, "read existing product media", err)
			return
		}
	}
	var categoryActive bool
	if err := tx.QueryRow(r.Context(), `SELECT is_active AND deleted_at IS NULL FROM categories WHERE id=$1`, input.CategoryID).Scan(&categoryActive); err != nil {
		vocabularyDBError(w, "find category", err)
		return
	}
	if !categoryActive && input.CategoryID != oldCategoryID {
		http.Error(w, "elige una categoría activa", http.StatusBadRequest)
		return
	}
	if input.BrandID > 0 {
		var brandActive bool
		if err := tx.QueryRow(r.Context(), `SELECT is_active AND deleted_at IS NULL FROM brands WHERE id=$1`, input.BrandID).Scan(&brandActive); err != nil {
			vocabularyDBError(w, "find brand", err)
			return
		}
		if !brandActive && input.BrandID != oldBrandID {
			http.Error(w, "elige una marca activa", http.StatusBadRequest)
			return
		}
	}
	options, err := loadOptionInfo(r.Context(), tx, input)
	if err != nil {
		serverError(w, "validate product options", err)
		return
	}
	if _, err := selectionSignature(input.ProductOptionIDs, options, "product", false); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	for _, optionID := range input.ProductOptionIDs {
		if !options[optionID].active && !existingProductOptions[optionID] {
			http.Error(w, "elige opciones de producto activas", http.StatusBadRequest)
			return
		}
	}
	var variantDefinitions string
	seenSignatures := map[string]bool{}
	seenExisting := map[int64]bool{}
	for index := range input.Variants {
		variant := &input.Variants[index]
		old, exists := existingVariants[variant.ID]
		if variant.ID > 0 && !exists {
			http.Error(w, "variante ajena o inexistente", http.StatusBadRequest)
			return
		}
		signature, err := selectionSignature(variant.OptionIDs, options, "variant", !exists)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if exists && (old.SKU != variant.SKU || old.optionSignature != signature) {
			http.Error(w, "SKU y combinación de una variante existente no se pueden alterar", http.StatusBadRequest)
			return
		}
		variant.optionSignature = signature
		seenExisting[variant.ID] = true
		if exists && old.IsDeleted {
			continue
		}
		if seenSignatures[signature] {
			http.Error(w, "dos variantes tienen la misma combinación", http.StatusBadRequest)
			return
		}
		seenSignatures[signature] = true
		definitions := make([]string, 0, len(variant.OptionIDs))
		for _, optionID := range variant.OptionIDs {
			definitions = append(definitions, strconv.FormatInt(options[optionID].definitionID, 10))
		}
		slices.Sort(definitions)
		currentDefinitions := strings.Join(definitions, "|")
		if len(seenSignatures) == 1 {
			variantDefinitions = currentDefinitions
		} else if currentDefinitions != variantDefinitions {
			http.Error(w, "todas las variantes deben usar los mismos atributos", http.StatusBadRequest)
			return
		}
	}
	for id := range existingVariants {
		if !seenExisting[id] {
			http.Error(w, "faltan variantes existentes; desactívalas en lugar de borrarlas", http.StatusConflict)
			return
		}
	}
	if err := validateVisibleVariants(input, existingVariants); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(input.MediaIDs) > 0 {
		rows, err := tx.Query(r.Context(), `SELECT id, deleted_at IS NOT NULL FROM media WHERE id=ANY($1)
			AND kind='image' AND source_type='local'`, input.MediaIDs)
		if err != nil {
			serverError(w, "validate product images", err)
			return
		}
		count := 0
		for rows.Next() {
			var mediaID int64
			var deleted bool
			if err := rows.Scan(&mediaID, &deleted); err != nil {
				rows.Close()
				serverError(w, "scan product images", err)
				return
			}
			if deleted && !existingMedia[mediaID] {
				rows.Close()
				http.Error(w, "restaura la imagen antes de agregarla", http.StatusBadRequest)
				return
			}
			count++
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			serverError(w, "validate product images", err)
			return
		}
		if count != len(input.MediaIDs) {
			http.Error(w, "imagen inexistente o inválida", http.StatusBadRequest)
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
				(category_id, brand_id, slug, name, description, status, is_featured)
				VALUES ($1, NULLIF($2::bigint,0), $3, $4, NULLIF($5,''), $6, $7)
				ON CONFLICT (slug) DO NOTHING RETURNING id`, input.CategoryID, input.BrandID, slug, input.Name,
				input.Description, input.Status, input.IsFeatured).Scan(&productID)
			if err == nil || input.Slug != "" || !errors.Is(err, pgx.ErrNoRows) {
				break
			}
		}
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "identificador ocupado", http.StatusConflict)
				return
			}
			vocabularyDBError(w, "insert product", err)
			return
		}
	} else {
		_, err = tx.Exec(r.Context(), `UPDATE products SET category_id=$2,
			brand_id=NULLIF($3::bigint,0), slug=$4, name=$5, description=NULLIF($6,''),
			status=$7, is_featured=$8, revision=revision+1, updated_at=now()
			WHERE id=$1`, productID, input.CategoryID, input.BrandID, input.Slug, input.Name,
			input.Description, input.Status, input.IsFeatured)
		if err != nil {
			vocabularyDBError(w, "update product", err)
			return
		}
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM product_option_values WHERE product_id=$1`, productID); err != nil {
		serverError(w, "replace product options", err)
		return
	}
	for _, optionID := range input.ProductOptionIDs {
		_, err := tx.Exec(r.Context(), `INSERT INTO product_option_values
			(product_id, attribute_definition_id, option_id) VALUES ($1,$2,$3)`,
			productID, options[optionID].definitionID, optionID)
		if err != nil {
			vocabularyDBError(w, "link product option", err)
			return
		}
	}
	for index, variant := range input.Variants {
		if variant.ID > 0 {
			if existingVariants[variant.ID].IsDeleted {
				continue
			}
			_, err = tx.Exec(r.Context(), `UPDATE product_variants SET price_minor=$2,
				compare_at_price_minor=$3, is_active=$4, sort_order=$5, updated_at=now()
				WHERE id=$1`, variant.ID, variant.PriceMinor, variant.CompareAtPriceMinor,
				variant.IsActive, index*10)
		} else {
			var variantID int64
			var sku string
			sku, err = generatedSKU(r.Context(), tx)
			if err != nil {
				serverError(w, "generate variant SKU", err)
				return
			}
			err = tx.QueryRow(r.Context(), `INSERT INTO product_variants
				(product_id, sku, option_signature, price_minor, compare_at_price_minor, is_active, sort_order)
				VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, productID, sku,
				variant.optionSignature, variant.PriceMinor, variant.CompareAtPriceMinor,
				variant.IsActive, index*10).Scan(&variantID)
			if err == nil {
				for _, optionID := range variant.OptionIDs {
					_, err = tx.Exec(r.Context(), `INSERT INTO variant_option_values
						(variant_id, attribute_definition_id, option_id) VALUES ($1,$2,$3)`,
						variantID, options[optionID].definitionID, optionID)
					if err != nil {
						break
					}
				}
			}
		}
		if err != nil {
			vocabularyDBError(w, "save product variant", err)
			return
		}
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM product_media WHERE product_id=$1`, productID); err != nil {
		serverError(w, "replace product images", err)
		return
	}
	for index, mediaID := range input.MediaIDs {
		_, err := tx.Exec(r.Context(), `INSERT INTO product_media (product_id, media_id, sort_order, is_primary)
			VALUES ($1,$2,$3,$4)`, productID, mediaID, index*10, index == 0)
		if err != nil {
			vocabularyDBError(w, "link product image", err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		vocabularyDBError(w, "commit product", err)
		return
	}
	var savedRevision int64
	if err := service.pool.QueryRow(r.Context(), `SELECT revision FROM products WHERE id=$1`, productID).Scan(&savedRevision); err != nil {
		serverError(w, "read saved product", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"id": productID, "revision": savedRevision})
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
	query := `UPDATE product_variants SET deleted_at=now(),
		updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id`
	if restore {
		query = `UPDATE product_variants SET deleted_at=NULL, updated_at=now()
			WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id`
	}
	var found int64
	if err := tx.QueryRow(r.Context(), query, id).Scan(&found); err != nil {
		var pgErr *pgconn.PgError
		if restore && errors.As(err, &pgErr) && pgErr.Code == "23505" {
			http.Error(w, "ya existe otra variante con esa combinación; elimínala antes de restaurar", http.StatusConflict)
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
