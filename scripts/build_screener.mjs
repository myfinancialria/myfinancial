#!/usr/bin/env node
// ---------------------------------------------------------------------------
// build_screener.mjs — turns the raw caches into the data the screener runs on.
//
//   var/bhav/*.json     one file per trading session, every symbol
//   var/mfhist/*.json   one file per scheme, its whole NAV history
//   var/ufund/*.json    Upstox deep filed data, where a token has fetched it
//   data/*.json         committed snapshots (the CI fallback)
//        ↓
//   dist/data/stocks.json      compact row per company — this is the screener
//   dist/data/funds.json       compact row per scheme
//   dist/data/stock/<SYM>.json price history + detail for one company page
//   dist/data/fund/<CODE>.json NAV history + detail for one scheme page
//
// Everything the screener can filter on is computed HERE, once, at build time.
// The browser then filters an array in memory: no server, no query language, no
// waiting. That is what makes a screener over 2,000 companies feel instant on a
// static host.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ta from "./lib/ta.mjs";
import * as fm from "./lib/fundmetrics.mjs";
import { STOCK_FIELDS, FUND_FIELDS, clientMeta } from "./lib/schema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const VAR = path.join(ROOT, "var");
const DATA = path.join(ROOT, "data");
const OUT = path.join(ROOT, "dist", "data");
// Per-item detail is a build intermediate: build_app.mjs renders it into static
// HTML, so shipping the JSON as well would double the site size for no gain.
const DETAIL = path.join(ROOT, "var", "detail");

const r2 = (x, d = 2) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const readJson = (p, fb = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; } };

// =============================================================================
// 1. Stitch the daily bhavcopies into a per-symbol OHLCV series
// =============================================================================
function loadPriceSeries() {
  const dir = path.join(VAR, "bhav");
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    : [];
  if (!files.length) return { series: {}, dates: [] };

  const series = {};                       // SYMBOL → [[date,o,h,l,c,v,turnoverCr,delivPct], ...]
  for (const f of files) {
    const day = f.replace(".json", "");
    const rows = readJson(path.join(dir, f), {});
    for (const [sym, r] of Object.entries(rows)) {
      // r = [o,h,l,c,volume,turnoverCr,trades,delivPct,prevClose]
      // prevClose (r[8]) is cached but not used: NSE does not adjust it across
      // capital actions, so it cannot supply the split/bonus ratio.
      (series[sym] ??= []).push([day, r[0], r[1], r[2], r[3], r[4], r[5], r[7]]);
    }
  }

  let adjusted = 0, events = 0;
  for (const bars of Object.values(series)) {
    const n = adjustForCorporateActions(bars);
    if (n) { adjusted++; events += n; }
  }
  if (adjusted) console.log(`[build] back-adjusted ${adjusted} symbols for ${events} splits/bonuses/demergers`);

  return { series, dates: files.map((f) => f.replace(".json", "")) };
}

/** Simple ratios a split, bonus or consolidation actually produces. */
const ACTION_RATIOS = (() => {
  const out = new Set();
  for (let q = 1; q <= 20; q++) {
    for (let p = 1; p <= 20; p++) {
      const r = p / q;
      if (r >= 0.02 && r <= 21 && r !== 1) out.add(Number(r.toFixed(6)));
    }
  }
  // 1:100 style consolidations do happen on penny stocks
  for (const r of [0.01, 0.02, 0.05, 100, 50, 25]) out.add(r);
  return [...out].sort((a, b) => a - b);
})();

