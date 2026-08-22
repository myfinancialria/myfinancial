import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useStocks, useFunds } from "../lib/useData";
import { Card, CardHead, Label, Chip, ErrorNote, Skeleton } from "../components/ui";
import { Reveal, Stagger, StaggerItem, CountUp, DrawPath } from "../components/motion";
import { crore, inr, nf, pct, plainPct, tone, relativeDay } from "../lib/format";
import type { Row } from "../lib/data";

/** Breadth: how much of the market rose, as a single readable bar. */
function Breadth({ rows }: { rows: Row[] }) {
  const { up, down, flat } = useMemo(() => {
    let up = 0, down = 0, flat = 0;
    for (const r of rows) {
      const c = r.change1d;
      if (typeof c !== "number") continue;
      if (c > 0.05) up++; else if (c < -0.05) down++; else flat++;
    }
    return { up, down, flat };
  }, [rows]);
  const total = up + down + flat || 1;
  const seg = [
    { n: up, cls: "bg-up", label: "advancing" },
    { n: flat, cls: "bg-line-2", label: "unchanged" },
    { n: down, cls: "bg-down", label: "declining" },
  ];
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden">
        {seg.map((s, i) => (
          <motion.div
            key={s.label}
            className={s.cls}
            initial={{ width: 0 }}
            animate={{ width: `${(s.n / total) * 100}%` }}
            transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px]">
        <span className="text-up">{nf(up, 0)} advancing</span>
        <span className="text-ink-faint">{nf(flat, 0)} unchanged</span>
        <span className="text-down">{nf(down, 0)} declining</span>
      </div>
    </div>
  );
}

/** Sector heat, ranked by the average one-day move of its constituents. */
function SectorHeat({ rows }: { rows: Row[] }) {
  const heat = useMemo(() => {
    const by = new Map<string, number[]>();
    for (const r of rows) {
      const k = r.sectorGroup;
      if (!k || typeof r.change1d !== "number") continue;
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(r.change1d);
    }
    return [...by.entries()]
      .map(([sector, xs]) => ({ sector, n: xs.length, avg: xs.reduce((a, b) => a + b, 0) / xs.length }))
      .sort((a, b) => b.avg - a.avg);
  }, [rows]);
  const max = Math.max(...heat.map((h) => Math.abs(h.avg)), 0.35);

  return (
    <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
      {heat.map((h, i) => {
        const t = Math.min(1, Math.abs(h.avg) / max);
        return (
          <motion.div
            key={h.sector}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: i * 0.022 }}
            className="relative overflow-hidden bg-paper-2 px-3.5 py-3"
          >
            <motion.div
              className={`absolute inset-0 ${h.avg >= 0 ? "bg-up" : "bg-down"}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.06 + t * 0.3 }}
              transition={{ duration: 0.6, delay: i * 0.022 }}
            />
            <div className="relative">
              <div className="truncate text-[11.5px] font-medium">{h.sector}</div>
              <div className={`mt-1 text-[17px] font-bold tnum ${h.avg >= 0 ? "text-up" : "text-down"}`}>
                {pct(h.avg, 2)}
              </div>
              <div className="text-[10px] text-ink-faint">{h.n} companies</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/** An equal-weight composite of the most-traded names — the market's own shape. */
function MarketCurve({ rows }: { rows: Row[] }) {
  const path = useMemo(() => {
    const top = rows
      .filter((r) => typeof r.avgTurnoverCr === "number" && typeof r.ret1y === "number")
      .sort((a, b) => b.avgTurnoverCr - a.avgTurnoverCr)
      .slice(0, 60);
    if (top.length < 10) return null;
    // Reconstruct a coarse year from each name's trailing returns — enough to
    // show the shape of the year without shipping another payload for it.
    const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const key = t === 0 ? "ret1y" : t === 0.25 ? "ret6m" : t === 0.5 ? "ret3m" : t === 0.75 ? "ret1m" : null;
      if (!key) return 0;
      const vals = top.map((r) => r[key]).filter((x): x is number => typeof x === "number");
      return vals.length ? -(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    });
    const W = 1000, H = 120;
    const lo = Math.min(...pts), hi = Math.max(...pts);
    const span = hi - lo || 1;
    return pts
      .map((v, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * W} ${H - ((v - lo) / span) * H * 0.86 - H * 0.07}`)
      .join("");
  }, [rows]);
  if (!path) return null;
  return (
    <svg viewBox="0 0 1000 120" preserveAspectRatio="none" className="h-[120px] w-full">
      <DrawPath d={path} className="stroke-accent" strokeWidth={2} duration={1.4} />
    </svg>
  );
}

function MoverRow({ r, i }: { r: Row; i: number }) {
  return (
    <StaggerItem>
      <Link
        to={`/company/${encodeURIComponent(r.symbol)}`}
        className="group flex items-center gap-3 border-b border-line px-5 py-2.5 transition-colors last:border-0 hover:bg-paper-3"
      >
        <span className="w-5 shrink-0 font-mono text-[10px] text-ink-faint">{i + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold group-hover:text-accent">{r.name}</span>
          <span className="block truncate font-mono text-[10px] text-ink-faint">
            {r.symbol}{r.industry ? ` · ${r.industry}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13px] tnum">{inr(r.price)}</span>
          <span className={`block text-[11px] tnum ${tone(r.change1d)}`}>{pct(r.change1d, 2)}</span>
        </span>
      </Link>
    </StaggerItem>
  );
}

export default function Overview() {
  const stocks = useStocks();
  const funds = useFunds();

  if (stocks.error) return <ErrorNote error={stocks.error} />;

  const rows = stocks.data?.rows ?? [];
  const liquid = useMemo(
    () => rows.filter((r) => (r.avgTurnoverCr ?? 0) >= 5 && typeof r.change1d === "number"),
    [rows],
  );
  const gainers = useMemo(() => [...liquid].sort((a, b) => b.change1d - a.change1d).slice(0, 8), [liquid]);
  const losers = useMemo(() => [...liquid].sort((a, b) => a.change1d - b.change1d).slice(0, 8), [liquid]);
  const totalCap = useMemo(
    () => rows.reduce((a, r) => a + (typeof r.marketCapCr === "number" ? r.marketCapCr : 0), 0),
    [rows],
  );
  const medianPe = useMemo(() => {
    const v = rows.map((r) => r.pe).filter((x): x is number => typeof x === "number" && x > 0).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  }, [rows]);

  return (
    <>
      {/* ------------------------------ hero ------------------------------ */}
      <section className="relative pt-14 pb-10 sm:pt-20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
          className="pointer-events-none absolute inset-x-0 -top-24 h-72 opacity-70"
          style={{ background: "radial-gradient(60% 60% at 30% 0%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 70%)" }}
        />
        <div className="relative">
          <Reveal>
            <Label className="mb-4">Indian equity & fund intelligence</Label>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="max-w-[19ch] text-[clamp(2.4rem,6.2vw,4.4rem)] font-extrabold leading-[0.98] tracking-[-0.045em]">
              The whole market,{" "}
              <span className="font-serif font-normal italic tracking-[-0.02em] text-ink-dim">measured.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 max-w-[62ch] text-[15px] leading-relaxed text-ink-dim">
              Every company listed on the NSE and every Direct-Growth mutual fund scheme, screened on
              official exchange data and rebuilt each market evening. No estimates, no modelled prices —
              each figure is computed from what the exchange published.
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-9 flex flex-wrap gap-2.5">
              <Link to="/screener" className="border border-ink bg-ink px-6 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-paper transition-opacity hover:opacity-85">
                Open the screener →
              </Link>
              <Link to="/patterns" className="border border-line-2 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-ink hover:text-ink">
                Chart patterns
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------- headline --------------------------- */}
      {stocks.loading ? (
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px]" />)}
        </div>
      ) : (
        <Stagger className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            { l: "Companies covered", v: <CountUp value={stocks.data!.count} format={(x) => nf(x, 0)} />, s: "every NSE-listed equity" },
            { l: "Combined market cap", v: <CountUp value={totalCap / 100000} format={(x) => `₹${nf(x, 1)}L cr`} />, s: "of the covered universe" },
            { l: "Median P/E", v: <CountUp value={medianPe} format={(x) => `${nf(x, 1)}×`} />, s: "profitable companies only" },
            { l: "Fund schemes", v: <CountUp value={funds.data?.liveCount ?? 0} format={(x) => nf(x, 0)} />, s: "live Direct-Growth plans" },
          ].map((t) => (
            <StaggerItem key={t.l}>
              <div className="h-full bg-paper-2 px-5 py-4">
                <Label>{t.l}</Label>
                <div className="mt-1.5 text-[26px] font-bold tracking-tight tnum">{t.v}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-dim">{t.s}</div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {/* ------------------------------ breadth --------------------------- */}
      <Reveal className="mt-14">
        <Card>
          <CardHead
            title="Market breadth"
            sub={`How the ${nf(rows.length, 0)} listed companies moved on ${stocks.data?.priceDate ?? "—"}`}
            right={<Chip>{relativeDay(stocks.data?.priceDate)}</Chip>}
          />
          <div className="px-5 py-5">
            {stocks.loading ? <Skeleton className="h-16" /> : <Breadth rows={rows} />}
            <div className="mt-6"><MarketCurve rows={rows} /></div>
          </div>
        </Card>
      </Reveal>

      {/* ------------------------------ sectors --------------------------- */}
      <Reveal className="mt-6">
        <Card>
          <CardHead title="Sector heat" sub="Average one-day move, by canonical sector" />
          {stocks.loading ? <Skeleton className="h-40" /> : <SectorHeat rows={rows} />}
        </Card>
      </Reveal>

      {/* ------------------------------ movers ---------------------------- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <Card>
            <CardHead title="Leading today" sub="Liquid names only — at least ₹5 cr traded a day" right={<Chip tone="up">Gainers</Chip>} />
            {stocks.loading
              ? <Skeleton className="h-72" />
              : <Stagger gap={0.04}>{gainers.map((r, i) => <MoverRow key={r.symbol} r={r} i={i} />)}</Stagger>}
          </Card>
        </Reveal>
        <Reveal delay={0.06}>
          <Card>
            <CardHead title="Lagging today" sub="The same liquidity filter, at the other end" right={<Chip tone="down">Losers</Chip>} />
            {stocks.loading
              ? <Skeleton className="h-72" />
              : <Stagger gap={0.04}>{losers.map((r, i) => <MoverRow key={r.symbol} r={r} i={i} />)}</Stagger>}
          </Card>
        </Reveal>
      </div>
    </>
  );
}
