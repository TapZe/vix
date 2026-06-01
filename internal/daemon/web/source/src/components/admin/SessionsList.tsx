import { useSessions } from "@/hooks/useSessions";
import { SessionCard } from "./SessionCard";

export const SessionsList = () => {
  const sessions = useSessions();

  return (
    <section className="container mx-auto px-4 pb-24">
      <div>
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Connected sessions
          </h2>
          <span className="text-sm text-muted-foreground">
            {sessions.length} active
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="glass-card rounded-xl p-10 text-center">
            <p className="text-base font-medium text-foreground">No sessions connected</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Sessions will appear here once vixd is running and accepting connections.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
