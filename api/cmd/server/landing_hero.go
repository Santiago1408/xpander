package main

import "errors"

// A "hero" section (the cover) has several layouts. "classic" is the original
// split cover; "cover" puts the image or video behind the text with a dark
// overlay chosen by the owner; "split" runs the media to the screen edge; and
// "centered" stacks a centered title over a wide media band.
type heroConfig struct {
	Variant   string `json:"variant"`
	TitleSize string `json:"titleSize"`
	// Overlay is the darkening over the background media, in percent (cover only).
	Overlay      int    `json:"overlay"`
	TextPosition string `json:"textPosition"`
	Height       string `json:"height"`
	HideButtons  bool   `json:"hideButtons"`
}

var heroVariants = map[string]bool{"classic": true, "cover": true, "split": true, "centered": true}
var heroTitleSizes = map[string]bool{"s": true, "m": true, "l": true, "xl": true}

const maxHeroOverlay = 85

// Covers saved before the variants existed read as the classic layout.
func (config *heroConfig) normalize() {
	if config.Variant == "" {
		config.Variant = "classic"
		config.Overlay = 45
	}
	if config.TitleSize == "" {
		config.TitleSize = "l"
	}
	if config.TextPosition == "" {
		config.TextPosition = "bottom"
	}
	if config.Height == "" {
		config.Height = "full"
	}
}

func validateHeroConfig(sectionType string, config *heroConfig) error {
	if sectionType != "hero" {
		if config != nil {
			return errors.New("el diseño de portada solo corresponde a una portada")
		}
		return nil
	}
	if config == nil {
		return nil
	}
	normalized := *config
	normalized.normalize()
	if !heroVariants[normalized.Variant] || !heroTitleSizes[normalized.TitleSize] ||
		normalized.Overlay < 0 || normalized.Overlay > maxHeroOverlay ||
		(normalized.TextPosition != "bottom" && normalized.TextPosition != "center") ||
		(normalized.Height != "full" && normalized.Height != "medium") {
		return errors.New("diseño de portada inválido")
	}
	return nil
}
