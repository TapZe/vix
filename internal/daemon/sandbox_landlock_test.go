//go:build linux

package daemon

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// Landlock smoke + posture tests. They run only on Linux (build tag) and
// skip when the kernel doesn't support Landlock (CI runners on older
// kernels, hardened-minimal images, etc.).
//
// The "exec" tests re-invoke the test binary itself with argv[1] ==
// "landlock-exec" — so the test binary doubles as the helper subcommand.
// Same pattern as runc's `runc init` self-exec, but scoped to a test.

// TestLandlockSupported_Probe just asserts that landlockSupported() is
// callable and returns a bool. We don't assert true/false because the
// answer depends on the host.
func TestLandlockSupported_Probe(t *testing.T) {
	got := landlockSupported()
	t.Logf("landlockSupported() = %v on %s/%s", got, runtime.GOOS, runtime.GOARCH)
}

// TestBuildLandlockRules_DefaultPosture pins the allow-list shape so a
// future relaxation has to update a test. The Linux platform policy is
// the source of truth; if it changes, the assertions below should track
// it intentionally.
func TestBuildLandlockRules_DefaultPosture(t *testing.T) {
	rules := buildLandlockRules("/work", []string{"/extra"})

	// Required RO entries: anything an unprivileged tool actually needs.
	mustRO := []string{"/usr", "/lib", "/lib64", "/bin", "/sbin", "/etc", "/opt", "/sys"}
	for _, p := range mustRO {
		if !contains(rules.RO, p) {
			t.Errorf("RO list missing %q: %v", p, rules.RO)
		}
	}

	// Required RW: cwd + the platform's RW set + extras.
	mustRW := []string{"/work", "/tmp", "/var", "/dev", "/extra"}
	for _, p := range mustRW {
		if !contains(rules.RW, p) {
			t.Errorf("RW list missing %q: %v", p, rules.RW)
		}
	}

	// A path the policy never grants must NOT appear in either list —
	// denial is by absence.
	for _, p := range append(rules.RO, rules.RW...) {
		if p == "/private" || strings.HasPrefix(p, "/private/") {
			t.Errorf("/private leaked into rules: %v", p)
		}
	}
}

// TestBuildLandlockRules_FullRWEscapeHatch covers the
// --disable-automatic-directory-access path: when extraDirs contains "/",
// the helper should grant the entire tree RW (i.e. effectively no
// sandbox), matching the bwrap branch's behaviour.
func TestBuildLandlockRules_FullRWEscapeHatch(t *testing.T) {
	rules := buildLandlockRules("/work", []string{"/"})
	if len(rules.RO) != 0 || len(rules.RW) != 1 || rules.RW[0] != "/" {
		t.Errorf("expected RW=[\"/\"], RO=[], got RO=%v RW=%v", rules.RO, rules.RW)
	}
}

// TestLandlockExec_DeniesUnlistedPath / AllowsListedPath: end-to-end
// behaviour test. We re-exec the test binary with argv[1]=landlock-exec
// and make it run a small bash command that probes a path, then assert
// based on exit code + stderr. Skips when Landlock isn't available so
// CI on older kernels stays green.

func TestLandlockExec_DeniesUnlistedPath(t *testing.T) {
	if !landlockSupported() {
		t.Skip("Landlock not supported on this kernel")
	}
	// Build a ruleset that allows /tmp + cwd RW and /usr+/etc RO but
	// excludes /etc/shadow specifically — except Landlock is allow-list,
	// so the way to "exclude" /etc/shadow is to NOT include /etc at all
	// and to include the only /etc subdirs we actually need. For the
	// test, we instead exclude /tmp from the list and try to read it.
	tmpFile := filepath.Join(t.TempDir(), "marker.txt")
	if err := os.WriteFile(tmpFile, []byte("hi"), 0644); err != nil {
		t.Fatalf("write marker: %v", err)
	}
	// The temp file is under t.TempDir(), which is typically inside
	// /tmp on Linux. We deliberately omit /tmp and the temp path from
	// the rule set so the bash inside should get EACCES.
	rules := landlockRules{
		RO: []string{"/usr", "/etc", "/lib", "/lib64", "/bin", "/sbin"},
		RW: []string{"/dev"},
	}
	out, exitCode := runLandlockExec(t, rules, "cat", tmpFile)
	if exitCode == 0 {
		t.Fatalf("expected non-zero exit reading unlisted path, got 0; stderr=%q", out)
	}
	if !strings.Contains(out, "Permission denied") {
		t.Logf("stderr: %s", out) // log for diagnosis
	}
}

