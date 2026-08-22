import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useStocks } from "../lib/useData";
import { Card, CardHead, Chip, Label, Button, ErrorNote, Skeleton } from "../components/ui";
import { Reveal } from "../components/motion";
import { crore, inr, nf, pct, plainPct, tone } from "../lib/format";
import type { Row } from "../lib/data";

/* ---------------------------------------------------------------------------
   Every listed company, in one place.

   Two densities, because the two jobs are different: a table when you are
   scanning numbers down a column, cards when you are looking for a name. Both
   over the same filtered set, both clicking through to the full company page.
--------------------------------------------------------------------------- */

const SORTS: [string, string][] = [
  ["marketCapCr", "Market cap"],
  ["name", "Name"],
  ["ret1y", "1-year return"],
  ["ret3m", "3-month return"],
  ["change1d", "Today"],
  ["pe", "P/E"],
  ["roe", "Return on equity"],
  ["dividendYieldPct", "Dividend yield"],
  ["avgTurnoverCr", "Turnover"],
  ["rsRank1y", "Relative strength"],
];

const PAGE = 100;

function Sparkline({ r }: { r: Row }) {
  // A 52-week position bar: cheaper than a series, and it answers the question
  // the eye actually asks when scanning a list — where in its range is this?
  const lo = r.low52w, hi = r.high52w, px = r.price;
  if (!(lo > 0 && hi > lo && px > 0)) return <span className="text-ink-faint">—</span>;
  const at = Math.max(0, Math.min(100, ((px - lo) / (hi - lo)) * 100));
  return (
    <div className="relative h-1.5 w-full min-w-[54px] bg-line">
      <div className="absolute top-0 h-1.5 w-[2px] bg-ink" style={{ left: `${at}%` }} />
    </div>
  );
}

