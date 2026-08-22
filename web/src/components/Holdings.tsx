import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Card, CardHead, Chip, Label, Button } from "./ui";
import { Reveal } from "./motion";
import { inr, isNum, nf, plainPct } from "../lib/format";
import type { SchemeHoldings, Holding } from "../lib/data";

/* ---------------------------------------------------------------------------
   What a scheme actually owns, and which other schemes own the same thing.

   Sourced from the AMC's own SEBI-mandated portfolio disclosure. The date
   shown is the date the portfolio was HELD, not the date it was published —
   the gap is up to ten days, and the freshness note says so rather than
   letting the page imply this is live.
--------------------------------------------------------------------------- */

const SECTION_LABEL: Record<string, string> = {
  EQUITY: "Equity", DEBT: "Debt", MONEY_MARKET: "Money market", CASH: "Cash & equivalents",
  DERIVATIVE: "Derivatives", FUND_UNITS: "Fund units", FOREIGN: "Foreign", OTHER: "Other",
};

const daysSince = (iso: string) =>
  Math.max(0, Math.round((Date.now() - Date.parse(`${iso}T12:00:00Z`)) / 86_400_000));

/** Asset mix bar — where the money sits before you look at any single name. */
function Mix({ holdings }: { holdings: Holding[] }) {
  const mix = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of holdings) m.set(h.section, (m.get(h.section) ?? 0) + (h.pct ?? 0));
    return [...m.entries()].filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]);
  }, [holdings]);
  if (!mix.length) return null;
  const shades = ["bg-ink", "bg-ink/65", "bg-ink/45", "bg-ink/30", "bg-ink/18", "bg-ink/10"];

  return (
    <div className="px-5 py-4">
      <div className="flex h-5 w-full overflow-hidden border border-line">
        {mix.map(([k, v], i) => (
          <div key={k} title={`${SECTION_LABEL[k] ?? k} ${plainPct(v)}`} style={{ width: `${v}%` }}
            className={`${shades[i % shades.length]} transition-opacity hover:opacity-80`} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
        {mix.map(([k, v], i) => (
          <span key={k} className="flex items-center gap-1.5 text-[11.5px] text-ink-dim">
            <i className={`inline-block h-2.5 w-2.5 ${shades[i % shades.length]}`} />
            {SECTION_LABEL[k] ?? k} <b className="text-ink tnum">{plainPct(v)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Sector concentration across the equity sleeve. */
function Sectors({ holdings }: { holdings: Holding[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of holdings) {
      if (h.section !== "EQUITY") continue;
      const k = h.sector ?? h.industry ?? "Unclassified";
      m.set(k, (m.get(k) ?? 0) + (h.pct ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [holdings]);
  if (rows.length < 2) return null;
  const max = rows[0][1];

  return (
    <div className="border-t border-line px-5 py-4">
      <Label className="mb-3">Where the equity sits</Label>
      <div className="grid gap-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="truncate text-[12px] text-ink-dim">{k}</div>
              <div className="mt-1 h-1 bg-line">
                <motion.div className="h-1 bg-ink" initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
              </div>
            </div>
            <span className="text-[12px] font-semibold tnum">{plainPct(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Holdings({ h }: { h: SchemeHoldings }) {
  const [showAll, setShowAll] = useState(false);
  const [only, setOnly] = useState<"ALL" | "EQUITY">("EQUITY");

  const rows = useMemo(() => {
    const list = only === "EQUITY" ? h.holdings.filter((x) => x.section === "EQUITY") : h.holdings;
    return showAll ? list : list.slice(0, 25);
  }, [h.holdings, only, showAll]);

  const totalRows = only === "EQUITY" ? h.counts.equity : h.counts.total;
  const stale = daysSince(h.asOn);
  const top10 = h.holdings.filter((x) => x.section === "EQUITY").slice(0, 10).reduce((a, x) => a + (x.pct ?? 0), 0);

  return (
    <>
      <Reveal className="mt-6">
        <Card>
          <CardHead
            title="What this fund owns"
            sub={`Portfolio as held on ${h.asOn} · ${h.kind.toLowerCase()} disclosure`}
            right={
              <div className="flex items-center gap-2">
                {h.counts.equity > 0 && <Chip>{h.counts.equity} stocks</Chip>}
                <Chip tone={stale > 45 ? "warn" : "neutral"}>{stale} days old</Chip>
              </div>
            }
          />
          <Mix holdings={h.holdings} />
          <Sectors holdings={h.holdings} />

          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <div className="flex border border-line-2">
              {(["EQUITY", "ALL"] as const).map((t) => (
                <button key={t} onClick={() => { setOnly(t); setShowAll(false); }}
                  className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors
                    ${only === t ? "bg-ink text-paper font-semibold" : "text-ink-dim hover:text-ink"}`}>
                  {t === "EQUITY" ? "Stocks" : "Everything"}
                </button>
              ))}
            </div>
            {top10 > 0 && (
              <span className="text-[11.5px] text-ink-dim">
                Top 10 stocks are <b className="text-ink tnum">{plainPct(top10)}</b> of the fund
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  {["Holding", "Sector", "Value", "Weight"].map((c, i) => (
                    <th key={c} className={`border-b border-line px-4 py-2.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint ${i < 2 ? "text-left" : "text-right"}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((x, i) => (
                  <tr key={x.isin + i} className="border-b border-line last:border-0 hover:bg-ink/[0.03]">
                    <td className="px-4 py-2.5">
                      {x.symbol
                        ? <Link to={`/company/${encodeURIComponent(x.symbol)}`} className="font-medium hover:text-accent">{x.name}</Link>
                        : <span className="text-ink-dim">{x.name}</span>}
                      <div className="font-mono text-[9.5px] text-ink-faint">
                        {x.symbol ?? x.isin}{only === "ALL" ? ` · ${SECTION_LABEL[x.section] ?? x.section}` : ""}
                      </div>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-ink-dim">{x.sector ?? x.industry ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tnum text-ink-dim">
                      {isNum(x.valueLakh) ? inr(x.valueLakh / 100, 1) + " cr" : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tnum">{plainPct(x.pct, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalRows > rows.length && (
            <div className="flex justify-center border-t border-line px-5 py-3.5">
              <Button onClick={() => setShowAll(true)}>Show all {totalRows}</Button>
            </div>
          )}

          <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
            Filed by {h.amc} under SEBI's portfolio-disclosure requirement and parsed here — weights are the
            fund's own "% to net assets", not a reconstruction. {h.counts.mapped} of {h.counts.equity} stocks are
            matched to a listed NSE company and link through to it. Holdings are disclosed monthly, within ten
            days of month end, so this is a snapshot rather than a live position — and a fund knows the
            disclosure date, which is worth remembering when reading a month-end portfolio.
          </div>
        </Card>
      </Reveal>

      {h.nearest.length > 0 && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="Funds that own much the same thing"
              sub="Overlap is the share of each portfolio held in common — Σ min(weight here, weight there)"
              right={<Chip tone={h.nearest[0].pct > 60 ? "warn" : "neutral"}>{h.nearest.length} compared</Chip>} />
            <div className="divide-y divide-line">
              {h.nearest.map((n) => (
                <Link key={n.code} to={`/fund/${encodeURIComponent(n.code)}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-5 py-3 transition-colors hover:bg-ink/[0.03]">
                  <div className="w-[68px] text-right">
                    <span className="text-[16px] font-bold tnum">{plainPct(n.pct, 0)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">{n.name}</div>
                    <div className="mt-1 h-1 bg-line">
                      <motion.div className={`h-1 ${n.pct > 60 ? "bg-warn" : "bg-ink"}`}
                        initial={{ width: 0 }} animate={{ width: `${Math.min(100, n.pct)}%` }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
                    </div>
                    <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-faint">{n.amc}</div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
              If a fund holds 8% of a stock and another holds 5%, they duplicate 5% — the smaller side, not the
              sum. Two funds overlapping heavily are close to one position held twice, which is worth knowing
              before treating them as diversification. Only schemes with published disclosures are compared, so
              this is a floor: a fund not listed here may still overlap.
            </div>
          </Card>
        </Reveal>
      )}
    </>
  );
}
