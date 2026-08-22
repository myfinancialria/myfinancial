import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useStocks } from "../lib/useData";
import { Card, CardHead, Label, Chip, Button, Tile, ErrorNote, Skeleton } from "../components/ui";
import { Reveal, Stagger, StaggerItem } from "../components/motion";
import CandleChart, { type Bar } from "../components/CandleChart";
import { byUnit, crore, inr, nf, pct, plainPct, tone } from "../lib/format";
import { staticStockUrl } from "../lib/data";

interface Chart { daily: Bar[]; dailySma50: (number|null)[]; dailySma200: (number|null)[];
  weekly: Bar[]; weeklySma50: (number|null)[]; weeklySma200: (number|null)[] }

const GROUPS = ["Valuation", "Profitability", "Growth", "Balance sheet", "Ownership", "Trend", "Momentum", "Volatility", "Range", "Liquidity"];

export default function Company() {
  const { symbol = "" } = useParams();
  const { data, loading, error } = useStocks();
  const [chart, setChart] = useState<Chart | null>(null);
  const [tf, setTf] = useState<"daily" | "weekly">("daily");

  const row = useMemo(() => data?.rows.find((r) => r.symbol === symbol) ?? null, [data, symbol]);

  useEffect(() => {
    let alive = true;
    setChart(null);
    const base = import.meta.env.BASE_URL.replace(/app\/?$/, "") + "data/chart/";
    fetch(base + encodeURIComponent(symbol) + ".json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setChart(j))
      .catch(() => alive && setChart(null));
    return () => { alive = false; };
  }, [symbol]);

  if (error) return <ErrorNote error={error} />;
  if (loading) return <div className="space-y-4 pt-12"><Skeleton className="h-12 w-80" /><Skeleton className="h-[380px]" /></div>;
  if (!row) return (
    <Card className="mt-16 p-8">
      <div className="text-[14px] text-ink-dim">
        No company called <b className="text-ink">{symbol}</b> in this build.{" "}
        <Link to="/screener" className="text-accent underline">Back to the screener</Link>.
      </div>
    </Card>
  );

  const bars = tf === "daily" ? chart?.daily : chart?.weekly;
  const s50 = tf === "daily" ? chart?.dailySma50 : chart?.weeklySma50;
  const s200 = tf === "daily" ? chart?.dailySma200 : chart?.weeklySma200;

  return (
    <>
      <section className="pt-12 pb-6">
        <Reveal>
          <Label className="mb-3">
            {row.sectorGroup ?? row.sector ?? "NSE"}{row.industry ? ` · ${row.industry}` : ""}
          </Label>
        </Reveal>
        <Reveal delay={0.04}>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <h1 className="text-[clamp(1.9rem,4.2vw,3rem)] font-extrabold leading-[1.03] tracking-[-0.04em]">{row.name}</h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Chip accent-="">{row.symbol}</Chip>
                {row.nseTier && <Chip>{row.nseTier}</Chip>}
                {row.hasDeepData && <Chip tone="accent">filed statements</Chip>}
                <a href={staticStockUrl(row.symbol)} className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint underline hover:text-ink">
                  full report ↗
                </a>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[34px] font-extrabold leading-none tracking-tight tnum">{inr(row.price)}</div>
              <div className={`mt-1.5 text-[14px] font-semibold tnum ${tone(row.change1d)}`}>
                {pct(row.change1d, 2)} <span className="text-ink-faint">on {row.date}</span>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <Reveal>
        <Card>
          <CardHead
            title="Price"
            sub={bars ? (tf === "daily" ? `${Math.round(bars.length / 21)} months of daily candles` : `${Math.round(bars.length / 52)} years of weekly candles`) : "loading…"}
            right={
              <div className="flex border border-line-2">
                {(["daily", "weekly"] as const).map((t) => (
                  <button key={t} onClick={() => setTf(t)}
                    className={`px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors
                      ${tf === t ? "bg-ink text-paper font-semibold" : "text-ink-dim hover:text-ink"}`}>
                    {t}
                  </button>
                ))}
              </div>
            }
          />
          <div className="px-5 py-4">
            {bars && s50 && s200
              ? <CandleChart bars={bars} sma50={s50} sma200={s200} weekly={tf === "weekly"} />
              : <Skeleton className="h-[380px]" />}
            <div className="mt-3 flex flex-wrap gap-4 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-faint">
              <span><i className="mr-1.5 inline-block h-0.5 w-3.5 align-middle bg-up" />up</span>
              <span><i className="mr-1.5 inline-block h-0.5 w-3.5 align-middle bg-down" />down</span>
              <span><i className="mr-1.5 inline-block h-0 w-3.5 align-middle border-t-2 border-dashed border-ink-dim" />50-DMA</span>
              <span><i className="mr-1.5 inline-block h-0.5 w-3.5 align-middle bg-ink-faint" />200-DMA</span>
              <span className="text-ink-dim normal-case tracking-normal">hover any candle for its open, high, low, close and volume</span>
            </div>
          </div>
        </Card>
      </Reveal>

      <Stagger className="mt-6 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4" gap={0.04}>
        {[
          ["Market cap", crore(row.marketCapCr), row.nseTier ?? ""],
          ["52-week range", `${inr(row.low52w)} – ${inr(row.high52w)}`, `${pct(row.pctFrom52wHigh)} from high`],
          ["1-year", pct(row.ret1y), `3-month ${pct(row.ret3m)}`],
          ["Stage", `${row.stage ?? "—"} · ${row.stageName ?? "—"}`, `RSI ${plainPct(row.rsi14, 0).replace("%", "")} · ADX ${nf(row.adx14 ?? 0, 0)}`],
        ].map(([l, v, s]) => (
          <StaggerItem key={l as string}>
            <div className="h-full bg-paper-2 px-4 py-3.5">
              <Label>{l}</Label>
              <div className="mt-1.5 text-[17px] font-bold tracking-tight tnum">{v}</div>
              <div className="mt-0.5 text-[11px] text-ink-dim">{s}</div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Metric groups flow down columns so short cards leave no ragged holes. */}
      <div className="mt-6 [column-gap:1.5rem] md:[column-count:2] xl:[column-count:3]">
        {GROUPS.map((g) => {
          const fields = data!.meta.filter((m) => m.g === g && row[m.k] !== null && row[m.k] !== undefined && row[m.k] !== "");
          if (!fields.length) return null;
          return (
            <div key={g} className="mb-6 break-inside-avoid">
              <Card>
                <CardHead title={g} />
                <table className="w-full text-[12.5px]">
                  <tbody>
                    {fields.map((m) => (
                      <tr key={m.k} className="border-b border-line last:border-0">
                        <td className="px-4 py-2 text-ink-dim">{m.l}</td>
                        <td className={`px-4 py-2 text-right tnum ${m.u === "%" && m.d === 1 ? tone(row[m.k]) : ""}`}>
                          {byUnit(row[m.k], m.u)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          );
        })}
      </div>
    </>
  );
}
