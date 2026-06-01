package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"github.com/openai/openai-go/packages/param"
	"github.com/openai/openai-go/shared"
)

// chatCompletionsAdapter is the shared engine for providers that speak the
// OpenAI Chat Completions API: OpenRouter and MiniMax. Each provider builds
// its own openai.Client (with provider-specific base URL, auth, middlewares)
// and embeds this struct to inherit the request translation, streaming, and
// stop-reason/usage normalization.
type chatCompletionsAdapter struct {
	provider             ProviderID
	sdk                  openai.Client
	model                string
	effort               string
	maxTokens            int64
	cred                 credentialCarrier
	systemPrefix         string
	streamIdleTimeout    time.Duration
	thinkingStallTimeout time.Duration

	// extraJSON is applied as option.WithJSONSet entries on every request.
	// OpenRouter uses this for `provider`, `usage.include`, etc.
	extraJSON map[string]any
}

// credentialCarrier is a tiny interface so the shared adapter can carry the
// provider's credential without importing config (avoids a cycle).
type credentialCarrier interface {
	Carry() any // returns the underlying config.Credential
}

// buildChatCompletionMessages translates neutral messages into the
// openai-go MessageParamUnion shape. Tool results become standalone
// role:"tool" messages (one per result).
func buildChatCompletionMessages(system []SystemBlock, msgs []MessageParam) []openai.ChatCompletionMessageParamUnion {
	var out []openai.ChatCompletionMessageParamUnion

	// System: concatenate all SystemBlocks into one role:"system" message.
	if len(system) > 0 {
		var parts []string
		for _, s := range system {
			parts = append(parts, s.Text)
		}
		out = append(out, openai.SystemMessage(strings.Join(parts, "\n")))
	}

	for _, m := range msgs {
		switch m.Role {
		case RoleUser:
			var userParts []openai.ChatCompletionContentPartUnionParam
			for _, b := range m.Content {
				switch b.Type {
				case BlockToolResult:
					// Each tool_result becomes a standalone role:"tool" message.
					content := b.Output
					if b.IsError {
						content = "Error: " + content
					}
					out = append(out, openai.ToolMessage(content, b.ToolUseID))
				case BlockText:
					userParts = append(userParts, openai.TextContentPart(b.Text))
				case BlockImage:
					userParts = append(userParts, openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
						URL: fmt.Sprintf("data:%s;base64,%s", b.MediaType, b.Data),
					}))
				}
			}
			if len(userParts) > 0 {
				out = append(out, openai.UserMessage(userParts))
			}
		case RoleAssistant:
			var text string
			var toolCalls []openai.ChatCompletionMessageToolCallParam
			for _, b := range m.Content {
				switch b.Type {
				case BlockText:
					text += b.Text
				case BlockToolUse:
					args, _ := json.Marshal(b.Input)
					toolCalls = append(toolCalls, openai.ChatCompletionMessageToolCallParam{
						ID: b.ID,
						Function: openai.ChatCompletionMessageToolCallFunctionParam{
							Name:      b.Name,
							Arguments: string(args),
						},
					})
				case BlockThinking:
					// Chat Completions has no thinking equivalent — silently drop.
				}
			}
			am := openai.AssistantMessage(text)
			if len(toolCalls) > 0 {
				if am.OfAssistant != nil {
					am.OfAssistant.ToolCalls = toolCalls
				}
			}
			out = append(out, am)
		}
	}

	return out
}

// buildChatCompletionTools translates neutral ToolParams into the
// openai-go tool definition shape.
func buildChatCompletionTools(tools []ToolParam) []openai.ChatCompletionToolParam {
	if len(tools) == 0 {
		return nil
	}
	out := make([]openai.ChatCompletionToolParam, 0, len(tools))
	for _, t := range tools {
		fn := shared.FunctionDefinitionParam{
			Name:       t.Name,
			Parameters: shared.FunctionParameters(t.InputSchema),
		}
		if t.Description != "" {
			fn.Description = param.NewOpt(t.Description)
		}
		out = append(out, openai.ChatCompletionToolParam{Function: fn})
	}
	return out
}

// mapChatCompletionStopReason normalizes an OpenAI/Chat-Completions
// finish_reason into the neutral StopReason enum.
func mapChatCompletionStopReason(reason string) StopReason {
	switch reason {
	case "stop":
		return StopEndTurn
	case "length":
		return StopMaxTokens
	case "tool_calls", "function_call":
		return StopToolUse
	case "content_filter":
		return StopContentFilter
	case "":
		return StopOther
	}
	return StopOther
}