/**
 * NSE bhavcopy prices are raw traded prices — they are NOT adjusted for splits,
 * bonuses or demergers, and (contrary to what one might hope) neither is the
 * PREV_CLOSE column: on HDFC Bank's 1:1 bonus date the file reports a close of
 * 973.4 against a PREV_CLOSE of 1964.1. Left uncorrected, that bonus reads as an
 * instant 50% crash and corrupts every return, moving average, 52-week range and
 * drawdown spanning it.
 *
 * So the event is detected from the price series itself, which is safe here for
 * a specific reason: NSE enforces daily price bands (5/10/20%). No share can
 * legitimately close 30% below its previous close in a single session. A gap
 * past that threshold is therefore a capital action, not a market move.
 *
 * The raw gap is then snapped to the nearest simple ratio — 1:1 bonus → 0.5,
 * 1:5 split → 0.2 — because the adjustment factor should be the pure capital
 * action, leaving the day's genuine price movement in the series. If no simple
 * ratio is close, the observed ratio is used as-is.
 *
 * Returns the number of events applied.
 */
function adjustForCorporateActions(bars) {
  if (bars.length < 3) return 0;
  const events = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1][ta.C], cur = bars[i][ta.C];
    if (!prev || !cur || prev <= 0 || cur <= 0) continue;
    const ratio = cur / prev;
    // Outside any price band the exchange permits → a capital action.
    if (ratio > 0.7 && ratio < 1.45) continue;
    if (ratio < 0.005 || ratio > 100) continue;             // bad data, not an action

    let factor = ratio;
    let best = null, bestErr = Infinity;
    for (const r of ACTION_RATIOS) {
      const err = Math.abs(r - ratio) / ratio;
      if (err < bestErr) { bestErr = err; best = r; }
    }
    if (best !== null && bestErr <= 0.08) factor = best;
    events.push({ i, factor });
  }
  if (!events.length) return 0;

  // Apply cumulatively, walking backwards: a bar is adjusted by the product of
  // every factor from every event that happened after it.
  let cum = 1;
  for (let e = events.length - 1; e >= 0; e--) {
    cum *= events[e].factor;
    const from = e === 0 ? 0 : events[e - 1].i;
    for (let i = from; i < events[e].i; i++) {
      bars[i][ta.O] = bars[i][ta.O] * cum;
      bars[i][ta.H] = bars[i][ta.H] * cum;
      bars[i][ta.L] = bars[i][ta.L] * cum;
      bars[i][ta.C] = bars[i][ta.C] * cum;
      // Share counts move inversely, so volume is restated the other way to
      // keep traded value (price × volume) intact across the event.
      bars[i][ta.V] = Math.round(bars[i][ta.V] / cum);
    }
  }
  return events.length;
}

// =============================================================================
// 2. Every technical the screener exposes, for one company
// =============================================================================
const TURNOVER_CR = 6;      // extra columns carried alongside the OHLCV core
const DELIV_PCT = 7;

