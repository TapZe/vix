package daemon

import (
	"os"
	"strings"
	"testing"
	"time"
)

// TestBashBackground_ReturnsImmediately verifies that background: true does
// not block for the full command duration. A foreground `sleep 30` would
// block for ~30s; the background variant must return within 2s.
func TestBashBackground_ReturnsImmediately(t *testing.T) {
	var registry BashJobRegistry
	t.Cleanup(registry.KillAll)

	t0 := time.Now()
	out, err := bashBackgroundImpl(&registry, "sleep 30", ".", nil, 60)
	elapsed := time.Since(t0)
	if err != nil {
		t.Fatalf("bashBackgroundImpl returned error: %v", err)
	}
	if elapsed > 2*time.Second {
		t.Fatalf("expected return in <2s, took %v — backgrounding is blocking", elapsed)
	}
	if !strings.Contains(out, "job_id: bg-") {
		t.Fatalf("output missing job_id line:\n%s", out)
	}
	if !strings.Contains(out, "pid:") || !strings.Contains(out, "pgid:") {
		t.Fatalf("output missing pid/pgid:\n%s", out)
	}
	if !strings.Contains(out, "log:") || !strings.Contains(out, "rc:") {
		t.Fatalf("output missing log/rc paths:\n%s", out)
	}
}

// TestBashBackground_WritesRC verifies the reaper goroutine writes the correct
// exit code to the rc file after the child exits.
func TestBashBackground_WritesRC(t *testing.T) {
	var registry BashJobRegistry
	t.Cleanup(registry.KillAll)

	out, err := bashBackgroundImpl(&registry, "exit 7", ".", nil, 30)
	if err != nil {
		t.Fatalf("bashBackgroundImpl error: %v", err)
	}
	rcPath := extractLine(out, "rc: ")
	if rcPath == "" {
		t.Fatalf("rc path not found in output:\n%s", out)
	}
	jobID := extractLine(out, "job_id: ")
	job, ok := registry.Load(jobID)
	if !ok {
		t.Fatalf("job %s not in registry", jobID)
	}
	select {
	case <-job.Done:
	case <-time.After(5 * time.Second):
		t.Fatalf("reaper did not finish within 5s")
	}
	body, err := os.ReadFile(rcPath)
	if err != nil {
		t.Fatalf("read rc: %v", err)
	}
	if strings.TrimSpace(string(body)) != "7" {
		t.Fatalf("rc file = %q; want \"7\"", strings.TrimSpace(string(body)))
	}
}

// TestBashJobRegistry_KillAll verifies that KillAll cancels outstanding jobs
// and their reapers finish within the 2s grace window.
func TestBashJobRegistry_KillAll(t *testing.T) {
	var registry BashJobRegistry

	out, err := bashBackgroundImpl(&registry, "sleep 60", ".", nil, 120)
	if err != nil {
		t.Fatalf("spawn error: %v", err)
	}
	jobID := extractLine(out, "job_id: ")
	job, ok := registry.Load(jobID)
	if !ok {
		t.Fatalf("job not in registry")
	}

	t0 := time.Now()
	registry.KillAll()
	elapsed := time.Since(t0)

	if elapsed > 3*time.Second {
		t.Fatalf("KillAll took %v; expected <3s", elapsed)
	}
	select {
	case <-job.Done:
		// Expected: reaper finished.
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("reaper did not close Done after KillAll")
	}
	if _, still := registry.Load(jobID); still {
		t.Fatalf("job still in registry after reaper")
	}
}

// TestBashBackground_TimeoutKillsChild verifies that the per-job timeout fires
// and the rc file records the timeout.
func TestBashBackground_TimeoutKillsChild(t *testing.T) {
	var registry BashJobRegistry
	t.Cleanup(registry.KillAll)

	out, err := bashBackgroundImpl(&registry, "sleep 30", ".", nil, 1)
	if err != nil {
		t.Fatalf("spawn error: %v", err)
	}
	jobID := extractLine(out, "job_id: ")
	job, _ := registry.Load(jobID)
	if job == nil {
		t.Fatalf("job missing")
	}
	select {
	case <-job.Done:
	case <-time.After(5 * time.Second):
		t.Fatalf("per-job timeout did not fire within 5s (timeout=1s)")
	}
	rc, err := os.ReadFile(extractLine(out, "rc: "))
	if err != nil {
		t.Fatalf("read rc: %v", err)
	}
	// Killed via SIGKILL from the sandbox's cmd.Cancel hook after ctx timeout.
	// Exit code is -1 (ExitError from Signal) or the string "timeout"/"cancelled"
	// depending on the platform's exec behavior. Accept any non-"0" result —
	// the important assertion is "the child did not run to completion" which
	// the Done-within-5s above already proved.
	if strings.TrimSpace(string(rc)) == "0" {
		t.Fatalf("rc is 0; child ran to completion despite 1s timeout")
	}
}

// extractLine finds a key-prefixed line in the bashBackgroundImpl flat-KV
// output and returns the trimmed value.
func extractLine(out, prefix string) string {
	for _, line := range strings.Split(out, "\n") {
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(line, prefix))
		}
	}
	return ""
}
