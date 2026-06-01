import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Folder, PenSquare, Clock, Play, MessageSquare } from "lucide-react";
import { Header } from "@/components/admin/Header";
import { Button } from "@/components/ui/button";
import { useSessions } from "@/hooks/useSessions";
import type { VixdSession } from "@/data/sessions";
import { SessionUsageDashboard } from "@/components/admin/SessionUsageDashboard";
import { getUsageForSession } from "@/data/sessionUsage";

const STATUS_COLOR = "#00AA00";

const formatStartedAt = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });

const timeAgo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ago`;
  if (hours > 0) return `${hours}h ${minutes}mn ago`;
  if (minutes > 0) return `${minutes}mn ${seconds}s ago`;
  return `${seconds}s ago`;
};

const numberFmt = new Intl.NumberFormat();

const SessionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const sessions = useSessions();
  const [session, setSession] = useState<VixdSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [lastRequestAgo, setLastRequestAgo] = useState("");

  useEffect(() => {
    if (!sessions.length) return;
    const found = sessions.find((s) => s.id === id) ?? null;
    setSession(found);
    setNotFound(found === null);
  }, [sessions, id]);

  useEffect(() => {
    if (!session?.lastRequestAt) {
      setLastRequestAgo("");
      return;
    }
    setLastRequestAgo(timeAgo(session.lastRequestAt));
    const timer = setInterval(() => setLastRequestAgo(timeAgo(session.lastRequestAt!)), 1000);
    return () => clearInterval(timer);
  }, [session?.lastRequestAt]);

  return (
    <div className="relative min-h-screen bg-background">
      <Header />
      <div className="pointer-events-none fixed inset-0 z-0 bg-grid opacity-30" />

      <main className="relative z-10 pt-16">
        <div className="container mx-auto px-4 py-10 md:py-16">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Back to mission control
          </Link>

          {notFound ? (
            <div className="mt-10 rounded-xl border border-border bg-card p-10 text-center">
              <h1 className="text-2xl font-bold text-foreground">Session not found</h1>
              <p className="mt-2 text-muted-foreground">
                No session with id <code className="font-mono">{id}</code> is connected.
              </p>
            </div>
          ) : !session ? (
            <div className="mt-10 rounded-xl border border-border bg-card p-10 text-center">
              <p className="text-muted-foreground">Loading…</p>
            </div>
          ) : (
            <div className="mt-6 glass-card rounded-2xl p-6 md:p-8">
              <header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="relative inline-flex h-3 w-3">
                      <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                        style={{ backgroundColor: STATUS_COLOR }}
                      />
                      <span
                        className="relative inline-flex h-3 w-3 rounded-full"
                        style={{ backgroundColor: STATUS_COLOR }}
                      />
                    </span>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                      <code className="font-mono">{session.id}</code>
                    </h1>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-foreground/80">
                    <Folder size={16} className="text-primary shrink-0" />
                    <code className="font-mono break-all text-sm">{session.cwd}</code>
                  </div>
                </div>

                <Link to={`/session/${session.id}/whiteboard`} className="shrink-0">
                  <Button size="lg" className="gap-2">
                    <PenSquare size={18} />
                    Start whiteboard session
                  </Button>
                </Link>
              </header>

              <div className="my-6 h-px bg-border" />

              <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                {session.startedAt && (
                  <div>
                    <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Play size={12} className="text-primary" />
                      Started at
                    </dt>
                    <dd className="mt-1.5 font-mono text-sm text-foreground">
                      {formatStartedAt(session.startedAt)}
                    </dd>
                  </div>
                )}

                <div>
                  <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Clock size={12} className="text-primary" />
                    Last message
                  </dt>
                  <dd className="mt-1.5 font-mono text-sm text-foreground">
                    {session.lastRequestAt ? lastRequestAgo : <span className="text-muted-foreground">—</span>}
                  </dd>
                </div>

                <div>
                  <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <ArrowDownToLine size={12} className="text-primary" />
                    Input tokens
                  </dt>
                  <dd className="mt-1.5 font-mono text-lg text-foreground">
                    {numberFmt.format(session.inputTokens)}
                  </dd>
                </div>

                <div>
                  <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <ArrowUpFromLine size={12} className="text-primary" />
                    Output tokens
                  </dt>
                  <dd className="mt-1.5 font-mono text-lg text-foreground">
                    {numberFmt.format(session.outputTokens)}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {session && (() => {
            const usage = getUsageForSession(session.id);
            const totalTokens = usage?.total?.cost?.total?.tokens
              ?? ((usage?.total?.cost?.input?.tokens ?? 0) + (usage?.total?.cost?.output?.tokens ?? 0));
            const hasStepData = usage?.by_step && Object.keys(usage.by_step).length > 0;
            if (!usage || (!totalTokens && !hasStepData)) return null;
            return (
              <section className="mt-8">
                <h2 className="mb-4 text-2xl font-bold tracking-tight text-foreground">Cost & timing breakdown</h2>
                <SessionUsageDashboard data={usage} />
              </section>
            );
          })()}
        </div>
      </main>
    </div>
  );
};

export default SessionDetail;
