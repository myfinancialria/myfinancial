// ---------------------------------------------------------------------------
// screeners.js — Quantitative & technical market screeners:
//   • Relative Rotation Graphs (JdK RS-Ratio / RS-Momentum vs Nifty benchmark)
//     with sector → constituent drill-down and 8-week trails
//   • Chart-pattern detector (double bottom, H&S, bull flag, cup & handle,
//     ascending triangle) built on fractal pivots with measured-move targets
//   • 52-week-high weekly breakouts with volume expansion (≥2× 20-wk SMA)
//   • Darvas box consolidations with pre-breakout volume signature
// ---------------------------------------------------------------------------
import { STOCKS, INDICES, SECTORS, STOCK_MAP } from "../data/universe.js";
import { daily, weekly, quote } from "./market.js";
import { mean, stdev, smaAt, round2, round1 } from "../lib/util.js";

// ---------------------------------------------------------------------------
// RRG
// ---------------------------------------------------------------------------
function rrgSeries(symbol, benchmark = "NIFTY", weeks = 80, win = 14) {
  const a = weekly(symbol, weeks + win + 12);
  const b = weekly(benchmark, weeks + win + 12);
  const n = Math.min(a.length, b.length);
  if (n < win + 12) return null;
  const rs = [];
  for (let i = 0; i < n; i++) rs.push((a[a.length - n + i].close / b[b.length - n + i].close) * 100);
  // JdK-style normalisation: z-score of RS vs its rolling window → 100-centred
  const ratio = [];
  for (let i = 0; i < rs.length; i++) {
    if (i < win) { ratio.push(null); continue; }
    const w = rs.slice(i - win, i + 1);
    const m = mean(w), sd = stdev(w) || 1e-9;
    ratio.push(100 + ((rs[i] - m) / sd));
  }
  const mom = [];
  const roc = ratio.map((v, i) => (v === null || ratio[i - 1] == null ? null : v - ratio[i - 1]));
  for (let i = 0; i < roc.length; i++) {
    if (roc[i] === null || i < win + 5) { mom.push(null); continue; }
    const w = roc.slice(Math.max(0, i - 9), i + 1).filter((x) => x !== null);
    const m = mean(w), sd = stdev(w) || 1e-9;
    mom.push(100 + ((roc[i] - m) / sd) * 1.4);
  }
  return { ratio, mom, times: a.slice(a.length - n).map((x) => x.time) };
}

const quadrantOf = (x, y) => (x >= 100 && y >= 100 ? "LEADING" : x >= 100 ? "WEAKENING" : y >= 100 ? "IMPROVING" : "LAGGING");

/** RRG for all sector indices (or constituents of one sector) vs benchmark. */
export function rrg({ scope = "sectors", sector = null, benchmark = "NIFTY", trail = 8 } = {}) {
  let items;
  if (scope === "sectors") {
    items = INDICES.filter((i) => i.members && i.members.length).map((i) => ({ symbol: i.symbol, name: i.name, kind: "SECTOR", sectorKey: i.members[0] }));
  } else {
    items = STOCKS.filter((s) => s.sector === sector).map((s) => ({ symbol: s.symbol, name: s.name, kind: "STOCK", sectorKey: s.sector }));
  }
  const out = [];
  for (const it of items) {
    const se = rrgSeries(it.symbol, benchmark);
    if (!se) continue;
    const pts = [];
    for (let i = se.ratio.length - trail; i < se.ratio.length; i++) {
      if (se.ratio[i] === null || se.mom[i] === null) continue;
      pts.push({ x: round2(se.ratio[i]), y: round2(se.mom[i]), t: se.times[i] });
    }
    if (!pts.length) continue;
    const lastPt = pts[pts.length - 1];
    out.push({ ...it, trail: pts, x: lastPt.x, y: lastPt.y, quadrant: quadrantOf(lastPt.x, lastPt.y), heading: pts.length > 1 ? round2(lastPt.y - pts[pts.length - 2].y) : 0 });
  }
  return { benchmark, scope, sector, sectorName: sector ? SECTORS[sector]?.name : null, items: out };
}

// ---------------------------------------------------------------------------
// fractal pivots
// ---------------------------------------------------------------------------
function pivots(bars, k = 3) {
  const highs = [], lows = [];
  for (let i = k; i < bars.length - k; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= k; j++) {
      if (bars[i].high < bars[i - j].high || bars[i].high < bars[i + j].high) isH = false;
      if (bars[i].low > bars[i - j].low || bars[i].low > bars[i + j].low) isL = false;
    }
    if (isH) highs.push({ i, price: bars[i].high, time: bars[i].time });
    if (isL) lows.push({ i, price: bars[i].low, time: bars[i].time });
  }
  return { highs, lows };
}

const near = (a, b, tol) => Math.abs(a - b) / ((a + b) / 2) <= tol;

