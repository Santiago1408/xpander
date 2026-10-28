package main

import "testing"

func TestBolivianMobile(t *testing.T) {
	accepted := map[string]string{
		"71234567":       "71234567",
		"7123 4567":      "71234567",
		"6-123-4567":     "61234567",
		"+591 71234567":  "71234567",
		"591 7123-4567":  "71234567",
		"(+591) 6123456": "",
	}
	for raw, want := range accepted {
		got, ok := bolivianMobile(raw)
		if want == "" {
			if ok {
				t.Errorf("%q accepted as %q", raw, got)
			}
			continue
		}
		if !ok || got != want {
			t.Errorf("%q = %q, %v; want %q", raw, got, ok, want)
		}
	}
	for _, raw := range []string{"", "2123456", "21234567", "712345678", "7123456a", "+54 71234567"} {
		if got, ok := bolivianMobile(raw); ok {
			t.Errorf("%q accepted as %q", raw, got)
		}
	}
}

func TestNormalizeSuggestion(t *testing.T) {
	input := suggestionInput{Name: "  Ana   Pérez ", Phone: "+591 7123 4567", Message: "  Chamarras de cuero talla M  "}
	if err := normalizeSuggestion(&input); err != nil {
		t.Fatal(err)
	}
	if input.Name != "Ana Pérez" || input.Phone != "71234567" || input.Message != "Chamarras de cuero talla M" {
		t.Fatalf("unexpected normalization: %+v", input)
	}
	for _, invalid := range []suggestionInput{
		{Name: "", Phone: "71234567", Message: "Jeans"},
		{Name: "Ana", Phone: "1234", Message: "Jeans"},
		{Name: "Ana", Phone: "71234567", Message: "  "},
	} {
		if err := normalizeSuggestion(&invalid); err == nil {
			t.Errorf("invalid suggestion accepted: %+v", invalid)
		}
	}
}
