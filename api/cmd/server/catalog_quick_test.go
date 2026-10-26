package main

import "testing"

func TestCatalogKeyNormalizesEquivalentText(t *testing.T) {
	for _, value := range []string{"niños", " NINOS ", "Ni ños"} {
		if got := catalogKey(value); got != "NINOS" {
			t.Fatalf("catalogKey(%q) = %q", value, got)
		}
	}
}

func testQuickInput() quickProductInput {
	return quickProductInput{
		Name: "  Polera de fútbol ", Description: "Tela suave y cómoda.",
		Style: " deportiva ", Audience: "niños", Color: "azul", BrandID: 3,
		Status: "active", Variants: []quickVariantInput{{
			SizeAlpha: "m", SizeNumeric: "38", RegularPriceMinor: 12000, IsActive: true,
		}},
	}
}

func TestNormalizeQuickProductSingleVariantRequiresRealSize(t *testing.T) {
	input := testQuickInput()
	if err := normalizeQuickProduct(&input); err != nil {
		t.Fatal(err)
	}
	if input.Name != "POLERA DE FÚTBOL" || input.Description != "Tela suave y cómoda." ||
		input.Style != "DEPORTIVA" || input.Audience != "NIÑOS" || input.Color != "AZUL" ||
		input.Variants[0].SizeAlpha != "M" || input.Variants[0].SizeNumeric != "38" {
		t.Fatalf("unexpected normalization: %+v", input)
	}
	input.Variants[0].SizeAlpha = ""
	if err := normalizeQuickProduct(&input); err != nil {
		t.Fatalf("numeric-only size rejected: %v", err)
	}
	input.Variants[0].SizeAlpha, input.Variants[0].SizeNumeric = "XL", ""
	if err := normalizeQuickProduct(&input); err != nil {
		t.Fatalf("alphabetic-only size rejected: %v", err)
	}
	input.Variants[0].SizeAlpha, input.Variants[0].SizeNumeric = "", ""
	if err := normalizeQuickProduct(&input); err == nil {
		t.Fatal("empty size should be rejected")
	}
	input.Variants[0].SizeAlpha = "ÚNICA"
	if err := normalizeQuickProduct(&input); err == nil {
		t.Fatal("placeholder size should be rejected")
	}
}

func TestNormalizeQuickProductMultipleSizes(t *testing.T) {
	input := testQuickInput()
	input.Variants = append(input.Variants, quickVariantInput{
		SizeAlpha: "L", SizeNumeric: "40", RegularPriceMinor: 13000, IsActive: true,
	})
	if err := normalizeQuickProduct(&input); err != nil {
		t.Fatal(err)
	}
	input.Variants[1].SizeAlpha = " m "
	if err := normalizeQuickProduct(&input); err == nil {
		t.Fatal("duplicate alphabetic size should be rejected")
	}
	input.Variants[1].SizeAlpha = "L"
	input.Variants[1].SizeNumeric = " 38 "
	if err := normalizeQuickProduct(&input); err == nil {
		t.Fatal("duplicate numeric size should be rejected")
	}
}

func TestNormalizeQuickProductMultiBranchStock(t *testing.T) {
	input := testQuickInput()
	input.Variants[0].StockEntries = []quickStockEntry{
		{BranchID: 1, Quantity: 3, UnitCostMinor: 8000},
		{BranchID: 2, Quantity: 2, UnitCostMinor: 8500},
	}
	if err := normalizeQuickProduct(&input); err != nil {
		t.Fatal(err)
	}
	input.Variants[0].StockEntries[1].BranchID = 1
	if err := normalizeQuickProduct(&input); err == nil {
		t.Fatal("duplicate branch entry should be rejected")
	}
}