function technicals(bars, benchCloses) {
  if (!bars || bars.length < 30) return null;
  const closes = bars.map((b) => b[ta.C]);
  const vols = bars.map((b) => b[ta.V]);
  const i = bars.length - 1;
  const px = closes[i];

  const ma = (n) => ta.last(ta.sma(closes, n).slice(0, i + 1));
  const sma20 = ta.sma(closes, 20)[i], sma50 = ta.sma(closes, 50)[i];
  const sma100 = ta.sma(closes, 100)[i], sma200 = ta.sma(closes, 200)[i];
  const ema21 = ta.ema(closes, 21)[i];

  const rsiS = ta.rsi(closes, 14);
  const macdS = ta.macd(closes);
  const bbS = ta.bollinger(closes, 20, 2);
  const atrS = ta.atr(bars, 14);
  const adxS = ta.adx(bars, 14);
  const stochS = ta.stochastic(bars, 14, 3);
  const stS = ta.supertrend(bars, 10, 3);
  const mfiS = ta.mfi(bars, 14);
  const cciS = ta.cci(bars, 20);

  // 52-week window on real trading days, not calendar days
  const win52 = bars.slice(-252);
  const hi52 = Math.max(...win52.map((b) => b[ta.H]));
  const lo52 = Math.min(...win52.map((b) => b[ta.L]));
  const hiAll = Math.max(...bars.map((b) => b[ta.H]));

  const volAvg = (n) => {
    const w = vols.slice(-n);
    return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
  };
  const v20 = volAvg(20), v50 = volAvg(50);

  // liquidity in rupees is what decides whether a screen result is tradeable
  const turnover = bars.slice(-20).map((b) => b[TURNOVER_CR]).filter((x) => typeof x === "number");
  const avgTurnoverCr = turnover.length ? turnover.reduce((a, b) => a + b, 0) / turnover.length : null;

  const deliv = bars.slice(-20).map((b) => b[DELIV_PCT]).filter((x) => typeof x === "number");
  const avgDelivPct = deliv.length ? deliv.reduce((a, b) => a + b, 0) / deliv.length : null;

  const weekly = ta.toWeekly(bars);
  const wk = ta.weinsteinStage(weekly.map((b) => b[ta.C]));

  const { beta, corr } = benchCloses ? ta.betaAgainst(closes, benchCloses) : { beta: null, corr: null };

  const atrNow = atrS[i];
  const bbUp = bbS.upper[i], bbLo = bbS.lower[i], bbMid = bbS.mid[i];

  return {
    price: r2(px),
    date: bars[i][ta.D],
    open: r2(bars[i][ta.O]), high: r2(bars[i][ta.H]), low: r2(bars[i][ta.L]),
    volume: vols[i],
    prevClose: r2(closes[i - 1]),
    change1d: r2(ta.pctChange(closes[i - 1], px)),

    // ---- trailing returns, in trading days ----
    ret1w: r2(ta.retOver(closes, 5)),
    ret1m: r2(ta.retOver(closes, 21)),
    ret3m: r2(ta.retOver(closes, 63)),
    ret6m: r2(ta.retOver(closes, 126)),
    ret1y: r2(ta.retOver(closes, 252)),
    ret3y: bars.length > 756 ? r2(((px / closes[i - 756]) ** (1 / 3) - 1) * 100) : null,
    ret5y: bars.length > 1260 ? r2(((px / closes[i - 1260]) ** (1 / 5) - 1) * 100) : null,

    // ---- moving averages ----
    sma20: r2(sma20), sma50: r2(sma50), sma100: r2(sma100), sma200: r2(sma200), ema21: r2(ema21),
    pctFromSma50: r2(sma50 ? ((px - sma50) / sma50) * 100 : null),
    pctFromSma200: r2(sma200 ? ((px - sma200) / sma200) * 100 : null),
    aboveSma50: sma50 ? px > sma50 : null,
    aboveSma200: sma200 ? px > sma200 : null,
    goldenCross: sma50 && sma200 ? sma50 > sma200 : null,

    // ---- oscillators & trend ----
    rsi14: r2(rsiS[i]),
    macd: r2(macdS.line[i]),
    macdSignal: r2(macdS.signal[i]),
    macdHist: r2(macdS.hist[i]),
    macdBullish: macdS.line[i] !== null && macdS.signal[i] !== null ? macdS.line[i] > macdS.signal[i] : null,
    adx14: r2(adxS.adx[i]),
    plusDI: r2(adxS.plusDI[i]),
    minusDI: r2(adxS.minusDI[i]),
    stochK: r2(stochS.k[i]),
    stochD: r2(stochS.d[i]),
    cci20: r2(cciS[i]),
    mfi14: r2(mfiS[i]),
    supertrend: r2(stS.line[i]),
    supertrendBullish: stS.dir[i] === null ? null : stS.dir[i] === 1,

    // ---- volatility & bands ----
    atr14: r2(atrNow),
    atrPct: r2(atrNow && px ? (atrNow / px) * 100 : null),
    bbUpper: r2(bbUp), bbLower: r2(bbLo), bbMiddle: r2(bbMid),
    bbPercentB: r2(bbUp !== null && bbLo !== null && bbUp !== bbLo ? ((px - bbLo) / (bbUp - bbLo)) * 100 : null),
    bbWidthPct: r2(bbUp !== null && bbMid ? ((bbUp - bbLo) / bbMid) * 100 : null),
    volatility: r2(ta.volatility(closes)),
    maxDrawdownPct: r2(ta.maxDrawdown(closes)),
    beta: r2(beta), correlation: r2(corr),

    // ---- range position ----
    high52w: r2(hi52), low52w: r2(lo52),
    pctFrom52wHigh: r2(((px - hi52) / hi52) * 100),
    pctFrom52wLow: r2(((px - lo52) / lo52) * 100),
    pctFromAllTimeHigh: r2(((px - hiAll) / hiAll) * 100),
    // where in its own yearly range the price sits: 0 = at the low, 100 = at the high
    rangePosition52w: r2(hi52 > lo52 ? ((px - lo52) / (hi52 - lo52)) * 100 : null),

    // ---- volume & liquidity ----
    avgVolume20: v20 ? Math.round(v20) : null,
    avgVolume50: v50 ? Math.round(v50) : null,
    volumeRatio: r2(v50 ? vols[i] / v50 : null),
    avgTurnoverCr: r2(avgTurnoverCr),
    deliveryPct: r2(bars[i][DELIV_PCT]),
    avgDeliveryPct20: r2(avgDelivPct),

    // ---- structure ----
    stage: wk.stage,
    stageName: { 1: "Basing", 2: "Advancing", 3: "Topping", 4: "Declining" }[wk.stage] || null,
    ma30w: r2(wk.ma30),
    pctFromMa30w: r2(wk.pctFromMa),
    pivots: (() => { const p = ta.pivots(bars[i]); return p ? { p: r2(p.p), r1: r2(p.r1), r2: r2(p.r2), s1: r2(p.s1), s2: r2(p.s2) } : null; })(),

    barCount: bars.length,
    corpActionGap: ta.unadjustedGap(bars),
  };
}

