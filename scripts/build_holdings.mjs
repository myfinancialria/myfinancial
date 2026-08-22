#!/usr/bin/env node
// ---------------------------------------------------------------------------
// build_holdings.mjs — turn cached disclosures into published holdings.
//
//   var/holdings/<amc>/<kind>-<date>.xls   raw filings
//        ↓  parse (scripts/lib/portfolio.mjs)
//        ↓  match each disclosed scheme to its AMFI scheme code
//        ↓  join each holding to the NSE universe by ISIN
//        ↓
//   dist/data/holdings/<code>.json   one scheme's holdings + its nearest funds
//   dist/data/holdings.json          index: who has holdings, as at when
//
// The matching step is the awkward one. A disclosure names a PORTFOLIO
// ("Nippon India Growth Mid Cap Fund"); AMFI names a PLAN ("... - Direct Plan
// - Growth"). One portfolio backs several plans, so the name is the only join
// available and it has to be normalised before it will meet. Anything that
// does not match is reported, never guessed at — a scheme silently attached to
// the wrong portfolio is worse than one with no holdings.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { parseWorkbook, isIndianEquityIsin } from "./lib/portfolio.mjs";
import { overlapPct, commonHoldings } from "../shared/overlap.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VAR = path.join(ROOT, "var", "holdings");
const OUT = path.join(ROOT, "dist", "data");

const readJson = (p, fb = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; } };
const r2 = (x, d = 2) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(d)) : null);

/* ------------------------------- matching --------------------------------- */
/**
 * Reduce a scheme name to the portfolio it identifies: drop the plan and
 * option words, the punctuation and the filler, so "NIPPON INDIA BANKING &
 * FINANCIAL SERVICES FUND" and "Nippon India Banking and Financial Services
 * Fund - Direct Plan - Growth Option" collapse to the same key.
 */
