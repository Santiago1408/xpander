package main

import "testing"

func TestParseMediaQuota(t *testing.T) {
	for value, want := range map[string]int64{"": 40 << 30, "40": 40 << 30, "0.5": 512 << 20, "100": 100 << 30} {
		got, err := parseMediaQuota(value)
		if err != nil || got != want {
			t.Fatalf("parseMediaQuota(%q) = %d, %v; want %d", value, got, err, want)
		}
	}
	for _, value := range []string{"0", "-1", "abc", "NaN", "20000"} {
		if _, err := parseMediaQuota(value); err == nil {
			t.Fatalf("parseMediaQuota(%q) accepted", value)
		}
	}
}
