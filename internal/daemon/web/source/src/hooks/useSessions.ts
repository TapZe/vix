import { useState, useEffect, useRef } from 'react';
import { mockSessions, VixdSession } from '@/data/sessions';

interface SessionInfo {
  id: string;
  cwd: string;
  input_tokens: number;
  output_tokens: number;
  started_at: string;
  last_request_at: string | null;
  parent_id?: string;
  fork_turn_idx?: number;
}

export function useSessions(): VixdSession[] {
  const [sessions, setSessions] = useState<VixdSession[]>(
    import.meta.env.VITE_USE_REAL_DATA ? [] : mockSessions
  );
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!import.meta.env.VITE_USE_REAL_DATA) return;

    function connect() {
      const ws = new WebSocket(`ws://${location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg: { sessions: SessionInfo[]; vitals: unknown } = JSON.parse(evt.data);
          const data: SessionInfo[] = msg.sessions || [];
          setSessions(data.map((s) => ({
            id: s.id,
            cwd: s.cwd,
            inputTokens: s.input_tokens,
            outputTokens: s.output_tokens,
            startedAt: s.started_at,
            lastRequestAt: s.last_request_at ?? undefined,
            parentId: s.parent_id,
            forkTurnIdx: s.fork_turn_idx,
          })));
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => setTimeout(connect, 2000);
      ws.onerror = () => ws.close();
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  return sessions;
}