// ---------------------------------------------------------------------------
// individual pattern detectors — each returns null or a structured hit
// ---------------------------------------------------------------------------
function detectDoubleBottom(bars, pv) {
  const { lows, highs } = pv;
  const n = bars.length, last = bars[n - 1].close;
  for (let a = lows.length - 2; a >= 0; a--) {
    for (let b = lows.length - 1; b > a; b--) {
      const L1 = lows[a], L2 = lows[b];
      const sep = L2.i - L1.i;
      if (sep < 15 || sep > 70) continue;
      if (!near(L1.price, L2.price, 0.03)) continue;
      if (n - 1 - L2.i > 25) continue;                        // second low must be recent
      const between = highs.filter((h) => h.i > L1.i && h.i < L2.i);
      if (!between.length) continue;
      const neck = Math.max(...between.map((h) => h.price));
      const depth = (neck - Math.min(L1.price, L2.price)) / neck;
      if (depth < 0.05) continue;
      const status = last > neck ? "BREAKOUT" : last > neck * 0.97 ? "FORMING" : null;
      if (!status) continue;
      const target = neck * (1 + depth);
      return {
        pattern: "DOUBLE_BOTTOM", bias: "BULLISH", status,
        entry: round2(neck * 1.002), target1: round2(neck * (1 + depth * 0.6)), target2: round2(target),
        stop: round2(Math.min(L1.price, L2.price) * 0.99),
        anchors: [{ i: L1.i, t: L1.time, price: L1.price }, { i: L2.i, t: L2.time, price: L2.price }],
        neckline: round2(neck), depthPct: round1(depth * 100),
      };
    }
  }
  return null;
}

function detectHeadShoulders(bars, pv) {
  const { highs, lows } = pv;
  const n = bars.length, last = bars[n - 1].close;
  for (let c = highs.length - 1; c >= 2; c--) {
    const R = highs[c];
    if (n - 1 - R.i > 30) break;
    for (let b = c - 1; b >= 1; b--) {
      const H = highs[b];
      if (R.i - H.i < 8 || R.i - H.i > 55) continue;
      for (let a = b - 1; a >= 0; a--) {
        const L = highs[a];
        if (H.i - L.i < 8 || H.i - L.i > 55) continue;
        if (!(H.price > L.price * 1.03 && H.price > R.price * 1.03)) continue;   // head prominence
        if (!near(L.price, R.price, 0.04)) continue;                             // shoulder symmetry
        const trough = lows.filter((x) => x.i > L.i && x.i < R.i);
        if (trough.length < 2) continue;
        const neck = mean(trough.map((t) => t.price));
        const height = H.price - neck;
        if (height / neck < 0.05) continue;
        if (R.price < neck * 1.02) continue;                 // right shoulder must sit above neckline
        const status = last < neck ? "BREAKDOWN" : last < neck * 1.03 ? "FORMING" : null;
        if (!status) continue;
        if ((R.price * 1.01 - neck) / neck < 0.015) continue; // reject razor-thin stop distance
        return {
          pattern: "HEAD_SHOULDERS", bias: "BEARISH", status,
          entry: round2(neck * 0.998), target1: round2(neck - height * 0.6), target2: round2(neck - height),
          stop: round2(R.price * 1.01),
          anchors: [L, H, R].map((x) => ({ i: x.i, t: x.time, price: x.price })),
          neckline: round2(neck), depthPct: round1((height / neck) * 100),
        };
      }
    }
  }
  return null;
}

function detectFlag(bars) {
  const n = bars.length;
  if (n < 40) return null;
  // pole: ≥12% rally within ≤ 18 bars, ending 5–20 bars ago
  for (let end = n - 6; end >= n - 22 && end > 20; end--) {
    for (let start = end - 6; start >= end - 18 && start >= 0; start--) {
      const rise = bars[end].close / bars[start].low - 1;
      if (rise < 0.12) continue;
      const flag = bars.slice(end, n);
      if (flag.length < 4) continue;
      const fh = Math.max(...flag.map((b) => b.high)), fl = Math.min(...flag.map((b) => b.low));
      const poleHeight = bars[end].close - bars[start].low;
      if ((fh - fl) > poleHeight * 0.5) continue;                 // consolidation must be tight
      const drift = flag[flag.length - 1].close / flag[0].close - 1;
      if (drift < -0.08 || drift > 0.03) continue;                // gentle down/sideways
      const volPole = mean(bars.slice(start, end + 1).map((b) => b.volume));
      const volFlag = mean(flag.map((b) => b.volume));
      if (volFlag > volPole * 0.9) continue;                      // volume contraction
      const last = bars[n - 1].close;
      const status = last > fh ? "BREAKOUT" : "FORMING";
      return {
        pattern: "BULL_FLAG", bias: "BULLISH", status,
        entry: round2(fh * 1.002), target1: round2(fh + poleHeight * 0.5), target2: round2(fh + poleHeight),
        stop: round2(fl * 0.99),
        anchors: [{ i: start, t: bars[start].time, price: bars[start].low }, { i: end, t: bars[end].time, price: bars[end].close }],
        depthPct: round1(rise * 100),
      };
    }
  }
  return null;
}

