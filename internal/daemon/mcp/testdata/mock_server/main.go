// mock_server is a minimal MCP server used by the mcp package tests.
// It responds to initialize, tools/list, and tools/call over stdio
// using newline-delimited JSON-RPC 2.0.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
)

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func reply(id json.RawMessage, result any) {
	resp := response{JSONRPC: "2.0", ID: id, Result: result}
	data, _ := json.Marshal(resp)
	fmt.Fprintln(os.Stdout, string(data))
}

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		var req request
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			continue
		}
		// Notifications have no ID — no response needed.
		if req.ID == nil {
			continue
		}
		switch req.Method {
		case "initialize":
			reply(req.ID, map[string]any{
				"protocolVersion": "2024-11-05",
				"capabilities":    map[string]any{},
				"serverInfo":      map[string]any{"name": "mock", "version": "0.1"},
			})
		case "tools/list":
			reply(req.ID, map[string]any{
				"tools": []map[string]any{
					{
						"name":        "echo",
						"description": "Echoes the input text back.",
						"inputSchema": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"text": map[string]any{"type": "string", "description": "Text to echo"},
							},
							"required": []string{"text"},
						},
					},
					{
						"name":        "add",
						"description": "Adds two numbers.",
						"inputSchema": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"a": map[string]any{"type": "number"},
								"b": map[string]any{"type": "number"},
							},
							"required": []string{"a", "b"},
						},
					},
				},
			})
		case "tools/call":
			var params struct {
				Name      string         `json:"name"`
				Arguments map[string]any `json:"arguments"`
			}
			if err := json.Unmarshal(req.Params, &params); err != nil {
				reply(req.ID, map[string]any{
					"content": []map[string]any{{"type": "text", "text": "bad params"}},
					"isError": true,
				})
				continue
			}
			switch params.Name {
			case "echo":
				text, _ := params.Arguments["text"].(string)
				reply(req.ID, map[string]any{
					"content": []map[string]any{{"type": "text", "text": text}},
					"isError": false,
				})
			case "add":
				a, _ := params.Arguments["a"].(float64)
				b, _ := params.Arguments["b"].(float64)
				reply(req.ID, map[string]any{
					"content": []map[string]any{{"type": "text", "text": fmt.Sprintf("%g", a+b)}},
					"isError": false,
				})
			default:
				reply(req.ID, map[string]any{
					"content": []map[string]any{{"type": "text", "text": "unknown tool: " + params.Name}},
					"isError": true,
				})
			}
		default:
			// Unknown method — return a JSON-RPC error.
			resp := response{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   &rpcError{Code: -32601, Message: "method not found: " + req.Method},
			}
			data, _ := json.Marshal(resp)
			fmt.Fprintln(os.Stdout, string(data))
		}
	}
}
