package main

import "testing"

func TestContactConfigRejectsUnsafeLinksAndIncompleteMap(t *testing.T) {
	tests := []struct {
		name string
		config contactConfig
	}{
		{"script social link", contactConfig{SocialLinks: map[string]string{"instagram": "javascript:alert(1)"}}},
		{"untrusted map host", contactConfig{MapURL: "https://google.com.example.org/maps/1"}},
		{"share link cannot be embedded", contactConfig{MapURL: "https://maps.app.goo.gl/place"}},
		{"untrusted embed host", contactConfig{MapURL: "https://www.google.com.example.org/maps/embed?q=x"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validateContactConfig("contact", test.config); err == nil {
				t.Fatal("invalid contact configuration accepted")
			}
		})
	}
	valid := contactConfig{SocialLinks: map[string]string{"instagram": "https://www.instagram.com/xpander"},
		MapURL: "https://www.google.com/maps/embed?pb=example"}
	if err := validateContactConfig("contact", valid); err != nil {
		t.Fatalf("valid contact configuration rejected: %v", err)
	}
	legacy := contactConfig{MapURL: "https://maps.app.goo.gl/place", MapEmbedURL: valid.MapURL}
	legacy.normalize()
	if legacy.MapURL != valid.MapURL || legacy.MapEmbedURL != "" {
		t.Fatal("legacy map links not normalized to one URL")
	}
}
