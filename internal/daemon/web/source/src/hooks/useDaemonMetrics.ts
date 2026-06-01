import { useEffect, useState, useRef } from "react";

export interface DaemonMetrics {
  ramUsedMb: number;
  ramTotalMb: number;
  cpuPercent: number;
  cpuAvailable: boolean;
  diskAvailableGb: number;
  diskTotalGb: number;
}

const mockMetrics: DaemonMetrics = {
  ramUsedMb: 5320,
  ramTotalMb: 16384,
  cpuPercent: 23,
  cpuAvailable: true,
  diskAvailableGb: 142,
  diskTotalGb: 512,
};

interface RawVitals {
  cpu_percent: number;
  cpu_available: boolean;
  ram_used: number;
  ram_total: number;
  disk_used: number;
  disk_total: number;
}

function fromRaw(v: RawVitals): DaemonMetrics {
  const MB = 1048576;
  const GB = 1073741824;
  return {
    cpuPercent: v.cpu_percent,
    cpuAvailable: v.cpu_available,
    ramUsedMb: v.ram_used / MB,
    ramTotalMb: v.ram_total / MB,
    diskTotalGb: Math.round(v.disk_total / GB),
    diskAvailableGb: Math.round((v.disk_total - v.disk_used) / GB),
  };
}

export function useDaemonMetrics(): DaemonMetrics {
  const [metrics, setMetrics] = useState<DaemonMetrics>(
    import.meta.env.VITE_USE_REAL_DATA
      ? { ramUsedMb: 0, ramTotalMb: 1, cpuPercent: 0, cpuAvailable: false, diskAvailableGb: 0, diskTotalGb: 1 }
      : mockMetrics
  );
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!import.meta.env.VITE_USE_REAL_DATA) {
      // Animate mock values gently for liveliness
      const id = setInterval(() => {
        setMetrics((m) => ({
          ...m,
          cpuPercent: Math.max(2, Math.min(98, m.cpuPercent + (Math.random() * 10 - 5))),
          ramUsedMb: Math.max(
            512,
            Math.min(m.ramTotalMb - 256, m.ramUsedMb + (Math.random() * 200 - 100))
          ),
        }));
      }, 2000);
      return () => clearInterval(id);
    }

    function connect() {
      const ws = new WebSocket(`ws://${location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg: { vitals: RawVitals } = JSON.parse(evt.data);
          if (msg.vitals) setMetrics(fromRaw(msg.vitals));
        } catch {
          // ignore
        }
      };

      ws.onclose = () => setTimeout(connect, 2000);
      ws.onerror = () => ws.close();
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  return metrics;
}
