package main

import (
	"fmt"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

func codeFromName(name string) string {
	var result strings.Builder
	lastHyphen := false
	for _, char := range norm.NFD.String(strings.ToLower(strings.TrimSpace(name))) {
		if unicode.Is(unicode.Mn, char) {
			continue
		}
		if char >= 'a' && char <= 'z' || char >= '0' && char <= '9' {
			result.WriteRune(char)
			lastHyphen = false
		} else if result.Len() > 0 && !lastHyphen {
			result.WriteByte('-')
			lastHyphen = true
		}
		if result.Len() >= 64 {
			break
		}
	}
	code := strings.Trim(result.String(), "-")
	if code == "" {
		code = "item"
	} else if code[0] < 'a' || code[0] > 'z' {
		code = "item-" + code
	}
	if len(code) < 2 {
		code += "-x"
	}
	if len(code) > 64 {
		code = strings.TrimRight(code[:64], "-")
	}
	return code
}

func codeWithSuffix(base string, attempt int) string {
	if attempt == 1 {
		return base
	}
	suffix := fmt.Sprintf("-%d", attempt)
	return strings.TrimRight(base[:min(len(base), 64-len(suffix))], "-") + suffix
}