// =============================================================================
// 3. Build the stock index
// =============================================================================
function buildStocks() {
  console.log("[build] stitching daily bhavcopies…");
  const { series, dates } = loadPriceSeries();
  const symbolCount = Object.keys(series).length;
  console.log(`[build] ${dates.length} sessions · ${symbolCount} symbols traded · ${dates[0]} → ${dates[dates.length - 1]}`);
  if (!dates.length) throw new Error("no price data — run: node scripts/fetch_prices.mjs");

  const universe = readJson(path.join(DATA, "nse_universe.json"), { symbols: [] });
  const meta = Object.fromEntries(universe.symbols.map((s) => [s.symbol, s]));

  const wide = readJson(path.join(DATA, "fundamentals_wide.json"), { companies: {} }).companies || {};
  const deepSnap = readJson(path.join(DATA, "fundamentals.json"), { companies: [] });
  const deep = Object.fromEntries((deepSnap.companies || []).map((c) => [c.symbol, c]));
  // a local Upstox cache, when present, is fresher than the committed snapshot
  const ufundDir = path.join(VAR, "ufund");
  if (fs.existsSync(ufundDir)) {
    for (const f of fs.readdirSync(ufundDir)) {
      if (!f.endsWith(".json") || f.endsWith(".q.json")) continue;
      const j = readJson(path.join(ufundDir, f));
      if (j?.symbol && j?.ratios) deep[j.symbol] = j;
    }
  }
  // NSE's own index constituent lists: sector labels and index membership for
  // every name the exchange actually indexes.
  const ixData = readJson(path.join(DATA, "nse_indices.json"), { symbols: {} }).symbols || {};
  console.log(`[build] fundamentals: ${Object.keys(wide).length} wide · ${Object.keys(deep).length} deep (filed statements) · ${Object.keys(ixData).length} with NSE index/sector`);

  // NIFTY 50 proxy: equal-weight composite of the 50 most-traded names, so
  // relative strength and beta have a benchmark even with no index feed.
  const benchCloses = buildBenchmark(series);

  const rows = [];
  const details = new Map();
  let skippedNotListed = 0, skippedShort = 0;
  for (const [symbol, bars] of Object.entries(series)) {
    // The bhavcopy EQ series also carries ETFs (GOLDBEES, NIFTYBEES…) and names
    // that have since delisted. EQUITY_L is the exchange's own list of what is
    // actually a listed company today, so it is the gate for the equity screen.
    if (!meta[symbol]) { skippedNotListed++; continue; }
    if (bars.length < 30) { skippedShort++; continue; }
    const t = technicals(bars, benchCloses);
    if (!t) { skippedShort++; continue; }
    const m = meta[symbol] || {};
    const w = wide[symbol] || {};
    const d = deep[symbol] || null;
    const dr = d?.ratios || {};
    const ix = ixData[symbol] || null;

    // Prefer the filed Upstox figure where we have it; fall back to the wide feed.
    const pick = (deepKey, wideKey) => (dr[deepKey] ?? null) ?? (w[wideKey] ?? null);

    const marketCapCr = w.marketCapCr ?? null;
    const row = {
      symbol,
      name: m.name || w.longName || d?.name || symbol,
      isin: m.isin || d?.isin || null,
      listed: m.listed || null,
      // NSE's own industry label is the most authoritative and needs no key;
      // the wider feeds fill in the long tail the exchange does not index.
      sector: ix?.industry || w.sector || d?.profile?.sector || null,
      industry: w.industry || ix?.industry || null,
      nseTier: ix?.nseTier || null,
      inNifty50: ix ? !!ix.inNifty50 : false,
      inNifty500: ix ? !!ix.inNifty500 : false,
      sectorIndex: ix?.sectorIndices?.[0] || null,

      // ---------- fundamentals ----------
      marketCapCr,
      capTier: capTier(marketCapCr),
      pe: pick("pe", "pe"),
      forwardPe: w.forwardPe ?? null,
      pb: pick("pb", "pb"),
      pegRatio: w.pegRatio ?? null,
      priceToSales: w.priceToSales ?? null,
      evEbitda: pick("evEbitda", "evEbitda"),
      roe: pick("roe", "roe"),
      roa: pick("roa", "roa"),
      roce: dr.roce ?? null,
      profitMarginPct: pick("patMarginPct", "profitMarginPct"),
      operatingMarginPct: w.operatingMarginPct ?? null,
      grossMarginPct: w.grossMarginPct ?? null,
      ebitdaMarginPct: w.ebitdaMarginPct ?? null,
      debtToEquity: dr.debtToEquity ?? w.debtToEquity ?? null,
      currentRatio: w.currentRatio ?? null,
      quickRatio: pick("quickRatio", "quickRatio"),
      revenueCr: w.revenueCr ?? null,
      revenueGrowthPct: pick("revGrowthPct", "revenueGrowthPct"),
      earningsGrowthPct: w.earningsGrowthPct ?? null,
      eps: pick("eps", "eps"),
      bookValue: w.bookValue ?? null,
      dividendYieldPct: dr.dividendYieldPct ?? w.dividendYieldPct ?? null,
      payoutRatioPct: w.payoutRatioPct ?? null,
      promoterHoldingPct: dr.promoterHoldingPct ?? w.promoterHoldingPct ?? null,
      institutionHoldingPct: w.institutionHoldingPct ?? null,
      employees: w.employees ?? null,

      // depth flags let the UI be honest about what backs each row
      hasDeepData: !!d,
      hasFundamentals: !!(w && Object.keys(w).length),
      ...t,
    };
    // earnings yield is the inverse of P/E and is what value screens actually want
    row.earningsYieldPct = row.pe && row.pe > 0 ? r2((1 / row.pe) * 100) : null;
    rows.push(row);

    details.set(symbol, {
      symbol, name: row.name, sector: row.sector, industry: row.industry,
      description: w.description || d?.profile?.description || null,
      website: w.website || null,
      isin: row.isin, listed: row.listed,
      // weekly bars keep a 5-year chart under ~15 KB per company
      bars: ta.toWeekly(bars).map((b) => [b[0], r2(b[4]), b[5]]),
      recentDaily: bars.slice(-120).map((b) => [b[0], r2(b[1]), r2(b[2]), r2(b[3]), r2(b[4]), b[5], b[DELIV_PCT]]),
      metrics: row,
      deep: d ? {
        statements: d.statements || null,
        holdings: d.holdings || null,
        competitors: d.competitors || null,
        corporateActions: d.corporateActions || null,
        sectorBenchmarks: d.sectorBenchmarks || null,
        asOf: d.asOf || null,
      } : null,
    });
  }

  // ---- cross-sectional ranks: only meaningful once every row exists ----
  rankPercentile(rows, "ret1y", "rsRank1y");
  rankPercentile(rows, "ret3m", "rsRank3m");
  rankPercentile(rows, "avgTurnoverCr", "liquidityRank");
  // sector-relative valuation: cheap vs the market means little, cheap vs peers means something
  sectorRelative(rows, "pe", "peVsSector");
  sectorRelative(rows, "roe", "roeVsSector");

  for (const row of rows) {
    const d = details.get(row.symbol);
    if (d) d.metrics = row;
  }
  console.log(`[build] universe: ${rows.length} listed companies screened · ${skippedNotListed} ETFs/delisted skipped · ${skippedShort} too little history`);
  const missing = universe.symbols.filter((s) => !series[s.symbol]).map((s) => s.symbol);
  if (missing.length) console.log(`[build] ${missing.length} listed symbols never appear in the bhavcopy window (suspended/newly listed)`);
  return { rows, details, dates };
}

