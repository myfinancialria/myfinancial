// ---------------------------------------------------------------------------
// market.js — MarketDataProvider: deterministic synthetic NSE data engine.
//
// Every bar is a pure function of (symbol, calendar date): series are seeded
// per-symbol and walked from a fixed epoch, then bridged to the symbol's
// anchor price at a fixed anchor date. Restarting the server, or asking on a
// different day, never rewrites history — exactly how a real feed behaves.
//
// PRODUCTION SWAP: implement this same interface against a licensed feed
// (exchange/vendor: Global Datafeeds, TrueData; broker: Kite/Upstox/Dhan).
//   interface MarketDataProvider {
//     daily(symbol, days?) weekly(symbol, weeks?) quote(symbol) quotes(list?)
//     indexQuotes() vix() optionChain(underlying, expiry?) fundamentals(symbol)
//     futuresActivity() advanceDecline()
//   }
// ---------------------------------------------------------------------------
import { STOCKS, INDICES, SECTORS, STOCK_MAP, INDEX_MAP } from "../data/universe.js";
import { rng, hash32, mulberry32, DAY, isoIST, isWeekend, clamp, round2 } from "../lib/util.js";
import * as live from "../providers/live.js";

const START = Date.parse("2016-01-04T10:00:00Z");        // series epoch (Mon)
const ANCHOR = Date.parse("2026-01-01T10:00:00Z");       // price bridged to `base` here

// ---------------------------------------------------------------------------
// calendar
// ---------------------------------------------------------------------------
const CAL = (() => {
  const days = [];
  for (let t = START; t <= Date.now() + DAY; t += DAY) if (!isWeekend(t)) days.push(t);
  return days;
})();
const ANCHOR_IDX = CAL.findIndex((t) => t >= ANCHOR);

export function marketStatus(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const wd = ist.getUTCDay();
  const open = wd >= 1 && wd <= 5 && mins >= 555 && mins <= 930; // 09:15–15:30 IST
  return { open, phase: open ? "OPEN" : "CLOSED", istTime: ist.toISOString().slice(11, 16) };
}

// ---------------------------------------------------------------------------
// core series synthesis (cached per symbol)
// ---------------------------------------------------------------------------
const seriesCache = new Map();

function spec(symbol) {
  return STOCK_MAP[symbol] || INDEX_MAP[symbol] || null;
}

