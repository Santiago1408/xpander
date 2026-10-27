package main

import (
	"errors"
	"strings"
)

// A "benefits" section lists short selling points, each with an icon from a
// fixed set, a title and a sentence.
type benefitItem struct {
	Icon  string `json:"icon"`
	Title string `json:"title"`
	Text  string `json:"text"`
}

type benefitsConfig struct {
	Items []benefitItem `json:"items"`
}

var benefitIcons = map[string]bool{
	"store": true, "delivery": true, "qr": true, "chat": true, "card": true,
	"exchange": true, "clock": true, "star": true, "shield": true, "tag": true,
}

func (config *benefitsConfig) normalize() {
	if config.Items == nil {
		config.Items = []benefitItem{}
	}
	for index := range config.Items {
		item := &config.Items[index]
		item.Title = strings.TrimSpace(item.Title)
		item.Text = strings.TrimSpace(item.Text)
	}
}

func validateBenefitsConfig(sectionType string, config *benefitsConfig) error {
	if sectionType != "benefits" {
		if config != nil && len(config.Items) > 0 {
			return errors.New("los beneficios solo corresponden a esa sección")
		}
		return nil
	}
	normalized := benefitsConfig{}
	if config != nil {
		normalized = *config
	}
	normalized.normalize()
	if len(normalized.Items) > 6 {
		return errors.New("la sección admite hasta 6 beneficios")
	}
	for _, item := range normalized.Items {
		if !benefitIcons[item.Icon] || len(item.Title) > 80 || len(item.Text) > 240 {
			return errors.New("beneficio inválido")
		}
	}
	return nil
}
