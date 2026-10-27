package main

import "testing"

func TestValidatedProofRejectsInvalidFiles(t *testing.T) {
	for _, data := range [][]byte{nil, []byte("%PDF-1.7\nno trailer"), []byte("<script>alert(1)</script>")} {
		if _, _, _, err := validatedProof(data); err == nil {
			t.Fatal("invalid proof accepted")
		}
	}
	data := []byte("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF")
	_, mimeType, extension, err := validatedProof(data)
	if err != nil || mimeType != "application/pdf" || extension != ".pdf" {
		t.Fatalf("PDF rejected: mime=%q extension=%q error=%v", mimeType, extension, err)
	}
}
