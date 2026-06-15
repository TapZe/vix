package daemon

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestHandleWorkflowCommand_InlineRegistersAndRuns drives the inline-workflow
// dispatch path: a self-contained definition (no entry in config/workflow.json)
// is registered transiently into the session's workflow set and executed.
func TestHandleWorkflowCommand_InlineRegistersAndRuns(t *testing.T) {
	s := newWorkflowTestSession(t)
	def := &WorkflowDef{
		Name:       "inline-watch",
		EntryPoint: StepRef{ID: "poll"},
		Steps: map[string]WorkflowStepDef{
			"poll": {Type: "bash", Command: "echo inline-ran"},
		},
	}
	raw, err := json.Marshal(def)
	if err != nil {
		t.Fatal(err)
	}

	if len(s.snapshotWorkflows()) != 0 {
		t.Fatalf("expected no workflows preloaded, got %d", len(s.snapshotWorkflows()))
	}

	// Name is empty: the session must resolve the run from the inline definition.
	s.handleWorkflowCommand("", "objective", raw)

	found := false
	for _, w := range s.snapshotWorkflows() {
		if w.Name == "inline-watch" {
			found = true
		}
	}
	if !found {
		t.Errorf("inline workflow was not registered into the session set")
	}

	out := streamedText(drainEvents(s))
	if !strings.Contains(out, "inline-ran") {
		t.Errorf("expected inline workflow bash output, got:\n%s", out)
	}
}

// TestHandleWorkflowCommand_InvalidInlineErrors verifies a structurally invalid
// inline definition is rejected before any registration or execution.
func TestHandleWorkflowCommand_InvalidInlineErrors(t *testing.T) {
	s := newWorkflowTestSession(t)
	raw, _ := json.Marshal(&WorkflowDef{Name: "broken"}) // no steps → invalid

	s.handleWorkflowCommand("", "objective", raw)

	var sawErr bool
	for _, ev := range drainEvents(s) {
		if ev.Type == "event.error" {
			sawErr = true
		}
	}
	if !sawErr {
		t.Error("expected event.error for invalid inline workflow")
	}
	if len(s.snapshotWorkflows()) != 0 {
		t.Error("invalid inline workflow must not be registered")
	}
}
