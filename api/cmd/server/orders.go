package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type pickupBranch struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Address      string `json:"address"`
	Instructions string `json:"instructions"`
}

type checkoutItem struct {
	VariantID              int64 `json:"variantId"`
	Quantity               int64 `json:"quantity"`
	ExpectedUnitPriceMinor int64 `json:"expectedUnitPriceMinor"`
}

type checkoutInput struct {
	RequestKey     string         `json:"requestKey"`
	PaymentMethod  string         `json:"paymentMethod"`
	DeliveryMethod string         `json:"deliveryMethod"`
	PickupBranchID int64          `json:"pickupBranchId"`
	CustomerName   string         `json:"customerName"`
	CustomerPhone  string         `json:"customerPhone"`
	CustomerNote   string         `json:"customerNote"`
	Items          []checkoutItem `json:"items"`
}

type orderReceipt struct {
	ID             int64  `json:"id"`
	Number         string `json:"number"`
	Status         string `json:"status"`
	TotalMinor     int64  `json:"totalMinor"`
	WhatsAppURL    string `json:"whatsappUrl"`
	PaymentMethod  string `json:"paymentMethod"`
	PaymentStatus  string `json:"paymentStatus"`
	DeliveryMethod string `json:"deliveryMethod"`
	AccessToken    string `json:"accessToken"`
}

type orderLine struct {
	VariantID    int64
	ProductName  string
	VariantLabel string
	SKU          string
	UnitPrice    int64
	Quantity     int64
}

type orderService struct {
	pool           *pgxpool.Pool
	admin          *adminAuth
	whatsAppNumber string
	mediaDir       string
}

var errOrderKeyReuse = errors.New("la clave de este pedido ya se usó con otros datos")

