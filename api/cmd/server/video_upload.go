package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Videos uploaded from the panel play muted and looped in the landing (cover,
// gallery and image blocks). The server keeps at most five of them, of up to
// thirty seconds each, re-encoded with ffmpeg to an H.264 MP4 that every
// browser plays, without audio, plus WebP stills used as posters.
const (
	maxVideoUploadBytes = 100 << 20
	maxStoredVideos     = 5
	maxVideoSeconds     = 30
	maxVideoOutputBytes = 40 << 20
)

var videoProcessingSlot = make(chan struct{}, 1)

type videoProbe struct {
	Streams []struct {
		CodecType string `json:"codec_type"`
		Width     int    `json:"width"`
		Height    int    `json:"height"`
	} `json:"streams"`
	Format struct {
		FormatName string `json:"format_name"`
		Duration   string `json:"duration"`
	} `json:"format"`
}

type videoError struct{ message string }

func (err videoError) Error() string { return err.message }

func runVideoTool(ctx context.Context, timeout time.Duration, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	output, err := exec.CommandContext(ctx, name, args...).Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return nil, fmt.Errorf("%s failed: %w: %s", name, err, strings.TrimSpace(string(exitErr.Stderr)))
		}
		return nil, fmt.Errorf("%s failed: %w", name, err)
	}
	return output, nil
}

// probeVideo reads the container, size and duration of a local file. Only the
// MP4/MOV and Matroska/WebM demuxers are accepted, which also keeps ffmpeg away
// from playlist formats that could reference other files.
func probeVideo(ctx context.Context, path string) (demuxer string, width, height int, seconds float64, err error) {
	output, err := runVideoTool(ctx, 30*time.Second, "ffprobe", "-v", "error", "-protocol_whitelist", "file",
		"-show_entries", "format=format_name,duration:stream=codec_type,width,height", "-of", "json", path)
	if err != nil {
		return "", 0, 0, 0, videoError{"no se pudo leer el video; usa un archivo MP4, MOV o WebM"}
	}
	var probe videoProbe
	if err := json.Unmarshal(output, &probe); err != nil {
		return "", 0, 0, 0, err
	}
	switch {
	case strings.Contains(probe.Format.FormatName, "mp4") || strings.Contains(probe.Format.FormatName, "mov"):
		demuxer = "mov"
	case strings.Contains(probe.Format.FormatName, "matroska") || strings.Contains(probe.Format.FormatName, "webm"):
		demuxer = "matroska"
	default:
		return "", 0, 0, 0, videoError{"formato de video no admitido; usa MP4, MOV o WebM"}
	}
	for _, stream := range probe.Streams {
		if stream.CodecType == "video" && stream.Width > 0 && stream.Height > 0 {
			width, height = stream.Width, stream.Height
			break
		}
	}
	if width == 0 {
		return "", 0, 0, 0, videoError{"el archivo no contiene imagen de video"}
	}
	seconds, err = strconv.ParseFloat(probe.Format.Duration, 64)
	if err != nil || math.IsNaN(seconds) || seconds <= 0 {
		return "", 0, 0, 0, videoError{"no se pudo leer la duración del video"}
	}
	return demuxer, width, height, seconds, nil
}