/** Equal-weight composite of the most liquid names — a benchmark with no feed. */
function buildBenchmark(series) {
  const ranked = Object.entries(series)
    .filter(([, b]) => b.length > 400)
    .map(([sym, b]) => {
      const t = b.slice(-60).map((x) => x[TURNOVER_CR]).filter((x) => typeof x === "number");
      return { sym, bars: b, turn: t.length ? t.reduce((a, c) => a + c, 0) / t.length : 0 };
    })
    .sort((a, b) => b.turn - a.turn)
    .slice(0, 50);
  if (ranked.length < 10) return null;

  const n = Math.min(...ranked.map((r) => r.bars.length));
  const out = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (const r of ranked) {
      const arr = r.bars.slice(-n);
      sum += arr[i][ta.C] / arr[0][ta.C];       // normalise each member to 1.0
    }
    out.push((sum / ranked.length) * 1000);
  }
  console.log(`[build] benchmark: equal-weight composite of the ${ranked.length} most-traded names`);
  return out;
}

/** Write a 0–100 percentile for `key` (100 = best) onto every row. */
function rankPercentile(rows, key, out) {
  const have = rows.filter((r) => typeof r[key] === "number").sort((a, b) => a[key] - b[key]);
  have.forEach((r, i) => { r[out] = r2((i / Math.max(1, have.length - 1)) * 100, 1); });
  for (const r of rows) if (r[out] === undefined) r[out] = null;
}

