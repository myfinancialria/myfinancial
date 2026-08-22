import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useFunds } from "../lib/useData";
import { Card, CardHead, Label, Chip, Button, ErrorNote, Skeleton } from "../components/ui";
import { Reveal } from "../components/motion";
import { byUnit, inr, nf, pct, plainPct, tone } from "../lib/format";

const PRESETS = [
  { id: "all", name: "All live schemes", why: "Every Direct-Growth scheme still publishing a NAV.", test: () => true, sort: "r3y" },
  { id: "consistent", name: "Consistent equity", why: "Equity schemes whose average three-year rolling return has been strong AND which have never lost money over any three-year window.",
    test: (r: any) => r.categoryGroup === "Equity" && r.rolling3yAvg >= 14 && r.rolling3yPctPositive >= 95 && r.ageYears >= 5, sort: "rolling3yAvg" },
  { id: "sharpe", name: "Best risk-adjusted", why: "Highest return per unit of volatility over three years — the funds that did not make you suffer for the return.",
    test: (r: any) => r.sharpe >= 0.8 && r.ageYears >= 3, sort: "sharpe" },
  { id: "lowvol", name: "Steady, low volatility", why: "Modest swings with a respectable return — for money that cannot ride out a deep drawdown.",
    test: (r: any) => r.volatility <= 8 && r.r3y >= 7 && r.maxDrawdownPct >= -12, sort: "r3y" },
  { id: "index", name: "Index funds", why: "The cheapest way to own the market. Compare tracking against each other rather than chasing the leader.",
    test: (r: any) => r.categoryGroup === "Index / ETF / FoF", sort: "r5y" },
  { id: "elss", name: "ELSS tax savers", why: "Section 80C schemes with a three-year lock-in, ranked on rolling three-year holds.",
    test: (r: any) => String(r.category ?? "").includes("ELSS"), sort: "rolling3yAvg" },
];

const COLS = ["name", "category", "nav", "r1y", "r3y", "r5y", "rolling3yAvg", "volatility", "sharpe", "maxDrawdownPct", "stars"];

export default function Funds() {
  const { data, loading, error } = useFunds();
  const [preset, setPreset] = useState("consistent");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(50);
  const [sort, setSort] = useState<{ f: string; dir: 1 | -1 }>({ f: "rolling3yAvg", dir: -1 });

  const current = PRESETS.find((p) => p.id === preset)!;

  const rows = useMemo(() => {
    if (!data) return [];
    let out = data.rows.filter((r) => !r.stale && current.test(r));
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((r) => `${r.name} ${r.amc} ${r.category}`.toLowerCase().includes(needle));
    return [...out].sort((x, y) => {
      const a = x[sort.f], b = y[sort.f];
      const an = a === null || a === undefined, bn = b === null || b === undefined;
      if (an && bn) return 0;
      if (an) return 1;
      if (bn) return -1;
      if (typeof a === "string") return sort.dir * String(a).localeCompare(String(b));
      return sort.dir * (a - b);
    });
  }, [data, current, q, sort]);

  if (error) return <ErrorNote error={error} />;

  return (
    <>
      <section className="pt-12 pb-7">
        <Reveal><Label className="mb-3.5">Mutual funds</Label></Reveal>
        <Reveal delay={0.05}>
          <h1 className="text-[clamp(2rem,4.6vw,3.1rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
            Every scheme,{" "}
            <span className="font-serif font-normal italic text-ink-dim">honestly measured.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-4 max-w-[68ch] text-[14px] leading-relaxed text-ink-dim">
            {data ? nf(data.liveCount ?? 0, 0) : "—"} live Direct-Growth schemes, NAVs dated {data?.navDate ?? "—"}.
            Rolling returns are computed across <em>every</em> start date in a scheme's history — a fairer answer to
            "what does this fund return" than a single trailing figure, which is an accident of today's date.
          </p>
        </Reveal>
      </section>

      <Reveal>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.id} active={preset === p.id}
              onClick={() => { setPreset(p.id); setSort({ f: p.sort, dir: -1 }); setShown(50); }}>
              {p.name}
            </Button>
          ))}
        </div>
        <motion.p key={preset} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
          className="mt-3.5 max-w-[88ch] text-[13px] leading-relaxed text-ink-dim">{current.why}</motion.p>
      </Reveal>

      <Reveal className="mt-6">
        <Card>
          <CardHead title="Schemes" sub={`Sorted by ${data?.byKey[sort.f]?.l ?? sort.f}`}
            right={
              <div className="flex items-center gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scheme or fund house…"
                  className="min-w-[200px] border border-line-2 bg-paper px-3 py-1.5 text-[12.5px] outline-none transition-colors focus:border-accent" />
                <Chip>{nf(rows.length, 0)}</Chip>
              </div>
            } />
          {loading ? <Skeleton className="h-[420px]" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line">
                    {COLS.map((k, i) => {
                      const m = data!.byKey[k];
                      if (!m) return null;
                      return (
                        <th key={k} title={m.h}
                          onClick={() => setSort((s) => s.f === k ? { f: k, dir: (-s.dir) as 1 | -1 } : { f: k, dir: m.d === -1 ? 1 : -1 })}
                          className={`sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap bg-paper-2 px-3 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-faint hover:text-ink ${i ? "text-right" : "text-left"}`}>
                          {m.l}{sort.f === k && <span className="ml-1 text-ink">{sort.dir === -1 ? "▾" : "▴"}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map((r, i) => (
                    <motion.tr key={r.code} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ duration: 0.25, delay: Math.min(i, 24) * 0.012 }}
                      className="border-b border-line transition-colors last:border-0 hover:bg-paper-3">
                      {COLS.map((k, ci) => {
                        const m = data!.byKey[k];
                        if (!m) return null;
                        if (ci === 0) return (
                          <td key={k} className="px-3 py-2.5">
                            <span className="block font-semibold">{r.name}</span>
                            <span className="block font-mono text-[10px] text-ink-faint">{r.amc}</span>
                          </td>
                        );
                        if (k === "stars") return (
                          <td key={k} className="whitespace-nowrap px-3 py-2.5 text-right text-warn">
                            {r.stars ? "★".repeat(r.stars) : "—"}
                          </td>
                        );
                        return (
                          <td key={k} className={`whitespace-nowrap px-3 py-2.5 text-right tnum ${m.u === "%" && m.d === 1 ? tone(r[k]) : ""}`}>
                            {byUnit(r[k], m.u)}
                          </td>
                        );
                      })}
                    </motion.tr>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={COLS.length} className="px-5 py-16 text-center text-[13px] text-ink-dim">No schemes match.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > shown && (
            <div className="flex justify-center border-t border-line px-5 py-4">
              <Button onClick={() => setShown((s) => s + 100)}>Show more ({nf(rows.length - shown, 0)} left)</Button>
            </div>
          )}
        </Card>
      </Reveal>
    </>
  );
}
