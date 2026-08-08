// ---------------------------------------------------------------------------
// ufundamentals.js — REAL company fundamentals from the Upstox Company
// Fundamentals API (launched 11 May 2026).
//
//   GET /v2/fundamentals/{isin}/profile
//   GET /v2/fundamentals/{isin}/key-ratios          ← company AND sector values
//   GET /v2/fundamentals/{isin}/income-statement?type=&time_period=&fs=true
//   GET /v2/fundamentals/{isin}/balance-sheet?type=&fs=true
//   GET /v2/fundamentals/{isin}/cash-flow?type=&fs=true
//   GET /v2/fundamentals/{isin}/share-holdings      ← promoter/FII/DII/MF/retail
//   GET /v2/fundamentals/{isin}/corporate-actions   ← dividends, splits, bonus
//   GET /v2/fundamentals/{isin}/competitors
//
// Auth: Bearer UPSTOX_ACCESS_TOKEN. ISINs come from the NSE instrument master
// already cached by upstox.js — nothing hardcoded. Everything is normalised
// into the platform's own ratio/statement keys (₹ crore) and disk-cached.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cfg } from "../lib/config.js";
import { loadInstruments } from "./upstox.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "..", "var", "ufund");
const TTL = 3 * 86400_000;
const BASE = "https://api.upstox.com/v2/fundamentals";

let isinBySymbol = null;
let inFlight = 0;
let coolDownUntil = 0;                       // set on 429 / 401 so we stop hammering

export function configured() { return !!cfg("UPSTOX_ACCESS_TOKEN"); }

const headers = () => ({ Accept: "application/json", Authorization: `Bearer ${cfg("UPSTOX_ACCESS_TOKEN")}` });

/** symbol → ISIN, from the instrument master upstox.js already downloads. */
async function isinOf(symbol) {
  if (!isinBySymbol) {
    const map = await loadInstruments();     // trading_symbol → "NSE_EQ|INE..."
    isinBySymbol = {};
    for (const [sym, key] of Object.entries(map)) {
      const isin = String(key).split("|")[1];
      if (isin && /^INE|^INF|^IN[0-9]/.test(isin)) isinBySymbol[sym] = isin;
    }
  }
  return isinBySymbol[symbol] || null;
}

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { headers: headers(), signal: ctrl.signal });
    if (res.status === 429 || res.status === 401 || res.status === 403) {
      coolDownUntil = Date.now() + (res.status === 429 ? 60_000 : 10 * 60_000);
      throw new Error(`upstox HTTP ${res.status}`);
    }
    if (res.status === 404) return null;                       // no coverage for this ISIN
    if (!res.ok) throw new Error(`upstox HTTP ${res.status}`);
    const j = await res.json();
    return j?.status === "error" ? null : j?.data ?? null;
  } finally { clearTimeout(t); }
}

// ------------------------------- parsing ------------------------------------
/** "20.15" | "4.39%" | "1,234.56" | "-" | "NA" → number | null */
function pnum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).replace(/[,%\s₹]/g, "").replace(/[()]/g, "-");
  if (!s || /^(na|nan|-|--)$/i.test(s)) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}