func TestLandlockExec_AllowsListedPath(t *testing.T) {
	if !landlockSupported() {
		t.Skip("Landlock not supported on this kernel")
	}
	// /etc/hostname always exists and is small. Allow /etc, then read it.
	rules := landlockRules{
		RO: []string{"/usr", "/etc", "/lib", "/lib64", "/bin", "/sbin"},
		RW: []string{"/dev"},
	}
	out, exitCode := runLandlockExec(t, rules, "cat", "/etc/hostname")
	if exitCode != 0 {
		t.Fatalf("expected exit 0 reading /etc/hostname, got %d; output=%q", exitCode, out)
	}
}

// runLandlockExec spawns the running test binary as a `landlock-exec`
// helper, which applies `rules` and execve's argv. Returns combined
// stdout+stderr and the exit code.
func runLandlockExec(t *testing.T, rules landlockRules, argv ...string) (string, int) {
	t.Helper()
	self, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}
	rulesJSON, err := json.Marshal(rules)
	if err != nil {
		t.Fatalf("marshal rules: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	helperArgv := append([]string{"landlock-exec"}, argv...)
	cmd := exec.CommandContext(ctx, self, helperArgv...)
	cmd.Env = append(os.Environ(), envLandlockRules+"="+string(rulesJSON))
	out, err := cmd.CombinedOutput()
	exitCode := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else {
			exitCode = -1
		}
	}
	return string(out), exitCode
}

// contains is a tiny helper to avoid pulling slices.Contains for a test
// file that already needs the build tag.
func contains(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}

// TestLandlockExec_AllowsCrossDirRename is a regression test for the
// Landlock REFER bug: prior to handling LANDLOCK_ACCESS_FS_REFER, the
// kernel returned EXDEV ("Invalid cross-device link") on every cross-
// directory rename inside the sandbox, even when source and destination
// were on the same filesystem. apt's HTTP method, editors' atomic-save,
// and most package managers all do this kind of rename — so the symptom
// was "apt-get install fails for any package".
//
// We exercise the code path with a temp dir layout that mirrors apt's:
// `<root>/partial/file` → `<root>/file` (different parent dirs, same fs).
func TestLandlockExec_AllowsCrossDirRename(t *testing.T) {
	if !landlockSupported() {
		t.Skip("Landlock not supported on this kernel")
	}
	root := t.TempDir()
	partial := filepath.Join(root, "partial")
	if err := os.MkdirAll(partial, 0o755); err != nil {
		t.Fatalf("mkdir partial: %v", err)
	}
	src := filepath.Join(partial, "pkg")
	dst := filepath.Join(root, "pkg")
	if err := os.WriteFile(src, []byte("ok"), 0o644); err != nil {
		t.Fatalf("seed src: %v", err)
	}

	rules := landlockRules{
		RO: []string{"/usr", "/lib", "/lib64", "/bin", "/sbin", "/etc"},
		RW: []string{root, "/tmp"},
	}
	out, exitCode := runLandlockExec(t, rules,
		"/bin/mv", src, dst,
	)
	if exitCode != 0 {
		t.Fatalf("cross-dir mv inside RW root failed (exit=%d). "+
			"This is the apt EXDEV bug — REFER must be in handled_access_fs and "+
			"granted on the RW rule. output=%q", exitCode, out)
	}
	if _, err := os.Stat(dst); err != nil {
		t.Errorf("expected dst to exist after rename: %v", err)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Errorf("expected src to be gone after rename, stat err=%v", err)
	}
}

// TestResolveBashPath_PointsAtRealBash ensures resolveBashPath returns a
// path that actually exists and is executable. Regression coverage for
// the historical /usr/bin/bash hardcode that broke on Debian 11 / older
// Alpine bases where bash lives only at /bin/bash.
func TestResolveBashPath_PointsAtRealBash(t *testing.T) {
	p := resolveBashPath()
	if p == "" {
		t.Fatal("resolveBashPath returned empty string")
	}
	st, err := os.Stat(p)
	if err != nil {
		t.Fatalf("resolveBashPath = %q but stat failed: %v", p, err)
	}
	if st.Mode()&0o111 == 0 {
		t.Errorf("resolveBashPath = %q is not executable (mode=%v)", p, st.Mode())
	}
	if !filepath.IsAbs(p) {
		t.Errorf("resolveBashPath = %q is not absolute", p)
	}
}
