// Command reset_password sets a new password for an administrator who forgot
// theirs. It runs on the server, asks for the password privately and closes
// every open session of that account. See docs/05-acceso-admin.md.
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
	"golang.org/x/term"

	"xpander/api/internal/auth"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "No se cambió la contraseña:", err)
		os.Exit(1)
	}
}

func run() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL es obligatorio")
	}
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return errors.New("ejecuta este comando en una terminal interactiva; la contraseña no se acepta por argumentos ni variables")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("conectar a PostgreSQL: %w", err)
	}
	defer conn.Close(context.Background())

	rows, err := conn.Query(ctx, `SELECT username, display_name FROM users WHERE is_active ORDER BY id`)
	if err != nil {
		return fmt.Errorf("listar cuentas: %w", err)
	}
	fmt.Println("Cuentas activas:")
	accounts := 0
	for rows.Next() {
		var username, displayName string
		if err := rows.Scan(&username, &displayName); err != nil {
			rows.Close()
			return fmt.Errorf("leer cuentas: %w", err)
		}
		fmt.Printf("  %s (%s)\n", username, displayName)
		accounts++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("listar cuentas: %w", err)
	}
	if accounts == 0 {
		return errors.New("no hay cuentas activas; crea el propietario con bootstrap")
	}

	fmt.Print("Usuario: ")
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		return fmt.Errorf("leer usuario: %w", err)
	}
	username := strings.ToLower(strings.TrimSpace(line))
	if !auth.ValidUsername(username) {
		return errors.New("usuario inválido")
	}

	fmt.Print("Contraseña nueva (más de 6 caracteres): ")
	password, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return fmt.Errorf("leer contraseña: %w", err)
	}
	defer clear(password)
	fmt.Print("Repite la contraseña: ")
	confirm, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return fmt.Errorf("confirmar contraseña: %w", err)
	}
	defer clear(confirm)
	if string(password) != string(confirm) {
		return errors.New("las contraseñas no coinciden")
	}
	hash, err := auth.HashPassword(string(password))
	if errors.Is(err, auth.ErrPasswordLength) {
		return errors.New("la contraseña debe tener más de 6 caracteres (máximo técnico: 1024 bytes)")
	}
	if err != nil {
		return err
	}

	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var userID int64
	err = tx.QueryRow(ctx, `UPDATE users SET password_hash=$2, updated_at=now()
		WHERE username=$1 AND is_active RETURNING id`, username, hash).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("no existe una cuenta activa con ese usuario")
	}
	if err != nil {
		return fmt.Errorf("guardar contraseña: %w", err)
	}
	// Anyone who had the old password loses access at once.
	tag, err := tx.Exec(ctx, `UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, userID)
	if err != nil {
		return fmt.Errorf("cerrar sesiones: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	fmt.Printf("Contraseña de %s actualizada. Se cerraron %d sesión(es) abiertas.\n", username, tag.RowsAffected())
	return nil
}
