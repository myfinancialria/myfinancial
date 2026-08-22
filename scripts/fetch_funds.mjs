#!/usr/bin/env node
// ---------------------------------------------------------------------------
// fetch_funds.mjs — every mutual fund scheme in India, with its full NAV history.
//
//   AMFI NAVAll.txt   the official universe + today's NAV for every scheme
//   mfapi.in          each scheme's complete published NAV history (to 2006+)
//                     and its SEBI scheme category, which beats guessing the
//                     category from the scheme's marketing name
//
// The universe is Direct plans, Growth option: that is one row per real scheme.
// The same portfolio also exists as Regular (pays distributor commission, so it
// always underperforms its own Direct twin) and as IDCW (same portfolio, payout
// instead of accumulation) — indexing those would multiply the rows sevenfold
// without adding a single distinct fund to choose between.
//
//   node scripts/fetch_funds.mjs                 # everything, resumable
//   node scripts/fetch_funds.mjs --limit 50      # a slice while developing
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getText, getJson, pool, makeCache, fmtDuration, bar } from "./lib/net.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VAR = path.join(ROOT, "var");

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? (argv[i + 1] ?? true) : d; };
const LIMIT = Number(arg("limit", 0)) || 0;
const FORCE = argv.includes("--force");
const CONCURRENCY = Number(arg("concurrency", 8)) || 8;

// NAV history is append-only, so a day-old copy is only ever missing one point.
const histCache = makeCache(path.join(VAR, "mfhist"), FORCE ? -1 : 20);

// AMFI moved this file to portal.amfiindia.com; the old host now 302s here.
const AMFI_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

// --------------------------- the AMFI universe -------------------------------
async function navAllText() {
  const cacheFile = path.join(VAR, "amfi_navall.txt");
  try {
    const st = fs.statSync(cacheFile);
    if (!FORCE && Date.now() - st.mtimeMs < 10 * 3600_000) return fs.readFileSync(cacheFile, "utf8");
  } catch { /* fetch below */ }
  const text = await getText(AMFI_URL, { accept: "text/plain", timeout: 60_000, retries: 3 });
  if (!text || text.length < 500_000) throw new Error("AMFI NAVAll looks truncated");
  fs.mkdirSync(VAR, { recursive: true });
  fs.writeFileSync(cacheFile, text);
  return text;
}

const AMFI_MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const parseAmfiDate = (s) => {
  const m = String(s || "").trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  const mon = m ? AMFI_MON[m[2].toLowerCase()] : undefined;
  return mon === undefined ? null : Date.UTC(+m[3], mon, +m[1]);
};

/**
 * Parse NAVAll.
 *
 * The layout is not stable. It used to be six semicolon-separated columns with
 * the plan and option buried in the scheme name ("... - Direct Plan - Growth").
 * In August 2026 AMFI split those into their own `Plan` and `Option` columns
 * and stripped them out of the name — which silently reduced a name-matching
 * filter to zero schemes and took the nightly build down for four days.
 *
 * So columns are located by their HEADER rather than by position, and a scheme
 * counts as Direct-Growth if either the dedicated columns say so or, on the
 * older layout, the name does. That survives the change in both directions.
 *
 * The AMC and the SEBI scheme-type still arrive as bare heading lines above the
 * rows they apply to, so parsing has to carry that context downward.
 */
/**
 * Strip AMFI's regulatory footnote from a scheme name. "(Existing Number of
 * Segregated Portfolios - 2)" is a disclosure about the scheme, not part of
 * what it is called, and leaving it in stops the name matching anything.
 */
