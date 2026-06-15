package daemon

import (
	"bytes"
	"context"
	"encoding/json"
	"os/exec"
	"strings"
	"syscall"

	"github.com/get-vix/vix/internal/daemon/hooks"
	"github.com/get-vix/vix/internal/protocol"
)

// runSyncHook executes one synchronous hook and returns its (possibly
// downgraded) Decision. Command hooks decide via exit code / stdout JSON;
// workflow and prompt hooks decide via their final text (JSON or a BLOCK:
// sentinel). A non-blocking hook can never deny or modify — its verdict is
// downgraded to context so it stays observational.
func (s *Server) runSyncHook(ctx context.Context, spec hooks.Spec, base map[string]any) hooks.Decision {
	cwd := hookCWD(spec, base)
	var dec hooks.Decision
	if spec.Command != "" {
		stdin, _ := json.Marshal(base)
		code, out, errOut := runHookCommand(ctx, spec, cwd, stdin)
		dec = hooks.ParseCommandDecision(code, out, errOut)
	} else {
		final, _ := s.runHookSession(ctx, spec, hookSessionText(spec, base), cwd, false)
		dec = hooks.ParseTextDecision(final)
	}
	return downgradeIfNonBlocking(spec, dec)
}

// fireAsyncHook runs a hook fire-and-forget, decoupled from the triggering turn
// (it derives from the server context so it can outlive the tool call).
func (s *Server) fireAsyncHook(spec hooks.Spec, base map[string]any) {
	parent := s.serverCtx
	if parent == nil {
		parent = context.Background()
	}
	go func() {
		ctx, cancel := context.WithTimeout(parent, spec.TimeoutDuration())
		defer cancel()
		cwd := hookCWD(spec, base)
		if spec.Command != "" {
			stdin, _ := json.Marshal(base)
			runHookCommand(ctx, spec, cwd, stdin)
			return
		}
		s.runHookSession(ctx, spec, hookSessionText(spec, base), cwd, true)
	}()
}

// downgradeIfNonBlocking strips a non-blocking hook's veto powers: a deny is
// surfaced to the model as context, a modify is dropped.
func downgradeIfNonBlocking(spec hooks.Spec, d hooks.Decision) hooks.Decision {
	if spec.Blocking {
		return d
	}
	switch d.Behavior {
	case hooks.BehaviorDeny:
		return hooks.Decision{Behavior: hooks.BehaviorContext, Context: d.Reason}
	case hooks.BehaviorModify:
		return hooks.Decision{Behavior: hooks.BehaviorAllow}
	}
	return d
}

// runHookCommand runs a command hook with the context JSON on stdin and returns
// (exitCode, stdout, stderr). A timeout (or non-ExitError failure) yields exit
// code -1, which ParseCommandDecision treats as fail-open allow so a broken
// hook never wedges the loop.
func runHookCommand(ctx context.Context, spec hooks.Spec, cwd string, stdin []byte) (int, string, string) {
	cctx, cancel := context.WithTimeout(ctx, spec.TimeoutDuration())
	defer cancel()

	cmd := exec.CommandContext(cctx, "bash", "-c", spec.Command)
	if cwd != "" {
		cmd.Dir = cwd
	}
	cmd.Stdin = bytes.NewReader(stdin)
	var out, errb strings.Builder
	cmd.Stdout = &out
	cmd.Stderr = &errb
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }

	err := cmd.Run()
	if cctx.Err() == context.DeadlineExceeded {
		LogError("hook %q: timed out after %s", spec.ID, spec.TimeoutDuration())
		return -1, out.String(), "hook timed out"
	}
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return ee.ExitCode(), out.String(), errb.String()
		}
		LogError("hook %q: command failed to run: %v", spec.ID, err)
		return -1, out.String(), err.Error()
	}
	return 0, out.String(), errb.String()
}

