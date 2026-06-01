import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Folder, GitBranch, PenSquare } from "lucide-react";
import type { VixdSession } from "@/data/sessions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STATUS_COLOR = "#00AA00";

const formatUptime = (startedAt: string) => {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatStartedAt = (startedAt: string) =>
  new Date(startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const SessionCard = ({ session }: { session: VixdSession }) => {
  const [uptime, setUptime] = useState(() => session.startedAt ? formatUptime(session.startedAt) : '');

  useEffect(() => {
    if (!session.startedAt) return;
    const id = setInterval(() => setUptime(formatUptime(session.startedAt!)), 1000);
    return () => clearInterval(id);
  }, [session.startedAt]);

  return (
    <Link
      to={`/sessions/${session.id}`}
      className="glass-card block rounded-xl p-5 transition-all hover:border-primary/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-4">
        <span className="relative mt-2 inline-flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: STATUS_COLOR }} />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR }} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-sm font-semibold text-foreground">{session.id}</span>
            {session.pid != null && (
              <span className="font-mono text-xs text-muted-foreground">PID {session.pid}</span>
            )}
          </div>

          {session.parentId && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <GitBranch size={12} className="shrink-0" />
              <span className="font-mono">
                fork of {session.parentId.split("-")[0]} · turn {(session.forkTurnIdx ?? 0) + 1}
              </span>
            </div>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mt-2 flex items-center gap-2 text-sm text-foreground/80">
                <Folder size={14} className="shrink-0 text-primary" />
                <code className="truncate font-mono">{session.cwd}</code>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-mono text-xs">{session.cwd}</span>
            </TooltipContent>
          </Tooltip>

          {session.startedAt && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>started {formatStartedAt(session.startedAt)}</span>
              <span aria-hidden>·</span>
              <span>up {uptime}</span>
            </div>
          )}
        </div>

        <Button
          asChild
          size="sm"
          variant="outline"
          className="shrink-0 gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Link to={`/session/${session.id}/whiteboard`}>
            <PenSquare size={14} />
            Whiteboard
          </Link>
        </Button>
      </div>
    </Link>
  );
};
