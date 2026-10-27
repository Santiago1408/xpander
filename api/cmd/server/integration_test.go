//go:build integration

// End-to-end checks of the API against a real, disposable PostgreSQL
// database. They run through `compose.test.yaml`; see docs/14-pruebas-integracion.md.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"xpander/api/internal/auth"
	"xpander/api/internal/migrations"
)

const testOrigin = "http://xpander.test"

type apiClient struct {
	t      *testing.T
	base   string
	client *http.Client
}

func requestKey() string {
	raw := make([]byte, 16)
	_, _ = rand.Read(raw)
	raw[6] = raw[6]&0x0f | 0x40
	raw[8] = raw[8]&0x3f | 0x80
	text := hex.EncodeToString(raw)
	return text[:8] + "-" + text[8:12] + "-" + text[12:16] + "-" + text[16:20] + "-" + text[20:]
}

func (c *apiClient) send(method, path, contentType string, body io.Reader, headers map[string]string) (int, []byte) {
	c.t.Helper()
	status, data, _ := c.sendFull(method, path, contentType, body, headers)
	return status, data
}

func (c *apiClient) sendFull(method, path, contentType string, body io.Reader, headers map[string]string) (int, []byte, http.Header) {
	c.t.Helper()
	request, err := http.NewRequest(method, c.base+path, body)
	if err != nil {
		c.t.Fatal(err)
	}
	request.Header.Set("Origin", testOrigin)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := c.client.Do(request)
	if err != nil {
		c.t.Fatal(err)
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(response.Body)
	return response.StatusCode, data, response.Header
}

func (c *apiClient) json(method, path string, input any) (int, []byte) {
	c.t.Helper()
	var body io.Reader
	contentType := ""
	if input != nil {
		encoded, err := json.Marshal(input)
		if err != nil {
			c.t.Fatal(err)
		}
		body, contentType = bytes.NewReader(encoded), "application/json"
	}
	return c.send(method, path, contentType, body, nil)
}

// expect fails the test unless the call answers with the wanted status, and decodes the JSON answer.
func (c *apiClient) expect(want int, method, path string, input, output any) {
	c.t.Helper()
	status, data := c.json(method, path, input)
	if status != want {
		c.t.Fatalf("%s %s: status %d, want %d: %s", method, path, status, want, strings.TrimSpace(string(data)))
	}
	if output != nil {
		if err := json.Unmarshal(data, output); err != nil {
			c.t.Fatalf("%s %s: decode %q: %v", method, path, data, err)
		}
	}
}

func (c *apiClient) upload(path, field string, values map[string]string, file []byte, headers map[string]string) (int, []byte) {
	c.t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range values {
		_ = writer.WriteField(key, value)
	}
	part, _ := writer.CreateFormFile(field, "imagen.png")
	_, _ = part.Write(file)
	_ = writer.Close()
	return c.send(http.MethodPost, path, writer.FormDataContentType(), &body, headers)
}

func testPNG(t *testing.T, size int) []byte {
	t.Helper()
	picture := image.NewRGBA(image.Rect(0, 0, size, size))
	for x := 0; x < size; x++ {
		for y := 0; y < size; y++ {
			if (x/8+y/8)%2 == 0 {
				picture.Set(x, y, color.Black)
			} else {
				picture.Set(x, y, color.White)
			}
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, picture); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

// startAPI rebuilds the test database from the migrations and serves the API with one owner and branch.
func startAPI(t *testing.T) (*apiClient, *pgxpool.Pool, int64) {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	var database string
	if err := conn.QueryRow(ctx, `SELECT current_database()`).Scan(&database); err != nil {
		t.Fatal(err)
	}
	// The schema is dropped below: never run against a database that is not explicitly for tests.
	if !strings.HasSuffix(database, "_test") {
		t.Fatalf("refusing to reset database %q: its name must end in _test", database)
	}
	if _, err := conn.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); err != nil {
		t.Fatal(err)
	}
	applied, err := migrations.Apply(ctx, conn)
	if err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	if len(applied) == 0 || !strings.HasPrefix(applied[len(applied)-1], "025") {
		t.Fatalf("unexpected migrations applied: %v", applied)
	}
	hash, err := auth.HashPassword("clave-de-prueba-segura")
	if err != nil {
		t.Fatal(err)
	}
	var branchID int64
	if _, err := conn.Exec(ctx, `INSERT INTO users (username, password_hash, display_name, role)
		VALUES ('dueno', $1, 'Dueño de prueba', 'owner')`, hash); err != nil {
		t.Fatal(err)
	}
	if err := conn.QueryRow(ctx, `INSERT INTO branches (code, name, address) VALUES ('centro', 'Centro', 'Av. Principal 1')
		RETURNING id`).Scan(&branchID); err != nil {
		t.Fatal(err)
	}
	conn.Close(ctx)

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	server := httptest.NewServer(buildAPI(pool, testOrigin, false, t.TempDir(), "59100000000", false))
	t.Cleanup(server.Close)
	jar, _ := cookiejar.New(nil)
	// Redirects are checked as answers, not followed.
	client := &apiClient{t: t, base: server.URL, client: &http.Client{Jar: jar, Timeout: 30 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
	client.expect(http.StatusOK, http.MethodPost, "/api/admin/login", map[string]string{"username": "dueno", "password": "clave-de-prueba-segura"}, nil)
	return client, pool, branchID
}

type testStockRow struct {
	BranchID  int64 `json:"branchId"`
	VariantID int64 `json:"variantId"`
	Quantity  int64 `json:"quantity"`
}

func stockOf(c *apiClient, branchID, variantID int64) int64 {
	c.t.Helper()
	var inventory struct {
		Stock []testStockRow `json:"stock"`
	}
	c.expect(http.StatusOK, http.MethodGet, "/api/admin/inventory", nil, &inventory)
	for _, row := range inventory.Stock {
		if row.BranchID == branchID && row.VariantID == variantID {
			return row.Quantity
		}
	}
	return 0
}

type testOrder struct {
	ID            int64  `json:"id"`
	Number        string `json:"number"`
	Status        string `json:"status"`
	Channel       string `json:"channel"`
	PaymentMethod string `json:"paymentMethod"`
	PaymentStatus string `json:"paymentStatus"`
	TotalMinor    int64  `json:"totalMinor"`
	DiscountMinor int64  `json:"discountMinor"`
}

func findOrder(c *apiClient, id int64) testOrder {
	c.t.Helper()
	var orders []testOrder
	c.expect(http.StatusOK, http.MethodGet, "/api/admin/orders", nil, &orders)
	for _, order := range orders {
		if order.ID == id {
			return order
		}
	}
	c.t.Fatalf("order %d not listed", id)
	return testOrder{}
}

func TestStoreFlows(t *testing.T) {
	c, _, centro := startAPI(t)

	// A second branch created from the panel, with no stock.
	var sopocachi adminBranch
	c.expect(http.StatusCreated, http.MethodPost, "/api/admin/branches", branchInput{Name: "Sopocachi", Address: "Calle 2"}, &sopocachi)

	// Without a valid QR the checkout is blocked.
	var qr landingMedia
	status, data := c.upload("/api/admin/media", "file", map[string]string{"purpose": "qr", "altText": "QR de pago"}, testPNG(t, 240), nil)
	if status != http.StatusCreated {
		t.Fatalf("upload QR: %d %s", status, data)
	}
	if err := json.Unmarshal(data, &qr); err != nil {
		t.Fatal(err)
	}

	// Styles and audiences must be registered before a product uses them.
	for _, term := range []map[string]string{{"kind": "style", "name": "Casual"}, {"kind": "audience", "name": "Hombre"}} {
		if status, data := c.json(http.MethodPost, "/api/admin/catalog/terms", term); status >= 300 {
			t.Fatalf("create term %v: %d %s", term, status, data)
		}
	}

	// Product with M (5 units in Centro) and L (registered, no stock).
	c.expect(http.StatusOK, http.MethodPost, "/api/admin/catalog/quick/products", quickProductInput{
		RequestKey: requestKey(), Name: "Polera de prueba", Style: "Casual", Audience: "Hombre", Color: "Negro", Status: "active",
		Variants: []quickVariantInput{
			{SizeAlpha: "M", RegularPriceMinor: 15000, IsActive: true, StockEntries: []quickStockEntry{{BranchID: centro, Quantity: 5, UnitCostMinor: 8000}}},
			{SizeAlpha: "L", RegularPriceMinor: 15000, IsActive: true},
		},
	}, nil)
	var products []productRecord
	c.expect(http.StatusOK, http.MethodGet, "/api/admin/catalog/products", nil, &products)
	if len(products) != 1 || len(products[0].Variants) != 2 {
		t.Fatalf("unexpected products: %+v", products)
	}
	variantM, variantL := products[0].Variants[0].ID, products[0].Variants[1].ID
	if products[0].Variants[0].SizeAlpha != "M" {
		variantM, variantL = variantL, variantM
	}
	if got := stockOf(c, centro, variantM); got != 5 {
		t.Fatalf("initial stock M = %d, want 5", got)
	}

	checkout := func(variantID, quantity int64, branchID int64) (int, orderReceipt) {
		var receipt orderReceipt
		status, data := c.json(http.MethodPost, "/api/orders", checkoutInput{RequestKey: requestKey(), PaymentMethod: "qr", DeliveryMethod: "pickup",
			PickupBranchID: branchID, CustomerName: "Ana Pérez", CustomerPhone: "+591 71234567",
			Items: []checkoutItem{{VariantID: variantID, Quantity: quantity, ExpectedUnitPriceMinor: 15000}}})
		if status == http.StatusCreated || status == http.StatusOK {
			_ = json.Unmarshal(data, &receipt)
		} else {
			// Shown only when the test fails, to tell which rule rejected the order.
			t.Logf("checkout of %d × variant %d at branch %d: %d %s", quantity, variantID, branchID, status, strings.TrimSpace(string(data)))
		}
		return status, receipt
	}
	if status, _ := checkout(variantM, 1, centro); status != http.StatusConflict {
		t.Fatalf("checkout without QR: status %d, want 409", status)
	}
	expiry := time.Now().In(time.FixedZone("BOT", -4*3600)).AddDate(0, 0, 30).Format("2006-01-02")
	c.expect(http.StatusOK, http.MethodPut, "/api/admin/business", businessProfile{Phone: "+591 70000000", SocialLinks: map[string]string{}, QRMediaID: &qr.ID, QRExpiresOn: expiry}, nil)

	t.Run("pedido QR completo descuenta stock al aprobar", func(t *testing.T) {
		status, receipt := checkout(variantM, 2, centro)
		if status != http.StatusCreated || receipt.PaymentStatus != "awaiting_receipt" || receipt.TotalMinor != 30000 {
			t.Fatalf("checkout: %d %+v", status, receipt)
		}
		status, data := c.upload(fmt.Sprintf("/api/orders/%d/receipt", receipt.ID), "file", nil, testPNG(t, 120), map[string]string{"X-Order-Token": receipt.AccessToken})
		if status >= 300 {
			t.Fatalf("upload receipt: %d %s", status, data)
		}
		if got := findOrder(c, receipt.ID); got.PaymentStatus != "submitted" {
			t.Fatalf("after receipt: %+v", got)
		}
		if got := stockOf(c, centro, variantM); got != 5 {
			t.Fatalf("stock changed before approval: %d", got)
		}
		c.expect(http.StatusNoContent, http.MethodPost, fmt.Sprintf("/api/admin/orders/%d/payment/verify", receipt.ID), nil, nil)
		c.expect(http.StatusNoContent, http.MethodPost, fmt.Sprintf("/api/admin/orders/%d/confirm", receipt.ID), nil, nil)
		if got := findOrder(c, receipt.ID); got.Status != "confirmed" || got.Channel != "online" {
			t.Fatalf("after confirm: %+v", got)
		}
		if got := stockOf(c, centro, variantM); got != 3 {
			t.Fatalf("stock after confirm = %d, want 3", got)
		}
		// Confirming twice never debits twice.
		c.json(http.MethodPost, fmt.Sprintf("/api/admin/orders/%d/confirm", receipt.ID), nil)
		if got := stockOf(c, centro, variantM); got != 3 {
			t.Fatalf("stock after second confirm = %d, want 3", got)
		}
	})

	t.Run("no se puede pedir una talla sin stock", func(t *testing.T) {
		if status, _ := checkout(variantL, 1, centro); status != http.StatusConflict {
			t.Fatalf("checkout of L without stock: %d, want 409", status)
		}
		if status, _ := checkout(variantM, 1, sopocachi.ID); status != http.StatusConflict {
			t.Fatalf("checkout at a branch without stock: %d, want 409", status)
		}
		if status, _ := checkout(variantM, 4, centro); status != http.StatusConflict {
			t.Fatalf("checkout above stock: %d, want 409", status)
		}
	})

	t.Run("cancelar pedidos", func(t *testing.T) {
		_, unpaid := checkout(variantM, 1, centro)
		c.expect(http.StatusNoContent, http.MethodPost, fmt.Sprintf("/api/admin/orders/%d/cancel", unpaid.ID), nil, nil)
		if got := findOrder(c, unpaid.ID); got.Status != "cancelled" {
			t.Fatalf("unpaid cancel: %+v", got)
		}

		_, paid := checkout(variantM, 3, centro)
		c.upload(fmt.Sprintf("/api/orders/%d/receipt", paid.ID), "file", nil, testPNG(t, 120), map[string]string{"X-Order-Token": paid.AccessToken})
		c.expect(http.StatusNoContent, http.MethodPost, fmt.Sprintf("/api/admin/orders/%d/payment/verify", paid.ID), nil, nil)
		// With stock still available a verified order cannot be cancelled.
		if status, _ := c.json(http.MethodPost, fmt.Sprintf("/api/admin/orders/%d/cancel?refundAcknowledged=1", paid.ID), nil); status < 400 {
			t.Fatalf("verified order with stock was cancelled: %d", status)
		}
		// A counter sale takes the units; confirming must then fail without touching stock.
		c.expect(http.StatusCreated, http.MethodPost, "/api/admin/sales", saleInput{RequestKey: requestKey(), BranchID: centro, PaymentMethod: "cash",
			Items: []saleItem{{VariantID: variantM, Quantity: 1}}}, nil)
		if status, _ := c.json(http.MethodPost, fmt.Sprintf("/api/admin/orders/%d/confirm", paid.ID), nil); status != http.StatusConflict {
			t.Fatalf("confirm without stock: %d, want 409", status)
		}
		if got := stockOf(c, centro, variantM); got != 2 {
			t.Fatalf("stock after failed confirm = %d, want 2", got)
		}
		if status, _ := c.json(http.MethodPost, fmt.Sprintf("/api/admin/orders/%d/cancel", paid.ID), nil); status < 400 {
			t.Fatalf("verified cancel without refund acknowledgement: %d", status)
		}
		c.expect(http.StatusNoContent, http.MethodPost, fmt.Sprintf("/api/admin/orders/%d/cancel?refundAcknowledged=1", paid.ID), nil, nil)
		if got := findOrder(c, paid.ID); got.Status != "cancelled" {
			t.Fatalf("verified cancel: %+v", got)
		}
	})

	t.Run("venta en tienda", func(t *testing.T) {
		before := stockOf(c, centro, variantM)
		sale := saleInput{RequestKey: requestKey(), BranchID: centro, PaymentMethod: "card", DiscountMinor: 2000,
			Items: []saleItem{{VariantID: variantM, Quantity: 2}}}
		var first, retry struct {
			ID         int64 `json:"id"`
			TotalMinor int64 `json:"totalMinor"`
		}
		c.expect(http.StatusCreated, http.MethodPost, "/api/admin/sales", sale, &first)
		c.expect(http.StatusOK, http.MethodPost, "/api/admin/sales", sale, &retry)
		if retry.ID != first.ID || first.TotalMinor != 28000 {
			t.Fatalf("sale %+v, retry %+v", first, retry)
		}
		if got := stockOf(c, centro, variantM); got != before-2 {
			t.Fatalf("stock after sale and retry = %d, want %d", got, before-2)
		}
		order := findOrder(c, first.ID)
		if order.Channel != "store" || order.Status != "confirmed" || order.PaymentMethod != "card" || order.DiscountMinor != 2000 {
			t.Fatalf("sale listed as %+v", order)
		}
		sale.RequestKey = requestKey()
		if status, _ := c.json(http.MethodPost, "/api/admin/sales", sale); status != http.StatusConflict {
			t.Fatalf("sale without stock: %d, want 409", status)
		}
		sale.Items[0].Quantity, sale.DiscountMinor = 0, 0
		if status, _ := c.json(http.MethodPost, "/api/admin/sales", sale); status != http.StatusBadRequest {
			t.Fatalf("sale with zero units: %d, want 400", status)
		}
		if got := stockOf(c, centro, variantM); got != 0 {
			t.Fatalf("final stock = %d, want 0", got)
		}
	})

	t.Run("landing: contenido, orden y publicación", func(t *testing.T) {
		var draft landingDraft
		c.expect(http.StatusOK, http.MethodGet, "/api/admin/landing", nil, &draft)
		sections := []sectionInput{
			{Type: "hero", Title: "Portada", Body: "Bienvenida", IsVisible: true, MediaIDs: []int64{}},
			{Type: "benefits", Title: "Beneficios", IsVisible: true, MediaIDs: []int64{},
				Benefits: &benefitsConfig{Items: []benefitItem{{Icon: "qr", Title: "Pago por QR", Text: "Desde tu banco."}}}},
			{Type: "contact", Title: "Contáctanos", Body: "Escríbenos", IsVisible: true, MediaIDs: []int64{},
				Contact: contactConfig{SocialLinks: map[string]string{"instagram": "https://instagram.com/xpander"}}},
			{Type: "text", Title: "Oculta", IsVisible: false, MediaIDs: []int64{}},
		}
		save := func() {
			t.Helper()
			c.expect(http.StatusOK, http.MethodPut, "/api/admin/landing", draftInput{DraftRevision: draft.DraftRevision, Title: "XPANDER", Sections: &sections}, &draft)
		}
		published := func() []string {
			t.Helper()
			c.expect(http.StatusCreated, http.MethodPost, "/api/admin/landing/publish", map[string]int64{"draftRevision": draft.DraftRevision}, nil)
			var landing publishedLanding
			c.expect(http.StatusOK, http.MethodGet, "/api/landing", nil, &landing)
			titles := []string{}
			for _, section := range landing.Sections {
				titles = append(titles, section.Title)
				if section.Type == "benefits" && (section.Benefits == nil || len(section.Benefits.Items) != 1 || section.Benefits.Items[0].Title != "Pago por QR") {
					t.Fatalf("benefits not published: %+v", section.Benefits)
				}
				if section.Type == "contact" && section.Contact.SocialLinks["instagram"] == "" {
					t.Fatalf("contact links not published: %+v", section.Contact)
				}
			}
			return titles
		}
		save()
		if got := strings.Join(published(), ","); got != "Portada,Beneficios,Contáctanos" {
			t.Fatalf("first publication order: %s", got)
		}
		// Reorder (benefits first), edit a title and show the hidden section, keeping the ids.
		ids := map[string]int64{}
		for _, section := range draft.Sections {
			ids[section.Type] = section.ID
		}
		sections = []sectionInput{
			{ID: ids["benefits"], Type: "benefits", Title: "Beneficios", IsVisible: true, MediaIDs: []int64{},
				Benefits: &benefitsConfig{Items: []benefitItem{{Icon: "qr", Title: "Pago por QR", Text: "Desde tu banco."}}}},
			{ID: ids["text"], Type: "text", Title: "Ahora visible", IsVisible: true, MediaIDs: []int64{}},
			{ID: ids["hero"], Type: "hero", Title: "Portada editada", IsVisible: true, MediaIDs: []int64{}},
			{ID: ids["contact"], Type: "contact", Title: "Contáctanos", Body: "Escríbenos", IsVisible: true, MediaIDs: []int64{},
				Contact: contactConfig{SocialLinks: map[string]string{"instagram": "https://instagram.com/xpander"}}},
		}
		save()
		if got := strings.Join(published(), ","); got != "Beneficios,Ahora visible,Portada editada,Contáctanos" {
			t.Fatalf("second publication order: %s", got)
		}
		// Publishing again without changes is rejected.
		if status, _ := c.json(http.MethodPost, "/api/admin/landing/publish", map[string]int64{"draftRevision": draft.DraftRevision}); status != http.StatusConflict {
			t.Fatalf("publish without changes: %d, want 409", status)
		}
	})

	t.Run("logos de la tienda", func(t *testing.T) {
		status, _, headers := c.sendFull(http.MethodGet, "/api/brand/logotipo", "", nil, nil)
		if status != http.StatusFound || headers.Get("Location") != "/brand/xpander-wordmark.png" {
			t.Fatalf("default wordmark: %d %q", status, headers.Get("Location"))
		}
		if status, _ := c.json(http.MethodGet, "/api/brand/otro", nil); status != http.StatusNotFound {
			t.Fatalf("unknown logo kind: %d", status)
		}
		var logo landingMedia
		status, data := c.upload("/api/admin/media", "file", map[string]string{"purpose": "logo", "altText": "Logo"}, testPNG(t, 200), nil)
		if status != http.StatusCreated {
			t.Fatalf("upload logo: %d %s", status, data)
		}
		_ = json.Unmarshal(data, &logo)
		profile := businessProfile{Phone: "+591 70000000", SocialLinks: map[string]string{}, QRMediaID: &qr.ID, QRExpiresOn: expiry, LogoWordmarkMediaID: &logo.ID}
		c.expect(http.StatusOK, http.MethodPut, "/api/admin/business", profile, nil)
		status, _, headers = c.sendFull(http.MethodGet, "/api/brand/logotipo", "", nil, nil)
		if status != http.StatusOK || headers.Get("Content-Type") != "image/png" {
			t.Fatalf("custom wordmark: %d %q", status, headers.Get("Content-Type"))
		}
		if status, _, headers := c.sendFull(http.MethodGet, "/api/brand/isotipo", "", nil, nil); status != http.StatusFound || headers.Get("Location") != "/brand/xpander-x.png" {
			t.Fatalf("default mark: %d", status)
		}
		if status, _ := c.json(http.MethodDelete, fmt.Sprintf("/api/admin/media/%d", logo.ID), nil); status != http.StatusConflict {
			t.Fatalf("trash a logo in use: %d, want 409", status)
		}
		profile.LogoMarkMediaID = &qr.ID
		if status, _ := c.json(http.MethodPut, "/api/admin/business", profile); status != http.StatusBadRequest {
			t.Fatalf("QR image accepted as logo: %d", status)
		}
		profile.LogoWordmarkMediaID, profile.LogoMarkMediaID = nil, nil
		c.expect(http.StatusOK, http.MethodPut, "/api/admin/business", profile, nil)
		if status, _, _ := c.sendFull(http.MethodGet, "/api/brand/logotipo", "", nil, nil); status != http.StatusFound {
			t.Fatalf("back to default wordmark: %d", status)
		}
	})
}