export function normaliseSchemeName(s) {
  return String(s || "")
    // Nippon appends a risk descriptor to some disclosed names, e.g.
    // "Nippon India Floater Fund . Relatively High interest rate risk..."
    .replace(/\s+\.\s+relatively\s.*$/i, "")
    .replace(/\s*\([^)]*segregated[^)]*\)\s*/gi, " ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(direct|regular)\b/g, " ")
    .replace(/\b(plan|option|growth|idcw|dividend|payout|reinvestment|re-investment)\b/g, " ")
    .replace(/\b(an?|the|of|for|scheme)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (s) => normaliseSchemeName(s).split(" ").filter((t) => t.length > 2);

/**
 * Two tokens are the same word if one abbreviates the other. Disclosures
 * truncate to fit a cell — "Groww Nifty Non-Cycl Consumer Index Fund" is the
 * same portfolio as AMFI's "...Non-Cyclical Consumer Index Fund" — so exact
 * token equality misses real matches. Four characters of shared prefix is
 * enough to be safe while still joining cycl/cyclical and infra/infrastructure.
 */
const sameWord = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** Jaccard over name tokens, abbreviation-aware. */
function similarity(a, b) {
  const A = tokens(a), B = [...tokens(b)];
  if (!A.length || !B.length) return 0;
  let inter = 0;
  const used = new Set();
  for (const t of A) {
    const k = B.findIndex((u, i) => !used.has(i) && sameWord(t, u));
    if (k >= 0) { used.add(k); inter++; }
  }
  return inter / (A.length + B.length - inter);
}

/**
 * ETF, index fund and fund-of-fund versions of the same index are DIFFERENT
 * products with different portfolios, and their names differ by one word.
 * "Groww Nifty India Railways PSU ETF" must never be handed the holdings of
 * "Groww Nifty India Railways PSU Index Fund".
 */
const productType = (name) => {
  const n = String(name).toLowerCase();
  if (/\bfof\b|fund of funds?/.test(n)) return "FOF";
  if (/\betf\b|exchange traded/.test(n)) return "ETF";
  // Everything else is one bucket on purpose. Splitting "index fund" out
  // over-partitioned: a disclosure that truncates "... PSU Index Fund" to
  // "... PSU Index" then had no eligible candidates at all.
  return "OPEN";
};

/** Best AMFI scheme for a disclosed portfolio, or null when nothing is close. */
export function matchScheme(disclosedName, candidates) {
  const key = normaliseSchemeName(disclosedName);
  const type = productType(disclosedName);
  const eligible = candidates.filter((c) => productType(c.name) === type);

  const exact = eligible.filter((c) => normaliseSchemeName(c.name) === key);
  if (exact.length) return { scheme: exact[0], score: 1, plans: exact.length };

  let best = null, bestScore = 0;
  for (const c of eligible) {
    const s = similarity(disclosedName, c.name);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  // 0.8 keeps "Nippon India Growth Fund" from being handed to "Nippon India
  // Growth Mid Cap Fund". Below that, report it rather than guess.
  return bestScore >= 0.8 ? { scheme: best, score: r2(bestScore), plans: 1 } : null;
}

/* --------------------------------- build ---------------------------------- */
const t0 = Date.now();
console.log("── building holdings ───────────────────────────────────────");

const manifest = readJson(path.join(VAR, "manifest.json"), { files: {} });
const entries = Object.entries(manifest.files || {});
if (!entries.length) {
  console.log("[holdings] no disclosures cached — run scripts/fetch_holdings.mjs first");
  process.exit(0);
}

// Which filing to read per AMC.
//
// NOT simply the newest. SEBI mandates fortnightly disclosure for DEBT schemes
// and monthly for everything, so an AMC's fortnightly file covers a subset:
// Nippon's fortnightly has 39 sheets against 108 in the monthly. Preferring
// the newer file therefore loses two thirds of the schemes, and nearly all the
// equity ones — which are the only ones this feature is about.
//
// So: the newest MONTHLY is the base, and a newer fortnightly is layered on
// top for the schemes it does cover. Best coverage and best freshness, per
// scheme rather than per file.
const sources = new Map();          // amc -> [{ base }, ...overlays]
for (const [rel, m] of entries) {
  const cur = sources.get(m.amc) ?? { base: null, overlays: [] };
  if (m.kind === "MONTHLY") {
    if (!cur.base || m.date > cur.base.date) cur.base = { ...m, rel };
  } else {
    cur.overlays.push({ ...m, rel });
  }
  sources.set(m.amc, cur);
}
const newest = new Map();
for (const [amc, s] of sources) {
  const chosen = [];
  if (s.base) chosen.push(s.base);
  // only overlays NEWER than the monthly are worth reading
  for (const o of s.overlays.sort((a, b) => a.date.localeCompare(b.date)))
    if (!s.base || o.date > s.base.date) chosen.push(o);
  if (chosen.length) newest.set(amc, chosen);
}

const funds = readJson(path.join(OUT, "funds.json"));
const stocks = readJson(path.join(OUT, "stocks.json"));
if (!funds || !stocks) { console.log("[holdings] run build_screener.mjs first"); process.exit(1); }

const fF = Object.fromEntries(funds.fields.map((k, i) => [k, i]));
const fundRows = funds.rows.map((r) => ({ code: String(r[fF.code]), name: r[fF.name], amc: r[fF.amc], category: r[fF.category], categoryGroup: r[fF.categoryGroup] }));

const sF = Object.fromEntries(stocks.fields.map((k, i) => [k, i]));
const byIsin = new Map();
for (const r of stocks.rows) {
  const isin = r[sF.isin];
  if (isin) byIsin.set(String(isin).toUpperCase(), { symbol: r[sF.symbol], name: r[sF.name], sector: r[sF.sectorGroup] ?? r[sF.sector], industry: r[sF.industry] });
}
console.log(`[holdings] NSE universe: ${byIsin.size} companies keyed by ISIN`);

const built = [];
const unmatched = [];

const seen = new Map();             // code -> asOn already published

for (const [amc, filings] of newest) {
 const candidates = fundRows.filter((f) => normaliseSchemeName(f.amc) === normaliseSchemeName(amc));

 for (const m of filings) {
  const file = path.join(VAR, m.rel);
  if (!fs.existsSync(file)) continue;
  const wb = XLSX.readFile(file);
  const sheets = wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: null })]);
  const { schemes, skipped } = parseWorkbook(sheets, { amc });

  let matched = 0, refreshed = 0;

  for (const s of schemes) {
    const hit = matchScheme(s.schemeName, candidates);
    if (!hit) { unmatched.push({ amc, disclosed: s.schemeName, holdings: s.holdings.length }); continue; }
    const asOn = s.asOn ?? m.date;
    const prior = seen.get(hit.scheme.code);
    if (prior && prior >= asOn) continue;         // an older filing cannot replace a newer one
    if (prior) refreshed++; else matched++;
    seen.set(hit.scheme.code, asOn);

    const holdings = s.holdings.map((h) => {
      const co = isIndianEquityIsin(h.isin) ? byIsin.get(h.isin.toUpperCase()) : null;
      return {
        isin: h.isin, name: h.name, industry: h.industry,
        pct: r2(h.pct, 3), valueLakh: r2(h.marketValueLakh, 1), section: h.section,
        symbol: co?.symbol ?? null, sector: co?.sector ?? null,
      };
    }).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

    const idx = built.findIndex((b) => b.code === hit.scheme.code);
    const rec = {
      code: hit.scheme.code, name: hit.scheme.name, amc, category: hit.scheme.category,
      categoryGroup: hit.scheme.categoryGroup,
      asOn, kind: m.kind, matchScore: hit.score,
      disclosedAs: s.schemeName,
      holdings,
      counts: {
        total: holdings.length,
        equity: holdings.filter((h) => h.section === "EQUITY").length,
        mapped: holdings.filter((h) => h.symbol).length,
      },
      equityPct: r2(s.equityPct, 2),
      investedPct: r2(s.investedPct, 2),
    };
    if (idx >= 0) built[idx] = rec; else built.push(rec);
  }
  console.log(`  ${amc.padEnd(15)} ${m.kind.toLowerCase().padEnd(12)} ${m.date} · ${schemes.length} disclosed · ${matched} new · ${refreshed} refreshed · ${skipped.length} skipped`);
 }
}

