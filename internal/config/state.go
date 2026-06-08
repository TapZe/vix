package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// State is the global, non-project-scoped session bookkeeping persisted to
// state.json (see VixPaths.StateFile). It currently records only the
// once-per-day update check; keep fields additive and tolerant of absence.
type State struct {
	// LastUpdateCheck is the date (YYYY-MM-DD) of the most recent GitHub
	// release check. Empty when never checked.
	LastUpdateCheck string `json:"last_update_check,omitempty"`
	// LatestKnown is the newest release tag seen at the last check.
	LatestKnown string `json:"latest_known,omitempty"`
	// LatestURL is the release page for LatestKnown.
	LatestURL string `json:"latest_url,omitempty"`
}

// ReadState loads state.json at path. A missing or unreadable file yields a
// zero State and no error — absence is normal.
func ReadState(path string) State {
	var st State
	if path == "" {
		return st
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return st
	}
	_ = json.Unmarshal(data, &st)
	return st
}

// WriteState atomically persists st to path, creating the parent directory if
// needed. A no-op (nil) when path is empty.
func WriteState(path string, st State) error {
	if path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	out, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, out, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