const r2 = (n) => (n === null ? null : Math.round(n * 100) / 100);

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** "Mar 2026" → FY26 · "Dec 2025" (Dec-ending co.) → FY26 · quarterly → "Q3 FY26" */
function fyOf(period) {
  const m = String(period || "").match(/([A-Za-z]{3})\w*\s*'?(\d{2,4})/);
  if (!m) return String(period || "FY?");
  const mon = MONTHS[m[1].toLowerCase()];
  let yr = Number(m[2]); if (yr < 100) yr += 2000;
  const fy = mon >= 3 ? yr + 1 : yr;                            // Apr-Mar Indian fiscal year
  return `FY${String(fy).slice(2)}`;
}
function qLabelOf(period) {
  const m = String(period || "").match(/([A-Za-z]{3})\w*\s*'?(\d{2,4})/);
  if (!m) return String(period || "");
  const mon = MONTHS[m[1].toLowerCase()];
  const q = { 5: "Q1", 8: "Q2", 11: "Q3", 2: "Q4" }[mon] || `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mon]}`;
  return `${q} ${fyOf(period)}`;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Find the first full_statement particular matching any alias (substring-safe). */
function pick(rows, aliases) {
  for (const a of aliases) {
    const hit = rows.find((r) => norm(r.particular) === a);
    if (hit) return hit;
  }
  for (const a of aliases) {
    const hit = rows.find((r) => norm(r.particular).includes(a));
    if (hit) return hit;
  }
  return null;
}
/** particular → { period → value } lookup for the whole statement. */
function seriesMap(rows, aliases) {
  const row = pick(rows || [], aliases);
  if (!row) return {};
  const out = {};
  for (const h of row.history || []) out[h.period] = pnum(h.value);
  return out;
}

// ------------------------------- ratio names --------------------------------
const RATIO_KEY = [
  [["p e", "pe ratio", "price to earnings", "price earnings"], "pe"],
  [["p b", "pb ratio", "price to book", "price book"], "pb"],
  [["ev ebitda", "ev to ebitda"], "evEbitda"],
  [["ev sales", "ev revenue", "ev to sales"], "evSales"],
  [["roe", "return on equity"], "roe"],
  [["roa", "return on asset", "return on assets"], "roa"],
  [["roce", "return on capital employed"], "roce"],
  [["debt to equity", "debt equity", "d e ratio"], "debtToEquity"],
  [["dividend yield"], "dividendYieldPct"],
  [["dividend payout", "payout ratio"], "dividendPayoutPct"],
  [["current ratio"], "currentRatio"],
  [["quick ratio"], "quickRatio"],
  [["interest coverage"], "interestCover"],
  [["eps", "earnings per share"], "eps"],
  [["book value"], "bookValuePerShare"],
  [["peg"], "peg"],
  [["net margin", "net profit margin", "pat margin"], "patMarginPct"],
  [["operating margin", "opm"], "opMarginPct"],
  [["ebitda margin"], "ebitdaMarginPct"],
  [["gross margin"], "grossMarginPct"],
  [["asset turnover"], "assetTurnover"],
  [["market cap", "mcap"], "marketCap"],
];
function ratioKeyOf(name) {
  const n = norm(name);
  for (const [aliases, key] of RATIO_KEY) if (aliases.some((a) => n === a || n.includes(a))) return key;
  return null;
}

// ------------------------------ normalisation -------------------------------
function buildPnl(inc) {
  if (!inc) return [];
  const cats = inc.income_statement || [];
  const catHist = (names) => {
    const c = cats.find((x) => names.includes(norm(x.category).replace(/ /g, "_")) || names.some((n) => norm(x.category).includes(norm(n))));
    const out = {};
    for (const h of c?.history || []) out[h.period] = pnum(h.value);
    return out;
  };
  const rev = catHist(["revenue", "total_revenue", "sales"]);
  const op = catHist(["operating_profit", "ebitda", "operating_income"]);
  const np = catHist(["net_profit", "pat", "profit_after_tax", "net_income"]);
  const fsRows = inc.full_statement || [];

  const other = seriesMap(fsRows, ["other income"]);
  const materials = seriesMap(fsRows, ["cost of materials consumed", "raw material cost", "material cost", "cost of revenue", "purchase of stock in trade"]);
  const employee = seriesMap(fsRows, ["employee benefit expenses", "employee cost", "employee expenses"]);
  const otherExp = seriesMap(fsRows, ["other expenses", "other operating expenses", "operating expenses"]);
  const dep = seriesMap(fsRows, ["depreciation and amortisation", "depreciation amortization", "depreciation"]);
  const interest = seriesMap(fsRows, ["finance cost", "finance costs", "interest expense", "interest"]);
  const pbt = seriesMap(fsRows, ["profit before tax", "pbt"]);
  const tax = seriesMap(fsRows, ["tax expense", "total tax", "income tax", "tax"]);
  const eps = seriesMap(fsRows, ["basic eps", "diluted eps", "eps", "earnings per share"]);
  const revFs = seriesMap(fsRows, ["revenue", "total revenue", "net sales", "sales", "total income"]);
  const patFs = seriesMap(fsRows, ["net profit", "profit after tax", "pat", "net income"]);

  const periods = [...new Set([...Object.keys(rev), ...Object.keys(np), ...Object.keys(revFs)])];
  periods.sort((a, b) => new Date(`1 ${a}`) - new Date(`1 ${b}`));       // oldest → newest
  const quarterly = norm(inc.time_period) === "quarterly";

  return periods.map((p) => {
    const ebitda = op[p] ?? null;
    const d = dep[p] ?? null;
    const ebit = ebitda !== null && d !== null ? r2(ebitda - d) : null;
    return {
      fy: quarterly ? qLabelOf(p) : fyOf(p), period: p,
      revenue: rev[p] ?? revFs[p] ?? null, otherIncome: other[p] ?? null,
      materials: materials[p] ?? null, employeeCost: employee[p] ?? null, otherExpenses: otherExp[p] ?? null,
      ebitda, depreciation: d, ebit, interest: interest[p] ?? null,
      pbt: pbt[p] ?? null, tax: tax[p] ?? null, pat: np[p] ?? patFs[p] ?? null, eps: eps[p] ?? null,
    };
  });
}

function buildBalanceSheet(bs) {
  if (!bs) return [];
  const fsRows = bs.full_statement || [];
  const shareCap = seriesMap(fsRows, ["equity share capital", "share capital", "paid up capital"]);
  const reserves = seriesMap(fsRows, ["reserves and surplus", "other equity", "reserves"]);
  const netWorth = seriesMap(fsRows, ["total shareholders funds", "shareholders funds", "total equity", "net worth"]);
  const lt = seriesMap(fsRows, ["long term borrowings", "non current borrowings"]);
  const st = seriesMap(fsRows, ["short term borrowings", "current borrowings"]);
  // exact-ish only: a loose "borrowings" match would swallow the long-term row
  const debtTotal = seriesMap(fsRows, ["total borrowings", "total debt"]);
  const debtLoose = Object.keys(lt).length || Object.keys(st).length || Object.keys(debtTotal).length
    ? {} : seriesMap(fsRows, ["borrowings", "debt"]);
  const fixed = seriesMap(fsRows, ["net block", "property plant and equipment", "net fixed assets", "fixed assets", "tangible assets"]);
  const inv = seriesMap(fsRows, ["non current investments", "investments"]);
  const invy = seriesMap(fsRows, ["inventories", "inventory"]);
  const recv = seriesMap(fsRows, ["trade receivables", "sundry debtors", "receivables"]);
  const cash = seriesMap(fsRows, ["cash and cash equivalents", "cash and bank balance", "cash and bank", "cash"]);
  const othA = seriesMap(fsRows, ["other current assets", "other assets"]);
  const othL = seriesMap(fsRows, ["other liabilities", "other current liabilities", "current liabilities"]);

  const hist = (bs.history || []).slice();
  hist.sort((a, b) => new Date(`1 ${a.period}`) - new Date(`1 ${b.period}`));
  return hist.map((h) => {
    const p = h.period;
    const split = lt[p] != null || st[p] != null ? (lt[p] ?? 0) + (st[p] ?? 0) : null;
    const totalDebt = split ?? debtTotal[p] ?? debtLoose[p] ?? null;
    const nw = netWorth[p] ?? ((shareCap[p] ?? 0) + (reserves[p] ?? 0) || null);
    const ta = pnum(h.total_asset);
    return {
      fy: fyOf(p), period: p, netWorth: nw,
      shareCapital: shareCap[p] ?? null, reservesSurplus: reserves[p] ?? null,
      totalDebt, otherLiabilities: othL[p] ?? (ta !== null && nw !== null && totalDebt !== null ? r2(ta - nw - totalDebt) : null),
      totalLiabilities: pnum(h.total_liability) ?? ta,
      netFixedAssets: fixed[p] ?? null, investments: inv[p] ?? null, inventory: invy[p] ?? null,
      receivables: recv[p] ?? null, cashAndBank: cash[p] ?? null, otherAssets: othA[p] ?? null,
      totalAssets: ta,
    };
  });
}

function buildCashFlow(cf) {
  if (!cf) return [];
  const cats = cf.cash_flow || [];
  const catHist = (needle) => {
    const c = cats.find((x) => norm(x.category).includes(needle));
    const out = {};
    for (const h of c?.history || []) out[h.period] = pnum(h.value);
    return out;
  };
  const cfo = catHist("operat"), cfi = catHist("invest"), cff = catHist("financ");
  const fsRows = cf.full_statement || [];
  const capex = seriesMap(fsRows, ["purchase of fixed assets", "capital expenditure", "purchase of property plant and equipment", "fixed assets purchased", "capex"]);
  const div = seriesMap(fsRows, ["dividend paid", "dividends paid"]);
  const net = seriesMap(fsRows, ["net cash flow", "net increase decrease in cash", "net change in cash"]);

  const periods = [...new Set([...Object.keys(cfo), ...Object.keys(cfi), ...Object.keys(cff)])];
  periods.sort((a, b) => new Date(`1 ${a}`) - new Date(`1 ${b}`));
  return periods.map((p) => {
    const o = cfo[p] ?? null, cx = capex[p] ?? null;
    return {
      fy: fyOf(p), period: p, cfo: o, capex: cx, cfi: cfi[p] ?? null, cff: cff[p] ?? null,
      dividendsPaid: div[p] ?? null,
      netChange: net[p] ?? (o !== null && cfi[p] !== null && cff[p] !== null ? r2(o + cfi[p] + cff[p]) : null),
      fcf: o !== null && cx !== null ? r2(o - Math.abs(cx)) : null,
    };
  });
}

function buildHoldings(sh) {
  if (!Array.isArray(sh) || !sh.length) return null;
  const label = { promoters: "Promoters", fii: "FII / Foreign", other_dii: "DII (other)", mutual_funds: "Mutual Funds", retail_and_other: "Retail & Others" };
  const periods = [...new Set(sh.flatMap((c) => (c.history || []).map((h) => h.period)))]
    .sort((a, b) => new Date(`1 ${b}`) - new Date(`1 ${a}`)).slice(0, 8);        // newest first
  const rows = sh.map((c) => ({
    key: c.category,
    label: label[c.category] || c.category.replace(/_/g, " "),
    values: periods.map((p) => pnum((c.history || []).find((h) => h.period === p)?.value)),
  }));
  const latest = {};
  for (const r of rows) latest[r.key] = r.values[0];
  const prev = {};
  for (const r of rows) prev[r.key] = r.values[1];
  return { periods, rows, latest, prev };
}

function buildActions(ca) {
  const arr = Array.isArray(ca) ? ca : ca?.corporate_actions || [];
  if (!arr.length) return null;
  return arr.slice(0, 24).map((a) => ({
    type: a.type || a.action_type || a.purpose || "action",
    date: a.ex_date || a.exDate || a.date || a.record_date || null,
    detail: a.description || a.detail || a.value || a.dividend || a.ratio || null,
  })).filter((a) => a.date || a.detail);
}

function buildCompetitors(cp) {
  const arr = Array.isArray(cp) ? cp : cp?.competitors || [];
  return arr.slice(0, 12).map((c) => ({
    isin: c.isin || null, name: c.name || c.company_name || c.short_name || null,
    description: c.description || c.company_profile || null,
    marketCap: pnum(c.market_cap ?? c.market_cap_inr?.value ?? c.marketCap),
    pe: pnum(c.pe ?? c.price_earnings), price: pnum(c.last_price ?? c.price),
  })).filter((c) => c.name);
}

// --------------------------------- main -------------------------------------
/** Full real-fundamentals bundle for an NSE symbol, or null when unavailable. */
export async function fundamentals(symbol) {
  if (!configured()) return null;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${symbol.replace(/[^A-Z0-9-]/g, "_")}.json`);
  try {
    const st = fs.statSync(cacheFile);
    if (Date.now() - st.mtimeMs < TTL) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch { /* fetch */ }
  if (Date.now() < coolDownUntil || inFlight > 2) return null;

  inFlight++;
  try {
    const isin = await isinOf(symbol);
    if (!isin) return null;
    const q = "type=consolidated&fs=true";
    // A failed REQUEST (401/403/429/network) must never be cached as "no data" —
    // only a clean response that genuinely carries nothing may be.
    let hardError = false;
    const safe = (p) => p.then((v) => v, () => { hardError = true; return null; });
    const [profile, ratiosRaw, inc, bs, cf, sh, ca, cp] = await Promise.all([
      safe(get(`${BASE}/${isin}/profile`)),
      safe(get(`${BASE}/${isin}/key-ratios`)),
      safe(get(`${BASE}/${isin}/income-statement?${q}&time_period=yearly`)),
      safe(get(`${BASE}/${isin}/balance-sheet?${q}`)),
      safe(get(`${BASE}/${isin}/cash-flow?${q}`)),
      safe(get(`${BASE}/${isin}/share-holdings`)),
      safe(get(`${BASE}/${isin}/corporate-actions`)),
      safe(get(`${BASE}/${isin}/competitors`)),
    ]);
    if (!ratiosRaw && !inc && !bs) {
      if (!hardError) fs.writeFileSync(cacheFile, "null");   // genuinely not covered
      return null;
    }

    // ---- ratios + REAL sector benchmarks (the headline win of this API) ----
    const ratios = {}, sectorBenchmarks = [];
    for (const row of Array.isArray(ratiosRaw) ? ratiosRaw : ratiosRaw?.key_ratios || []) {
      const key = ratioKeyOf(row.name);
      const cv = pnum(row.company_value), sv = pnum(row.sector_value);
      if (key && cv !== null) ratios[key] = cv;
      if (cv !== null || sv !== null) sectorBenchmarks.push({ key, name: row.name, company: cv, sector: sv, unit: /%/.test(String(row.company_value)) ? "%" : "x" });
    }

    const pnl = buildPnl(inc);
    const balanceSheet = buildBalanceSheet(bs);
    const cashFlow = buildCashFlow(cf);
    const holdings = buildHoldings(sh);
    if (holdings?.latest?.promoters != null) ratios.promoterHoldingPct = holdings.latest.promoters;

    // margins / growth derived from the real P&L when the ratio API omits them
    const last = pnl[pnl.length - 1], prev = pnl[pnl.length - 2];
    if (last?.revenue) {
      if (ratios.patMarginPct == null && last.pat != null) ratios.patMarginPct = r2((last.pat / last.revenue) * 100);
      if (ratios.ebitdaMarginPct == null && last.ebitda != null) ratios.ebitdaMarginPct = r2((last.ebitda / last.revenue) * 100);
      if (prev?.revenue) ratios.revGrowthPct = r2(((last.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100);
    }
    if (ratios.eps == null && last?.eps != null) ratios.eps = last.eps;

    const out = {
      symbol, isin, source: "upstox", asOf: new Date().toISOString().slice(0, 10),
      name: null,
      profile: profile ? {
        description: profile.company_profile || null,
        sector: profile.sector || null,
        sectorMarketCapCr: pnum(profile.sector_market_cap_inr?.value),
        sectorMarketCapFmt: profile.sector_market_cap_inr?.formatted || null,
        sectorMarketCapUsd: profile.sector_market_cap_usd?.formatted || null,
      } : null,
      ratios, sectorBenchmarks, holdings,
      corporateActions: buildActions(ca),
      competitors: buildCompetitors(cp),
      statements: {
        bankFormat: false, real: true, source: "upstox",
        units: inc?.units_in || bs?.units_in || "crore",
        type: inc?.type || "consolidated",
        pnl, balanceSheet, cashFlow,
        note: `REAL filings data via the Upstox Company Fundamentals API — ${inc?.type || "consolidated"} statements, ₹ ${inc?.units_in || "crore"}, ${pnl.length} periods. Blank cells are line items the exchange filing does not break out.`,
      },
    };
    fs.writeFileSync(cacheFile, JSON.stringify(out));
    return out;
  } catch (e) {
    console.log(`  ufund ${symbol}: ${String(e.message).slice(0, 70)}`);
    return null;
  } finally { inFlight--; }
}

/** Quarterly P&L (separate call — only fetched when a page asks for it). */
export async function quarterly(symbol) {
  if (!configured()) return null;
  const cacheFile = path.join(CACHE_DIR, `${symbol.replace(/[^A-Z0-9-]/g, "_")}.q.json`);
  try {
    const st = fs.statSync(cacheFile);
    if (Date.now() - st.mtimeMs < TTL) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch { /* fetch */ }
  if (Date.now() < coolDownUntil) return null;
  try {
    const isin = await isinOf(symbol);
    if (!isin) return null;
    const inc = await get(`${BASE}/${isin}/income-statement?type=consolidated&fs=true&time_period=quarterly`);
    const rows = buildPnl(inc);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(rows));
    return rows;
  } catch { return null; }
}

export function cachedCount() {
  try { return fs.readdirSync(CACHE_DIR).filter((f) => !f.endsWith(".q.json")).length; } catch { return 0; }
}

/** Gentle background pre-cache of the curated universe (paced for rate limits). */
export async function warmup(symbols, { spacingMs = 1500, startDelayMs = 15_000 } = {}) {
  if (!configured()) return;
  await new Promise((r) => setTimeout(r, startDelayMs));
  let ok = 0;
  for (const sym of symbols) {
    const cacheFile = path.join(CACHE_DIR, `${sym.replace(/[^A-Z0-9-]/g, "_")}.json`);
    try { if (Date.now() - fs.statSync(cacheFile).mtimeMs < TTL) { ok++; continue; } } catch { /* fetch */ }
    if (await fundamentals(sym).catch(() => null)) ok++;
    await new Promise((res) => setTimeout(res, Date.now() < coolDownUntil ? 60_000 : spacingMs));
  }
  console.log(`  ufund: Upstox fundamentals cached for ${ok}/${symbols.length} symbols`);
}

export const name = "upstox-fundamentals";