/** How far a metric sits from its own sector's median, in percent. */
function sectorRelative(rows, key, out) {
  const bySector = new Map();
  for (const r of rows) {
    if (typeof r[key] !== "number" || !r.sector) continue;
    if (!bySector.has(r.sector)) bySector.set(r.sector, []);
    bySector.get(r.sector).push(r[key]);
  }
  const medians = new Map();
  for (const [s, vals] of bySector) {
    vals.sort((a, b) => a - b);
    medians.set(s, vals[Math.floor(vals.length / 2)]);
  }
  for (const r of rows) {
    const med = r.sector ? medians.get(r.sector) : null;
    r[out] = typeof r[key] === "number" && med ? r2(((r[key] - med) / Math.abs(med)) * 100, 1) : null;
  }
}

const capTier = (cr) =>
  cr === null || cr === undefined ? null
    : cr >= 100_000 ? "Mega"
    : cr >= 20_000 ? "Large"
    : cr >= 5_000 ? "Mid"
    : cr >= 500 ? "Small" : "Micro";

// =============================================================================
// 4. Build the fund index
// =============================================================================
function buildFunds() {
  const uni = readJson(path.join(DATA, "mf_universe.json"), null);
  if (!uni) throw new Error("data/mf_universe.json missing — run: node scripts/fetch_funds.mjs");
  const dir = path.join(VAR, "mfhist");
  const rows = [];
  const details = new Map();

  for (const s of uni.schemes) {
    const rec = readJson(path.join(dir, `${s.code}.json`), null);
    if (!rec?.data?.length) continue;
    const hist = fm.parseHistory(rec.data.map(([date, nav]) => ({ date, nav })));
    const m = fm.computeFundMetrics(hist);
    if (!m) continue;

    // mfapi's SEBI category is authoritative; the AMFI heading is the fallback
    const sebi = rec.meta?.scheme_category || null;
    const cat = normaliseCategory(sebi, s.amfiType, s.name);

    const row = {
      code: s.code,
      name: s.name.replace(/\s*-?\s*(direct|dir)\b.*$/i, "").trim() || s.name,
      fullName: s.name,
      amc: rec.meta?.fund_house?.replace(/ Mutual Fund$/i, "") || s.amc,
      isin: s.isin,
      category: cat.label,
      categoryGroup: cat.group,
      sebiCategory: sebi,
      schemeType: rec.meta?.scheme_type || null,
      stale: !!s.stale,
      ...m,
      rolling3yAvg: m.rolling3y?.avg ?? null,
      rolling3yMin: m.rolling3y?.min ?? null,
      rolling3yMax: m.rolling3y?.max ?? null,
      rolling3yPctPositive: m.rolling3y?.pctPositive ?? null,
      rolling3yPctAbove12: m.rolling3y?.pctAbove12 ?? null,
      rolling5yAvg: m.rolling5y?.avg ?? null,
    };
    delete row.rolling3y; delete row.rolling5y;
    rows.push(row);

    details.set(s.code, {
      ...row,
      rolling3y: m.rolling3y, rolling5y: m.rolling5y,
      navSeries: fm.monthEndSeries(hist, 300),
    });
  }

  // Ranks are only fair among funds that are actually investable today.
  const live = rows.filter((r) => !r.stale);
  fm.rankWithinCategory(live, { by: "r3y", categoryKey: "category" });
  fm.rankWithinCategory(live, { by: "r1y", categoryKey: "category", prefix: "r1y" });
  fm.rankWithinCategory(live, { by: "r5y", categoryKey: "category", prefix: "r5y" });
  fm.rankWithinCategory(live, { by: "sharpe", categoryKey: "category", prefix: "sharpe" });

  for (const r of rows) {
    // 5 stars = top quintile of its category on 3-year CAGR
    r.stars = r.percentile === undefined || r.percentile === null ? null
      : r.percentile <= 20 ? 5 : r.percentile <= 40 ? 4 : r.percentile <= 60 ? 3 : r.percentile <= 80 ? 2 : 1;
    const d = details.get(r.code);
    if (d) Object.assign(d, { rank: r.rank, rankOf: r.rankOf, percentile: r.percentile, quartile: r.quartile, stars: r.stars });
  }
  return { rows, details, navDate: uni.navDate };
}

