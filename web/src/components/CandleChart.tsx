import { useEffect, useRef } from "react";
import {
  createChart, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type Time,
} from "lightweight-charts";

export type Bar = [string, number, number, number, number, number];

/* ---------------------------------------------------------------------------
   The company price chart, rendered with TradingView's own Lightweight Charts:
   candles + volume histogram, both moving averages, a crosshair with price and
   time axis labels, an OHLC legend that follows the cursor, and native
   scroll-to-zoom / drag-to-pan. Colours track the app's --color-* tokens, so
   the chart flips with the light/dark toggle without a reload.
--------------------------------------------------------------------------- */

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const palette = () => ({
  up: cssVar("--color-up") || "#2ecc82",
  down: cssVar("--color-down") || "#f2555a",
  ink: cssVar("--color-ink") || "#f2f2f4",
  dim: cssVar("--color-ink-dim") || "#9a9aa4",
  faint: cssVar("--color-ink-faint") || "#5c5c66",
  line: cssVar("--color-line") || "#1e1e24",
  line2: cssVar("--color-line-2") || "#2b2b33",
});

const toTime = (s: string): Time => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s as Time;
  const d = new Date(s);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() } as unknown as Time;
};
const keyOf = (t: unknown): string => (typeof t === "string"
  ? t.split("-").map(Number).join("-")
  : `${(t as any).year}-${(t as any).month}-${(t as any).day}`);

const nf = (x: number, d = 2) => x.toLocaleString("en-IN", { maximumFractionDigits: d });
const volFmt = (x: number) => (x >= 1e7 ? (x / 1e7).toFixed(2) + " cr" : x >= 1e5 ? (x / 1e5).toFixed(2) + " L" : x.toLocaleString("en-IN"));

