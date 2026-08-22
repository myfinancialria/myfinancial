import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useStocks } from "../lib/useData";
import { Card, CardHead, Label, Chip, Button, ErrorNote, Skeleton } from "../components/ui";
import { Reveal } from "../components/motion";
import { byUnit, nf, tone } from "../lib/format";
import type { Index, Row, FieldMeta } from "../lib/data";
import {
  encodeScreen, decodeScreen, listSaved, saveScreen, deleteScreen,
  toCsv, downloadCsv, type Filter, type Op, type Screen,
} from "../lib/screens";

const OPS: Record<string, [Op, string][]> = {
  num: [[">=", "at least"], ["<=", "at most"], ["between", "between"], ["=", "equals"], [">", "over"], ["<", "under"], ["notnull", "has a value"]],
  bool: [["true", "is yes"], ["false", "is no"]],
  cat: [["in", "is one of"], ["contains", "contains"]],
  text: [["contains", "contains"], ["=", "equals"]],
};

const PRESETS: { id: string; name: string; why: string; filters: Filter[]; sort: string }[] = [
  { id: "quality", name: "Quality compounders",
    why: "High return on capital, sensible leverage, real margins — and still above its long-term average.",
    filters: [{ f: "roe", op: ">=", a: 15 }, { f: "roce", op: ">=", a: 15 }, { f: "profitMarginPct", op: ">=", a: 8 },
              { f: "liabilitiesToEquity", op: "<=", a: 1.5 }, { f: "aboveSma200", op: "true" }, { f: "avgTurnoverCr", op: ">=", a: 5 }],
    sort: "roce" },
  { id: "value", name: "Value, not broken",
    why: "Cheap against earnings, cheap against its own sub-sector, and still profitable — the filter that separates value from a falling knife.",
    filters: [{ f: "pe", op: "between", a: 3, b: 18 }, { f: "pb", op: "<=", a: 3 }, { f: "peVsPeers", op: "<=", a: -10 },
              { f: "roe", op: ">=", a: 10 }, { f: "avgTurnoverCr", op: ">=", a: 2 }],
    sort: "pe" },
  { id: "momentum", name: "Momentum leaders",
    why: "Top of the market on one-year relative strength, in a confirmed advance, near their highs.",
    filters: [{ f: "rsRank1y", op: ">=", a: 85 }, { f: "stage", op: "=", a: 2 }, { f: "adx14", op: ">=", a: 20 },
              { f: "pctFrom52wHigh", op: ">=", a: -12 }, { f: "avgTurnoverCr", op: ">=", a: 5 }],
    sort: "rsRank1y" },
  { id: "delivery", name: "Quiet accumulation",
    why: "High delivery means buyers are taking shares home rather than trading them intraday — and these are still well off their highs.",
    filters: [{ f: "avgDeliveryPct20", op: ">=", a: 60 }, { f: "pctFrom52wHigh", op: "<=", a: -15 }, { f: "avgTurnoverCr", op: ">=", a: 2 }],
    sort: "avgDeliveryPct20" },
  { id: "dividend", name: "Dividend payers",
    why: "A real yield, summed from each company's own filed payouts, backed by profits rather than a falling price.",
    filters: [{ f: "dividendYieldPct", op: ">=", a: 2 }, { f: "roe", op: ">=", a: 10 }, { f: "pe", op: "<=", a: 30 }, { f: "avgTurnoverCr", op: ">=", a: 2 }],
    sort: "dividendYieldPct" },
  { id: "oversold", name: "Oversold quality",
    why: "Profitable, lightly geared companies that have been beaten down. A watchlist, not a buy list.",
    filters: [{ f: "rsi14", op: "<=", a: 35 }, { f: "roe", op: ">=", a: 12 }, { f: "liabilitiesToEquity", op: "<=", a: 2 }, { f: "avgTurnoverCr", op: ">=", a: 3 }],
    sort: "rsi14" },
];

