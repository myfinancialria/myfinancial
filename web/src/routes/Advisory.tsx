import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStocks } from "../lib/useData";
import { Card, CardHead, Chip, Label, ErrorNote, Skeleton, Tile } from "../components/ui";
import { Reveal } from "../components/motion";
import { crore, inr, isNum, nf, pct, plainPct, tone } from "../lib/format";
import type { Row } from "../lib/data";

/* ---------------------------------------------------------------------------
   Advisory & Signals — rule-based screens over the published market data.

   Every screen shows the numbers that got a row in, because a signal you
   cannot interrogate is just an assertion. The rules are the same ones the
   static advisory page runs; this is the same logic with a table you can sort
   and a row you can click through to the company.
--------------------------------------------------------------------------- */

type Col = { label: string; get: (r: Row) => string; sort?: (r: Row) => number; tone?: (r: Row) => unknown };

interface Screen {
  id: string; label: string; blurb: string;
  rows: (all: Row[]) => Row[];
  cols: Col[];
  empty: string;
}

const NIFTY_LOT = 75;

const SCREENS: Screen[] = [
  {
    id: "quality",
    label: "Quality at a fair price",
    blurb:
      "Companies earning well above their cost of capital, carrying little debt, trending above their 200-day average — and still not priced above their own sub-sector. Every clause has to hold at once.",
    rows: (all) => all.filter((r) =>
      r.roe >= 15 && r.roce >= 15 && r.profitMarginPct >= 8
      && (r.liabilitiesToEquity === null || r.liabilitiesToEquity <= 1.5)
      && r.peVsPeers !== null && r.peVsPeers <= 0
      && r.aboveSma200 === true && r.avgTurnoverCr >= 5,
    ).sort((a, b) => b.roce - a.roce).slice(0, 40),
    cols: [
      { label: "ROCE", get: (r) => plainPct(r.roce), sort: (r) => r.roce },
      { label: "ROE", get: (r) => plainPct(r.roe), sort: (r) => r.roe },
      { label: "Net margin", get: (r) => plainPct(r.profitMarginPct), sort: (r) => r.profitMarginPct },
      { label: "P/E", get: (r) => (isNum(r.pe) ? `${nf(r.pe)}×` : "—"), sort: (r) => r.pe },
      { label: "vs sub-sector", get: (r) => pct(r.peVsPeers, 0), sort: (r) => r.peVsPeers, tone: (r) => -r.peVsPeers },
      { label: "Liab/Equity", get: (r) => (isNum(r.liabilitiesToEquity) ? `${nf(r.liabilitiesToEquity)}×` : "—"), sort: (r) => r.liabilitiesToEquity },
      { label: "Market cap", get: (r) => crore(r.marketCapCr), sort: (r) => r.marketCapCr },
      { label: "1-year", get: (r) => pct(r.ret1y), sort: (r) => r.ret1y, tone: (r) => r.ret1y },
    ],
    empty: "Nothing passes every rule today. That happens in stretched markets — it is information, not a fault.",
  },
  {
    id: "swing",
    label: "Swing setups",
    blurb:
      "Two setups, both needing a confirmed Stage 2 advance and real liquidity: a pullback toward the 50-day with RSI reset, or a breakout pressing the 52-week high on expanding volume. Levels are scaled to each share's own ATR, so the risk fits how much that stock actually moves.",
    rows: (all) => {
      const base = all.filter((r) => r.stage === 2 && r.avgTurnoverCr >= 5 && r.atr14 > 0 && r.adx14 >= 18);
      const out: Row[] = [];
      for (const r of base) {
        let kind: string | null = null;
        if (isNum(r.pctFromSma50) && r.pctFromSma50 >= -6 && r.pctFromSma50 <= 2 && r.rsi14 >= 38 && r.rsi14 <= 58) kind = "Pullback to the 50-day";
        else if (r.pctFrom52wHigh >= -3 && r.volumeRatio >= 1.5) kind = "Breakout on volume";
        if (!kind) continue;
        const entry = r.price, stop = entry - 1.5 * r.atr14, target = entry + 3 * r.atr14;
        out.push({ ...r, kind, entry, stop, target, riskPct: ((entry - stop) / entry) * 100 });
      }
      return out.sort((a, b) => b.rsRank1y - a.rsRank1y).slice(0, 40);
    },
    cols: [
      { label: "Setup", get: (r) => r.kind },
      { label: "Entry", get: (r) => inr(r.entry), sort: (r) => r.entry },
      { label: "Stop", get: (r) => inr(r.stop), sort: (r) => r.stop },
      { label: "Target", get: (r) => inr(r.target), sort: (r) => r.target },
      { label: "Risk", get: (r) => plainPct(r.riskPct), sort: (r) => r.riskPct },
      { label: "R:R", get: () => "2.0" },
      { label: "RSI", get: (r) => nf(r.rsi14, 0), sort: (r) => r.rsi14 },
      { label: "ADX", get: (r) => nf(r.adx14, 0), sort: (r) => r.adx14 },
    ],
    empty: "No setups qualify today.",
  },
  {
    id: "momentum",
    label: "Momentum leaders",
    blurb:
      "The strongest tenth of the market by one-year relative strength, still in a Stage 2 advance and within 15% of its own 52-week high. Delivery percentage is shown because leadership backed by delivery is a different thing from leadership backed by intraday churn.",
    rows: (all) => all.filter((r) =>
      r.rsRank1y >= 90 && r.stage === 2 && r.avgTurnoverCr >= 5 && r.pctFrom52wHigh >= -15,
    ).sort((a, b) => b.rsRank1y - a.rsRank1y).slice(0, 40),
    cols: [
      { label: "RS rank", get: (r) => nf(r.rsRank1y, 0), sort: (r) => r.rsRank1y },
      { label: "1-year", get: (r) => pct(r.ret1y), sort: (r) => r.ret1y, tone: (r) => r.ret1y },
      { label: "3-month", get: (r) => pct(r.ret3m), sort: (r) => r.ret3m, tone: (r) => r.ret3m },
      { label: "From 52w high", get: (r) => pct(r.pctFrom52wHigh), sort: (r) => r.pctFrom52wHigh, tone: (r) => r.pctFrom52wHigh },
      { label: "vs 200-DMA", get: (r) => pct(r.pctFromSma200), sort: (r) => r.pctFromSma200, tone: (r) => r.pctFromSma200 },
      { label: "Delivery", get: (r) => plainPct(r.avgDeliveryPct20, 0), sort: (r) => r.avgDeliveryPct20 },
      { label: "Turnover", get: (r) => `₹${nf(r.avgTurnoverCr, 0)} cr`, sort: (r) => r.avgTurnoverCr },
    ],
    empty: "No leaders qualify today.",
  },
  {
    id: "income",
    label: "Dividend income",
    blurb:
      "Yield above 2% from companies that actually earn it: a return on equity of at least 10%, a positive and unstretched P/E, and enough turnover to get out of. Payout ratio is shown so you can see whether the dividend is covered.",
    rows: (all) => all.filter((r) =>
      r.dividendYieldPct >= 2 && r.roe >= 10 && r.pe > 0 && r.pe <= 30 && r.avgTurnoverCr >= 2,
    ).sort((a, b) => b.dividendYieldPct - a.dividendYieldPct).slice(0, 40),
    cols: [
      { label: "Yield", get: (r) => plainPct(r.dividendYieldPct, 2), sort: (r) => r.dividendYieldPct },
      { label: "Dividend/share", get: (r) => inr(r.dividendPerShare), sort: (r) => r.dividendPerShare },
      { label: "Payout", get: (r) => plainPct(r.payoutRatioPct, 0), sort: (r) => r.payoutRatioPct },
      { label: "P/E", get: (r) => (isNum(r.pe) ? `${nf(r.pe)}×` : "—"), sort: (r) => r.pe },
      { label: "ROE", get: (r) => plainPct(r.roe), sort: (r) => r.roe },
      { label: "1-year", get: (r) => pct(r.ret1y), sort: (r) => r.ret1y, tone: (r) => r.ret1y },
    ],
    empty: "No qualifying dividend payers today.",
  },
];

