#!/usr/bin/env node
// ---------------------------------------------------------------------------
// fetch_fundamentals.mjs — headline fundamentals for every NSE-listed company.
//
// Prices come from NSE's own bhavcopy (see fetch_prices.mjs) and are refreshed
// by CI every market day. Fundamentals are different: they only move when a
// company files results, and the free endpoint that serves them rate-limits an
// IP hard. So this script is deliberately slow and patient, runs LOCALLY, and
// writes a snapshot that is committed to the repo — CI then builds the whole
// site from the snapshot and never needs a key or a lucky rate-limit window.
//
// Deep filed data (full P&L, balance sheet, cash flow, shareholding, peers)
// comes from Upstox in var/ufund and is layered on top for the names it covers.
// This script supplies the wide, shallow layer that covers everything else.
//
//   node scripts/fetch_fundamentals.mjs               # all, resumable
//   node scripts/fetch_fundamentals.mjs --limit 100
//   node scripts/fetch_fundamentals.mjs --spacing 2500
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getJson, makeCache, yahooAuth, yahooHeaders, yahooCrumb, fmtDuration, bar, sleep } from "./lib/net.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VAR = path.join(ROOT, "var");
const DATA = path.join(ROOT, "data");

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? (argv[i + 1] ?? true) : d; };
const LIMIT = Number(arg("limit", 0)) || 0;
const FORCE = argv.includes("--force");
let SPACING = Number(arg("spacing", 1200)) || 1200;      // ms between requests, adaptive

// Results move quarterly, so a two-week-old record is still current.
const cache = makeCache(path.join(VAR, "yfund"), FORCE ? -1 : 24 * 14);

const MODULES = "price,summaryDetail,defaultKeyStatistics,financialData,summaryProfile";
const raw = (x) => (x && typeof x === "object" ? (Number.isFinite(x.raw) ? x.raw : null) : (Number.isFinite(x) ? x : null));

/** Flatten Yahoo's nested {raw,fmt} payload into the fields the screener uses. */
function shape(m) {
  const P = m.price || {}, S = m.summaryDetail || {}, K = m.defaultKeyStatistics || {}, F = m.financialData || {}, R = m.summaryProfile || {};
  const pct = (x) => (raw(x) === null ? null : raw(x) * 100);
  const cr = (x) => (raw(x) === null ? null : Number((raw(x) / 1e7).toFixed(2)));   // ₹ → ₹ crore
  const rev = raw(F.totalRevenue), ebitda = raw(F.ebitda);

  return {
    longName: P.longName || P.shortName || null,
    sector: R.sector || null,
    industry: R.industry || null,
    description: R.longBusinessSummary || null,
    employees: raw(R.fullTimeEmployees),
    website: R.website || null,

    marketCapCr: cr(P.marketCap ?? S.marketCap),
    enterpriseValueCr: cr(K.enterpriseValue),
    sharesOutstanding: raw(K.sharesOutstanding),

    pe: raw(S.trailingPE),
    forwardPe: raw(K.forwardPE ?? S.forwardPE),
    pb: raw(K.priceToBook),
    pegRatio: raw(K.pegRatio),
    priceToSales: raw(S.priceToSalesTrailing12Months),
    evEbitda: raw(K.enterpriseToEbitda),
    evRevenue: raw(K.enterpriseToRevenue),

    roe: pct(F.returnOnEquity),
    roa: pct(F.returnOnAssets),
    profitMarginPct: pct(F.profitMargins ?? K.profitMargins),
    operatingMarginPct: pct(F.operatingMargins),
    grossMarginPct: pct(F.grossMargins),
    ebitdaMarginPct: rev && ebitda !== null ? Number(((ebitda / rev) * 100).toFixed(2)) : null,

    // Yahoo reports debtToEquity as a percentage for Indian listings
    debtToEquity: raw(F.debtToEquity) === null ? null : Number((raw(F.debtToEquity) / 100).toFixed(3)),
    currentRatio: raw(F.currentRatio),
    quickRatio: raw(F.quickRatio),
    totalDebtCr: cr(F.totalDebt),
    totalCashCr: cr(F.totalCash),

    revenueCr: cr(F.totalRevenue),
    ebitdaCr: cr(F.ebitda),
    freeCashflowCr: cr(F.freeCashflow),
    operatingCashflowCr: cr(F.operatingCashflow),
    revenueGrowthPct: pct(F.revenueGrowth),
    earningsGrowthPct: pct(F.earningsGrowth),

    eps: raw(K.trailingEps),
    bookValue: raw(K.bookValue),
    dividendYieldPct: (() => {
      const dy = raw(S.dividendYield);
      if (dy !== null) return Number((dy > 1 ? dy : dy * 100).toFixed(2));
      const t = raw(S.trailingAnnualDividendYield);
      return t === null ? null : Number((t * 100).toFixed(2));
    })(),
    payoutRatioPct: pct(S.payoutRatio),

    promoterHoldingPct: pct(K.heldPercentInsiders),
    institutionHoldingPct: pct(K.heldPercentInstitutions),
    beta: raw(K.beta ?? S.beta),
  };
}