function passes(row: Row, f: Filter): boolean {
  const v = row[f.f];
  switch (f.op) {
    case "notnull": return v !== null && v !== undefined && v !== "";
    case "true": return v === true;
    case "false": return v === false || v === null;
    case "in": return Array.isArray(f.a) && f.a.length ? f.a.map(String).includes(String(v)) : true;
    case "contains": return String(v ?? "").toLowerCase().includes(String(f.a ?? "").toLowerCase());
    default: break;
  }
  if (typeof v !== "number") return false;   // a blank cannot meet a threshold
  const a = Number(f.a), b = Number(f.b);
  switch (f.op) {
    case ">=": return !Number.isFinite(a) || v >= a;
    case "<=": return !Number.isFinite(a) || v <= a;
    case ">": return !Number.isFinite(a) || v > a;
    case "<": return !Number.isFinite(a) || v < a;
    case "=": return !Number.isFinite(a) || v === a;
    case "between": return (!Number.isFinite(a) || v >= a) && (!Number.isFinite(b) || v <= b);
    default: return true;
  }
}

function FilterRow({ idx, filter, data, onChange, onRemove }: {
  idx: number; filter: Filter; data: Index; onChange: (f: Filter) => void; onRemove: () => void;
}) {
  const meta = data.byKey[filter.f];
  const ops = OPS[meta?.t ?? "num"] ?? OPS.num;
  const coverage = useMemo(() => {
    const n = data.rows.filter((r) => r[filter.f] !== null && r[filter.f] !== undefined && r[filter.f] !== "").length;
    return n / data.rows.length;
  }, [data, filter.f]);
  const needsValue = !["true", "false", "notnull"].includes(filter.op);

  const groups = useMemo(() => {
    const g: Record<string, FieldMeta[]> = {};
    for (const m of data.meta) (g[m.g] ??= []).push(m);
    return g;
  }, [data]);

  const input = "border border-line-2 bg-paper px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent transition-colors";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22 }}
      className="flex flex-wrap items-center gap-2"
    >
      <select className={`${input} min-w-[190px]`} value={filter.f}
        onChange={(e) => {
          const m = data.byKey[e.target.value];
          onChange({ f: e.target.value, op: (OPS[m.t] ?? OPS.num)[0][0], a: m.t === "cat" ? [] : "" });
        }}>
        {Object.entries(groups).map(([g, items]) => (
          <optgroup key={g} label={g}>
            {items.map((m) => <option key={m.k} value={m.k}>{m.l}</option>)}
          </optgroup>
        ))}
      </select>

      <select className={`${input} min-w-[118px]`} value={filter.op}
        onChange={(e) => onChange({ ...filter, op: e.target.value as Op })}>
        {ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>

      {needsValue && (meta?.t === "cat" ? (
        <select className={`${input} min-w-[170px]`} multiple={false}
          value={Array.isArray(filter.a) ? filter.a[0] ?? "" : filter.a ?? ""}
          onChange={(e) => onChange({ ...filter, op: "in", a: [e.target.value] })}>
          <option value="">any</option>
          {(data.cats[filter.f] ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <>
          <input className={`${input} w-[92px] tnum`} type={meta?.t === "text" ? "text" : "number"}
            value={filter.a ?? ""} placeholder={meta?.u === "%" ? "%" : "value"}
            onChange={(e) => onChange({ ...filter, a: e.target.value })} />
          {filter.op === "between" && (
            <>
              <span className="text-[11px] text-ink-faint">and</span>
              <input className={`${input} w-[92px] tnum`} type="number" value={filter.b ?? ""}
                onChange={(e) => onChange({ ...filter, b: e.target.value })} />
            </>
          )}
        </>
      ))}

      {meta?.u && <span className="font-mono text-[10px] text-ink-faint">{meta.u === "₹cr" ? "₹ cr" : meta.u}</span>}
      {needsValue && coverage < 0.6 && (
        <span title={`${meta?.l} is present for ${(coverage * 100).toFixed(0)}% of companies. Rows without a value cannot meet a threshold, so this condition excludes them.`}
          className="cursor-help border border-warn px-1.5 py-0.5 font-mono text-[9px] text-warn">
          only {(coverage * 100).toFixed(0)}% have this
        </span>
      )}
      <button onClick={onRemove} title="Remove"
        className="ml-auto grid h-7 w-7 place-items-center border border-line-2 text-ink-faint transition-colors hover:border-down hover:text-down">×</button>
    </motion.div>
  );
}


/* ------------------------------ column picker ----------------------------- */
function ColumnPicker({ data, cols, setCols, onClose }: {
  data: Index; cols: string[]; setCols: (c: string[]) => void; onClose: () => void;
}) {
  const groups = useMemo(() => {
    const g: Record<string, FieldMeta[]> = {};
    for (const m of data.meta) (g[m.g] ??= []).push(m);
    return g;
  }, [data]);

  const toggle = (k: string) =>
    setCols(cols.includes(k) ? cols.filter((c) => c !== k) : [...cols, k]);

  return (
    <motion.div layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}
      className="overflow-hidden border-t border-line">
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <span className="text-[12px] text-ink-dim">
          <b className="text-ink tnum">{cols.length}</b> of {data.meta.length} measures shown.
          The name column is always first; conditions and the sort column are added automatically.
        </span>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setCols(data.meta.filter((m) => m.c).map((m) => m.k))}>Reset</Button>
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

export default function Screener() {
  const { data, loading, error } = useStocks();
  const [params, setParams] = useSearchParams();

  // A shared link carries the whole screen, so it is read once on mount and
  // then the URL is left alone — editing conditions must not rewrite history
  // on every keystroke.
  const shared = useRef(decodeScreen(params.get("s") ?? "")).current;

  const [filters, setFilters] = useState<Filter[]>(shared?.filters ?? PRESETS[0].filters);
  const [preset, setPreset] = useState<string | null>(shared ? null : PRESETS[0].id);
  const [q, setQ] = useState(shared?.q ?? "");
  const [sort, setSort] = useState<{ f: string; dir: 1 | -1 }>(shared?.sort ?? { f: "roce", dir: -1 });
  const [shown, setShown] = useState(50);
  const [chosen, setChosen] = useState<string[] | null>(shared?.cols?.length ? shared.cols : null);
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState<Screen[]>(() => listSaved());
  const [flash, setFlash] = useState("");

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  // `chosen` is what the user picked; `cols` is what the table actually shows —
  // the picked set plus anything a condition or the sort refers to, because a
  // row you cannot see the reason for is not a result you can check.
  const cols = useMemo(() => {
    if (!data) return [];
    const base = chosen ? [...chosen] : data.meta.filter((m) => m.c).map((m) => m.k);
    if (!base.includes("name")) base.unshift("name");
    for (const f of filters) if (!base.includes(f.f)) base.push(f.f);
    if (!base.includes(sort.f)) base.push(sort.f);
    return base.filter((k) => data.byKey[k]);
  }, [data, chosen, filters, sort.f]);

  const rows = useMemo(() => {
    if (!data) return [];
    let out = data.rows;
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((r) => `${r.name} ${r.symbol} ${r.industry ?? ""}`.toLowerCase().includes(needle));
    for (const f of filters) out = out.filter((r) => passes(r, f));
    return [...out].sort((x, y) => {
      const a = x[sort.f], b = y[sort.f];
      const an = a === null || a === undefined || a === "", bn = b === null || b === undefined || b === "";
      if (an && bn) return 0;
      if (an) return 1;                       // blanks sink, whichever direction
      if (bn) return -1;
      if (typeof a === "string" || typeof b === "string") return sort.dir * String(a).localeCompare(String(b));
      return sort.dir * (a - b);
    });
  }, [data, filters, q, sort]);

  if (error) return <ErrorNote error={error} />;

  const applyPreset = (p: typeof PRESETS[number]) => {
    setPreset(p.id); setFilters(p.filters.map((f) => ({ ...f })));
    setSort({ f: p.sort, dir: -1 }); setShown(50); setChosen(null);
  };
  const current = PRESETS.find((p) => p.id === preset);

  const definition = { filters, sort, q, cols: chosen ?? [] };

  const applyScreen = (sc: Screen) => {
    setFilters(sc.filters.map((f) => ({ ...f })));
    setSort(sc.sort); setQ(sc.q ?? "");
    setChosen(sc.cols?.length ? sc.cols : null);
    setPreset(null); setShown(50);
  };

  const doSave = () => {
    const name = prompt("Name this screen", current?.name ?? "My screen")?.trim();
    if (!name) return;
    setSaved(saveScreen({ name, ...definition }));
    setFlash(`Saved “${name}” to this browser.`);
  };

  const doShare = async () => {
    const url = `${location.origin}${location.pathname}#/screener?s=${encodeScreen(definition)}`;
    try {
      await navigator.clipboard.writeText(url);
      setFlash("Link copied — it carries the whole screen, so it works for anyone you send it to.");
    } catch {
      // Clipboard is refused without a user gesture in some browsers, and over
      // plain http everywhere. Falling back to the URL bar still hands the
      // link over rather than failing silently.
      setParams({ s: encodeScreen(definition) }, { replace: true });
      setFlash("Link is in the address bar — copy it from there.");
    }
  };

  const doExport = () => {
    if (!data) return;
    const columns = cols.map((k) => ({ key: k, label: data.byKey[k]?.l ?? k }));
    downloadCsv(
      `myfinancial-screen-${data.priceDate ?? "export"}.csv`,
      toCsv(rows, [{ key: "symbol", label: "Symbol" }, ...columns.filter((c) => c.key !== "symbol")]),
    );
    setFlash(`Exported ${nf(rows.length, 0)} rows with ${columns.length} columns.`);
  };

  return (
    <>
      <section className="pt-12 pb-7">
        <Reveal><Label className="mb-3.5">Screener</Label></Reveal>
        <Reveal delay={0.05}>
          <h1 className="text-[clamp(2rem,4.6vw,3.1rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
            Filter the market{" "}
            <span className="font-serif font-normal italic text-ink-dim">on anything.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-4 max-w-[62ch] text-[14px] leading-relaxed text-ink-dim">
            {data ? nf(data.count, 0) : "—"} listed companies across {data?.meta.length ?? "—"} measures.
            Everything is filtered in your browser, so each keystroke re-screens the whole market.
          </p>
        </Reveal>
      </section>

      <Reveal>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.id} active={preset === p.id} onClick={() => applyPreset(p)}>{p.name}</Button>
          ))}
        </div>

        {saved.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Label>Your screens</Label>
            {saved.map((sc) => (
              <span key={sc.name} className="group flex items-center border border-line-2 transition-colors hover:border-ink">
                <button onClick={() => applyScreen(sc)}
                  className="px-3 py-1.5 text-[11.5px] text-ink-dim transition-colors group-hover:text-ink">
                  {sc.name}
                  <span className="ml-2 font-mono text-[9.5px] text-ink-faint">{sc.filters.length}</span>
                </button>
                <button title={`Delete “${sc.name}”`}
                  onClick={() => { if (confirm(`Delete the saved screen “${sc.name}”?`)) setSaved(deleteScreen(sc.name)); }}
                  className="border-l border-line-2 px-2 py-1.5 text-[11px] text-ink-faint transition-colors hover:text-down">×</button>
              </span>
            ))}
          </div>
        )}
        <AnimatePresence mode="wait">
          {current && (
            <motion.p key={current.id}
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="mt-3.5 max-w-[88ch] text-[13px] leading-relaxed text-ink-dim">
              {current.why}
            </motion.p>
          )}
        </AnimatePresence>
      </Reveal>

      <Reveal className="mt-6">
        <Card>
          <CardHead
            title="Conditions"
            right={
              <div className="flex flex-wrap items-center gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or symbol…"
                  className="min-w-[190px] border border-line-2 bg-paper px-3 py-1.5 text-[12.5px] outline-none transition-colors focus:border-accent" />
                <Button onClick={() => {
                  if (!data) return;
                  const first = data.meta.find((m) => m.t === "num" && !filters.some((f) => f.f === m.k));
                  if (first) { setFilters([...filters, { f: first.k, op: ">=", a: "" }]); setPreset(null); }
                }}>+ Condition</Button>
                <Button onClick={() => { setFilters([]); setPreset(null); setQ(""); }}>Clear</Button>
              </div>
            }
          />
          <div className="space-y-2 px-5 py-4">
            {loading && <Skeleton className="h-24" />}
            <AnimatePresence initial={false}>
              {data && filters.map((f, i) => (
                <FilterRow key={`${f.f}-${i}`} idx={i} filter={f} data={data}
                  onChange={(nf2) => { const c = [...filters]; c[i] = nf2; setFilters(c); setPreset(null); }}
                  onRemove={() => { setFilters(filters.filter((_, j) => j !== i)); setPreset(null); }} />
              ))}
            </AnimatePresence>
            {data && !filters.length && (
              <p className="text-[13px] text-ink-dim">No conditions — the whole market is shown. Add one, or start from a ready-made screen above.</p>
            )}
          </div>
          {data && (
            <div className="border-t border-line px-5 py-3 text-[12px] text-ink-dim">
              <motion.span key={rows.length} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="tnum font-semibold text-ink">
                {nf(rows.length, 0)}
              </motion.span>{" "}
              of {nf(data.count, 0)} companies match{filters.length ? ` all ${filters.length} condition${filters.length > 1 ? "s" : ""}` : ""}.
            </div>
          )}
        </Card>
      </Reveal>

      <Reveal className="mt-6">
        <Card>
          <CardHead title="Results" sub={`Sorted by ${data?.byKey[sort.f]?.l ?? sort.f}`}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setPicking((v) => !v)} active={picking}>
                  Columns <span className="ml-1.5 opacity-70">{cols.length}</span>
                </Button>
                <Button onClick={doSave}>Save screen</Button>
                <Button onClick={doShare}>Share link</Button>
                <Button onClick={doExport} active>Export CSV</Button>
                <Chip>{nf(Math.min(shown, rows.length), 0)} shown</Chip>
              </div>
            } />
          <AnimatePresence initial={false}>
            {picking && data && (
              <ColumnPicker key="picker" data={data} cols={chosen ?? data.meta.filter((m) => m.c).map((m) => m.k)}
                setCols={setChosen} onClose={() => setPicking(false)} />
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
                    {cols.map((k, i) => {
                      const m = data!.byKey[k];
                      return (
                        <th key={k} onClick={() => setSort((s) => s.f === k ? { f: k, dir: (-s.dir) as 1 | -1 } : { f: k, dir: m.d === -1 ? 1 : -1 })}
                          title={m.h}
                          className={`sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap bg-paper-2 px-3 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-faint transition-colors hover:text-ink
                            ${i === 0 ? "text-left" : "text-right"}`}>
                          {m.l}{sort.f === k && <span className="ml-1 text-ink">{sort.dir === -1 ? "▾" : "▴"}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map((r, ri) => (
                    <motion.tr key={r.symbol}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ duration: 0.25, delay: Math.min(ri, 24) * 0.012 }}
                      className="border-b border-line transition-colors last:border-0 hover:bg-paper-3">
                      {cols.map((k, i) => {
                        const m = data!.byKey[k];
                        const v = r[k];
                        if (i === 0) return (
                          <td key={k} className="px-3 py-2.5">
                            <Link to={`/company/${encodeURIComponent(r.symbol)}`} className="group block">
                              <span className="font-semibold group-hover:text-accent">{String(v ?? r.symbol)}</span>
                              <span className="block font-mono text-[10px] text-ink-faint">{r.symbol}</span>
                            </Link>
                          </td>
                        );
                        const colour = m.u === "%" && m.d === 1 ? tone(v) : "";
                        return <td key={k} className={`whitespace-nowrap px-3 py-2.5 text-right tnum ${colour}`}>{byUnit(v, m.u)}</td>;
                      })}
                    </motion.tr>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={cols.length} className="px-5 py-16 text-center text-[13px] text-ink-dim">
                      Nothing matches all of these conditions. Loosen one — a quiet market genuinely produces fewer results.
                    </td></tr>
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
          <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
            A saved screen lives in this browser only — there is no account behind it. A shared link carries the
            whole definition rather than an id, so it keeps working even though nothing is stored on a server.
            The CSV exports every matching row, not just the ones on screen.
          </div>
        </Card>
      </Reveal>
    </>
  );
}
