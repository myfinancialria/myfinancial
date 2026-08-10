// ---------------------------------------------------------------------------
// fundmetrics.mjs — risk and return statistics from a scheme's own NAV history.
//
// Everything a fund screener should filter on can be derived from the published
// NAV series, and deriving it ourselves means the numbers on the site are
// reproducible rather than copied from someone else's factsheet:
//
//   • trailing returns   absolute under a year, CAGR beyond it
//   • rolling returns    what an investor actually got, averaged over every
//                        start date — the honest answer to "what does this
//                        fund return", where a single trailing figure is an
//                        accident of today's start date
//   • risk               annualised volatility, max drawdown, recovery
//   • risk-adjusted      Sharpe and Sortino against the Indian risk-free rate
//   • consistency        share of rolling windows that beat cash / stayed positive
//
// A metric returns null when the history is too short to support it. Nothing is
// extrapolated: a 2-year-old fund shows no 5-year number rather than a guess.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

/** India's ~10-year sovereign yield; the hurdle Sharpe/Sortino are measured against. */
export const RISK_FREE_PCT = 6.5;

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const r2 = (x, d = 2) => (isNum(x) ? Number(x.toFixed(d)) : null);

/** mfapi history (newest-first, "DD-MM-YYYY") → ascending [{t, nav}]. */
export function parseHistory(rows) {
  const out = [];
  for (const h of rows || []) {
    const m = String(h.date || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
    const nav = parseFloat(h.nav);
    if (!m || !Number.isFinite(nav) || nav <= 0) continue;
    out.push({ t: Date.UTC(+m[3], +m[2] - 1, +m[1]), nav });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * NAV on or nearest to `target`, but only within `tolDays`.
 * Binary search — this runs ~20 times per fund across ~2,400 funds.
 */
function navAt(hist, target, tolDays) {
  if (!hist.length) return null;
  let lo = 0, hi = hist.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hist[mid].t < target) lo = mid + 1; else hi = mid;
  }
  let best = hist[lo];
  if (lo > 0 && Math.abs(hist[lo - 1].t - target) < Math.abs(best.t - target)) best = hist[lo - 1];
  return Math.abs(best.t - target) <= tolDays * DAY ? best : null;
}

/**
 * Return over `years`: absolute below one year, annualised (CAGR) at or above.
 * Tolerance widens with the horizon — a 10-year point may sit either side of a
 * long holiday, while a 1-month point must be tight to mean anything.
 */
export function returnOver(hist, years) {
  if (hist.length < 2) return null;
  const latest = hist[hist.length - 1];
  const target = latest.t - years * YEAR;
  if (target < hist[0].t - 5 * DAY) return null;                 // fund is younger than this
  const tol = years <= 0.25 ? 7 : years <= 1 ? 12 : 25;
  const past = navAt(hist, target, tol);
  if (!past || past.nav <= 0) return null;
  const growth = latest.nav / past.nav;
  return years < 1 ? r2((growth - 1) * 100) : r2((growth ** (1 / years) - 1) * 100);
}

/** Annualised volatility (%) of daily NAV moves over the trailing window. */
export function volatility(hist, years = 3) {
  const cutoff = hist[hist.length - 1].t - years * YEAR;
  const w = hist.filter((h) => h.t >= cutoff);
  if (w.length < 60) return null;
  const rets = [];
  for (let i = 1; i < w.length; i++) {
    // NAV history has weekend gaps; scale each step so the annualisation holds
    const gap = Math.max(1, Math.round((w[i].t - w[i - 1].t) / DAY));
    if (gap > 10) continue;                                     // a real reporting break
    rets.push(Math.log(w[i].nav / w[i - 1].nav) / Math.sqrt(gap));
  }
  if (rets.length < 50) return null;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1);
  return r2(Math.sqrt(v) * Math.sqrt(252) * 100);
}

/** Downside deviation (%) — only losses count, which is Sortino's whole point. */
export function downsideDeviation(hist, years = 3) {
  const cutoff = hist[hist.length - 1].t - years * YEAR;
  const w = hist.filter((h) => h.t >= cutoff);
  if (w.length < 60) return null;
  const rets = [];
  for (let i = 1; i < w.length; i++) {
    const gap = Math.max(1, Math.round((w[i].t - w[i - 1].t) / DAY));
    if (gap > 10) continue;
    rets.push(Math.log(w[i].nav / w[i - 1].nav) / Math.sqrt(gap));
  }
  const neg = rets.filter((r) => r < 0);
  if (neg.length < 25) return null;
  const v = neg.reduce((a, b) => a + b * b, 0) / neg.length;
  return r2(Math.sqrt(v) * Math.sqrt(252) * 100);
}

/** Worst peak-to-trough fall (%), when it bottomed, and whether it has recovered. */
export function drawdown(hist, years = null) {
  const cutoff = years ? hist[hist.length - 1].t - years * YEAR : -Infinity;
  const w = hist.filter((h) => h.t >= cutoff);
  if (w.length < 30) return { maxPct: null, date: null, recovered: null, currentPct: null };
  let peak = -Infinity, peakT = null, worst = 0, worstT = null, worstPeakT = null;
  for (const h of w) {
    if (h.nav > peak) { peak = h.nav; peakT = h.t; }
    const dd = ((h.nav - peak) / peak) * 100;
    if (dd < worst) { worst = dd; worstT = h.t; worstPeakT = peakT; }
  }
  const allTimeHigh = Math.max(...w.map((h) => h.nav));
  const cur = ((w[w.length - 1].nav - allTimeHigh) / allTimeHigh) * 100;
  // recovered if the NAV regained the pre-drawdown peak at any point after the trough
  const recovered = worstT === null ? null : w.some((h) => h.t > worstT && h.nav >= (w.find((x) => x.t === worstPeakT)?.nav ?? Infinity));
  return {
    maxPct: r2(worst), date: worstT ? new Date(worstT).toISOString().slice(0, 10) : null,
    recovered, currentPct: r2(cur),
  };
}

