import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useStocks, useStock, useSectors } from "../lib/useData";
import { Card, CardHead, Label, Chip, ErrorNote, Skeleton } from "../components/ui";
import { Reveal, Stagger, StaggerItem } from "../components/motion";
import CandleChart from "../components/CandleChart";
import { byUnit, crore, inr, isNum, nf, pct, plainPct, tone } from "../lib/format";
import { staticStockUrl, type Row, type Statements, type Holdings } from "../lib/data";

/* ---------------------------------------------------------------------------
   One company, in full.

   The order is the order the questions get asked: what is it worth today, how
   has it traded, what do its own numbers say, what did it file, who owns it,
   how does it compare with the companies it competes against, and finally what
   is happening to the industry it sits in.
--------------------------------------------------------------------------- */

const GROUPS = ["Valuation", "Profitability", "Growth", "Balance sheet", "Ownership", "Trend", "Momentum", "Volatility", "Range", "Liquidity"];

const Bullets = ({ items }: { items: string[] }) => (
  <ul className="grid gap-2">
    {items.map((x, i) => (
      <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-ink-dim">
        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />{x}
      </li>
    ))}
  </ul>
);

/* --------------------------- financial statements ------------------------- */
function StatementTable({ st, pane }: { st: Statements; pane: "pnl" | "bs" | "cf" }) {
  const rows = pane === "pnl" ? st.pnl : pane === "bs" ? st.balanceSheet : st.cashFlow;
  const specs = pane === "pnl" ? st.specs.pnl : pane === "bs" ? st.specs.bs : st.specs.cf;
  if (!rows?.length || !specs?.length) return null;

  // Newest period first reads better than the filing order.
  const periods = [...rows].reverse();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-line bg-paper-2 px-4 py-2.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">
              ₹ {st.units}
            </th>
            {periods.map((r) => (
              <th key={r.fy} className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                {r.fy}
                <div className="mt-0.5 text-[8.5px] tracking-[0.08em] normal-case opacity-70">{r.period}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {specs.map((sp) => {
            const any = periods.some((r) => isNum(r[sp.k]));
            if (!any) return null;
            return (
              <tr key={sp.k} className={`border-b border-line last:border-0 ${sp.strong ? "font-semibold" : ""}`}>
                <td className={`sticky left-0 z-10 bg-paper-2 px-4 py-2 ${sp.strong ? "" : "text-ink-dim"}`}>{sp.label}</td>
                {periods.map((r) => (
                  <td key={r.fy} className={`whitespace-nowrap px-4 py-2 text-right tnum ${isNum(r[sp.k]) && r[sp.k] < 0 ? "text-down" : ""}`}>
                    {isNum(r[sp.k]) ? nf(r[sp.k], Math.abs(r[sp.k]) < 100 ? 2 : 0) : "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Financials({ st }: { st: Statements }) {
  const panes = ([
    ["pnl", "Profit & loss"],
    ["bs", "Balance sheet"],
    ["cf", "Cash flow"],
  ] as const).filter(([k]) => {
    const rows = k === "pnl" ? st.pnl : k === "bs" ? st.balanceSheet : st.cashFlow;
    return rows?.length;
  });
  const [pane, setPane] = useState<"pnl" | "bs" | "cf">(panes[0]?.[0] ?? "pnl");
  if (!panes.length) return null;

  return (
    <Reveal className="mt-6">
      <Card>
        <CardHead title="Financial statements"
          sub={`${st.type} · ₹ ${st.units} · ${st.pnl?.length ?? 0} reported periods`}
          right={<Chip tone={st.real ? "accent" : "warn"}>{st.real ? "as filed" : "estimated"}</Chip>} />
        <div className="flex border-b border-line">
          {panes.map(([k, l]) => (
            <button key={k} onClick={() => setPane(k)}
              className={`border-b-2 px-4 py-2.5 text-[12px] transition-colors
                ${pane === k ? "border-ink font-semibold text-ink" : "border-transparent text-ink-dim hover:text-ink"}`}>
              {l}
            </button>
          ))}
        </div>
        <StatementTable st={st} pane={pane} />
        {st.note && <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">{st.note}</div>}
      </Card>
    </Reveal>
  );
}

/* ------------------------------- shareholding ----------------------------- */
function Shareholding({ h }: { h: Holdings }) {
  if (!h.rows?.length || !h.periods?.length) return null;
  const latestIdx = 0;

  return (
    <Reveal className="mt-6">
      <Card>
        <CardHead title="Who owns this company" sub="quarterly shareholding pattern, as disclosed"
          right={<Chip>{h.periods[latestIdx]}</Chip>} />
        <div className="px-5 py-5">
          {/* One stacked bar for the latest quarter — the shape of the register
              at a glance, before the numbers underneath. */}
          <div className="flex h-6 w-full overflow-hidden border border-line">
            {h.rows.map((r, i) => {
              const v = r.values[latestIdx];
              if (!isNum(v) || v <= 0) return null;
              const shades = ["bg-ink", "bg-ink/70", "bg-ink/50", "bg-ink/35", "bg-ink/22", "bg-ink/12"];
              return (
                <div key={r.key} title={`${r.label} ${plainPct(v)}`} style={{ width: `${v}%` }}
                  className={`${shades[i % shades.length]} transition-opacity hover:opacity-80`} />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {h.rows.map((r, i) => {
              const v = r.values[latestIdx];
              if (!isNum(v) || v <= 0) return null;
              const shades = ["bg-ink", "bg-ink/70", "bg-ink/50", "bg-ink/35", "bg-ink/22", "bg-ink/12"];
              return (
                <span key={r.key} className="flex items-center gap-1.5 text-[11.5px] text-ink-dim">
                  <i className={`inline-block h-2.5 w-2.5 ${shades[i % shades.length]}`} />
                  {r.label} <b className="text-ink tnum">{plainPct(v)}</b>
                </span>
              );
            })}
          </div>
        </div>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                <th className="border-b border-line px-4 py-2.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">Holder</th>
                {h.periods.map((p) => (
                  <th key={p} className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">{p}</th>
                ))}
                <th className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">Change</th>
              </tr>
            </thead>
            <tbody>
              {h.rows.map((r) => {
                const now = r.values[0], then = r.values[r.values.length - 1];
                const delta = isNum(now) && isNum(then) ? now - then : null;
                return (
                  <tr key={r.key} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 text-ink-dim">{r.label}</td>
                    {r.values.map((v, i) => (
                      <td key={i} className="whitespace-nowrap px-4 py-2 text-right tnum">{plainPct(v, 2)}</td>
                    ))}
                    <td className={`whitespace-nowrap px-4 py-2 text-right tnum ${tone(delta)}`}>
                      {isNum(delta) ? `${delta > 0 ? "+" : ""}${nf(delta, 2)} pp` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
          Change compares the most recent disclosed quarter with the oldest shown, in percentage points. A rising
          promoter stake and a rising institutional stake mean different things — the first is usually a signal about
          confidence, the second about flows.
        </div>
      </Card>
    </Reveal>
  );
}

/* --------------------------------- peers ---------------------------------- */
function Peers({ pg, symbol }: { pg: NonNullable<Row>; symbol: string }) {
  const rows: Row[] = pg.rows ?? [];
  if (rows.length < 2) return null;
  const m = pg.medians ?? {};

  const cols: [string, string, (r: Row) => string, ((r: Row) => unknown) | null][] = [
    ["price", "CMP", (r) => inr(r.price), null],
    ["change1d", "Today", (r) => pct(r.change1d, 2), (r) => r.change1d],
    ["marketCapCr", "Market cap", (r) => crore(r.marketCapCr), null],
    ["pe", "P/E", (r) => (r.pe > 0 ? `${nf(r.pe)}×` : "—"), null],
    ["pb", "P/B", (r) => (r.pb > 0 ? `${nf(r.pb)}×` : "—"), null],
    ["roe", "ROE", (r) => plainPct(r.roe), null],
    ["roce", "ROCE", (r) => plainPct(r.roce), null],
    ["profitMarginPct", "Net margin", (r) => plainPct(r.profitMarginPct), null],
    ["dividendYieldPct", "Yield", (r) => plainPct(r.dividendYieldPct, 2), null],
    ["ret1y", "1-year", (r) => pct(r.ret1y), (r) => r.ret1y],
  ];

  return (
    <Reveal className="mt-6">
      <Card>
        <CardHead title={`How it compares in ${pg.name}`}
          sub="the listed companies in the same sub-sector, with the sub-sector median on the last row"
          right={<Chip>{pg.count} companies</Chip>} />
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-line bg-paper-2 px-4 py-2.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">Company</th>
                {cols.map(([k, l]) => (
                  <th key={k} className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol}
                  className={`border-b border-line last:border-0 ${r.self ? "bg-ink/[0.055]" : "hover:bg-ink/[0.03]"}`}>
                  <td className={`sticky left-0 z-10 px-4 py-2.5 ${r.self ? "bg-paper-3" : "bg-paper-2"}`}>
                    {r.self ? (
                      <b className="text-[12.5px]">{r.name}</b>
                    ) : (
                      <Link to={`/company/${encodeURIComponent(r.symbol)}`} className="font-medium hover:text-accent">{r.name}</Link>
                    )}
                    <div className="font-mono text-[10px] text-ink-faint">{r.symbol}{r.self ? " · this company" : ""}</div>
                  </td>
                  {cols.map(([k, , get, tn]) => (
                    <td key={k} className={`whitespace-nowrap px-4 py-2.5 text-right tnum ${tn ? tone(tn(r)) : ""}`}>{get(r)}</td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-line-2 bg-paper-3 font-semibold">
                <td className="sticky left-0 z-10 bg-paper-3 px-4 py-2.5">Sub-sector median</td>
                {cols.map(([k, , get]) => (
                  <td key={k} className="whitespace-nowrap px-4 py-2.5 text-right tnum">
                    {m[k] !== undefined && m[k] !== null ? get(m) : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
          Medians exclude non-positive multiples: a company losing money has no meaningful P/E, and including a
          negative one would make an expensive peer group look cheap. Every price here is the same {" "}
          {rows[0]?.date ? `${rows[0].date} ` : ""}NSE close used everywhere else on the page.
        </div>
      </Card>
    </Reveal>
  );
}

/* ---------------------------------- page ---------------------------------- */
export default function Company() {
  const { symbol = "" } = useParams();
  const { data, loading, error } = useStocks();
  const detail = useStock(symbol);
  const sectors = useSectors();
  const [tf, setTf] = useState<"daily" | "weekly">("daily");

  const row = useMemo(() => data?.rows.find((r) => r.symbol === symbol) ?? null, [data, symbol]);
  const d = detail.data;

  if (error) return <ErrorNote error={error} />;
  if (loading) return <div className="space-y-4 pt-12"><Skeleton className="h-12 w-80" /><Skeleton className="h-[380px]" /></div>;
  if (!row) return (
    <Card className="mt-16 p-8">
      <div className="text-[14px] text-ink-dim">
        No company called <b className="text-ink">{symbol}</b> in this build.{" "}
        <Link to="/stocks" className="text-accent underline">Browse every company</Link>.
      </div>
    </Card>
  );

  const bars = tf === "daily" ? d?.daily : d?.weekly;
  const s50 = tf === "daily" ? d?.dailySma50 : d?.weeklySma50;
  const s200 = tf === "daily" ? d?.dailySma200 : d?.weeklySma200;

  const secKey = d?.sectorKey;
  const pulse = secKey ? sectors.data?.pulse[secKey] : undefined;
  const policy = secKey ? sectors.data?.policy[secKey] : undefined;
  const secName = secKey ? sectors.data?.names[secKey] : undefined;

  const position: [string, string, string][] = [];
  if (row.peerRankByCap && row.peerCount)
    position.push(["Size rank", `#${row.peerRankByCap} of ${row.peerCount}`, `by market cap in ${row.industry || "its sub-sector"}`]);
  if (isNum(row.sectorCapSharePct))
    position.push(["Share of sub-sector", plainPct(row.sectorCapSharePct), "of the listed value in its sub-sector"]);
  if (isNum(row.revenueCr))
    position.push(["Revenue", crore(row.revenueCr), isNum(row.profitMarginPct) ? `${plainPct(row.profitMarginPct)} net margin` : "latest reported"]);
  if (isNum(row.employees) && row.employees > 0)
    position.push(["Employees", Number(row.employees).toLocaleString("en-IN"),
      isNum(row.revenueCr) ? `₹${nf((row.revenueCr / row.employees) * 1e7 / 1e5, 1)} L revenue each` : ""]);

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
                <Chip tone="accent">{row.symbol}</Chip>
                {row.nseTier && <Chip>{row.nseTier}</Chip>}
                {row.hasDeepData && <Chip>filed statements</Chip>}
                {d?.isin && <span className="font-mono text-[10px] text-ink-faint">ISIN {d.isin}</span>}
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

      {row.corpActionGap && (
        <Card className="mb-5 border-warn">
          <div className="px-5 py-3.5 text-[12.5px] leading-relaxed text-ink-dim">
            <b className="text-warn">Note:</b> the price series steps sharply on {row.corpActionGap}. That is a
            corporate action — a split, bonus or demerger — so returns spanning that date are not meaningful.
          </div>
        </Card>
      )}

      <Reveal>
        <Card>
          <CardHead title="Price"
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
            } />
          <div className="px-5 py-4">
            {bars && s50 && s200
              ? <CandleChart bars={bars} sma50={s50} sma200={s200} weekly={tf === "weekly"} />
              : <Skeleton className="h-[380px]" />}
            <div className="mt-3 flex flex-wrap gap-4 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-faint">
              <span><i className="mr-1.5 inline-block h-0.5 w-3.5 align-middle bg-up" />up</span>
              <span><i className="mr-1.5 inline-block h-0.5 w-3.5 align-middle bg-down" />down</span>
              <span><i className="mr-1.5 inline-block h-0 w-3.5 align-middle border-t-2 border-dashed border-ink-dim" />50-DMA</span>
              <span><i className="mr-1.5 inline-block h-0.5 w-3.5 align-middle bg-ink-faint" />200-DMA</span>
              <span className="normal-case tracking-normal text-ink-dim">hover any candle for its open, high, low, close and volume</span>
            </div>
          </div>
        </Card>
      </Reveal>

      <Stagger className="mt-6 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4" gap={0.04}>
        {[
          ["Market cap", crore(row.marketCapCr), row.nseTier ?? ""],
          ["52-week range", `${inr(row.low52w)} – ${inr(row.high52w)}`, `${pct(row.pctFrom52wHigh)} from high`],
          ["1-year", pct(row.ret1y), `3-month ${pct(row.ret3m)}`],
          ["Stage", `${row.stage ?? "—"} · ${row.stageName ?? "—"}`, `RSI ${nf(row.rsi14 ?? 0, 0)} · ADX ${nf(row.adx14 ?? 0, 0)}`],
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
                        <td className="px-4 py-2 text-ink-dim" title={m.h}>{m.l}</td>
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

      {d?.deep?.statements && <Financials st={d.deep.statements} />}
      {d?.peerGroup && <Peers pg={d.peerGroup} symbol={symbol} />}
      {d?.deep?.holdings && <Shareholding h={d.deep.holdings} />}

      {(d?.products?.length || position.length || d?.description) && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="Products & market position"
              right={d?.products?.length ? <Chip tone="accent">researched</Chip> : undefined} />
            {position.length > 0 && (
              <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
                {position.map(([l, v, s]) => (
                  <div key={l} className="bg-paper-2 px-4 py-3.5">
                    <Label>{l}</Label>
                    <div className="mt-1.5 text-[17px] font-bold tracking-tight tnum">{v}</div>
                    {s && <div className="mt-0.5 text-[11px] text-ink-dim">{s}</div>}
                  </div>
                ))}
              </div>
            )}
            {d?.products?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr>
                      {["Product", "What it is", "Position"].map((h, i) => (
                        <th key={h} className={`border-b border-line px-4 py-2.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint ${i === 2 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.products.map(([nm, share, what]) => (
                      <tr key={nm} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5 font-semibold">{nm}</td>
                        <td className="max-w-[520px] px-4 py-2.5 text-ink-dim">{what}</td>
                        <td className="px-4 py-2.5 text-right">{share || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {d?.description && (
              <div className="border-t border-line px-5 py-4">
                <Label className="mb-2">What it sells, in the company's own words</Label>
                <p className="text-[12.5px] leading-relaxed text-ink-dim">{d.description}</p>
              </div>
            )}
            <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
              {d?.products?.length ? "The product table is hand-researched. " : ""}
              Position is measured, not asserted: rank and share are computed from the market capitalisation of every
              listed company in this sub-sector. A share of listed value is not a share of revenue — product-level
              market shares are not published consistently across the market, so none are claimed here.
            </div>
          </Card>
        </Reveal>
      )}

      {pulse && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title={`Industry pulse — ${secName}`} sub="how this sector makes money, and what breaks it"
              right={<Chip>{row.industry || row.sector}</Chip>} />
            <div className="px-5 py-4">
              <p className="mb-4 max-w-[95ch] text-[13px] leading-relaxed text-ink-dim">{pulse.outlook}</p>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <Label className="mb-2.5">What drives it</Label>
                  <Bullets items={pulse.drivers ?? []} />
                </div>
                <div>
                  <Label className="mb-2.5">What breaks it</Label>
                  <Bullets items={pulse.risks ?? []} />
                </div>
              </div>
            </div>
          </Card>
        </Reveal>
      )}

      {policy && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="Government support & budget provisions" right={<Chip>{secName}</Chip>} />
            <div className="grid gap-6 px-5 py-4 md:grid-cols-2">
              <div>
                <Label className="mb-2.5">Schemes &amp; policy</Label>
                <Bullets items={policy.schemes ?? []} />
              </div>
              <div>
                <Label className="mb-2.5">In the Budget</Label>
                <Bullets items={policy.budget ?? []} />
              </div>
            </div>
            {sectors.data?.caveat && (
              <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">{sectors.data.caveat}</div>
            )}
          </Card>
        </Reveal>
      )}

      {d?.deep?.corporateActions?.length ? (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="Corporate actions" sub="dividends, splits and bonuses on record" />
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr>
                    {["Type", "Ex-date", "Detail", "Announced"].map((h) => (
                      <th key={h} className="border-b border-line px-4 py-2.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.deep.corporateActions.map((a, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5">{a.type}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tnum text-ink-dim">{a.date}</td>
                      <td className="px-4 py-2.5 text-ink-dim">{a.detail}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tnum text-ink-faint">{a.announced ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Reveal>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-5 text-[12.5px]">
        <Link to="/stocks" className="text-accent underline">← Every company</Link>
        <Link to="/screener" className="text-accent underline">Screen the market</Link>
        {d?.website && <a href={d.website} rel="noopener noreferrer" target="_blank" className="text-ink-dim underline hover:text-ink">Company website ↗</a>}
      </div>
    </>
  );
}
