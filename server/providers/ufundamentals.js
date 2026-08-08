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
// Upstox serves a CONDENSED statement set (verified against the live API):
// P&L      → Revenue · Other Income · Total Revenue · Total Expenses · PBT · Tax · PAT · EPS
// Balance  → Non-Current/Current Assets & Liabilities · Equity Capital · Totals
// Cash     → PBT · income before WC · WC changes · CFO/CFI/CFF · cash start/end
// There is no material/employee/depreciation/interest breakdown, so rather than
// forcing this into the modelled engine's row shape (which would render a wall
// of dashes), each builder returns its rows AND the spec describing them.
function buildPnl(inc) {
  if (!inc) return { rows: [], specs: [] };
  const cats = inc.income_statement || [];
  const catHist = (needle) => {
    const c = cats.find((x) => norm(x.category).replace(/ /g, "_").includes(needle));
    const out = {};
    for (const h of c?.history || []) out[h.period] = pnum(h.value);
    return out;
  };
  const revCat = catHist("revenue");
  const opCat = catHist("operating_profit");
  const npCat = catHist("net_profit");
  const fsRows = inc.full_statement || [];

  const rev = seriesMap(fsRows, ["revenue"]);                       // net sales, excl. other income
  const other = seriesMap(fsRows, ["other income"]);
  const totalRev = seriesMap(fsRows, ["total revenue", "total income"]);
  const totalExp = seriesMap(fsRows, ["total expenses", "total expenditure"]);
  const pbt = seriesMap(fsRows, ["profit before tax"]);
  const tax = seriesMap(fsRows, ["tax"]);
  const pat = seriesMap(fsRows, ["profit after tax", "net profit"]);
  const eps = seriesMap(fsRows, ["eps basic", "basic eps", "eps"]);
  const epsD = seriesMap(fsRows, ["eps diluted", "diluted eps"]);

  const periods = [...new Set([...Object.keys(revCat), ...Object.keys(npCat), ...Object.keys(rev)])];
  periods.sort((a, b) => new Date(`1 ${a}`) - new Date(`1 ${b}`));   // oldest → newest
  const quarterly = norm(inc.time_period) === "quarterly";

  // Banks and NBFCs report other income INSIDE total income, manufacturers add
  // it on top. Detect which, so the table never implies an addition that does
  // not hold (HDFCBANK: revenue == total income, with other income a component).
  const lastP = periods[periods.length - 1];
  const lr = rev[lastP], lo = other[lastP], lt = totalRev[lastP] ?? revCat[lastP];
  const additive = lr != null && lo != null && lt ? Math.abs(lr + lo - lt) / Math.abs(lt) < 0.01 : true;

  const rows = periods.map((p) => {
    const tr = totalRev[p] ?? revCat[p] ?? null;
    const pb = pbt[p] ?? null;
    const op = opCat[p] ?? null;
    // Upstox derives operating_profit as total revenue − total expenses, which
    // equals PBT for most issuers; only surface it when it genuinely differs.
    const opDistinct = op !== null && pb !== null && tr ? Math.abs(op - pb) / Math.abs(tr) > 0.01 : op !== null && pb === null;
    return {
      fy: quarterly ? qLabelOf(p) : fyOf(p), period: p,
      revenue: additive ? (rev[p] ?? (tr !== null && other[p] != null ? r2(tr - other[p]) : tr)) : null,
      otherIncome: other[p] ?? null,
      totalRevenue: tr,
      totalExpenses: totalExp[p] ?? null,
      operatingProfit: opDistinct ? op : null,
      pbt: pb, tax: tax[p] ?? null,
      pat: pat[p] ?? npCat[p] ?? null,
      eps: eps[p] ?? null, epsDiluted: epsD[p] ?? null,
    };
  });
  const specs = [
    { k: "revenue", label: "Revenue from operations" },
    { k: "otherIncome", label: additive ? "Other income" : "— of which, other income" },
    { k: "totalRevenue", label: additive ? "Total revenue" : "Total income", strong: true },
    { k: "totalExpenses", label: "Total expenses" },
    { k: "operatingProfit", label: "Operating profit", strong: true },
    { k: "pbt", label: "Profit before tax", strong: true },
    { k: "tax", label: "Tax" },
    { k: "pat", label: "Net profit (PAT)", strong: true },
    { k: "eps", label: "EPS (basic)" },
    { k: "epsDiluted", label: "EPS (diluted)" },
  ];
  return { rows, specs };
}

