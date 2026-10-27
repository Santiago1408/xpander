package main

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestUploadedImageFormat(t *testing.T) {
	if uploadedImageFormat([]byte("<svg></svg>")) != "" {
		t.Fatal("SVG was accepted")
	}
	if uploadedImageFormat([]byte("RIFFxxxxWEBPVP8 ")) != "webp" {
		t.Fatal("WebP signature was rejected")
	}
	if validStoredImageKey("../../secret.webp", "image/webp") ||
		validStoredImageKey("0123456789abcdef0123456789abcdef.webp", "image/png") {
		t.Fatal("unsafe or mismatched stored image key was accepted")
	}
}

func TestProcessUploadedImage(t *testing.T) {
	if _, err := exec.LookPath("magick"); err != nil {
		if _, err := exec.LookPath("convert"); err != nil {
			t.Skip("ImageMagick is not installed")
		}
	}
	canvas := image.NewRGBA(image.Rect(0, 0, 1000, 600))
	for y := 0; y < 600; y++ {
		for x := 0; x < 1000; x++ {
			canvas.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 60, A: 255})
		}
	}
	var input bytes.Buffer
	if err := png.Encode(&input, canvas); err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	photo, err := processUploadedImage(context.Background(), directory, input.Bytes(), "photo")
	if err != nil {
		t.Fatal(err)
	}
	if photo.Main.Mime != "image/webp" || len(photo.Variants) != 2 ||
		photo.Variants[0].SizeKey != "thumb" || photo.Variants[1].SizeKey != "card" {
		t.Fatalf("unexpected photo output: %+v", photo)
	}
	for _, file := range photo.files() {
		if !validStoredImageKey(file.Key, file.Mime) || file.Bytes < 1 {
			t.Fatalf("invalid output metadata: %+v", file)
		}
		if _, err := os.Stat(filepath.Join(directory, file.Key)); err != nil {
			t.Fatal(err)
		}
	}
	webpInput, err := os.ReadFile(filepath.Join(directory, photo.Main.Key))
	if err != nil {
		t.Fatal(err)
	}
	fromWebP, err := processUploadedImage(context.Background(), directory, webpInput, "photo")
	if err != nil || fromWebP.Main.Mime != "image/webp" {
		t.Fatalf("WebP upload rejected: %v", err)
	}
	qr, err := processUploadedImage(context.Background(), directory, input.Bytes(), "qr")
	if err != nil {
		t.Fatal(err)
	}
	if qr.Main.Mime != "image/png" || len(qr.Variants) != 0 ||
		qr.Main.Width != 1000 || qr.Main.Height != 600 {
		t.Fatalf("QR was resized or encoded lossy: %+v", qr)
	}
	qrFile, err := os.Open(filepath.Join(directory, qr.Main.Key))
	if err != nil {
		t.Fatal(err)
	}
	defer qrFile.Close()
	qrPixels, err := png.Decode(qrFile)
	if err != nil {
		t.Fatal(err)
	}
	if qrPixels.At(500, 300) != canvas.At(500, 300) {
		t.Fatal("QR pixels changed during lossless conversion")
	}
}
