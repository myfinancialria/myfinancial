#!/usr/bin/env node
// ---------------------------------------------------------------------------
// fetch_upstox_fundamentals.mjs — filed fundamentals for the whole NSE universe.
//
// This is the deep layer: the Upstox Company Fundamentals API returns what a
// company actually filed — full P&L, balance sheet, cash flow, the shareholding
// pattern, corporate actions, named competitors and published sector benchmarks
// — not a third party's derived ratios. It needs your Upstox token, which is why
// it runs locally rather than in CI:
//
//     npm run login:upstox        # once a day, opens the Upstox login flow
//     npm run data:upstox         # then this — resumable, respects rate limits
//
// Results land in var/ufund/ and are folded into data/fundamentals.json, which
// is committed so the nightly GitHub Action builds the site without any token.
// The sweep is resumable: stop it whenever, run it again, it picks up.
//
//   node scripts/fetch_upstox_fundamentals.mjs                 # whole universe
//   node scripts/fetch_upstox_fundamentals.mjs --limit 200     # a slice
//   node scripts/fetch_upstox_fundamentals.mjs --liquid-only   # names that trade
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sleep, fmtDuration, bar } from "./lib/net.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const CACHE = path.join(ROOT, "var", "ufund");

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? (argv[i + 1] ?? true) : d; };
const LIMIT = Number(arg("limit", 0)) || 0;
const SPACING = Number(arg("spacing", 900)) || 900;
const LIQUID_ONLY = argv.includes("--liquid-only");
const MIN_TURNOVER = Number(arg("min-turnover", 0.5)) || 0.5;   // ₹ crore/day

const uf = await import("../server/providers/ufundamentals.js");
if (!uf.configured()) {
  console.error("✗ No Upstox token found.");
  console.error("  Run `npm run login:upstox` first — it writes UPSTOX_ACCESS_TOKEN into .env.");
  console.error("  The token lasts one trading day; re-run the login when it expires.");
  process.exit(1);
}

const readJson = (p, fb = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; } };

// ------------------------------ what to fetch --------------------------------
const universe = readJson(path.join(DATA, "nse_universe.json"), null);
if (!universe) { console.error("✗ data/nse_universe.json missing — run: npm run data:universe"); process.exit(1); }

let symbols = universe.symbols.map((s) => s.symbol);

// Optionally skip the illiquid tail. A company trading a few lakh rupees a day
// cannot be acted on anyway, and the API budget is better spent elsewhere.
if (LIQUID_ONLY) {
  const idx = readJson(path.join(ROOT, "dist", "data", "stocks.json"))
    ;
  if (idx?.fields) {
    const F = Object.fromEntries(idx.fields.map((k, i) => [k, i]));
    const liquid = new Set(idx.rows.filter((r) => (r[F.avgTurnoverCr] ?? 0) >= MIN_TURNOVER).map((r) => r[F.symbol]));
    const before = symbols.length;
    symbols = symbols.filter((s) => liquid.has(s));
    console.log(`[uf] --liquid-only: ${symbols.length} of ${before} trade at least ₹${MIN_TURNOVER} cr/day`);
  } else {
    console.log("[uf] --liquid-only ignored: no screener index yet (run npm run build:screener first)");
  }
}

fs.mkdirSync(CACHE, { recursive: true });
const cached = new Set(fs.readdirSync(CACHE).filter((f) => f.endsWith(".json") && !f.endsWith(".q.json")).map((f) => f.replace(/\.json$/, "")));
let todo = symbols.filter((s) => !cached.has(s));
if (LIMIT) todo = todo.slice(0, LIMIT);

console.log(`[uf] ${symbols.length} companies in scope · ${symbols.length - todo.length} already cached · fetching ${todo.length}`);
if (!todo.length) console.log("[uf] nothing to fetch — rebuilding the snapshot from cache");

// --------------------------------- sweep -------------------------------------
const t0 = Date.now();
let ok = 0, empty = 0, waited = 0;
for (const [i, sym] of todo.entries()) {
  // The provider tracks its own cooldown after a 429/401; honour it rather than
  // hammering an endpoint that has already said no.
  const wait = uf.cooldownMs();
  if (wait > 0) {
    process.stdout.write(`\r[uf] rate limited — waiting ${Math.ceil(wait / 1000)}s…                                    `);
    await sleep(wait + 1500);
    waited++;
  }
  try {
    const rec = await uf.fundamentals(sym);
    if (rec?.ratios) ok++; else empty++;
  } catch { empty++; }

  if ((i + 1) % 10 === 0 || i === todo.length - 1) {
    process.stdout.write(`\r[uf] ${bar(i + 1, todo.length)} · with data ${ok} · no data ${empty}${waited ? ` · cooldowns ${waited}` : ""}      `);
  }
  await sleep(SPACING);
}
if (todo.length) process.stdout.write("\n");

// ---------------------------- refresh the snapshot ---------------------------
const list = [];
for (const f of fs.readdirSync(CACHE)) {
  if (!f.endsWith(".json") || f.endsWith(".q.json")) continue;
  const j = readJson(path.join(CACHE, f));
  if (j?.ratios) list.push(j);
}
list.sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
fs.writeFileSync(path.join(DATA, "fundamentals.json"), JSON.stringify({ generated: new Date().toISOString(), companies: list }));

console.log(`[uf] done in ${fmtDuration(Date.now() - t0)} · snapshot now holds ${list.length} companies with filed fundamentals`);
console.log("[uf] commit data/fundamentals.json so the nightly build picks it up, then: npm run build");
