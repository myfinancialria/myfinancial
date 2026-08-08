// ---------------------------------------------------------------------------
// fyers.js — FYERS API v3 market-data adapter (https://myapi.fyers.in/docsv3)
//
// Auth: create an app at myapi.fyers.in, complete the login flow once to get a
// daily access token, then set:
//     FYERS_APP_ID=XXXXXXXX-100
//     FYERS_ACCESS_TOKEN=eyJ...
// Data API auth header is "appId:accessToken".
//
// Symbols are deterministic — "NSE:RELIANCE-EQ", indices "NSE:NIFTY50-INDEX".
// ---------------------------------------------------------------------------
import { cfg } from "../lib/config.js";

const DATA_BASE = "https://api-t1.fyers.in/data";

const INDEX_SYMBOLS = {
  NIFTY: "NSE:NIFTY50-INDEX",
  BANKNIFTY: "NSE:NIFTYBANK-INDEX",
  NIFTYIT: "NSE:NIFTYIT-INDEX",
  NIFTYAUTO: "NSE:NIFTYAUTO-INDEX",
  NIFTYPHARMA: "NSE:NIFTYPHARMA-INDEX",
  NIFTYFMCG: "NSE:NIFTYFMCG-INDEX",
  NIFTYMETAL: "NSE:NIFTYMETAL-INDEX",
  NIFTYENERGY: "NSE:NIFTYENERGY-INDEX",
  NIFTYINFRA: "NSE:NIFTYINFRA-INDEX",
  NIFTYREALTY: "NSE:NIFTYREALTY-INDEX",
  NIFTYMIDCAP: "NSE:NIFTYMIDCAP150-INDEX",
  INDIAVIX: "NSE:INDIAVIX-INDEX",
};

export function configured() {
  return !!(cfg("FYERS_APP_ID") && cfg("FYERS_ACCESS_TOKEN"));
}

const authHeader = () => ({ Authorization: `${cfg("FYERS_APP_ID")}:${cfg("FYERS_ACCESS_TOKEN")}` });
const toFyers = (symbol) => INDEX_SYMBOLS[symbol] || `NSE:${symbol.replace("&", "%26")}-EQ`;

async function http(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", ...authHeader() }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 90)}`);
    const json = await res.json();
    if (json.s && json.s !== "ok") throw new Error(`Fyers: ${json.message || json.s}`);
    return json;
  } finally { clearTimeout(t); }
}

/** Daily candles oldest → newest in the engine's bar shape. */
export async function daily(symbol, days = 400) {
  const sym = toFyers(symbol);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 1.6 * 86400_000).toISOString().slice(0, 10);
  const url = `${DATA_BASE}/history?symbol=${encodeURIComponent(sym)}&resolution=D&date_format=1&range_from=${from}&range_to=${to}&cont_flag=1`;
  const json = await http(url, 12000);
  return (json.candles || []).map((c) => ({
    time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] || 0,
  }));
}

/** Batched quotes → { SYMBOL: {ltp, prevClose, open, high, low, volume} } */
export async function quotes(symbols) {
  const out = {};
  for (let i = 0; i < symbols.length; i += 40) {                 // Fyers caps 50 symbols/call
    const batch = symbols.slice(i, i + 40);
    const url = `${DATA_BASE}/quotes?symbols=${encodeURIComponent(batch.map(toFyers).join(","))}`;
    const json = await http(url, 8000);
    for (const d of json.d || []) {
      const v = d.v || {};
      const original = batch.find((s) => toFyers(s) === d.n) || (d.n || "").replace(/^NSE:|-EQ$|-INDEX$/g, "");
      out[original] = {
        ltp: v.lp, open: v.open_price, high: v.high_price, low: v.low_price,
        prevClose: v.prev_close_price ?? v.lp, volume: v.volume || 0,
      };
    }
  }
  return out;
}

export const name = "fyers";
