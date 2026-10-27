package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"xpander/api/internal/auth"
)

type fakeAuthStore struct {
	user    adminUser
	session []byte
	revoked bool
}

func (store *fakeAuthStore) findUser(_ context.Context, username string) (adminUser, error) {
	if username != store.user.Username {
		return adminUser{}, pgx.ErrNoRows
	}
	return store.user, nil
}

func (store *fakeAuthStore) createSession(_ context.Context, _ int64, tokenHash []byte, _ time.Time) error {
	store.session = tokenHash
	return nil
}

func (store *fakeAuthStore) findSession(_ context.Context, tokenHash []byte) (adminUser, error) {
	if store.revoked || !bytes.Equal(store.session, tokenHash) {
		return adminUser{}, pgx.ErrNoRows
	}
	return store.user, nil
}

func (store *fakeAuthStore) revokeSession(_ context.Context, _ []byte) error {
	store.revoked = true
	return nil
}

func TestAdminLoginSessionLogout(t *testing.T) {
	passwordHash, err := auth.HashPassword("clave privada larga 123")
	if err != nil {
		t.Fatal(err)
	}
	store := &fakeAuthStore{user: adminUser{
		ID: 1, Username: "propietario", DisplayName: "Propietario", Role: "owner",
		PasswordHash: passwordHash, Active: true,
	}}
	mux := http.NewServeMux()
	registerAdminAuth(mux, store, "http://localhost:3000", false)

	login := httptest.NewRequest(http.MethodPost, "/api/admin/login",
		bytes.NewBufferString(`{"username":"propietario","password":"clave privada larga 123"}`))
	login.Header.Set("Origin", "http://localhost:3000")
	login.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, login)
	if response.Code != http.StatusOK {
		t.Fatalf("login status = %d: %s", response.Code, response.Body.String())
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatal("session cookie is missing required attributes")
	}

	me := httptest.NewRequest(http.MethodGet, "/api/admin/me", nil)
	me.AddCookie(cookies[0])
	response = httptest.NewRecorder()
	mux.ServeHTTP(response, me)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"username":"propietario"`)) {
		t.Fatalf("session lookup status = %d: %s", response.Code, response.Body.String())
	}

	logout := httptest.NewRequest(http.MethodPost, "/api/admin/logout", nil)
	logout.Header.Set("Origin", "http://localhost:3000")
	logout.AddCookie(cookies[0])
	response = httptest.NewRecorder()
	mux.ServeHTTP(response, logout)
	if response.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d", response.Code)
	}
	response = httptest.NewRecorder()
	mux.ServeHTTP(response, me)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session status = %d", response.Code)
	}
}

func TestAdminLoginRejectsOtherOrigin(t *testing.T) {
	mux := http.NewServeMux()
	registerAdminAuth(mux, &fakeAuthStore{}, "http://localhost:3000", false)
	request := httptest.NewRequest(http.MethodPost, "/api/admin/login", bytes.NewBufferString(`{}`))
	request.Header.Set("Origin", "https://example.com")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("cross-origin login status = %d", response.Code)
	}
}

func TestClientIPBehindProxy(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/admin/login", nil)
	request.RemoteAddr = "172.18.0.5:41000"
	request.Header.Add("X-Forwarded-For", "6.6.6.6, 190.129.10.20")
	if got := clientIP(request, false); got != "172.18.0.5" {
		t.Fatalf("without trusted proxy: %s", got)
	}
	if got := clientIP(request, true); got != "190.129.10.20" {
		t.Fatalf("behind proxy: %s (the visitor-supplied entry must be ignored)", got)
	}
	request.Header.Set("X-Forwarded-For", "not-an-ip")
	if got := clientIP(request, true); got != "172.18.0.5" {
		t.Fatalf("invalid header: %s", got)
	}
}
