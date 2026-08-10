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

const AMFI_URL = "https://www.amfiindia.com/spages/NAVAll.txt";

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
 * NAVAll is a flat text file where the AMC and the SEBI scheme-type appear as
 * bare heading lines above the rows they apply to, so parsing has to carry that
 * context downward rather than read it off each row.
 */
function parseNavAll(text) {
  const rows = [];
  let curType = "", curAmc = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.includes(";")) {
      if (/scheme/i.test(line) && line.includes("(")) curType = line;
      else if (/mutual fund/i.test(line)) curAmc = line;
      continue;
    }
    const parts = line.split(";");
    if (parts.length < 6 || parts[0] === "Scheme Code") continue;
    const [code, isinG, , name, nav, dt] = parts.map((s) => s.trim());
    const nl = name.toLowerCase();
    if (!nl.includes("direct") || !nl.includes("growth")) continue;
    if (/idcw|dividend|bonus|segregated/.test(nl)) continue;
    const navf = parseFloat(nav);
    if (!Number.isFinite(navf) || navf <= 0) continue;
    rows.push({
      code, name, isin: isinG && isinG !== "-" ? isinG : null,
      amc: curAmc.replace(/ Mutual Fund$/i, "").trim(),
      amfiType: curType, nav: navf, navDate: dt, navDateMs: parseAmfiDate(dt),
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
