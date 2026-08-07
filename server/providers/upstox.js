// ---------------------------------------------------------------------------
// upstox.js — Upstox v2 market-data adapter (https://upstox.com/developer/api)
//
// Auth: OAuth2 — generate an access token from your Upstox app (valid for the
// trading day) and set:
//     UPSTOX_ACCESS_TOKEN=eyJ...
//
// Symbol resolution: Upstox addresses instruments by instrument_key
// ("NSE_EQ|<ISIN>", "NSE_INDEX|Nifty 50"). We download and cache their
// published NSE instrument master once, then resolve our universe symbols
// dynamically — no hardcoded ISINs to go stale.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAR = path.join(__dirname, "..", "..", "var");
const INSTRUMENTS_CACHE = path.join(VAR, "upstox_nse_instruments.json");
const BASE = "https://api.upstox.com/v2";
const INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";

const INDEX_KEYS = {
  NIFTY: "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  NIFTYIT: "NSE_INDEX|Nifty IT",
  NIFTYAUTO: "NSE_INDEX|Nifty Auto",
  NIFTYPHARMA: "NSE_INDEX|Nifty Pharma",
  NIFTYFMCG: "NSE_INDEX|Nifty FMCG",
  NIFTYMETAL: "NSE_INDEX|Nifty Metal",
  NIFTYENERGY: "NSE_INDEX|Nifty Energy",
  NIFTYINFRA: "NSE_INDEX|Nifty Infra",
  NIFTYREALTY: "NSE_INDEX|Nifty Realty",
  NIFTYMIDCAP: "NSE_INDEX|NIFTY MIDCAP 150",
  INDIAVIX: "NSE_INDEX|India VIX",
};

let keyBySymbol = null;         // NSE trading symbol → instrument_key

export function configured() {
  return !!process.env.UPSTOX_ACCESS_TOKEN;
}

const headers = () => ({
  Accept: "application/json",
  Authorization: `Bearer ${process.env.UPSTOX_ACCESS_TOKEN}`,
});

async function http(url, opts = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 90)}`);
    return res;
  } finally { clearTimeout(t); }
}

/** Download + cache the NSE instrument master; build symbol → key map. */
export async function loadInstruments() {
  if (keyBySymbol) return keyBySymbol;
  let rows = null;
  try {
    if (fs.existsSync(INSTRUMENTS_CACHE) &&
        Date.now() - fs.statSync(INSTRUMENTS_CACHE).mtimeMs < 5 * 86400_000) {
      rows = JSON.parse(fs.readFileSync(INSTRUMENTS_CACHE, "utf8"));
    }
  } catch { /* refetch below */ }
  if (!rows) {
    const res = await http(INSTRUMENTS_URL, {}, 30000);
    const gz = Buffer.from(await res.arrayBuffer());
    rows = JSON.parse(zlib.gunzipSync(gz).toString("utf8"));
    fs.mkdirSync(VAR, { recursive: true });
    fs.writeFileSync(INSTRUMENTS_CACHE, JSON.stringify(rows));
  }
  keyBySymbol = {};
  for (const r of rows) {
    if (r.segment === "NSE_EQ" && r.instrument_type === "EQ" && r.trading_symbol) {
      keyBySymbol[r.trading_symbol] = r.instrument_key;
    }
  }
  Object.assign(keyBySymbol, INDEX_KEYS);
  return keyBySymbol;
}

export async function resolveKey(symbol) {
  const map = await loadInstruments();
  return map[symbol] || INDEX_KEYS[symbol] || null;
}

/** Daily candles, oldest → newest, shaped like the synthetic engine's bars. */
export async function daily(symbol, days = 400) {
  const key = await resolveKey(symbol);
  if (!key) throw new Error(`Upstox: cannot resolve ${symbol}`);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 1.6 * 86400_000).toISOString().slice(0, 10);
  const url = `${BASE}/historical-candle/${encodeURIComponent(key)}/day/${to}/${from}`;
  const res = await http(url, { headers: headers() }, 12000);
  const json = await res.json();
  const candles = json?.data?.candles || [];
  // Upstox returns newest-first: [ts, o, h, l, c, vol, oi]
  return candles.reverse().map((c) => ({
    time: Math.floor(Date.parse(c[0]) / 1000),
    open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] || 0,
  }));
}

/** Batched live quotes → { SYMBOL: {ltp, prevClose, open, high, low, volume} } */
export async function quotes(symbols) {
  const map = await loadInstruments();
  const keys = symbols.map((s) => map[s]).filter(Boolean);
  if (!keys.length) return {};
  const out = {};
  for (let i = 0; i < keys.length; i += 45) {                    // API caps ~500 chars/batch
    const batch = keys.slice(i, i + 45);
    const url = `${BASE}/market-quote/quotes?instrument_key=${encodeURIComponent(batch.join(","))}`;
    const res = await http(url, { headers: headers() }, 8000);
    const json = await res.json();
    for (const [, q] of Object.entries(json?.data || {})) {
      const sym = q.symbol || "";
      out[sym] = {
        ltp: q.last_price,
        open: q.ohlc?.open, high: q.ohlc?.high, low: q.ohlc?.low,
        prevClose: q.ohlc?.close ?? q.last_price,
        volume: q.volume || 0,
      };
    }
  }
  return out;
}

export const name = "upstox";
