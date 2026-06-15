package daemon

import (
	"context"
	"time"

	"github.com/get-vix/vix/internal/daemon/hooks"
)

// hooksReg returns the server's hook registry, or nil when hooks are disabled.
func (s *Session) hooksReg() *hooks.Registry {
	if s.server == nil {
		return nil
	}
	return s.server.hookRegistry
}

// hooksActive reports whether any enabled hook listens for event in a context
// where firing is allowed. vix-initiated sessions (jobs and hook runs, marked
// origin "vix") never fire hooks — this is the recursion guard that stops a
// hook's own tool calls from re-triggering hooks.
func (s *Session) hooksActive(event string) bool {
	r := s.hooksReg()
	if r == nil {
		return false
	}
	if s.origin == "vix" {
		return false
	}
	return r.Has(event)
}

// buildHookContext assembles the common envelope every hook receives, plus the
// event-specific extras. Used as command-hook stdin JSON and as the text passed
// to workflow/prompt hooks.
func (s *Session) buildHookContext(event string, extra map[string]any) map[string]any {
	m := map[string]any{
		"session_id":      s.id,
		"hook_event_name": event,
		"cwd":             s.cwd,
		"model":           s.model,
		"permission_mode": s.permissionMode(),
		"origin":          s.originLabel(),
		"headless":        s.headless,
		"session_mode":    s.sessionMode,
		"agent":           s.chatAgent,
		"turn_count":      s.turnCount,
	}
	if s.parentID != "" {
		m["parent_session_id"] = s.parentID
	}
	if s.activeWorkflow != "" {
		m["active_workflow"] = s.activeWorkflow
	}
	if s.trigger != nil {
		m["trigger_type"] = s.trigger.Type
		if s.trigger.Ref != "" {
			m["trigger_ref"] = s.trigger.Ref
		}
	}
	if !s.startTime.IsZero() {
		m["started_at"] = s.startTime.UTC().Format(time.RFC3339)
	}
	for k, v := range extra {
		m[k] = v
	}
	return m
}

// originLabel renders the session's provenance for hooks: user-started sessions
// report "user", daemon-initiated ones report their origin ("vix").
func (s *Session) originLabel() string {
	if s.origin == "" {
		return "user"
	}
	return s.origin
}

// permissionMode derives a Claude-Code-style permission mode from the session's
// automatic-permission flags, so hooks can gate on how autonomous the run is.
func (s *Session) permissionMode() string {
	s.mu.Lock()
	plan := s.activePlan != nil
	s.mu.Unlock()
	switch {
	case plan:
		return "plan"
	case s.headless && s.enableAutomaticWritePermission && s.enableAutomaticDirectoryAccess:
		return "bypass"
	case s.enableAutomaticWritePermission:
		return "acceptEdits"
	default:
		return "default"
	}
}

// preToolUseHook fires PreToolUse hooks before a tool runs. It returns the
// rewritten input (modify), a deny reason (when a blocking hook vetoes), and a
// denied flag. Async hooks are fired fire-and-forget.
func (s *Session) preToolUseHook(ctx context.Context, name string, input map[string]any) (newInput map[string]any, denyReason string, denied bool) {
	if !s.hooksActive(hooks.EventPreToolUse) {
		return nil, "", false
	}
	syncHooks, asyncHooks := s.hooksReg().Match(hooks.EventPreToolUse, name)
	if len(syncHooks)+len(asyncHooks) == 0 {
		return nil, "", false
	}
	base := s.buildHookContext(hooks.EventPreToolUse, map[string]any{
		"tool_name":  name,
		"tool_input": snapshotInput(input),
	})
	for _, h := range asyncHooks {
		s.server.fireAsyncHook(h, base)
	}
	var decisions []hooks.Decision
	for _, h := range syncHooks {
		decisions = append(decisions, s.server.runSyncHook(ctx, h, base))
	}
	dec := hooks.Combine(decisions)
	switch dec.Behavior {
	case hooks.BehaviorDeny:
		reason := dec.Reason
		if reason == "" {
			reason = "blocked by hook"
		}
		return nil, reason, true
	case hooks.BehaviorModify:
		return dec.Input, "", false
	}
	return nil, "", false
}

