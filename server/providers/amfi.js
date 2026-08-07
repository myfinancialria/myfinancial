// ---------------------------------------------------------------------------
// amfi.js — the whole-of-India mutual fund universe, live and free.
//
// Node port of myfinancialria/myfinancial-advisor's mf_data.py pipeline:
//   1. AMFI NAVAll.txt  → every scheme + today's NAV (official, free)
//   2. keep Direct + Growth only (RIA model — zero commission), drop IDCW noise
//   3. bucket into the advisor's asset-class taxonomy
//   4. enrich on demand from mfapi.in → CAGR 1/3/5y + annualised vol (cached)
//   5. rank per category → 1–5 stars
//
// Everything degrades gracefully offline: the app's curated synthetic universe
// keeps working; this layer adds the full live market when the network allows.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { round1, round2 } from "../lib/util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAR = path.join(__dirname, "..", "..", "var");
const NAV_CACHE = path.join(VAR, "amfi_navall.txt");
const ENRICH_CACHE = path.join(VAR, "mfapi_enrich.json");
const AMFI_URL = "https://www.amfiindia.com/spages/NAVAll.txt";
const MFAPI = (code) => `https://api.mfapi.in/mf/${code}`;
const NAV_MAX_AGE_MS = 12 * 3600_000;

// --- taxonomy (ported verbatim from mf_data.py) ------------------------------
export const CATEGORIES = {
  equity_largecap: ["equity", 12.0, 16.0, "Large Cap"],
  equity_largemid: ["equity", 13.0, 18.0, "Large & Mid Cap"],
  equity_flexi: ["equity", 13.0, 17.0, "Flexi / Multi Cap"],
  equity_midcap: ["equity", 14.0, 20.0, "Mid Cap"],
  equity_smallcap: ["equity", 15.0, 24.0, "Small Cap"],
  equity_index: ["equity", 11.5, 16.0, "Index / ETF FoF"],
  equity_value: ["equity", 13.0, 18.0, "Value / Contra"],
  equity_thematic: ["equity", 14.0, 22.0, "Sectoral / Thematic"],
  elss: ["equity", 13.0, 17.0, "ELSS (tax-saver)"],
  hybrid_aggressive: ["hybrid", 11.0, 12.0, "Aggressive Hybrid"],
  hybrid_balanced: ["hybrid", 9.5, 8.0, "Balanced Advantage"],
  hybrid_conservative: ["hybrid", 8.5, 5.0, "Conservative Hybrid"],
  hybrid_multiasset: ["hybrid", 10.0, 9.0, "Multi Asset"],
  hybrid_equitysaving: ["hybrid", 8.5, 5.5, "Equity Savings"],
  debt_corporate: ["debt", 7.5, 3.0, "Corporate Bond"],
  debt_banking_psu: ["debt", 7.4, 2.8, "Banking & PSU"],
  debt_gilt: ["debt", 7.3, 4.0, "Gilt"],
  debt_dynamic: ["debt", 7.4, 3.5, "Dynamic Bond"],
  debt_short: ["debt", 7.0, 2.0, "Short Duration"],
  debt_ultrashort: ["debt", 6.8, 1.2, "Ultra Short / Low Dur"],
  debt_moneymarket: ["debt", 6.9, 1.0, "Money Market"],
  debt_liquid: ["debt", 6.5, 0.7, "Liquid / Overnight"],
  gold: ["gold", 9.0, 14.0, "Gold / Silver"],
  other: ["other", 7.0, 8.0, "Other"],
};

// sleeves the basket engine recommends from
export const RECO_BUCKETS = {
  equityCore: ["equity_index", "equity_largecap"],
  equityGrowth: ["equity_flexi", "equity_largemid"],
  equityAggressive: ["equity_midcap", "equity_smallcap"],
  debt: ["debt_corporate", "debt_banking_psu", "debt_short"],
  liquid: ["debt_liquid", "debt_moneymarket"],
  gold: ["gold"],
};

