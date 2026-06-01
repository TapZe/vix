import { Cpu, HardDrive, MemoryStick } from "lucide-react";
import { useDaemonMetrics } from "@/hooks/useDaemonMetrics";

function formatGb(mb: number) {
  return (mb / 1024).toFixed(1);
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  percent: number;
}

const MetricCard = ({ icon, label, value, sub, percent }: MetricCardProps) => (
  <div className="glass-card rounded-xl p-5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {percent.toFixed(0)}%
      </span>
    </div>
    <div className="mt-3 flex items-baseline gap-2">
      <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground">{sub}</span>
    </div>
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  </div>
);

export const DaemonMetrics = () => {
  const m = useDaemonMetrics();
  const ramPct = (m.ramUsedMb / m.ramTotalMb) * 100;
  const diskUsedGb = m.diskTotalGb - m.diskAvailableGb;
  const diskPct = (diskUsedGb / m.diskTotalGb) * 100;

  return (
    <section className="container mx-auto px-4 pb-8">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Server metrics
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          icon={<MemoryStick className="h-4 w-4" />}
          label="Memory"
          value={`${formatGb(m.ramUsedMb)} GB`}
          sub={`/ ${formatGb(m.ramTotalMb)} GB`}
          percent={ramPct}
        />
        <MetricCard
          icon={<Cpu className="h-4 w-4" />}
          label="CPU"
          value={m.cpuAvailable ? `${m.cpuPercent.toFixed(0)}%` : "N/A"}
          sub={m.cpuAvailable ? "utilization" : "not available"}
          percent={m.cpuAvailable ? m.cpuPercent : 0}
        />
        <MetricCard
          icon={<HardDrive className="h-4 w-4" />}
          label="Disk"
          value={`${m.diskAvailableGb} GB`}
          sub={`free of ${m.diskTotalGb} GB`}
          percent={diskPct}
        />
      </div>
    </section>
  );
};