export default function Stocks() {
  const { data, loading, error } = useStocks();
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [tier, setTier] = useState("");
  const [sort, setSort] = useState<{ f: string; dir: 1 | -1 }>({ f: "marketCapCr", dir: -1 });
  const [view, setView] = useState<"table" | "cards">("table");
  const [shown, setShown] = useState(PAGE);

  const sectors = data?.cats?.sectorGroup ?? data?.cats?.sector ?? [];
  const tiers = data?.cats?.nseTier ?? [];
  const sectorKey = data?.cats?.sectorGroup ? "sectorGroup" : "sector";

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    let out = data.rows;
    if (needle) out = out.filter((r) => `${r.name} ${r.symbol} ${r.industry ?? ""}`.toLowerCase().includes(needle));
    if (sector) out = out.filter((r) => r[sectorKey] === sector);
    if (tier) out = out.filter((r) => r.nseTier === tier);
    return [...out].sort((x, y) => {
      const a = x[sort.f], b = y[sort.f];
      const an = a === null || a === undefined, bn = b === null || b === undefined;
      if (an && bn) return 0;
      if (an) return 1;
      if (bn) return -1;
      if (typeof a === "string") return sort.dir * String(a).localeCompare(String(b));
      return sort.dir * (a - b);
    });
  }, [data, q, sector, tier, sort, sectorKey]);

  const visible = rows.slice(0, shown);
  const reset = () => setShown(PAGE);

  if (error) return <ErrorNote error={error} />;

  return (
    <>
      <section className="pt-12 pb-7">
        <Reveal><Label className="mb-3.5">Companies</Label></Reveal>
        <Reveal delay={0.05}>
          <h1 className="text-[clamp(2rem,4.6vw,3.1rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
            Every listed company,{" "}
            <span className="font-serif font-normal italic text-ink-dim">one list.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-4 max-w-[70ch] text-[14px] leading-relaxed text-ink-dim">
            {data ? nf(data.count, 0) : "—"} companies priced at the {data?.priceDate ?? "—"} NSE close. Search by name,
            symbol or industry, narrow by sector, then click any row for the full company — candles, filed
            statements, shareholding, peers and sector context.
          </p>
        </Reveal>
      </section>

      <Reveal>
        <div className="flex flex-wrap items-center gap-2.5 border-y border-line py-3.5">
          <input value={q} onChange={(e) => { setQ(e.target.value); reset(); }}
            placeholder="Search name, symbol or industry…"
            className="min-w-[240px] flex-1 border border-line-2 bg-paper px-3 py-2 text-[13px] outline-none transition-colors focus:border-accent" />

          <select value={sector} onChange={(e) => { setSector(e.target.value); reset(); }}
            className="border border-line-2 bg-paper px-3 py-2 text-[12.5px] outline-none focus:border-ink">
            <option value="">All sectors</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {tiers.length > 0 && (
            <select value={tier} onChange={(e) => { setTier(e.target.value); reset(); }}
              className="border border-line-2 bg-paper px-3 py-2 text-[12.5px] outline-none focus:border-ink">
              <option value="">All sizes</option>
              {tiers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          <select value={sort.f} onChange={(e) => { setSort({ f: e.target.value, dir: e.target.value === "name" ? 1 : -1 }); reset(); }}
            className="border border-line-2 bg-paper px-3 py-2 text-[12.5px] outline-none focus:border-ink">
            {SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}
          </select>

          <Button onClick={() => setSort((s) => ({ ...s, dir: (-s.dir) as 1 | -1 }))} title="Reverse the order">
            {sort.dir === -1 ? "▾ desc" : "▴ asc"}
          </Button>

          <div className="flex border border-line-2">
            {(["table", "cards"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors
                  ${view === v ? "bg-ink text-paper font-semibold" : "text-ink-dim hover:text-ink"}`}>
                {v}
              </button>
            ))}
          </div>

          <Chip tone="accent">{nf(rows.length, 0)}</Chip>
        </div>
      </Reveal>

      {loading && <Skeleton className="mt-6 h-[520px]" />}

      {data && view === "table" && (
        <Card className="mt-6">
          <CardHead title="Companies" sub={`Sorted by ${SORTS.find(([k]) => k === sort.f)?.[1] ?? sort.f}`} />
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line">
                  {["Company", "Price", "Today", "3-month", "1-year", "52-week", "Market cap", "P/E", "ROE", "Yield", "Stage"].map((h, i) => (
                    <th key={h} className={`sticky top-0 z-10 whitespace-nowrap bg-paper-2 px-3 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-faint ${i ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <motion.tr key={r.symbol} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: 0.22, delay: Math.min(i, 20) * 0.01 }}
                    className="border-b border-line transition-colors last:border-0 hover:bg-paper-3">
                    <td className="px-3 py-2.5">
                      <Link to={`/company/${encodeURIComponent(r.symbol)}`} className="block font-semibold hover:text-accent">{r.name}</Link>
                      <span className="block font-mono text-[10px] text-ink-faint">
                        {r.symbol}{r.industry ? ` · ${r.industry}` : ""}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tnum">{inr(r.price)}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tnum ${tone(r.change1d)}`}>{pct(r.change1d, 2)}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tnum ${tone(r.ret3m)}`}>{pct(r.ret3m)}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tnum ${tone(r.ret1y)}`}>{pct(r.ret1y)}</td>
                    <td className="px-3 py-2.5"><Sparkline r={r} /></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tnum">{crore(r.marketCapCr)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tnum">{r.pe > 0 ? `${nf(r.pe)}×` : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tnum">{plainPct(r.roe)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tnum">{plainPct(r.dividendYieldPct, 2)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      {r.stage ? <Chip tone={r.stage === 2 ? "up" : r.stage === 4 ? "down" : "neutral"}>{r.stage}</Chip> : "—"}
                    </td>
                  </motion.tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={11} className="px-5 py-16 text-center text-[13px] text-ink-dim">No companies match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > shown && (
            <div className="flex justify-center border-t border-line px-5 py-4">
              <Button onClick={() => setShown((s) => s + PAGE * 2)}>Show more ({nf(rows.length - shown, 0)} left)</Button>
            </div>
          )}
        </Card>
      )}

      {data && view === "cards" && (
        <>
          <div className="mt-6 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((r, i) => (
              <motion.div key={r.symbol} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i, 24) * 0.012 }}>
                <Link to={`/company/${encodeURIComponent(r.symbol)}`}
                  className="group flex h-full flex-col bg-paper-2 px-4 py-3.5 transition-colors hover:bg-paper-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold group-hover:text-accent">{r.name}</div>
                      <div className="truncate font-mono text-[10px] text-ink-faint">{r.symbol}{r.industry ? ` · ${r.industry}` : ""}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[14px] font-bold tnum">{inr(r.price)}</div>
                      <div className={`text-[11px] tnum ${tone(r.change1d)}`}>{pct(r.change1d, 2)}</div>
                    </div>
                  </div>
                  <div className="mt-3"><Sparkline r={r} /></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
                    {([["1-yr", pct(r.ret1y), tone(r.ret1y)], ["P/E", r.pe > 0 ? `${nf(r.pe)}×` : "—", ""], ["Cap", crore(r.marketCapCr), ""]] as const).map(([l, v, t]) => (
                      <div key={l}>
                        <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">{l}</div>
                        <div className={`text-[12px] font-semibold tnum ${t}`}>{v}</div>
                      </div>
                    ))}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
          {rows.length > shown && (
            <div className="mt-6 flex justify-center">
              <Button onClick={() => setShown((s) => s + PAGE * 2)}>Show more ({nf(rows.length - shown, 0)} left)</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
