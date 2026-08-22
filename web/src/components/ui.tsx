import { type ReactNode } from "react";
import { motion } from "motion/react";

/* Shared surfaces. Deliberately few: one card, one label, one chip, one tile. */

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`border border-line bg-paper-2/70 backdrop-blur-sm ${className}`}>{children}</div>
);

export const CardHead = ({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap border-b border-line px-5 py-3.5">
    <div className="min-w-0">
      <h2 className="text-[13.5px] font-semibold tracking-tight">{title}</h2>
      {sub && <div className="mt-0.5 text-[11.5px] text-ink-faint">{sub}</div>}
    </div>
    {right}
  </div>
);

export const Label = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint ${className}`}>{children}</div>
);

export const Chip = ({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "up" | "down" | "warn" | "accent" }) => {
  const map = {
    neutral: "border-line-2 text-ink-dim",
    up: "border-up/50 text-up",
    down: "border-down/50 text-down",
    warn: "border-warn/50 text-warn",
    accent: "border-accent/50 text-accent",
  } as const;
  return (
    <span className={`inline-block whitespace-nowrap border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] ${map[tone]}`}>
      {children}
    </span>
  );
};

export const Tile = ({ label, value, sub, tone = "" }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string;
}) => (
  <div className="border border-line bg-paper-2/70 px-4 py-3.5">
    <Label>{label}</Label>
    <div className={`mt-1.5 text-[21px] font-bold tracking-tight tnum ${tone}`}>{value}</div>
    {sub && <div className="mt-0.5 text-[11.5px] text-ink-dim">{sub}</div>}
  </div>
);

export function Button({ children, onClick, active, className = "", title }: {
  children: ReactNode; onClick?: () => void; active?: boolean; className?: string; title?: string;
}) {
  return (
    <motion.button
      type="button"
      title={title}
      onClick={onClick}
      whileTap={{ scale: 0.975 }}
      className={`border px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] transition-colors
        ${active ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-dim hover:border-ink hover:text-ink"} ${className}`}
    >
      {children}
    </motion.button>
  );
}

/** Skeleton shown while an index downloads — shaped like the thing it replaces. */
export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse bg-line/60 ${className}`} />
);

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <Card className="p-6">
      <div className="text-[13px] text-ink-dim">
        <span className="text-down font-semibold">Could not load the market data.</span>{" "}
        {String((error as Error)?.message ?? error)}. The data is rebuilt each market evening; if this
        persists the last build may have failed.
      </div>
    </Card>
  );
}
