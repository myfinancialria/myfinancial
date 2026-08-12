// ---------------------------------------------------------------------------
// util.mjs — the handful of pure helpers the shared engines need.
//
// Deliberately self-contained: these modules run in BOTH the Node server and
// the browser, so they must not reach into anything server-only.
// ---------------------------------------------------------------------------
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const round2 = (x) => Math.round(x * 100) / 100;

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded PRNG so a given goal always simulates to the same answer. */
export function rng(seedStr) {
  const rand = mulberry32(hash32(String(seedStr)));
  let spare = null;
  return {
    next: rand,
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
