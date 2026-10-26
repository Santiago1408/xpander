package auth

import (
	"strings"
	"testing"
)

func TestPasswordRoundTrip(t *testing.T) {
	encoded, err := HashPassword("una contraseña segura 123")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("una contraseña segura 123", encoded) {
		t.Fatal("correct password was rejected")
	}
	if VerifyPassword("otra contraseña", encoded) || VerifyPassword("x", "invalid") {
		t.Fatal("invalid password was accepted")
	}
	if !strings.HasPrefix(encoded, "$argon2id$v=19$") {
		t.Fatal("unexpected password hash format")
	}
}

func TestPasswordLength(t *testing.T) {
	if _, err := HashPassword("123456"); err != ErrPasswordLength {
		t.Fatalf("expected length error, got %v", err)
	}
	if _, err := HashPassword("1234567"); err != nil {
		t.Fatalf("seven characters should be accepted: %v", err)
	}
}

func TestSessionToken(t *testing.T) {
	token, wantHash, err := NewSessionToken()
	if err != nil {
		t.Fatal(err)
	}
	gotHash, ok := HashSessionToken(token)
	if !ok || string(gotHash) != string(wantHash) {
		t.Fatal("session hash mismatch")
	}
	if _, ok := HashSessionToken("invalid"); ok {
		t.Fatal("invalid token was accepted")
	}
}

func TestUsername(t *testing.T) {
	for _, name := range []string{"admin", "xpander_admin", "a12"} {
		if !ValidUsername(name) {
			t.Fatalf("rejected username %q", name)
		}
	}
	for _, name := range []string{"ab", "Admin", "a b", "a@b"} {
		if ValidUsername(name) {
			t.Fatalf("accepted username %q", name)
		}
	}
}
