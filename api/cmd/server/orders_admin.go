package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

type adminOrderItem struct {
	ProductName  string `json:"productName"`
	VariantLabel string `json:"variantLabel"`
	UnitPrice    int64  `json:"unitPriceMinor"`
	Quantity     int64  `json:"quantity"`
	LineTotal    int64  `json:"lineTotalMinor"`
}

type adminOrder struct {
	ID               int64            `json:"id"`
	Number           string           `json:"number"`
	Status           string           `json:"status"`
	CustomerName     string           `json:"customerName"`
	CustomerPhone    string           `json:"customerPhone"`
	CustomerNote     string           `json:"customerNote"`
	PickupBranchName string           `json:"pickupBranchName"`
	PickupAddress    string           `json:"pickupAddress"`
	TotalMinor       int64            `json:"totalMinor"`
	CreatedAt        time.Time        `json:"createdAt"`
	ConfirmedAt      *time.Time       `json:"confirmedAt"`
	PaymentMethod    string           `json:"paymentMethod"`
	PaymentStatus    string           `json:"paymentStatus"`
	HasReceipt       bool             `json:"hasReceipt"`
	Items            []adminOrderItem `json:"items"`
}

func (service *orderService) requireOwner(w http.ResponseWriter, r *http.Request) (adminUser, bool) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet && !service.admin.sameOrigin(r) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return adminUser{}, false
	}
	user, ok := service.admin.currentUser(w, r)
	if !ok {
		return adminUser{}, false
	}
	if user.Role != "owner" {
		http.Error(w, "permiso insuficiente", http.StatusForbidden)
		return adminUser{}, false
	}
	return user, true
}

func (service *orderService) listAdmin(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.requireOwner(w, r); !ok {
		return
	}
	tx, err := service.pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		serverError(w, "begin order list", err)
		return
	}
	defer tx.Rollback(context.Background())
	rows, err := tx.Query(r.Context(), `SELECT id, status, customer_name, customer_phone,
		COALESCE(customer_note,''), pickup_branch_name, COALESCE(pickup_address,''),
		total_minor, created_at, confirmed_at, payment_method, payment_status,
		EXISTS (SELECT 1 FROM order_payment_proofs op WHERE op.order_id=orders.id)
		FROM orders ORDER BY created_at DESC, id DESC LIMIT 100`)
	if err != nil {
		serverError(w, "list orders", err)
		return
	}
	orders := []adminOrder{}
	ids := []int64{}
	indexes := map[int64]int{}
	for rows.Next() {
		var item adminOrder
		if err := rows.Scan(&item.ID, &item.Status, &item.CustomerName,
			&item.CustomerPhone, &item.CustomerNote, &item.PickupBranchName,
			&item.PickupAddress, &item.TotalMinor,
			&item.CreatedAt, &item.ConfirmedAt, &item.PaymentMethod,
			&item.PaymentStatus, &item.HasReceipt); err != nil {
			rows.Close()
			serverError(w, "scan order", err)
			return
		}
		item.Number = orderNumber(item.ID)
		item.Items = []adminOrderItem{}
		indexes[item.ID] = len(orders)
		ids = append(ids, item.ID)
		orders = append(orders, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "list orders", err)
		return
	}
	if len(ids) > 0 {
		rows, err = tx.Query(r.Context(), `SELECT order_id, product_name,
			COALESCE(variant_label,''), unit_price_minor, quantity, line_total_minor
			FROM order_items WHERE order_id=ANY($1) ORDER BY order_id, id`, ids)
		if err != nil {
			serverError(w, "list order items", err)
			return
		}
		for rows.Next() {
			var orderID int64
			var item adminOrderItem
			if err := rows.Scan(&orderID, &item.ProductName, &item.VariantLabel,
				&item.UnitPrice, &item.Quantity, &item.LineTotal); err != nil {
				rows.Close()
				serverError(w, "scan order item", err)
				return
			}
			orders[indexes[orderID]].Items = append(orders[indexes[orderID]].Items, item)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			serverError(w, "list order items", err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit order list", err)
		return
	}
	writeJSON(w, http.StatusOK, orders)
}

func (service *orderService) confirm(w http.ResponseWriter, r *http.Request) {
	user, ok := service.requireOwner(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin order confirmation", err)
		return
	}
	defer tx.Rollback(context.Background())
	var status, paymentMethod, paymentStatus string
	var branchID int64
	err = tx.QueryRow(r.Context(), `SELECT status, pickup_branch_id, payment_method, payment_status FROM orders
		WHERE id=$1 FOR UPDATE`, id).Scan(&status, &branchID, &paymentMethod, &paymentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		serverError(w, "find order", err)
		return
	}
	if status == "confirmed" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if status != "pending" {
		http.Error(w, "el pedido no está pendiente", http.StatusConflict)
		return
	}
	if paymentMethod == "qr" && paymentStatus != "verified" {
		http.Error(w, "verifica el abono bancario antes de confirmar el pedido con QR", http.StatusConflict)
		return
	}
	rows, err := tx.Query(r.Context(), `SELECT id, COALESCE(variant_id,0), quantity
		FROM order_items WHERE order_id=$1 ORDER BY id`, id)
	if err != nil {
		serverError(w, "load order items", err)
		return
	}
	type saleItem struct{ id, variantID, quantity int64 }
	items := []saleItem{}
	for rows.Next() {
		var item saleItem
		if err := rows.Scan(&item.id, &item.variantID, &item.quantity); err != nil {
			rows.Close()
			serverError(w, "scan order item", err)
			return
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "load order items", err)
		return
	}
	if len(items) == 0 {
		http.Error(w, "pedido sin productos", http.StatusConflict)
		return
	}
	for _, item := range items {
		if item.variantID == 0 {
			http.Error(w, "una variante del pedido ya no existe", http.StatusConflict)
			return
		}
		_, err := tx.Exec(r.Context(), `INSERT INTO stock_movements
			(branch_id, variant_id, kind, delta, order_item_id, recorded_by_user_id, note)
			VALUES ($1,$2,'sale',$3,$4,$5,$6)`, branchID, item.variantID,
			-item.quantity, item.id, user.ID, fmt.Sprintf("Confirmación de %s", orderNumber(id)))
		if err != nil {
			orderStockError(w, "debit confirmed order", err)
			return
		}
	}
	if _, err := tx.Exec(r.Context(), `UPDATE orders SET status='confirmed',
		confirmed_at=now(), confirmed_by_user_id=$2, updated_at=now()
		WHERE id=$1`, id, user.ID); err != nil {
		serverError(w, "confirm order", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		orderStockError(w, "commit order confirmation", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
