package daemon

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sort"
	"time"

	"github.com/anthropics/anthropic-sdk-go/option"
)

// PluginConfig type lives in package llm (see llm.go) — this file only
// hosts the discovery/exec/merge logic and the SDK header-strip middleware.

// LoadPlugins discovers and runs all executable plugin files found in dirs,
// merges their output, and returns the combined PluginConfig.
// version and model are sent to each plugin on stdin as a JSON context object.
// Errors (non-zero exit, timeout, invalid JSON) are logged and skipped.
func LoadPlugins(dirs []string, version, model string) PluginConfig {
	input, _ := json.Marshal(map[string]string{
		"version": version,
		"model":   model,
	})

	var merged PluginConfig
	for _, dir := range dirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			// Dir doesn't exist or can't be read — skip silently.
			continue
		}
		// Sort for deterministic order.
		sort.Slice(entries, func(i, j int) bool {
			return entries[i].Name() < entries[j].Name()
		})
		for _, e := range entries {
			name := e.Name()
			// Skip hidden and disabled entries.
			if name[0] == '.' || name[0] == '_' {
				continue
			}
			if e.IsDir() {
				continue
			}
			fi, err := e.Info()
			if err != nil {
				continue
			}
			// Skip non-executable files.
			if fi.Mode()&0o111 == 0 {
				continue
			}
			path := dir + "/" + name
			result, err := runPlugin(path, input)
			if err != nil {
				log.Printf("[vixd] plugin %s failed: %v", path, err)
				continue
			}
			mergePluginConfig(&merged, result)
			log.Printf("[vixd] plugin loaded: %s", path)
		}
	}
	return merged
}

// runPlugin executes the plugin at path, writes input to its stdin, and
// returns the parsed PluginConfig from its stdout. Enforces a 5-second timeout.
func runPlugin(path string, input []byte) (PluginConfig, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// #nosec G204 — path comes from the user's own .vix/plugins/ directory.
	cmd := exec.CommandContext(ctx, path) //nolint:gosec
	cmd.Stdin = bytes.NewReader(input)
	out, err := cmd.Output()
	if err != nil {
		return PluginConfig{}, err
	}
	if len(out) == 0 {
		return PluginConfig{}, nil
	}
	var cfg PluginConfig
	if err := json.Unmarshal(out, &cfg); err != nil {
		return PluginConfig{}, err
	}
	return cfg, nil
}

// mergePluginConfig merges src into dst (last-writer-wins for headers,
// newline-join for system_prefix).
func mergePluginConfig(dst *PluginConfig, src PluginConfig) {
	for k, v := range src.Headers {
		if dst.Headers == nil {
			dst.Headers = make(map[string]*string)
		}
		dst.Headers[k] = v
	}
	if src.SystemPrefix != "" {
		if dst.SystemPrefix != "" {
			dst.SystemPrefix += "\n" + src.SystemPrefix
		} else {
			dst.SystemPrefix = src.SystemPrefix
		}
	}
}

// stripHeadersMiddleware returns an SDK middleware that removes the named
// headers from every outgoing HTTP request. Header names are canonicalized
// (e.g. "x-api-key" → "X-Api-Key") so the delete is case-insensitive.
func stripHeadersMiddleware(names []string) option.Middleware {
	canonical := make([]string, len(names))
	for i, n := range names {
		canonical[i] = http.CanonicalHeaderKey(n)
	}
	return func(req *http.Request, next option.MiddlewareNext) (*http.Response, error) {
		for _, h := range canonical {
			req.Header.Del(h)
		}
		return next(req)
	}
}
