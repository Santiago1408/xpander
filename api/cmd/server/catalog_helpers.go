package main

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var vocabularyCodePattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{1,63}$`)

func validVocabularyName(value string) bool {
	return value == strings.TrimSpace(value) && value != "" && len(value) <= 120
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.NotFound(w, r)
		return 0, false
	}
	return id, true
}

func vocabularyDBError(w http.ResponseWriter, operation string, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "registro inexistente", http.StatusNotFound)
		return
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			http.Error(w, "ya existe un registro con ese identificador o valor", http.StatusConflict)
			return
		case "23503", "23514":
			http.Error(w, "datos relacionados o valores inválidos", http.StatusBadRequest)
			return
		}
	}
	serverError(w, operation, err)
}
