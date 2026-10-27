package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
)

// The media volume shares the VPS disk with other applications, so uploads
// from the panel stop at a configurable total (MEDIA_QUOTA_GB, 40 by default).
// Payment receipts from customers count towards it but are never blocked.
const defaultMediaQuotaGB = 40

func parseMediaQuota(value string) (int64, error) {
	if value == "" {
		return defaultMediaQuotaGB << 30, nil
	}
	gigabytes, err := strconv.ParseFloat(value, 64)
	if err != nil || gigabytes <= 0 || gigabytes > 10_000 || math.IsNaN(gigabytes) {
		return 0, errors.New("MEDIA_QUOTA_GB must be a positive number of gigabytes")
	}
	return int64(gigabytes * (1 << 30)), nil
}

// mediaUsage is the stored size of every image, derived size and receipt.
func (service *landingService) mediaUsage(ctx context.Context) (int64, error) {
	var used int64
	err := service.pool.QueryRow(ctx, `SELECT
		(SELECT COALESCE(sum(file_size_bytes),0) FROM media)
		+ (SELECT COALESCE(sum(file_size_bytes),0) FROM media_variants)
		+ (SELECT COALESCE(sum(file_size_bytes),0) FROM order_payment_proofs)`).Scan(&used)
	return used, err
}

func quotaExceededMessage(quota int64) string {
	return fmt.Sprintf("se alcanzó el límite de almacenamiento de imágenes (%s); elimina definitivamente imágenes de la papelera para liberar espacio",
		formatGigabytes(quota))
}

func formatGigabytes(bytes int64) string {
	return strconv.FormatFloat(float64(bytes)/(1<<30), 'f', -1, 64) + " GB"
}

func (service *landingService) getMediaUsage(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.requireOwner(w, r, false); !ok {
		return
	}
	used, err := service.mediaUsage(r.Context())
	if err != nil {
		serverError(w, "read media usage", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"usedBytes": used, "quotaBytes": service.quotaBytes})
}
