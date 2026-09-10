import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useFunds } from "../lib/useData";
import { Card, CardHead, Label, Chip, Button, ErrorNote, Skeleton } from "../components/ui";
import { Reveal } from "../components/motion";
import { byUnit, nf, tone } from "../lib/format";
import type { Index, Row, FieldMeta } from "../lib/data";
import {
  encodeScreen, decodeScreen, listSaved, saveScreen, deleteScreen,
  toCsv, downloadCsv, type Filter, type Op, type Screen,
} from "../lib/screens";

/* ---------------------------------------------------------------------------
   The mutual fund screener — the stock screener's discipline pointed at every
   live Direct-Growth scheme. Same conditions, same saved screens and share
   links, same CSV; the measures are the fund set: rolling returns, risk and
   the full return ladder, all computed from published AMFI NAV history.
--------------------------------------------------------------------------- */

const STORE = "myfin.fundscreens.v1";

const OPS: Record<string, [Op, string][]> = {
  num: [[">=", "at least"], ["<=", "at most"], ["between", "between"], ["=", "equals"], [">", "over"], ["<", "under"], ["notnull", "has a value"]],
  bool: [["true", "is yes"], ["false", "is no"]],
  cat: [["in", "is one of"], ["contains", "contains"]],
  text: [["contains", "contains"], ["=", "equals"]],
};

// The measures a condition or column may use. The whole "Category record"
// group stays out for the same reason it is absent everywhere else on this
// site: ranks and quartiles of past returns on a registered adviser's website
// read as recommendations.
const usable = (data: Index): FieldMeta[] =>
  data.meta.filter((m) => m.g !== "Category record" && !["name", "amc", "code", "stale"].includes(m.k));

const DEFAULT_COLS = ["category", "nav", "r1y", "r3y", "r5y", "rolling3yAvg", "volatility", "sharpe", "maxDrawdownPct"];