function synth(symbol) {
  if (seriesCache.has(symbol)) {
    const c = seriesCache.get(symbol);
    if (c.upto === CAL.length) return c.bars;       // still current
  }
  const s = spec(symbol);
  if (!s) return null;
  const r = rng(`px:${symbol}`);
  const isVix = !!s.isVix;
  const sector = SECTORS[s.sector] || { cycle: 0.5, beta: 1 };
  const phase1 = r.next() * Math.PI * 2, phase2 = r.next() * Math.PI * 2;
  const dailyVol = (s.vol || 0.2) / Math.sqrt(252);
  const dailyDrift = (s.drift || 0.1) / 252;

  // pre-scheduled momentum bursts & shock days (deterministic)
  const bursts = new Set();
  for (let i = 0; i < CAL.length; i++) if (r.next() < 0.0025) for (let k = 0; k < 22; k++) bursts.add(i + k);
  // raw walk
  const n = CAL.length;
  const closesRaw = new Array(n);
  let p = 100;
  const rw = rng(`walk:${symbol}`);
  for (let i = 0; i < n; i++) {
    let mu = dailyDrift;
    mu += 0.00045 * Math.sin((2 * Math.PI * i) / 500 + phase1 + sector.cycle * Math.PI);
    mu += 0.0003 * Math.sin((2 * Math.PI * i) / 62 + phase2);
    if (bursts.has(i)) mu += 0.0016;
    let z = rw.normal();
    let ret;
    if (isVix) {
      // mean-reverting OU around base with spikes (floored — India VIX rarely < 10)
      const level = p;
      const target = Math.max(11, s.base * (1 + 0.18 * Math.sin((2 * Math.PI * i) / 340 + phase1)));
      ret = 0.07 * ((target - level) / level) + 0.05 * z;
      if (rw.next() < 0.01) ret += 0.28; // vol spike events
    } else {
      ret = mu + dailyVol * z;
      if (rw.next() < 0.0035) ret += (rw.next() < 0.45 ? -1 : 1) * (0.03 + 0.05 * rw.next()); // gaps
    }
    p = Math.max(isVix ? 8 : 0.5, p * (1 + ret));
    closesRaw[i] = p;
  }
  // level-shift the whole path so close(anchorDate) === base. A uniform factor
  // keeps every return untouched and every past bar immutable across restarts.
  const k = s.base / closesRaw[Math.max(0, ANCHOR_IDX)];
  const closes = closesRaw.map((v) => v * k);
  // OHLCV envelope
  const rv = rng(`vol:${symbol}`);
  const shares = s.mcap ? (s.mcap * 1e7) / s.base : 5e8; // mcap ₹cr → shares approx
  const bars = new Array(n);
  let rollingHigh = -Infinity, breakoutCooldown = 0;
  for (let i = 0; i < n; i++) {
    const prev = i ? closes[i - 1] : closes[0];
    const c = closes[i];
    const gap = 1 + (rv.next() - 0.5) * 0.35 * dailyVol * 2;
    const o = clamp(prev * gap, Math.min(prev, c) * 0.94, Math.max(prev, c) * 1.06);
    const range = Math.abs(c - o) + c * dailyVol * (0.5 + rv.next());
    const h = Math.max(o, c) + range * 0.35 * rv.next();
    const l = Math.max(0.01, Math.min(o, c) - range * 0.35 * rv.next());
    const retAbs = Math.abs(c / prev - 1);
    // 52w-high breakouts print with participation — expand volume, then decay
    if (i >= 252) {
      const win = i - 252;
      rollingHigh = Math.max(...closes.slice(win, i)); // 252-bar prior high
      if (c > rollingHigh && breakoutCooldown <= 0) breakoutCooldown = 4;
    }
    const boost = breakoutCooldown > 0 ? (breakoutCooldown === 4 ? 2.6 : 1.5) : 1;
    if (breakoutCooldown > 0) breakoutCooldown--;
    const turn = 0.0025 * (0.6 + 0.8 * rv.next()) * (1 + 18 * retAbs) * boost;
    const v = isVix ? 0 : Math.round(shares * turn);
    bars[i] = { time: Math.floor(CAL[i] / 1000), open: round2(o), high: round2(h), low: round2(l), close: round2(c), volume: v };
  }
  seriesCache.set(symbol, { bars, upto: CAL.length });
  return bars;
}

// ---------------------------------------------------------------------------
// live tick state — random-walks the last close during the session
// ---------------------------------------------------------------------------
const tickState = new Map(); // symbol → {ltp, dayHigh, dayLow, lastTs}

function liveState(symbol) {
  const bars = synth(symbol);
  if (!bars) return null;
  const lastBar = bars[bars.length - 1];
  if (!tickState.has(symbol)) {
    tickState.set(symbol, { ltp: lastBar.close, dayOpen: lastBar.open, dayHigh: lastBar.high, dayLow: lastBar.low, vol: lastBar.volume, prevClose: bars[bars.length - 2]?.close ?? lastBar.open });
  }
  return tickState.get(symbol);
}

/** advance one tick for a symbol (called by the ticker loop) */
function tickSymbol(symbol, tickR) {
  const s = spec(symbol);
  const st = liveState(symbol);
  if (!s || !st) return null;
  const dv = ((s.vol || 0.2) / Math.sqrt(252)) * 0.09;
  st.ltp = Math.max(0.05, st.ltp * (1 + dv * tickR.normal()));
  st.ltp = round2(st.ltp);
  st.dayHigh = Math.max(st.dayHigh, st.ltp);
  st.dayLow = Math.min(st.dayLow, st.ltp);
  st.vol += Math.round(Math.abs(tickR.normal()) * 25000);
  return st;
}