export function bucketOf(rawCat, name) {
  const c = `${rawCat} ${name}`.toLowerCase();
  if (c.includes("overnight") || c.includes("liquid")) return "debt_liquid";
  if (c.includes("money market")) return "debt_moneymarket";
  if (c.includes("ultra short") || c.includes("low duration")) return "debt_ultrashort";
  if (c.includes("banking") && c.includes("psu")) return "debt_banking_psu";
  if (c.includes("gilt") || c.includes("government securities")) return "debt_gilt";
  if (c.includes("dynamic bond")) return "debt_dynamic";
  if (c.includes("corporate bond")) return "debt_corporate";
  if (c.includes("short duration") || c.includes("short term")) return "debt_short";
  if (c.includes("gold") || c.includes("silver")) return "gold";
  if (c.includes("balanced advantage") || c.includes("dynamic asset")) return "hybrid_balanced";
  if (c.includes("aggressive hybrid") || c.includes("equity & debt") || c.includes("equity and debt")) return "hybrid_aggressive";
  if (c.includes("conservative hybrid")) return "hybrid_conservative";
  if (c.includes("multi asset")) return "hybrid_multiasset";
  if (c.includes("equity savings") || c.includes("arbitrage")) return "hybrid_equitysaving";
  if (c.includes("elss") || c.includes("tax saver")) return "elss";
  if (c.includes("index") || c.includes("nifty") || c.includes("sensex") || c.includes("etf")) return "equity_index";
  if (c.includes("small cap")) return "equity_smallcap";
  if (c.includes("mid cap") || c.includes("midcap")) return "equity_midcap";
  if (c.includes("large & mid") || c.includes("large and mid")) return "equity_largemid";
  if (c.includes("large cap") || c.includes("bluechip") || c.includes("blue chip")) return "equity_largecap";
  if (c.includes("value") || c.includes("contra") || c.includes("dividend yield")) return "equity_value";
  if (/sectoral|thematic|infrastructure|pharma|technology|consumption|banking/.test(c)) return "equity_thematic";
  if (c.includes("flexi cap") || c.includes("multi cap") || c.includes("multicap") || c.includes("focused")) return "equity_flexi";
  if (c.includes("equity")) return "equity_flexi";
  if (/debt|bond|duration|credit/.test(c)) return "debt_short";
  return "other";
}

// --- fetch & parse -----------------------------------------------------------
let universe = null;            // { generated, navDate, source, funds: [...] }
let building = null;
const enrichCache = loadJson(ENRICH_CACHE) || {};   // code → {r1,r3,r5,vol,nav,at}
let enrichInFlight = 0;

function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function saveJson(p, v) { try { fs.mkdirSync(VAR, { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); } catch { /* best-effort cache */ } }

async function fetchText(url, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "myfinancial/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

async function navAllText() {
  try {
    const st = fs.statSync(NAV_CACHE);
    if (Date.now() - st.mtimeMs < NAV_MAX_AGE_MS) return fs.readFileSync(NAV_CACHE, "utf8");
  } catch { /* no cache yet */ }
  const text = await fetchText(AMFI_URL);
  if (text.length < 100_000) throw new Error("AMFI payload suspiciously small");
  fs.mkdirSync(VAR, { recursive: true });
  fs.writeFileSync(NAV_CACHE, text);
  return text;
}

function parseNavAll(text) {
  const rows = [];
  let curCat = "", curAmc = "";
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line) continue;
    if (!line.includes(";")) {
      if (line.includes("Scheme") && line.includes("(")) curCat = line;
      else if (line.includes("Mutual Fund")) curAmc = line;
      continue;
    }
    const parts = line.split(";");
    if (parts.length < 6 || parts[0] === "Scheme Code") continue;
    const [code, , , name, nav, dt] = parts;
    const nl = name.toLowerCase();
    if (!nl.includes("direct") || !nl.includes("growth")) continue;
    if (/idcw|dividend|bonus|segregated/.test(nl)) continue;
    const navf = parseFloat(nav);
    if (!isFinite(navf)) continue;
    rows.push({ code: code.trim(), name: name.trim(), amc: curAmc.replace(/ Mutual Fund$/i, ""), rawCat: curCat, nav: navf, navDate: dt.trim() });
  }
  return rows;
}

