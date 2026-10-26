package main

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type inventoryBranch struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type inventoryVariant struct {
	ID    int64  `json:"id"`
	Label string `json:"label"`
}

type stockRow struct {
	BranchID  int64  `json:"branchId"`
	VariantID int64  `json:"variantId"`
	Label     string `json:"label"`
	Quantity  int64  `json:"quantity"`
}

type movementRow struct {
	ID            int64     `json:"id"`
	BranchName    string    `json:"branchName"`
	VariantLabel  string    `json:"variantLabel"`
	Kind          string    `json:"kind"`
	Delta         int64     `json:"delta"`
	UnitCostMinor *int64    `json:"unitCostMinor"`
	Note          string    `json:"note"`
	RecordedBy    string    `json:"recordedBy"`
	CreatedAt     time.Time `json:"createdAt"`
}

type inventoryResponse struct {
	Branches  []inventoryBranch  `json:"branches"`
	Variants  []inventoryVariant `json:"variants"`
	Stock     []stockRow         `json:"stock"`
	Movements []movementRow      `json:"movements"`
}

type inventoryService struct {
	pool  *pgxpool.Pool
	admin *adminAuth
}

func registerInventoryRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &inventoryService{pool: pool, admin: admin}
	mux.HandleFunc("GET /api/admin/inventory", service.list)
	mux.HandleFunc("POST /api/admin/inventory/movements", service.record)
}