let tickerStarted = false;
export function startTicker(broadcast, intervalMs = 2500) {
  if (tickerStarted) return;
  tickerStarted = true;
  const all = [...STOCKS.map((s) => s.symbol), ...INDICES.map((i) => i.symbol)];
  setInterval(() => {
    const tickR = rng(`tick:${Math.floor(Date.now() / 2500)}`);
    const batchSize = 18;
    const off = Math.floor(Date.now() / 2500) % all.length;
    const updates = [];
    for (let k = 0; k < batchSize; k++) {
      const sym = all[(off + k * 7) % all.length];
      const st = tickSymbol(sym, tickR);
      if (st) updates.push(quote(sym));
    }
    broadcast({ type: "ticks", data: updates, ts: Date.now() });
  }, intervalMs).unref();
}

// ---------------------------------------------------------------------------
// public provider surface — live broker bars preferred, synthetic backfill
// ---------------------------------------------------------------------------
const spliceCache = new Map(); // symbol → { version, bars }

/** Live broker tail + level-matched synthetic head = full-depth daily series. */
function effectiveSeries(symbol) {
  const liveBars = live.bars(symbol);
  if (!liveBars || !liveBars.length) return synth(symbol);
  const cached = spliceCache.get(symbol);
  if (cached && cached.version === live.version()) return cached.bars;
  const synthetic = synth(symbol) || [];
  const firstLiveTime = liveBars[0].time;
  const head = synthetic.filter((b) => b.time < firstLiveTime);
  let out;
  if (!head.length) out = liveBars;
  else {
    const k = liveBars[0].open / head[head.length - 1].close || 1; // level-match at the seam
    out = head.map((b) => ({ ...b, open: round2(b.open * k), high: round2(b.high * k), low: round2(b.low * k), close: round2(b.close * k) })).concat(liveBars);
  }
  spliceCache.set(symbol, { version: live.version(), bars: out });
  return out;
}

export function startLiveFeed() {
  live.start([...STOCKS.map((s) => s.symbol), ...INDICES.map((i) => i.symbol)]);
}
export const liveStatus = () => live.status();

export function daily(symbol, days = 260) {
  const bars = effectiveSeries(symbol);
  if (!bars) return [];
  return days >= bars.length ? bars : bars.slice(bars.length - days);
}

export function weekly(symbol, weeks = 260) {
  const bars = effectiveSeries(symbol);
  if (!bars) return [];
  const out = [];
  let cur = null;
  for (const b of bars) {
    const wk = Math.floor((b.time * 1000 - Date.parse("2016-01-04")) / (7 * DAY));
    if (!cur || cur.wk !== wk) {
      if (cur) out.push(cur.bar);
      cur = { wk, bar: { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume } };
    } else {
      cur.bar.high = Math.max(cur.bar.high, b.high);
      cur.bar.low = Math.min(cur.bar.low, b.low);
      cur.bar.close = b.close;
      cur.bar.volume += b.volume;
    }
  }
  if (cur) out.push(cur.bar);
  return out.slice(-weeks);
}

export function quote(symbol) {
  const s = spec(symbol);
  if (!s) return null;
  const lq = live.quote(symbol);                                // fresh broker quote wins
  let ltp, prevClose, dayOpen, dayHigh, dayLow, vol, source;
  if (lq) {
    ({ ltp } = lq);
    prevClose = lq.prevClose ?? ltp; dayOpen = lq.open ?? ltp;
    dayHigh = lq.high ?? ltp; dayLow = lq.low ?? ltp; vol = lq.volume || 0;
    source = live.mode();
  } else {
    const st = liveState(symbol);
    if (!st) return null;
    ({ ltp } = st);
    prevClose = st.prevClose; dayOpen = st.dayOpen; dayHigh = st.dayHigh; dayLow = st.dayLow; vol = st.vol;
    source = "synthetic";
  }
  const change = ltp - prevClose;
  return {
    symbol, name: s.name, sector: s.sector || null, isIndex: !!INDEX_MAP[symbol], source,
    ltp: round2(ltp), prevClose: round2(prevClose), open: round2(dayOpen),
    high: round2(dayHigh), low: round2(dayLow), volume: vol,
    change: round2(change), changePct: round2(prevClose ? (change / prevClose) * 100 : 0),
    week52High: round2(Math.max(...daily(symbol, 252).map((b) => b.high))),
    week52Low: round2(Math.min(...daily(symbol, 252).map((b) => b.low))),
  };
}

