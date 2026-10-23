package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeDatabase struct {
	err error
}

func (database fakeDatabase) Ping(context.Context) error {
	return database.err
}

func TestLive(t *testing.T) {
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/live", nil)

	newHandler(fakeDatabase{err: errors.New("unavailable")}).ServeHTTP(response, request)

	if response.Code != http.StatusOK || response.Body.String() != "{\"status\":\"ok\"}\n" {
		t.Fatalf("unexpected liveness response: %d %s", response.Code, response.Body.String())
	}
}

func TestHealth(t *testing.T) {
	tests := []struct {
		name       string
		database   fakeDatabase
		wantCode   int
		wantStatus string
	}{
		{"available", fakeDatabase{}, http.StatusOK, "{\"status\":\"ok\"}\n"},
		{"unavailable", fakeDatabase{err: errors.New("unavailable")}, http.StatusServiceUnavailable, "{\"status\":\"database_unavailable\"}\n"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api/health", nil)

			newHandler(test.database).ServeHTTP(response, request)

			if response.Code != test.wantCode || response.Body.String() != test.wantStatus {
				t.Fatalf("unexpected health response: %d %s", response.Code, response.Body.String())
			}
		})
	}
}
