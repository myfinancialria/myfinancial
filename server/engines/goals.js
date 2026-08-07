// ---------------------------------------------------------------------------
// goals.js — Multi-goal feasibility via Monte Carlo simulation.
//
// Correlated GBM across equity/debt/gold (Cholesky), monthly SIP contributions
// with optional annual step-up, inflation-adjusted targets. Outputs a Goal
// Feasibility Index (%), percentile fan bands, the SIP required for the target
// confidence, and a recommended glide-path allocation with rebalancing prompts.
// ---------------------------------------------------------------------------
import { rng, percentile, round2, clamp } from "../lib/util.js";

// long-run INR asset-class assumptions (annual)
export const ASSETS = {
  equity: { mu: 0.115, sigma: 0.17 },
  debt:   { mu: 0.068, sigma: 0.04 },
  gold:   { mu: 0.085, sigma: 0.15 },
};
// correlation matrix [eq, debt, gold]
const CORR = [
  [1.0, -0.10, -0.20],
  [-0.10, 1.0, 0.10],
  [-0.20, 0.10, 1.0],
];

/** Cholesky decomposition of a 3×3 correlation matrix. */
function cholesky(m) {
  const L = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j <= i; j++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(1e-12, s)) : s / L[j][j];
    }
  return L;
}
const CHOL = cholesky(CORR);

/**
 * Simulate one goal.
 * @param {object} g { targetAmount (today ₹), targetYear, inflation, currentCorpus,
 *                     monthlySip, stepUpPct, alloc {equity,debt,gold}, seed }
 */
export function simulateGoal(g, { paths = 2000, wantBands = true } = {}) {
  const now = new Date();
  const years = clamp((g.targetYear ?? now.getFullYear() + 10) - now.getFullYear() - (now.getMonth() > 5 ? 0 : 0), 0.5, 60);
  const months = Math.round(years * 12);
  const inflation = g.inflation ?? 0.06;
  const target = (g.targetAmount || 0) * Math.pow(1 + inflation, years);   // inflated target
  const w = normAlloc(g.alloc);
  const stepUp = (g.stepUpPct ?? 0) / 100;

  // monthly params per asset
  const mus = [ASSETS.equity.mu, ASSETS.debt.mu, ASSETS.gold.mu].map((m) => m / 12);
  const sig = [ASSETS.equity.sigma, ASSETS.debt.sigma, ASSETS.gold.sigma].map((s) => s / Math.sqrt(12));
  const weights = [w.equity, w.debt, w.gold];

  const r = rng(`mc:${g.seed || g.name || "goal"}:${months}:${Math.round(g.monthlySip || 0)}:${Math.round(g.currentCorpus || 0)}`);
  const terminals = new Array(paths);
  const sampleEvery = Math.max(1, Math.floor(months / 60));
  const bandTimes = [];
  const bandSamples = wantBands ? [] : null;

  for (let p = 0; p < paths; p++) {
    let corpus = g.currentCorpus || 0;
    let sip = g.monthlySip || 0;
    const keep = wantBands && p < 600;                     // cap band memory
    const row = keep ? [] : null;
    for (let m = 1; m <= months; m++) {
      // correlated monthly returns
      const z = [r.normal(), r.normal(), r.normal()];
      const cz = [
        CHOL[0][0] * z[0],
        CHOL[1][0] * z[0] + CHOL[1][1] * z[1],
        CHOL[2][0] * z[0] + CHOL[2][1] * z[1] + CHOL[2][2] * z[2],
      ];
      let ret = 0;
      for (let a = 0; a < 3; a++) ret += weights[a] * (mus[a] - 0.5 * sig[a] * sig[a] / 12 + sig[a] * cz[a]);
      corpus = Math.max(0, corpus * (1 + ret)) + sip;
      if (m % 12 === 0) sip *= 1 + stepUp;
      if (keep && m % sampleEvery === 0) row.push(corpus);
    }
    terminals[p] = corpus;
    if (keep) bandSamples.push(row);
  }

  terminals.sort((a, b) => a - b);
  const feasibility = Math.round((terminals.filter((t) => t >= target).length / paths) * 100);
  const verdict = feasibility >= 75 ? "ACHIEVABLE" : feasibility >= 45 ? "AT_RISK" : "UNREALISTIC";

  let bands = null;
  if (wantBands && bandSamples.length) {
    const steps = bandSamples[0].length;
    bands = { times: [], p10: [], p25: [], p50: [], p75: [], p90: [] };
    for (let sIdx = 0; sIdx < steps; sIdx++) {
      const col = bandSamples.map((row) => row[sIdx]).sort((a, b) => a - b);
      const yearFrac = ((sIdx + 1) * sampleEvery) / 12;
      bands.times.push(round2(yearFrac));
      bands.p10.push(Math.round(percentile(col, 0.10)));
      bands.p25.push(Math.round(percentile(col, 0.25)));
      bands.p50.push(Math.round(percentile(col, 0.50)));
      bands.p75.push(Math.round(percentile(col, 0.75)));
      bands.p90.push(Math.round(percentile(col, 0.90)));
    }
  }

  return {
    years: round2(years), months, target: Math.round(target), targetToday: Math.round(g.targetAmount || 0),
    inflation, alloc: w, feasibility, verdict,
    median: Math.round(percentile(terminals, 0.5)),
    p10: Math.round(percentile(terminals, 0.10)), p90: Math.round(percentile(terminals, 0.90)),
    shortfallAtMedian: Math.round(Math.max(0, target - percentile(terminals, 0.5))),
    bands,
  };
}