/** Build (or return cached) full Direct-Growth universe. */
export async function getUniverse() {
  if (universe && Date.now() - universe.builtAt < NAV_MAX_AGE_MS) return universe;
  if (building) return building;
  building = (async () => {
    const text = await navAllText();
    const rows = parseNavAll(text);
    const funds = rows.map((r, i) => {
      const bucket = bucketOf(r.rawCat, r.name);
      const [assetClass, expReturn, expVol, catLabel] = CATEGORIES[bucket];
      const e = enrichCache[r.code];
      return {
        id: `A${String(i).padStart(5, "0")}`, code: r.code, name: r.name, amc: r.amc,
        bucket, assetClass, category: catLabel, expReturn, expVol,
        nav: r.nav, navDate: r.navDate,
        r1: e?.r1 ?? null, r3: e?.r3 ?? null, r5: e?.r5 ?? null, vol: e?.vol ?? null,
        enriched: !!e,
      };
    });
    rankUniverse(funds);
    universe = { builtAt: Date.now(), navDate: rows[0]?.navDate || null, source: "amfi", count: funds.length, funds };
    console.log(`  amfi: parsed ${funds.length} Direct-Growth schemes (NAV date ${universe.navDate})`);
    return universe;
  })().finally(() => { building = null; });
  return building;
}

function rankUniverse(funds) {
  const byCat = {};
  for (const f of funds) if (f.r3 !== null || f.r1 !== null) (byCat[f.bucket] ??= []).push(f);
  for (const group of Object.values(byCat)) {
    group.sort((a, b) => (b.r3 ?? b.r1 ?? -99) - (a.r3 ?? a.r1 ?? -99));
    const n = group.length;
    group.forEach((f, i) => {
      f.rankInCat = i + 1; f.catSize = n;
      const pct = n > 1 ? i / n : 0;
      f.stars = pct < 0.2 ? 5 : pct < 0.4 ? 4 : pct < 0.6 ? 3 : pct < 0.8 ? 2 : 1;
    });
  }
}

// --- mfapi enrichment (bounded, cached, on demand) ---------------------------
export async function enrich(code) {
  const cached = enrichCache[code];
  if (cached && Date.now() - cached.at < 3 * 86400_000) return cached;
  if (enrichInFlight > 6) return cached || null;                 // politeness cap
  enrichInFlight++;
  try {
    const raw = JSON.parse(await fetchText(MFAPI(code), 10000));
    const hist = (raw.data || []).map((h) => ({ d: parseDMY(h.date), nav: parseFloat(h.nav) }))
      .filter((x) => x.d && isFinite(x.nav)).sort((a, b) => a.d - b.d);
    if (hist.length < 30) return null;
    const [latest] = hist.slice(-1);
    const cagr = (years) => {
      const target = latest.d - years * 365.25 * 86400_000;
      let best = null;
      for (const h of hist) if (!best || Math.abs(h.d - target) < Math.abs(best.d - target)) best = h;
      if (!best || Math.abs(best.d - target) > 60 * 86400_000 || best.nav <= 0) return null;
      return round1((Math.pow(latest.nav / best.nav, 1 / years) - 1) * 100);
    };
    const navs = hist.slice(-260).map((h) => h.nav);
    const rets = [];
    for (let i = 1; i < navs.length; i++) if (navs[i - 1] > 0) rets.push(navs[i] / navs[i - 1] - 1);
    let vol = null;
    if (rets.length > 20) {
      const m = rets.reduce((a, b) => a + b, 0) / rets.length;
      const v = rets.reduce((a, x) => a + (x - m) ** 2, 0) / (rets.length - 1);
      vol = round1(Math.sqrt(v) * Math.sqrt(252) * 100);
    }
    const entry = { r1: cagr(1), r3: cagr(3), r5: cagr(5), vol, nav: round2(latest.nav), at: Date.now(), meta: raw.meta || null };
    enrichCache[code] = entry;
    saveJson(ENRICH_CACHE, enrichCache);
    // reflect into the in-memory universe row
    const f = universe?.funds.find((x) => x.code === code);
    if (f) { Object.assign(f, { r1: entry.r1, r3: entry.r3, r5: entry.r5, vol: entry.vol, enriched: true }); rankUniverse(universe.funds); }
    return entry;
  } catch { return cached || null; }
  finally { enrichInFlight--; }
}

