// ---------------------------------------------------------------------------
// planning.js — Financial intake & profiling: real-time net worth, cash-flow
// ledger, DTI, emergency runway, insurance audit, and automatic construction
// of the tax-engine input from the client's ledger. NRI-aware throughout.
// ---------------------------------------------------------------------------
import { q } from "../lib/db.js";
import { quote } from "./market.js";
import { navSeries } from "./funds.js";
import { FUND_MAP } from "../data/universe.js";
import { round2, clamp } from "../lib/util.js";

export function holdingsValued(userId) {
  const mf = q.all("SELECT * FROM holdings_mf WHERE user_id = ?", userId).map((h) => {
    const navs = navSeries(h.fund_code);
    const nav = navs ? navs[navs.length - 1].nav : h.avg_nav;
    const f = FUND_MAP[h.fund_code];
    const value = h.units * nav;
    const cost = h.units * h.avg_nav;
    return { ...h, fundName: f?.name, category: f?.category, nav: round2(nav), value: Math.round(value), cost: Math.round(cost), pnl: Math.round(value - cost), pnlPct: round2(((value - cost) / cost) * 100) };
  });
  const eq = q.all("SELECT * FROM holdings_eq WHERE user_id = ?", userId).map((h) => {
    const qt = quote(h.symbol);
    const ltp = qt?.ltp ?? h.avg_price;
    const value = h.qty * ltp;
    const cost = h.qty * h.avg_price;
    return { ...h, name: qt?.name, sector: qt?.sector, ltp, value: Math.round(value), cost: Math.round(cost), pnl: Math.round(value - cost), pnlPct: round2(((value - cost) / cost) * 100), dayChangePct: qt?.changePct ?? 0 };
  });
  return { mf, eq, mfValue: mf.reduce((a, x) => a + x.value, 0), eqValue: eq.reduce((a, x) => a + x.value, 0) };
}

export function netWorth(userId) {
  const rows = q.all("SELECT * FROM assets WHERE user_id = ?", userId);
  const hv = holdingsValued(userId);
  const assets = rows.map((a) => {
    let value = a.value;
    if (a.class === "MUTUAL_FUND") value = hv.mfValue;
    if (a.class === "EQUITY") value = hv.eqValue;
    return { ...a, value: Math.round(value), live: a.class === "MUTUAL_FUND" || a.class === "EQUITY" };
  });
  const liabilities = q.all("SELECT * FROM liabilities WHERE user_id = ?", userId);
  const totalAssets = assets.reduce((a, x) => a + x.value, 0);
  const totalLiabilities = liabilities.reduce((a, x) => a + x.outstanding, 0);

  const byClass = {};
  for (const a of assets) byClass[a.class] = (byClass[a.class] || 0) + a.value;
  const buckets = {
    equity: (byClass.EQUITY || 0) + (byClass.MUTUAL_FUND || 0) * 0.75 + (byClass.ESOP || 0) + (byClass.NPS || 0) * 0.6,
    debt: (byClass.EPF || 0) + (byClass.PPF || 0) + (byClass.CASH || 0) + (byClass.MUTUAL_FUND || 0) * 0.25 + (byClass.NPS || 0) * 0.4 + (byClass.INTL || 0) * 0.5,
    gold: byClass.GOLD || 0,
    realEstate: byClass.REAL_ESTATE || 0,
  };
  const investable = buckets.equity + buckets.debt + buckets.gold + (byClass.INTL || 0) * 0.5;
  const allocation = investable > 0 ? {
    equity: round2(buckets.equity / investable),
    debt: round2(buckets.debt / investable),
    gold: round2(buckets.gold / investable),
  } : { equity: 0, debt: 0, gold: 0 };

  return {
    assets, liabilities, byClass,
    totalAssets: Math.round(totalAssets), totalLiabilities: Math.round(totalLiabilities),
    netWorth: Math.round(totalAssets - totalLiabilities),
    allocation, investable: Math.round(investable),
    holdings: hv,
  };
}

