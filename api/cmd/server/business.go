package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type businessService struct {
	pool  *pgxpool.Pool
	admin *adminAuth
}

type businessProfile struct {
	Phone       string            `json:"phone"`
	SocialLinks map[string]string `json:"socialLinks"`
	QRMediaID   *int64            `json:"qrMediaId"`
	QRURL       string            `json:"qrUrl"`
	QRExpiresOn string            `json:"qrExpiresOn"`
}

func registerBusinessRoutes(mux *http.ServeMux, pool *pgxpool.Pool, admin *adminAuth) {
	service := &businessService{pool: pool, admin: admin}
	mux.HandleFunc("GET /api/business", service.getPublic)
	mux.HandleFunc("GET /api/admin/business", service.getAdmin)
	mux.HandleFunc("PUT /api/admin/business", service.update)
}

func (service *businessService) requireOwner(w http.ResponseWriter, r *http.Request, write bool) bool {
	w.Header().Set("Cache-Control", "no-store")
	if write && !service.admin.sameOrigin(r) {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return false
	}
	user, ok := service.admin.currentUser(w, r)
	if !ok {
		return false
	}
	if user.Role != "owner" {
		http.Error(w, "permiso insuficiente", http.StatusForbidden)
		return false
	}
	return true
}

func (service *businessService) read(w http.ResponseWriter, r *http.Request, admin bool) {
	var profile businessProfile
	var links []byte
	err := service.pool.QueryRow(r.Context(), `SELECT b.phone, b.social_links, b.qr_media_id,
		COALESCE(b.qr_expires_on::text,'')
		FROM business_profile b WHERE b.id=TRUE`).Scan(&profile.Phone, &links, &profile.QRMediaID, &profile.QRExpiresOn)
	if err != nil {
		serverError(w, "read business profile", err)
		return
	}
	if err := json.Unmarshal(links, &profile.SocialLinks); err != nil {
		serverError(w, "decode business links", err)
		return
	}
	if profile.SocialLinks == nil {
		profile.SocialLinks = map[string]string{}
	}
	if profile.QRMediaID != nil {
		if !admin {
			var active bool
			err := service.pool.QueryRow(r.Context(), `SELECT m.deleted_at IS NULL AND
				b.qr_expires_on >= (now() AT TIME ZONE 'America/La_Paz')::date
				FROM media m JOIN business_profile b ON b.qr_media_id=m.id WHERE m.id=$1`, *profile.QRMediaID).Scan(&active)
			if err != nil {
				serverError(w, "read QR status", err)
				return
			}
			if !active {
				profile.QRMediaID = nil
			}
		}
		if profile.QRMediaID != nil {
			prefix := "/api/media/"
			if admin {
				prefix = "/api/admin/media/"
			}
			profile.QRURL = fmt.Sprintf("%s%d", prefix, *profile.QRMediaID)
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, profile)
}

func (service *businessService) getPublic(w http.ResponseWriter, r *http.Request) {
	service.read(w, r, false)
}
func (service *businessService) getAdmin(w http.ResponseWriter, r *http.Request) {
	if service.requireOwner(w, r, false) {
		service.read(w, r, true)
	}
}

func (service *businessService) update(w http.ResponseWriter, r *http.Request) {
	if !service.requireOwner(w, r, true) {
		return
	}
	var input businessProfile
	if !decodeJSON(w, r, &input, 32*1024) {
		return
	}
	input.Phone = strings.TrimSpace(input.Phone)
	if len(input.Phone) > 40 || len(input.Phone) < 7 ||
		strings.Trim(input.Phone, "+ 0123456789()-") != "" {
		http.Error(w, "número de teléfono inválido", http.StatusBadRequest)
		return
	}
	if err := validateSocialLinks(input.SocialLinks); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if input.SocialLinks == nil {
		input.SocialLinks = map[string]string{}
	}
	if input.QRMediaID == nil {
		input.QRExpiresOn = ""
	} else {
		bot := time.FixedZone("BOT", -4*3600)
		expiry, err := time.ParseInLocation("2006-01-02", input.QRExpiresOn, bot)
		today := time.Now().In(bot)
		today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())
		if err != nil || expiry.Before(today) || expiry.After(today.AddDate(1, 0, 0)) {
			http.Error(w, "indica un vencimiento del QR entre hoy y un año desde hoy", http.StatusBadRequest)
			return
		}
	}
	if input.QRMediaID != nil {
		var kind string
		err := service.pool.QueryRow(r.Context(), `SELECT kind FROM media WHERE id=$1 AND source_type='local'
			AND purpose='qr' AND deleted_at IS NULL`, *input.QRMediaID).Scan(&kind)
		if errors.Is(err, pgx.ErrNoRows) || kind != "image" {
			http.Error(w, "selecciona una imagen QR activa", http.StatusBadRequest)
			return
		}
		if err != nil {
			serverError(w, "validate business QR", err)
			return
		}
	}
	links, err := json.Marshal(input.SocialLinks)
	if err != nil {
		serverError(w, "encode business links", err)
		return
	}
	_, err = service.pool.Exec(r.Context(), `UPDATE business_profile SET phone=$1, social_links=$2::jsonb,
		qr_media_id=$3, qr_expires_on=NULLIF($4,'')::date, updated_at=now() WHERE id=TRUE`,
		input.Phone, string(links), input.QRMediaID, input.QRExpiresOn)
	if err != nil {
		serverError(w, "save business profile", err)
		return
	}
	service.read(w, r, true)
}