func (service *inventoryService) requireOwner(w http.ResponseWriter, r *http.Request) (adminUser, bool) {
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

func (service *inventoryService) list(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.requireOwner(w, r); !ok {
		return
	}
	tx, err := service.pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		serverError(w, "begin inventory read", err)
		return
	}
	defer tx.Rollback(context.Background())
	result := inventoryResponse{Branches: []inventoryBranch{}, Variants: []inventoryVariant{},
		Stock: []stockRow{}, Movements: []movementRow{}}
	rows, err := tx.Query(r.Context(), `SELECT id, name FROM branches WHERE is_active ORDER BY name, id`)
	if err != nil {
		serverError(w, "list inventory branches", err)
		return
	}
	for rows.Next() {
		var item inventoryBranch
		if err := rows.Scan(&item.ID, &item.Name); err != nil {
			rows.Close()
			serverError(w, "scan inventory branch", err)
			return
		}
		result.Branches = append(result.Branches, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "list inventory branches", err)
		return
	}

	rows, err = tx.Query(r.Context(), `SELECT v.id, p.name || ' · ' || v.code || ' · ' || v.size_label
		FROM product_variants v JOIN products p ON p.id=v.product_id
		WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL
		ORDER BY p.name, v.sku`)
	if err != nil {
		serverError(w, "list inventory variants", err)
		return
	}
	for rows.Next() {
		var item inventoryVariant
		if err := rows.Scan(&item.ID, &item.Label); err != nil {
			rows.Close()
			serverError(w, "scan inventory variant", err)
			return
		}
		result.Variants = append(result.Variants, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "list inventory variants", err)
		return
	}

	rows, err = tx.Query(r.Context(), `SELECT s.branch_id, s.variant_id,
		b.name || ' · ' || p.name || ' · ' || v.code || ' · ' || v.size_label, s.quantity
		FROM branch_stock s JOIN branches b ON b.id=s.branch_id
		JOIN product_variants v ON v.id=s.variant_id JOIN products p ON p.id=v.product_id
		ORDER BY b.name, p.name, v.sku`)
	if err != nil {
		serverError(w, "list stock", err)
		return
	}
	for rows.Next() {
		var item stockRow
		if err := rows.Scan(&item.BranchID, &item.VariantID, &item.Label, &item.Quantity); err != nil {
			rows.Close()
			serverError(w, "scan stock", err)
			return
		}
		result.Stock = append(result.Stock, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "list stock", err)
		return
	}

	rows, err = tx.Query(r.Context(), `SELECT m.id, b.name, p.name || ' · ' || v.code || ' · ' || v.size_label,
		m.kind, m.delta, m.unit_cost_minor, COALESCE(m.note,''), COALESCE(u.username,''), m.created_at
		FROM stock_movements m JOIN branches b ON b.id=m.branch_id
		JOIN product_variants v ON v.id=m.variant_id JOIN products p ON p.id=v.product_id
		LEFT JOIN users u ON u.id=m.recorded_by_user_id
		ORDER BY m.created_at DESC, m.id DESC LIMIT 100`)
	if err != nil {
		serverError(w, "list stock movements", err)
		return
	}
	for rows.Next() {
		var item movementRow
		if err := rows.Scan(&item.ID, &item.BranchName, &item.VariantLabel, &item.Kind,
			&item.Delta, &item.UnitCostMinor, &item.Note, &item.RecordedBy, &item.CreatedAt); err != nil {
			rows.Close()
			serverError(w, "scan stock movement", err)
			return
		}
		result.Movements = append(result.Movements, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		serverError(w, "list stock movements", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit inventory read", err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

type movementInput struct {
	RequestKey    string `json:"requestKey"`
	BranchID      int64  `json:"branchId"`
	VariantID     int64  `json:"variantId"`
	Kind          string `json:"kind"`
	Delta         int64  `json:"delta"`
	UnitCostMinor *int64 `json:"unitCostMinor"`
	Note          string `json:"note"`
}

var stockRequestKeyPattern = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

func validateMovement(input movementInput) error {
	if !stockRequestKeyPattern.MatchString(input.RequestKey) ||
		input.BranchID <= 0 || input.VariantID <= 0 || input.Delta == 0 ||
		input.Delta < -1_000_000 || input.Delta > 1_000_000 || len(input.Note) > 500 {
		return errors.New("movimiento inválido")
	}
	if input.Kind == "purchase" && input.Delta > 0 && input.UnitCostMinor != nil &&
		*input.UnitCostMinor >= 0 && *input.UnitCostMinor <= 1_000_000_000 {
		return nil
	}
	if input.Kind == "adjustment" && input.UnitCostMinor == nil && strings.TrimSpace(input.Note) != "" {
		return nil
	}
	return errors.New("la entrada necesita cantidad positiva y costo; el ajuste necesita motivo")
}

func (service *inventoryService) record(w http.ResponseWriter, r *http.Request) {
	user, ok := service.requireOwner(w, r)
	if !ok {
		return
	}
	var input movementInput
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.Note = strings.TrimSpace(input.Note)
	if err := validateMovement(input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin stock movement", err)
		return
	}
	defer tx.Rollback(context.Background())
	var valid bool
	err = tx.QueryRow(r.Context(), `SELECT EXISTS (
		SELECT 1 FROM branches b CROSS JOIN product_variants v
		JOIN products p ON p.id=v.product_id
		WHERE b.id=$1 AND b.is_active AND v.id=$2 AND v.deleted_at IS NULL AND p.deleted_at IS NULL)`,
		input.BranchID, input.VariantID).Scan(&valid)
	if err != nil {
		serverError(w, "validate stock target", err)
		return
	}
	if !valid {
		http.Error(w, "sucursal o variante inexistente o en papelera", http.StatusBadRequest)
		return
	}
	var id int64
	err = tx.QueryRow(r.Context(), `INSERT INTO stock_movements
		(branch_id, variant_id, kind, delta, unit_cost_minor, recorded_by_user_id, note, request_key)
		VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),$8::uuid)
		ON CONFLICT DO NOTHING RETURNING id`, input.BranchID,
		input.VariantID, input.Kind, input.Delta, input.UnitCostMinor, user.ID, input.Note, input.RequestKey).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		var previous movementInput
		var actorID int64
		err = tx.QueryRow(r.Context(), `SELECT id, branch_id, variant_id, kind, delta,
			unit_cost_minor, COALESCE(note,''), COALESCE(recorded_by_user_id,0)
			FROM stock_movements WHERE request_key=$1::uuid`, input.RequestKey).Scan(&id,
			&previous.BranchID, &previous.VariantID, &previous.Kind, &previous.Delta,
			&previous.UnitCostMinor, &previous.Note, &actorID)
		if err != nil {
			serverError(w, "find retried stock movement", err)
			return
		}
		if actorID != user.ID || previous.BranchID != input.BranchID ||
			previous.VariantID != input.VariantID || previous.Kind != input.Kind ||
			previous.Delta != input.Delta || previous.Note != input.Note ||
			!sameMinorAmount(previous.UnitCostMinor, input.UnitCostMinor) {
			http.Error(w, "clave de solicitud reutilizada para otro movimiento", http.StatusConflict)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			serverError(w, "commit retried stock movement", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int64{"id": id})
		return
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23514" {
			http.Error(w, "saldo insuficiente o valores inválidos", http.StatusConflict)
			return
		}
		vocabularyDBError(w, "record stock movement", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit stock movement", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func sameMinorAmount(a, b *int64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