function cleanSchemeName(name) {
  return String(name)
    .replace(/\s*\([^)]*segregated[^)]*\)\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseNavAll(text) {
  const lines = text.split("\n");
  const header = lines.find((l) => /scheme\s*code/i.test(l) && l.includes(";")) || "";
  const cols = header.split(";").map((h) => h.trim().toLowerCase());
  const at = (...names) => {
    for (const n of names) {
      const i = cols.findIndex((c) => c === n || c.startsWith(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const iCode = at("scheme code");
  const iIsin = at("isin div payout", "isin");
  const iName = at("scheme name");
  const iPlan = at("plan");
  const iOption = at("option");
  const iNav = at("net asset value", "nav");
  const iDate = at("date");
  if (iCode < 0 || iName < 0 || iNav < 0 || iDate < 0) {
    throw new Error(`NAVAll header not recognised: "${header.slice(0, 120)}"`);
  }

  const rows = [];
  let curType = "", curAmc = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.includes(";")) {
      if (/scheme/i.test(line) && line.includes("(")) curType = line;
      else if (/mutual fund/i.test(line)) curAmc = line;
      continue;
    }
    const parts = line.split(";").map((x) => x.trim());
    if (parts[iCode] === undefined || /^scheme code$/i.test(parts[iCode])) continue;

    const name = parts[iName] || "";
    const plan = iPlan >= 0 ? (parts[iPlan] || "") : "";
    const option = iOption >= 0 ? (parts[iOption] || "") : "";

    // Direct + Growth, however this edition of the file chooses to say it.
    const hay = `${plan} ${option}`.toLowerCase();
    const fromCols = plan && option && hay.includes("direct") && hay.includes("growth");
    const fromName = !plan && !option
      && name.toLowerCase().includes("direct") && name.toLowerCase().includes("growth");
    if (!fromCols && !fromName) continue;
    // IDCW is a different option on the same portfolio, never a growth plan.
    if (/idcw|dividend|bonus/i.test(`${name} ${option}`)) continue;

    // Side-pockets vs their parent scheme. AMFI writes BOTH into the name and
    // they look alike, so the old blanket /segregated/ test threw away nine
    // live Direct-Growth schemes — Nippon's Aggressive Hybrid and Equity
    // Savings, Franklin's Credit Risk among them.
    //
    //   parent      "... Fund (Existing Number of Segregated Portfolios - 2)"
    //   side-pocket "UTI - Credit Risk Fund (Segregated - 06032020)"
    //
    // The parent states a COUNT; the side-pocket carries the DATE it was
    // carved out on. Only the latter is a separate instrument.
    if (/segregated\s*[-–—]?\s*\d{6,8}\b/i.test(name)) continue;

    const navf = parseFloat(parts[iNav]);
    if (!Number.isFinite(navf) || navf <= 0) continue;

    const isin = iIsin >= 0 ? parts[iIsin] : null;
    rows.push({
      code: parts[iCode], name: cleanSchemeName(name), rawName: name,
      isin: isin && isin !== "-" ? isin : null,
      amc: curAmc.replace(/ Mutual Fund$/i, "").trim(),
      amfiType: curType, plan, option,
      nav: navf, navDate: parts[iDate], navDateMs: parseAmfiDate(parts[iDate]),
    });
  }
  return rows;
}

// ---------------------------------- main -------------------------------------
const t0 = Date.now();
console.log("[mf] fetching the AMFI universe…");
const text = await navAllText();
let schemes = parseNavAll(text);
if (schemes.length < 1000) throw new Error(`only ${schemes.length} Direct-Growth schemes parsed — format change?`);

// AMFI still lists wound-up schemes whose NAV froze years ago. Anything more
// than 15 days behind the file's own latest date is not an investable fund.
const latestNav = Math.max(...schemes.map((s) => s.navDateMs).filter(Boolean));
let stale = 0;
for (const s of schemes) {
  s.stale = !!(s.navDateMs && latestNav - s.navDateMs > 15 * 86_400_000);
  if (s.stale) stale++;
}
const navDate = new Date(latestNav).toISOString().slice(0, 10);
console.log(`[mf] ${schemes.length} Direct-Growth schemes · NAV date ${navDate} · ${stale} wound-up/stale`);

if (LIMIT) { schemes = schemes.slice(0, LIMIT); console.log(`[mf] --limit ${LIMIT} → ${schemes.length} this run`); }

let got = 0, missing = 0;
await pool(schemes, CONCURRENCY, async (s) => {
  let rec = histCache.get(s.code);
  if (rec === undefined) {
    const j = await getJson(`https://api.mfapi.in/mf/${s.code}`, { timeout: 25_000, retries: 2 }).catch(() => null);
    rec = j?.data?.length
      ? { meta: j.meta || null, data: j.data.map((h) => [h.date, h.nav]) }   // compact: drop key names
      : null;
    histCache.set(s.code, rec);
  }
  if (rec?.data?.length) got++; else missing++;
  return true;
}, (done, total, failed) => {
  process.stdout.write(`\r[mf] ${bar(done, total)} · histories ${got} · unavailable ${missing}${failed ? ` · errors ${failed}` : ""}   `);
});
process.stdout.write("\n");

fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data", "mf_universe.json"), JSON.stringify({
  generated: new Date().toISOString(),
  source: "AMFI NAVAll.txt — Direct plan, Growth option",
  navDate, count: schemes.length, staleCount: stale,
  schemes: schemes.map(({ navDateMs, ...rest }) => rest),
}));

console.log(`[mf] done in ${fmtDuration(Date.now() - t0)} · ${got}/${schemes.length} schemes have NAV history · ${missing} unavailable on mfapi`);
console.log("[mf] next: node scripts/build_screener.mjs");
