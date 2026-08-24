import { motion } from "motion/react";
import { Label } from "./ui";
import { isNum, nf } from "../lib/format";

/* ---------------------------------------------------------------------------
   The market-direction vocabulary.

   Green and red carry direction everywhere on this site, and they are close to
   indistinguishable for red-green colour blindness — the two tokens measure
   ΔE 4.2 under deuteranopia, well under the ΔE 8 that makes a pair safe to
   tell apart. About one man in twelve reads this page that way.

   So colour is never the signal here, only the reinforcement. Every direction
   is also carried by an arrow and a signed number, both of which survive any
   kind of colour vision, greyscale printing and forced-colours mode.
--------------------------------------------------------------------------- */

export const arrow = (v: unknown) => (!isNum(v) || v === 0 ? "—" : v > 0 ? "▲" : "▼");
export const dirTone = (v: unknown) => (!isNum(v) ? "text-ink-dim" : v > 0 ? "text-up" : v < 0 ? "text-down" : "text-ink-dim");
export const signed = (v: unknown, d = 2) => (isNum(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v), d)}%` : "—");

/** One instrument: name, level, and its move — arrow first, colour second. */
export function QuoteTile({ label, price, pct, sub, dp = 2 }: {
  label: string; price: number | null; pct: number | null; sub?: string; dp?: number;
}) {
  return (
    <div className="bg-paper-2 px-4 py-3.5">
      <Label>{label}</Label>
      <div className="mt-1.5 text-[19px] font-bold tracking-tight tnum">
        {isNum(price) ? nf(price, dp) : "—"}
      </div>
      <div className={`mt-0.5 flex items-baseline gap-1.5 text-[12.5px] font-semibold tnum ${dirTone(pct)}`}>
        <span aria-hidden>{arrow(pct)}</span>
        <span>{signed(pct)}</span>
      </div>
      {sub && <div className="mt-1 text-[10.5px] text-ink-faint">{sub}</div>}
    </div>
  );
}

/**
 * Advances against declines.
 *
 * A proportion, so one bar rather than two — but each segment is labelled with
 * its own count, because the split is the point and a reader who cannot
 * separate the two colours still needs to know which side is which.
 */
export function BreadthBar({ advances, declines, unchanged }: {
  advances: number; declines: number; unchanged: number;
}) {
  const total = Math.max(1, advances + declines + unchanged);
  const seg = [
    { k: "Advancing", n: advances, cls: "bg-up", mark: "▲" },
    { k: "Unchanged", n: unchanged, cls: "bg-line-2", mark: "—" },
    { k: "Declining", n: declines, cls: "bg-down", mark: "▼" },
  ].filter((s) => s.n > 0);

  return (
    <div>
      {/* 2px surface gaps between segments, so adjacent fills never merge */}
      <div className="flex h-7 w-full gap-[2px] overflow-hidden">
        {seg.map((s) => (
          <motion.div key={s.k} title={`${s.k} ${s.n}`}
            initial={{ width: 0 }} animate={{ width: `${(s.n / total) * 100}%` }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className={`${s.cls} grid place-items-center`}>
            {(s.n / total) > 0.12 && (
              <span className="px-1 font-mono text-[10px] font-semibold text-paper tnum">{s.n}</span>
            )}
          </motion.div>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
        {seg.map((s) => (
          <span key={s.k} className="flex items-center gap-1.5 text-[11.5px] text-ink-dim">
            <i className={`inline-block h-2.5 w-2.5 ${s.cls}`} />
            <span aria-hidden className="text-[9px]">{s.mark}</span>
            {s.k} <b className="text-ink tnum">{s.n}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Sector moves, diverging from a neutral zero.
 *
 * Bars grow left or right of a centre line, so the SHAPE says which way a
 * sector went before any colour does. Every bar is value-labelled.
 */
export function SectorBars({ rows }: { rows: { sector: string; pct: number; count: number; advancePct: number }[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.pct)), 0.1);

  return (
    <div className="grid gap-1.5">
      {rows.map((r) => {
        const w = (Math.abs(r.pct) / max) * 50;      // half-width each side of centre
        const up = r.pct >= 0;
        return (
          <div key={r.sector} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-ink-dim">{r.sector}</span>
                <span className="font-mono text-[9.5px] text-ink-faint">{r.count} cos</span>
              </div>
              <div className="relative mt-1 h-2">
                <div className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${w}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className={`absolute inset-y-0 ${up ? "bg-up" : "bg-down"}`}
                  style={up ? { left: "50%" } : { right: "50%" }}
                />
              </div>
            </div>
            <span className={`w-[74px] text-right text-[12px] font-semibold tnum ${dirTone(r.pct)}`}>
              <span aria-hidden className="mr-1">{arrow(r.pct)}</span>{signed(r.pct)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
