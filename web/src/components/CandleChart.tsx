import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { inr, nf, qty } from "../lib/format";

export type Bar = [string, number, number, number, number, number];

/* ---------------------------------------------------------------------------
   Candles, volume, two moving averages and a hover readout.

   A reserved right-hand gutter carries the price labels so nothing is ever
   drawn on top of the candles — the one rule that keeps a dense chart legible.
--------------------------------------------------------------------------- */

const W = 1000, GUTTER = 92, PLOT = W - GUTTER;
const PH = 300, GAP = 16, VH = 62, H = PH + GAP + VH;

export default function CandleChart({ bars, sma50, sma200, weekly = false }: {
  bars: Bar[]; sma50: (number | null)[]; sma200: (number | null)[]; weekly?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const n = bars.length;

  const geo = useMemo(() => {
    if (!n) return null;
    const maVals = [...sma50, ...sma200].filter((x): x is number => typeof x === "number");
    const hi = Math.max(...bars.map((b) => b[2]), ...maVals);
    const lo = Math.min(...bars.map((b) => b[3]), ...maVals);
    const pad = (hi - lo) * 0.06 || 1;
    const yMax = hi + pad, yMin = Math.max(0, lo - pad);
    const X = (i: number) => (i / Math.max(1, n - 1)) * PLOT;
    const Y = (v: number) => PH - ((v - yMin) / (yMax - yMin)) * PH;
    const cw = Math.max(1.2, (PLOT / n) * 0.62);
    const vMax = Math.max(...bars.map((b) => b[5] || 0)) || 1;
    const line = (arr: (number | null)[]) => {
      let d = "", on = false;
      for (let i = 0; i < n; i++) {
        const v = arr[i];
        if (v === null || v === undefined) { on = false; continue; }
        d += `${on ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; on = true;
      }
      return d;
    };
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ y: t * PH, v: yMax - t * (yMax - yMin) }));
    return { X, Y, cw, vMax, p50: line(sma50), p200: line(sma200), ticks, last: bars[n - 1][4] };
  }, [bars, sma50, sma200, n]);

  if (!geo || !n) return null;

  const onMove = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vx = ((clientX - rect.left) / rect.width) * W;
    if (vx < 0) return setHover(null);
    setHover(Math.max(0, Math.min(n - 1, Math.round((Math.min(vx, PLOT) / PLOT) * (n - 1)))));
  };

  const b = hover !== null ? bars[hover] : null;
  const prev = hover !== null && hover > 0 ? bars[hover - 1][4] : b?.[1] ?? 0;
  const chg = b && prev ? ((b[4] - prev) / prev) * 100 : 0;

  return (
    <div className="relative"
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchMove={(e) => e.touches[0] && onMove(e.touches[0].clientX)}
      onTouchEnd={() => setHover(null)}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H + 16}`} preserveAspectRatio="none"
        style={{ width: "100%", height: H + 16, display: "block" }} role="img"
        aria-label={`${weekly ? "Weekly" : "Daily"} candles with volume and moving averages`}>

        {geo.ticks.map((t, i) => (
          <g key={i}>
            <line x1={0} y1={t.y} x2={PLOT} y2={t.y} className="stroke-line" strokeWidth={1} />
            <text x={PLOT + 8} y={t.y + 3.5} className="fill-ink-faint" fontSize={10.5} fontFamily="ui-monospace,Menlo,monospace">
              {Math.round(t.v).toLocaleString("en-IN")}
            </text>
          </g>
        ))}

        {bars.map((bar, i) => {
          const up = bar[4] >= bar[1];
          const x = geo.X(i), yO = geo.Y(bar[1]), yC = geo.Y(bar[4]);
          const cls = up ? "fill-up stroke-up" : "fill-down stroke-down";
          return (
            <motion.g key={bar[0]}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: Math.min(i, 60) * 0.004 }}
              opacity={hover === null || hover === i ? 1 : 0.72}>
              <line x1={x} y1={geo.Y(bar[2])} x2={x} y2={geo.Y(bar[3])} className={cls} strokeWidth={0.85} />
              <rect x={x - geo.cw / 2} y={Math.min(yO, yC)} width={geo.cw}
                height={Math.max(0.9, Math.abs(yC - yO))} className={cls} />
            </motion.g>
          );
        })}

        {geo.p200 && <motion.path d={geo.p200} fill="none" className="stroke-ink-faint" strokeWidth={1.6}
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />}
        {geo.p50 && <motion.path d={geo.p50} fill="none" className="stroke-ink-dim" strokeWidth={1.4} strokeDasharray="4 3"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }} />}

        {/* last close, tagged in the gutter */}
        <line x1={0} y1={geo.Y(geo.last)} x2={PLOT} y2={geo.Y(geo.last)} className="stroke-ink" strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />
        <rect x={PLOT} y={geo.Y(geo.last) - 8} width={GUTTER} height={16} className="fill-ink" />
        <text x={PLOT + 7} y={geo.Y(geo.last) + 3.5} className="fill-paper" fontSize={10.5} fontWeight={700} fontFamily="ui-monospace,Menlo,monospace">
          {Math.round(geo.last).toLocaleString("en-IN")}
        </text>

        <g transform={`translate(0 ${PH + GAP})`}>
          {bars.map((bar, i) => {
            const bh = ((bar[5] || 0) / geo.vMax) * VH;
            return <rect key={bar[0]} x={geo.X(i) - geo.cw / 2} y={VH - bh} width={geo.cw} height={bh}
              className={bar[4] >= bar[1] ? "fill-up" : "fill-down"} opacity={0.42} />;
          })}
          <text x={3} y={10} className="fill-ink-faint" fontSize={9.5} fontFamily="ui-monospace,Menlo,monospace">VOLUME</text>
        </g>

        {hover !== null && (
          <line x1={geo.X(hover)} y1={0} x2={geo.X(hover)} y2={PH + GAP + VH}
            className="stroke-ink" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.55} />
        )}

        <text x={0} y={H + 13} className="fill-ink-faint" fontSize={10} fontFamily="ui-monospace,Menlo,monospace">{bars[0][0]}</text>
        <text x={PLOT} y={H + 13} textAnchor="end" className="fill-ink-faint" fontSize={10} fontFamily="ui-monospace,Menlo,monospace">{bars[n - 1][0]}</text>
      </svg>

      {b && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}
          className="pointer-events-none absolute top-3 z-10 min-w-[186px] border border-line-2 bg-paper px-3 py-2.5 shadow-2xl"
          style={ (geo.X(hover!) / W) > 0.55
            ? { right: `${(1 - geo.X(hover!) / W) * 100 + 2}%` }
            : { left: `${(geo.X(hover!) / W) * 100 + 2}%` } }
        >
          <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-faint">
            {b[0]}{weekly ? " · week ending" : ""}
          </div>
          <div className="mt-1.5 grid grid-cols-[auto_1fr_auto_1fr] items-baseline gap-x-2 gap-y-0.5">
            {([["O", b[1]], ["H", b[2]], ["L", b[3]], ["C", b[4]]] as const).map(([k, v]) => (
              <>
                <span key={k} className="font-mono text-[9.5px] text-ink-faint">{k}</span>
                <b className="text-[12px] tnum">{inr(v)}</b>
              </>
            ))}
          </div>
          <div className="mt-1.5 text-[11.5px] tnum">
            <span className={chg > 0 ? "text-up" : chg < 0 ? "text-down" : ""}>
              {chg > 0 ? "+" : ""}{nf(chg, 2)}%
            </span>
            <span className="text-ink-dim"> · Vol {qty(b[5])}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-ink-faint tnum">
            50-DMA {inr(sma50[hover!])} · 200-DMA {inr(sma200[hover!])}
          </div>
        </motion.div>
      )}
    </div>
  );
}
