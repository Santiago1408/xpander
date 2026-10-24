package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const (
	argonMemoryKiB = 19 * 1024
	argonTime      = 2
	argonThreads   = 1
	argonKeyLength = 32
	sessionBytes   = 32
)

var (
	ErrPasswordLength = errors.New("password must contain at least 15 characters and at most 1024 bytes")
	usernamePattern   = regexp.MustCompile(`^[a-z][a-z0-9_-]{2,31}$`)
	argonParams       = regexp.MustCompile(`^m=([0-9]+),t=([0-9]+),p=([0-9]+)$`)
)

func ValidUsername(value string) bool {
	return usernamePattern.MatchString(value)
}

func HashPassword(password string) (string, error) {
	if !utf8.ValidString(password) || utf8.RuneCountInString(password) < 15 || len(password) > 1024 {
		return "", ErrPasswordLength
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemoryKiB, argonThreads, argonKeyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argonMemoryKiB, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" || parts[2] != "v=19" {
		return false
	}
	match := argonParams.FindStringSubmatch(parts[3])
	if match == nil {
		return false
	}
	var memory, iterations, threads uint32
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &threads); err != nil {
		return false
	}
	if memory < argonMemoryKiB || memory > 256*1024 || iterations < 1 || iterations > 10 || threads < 1 || threads > 4 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 16 || len(salt) > 64 {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) != argonKeyLength {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, iterations, memory, uint8(threads), argonKeyLength)
	return subtle.ConstantTimeCompare(got, want) == 1
}

// DummyPasswordWork reduces username-enumeration timing differences.
func DummyPasswordWork(password string) {
	_ = argon2.IDKey([]byte(password), []byte("xpander-dummy-salt"), argonTime, argonMemoryKiB, argonThreads, argonKeyLength)
}

func NewSessionToken() (string, []byte, error) {
	raw := make([]byte, sessionBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("generate session token: %w", err)
	}
	sum := sha256.Sum256(raw)
	return base64.RawURLEncoding.EncodeToString(raw), sum[:], nil
}

func HashSessionToken(token string) ([]byte, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) != sessionBytes {
		return nil, false
	}
	sum := sha256.Sum256(raw)
	return sum[:], true
}
