package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
)

const maxProofBytes = 8 << 20

var proofKeyPattern = regexp.MustCompile(`^[a-f0-9]{32}\.(jpg|png|pdf)$`)

func validatedProof(data []byte) ([]byte, string, string, error) {
	if len(data) == 0 || len(data) > maxProofBytes {
		return nil, "", "", errors.New("comprobante vacío o mayor a 8 MB")
	}
	if bytes.HasPrefix(data, []byte("%PDF-")) {
		start := len(data) - 1024
		if start < 0 {
			start = 0
		}
		if !bytes.Contains(data[start:], []byte("%%EOF")) {
			return nil, "", "", errors.New("PDF inválido")
		}
		return data, "application/pdf", ".pdf", nil
	}
	image, mimeType, extension, err := decodeUploadedImage(data)
	if err != nil {
		return nil, "", "", err
	}
	var output bytes.Buffer
	if mimeType == "image/jpeg" {
		err = jpeg.Encode(&output, image, &jpeg.Options{Quality: 85})
	} else {
		err = png.Encode(&output, image)
	}
	if err != nil || output.Len() > 16<<20 {
		return nil, "", "", errors.New("comprobante codificado demasiado grande")
	}
	return output.Bytes(), mimeType, extension, nil
}

func (service *orderService) uploadPaymentProof(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !service.admin.sameOrigin(r) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	token := r.Header.Get("X-Order-Token")
	if !stockRequestKeyPattern.MatchString(token) {
		http.NotFound(w, r)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxProofBytes+(1<<20))
	if err := r.ParseMultipartForm(maxProofBytes + (1 << 20)); err != nil {
		http.Error(w, "comprobante demasiado grande", http.StatusBadRequest)
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "selecciona un comprobante", http.StatusBadRequest)
		return
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, maxProofBytes+1))
	if err != nil {
		http.Error(w, "no se pudo leer el comprobante", http.StatusBadRequest)
		return
	}
	data, mimeType, extension, err := validatedProof(raw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin proof upload", err)
		return
	}
	defer tx.Rollback(context.Background())
	var method, status, orderStatus, whatsAppNumber, message string
	err = tx.QueryRow(r.Context(), `SELECT payment_method, payment_status, status,
		whatsapp_number, whatsapp_message FROM orders
		WHERE id=$1 AND customer_access_token=$2::uuid FOR UPDATE`, id, token).
		Scan(&method, &status, &orderStatus, &whatsAppNumber, &message)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		serverError(w, "find proof order", err)
		return
	}
	if method != "qr" || orderStatus != "pending" || (status != "awaiting_receipt" && status != "rejected") {
		http.Error(w, "este pedido no admite un nuevo comprobante", http.StatusConflict)
		return
	}
	name := make([]byte, 16)
	if _, err := rand.Read(name); err != nil {
		serverError(w, "generate proof key", err)
		return
	}
	key := hex.EncodeToString(name) + extension
	directory := filepath.Join(service.mediaDir, "payment_proofs")
	if err := os.MkdirAll(directory, 0700); err != nil {
		serverError(w, "create proof directory", err)
		return
	}
	path := filepath.Join(directory, key)
	output, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		serverError(w, "create proof", err)
		return
	}
	written, writeErr := output.Write(data)
	closeErr := output.Close()
	if writeErr != nil || closeErr != nil || written != len(data) {
		_ = os.Remove(path)
		serverError(w, "write proof", errors.Join(writeErr, closeErr, io.ErrShortWrite))
		return
	}
	removeFile := true
	defer func() {
		if removeFile {
			_ = os.Remove(path)
		}
	}()
	if _, err := tx.Exec(r.Context(), `INSERT INTO order_payment_proofs
		(order_id, storage_key, mime_type, file_size_bytes) VALUES ($1,$2,$3,$4)`, id, key, mimeType, len(data)); err != nil {
		serverError(w, "record proof", err)
		return
	}
	if !strings.Contains(message, "Comprobante cargado en el sistema.") {
		message += "\nComprobante cargado en el sistema."
	}
	if _, err := tx.Exec(r.Context(), `UPDATE orders SET payment_status='submitted',
		whatsapp_message=$2, updated_at=now() WHERE id=$1`, id, message); err != nil {
		serverError(w, "mark payment submitted", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit proof", err)
		return
	}
	removeFile = false
	writeJSON(w, http.StatusCreated, map[string]string{"paymentStatus": "submitted",
		"whatsappUrl": orderWhatsAppURL(whatsAppNumber, message)})
}

func (service *orderService) customerPaymentStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	token := r.Header.Get("X-Order-Token")
	if !stockRequestKeyPattern.MatchString(token) {
		http.NotFound(w, r)
		return
	}
	var method, status, paymentStatus string
	err := service.pool.QueryRow(r.Context(), `SELECT payment_method, status, payment_status FROM orders
		WHERE id=$1 AND customer_access_token=$2::uuid`, id, token).Scan(&method, &status, &paymentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		serverError(w, "read customer payment", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"paymentMethod": method, "status": status, "paymentStatus": paymentStatus})
}

func (service *orderService) downloadPaymentProof(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.requireOwner(w, r); !ok {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var key, mimeType string
	err := service.pool.QueryRow(r.Context(), `SELECT storage_key, mime_type FROM order_payment_proofs
		WHERE order_id=$1 ORDER BY id DESC LIMIT 1`, id).Scan(&key, &mimeType)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		serverError(w, "find proof", err)
		return
	}
	if !proofKeyPattern.MatchString(key) {
		serverError(w, "bad proof key", errors.New("invalid proof key"))
		return
	}
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"comprobante-%s%s\"", orderNumber(id), filepath.Ext(key)))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "sandbox")
	http.ServeFile(w, r, filepath.Join(service.mediaDir, "payment_proofs", key))
}

func (service *orderService) verifyPayment(w http.ResponseWriter, r *http.Request) {
	service.reviewPayment(w, r, "verified")
}
func (service *orderService) rejectPayment(w http.ResponseWriter, r *http.Request) {
	service.reviewPayment(w, r, "rejected")
}

func (service *orderService) reviewPayment(w http.ResponseWriter, r *http.Request, decision string) {
	user, ok := service.requireOwner(w, r)
	if !ok {
		return
	}
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin proof review", err)
		return
	}
	defer tx.Rollback(context.Background())
	var method, paymentStatus, orderStatus string
	err = tx.QueryRow(r.Context(), `SELECT payment_method, payment_status, status FROM orders WHERE id=$1 FOR UPDATE`, id).
		Scan(&method, &paymentStatus, &orderStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		serverError(w, "find payment order", err)
		return
	}
	if method != "qr" || paymentStatus != "submitted" || orderStatus != "pending" {
		http.Error(w, "no hay un comprobante pendiente para este pedido", http.StatusConflict)
		return
	}
	var proofID int64
	err = tx.QueryRow(r.Context(), `SELECT id FROM order_payment_proofs WHERE order_id=$1 AND status='submitted'
		ORDER BY id DESC LIMIT 1 FOR UPDATE`, id).Scan(&proofID)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "comprobante no encontrado", http.StatusConflict)
		return
	}
	if err != nil {
		serverError(w, "lock proof", err)
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE order_payment_proofs SET status=$2, reviewed_at=now(),
		reviewed_by_user_id=$3 WHERE id=$1`, proofID, decision, user.ID); err != nil {
		serverError(w, "review proof", err)
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE orders SET payment_status=$2, updated_at=now() WHERE id=$1`, id, decision); err != nil {
		serverError(w, "update payment status", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit proof review", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
