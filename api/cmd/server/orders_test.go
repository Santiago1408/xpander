package main

import (
	"strings"
	"testing"
)

func sampleCheckout() checkoutInput {
	return checkoutInput{
		RequestKey: "11111111-1111-4111-8111-111111111111", PickupBranchID: 1,
		CustomerName: " Ana  Pérez ", CustomerPhone: "+591 70782380",
		Items: []checkoutItem{
			{VariantID: 7, Quantity: 2, ExpectedUnitPriceMinor: 12000},
			{VariantID: 3, Quantity: 1, ExpectedUnitPriceMinor: 8000},
		},
	}
}

func TestCheckoutNormalizesForIdempotency(t *testing.T) {
	first := sampleCheckout()
	if err := normalizeCheckout(&first); err != nil {
		t.Fatal(err)
	}
	if first.CustomerName != "Ana Pérez" || first.Items[0].VariantID != 3 {
		t.Fatalf("unexpected normalized checkout: %+v", first)
	}
	second := sampleCheckout()
	second.Items[0], second.Items[1] = second.Items[1], second.Items[0]
	if err := normalizeCheckout(&second); err != nil {
		t.Fatal(err)
	}
	if checkoutFingerprint(first) != checkoutFingerprint(second) {
		t.Fatal("item order changed the idempotency fingerprint")
	}
	second.Items[0].Quantity++
	if checkoutFingerprint(first) == checkoutFingerprint(second) {
		t.Fatal("different quantities should not reuse a request key")
	}
	second = first
	second.PaymentMethod = "qr"
	if checkoutFingerprint(first) == checkoutFingerprint(second) {
		t.Fatal("changing the payment method must not reuse a request key")
	}
}

func TestCheckoutRejectsDuplicateOrInvalidItems(t *testing.T) {
	input := sampleCheckout()
	input.Items[1].VariantID = input.Items[0].VariantID
	if err := normalizeCheckout(&input); err == nil {
		t.Fatal("duplicate variant accepted")
	}
	input = sampleCheckout()
	input.Items[0].Quantity = 0
	if err := normalizeCheckout(&input); err == nil {
		t.Fatal("zero quantity accepted")
	}
	input = sampleCheckout()
	input.CustomerPhone = "sin teléfono"
	if err := normalizeCheckout(&input); err == nil {
		t.Fatal("invalid phone accepted")
	}
}

func TestOrderMessageContainsPersistedDetails(t *testing.T) {
	input := sampleCheckout()
	_ = normalizeCheckout(&input)
	message := buildOrderMessage(42, input, pickupBranch{Name: "CENTRO", Address: "CALLE 1"},
		[]orderLine{{ProductName: "POLERA", VariantLabel: "M / 38 · código 004201",
			UnitPrice: 12000, Quantity: 2}}, 24000)
	for _, part := range []string{"XP-000042", "Ana Pérez", "CENTRO", "POLERA", "M / 38", "Bs 240,00"} {
		if !strings.Contains(message, part) {
			t.Fatalf("message missing %q: %s", part, message)
		}
	}
	if !strings.HasPrefix(orderWhatsAppURL("59170782380", message), "https://wa.me/59170782380?text=") {
		t.Fatal("invalid WhatsApp URL")
	}
}

func TestCheckoutDeliveryMethod(t *testing.T) {
	input := sampleCheckout()
	if err := normalizeCheckout(&input); err != nil || input.DeliveryMethod != "pickup" {
		t.Fatalf("missing delivery method should default to pickup: %q %v", input.DeliveryMethod, err)
	}
	pickup := checkoutFingerprint(input)
	legacy := sampleCheckout()
	_ = normalizeCheckout(&legacy)
	legacy.DeliveryMethod = ""
	if checkoutFingerprint(legacy) != pickup {
		t.Fatal("pickup orders must keep the fingerprint used before delivery existed")
	}
	input.DeliveryMethod = "delivery"
	if checkoutFingerprint(input) == pickup {
		t.Fatal("changing the delivery method must not reuse a request key")
	}
	invalid := sampleCheckout()
	invalid.DeliveryMethod = "courier"
	if err := normalizeCheckout(&invalid); err == nil {
		t.Fatal("unknown delivery method accepted")
	}
}

func TestDeliveryOrderMessage(t *testing.T) {
	input := sampleCheckout()
	input.DeliveryMethod = "delivery"
	input.PaymentMethod = "qr"
	_ = normalizeCheckout(&input)
	message := buildOrderMessage(7, input, pickupBranch{Name: "CENTRO", Address: "CALLE 1"},
		[]orderLine{{ProductName: "POLERA", VariantLabel: "M", UnitPrice: 12000, Quantity: 1}}, 12000)
	for _, part := range []string{"envío del pedido XP-000007", "envío a domicilio", "despacha: CENTRO", "solo los productos"} {
		if !strings.Contains(message, part) {
			t.Fatalf("delivery message missing %q: %s", part, message)
		}
	}
	if strings.Contains(message, "recojo") {
		t.Fatalf("delivery message mentions pickup: %s", message)
	}
}

func TestOrderCancellationRules(t *testing.T) {
	cases := []struct {
		status, payment    string
		stockShort, refund bool
		allowed            bool
	}{
		{"pending", "not_required", false, false, true}, {"pending", "awaiting_receipt", false, false, true},
		{"pending", "submitted", false, false, true}, {"pending", "rejected", false, false, true},
		{"pending", "verified", false, true, false}, {"pending", "verified", true, false, false},
		{"pending", "verified", true, true, true},
		{"confirmed", "verified", true, true, false}, {"confirmed", "not_required", false, false, false},
	}
	for _, item := range cases {
		if err := cancellable(item.status, item.payment, item.stockShort, item.refund); (err == nil) != item.allowed {
			t.Fatalf("cancellable(%+v) = %v", item, err)
		}
	}
}

func TestNormalizeStoreSale(t *testing.T) {
	sale := saleInput{RequestKey: "22222222-2222-4222-8222-222222222222", BranchID: 1, PaymentMethod: "cash",
		Items: []saleItem{{VariantID: 9, Quantity: 2}, {VariantID: 4, Quantity: 1}}}
	if err := normalizeSale(&sale); err != nil {
		t.Fatal(err)
	}
	if sale.CustomerName != "Cliente en tienda" || sale.CustomerPhone != "Sin registrar" || sale.Items[0].VariantID != 4 {
		t.Fatalf("unexpected normalized sale: %+v", sale)
	}
	reordered := sale
	reordered.Items = []saleItem{{VariantID: 9, Quantity: 2}, {VariantID: 4, Quantity: 1}}
	_ = normalizeSale(&reordered)
	if saleFingerprint(sale) != saleFingerprint(reordered) {
		t.Fatal("item order changed the sale fingerprint")
	}
	for _, broken := range []func(*saleInput){
		func(s *saleInput) { s.PaymentMethod = "whatsapp" },
		func(s *saleInput) { s.Items = nil },
		func(s *saleInput) { s.Items = []saleItem{{VariantID: 1, Quantity: 1}, {VariantID: 1, Quantity: 2}} },
		func(s *saleInput) { s.DiscountMinor = -1 },
		func(s *saleInput) { s.RequestKey = "x" },
	} {
		copy := sale
		copy.Items = append([]saleItem(nil), sale.Items...)
		broken(&copy)
		if err := normalizeSale(&copy); err == nil {
			t.Fatalf("invalid sale accepted: %+v", copy)
		}
	}
}
