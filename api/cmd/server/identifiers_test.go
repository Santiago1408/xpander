package main

import "testing"

func TestCodeFromName(t *testing.T) {
	cases := map[string]string{
		"Poleras de Fútbol": "poleras-de-futbol",
		"Niños / Niñas":     "ninos-ninas",
		"123":               "item-123",
		"X":                 "x-x",
	}
	for input, expected := range cases {
		if actual := codeFromName(input); actual != expected {
			t.Fatalf("codeFromName(%q) = %q, want %q", input, actual, expected)
		}
	}
	if actual := codeWithSuffix("poleras", 2); actual != "poleras-2" {
		t.Fatalf("suffix = %q", actual)
	}
}
