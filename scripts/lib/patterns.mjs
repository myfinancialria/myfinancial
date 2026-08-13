// ---------------------------------------------------------------------------
// patterns.mjs — classical chart-pattern detection on real daily bars.
//
// The geometry here is ported from the platform's own screener engine, but that
// one runs over a synthetic price model; this runs over the split-adjusted NSE
// closes the rest of the site is built on, at build time, so the browser only
// has to draw what was found.
//
// Every detector returns the ANCHOR POINTS as well as the levels, because a
// pattern you cannot see drawn on the chart is just a label — the anchors are
// what let the page mark the two lows of a double bottom, the neckline of a
// head and shoulders, or the rim of a cup.
//
// Bars arrive as [date, open, high, low, close, volume, turnoverCr, delivPct]
// and are converted once to named fields, so the detector bodies stay readable.
// ---------------------------------------------------------------------------

const round2 = (x) => (Number.isFinite(x) ? Number(x.toFixed(2)) : null);
const round1 = (x) => (Number.isFinite(x) ? Number(x.toFixed(1)) : null);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** [date,o,h,l,c,v,...] → { time, open, high, low, close, volume }. */
export function toBars(rows) {
  return rows.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] || 0 }));
}

/** Fractal pivots: a high with `k` lower highs either side, and the mirror. */
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
// detectors — each returns null, or a hit with levels and anchors
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
      if (n - 1 - L2.i > 25) continue;                      // the second low must be recent
      const between = highs.filter((h) => h.i > L1.i && h.i < L2.i);
      if (!between.length) continue;
      const neck = Math.max(...between.map((h) => h.price));
      const depth = (neck - Math.min(L1.price, L2.price)) / neck;
      if (depth < 0.05) continue;
      const status = last > neck ? "BREAKOUT" : last > neck * 0.97 ? "FORMING" : null;
      if (!status) continue;
      return {
        pattern: "DOUBLE_BOTTOM", bias: "BULLISH", status,
        entry: round2(neck * 1.002), target1: round2(neck * (1 + depth * 0.6)), target2: round2(neck * (1 + depth)),
        stop: round2(Math.min(L1.price, L2.price) * 0.99),
        anchors: [{ i: L1.i, t: L1.time, price: round2(L1.price), label: "Low 1" }, { i: L2.i, t: L2.time, price: round2(L2.price), label: "Low 2" }],
        neckline: round2(neck), depthPct: round1(depth * 100),
      };
    }
  }
  return null;
}

/** Mirror of the double bottom — two highs that fail at the same level. */
function detectDoubleTop(bars, pv) {
  const { highs, lows } = pv;
  const n = bars.length, last = bars[n - 1].close;
  for (let a = highs.length - 2; a >= 0; a--) {
    for (let b = highs.length - 1; b > a; b--) {
      const H1 = highs[a], H2 = highs[b];
      const sep = H2.i - H1.i;
      if (sep < 15 || sep > 70) continue;
      if (!near(H1.price, H2.price, 0.03)) continue;
      if (n - 1 - H2.i > 25) continue;
      const between = lows.filter((l) => l.i > H1.i && l.i < H2.i);
      if (!between.length) continue;
      const neck = Math.min(...between.map((l) => l.price));
      const depth = (Math.max(H1.price, H2.price) - neck) / neck;
      if (depth < 0.05) continue;
      const status = last < neck ? "BREAKDOWN" : last < neck * 1.03 ? "FORMING" : null;
      if (!status) continue;
      return {
        pattern: "DOUBLE_TOP", bias: "BEARISH", status,
        entry: round2(neck * 0.998), target1: round2(neck * (1 - depth * 0.6)), target2: round2(neck * (1 - depth)),
        stop: round2(Math.max(H1.price, H2.price) * 1.01),
        anchors: [{ i: H1.i, t: H1.time, price: round2(H1.price), label: "High 1" }, { i: H2.i, t: H2.time, price: round2(H2.price), label: "High 2" }],
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
        if (R.price < neck * 1.02) continue;
        const status = last < neck ? "BREAKDOWN" : last < neck * 1.03 ? "FORMING" : null;
        if (!status) continue;
        if ((R.price * 1.01 - neck) / neck < 0.015) continue;   // reject razor-thin stops
        return {
          pattern: "HEAD_SHOULDERS", bias: "BEARISH", status,
          entry: round2(neck * 0.998), target1: round2(neck - height * 0.6), target2: round2(neck - height),
          stop: round2(R.price * 1.01),
          anchors: [
            { i: L.i, t: L.time, price: round2(L.price), label: "Left shoulder" },
            { i: H.i, t: H.time, price: round2(H.price), label: "Head" },
            { i: R.i, t: R.time, price: round2(R.price), label: "Right shoulder" },
          ],
          neckline: round2(neck), depthPct: round1((height / neck) * 100),
        };
      }
    }
  }
  return null;
}

