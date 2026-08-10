// ---------------------------------------------------------------------------
// Regression tests for the indicator library the screener is built on.
//
// Expected RSI values below are NOT the textbook table (which prints rounded
// intermediates and so drifts ~0.07); they are what a literal implementation of
// Wilder's smoothing produces, verified here against an independent reference
// implemented inline. Bollinger is checked against population SD, which is the
// convention Bollinger bands are defined with.
// ---------------------------------------------------------------------------
import test from "node:test";
import assert from "node:assert/strict";
import * as ta from "../../scripts/lib/ta.mjs";

// Wilder's published worked example
const WILDER = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89,
  46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25,
  45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
];

/** Deliberately naive Wilder RSI, sharing no code with the implementation. */
function rsiReference(cl, n) {
  const d = [];
  for (let i = 1; i < cl.length; i++) d.push(cl[i] - cl[i - 1]);
  const out = new Array(cl.length).fill(null);
  let ag = 0, al = 0;
  for (let i = 0; i < n; i++) { ag += Math.max(0, d[i]); al += Math.max(0, -d[i]); }
  ag /= n; al /= n;
  out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = n; i < d.length; i++) {
    ag = (ag * (n - 1) + Math.max(0, d[i])) / n;
    al = (al * (n - 1) + Math.max(0, -d[i])) / n;
    out[i + 1] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

test("RSI matches an independent Wilder implementation exactly", () => {
  const mine = ta.rsi(WILDER, 14);
  const ref = rsiReference(WILDER, 14);
  for (let i = 0; i < WILDER.length; i++) {
    if (ref[i] === null) { assert.equal(mine[i], null, `index ${i} should be warming up`); continue; }
    assert.ok(Math.abs(mine[i] - ref[i]) < 1e-9, `RSI[${i}] ${mine[i]} vs ${ref[i]}`);
  }
  assert.ok(Math.abs(mine[14] - 70.464135) < 1e-5);
});

test("RSI warms up at index n, not before", () => {
  const r = ta.rsi(WILDER, 14);
  assert.equal(r.slice(0, 14).every((x) => x === null), true);
  assert.notEqual(r[14], null);
});

test("RSI is 100 when a window has no down-closes (no divide-by-zero)", () => {
  const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
  assert.equal(ta.last(ta.rsi(rising, 14)), 100);
});

test("SMA and EMA warm up correctly and EMA seeds on the SMA", () => {
  const s = ta.sma([1, 2, 3, 4, 5, 6], 3);
  assert.deepEqual(s.slice(0, 2), [null, null]);
  assert.equal(s[2], 2);
  assert.equal(s[5], 5);
  const e = ta.ema([1, 2, 3, 4, 5, 6, 7, 8], 3);
  assert.equal(e[2], 2);            // seed = SMA(3) of 1,2,3
  assert.equal(e[3], 3);
});

test("Bollinger bands equal mean ± k × population SD", () => {
  const bb = ta.bollinger(WILDER, 20, 2);
  for (let i = 19; i < WILDER.length; i++) {
    const w = WILDER.slice(i - 19, i + 1);
    const m = w.reduce((a, b) => a + b, 0) / 20;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
    assert.ok(Math.abs(bb.mid[i] - m) < 1e-12);
    assert.ok(Math.abs(bb.upper[i] - (m + 2 * sd)) < 1e-12);
    assert.ok(Math.abs(bb.lower[i] - (m - 2 * sd)) < 1e-12);
  }
});

test("MACD histogram equals line minus signal, with correct warm-up offsets", () => {
  const closes = Array.from({ length: 120 }, (_, i) => 100 + 10 * Math.sin(i / 9) + i * 0.35);
  const m = ta.macd(closes);
  assert.equal(m.line.findIndex((x) => x !== null), 25);      // slow EMA(26) seeds at 25
  assert.equal(m.signal.findIndex((x) => x !== null), 33);    // + signal EMA(9)
  for (let i = 33; i < closes.length; i++) {
    assert.ok(Math.abs(m.hist[i] - (m.line[i] - m.signal[i])) < 1e-12);
  }
});

test("bounded oscillators stay inside their definitional ranges", () => {
  const closes = Array.from({ length: 200 }, (_, i) => 100 + 12 * Math.sin(i / 7) + i * 0.2);
  const bars = closes.map((c, i) => [`d${i}`, c - 0.5, c + 1.2, c - 1.4, c, 1000 + i * 7]);
  for (const [name, series] of [
    ["stoch %K", ta.stochastic(bars).k],
    ["MFI", ta.mfi(bars)],
    ["ADX", ta.adx(bars, 14).adx],
    ["+DI", ta.adx(bars, 14).plusDI],
  ]) {
    for (const v of series) {
      if (v === null) continue;
      assert.ok(v >= 0 && v <= 100, `${name} out of range: ${v}`);
    }
  }
});

test("ATR is strictly positive once warmed up", () => {
  const bars = Array.from({ length: 60 }, (_, i) => [`d${i}`, 100 + i, 102 + i, 99 + i, 101 + i, 500]);
  const a = ta.atr(bars, 14);
  assert.equal(a.slice(0, 14).every((x) => x === null), true);
  assert.ok(ta.last(a) > 0);
});

test("Supertrend reports a direction of exactly +1 or -1", () => {
  const closes = Array.from({ length: 150 }, (_, i) => 100 + i * 0.4);
  const bars = closes.map((c, i) => [`d${i}`, c - 0.5, c + 1, c - 1, c, 900]);
  const st = ta.supertrend(bars);
  assert.ok([1, -1].includes(ta.last(st.dir)));
  assert.equal(ta.last(st.dir), 1, "a monotonically rising series must be an uptrend");
});

test("maxDrawdown finds the worst peak-to-trough fall", () => {
  assert.equal(Math.round(ta.maxDrawdown([100, 120, 90, 150, 75])), -50);
  assert.equal(ta.maxDrawdown([100, 101, 102]), 0);
});

test("beta and correlation against itself are exactly 1", () => {
  const closes = Array.from({ length: 300 }, (_, i) => 100 + 10 * Math.sin(i / 11) + i * 0.3);
  const { beta, corr } = ta.betaAgainst(closes, closes);
  assert.ok(Math.abs(beta - 1) < 1e-9);
  assert.ok(Math.abs(corr - 1) < 1e-9);
});

test("weekly rollup conserves volume and preserves OHLC ordering", () => {
  const bars = Array.from({ length: 120 }, (_, i) => {
    const dt = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    const c = 100 + i * 0.3;
    return [dt, c - 0.5, c + 1.2, c - 1.4, c, 1000 + i];
  });
  const wk = ta.toWeekly(bars);
  assert.ok(wk.length > 0 && wk.length < bars.length);
  for (const w of wk) assert.ok(w[ta.H] >= w[ta.C] && w[ta.L] <= w[ta.C]);
  const totD = bars.reduce((s, b) => s + b[ta.V], 0);
  const totW = wk.reduce((s, b) => s + b[ta.V], 0);
  assert.equal(totD, totW);
});

test("unadjusted corporate-action gaps are detected, ordinary moves are not", () => {
  const mk = (closes) => closes.map((c, i) => [`2025-01-${String(i + 1).padStart(2, "0")}`, c, c, c, c, 0]);
  assert.equal(ta.unadjustedGap(mk([100, 98, 49])), "2025-01-03");   // 1:2 split
  assert.equal(ta.unadjustedGap(mk([100, 98, 90])), null);           // just a bad day
});

test("indicators return null rather than a wrong number when data is short", () => {
  const few = [100, 101, 102];
  assert.equal(ta.last(ta.rsi(few, 14)), null);
  assert.equal(ta.volatility(few), null);
  assert.equal(ta.weinsteinStage(few).stage, null);
  assert.equal(ta.betaAgainst(few, few).beta, null);
});
