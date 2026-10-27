package migrations

import "testing"

func TestLoad(t *testing.T) {
	files, err := load()
	if err != nil {
		t.Fatal(err)
	}
	expected := []string{
		"001_foundation.sql",
		"002_catalog.sql",
		"003_orders_inventory.sql",
		"004_username_login.sql",
		"005_landing_publications.sql",
		"006_landing_draft.sql",
		"007_product_revision.sql",
		"008_recycle_bin.sql",
		"009_stock_request_key.sql",
		"010_quick_product_entry.sql",
		"011_catalog_simplification.sql",
		"012_order_requests.sql",
		"013_stock_outflow.sql",
		"014_catalog_terms.sql",
		"015_inventory_purge.sql",
		"016_publication_media_redaction.sql",
	}
	if len(files) < len(expected) {
		t.Fatalf("expected at least %d migrations, got %d", len(expected), len(files))
	}
	for i, file := range files {
		if file.version != i+1 {
			t.Fatalf("unexpected migration version %d at position %d", file.version, i)
		}
		if i < len(expected) && file.name != expected[i] {
			t.Fatalf("unexpected migration %s at position %d", file.name, i)
		}
		if len(file.checksum) != 64 || file.sql == "" {
			t.Fatalf("incomplete migration %s", file.name)
		}
	}
}
