export type VixdSession = {
  id: string;
  pid?: number;
  cwd: string;
  startedAt?: string;     // ISO timestamp
  lastRequestAt?: string; // ISO timestamp, undefined if no request yet
  inputTokens: number;
  outputTokens: number;
  parentId?: string;
  forkTurnIdx?: number;
};

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const mockSessions: VixdSession[] = [
  { id: "session_a1b2c3", pid: 48211, cwd: "~/code/vix-website", startedAt: minutesAgo(72), inputTokens: 184_320, outputTokens: 42_915 },
  { id: "session_c3d4e5", pid: 48902, cwd: "~/work/api-server", startedAt: minutesAgo(94), inputTokens: 256_104, outputTokens: 71_208 },
  { id: "session_f6g7h8", pid: 49120, cwd: "~/projects/vixd-mission-control", startedAt: minutesAgo(18), inputTokens: 38_402, outputTokens: 9_610 },
  { id: "session_i9j0k1", pid: 49344, cwd: "~/scratch/notebooks/experiments", startedAt: minutesAgo(3), inputTokens: 4_120, outputTokens: 812 },
];
