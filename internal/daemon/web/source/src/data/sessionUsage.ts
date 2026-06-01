// Mock usage data matching the Token Usage Dashboard JSON shape.
// Shape reference: { total, by_step, by_model, by_source, by_run, read_file_whitespace }
// Each cost entry is { tokens, dollars }.

export type CostEntry = { tokens: number; dollars: number };

export type SourceMap = Record<string, CostEntry | Record<string, CostEntry>>;

export type Cost = {
  input?: CostEntry;
  output?: CostEntry;
  cache_write?: CostEntry;
  cache_read?: CostEntry;
  total?: CostEntry;
};

export type Timing = {
  wall_clock_ms?: number;
  total_duration_ms?: number;
  avg_duration_ms?: number;
};

export type FileOps = {
  input?: {
    unique_files_read?: number;
    total_read_chars?: number;
    per_file?: Record<string, { chars: number; calls: number; file_size?: number }>;
  };
  output?: {
    unique_files_written?: number;
    files_written?: number;
    total_write_chars?: number;
    per_file?: Record<string, { chars: number; calls: number; file_size?: number }>;
  };
};

export type StepBlock = {
  cost?: Cost;
  timing?: Timing;
  request_count?: number;
  by_source?: { input?: any; output?: any };
  read_file_whitespace?: { line_returns_count?: number; unnecessary_space_count?: number; total_chars?: number };
  file_ops?: FileOps;
};

export type UsageData = {
  total: StepBlock;
  by_step: Record<string, StepBlock>;
  by_model: Record<string, { cost?: Cost }>;
  by_source: StepBlock["by_source"];
  by_run?: Record<string, StepBlock>;
  read_file_whitespace?: StepBlock["read_file_whitespace"];
};

const c = (tokens: number, dollars: number): CostEntry => ({ tokens, dollars });

export const mockSessionUsage: Record<string, UsageData> = {
  default: {
    total: {
      cost: {
        input: c(45_120, 0.135),
        output: c(12_840, 0.192),
        cache_write: c(98_500, 0.369),
        cache_read: c(412_300, 0.124),
        total: c(568_760, 0.82),
      },
      timing: { wall_clock_ms: 642_000, total_duration_ms: 312_500, avg_duration_ms: 4_180 },
      request_count: 75,
      file_ops: {
        input: {
          unique_files_read: 38,
          total_read_chars: 184_320,
          per_file: {
            "src/pages/SessionDetail.tsx": { chars: 24_180, calls: 4, file_size: 8_120 },
            "src/pages/WhiteboardPage.tsx": { chars: 41_200, calls: 6, file_size: 18_400 },
            "src/components/whiteboard/SystemDesignCanvas.tsx": { chars: 19_400, calls: 3, file_size: 9_800 },
            "src/data/sessions.ts": { chars: 6_400, calls: 2, file_size: 1_200 },
            "package.json": { chars: 5_120, calls: 2, file_size: 2_400 },
            "src/index.css": { chars: 8_900, calls: 2, file_size: 4_100 },
            "tailwind.config.ts": { chars: 7_200, calls: 1, file_size: 3_400 },
          },
        },
        output: {
          unique_files_written: 6,
          files_written: 14,
          total_write_chars: 38_420,
          per_file: {
            "src/pages/SessionDetail.tsx": { chars: 18_200, calls: 5 },
            "src/components/whiteboard/CodePanel.tsx": { chars: 8_400, calls: 3 },
            "src/data/sessionUsage.ts": { chars: 6_120, calls: 2 },
            "src/index.css": { chars: 3_200, calls: 2 },
          },
        },
      },
      by_source: {
        input: {
          system_prompt: c(12_400, 0.037),
          conversation: c(20_300, 0.061),
          tool_results: {
            read_file: c(48_200, 0.144),
            list_dir: c(2_400, 0.007),
            grep: c(3_900, 0.012),
            web_search: c(5_100, 0.015),
          },
          tool_calls: {
            write_file: c(1_800, 0.005),
            line_replace: c(2_400, 0.007),
            view: c(900, 0.003),
          },
        },
        output: {
          llm_text: c(6_800, 0.102),
          tool_calls: {
            __total: c(6_040, 0.090),
            write_file: c(2_400, 0.036),
            line_replace: c(2_100, 0.031),
            view: c(840, 0.012),
            exec: c(700, 0.011),
          },
        },
      },
      read_file_whitespace: { line_returns_count: 18_400, unnecessary_space_count: 9_200, total_chars: 184_320 },
    },
    by_model: {
      "claude-sonnet-4": { cost: { input: c(30_120, 0.090), output: c(8_840, 0.132), cache_write: c(78_500, 0.294), cache_read: c(312_300, 0.094) } },
      "claude-haiku-4": { cost: { input: c(15_000, 0.045), output: c(4_000, 0.060), cache_write: c(20_000, 0.075), cache_read: c(100_000, 0.030) } },
    },
    by_source: undefined,
    by_step: {
      "1": {
        cost: { input: c(10_000, 0.030), output: c(3_200, 0.048), cache_write: c(28_000, 0.105), cache_read: c(80_000, 0.024), total: c(121_200, 0.207) },
        timing: { total_duration_ms: 78_400 },
        request_count: 18,
      },
      "2": {
        cost: { input: c(18_400, 0.055), output: c(5_100, 0.076), cache_write: c(40_000, 0.150), cache_read: c(180_000, 0.054), total: c(243_500, 0.335) },
        timing: { total_duration_ms: 124_300 },
        request_count: 30,
      },
      "3": {
        cost: { input: c(16_720, 0.050), output: c(4_540, 0.068), cache_write: c(30_500, 0.114), cache_read: c(152_300, 0.046), total: c(204_060, 0.278) },
        timing: { total_duration_ms: 109_800 },
        request_count: 27,
      },
    },
  },
};

export function getUsageForSession(sessionId: string): UsageData | null {
  return mockSessionUsage[sessionId] || mockSessionUsage.default || null;
}