// ---------------------------------- main -------------------------------------
const t0 = Date.now();
const uniFile = path.join(DATA, "nse_universe.json");
if (!fs.existsSync(uniFile)) {
  console.error("✗ data/nse_universe.json missing — run: node scripts/fetch_prices.mjs first");
  process.exit(1);
}
let symbols = JSON.parse(fs.readFileSync(uniFile, "utf8")).symbols;
if (LIMIT) symbols = symbols.slice(0, LIMIT);

const todo = symbols.filter((s) => cache.get(s.symbol) === undefined);
console.log(`[fu] ${symbols.length} listed companies · ${symbols.length - todo.length} already cached · fetching ${todo.length}`);
if (!todo.length) { console.log("[fu] nothing to do"); }

let ok = 0, empty = 0, throttled = 0;
let consecutiveFails = 0;

/** Re-negotiate the crumb, waiting out a throttle if Yahoo is refusing. */
async function ensureCrumb(patient = true) {
  if (yahooCrumb()) return true;
  for (let i = 0; i < (patient ? 6 : 1); i++) {
    const { crumb } = await yahooAuth();
    if (crumb) return true;
    const wait = 30_000 * (i + 1);
    console.log(`\n[fu] no crumb (rate limited) — waiting ${Math.round(wait / 1000)}s…`);
    await sleep(wait);
  }
  return false;
}

if (todo.length && !(await ensureCrumb())) {
  console.error("[fu] ✗ could not obtain a Yahoo crumb — the endpoint is throttling this IP.");
  console.error("[fu]   Existing cached fundamentals are still written to the snapshot below.");
}

for (const [i, s] of todo.entries()) {
  if (!yahooCrumb()) {
    if (!(await ensureCrumb())) break;
  }
  let rec = null;
  try {
    const j = await getJson(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(s.symbol)}.NS?modules=${MODULES}&crumb=${encodeURIComponent(yahooCrumb())}`,
      { headers: yahooHeaders(), retries: 1, timeout: 20_000 },
    );
    const m = j?.quoteSummary?.result?.[0];
    rec = m ? shape(m) : null;
    if (rec) { ok++; consecutiveFails = 0; SPACING = Math.max(700, SPACING - 25); }
    else { empty++; consecutiveFails++; }
    cache.set(s.symbol, rec);
  } catch (e) {
    consecutiveFails++;
    throttled++;
    // Back off hard and re-handshake: a burst of failures means a fresh throttle
    if (consecutiveFails >= 4) {
      SPACING = Math.min(6000, SPACING * 2);
      console.log(`\n[fu] backing off to ${SPACING}ms after ${consecutiveFails} failures…`);
      await sleep(20_000);
      await yahooAuth();
      consecutiveFails = 0;
    }
  }
  if ((i + 1) % 20 === 0 || i === todo.length - 1) {
    process.stdout.write(`\r[fu] ${bar(i + 1, todo.length)} · ok ${ok} · no data ${empty} · errors ${throttled} · ${SPACING}ms   `);
  }
  await sleep(SPACING);
}
if (todo.length) process.stdout.write("\n");

// ------------------------------ write snapshot -------------------------------
const out = {};
let covered = 0;
for (const s of symbols) {
  const rec = cache.getStale(s.symbol);
  if (rec) { out[s.symbol] = rec; covered++; }
}
fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(path.join(DATA, "fundamentals_wide.json"), JSON.stringify({
  generated: new Date().toISOString(),
  source: "Yahoo Finance quoteSummary (<SYMBOL>.NS)",
  covered, universe: symbols.length,
  companies: out,
}));

console.log(`[fu] done in ${fmtDuration(Date.now() - t0)} · snapshot has ${covered}/${symbols.length} companies (${((covered / symbols.length) * 100).toFixed(1)}%)`);
console.log("[fu] wrote data/fundamentals_wide.json — commit this so CI never needs the API");