func validWhatsAppNumber(number string) bool {
	if len(number) < 8 || len(number) > 15 {
		return false
	}
	for _, char := range number {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

func registerOrderRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth, whatsAppNumber, mediaDir string) {
	service := &orderService{pool: pool, admin: admin, whatsAppNumber: whatsAppNumber, mediaDir: mediaDir}
	mux.HandleFunc("GET /api/pickup-branches", service.listBranches)
	mux.HandleFunc("POST /api/orders", service.checkout)
	mux.HandleFunc("GET /api/admin/orders", service.listAdmin)
	mux.HandleFunc("POST /api/admin/orders/{id}/confirm", service.confirm)
	mux.HandleFunc("POST /api/admin/orders/{id}/cancel", service.cancel)
	mux.HandleFunc("POST /api/orders/{id}/receipt", service.uploadPaymentProof)
	mux.HandleFunc("GET /api/orders/{id}/payment", service.customerPaymentStatus)
	mux.HandleFunc("GET /api/admin/orders/{id}/receipt", service.downloadPaymentProof)
	mux.HandleFunc("POST /api/admin/orders/{id}/payment/verify", service.verifyPayment)
	mux.HandleFunc("POST /api/admin/orders/{id}/payment/reject", service.rejectPayment)
}

func normalizeCheckout(input *checkoutInput) error {
	if input.PaymentMethod == "" {
		input.PaymentMethod = "whatsapp"
	}
	if input.PaymentMethod != "whatsapp" && input.PaymentMethod != "qr" {
		return errors.New("método de pago inválido")
	}
	if input.DeliveryMethod == "" {
		input.DeliveryMethod = "pickup"
	}
	if input.DeliveryMethod != "pickup" && input.DeliveryMethod != "delivery" {
		return errors.New("forma de entrega inválida")
	}
	input.CustomerName = strings.Join(strings.Fields(input.CustomerName), " ")
	input.CustomerPhone = strings.TrimSpace(input.CustomerPhone)
	input.CustomerNote = strings.TrimSpace(input.CustomerNote)
	if !stockRequestKeyPattern.MatchString(input.RequestKey) || input.PickupBranchID <= 0 ||
		len(input.CustomerName) < 2 || len(input.CustomerName) > 120 ||
		len(input.CustomerNote) > 500 || len(input.Items) == 0 || len(input.Items) > 20 {
		return errors.New("pedido incompleto o demasiado grande")
	}
	phoneDigits := 0
	for _, char := range input.CustomerPhone {
		if char >= '0' && char <= '9' {
			phoneDigits++
		} else if !strings.ContainsRune("+ -()", char) {
			return errors.New("teléfono inválido")
		}
	}
	if phoneDigits < 7 || phoneDigits > 15 || len(input.CustomerPhone) > 25 {
		return errors.New("teléfono inválido")
	}
	seen := map[int64]bool{}
	for _, item := range input.Items {
		if item.VariantID <= 0 || seen[item.VariantID] || item.Quantity < 1 || item.Quantity > 20 ||
			item.ExpectedUnitPriceMinor < 1 || item.ExpectedUnitPriceMinor > 1_000_000_000 {
			return errors.New("producto o cantidad inválida en el carrito")
		}
		seen[item.VariantID] = true
	}
	sort.Slice(input.Items, func(i, j int) bool { return input.Items[i].VariantID < input.Items[j].VariantID })
	return nil
}

func checkoutFingerprint(input checkoutInput) string {
	// Pickup leaves the field empty so retries of earlier pickup orders keep their fingerprint.
	delivery := ""
	if input.DeliveryMethod == "delivery" {
		delivery = input.DeliveryMethod
	}
	payload := struct {
		PaymentMethod  string         `json:"paymentMethod"`
		DeliveryMethod string         `json:"deliveryMethod,omitempty"`
		PickupBranchID int64          `json:"pickupBranchId"`
		CustomerName   string         `json:"customerName"`
		CustomerPhone  string         `json:"customerPhone"`
		CustomerNote   string         `json:"customerNote"`
		Items          []checkoutItem `json:"items"`
	}{input.PaymentMethod, delivery, input.PickupBranchID, input.CustomerName, input.CustomerPhone, input.CustomerNote, input.Items}
	encoded, _ := json.Marshal(payload)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func legacyCheckoutFingerprint(input checkoutInput) string {
	payload := struct {
		PickupBranchID int64          `json:"pickupBranchId"`
		CustomerName   string         `json:"customerName"`
		CustomerPhone  string         `json:"customerPhone"`
		CustomerNote   string         `json:"customerNote"`
		Items          []checkoutItem `json:"items"`
	}{input.PickupBranchID, input.CustomerName, input.CustomerPhone, input.CustomerNote, input.Items}
	encoded, _ := json.Marshal(payload)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func orderNumber(id int64) string { return fmt.Sprintf("XP-%06d", id) }

func orderWhatsAppURL(number, message string) string {
	return "https://wa.me/" + number + "?text=" + url.QueryEscape(message)
}

func (service *orderService) listBranches(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	rows, err := service.pool.Query(r.Context(), `SELECT id, name, COALESCE(address,''),
		COALESCE(pickup_instructions,'') FROM branches WHERE is_active ORDER BY name, id`)
	if err != nil {
		serverError(w, "list pickup branches", err)
		return
	}
	defer rows.Close()
	branches := []pickupBranch{}
	for rows.Next() {
		var branch pickupBranch
		if err := rows.Scan(&branch.ID, &branch.Name, &branch.Address, &branch.Instructions); err != nil {
			serverError(w, "scan pickup branch", err)
			return
		}
		branches = append(branches, branch)
	}
	if err := rows.Err(); err != nil {
		serverError(w, "list pickup branches", err)
		return
	}
	writeJSON(w, http.StatusOK, branches)
}

func existingOrder(ctx context.Context, tx pgx.Tx, requestKey, fingerprint, legacyFingerprint string) (orderReceipt, bool, error) {
	var receipt orderReceipt
	var previousFingerprint, whatsAppNumber, message string
	err := tx.QueryRow(ctx, `SELECT id, status, total_minor, whatsapp_number,
		payment_method, payment_status, delivery_method, customer_access_token::text,
		whatsapp_message, COALESCE(request_fingerprint,'') FROM orders
		WHERE client_request_id=$1::uuid`, requestKey).Scan(&receipt.ID, &receipt.Status,
		&receipt.TotalMinor, &whatsAppNumber, &receipt.PaymentMethod, &receipt.PaymentStatus,
		&receipt.DeliveryMethod, &receipt.AccessToken, &message, &previousFingerprint)
	if errors.Is(err, pgx.ErrNoRows) {
		return receipt, false, nil
	}
	if err != nil {
		return receipt, false, err
	}
	if previousFingerprint != fingerprint &&
		!(receipt.PaymentMethod == "whatsapp" && legacyFingerprint != "" && previousFingerprint == legacyFingerprint) {
		return receipt, true, errOrderKeyReuse
	}
	receipt.Number = orderNumber(receipt.ID)
	receipt.WhatsAppURL = orderWhatsAppURL(whatsAppNumber, message)
	return receipt, true, nil
}

func formatOrderMoney(minor int64) string {
	return fmt.Sprintf("Bs %d,%02d", minor/100, minor%100)
}

func buildOrderMessage(id int64, input checkoutInput, branch pickupBranch, lines []orderLine, total int64) string {
	var parts []string
	if input.DeliveryMethod == "delivery" {
		parts = []string{
			"Hola, quiero coordinar el envío del pedido " + orderNumber(id) + ".",
			"Cliente: " + input.CustomerName,
			"Teléfono: " + input.CustomerPhone,
			"Entrega: envío a domicilio. Dirección y costo de envío por coordinar en este chat.",
			"Sucursal que despacha: " + branch.Name,
		}
	} else {
		parts = []string{
			"Hola, quiero coordinar el recojo del pedido " + orderNumber(id) + ".",
			"Cliente: " + input.CustomerName,
			"Teléfono: " + input.CustomerPhone,
			"Sucursal: " + branch.Name,
		}
		if branch.Address != "" {
			parts = append(parts, "Dirección: "+branch.Address)
		}
	}
	parts = append(parts, "Productos:")
	for _, line := range lines {
		parts = append(parts, fmt.Sprintf("- %d × %s · %s — %s", line.Quantity,
			line.ProductName, line.VariantLabel, formatOrderMoney(line.UnitPrice*line.Quantity)))
	}
	parts = append(parts, "Total: "+formatOrderMoney(total))
	if input.PaymentMethod == "qr" {
		parts = append(parts, "Pago: transferencia por QR; comprobante cargado o pendiente en el sistema. Verifica el abono en banca antes de confirmar.")
		if input.DeliveryMethod == "delivery" {
			parts = append(parts, "El pago por QR cubre solo los productos; el envío se cotiza aparte.")
		}
	}
	if input.CustomerNote != "" {
		parts = append(parts, "Nota: "+input.CustomerNote)
	}
	parts = append(parts, "El pedido está pendiente de confirmación.")
	return strings.Join(parts, "\n")
}

func (service *orderService) checkout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !service.admin.sameOrigin(r) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return
	}
	var input checkoutInput
	if !decodeJSON(w, r, &input, 16*1024) {
		return
	}
	if err := normalizeCheckout(&input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	fingerprint := checkoutFingerprint(input)
	legacyFingerprint := ""
	if input.PaymentMethod == "whatsapp" && input.DeliveryMethod == "pickup" {
		legacyFingerprint = legacyCheckoutFingerprint(input)
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin checkout", err)
		return
	}
	defer tx.Rollback(context.Background())
	if receipt, found, err := existingOrder(r.Context(), tx, input.RequestKey, fingerprint, legacyFingerprint); err != nil {
		if errors.Is(err, errOrderKeyReuse) {
			http.Error(w, err.Error(), http.StatusConflict)
		} else {
			serverError(w, "find existing order", err)
		}
		return
	} else if found {
		writeJSON(w, http.StatusOK, receipt)
		return
	}
	var branch pickupBranch
	err = tx.QueryRow(r.Context(), `SELECT id, name, COALESCE(address,''),
		COALESCE(pickup_instructions,'') FROM branches WHERE id=$1 AND is_active`,
		input.PickupBranchID).Scan(&branch.ID, &branch.Name, &branch.Address, &branch.Instructions)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "sucursal de recojo no disponible", http.StatusConflict)
		return
	}
	if err != nil {
		serverError(w, "find pickup branch", err)
		return
	}
	if input.PaymentMethod == "qr" {
		var available bool
		err = tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM business_profile b
			JOIN media m ON m.id=b.qr_media_id WHERE b.id=TRUE AND m.deleted_at IS NULL
			AND b.qr_expires_on >= (now() AT TIME ZONE 'America/La_Paz')::date)`).Scan(&available)
		if err != nil {
			serverError(w, "check active payment QR", err)
			return
		}
		if !available {
			http.Error(w, "el QR no está disponible; elige WhatsApp", http.StatusConflict)
			return
		}
	}
	lines := make([]orderLine, 0, len(input.Items))
	var total int64
	for _, item := range input.Items {
		var line orderLine
		var available int64
		err = tx.QueryRow(r.Context(), `SELECT v.id, p.name, v.sku,
			concat_ws(' / ', v.size_alpha, v.size_numeric) || ' · código ' || v.code,
			v.price_minor, COALESCE(s.quantity,0)
			FROM product_variants v JOIN products p ON p.id=v.product_id
			LEFT JOIN branch_stock s ON s.variant_id=v.id AND s.branch_id=$2
			WHERE v.id=$1 AND v.is_active AND v.deleted_at IS NULL
			AND p.status='active' AND p.deleted_at IS NULL FOR SHARE OF v, p`,
			item.VariantID, branch.ID).Scan(&line.VariantID, &line.ProductName,
			&line.SKU, &line.VariantLabel, &line.UnitPrice, &available)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "un producto del carrito ya no está disponible; actualiza el catálogo", http.StatusConflict)
			return
		}
		if err != nil {
			serverError(w, "validate checkout variant", err)
			return
		}
		if line.UnitPrice != item.ExpectedUnitPriceMinor {
			http.Error(w, "un precio cambió; actualiza el catálogo antes de pedir", http.StatusConflict)
			return
		}
		if available < item.Quantity {
			http.Error(w, "no hay unidades suficientes en la sucursal elegida", http.StatusConflict)
			return
		}
		line.Quantity = item.Quantity
		total += line.UnitPrice * line.Quantity
		if total > 1_000_000_000_000 {
			http.Error(w, "total del pedido demasiado alto", http.StatusBadRequest)
			return
		}
		lines = append(lines, line)
	}
	var id int64
	var accessToken string
	paymentStatus := "not_required"
	if input.PaymentMethod == "qr" {
		paymentStatus = "awaiting_receipt"
	}
	err = tx.QueryRow(r.Context(), `INSERT INTO orders
		(client_request_id, request_fingerprint, pickup_branch_id, pickup_branch_name,
		pickup_address, pickup_instructions, customer_name, customer_phone, customer_note,
		total_minor, whatsapp_number, whatsapp_message, payment_method, payment_status, delivery_method)
		VALUES ($1::uuid,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),$7,$8,NULLIF($9,''),
			$10,$11,'Pedido en preparación',$12,$13,$14)
		ON CONFLICT (client_request_id) DO NOTHING RETURNING id, customer_access_token::text`, input.RequestKey,
		fingerprint, branch.ID, branch.Name, branch.Address, branch.Instructions,
		input.CustomerName, input.CustomerPhone, input.CustomerNote, total,
		service.whatsAppNumber, input.PaymentMethod, paymentStatus, input.DeliveryMethod).Scan(&id, &accessToken)
	if errors.Is(err, pgx.ErrNoRows) {
		receipt, found, lookupErr := existingOrder(r.Context(), tx, input.RequestKey, fingerprint, legacyFingerprint)
		if lookupErr != nil {
			if errors.Is(lookupErr, errOrderKeyReuse) {
				http.Error(w, lookupErr.Error(), http.StatusConflict)
			} else {
				serverError(w, "recover existing order", lookupErr)
			}
			return
		}
		if found {
			writeJSON(w, http.StatusOK, receipt)
			return
		}
		http.Error(w, "no se pudo recuperar el pedido anterior", http.StatusConflict)
		return
	}
	if err != nil {
		serverError(w, "create order", err)
		return
	}
	for _, line := range lines {
		if _, err := tx.Exec(r.Context(), `INSERT INTO order_items
			(order_id, variant_id, product_name, sku, variant_label, unit_price_minor, quantity)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`, id, line.VariantID,
			line.ProductName, line.SKU, line.VariantLabel, line.UnitPrice, line.Quantity); err != nil {
			serverError(w, "create order line", err)
			return
		}
	}
	message := buildOrderMessage(id, input, branch, lines, total)
	if _, err := tx.Exec(r.Context(), `UPDATE orders SET whatsapp_message=$2 WHERE id=$1`, id, message); err != nil {
		serverError(w, "save order message", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit order", err)
		return
	}
	writeJSON(w, http.StatusCreated, orderReceipt{ID: id, Number: orderNumber(id),
		Status: "pending", TotalMinor: total,
		WhatsAppURL:   orderWhatsAppURL(service.whatsAppNumber, message),
		PaymentMethod: input.PaymentMethod, PaymentStatus: paymentStatus,
		DeliveryMethod: input.DeliveryMethod, AccessToken: accessToken})
}

func orderStockError(w http.ResponseWriter, operation string, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23514" {
			http.Error(w, "no hay unidades suficientes en la sucursal del pedido", http.StatusConflict)
			return
		}
		if pgErr.Code == "23505" {
			http.Error(w, "este pedido ya tiene una salida de inventario registrada", http.StatusConflict)
			return
		}
	}
	serverError(w, operation, err)
}
