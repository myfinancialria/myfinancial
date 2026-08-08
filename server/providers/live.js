// ---------------------------------------------------------------------------
// live.js — live market-data router.
//
// Select a broker feed with:   MYFIN_PROVIDER=upstox | fyers   (+ its tokens)
// Default: synthetic (deterministic demo engine, zero config).
//
// Design: the analytics engines read bars/quotes SYNCHRONOUSLY, so this layer
// prefetches asynchronously into in-memory caches on boot and on an interval;
// engines/market.js consults the caches first and falls back to the synthetic
// series when live data is absent (missing token, weekend, rate-limit, error).
// History deeper than the broker window is spliced: synthetic head, scaled to
// meet the first live bar, then genuine broker candles — so 10-year lookbacks
// keep working while the recent tape is real.
// ---------------------------------------------------------------------------
import { cfg } from "../lib/config.js";
import * as upstox from "./upstox.js";
import * as fyers from "./fyers.js";

const PROVIDERS = { upstox, fyers };

const state = {
  mode: "synthetic",
  provider: null,
  barsBySymbol: new Map(),      // symbol → bars[] (oldest→newest, broker-truth)
  quotesBySymbol: new Map(),    // symbol → { ltp, prevClose, open, high, low, volume, at }
  barsSyncedAt: null,
  quotesSyncedAt: null,
  lastError: null,
  symbols: [],
  timers: [],
  version: 0,                   // bumped on bar refresh → invalidates splice caches
};

export function bars(symbol) { return state.barsBySymbol.get(symbol) || null; }
export function quote(symbol) {
  const q = state.quotesBySymbol.get(symbol);
  return q && Date.now() - q.at < 90_000 ? q : null;             // stale live quote → fallback
}
export function version() { return state.version; }
export function mode() { return state.mode; }

export function status() {
  return {
    mode: state.mode,
    configured: { upstox: upstox.configured(), fyers: fyers.configured() },
    symbolsWithLiveBars: state.barsBySymbol.size,
    symbolsWithLiveQuotes: state.quotesBySymbol.size,
    barsSyncedAt: state.barsSyncedAt,
    quotesSyncedAt: state.quotesSyncedAt,
    lastError: state.lastError,
    note: state.mode === "synthetic"
      ? "Deterministic demo feed. Set MYFIN_PROVIDER=upstox or fyers (plus tokens) for live NSE data."
      : `Live NSE data via ${state.mode}; synthetic engine backfills anything the broker window doesn't cover.`,
  };
}

async function syncBars() {
  const p = state.provider;
  let ok = 0;
  for (const sym of state.symbols) {
    try {
      const b = await p.daily(sym, 420);
      if (b?.length > 50) { state.barsBySymbol.set(sym, b); ok++; }
    } catch (e) { state.lastError = `${p.name} bars ${sym}: ${String(e.message).slice(0, 120)}`; }
    await new Promise((r) => setTimeout(r, 120));                // stay well inside rate limits
  }
  if (ok) { state.barsSyncedAt = Date.now(); state.version++; }
  console.log(`  live[${p.name}] candles synced for ${ok}/${state.symbols.length} symbols`);
}

async function syncQuotes() {
  const p = state.provider;
  try {
    const q = await p.quotes(state.symbols);
    const at = Date.now();
    for (const [sym, v] of Object.entries(q)) {
      if (v?.ltp) state.quotesBySymbol.set(sym, { ...v, at });
    }
    if (Object.keys(q).length) state.quotesSyncedAt = at;
  } catch (e) { state.lastError = `${p.name} quotes: ${String(e.message).slice(0, 120)}`; }
}

let lastSymbols = null;

/** Tear down and re-init after a Connections change — takes effect live. */
export function restart() {
  for (const t of state.timers) if (t) clearInterval(t);
  state.timers = [];
  state.mode = "synthetic"; state.provider = null; state.lastError = null;
  state.barsBySymbol.clear(); state.quotesBySymbol.clear(); state.version++;
  if (lastSymbols) start(lastSymbols);
  return status();
}

/** Boot the live layer. No-op unless a provider + credentials are configured. */
export function start(symbols) {
  lastSymbols = symbols;
  const want = String(cfg("MYFIN_PROVIDER") || "synthetic").toLowerCase();
  const p = PROVIDERS[want];
  if (!p) { if (want !== "synthetic") console.log(`  live: unknown provider "${want}" — using synthetic`); return; }
  if (!p.configured()) {
    console.log(`  live: MYFIN_PROVIDER=${want} but credentials missing — using synthetic (see README)`);
    return;
  }
  state.mode = want;
  state.provider = p;
  state.symbols = symbols;
  syncBars().catch(() => {});
  syncQuotes().catch(() => {});
  state.timers.push(setInterval(() => syncBars().catch(() => {}), 15 * 60_000).unref?.());
  state.timers.push(setInterval(() => syncQuotes().catch(() => {}), 5_000).unref?.());
  console.log(`  live: ${want} provider active — candles every 15m, quotes every 5s`);
}