export function cashflow(userId) {
  const rows = q.all("SELECT * FROM cashflow WHERE user_id = ?", userId).map((r) => ({ ...r, meta: JSON.parse(r.meta || "{}") }));
  const liabilities = q.all("SELECT * FROM liabilities WHERE user_id = ?", userId);
  const emiTotal = liabilities.filter((l) => l.type !== "CREDIT_CARD").reduce((a, l) => a + l.emi, 0);
  const ccOutstanding = liabilities.filter((l) => l.type === "CREDIT_CARD").reduce((a, l) => a + l.outstanding, 0);

  const incomes = rows.filter((r) => r.kind === "INCOME");
  const expenses = rows.filter((r) => r.kind === "EXPENSE" && !r.meta.computed);
  const incomeTotal = incomes.reduce((a, r) => a + r.monthly, 0);
  const expenseTotal = expenses.reduce((a, r) => a + r.monthly, 0) + emiTotal;

  const byCat = { FIXED: emiTotal, VARIABLE: 0, DISCRETIONARY: 0 };
  for (const e of expenses) byCat[e.category] = (byCat[e.category] || 0) + e.monthly;

  return {
    incomes, expenses,
    emiTotal: Math.round(emiTotal), ccOutstanding: Math.round(ccOutstanding),
    incomeTotal: Math.round(incomeTotal), expenseTotal: Math.round(expenseTotal),
    surplus: Math.round(incomeTotal - expenseTotal),
    savingsRatePct: incomeTotal ? round2(((incomeTotal - expenseTotal) / incomeTotal) * 100) : 0,
    expenseSplit: byCat,
  };
}

