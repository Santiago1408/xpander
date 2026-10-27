package main

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"xpander/api/internal/auth"
)

// The signed-in administrator edits their own name, username and password.
// Every change requires the current password and shares the login rate limit.
type accountService struct {
	pool  *pgxpool.Pool
	admin *adminAuth
}

func registerAccountRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &accountService{pool: pool, admin: admin}
	mux.HandleFunc("PUT /api/admin/account", service.updateProfile)
	mux.HandleFunc("PUT /api/admin/account/password", service.updatePassword)
}

func (service *accountService) authorize(w http.ResponseWriter, r *http.Request, currentPassword string) (adminUser, bool) {
	w.Header().Set("Cache-Control", "no-store")
	if !service.admin.sameOrigin(r) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return adminUser{}, false
	}
	user, ok := service.admin.currentUser(w, r)
	if !ok {
		return adminUser{}, false
	}
	key := fmt.Sprintf("account:%d", user.ID)
	if !service.admin.limiter.allow(key, 10) {
		w.Header().Set("Retry-After", "900")
		http.Error(w, "demasiados intentos; vuelve más tarde", http.StatusTooManyRequests)
		return adminUser{}, false
	}
	var hash string
	if err := service.pool.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1 AND is_active`, user.ID).Scan(&hash); err != nil {
		serverError(w, "read account password", err)
		return adminUser{}, false
	}
	if len(currentPassword) > 1024 || !auth.VerifyPassword(currentPassword, hash) {
		http.Error(w, "la contraseña actual no es correcta", http.StatusForbidden)
		return adminUser{}, false
	}
	service.admin.limiter.clear(key)
	return user, true
}

func validDisplayName(value string) bool {
	return value != "" && len(value) <= 120
}

func (service *accountService) updateProfile(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DisplayName     string `json:"displayName"`
		Username        string `json:"username"`
		CurrentPassword string `json:"currentPassword"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	input.DisplayName = strings.Join(strings.Fields(input.DisplayName), " ")
	input.Username = strings.ToLower(strings.TrimSpace(input.Username))
	if !validDisplayName(input.DisplayName) || !auth.ValidUsername(input.Username) {
		http.Error(w, "nombre visible o nombre de usuario inválido", http.StatusBadRequest)
		return
	}
	user, ok := service.authorize(w, r, input.CurrentPassword)
	if !ok {
		return
	}
	var updated adminUser
	err := service.pool.QueryRow(r.Context(), `UPDATE users SET display_name=$2, username=$3, updated_at=now()
		WHERE id=$1 RETURNING username, display_name, role`, user.ID, input.DisplayName, input.Username).
		Scan(&updated.Username, &updated.DisplayName, &updated.Role)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		http.Error(w, "ese nombre de usuario ya está en uso", http.StatusConflict)
		return
	}
	if err != nil {
		serverError(w, "update account", err)
		return
	}
	writeUser(w, updated)
}

func (service *accountService) updatePassword(w http.ResponseWriter, r *http.Request) {
	var input struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !decodeJSON(w, r, &input, 4096) {
		return
	}
	hash, err := auth.HashPassword(input.NewPassword)
	if errors.Is(err, auth.ErrPasswordLength) {
		http.Error(w, "la nueva contraseña debe tener más de 6 caracteres", http.StatusBadRequest)
		return
	}
	if err != nil {
		serverError(w, "hash new password", err)
		return
	}
	user, ok := service.authorize(w, r, input.CurrentPassword)
	if !ok {
		return
	}
	cookie, _ := r.Cookie(sessionCookieName)
	currentHash, _ := auth.HashSessionToken(cookie.Value)
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin password change", err)
		return
	}
	defer tx.Rollback(r.Context())
	if _, err := tx.Exec(r.Context(), `UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1`, user.ID, hash); err != nil {
		serverError(w, "update password", err)
		return
	}
	// Other devices must sign in again with the new password.
	if _, err := tx.Exec(r.Context(), `UPDATE user_sessions SET revoked_at=now()
		WHERE user_id=$1 AND revoked_at IS NULL AND token_hash <> $2`, user.ID, currentHash); err != nil {
		serverError(w, "revoke other sessions", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
		serverError(w, "commit password change", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
