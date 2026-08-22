import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { nf } from "../lib/format";

export type Point = [string, number];

/* ---------------------------------------------------------------------------
   A single series with a hover readout — NAV histories and growth curves.

   Same rule as the candle chart: the value axis lives in a reserved gutter so
   a label can never land on top of the line.
--------------------------------------------------------------------------- */

const W = 1000, GUTTER = 76, PLOT = W - GUTTER, H = 260;

export default function LineChart({ points, valueLabel = "NAV", format = (v: number) => nf(v, 2), fill = true }: {
  points: Point[]; valueLabel?: string; format?: (v: number) => string; fill?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const n = points.length;

  const geo = useMemo(() => {
    if (n < 2) return null;
    const vals = points.map((p) => p[1]);
    const hi = Math.max(...vals), lo = Math.min(...vals);
    const pad = (hi - lo) * 0.08 || 1;
    const yMax = hi + pad, yMin = lo - pad;
    const X = (i: number) => (i / (n - 1)) * PLOT;
    const Y = (v: number) => H - ((v - yMin) / (yMax - yMin)) * H;
    const d = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join("");
    const area = `${d}L${PLOT} ${H}L0 ${H}Z`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ y: t * H, v: yMax - t * (yMax - yMin) }));
    const up = vals[n - 1] >= vals[0];
    return { X, Y, d, area, ticks, up };
  }, [points, n]);

  if (!geo) return null;

  const onMove = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const vx = ((clientX - rect.left) / rect.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round((Math.min(vx, PLOT) / PLOT) * (n - 1)))));
  };

  const p = hover !== null ? points[hover] : null;
  const stroke = geo.up ? "stroke-up" : "stroke-down";
  const tint = geo.up ? "fill-up" : "fill-down";

  return (
    <div className="relative"
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchMove={(e) => e.touches[0] && onMove(e.touches[0].clientX)}
      onTouchEnd={() => setHover(null)}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none"
        style={{ width: "100%", height: H + 18, display: "block" }} role="img" aria-label={`${valueLabel} history`}>
        {geo.ticks.map((t, i) => (
          <g key={i}>
            <line x1={0} y1={t.y} x2={PLOT} y2={t.y} className="stroke-line" strokeWidth={1} />
            <text x={PLOT + 8} y={t.y + 3.5} className="fill-ink-faint" fontSize={10} fontFamily="ui-monospace,Menlo,monospace">
              {format(t.v)}
            </text>
          </g>
        ))}

        {fill && <motion.path d={geo.area} className={tint} opacity={0.09}
          initial={{ opacity: 0 }} animate={{ opacity: 0.09 }} transition={{ duration: 0.5, delay: 0.4 }} />}

        <motion.path d={geo.d} fill="none" className={stroke} strokeWidth={1.8} strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />

        {hover !== null && p && (
          <>
            <line x1={geo.X(hover)} y1={0} x2={geo.X(hover)} y2={H} className="stroke-ink" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5} />
            <circle cx={geo.X(hover)} cy={geo.Y(p[1])} r={3.2} className={`${tint} stroke-paper`} strokeWidth={1.4} />
          </>
        )}

        <text x={0} y={H + 14} className="fill-ink-faint" fontSize={10} fontFamily="ui-monospace,Menlo,monospace">{points[0][0]}</text>
        <text x={PLOT} y={H + 14} textAnchor="end" className="fill-ink-faint" fontSize={10} fontFamily="ui-monospace,Menlo,monospace">{points[n - 1][0]}</text>
      </svg>

      {p && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}
          className="pointer-events-none absolute top-2 z-10 border border-line-2 bg-paper px-3 py-2 shadow-2xl"
          style={(geo.X(hover!) / W) > 0.55
            ? { right: `${(1 - geo.X(hover!) / W) * 100 + 2}%` }
            : { left: `${(geo.X(hover!) / W) * 100 + 2}%` }}>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-faint">{p[0]}</div>
          <div className="mt-1 text-[14px] font-bold tnum">{format(p[1])}</div>
          <div className="text-[10.5px] text-ink-faint">{valueLabel}</div>
        </motion.div>
      )}
    </div>
  );
}
