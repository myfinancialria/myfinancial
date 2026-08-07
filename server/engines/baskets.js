// ---------------------------------------------------------------------------
// baskets.js — goal-linked fund baskets with drift tracking & rebalancing.
//
// Ports the advisory brain of myfinancialria/myfinancial-advisor (robo.py):
//   • risk band + years-to-goal → equity/debt/gold with a hard horizon cap
//     (money needed soon must not ride the market)
//   • sleeve → top-ranked LIVE funds from the AMFI universe (fallback: the
//     platform's curated synthetic ranks when offline)
//   • units bought at NAV; drift measured against target weights; rebalance
//     orders favour directing fresh SIPs to under-weights before selling
//     (capital-gains-aware), selling only past the threshold.
// ---------------------------------------------------------------------------
import { q, insert } from "../lib/db.js";
import { uid, round1, round2, clamp } from "../lib/util.js";
import * as amfi from "../providers/amfi.js";
import * as fundsE from "./funds.js";

// --- allocation logic (robo.py port) ----------------------------------------
const BASE_EQUITY = { Conservative: 25, Moderate: 45, Balanced: 60, Aggressive: 75, "Very Aggressive": 90 };

export function bandOfUser(user) {
  if (user.risk_score !== null && user.risk_score !== undefined) {
    const s = user.risk_score;
    return s < 30 ? "Conservative" : s < 50 ? "Moderate" : s < 68 ? "Balanced" : s < 85 ? "Aggressive" : "Very Aggressive";
  }
  return { CONSERVATIVE: "Conservative", MODERATE: "Balanced", AGGRESSIVE: "Aggressive" }[user.risk_tolerance] || "Balanced";
}

/** Risk band + horizon → % allocation. Horizon caps equity hard. */
export function allocation(band, years) {
  let eq = BASE_EQUITY[band] ?? 45;
  if (years < 1) eq = 0;
  else if (years < 3) eq = Math.min(eq, 30);
  else if (years < 5) eq = Math.min(eq, 50);
  else if (years < 7) eq = Math.min(eq, 70);
  else if (years < 10) eq = Math.min(eq, 85);
  let gold = Math.min(Math.round(eq * 0.10), 10);
  eq = Math.max(0, eq - gold);
  return { equity: eq, debt: 100 - eq - gold, gold };
}

export const blendedReturn = (alloc) =>
  round2(alloc.equity * 0.125 / 100 + alloc.debt * 0.07 / 100 + alloc.gold * 0.09 / 100) * 100;

// --- sleeve construction ------------------------------------------------------
// equity split inside the sleeve by band aggressiveness
const EQ_SPLIT = {
  Conservative: { core: 0.7, growth: 0.3, aggressive: 0.0 },
  Moderate: { core: 0.55, growth: 0.35, aggressive: 0.10 },
  Balanced: { core: 0.45, growth: 0.35, aggressive: 0.20 },
  Aggressive: { core: 0.35, growth: 0.35, aggressive: 0.30 },
  "Very Aggressive": { core: 0.25, growth: 0.35, aggressive: 0.40 },
};

