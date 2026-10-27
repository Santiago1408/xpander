package main

import (
	"errors"
	"strings"
)

// A "categories" section shows large image blocks, each with its own image,
// text and an optional link to the catalog filtered by style, audience or brand.
type categoryTile struct {
	MediaID   int64  `json:"mediaId"`
	Title     string `json:"title"`
	LinkKind  string `json:"linkKind"`
	LinkValue string `json:"linkValue"`
}

type categoriesConfig struct {
	Layout  string         `json:"layout"`
	Columns int            `json:"columns"`
	Tiles   []categoryTile `json:"tiles"`
}

func (config *categoriesConfig) normalize() {
	if config.Layout == "" {
		config.Layout = "cards"
	}
	if config.Columns == 0 {
		config.Columns = 2
	}
	if config.Tiles == nil {
		config.Tiles = []categoryTile{}
	}
	for index := range config.Tiles {
		tile := &config.Tiles[index]
		tile.Title = strings.TrimSpace(tile.Title)
		tile.LinkValue = strings.TrimSpace(tile.LinkValue)
		if tile.LinkKind == "" {
			tile.LinkValue = ""
		}
	}
}

// validateCategoriesConfig also checks that the section's image list is exactly
// the tiles' images in order, so publication media tracking stays correct.
func validateCategoriesConfig(sectionType string, config *categoriesConfig, mediaIDs []int64) error {
	if sectionType != "categories" {
		if config != nil && (len(config.Tiles) > 0 || config.Layout != "" || config.Columns != 0) {
			return errors.New("los bloques de imágenes solo corresponden a esa sección")
		}
		return nil
	}
	normalized := categoriesConfig{}
	if config != nil {
		normalized = *config
	}
	normalized.normalize()
	if normalized.Layout != "cards" && normalized.Layout != "panels" {
		return errors.New("diseño de bloques inválido")
	}
	if normalized.Columns < 1 || normalized.Columns > 3 || len(normalized.Tiles) > 12 {
		return errors.New("columnas o cantidad de bloques inválida")
	}
	tileMedia := []int64{}
	for _, tile := range normalized.Tiles {
		if tile.MediaID < 0 || len(tile.Title) > 120 || len(tile.LinkValue) > 120 {
			return errors.New("bloque de imagen inválido")
		}
		switch tile.LinkKind {
		case "":
		case "style", "audience", "brand":
			if tile.LinkValue == "" {
				return errors.New("elige el destino del enlace del bloque")
			}
		default:
			return errors.New("enlace de bloque inválido")
		}
		if tile.MediaID > 0 {
			tileMedia = append(tileMedia, tile.MediaID)
		}
	}
	if len(tileMedia) != len(mediaIDs) {
		return errors.New("las imágenes de los bloques no coinciden")
	}
	for index := range tileMedia {
		if tileMedia[index] != mediaIDs[index] {
			return errors.New("las imágenes de los bloques no coinciden")
		}
	}
	return nil
}
