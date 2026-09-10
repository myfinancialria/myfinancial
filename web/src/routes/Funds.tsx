import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useFunds } from "../lib/useData";
import { Card, CardHead, Label, Chip, Button, ErrorNote, Skeleton } from "../components/ui";
import { Reveal } from "../components/motion";
import { byUnit, nf, tone } from "../lib/format";
import { toCsv, downloadCsv } from "../lib/screens";
import type { FieldMeta, Index } from "../lib/data";

const PRESETS = [
  { id: "all", name: "All live schemes", why: "Every Direct-Growth scheme still publishing a NAV, A to Z.", test: () => true, sort: "name" },
  { id: "consistent", name: "Consistent equity", why: "Equity schemes whose average three-year rolling return has been strong AND which have never lost money over any three-year window.",
    test: (r: any) => r.categoryGroup === "Equity" && r.rolling3yAvg >= 14 && r.rolling3yPctPositive >= 95 && r.ageYears >= 5, sort: "name" },
  { id: "sharpe", name: "High Sharpe (3Y)", why: "A Sharpe ratio of at least 0.8 over three years — return per unit of volatility, computed from published NAV history.",
    test: (r: any) => r.sharpe >= 0.8 && r.ageYears >= 3, sort: "name" },
  { id: "lowvol", name: "Steady, low volatility", why: "Modest swings with a respectable return — for money that cannot ride out a deep drawdown.",
    test: (r: any) => r.volatility <= 8 && r.r3y >= 7 && r.maxDrawdownPct >= -12, sort: "name" },
  { id: "index", name: "Index funds", why: "The lowest-cost way to own the market. Compare tracking difference against each other rather than by past return.",
    test: (r: any) => r.categoryGroup === "Index / ETF / FoF", sort: "name" },
  { id: "elss", name: "ELSS tax savers", why: "Section 80C schemes with a three-year lock-in, shown with their rolling three-year record.",
    test: (r: any) => String(r.category ?? "").includes("ELSS"), sort: "name" },
];

// The value columns shown before the reader picks their own. The scheme name
// (with its fund house) is always the first column and is not listed here.
const DEFAULT_COLS = ["category", "nav", "r1y", "r3y", "r5y", "rolling3yAvg", "volatility", "sharpe", "maxDrawdownPct"];

// Every measure the build computes for a scheme, minus what must not become a
// column: the name and fund house (they are the fixed first column), internal
// flags — and the whole "Category record" group. No ranks on a registered
// adviser's website: a rank or quartile of past returns reads as a
// recommendation, which is why the static fund pages omit it too.
const pickable = (data: Index): FieldMeta[] =>
  data.meta.filter((m) => m.g !== "Category record" && !["name", "amc", "code", "stale"].includes(m.k));

/* ------------------------------ column picker ----------------------------- */
function ColumnPicker({ meta, cols, setCols, onClose }: {
  meta: FieldMeta[]; cols: string[]; setCols: (c: string[]) => void; onClose: () => void;
}) {
  const groups = useMemo(() => {
    const g: Record<string, FieldMeta[]> = {};
    for (const m of meta) (g[m.g] ??= []).push(m);
    return g;
  }, [meta]);

  const toggle = (k: string) =>
    setCols(cols.includes(k) ? cols.filter((c) => c !== k) : [...cols, k]);

  return (
    <motion.div layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}
      className="overflow-hidden border-t border-line">
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <span className="text-[12px] text-ink-dim">
          <b className="text-ink tnum">{cols.length}</b> of {meta.length} measures shown.
          The scheme name is always the first column.
        </span>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setCols(meta.map((m) => m.k))}>All</Button>
          <Button onClick={() => setCols(DEFAULT_COLS)}>Reset</Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
      <div className="grid gap-5 px-5 py-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(groups).map(([g, items]) => (
          <div key={g}>
            <Label className="mb-2">{g}</Label>
            <div className="flex flex-wrap gap-1.5">
              {items.map((m) => (
                <button key={m.k} onClick={() => toggle(m.k)} title={m.h}
                  className={`border px-2 py-1 text-[11px] transition-colors
                    ${cols.includes(m.k)
                      ? "border-ink bg-ink text-paper"
                      : "border-line-2 text-ink-dim hover:border-ink hover:text-ink"}`}>
                  {m.l}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function Funds() {
  const { data, loading, error } = useFunds();
  const [preset, setPreset] = useState("consistent");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(50);
  const [sort, setSort] = useState<{ f: string; dir: 1 | -1 }>({ f: "name", dir: 1 });
  const [cols, setCols] = useState<string[]>(DEFAULT_COLS);
  const [picking, setPicking] = useState(false);
  const [flash, setFlash] = useState("");

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

  // Chosen columns in schema order, so Returns always precede Risk however
  // they were clicked. The name (with fund house) is the fixed first column.
  const visible = useMemo(() => {
    if (!data) return [];
    return ["name", ...pickable(data).map((m) => m.k).filter((k) => cols.includes(k))];
  }, [data, cols]);

  // The whole record for every scheme in the current view — identifiers first
  // (ISIN is what a CAS names schemes by), then each computed measure, whether
  // or not it is a visible column.
  const doExport = () => {
    if (!data) return;
    const columns = [
      { key: "code", label: "Scheme code" },
      { key: "isin", label: "ISIN" },
      { key: "name", label: "Scheme" },
      { key: "amc", label: "Fund house" },
      ...pickable(data).filter((m) => !["isin"].includes(m.k)).map((m) => ({ key: m.k, label: m.l })),
    ];
    downloadCsv(`myfinancial-funds-${data.navDate ?? "export"}.csv`, toCsv(rows, columns));
    setFlash(`Exported ${nf(rows.length, 0)} schemes with ${columns.length} columns — every measure this build computes.`);
  };

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
              onClick={() => { setPreset(p.id); setSort({ f: p.sort, dir: p.sort === "name" ? 1 : -1 }); setShown(50); }}>
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
              <div className="flex flex-wrap items-center gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scheme or fund house…"
                  className="min-w-[200px] border border-line-2 bg-paper px-3 py-1.5 text-[12.5px] outline-none transition-colors focus:border-accent" />
                <Button onClick={() => setPicking((v) => !v)} active={picking}>
                  Columns <span className="ml-1.5 opacity-70">{visible.length}</span>
                </Button>
                <Button onClick={doExport} active>Export CSV</Button>
                <Chip>{nf(rows.length, 0)}</Chip>
              </div>
            } />
          <AnimatePresence initial={false}>
            {picking && data && (
              <ColumnPicker key="picker" meta={pickable(data)} cols={cols} setCols={setCols}
                onClose={() => setPicking(false)} />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {flash && (
              <motion.div key={flash} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-line bg-ink/[0.04]">
                <div className="px-5 py-2.5 text-[12px] text-ink-dim">{flash}</div>
              </motion.div>
            )}
          </AnimatePresence>
          {loading ? <Skeleton className="h-[420px]" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line">
                    {visible.map((k, i) => {
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
                      {visible.map((k, ci) => {
                        const m = data!.byKey[k];
                        if (!m) return null;
                        if (ci === 0) return (
                          <td key={k} className="px-3 py-2.5">
                            <Link to={`/fund/${encodeURIComponent(String(r.code))}`} className="group block">
                              <span className="block font-semibold group-hover:text-accent">{r.name}</span>
                              <span className="block font-mono text-[10px] text-ink-faint">{r.amc}</span>
                            </Link>
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
                    <tr><td colSpan={visible.length} className="px-5 py-16 text-center text-[13px] text-ink-dim">No schemes match.</td></tr>
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