function buildBalanceSheet(bs) {
  if (!bs) return { rows: [], specs: [] };
  const fsRows = bs.full_statement || [];
  const ncA = seriesMap(fsRows, ["non current assets"]);
  const cA = seriesMap(fsRows, ["current assets"]);
  const totA = seriesMap(fsRows, ["total assets"]);
  const cL = seriesMap(fsRows, ["current liabilities"]);
  const ncL = seriesMap(fsRows, ["non current liabilities"]);
  const netCA = seriesMap(fsRows, ["net current asset"]);
  const equity = seriesMap(fsRows, ["equity capital", "total equity", "shareholders funds", "net worth"]);
  const totEL = seriesMap(fsRows, ["total equity liabilities", "total equity and liabilities"]);

  const hist = (bs.history || []).slice();
  hist.sort((a, b) => new Date(`1 ${a.period}`) - new Date(`1 ${b.period}`));
  const rows = hist.map((h) => {
    const p = h.period;
    const ta = totA[p] ?? pnum(h.total_asset);
    const tl = pnum(h.total_liability);
    return {
      fy: fyOf(p), period: p,
      netWorth: equity[p] ?? (ta !== null && tl !== null ? r2(ta - tl) : null),
      nonCurrentLiabilities: ncL[p] ?? null, currentLiabilities: cL[p] ?? null,
      totalLiabilities: tl,
      totalEquityAndLiabilities: totEL[p] ?? ta,
      nonCurrentAssets: ncA[p] ?? null, currentAssets: cA[p] ?? null,
      netCurrentAssets: netCA[p] ?? null, totalAssets: ta,
    };
  });
  const specs = [
    { k: "netWorth", label: "Equity (net worth)", strong: true },
    { k: "nonCurrentLiabilities", label: "Non-current liabilities" },
    { k: "currentLiabilities", label: "Current liabilities" },
    { k: "totalLiabilities", label: "Total liabilities" },
    { k: "totalEquityAndLiabilities", label: "TOTAL EQUITY & LIABILITIES", strong: true },
    { k: "nonCurrentAssets", label: "Non-current assets" },
    { k: "currentAssets", label: "Current assets" },
    { k: "netCurrentAssets", label: "Net current assets (working capital)" },
    { k: "totalAssets", label: "TOTAL ASSETS", strong: true },
  ];
  return { rows, specs };
}

