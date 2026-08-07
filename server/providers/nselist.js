// ---------------------------------------------------------------------------
// nselist.js — the full NSE equity symbol master (~2,000 listed companies).
// Source: official NSE archives EQUITY_L.csv (free), cached 7 days. Every
// listed symbol becomes chartable/quotable: curated names keep their rich
// metadata; the rest get deterministic hash-derived characteristics until a
// live broker feed (Upstox/FYERS) supplies real prices.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAR = path.join(__dirname, "..", "..", "var");
const CACHE = path.join(VAR, "nse_equity_l.csv");
const URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv";

let extra = null;               // symbol → { symbol, name, isin, listed }

export async function load() {
  if (extra) return extra;
  let text = null;
  try {
    const st = fs.statSync(CACHE);
    if (Date.now() - st.mtimeMs < 7 * 86400_000) text = fs.readFileSync(CACHE, "utf8");
  } catch { /* fetch below */ }
  if (!text) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(URL, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (myfinancial)" , Accept: "text/csv" } });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
      if (text.length < 50_000) throw new Error("payload too small");
      fs.mkdirSync(VAR, { recursive: true });
      fs.writeFileSync(CACHE, text);
    } catch (e) {
      console.log("  nse: symbol master unavailable —", String(e.message).slice(0, 60), "(curated universe only)");
      extra = {};
      return extra;
    }
  }
  extra = {};
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 7) continue;
    const [symbol, name, series, listed] = [cols[0]?.trim(), cols[1]?.trim(), cols[2]?.trim(), cols[3]?.trim()];
    if (series !== "EQ" || !symbol) continue;
    extra[symbol] = { symbol, name, listed, isin: cols[6]?.trim() };
  }
  console.log(`  nse: symbol master loaded — ${Object.keys(extra).length} EQ-series listed companies`);
  return extra;
}

export function allSync() { return extra || {}; }
export function get(symbol) { return extra?.[symbol] || null; }
export function countSync() { return extra ? Object.keys(extra).length : 0; }
