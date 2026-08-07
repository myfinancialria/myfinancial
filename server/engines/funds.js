// ---------------------------------------------------------------------------
// funds.js — Direct Mutual Fund platform: NAV synthesis, factor metrics,
// multi-factor ranking, screener, SIP backtester and robo-advisory mapping.
//
// NAVs are generated against the synthetic benchmark series (beta + skill
// alpha − expense drag + idiosyncratic tracking noise), so Sharpe/Sortino/
// Alpha/Beta/TE are real computations, not labels.
// ---------------------------------------------------------------------------
import { FUNDS, FUND_MAP, MF_CATEGORIES } from "../data/universe.js";
import { daily } from "./market.js";
import { rng, mean, stdev, downsideDev, covariance, percentile, maxDrawdown, round2, clamp, DAY } from "../lib/util.js";

const RF = 0.066;             // risk-free (ann.)
const TRADING_DAYS = 252;

const navCache = new Map();   // code → [{time, nav}]
const metricCache = new Map();

/** Daily NAV series for a fund (10y). */
export function navSeries(code) {
  if (navCache.has(code)) return navCache.get(code);
  const f = FUND_MAP[code];
  if (!f) return null;
  const cat = MF_CATEGORIES[f.category];
  const r = rng(`nav:${code}`);
  const beta = 0.85 + r.next() * 0.3;
  const alphaAnn = f.skill * 0.045 - f.er / 100;             // skill alpha net of expenses
  const teAnn = f.category === "INDEX" ? 0.004 : f.category === "LIQUID" ? 0.002 : 0.015 + r.next() * 0.02;
  const teDaily = teAnn / Math.sqrt(TRADING_DAYS);

  let benchBars = cat.bench ? daily(cat.bench, 99999) : null;
  const n = benchBars ? benchBars.length : daily("NIFTY", 99999).length;
  const times = (benchBars || daily("NIFTY", 99999)).map((b) => b.time);
  const out = new Array(n);
  let nav = f.nav0;
  for (let i = 0; i < n; i++) {
    let ret;
    if (benchBars) {
      const bRet = i ? benchBars[i].close / benchBars[i - 1].close - 1 : 0;
      ret = beta * bRet + alphaAnn / TRADING_DAYS + teDaily * r.normal();
    } else {
      ret = cat.drift / TRADING_DAYS + (cat.vol / Math.sqrt(TRADING_DAYS)) * r.normal();
    }
    nav = Math.max(0.5, nav * (1 + ret));
    out[i] = { time: times[i], nav: Math.round(nav * 10000) / 10000 };
  }
  navCache.set(code, out);
  return out;
}

const annRet = (navs, days) => {
  if (navs.length < days + 1) return null;
  const a = navs[navs.length - 1 - days].nav, b = navs[navs.length - 1].nav;
  return Math.pow(b / a, TRADING_DAYS / days) - 1;
};

function dailyReturns(series, days) {
  const s = series.slice(-days - 1);
  const out = [];
  for (let i = 1; i < s.length; i++) out.push(s[i].nav / s[i - 1].nav - 1);
  return out;
}

