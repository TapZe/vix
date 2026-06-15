package daemon

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/get-vix/vix/internal/daemon/hooks"
)

// feedbackHookID is the id (and filename stem) of the shipped feedback hook.
const feedbackHookID = "feedback-at-10"

// feedbackScript is the shipped SessionStart command hook. It counts fresh
// sessions in its own feedback/ dir next to the script (hooks/feedback/count.log)
// and, on the 10th, opens a one-time conversation (guarded by the
// hooks/feedback/asked marker) by calling back into the daemon via
// `vix session create`. vix_bin and socket_path come from the hook context on
// stdin, so it works regardless of PATH or socket path.
const feedbackScript = `#!/usr/bin/env bash
# Shipped by vix. After 10 fresh sessions, open a one-time conversation asking
# for feedback. Counts in this hook's own feedback/ dir (count.log) and fires
# exactly once (guarded by feedback/asked). To change the copy, edit message.md
# next to this script. To turn it off, set "enabled": false in
# feedback-at-10.json (or delete both files).
set -euo pipefail
ctx=$(cat)
self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dir="$self/feedback"
mkdir -p "$dir"
echo 1 >> "$dir/count.log"
n=$(wc -l < "$dir/count.log" | tr -d ' ')
[ "$n" -ge 10 ] || exit 0
# Once ever: the atomic noclobber create of the marker is the lock, so even
# concurrent session starts deliver at most one feedback conversation.
if ( set -o noclobber; : > "$dir/asked" ) 2>/dev/null; then
  vix_bin=$(printf '%s' "$ctx" | sed -n 's/.*"vix_bin":"\([^"]*\)".*/\1/p')
  sock=$(printf '%s' "$ctx" | sed -n 's/.*"socket_path":"\([^"]*\)".*/\1/p')
  "${vix_bin:-vix}" session create --socket-path "$sock" <<JSON
{ "message_file": "$self/message.md", "cwd": "$HOME", "title": "vix needs your feedback" }
JSON
fi
`

// feedbackMessage is the markdown shown in the feedback conversation. Seeded as
// message.md next to the script; users/maintainers may edit it freely.
const feedbackMessage = `# vix needs your feedback

You've been using vix for a little while now, and we'd love to hear how it's going for you.

Your feedback is **very important**

it directly helps us make vix better and shapes what we build next. It only takes a couple of minutes, and every response genuinely makes a difference.

**[Open the feedback form](https://forms.gle/ADEVrtP2xRsKpxtdA)**

Thank you for helping us improve vix!
`

// feedbackSeedSentinel marks that the default feedback hook has been seeded
// once. It lives in the hooks dir (a dotfile, so the registry ignores it) and
// gates seeding independently of directory existence, so the hook's own state
// dir (feedback/) can be pre-created without re-triggering a seed.
const feedbackSeedSentinel = ".feedback-seeded"

// seedDefaultFeedbackHook writes the shipped feedback hook into hooksDir: the
// spec, the executable script, and the message.md copy. Existing files are left
// untouched (so a user's edits/disable survive), then a sentinel is written so
// this runs at most once. Never seeded on an auth-enabled daemon (the script's
// `vix session create` callback can't present the shared secret).
func seedDefaultFeedbackHook(hooksDir string) {
	scriptPath := filepath.Join(hooksDir, feedbackHookID+".sh")

	spec := hooks.Spec{
		ID:        feedbackHookID,
		Name:      "Feedback after 10 sessions",
		Enabled:   true,
		Trigger:   hooks.HookTrigger{Event: hooks.EventSessionStart, Matcher: "startup"},
		Mode:      hooks.ModeAsync,
		Command:   "bash " + scriptPath,
		CreatedBy: "vix",
	}
	data, err := json.MarshalIndent(spec, "", "  ")
	if err != nil {
		LogError("hooks: marshal feedback hook spec: %v", err)
		return
	}
	writeIfAbsent(filepath.Join(hooksDir, feedbackHookID+".json"), append(data, '\n'), 0o644)
	writeIfAbsent(scriptPath, []byte(feedbackScript), 0o755)
	writeIfAbsent(filepath.Join(hooksDir, "message.md"), []byte(feedbackMessage), 0o644)

	// Sentinel last: if any artifact failed to write we still want a retry next
	// start, so only stamp it once the trio is in place.
	if err := os.WriteFile(filepath.Join(hooksDir, feedbackSeedSentinel), []byte("1\n"), 0o644); err != nil {
		LogError("hooks: write feedback seed sentinel: %v", err)
		return
	}
	LogInfo("hooks: seeded default feedback hook at %s", hooksDir)
}

// writeIfAbsent writes data to path only when path does not already exist, so
// re-seeding never clobbers a user's edited or disabled artifact.
func writeIfAbsent(path string, data []byte, mode os.FileMode) {
	if _, err := os.Stat(path); err == nil {
		return
	}
	if err := os.WriteFile(path, data, mode); err != nil {
		LogError("hooks: seed %s: %v", filepath.Base(path), err)
	}
}
