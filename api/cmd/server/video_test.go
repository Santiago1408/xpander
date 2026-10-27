package main

import "testing"

func TestVideoEmbedURL(t *testing.T) {
	tests := []struct { input, expected string }{
		{"https://www.youtube.com/watch?v=9bZkp7q19f0", "https://www.youtube-nocookie.com/embed/9bZkp7q19f0"},
		{"https://youtu.be/9bZkp7q19f0", "https://www.youtube-nocookie.com/embed/9bZkp7q19f0"},
		{"https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"},
	}
	for _, test := range tests {
		actual, err := videoEmbedURL(test.input)
		if err != nil || actual != test.expected { t.Fatalf("%q => %q, %v", test.input, actual, err) }
	}
	for _, input := range []string{"javascript:alert(1)", "https://youtube.com.evil.test/watch?v=9bZkp7q19f0", "https://vimeo.com/not-a-video"} {
		if _, err := videoEmbedURL(input); err == nil { t.Fatalf("unsafe video accepted: %q", input) }
	}
}
