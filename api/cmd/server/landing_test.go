package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestValidateDraft(t *testing.T) {
	sections := []sectionInput{{Type: "hero", Title: "XPANDER", IsVisible: true}}
	valid := draftInput{Title: "XPANDER", Sections: &sections}
	if err := validateDraft(valid); err != nil {
		t.Fatalf("valid draft rejected: %v", err)
	}
	sections[0].Type = "script"
	if err := validateDraft(valid); err == nil {
		t.Fatal("unsupported section type accepted")
	}
	sections[0].Type = "hero"
	sections[0].MediaIDs = []int64{4, 4}
	if err := validateDraft(valid); err == nil {
		t.Fatal("duplicate media accepted")
	}
}

func TestValidateCategoriesSection(t *testing.T) {
	config := &categoriesConfig{Layout: "panels", Columns: 2, Tiles: []categoryTile{
		{MediaID: 7, Title: "Mujer", LinkKind: "audience", LinkValue: "MUJER"},
		{MediaID: 0, Title: "Próximamente"},
		{MediaID: 5, Title: "Hombre", LinkKind: "audience", LinkValue: "HOMBRE"},
	}}
	if err := validateCategoriesConfig("categories", config, []int64{7, 5}); err != nil {
		t.Fatalf("valid blocks rejected: %v", err)
	}
	if err := validateCategoriesConfig("categories", config, []int64{5, 7}); err == nil {
		t.Fatal("media out of tile order accepted")
	}
	config.Tiles[0].LinkValue = ""
	if err := validateCategoriesConfig("categories", config, []int64{7, 5}); err == nil {
		t.Fatal("link without destination accepted")
	}
	config.Tiles[0].LinkValue = "MUJER"
	config.Columns = 4
	if err := validateCategoriesConfig("categories", config, []int64{7, 5}); err == nil {
		t.Fatal("four columns accepted")
	}
	if err := validateCategoriesConfig("text", &categoriesConfig{Tiles: []categoryTile{{Title: "x"}}}, nil); err == nil {
		t.Fatal("blocks accepted outside their section")
	}
	if err := validateCategoriesConfig("categories", nil, nil); err != nil {
		t.Fatalf("empty blocks section rejected: %v", err)
	}
}

func TestValidateBenefitsSection(t *testing.T) {
	config := &benefitsConfig{Items: []benefitItem{{Icon: "store", Title: "Recojo o envío", Text: "Retira en la sucursal."}}}
	if err := validateBenefitsConfig("benefits", config); err != nil {
		t.Fatalf("valid benefits rejected: %v", err)
	}
	config.Items[0].Icon = "rocket"
	if err := validateBenefitsConfig("benefits", config); err == nil {
		t.Fatal("unknown icon accepted")
	}
	config.Items[0].Icon = "qr"
	if err := validateBenefitsConfig("text", config); err == nil {
		t.Fatal("benefits accepted outside their section")
	}
	many := &benefitsConfig{}
	for range 7 {
		many.Items = append(many.Items, benefitItem{Icon: "qr", Title: "x"})
	}
	if err := validateBenefitsConfig("benefits", many); err == nil {
		t.Fatal("seven benefits accepted")
	}
}

func TestDecodeUploadedImage(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 2, 2))
	canvas.Set(0, 0, color.RGBA{R: 255, A: 255})
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, canvas); err != nil {
		t.Fatal(err)
	}
	_, mimeType, extension, err := decodeUploadedImage(encoded.Bytes())
	if err != nil || mimeType != "image/png" || extension != ".png" {
		t.Fatalf("valid PNG rejected: %v", err)
	}
	if _, _, _, err := decodeUploadedImage([]byte("<svg></svg>")); err == nil {
		t.Fatal("SVG was accepted")
	}
}
