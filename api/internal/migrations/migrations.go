package migrations

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

//go:embed sql/*.sql
var sqlFiles embed.FS

var migrationName = regexp.MustCompile(`^([0-9]{3})_[a-z0-9_]+\.sql$`)

type migration struct {
	version  int
	name     string
	checksum string
	sql      string
}

type appliedMigration struct {
	name     string
	checksum string
}

// Apply installs all pending migrations in one transaction. Previously applied
// files must remain byte-for-byte unchanged; schema changes require a new file.
func Apply(ctx context.Context, conn *pgx.Conn) ([]string, error) {
	files, err := load()
	if err != nil {
		return nil, err
	}

	tx, err := conn.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin migrations: %w", err)
	}
	defer tx.Rollback(context.Background())

	// Serialize schema changes even if two application instances start together.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(21180314, 1)`); err != nil {
		return nil, fmt.Errorf("lock migrations: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			checksum TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`); err != nil {
		return nil, fmt.Errorf("create migration registry: %w", err)
	}

	applied := make(map[int]appliedMigration)
	maxApplied := 0
	rows, err := tx.Query(ctx, `SELECT version, name, checksum FROM schema_migrations`)
	if err != nil {
		return nil, fmt.Errorf("read migration registry: %w", err)
	}
	for rows.Next() {
		var version int
		var entry appliedMigration
		if err := rows.Scan(&version, &entry.name, &entry.checksum); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan migration registry: %w", err)
		}
		applied[version] = entry
		if version > maxApplied {
			maxApplied = version
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, fmt.Errorf("read migration registry: %w", err)
	}
	rows.Close()

	known := make(map[int]bool, len(files))
	for _, file := range files {
		known[file.version] = true
		if previous, ok := applied[file.version]; ok {
			if previous.name != file.name || previous.checksum != file.checksum {
				return nil, fmt.Errorf("migration %03d changed after application", file.version)
			}
		} else if file.version < maxApplied {
			return nil, fmt.Errorf("migration %03d is missing below applied version %03d", file.version, maxApplied)
		}
	}
	for version := range applied {
		if !known[version] {
			return nil, fmt.Errorf("database has unknown migration %03d", version)
		}
	}

	var installed []string
	for _, file := range files {
		if _, ok := applied[file.version]; ok {
			continue
		}
		// Embedded migration files are trusted SQL. Simple protocol permits several
		// SQL statements in one file without splitting procedural function bodies.
		if _, err := tx.Exec(ctx, file.sql, pgx.QueryExecModeSimpleProtocol); err != nil {
			return nil, fmt.Errorf("apply %s: %w", file.name, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)`,
			file.version, file.name, file.checksum,
		); err != nil {
			return nil, fmt.Errorf("record %s: %w", file.name, err)
		}
		installed = append(installed, file.name)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit migrations: %w", err)
	}
	return installed, nil
}

func load() ([]migration, error) {
	names, err := fs.Glob(sqlFiles, "sql/*.sql")
	if err != nil {
		return nil, fmt.Errorf("find migration files: %w", err)
	}
	if len(names) == 0 {
		return nil, errors.New("no migration files found")
	}
	sort.Strings(names)

	seen := make(map[int]bool, len(names))
	files := make([]migration, 0, len(names))
	for _, path := range names {
		name := strings.TrimPrefix(path, "sql/")
		match := migrationName.FindStringSubmatch(name)
		if match == nil {
			return nil, fmt.Errorf("invalid migration filename %q", name)
		}
		version, _ := strconv.Atoi(match[1])
		if seen[version] {
			return nil, fmt.Errorf("duplicate migration version %03d", version)
		}
		if version != len(files)+1 {
			return nil, fmt.Errorf("migration versions must be consecutive from 001: found %03d", version)
		}
		seen[version] = true

		body, err := sqlFiles.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", name, err)
		}
		if len(strings.TrimSpace(string(body))) == 0 {
			return nil, fmt.Errorf("empty migration %s", name)
		}
		sum := sha256.Sum256(body)
		files = append(files, migration{
			version:  version,
			name:     name,
			checksum: hex.EncodeToString(sum[:]),
			sql:      string(body),
		})
	}
	return files, nil
}
