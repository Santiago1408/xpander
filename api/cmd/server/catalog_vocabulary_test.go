package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"xpander/api/internal/auth"
)

func TestVocabularyValidation(t *testing.T) {
	if !vocabularyCodePattern.MatchString("ropa-deportiva") ||
		vocabularyCodePattern.MatchString("Ropa Deportiva") ||
		vocabularyCodePattern.MatchString("1categoria") {
		t.Fatal("vocabulary identifier validation failed")
	}
	if !validOption("Azul", "#1a2B3c") || validOption("Azul", "red") || validOption("", "") {
		t.Fatal("option validation failed")
	}
}

func TestVocabularyRequiresOwnerAndSameOrigin(t *testing.T) {
	token, tokenHash, err := auth.NewSessionToken()
	if err != nil {
		t.Fatal(err)
	}
	store := &fakeAuthStore{
		user:    adminUser{ID: 1, Role: "staff", Username: "personal", Active: true},
		session: tokenHash,
	}
	service := vocabularyService{admin: &adminAuth{store: store, publicOrigin: "http://localhost:3000"}}
	request := httptest.NewRequest(http.MethodGet, "/api/admin/catalog/vocabulary", nil)
	request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: token})
	response := httptest.NewRecorder()
	if service.requireOwner(response, request) || response.Code != http.StatusForbidden {
		t.Fatalf("staff request status = %d", response.Code)
	}

	store.user.Role = "owner"
	request = httptest.NewRequest(http.MethodPost, "/api/admin/catalog/categories", nil)
	request.Header.Set("Origin", "https://other.example")
	request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: token})
	response = httptest.NewRecorder()
	if service.requireOwner(response, request) || response.Code != http.StatusForbidden {
		t.Fatalf("cross-origin request status = %d", response.Code)
	}
}
