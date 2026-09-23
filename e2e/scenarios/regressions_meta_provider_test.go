package scenarios

import (
	"strings"
	"testing"
	"time"

	"github.com/get-vix/vix/e2e/harness"
)

// TestMetaProviderAvailable guards the Meta provider added to the embedded
// providers.json (chat_completions wire, api.meta.ai base URL). It asserts the
// robust, non-flaky signals: with META_API_KEY set, vixd boots without tripping
// providers-config validation (Meta's default base URL is HTTPS), the Meta
// provider surfaces in the F3 Models tab out of the box, and a normal turn still
// completes on the default model.
//
// A live turn *on* a muse-spark model is not exercised here: chat_completions
// routing to the loopback mock trips vix's HTTPS providers-config validation (see
// e2e/README.md "Wire dialects"), so Meta's wire behavior is covered by the
// unit tests instead.
//
// T · asserts screen (Meta listed in the picker) + clean boot + a completed turn.
func TestMetaProviderAvailable(t *testing.T) {
	meta := harness.Meta{
		Category:    "providers",
		Subcategory: "providers.meta",
		Description: "the built-in Meta provider is available out of the box and vixd boots clean",
		Wire:        harness.WireMessages,
	}

	h := harness.Start(t, meta, harness.WithEnv("META_API_KEY", "meta-test-key"))

	h.UI.WaitStable(500 * time.Millisecond)
	h.UI.Shot("booted")

	if log := h.Daemon.LogTail(200); strings.Contains(log, "panic:") {
		t.Fatalf("vixd panicked at startup with the Meta provider embedded; log:\n%s", log)
	}

	// The Meta provider must appear in the F3 Models tab out of the box.
	h.UI.Key("f3")
	h.UI.WaitStable(400 * time.Millisecond)
	if !h.UI.Contains("Meta") {
		t.Fatalf("Meta provider not shown in the F3 Models tab; screen:\n%s", h.UI.Snapshot())
	}
	h.UI.Shot("meta-in-models-tab")

	// Back to chat; a normal turn still runs on the default model.
	h.UI.Key("f2")
	h.UI.WaitStable(300 * time.Millisecond)
	h.Mock.Enqueue(harness.Text("Booted fine with the Meta provider available."))
	h.UI.Type("are you up?")
	h.UI.Enter()
	h.UI.WaitFor("Booted fine with the Meta provider available.")
	h.UI.Shot("turn-completed")
}
