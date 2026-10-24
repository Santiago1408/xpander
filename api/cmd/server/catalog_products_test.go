package main

import "testing"

func TestProductValidationAndOptionSignature(t *testing.T) {
	input := productInput{
		Slug: "polera-futbol", Name: "Polera de fútbol", CategoryID: 1,
		Status: "active", Variants: []productVariant{{SKU: "XP-001", PriceMinor: 12000, IsActive: true}},
	}
	if err := validateProductInput(input); err != nil {
		t.Fatalf("valid product rejected: %v", err)
	}
	input.Variants[0].PriceMinor = 0
	if err := validateProductInput(input); err == nil {
		t.Fatal("active product accepted a zero-price active variant")
	}
	input.Variants[0].PriceMinor = 12000
	options := map[int64]optionInfo{
		8:  {definitionID: 2, scope: "variant", active: true},
		9:  {definitionID: 1, scope: "variant", active: true},
		10: {definitionID: 2, scope: "variant", active: true},
		11: {definitionID: 3, scope: "product", active: true},
	}
	forward, err := selectionSignature([]int64{8, 9}, options, "variant", true)
	if err != nil {
		t.Fatal(err)
	}
	reverse, err := selectionSignature([]int64{9, 8}, options, "variant", true)
	if err != nil || forward != reverse || forward != "1:9|2:8" {
		t.Fatalf("signature is not canonical: %q and %q (%v)", forward, reverse, err)
	}
	if _, err := selectionSignature([]int64{8, 10}, options, "variant", true); err == nil {
		t.Fatal("two choices for one attribute were accepted")
	}
	if _, err := selectionSignature([]int64{11}, options, "variant", true); err == nil {
		t.Fatal("product-scoped option was accepted in a variant")
	}
}
