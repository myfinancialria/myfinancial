// ---------------------------------------------------------------------------
// cas_analysis.mjs — what the statement actually tells you.
//
// The parser gives folios, schemes and transactions. This turns them into the
// four things a holder wants to know and a CAS never says outright:
//
//   what it cost, what it is worth, and the return that reconciles the two
//   where the money actually sits, once funds are seen through to their holdings
//   which of your funds are the same bet twice
//   what you paid the industry to hold it
//
// Pure and deterministic, so it is testable and runs in the browser next to
// the statement without either leaving the machine.
// ---------------------------------------------------------------------------

import { isExternalFlow } from "./cas.mjs";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r2 = (x, d = 2) => (isNum(x) ? Number(x.toFixed(d)) : null);

/* ---------------------------------- XIRR ---------------------------------- */
/**
 * The annualised return that makes a set of dated cashflows sum to zero.
 *
 * This is the only honest way to compare a fund you drip-fed monthly with one
 * you bought in a lump: it weights every rupee by how long it was invested.
 * Newton's method with a bisection fallback, because Newton alone diverges on
 * the ugly cashflow shapes real portfolios produce.
 */
export function xirr(flows, { guess = 0.1, tol = 1e-7, maxIter = 100 } = {}) {
  const cf = (flows ?? []).filter((f) => isNum(f.amount) && f.date).map((f) => ({ ...f, t: Date.parse(f.date) }));
  if (cf.length < 2) return null;
  if (!cf.some((f) => f.amount > 0) || !cf.some((f) => f.amount < 0)) return null;  // needs both signs

  const t0 = Math.min(...cf.map((f) => f.t));
  const years = (t) => (t - t0) / (365.25 * 86_400_000);
  const npv = (r) => cf.reduce((a, f) => a + f.amount / (1 + r) ** years(f.t), 0);

  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    const f = npv(rate);
    if (Math.abs(f) < tol) return r2(rate * 100);
    const d = (npv(rate + 1e-6) - f) / 1e-6;
    if (!isNum(d) || Math.abs(d) < 1e-12) break;
    const next = rate - f / d;
    if (!isNum(next) || next <= -0.999999) break;
    if (Math.abs(next - rate) < tol) return r2(next * 100);
    rate = next;
  }
  // Newton wandered off; bracket it instead.
  let lo = -0.9999, hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  const out = (lo + hi) / 2;
  return Math.abs(npv(out)) < 1 ? r2(out * 100) : null;
}

/** Cashflows as the investor experienced them: money out negative, value in positive. */
export function schemeCashflows(scheme, asOf) {
  const flows = [];
  for (const t of scheme.transactions ?? []) {
    if (!isExternalFlow(t.type) || !isNum(t.amount)) continue;
    // A purchase is money leaving the investor; a redemption or payout returns it.
    const out = t.type === "PURCHASE" || t.type === "PURCHASE_SIP";
    flows.push({ date: t.date, amount: out ? -Math.abs(t.amount) : Math.abs(t.amount) });
  }
  const value = isNum(scheme.valuation) ? scheme.valuation
    : isNum(scheme.close) && isNum(scheme.nav) ? scheme.close * scheme.nav : null;
  if (isNum(value) && value > 0) flows.push({ date: asOf ?? scheme.valuationDate ?? scheme.navDate, amount: value });
  return flows;
}

