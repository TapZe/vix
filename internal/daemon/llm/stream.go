package llm

import (
	"context"
	crand "crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"os"
	"time"
)

// ErrStreamIdleTimeout is returned when no SSE events arrive within the
// idle-timeout window. Anthropic sends ping events every ~15-30s even
// during extended thinking, and OpenAI streams typed events at similar
// cadence, so prolonged silence indicates a dead connection.
var ErrStreamIdleTimeout = errors.New("stream idle timeout")

// ErrThinkingStall is the sentinel unwrap target for ThinkingStallError.
// Callers use errors.Is(err, ErrThinkingStall) to branch on the stall
// path; errors.As extracts the concrete ThinkingStallError when the
// accumulated summary text is needed.
var ErrThinkingStall = errors.New("thinking stall")

// ThinkingStallError is returned when a single reasoning/thinking block
// runs past the stall timeout. Summary holds the text collected from
// thinking-delta events so the retry layer can feed it back to the model
// on the next attempt. Only adapters that surface discrete reasoning
// events (Anthropic, OpenAI Responses) can produce this error.
type ThinkingStallError struct {
	Elapsed time.Duration
	Summary string
}

func (e *ThinkingStallError) Error() string {
	return fmt.Sprintf("thinking stall: exceeded %s (summary: %d chars)", e.Elapsed, len(e.Summary))
}

func (e *ThinkingStallError) Unwrap() error { return ErrThinkingStall }

// DefaultMaxTokens is the fallback per-call output token cap when a
// Client has no explicit MaxTokens override.
const DefaultMaxTokens int64 = 32768

// DefaultStreamIdleTimeout bounds the silence between any two SSE events.
const DefaultStreamIdleTimeout = 60 * time.Second

// DefaultThinkingStallTimeout bounds the time spent inside a single
// reasoning/thinking block. Past this, the adapter cancels the stream
// and the retry layer nudges the model to conclude.
const DefaultThinkingStallTimeout = 120 * time.Second

// EnvDuration reads a Go duration (e.g. "30s", "2m") from the given env
// var. Returns fallback when unset; logs and falls back on parse error.
func EnvDuration(name string, fallback time.Duration) time.Duration {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		log.Printf("[llm] invalid %s=%q: %v (using default)", name, raw, err)
		return fallback
	}
	return d
}

// reqIDCtxKey is the context key type used to propagate the per-attempt
// request correlation ID into the HTTP transport.
type reqIDCtxKey struct{}

// WithRequestID returns a new context that carries the given request
// correlation ID. The HTTP transport stamps this ID on lifecycle log
// lines so all events for one attempt can be greped together.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, reqIDCtxKey{}, id)
}

// RequestIDFromContext returns the request correlation ID stamped on ctx
// by WithRequestID, or "" if none.
func RequestIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(reqIDCtxKey{}).(string); ok {
		return v
	}
	return ""
}

// NewRequestID returns a short random hex ID for correlating one logical
// LLM turn. The retry layer uses "<turnID>.<attempt>" so all attempts
// share a prefix.
func NewRequestID() string {
	var b [6]byte
	if _, err := crand.Read(b[:]); err != nil {
		return fmt.Sprintf("noncrypto-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

// StreamDebugVerbose returns true when VIX_STREAM_DEBUG=1, enabling
// per-response-body-byte tracing in addition to always-on HTTP lifecycle
// logging.
func StreamDebugVerbose() bool {
	return os.Getenv("VIX_STREAM_DEBUG") == "1"
}

// DurStr formats the time between a and b as "<n>ms", or "—" when either
// is zero (event never observed).
func DurStr(a, b time.Time) string {
	if a.IsZero() || b.IsZero() {
		return "—"
	}
	return fmt.Sprintf("%dms", b.Sub(a).Milliseconds())
}
