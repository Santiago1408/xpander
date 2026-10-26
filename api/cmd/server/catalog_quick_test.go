package main

import "testing"

func TestCatalogLabelsNormalizeEquivalentValues(t *testing.T) {
	if got := displayLabel("  polera   de  fútbol  "); got != "POLERA DE FÚTBOL" {
		t.Fatalf("displayLabel = %q", got)
	}
	for _, value := range []string{"niños", " NINOS ", "Ni ños"} {
		if got := catalogKey(value); got != "NINOS" {
			t.Fatalf("catalogKey(%q) = %q", value, got)
		}
	}
}

func quickInput() quickProductInput {
	return quickProductInput{
		Name: "  Polera de fútbol ", Description: "Tela suave y cómoda.",
		Style: " deportiva ", Audience: "niños", Color: "azul", Brand: "Marca X",
		Status: "active", Variants: []quickVariantInput{{
			Size: "m", RegularPriceMinor: 12000, IsActive: true,
		}},
	}
}

func TestNormalizeQuickProductSingleVariant(t *testing.T) {
	input := quickInput()
	if err := normalizeQuickProduct(&input); err != nil {
		t.Fatal(err)
	}
	if input.Name != "POLERA DE FÚTBOL" || input.Description != "Tela suave y cómoda." ||
		input.Style != "DEPORTIVA" || input.Audience != "NIÑOS" ||
		input.Color != "AZUL" || input.Brand != "MARCA X" || input.Variants[0].Size != "ÚNICA" {
		t.Fatalf("unexpected normalization: %+v", input)
	}
}

func TestNormalizeQuickProductMultipleSizes(t *testing.T) {
	input := quickInput()
	input.Variants = append(input.Variants, quickVariantInput{Size: "L", RegularPriceMinor: 13000, IsActive: true})
	if err := normalizeQuickProduct(&input); err != nil {
		t.Fatal(err)
	}
	if input.Variants[0].Size != "M" || input.Variants[1].Size != "L" {
		t.Fatalf("unexpected sizes: %+v", input.Variants)
	}
	input.Variants[1].Size = " m "
	if err := normalizeQuickProduct(&input); err == nil {
		t.Fatal("equivalent sizes should be rejected")
	}
	input.Variants[1].Size = "única"
	if err := normalizeQuickProduct(&input); err == nil {
		t.Fatal("ÚNICA must be used only with one variant")
	}
}

func TestNormalizeQuickProductCostsAndOffers(t *testing.T) {
	input := quickInput()
	offer := int64(13000)
	input.Variants[0].OfferPriceMinor = &offer
	if err := normalizeQuickProduct(&input); err == nil {
		t.Fatal("offer above regular price should be rejected")
	}
	input.Variants[0].OfferPriceMinor = nil
	input.Variants[0].StockQuantity = 3
	if err := normalizeQuickProduct(&input); err == nil {
		t.Fatal("stock without branch and cost should be rejected")
	}
	input.BranchID = 1
	cost := int64(8000)
	input.Variants[0].UnitCostMinor = &cost
	if err := normalizeQuickProduct(&input); err != nil {
		t.Fatal(err)
	}
}