/** Propose funds+weights for an allocation. Live AMFI first, synthetic fallback. */
export async function proposeBasket(band, alloc) {
  const rows = [];
  const push = (f, weightPct, sleeve) => {
    if (!f || weightPct < 1) return;
    rows.push({
      code: String(f.code ?? f.codeSynthetic ?? f.id), name: f.name, amc: f.amc,
      category: f.category || f.categoryName, source: f.source,
      nav: f.nav, r3: f.r3 ?? (f.returns ? f.returns["3Y"] : null), stars: f.stars ?? f.rating ?? null,
      sleeve, targetWeight: round1(weightPct),
    });
  };

  let live = null;
  try { live = await amfi.getUniverse(); } catch { /* offline → synthetic */ }

  const pickLive = (buckets) => {
    for (const b of buckets) {
      const c = live.funds
        .filter((f) => f.bucket === b && f.r3 !== null && f.nav > 0)
        .sort((a, b2) => (b2.stars ?? 0) - (a.stars ?? 0) || (b2.r3 ?? -99) - (a.r3 ?? -99))[0];
      if (c) return { ...c, source: "amfi-live" };
    }
    return null;
  };
  const pickSynthetic = (cat) => {
    const f = fundsE.ranked().filter((x) => x.category === cat).sort((a, b) => b.score - a.score)[0];
    return f ? { ...f, code: f.code, nav: f.nav, source: "synthetic-demo", stars: f.rating } : null;
  };
  const pick = (liveBuckets, synthCat) => (live && pickLive(liveBuckets)) || pickSynthetic(synthCat);

  const split = EQ_SPLIT[band] || EQ_SPLIT.Balanced;
  if (alloc.equity > 0) {
    push(pick(amfi.RECO_BUCKETS.equityCore, "INDEX"), alloc.equity * split.core, "Equity — Core (index/large)");
    push(pick(amfi.RECO_BUCKETS.equityGrowth, "FLEXI"), alloc.equity * split.growth, "Equity — Growth (flexi)");
    if (split.aggressive > 0)
      push(pick(amfi.RECO_BUCKETS.equityAggressive, "MID"), alloc.equity * split.aggressive, "Equity — Mid/Small");
  }
  if (alloc.debt > 0) {
    const debtW = alloc.debt;
    push(pick(amfi.RECO_BUCKETS.debt, "DEBT"), debtW * 0.75, "Debt — Accrual");
    push(pick(amfi.RECO_BUCKETS.liquid, "LIQUID"), debtW * 0.25, "Debt — Liquid buffer");
  }
  if (alloc.gold > 0) push(pick(amfi.RECO_BUCKETS.gold, "GOLD"), alloc.gold, "Gold");

  // normalise to exactly 100
  const total = rows.reduce((a, r) => a + r.targetWeight, 0) || 1;
  rows.forEach((r) => (r.targetWeight = round1((r.targetWeight / total) * 100)));
  return rows;
}

// --- NAV lookup (live first, synthetic fallback) ------------------------------
async function navOf(holding) {
  if (holding.source === "amfi-live") {
    try {
      const u = await amfi.getUniverse();
      const f = u.funds.find((x) => x.code === holding.code);
      if (f?.nav > 0) return f.nav;
    } catch { /* fall through */ }
    return holding.nav;                       // last known
  }
  const navs = fundsE.navSeries(holding.code);
  return navs ? navs[navs.length - 1].nav : holding.nav;
}

// --- CRUD + valuation ----------------------------------------------------------
export async function createFromGoal(user, goal, { lumpsum = 0, monthly = 0 } = {}) {
  const years = clamp(goal.target_year - new Date().getFullYear(), 0.5, 60);
  const band = bandOfUser(user);
  const alloc = allocation(band, years);
  const proposal = await proposeBasket(band, alloc);
  const holdings = proposal.map((p) => {
    const invest = lumpsum * (p.targetWeight / 100);
    return { ...p, units: p.nav > 0 ? round2(invest / p.nav) : 0, buyNav: p.nav, invested: Math.round(invest) };
  });
  const basket = {
    id: uid("bk"), user_id: user.id, goal_id: goal.id,
    name: `${goal.name} basket`, created: Date.now(),
    band, years, alloc: JSON.stringify(alloc), holdings: JSON.stringify(holdings),
    monthly_sip: monthly, invested: Math.round(lumpsum),
  };
  insert("baskets", basket);
  return valueBasket(basket);
}

