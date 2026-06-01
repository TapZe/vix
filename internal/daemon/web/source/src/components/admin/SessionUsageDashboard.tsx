import { useMemo, useState } from "react";
import {
  Cell,
  Bar,
  BarChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CostEntry, UsageData } from "@/data/sessionUsage";

const PALETTE = [
  "hsl(275 97% 69%)",
  "hsl(320 80% 55%)",
  "hsl(150 70% 50%)",
  "hsl(45 95% 55%)",
  "hsl(25 95% 55%)",
  "hsl(200 90% 60%)",
  "hsl(180 70% 50%)",
  "hsl(0 80% 60%)",
  "hsl(260 70% 60%)",
  "hsl(95 60% 50%)",
];

const fmt$ = (v: number) => {
  if (!isFinite(v)) v = 0;
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(3);
  return "$" + v.toFixed(4);
};
const fmtTokens = (v: number) => {
  if (!v) return "0";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toString();
};
const fmtDuration = (ms?: number) => {
  if (ms == null || ms === 0) return "—";
  if (ms < 1000) return ms + "ms";
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + "s";
  const m = Math.floor(s / 60);
  return m + "m " + Math.round(s % 60) + "s";
};

const $$ = (entry: any): number =>
  entry && typeof entry === "object" && "dollars" in entry ? (entry as CostEntry).dollars || 0 : 0;
const tok = (entry: any): number =>
  entry && typeof entry === "object" && "tokens" in entry ? (entry as CostEntry).tokens || 0 : 0;

type Datum = { name: string; value: number; tokens?: number };