function detectCupHandle(bars, pv) {
  const n = bars.length, last = bars[n - 1].close;
  const { highs } = pv;
  for (let a = 0; a < highs.length; a++) {
    const rimL = highs[a];
    if (n - rimL.i < 40) break;
    // find recovery to within 3% of left rim ≥ 30 bars later
    for (let j = rimL.i + 30; j < n - 5; j++) {
      if (bars[j].high < rimL.price * 0.97) continue;
      const cup = bars.slice(rimL.i, j + 1);
      const bottom = Math.min(...cup.map((b) => b.low));
      const depth = (rimL.price - bottom) / rimL.price;
      if (depth < 0.12 || depth > 0.45) break;
      const bottomIdx = rimL.i + cup.findIndex((b) => b.low === bottom);
      const centred = bottomIdx > rimL.i + cup.length * 0.25 && bottomIdx < rimL.i + cup.length * 0.75;
      if (!centred) break;                                       // want a rounded, centred base
      const handle = bars.slice(j + 1);
      if (handle.length < 3 || handle.length > 20) break;
      const hLow = Math.min(...handle.map((b) => b.low));
      const pull = (bars[j].high - hLow) / bars[j].high;
      if (pull < 0.02 || pull > 0.12) break;
      const pivot = Math.max(rimL.price, bars[j].high);
      const status = last > pivot ? "BREAKOUT" : "FORMING";
      return {
        pattern: "CUP_HANDLE", bias: "BULLISH", status,
        entry: round2(pivot * 1.002), target1: round2(pivot * (1 + depth * 0.5)), target2: round2(pivot * (1 + depth)),
        stop: round2(hLow * 0.99),
        anchors: [{ i: rimL.i, t: rimL.time, price: rimL.price }, { i: bottomIdx, t: bars[bottomIdx].time, price: bottom }, { i: j, t: bars[j].time, price: bars[j].high }],
        depthPct: round1(depth * 100),
      };
    }
  }
  return null;
}

