package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type processedImageFile struct {
	SizeKey string
	Key     string
	Mime    string
	Bytes   int64
	Width   int
	Height  int
}

type processedImage struct {
	Main     processedImageFile
	Variants []processedImageFile
}

var imageProcessingSlot = make(chan struct{}, 1)

func (image processedImage) files() []processedImageFile {
	return append([]processedImageFile{image.Main}, image.Variants...)
}

func (image processedImage) removeFiles(directory string) {
	for _, file := range image.files() {
		if file.Key != "" {
			_ = os.Remove(filepath.Join(directory, file.Key))
		}
	}
}

func uploadedImageFormat(data []byte) string {
	switch {
	case len(data) >= 3 && bytes.Equal(data[:3], []byte{0xff, 0xd8, 0xff}):
		return "jpeg"
	case len(data) >= 8 && bytes.Equal(data[:8], []byte("\x89PNG\r\n\x1a\n")):
		return "png"
	case len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP":
		return "webp"
	default:
		return ""
	}
}

// ImageMagick is installed in the API container. The host may use v6 (identify/
// convert) or v7 (magick identify/magick); arguments never pass through a shell.
func runImageTool(ctx context.Context, directory, operation string, args ...string) ([]byte, error) {
	name := operation
	if _, err := exec.LookPath("magick"); err == nil {
		name = "magick"
		args = append([]string{operation}, args...)
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, name, args...)
	command.Env = append(os.Environ(),
		"MAGICK_MEMORY_LIMIT=256MiB", "MAGICK_MAP_LIMIT=512MiB",
		"MAGICK_DISK_LIMIT=1GiB", "MAGICK_THREAD_LIMIT=1", "MAGICK_TIME_LIMIT=30",
		"MAGICK_TEMPORARY_PATH="+directory)
	output, err := command.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("%s failed: %w: %s", operation, err, strings.TrimSpace(string(output)))
	}
	return output, nil
}

func imageDimensions(ctx context.Context, path string) (int, int, error) {
	output, err := runImageTool(ctx, filepath.Dir(path), "identify", "-ping", "-format", "%w %h %n\n", path)
	if err != nil {
		return 0, 0, err
	}
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	if len(lines) != 1 {
		return 0, 0, errors.New("no se admiten imágenes animadas o de varias páginas")
	}
	parts := strings.Fields(lines[0])
	if len(parts) != 3 || parts[2] != "1" {
		return 0, 0, errors.New("no se admiten imágenes animadas o de varias páginas")
	}
	width, errW := strconv.Atoi(parts[0])
	height, errH := strconv.Atoi(parts[1])
	if errW != nil || errH != nil || width < 1 || height < 1 {
		return 0, 0, errors.New("dimensiones de imagen inválidas")
	}
	return width, height, nil
}

func savedImageFile(ctx context.Context, path, sizeKey, key, mime string) (processedImageFile, error) {
	stat, err := os.Stat(path)
	if err != nil {
		return processedImageFile{}, err
	}
	if !stat.Mode().IsRegular() || stat.Size() < 1 || stat.Size() > 16<<20 {
		return processedImageFile{}, errors.New("imagen procesada demasiado grande o vacía")
	}
	width, height, err := imageDimensions(ctx, path)
	if err != nil {
		return processedImageFile{}, err
	}
	return processedImageFile{SizeKey: sizeKey, Key: key, Mime: mime,
		Bytes: stat.Size(), Width: width, Height: height}, nil
}

func processUploadedImage(ctx context.Context, directory string, data []byte, purpose string) (result processedImage, err error) {
	if len(data) == 0 || len(data) > maxImageBytes || uploadedImageFormat(data) == "" {
		return result, errors.New("usa una imagen JPEG, PNG o WebP de hasta 8 MiB")
	}
	if purpose != "photo" && purpose != "qr" && purpose != "logo" {
		return result, errors.New("tipo de imagen no admitido")
	}
	select {
	case imageProcessingSlot <- struct{}{}:
		defer func() { <-imageProcessingSlot }()
	case <-ctx.Done():
		return result, ctx.Err()
	}
	if err = os.MkdirAll(directory, 0700); err != nil {
		return result, err
	}
	input, err := os.CreateTemp(directory, ".upload-*")
	if err != nil {
		return result, err
	}
	inputPath := input.Name()
	defer os.Remove(inputPath)
	if _, err = input.Write(data); err != nil {
		input.Close()
		return result, err
	}
	if err = input.Close(); err != nil {
		return result, err
	}
	width, height, err := imageDimensions(ctx, inputPath)
	if err != nil {
		return result, err
	}
	if int64(width)*int64(height) > maxImagePixels {
		return result, errors.New("imagen mayor a 12 millones de píxeles")
	}
	name := make([]byte, 16)
	if _, err = rand.Read(name); err != nil {
		return result, err
	}
	base := hex.EncodeToString(name)
	var created []string
	defer func() {
		if err != nil {
			for _, path := range created {
				_ = os.Remove(path)
			}
		}
	}()
	mainExtension, mainMime := ".webp", "image/webp"
	// QR codes and logos stay lossless PNG; logos keep their transparency.
	if purpose == "qr" || purpose == "logo" {
		mainExtension, mainMime = ".png", "image/png"
	}
	mainKey := base + mainExtension
	mainPath := filepath.Join(directory, mainKey)
	created = append(created, mainPath)
	arguments := []string{inputPath + "[0]", "-auto-orient", "-strip"}
	if purpose == "qr" {
		arguments = append(arguments, "-define", "png:compression-level=9", "png:"+mainPath)
	} else if purpose == "logo" {
		arguments = append(arguments, "-resize", "1920x1920>", "-define", "png:compression-level=9", "png:"+mainPath)
	} else {
		arguments = append(arguments, "-resize", "1920x1920>", "-quality", "82",
			"-define", "webp:method=4", "webp:"+mainPath)
	}
	if _, err = runImageTool(ctx, directory, "convert", arguments...); err != nil {
		return result, err
	}
	result.Main, err = savedImageFile(ctx, mainPath, "", mainKey, mainMime)
	if err != nil {
		return result, err
	}
	if purpose == "qr" || purpose == "logo" {
		return result, nil
	}
	for _, preset := range []struct {
		key   string
		limit int
	}{{"thumb", 320}, {"card", 800}, {"detail", 1200}} {
		if max(width, height) <= preset.limit {
			continue
		}
		key := fmt.Sprintf("%s-%s.webp", base, preset.key)
		path := filepath.Join(directory, key)
		created = append(created, path)
		_, err = runImageTool(ctx, directory, "convert", inputPath+"[0]", "-auto-orient", "-strip",
			"-resize", fmt.Sprintf("%dx%d>", preset.limit, preset.limit), "-quality", "80",
			"-define", "webp:method=4", "webp:"+path)
		if err != nil {
			return result, err
		}
		file, fileErr := savedImageFile(ctx, path, preset.key, key, "image/webp")
		if fileErr != nil {
			err = fileErr
			return result, err
		}
		result.Variants = append(result.Variants, file)
	}
	return result, nil
}
