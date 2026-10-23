package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5"

	"xpander/api/internal/migrations"
)

func main() {
	if err := run(); err != nil {
		slog.Error("migration failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer conn.Close(context.Background())

	installed, err := migrations.Apply(ctx, conn)
	if err != nil {
		return err
	}
	for _, name := range installed {
		slog.Info("migration applied", "name", name)
	}
	slog.Info("migrations current", "newly_applied", len(installed))
	return nil
}
