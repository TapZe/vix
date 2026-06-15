package hooks

import "sync"

// Registry is the in-memory, hot-reloadable index of enabled hook specs grouped
// by event. It is safe for concurrent use: the session loop reads it on every
// matching lifecycle point while the config watcher swaps it on disk changes.
type Registry struct {
	store *Store

	mu       sync.RWMutex
	byEvent  map[string][]Spec
	disabled int
	invalid  map[string]string
}

// NewRegistry builds a registry over the store and performs the initial load.
func NewRegistry(store *Store) *Registry {
	r := &Registry{store: store, byEvent: map[string][]Spec{}}
	r.Reload()
	return r
}

// Reload re-reads the spec directory and atomically swaps the index.
func (r *Registry) Reload() {
	specs, invalid := r.store.LoadSpecs()
	byEvent := make(map[string][]Spec)
	disabled := 0
	for _, s := range specs {
		if !s.Enabled {
			disabled++
			continue
		}
		byEvent[s.Trigger.Event] = append(byEvent[s.Trigger.Event], s)
	}
	r.mu.Lock()
	r.byEvent = byEvent
	r.disabled = disabled
	r.invalid = invalid
	r.mu.Unlock()
}

// Match returns the enabled hooks for event whose matcher accepts field, split
// into synchronous and asynchronous groups in deterministic spec order.
func (r *Registry) Match(event, field string) (sync, async []Spec) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, s := range r.byEvent[event] {
		if !s.Matches(field) {
			continue
		}
		if s.EffectiveMode() == ModeSync {
			sync = append(sync, s)
		} else {
			async = append(async, s)
		}
	}
	return sync, async
}

// Has reports whether any enabled hook subscribes to event (cheap pre-check so
// the session loop can skip building a context when nothing is listening).
func (r *Registry) Has(event string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.byEvent[event]) > 0
}

// Invalid returns the most recent validation errors keyed by id, for surfacing
// in a /hooks browser or logs.
func (r *Registry) Invalid() map[string]string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string]string, len(r.invalid))
	for k, v := range r.invalid {
		out[k] = v
	}
	return out
}