const PRESETS: { id: string; name: string; why: string; filters: Filter[]; sort: string }[] = [
  { id: "consistent", name: "Consistent equity",
    why: "Equity schemes whose average three-year rolling return has been strong AND which have never lost money over any three-year window — five years of history minimum.",
    filters: [{ f: "categoryGroup", op: "in", a: ["Equity"] }, { f: "rolling3yAvg", op: ">=", a: 14 },
              { f: "rolling3yPctPositive", op: ">=", a: 95 }, { f: "ageYears", op: ">=", a: 5 }],
    sort: "rolling3yAvg" },
  { id: "sharpe", name: "Best paid risk",
    why: "A Sharpe ratio of at least 0.8 over three years — return per unit of volatility, computed from published NAV history rather than quoted from a factsheet.",
    filters: [{ f: "sharpe", op: ">=", a: 0.8 }, { f: "ageYears", op: ">=", a: 3 }],
    sort: "sharpe" },
  { id: "shallow", name: "Shallow drawdowns",
    why: "Respectable compounding whose worst-ever fall stayed inside 15% — for money that cannot ride out a deep trough.",
    filters: [{ f: "maxDrawdownPct", op: ">=", a: -15 }, { f: "r3y", op: ">=", a: 8 }, { f: "ageYears", op: ">=", a: 5 }],
    sort: "maxDrawdownPct" },
  { id: "veterans", name: "Ten-year veterans",
    why: "A decade of published NAVs and a double-digit ten-year CAGR — records long enough to include a full cycle, not just the last bull run.",
    filters: [{ f: "ageYears", op: ">=", a: 10 }, { f: "r10y", op: ">=", a: 10 }],
    sort: "r10y" },
  { id: "steadydebt", name: "Steady debt",
    why: "Debt schemes with genuinely low volatility and a three-year return that beat a savings account — parking money, honestly measured.",
    filters: [{ f: "categoryGroup", op: "in", a: ["Debt"] }, { f: "volatility", op: "<=", a: 2 }, { f: "r3y", op: ">=", a: 6 }],
    sort: "r3y" },
  { id: "elss", name: "ELSS tax savers",
    why: "Section 80C schemes with a three-year lock-in — judged on their rolling three-year record, the exact horizon the lock-in forces on you.",
    filters: [{ f: "category", op: "contains", a: "ELSS" }, { f: "ageYears", op: ">=", a: 3 }],
    sort: "rolling3yAvg" },
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

function FilterRow({ filter, data, meta: metaList, onChange, onRemove }: {
  filter: Filter; data: Index; meta: FieldMeta[]; onChange: (f: Filter) => void; onRemove: () => void;
}) {
  const meta = data.byKey[filter.f];
  const ops = OPS[meta?.t ?? "num"] ?? OPS.num;
  const live = useMemo(() => data.rows.filter((r) => !r.stale), [data]);
  const coverage = useMemo(() => {
    const n = live.filter((r) => r[filter.f] !== null && r[filter.f] !== undefined && r[filter.f] !== "").length;
    return n / (live.length || 1);
  }, [live, filter.f]);
  const needsValue = !["true", "false", "notnull"].includes(filter.op);

  const groups = useMemo(() => {
    const g: Record<string, FieldMeta[]> = {};
    for (const m of metaList) (g[m.g] ??= []).push(m);
    return g;
  }, [metaList]);

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

      {meta?.u && <span className="font-mono text-[10px] text-ink-faint">{meta.u}</span>}
      {needsValue && coverage < 0.6 && (
        <span title={`${meta?.l} is present for ${(coverage * 100).toFixed(0)}% of schemes. Rows without a value cannot meet a threshold, so this condition excludes them.`}
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
          The scheme name is always first; conditions and the sort column are added automatically.
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

export default function FundScreener() {
  const { data, loading, error } = useFunds();
  const [params, setParams] = useSearchParams();

  // A shared link carries the whole screen, so it is read once on mount and
  // then the URL is left alone — editing conditions must not rewrite history
  // on every keystroke.
  const shared = useRef(decodeScreen(params.get("s") ?? "")).current;

  const [filters, setFilters] = useState<Filter[]>(shared?.filters ?? PRESETS[0].filters);
  const [preset, setPreset] = useState<string | null>(shared ? null : PRESETS[0].id);
  const [q, setQ] = useState(shared?.q ?? "");
  const [sort, setSort] = useState<{ f: string; dir: 1 | -1 }>(shared?.sort ?? { f: "rolling3yAvg", dir: -1 });
  const [shown, setShown] = useState(50);
  const [chosen, setChosen] = useState<string[] | null>(shared?.cols?.length ? shared.cols : null);
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState<Screen[]>(() => listSaved(STORE));
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
    const base = chosen ? [...chosen] : [...DEFAULT_COLS];
    if (!base.includes("name")) base.unshift("name");
    for (const f of filters) if (!base.includes(f.f)) base.push(f.f);
    if (!base.includes(sort.f)) base.push(sort.f);
    return base.filter((k) => data.byKey[k]);
  }, [data, chosen, filters, sort.f]);

  const rows = useMemo(() => {
    if (!data) return [];
    let out = data.rows.filter((r) => !r.stale);   // wound-up schemes are not investable
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((r) => `${r.name} ${r.amc} ${r.category}`.toLowerCase().includes(needle));
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
    const name = prompt("Name this screen", current?.name ?? "My fund screen")?.trim();
    if (!name) return;
    setSaved(saveScreen({ name, ...definition }, STORE));
    setFlash(`Saved “${name}” to this browser.`);
  };

  const doShare = async () => {
    // The Pages 404 bounce parks location.search along with the path, so a
    // plain query survives a cold open of the link.
    const url = `${location.origin}${location.pathname}?s=${encodeScreen(definition)}`;
    try {
      await navigator.clipboard.writeText(url);
      setFlash("Link copied — it carries the whole screen, so it works for anyone you send it to.");
    } catch {
      setParams({ s: encodeScreen(definition) }, { replace: true });
      setFlash("Link is in the address bar — copy it from there.");
    }
  };

  const doExport = () => {
    if (!data) return;
    const columns = cols.filter((k) => k !== "name").map((k) => ({ key: k, label: data.byKey[k]?.l ?? k }));
    downloadCsv(
      `myfinancial-mf-screen-${data.navDate ?? "export"}.csv`,
      toCsv(rows, [
        { key: "code", label: "Scheme code" },
        { key: "name", label: "Scheme" },
        { key: "amc", label: "Fund house" },
        ...columns,
      ]),
    );
    setFlash(`Exported ${nf(rows.length, 0)} schemes with ${columns.length + 3} columns.`);
  };

  return (
    <>
      <section className="pt-12 pb-7">
        <Reveal><Label className="mb-3.5">MF Screener</Label></Reveal>
        <Reveal delay={0.05}>
          <h1 className="text-[clamp(2rem,4.6vw,3.1rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
            Filter every fund{" "}
            <span className="font-serif font-normal italic text-ink-dim">on anything.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-4 max-w-[68ch] text-[14px] leading-relaxed text-ink-dim">
            {data ? nf(data.liveCount ?? data.count, 0) : "—"} live Direct-Growth schemes across{" "}
            {data ? usable(data).length : "—"} measures, every one computed from official AMFI NAV history.
            Everything filters in your browser, so each keystroke re-screens the whole universe.
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
                  onClick={() => { if (confirm(`Delete the saved screen “${sc.name}”?`)) setSaved(deleteScreen(sc.name, STORE)); }}
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
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scheme or fund house…"
                  className="min-w-[190px] border border-line-2 bg-paper px-3 py-1.5 text-[12.5px] outline-none transition-colors focus:border-accent" />
                <Button onClick={() => {
                  if (!data) return;
                  const first = usable(data).find((m) => m.t === "num" && !filters.some((f) => f.f === m.k));
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
                <FilterRow key={`${f.f}-${i}`} filter={f} data={data} meta={usable(data)}
                  onChange={(nf2) => { const c = [...filters]; c[i] = nf2; setFilters(c); setPreset(null); }}
                  onRemove={() => { setFilters(filters.filter((_, j) => j !== i)); setPreset(null); }} />
              ))}
            </AnimatePresence>
            {data && !filters.length && (
              <p className="text-[13px] text-ink-dim">No conditions — every live scheme is shown. Add one, or start from a ready-made screen above.</p>
            )}
          </div>
          {data && (
            <div className="border-t border-line px-5 py-3 text-[12px] text-ink-dim">
              <motion.span key={rows.length} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="tnum font-semibold text-ink">
                {nf(rows.length, 0)}
              </motion.span>{" "}
              of {nf(data.liveCount ?? data.count, 0)} live schemes match{filters.length ? ` all ${filters.length} condition${filters.length > 1 ? "s" : ""}` : ""}.
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
              <ColumnPicker key="picker" meta={usable(data)}
                cols={chosen ?? DEFAULT_COLS}
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
                      {cols.map((k, ci) => {
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
                    <tr><td colSpan={cols.length} className="px-5 py-16 text-center text-[13px] text-ink-dim">
                      No schemes match all the conditions. Loosen one, or clear them.
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
        </Card>
      </Reveal>

      <p className="mt-2 max-w-[80ch] text-[11.5px] leading-relaxed text-ink-faint">
        Universe: every live Direct-plan Growth-option scheme publishing a NAV to AMFI. Returns, rolling
        windows and risk are computed from the complete published NAV history of each scheme. This is a
        filtering tool, not advice; past performance does not indicate future results.
      </p>
    </>
  );
}
