// ---------------------------------------------------------------------------
// ta.mjs — technical indicators computed from real OHLCV.
//
// Every function takes plain number arrays and returns either a full series
// (same length as the input, `null` where the indicator has not warmed up) or a
// single latest value. Nothing here smooths over missing data: if there are not
// enough bars for an indicator, it returns null rather than a wrong number that
// would then be silently screened on.
//
// Bar shape used across the pipeline: [date, open, high, low, close, volume].
// ---------------------------------------------------------------------------

export const D = 0, O = 1, H = 2, L = 3, C = 4, V = 5;

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
export const round = (x, d = 2) => (isNum(x) ? Number(x.toFixed(d)) : null);

export function sma(vals, n) {
  const out = new Array(vals.length).fill(null);
  if (n <= 0) return out;
  let sum = 0, count = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!isNum(v)) { sum = 0; count = 0; continue; }        // a gap restarts the window
    sum += v; count++;
    if (count > n) { sum -= vals[i - n]; count = n; }
    if (count === n) out[i] = sum / n;
  }
  return out;
}

export function ema(vals, n) {
  const out = new Array(vals.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null, warm = 0, seed = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!isNum(v)) continue;
    if (prev === null) {
      seed += v; warm++;
      if (warm === n) { prev = seed / n; out[i] = prev; }    // seed on the first full SMA
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing — the averaging RSI/ATR/ADX are actually defined with. */
function wilder(vals, n) {
  const out = new Array(vals.length).fill(null);
  let prev = null, sum = 0, count = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!isNum(v)) continue;
    if (prev === null) {
      sum += v; count++;
      if (count === n) { prev = sum / n; out[i] = prev; }
      continue;
    }
    prev = (prev * (n - 1) + v) / n;
    out[i] = prev;
  }
  return out;
}

export function rsi(closes, n = 14) {
  const gains = new Array(closes.length).fill(null);
  const losses = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains[i] = Math.max(0, d);
    losses[i] = Math.max(0, -d);
  }
  const ag = wilder(gains.slice(1), n), al = wilder(losses.slice(1), n);
  const out = new Array(closes.length).fill(null);
  for (let i = 0; i < ag.length; i++) {
    if (ag[i] === null || al[i] === null) continue;
    // a run with no down-closes is genuinely RSI 100, not a divide-by-zero
    out[i + 1] = al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]);
  }
  return out;
}

export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const line = closes.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null));
  // the signal EMA must run over the MACD line only from where it exists
  const firstIdx = line.findIndex((x) => x !== null);
  const sig = new Array(closes.length).fill(null);
  if (firstIdx >= 0) {
    const seeded = ema(line.slice(firstIdx), signal);
    for (let i = 0; i < seeded.length; i++) sig[firstIdx + i] = seeded[i];
  }
  const hist = line.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i] : null));
  return { line, signal: sig, hist };
}

export function trueRange(bars) {
  const out = new Array(bars.length).fill(null);
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i][H], l = bars[i][L], pc = bars[i - 1][C];
    if (!isNum(h) || !isNum(l) || !isNum(pc)) continue;
    out[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return out;
}

export function atr(bars, n = 14) {
  const tr = trueRange(bars);
  const s = wilder(tr.slice(1), n);
  const out = new Array(bars.length).fill(null);
  for (let i = 0; i < s.length; i++) out[i + 1] = s[i];
  return out;
}

/** ADX with +DI / -DI — trend strength, not direction. */
export function adx(bars, n = 14) {
  const len = bars.length;
  const plusDM = new Array(len).fill(null), minusDM = new Array(len).fill(null);
  for (let i = 1; i < len; i++) {
    const up = bars[i][H] - bars[i - 1][H];
    const dn = bars[i - 1][L] - bars[i][L];
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
  }
  const tr = trueRange(bars);
  const atrS = wilder(tr.slice(1), n), pS = wilder(plusDM.slice(1), n), mS = wilder(minusDM.slice(1), n);
  const pDI = new Array(len).fill(null), mDI = new Array(len).fill(null), dx = [];
  for (let i = 0; i < atrS.length; i++) {
    if (atrS[i] === null || !atrS[i]) continue;
    const p = (pS[i] / atrS[i]) * 100, m = (mS[i] / atrS[i]) * 100;
    pDI[i + 1] = p; mDI[i + 1] = m;
    const sum = p + m;
    dx.push(sum ? (Math.abs(p - m) / sum) * 100 : 0);
  }
  const adxS = wilder(dx, n);
  const out = new Array(len).fill(null);
  // dx[] starts at the first bar where +DI/-DI exist; realign to the bar index
  const firstDI = pDI.findIndex((x) => x !== null);
  if (firstDI >= 0) for (let i = 0; i < adxS.length; i++) out[firstDI + i] = adxS[i];
  return { adx: out, plusDI: pDI, minusDI: mDI };
}

