package main

import (
	"encoding/json"
	"testing"
)

func TestRedactedLandingSnapshotPreservesOtherContent(t *testing.T) {
	original := publishedLanding{Title: "XPANDER", Sections: []publishedSection{{
		Key: "hero", Type: "hero", Title: "Nueva temporada",
		Contact: contactConfig{SocialLinks: map[string]string{"instagram": "https://instagram.com/xpander"}},
		Media: []landingMedia{{ID: 7, Kind: "image", URL: "/api/media/7", AltText: "Portada"},
			{ID: 8, Kind: "image", URL: "/api/media/8", AltText: "Otra"}},
	}}}
	raw, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	redacted, err := redactedLandingSnapshot(raw, 7)
	if err != nil {
		t.Fatal(err)
	}
	var result publishedLanding
	if err := json.Unmarshal(redacted, &result); err != nil {
		t.Fatal(err)
	}
	if result.Title != original.Title || result.Sections[0].Title != original.Sections[0].Title {
		t.Fatal("publication text changed during media redaction")
	}
	if result.Sections[0].Contact.SocialLinks["instagram"] != original.Sections[0].Contact.SocialLinks["instagram"] {
		t.Fatal("publication contact links changed during media redaction")
	}
	removed, retained := result.Sections[0].Media[0], result.Sections[0].Media[1]
	if !removed.Removed || removed.URL != "" || removed.AltText != "Imagen eliminada" {
		t.Fatalf("target media not redacted: %+v", removed)
	}
	if retained.Removed || retained.URL != "/api/media/8" || retained.AltText != "Otra" {
		t.Fatalf("unrelated media changed: %+v", retained)
	}
}