/* ----------------------------- overlap index ------------------------------ */
// Precomputed because a fund page cannot download every other fund to work out
// what it resembles. Only equity-oriented schemes are compared: overlap between
// two liquid funds is a statement about the money market, not about a choice
// the investor made.
const equity = built.filter((b) => (b.equityPct ?? 0) > 40 && b.counts.equity > 4);
console.log(`[holdings] comparing ${equity.length} equity-oriented schemes pairwise (${(equity.length * (equity.length - 1) / 2).toLocaleString("en-IN")} pairs)`);

const nearest = new Map(built.map((b) => [b.code, []]));
for (let i = 0; i < equity.length; i++) {
  for (let j = i + 1; j < equity.length; j++) {
    const a = equity[i], b = equity[j];
    if (a.code === b.code) continue;
    const pct = overlapPct(a, b);
    if (pct < 10) continue;
    nearest.get(a.code).push({ code: b.code, name: b.name, amc: b.amc, pct: r2(pct, 1) });
    nearest.get(b.code).push({ code: a.code, name: a.name, amc: a.amc, pct: r2(pct, 1) });
  }
}
for (const [code, list] of nearest) {
  list.sort((x, y) => y.pct - x.pct);
  nearest.set(code, list.slice(0, 12));
}

/* --------------------------------- emit ----------------------------------- */
fs.rmSync(path.join(OUT, "holdings"), { recursive: true, force: true });
let bytes = 0;
for (const b of built) {
  const file = path.join(OUT, "holdings", `${b.code}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...b, nearest: nearest.get(b.code) ?? [] }));
  bytes += fs.statSync(file).size;
}

const index = {
  generated: new Date().toISOString(),
  // `newest` holds an array of filings per AMC (monthly base + any newer
  // fortnightly), so it has to be flattened rather than mapped.
  amcs: [...newest.values()].flat().map((m) => ({ amc: m.amc, kind: m.kind, asOn: m.date }))
    .sort((a, b) => a.amc.localeCompare(b.amc) || a.asOn.localeCompare(b.asOn)),
  asOn: [...newest.values()].flat().map((m) => m.date).sort().pop() ?? null,
  count: built.length,
  schemes: built.map((b) => ({
    code: b.code, name: b.name, amc: b.amc, asOn: b.asOn, kind: b.kind,
    holdings: b.counts.total, equity: b.counts.equity, equityPct: b.equityPct,
    top: b.holdings.filter((h) => h.section === "EQUITY").slice(0, 5).map((h) => ({ n: h.name, p: h.pct, s: h.symbol })),
  })),
};
fs.writeFileSync(path.join(OUT, "holdings.json"), JSON.stringify(index));

const mapped = built.reduce((a, b) => a + b.counts.mapped, 0);
const totalEq = built.reduce((a, b) => a + b.counts.equity, 0);
console.log("────────────────────────────────────────────────────────────");
console.log(`[holdings] ${built.length} schemes published · ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`[holdings] ${mapped}/${totalEq} equity holdings matched to an NSE company (${(mapped / Math.max(1, totalEq) * 100).toFixed(1)}%)`);
if (unmatched.length) {
  // Most of these are expected: the fund universe is Direct-Growth open-ended
  // schemes, and an ETF has neither a Direct plan nor a Growth option, so it is
  // not in it to match against. Separating them keeps a real miss visible
  // instead of buried in a list of things that were never going to match.
  const etf = unmatched.filter((u) => /\betf\b|exchange traded/i.test(u.disclosed));
  const real = unmatched.filter((u) => !etf.includes(u));
  console.log(`[holdings] ${etf.length} ETFs skipped — not part of the Direct-Growth universe`);
  if (real.length) {
    console.log(`[holdings] ${real.length} disclosed portfolios found no scheme to attach to:`);
    for (const u of real.slice(0, 10)) console.log(`             ${u.amc} · ${u.disclosed.slice(0, 58)} (${u.holdings} holdings)`);
  } else {
    console.log("[holdings] every non-ETF portfolio matched a scheme");
  }
}
console.log(`[holdings] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