export function bollinger(closes, n = 20, k = 2) {
  const mid = sma(closes, n);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i++) {
    if (mid[i] === null) continue;
    let sq = 0;
    for (let j = i - n + 1; j <= i; j++) sq += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sq / n);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
  }
  return { mid, upper, lower };
}

export function stochastic(bars, n = 14, d = 3) {
  const len = bars.length;
  const kArr = new Array(len).fill(null);
  for (let i = n - 1; i < len; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, bars[j][H]); ll = Math.min(ll, bars[j][L]); }
    kArr[i] = hh === ll ? 50 : ((bars[i][C] - ll) / (hh - ll)) * 100;
  }
  const first = kArr.findIndex((x) => x !== null);
  const dArr = new Array(len).fill(null);
  if (first >= 0) {
    const s = sma(kArr.slice(first), d);
    for (let i = 0; i < s.length; i++) dArr[first + i] = s[i];
  }
  return { k: kArr, d: dArr };
}

export function cci(bars, n = 20) {
  const tp = bars.map((b) => (b[H] + b[L] + b[C]) / 3);
  const m = sma(tp, n);
  const out = new Array(bars.length).fill(null);
  for (let i = n - 1; i < bars.length; i++) {
    if (m[i] === null) continue;
    let dev = 0;
    for (let j = i - n + 1; j <= i; j++) dev += Math.abs(tp[j] - m[i]);
    const md = dev / n;
    out[i] = md ? (tp[i] - m[i]) / (0.015 * md) : 0;
  }
  return out;
}