const parseDMY = (s) => {
  const [d, m, y] = String(s).split("-").map(Number);
  return d && m && y ? Date.UTC(y, m - 1, d) : null;
};

/** Full NAV history for charts. */
export async function schemeHistory(code) {
  const raw = JSON.parse(await fetchText(MFAPI(code), 12000));
  const navs = (raw.data || []).map((h) => ({ time: Math.floor((parseDMY(h.date) || 0) / 1000), value: parseFloat(h.nav) }))
    .filter((x) => x.time && isFinite(x.value)).sort((a, b) => a.time - b.time);
  return { meta: raw.meta || {}, navs };
}

/** Screener over the live universe. */
export async function screen({ q = "", bucket = "", assetClass = "", minStars = 0, sort = "r3", dir = "desc", limit = 200, enrichTop = 0 } = {}) {
  const u = await getUniverse();
  const ql = q.toLowerCase();
  let rows = u.funds.filter((f) =>
    (!ql || f.name.toLowerCase().includes(ql) || f.amc.toLowerCase().includes(ql)) &&
    (!bucket || f.bucket === bucket) &&
    (!assetClass || f.assetClass === assetClass) &&
    (f.stars ?? 0) >= minStars);
  const key = ["r1", "r3", "r5", "vol", "nav", "stars"].includes(sort) ? sort : "r3";
  rows.sort((a, b) => (dir === "asc" ? (a[key] ?? 1e9) - (b[key] ?? 1e9) : (b[key] ?? -1e9) - (a[key] ?? -1e9)));
  const out = rows.slice(0, limit);
  // opportunistically enrich the top visible unenriched rows (fire & forget)
  if (enrichTop > 0) out.filter((f) => !f.enriched).slice(0, enrichTop).forEach((f) => enrich(f.code));
  return { navDate: u.navDate, total: rows.length, count: out.length, funds: out };
}

/** Top-ranked live funds for a set of buckets (basket construction). */
export async function topForBuckets(buckets, n = 1) {
  const u = await getUniverse();
  const picks = [];
  for (const b of buckets) {
    const cands = u.funds.filter((f) => f.bucket === b && f.r3 !== null).sort((a, b2) => (b2.r3 ?? -99) - (a.r3 ?? -99));
    picks.push(...cands.slice(0, n));
  }
  return picks;
}

export function statusSync() {
  return universe
    ? { ready: true, count: universe.count, navDate: universe.navDate, enriched: Object.keys(enrichCache).length }
    : { ready: false, enriched: Object.keys(enrichCache).length };
}

/**
 * Boot warmup: gently enrich a spread of schemes across the buckets the basket
 * engine and screener lean on, so first paint shows real returns. ~1 call per
 * 450 ms in the background; resumes where it left off thanks to the cache.
 */
export async function warmup({ perBucket = 8 } = {}) {
  try {
    const u = await getUniverse();
    const targets = [];
    const KEY_BUCKETS = ["equity_index", "equity_largecap", "equity_flexi", "equity_largemid", "equity_midcap", "equity_smallcap", "elss", "hybrid_aggressive", "hybrid_balanced", "debt_corporate", "debt_short", "debt_liquid", "gold"];
    for (const b of KEY_BUCKETS) {
      // prefer recognisable AMCs so the shortlists look like the funds people know
      const rows = u.funds.filter((f) => f.bucket === b && !f.enriched)
        .sort((a, b2) => Number(/hdfc|icici|sbi|nippon|uti|axis|kotak|mirae|parag|motilal|quant|tata|aditya/i.test(b2.amc + b2.name)) - Number(/hdfc|icici|sbi|nippon|uti|axis|kotak|mirae|parag|motilal|quant|tata|aditya/i.test(a.amc + a.name)))
        .reverse().slice(0, perBucket);
      targets.push(...rows);
    }
    console.log(`  amfi: warmup enriching ${targets.length} schemes in background…`);
    for (const f of targets) {
      await enrich(f.code);
      await new Promise((r) => setTimeout(r, 450));
    }
    console.log(`  amfi: warmup done (${Object.keys(enrichCache).length} schemes enriched total)`);
  } catch (e) { console.log("  amfi: warmup skipped —", String(e.message).slice(0, 80)); }
}