/** Collapse SEBI's long category names into a label and a broad group. */
function normaliseCategory(sebi, amfiType, name) {
  const s = `${sebi || ""} ${amfiType || ""} ${name || ""}`.toLowerCase();
  const label = (sebi || "").replace(/^(equity|debt|hybrid|solution oriented|other)\s+scheme\s*-\s*/i, "").trim();
  let group = "Other";
  if (/equity scheme/i.test(sebi || "")) group = "Equity";
  else if (/debt scheme/i.test(sebi || "")) group = "Debt";
  else if (/hybrid scheme/i.test(sebi || "")) group = "Hybrid";
  else if (/solution oriented/i.test(sebi || "")) group = "Solution Oriented";
  else if (/other scheme/i.test(sebi || "")) group = "Index / ETF / FoF";
  else if (/elss|tax saver/.test(s)) group = "Equity";
  else if (/liquid|overnight|bond|gilt|duration|debt|money market/.test(s)) group = "Debt";
  else if (/hybrid|balanced|arbitrage|multi asset/.test(s)) group = "Hybrid";
  else if (/index|etf|fund of fund|fof/.test(s)) group = "Index / ETF / FoF";
  else if (/equity|cap fund|flexi|focused|value|contra|dividend yield/.test(s)) group = "Equity";
  else if (/gold|silver/.test(s)) group = "Commodity";
  return { label: label || (sebi || "Other"), group };
}