/** Full factor metrics for one fund. */
export function metrics(code) {
  if (metricCache.has(code)) return metricCache.get(code);
  const f = FUND_MAP[code];
  const navs = navSeries(code);
  if (!f || !navs) return null;
  const cat = MF_CATEGORIES[f.category];
  const win = Math.min(3 * TRADING_DAYS, navs.length - 1);
  const rets = dailyReturns(navs, win);
  const annVol = stdev(rets) * Math.sqrt(TRADING_DAYS);
  const annualized = Math.pow(navs[navs.length - 1].nav / navs[navs.length - 1 - win].nav, TRADING_DAYS / win) - 1;
  const sharpe = annVol ? (annualized - RF) / annVol : 0;
  const dd = downsideDev(rets, RF / TRADING_DAYS) * Math.sqrt(TRADING_DAYS);
  const sortino = dd ? (annualized - RF) / dd : 0;

  let alpha = null, beta = null, trackingError = null;
  if (cat.bench) {
    // alpha/beta/TE over a longer 5Y window — less sample noise than 3Y
    const winL = Math.min(5 * TRADING_DAYS, navs.length - 1);
    const fRetsL = dailyReturns(navs, winL);
    const bBars = daily(cat.bench, 99999);
    const bRets = [];
    const bs = bBars.slice(-winL - 1);
    for (let i = 1; i < bs.length; i++) bRets.push(bs[i].close / bs[i - 1].close - 1);
    const m = Math.min(fRetsL.length, bRets.length);
    const fr = fRetsL.slice(-m), br = bRets.slice(-m);
    const varB = stdev(br) ** 2;
    beta = varB ? covariance(fr, br) / varB : 1;
    const fundAnnL = Math.pow(navs[navs.length - 1].nav / navs[navs.length - 1 - winL].nav, TRADING_DAYS / winL) - 1;
    const benchAnn = Math.pow(bs[bs.length - 1].close / bs[0].close, TRADING_DAYS / winL) - 1;
    alpha = fundAnnL - (RF + beta * (benchAnn - RF));              // Jensen's alpha
    const diffs = fr.map((x, i) => x - br[i]);
    trackingError = stdev(diffs) * Math.sqrt(TRADING_DAYS);
  }

  // rolling 3Y CAGR sampled monthly over available history
  const rolling3Y = [];
  const step = 21;
  for (let end = navs.length - 1; end - 3 * TRADING_DAYS >= 0; end -= step) {
    const a = navs[end - 3 * TRADING_DAYS].nav, b = navs[end].nav;
    rolling3Y.push({ time: navs[end].time, cagr: round2((Math.pow(b / a, 1 / 3) - 1) * 100) });
  }
  rolling3Y.reverse();

  const navsOnly = navs.map((x) => x.nav);
  const out = {
    code, name: f.name, amc: f.amc, category: f.category, categoryName: cat.name,
    aum: f.aum, expenseRatio: f.er, benchmark: cat.bench,
    nav: navs[navs.length - 1].nav,
    returns: {
      "1Y": pct(annRet(navs, TRADING_DAYS)), "3Y": pct(annRet(navs, 3 * TRADING_DAYS)),
      "5Y": pct(annRet(navs, 5 * TRADING_DAYS)), "10Y": pct(annRet(navs, Math.min(10 * TRADING_DAYS, navs.length - 2))),
    },
    sharpe: round2(sharpe), sortino: round2(sortino),
    alpha: alpha === null ? null : round2(alpha * 100), beta: beta === null ? null : round2(beta),
    stdDev: round2(annVol * 100), trackingError: trackingError === null ? null : round2(trackingError * 100),
    maxDrawdown: round2(maxDrawdown(navsOnly.slice(-3 * TRADING_DAYS)) * 100),
    rolling3Y,
    rolling3YAvg: round2(mean(rolling3Y.map((x) => x.cagr))),
    rolling3YMin: rolling3Y.length ? Math.min(...rolling3Y.map((x) => x.cagr)) : null,
  };
  metricCache.set(code, out);
  return out;
}
const pct = (x) => (x === null ? null : round2(x * 100));

// ---------------------------------------------------------------------------
// multi-factor ranking within category
// ---------------------------------------------------------------------------
function zscores(values) {
  const ok = values.filter((v) => v !== null && isFinite(v));
  const m = mean(ok), s = stdev(ok) || 1;
  return values.map((v) => (v === null || !isFinite(v) ? 0 : (v - m) / s));
}

/** Rank all funds. Weights follow the spec's multi-factor methodology. */
export function rankAll() {
  const ms = FUNDS.map((f) => metrics(f.code));
  const byCat = {};
  for (const m of ms) (byCat[m.category] ??= []).push(m);
  const scored = [];
  for (const cat of Object.keys(byCat)) {
    const group = byCat[cat];
    const W = { sharpe: 0.22, sortino: 0.18, alpha: 0.20, r3: 0.15, consist: 0.10, er: 0.10, te: 0.05 };
    const z = {
      sharpe: zscores(group.map((g) => g.sharpe)),
      sortino: zscores(group.map((g) => g.sortino)),
      alpha: zscores(group.map((g) => g.alpha)),
      r3: zscores(group.map((g) => g.returns["3Y"])),
      consist: zscores(group.map((g) => g.rolling3YMin)),
      er: zscores(group.map((g) => -g.expenseRatio)),          // lower is better
      te: zscores(group.map((g) => (g.trackingError === null ? 0 : -g.trackingError))),
    };
    group.forEach((g, i) => {
      const score = W.sharpe * z.sharpe[i] + W.sortino * z.sortino[i] + W.alpha * z.alpha[i] +
        W.r3 * z.r3[i] + W.consist * z.consist[i] + W.er * z.er[i] + W.te * z.te[i];
      scored.push({ ...g, score: round2(score) });
    });
  }
  // percentile → star rating within category
  for (const cat of Object.keys(byCat)) {
    const grp = scored.filter((s) => s.category === cat).sort((a, b) => b.score - a.score);
    grp.forEach((g, i) => {
      g.categoryRank = i + 1;
      g.categoryCount = grp.length;
      const p = 1 - i / Math.max(1, grp.length - 1 || 1);
      g.rating = grp.length === 1 ? 4 : p >= 0.85 ? 5 : p >= 0.6 ? 4 : p >= 0.35 ? 3 : p >= 0.15 ? 2 : 1;
    });
  }
  return scored;
}

