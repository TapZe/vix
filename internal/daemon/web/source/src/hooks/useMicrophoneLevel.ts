import { useEffect, useRef, useState } from 'react';

export function useMicrophoneLevel(): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    async function setup() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const buf = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((sum, v) => sum + (v - 128) ** 2, 0) / buf.length);
        const raw = Math.min(100, Math.round((rms / 40) * 100));
        setLevel(raw < 5 ? 0 : raw);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(rafRef.current);
        source.disconnect();
        ctx.close();
        stream.getTracks().forEach((t) => t.stop());
      };
    }

    setup();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return level;
}
