// ---------------------------------------------------------------------------
// yfundamentals.js — REAL company fundamentals for NSE-listed stocks.
//
// Broker APIs (Upstox/FYERS) carry no fundamentals — they are trading/market-
// data APIs. This provider pulls genuine statements and ratios from Yahoo
// Finance's public quoteSummary API (symbol.NS), which requires a cookie +
// crumb handshake. Everything is normalised into the platform's own statement
// and ratio keys (₹ crore), disk-cached for 3 days, and overlaid onto the
// modelled engine wherever real values exist.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "..", "var", "yfund");
const TTL = 3 * 86400_000;
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" };
const CR = 1e7;                                    // ₹ → ₹ crore

let session = null;                                // { cookie, crumb, at }
let coolUntil = 0;                                 // exponential backoff on 429
let fails = 0;
let inFlight = 0;

/** ms remaining before Yahoo should be contacted again (0 = go ahead). */
export function cooldownMs() { return Math.max(0, coolUntil - Date.now()); }

async function getSession() {
  if (session && Date.now() - session.at < 30 * 60_000) return session;
  if (Date.now() < coolUntil) throw new Error(`yahoo: backing off ${Math.ceil(cooldownMs() / 60_000)}m`);
  try {
    const r1 = await fetch("https://fc.yahoo.com", { headers: UA, redirect: "manual" });
    const cookie = (r1.headers.get("set-cookie") || "").split(";")[0];
    if (!cookie) throw new Error("yahoo: no cookie");
    let crumb = null;
    for (const host of ["query1", "query2"]) {
      const r2 = await fetch(`https://${host}.finance.yahoo.com/v1/test/getcrumb`, { headers: { ...UA, cookie } });
      const t = (await r2.text()).trim();
      if (r2.ok && t && t.length <= 30 && !t.includes(" ")) { crumb = t; break; }
      if (r2.status === 429) continue;              // try the sibling host before giving up
    }
    if (!crumb) throw new Error("yahoo: rate limited (no crumb)");
    session = { cookie, crumb, at: Date.now() };
    fails = 0;
    return session;
  } catch (e) {
    fails++;
    coolUntil = Date.now() + Math.min(5 * 60_000 * 2 ** (fails - 1), 60 * 60_000);   // 5m → 60m cap
    throw e;
  }
}

const raw = (o) => (o && typeof o === "object" ? o.raw : o) ?? null;
const cr = (o) => { const v = raw(o); return v === null ? null : Math.round(v / CR); };
const pct = (o, d = 2) => { const v = raw(o); return v === null ? null : Math.round(v * 100 * 10 ** d) / 10 ** d; };
const num = (o, d = 2) => { const v = raw(o); return v === null ? null : Math.round(v * 10 ** d) / 10 ** d; };

const fyLabel = (endDateRaw) => {
  if (!endDateRaw) return "FY?";
  const d = new Date(endDateRaw * 1000);
  const fy = d.getUTCMonth() >= 3 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();  // Indian FY ends March
  return `FY${String(fy).slice(2)}`;
};

const toYahoo = (symbol) => `${symbol.replace("&", "%26")}.NS`;