export function ratios(userId) {
  const nw = netWorth(userId);
  const cf = cashflow(userId);
  const liquid = (nw.byClass.CASH || 0) + (nw.byClass.MUTUAL_FUND || 0) * 0.25;
  // credit cards: use 5% minimum-due as the monthly obligation, not the payoff
  const ccMinDue = nw.liabilities.filter((l) => l.type === "CREDIT_CARD").reduce((a, l) => a + l.outstanding * 0.05, 0);
  const dti = cf.incomeTotal ? round2(((cf.emiTotal + ccMinDue) / cf.incomeTotal) * 100) : 0;
  return {
    dtiPct: dti,
    dtiVerdict: dti < 30 ? "HEALTHY" : dti < 45 ? "STRETCHED" : "CRITICAL",
    emergencyMonths: cf.expenseTotal ? round2(liquid / cf.expenseTotal) : 0,
    liquidAssets: Math.round(liquid),
    leverage: nw.totalAssets ? round2((nw.totalLiabilities / nw.totalAssets) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// insurance audit — cover adequacy vs liabilities + dependents (HLV hybrid)
// ---------------------------------------------------------------------------
export function insuranceAudit(userId) {
  const user = q.one("SELECT * FROM users WHERE id = ?", userId);
  const policies = q.all("SELECT * FROM insurance WHERE user_id = ?", userId);
  const nw = netWorth(userId);
  const cf = cashflow(userId);
  const annualIncome = cf.incomeTotal * 12;

  const termCover = policies.filter((p) => p.type === "TERM").reduce((a, p) => a + p.cover, 0);
  const healthCover = policies.filter((p) => p.type === "HEALTH").reduce((a, p) => a + p.cover, 0);
  const ciCover = policies.filter((p) => p.type === "CRITICAL_ILLNESS").reduce((a, p) => a + p.cover, 0);

  // Needed term cover: 10× income + liabilities + goals buffer − liquid investable
  const needTerm = Math.max(0, annualIncome * 10 + nw.totalLiabilities - nw.investable * 0.6);
  const needHealth = user.dependents > 0 ? 2500000 : 1500000;
  const needCi = clamp(annualIncome * 3, 1500000, 10000000);

  const items = [
    { type: "TERM", label: "Term life", have: termCover, need: Math.round(needTerm), gap: Math.round(Math.max(0, needTerm - termCover)), note: termCover >= needTerm ? "Adequate — review every 3 years or on life events." : "Buy a pure term plan for the gap; premiums are cheapest before the next birthday. NRIs can buy Indian term plans with tele-medicals." },
    { type: "HEALTH", label: "Health (family floater)", have: healthCover, need: needHealth, gap: Math.max(0, needHealth - healthCover), note: healthCover >= needHealth ? "Adequate for metro hospitalisation costs." : "Top up with a super top-up policy (deductible = current cover) — far cheaper than raising the base sum insured." },
    { type: "CRITICAL_ILLNESS", label: "Critical illness", have: ciCover, need: needCi, gap: Math.max(0, needCi - ciCover), note: ciCover >= needCi ? "Adequate." : "A CI rider (3× annual income) pays a lump sum on diagnosis — protects goals when income stops." },
  ];
  return { policies, items, premiumTotal: policies.reduce((a, p) => a + p.premium, 0), score: Math.round(100 * items.filter((i) => i.gap === 0).length / items.length) };
}

// ---------------------------------------------------------------------------
// auto-build the tax engine input from the client's ledger
// ---------------------------------------------------------------------------
export function buildTaxInput(userId, overrides = {}) {
  const user = q.one("SELECT * FROM users WHERE id = ?", userId);
  const cf = cashflow(userId);
  const liabilities = q.all("SELECT * FROM liabilities WHERE user_id = ?", userId);
  const meta = JSON.parse(user.meta || "{}");

  const byCat = (cat) => cf.incomes.filter((i) => i.category === cat).reduce((a, i) => a + i.monthly * 12, 0);
  const homeLoan = liabilities.find((l) => l.type === "HOME_LOAN");
  // approximate interest component of home-loan EMIs this year
  const hlInterest = homeLoan ? Math.min(homeLoan.outstanding * (homeLoan.rate / 100), homeLoan.emi * 12 * 0.7) : 0;

  const isNRI = user.residency === "NRI";
  const inc = {
    salary: isNRI ? 0 : byCat("SALARY"),                    // NRI foreign salary not taxable in India
    business: byCat("BUSINESS"),
    fnoGains: byCat("CAPITAL_GAINS"),
    rentalAnnual: byCat("RENTAL"),
    dividends: byCat("DIVIDEND"),
    nroInterest: isNRI ? Math.round((qSum(userId, "CASH", "NRO") || 850000) * 0.065) : 0,
    nreInterest: isNRI ? Math.round((qSum(userId, "CASH", "NRE") || 4200000) * 0.07) : 0,
    otherInterest: isNRI ? 0 : Math.round((qSum(userId, "CASH") || 0) * 0.055),
    stcgEquity: overrides.stcgEquity ?? 0,
    ltcgEquity: overrides.ltcgEquity ?? 0,
    ltcgOther: 0,
    ...overrides.income,
  };
  const ded = {
    sec80C: overrides.sec80C ?? (isNRI ? 60000 : 150000),   // ELSS SIPs count; PPF closed to fresh NRI a/cs
    sec80D: q.all("SELECT * FROM insurance WHERE user_id = ? AND type='HEALTH'", userId).reduce((a, p) => a + p.premium, 0),
    nps80CCD1B: isNRI ? 0 : 50000,
    npsEmployer: isNRI ? 0 : byCat("SALARY") * 0.055,
    homeLoanInterest: Math.round(hlInterest),
    donations80G: 0,
    ...overrides.deductions,
  };
  return { profile: { residency: user.residency, age: user.age, name: user.name, dtaaCountry: meta.dtaaCountry }, income: inc, deductions: ded };
}

function qSum(userId, cls, labelLike) {
  const rows = q.all("SELECT * FROM assets WHERE user_id = ? AND class = ?", userId, cls);
  const filtered = labelLike ? rows.filter((r) => r.label.toUpperCase().includes(labelLike)) : rows;
  return filtered.reduce((a, r) => a + r.value, 0);
}

/** FEMA / compliance panel for NRIs. */
export function femaGuidelines(user) {
  if (user.residency !== "NRI") return null;
  const meta = JSON.parse(user.meta || "{}");
  return {
    accounts: meta.accounts || {},
    rules: [
      { title: "NRE account", body: "Repatriable. Funded from foreign earnings. Interest tax-free in India. Ideal for investible foreign savings." },
      { title: "NRO account", body: "For India-sourced income (rent, dividends). Interest taxable, TDS 30% u/s 195. Repatriation capped at USD 1 million per FY with Form 15CA/CB." },
      { title: "Equity investing (PIS)", body: "NRIs invest in Indian listed equity via a PIS-linked NRE/NRO demat. Intraday and naked F&O are restricted; delivery-based trades allowed." },
      { title: "Mutual funds", body: "Most AMCs accept NRI investments with FATCA declaration (US/Canada NRIs face AMC-specific restrictions). Redemptions to source account type." },
      { title: "Property", body: "NRIs may buy residential/commercial property (not agricultural land). Sale proceeds of up to 2 properties repatriable subject to conditions." },
      { title: "PPF / small savings", body: "No fresh PPF/NSC accounts as NRI; existing PPF may be held to maturity without extension." },
      { title: "DTAA", body: `Double taxation relief with ${meta.dtaaCountry || "your residence country"} — typically via tax credit. Keep TRC + Form 10F on file for treaty TDS rates.` },
    ],
  };
}
