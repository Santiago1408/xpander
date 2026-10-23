package migrations

import "testing"

func TestLoad(t *testing.T) {
	files, err := load()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) < 3 {
		t.Fatalf("expected at least 3 migrations, got %d", len(files))
	}
	for i, file := range files {
		if file.version != i+1 {
			t.Fatalf("unexpected migration version %d at position %d", file.version, i)
		}
		if len(file.checksum) != 64 || file.sql == "" {
			t.Fatalf("incomplete migration %s", file.name)
		}
	}
}