/* -------------------------------- summarise ------------------------------- */
export function analyse(cas, { funds = new Map(), holdings = new Map() } = {}) {
  const asOf = cas?.statement?.to ?? null;
  const schemes = [];

  for (const folio of cas?.folios ?? []) {
    for (const s of folio.schemes ?? []) {
      const units = isNum(s.close) ? s.close : null;
      const value = isNum(s.valuation) ? s.valuation
        : isNum(units) && isNum(s.nav) ? r2(units * s.nav) : null;
      const invested = (s.transactions ?? [])
        .filter((t) => t.type === "PURCHASE" || t.type === "PURCHASE_SIP")
        .reduce((a, t) => a + Math.abs(t.amount ?? 0), 0);
      const withdrawn = (s.transactions ?? [])
        .filter((t) => t.type === "REDEMPTION" || t.type === "DIVIDEND_PAYOUT")
        .reduce((a, t) => a + Math.abs(t.amount ?? 0), 0);
      const cost = isNum(s.cost) ? s.cost : null;

      // The fund universe knows this scheme by ISIN; that unlocks its category,
      // its published returns and — where we have it — what it actually holds.
      const ref = s.isin ? funds.get(s.isin) : null;

      schemes.push({
        folio: folio.folio, amc: folio.amc ?? s.amc, name: s.name, isin: s.isin,
        units, nav: s.nav, navDate: s.navDate, value, cost,
        invested: r2(invested), withdrawn: r2(withdrawn),
        gain: isNum(value) && isNum(cost) ? r2(value - cost) : null,
        gainPct: isNum(value) && isNum(cost) && cost > 0 ? r2(((value - cost) / cost) * 100) : null,
        xirr: xirr(schemeCashflows(s, asOf)),
        transactions: (s.transactions ?? []).length,
        category: ref?.category ?? null, categoryGroup: ref?.categoryGroup ?? null,
        schemeCode: ref?.code ?? null, matched: !!ref,
      });
    }
  }

  const total = (k) => r2(schemes.reduce((a, s) => a + (s[k] ?? 0), 0));
  const value = total("value"), cost = total("cost"), invested = total("invested");

  // One XIRR for the whole book, from every external flow across every scheme.
  const allFlows = [];
  for (const folio of cas?.folios ?? []) {
    for (const s of folio.schemes ?? []) allFlows.push(...schemeCashflows(s, asOf));
  }

  /* ---- where the money sits ---- */
  const byGroup = new Map();
  for (const s of schemes) {
    const g = s.categoryGroup ?? "Unclassified";
    byGroup.set(g, r2((byGroup.get(g) ?? 0) + (s.value ?? 0)));
  }
  const allocation = [...byGroup.entries()]
    .map(([group, v]) => ({ group, value: v, pct: value ? r2((v / value) * 100) : null }))
    .sort((a, b) => b.value - a.value);

  /* ---- see the funds through to the shares ---- */
  const lookThrough = new Map();
  let covered = 0;
  for (const s of schemes) {
    const h = s.schemeCode ? holdings.get(String(s.schemeCode)) : null;
    if (!h?.holdings?.length || !isNum(s.value)) continue;
    covered += s.value;
    for (const x of h.holdings) {
      if (!x.symbol || !isNum(x.pct)) continue;
      const cur = lookThrough.get(x.symbol) ?? { symbol: x.symbol, name: x.name, sector: x.sector, value: 0, funds: new Set() };
      cur.value += (s.value * x.pct) / 100;
      cur.funds.add(s.name);
      lookThrough.set(x.symbol, cur);
    }
  }
  const stocks = [...lookThrough.values()]
    .map((x) => ({ symbol: x.symbol, name: x.name, sector: x.sector, value: r2(x.value), funds: x.funds.size,
                   pctOfPortfolio: value ? r2((x.value / value) * 100) : null }))
    .sort((a, b) => b.value - a.value);

  return {
    asOf,
    totals: {
      schemes: schemes.length, folios: (cas?.folios ?? []).length,
      value, cost, invested, withdrawn: total("withdrawn"),
      gain: isNum(value) && isNum(cost) ? r2(value - cost) : null,
      gainPct: isNum(value) && isNum(cost) && cost > 0 ? r2(((value - cost) / cost) * 100) : null,
      xirr: xirr(allFlows),
      matched: schemes.filter((s) => s.matched).length,
    },
    schemes: schemes.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    allocation,
    lookThrough: {
      coveredValue: r2(covered),
      coveragePct: value ? r2((covered / value) * 100) : null,
      stocks: stocks.slice(0, 40),
      distinct: stocks.length,
    },
  };
}
