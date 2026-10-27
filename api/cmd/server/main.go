package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if err := run(); err != nil {
		slog.Error("API stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return err
	}
	config.MaxConns = 5

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return err
	}
	defer pool.Close()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	publicOrigin := os.Getenv("PUBLIC_ORIGIN")
	if publicOrigin == "" {
		return errors.New("PUBLIC_ORIGIN is required")
	}
	parsedOrigin, err := url.Parse(publicOrigin)
	if err != nil || parsedOrigin.Host == "" || parsedOrigin.User != nil || parsedOrigin.Path != "" || parsedOrigin.RawQuery != "" || parsedOrigin.Fragment != "" || (parsedOrigin.Scheme != "http" && parsedOrigin.Scheme != "https") {
		return errors.New("PUBLIC_ORIGIN must be an HTTP(S) origin without a path")
	}
	appEnvironment := os.Getenv("APP_ENV")
	if appEnvironment != "development" && appEnvironment != "production" {
		return errors.New("APP_ENV must be development or production")
	}
	secureCookies := appEnvironment == "production"
	if secureCookies && parsedOrigin.Scheme != "https" {
		return errors.New("PUBLIC_ORIGIN must use HTTPS in production")
	}
	mux := newHandler(pool)
	admin := registerAdminAuth(mux, databaseAuthStore{pool: pool}, publicOrigin, secureCookies)
	mediaDir := os.Getenv("MEDIA_DIR")
	if mediaDir == "" {
		return errors.New("MEDIA_DIR is required")
	}
	registerLandingRoutes(mux, pool, admin, mediaDir)
	registerBusinessRoutes(mux, pool, admin)
	registerBrandRoutes(mux, pool, admin)
	registerTermRoutes(mux, pool, admin)
	registerBranchRoutes(mux, pool, admin)
	registerAccountRoutes(mux, pool, admin)
	registerProductRoutes(mux, pool, admin)
	registerQuickCatalogRoutes(mux, pool, admin)
	registerTrashRoutes(mux, pool, admin, mediaDir)
	registerInventoryRoutes(mux, pool, admin)
	whatsAppNumber := os.Getenv("ORDER_WHATSAPP_NUMBER")
	if whatsAppNumber == "" {
		whatsAppNumber = "59170782380"
	}
	if !validWhatsAppNumber(whatsAppNumber) {
		return errors.New("ORDER_WHATSAPP_NUMBER must contain 8 to 15 digits with country code")
	}
	registerOrderRoutes(mux, pool, admin, whatsAppNumber, mediaDir)
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errorsCh := make(chan error, 1)
	go func() {
		slog.Info("API listening", "port", port)
		errorsCh <- server.ListenAndServe()
	}()

	select {
	case err := <-errorsCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	}
}

type databasePinger interface {
	Ping(context.Context) error
}

func newHandler(database databasePinger) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/live", func(w http.ResponseWriter, _ *http.Request) {
		writeStatus(w, http.StatusOK, "ok")
	})
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := database.Ping(ctx); err != nil {
			slog.Warn("database health check failed", "error", err)
			writeStatus(w, http.StatusServiceUnavailable, "database_unavailable")
			return
		}
		writeStatus(w, http.StatusOK, "ok")
	})

	return mux
}

func writeStatus(w http.ResponseWriter, statusCode int, status string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(struct {
		Status string `json:"status"`
	}{Status: status})
}
