#!/usr/bin/env node
// ---------------------------------------------------------------------------
// fetch_prices.mjs — five years of daily prices for every NSE-listed company.
//
// Source: NSE's official full bhavcopy,
//   https://archives.nseindia.com/products/content/sec_bhavdata_full_DDMMYYYY.csv
//
// One file per trading day carries EVERY symbol, so the whole market costs one
// request per day instead of one per company — and it also carries DELIVERY
// quantity and delivery %, which no free international feed provides and which
// matter a great deal when screening Indian equities (high delivery = real
// buying, low delivery = intraday churn).
//
// Historical files never change, so they are cached permanently; a daily run
// fetches only the sessions it has not seen. Holidays 404 and are remembered as
// such so they are never retried.
//
//   node scripts/fetch_prices.mjs                # 5 years, resumable
//   node scripts/fetch_prices.mjs --years 2      # shallower, much faster
//   node scripts/fetch_prices.mjs --since 2026-07-01
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getText, pool, fmtDuration, bar } from "./lib/net.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VAR = path.join(ROOT, "var");
const BHAV = path.join(VAR, "bhav");          // one .json per session, cached forever
const MISS = path.join(VAR, "bhav", "_holidays.json");

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? (argv[i + 1] ?? true) : d; };
const YEARS = Number(arg("years", 5)) || 5;
const SINCE = arg("since", null);
const CONCURRENCY = Number(arg("concurrency", 5)) || 5;

fs.mkdirSync(BHAV, { recursive: true });

// Bump when the per-session record layout changes: the cache is keyed by date
// and would otherwise happily serve rows in the previous shape forever.
const SCHEMA = 2;
const schemaFile = path.join(BHAV, "_schema.json");
if (readSchema() !== SCHEMA) {
  const stale = fs.readdirSync(BHAV).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (stale.length) console.log(`[px] record layout changed (v${readSchema() ?? "?"} → v${SCHEMA}) — re-parsing ${stale.length} cached sessions`);
  for (const f of stale) fs.rmSync(path.join(BHAV, f), { force: true });
  fs.rmSync(MISS, { force: true });
  fs.writeFileSync(schemaFile, JSON.stringify({ version: SCHEMA }));
}
function readSchema() {
  try { return JSON.parse(fs.readFileSync(schemaFile, "utf8")).version; } catch { return null; }
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const ddmmyyyy = (d) => `${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${d.getUTCFullYear()}`;

/** Every weekday between `from` and `to`, newest first. */
function sessions(from, to) {
  const out = [];
  for (let d = new Date(to); d >= from; d.setUTCDate(d.getUTCDate() - 1)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(new Date(d));
  }
  return out;
}

/**
 * Parse one bhavcopy into
 *   { SYMBOL: [o,h,l,c,volume,turnoverCr,trades,delivPct,prevClose] }
 *
 * PREV_CLOSE matters more than it looks: on an ex-bonus or ex-split date NSE
 * publishes the ADJUSTED previous close, so comparing it against the close we
 * stored for the previous session yields the exact corporate-action ratio.
 * That is what lets the build back-adjust the series without guessing.
 */
function parseBhav(text) {
  const lines = text.split(/\r?\n/);
  const head = lines[0].split(",").map((s) => s.trim());
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const need = ["SYMBOL", "SERIES", "OPEN_PRICE", "HIGH_PRICE", "LOW_PRICE", "CLOSE_PRICE", "TTL_TRD_QNTY"];
  if (need.some((k) => ix[k] === undefined)) return null;
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = lines[i].split(",").map((s) => s.trim());
    if (c[ix.SERIES] !== "EQ") continue;                 // equities only, not GS/SM/debt
    const n = (k) => { const v = Number(c[ix[k]]); return Number.isFinite(v) ? v : null; };
    const close = n("CLOSE_PRICE");
    if (!close || close <= 0) continue;
    const dp = ix.DELIV_PER !== undefined ? Number(c[ix.DELIV_PER]) : NaN;   // "-" on some rows
    out[c[ix.SYMBOL]] = [
      n("OPEN_PRICE") ?? close, n("HIGH_PRICE") ?? close, n("LOW_PRICE") ?? close, close,
      n("TTL_TRD_QNTY") ?? 0,
      ix.TURNOVER_LACS !== undefined ? (n("TURNOVER_LACS") ?? 0) / 100 : null,   // ₹ lakh → ₹ crore
      ix.NO_OF_TRADES !== undefined ? n("NO_OF_TRADES") : null,
      Number.isFinite(dp) ? dp : null,
      n("PREV_CLOSE"),
    ];
  }
  return Object.keys(out).length > 200 ? out : null;      // a real session has thousands of rows
}