// =============================================================================
// 5. Emit
// =============================================================================
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
  return fs.statSync(file).size;
}
const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;

const t0 = Date.now();
console.log("── building screener data ──────────────────────────────────");

const stocks = buildStocks();
const funds = buildFunds();

fs.mkdirSync(OUT, { recursive: true });

/**
 * Emit the index row-major but WITHOUT repeating key names: a header of field
 * keys plus an array of value arrays. Over 2,000 rows × ~85 fields the key
 * names alone would be about two thirds of the payload, and the browser
 * reconstitutes objects in a single pass on load.
 */
function packIndex(rows, fields) {
  const keys = fields.map((f) => f.key);
  return {
    fields: keys,
    meta: clientMeta(fields),
    rows: rows.map((r) => keys.map((k) => {
      const v = r[k];
      return v === undefined || Number.isNaN(v) ? null : v;
    })),
  };
}

const stockPack = packIndex(stocks.rows, STOCK_FIELDS);
const stockIndexSize = writeJson(path.join(OUT, "stocks.json"), {
  generated: new Date().toISOString(),
  priceDate: stocks.dates[stocks.dates.length - 1],
  sessions: stocks.dates.length,
  count: stocks.rows.length,
  ...stockPack,
});

const fundPack = packIndex(funds.rows, FUND_FIELDS);
const fundIndexSize = writeJson(path.join(OUT, "funds.json"), {
  generated: new Date().toISOString(),
  navDate: funds.navDate,
  count: funds.rows.length,
  liveCount: funds.rows.filter((r) => !r.stale).length,
  ...fundPack,
});

fs.rmSync(DETAIL, { recursive: true, force: true });
let detailBytes = 0;
for (const [sym, d] of stocks.details) detailBytes += writeJson(path.join(DETAIL, "stock", `${encodeURIComponent(sym)}.json`), d);
for (const [code, d] of funds.details) detailBytes += writeJson(path.join(DETAIL, "fund", `${code}.json`), d);

// Note: the built indexes are deliberately NOT committed back into data/. They
// are derived output that changes every session, and nothing reads them back —
// CI rebuilds them from the (permanently cached) raw sources. If every upstream
// source is unreachable, verify_build.mjs fails the workflow before the deploy
// step, which leaves the previously published site up. That is a better failure
// than serving a stale index that looks current.

const withFund = stocks.rows.filter((r) => r.hasFundamentals).length;
const withDeep = stocks.rows.filter((r) => r.hasDeepData).length;
const liveFunds = funds.rows.filter((r) => !r.stale).length;

console.log("────────────────────────────────────────────────────────────");
console.log(`[build] stocks : ${stocks.rows.length} companies · ${withFund} with fundamentals · ${withDeep} with filed statements`);
console.log(`[build]          index ${kb(stockIndexSize)} · price date ${stocks.dates[stocks.dates.length - 1]}`);
console.log(`[build] funds  : ${funds.rows.length} schemes · ${liveFunds} live · NAV date ${funds.navDate}`);
console.log(`[build]          index ${kb(fundIndexSize)}`);
console.log(`[build] detail : ${stocks.details.size + funds.details.size} per-item files · ${mb(detailBytes)} total`);
console.log(`[build] done in ${((Date.now() - t0) / 1000).toFixed(1)}s → dist/data/`);