export function quotes(symbols) {
  return (symbols || STOCKS.map((s) => s.symbol)).map(quote).filter(Boolean);
}
export function indexQuotes() {
  return INDICES.filter((i) => !i.isVix).map((i) => quote(i.symbol));
}
export function vix() {
  return quote("INDIAVIX");
}

export function advanceDecline() {
  const qs = quotes();
  const bySector = {};
  let adv = 0, dec = 0, unch = 0;
  for (const q of qs) {
    if (q.changePct > 0.05) adv++; else if (q.changePct < -0.05) dec++; else unch++;
    const sec = q.sector || "OTHER";
    bySector[sec] ??= { sector: sec, name: SECTORS[sec]?.name || sec, advances: 0, declines: 0, unchanged: 0 };
    if (q.changePct > 0.05) bySector[sec].advances++;
    else if (q.changePct < -0.05) bySector[sec].declines++;
    else bySector[sec].unchanged++;
  }
  return { total: { advances: adv, declines: dec, unchanged: unch }, sectors: Object.values(bySector) };
}

// ---------------------------------------------------------------------------
// options & futures (synthetic chain via Black–Scholes off VIX-implied IV)
// ---------------------------------------------------------------------------
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function blackScholes({ S, K, T, r = 0.066, iv, type }) {
  if (T <= 0) return { price: Math.max(type === "CE" ? S - K : K - S, 0), delta: 0, theta: 0, gamma: 0, vega: 0 };
  const d1 = (Math.log(S / K) + (r + (iv * iv) / 2) * T) / (iv * Math.sqrt(T));
  const d2 = d1 - iv * Math.sqrt(T);
  const pdf = Math.exp((-d1 * d1) / 2) / Math.sqrt(2 * Math.PI);
  const call = S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  const price = type === "CE" ? call : call - S + K * Math.exp(-r * T);
  const delta = type === "CE" ? normCdf(d1) : normCdf(d1) - 1;
  const theta = (-(S * pdf * iv) / (2 * Math.sqrt(T)) - (type === "CE" ? 1 : -1) * r * K * Math.exp(-r * T) * normCdf(type === "CE" ? d2 : -d2)) / 365;
  return { price: round2(Math.max(0.05, price)), delta: round2(delta * 100) / 100, gamma: pdf / (S * iv * Math.sqrt(T)), theta: round2(theta), vega: round2((S * pdf * Math.sqrt(T)) / 100) };
}

export function nextExpiries(n = 3) {
  // weekly NIFTY expiry: Thursday
  const out = [];
  let d = new Date();
  while (out.length < n) {
    d = new Date(d.getTime() + DAY);
    const ist = new Date(d.getTime() + 330 * 60_000);
    if (ist.getUTCDay() === 4) out.push(isoIST(d.getTime()));
  }
  return out;
}

