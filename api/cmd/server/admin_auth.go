package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"xpander/api/internal/auth"
)

const (
	sessionCookieName = "xpander_session"
	sessionLifetime   = 12 * time.Hour
)

type adminUser struct {
	ID           int64  `json:"-"`
	Username     string `json:"username"`
	DisplayName  string `json:"displayName"`
	Role         string `json:"role"`
	PasswordHash string `json:"-"`
	Active       bool   `json:"-"`
}

type authStore interface {
	findUser(context.Context, string) (adminUser, error)
	createSession(context.Context, int64, []byte, time.Time) error
	findSession(context.Context, []byte) (adminUser, error)
	revokeSession(context.Context, []byte) error
}

type databaseAuthStore struct{ pool *pgxpool.Pool }

func (store databaseAuthStore) findUser(ctx context.Context, username string) (adminUser, error) {
	var user adminUser
	err := store.pool.QueryRow(ctx, `SELECT id, username, display_name, role, password_hash, is_active
		FROM users WHERE username = $1`, username).Scan(
		&user.ID, &user.Username, &user.DisplayName, &user.Role, &user.PasswordHash, &user.Active,
	)
	return user, err
}

func (store databaseAuthStore) createSession(ctx context.Context, userID int64, tokenHash []byte, expires time.Time) error {
	_, err := store.pool.Exec(ctx, `INSERT INTO user_sessions (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)`, userID, tokenHash, expires)
	return err
}

func (store databaseAuthStore) findSession(ctx context.Context, tokenHash []byte) (adminUser, error) {
	var user adminUser
	err := store.pool.QueryRow(ctx, `SELECT u.id, u.username, u.display_name, u.role
		FROM user_sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
		AND u.is_active`, tokenHash).Scan(&user.ID, &user.Username, &user.DisplayName, &user.Role)
	return user, err
}

func (store databaseAuthStore) revokeSession(ctx context.Context, tokenHash []byte) error {
	_, err := store.pool.Exec(ctx, `UPDATE user_sessions SET revoked_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL`, tokenHash)
	return err
}

type attemptWindow struct {
	count   int
	expires time.Time
}

type loginLimiter struct {
	mu       sync.Mutex
	attempts map[string]attemptWindow
}

func (limiter *loginLimiter) allow(key string, limit int) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	if limiter.attempts == nil {
		limiter.attempts = make(map[string]attemptWindow)
	}
	now := time.Now()
	if len(limiter.attempts) > 10000 {
		for k, value := range limiter.attempts {
			if now.After(value.expires) {
				delete(limiter.attempts, k)
			}
		}
	}
	if len(limiter.attempts) >= 10000 {
		if _, exists := limiter.attempts[key]; !exists {
			return false
		}
	}
	value := limiter.attempts[key]
	if now.After(value.expires) {
		value = attemptWindow{expires: now.Add(15 * time.Minute)}
	}
	if value.count >= limit {
		return false
	}
	value.count++
	limiter.attempts[key] = value
	return true
}

func (limiter *loginLimiter) clear(key string) {
	limiter.mu.Lock()
	delete(limiter.attempts, key)
	limiter.mu.Unlock()
}

type adminAuth struct {
	store         authStore
	publicOrigin  string
	secureCookies bool
	limiter       loginLimiter
}

func registerAdminAuth(mux *http.ServeMux, store authStore, publicOrigin string, secureCookies bool) *adminAuth {
	controller := &adminAuth{store: store, publicOrigin: publicOrigin, secureCookies: secureCookies}
	mux.HandleFunc("POST /api/admin/login", controller.login)
	mux.HandleFunc("GET /api/admin/me", controller.me)
	mux.HandleFunc("POST /api/admin/logout", controller.logout)
	return controller
}

func (controller *adminAuth) sameOrigin(r *http.Request) bool {
	return r.Header.Get("Origin") == controller.publicOrigin
}

func (controller *adminAuth) login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !controller.sameOrigin(r) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		http.Error(w, "se requiere JSON", http.StatusUnsupportedMediaType)
		return
	}
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		http.Error(w, "solicitud inválida", http.StatusBadRequest)
		return
	}
	input.Username = strings.ToLower(strings.TrimSpace(input.Username))
	if !auth.ValidUsername(input.Username) || len(input.Password) > 1024 {
		http.Error(w, "credenciales incorrectas", http.StatusUnauthorized)
		return
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	ipKey := "ip:" + ip
	userKey := "user:" + input.Username
	if !controller.limiter.allow(ipKey, 100) || !controller.limiter.allow(userKey, 10) {
		w.Header().Set("Retry-After", "900")
		http.Error(w, "demasiados intentos; vuelve más tarde", http.StatusTooManyRequests)
		return
	}
	user, err := controller.store.findUser(r.Context(), input.Username)
	if errors.Is(err, pgx.ErrNoRows) {
		auth.DummyPasswordWork(input.Password)
		http.Error(w, "credenciales incorrectas", http.StatusUnauthorized)
		return
	}
	if err != nil {
		slog.Error("login lookup failed", "error", err)
		http.Error(w, "error del servidor", http.StatusInternalServerError)
		return
	}
	if !user.Active || !auth.VerifyPassword(input.Password, user.PasswordHash) {
		http.Error(w, "credenciales incorrectas", http.StatusUnauthorized)
		return
	}
	token, tokenHash, err := auth.NewSessionToken()
	if err != nil {
		slog.Error("session token generation failed", "error", err)
		http.Error(w, "error del servidor", http.StatusInternalServerError)
		return
	}
	if err := controller.store.createSession(r.Context(), user.ID, tokenHash, time.Now().Add(sessionLifetime)); err != nil {
		slog.Error("session creation failed", "error", err)
		http.Error(w, "error del servidor", http.StatusInternalServerError)
		return
	}
	controller.limiter.clear(userKey)
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookieName, Value: token, Path: "/", HttpOnly: true,
		Secure: controller.secureCookies, SameSite: http.SameSiteLaxMode,
		MaxAge: int(sessionLifetime.Seconds()),
	})
	writeUser(w, user)
}

func (controller *adminAuth) me(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	user, ok := controller.currentUser(w, r)
	if !ok {
		return
	}
	writeUser(w, user)
}

func (controller *adminAuth) logout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !controller.sameOrigin(r) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return
	}
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		if tokenHash, ok := auth.HashSessionToken(cookie.Value); ok {
			if err := controller.store.revokeSession(r.Context(), tokenHash); err != nil {
				slog.Error("session revocation failed", "error", err)
				http.Error(w, "error del servidor", http.StatusInternalServerError)
				return
			}
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookieName, Path: "/", HttpOnly: true,
		Secure: controller.secureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (controller *adminAuth) currentUser(w http.ResponseWriter, r *http.Request) (adminUser, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		http.Error(w, "no autorizado", http.StatusUnauthorized)
		return adminUser{}, false
	}
	tokenHash, ok := auth.HashSessionToken(cookie.Value)
	if !ok {
		http.Error(w, "no autorizado", http.StatusUnauthorized)
		return adminUser{}, false
	}
	user, err := controller.store.findSession(r.Context(), tokenHash)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "no autorizado", http.StatusUnauthorized)
		return adminUser{}, false
	}
	if err != nil {
		slog.Error("session lookup failed", "error", err)
		http.Error(w, "error del servidor", http.StatusInternalServerError)
		return adminUser{}, false
	}
	return user, true
}

func writeUser(w http.ResponseWriter, user adminUser) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(user)
}