export function mfi(bars, n = 14) {
  const len = bars.length;
  const tp = bars.map((b) => (b[H] + b[L] + b[C]) / 3);
  const out = new Array(len).fill(null);
  for (let i = n; i < len; i++) {
    let pos = 0, neg = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const flow = tp[j] * (bars[j][V] || 0);
      if (tp[j] > tp[j - 1]) pos += flow; else if (tp[j] < tp[j - 1]) neg += flow;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function obv(bars) {
  const out = new Array(bars.length).fill(null);
  let acc = 0;
  for (let i = 1; i < bars.length; i++) {
    const v = bars[i][V] || 0;
    if (bars[i][C] > bars[i - 1][C]) acc += v;
    else if (bars[i][C] < bars[i - 1][C]) acc -= v;
    out[i] = acc;
  }
  return out;
}

/** Supertrend(period, multiplier) — the flip-state trend filter. */
export function supertrend(bars, n = 10, mult = 3) {
  const a = atr(bars, n);
  const len = bars.length;
  const line = new Array(len).fill(null);
  const dir = new Array(len).fill(null);          // 1 = uptrend, -1 = downtrend
  let finalUp = null, finalDn = null, prevDir = 1;
  for (let i = 0; i < len; i++) {
    if (a[i] === null) continue;
    const mid = (bars[i][H] + bars[i][L]) / 2;
    const bUp = mid - mult * a[i];
    const bDn = mid + mult * a[i];
    // bands ratchet: they only loosen when price closes through them
    finalUp = finalUp === null || bars[i - 1]?.[C] <= finalUp ? bUp : Math.max(bUp, finalUp);
    finalDn = finalDn === null || bars[i - 1]?.[C] >= finalDn ? bDn : Math.min(bDn, finalDn);
    let d = prevDir;
    if (bars[i][C] > finalDn) d = 1;
    else if (bars[i][C] < finalUp) d = -1;
    dir[i] = d;
    line[i] = d === 1 ? finalUp : finalDn;
    prevDir = d;
  }
  return { line, dir };
}

// ------------------------------ return maths ---------------------------------
export function pctChange(from, to) {
  return isNum(from) && isNum(to) && from !== 0 ? ((to - from) / Math.abs(from)) * 100 : null;
}

/** Simple % return over `n` bars back from the end. */
export function retOver(closes, n) {
  const i = closes.length - 1;
  return i - n >= 0 ? pctChange(closes[i - n], closes[i]) : null;
}

/** Annualised volatility from daily log returns, in %. */
export function volatility(closes, lookback = 252) {
  const w = closes.slice(-lookback - 1);
  if (w.length < 30) return null;
  const rets = [];
  for (let i = 1; i < w.length; i++) if (w[i - 1] > 0 && w[i] > 0) rets.push(Math.log(w[i] / w[i - 1]));
  if (rets.length < 25) return null;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}

/** Worst peak-to-trough fall over the window, in % (a negative number). */
export function maxDrawdown(closes) {
  let peak = -Infinity, worst = 0;
  for (const c of closes) {
    if (!isNum(c)) continue;
    if (c > peak) peak = c;
    if (peak > 0) worst = Math.min(worst, ((c - peak) / peak) * 100);
  }
  return worst;
}

/** Beta and correlation of `closes` against a benchmark's aligned closes. */
export function betaAgainst(closes, benchCloses, lookback = 252) {
  const n = Math.min(closes.length, benchCloses.length, lookback + 1);
  if (n < 60) return { beta: null, corr: null };
  const a = closes.slice(-n), b = benchCloses.slice(-n);
  const ra = [], rb = [];
  for (let i = 1; i < n; i++) {
    if (a[i - 1] > 0 && b[i - 1] > 0) { ra.push(a[i] / a[i - 1] - 1); rb.push(b[i] / b[i - 1] - 1); }
  }
  if (ra.length < 50) return { beta: null, corr: null };
  const ma = ra.reduce((x, y) => x + y, 0) / ra.length;
  const mb = rb.reduce((x, y) => x + y, 0) / rb.length;
  let cov = 0, varB = 0, varA = 0;
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    varB += (rb[i] - mb) ** 2;
    varA += (ra[i] - ma) ** 2;
  }
  const beta = varB ? cov / varB : null;
  const corr = varA && varB ? cov / Math.sqrt(varA * varB) : null;
  return { beta, corr };
}

/**
 * Weinstein stage from weekly closes against the 30-week MA.
 * 1 basing · 2 advancing · 3 topping · 4 declining.
 */
export function weinsteinStage(weeklyCloses) {
  if (weeklyCloses.length < 36) return { stage: null, ma30: null, slopePct: null };
  const ma = sma(weeklyCloses, 30);
  const i = weeklyCloses.length - 1;
  const cur = ma[i], back = ma[i - 6] ?? null;
  if (cur === null || back === null) return { stage: null, ma30: null, slopePct: null };
  const slopePct = ((cur - back) / back) * 100;
  const FLAT = 0.7;
  const px = weeklyCloses[i];
  const ret26 = i >= 26 ? (px / weeklyCloses[i - 26] - 1) * 100 : 0;
  let stage;
  if (px > cur && slopePct > FLAT) stage = 2;
  else if (px < cur && slopePct < -FLAT) stage = 4;
  else if (ret26 < 0) stage = 1;
  else stage = 3;
  return { stage, ma30: cur, slopePct, pctFromMa: ((px - cur) / cur) * 100 };
}

/** Daily bars → weekly bars (ISO week buckets), preserving OHLCV semantics. */
export function toWeekly(bars) {
  const out = [];
  let cur = null, curKey = null;
  for (const b of bars) {
    const dt = new Date(b[D] + "T00:00:00Z");
    // Thursday-anchored ISO week number keeps 52/53-week years consistent
    const th = new Date(dt);
    th.setUTCDate(th.getUTCDate() + 3 - ((th.getUTCDay() + 6) % 7));
    const key = `${th.getUTCFullYear()}-${th.getUTCMonth()}-${Math.floor(th.getUTCDate() / 7)}`;
    if (key !== curKey) {
      if (cur) out.push(cur);
      cur = [b[D], b[O], b[H], b[L], b[C], b[V] || 0];
      curKey = key;
    } else {
      cur[H] = Math.max(cur[H], b[H]);
      cur[L] = Math.min(cur[L], b[L]);
      cur[C] = b[C];
      cur[V] += b[V] || 0;
      cur[D] = b[D];
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Classic floor-trader pivots from the last completed bar. */
export function pivots(bar) {
  if (!bar) return null;
  const h = bar[H], l = bar[L], c = bar[C];
  if (!isNum(h) || !isNum(l) || !isNum(c)) return null;
  const p = (h + l + c) / 3;
  return {
    p, r1: 2 * p - l, r2: p + (h - l), r3: h + 2 * (p - l),
    s1: 2 * p - h, s2: p - (h - l), s3: l - 2 * (h - p),
  };
}

/**
 * A single-session move beyond `pct` is a split/bonus/demerger the price feed
 * has not adjusted for, not a market move. Returns the last such date or null,
 * so return figures spanning it can be flagged rather than quietly shown.
 */
export function unadjustedGap(bars, pct = 35) {
  let found = null;
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1][C], b = bars[i][C];
    if (!isNum(a) || !isNum(b) || a <= 0) continue;
    if (Math.abs((b - a) / a) * 100 > pct) found = bars[i][D];
  }
  return found;
}

export const last = (arr) => {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null && arr[i] !== undefined) return arr[i];
  return null;
};