export default function CandleChart({ bars, sma50, sma200, weekly = false }: {
  bars: Bar[]; sma50: (number | null)[]; sma200: (number | null)[]; weekly?: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{
    candles: ISeriesApi<"Candlestick">; vol: ISeriesApi<"Histogram">;
    m50: ISeriesApi<"Line">; m200: ISeriesApi<"Line">;
  } | null>(null);
  const dataRef = useRef<{ bars: Bar[]; sma50: (number | null)[]; sma200: (number | null)[]; byKey: Map<string, number> }>(
    { bars: [], sma50: [], sma200: [], byKey: new Map() });

  // create the chart once per mount
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const pal = palette();
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" }, textColor: pal.dim,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 11,
      },
      grid: { vertLines: { color: pal.line }, horzLines: { color: pal.line } },
      rightPriceScale: { borderColor: pal.line2, scaleMargins: { top: 0.06, bottom: 0.2 } },
      timeScale: { borderColor: pal.line2, rightOffset: 3, barSpacing: 7, minBarSpacing: 1.5 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: pal.faint, width: 1, style: 3, labelBackgroundColor: pal.ink },
        horzLine: { color: pal.faint, width: 1, style: 3, labelBackgroundColor: pal.ink },
      },
      localization: { priceFormatter: (p: number) => "₹" + nf(p, p >= 1000 ? 0 : 2) },
    });
    const candles = chart.addCandlestickSeries({
      upColor: pal.up, downColor: pal.down, wickUpColor: pal.up, wickDownColor: pal.down,
      borderVisible: false, priceLineColor: pal.dim, priceLineStyle: 3,
    });
    const vol = chart.addHistogramSeries({
      priceScaleId: "vol", priceFormat: { type: "volume" },
      lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
    const m50 = chart.addLineSeries({ color: pal.dim, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const m200 = chart.addLineSeries({ color: pal.faint, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    chartRef.current = chart;
    seriesRef.current = { candles, vol, m50, m200 };

    const paintLegend = (i: number) => {
      const d = dataRef.current, lg = legendRef.current;
      const b = d.bars[i];
      if (!lg) return;
      if (!b) { lg.innerHTML = ""; return; }
      const [dt, o, h, l, c, v] = b;
      const prev = i > 0 ? d.bars[i - 1][4] : o;
      const chg = prev ? ((c - prev) / prev) * 100 : 0;
      lg.innerHTML = `<b>${dt}</b>&ensp;O <b>${nf(o)}</b> H <b>${nf(h)}</b> L <b>${nf(l)}</b> C <b>${nf(c)}</b> `
        + `<span style="color:var(${chg >= 0 ? "--color-up" : "--color-down"})">${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%</span>`
        + `&ensp;Vol <b>${volFmt(v || 0)}</b>`
        + (typeof d.sma50[i] === "number" ? `&ensp;50D ${nf(d.sma50[i] as number)}` : "")
        + (typeof d.sma200[i] === "number" ? `&ensp;200D ${nf(d.sma200[i] as number)}` : "");
    };
    (chart as any).__paintLegend = paintLegend;

    chart.subscribeCrosshairMove((param) => {
      const d = dataRef.current;
      if (!param.time) { paintLegend(d.bars.length - 1); return; }
      const i = d.byKey.get(keyOf(param.time));
      if (i !== undefined) paintLegend(i);
    });
    const onDbl = () => chart.timeScale().fitContent();
    el.addEventListener("dblclick", onDbl);

    const mo = new MutationObserver(() => {
      const p = palette();
      chart.applyOptions({
        layout: { textColor: p.dim },
        grid: { vertLines: { color: p.line }, horzLines: { color: p.line } },
        rightPriceScale: { borderColor: p.line2 }, timeScale: { borderColor: p.line2 },
        crosshair: {
          vertLine: { color: p.faint, labelBackgroundColor: p.ink },
          horzLine: { color: p.faint, labelBackgroundColor: p.ink },
        },
      });
      candles.applyOptions({ upColor: p.up, downColor: p.down, wickUpColor: p.up, wickDownColor: p.down });
      m50.applyOptions({ color: p.dim });
      m200.applyOptions({ color: p.faint });
      const d = dataRef.current;
      vol.setData(d.bars.map((b) => ({ time: toTime(b[0]), value: b[5] || 0, color: (b[4] >= b[1] ? p.up : p.down) + "59" })));
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => { mo.disconnect(); el.removeEventListener("dblclick", onDbl); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, []);

  // (re)load the data whenever the series change
  useEffect(() => {
    const chart = chartRef.current, s = seriesRef.current;
    if (!chart || !s) return;
    const pal = palette();
    const byKey = new Map<string, number>();
    const cd: any[] = [], vd: any[] = [], l50: any[] = [], l200: any[] = [];
    bars.forEach((b, i) => {
      const [dt, o, h, l, c, v] = b;
      const t = toTime(dt);
      cd.push({ time: t, open: o, high: h, low: l, close: c });
      vd.push({ time: t, value: v || 0, color: (c >= o ? pal.up : pal.down) + "59" });
      if (typeof sma50[i] === "number") l50.push({ time: t, value: sma50[i] });
      if (typeof sma200[i] === "number") l200.push({ time: t, value: sma200[i] });
      byKey.set(keyOf(t), i);
    });
    dataRef.current = { bars, sma50, sma200, byKey };
    s.candles.setData(cd); s.vol.setData(vd); s.m50.setData(l50); s.m200.setData(l200);
    if (!weekly && bars.length > 280) chart.timeScale().setVisibleLogicalRange({ from: bars.length - 260, to: bars.length + 4 });
    else chart.timeScale().fitContent();
    (chart as any).__paintLegend?.(bars.length - 1);
  }, [bars, sma50, sma200, weekly]);

  if (!bars.length) return null;

  return (
    <div className="relative">
      <div ref={legendRef}
        className="pointer-events-none absolute left-2.5 top-2 z-[6] max-w-[calc(100%-90px)] overflow-hidden text-ellipsis whitespace-nowrap bg-paper/75 px-2 py-0.5 font-mono text-[11px] leading-relaxed text-ink-dim [&_b]:font-semibold [&_b]:text-ink" />
      <div ref={mountRef} style={{ height: "clamp(340px, 50vh, 520px)" }} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint">
        <span>candles · volume below</span>
        <span>dashed 50-{weekly ? "D" : "day"} · solid 200-day average</span>
        <span>hover for OHLC · scroll to zoom · drag to pan · double-click resets</span>
      </div>
    </div>
  );
}