export function optionChain(underlying = "NIFTY", expiry = null) {
  const q0 = quote(underlying);
  if (!q0) return null;
  const expiries = nextExpiries(4);
  const exp = expiry && expiries.includes(expiry) ? expiry : expiries[0];
  const T = Math.max(1, (Date.parse(exp) - Date.now()) / DAY) / 365;
  const ivBase = clamp((vix()?.ltp ?? 14) / 100, 0.08, 0.6);
  const step = underlying === "BANKNIFTY" ? 100 : underlying === "NIFTY" ? 50 : Math.max(2.5, Math.round(q0.ltp * 0.01 / 2.5) * 2.5);
  const atm = Math.round(q0.ltp / step) * step;
  const rows = [];
  const rOI = rng(`oi:${underlying}:${exp}`);
  for (let i = -12; i <= 12; i++) {
    const K = atm + i * step;
    const skew = 1 + Math.abs(i) * 0.006 + (i < 0 ? 0.012 * Math.abs(i) * 0.4 : 0); // put skew
    const iv = ivBase * skew;
    const ce = blackScholes({ S: q0.ltp, K, T, iv, type: "CE" });
    const pe = blackScholes({ S: q0.ltp, K, T, iv, type: "PE" });
    const conc = Math.exp(-(i * i) / 30) * (K % (step * 10) === 0 ? 1.6 : 1); // OI clusters near ATM & round strikes
    const ceOI = Math.round((1.4e6 * conc * (0.6 + rOI.next())) * (i >= 0 ? 1.25 : 0.8));
    const peOI = Math.round((1.4e6 * conc * (0.6 + rOI.next())) * (i <= 0 ? 1.25 : 0.8));
    rows.push({
      strike: K, atm: K === atm,
      ce: { ...ce, oi: ceOI, oiChg: Math.round(ceOI * (rOI.next() - 0.42) * 0.2), iv: round2(iv * 100) },
      pe: { ...pe, oi: peOI, oiChg: Math.round(peOI * (rOI.next() - 0.42) * 0.2), iv: round2(iv * 100) },
    });
  }
  const pcr = rows.reduce((a, r) => a + r.pe.oi, 0) / Math.max(1, rows.reduce((a, r) => a + r.ce.oi, 0));
  const maxPain = rows.reduce((best, r) => {
    const pain = rows.reduce((p, x) => p + x.ce.oi * Math.max(0, r.strike - x.strike) + x.pe.oi * Math.max(0, x.strike - r.strike), 0);
    return !best || pain < best.pain ? { strike: r.strike, pain } : best;
  }, null);
  return { underlying, spot: q0.ltp, expiry: exp, expiries, step, atm, rows, pcr: round2(pcr), maxPain: maxPain?.strike, lotSize: underlying === "BANKNIFTY" ? 15 : underlying === "NIFTY" ? 25 : 500 };
}

/** Futures build-up classification: price Δ vs OI Δ quadrants. */
export function futuresActivity() {
  const rF = rng(`fut:${isoIST(Date.now())}`);
  const rows = STOCKS.filter((s) => s.fno).map((s) => {
    const q0 = quote(s.symbol);
    const oiChgPct = round2((rF.next() - 0.46 + (q0.changePct > 0 ? 0.08 : -0.05)) * 14);
    const p = q0.changePct;
    const tag = p >= 0 && oiChgPct >= 0 ? "LONG_BUILDUP" : p < 0 && oiChgPct >= 0 ? "SHORT_BUILDUP" : p >= 0 ? "SHORT_COVERING" : "LONG_UNWINDING";
    return { symbol: s.symbol, name: s.name, priceChgPct: p, oiChgPct, tag, ltp: q0.ltp };
  });
  const buckets = { LONG_BUILDUP: [], SHORT_BUILDUP: [], SHORT_COVERING: [], LONG_UNWINDING: [] };
  for (const r of rows) buckets[r.tag].push(r);
  for (const k of Object.keys(buckets)) buckets[k].sort((a, b) => Math.abs(b.oiChgPct) - Math.abs(a.oiChgPct));
  return buckets;
}

// ---------------------------------------------------------------------------
// fundamentals (deterministic statement generator, FY2019–FY2026)
// ---------------------------------------------------------------------------
const fundCache = new Map();