// streamChatCompletion runs a Chat Completions streaming request, manages
// the idle-timeout watchdog, accumulates the response, and returns the
// neutral *Message. Tool-call argument fragments are reassembled by index
// and then JSON-unmarshalled at end of stream.
func streamChatCompletion(
	ctx context.Context,
	a *chatCompletionsAdapter,
	params openai.ChatCompletionNewParams,
	perCallOpts []option.RequestOption,
	onDelta func(string),
) (*Message, error) {
	idleTimeout := a.streamIdleTimeout
	if idleTimeout <= 0 {
		idleTimeout = DefaultStreamIdleTimeout
	}

	stream := a.sdk.Chat.Completions.NewStreaming(ctx, params, perCallOpts...)

	// Per-tool-call-index state for argument-fragment reassembly.
	type toolState struct {
		id, name string
		args     strings.Builder
	}
	tools := map[int64]*toolState{}
	var order []int64
	var textBuf strings.Builder
	var finishReason string

	type streamEvent struct {
		chunk openai.ChatCompletionChunk
		done  bool
		err   error
	}
	done := make(chan struct{})
	defer close(done)
	events := make(chan streamEvent, 1)
	go func() {
		defer close(events)
		for stream.Next() {
			select {
			case events <- streamEvent{chunk: stream.Current()}:
			case <-done:
				return
			}
		}
		select {
		case events <- streamEvent{done: true, err: stream.Err()}:
		case <-done:
		}
	}()

	idleTimer := time.NewTimer(idleTimeout)
	defer idleTimer.Stop()

	var (
		eventCount    int
		firstEventAt  time.Time
		lastEventAt   time.Time
		usage         openai.CompletionUsage
		seenUsage     bool
	)

loop:
	for {
		select {
		case ev, ok := <-events:
			if !ok || ev.done {
				if ev.err != nil {
					return nil, ev.err
				}
				break loop
			}
			idleTimer.Reset(idleTimeout)
			eventCount++
			lastEventAt = time.Now()
			if firstEventAt.IsZero() {
				firstEventAt = lastEventAt
			}

			if ev.chunk.Usage.TotalTokens > 0 || ev.chunk.Usage.PromptTokens > 0 {
				usage = ev.chunk.Usage
				seenUsage = true
			}

			for _, choice := range ev.chunk.Choices {
				if choice.Delta.Content != "" {
					textBuf.WriteString(choice.Delta.Content)
					if onDelta != nil {
						onDelta(choice.Delta.Content)
					}
				}
				for _, tc := range choice.Delta.ToolCalls {
					st, exists := tools[tc.Index]
					if !exists {
						st = &toolState{}
						tools[tc.Index] = st
						order = append(order, tc.Index)
					}
					if tc.ID != "" {
						st.id = tc.ID
					}
					if tc.Function.Name != "" {
						st.name = tc.Function.Name
					}
					if tc.Function.Arguments != "" {
						st.args.WriteString(tc.Function.Arguments)
					}
				}
				if choice.FinishReason != "" {
					finishReason = choice.FinishReason
				}
			}
		case <-idleTimer.C:
			sinceLast := "never"
			if !lastEventAt.IsZero() {
				sinceLast = time.Since(lastEventAt).String()
			}
			log.Printf("[llm chat] idle_timeout after=%s events=%d since_last=%s",
				idleTimeout, eventCount, sinceLast)
			stream.Close()
			return nil, fmt.Errorf("%w: no SSE events for %s", ErrStreamIdleTimeout, idleTimeout)
		case <-ctx.Done():
			stream.Close()
			return nil, ctx.Err()
		}
	}

	out := &Message{
		StopReason:  mapChatCompletionStopReason(finishReason),
		TextContent: textBuf.String(),
	}
	if textBuf.Len() > 0 {
		out.Content = append(out.Content, ContentBlock{Type: BlockText, Text: textBuf.String()})
	}
	for _, idx := range order {
		st := tools[idx]
		var input map[string]any
		if st.args.Len() > 0 {
			if err := json.Unmarshal([]byte(st.args.String()), &input); err != nil {
				log.Printf("[llm chat] tool arguments parse failed for %s: %v (raw=%q)", st.name, err, st.args.String())
				input = map[string]any{}
			}
		} else {
			input = map[string]any{}
		}
		out.Content = append(out.Content, ContentBlock{
			Type:  BlockToolUse,
			ID:    st.id,
			Name:  st.name,
			Input: input,
		})
		out.ToolCalls = append(out.ToolCalls, ToolCall{
			ID:    st.id,
			Name:  st.name,
			Input: input,
		})
	}
	if seenUsage {
		out.Usage = Usage{
			InputTokens:     usage.PromptTokens,
			OutputTokens:    usage.CompletionTokens,
			CacheReadTokens: usage.PromptTokensDetails.CachedTokens,
			ReasoningTokens: usage.CompletionTokensDetails.ReasoningTokens,
		}
	}
	return out, nil
}

// addReasoningEffort sets reasoning_effort on the params when the model
// supports it (reasoning-capable family). Called by OpenRouter and MiniMax
// before sending the request.
func addReasoningEffort(params *openai.ChatCompletionNewParams, effort, model string) {
	if effort == "" || !isReasoningOpenAIModel(model) {
		return
	}
	level := effort
	switch effort {
	case "adaptive":
		level = "medium"
	case "max":
		level = "high"
	}
	switch level {
	case "low":
		params.ReasoningEffort = shared.ReasoningEffortLow
	case "medium":
		params.ReasoningEffort = shared.ReasoningEffortMedium
	case "high":
		params.ReasoningEffort = shared.ReasoningEffortHigh
	}
}