/** Fetch + normalise. Returns null when Yahoo has nothing for the symbol. */
export async function fundamentals(symbol) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${symbol.replace(/[^A-Z0-9-]/g, "_")}.json`);
  try {
    const st = fs.statSync(cacheFile);
    if (Date.now() - st.mtimeMs < TTL) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch { /* fetch */ }
  if (inFlight > 3) return null;                   // politeness under fan-out
  inFlight++;
  try {
    const { cookie, crumb } = await getSession();
    const mods = "price,summaryDetail,financialData,defaultKeyStatistics,incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory";
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${toYahoo(symbol)}?modules=${mods}&crumb=${encodeURIComponent(crumb)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { headers: { ...UA, cookie }, signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (res.status === 404) { fs.writeFileSync(cacheFile, "null"); return null; }
    if (!res.ok) throw new Error(`yahoo HTTP ${res.status}`);
    const j = await res.json();
    const r = j?.quoteSummary?.result?.[0];
    if (!r) { fs.writeFileSync(cacheFile, "null"); return null; }

    const sd = r.summaryDetail || {}, fd = r.financialData || {}, ks = r.defaultKeyStatistics || {}, pr = r.price || {};
    const shares = raw(ks.sharesOutstanding);

    // ---- ratios (real) ----
    const mcapCr = cr(pr.marketCap ?? sd.marketCap);
    const fcf = raw(fd.freeCashflow);
    const ratios = {
      source: "yahoo", asOf: new Date().toISOString().slice(0, 10),
      price: num(pr.regularMarketPrice), marketCap: mcapCr,
      pe: num(sd.trailingPE), forwardPe: num(sd.forwardPE), pb: num(ks.priceToBook),
      evEbitda: num(ks.enterpriseToEbitda), evSales: num(ks.enterpriseToRevenue),
      peg: num(ks.pegRatio), eps: num(ks.trailingEps), bookValuePerShare: num(ks.bookValue),
      dividendYieldPct: pct(sd.dividendYield) ?? pct(sd.trailingAnnualDividendYield),
      dividendPayoutPct: pct(sd.payoutRatio),
      beta: num(ks.beta),
      roe: pct(fd.returnOnEquity), roa: pct(fd.returnOnAssets),
      grossMarginPct: pct(fd.grossMargins), opMarginPct: pct(fd.operatingMargins),
      patMarginPct: pct(fd.profitMargins), ebitdaMarginPct: pct(fd.ebitdaMargins),
      revGrowthPct: pct(fd.revenueGrowth), earningsGrowthPct: pct(fd.earningsGrowth),
      currentRatio: num(fd.currentRatio), quickRatio: num(fd.quickRatio),
      debtToEquity: fd.debtToEquity ? num({ raw: raw(fd.debtToEquity) / 100 }) : null,
      totalCashCr: cr(fd.totalCash), totalDebtCr: cr(fd.totalDebt),
      priceToFcf: fcf && mcapCr ? Math.round((mcapCr / (fcf / CR)) * 100) / 100 : null,
      promoterHoldingPct: pct(ks.heldPercentInsiders),
      week52HighReal: num(sd.fiftyTwoWeekHigh), week52LowReal: num(sd.fiftyTwoWeekLow),
      earningsYieldPct: raw(sd.trailingPE) ? Math.round((100 / raw(sd.trailingPE)) * 100) / 100 : null,
    };

    // ---- statements (real, ₹ crore, newest-first from Yahoo → we sort oldest-first) ----
    const incs = (r.incomeStatementHistory?.incomeStatementHistory || []).slice().reverse();
    const bss = (r.balanceSheetHistory?.balanceSheetStatements || []).slice().reverse();
    const cfs = (r.cashflowStatementHistory?.cashflowStatements || []).slice().reverse();

    const pnl = incs.map((x, i) => {
      const dep = cr(cfs[i]?.depreciation);
      const ebit = cr(x.operatingIncome) ?? cr(x.ebit);
      return {
        fy: fyLabel(raw(x.endDate)), revenue: cr(x.totalRevenue), otherIncome: cr(x.totalOtherIncomeExpenseNet),
        materials: cr(x.costOfRevenue), otherExpenses: cr(x.sellingGeneralAdministrative),
        ebitda: ebit !== null && dep !== null ? ebit + dep : null, depreciation: dep,
        ebit, interest: cr(x.interestExpense) !== null ? Math.abs(cr(x.interestExpense)) : null,
        pbt: cr(x.incomeBeforeTax), tax: cr(x.incomeTaxExpense), pat: cr(x.netIncome),
        eps: shares && raw(x.netIncome) ? Math.round((raw(x.netIncome) / shares) * 100) / 100 : null,
      };
    });
    const balanceSheet = bss.map((x) => {
      const debt = (cr(x.shortLongTermDebt) ?? 0) + (cr(x.longTermDebt) ?? 0);
      return {
        fy: fyLabel(raw(x.endDate)), netWorth: cr(x.totalStockholderEquity),
        shareCapital: cr(x.commonStock), reservesSurplus: cr(x.retainedEarnings),
        totalDebt: debt || null, otherLiabilities: cr(x.totalLiab) !== null ? cr(x.totalLiab) - (debt || 0) : null,
        totalLiabilities: cr(x.totalAssets), netFixedAssets: cr(x.propertyPlantEquipment),
        investments: cr(x.longTermInvestments), inventory: cr(x.inventory),
        receivables: cr(x.netReceivables), cashAndBank: cr(x.cash),
        otherAssets: cr(x.otherCurrentAssets), totalAssets: cr(x.totalAssets),
      };
    });
    const cashFlow = cfs.map((x) => {
      const cfo = cr(x.totalCashFromOperatingActivities), capex = cr(x.capitalExpenditures);
      return {
        fy: fyLabel(raw(x.endDate)), cfo, capex,
        cfi: cr(x.totalCashflowsFromInvestingActivities), dividendsPaid: cr(x.dividendsPaid),
        cff: cr(x.totalCashFromFinancingActivities), netChange: cr(x.changeInCash),
        fcf: cfo !== null && capex !== null ? cfo + capex : null,
      };
    });

    const out = { symbol, source: "yahoo", asOf: ratios.asOf, name: raw(pr.longName) || raw(pr.shortName), ratios, statements: { bankFormat: false, real: true, pnl, balanceSheet, cashFlow, note: `REAL filings-derived figures via Yahoo Finance (${pnl.length} FYs, consolidated, ₹ crore). Some line items are plugs where the source omits detail.` } };
    fs.writeFileSync(cacheFile, JSON.stringify(out));
    return out;
  } catch (e) {
    console.log(`  yfund ${symbol}: ${String(e.message).slice(0, 60)}`);
    return null;
  } finally { inFlight--; }
}

export function cachedCount() {
  try { return fs.readdirSync(CACHE_DIR).length; } catch { return 0; }
}

/** Gentle boot warmup: pre-cache real fundamentals for the curated universe
 *  (~1 request / 4s — far inside Yahoo's tolerance; resumes via disk cache). */
export async function warmup(symbols, { spacingMs = 4000, startDelayMs = 20_000 } = {}) {
  await new Promise((r) => setTimeout(r, startDelayMs));
  let ok = 0, miss = 0;
  for (const sym of symbols) {
    const cacheFile = path.join(CACHE_DIR, `${sym.replace(/[^A-Z0-9-]/g, "_")}.json`);
    try { if (Date.now() - fs.statSync(cacheFile).mtimeMs < TTL) { ok++; continue; } } catch { /* fetch */ }
    let r = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = cooldownMs();
      if (wait) await new Promise((res) => setTimeout(res, wait + 1000));   // sit out the backoff
      r = await fundamentals(sym).catch(() => null);
      if (r || fs.existsSync(cacheFile)) break;               // got data, or definitively not on Yahoo
    }
    r ? ok++ : miss++;
    await new Promise((res) => setTimeout(res, spacingMs));
  }
  console.log(`  yfund: warmup done — real fundamentals cached for ${ok}/${symbols.length} symbols${miss ? ` (${miss} unavailable)` : ""}`);
}
