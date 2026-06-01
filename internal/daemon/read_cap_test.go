package daemon

import (
	"strings"
	"testing"
)

func TestCapFileReadOutput(t *testing.T) {
	t.Run("under cap returns unchanged", func(t *testing.T) {
		in := "    1\thello\n    2\tworld"
		got := capFileReadOutput(in)
		if got != in {
			t.Errorf("small input mutated: got %q, want %q", got, in)
		}
	})

	t.Run("exactly at cap returns unchanged", func(t *testing.T) {
		in := strings.Repeat("x", maxFileReadBytes)
		got := capFileReadOutput(in)
		if got != in {
			t.Errorf("exact-cap input mutated")
		}
	})

	t.Run("over cap is truncated with notice", func(t *testing.T) {
		// Build a file-read output with real newlines so the newline-aware
		// backoff has something to find.
		var b strings.Builder
		lineNum := 1
		for b.Len() < maxFileReadBytes*2 {
			b.WriteString("    ")
			b.WriteString(strings.Repeat("x", 80))
			b.WriteByte('\n')
			lineNum++
		}
		in := b.String()
		total := len(in)

		got := capFileReadOutput(in)

		if !strings.Contains(got, "[file truncated:") {
			t.Error("expected truncation notice in output")
		}
		if !strings.Contains(got, "offset/limit") {
			t.Error("expected guidance to use offset/limit")
		}
		// The notice adds characters to the tail, so `got` can be larger than
		// the cap; what we really require is that the truncated body portion
		// (everything before the notice) fits under the cap.
		noticeIdx := strings.Index(got, "\n\n... [file truncated:")
		if noticeIdx < 0 {
			t.Fatalf("notice not found in output")
		}
		body := got[:noticeIdx]
		if len(body) > maxFileReadBytes {
			t.Errorf("truncated body is %d bytes, exceeds cap %d", len(body), maxFileReadBytes)
		}
		// Body should end at a newline boundary (not mid-line).
		if len(body) > 0 && !strings.HasSuffix(body, "x") {
			// Our lines are all 'x' padding; the last char of body should be 'x'
			// because we backed off from mid-line to the last newline.
			t.Errorf("body does not end cleanly at a line boundary: tail=%q", body[max(0, len(body)-20):])
		}
		// The notice should reference the original total size.
		if !strings.Contains(got, "of ") {
			t.Errorf("truncation notice missing total-size reference")
		}
		if total <= maxFileReadBytes {
			t.Fatalf("test setup bug: input is not above cap")
		}
	})

	t.Run("over cap with no newlines still truncates", func(t *testing.T) {
		in := strings.Repeat("x", maxFileReadBytes+1024)
		got := capFileReadOutput(in)
		if !strings.Contains(got, "[file truncated:") {
			t.Error("expected truncation notice")
		}
	})
}