/** Inverse head and shoulders — the bullish bottoming mirror. */
function detectInverseHS(bars, pv) {
  const { highs, lows } = pv;
  const n = bars.length, last = bars[n - 1].close;
  for (let c = lows.length - 1; c >= 2; c--) {
    const R = lows[c];
    if (n - 1 - R.i > 30) break;
    for (let b = c - 1; b >= 1; b--) {
      const H = lows[b];
      if (R.i - H.i < 8 || R.i - H.i > 55) continue;
      for (let a = b - 1; a >= 0; a--) {
        const L = lows[a];
        if (H.i - L.i < 8 || H.i - L.i > 55) continue;
        if (!(H.price < L.price * 0.97 && H.price < R.price * 0.97)) continue;
        if (!near(L.price, R.price, 0.04)) continue;
        const peaks = highs.filter((x) => x.i > L.i && x.i < R.i);
        if (peaks.length < 2) continue;
        const neck = mean(peaks.map((t) => t.price));
        const height = neck - H.price;
        if (height / neck < 0.05) continue;
        if (R.price > neck * 0.98) continue;
        const status = last > neck ? "BREAKOUT" : last > neck * 0.97 ? "FORMING" : null;
        if (!status) continue;
        return {
          pattern: "INVERSE_HS", bias: "BULLISH", status,
          entry: round2(neck * 1.002), target1: round2(neck + height * 0.6), target2: round2(neck + height),
          stop: round2(R.price * 0.99),
          anchors: [
            { i: L.i, t: L.time, price: round2(L.price), label: "Left shoulder" },
            { i: H.i, t: H.time, price: round2(H.price), label: "Head" },
            { i: R.i, t: R.time, price: round2(R.price), label: "Right shoulder" },
          ],
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
  // pole: a rally of 12%+ inside 18 bars, ending 5–20 bars ago
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
      if (drift < -0.08 || drift > 0.03) continue;                // gentle down or sideways
      const volPole = mean(bars.slice(start, end + 1).map((b) => b.volume));
      const volFlag = mean(flag.map((b) => b.volume));
      if (volFlag > volPole * 0.9) continue;                      // volume must contract
      const last = bars[n - 1].close;
      return {
        pattern: "BULL_FLAG", bias: "BULLISH", status: last > fh ? "BREAKOUT" : "FORMING",
        entry: round2(fh * 1.002), target1: round2(fh + poleHeight * 0.5), target2: round2(fh + poleHeight),
        stop: round2(fl * 0.99),
        anchors: [
          { i: start, t: bars[start].time, price: round2(bars[start].low), label: "Pole base" },
          { i: end, t: bars[end].time, price: round2(bars[end].close), label: "Pole top" },
        ],
        neckline: round2(fh), depthPct: round1(rise * 100),
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
      return {
        pattern: "CUP_HANDLE", bias: "BULLISH", status: last > pivot ? "BREAKOUT" : "FORMING",
        entry: round2(pivot * 1.002), target1: round2(pivot * (1 + depth * 0.5)), target2: round2(pivot * (1 + depth)),
        stop: round2(hLow * 0.99),
        anchors: [
          { i: rimL.i, t: rimL.time, price: round2(rimL.price), label: "Left rim" },
          { i: bottomIdx, t: bars[bottomIdx].time, price: round2(bottom), label: "Cup base" },
          { i: j, t: bars[j].time, price: round2(bars[j].high), label: "Right rim" },
        ],
        neckline: round2(pivot), depthPct: round1(depth * 100),
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
    return {
      pattern: "ASC_TRIANGLE", bias: "BULLISH", status: last > resistance ? "BREAKOUT" : "FORMING",
      entry: round2(resistance * 1.002), target1: round2(resistance + height * 0.6), target2: round2(resistance + height),
      stop: round2(inLows[inLows.length - 1].price * 0.99),
      anchors: [
        ...flat.slice(0, 3).map((h) => ({ i: h.i, t: h.time, price: round2(h.price), label: "Resistance" })),
        ...inLows.slice(-3).map((l) => ({ i: l.i, t: l.time, price: round2(l.price), label: "Rising low" })),
      ],
      neckline: round2(resistance), depthPct: round1((height / resistance) * 100),
    };
  }
  return null;
}

/** Falling highs against a flat floor — distribution rather than accumulation. */
function detectDescTriangle(bars, pv) {
  const { highs, lows } = pv;
  const n = bars.length, last = bars[n - 1].close;
  const recentH = highs.filter((h) => n - h.i <= 70);
  const recentL = lows.filter((l) => n - l.i <= 70);
  if (recentL.length < 2 || recentH.length < 3) return null;
  for (let i = 0; i < recentL.length - 1; i++) {
    const flat = [recentL[i]];
    for (let j = i + 1; j < recentL.length; j++) if (near(recentL[j].price, recentL[i].price, 0.015)) flat.push(recentL[j]);
    if (flat.length < 2 || flat[flat.length - 1].i - flat[0].i < 15) continue;
    const support = mean(flat.map((l) => l.price));
    const inHighs = recentH.filter((h) => h.i >= flat[0].i - 5);
    if (inHighs.length < 2) continue;
    let falling = true;
    for (let k = 1; k < inHighs.length; k++) if (inHighs[k].price > inHighs[k - 1].price * 0.998) falling = false;
    if (!falling) continue;
    const height = inHighs[0].price - support;
    if (height / support < 0.04) continue;
    return {
      pattern: "DESC_TRIANGLE", bias: "BEARISH", status: last < support ? "BREAKDOWN" : "FORMING",
      entry: round2(support * 0.998), target1: round2(support - height * 0.6), target2: round2(support - height),
      stop: round2(inHighs[inHighs.length - 1].price * 1.01),
      anchors: [
        ...flat.slice(0, 3).map((l) => ({ i: l.i, t: l.time, price: round2(l.price), label: "Support" })),
        ...inHighs.slice(-3).map((h) => ({ i: h.i, t: h.time, price: round2(h.price), label: "Falling high" })),
      ],
      neckline: round2(support), depthPct: round1((height / support) * 100),
    };
  }
  return null;
}

const DETECTORS = [
  detectDoubleBottom, detectDoubleTop, detectHeadShoulders, detectInverseHS,
  detectFlag, detectCupHandle, detectAscTriangle, detectDescTriangle,
];

export const PATTERN_LABELS = {
  DOUBLE_BOTTOM: "Double Bottom", DOUBLE_TOP: "Double Top",
  HEAD_SHOULDERS: "Head & Shoulders", INVERSE_HS: "Inverse Head & Shoulders",
  BULL_FLAG: "Bull Flag", CUP_HANDLE: "Cup & Handle",
  ASC_TRIANGLE: "Ascending Triangle", DESC_TRIANGLE: "Descending Triangle",
};

/** Plain-English description of what each pattern is claiming. */
export const PATTERN_NOTES = {
  DOUBLE_BOTTOM: "Price tested the same floor twice and held. The pattern completes only when it closes above the intervening high — until then it is two lows and a hope.",
  DOUBLE_TOP: "Two failures at the same ceiling. Sellers defended the level twice; a close below the trough between them says buyers have given up on it.",
  HEAD_SHOULDERS: "Three pushes up, the middle one highest, then a lower high. A break of the neckline that joins the troughs is the classical distribution signal.",
  INVERSE_HS: "The bottoming mirror of a head and shoulders — three lows, the middle deepest, then a higher low. The neckline break completes it.",
  BULL_FLAG: "A sharp advance, then a shallow drift on shrinking volume. The pattern rests on the idea that the pause is profit-taking rather than a reversal.",
  CUP_HANDLE: "A long rounded base back to the old high, then a shallow pullback. The depth of the cup sets the measured target.",
  ASC_TRIANGLE: "A flat ceiling with higher lows pressing into it — buyers paying up while sellers hold one price. Resolution is usually upward, but not always.",
  DESC_TRIANGLE: "A flat floor with lower highs pressing down on it. The mirror of the ascending triangle, and it usually resolves downward.",
};

/**
 * Scan one symbol's daily bars and return the best-confirmed pattern, or null.
 *
 * Confirmation is scored the same way the platform's screener scores it:
 * volume expansion, position against the 50- and 200-day averages, and whether
 * those averages are aligned with the pattern's direction. A pattern in the
 * teeth of the trend is reported with a low grade rather than suppressed.
 */
export function scanPatterns(rawBars, { sma50 = [], sma200 = [] } = {}) {
  if (!rawBars || rawBars.length < 120) return null;
  const bars = toBars(rawBars);
  const window = bars.slice(-210);
  const offset = bars.length - window.length;
  const pv = pivots(window);

  const hits = [];
  for (const det of DETECTORS) {
    const hit = det(window, pv);
    if (!hit) continue;

    const riskDist = hit.bias === "BULLISH" ? hit.entry - hit.stop : hit.stop - hit.entry;
    if (!(riskDist > 0) || riskDist / hit.entry < 0.012) continue;      // degenerate geometry
    const rr = hit.bias === "BULLISH"
      ? (hit.target2 - hit.entry) / riskDist
      : (hit.entry - hit.target2) / riskDist;
    if (!(rr >= 0.8) || rr > 12) continue;                             // sanity band

    // ---- confirmation stack ----
    const i = bars.length - 1;
    const vols = bars.map((b) => b.volume);
    const vol20 = mean(vols.slice(-21, -1)) || vols[i] || 1;
    const volX = vols[i] / vol20;
    const ma50 = sma50[i] ?? null, ma200 = sma200[i] ?? null;
    const px = bars[i].close;
    const above50 = ma50 !== null ? px > ma50 : null;
    const above200 = ma200 !== null ? px > ma200 : null;
    const maAligned = ma50 !== null && ma200 !== null
      ? (hit.bias === "BULLISH" ? ma50 > ma200 : ma50 < ma200) : null;

    let score = 0;
    score += volX >= 1.5 ? 40 : volX >= 1.15 ? 20 : 0;
    score += (hit.bias === "BULLISH" ? above50 : above50 === false) ? 20 : 0;
    score += (hit.bias === "BULLISH" ? above200 : above200 === false) ? 20 : 0;
    score += maAligned ? 20 : 0;

    hits.push({
      ...hit,
      // realign anchor indices onto the FULL bar array so the chart can place them
      anchors: hit.anchors.map((a) => ({ ...a, i: a.i + offset })),
      riskReward: round2(rr),
      confirm: {
        volX: round2(volX), volConfirmed: volX >= 1.5,
        ma50: round2(ma50), ma200: round2(ma200),
        above50, above200, maAligned, score,
        grade: score >= 80 ? "STRONG" : score >= 50 ? "GOOD" : "WEAK",
      },
    });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.confirm.score - a.confirm.score || b.riskReward - a.riskReward);
  return hits[0];
}
