package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
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
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           newHandler(pool),
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

func newHandler(database databasePinger) http.Handler {
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