function detectAscTriangle(bars, pv) {
  const { highs, lows } = pv;
  const n = bars.length, last = bars[n - 1].close;
  const recentH = highs.filter((h) => n - h.i <= 70);
  const recentL = lows.filter((l) => n - l.i <= 70);
  if (recentH.length < 2 || recentL.length < 3) return null;
  // flat top: ≥2 highs within 1.5%
  for (let i = 0; i < recentH.length - 1; i++) {
    const flat = [recentH[i]];
    for (let j = i + 1; j < recentH.length; j++) if (near(recentH[j].price, recentH[i].price, 0.015)) flat.push(recentH[j]);
    if (flat.length < 2 || flat[flat.length - 1].i - flat[0].i < 15) continue;
    const resistance = mean(flat.map((h) => h.price));
    const inLows = recentL.filter((l) => l.i >= flat[0].i - 5);
    if (inLows.length < 2) continue;
    let rising = true;
    for (let k = 1; k < inLows.length; k++) if (inLows[k].price < inLows[k - 1].price * 1.002) rising = false;
    if (!rising) continue;
    const height = resistance - inLows[0].price;
    if (height / resistance < 0.04) continue;
    const status = last > resistance ? "BREAKOUT" : "FORMING";
    return {
      pattern: "ASC_TRIANGLE", bias: "BULLISH", status,
      entry: round2(resistance * 1.002), target1: round2(resistance + height * 0.6), target2: round2(resistance + height),
      stop: round2(inLows[inLows.length - 1].price * 0.99),
      anchors: [...flat.map((h) => ({ i: h.i, t: h.time, price: h.price })), ...inLows.map((l) => ({ i: l.i, t: l.time, price: l.price }))],
      depthPct: round1((height / resistance) * 100),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// public scanners
// ---------------------------------------------------------------------------
let patternCache = { at: 0, data: null };

export function scanPatterns() {
  if (patternCache.data && Date.now() - patternCache.at < 120_000) return patternCache.data;
  const hits = [];
  for (const s of STOCKS) {
    const bars = daily(s.symbol, 210);
    if (bars.length < 80) continue;
    const pv = pivots(bars);
    for (const det of [detectDoubleBottom, detectHeadShoulders, detectFlag, detectCupHandle, detectAscTriangle]) {
      const hit = det(bars, pv);
      if (hit) {
        const qt = quote(s.symbol);
        const riskDist = hit.bias === "BULLISH" ? hit.entry - hit.stop : hit.stop - hit.entry;
        if (riskDist / hit.entry < 0.012) continue;           // reject degenerate geometry
        const rr = hit.bias === "BULLISH"
          ? (hit.target2 - hit.entry) / riskDist
          : (hit.entry - hit.target2) / riskDist;
        if (rr < 0.8 || rr > 12) continue;                    // sanity band on risk-reward
        hits.push({ symbol: s.symbol, name: s.name, sector: s.sector, ltp: qt.ltp, changePct: qt.changePct, ...hit, riskReward: round2(rr) });
      }
    }
  }
  hits.sort((a, b) => (b.status === "BREAKOUT" || b.status === "BREAKDOWN" ? 1 : 0) - (a.status === "BREAKOUT" || a.status === "BREAKDOWN" ? 1 : 0) || b.riskReward - a.riskReward);
  patternCache = { at: Date.now(), data: hits };
  return hits;
}

/**
 * 52-week-high scanner on the WEEKLY timeframe.
 * `confirmed`: weekly close at/above the prior 52-week high with volume
 * expansion ≥ volMultiple × 20-week SMA. `approaching`: within 3% of the high
 * — the watchlist tier, ranked by volume build-up.
 */
export function scan52wBreakouts(volMultiple = 2) {
  const confirmed = [], approaching = [];
  for (const s of STOCKS) {
    const w = weekly(s.symbol, 80);
    if (w.length < 56) continue;
    const cur = w[w.length - 1];
    const prior = w.slice(w.length - 53, w.length - 1);
    const high52 = Math.max(...prior.map((b) => b.high));
    const vols = w.map((b) => b.volume);
    const volSma20 = smaAt(vols, vols.length - 2, 20);
    if (!volSma20) continue;
    const volX = cur.volume / volSma20;
    const dist = (cur.close / high52 - 1) * 100;
    if (dist < -3) continue;
    const qt = quote(s.symbol);
    const row = {
      symbol: s.symbol, name: s.name, sector: s.sector, ltp: qt.ltp, changePct: qt.changePct,
      weeklyClose: cur.close, prior52wHigh: round2(high52), volumeX: round2(volX),
      distancePct: round2(dist), qualifies: dist >= -0.2 && volX >= volMultiple,
    };
    (row.qualifies ? confirmed : approaching).push(row);
  }
  confirmed.sort((a, b) => b.volumeX - a.volumeX);
  approaching.sort((a, b) => b.distancePct - a.distancePct || b.volumeX - a.volumeX);
  return { volMultiple, confirmed, approaching };
}

/** Darvas-box consolidations: tight range + pre-breakout volume expansion. */
export function scanDarvas({ maxBoxPct = 9, minBars = 10, lookback = 40 } = {}) {
  const out = [];
  for (const s of STOCKS) {
    const bars = daily(s.symbol, lookback + 10);
    if (bars.length < lookback) continue;
    for (let w = 24; w >= minBars; w -= 2) {
      const box = bars.slice(bars.length - 1 - w, bars.length - 1);
      const top = Math.max(...box.map((b) => b.high));
      const bot = Math.min(...box.map((b) => b.low));
      const heightPct = ((top - bot) / bot) * 100;
      if (heightPct > maxBoxPct) continue;
      const inBox = box.filter((b) => b.close <= top * 1.001 && b.close >= bot * 0.999).length;
      if (inBox < w * 0.85) continue;
      const avgBoxVol = mean(box.map((b) => b.volume));
      const recentVol = mean(bars.slice(-5).map((b) => b.volume));
      const volX = recentVol / Math.max(1, avgBoxVol);
      if (volX < 1.25) continue;
      const last = bars[bars.length - 1];
      const status = last.close > top ? "BREAKOUT" : "CONSOLIDATING";
      const qt = quote(s.symbol);
      out.push({
        symbol: s.symbol, name: s.name, sector: s.sector, ltp: qt.ltp, changePct: qt.changePct,
        boxTop: round2(top), boxBottom: round2(bot), boxHeightPct: round2(heightPct),
        bars: w, volumeX: round2(volX), status,
        entry: round2(top * 1.002), stop: round2(bot * 0.995), target: round2(top * (1 + heightPct / 100)),
      });
      break;
    }
  }
  return out.sort((a, b) => (b.status === "BREAKOUT" ? 1 : 0) - (a.status === "BREAKOUT" ? 1 : 0) || b.volumeX - a.volumeX);
}

export const PATTERN_LABELS = {
  DOUBLE_BOTTOM: "Double Bottom", HEAD_SHOULDERS: "Head & Shoulders",
  BULL_FLAG: "Bull Flag", CUP_HANDLE: "Cup & Handle", ASC_TRIANGLE: "Ascending Triangle",
};
