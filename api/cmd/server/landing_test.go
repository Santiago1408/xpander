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