let rankedCache = null;
export function ranked() { return (rankedCache ??= rankAll()); }

export function screen({ q = "", category = "", amc = "", minAum = 0, maxEr = 99, minRating = 0, sort = "score", dir = "desc" } = {}) {
  let rows = ranked().filter((f) =>
    (!q || f.name.toLowerCase().includes(q.toLowerCase()) || f.amc.toLowerCase().includes(q.toLowerCase())) &&
    (!category || f.category === category) &&
    (!amc || f.amc === amc) &&
    f.aum >= minAum && f.expenseRatio <= maxEr && (f.rating ?? 0) >= minRating
  );
  const key = { score: "score", aum: "aum", er: "expenseRatio", r1: null, r3: null, r5: null, sharpe: "sharpe", alpha: "alpha", sd: "stdDev" }[sort] ?? "score";
  rows = rows.sort((a, b) => {
    const va = sort.startsWith("r") ? a.returns[sort === "r1" ? "1Y" : sort === "r3" ? "3Y" : "5Y"] : a[key];
    const vb = sort.startsWith("r") ? b.returns[sort === "r1" ? "1Y" : sort === "r3" ? "3Y" : "5Y"] : b[key];
    return dir === "asc" ? (va ?? -99) - (vb ?? -99) : (vb ?? -99) - (va ?? -99);
  });
  return rows.map(({ rolling3Y, ...rest }) => rest); // trim heavy series from list view
}

export function fundDetail(code, years = 10) {
  const f = FUND_MAP[code];
  if (!f) return null;
  const m = ranked().find((x) => x.code === code);
  const navs = navSeries(code).slice(-years * TRADING_DAYS);
  const cat = MF_CATEGORIES[f.category];
  let bench = null;
  if (cat.bench) {
    const bars = daily(cat.bench, years * TRADING_DAYS);
    const k = navs[0].nav / bars[0].close;                     // rebase benchmark to NAV start
    bench = bars.map((b) => ({ time: b.time, value: round2(b.close * k) }));
  }
  const peers = ranked().filter((x) => x.category === f.category).map(({ rolling3Y, ...r }) => r);
  return { ...m, inception: f.inception, navs: navs.map((x) => ({ time: x.time, value: x.nav })), bench, benchName: cat.bench, peers };
}

// ---------------------------------------------------------------------------
// SIP backtester — actual point-to-point accumulation over the NAV path
// ---------------------------------------------------------------------------
export function sipBacktest(code, monthly = 10000, years = 5) {
  const navs = navSeries(code);
  if (!navs) return null;
  const days = Math.min(years * TRADING_DAYS, navs.length - 2);
  const slice = navs.slice(-days);
  let units = 0, invested = 0;
  const timeline = [];
  for (let i = 0; i < slice.length; i += 21) {                  // monthly on ~21st trading day
    units += monthly / slice[i].nav;
    invested += monthly;
    timeline.push({ time: slice[i].time, invested, value: round2(units * slice[i].nav) });
  }
  const value = units * slice[slice.length - 1].nav;
  const months = timeline.length;
  // XIRR approximation via bisection on monthly rate
  let lo = -0.9 / 12, hi = 1.5 / 12;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    let fv = 0;
    for (let k = 0; k < months; k++) fv += monthly * Math.pow(1 + mid, months - k);
    if (fv < value) lo = mid; else hi = mid;
  }
  const xirr = Math.pow(1 + (lo + hi) / 2, 12) - 1;
  return { code, monthly, years, invested: Math.round(invested), value: Math.round(value), gain: Math.round(value - invested), xirrPct: round2(xirr * 100), timeline };
}

// ---------------------------------------------------------------------------
// robo-advisory: risk profiling → model portfolio of ranked direct funds
// ---------------------------------------------------------------------------
export const RISK_QUESTIONS = [
  { id: "horizon", text: "When do you expect to need most of this money?", options: [["Under 3 years", 1], ["3–5 years", 2], ["5–10 years", 3], ["10+ years", 4]] },
  { id: "drawdown", text: "Your ₹10L portfolio falls to ₹7.5L in a crash. You would…", options: [["Sell everything", 1], ["Sell some, hold rest", 2], ["Hold and wait", 3], ["Invest more", 4]] },
  { id: "income", text: "How stable is your primary income?", options: [["Unstable / variable", 1], ["Somewhat stable", 2], ["Stable salaried", 3], ["Very stable, multiple sources", 4]] },
  { id: "experience", text: "Your experience with equity investing?", options: [["None", 1], ["MFs only", 2], ["MFs + direct stocks", 3], ["Stocks + F&O", 4]] },
  { id: "dependents", text: "Share of family expenses you fund?", options: [["Nearly all", 1], ["More than half", 2], ["Around half", 3], ["Small share", 4]] },
  { id: "emergency", text: "Emergency fund coverage of monthly expenses?", options: [["< 3 months", 1], ["3–6 months", 2], ["6–12 months", 3], ["12+ months", 4]] },
  { id: "goal", text: "What matters more to you?", options: [["Protecting capital", 1], ["Steady growth, low swings", 2], ["Growth, can accept swings", 3], ["Maximum growth", 4]] },
];

