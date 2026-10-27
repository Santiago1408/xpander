package main

import (
	"errors"
	"net/url"
	"strings"
)

type contactConfig struct {
	SocialLinks map[string]string `json:"socialLinks"`
	MapURL      string            `json:"mapUrl"`
	MapEmbedURL string            `json:"mapEmbedUrl,omitempty"`
}

// Earlier drafts stored separate share and embed URLs. Keep the embed URL as
// the single editable location value when reading an existing draft.
func (config *contactConfig) normalize() {
	if config.MapEmbedURL != "" {
		config.MapURL = config.MapEmbedURL
		config.MapEmbedURL = ""
	}
}

var socialPlatforms = map[string]bool{
	"facebook": true, "instagram": true, "tiktok": true,
	"youtube": true, "x": true, "threads": true,
	"linkedin": true, "pinterest": true, "telegram": true,
	"whatsapp": true,
}

func validHTTPSURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme == "https" && parsed.Hostname() != "" &&
		parsed.User == nil && parsed.Opaque == "" && len(value) <= 2048
}

func validGoogleMapsURL(value string) bool {
	if !validHTTPSURL(value) {
		return false
	}
	parsed, _ := url.Parse(value)
	name := strings.ToLower(parsed.Hostname())
	return (name == "www.google.com" || name == "google.com") &&
		strings.HasPrefix(parsed.Path, "/maps/embed")
}

func validateSocialLinks(links map[string]string) error {
	for platform, link := range links {
		if !socialPlatforms[platform] || (link != "" && !validHTTPSURL(link)) {
			return errors.New("enlace de red social inválido")
		}
	}
	return nil
}

func validateContactConfig(sectionType string, config contactConfig) error {
	config.normalize()
	if sectionType != "contact" && (len(config.SocialLinks) > 0 || config.MapURL != "" || config.MapEmbedURL != "") {
		return errors.New("los datos de contacto solo corresponden a una sección de contacto")
	}
	if err := validateSocialLinks(config.SocialLinks); err != nil {
		return err
	}
	if config.MapURL != "" && !validGoogleMapsURL(config.MapURL) {
		return errors.New("usa la URL de inserción de Google Maps")
	}
	return nil
}
