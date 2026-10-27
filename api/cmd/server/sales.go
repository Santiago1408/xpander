package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Counter sales registered by the owner at a branch. Each one is stored as a
// confirmed order of the "store" channel and debits stock in the same
// transaction, so it appears in Pedidos, inventory movements and sales totals.
type saleItem struct {
	VariantID int64 `json:"variantId"`
	Quantity  int64 `json:"quantity"`
}

type saleInput struct {
	RequestKey    string     `json:"requestKey"`
	BranchID      int64      `json:"branchId"`
	PaymentMethod string     `json:"paymentMethod"`
	CustomerName  string     `json:"customerName"`
	CustomerPhone string     `json:"customerPhone"`
	Note          string     `json:"note"`
	DiscountMinor int64      `json:"discountMinor"`
	Items         []saleItem `json:"items"`
}

var salePaymentMethods = map[string]string{"cash": "cash", "card": "card", "qr": "store_qr"}

func normalizeSale(input *saleInput) error {
	input.CustomerName = strings.Join(strings.Fields(input.CustomerName), " ")
	input.CustomerPhone = strings.TrimSpace(input.CustomerPhone)
	input.Note = strings.TrimSpace(input.Note)
	if !stockRequestKeyPattern.MatchString(input.RequestKey) || input.BranchID <= 0 ||
		salePaymentMethods[input.PaymentMethod] == "" || len(input.CustomerName) > 120 ||
		len(input.CustomerPhone) > 25 || len(input.Note) > 500 ||
		input.DiscountMinor < 0 || input.DiscountMinor > 1_000_000_000 ||
		len(input.Items) == 0 || len(input.Items) > 50 {
		return errors.New("venta incompleta o inválida")
	}
	seen := map[int64]bool{}
	for _, item := range input.Items {
		if item.VariantID <= 0 || seen[item.VariantID] || item.Quantity < 1 || item.Quantity > 100 {
			return errors.New("producto o cantidad inválida en la venta")
		}
		seen[item.VariantID] = true
	}
	sort.Slice(input.Items, func(i, j int) bool { return input.Items[i].VariantID < input.Items[j].VariantID })
	if input.CustomerName == "" {
		input.CustomerName = "Cliente en tienda"
	}
	if input.CustomerPhone == "" {
		input.CustomerPhone = "Sin registrar"
	}
	return nil
}

