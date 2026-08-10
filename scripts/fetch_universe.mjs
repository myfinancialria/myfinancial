#!/usr/bin/env node
// ---------------------------------------------------------------------------
// fetch_universe.mjs — the definitive list of NSE-listed companies.
//
// Source: NSE archives EQUITY_L.csv, the exchange's own symbol master. Only the
// EQ series is kept: that is ordinary equity, excluding government securities,
// SME-platform listings, ETFs and debt instruments, which have their own series
// codes and do not belong in an equity screener.
//
//   node scripts/fetch_universe.mjs
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getText } from "./lib/net.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VAR = path.join(ROOT, "var");
const DATA = path.join(ROOT, "data");
const CACHE = path.join(VAR, "nse_equity_l.csv");
const URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv";
const FORCE = process.argv.includes("--force");

/** CSV split that respects quoted company names containing commas. */
function splitCsv(line) {
  const cols = [];
  let cur = "", quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { cols.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols.map((c) => c.trim());
}

let text = null;
try {
  const st = fs.statSync(CACHE);
  if (!FORCE && Date.now() - st.mtimeMs < 7 * 86_400_000) {
    text = fs.readFileSync(CACHE, "utf8");
    console.log("[uni] using cached symbol master (< 7 days old)");
  }
} catch { /* fetch below */ }

if (!text) {
  console.log("[uni] fetching NSE EQUITY_L.csv…");
  text = await getText(URL, { accept: "text/csv", timeout: 30_000, retries: 3, headers: { Referer: "https://www.nseindia.com/" } });
  if (!text || text.length < 50_000) throw new Error("EQUITY_L.csv looks truncated — refusing to write a partial universe");
  fs.mkdirSync(VAR, { recursive: true });
  fs.writeFileSync(CACHE, text);
}

const lines = text.split(/\r?\n/);
const symbols = [];
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const [symbol, name, series, listed, , , isin, faceValue] = splitCsv(lines[i]);
  if (!symbol || series !== "EQ") continue;
  symbols.push({
    symbol, name, isin: isin || null,
    listed: listed || null,
    faceValue: Number(faceValue) || null,
  });
}
if (symbols.length < 1500) throw new Error(`only ${symbols.length} EQ symbols parsed — the CSV layout has changed`);

symbols.sort((a, b) => a.symbol.localeCompare(b.symbol));
fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(path.join(DATA, "nse_universe.json"), JSON.stringify({
  generated: new Date().toISOString(),
  source: "NSE archives EQUITY_L.csv (EQ series only)",
  count: symbols.length,
  symbols,
}));

const oldest = symbols.reduce((a, b) => (!a.listed ? b : a), symbols[0]);
console.log(`[uni] ${symbols.length} EQ-series listed companies → data/nse_universe.json`);
console.log(`[uni] e.g. ${symbols[0].symbol}, ${symbols[Math.floor(symbols.length / 2)].symbol}, ${symbols[symbols.length - 1].symbol} · oldest listing ${oldest.listed}`);