/**
 * Rolling `windowYears` returns sampled every `stepDays` across all available
 * history. This is the number that answers "what did investors actually get",
 * independent of which day you happen to look on.
 */
export function rollingReturns(hist, windowYears = 3, stepDays = 30) {
  if (hist.length < 100) return null;
  const first = hist[0].t, latest = hist[hist.length - 1].t;
  const span = windowYears * YEAR;
  if (latest - first < span + 90 * DAY) return null;             // not enough history
  const vals = [];
  for (let start = first; start + span <= latest; start += stepDays * DAY) {
    const a = navAt(hist, start, 20), b = navAt(hist, start + span, 20);
    if (!a || !b || a.nav <= 0) continue;
    vals.push(((b.nav / a.nav) ** (1 / windowYears) - 1) * 100);
  }
  if (vals.length < 12) return null;
  vals.sort((a, b) => a - b);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const pctAbove = (t) => r2((vals.filter((v) => v >= t).length / vals.length) * 100, 1);
  return {
    windows: vals.length,
    avg: r2(mean),
    min: r2(vals[0]),
    max: r2(vals[vals.length - 1]),
    median: r2(vals[Math.floor(vals.length / 2)]),
    // the three thresholds an Indian investor actually cares about:
    // never lost money · beat a fixed deposit · beat inflation + a margin
    pctPositive: pctAbove(0),
    pctAbove8: pctAbove(8),
    pctAbove12: pctAbove(12),
  };
}

/** Everything the screener needs about one scheme, from its NAV history alone. */
export function computeFundMetrics(hist) {
  if (!hist || hist.length < 20) return null;
  const latest = hist[hist.length - 1];
  const inception = hist[0];
  const ageYears = (latest.t - inception.t) / YEAR;

  const r3y = returnOver(hist, 3);
  const vol3 = volatility(hist, 3);
  const dd3 = downsideDeviation(hist, 3);

  const ddAll = drawdown(hist, null);
  const dd3y = drawdown(hist, 3);

  // Sharpe/Sortino need a 3-year return AND a 3-year risk figure to be honest
  const sharpe = isNum(r3y) && isNum(vol3) && vol3 > 0 ? r2((r3y - RISK_FREE_PCT) / vol3) : null;
  const sortino = isNum(r3y) && isNum(dd3) && dd3 > 0 ? r2((r3y - RISK_FREE_PCT) / dd3) : null;

  return {
    nav: r2(latest.nav, 4),
    navDate: new Date(latest.t).toISOString().slice(0, 10),
    inceptionDate: new Date(inception.t).toISOString().slice(0, 10),
    ageYears: r2(ageYears, 1),
    navPoints: hist.length,

    r1m: returnOver(hist, 1 / 12),
    r3m: returnOver(hist, 0.25),
    r6m: returnOver(hist, 0.5),
    r1y: returnOver(hist, 1),
    r2y: returnOver(hist, 2),
    r3y,
    r5y: returnOver(hist, 5),
    r7y: returnOver(hist, 7),
    r10y: returnOver(hist, 10),
    rSinceInception: ageYears >= 1 ? r2(((latest.nav / inception.nav) ** (1 / ageYears) - 1) * 100) : null,

    volatility: vol3,
    downsideDeviation: dd3,
    sharpe,
    sortino,
    maxDrawdownPct: ddAll.maxPct,
    maxDrawdownDate: ddAll.date,
    maxDrawdown3yPct: dd3y.maxPct,
    currentDrawdownPct: ddAll.currentPct,

    rolling3y: rollingReturns(hist, 3, 30),
    rolling5y: rollingReturns(hist, 5, 30),

    // growth of ₹10,000 since inception — the figure people actually picture
    growth10k: r2((latest.nav / inception.nav) * 10000, 0),
  };
}

/**
 * Month-end NAV series for charting — a full daily history is far more data
 * than a sparkline needs, and month-ends are what factsheets quote anyway.
 */
export function monthEndSeries(hist, maxPoints = 240) {
  const byMonth = new Map();
  for (const h of hist) {
    const d = new Date(h.t);
    byMonth.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, h);
  }
  const rows = [...byMonth.entries()].map(([m, h]) => [m, r2(h.nav, 4)]);
  return rows.slice(-maxPoints);
}

/**
 * Rank funds within each category on a metric, writing rank/size/percentile.
 * Percentile is "top X%" — lower is better — so it sorts the same way as rank.
 */
export function rankWithinCategory(funds, { by = "r3y", categoryKey = "category", higherIsBetter = true, prefix = "" } = {}) {
  const groups = new Map();
  for (const f of funds) {
    if (!isNum(f[by])) continue;
    const k = f[categoryKey] || "Other";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  for (const [, group] of groups) {
    group.sort((a, b) => (higherIsBetter ? b[by] - a[by] : a[by] - b[by]));
    const n = group.length;
    group.forEach((f, i) => {
      f[`${prefix}rank`] = i + 1;
      f[`${prefix}rankOf`] = n;
      f[`${prefix}percentile`] = n > 1 ? r2(((i + 1) / n) * 100, 1) : 50;
      // quartile 1 = best. Single-fund categories are quartile 1 by definition.
      f[`${prefix}quartile`] = n > 1 ? Math.min(4, Math.floor((i / n) * 4) + 1) : 1;
    });
  }
  return funds;
}