export function fundamentals(symbol) {
  if (fundCache.has(symbol)) return fundCache.get(symbol);
  const s = STOCK_MAP[symbol];
  if (!s) return null;
  const r = rng(`fund:${symbol}`);
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]; // FY ending March
  const q0 = quote(symbol);
  const price = q0?.ltp ?? s.base;
  const shares = (s.mcap * 1e7) / s.base;                    // approx share count
  const isBank = s.sector === "BANK" || s.sector === "NBFC";

  // revenue anchored so trailing P/S looks sane per sector quality
  const psRatio = 1.5 + s.quality * 6 + (s.sector === "IT" ? 1.5 : 0) - (s.sector === "METAL" || s.sector === "ENERGY" ? 1.2 : 0);
  let rev = (s.mcap / Math.max(0.8, psRatio)) * 0.62;        // FY19 base revenue ₹cr
  const gBase = 0.04 + s.growth * 0.20;
  const emBase = isBank ? 0 : 0.10 + s.quality * 0.22;
  const annual = years.map((fy, i) => {
    const g = gBase + (fy === 2020 ? -0.10 : fy === 2021 ? 0.06 : 0) + (r.next() - 0.5) * 0.05;
    if (i) rev = rev * (1 + g);
    const em = clamp(emBase + (r.next() - 0.5) * 0.02 + s.quality * 0.01 * i * 0.5, 0.05, 0.45);
    const ebitda = isBank ? null : rev * em;
    const nimOrEm = isBank ? 0.032 + s.quality * 0.012 : em;
    const patMargin = isBank ? 0.16 + s.quality * 0.10 : clamp(em * (0.55 + s.quality * 0.2) - 0.02, 0.02, 0.32);
    const pat = rev * patMargin;
    const de = isBank ? null : clamp((s.sector === "METAL" || s.sector === "REALTY" || s.sector === "INFRA" ? 0.9 : 0.35) - s.quality * 0.3 + (r.next() - 0.5) * 0.1, 0.0, 2.2);
    const roe = clamp(8 + s.quality * 16 + s.growth * 4 + (r.next() - 0.5) * 3, 4, 45);
    const roce = isBank ? null : clamp(roe * (1.05 - (de ?? 0) * 0.15), 4, 50);
    const fcf = isBank ? null : pat * (0.35 + s.quality * 0.55 + (r.next() - 0.5) * 0.15);
    return {
      fy: `FY${String(fy).slice(2)}`, revenue: Math.round(rev), growthPct: round2(g * 100),
      ebitda: ebitda && Math.round(ebitda), ebitdaMarginPct: isBank ? null : round2(em * 100),
      nim: isBank ? round2(nimOrEm * 100) : null,
      pat: Math.round(pat), patMarginPct: round2(patMargin * 100),
      eps: round2((pat * 1e7) / shares), roe: round2(roe), roce: roce && round2(roce),
      debtToEquity: de === null ? null : round2(de), fcf: fcf && Math.round(fcf),
    };
  });
  const last = annual[annual.length - 1];
  const prev = annual[annual.length - 2];
  const cagr3 = Math.pow(last.revenue / annual[annual.length - 4].revenue, 1 / 3) - 1;
  const patCagr3 = Math.pow(Math.max(1, last.pat) / Math.max(1, annual[annual.length - 4].pat), 1 / 3) - 1;
  const eps = last.eps;
  const ratios = {
    marketCap: Math.round((price / s.base) * s.mcap), price,
    pe: round2(price / Math.max(0.1, eps)),
    pb: round2((price / Math.max(0.1, eps)) * (last.roe / 100)),
    evEbitda: last.ebitda ? round2(((price / s.base) * s.mcap + (last.debtToEquity ?? 0) * 0.3 * s.mcap) / last.ebitda) : null,
    dividendYieldPct: round2(clamp(0.2 + s.quality * 1.6 - s.growth * 1.0, 0, 4.5)),
    revCagr3Pct: round2(cagr3 * 100), patCagr3Pct: round2(patCagr3 * 100),
    revGrowthPct: last.growthPct, patGrowthPct: round2(((last.pat - prev.pat) / Math.max(1, prev.pat)) * 100),
  };
  // quarterly split of the last FY with mild seasonality
  const rq = rng(`qtr:${symbol}`);
  const seas = [0.235, 0.245, 0.25, 0.27];
  const quarters = ["Q1 FY26", "Q2 FY26", "Q3 FY26", "Q4 FY26E"].map((qn, i) => {
    const qrev = last.revenue * seas[i] * (1 + (rq.next() - 0.5) * 0.05);
    const qpat = qrev * (last.patMarginPct / 100) * (1 + (rq.next() - 0.5) * 0.1);
    return { q: qn, revenue: Math.round(qrev), pat: Math.round(qpat), patMarginPct: round2((qpat / qrev) * 100) };
  });
  const out = { symbol, annual, quarters, ratios, shares: Math.round(shares) };
  fundCache.set(symbol, out);
  return out;
}
