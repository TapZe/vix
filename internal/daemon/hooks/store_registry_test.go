package hooks

import (
	"os"
	"path/filepath"
	"testing"
)

func writeSpec(t *testing.T, dir, name, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestStoreLoadSpecs(t *testing.T) {
	dir := t.TempDir()
	writeSpec(t, dir, "ok.json", `{"id":"ok","enabled":true,"trigger":{"event":"PreToolUse"},"command":"true"}`)
	writeSpec(t, dir, "noid.json", `{"enabled":true,"trigger":{"event":"Stop"},"command":"true"}`)
	writeSpec(t, dir, "bad.json", `{not json`)
	writeSpec(t, dir, "invalid.json", `{"id":"invalid","trigger":{"event":"Nope"},"command":"true"}`)
	writeSpec(t, dir, "ignore.txt", `not a spec`)

	st := NewStore(dir)
	specs, invalid := st.LoadSpecs()

	ids := map[string]bool{}
	for _, s := range specs {
		ids[s.ID] = true
	}
	if !ids["ok"] || !ids["noid"] {
		t.Fatalf("expected ok+noid (id from filename), got %v", ids)
	}
	if len(specs) != 2 {
		t.Fatalf("expected 2 valid specs, got %d", len(specs))
	}
	if _, ok := invalid["bad"]; !ok {
		t.Errorf("expected bad.json reported invalid: %v", invalid)
	}
	if _, ok := invalid["invalid"]; !ok {
		t.Errorf("expected invalid.json reported invalid: %v", invalid)
	}
}

func TestStoreEmptyDir(t *testing.T) {
	specs, invalid := NewStore("").LoadSpecs()
	if len(specs) != 0 || len(invalid) != 0 {
		t.Fatalf("empty path should load nothing")
	}
}

func TestRegistryMatchAndReload(t *testing.T) {
	dir := t.TempDir()
	writeSpec(t, dir, "sync.json", `{"id":"sync","enabled":true,"mode":"sync","blocking":true,"trigger":{"event":"PreToolUse","matcher":"write_file"},"command":"true"}`)
	writeSpec(t, dir, "async.json", `{"id":"async","enabled":true,"mode":"async","trigger":{"event":"PreToolUse"},"command":"true"}`)
	writeSpec(t, dir, "disabled.json", `{"id":"disabled","enabled":false,"trigger":{"event":"PreToolUse"},"command":"true"}`)
	writeSpec(t, dir, "stop.json", `{"id":"stop","enabled":true,"trigger":{"event":"Stop"},"command":"true"}`)

	r := NewRegistry(NewStore(dir))

	if !r.Has(EventPreToolUse) || !r.Has(EventStop) {
		t.Fatal("expected Has for PreToolUse and Stop")
	}
	if r.Has(EventUserPromptSubmit) {
		t.Fatal("did not expect UserPromptSubmit hooks")
	}

	sync, async := r.Match(EventPreToolUse, "write_file")
	if len(sync) != 1 || sync[0].ID != "sync" {
		t.Fatalf("expected sync hook to match write_file, got %v", sync)
	}
	if len(async) != 1 || async[0].ID != "async" {
		t.Fatalf("expected async hook (match-all), got %v", async)
	}

	// read_file: the sync hook's matcher excludes it, the async match-all stays.
	sync, async = r.Match(EventPreToolUse, "read_file")
	if len(sync) != 0 {
		t.Fatalf("sync hook should not match read_file, got %v", sync)
	}
	if len(async) != 1 {
		t.Fatalf("async match-all should still fire, got %v", async)
	}

	// Hot reload: drop a new hook on disk and reload.
	writeSpec(t, dir, "prompt.json", `{"id":"p","enabled":true,"trigger":{"event":"UserPromptSubmit"},"command":"true"}`)
	r.Reload()
	if !r.Has(EventUserPromptSubmit) {
		t.Fatal("reload should pick up the new UserPromptSubmit hook")
	}
}
