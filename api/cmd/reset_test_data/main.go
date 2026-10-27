package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"syscall"

	"github.com/jackc/pgx/v5"
)

var uploadedImageName = regexp.MustCompile(`^[a-f0-9]{32}\.(jpg|png)$`)

func main() {
	if err := run(); err != nil {
		slog.Error("reset failed", "error", err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) != 2 || os.Args[1] != "--confirm=BORRAR-DATOS-XPANDER" {
		return errors.New("run with --confirm=BORRAR-DATOS-XPANDER to erase test data")
	}
	url, mediaDir := os.Getenv("DATABASE_URL"), os.Getenv("MEDIA_DIR")
	if url == "" || mediaDir == "" || filepath.Clean(mediaDir) == "/" {
		return errors.New("DATABASE_URL and a safe MEDIA_DIR are required")
	}
	mediaInfo, err := os.Stat(mediaDir)
	if err != nil || !mediaInfo.IsDir() {
		return fmt.Errorf("MEDIA_DIR must be an existing directory: %s", mediaDir)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer conn.Close(context.Background())
	var version int
	if err := conn.QueryRow(ctx, `SELECT max(version) FROM schema_migrations`).Scan(&version); err != nil || version < 19 {
		return errors.New("apply migration 019 before resetting test data")
	}
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	_, err = tx.Exec(ctx, `TRUNCATE TABLE
		business_profile,
		stock_movements, branch_stock, order_payment_proofs, order_items, orders,
		product_media, product_variants, products, brands, catalog_terms,
		page_publication_media, page_publications, page_section_media,
		page_sections, pages, media, site_settings RESTART IDENTITY`)
	if err != nil {
		return fmt.Errorf("clear catalog, orders, content and inventory: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO business_profile (id, phone) VALUES (TRUE, '+591 70782380')`); err != nil {
		return fmt.Errorf("restore empty business profile: %w", err)
	}
	for _, sequence := range []string{"xpander_product_code_seq", "xpander_variant_sku_seq"} {
		if _, err := tx.Exec(ctx, "ALTER SEQUENCE "+sequence+" RESTART WITH 1"); err != nil {
			return fmt.Errorf("reset generated code sequence %s: %w", sequence, err)
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO pages (slug, title, is_published)
		VALUES ('inicio', 'XPANDER', FALSE)`); err != nil {
		return fmt.Errorf("create empty home draft: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reset: %w", err)
	}
	entries, err := os.ReadDir(mediaDir)
	if err != nil {
		return fmt.Errorf("read media directory after database reset: %w", err)
	}
	removed := 0
	for _, entry := range entries {
		if !uploadedImageName.MatchString(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return fmt.Errorf("inspect uploaded image %q: %w", entry.Name(), err)
		}
		if !info.Mode().IsRegular() {
			continue
		}
		if err := os.Remove(filepath.Join(mediaDir, entry.Name())); err != nil {
			return fmt.Errorf("remove uploaded image %q: %w", entry.Name(), err)
		}
		removed++
	}
	slog.Info("test data reset", "uploaded_images_removed", removed,
		"preserved", "administrator accounts and branches")
	return nil
}
