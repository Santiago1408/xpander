package main

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The landing's suggestion box: customers ask for garments the store does not
// carry yet, and the owner reviews the list before buying new stock.
type suggestionService struct {
	pool    *pgxpool.Pool
	admin   *adminAuth
	limiter loginLimiter
}

type suggestion struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone"`
	Message   string    `json:"message"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

func registerSuggestionRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &suggestionService{pool: pool, admin: admin}
	mux.HandleFunc("POST /api/suggestions", service.create)
	mux.HandleFunc("GET /api/admin/suggestions", service.list)
	mux.HandleFunc("PATCH /api/admin/suggestions/{id}", service.changeStatus)
	mux.HandleFunc("DELETE /api/admin/suggestions/{id}", service.remove)
}

var bolivianMobilePattern = regexp.MustCompile(`^[67][0-9]{7}$`)

// bolivianMobile accepts an 8-digit mobile number with optional spaces or
// dashes, and drops a pasted +591 country code.
func bolivianMobile(raw string) (string, bool) {
	digits := strings.Map(func(char rune) rune {
		switch {
		case char >= '0' && char <= '9':
			return char
		case char == ' ' || char == '-' || char == '.' || char == '(' || char == ')' || char == '+':
			return -1
		}
		return 'x'
	}, raw)
	if len(digits) == 11 && strings.HasPrefix(digits, "591") {
		digits = digits[3:]
	}
	return digits, bolivianMobilePattern.MatchString(digits)
}

type suggestionInput struct {
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Message string `json:"message"`
	// Website is a field hidden from people; bots that fill it are ignored.
	Website string `json:"website"`
}

func normalizeSuggestion(input *suggestionInput) error {
	input.Name = strings.Join(strings.Fields(input.Name), " ")
	input.Message = strings.TrimSpace(input.Message)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 80 {
		return errors.New("escribe tu nombre (hasta 80 caracteres)")
	}
	phone, ok := bolivianMobile(input.Phone)
	if !ok {
		return errors.New("escribe un número de celular de 8 dígitos")
	}
	input.Phone = phone
	if utf8.RuneCountInString(input.Message) < 3 || utf8.RuneCountInString(input.Message) > 1000 {
		return errors.New("escribe qué prendas te gustaría encontrar (hasta 1000 caracteres)")
	}
	return nil
}

func (service *suggestionService) create(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !service.admin.sameOrigin(r) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return
	}
	var input suggestionInput
	if !decodeJSON(w, r, &input, 8*1024) {
		return
	}
	if input.Website != "" {
		w.WriteHeader(http.StatusCreated)
		return
	}
	if err := normalizeSuggestion(&input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !service.limiter.allow("ip:"+clientIP(r, service.admin.trustProxy), 5) {
		w.Header().Set("Retry-After", "900")
		http.Error(w, "recibimos varias sugerencias desde tu conexión; vuelve a intentarlo más tarde", http.StatusTooManyRequests)
		return
	}
	if _, err := service.pool.Exec(r.Context(), `INSERT INTO suggestions (customer_name, customer_phone, message)
		VALUES ($1, $2, $3)`, input.Name, input.Phone, input.Message); err != nil {
		serverError(w, "save suggestion", err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func (service *suggestionService) requireOwner(w http.ResponseWriter, r *http.Request) bool {
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

func (service *suggestionService) list(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	rows, err := service.pool.Query(r.Context(), `SELECT id, customer_name, customer_phone, message, status, created_at
		FROM suggestions ORDER BY status = 'done', created_at DESC LIMIT 1000`)
	if err != nil {
		serverError(w, "list suggestions", err)
		return
	}
	defer rows.Close()
	items := []suggestion{}
	for rows.Next() {
		var item suggestion
		if err := rows.Scan(&item.ID, &item.Name, &item.Phone, &item.Message, &item.Status, &item.CreatedAt); err != nil {
			serverError(w, "scan suggestion", err)
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		serverError(w, "list suggestions", err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (service *suggestionService) changeStatus(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &input, 1024) {
		return
	}
	if input.Status != "pending" && input.Status != "done" {
		http.Error(w, "estado inválido", http.StatusBadRequest)
		return
	}
	var found int64
	err := service.pool.QueryRow(r.Context(), `UPDATE suggestions SET status=$2, updated_at=now()
		WHERE id=$1 RETURNING id`, id, input.Status).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		serverError(w, "change suggestion status", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (service *suggestionService) remove(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r) {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var found int64
	err := service.pool.QueryRow(r.Context(), `DELETE FROM suggestions WHERE id=$1 RETURNING id`, id).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		serverError(w, "delete suggestion", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