/** SIP needed to reach `confidence` feasibility (bisection, coarse paths). */
export function requiredSip(g, confidence = 75) {
  let lo = 0, hi = Math.max(10000, (g.monthlySip || 10000) * 12);
  const feas = (sip) => simulateGoal({ ...g, monthlySip: sip }, { paths: 500, wantBands: false }).feasibility;
  if (feas(hi) < confidence) hi *= 4;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (feas(mid) >= confidence) hi = mid; else lo = mid;
  }
  return Math.round(hi / 500) * 500;
}

/** Age/horizon-based recommended allocation (glide path). */
export function recommendedAlloc(yearsToGoal, riskBand = "BALANCED") {
  const eqBase = clamp(0.30 + yearsToGoal * 0.045, 0.20, 0.80);
  const tilt = { CONSERVATIVE: -0.15, MODERATELY_CONSERVATIVE: -0.08, BALANCED: 0, GROWTH: 0.07, AGGRESSIVE: 0.13 }[riskBand] ?? 0;
  const equity = clamp(eqBase + tilt, 0.10, 0.85);
  const gold = yearsToGoal > 3 ? 0.10 : 0.05;
  const debt = round2(1 - equity - gold);
  return { equity: round2(equity), debt, gold };
}

/** Drift check → rebalancing prompt when any sleeve strays > threshold. */
export function rebalancePrompt(current, targetAlloc, thresholdPct = 5) {
  const drift = {};
  let needs = false;
  for (const k of ["equity", "debt", "gold"]) {
    const d = round2(((current[k] || 0) - (targetAlloc[k] || 0)) * 100);
    drift[k] = d;
    if (Math.abs(d) > thresholdPct) needs = true;
  }
  return { needs, drift, thresholdPct, action: needs ? "Rebalance: trim over-weight sleeves into under-weight ones (use fresh SIPs to avoid capital-gains where possible)." : "Allocation within tolerance — no action needed." };
}

function normAlloc(a = {}) {
  const eq = Math.max(0, a.equity ?? 0.6), db = Math.max(0, a.debt ?? 0.3), gd = Math.max(0, a.gold ?? 0.1);
  const s = eq + db + gd || 1;
  return { equity: round2(eq / s), debt: round2(db / s), gold: round2(gd / s) };
}