const DonutCard = ({
  title,
  data,
  formatter = fmt$,
}: {
  title: string;
  data: Datum[];
  formatter?: (n: number) => string;
}) => {
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((a, b) => a + b.value, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={filtered} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {filtered.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                    return [`${formatter(value)} (${pct}%)`, name];
                  }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    <span className={`text-xl font-semibold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>
      {value}
    </span>
  </div>
);

const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="col-span-full mt-2 flex items-center justify-between border-t border-border pt-4 first:border-t-0 first:pt-0">
    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>
    {right}
  </div>
);

const sortDesc = (rows: Datum[]) => [...rows].sort((a, b) => b.value - a.value);

export const SessionUsageDashboard = ({ data }: { data: UsageData }) => {
  const byStep = data.by_step || {};
  const stepKeys = Object.keys(byStep);
  const [stepId, setStepId] = useState<string>("");

  const effective = useMemo(() => {
    if (stepId && byStep[stepId]) return byStep[stepId];
    return data.total;
  }, [stepId, byStep, data.total]);

  const cost = effective.cost || {};
  const bySource = (effective.by_source || data.by_source || {}) as any;
  const inputSrc = bySource.input || {};
  const outputSrc = bySource.output || {};
  const toolResults = inputSrc.tool_results || {};
  const inputToolCalls = inputSrc.tool_calls || {};
  const toolCalls = outputSrc.tool_calls || {};
  const fileOps = effective.file_ops || data.total.file_ops || {};
  const ws = effective.read_file_whitespace || data.read_file_whitespace || {};
  const timing = effective.timing || {};

  const inputCost = $$(cost.input) + $$(cost.cache_write) + $$(cost.cache_read);
  const outputCost = $$(cost.output);
  const totalInputTokens = tok(cost.input) + tok(cost.cache_write) + tok(cost.cache_read);
  const totalOutputTokens = tok(cost.output);

  const stepLabels = stepKeys.map((k) => `Step ${k}`);
  const stepTotalCosts: Datum[] = stepKeys.map((k, i) => ({ name: stepLabels[i], value: $$(byStep[k].cost?.total) }));
  const stepDurations: Datum[] = stepKeys.map((k, i) => ({
    name: stepLabels[i],
    value: (byStep[k].timing?.total_duration_ms || 0) / 1000,
  }));
  const stepInputCosts: Datum[] = stepKeys.map((k, i) => ({
    name: stepLabels[i],
    value: $$(byStep[k].cost?.input) + $$(byStep[k].cost?.cache_write) + $$(byStep[k].cost?.cache_read),
  }));
  const stepOutputCosts: Datum[] = stepKeys.map((k, i) => ({ name: stepLabels[i], value: $$(byStep[k].cost?.output) }));

  const modelData = useMemo(() => {
    const labels = Object.keys(data.by_model || {});
    return labels.map((m) => {
      const c = data.by_model[m].cost || {};
      return {
        name: m,
        Input: $$(c.input) + $$(c.cache_write) + $$(c.cache_read),
        Output: $$(c.output),
      };
    });
  }, [data.by_model]);

  const trData = sortDesc(
    Object.entries(toolResults).map(([k, v]: [string, any]) => ({ name: k, value: v.dollars || 0, tokens: v.tokens || 0 })),
  );
  const itcData = sortDesc(
    Object.entries(inputToolCalls).map(([k, v]: [string, any]) => ({ name: k, value: v.dollars || 0, tokens: v.tokens || 0 })),
  );
  const tcData = sortDesc(
    Object.entries(toolCalls)
      .filter(([k]) => k !== "__total")
      .map(([k, v]: [string, any]) => ({ name: k, value: v.dollars || 0, tokens: v.tokens || 0 })),
  );

  const outputSrcData: Datum[] = [];
  for (const [k, v] of Object.entries(outputSrc)) {
    if (k === "__total" || k === "tool_calls") continue;
    outputSrcData.push({ name: k.replace(/_/g, " "), value: ((v as any).dollars || 0) });
  }
  if ((toolCalls as any).__total) {
    outputSrcData.push({ name: "tool calls", value: (toolCalls as any).__total.dollars || 0 });
  }

  // Whitespace
  const wsLine = ws.line_returns_count || 0;
  const wsUnnec = ws.unnecessary_space_count || 0;
  const wsTotal = ws.total_chars || 0;
  const wsOther = Math.max(0, wsTotal - wsLine - wsUnnec);
  const wsData: Datum[] = [
    { name: "Line Returns", value: wsLine },
    { name: "Unnecessary Spaces", value: wsUnnec },
    { name: "Other Chars", value: wsOther },
  ];

  // Detail rows
  const inputRows = [
    ...Object.entries(toolResults).map(([k, v]: [string, any]) => ({
      category: "Tool Result",
      source: k,
      tokens: v.tokens || 0,
      dollars: v.dollars || 0,
    })),
    ...Object.entries(inputToolCalls).map(([k, v]: [string, any]) => ({
      category: "Tool Use",
      source: k,
      tokens: v.tokens || 0,
      dollars: v.dollars || 0,
    })),
  ].sort((a, b) => b.dollars - a.dollars);

  const outputRows = [
    ...Object.entries(outputSrc)
      .filter(([k]) => k !== "__total" && k !== "tool_calls")
      .map(([k, v]: [string, any]) => ({
        category: "Output",
        source: k.replace(/_/g, " "),
        tokens: v.tokens || 0,
        dollars: v.dollars || 0,
      })),
    ...Object.entries(toolCalls)
      .filter(([k]) => k !== "__total")
      .map(([k, v]: [string, any]) => ({
        category: "Tool Call",
        source: k,
        tokens: v.tokens || 0,
        dollars: v.dollars || 0,
      })),
  ].sort((a, b) => b.dollars - a.dollars);

  const fileOpsIn = fileOps.input || {};
  const fileOpsOut = fileOps.output || {};

  const topFiles = (perFile?: Record<string, { chars: number; calls: number; file_size?: number }>) => {
    const entries = Object.entries(perFile || {}).sort((a, b) => b[1].chars - a[1].chars).slice(0, 10);
    if (entries.length === 0)
      return <p className="text-sm text-muted-foreground">No file data available</p>;
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead className="text-right">Chars</TableHead>
            <TableHead className="text-right">Calls</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([fp, stats]) => (
            <TableRow key={fp}>
              <TableCell className="font-mono text-xs" title={fp}>
                {fp.split("/").slice(-2).join("/")}
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmtTokens(stats.chars)}</TableCell>
              <TableCell className="text-right tabular-nums">{stats.calls}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const stepFilter = (
    <Select value={stepId || "all"} onValueChange={(v) => setStepId(v === "all" ? "" : v)}>
      <SelectTrigger className="h-8 w-[180px] text-xs">
        <SelectValue placeholder="Overall workflow" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Overall workflow</SelectItem>
        {stepKeys.map((k) => (
          <SelectItem key={k} value={k}>
            Step {k}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {/* Input + Output */}
      <SectionTitle right={stepFilter}>Input + Output</SectionTitle>

      <div className="col-span-full grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9">
        <Stat label="Total Cost" value={fmt$($$(cost.total))} accent />
        <Stat label="Requests" value={String(effective.request_count || 0)} />
        <Stat label="Tokens" value={fmtTokens(totalInputTokens + totalOutputTokens)} />
        <Stat label="Input Cost" value={fmt$(inputCost)} accent />
        <Stat label="Output Cost" value={fmt$(outputCost)} accent />
        <Stat label="Avg / Req" value={fmt$($$(cost.total) / (effective.request_count || 1))} accent />
        <Stat label="Wall Clock" value={fmtDuration(timing.wall_clock_ms)} />
        <Stat label="API Time" value={fmtDuration(timing.total_duration_ms)} />
        <Stat label="Avg Req" value={fmtDuration(timing.avg_duration_ms)} />
      </div>

      <DonutCard title="Cost Breakdown" data={[{ name: "Input", value: inputCost }, { name: "Output", value: outputCost }]} />
      <DonutCard title="Cost by Step" data={stepTotalCosts} />
      <DonutCard title="Duration by Step (s)" data={stepDurations} formatter={(n) => n.toFixed(1) + "s"} />

      <Card className="md:col-span-2 xl:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cost by Model
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={140} />
                <Tooltip
                  formatter={(v: number) => fmt$(v)}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Input" stackId="a" fill={PALETTE[0]} />
                <Bar dataKey="Output" stackId="a" fill={PALETTE[1]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Top Files Read
          </CardTitle>
        </CardHeader>
        <CardContent>{topFiles(fileOpsIn.per_file)}</CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Top Files Written
          </CardTitle>
        </CardHeader>
        <CardContent>{topFiles(fileOpsOut.per_file)}</CardContent>
      </Card>

      {/* Input */}
      <SectionTitle right={stepFilter}>Input</SectionTitle>
      <div className="col-span-full grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Input Cost" value={fmt$(inputCost)} accent />
        <Stat label="Input Tokens" value={`${fmtTokens(tok(cost.input))} (${fmt$($$(cost.input))})`} />
        <Stat label="Cache Writes" value={`${fmtTokens(tok(cost.cache_write))} (${fmt$($$(cost.cache_write))})`} />
        <Stat label="Cache Reads" value={`${fmtTokens(tok(cost.cache_read))} (${fmt$($$(cost.cache_read))})`} />
        <Stat
          label="Files Read"
          value={`${fileOpsIn.unique_files_read || 0} (${fmtTokens(fileOpsIn.total_read_chars || 0)} ch)`}
        />
      </div>

      <DonutCard
        title="Input Cost Breakdown"
        data={[
          { name: "Uncached", value: $$(cost.input) },
          { name: "Cache Write", value: $$(cost.cache_write) },
          { name: "Cache Read", value: $$(cost.cache_read) },
        ]}
      />
      <DonutCard title="Input Cost by Step" data={stepInputCosts} />
      <DonutCard title="Tool Results" data={trData} />
      <DonutCard title="Tool Use Breakdown" data={itcData} />
      <DonutCard
        title="read_file Whitespace (chars)"
        data={wsData}
        formatter={(n) => fmtTokens(n) + " ch"}
      />

      <Card className="md:col-span-2 xl:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Input Tools — Detailed Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inputRows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.category}</TableCell>
                  <TableCell className="font-mono text-xs">{r.source}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtTokens(r.tokens)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt$(r.dollars)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Output */}
      <SectionTitle right={stepFilter}>Output</SectionTitle>
      <div className="col-span-full grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Output Cost" value={fmt$(outputCost)} accent />
        <Stat label="Output Tokens" value={`${fmtTokens(tok(cost.output))} (${fmt$($$(cost.output))})`} />
        <Stat
          label="Files Written"
          value={`${fileOpsOut.unique_files_written || 0} / ${fileOpsOut.files_written || 0} ops`}
        />
      </div>

      <DonutCard title="Output Cost Breakdown" data={outputSrcData} />
      <DonutCard title="Output Cost by Step" data={stepOutputCosts} />
      <DonutCard title="Tool Calls Breakdown" data={tcData} />

      <Card className="md:col-span-2 xl:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Output Tools — Detailed Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outputRows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.category}</TableCell>
                  <TableCell className="font-mono text-xs">{r.source}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtTokens(r.tokens)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt$(r.dollars)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