function buildCashFlow(cf) {
  if (!cf) return { rows: [], specs: [] };
  const cats = cf.cash_flow || [];
  const catHist = (needle) => {
    const c = cats.find((x) => norm(x.category).includes(needle));
    const out = {};
    for (const h of c?.history || []) out[h.period] = pnum(h.value);
    return out;
  };
  const cfoC = catHist("operat"), cfiC = catHist("invest"), cffC = catHist("financ");
  const fsRows = cf.full_statement || [];
  const pbt = seriesMap(fsRows, ["profit before tax"]);
  const beforeWc = seriesMap(fsRows, ["income before wc changes", "income before working capital"]);
  const chgWc = seriesMap(fsRows, ["change in wc", "change in working capital"]);
  const cfoF = seriesMap(fsRows, ["cash flow from operations"]);
  const cfiF = seriesMap(fsRows, ["cash flow from investing"]);
  const cffF = seriesMap(fsRows, ["cash flow from financing"]);
  const total = seriesMap(fsRows, ["total cash flow"]);
  const cashStart = seriesMap(fsRows, ["cash start of the year", "cash at start"]);
  const cashEnd = seriesMap(fsRows, ["cash end of the year", "cash at end"]);

  const periods = [...new Set([...Object.keys(cfoC), ...Object.keys(cfiC), ...Object.keys(cffC), ...Object.keys(cfoF)])];
  periods.sort((a, b) => new Date(`1 ${a}`) - new Date(`1 ${b}`));
  const rows = periods.map((p) => {
    const o = cfoF[p] ?? cfoC[p] ?? null, i = cfiF[p] ?? cfiC[p] ?? null, fn = cffF[p] ?? cffC[p] ?? null;
    return {
      fy: fyOf(p), period: p,
      pbt: pbt[p] ?? null, incomeBeforeWc: beforeWc[p] ?? null, changeInWc: chgWc[p] ?? null,
      cfo: o, cfi: i, cff: fn,
      netChange: total[p] ?? (o !== null && i !== null && fn !== null ? r2(o + i + fn) : null),
      cashStart: cashStart[p] ?? null, closingCash: cashEnd[p] ?? null,
    };
  });
  const specs = [
    { k: "pbt", label: "Profit before tax" },
    { k: "incomeBeforeWc", label: "Cash profit before working capital" },
    { k: "changeInWc", label: "Change in working capital", signed: true },
    { k: "cfo", label: "Operating cash flow", strong: true, signed: true },
    { k: "cfi", label: "Investing cash flow", signed: true },
    { k: "cff", label: "Financing cash flow", signed: true },
    { k: "netChange", label: "Net change in cash", strong: true, signed: true },
    { k: "cashStart", label: "Cash at start of year" },
    { k: "closingCash", label: "Cash at end of year", strong: true },
  ];
  return { rows, specs };
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

/** Live shape: { name, expiry_date, amount, ratio, event_details:[{name,value}] } */
function buildActions(ca) {
  const arr = Array.isArray(ca) ? ca : ca?.corporate_actions || [];
  if (!arr.length) return null;
  const detailOf = (a) => {
    const ev = {};
    for (const d of a.event_details || []) ev[norm(d.name)] = d.value;
    if (ev["details"]) return ev["details"];
    if (a.amount != null) return `₹${a.amount} per share${ev["dividend"] ? ` (${ev["dividend"]}%)` : ""}${ev["dividend type"] ? ` · ${ev["dividend type"]}` : ""}`;
    if (a.ratio) return `Ratio ${a.ratio}`;
    return null;
  };
  const exOf = (a) => {
    const ev = {};
    for (const d of a.event_details || []) ev[norm(d.name)] = d.value;
    return ev["ex dividend date"] || ev["ex date"] || a.expiry_date || a.ex_date || a.date || null;
  };
  return arr.slice(0, 24).map((a) => ({
    type: a.name || a.type || "Action",
    date: exOf(a),
    detail: detailOf(a),
    announced: (a.event_details || []).find((d) => norm(d.name) === "announcement date")?.value || null,
  })).filter((a) => a.date || a.detail);
}

function buildCompetitors(cp) {
  const arr = Array.isArray(cp) ? cp : cp?.competitors || [];
  return arr.slice(0, 12).map((c) => {
    const prof = c.company_profile || c.description || null;
    return {
      isin: c.isin || (c.instrument_key ? String(c.instrument_key).split("|")[1] : null),
      name: c.name || c.company_name || c.short_name || (prof ? prof.split(/\s+(?:is|Limited)/)[0].slice(0, 60) : null),
      description: prof,
      sector: c.sector || null,
      marketCap: pnum(c.market_cap ?? c.market_cap_inr?.value ?? c.marketCap),
      pe: pnum(c.pe ?? c.price_earnings), price: pnum(c.last_price ?? c.price),
    };
  }).filter((c) => c.name || c.description);
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
      // competitors is the one endpoint keyed by instrument_key, not bare ISIN
      safe(get(`${BASE}/${encodeURIComponent(`NSE_EQ|${isin}`)}/competitors`)),
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

    const P = buildPnl(inc), B = buildBalanceSheet(bs), C = buildCashFlow(cf);
    const pnl = P.rows, balanceSheet = B.rows, cashFlow = C.rows;
    const holdings = buildHoldings(sh);
    if (holdings?.latest?.promoters != null) ratios.promoterHoldingPct = holdings.latest.promoters;

    // margins / growth derived from the real P&L when the ratio API omits them
    const last = pnl[pnl.length - 1], prev = pnl[pnl.length - 2];
    const lastRev = last?.totalRevenue ?? last?.revenue;
    const prevRev = prev?.totalRevenue ?? prev?.revenue;
    if (lastRev) {
      if (last.pat != null) ratios.patMarginPct = r2((last.pat / lastRev) * 100);
      if (prevRev) ratios.revGrowthPct = r2(((lastRev - prevRev) / Math.abs(prevRev)) * 100);
    }
    if (ratios.eps == null && last?.eps != null) ratios.eps = last.eps;
    // net worth / total assets are the only book figures this feed exposes
    const lastBs = balanceSheet[balanceSheet.length - 1];
    if (lastBs?.netWorth) ratios.bookValueCr = lastBs.netWorth;

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
        specs: { pnl: P.specs, bs: B.specs, cf: C.specs },
        note: `REAL filed company data via the Upstox Company Fundamentals API — ${inc?.type || "consolidated"} statements, ₹ ${inc?.units_in || "crore"}, ${pnl.length} periods. This feed publishes a summary-level statement: totals are exact as filed, but it does not break out individual cost lines such as materials, employee cost, depreciation or interest.`,
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