// postToolUseHook fires PostToolUse hooks after a tool completes. Sync hooks may
// append context to the tool result shown to the model; async hooks fire
// fire-and-forget. Side effects of the tool cannot be undone here.
func (s *Session) postToolUseHook(ctx context.Context, name string, input map[string]any, result *ToolResult) {
	if result == nil || !s.hooksActive(hooks.EventPostToolUse) {
		return
	}
	syncHooks, asyncHooks := s.hooksReg().Match(hooks.EventPostToolUse, name)
	if len(syncHooks)+len(asyncHooks) == 0 {
		return
	}
	base := s.buildHookContext(hooks.EventPostToolUse, map[string]any{
		"tool_name":     name,
		"tool_input":    snapshotInput(input),
		"tool_response": result.Output,
		"is_error":      result.IsError,
	})
	for _, h := range asyncHooks {
		s.server.fireAsyncHook(h, base)
	}
	var decisions []hooks.Decision
	for _, h := range syncHooks {
		decisions = append(decisions, s.server.runSyncHook(ctx, h, base))
	}
	if dec := hooks.Combine(decisions); dec.Context != "" {
		result.Output = result.Output + "\n\n[hook] " + dec.Context
	}
}

// userPromptSubmitHook fires UserPromptSubmit hooks before a prompt is added to
// the conversation. It returns the (possibly rewritten) text, a deny reason
// when a blocking hook vetoes, and a denied flag.
func (s *Session) userPromptSubmitHook(ctx context.Context, text string) (newText, denyReason string, denied bool) {
	if !s.hooksActive(hooks.EventUserPromptSubmit) {
		return text, "", false
	}
	syncHooks, asyncHooks := s.hooksReg().Match(hooks.EventUserPromptSubmit, "")
	if len(syncHooks)+len(asyncHooks) == 0 {
		return text, "", false
	}
	base := s.buildHookContext(hooks.EventUserPromptSubmit, map[string]any{"prompt": text})
	for _, h := range asyncHooks {
		s.server.fireAsyncHook(h, base)
	}
	var decisions []hooks.Decision
	for _, h := range syncHooks {
		decisions = append(decisions, s.server.runSyncHook(ctx, h, base))
	}
	dec := hooks.Combine(decisions)
	switch dec.Behavior {
	case hooks.BehaviorDeny:
		reason := dec.Reason
		if reason == "" {
			reason = "blocked by hook"
		}
		return text, reason, true
	case hooks.BehaviorModify:
		if np, ok := dec.Input["prompt"].(string); ok {
			return np, "", false
		}
	}
	return text, "", false
}

// fireSessionStart fires SessionStart hooks (observational, fire-and-forget).
func (s *Session) fireSessionStart(source string) {
	if !s.hooksActive(hooks.EventSessionStart) {
		return
	}
	syncHooks, asyncHooks := s.hooksReg().Match(hooks.EventSessionStart, source)
	base := s.buildHookContext(hooks.EventSessionStart, map[string]any{"source": source})
	for _, h := range append(syncHooks, asyncHooks...) {
		s.server.fireAsyncHook(h, base)
	}
}

// fireStop fires Stop hooks when a turn finishes (observational, fire-and-forget).
func (s *Session) fireStop() {
	if !s.hooksActive(hooks.EventStop) {
		return
	}
	syncHooks, asyncHooks := s.hooksReg().Match(hooks.EventStop, "")
	base := s.buildHookContext(hooks.EventStop, nil)
	for _, h := range append(syncHooks, asyncHooks...) {
		s.server.fireAsyncHook(h, base)
	}
}