function ScreenTable({ screen, all }: { screen: Screen; all: Row[] }) {
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const base = useMemo(() => screen.rows(all), [screen, all]);

  const rows = useMemo(() => {
    if (!sort) return base;
    const col = screen.cols[sort.i];
    if (!col?.sort) return base;
    return [...base].sort((a, b) => {
      const av = col.sort!(a), bv = col.sort!(b);
      const an = isNum(av), bn = isNum(bv);
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return (av - bv) * sort.dir;
    });
  }, [base, sort, screen]);

  if (!rows.length) {
    return (
      <Card className="mt-5 p-7">
        <div className="text-[13px] leading-relaxed text-ink-dim">{screen.empty}</div>
      </Card>
    );
  }

  return (
    <Card className="mt-5">
      <CardHead
        title={screen.label}
        sub={screen.blurb}
        right={<Chip tone="accent">{rows.length} {rows.length === 1 ? "match" : "matches"}</Chip>}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-line bg-paper-2 px-4 py-2.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                Company
              </th>
              {screen.cols.map((c, i) => (
                <th key={c.label}
                  onClick={() => c.sort && setSort((s) => (s?.i === i ? { i, dir: (s.dir * -1) as 1 | -1 } : { i, dir: -1 }))}
                  className={`whitespace-nowrap border-b border-line px-4 py-2.5 text-right font-mono text-[9.5px] font-medium uppercase tracking-[0.14em]
                    ${c.sort ? "cursor-pointer text-ink-faint hover:text-ink" : "text-ink-faint"}`}>
                  {c.label}{sort?.i === i ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="border-b border-line last:border-0 hover:bg-ink/[0.035]">
                <td className="sticky left-0 z-10 bg-paper-2 px-4 py-2.5">
                  <Link to={`/company/${encodeURIComponent(r.symbol)}`} className="font-semibold hover:text-accent">
                    {r.name}
                  </Link>
                  <div className="font-mono text-[10px] text-ink-faint">
                    {r.symbol}{r.industry ? ` · ${r.industry}` : ""}
                  </div>
                </td>
                {screen.cols.map((c) => (
                  <td key={c.label} className={`whitespace-nowrap px-4 py-2.5 text-right tnum ${c.tone ? tone(c.tone(r)) : ""}`}>
                    {c.get(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------- hedge sizer ------------------------------ */
function Hedge() {
  const [value, setValue] = useState(5000000);
  const [beta, setBeta] = useState(1.0);
  const exposure = value * beta;

  return (
    <Card className="mt-5">
      <CardHead title="Hedge sizer" sub="How much NIFTY notional neutralises a portfolio of this size and beta" />
      <div className="grid gap-4 border-b border-line px-5 py-4 sm:grid-cols-2">
        <label className="block">
          <Label>Portfolio value (₹)</Label>
          <input type="number" value={value} onChange={(e) => setValue(Number(e.target.value || 0))}
            className="mt-1.5 w-full border border-line-2 bg-paper px-3 py-2 text-[13px] tnum outline-none focus:border-ink" />
        </label>
        <label className="block">
          <Label>Portfolio beta to NIFTY</Label>
          <input type="number" step="0.05" value={beta} onChange={(e) => setBeta(Number(e.target.value || 0))}
            className="mt-1.5 w-full border border-line-2 bg-paper px-3 py-2 text-[13px] tnum outline-none focus:border-ink" />
        </label>
      </div>

      {value > 0 && beta > 0 ? (
        <>
          <div className="px-5 py-4 text-[13px] leading-relaxed text-ink-dim">
            A portfolio of <b className="text-ink tnum">{inr(value)}</b> with a beta of <b className="text-ink tnum">{nf(beta)}</b> behaves
            like <b className="text-ink tnum">{inr(exposure)}</b> of index exposure. One NIFTY lot is {NIFTY_LOT} units, so
            the number of lots depends on where the index is trading:
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  {["Index level", "Notional per lot", "Lots to neutralise", "Rounded"].map((h, i) => (
                    <th key={h} className={`border-b border-line px-4 py-2.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint ${i ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[24000, 25000, 26000].map((idx) => {
                  const perLot = idx * NIFTY_LOT;
                  const lots = exposure / perLot;
                  return (
                    <tr key={idx} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">NIFTY at {idx.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2.5 text-right tnum">{inr(perLot)}</td>
                      <td className="px-4 py-2.5 text-right tnum">{nf(lots)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tnum">{Math.round(lots)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
            A full hedge gives up the upside as well as the downside, and costs margin plus roll. Partial hedges
            (a third to a half) are the more common choice around a known event. Beta drifts, so a hedge sized
            today is approximate tomorrow.
          </div>
        </>
      ) : (
        <div className="px-5 py-7 text-[13px] text-ink-dim">Enter a portfolio value and beta above.</div>
      )}
    </Card>
  );
}

/* ---------------------------------- page ---------------------------------- */
export default function Advisory() {
  const { data, loading, error } = useStocks();
  const [params, setParams] = useSearchParams();
  const tab = params.get("screen") ?? "quality";

  const counts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const s of SCREENS) out[s.id] = s.rows(data.rows).length;
    return out;
  }, [data]);

  if (error) return <ErrorNote error={error} />;

  const active = SCREENS.find((s) => s.id === tab);

  return (
    <>
      <section className="pt-12 pb-4">
        <Reveal>
          <Label className="mb-3">Advisory &amp; signals</Label>
          <h1 className="text-[clamp(1.9rem,4.2vw,3rem)] font-extrabold leading-[1.03] tracking-[-0.04em]">
            Rules, run over the <em className="font-serif font-normal italic tracking-tight">whole market</em>.
          </h1>
          <p className="mt-3 max-w-[78ch] text-[14px] leading-relaxed text-ink-dim">
            Four screens and a hedge calculator, computed in your browser from the same NSE closes, filed
            fundamentals and delivery data everything else here uses. Each row shows the figures that got it in,
            so you can disagree with the rule rather than trust the output.
          </p>
        </Reveal>
      </section>

      {loading && <div className="space-y-3 pt-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-[420px] w-full" /></div>}

      {data && (
        <>
          <Reveal delay={0.05}>
            <div className="flex flex-wrap gap-2 border-b border-line pb-4">
              {[...SCREENS.map((s) => ({ id: s.id, label: s.label, n: counts[s.id] })), { id: "hedge", label: "Hedge sizer", n: undefined }].map((t) => (
                <button key={t.id} onClick={() => setParams(t.id === "quality" ? {} : { screen: t.id }, { replace: true })}
                  className={`border px-3.5 py-2 text-[12px] transition-colors
                    ${tab === t.id ? "border-ink bg-ink text-paper font-semibold" : "border-line-2 text-ink-dim hover:border-ink hover:text-ink"}`}>
                  {t.label}
                  {t.n !== undefined && <span className={`ml-2 font-mono text-[10px] ${tab === t.id ? "opacity-70" : "text-ink-faint"}`}>{t.n}</span>}
                </button>
              ))}
            </div>
          </Reveal>

          {tab === "hedge" ? <Hedge /> : active ? <ScreenTable screen={active} all={data.rows} /> : null}

          <div className="mt-6 grid gap-px bg-line sm:grid-cols-3">
            <Tile label="Universe screened" value={data.count.toLocaleString("en-IN")} sub="listed NSE companies" />
            <Tile label="Priced at" value={data.priceDate ?? "—"} sub="official NSE bhavcopy close" />
            <Tile label="Screens" value={`${SCREENS.length}`} sub="each with its rules stated in full" />
          </div>

          <p className="mt-6 max-w-[80ch] text-[11.5px] leading-relaxed text-ink-faint">
            These are screens, not recommendations. A rule that selects well over one market regime can select
            badly over the next, and none of this accounts for your tax position, your existing holdings or what
            you need the money for. Educational research only — not investment advice under SEBI (Investment
            Advisers) Regulations, 2013.
          </p>
        </>
      )}
    </>
  );
}
