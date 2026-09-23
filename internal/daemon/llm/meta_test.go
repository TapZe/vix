package llm

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/get-vix/vix/internal/config"
	"github.com/get-vix/vix/internal/providers"
)

// newMetaTestClient builds the generic chat client the way the Meta provider
// spec does: bearer auth and the reasoning_effort effort style.
func newMetaTestClient(t *testing.T, cfg Config) Client {
	t.Helper()
	c, err := newChatCompletionsClient(cfg, chatParams{
		provider:    ProviderMeta,
		effortStyle: providers.EffortStyleReasoningEffort,
	})
	if err != nil {
		t.Fatalf("newChatCompletionsClient: %v", err)
	}
	return c
}

// TestMeta_ParseModelAndProviderSpec pins the embedded providers.json entry:
// the meta/ prefix resolves to the meta provider on the chat_completions wire,
// with the api.meta.ai default base URL and a MODEL/META api-key credential.
func TestMeta_ParseModelAndProviderSpec(t *testing.T) {
	p, model, err := providers.Default().ParseModel("meta/muse-spark-1.3")
	if err != nil {
		t.Fatalf("ParseModel: %v", err)
	}
	if p.ID != "meta" {
		t.Errorf("provider id = %q, want meta", p.ID)
	}
	if model != "muse-spark-1.3" {
		t.Errorf("model = %q, want muse-spark-1.3", model)
	}
	if p.WireFormat != providers.WireChatCompletions {
		t.Errorf("wire_format = %q, want chat_completions", p.WireFormat)
	}
	inf := p.Inference.Resolve()
	if !strings.HasPrefix(inf.BaseURL, "https://api.meta.ai") {
		t.Errorf("base_url = %q, want api.meta.ai default", inf.BaseURL)
	}
	if inf.EffortStyle != providers.EffortStyleReasoningEffort {
		t.Errorf("effort_style = %q, want reasoning_effort", inf.EffortStyle)
	}
}

// TestMeta_AuthHeaderUsesBearer verifies the resolved key flows through as
// Authorization: Bearer ... on the OpenAI-compatible endpoint.
func TestMeta_AuthHeaderUsesBearer(t *testing.T) {
	srv, log := recordingServer(t, mmHandler)

	client := newMetaTestClient(t, Config{
		Credential: config.Credential{Value: "meta-test-key"},
		Model:      "muse-spark-1.3",
		MaxTokens:  1024,
		BaseURL:    srv.URL,
		StreamIdle: 5 * time.Second,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, _, _ = client.StreamMessage(ctx, nil, []MessageParam{NewUserMessage(NewTextBlock("hi"))}, nil, nil, nil)

	auth := log.Last(t).Headers.Get("Authorization")
	if auth != "Bearer meta-test-key" {
		t.Errorf("Authorization = %q, want %q", auth, "Bearer meta-test-key")
	}
}

// TestMeta_ReasoningEffortWhenSet verifies a non-empty effort maps onto the
// standard OpenAI reasoning_effort field for a reasoning-capable model.
func TestMeta_ReasoningEffortWhenSet(t *testing.T) {
	srv, log := recordingServer(t, mmHandler)

	client := newMetaTestClient(t, Config{
		Credential: config.Credential{Value: "meta-test-key"},
		Model:      "muse-spark-1.3",
		Effort:     "medium",
		MaxTokens:  1024,
		BaseURL:    srv.URL,
		StreamIdle: 5 * time.Second,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, _, _ = client.StreamMessage(ctx, nil, []MessageParam{NewUserMessage(NewTextBlock("hi"))}, nil, nil, nil)

	body := log.Last(t).JSONBody(t)
	if got := body["reasoning_effort"]; got != "medium" {
		t.Errorf("reasoning_effort = %v, want medium", got)
	}
}

// TestMeta_BaseURLRouting verifies Config.BaseURL routes to our test server,
// confirming the meta client honors the resolved base URL.
func TestMeta_BaseURLRouting(t *testing.T) {
	srv, log := recordingServer(t, mmHandler)

	client := newMetaTestClient(t, Config{
		Credential: config.Credential{Value: "meta-test-key"},
		Model:      "muse-spark-1.3",
		MaxTokens:  1024,
		BaseURL:    srv.URL,
		StreamIdle: 5 * time.Second,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, _, err := client.StreamMessage(ctx, nil, []MessageParam{NewUserMessage(NewTextBlock("hi"))}, nil, nil, nil); err != nil {
		t.Fatalf("StreamMessage: %v", err)
	}
	if len(log.All()) != 1 {
		t.Fatalf("expected 1 request to the test server, got %d", len(log.All()))
	}
}