export async function valueBasket(row) {
  const holdings = JSON.parse(row.holdings || "[]");
  let value = 0;
  const detailed = [];
  for (const h of holdings) {
    const nav = await navOf(h);
    const v = h.units * nav;
    value += v;
    detailed.push({ ...h, nav: round2(nav), value: Math.round(v), pnl: Math.round(v - h.invested), pnlPct: h.invested > 0 ? round1(((v - h.invested) / h.invested) * 100) : 0 });
  }
  detailed.forEach((h) => (h.currentWeight = value > 0 ? round1((h.value / value) * 100) : 0));
  return {
    id: row.id, name: row.name, goalId: row.goal_id, band: row.band, years: row.years,
    alloc: JSON.parse(row.alloc || "{}"), monthlySip: row.monthly_sip,
    invested: row.invested, value: Math.round(value),
    pnl: Math.round(value - row.invested), pnlPct: row.invested > 0 ? round1(((value - row.invested) / row.invested) * 100) : 0,
    holdings: detailed, created: row.created,
    expectedReturnPct: blendedReturn(JSON.parse(row.alloc || "{}")),
  };
}

export async function listBaskets(userId) {
  const rows = q.all("SELECT * FROM baskets WHERE user_id = ?", userId);
  return Promise.all(rows.map(valueBasket));
}

/** Drift + orders. Fresh-SIP-first; sell only beyond thresholdPct. */
export async function rebalancePlan(userId, basketId, thresholdPct = 5) {
  const row = q.one("SELECT * FROM baskets WHERE id = ? AND user_id = ?", basketId, userId);
  if (!row) return null;
  const b = await valueBasket(row);
  const orders = [];
  let sipNote = null;
  for (const h of b.holdings) {
    const driftPct = round1(h.currentWeight - h.targetWeight);
    const deltaValue = Math.round(((h.targetWeight - h.currentWeight) / 100) * b.value);
    const nav = h.nav || 1;
    let action = "HOLD";
    if (deltaValue > 0 && Math.abs(driftPct) > 1) action = "BUY";
    if (deltaValue < 0 && Math.abs(driftPct) > thresholdPct) action = "SELL";
    if (deltaValue < 0 && Math.abs(driftPct) <= thresholdPct) action = "PAUSE_SIP";
    orders.push({
      code: h.code, name: h.name, sleeve: h.sleeve, source: h.source,
      targetWeight: h.targetWeight, currentWeight: h.currentWeight, driftPct,
      action, amount: Math.abs(deltaValue), units: round2(Math.abs(deltaValue) / nav), nav: h.nav,
    });
  }
  const needs = orders.some((o) => o.action === "BUY" || o.action === "SELL");
  const buys = orders.filter((o) => o.action === "BUY").reduce((a, o) => a + o.amount, 0);
  if (b.monthlySip > 0 && buys > 0) {
    const months = Math.ceil(buys / b.monthlySip);
    if (months <= 6) sipNote = `Instead of selling, you can fix most of this drift by directing your next ${months} month${months > 1 ? "s" : ""} of SIP (₹${b.monthlySip.toLocaleString("en-IN")}/mo) entirely to the under-weight funds — zero capital-gains tax, zero exit loads.`;
  }
  return {
    basket: b, thresholdPct, needsRebalance: needs, orders,
    notes: [
      sipNote,
      "Selling equity funds held >12 months triggers 12.5% LTCG beyond the ₹1.25L yearly exemption — harvest within the free limit where possible.",
      "Check exit loads (many equity funds charge 1% within 365 days) before selling recent units.",
    ].filter(Boolean),
  };
}

export function deleteBasket(userId, basketId) {
  q.run("DELETE FROM baskets WHERE id = ? AND user_id = ?", basketId, userId);
  return { deleted: true };
}

/** Invest a fresh amount into an existing basket at target weights. */
export async function investInBasket(userId, basketId, amount) {
  const row = q.one("SELECT * FROM baskets WHERE id = ? AND user_id = ?", basketId, userId);
  if (!row || !(amount > 0)) return null;
  const holdings = JSON.parse(row.holdings || "[]");
  for (const h of holdings) {
    const nav = await navOf(h);
    const chunk = amount * (h.targetWeight / 100);
    h.units = round2(h.units + chunk / nav);
    h.invested = Math.round(h.invested + chunk);
  }
  row.holdings = JSON.stringify(holdings);
  row.invested = Math.round(row.invested + amount);
  insert("baskets", row);
  return valueBasket(row);
}