// processUploadedVideo turns the uploaded file into the stored MP4 and its
// poster stills. Every file it returns lives in directory.
func processUploadedVideo(ctx context.Context, directory, inputPath string) (result processedImage, err error) {
	select {
	case videoProcessingSlot <- struct{}{}:
		defer func() { <-videoProcessingSlot }()
	case <-ctx.Done():
		return result, ctx.Err()
	}
	demuxer, _, _, seconds, err := probeVideo(ctx, inputPath)
	if err != nil {
		return result, err
	}
	// Containers round their duration; allow half a second over the limit.
	if seconds > maxVideoSeconds+0.5 {
		return result, videoError{fmt.Sprintf("el video dura %.0f segundos; el máximo es %d. Recórtalo antes de subirlo", math.Ceil(seconds), maxVideoSeconds)}
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
	mainKey := base + ".mp4"
	mainPath := filepath.Join(directory, mainKey)
	created = append(created, mainPath)
	// At most 1920 px on the long side (never upscaled), 30 fps, no audio, and the
	// index at the start of the file so playback begins before it fully loads.
	_, err = runVideoTool(ctx, 4*time.Minute, "ffmpeg", "-nostdin", "-hide_banner", "-v", "error",
		"-protocol_whitelist", "file", "-f", demuxer, "-i", inputPath,
		"-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1", "-t", strconv.Itoa(maxVideoSeconds+1),
		"-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
		"-fpsmax", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
		"-maxrate", "4M", "-bufsize", "8M", "-pix_fmt", "yuv420p", "-threads", "2",
		"-movflags", "+faststart", "-f", "mp4", "-y", mainPath)
	if err != nil {
		slog.Warn("video transcoding failed", "error", err)
		if errors.Is(err, exec.ErrNotFound) {
			return result, err
		}
		return result, videoError{"no se pudo procesar el video; prueba con otro archivo MP4 o MOV"}
	}
	stat, err := os.Stat(mainPath)
	if err != nil {
		return result, err
	}
	if stat.Size() < 1 || stat.Size() > maxVideoOutputBytes {
		return result, videoError{"el video procesado es demasiado pesado; súbelo con menor resolución"}
	}
	_, width, height, _, err := probeVideo(ctx, mainPath)
	if err != nil {
		return result, err
	}
	result.Main = processedImageFile{Key: mainKey, Mime: "video/mp4", Bytes: stat.Size(), Width: width, Height: height}

	// The first frame, as WebP stills in the same sizes as photos.
	framePath := filepath.Join(directory, base+"-frame.png")
	defer os.Remove(framePath)
	if _, err = runVideoTool(ctx, 30*time.Second, "ffmpeg", "-nostdin", "-hide_banner", "-v", "error",
		"-protocol_whitelist", "file", "-f", "mp4", "-i", mainPath, "-frames:v", "1", "-f", "image2", "-y", framePath); err != nil {
		return result, err
	}
	for _, preset := range []struct {
		key   string
		limit int
	}{{"thumb", 320}, {"card", 800}, {"detail", 1200}} {
		key := fmt.Sprintf("%s-%s.webp", base, preset.key)
		path := filepath.Join(directory, key)
		created = append(created, path)
		if _, err = runImageTool(ctx, directory, "convert", framePath, "-strip",
			"-resize", fmt.Sprintf("%dx%d>", preset.limit, preset.limit), "-quality", "80",
			"-define", "webp:method=4", "webp:"+path); err != nil {
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

// receiveVideoUpload streams the "file" part of the form to a temporary file in
// directory and returns it with the "altText" field.
func receiveVideoUpload(r *http.Request, directory string) (path, altText string, err error) {
	reader, err := r.MultipartReader()
	if err != nil {
		return "", "", videoError{"carga inválida"}
	}
	defer func() {
		if err != nil && path != "" {
			_ = os.Remove(path)
			path = ""
		}
	}()
	for {
		part, partErr := reader.NextPart()
		if partErr == io.EOF {
			break
		}
		if partErr != nil {
			return path, "", videoError{"carga inválida o demasiado grande; el máximo es 100 MB"}
		}
		switch part.FormName() {
		case "altText":
			value, readErr := io.ReadAll(io.LimitReader(part, 1024))
			if readErr != nil {
				return path, "", videoError{"carga inválida"}
			}
			altText = strings.TrimSpace(string(value))
		case "file":
			if path != "" {
				return path, "", videoError{"sube un solo video a la vez"}
			}
			if err = os.MkdirAll(directory, 0700); err != nil {
				return path, "", err
			}
			file, createErr := os.CreateTemp(directory, ".upload-*")
			if createErr != nil {
				return path, "", createErr
			}
			path = file.Name()
			written, copyErr := io.Copy(file, io.LimitReader(part, maxVideoUploadBytes+1))
			closeErr := file.Close()
			if copyErr != nil {
				var maxErr *http.MaxBytesError
				if errors.As(copyErr, &maxErr) {
					return path, "", videoError{"el video supera los 100 MB"}
				}
				return path, "", copyErr
			}
			if closeErr != nil {
				return path, "", closeErr
			}
			if written == 0 || written > maxVideoUploadBytes {
				return path, "", videoError{"el video está vacío o supera los 100 MB"}
			}
		}
		part.Close()
	}
	if path == "" {
		return "", "", videoError{"selecciona un video"}
	}
	return path, altText, nil
}

func (service *landingService) uploadVideo(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.requireOwner(w, r, true); !ok {
		return
	}
	if mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || mediaType != "multipart/form-data" {
		http.Error(w, "se requiere un formulario con el video", http.StatusUnsupportedMediaType)
		return
	}
	var stored int64
	if err := service.pool.QueryRow(r.Context(), `SELECT count(*) FROM media
		WHERE kind='video' AND source_type='local'`).Scan(&stored); err != nil {
		serverError(w, "count stored videos", err)
		return
	}
	if stored >= maxStoredVideos {
		http.Error(w, fmt.Sprintf("ya hay %d videos guardados, el máximo; elimina uno definitivamente desde la Papelera para subir otro", maxStoredVideos), http.StatusConflict)
		return
	}
	used, err := service.mediaUsage(r.Context())
	if err != nil {
		serverError(w, "read media usage", err)
		return
	}
	if used >= service.quotaBytes {
		http.Error(w, quotaExceededMessage(service.quotaBytes), http.StatusInsufficientStorage)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxVideoUploadBytes+(1<<20))
	inputPath, altText, err := receiveVideoUpload(r, service.mediaDir)
	if inputPath != "" {
		defer os.Remove(inputPath)
	}
	var invalid videoError
	if errors.As(err, &invalid) {
		http.Error(w, invalid.message, http.StatusBadRequest)
		return
	}
	if err != nil {
		serverError(w, "receive video upload", err)
		return
	}
	if len(altText) > 200 {
		http.Error(w, "descripción demasiado larga", http.StatusBadRequest)
		return
	}
	processed, err := processUploadedVideo(r.Context(), service.mediaDir, inputPath)
	if errors.As(err, &invalid) {
		http.Error(w, invalid.message, http.StatusBadRequest)
		return
	}
	if err != nil {
		if errors.Is(err, syscall.ENOSPC) || errors.Is(err, exec.ErrNotFound) {
			serverError(w, "process uploaded video", err)
		} else {
			slog.Warn("video upload rejected", "error", err)
			http.Error(w, "no se pudo procesar el video; prueba con otro archivo MP4 o MOV", http.StatusBadRequest)
		}
		return
	}
	removeFiles := true
	defer func() {
		if removeFiles {
			processed.removeFiles(service.mediaDir)
		}
	}()
	var added int64
	for _, file := range processed.files() {
		added += file.Bytes
	}
	if used+added > service.quotaBytes {
		http.Error(w, quotaExceededMessage(service.quotaBytes), http.StatusInsufficientStorage)
		return
	}
	tx, err := service.pool.Begin(r.Context())
	if err != nil {
		serverError(w, "begin video upload", err)
		return
	}
	defer tx.Rollback(context.Background())
	// Two uploads at once could both pass the count above; check again under a lock.
	if _, err := tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(hashtext('xpander-video-upload'))`); err != nil {
		serverError(w, "lock video upload", err)
		return
	}
	if err := tx.QueryRow(r.Context(), `SELECT count(*) FROM media
		WHERE kind='video' AND source_type='local'`).Scan(&stored); err != nil {
		serverError(w, "count stored videos", err)
		return
	}
	if stored >= maxStoredVideos {
		http.Error(w, fmt.Sprintf("ya hay %d videos guardados, el máximo; elimina uno definitivamente desde la Papelera para subir otro", maxStoredVideos), http.StatusConflict)
		return
	}
	var id int64
	err = tx.QueryRow(r.Context(), `INSERT INTO media
		(kind, source_type, purpose, storage_key, mime_type, alt_text,
		file_size_bytes, width_px, height_px)
		VALUES ('video', 'local', 'photo', $1, $2, $3, $4, $5, $6) RETURNING id`,
		processed.Main.Key, processed.Main.Mime, altText, processed.Main.Bytes,
		processed.Main.Width, processed.Main.Height).Scan(&id)
	if err != nil {
		serverError(w, "record uploaded video", err)
		return
	}
	for _, variant := range processed.Variants {
		if _, err := tx.Exec(r.Context(), `INSERT INTO media_variants
			(media_id, size_key, storage_key, mime_type, file_size_bytes, width_px, height_px)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`, id, variant.SizeKey, variant.Key,
			variant.Mime, variant.Bytes, variant.Width, variant.Height); err != nil {
			serverError(w, "record video poster", err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverError(w, "commit video upload", err)
		return
	}
	removeFiles = false
	writeJSON(w, http.StatusCreated, landingMedia{
		ID: id, Kind: "video", URL: fmt.Sprintf("/api/admin/media/%d", id), AltText: altText,
	})
}