const url = (d) => `https://archives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy(d)}.csv`;

// ---------------------------------- main -------------------------------------
const t0 = Date.now();
const to = new Date();
to.setUTCHours(0, 0, 0, 0);
const from = SINCE ? new Date(SINCE + "T00:00:00Z") : (() => { const f = new Date(to); f.setUTCFullYear(f.getUTCFullYear() - YEARS); return f; })();

// A session is only recorded as non-trading once it is old enough that NSE has
// certainly published it. Anything newer that 404s is simply "not up yet".
//
// This matters more than it sounds: the blacklist was permanent, so a run that
// happened before the exchange published — a manual build at 7pm, or the
// schedule drifting ahead of publication — marked that day non-trading FOREVER
// and every later run skipped it. Three real trading days were lost that way,
// which is exactly how a daily site quietly stops being daily.
const SETTLE_DAYS = 5;
const settled = (isoDay) => (Date.now() - Date.parse(`${isoDay}T12:00:00Z`)) / 86_400_000 > SETTLE_DAYS;

let holidays = new Set();
try { holidays = new Set(JSON.parse(fs.readFileSync(MISS, "utf8"))); } catch { /* first run */ }

// Self-heal: drop any recent entry, so days blacklisted too eagerly get retried.
const forgot = [...holidays].filter((d) => !settled(d));
if (forgot.length) {
  for (const d of forgot) holidays.delete(d);
  console.log(`[px] retrying ${forgot.length} recently-skipped session(s): ${forgot.join(", ")}`);
}

const all = sessions(from, to);
const todo = all.filter((d) => {
  const day = iso(d);
  if (holidays.has(day)) return false;
  return !fs.existsSync(path.join(BHAV, `${day}.json`));
});

console.log(`[px] ${iso(from)} → ${iso(to)} · ${all.length} weekday sessions · ${all.length - todo.length} already cached · fetching ${todo.length}`);

let ok = 0, holiday = 0, notYet = 0;
const newHolidays = [];
await pool(todo, CONCURRENCY, async (d) => {
  const day = iso(d);
  let text;
  try {
    text = await getText(url(d), { accept: "text/csv", timeout: 30_000, retries: 2, headers: { Referer: "https://www.nseindia.com/" } });
  } catch {
    return null;                                  // transient: leave it for the next run
  }
  // 404 (null) or an HTML error page means the exchange was shut that day
  if (!text || text.length < 5000 || !/SYMBOL/i.test(text.slice(0, 200))) {
    if (settled(day)) newHolidays.push(day);      // genuinely a non-trading day
    else notYet++;                                 // just not published yet
    holiday++; return null;
  }
  const parsed = parseBhav(text);
  if (!parsed) { if (settled(day)) newHolidays.push(day); else notYet++; holiday++; return null; }
  fs.writeFileSync(path.join(BHAV, `${day}.json`), JSON.stringify(parsed));
  ok++;
  return true;
}, (done, total) => {
  process.stdout.write(`\r[px] ${bar(done, total)} · sessions ${ok} · non-trading ${holiday - notYet}${notYet ? ` · awaiting publication ${notYet}` : ""}   `);
});
if (todo.length) process.stdout.write("\n");

for (const h of newHolidays) holidays.add(h);
fs.writeFileSync(MISS, JSON.stringify([...holidays].sort()));

const cached = fs.readdirSync(BHAV).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
console.log(`[px] done in ${fmtDuration(Date.now() - t0)} · ${cached.length} trading sessions cached · ${holidays.size} non-trading days recorded${notYet ? ` · ${notYet} session(s) not yet published, will retry` : ""}`);
if (cached.length) {
  const sorted = cached.map((f) => f.replace(".json", "")).sort();
  console.log(`[px] coverage ${sorted[0]} → ${sorted[sorted.length - 1]}`);
}