func saleFingerprint(input saleInput) string {
	encoded, _ := json.Marshal(struct {
		Channel string `json:"channel"`
		saleInput
	}{"store", input})
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func saleSummary(id int64, branch string, method string, lines []orderLine, discount, total int64) string {
	parts := []string{"Venta en tienda " + orderNumber(id) + " · " + branch}
	for _, line := range lines {
		parts = append(parts, fmt.Sprintf("- %d × %s · %s — %s", line.Quantity, line.ProductName, line.VariantLabel,
			formatOrderMoney(line.UnitPrice*line.Quantity)))
	}
	if discount > 0 {
		parts = append(parts, "Descuento: "+formatOrderMoney(discount))
	}
	parts = append(parts, "Total: "+formatOrderMoney(total), "Pago: "+map[string]string{"cash": "efectivo", "card": "tarjeta", "store_qr": "QR en tienda"}[method])
	return strings.Join(parts, "\n")
}

func (service *orderService) createSale(w http.ResponseWriter, r *http.Request) {
	user, ok := service.requireOwner(w, r)
	if !ok {
		return
	}
	var input saleInput
	if !decodeJSON(w, r, &input, 16*1024) {
		return
	}
	if err := normalizeSale(&input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	fingerprint := saleFingerprint(input)
	method := salePaymentMethods[input.PaymentMethod]
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin store sale", err)
		return
	}
	defer tx.Rollback(context.Background())

	// A retried request returns the sale it already created.
	var previousID, previousTotal int64
	var previousFingerprint string
	err = tx.QueryRow(r.Context(), `SELECT id, total_minor, COALESCE(request_fingerprint,'') FROM orders
		WHERE client_request_id=$1::uuid`, input.RequestKey).Scan(&previousID, &previousTotal, &previousFingerprint)
	if err == nil {
		if previousFingerprint != fingerprint {
			http.Error(w, errOrderKeyReuse.Error(), http.StatusConflict)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": previousID, "number": orderNumber(previousID), "totalMinor": previousTotal})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		serverError(w, "find retried sale", err)
		return
	}

	var branch pickupBranch
	err = tx.QueryRow(r.Context(), `SELECT id, name, COALESCE(address,'') FROM branches WHERE id=$1 AND is_active`,
		input.BranchID).Scan(&branch.ID, &branch.Name, &branch.Address)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "sucursal inactiva o inexistente", http.StatusBadRequest)
		return
	}
	if err != nil {
		serverError(w, "find sale branch", err)
		return
	}
	lines := make([]orderLine, 0, len(input.Items))
	var subtotal int64
	for _, item := range input.Items {
		// Any registered size can be sold at the counter, published or not.
		line := orderLine{Quantity: item.Quantity}
		err = tx.QueryRow(r.Context(), `SELECT v.id, p.name, v.sku,
			concat_ws(' / ', v.size_alpha, v.size_numeric) || ' · código ' || v.code, v.price_minor
			FROM product_variants v JOIN products p ON p.id=v.product_id
			WHERE v.id=$1 AND v.deleted_at IS NULL AND p.deleted_at IS NULL FOR SHARE OF v, p`, item.VariantID).
			Scan(&line.VariantID, &line.ProductName, &line.SKU, &line.VariantLabel, &line.UnitPrice)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "un producto de la venta ya no existe", http.StatusConflict)
			return
		}
		if err != nil {
			serverError(w, "find sale variant", err)
			return
		}
		subtotal += line.UnitPrice * line.Quantity
		lines = append(lines, line)
	}
	if input.DiscountMinor > subtotal {
		http.Error(w, "el descuento no puede superar el subtotal", http.StatusBadRequest)
		return
	}
	total := subtotal - input.DiscountMinor
	var id int64
	err = tx.QueryRow(r.Context(), `INSERT INTO orders
		(client_request_id, request_fingerprint, pickup_branch_id, pickup_branch_name, pickup_address,
		customer_name, customer_phone, customer_note, status, total_minor, discount_minor,
		whatsapp_number, whatsapp_message, payment_method, payment_status, channel, confirmed_at, confirmed_by_user_id)
		VALUES ($1::uuid,$2,$3,$4,NULLIF($5,''),$6,$7,NULLIF($8,''),'confirmed',$9,$10,$11,'Venta en tienda',$12,'verified','store',now(),$13)
		RETURNING id`, input.RequestKey, fingerprint, branch.ID, branch.Name, branch.Address,
		input.CustomerName, input.CustomerPhone, input.Note, total, input.DiscountMinor,
		service.whatsAppNumber, method, user.ID).Scan(&id)
	if err != nil {
		serverError(w, "create store sale", err)
		return
	}
	for _, line := range lines {
		var itemID int64
		if err := tx.QueryRow(r.Context(), `INSERT INTO order_items
			(order_id, variant_id, product_name, sku, variant_label, unit_price_minor, quantity)
			VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, id, line.VariantID, line.ProductName, line.SKU,
			line.VariantLabel, line.UnitPrice, line.Quantity).Scan(&itemID); err != nil {
			serverError(w, "create sale line", err)
			return
		}
		if _, err := tx.Exec(r.Context(), `INSERT INTO stock_movements
			(branch_id, variant_id, kind, delta, order_item_id, recorded_by_user_id, note)
			VALUES ($1,$2,'sale',$3,$4,$5,$6)`, branch.ID, line.VariantID, -line.Quantity, itemID, user.ID,
			"Venta en tienda "+orderNumber(id)); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23514" {
				http.Error(w, fmt.Sprintf("no hay unidades suficientes de %s (%s) en %s", line.ProductName,
					strings.Split(line.VariantLabel, " · ")[0], branch.Name), http.StatusConflict)
				return
			}
			serverError(w, "debit store sale", err)
			return
		}
	}
	if _, err := tx.Exec(r.Context(), `UPDATE orders SET whatsapp_message=$2 WHERE id=$1`, id,
		saleSummary(id, branch.Name, method, lines, input.DiscountMinor, total)); err != nil {
		serverError(w, "save sale summary", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		orderStockError(w, "commit store sale", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "number": orderNumber(id), "totalMinor": total})
}
