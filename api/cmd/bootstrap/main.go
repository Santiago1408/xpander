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
		fmt.Fprintln(os.Stderr, "Inicialización fallida:", err)
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

	var ownerExists bool
	if err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE role = 'owner')`).Scan(&ownerExists); err != nil {
		return fmt.Errorf("comprobar propietario: %w", err)
	}
	if ownerExists {
		return errors.New("ya existe un propietario; no se creó ningún usuario")
	}

	fmt.Print("Contraseña del propietario (mínimo 15 caracteres): ")
	passwordBytes, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return fmt.Errorf("leer contraseña: %w", err)
	}
	defer clear(passwordBytes)
	fmt.Print("Repite la contraseña: ")
	confirmBytes, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return fmt.Errorf("confirmar contraseña: %w", err)
	}
	defer clear(confirmBytes)
	if string(passwordBytes) != string(confirmBytes) {
		return errors.New("las contraseñas no coinciden")
	}
	passwordHash, err := auth.HashPassword(string(passwordBytes))
	if err != nil {
		if errors.Is(err, auth.ErrPasswordLength) {
			return errors.New("la contraseña debe tener al menos 15 caracteres y como máximo 1024 bytes")
		}
		return err
	}
	clear(passwordBytes)
	clear(confirmBytes)

	input := bufio.NewReader(os.Stdin)
	username, err := ask(input, "Nombre de usuario (3-32, minúsculas, números, _ o -): ")
	if err != nil {
		return err
	}
	if !auth.ValidUsername(username) {
		return errors.New("nombre de usuario inválido")
	}
	displayName, err := ask(input, "Nombre visible del propietario: ")
	if err != nil {
		return err
	}
	branchCode, err := ask(input, "Código de la sucursal (por ejemplo principal): ")
	if err != nil {
		return err
	}
	if !auth.ValidUsername(branchCode) {
		return errors.New("código de sucursal inválido; usa el mismo formato que el usuario")
	}
	branchName, err := ask(input, "Nombre de la sucursal: ")
	if err != nil {
		return err
	}
	branchAddress, err := ask(input, "Dirección de recojo (opcional): ")
	if err != nil {
		return err
	}
	if displayName == "" || branchName == "" || len(displayName) > 120 || len(branchName) > 120 || len(branchAddress) > 500 {
		return errors.New("nombre o dirección faltante o demasiado largo")
	}

	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(21180314, 2)`); err != nil {
		return err
	}
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE role = 'owner')`).Scan(&ownerExists); err != nil {
		return err
	}
	if ownerExists {
		return errors.New("otro proceso ya creó el propietario")
	}
	if _, err := tx.Exec(ctx, `INSERT INTO users (username, password_hash, display_name, role)
		VALUES ($1, $2, $3, 'owner')`, username, passwordHash, displayName); err != nil {
		return fmt.Errorf("crear propietario: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO branches (code, name, address)
		VALUES ($1, $2, NULLIF($3, ''))`, branchCode, branchName, branchAddress); err != nil {
		return fmt.Errorf("crear sucursal: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	fmt.Println("Propietario y sucursal creados. Ya puedes iniciar sesión en /admin/login.")
	return nil
}

func ask(input *bufio.Reader, prompt string) (string, error) {
	fmt.Print(prompt)
	value, err := input.ReadString('\n')
	if err != nil {
		return "", fmt.Errorf("leer respuesta: %w", err)
	}
	return strings.TrimSpace(value), nil
}

func clear(value []byte) {
	for i := range value {
		value[i] = 0
	}
}
