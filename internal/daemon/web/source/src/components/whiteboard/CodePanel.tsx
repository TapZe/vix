import { useMemo, useState } from 'react';
import { PanelRightClose, FileCode2, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { highlightLine } from '@/lib/syntax';
import 'highlight.js/styles/github.css';

export interface CodeArtifact {
  filename: string;
  language?: string;
  content: string;
  /** If provided, enables diff view (previous content). */
  previous?: string;
}

interface CodePanelProps {
  artifacts: CodeArtifact[];
  onClose: () => void;
}

type DiffLine = { type: 'add' | 'del' | 'ctx'; oldNum?: number; newNum?: number; text: string };

/** Tiny LCS-based line diff — sufficient for short snippets. */
function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n');
  const B = b.split('\n');
  const n = A.length, m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0, oldNum = 1, newNum = 1;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ type: 'ctx', oldNum: oldNum++, newNum: newNum++, text: A[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', oldNum: oldNum++, text: A[i++] });
    } else {
      out.push({ type: 'add', newNum: newNum++, text: B[j++] });
    }
  }
  while (i < n) out.push({ type: 'del', oldNum: oldNum++, text: A[i++] });
  while (j < m) out.push({ type: 'add', newNum: newNum++, text: B[j++] });
  return out;
}

function diffStats(diff: DiffLine[]) {
  let add = 0, del = 0;
  for (const l of diff) {
    if (l.type === 'add') add++;
    else if (l.type === 'del') del++;
  }
  return { add, del };
}

interface ArtifactBlockProps {
  artifact: CodeArtifact;
  mode: 'code' | 'diff';
}

const ArtifactBlock = ({ artifact, mode }: ArtifactBlockProps) => {
  const hasDiff = typeof artifact.previous === 'string';
  const showDiff = mode === 'diff' && hasDiff;

  const diff = useMemo(
    () => (hasDiff ? diffLines(artifact.previous!, artifact.content) : []),
    [artifact, hasDiff],
  );
  const stats = useMemo(() => diffStats(diff), [diff]);
  const codeLines = artifact.content.split('\n');

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden bg-white">
      {/* File header */}
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        <FileCode2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-gray-800 truncate">{artifact.filename}</span>
        {artifact.language && (
          <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
            {artifact.language}
          </span>
        )}
        {hasDiff && (
          <span className="text-[10px] font-mono flex items-center gap-1 ml-auto">
            <span className="text-green-600">+{stats.add}</span>
            <span className="text-red-600">-{stats.del}</span>
          </span>
        )}
      </div>

      {/* Body */}
      {!showDiff ? (
        <pre className="text-xs font-mono leading-relaxed overflow-x-auto">
          {codeLines.map((line, idx) => (
            <div key={idx} className="flex hover:bg-gray-50">
              <span className="select-none w-10 pr-2 text-right text-gray-400 border-r border-gray-100 flex-shrink-0">
                {idx + 1}
              </span>
              <code
                className="px-3 whitespace-pre"
                dangerouslySetInnerHTML={{ __html: highlightLine(line, artifact.language) || '&nbsp;' }}
              />
            </div>
          ))}
        </pre>
      ) : (
        <pre className="text-xs font-mono leading-relaxed overflow-x-auto">
          {diff.map((l, idx) => {
            const bg = l.type === 'add' ? 'bg-green-50' : l.type === 'del' ? 'bg-red-50' : '';
            const marker = l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' ';
            const markerColor =
              l.type === 'add' ? 'text-green-600' : l.type === 'del' ? 'text-red-600' : 'text-gray-400';
            const textColor =
              l.type === 'add' ? 'text-green-900' : l.type === 'del' ? 'text-red-900' : '';
            return (
              <div key={idx} className={`flex ${bg}`}>
                <span className="select-none w-8 pr-1 text-right text-gray-400 flex-shrink-0">{l.oldNum ?? ''}</span>
                <span className="select-none w-8 pr-1 text-right text-gray-400 border-r border-gray-100 flex-shrink-0">
                  {l.newNum ?? ''}
                </span>
                <span className={`select-none w-4 text-center flex-shrink-0 ${markerColor}`}>{marker}</span>
                <code
                  className={`pr-3 whitespace-pre ${textColor}`}
                  dangerouslySetInnerHTML={{ __html: highlightLine(l.text, artifact.language) || '&nbsp;' }}
                />
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
};

export const CodePanel = ({ artifacts, onClose }: CodePanelProps) => {
  const changedCount = artifacts.filter((a) => typeof a.previous === 'string').length;
  const anyDiff = changedCount > 0;
  const [mode, setMode] = useState<'code' | 'diff'>(anyDiff ? 'diff' : 'code');

  return (
    <aside className="w-[460px] flex-shrink-0 bg-white/90 backdrop-blur-sm border-l border-gray-200 shadow-lg z-10 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium text-gray-800 truncate">
            {artifacts.length} {artifacts.length === 1 ? 'file' : 'files'}
            {changedCount > 0 && (
              <span className="text-gray-500 font-normal"> · {changedCount} changed</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'code' | 'diff')}>
            <TabsList className="h-7 p-0.5">
              <TabsTrigger value="code" className="text-xs h-6 px-2">Code</TabsTrigger>
              <TabsTrigger value="diff" className="text-xs h-6 px-2" disabled={!anyDiff}>
                <GitCompare className="h-3 w-3 mr-1" /> Diff
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close panel">
            <PanelRightClose className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
      </div>

      {/* Stacked file list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {artifacts.length === 0 ? (
          <p className="text-sm text-gray-400 italic px-1">No code artifacts yet.</p>
        ) : (
          artifacts.map((a) => <ArtifactBlock key={a.filename} artifact={a} mode={mode} />)
        )}
      </div>
    </aside>
  );
};
