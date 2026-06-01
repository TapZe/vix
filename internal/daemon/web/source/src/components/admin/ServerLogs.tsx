import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const mockLines = [
  "vixd: listening on 127.0.0.1:8787",
  "vixd: session sess_a13f connected (cwd=/home/user/proj)",
  "vixd: tokens in=1240 out=512 (sess_a13f)",
  "vixd: heartbeat ok",
  "vixd: session sess_77c2 connected (cwd=/home/user/api)",
  "vixd: gc reclaimed 18.4MB",
  "vixd: tokens in=312 out=88 (sess_77c2)",
  "vixd: snapshot persisted (12 sessions)",
];

function ts() {
  return new Date().toISOString().split("T")[1].replace("Z", "");
}

export const ServerLogs = () => {
  const [lines, setLines] = useState<string[]>(() =>
    mockLines.slice(0, 4).map((l) => `[${ts()}] ${l}`)
  );
  const [copied, setCopied] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!import.meta.env.VITE_USE_REAL_DATA) {
      const id = setInterval(() => {
        const line = mockLines[Math.floor(Math.random() * mockLines.length)];
        setLines((prev) => [...prev.slice(-200), `[${ts()}] ${line}`]);
      }, 1800);
      return () => clearInterval(id);
    }

    const ws = new WebSocket(`ws://${location.host}/ws/logs`);
    ws.onmessage = (evt) => {
      setLines((prev) => [...prev.slice(-500), String(evt.data)]);
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.scrollTop = taRef.current.scrollHeight;
    }
  }, [lines]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      toast({ title: "Logs copied", description: "Server logs copied to clipboard." });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <section className="container mx-auto px-4 pb-24">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Server logs
        </h2>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" /> Copy
            </>
          )}
        </Button>
      </div>
      <textarea
        ref={taRef}
        readOnly
        value={lines.join("\n")}
        className="glass-card h-72 w-full resize-none rounded-xl bg-background/40 p-4 font-mono text-xs text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
      />
    </section>
  );
};
