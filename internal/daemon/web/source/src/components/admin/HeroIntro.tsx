export const HeroIntro = () => {
  return (
    <div className="animate-fade-in-up mb-8 rounded-xl border border-border bg-card p-6 md:p-8 text-left">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
        What is this?
      </h2>
      <p className="text-base md:text-lg text-foreground/80 leading-relaxed">
        This is the control center for{" "}
        <code className="rounded bg-secondary px-1.5 py-0.5 text-sm">vixd</code>, the
        background daemon that powers Vix coding sessions. From here you can see every
        active session connected to the daemon and the working directory it&apos;s
        operating in.
      </p>
    </div>
  );
};
