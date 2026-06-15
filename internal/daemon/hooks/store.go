package hooks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// Store reads hook specs from a directory. Unlike jobs, hooks keep no runtime
// state file — they fire on events, with nothing to schedule or persist.
type Store struct {
	specsDir string
}

// NewStore creates a store over the given spec directory. An empty path
// disables loading (LoadSpecs returns nothing) — the "no home directory"
// degradation.
func NewStore(specsDir string) *Store {
	return &Store{specsDir: specsDir}
}

// SpecsDir returns the directory the store reads specs from.
func (st *Store) SpecsDir() string { return st.specsDir }

// LoadSpecs reads every *.json spec in the hooks directory. Returns the valid
// specs and a map of validation errors keyed by id (or filename stem when the
// id itself is unusable). Files that fail to parse or validate are reported,
// never fatal.
func (st *Store) LoadSpecs() ([]Spec, map[string]string) {
	var specs []Spec
	invalid := make(map[string]string)
	if st.specsDir == "" {
		return specs, invalid
	}
	entries, err := os.ReadDir(st.specsDir)
	if err != nil {
		return specs, invalid
	}
	seen := make(map[string]bool)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		stem := strings.TrimSuffix(e.Name(), ".json")
		data, err := os.ReadFile(filepath.Join(st.specsDir, e.Name()))
		if err != nil {
			invalid[stem] = "read: " + err.Error()
			continue
		}
		var spec Spec
		if err := json.Unmarshal(data, &spec); err != nil {
			invalid[stem] = "parse: " + err.Error()
			continue
		}
		if spec.ID == "" {
			spec.ID = stem
		}
		if err := spec.Validate(); err != nil {
			invalid[spec.ID] = err.Error()
			continue
		}
		if seen[spec.ID] {
			invalid[spec.ID] = "duplicate hook id (two spec files share it)"
			continue
		}
		seen[spec.ID] = true
		specs = append(specs, spec)
	}
	return specs, invalid
}
