// ---------------------------------------------------------------------------
// util.js — deterministic RNG, statistics, date & id helpers shared by engines
// ---------------------------------------------------------------------------

/** Fast 32-bit string hash (FNV-1a) → uint32 seed. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG. Returns fn → [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded RNG bundle with common distributions. */
export function rng(seedStr) {
  const rand = mulberry32(hash32(String(seedStr)));
  let spare = null;
  return {
    next: rand,
    /** uniform in [a,b) */
    uniform: (a, b) => a + rand() * (b - a),
    int: (a, b) => Math.floor(a + rand() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    /** standard normal via Box–Muller (with spare caching) */
    normal() {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0, v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      const mag = Math.sqrt(-2.0 * Math.log(u));
      spare = mag * Math.sin(2.0 * Math.PI * v);
      return mag * Math.cos(2.0 * Math.PI * v);
    },
  };
}

// ----------------------------- statistics ---------------------------------

export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : 0);

export function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}

/** Downside deviation vs a minimum acceptable return (per-period). */
export function downsideDev(a, mar = 0) {
  if (!a.length) return 0;
  const d = a.map((x) => Math.min(0, x - mar));
  return Math.sqrt(sum(d.map((x) => x * x)) / a.length);
}

export function covariance(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let c = 0;
  for (let i = 0; i < n; i++) c += (a[i] - ma) * (b[i] - mb);
  return c / (n - 1);
}

export function correlation(a, b) {
  const sa = stdev(a), sb = stdev(b);
  if (!sa || !sb) return 0;
  return covariance(a, b) / (sa * sb);
}

/** Simple linear regression slope of y on x. */
export function slope(y) {
  const n = y.length;
  if (n < 2) return 0;
  const xs = Array.from({ length: n }, (_, i) => i);
  const mx = mean(xs), my = mean(y);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (y[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? num / den : 0;
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function maxDrawdown(series) {
  let peak = -Infinity, mdd = 0;
  for (const v of series) {
    peak = Math.max(peak, v);
    if (peak > 0) mdd = Math.max(mdd, (peak - v) / peak);
  }
  return mdd;
}

/** Compounded annual growth rate between first and last of a series. */
export function cagr(first, last, years) {
  if (first <= 0 || years <= 0) return 0;
  return Math.pow(last / first, 1 / years) - 1;
}

/** Simple moving average of the trailing `n` values ending at index i. */
export function smaAt(arr, i, n) {
  if (i + 1 < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += arr[k];
  return s / n;
}

export function emaSeries(arr, n) {
  const k = 2 / (n + 1);
  const out = new Array(arr.length).fill(null);
  let prev = null;
  for (let i = 0; i < arr.length; i++) {
    prev = prev === null ? arr[i] : arr[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsiSeries(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= n) { gain += g; loss += l; if (i === n) { const rs = loss ? gain / loss : 100; out[i] = 100 - 100 / (1 + rs); gain /= n; loss /= n; } }
    else {
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
      const rs = loss ? gain / loss : 100;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

export function atrSeries(bars, n = 14) {
  const out = new Array(bars.length).fill(null);
  let atr = null;
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    atr = atr === null ? tr : (atr * (n - 1) + tr) / n;
    out[i] = atr;
  }
  return out;
}

// ------------------------------ dates -------------------------------------

export const DAY = 86400_000;
const IST_OFFSET_MIN = 330; // UTC+5:30

/** ms epoch → 'YYYY-MM-DD' in IST */
export function isoIST(ms) {
  return new Date(ms + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function isWeekend(ms) {
  const d = new Date(ms + IST_OFFSET_MIN * 60_000).getUTCDay();
  return d === 0 || d === 6;
}

/** Generate `n` trading days (ms epoch, 15:30 IST close), ending today/last weekday. */
export function tradingDays(n, endMs = Date.now()) {
  const out = [];
  let t = endMs;
  // normalise to that day's 15:30 IST close
  const d = new Date(t + IST_OFFSET_MIN * 60_000);
  d.setUTCHours(15, 30, 0, 0);
  t = d.getTime() - IST_OFFSET_MIN * 60_000;
  while (out.length < n) {
    if (!isWeekend(t)) out.push(t);
    t -= DAY;
  }
  return out.reverse();
}

export function yearsBetween(fromMs, toMs) {
  return (toMs - fromMs) / (365.25 * DAY);
}

// ------------------------------- misc -------------------------------------

let idCounter = 0;
export function uid(prefix = "id") {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const round2 = (x) => Math.round(x * 100) / 100;
export const round1 = (x) => Math.round(x * 10) / 10;

/** Format a number in the Indian numbering system (no symbol). */
export function inr(x, digits = 0) {
  return Number(x).toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
