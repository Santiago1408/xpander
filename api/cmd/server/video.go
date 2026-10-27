package main

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

type videoConfig struct {
	URL      string `json:"url"`
	EmbedURL string `json:"embedUrl"`
}

var youtubeIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
var vimeoIDPattern = regexp.MustCompile(`^[0-9]{1,12}$`)

func videoEmbedURL(raw string) (string, error) {
	if !validHTTPSURL(raw) { return "", errors.New("el video debe usar un enlace HTTPS de YouTube o Vimeo") }
	parsed, _ := url.Parse(raw)
	host := strings.ToLower(parsed.Hostname())
	var id string
	switch host {
	case "youtu.be":
		id = strings.Trim(parsed.Path, "/")
	case "youtube.com", "www.youtube.com", "m.youtube.com":
		parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		if len(parts) == 1 && parts[0] == "watch" { id = parsed.Query().Get("v") }
		if len(parts) == 2 && (parts[0] == "shorts" || parts[0] == "embed" || parts[0] == "live") { id = parts[1] }
	case "vimeo.com", "www.vimeo.com":
		id = strings.Trim(parsed.Path, "/")
	case "player.vimeo.com":
		parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		if len(parts) == 2 && parts[0] == "video" { id = parts[1] }
	}
	if (host == "vimeo.com" || host == "www.vimeo.com" || host == "player.vimeo.com") && vimeoIDPattern.MatchString(id) {
		return fmt.Sprintf("https://player.vimeo.com/video/%s", id), nil
	}
	if youtubeIDPattern.MatchString(id) && (host == "youtu.be" || strings.HasSuffix(host, "youtube.com")) {
		return fmt.Sprintf("https://www.youtube-nocookie.com/embed/%s", id), nil
	}
	return "", errors.New("enlace de video no admitido; usa YouTube o Vimeo")
}

func validateVideoConfig(sectionType string, config videoConfig) error {
	if sectionType != "video" {
		if config.URL != "" || config.EmbedURL != "" { return errors.New("el enlace de video solo corresponde a una sección de video") }
		return nil
	}
	if config.URL == "" { return nil } // Incomplete drafts may be saved.
	_, err := videoEmbedURL(config.URL)
	return err
}

func normalizeVideoConfig(config *videoConfig) error {
	if config.URL == "" { config.EmbedURL = ""; return nil }
	embed, err := videoEmbedURL(config.URL)
	if err != nil { return err }
	config.EmbedURL = embed
	return nil
}