// runHookSession runs a workflow- or prompt-form hook in an isolated headless
// session (origin "vix" so it can't itself re-trigger hooks). It returns the
// concatenated assistant text and whether an error occurred. When persist is
// true the run is registered/persisted so it appears in the Sessions tab under
// "Vix-initiated"; sync veto runs pass false to avoid a record per tool call.
func (s *Server) runHookSession(ctx context.Context, spec hooks.Spec, text, cwd string, persist bool) (string, bool) {
	runID := generateSessionID()
	session := NewSession(runID, s, nil, s.model, cwd, "", false,
		spec.AutoWrite(), spec.AutoDirs(), true /*headless*/, ctx)
	session.origin = "vix"
	session.trigger = &protocol.TriggerInfo{Type: "hook", Ref: spec.ID}
	session.title = "Hook: " + hookName(spec)

	if persist {
		s.sessionMu.Lock()
		s.sessions[runID] = session
		s.sessionMu.Unlock()
		s.broadcastSessionsChanged()
		defer func() {
			s.sessionMu.Lock()
			delete(s.sessions, runID)
			s.sessionMu.Unlock()
			session.cancel()
			s.broadcastSessionsChanged()
		}()
	} else {
		defer session.cancel()
	}

	go session.Run()

	var startCmd protocol.SessionCommand
	switch {
	case spec.Workflow != nil:
		raw, _ := json.Marshal(spec.Workflow)
		data, _ := json.Marshal(protocol.SessionWorkflowData{Name: spec.Workflow.Name, Text: text, Workflow: raw})
		startCmd = protocol.SessionCommand{Type: "session.workflow", Data: data}
	case spec.WorkflowID != "":
		data, _ := json.Marshal(protocol.SessionWorkflowData{Name: spec.WorkflowID, Text: text})
		startCmd = protocol.SessionCommand{Type: "session.workflow", Data: data}
	default:
		data, _ := json.Marshal(protocol.SessionInputData{Text: text})
		startCmd = protocol.SessionCommand{Type: "session.input", Data: data}
	}
	if !session.pushCommand(ctx, startCmd) {
		return "", true
	}

	var (
		finalText strings.Builder
		hadError  bool
	)
consume:
	for {
		select {
		case ev := <-session.eventChan:
			switch ev.Type {
			case "event.stream_chunk":
				finalText.WriteString(decodeJobEvent[protocol.EventStreamChunk](ev.Data).Text)
			case "event.confirm_request":
				data, _ := json.Marshal(protocol.SessionConfirmData{Approved: false})
				session.pushCommand(ctx, protocol.SessionCommand{Type: "session.confirm", Data: data})
			case "event.user_question":
				uq := decodeJobEvent[protocol.EventUserQuestion](ev.Data)
				answer := ""
				if len(uq.RichOptions) > 0 {
					answer = uq.RichOptions[0].Title
				} else if len(uq.Options) > 0 {
					answer = uq.Options[0]
				}
				data, _ := json.Marshal(protocol.SessionUserAnswerData{Answer: answer})
				session.pushCommand(ctx, protocol.SessionCommand{Type: "session.user_answer", Data: data})
			case "event.plan_proposed":
				data, _ := json.Marshal(protocol.SessionPlanActionData{Action: "approve"})
				session.pushCommand(ctx, protocol.SessionCommand{Type: "session.plan_action", Data: data})
			case "event.error":
				hadError = true
			case "event.agent_done":
				break consume
			}
		case <-ctx.Done():
			return finalText.String(), true
		case <-session.ctx.Done():
			break consume
		}
	}
	if persist && !hadError {
		session.persist()
	}
	return finalText.String(), hadError
}

// hookCWD resolves the working directory for a hook run: the spec's explicit
// cwd, else the triggering session's cwd from the context envelope.
func hookCWD(spec hooks.Spec, base map[string]any) string {
	if spec.CWD != "" {
		return spec.CWD
	}
	if v, ok := base["cwd"].(string); ok {
		return v
	}
	return ""
}

// hookSessionText builds the message text for a workflow/prompt hook. The
// context envelope is appended as JSON so the workflow/prompt can inspect it.
func hookSessionText(spec hooks.Spec, base map[string]any) string {
	b, _ := json.Marshal(base)
	if spec.Prompt != "" {
		return spec.Prompt + "\n\nHook context:\n" + string(b)
	}
	return string(b)
}

func hookName(spec hooks.Spec) string {
	if spec.Name != "" {
		return spec.Name
	}
	return spec.ID
}