export function riskProfile(answers = {}) {
  const raw = RISK_QUESTIONS.reduce((a, q) => a + (Number(answers[q.id]) || 2), 0); // 7..28
  const score = Math.round(((raw - 7) / 21) * 100);
  const band = score < 20 ? "CONSERVATIVE" : score < 40 ? "MODERATELY_CONSERVATIVE" : score < 60 ? "BALANCED" : score < 80 ? "GROWTH" : "AGGRESSIVE";
  return { score, band };
}

const MODEL_PORTFOLIOS = {
  CONSERVATIVE:            { equity: 0.20, debt: 0.65, gold: 0.10, liquid: 0.05, expReturn: 0.082 },
  MODERATELY_CONSERVATIVE: { equity: 0.35, debt: 0.50, gold: 0.10, liquid: 0.05, expReturn: 0.093 },
  BALANCED:                { equity: 0.55, debt: 0.35, gold: 0.10, liquid: 0.00, expReturn: 0.105 },
  GROWTH:                  { equity: 0.70, debt: 0.20, gold: 0.10, liquid: 0.00, expReturn: 0.115 },
  AGGRESSIVE:              { equity: 0.85, debt: 0.10, gold: 0.05, liquid: 0.00, expReturn: 0.124 },
};

/** Map a risk band + monthly amount to top-ranked zero-commission direct funds. */
export function roboPortfolio(band = "BALANCED", monthly = 25000, opts = {}) {
  const model = MODEL_PORTFOLIOS[band] || MODEL_PORTFOLIOS.BALANCED;
  const top = (cat, n = 1) => ranked().filter((f) => f.category === cat).sort((a, b) => b.score - a.score).slice(0, n);
  const picks = [];
  const eqAmt = model.equity * monthly;
  if (eqAmt > 0) {
    const idx = top("INDEX", 1)[0], flexi = top("FLEXI", 1)[0], mid = top("MID", 1)[0], small = top("SMALL", 1)[0];
    const aggressive = band === "AGGRESSIVE" || band === "GROWTH";
    picks.push({ ...slim(idx), bucket: "Equity — Core Index", weight: model.equity * (aggressive ? 0.35 : 0.5) });
    picks.push({ ...slim(flexi), bucket: "Equity — Flexi Cap", weight: model.equity * (aggressive ? 0.3 : 0.35) });
    picks.push({ ...slim(mid), bucket: "Equity — Mid Cap", weight: model.equity * (aggressive ? 0.2 : 0.15) });
    if (aggressive) picks.push({ ...slim(small), bucket: "Equity — Small Cap", weight: model.equity * 0.15 });
  }
  if (model.debt > 0) picks.push({ ...slim(top("DEBT", 1)[0]), bucket: "Debt — Accrual", weight: model.debt });
  if (model.gold > 0) picks.push({ ...slim(top("GOLD", 1)[0]), bucket: "Gold", weight: model.gold });
  if (model.liquid > 0) picks.push({ ...slim(top("LIQUID", 1)[0]), bucket: "Liquid — Buffer", weight: model.liquid });
  const total = picks.reduce((a, p) => a + p.weight, 0);
  picks.forEach((p) => { p.weight = round2((p.weight / total) * 100); p.monthly = Math.round((p.weight / 100) * monthly / 500) * 500; });
  return { band, model: { equityPct: model.equity * 100, debtPct: model.debt * 100, goldPct: model.gold * 100, liquidPct: model.liquid * 100 }, expReturnPct: round2(model.expReturn * 100), monthly, picks };
}
const slim = (f) => f && { code: f.code, name: f.name, amc: f.amc, category: f.categoryName, rating: f.rating, er: f.expenseRatio, r3: f.returns["3Y"], sharpe: f.sharpe };

export const AMCS = [...new Set(FUNDS.map((f) => f.amc))].sort();
export const CATEGORIES = Object.entries(MF_CATEGORIES).map(([k, v]) => ({ key: k, name: v.name }));
