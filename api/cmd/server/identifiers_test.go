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

func TestBranchCodeUsesUsernameFormat(t *testing.T) {
	for _, name := range []string{"SUCURSAL CENTRO", "EL ALTO · AV. 6 DE MARZO Y CALLE 3 DE MAYO ZONA SUR", "1", "ÑUÑOA"} {
		for _, attempt := range []int{1, 12} {
			code := branchCode(name, attempt)
			if len(code) < 3 || len(code) > 32 || code[0] < 'a' || code[0] > 'z' {
				t.Fatalf("branchCode(%q, %d) = %q", name, attempt, code)
			}
		}
	}
}
