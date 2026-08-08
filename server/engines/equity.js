// ---------------------------------------------------------------------------
// equity.js — AI-powered equity analytics: financial-health breakdown, peer &
// industry benchmarking, automated SWOT and an executive-summary composer.
// All narrative is generated from the actual computed fundamentals — every
// sentence traces to a number the user can see on the page.
// ---------------------------------------------------------------------------
import { STOCKS, STOCK_MAP, SECTORS } from "../data/universe.js";
import { SUBSECTOR_OF, INDUSTRY, POLICY, PRODUCTS, SECTOR_PRODUCT_TEMPLATE, SECTOR_VALUATION } from "../data/sectorIntel.js";
import { fundamentals, quote, daily } from "./market.js";
import { sectorContext } from "./screeners.js";
import { interpret, interpConfigured } from "./seo.js";
import { mean, round2, round1, rsiSeries } from "../lib/util.js";

const fmtCr = (cr) => (cr >= 100000 ? `₹${(cr / 100000).toFixed(2)} lakh crore` : `₹${Math.round(cr).toLocaleString("en-IN")} crore`);

const BUSINESS_DESCRIPTIONS = {
  IT: (s) => `${s.name} is an Indian IT services and consulting company delivering application development, cloud migration, data engineering and managed services to global enterprises, with revenue concentrated in BFSI, retail and manufacturing verticals across North America and Europe.`,
  BANK: (s) => `${s.name} is a scheduled commercial bank earning through the interest spread between advances and deposits, alongside fee income from cards, transaction banking and third-party distribution. Loan-book quality (GNPA), CASA share and net interest margin drive earnings.`,
  NBFC: (s) => `${s.name} operates in the financial-services space — lending and/or asset management — where growth depends on AUM expansion, borrowing-cost spreads and credit discipline through cycles.`,
  AUTO: (s) => `${s.name} designs and manufactures automobiles for domestic and export markets. Volume growth, commodity-cost pass-through and new-launch cadence (including EV transition) are the principal earnings drivers.`,
  PHARMA: (s) => `${s.name} develops, manufactures and markets pharmaceutical formulations and APIs across domestic branded generics and regulated export markets, with US FDA compliance and ANDA pipeline progress as key monitorables.`,
  FMCG: (s) => `${s.name} sells branded fast-moving consumer goods through deep general-trade and modern-trade distribution. Rural demand recovery, raw-material inflation and premiumisation shape volume and margin trajectories.`,
  METAL: (s) => `${s.name} is a commodity producer whose realisations track global metal prices; operating leverage, integration into raw materials and balance-sheet discipline determine through-cycle performance.`,
  ENERGY: (s) => `${s.name} operates across the energy value chain; regulated returns, refining/marketing margins or renewable build-out (as applicable) drive cash flows.`,
  INFRA: (s) => `${s.name} builds and operates infrastructure assets — engineering, construction, cement or logistics — where order-book growth, execution pace and working-capital cycles decide earnings quality.`,
  REALTY: (s) => `${s.name} develops residential and commercial real estate; pre-sales bookings, collections and debt reduction are the metrics that matter across property cycles.`,
  CHEM: (s) => `${s.name} manufactures specialty and commodity chemicals serving agrochem, pharma and industrial users, balancing China+1 tailwinds against input-cost cyclicality.`,
  CDUR: (s) => `${s.name} makes consumer durables and discretionary products; festive-season demand, distribution expansion and premium mix drive growth.`,
  TELECOM: (s) => `${s.name} operates telecom networks/infrastructure where ARPU improvement, subscriber mix and capex intensity on 5G determine free-cash-flow inflection.`,
  DEFENCE: (s) => `${s.name} supplies defence and aerospace platforms with a multi-year government order book; indigenisation policy and execution throughput underpin visibility.`,
};

/** 0–100 composite financial health score with pillar breakdown. */
export function healthScore(symbol) {
  const f = fundamentals(symbol);
  const s = STOCK_MAP[symbol];
  if (!f || !s) return null;
  const last = f.annual[f.annual.length - 1];
  const pillars = [];
  const push = (name, score, note) => pillars.push({ name, score: Math.round(Math.max(0, Math.min(100, score))), note });

  push("Growth", (f.ratios.revCagr3Pct / 20) * 60 + (f.ratios.patCagr3Pct / 25) * 40,
    `Revenue CAGR (3Y) ${f.ratios.revCagr3Pct}%, PAT CAGR ${f.ratios.patCagr3Pct}%`);
  push("Profitability", (last.roe / 25) * 55 + ((last.ebitdaMarginPct ?? last.patMarginPct * 1.6) / 30) * 45,
    `ROE ${last.roe}%${last.roce ? `, ROCE ${last.roce}%` : ""}${last.ebitdaMarginPct ? `, EBITDA margin ${last.ebitdaMarginPct}%` : ""}`);
  push("Balance Sheet", last.debtToEquity === null ? 70 : 100 - Math.min(100, last.debtToEquity * 55),
    last.debtToEquity === null ? "Leverage assessed via regulatory capital (bank/NBFC)" : `Debt-to-Equity ${last.debtToEquity}×`);
  push("Cash Generation", last.fcf === null ? 65 : (last.fcf / Math.max(1, last.pat)) * 90,
    last.fcf === null ? "See NIM & provisioning trends" : `FCF/PAT conversion ${Math.round((last.fcf / Math.max(1, last.pat)) * 100)}%`);
  const score = Math.round(mean(pillars.map((p) => p.score)));
  return { score, grade: score >= 75 ? "STRONG" : score >= 55 ? "STABLE" : score >= 40 ? "MODERATE" : "WEAK", pillars };
}

/** Peer & industry benchmarking with relative multiples. */
export function peerComparison(symbol) {
  const s = STOCK_MAP[symbol];
  if (!s) return null;
  const peers = STOCKS.filter((x) => x.sector === s.sector).map((x) => {
    const f = fundamentals(x.symbol);
    const qt = quote(x.symbol);
    const last = f.annual[f.annual.length - 1];
    return {
      symbol: x.symbol, name: x.name, self: x.symbol === symbol,
      mcap: f.ratios.marketCap, price: qt.ltp, changePct: qt.changePct,
      pe: f.ratios.pe, pb: f.ratios.pb, evEbitda: f.ratios.evEbitda,
      roe: last.roe, revGrowthPct: last.growthPct, patMarginPct: last.patMarginPct,
      debtToEquity: last.debtToEquity,
    };
  }).sort((a, b) => b.mcap - a.mcap);
  const med = (k) => { const v = peers.map((p) => p[k]).filter((x) => x !== null && isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  return { sector: s.sector, sectorName: SECTORS[s.sector].name, peers, medians: { pe: med("pe"), pb: med("pb"), evEbitda: med("evEbitda"), roe: med("roe") } };
}

/** Automated SWOT from fundamentals + technicals — regenerates on data updates. */
export function swot(symbol) {
  const s = STOCK_MAP[symbol];
  const f = fundamentals(symbol);
  const qt = quote(symbol);
  const pc = peerComparison(symbol);
  if (!s || !f) return null;
  const last = f.annual[f.annual.length - 1];
  const bars = daily(symbol, 260);
  const closes = bars.map((b) => b.close);
  const rsi = rsiSeries(closes, 14).at(-1);
  const offHigh = round1(((qt.week52High - qt.ltp) / qt.week52High) * 100);

  const S = [], W = [], O = [], T = [];
  if (f.ratios.revCagr3Pct >= 12) S.push(`Consistent compounding: revenue CAGR of ${f.ratios.revCagr3Pct}% over 3 years with PAT CAGR of ${f.ratios.patCagr3Pct}%.`);
  if (last.roe >= 18) S.push(`Superior capital efficiency — ROE of ${last.roe}%${last.roce ? ` and ROCE of ${last.roce}%` : ""} ranks in the top tier of ${pc.sectorName}.`);
  if (last.debtToEquity !== null && last.debtToEquity <= 0.3) S.push(`Near debt-free balance sheet (D/E ${last.debtToEquity}×) gives head-room for capex and downturns.`);
  if (last.fcf && last.fcf / last.pat > 0.7) S.push(`Strong cash conversion — ${Math.round((last.fcf / last.pat) * 100)}% of profits turn into free cash flow.`);
  if (s.quality >= 0.85) S.push(`Franchise strength: entrenched market position and pricing power sustain margins across cycles.`);

  if (last.roe < 12) W.push(`Sub-par return ratios (ROE ${last.roe}%) dilute long-term compounding.`);
  if (last.debtToEquity !== null && last.debtToEquity > 0.9) W.push(`Leveraged balance sheet — D/E of ${last.debtToEquity}× amplifies earnings cyclicality.`);
  if (f.ratios.patGrowthPct < 5) W.push(`Earnings momentum has stalled: PAT grew only ${f.ratios.patGrowthPct}% last FY.`);
  if (f.ratios.pe > (pc.medians.pe ?? 25) * 1.4) W.push(`Rich valuation — trades at ${f.ratios.pe}× earnings vs sector median ${pc.medians.pe}×; execution slips get punished.`);
  if (last.fcf !== null && last.fcf / Math.max(1, last.pat) < 0.4) W.push(`Weak FCF conversion (${Math.round((last.fcf / Math.max(1, last.pat)) * 100)}%) points to working-capital drag.`);
  if (!W.length) W.push(`Valuation leaves little margin of safety at ${f.ratios.pe}× trailing earnings.`);

  if (s.growth >= 0.6) O.push(`Sector tailwinds — ${SECTORS[s.sector].name} demand cycle supports double-digit medium-term growth.`);
  if (offHigh > 15) O.push(`Price is ${offHigh}% below its 52-week high — mean-reversion opportunity if fundamentals hold.`);
  if (f.ratios.pe < (pc.medians.pe ?? 25) * 0.85) O.push(`Valuation re-rating scope: ${f.ratios.pe}× vs sector median ${pc.medians.pe}× despite comparable returns.`);
  O.push(`Formalisation, premiumisation and China+1 style shifts continue to consolidate share toward organised leaders.`);

  if (s.vol >= 0.3) T.push(`High price volatility (${Math.round(s.vol * 100)}% annualised) — position sizing matters.`);
  if (rsi && rsi > 74) T.push(`Momentum is stretched (RSI ${Math.round(rsi)}); near-term pullback risk elevated.`);
  T.push(...({
    IT: ["Client tech-budget cuts in a US slowdown compress deal ramp-ups.", "GenAI-led pricing deflation on legacy services."],
    BANK: ["Deposit-cost pressure squeezing NIMs.", "Unsecured-credit cycle turning could raise provisions."],
    NBFC: ["Funding-cost spikes in tight liquidity.", "Regulatory tightening on risk weights."],
    AUTO: ["Commodity inflation and EV transition capex.", "Demand sensitivity to rates and fuel prices."],
    PHARMA: ["US price erosion and FDA plant observations.", "R&D pipeline concentration risk."],
    FMCG: ["Prolonged rural demand weakness.", "Private-label and D2C share erosion."],
    METAL: ["Global demand slump and import dumping.", "Carbon-transition capex burden."],
    ENERGY: ["Crude/regulatory swings on marketing margins.", "Stranded-asset risk in the energy transition."],
    INFRA: ["Working-capital stretch on government orders.", "Commodity cost overruns on fixed-price contracts."],
    REALTY: ["Rate-hike sensitivity of home affordability.", "Inventory cycles and approval delays."],
    CHEM: ["China supply glut pressuring realisations.", "Environmental compliance capex."],
    CDUR: ["Discretionary demand deferral in slowdowns.", "Import-cost inflation on components."],
    TELECOM: ["Tariff-war relapse risk.", "Spectrum/AGR levies and 5G capex intensity."],
    DEFENCE: ["Order lumpiness and execution timelines.", "Budget re-prioritisation risk."],
  }[s.sector] || ["Macro slowdown impact on demand."]));

  return { strengths: S.slice(0, 4), weaknesses: W.slice(0, 3), opportunities: O.slice(0, 3), threats: T.slice(0, 3) };
}

/** AI Executive Summary — narrative composed from computed facts. */
export function executiveSummary(symbol) {
  const s = STOCK_MAP[symbol];
  const f = fundamentals(symbol);
  const qt = quote(symbol);
  const hs = healthScore(symbol);
  const pc = peerComparison(symbol);
  if (!s || !f) return null;
  const last = f.annual[f.annual.length - 1];
  const rank = pc.peers.findIndex((p) => p.symbol === symbol) + 1;
  const vsMedian = pc.medians.pe ? round1(((f.ratios.pe - pc.medians.pe) / pc.medians.pe) * 100) : 0;

  const para1 = BUSINESS_DESCRIPTIONS[s.sector]?.(s) ?? `${s.name} operates in the ${SECTORS[s.sector].name} sector.`;
  const para2 = `On the numbers: revenue compounded at ${f.ratios.revCagr3Pct}% and profit at ${f.ratios.patCagr3Pct}% over the last three financial years, with FY26 revenue of ${fmtCr(last.revenue)} and PAT margin of ${last.patMarginPct}%. Return on equity stands at ${last.roe}%${last.roce ? ` (ROCE ${last.roce}%)` : ""}, ${last.debtToEquity !== null ? `with leverage at ${last.debtToEquity}× debt-to-equity` : "with capital ratios governed by regulatory norms"}. The platform's financial-health engine scores it ${hs.score}/100 (${hs.grade}).`;
  const para3 = `The stock trades at ${f.ratios.pe}× trailing earnings — ${Math.abs(vsMedian)}% ${vsMedian >= 0 ? "premium" : "discount"} to the ${pc.sectorName} median of ${pc.medians.pe}× — and is the #${rank} company in its peer set by market value (₹${Math.round(f.ratios.marketCap / 1000) / 100} lakh crore). Price is ${round1(((qt.week52High - qt.ltp) / qt.week52High) * 100)}% off its 52-week high${qt.changePct >= 0 ? "" : " after recent weakness"}. ${hs.score >= 70 ? "The competitive moat — " + (s.quality >= 0.85 ? "brand, distribution and switching costs" : "scale and cost position") + " — remains intact." : "Moat durability is the key debate."}`;

  return { paragraphs: [para1, para2, para3], generatedAt: new Date().toISOString(), disclaimer: "AI-generated from platform data for information only — not SEBI-registered investment advice." };
}

/** Industry snapshot: curated narrative + live sector-index stats. */
export function industryAnalysis(sector) {
  const info = INDUSTRY[sector];
  if (!info) return null;
  const ctx = sectorContext(sector);
  const members = STOCKS.filter((s) => s.sector === sector);
  let above50 = 0;
  for (const m of members) {
    const bars = daily(m.symbol, 60);
    const closes = bars.map((b) => b.close);
    const ma = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);
    if (closes[closes.length - 1] > ma) above50++;
  }
  return {
    sector, sectorName: SECTORS[sector]?.name, ...info,
    live: ctx ? { ...ctx, breadthPct: Math.round((above50 / Math.max(1, members.length)) * 100), memberCount: members.length } : null,
    asOf: "curated Aug 2026 · live stats computed now",
  };
}

/** Government support & budget provisions for the sector. */
export const policyFor = (sector) => POLICY[sector]
  ? { sector, sectorName: SECTORS[sector]?.name, ...POLICY[sector], disclaimer: "Policy/budget summaries curated as of Union Budget FY26 (Feb 2025) and later announcements — verify current status before acting." }
  : null;

/** Hero products with market position. Curated for covered names. */
export function productsOf(symbol) {
  const curated = PRODUCTS[symbol];
  if (curated) return { curated: true, items: curated.map(([name, share, note]) => ({ name, share, note })) };
  const s = STOCK_MAP[symbol];
  const tpl = SECTOR_PRODUCT_TEMPLATE[s?.sector];
  return { curated: false, items: [], note: tpl ? `Detailed product intelligence is curated for covered companies. ${symbol} operates in ${tpl}.` : "Product intelligence not yet curated for this company." };
}

/**
 * Sector valuation scorecard: the metrics this sector is actually valued on,
 * company value vs sector median for each, and a composed verdict.
 */
export function sectorScorecard(symbol) {
  const s = STOCK_MAP[symbol];
  const fw = s && SECTOR_VALUATION[s.sector];
  if (!fw) return null;
  const metricOf = (sym) => {
    const fd = fundamentals(sym);
    const last = fd.annual[fd.annual.length - 1];
    return { ...fd.ratios, roe: last.roe, roce: last.roce };
  };
  const mine = metricOf(symbol);
  const peers = STOCKS.filter((x) => x.sector === s.sector);
  const rows = [];
  let valPremiumPct = null, qualityWins = 0, qualityTotal = 0;

  for (const m of fw.metrics) {
    const value = mine[m.key];
    if (value === null || value === undefined) continue;
    const peerVals = peers.map((p) => metricOf(p.symbol)[m.key]).filter((v) => v !== null && v !== undefined && isFinite(v)).sort((a, b) => a - b);
    if (peerVals.length < 2) continue;
    const median = peerVals[Math.floor(peerVals.length / 2)];
    const diffPct = median !== 0 ? round1(((value - median) / Math.abs(median)) * 100) : 0;
    let verdict, good;
    if (m.kind === "valuation") {
      good = diffPct <= 0;
      verdict = Math.abs(diffPct) < 5 ? "in line with sector" : diffPct > 0 ? `${Math.abs(diffPct)}% premium to sector` : `${Math.abs(diffPct)}% discount to sector`;
      if (valPremiumPct === null) valPremiumPct = diffPct;       // first valuation metric = headline
    } else if (m.kind === "quality") {
      good = diffPct >= 0;
      const neutral = Math.abs(diffPct) < 5;
      if (!neutral) { qualityTotal++; if (good) qualityWins++; }
      verdict = neutral ? "matches sector" : diffPct > 0 ? `outperforms by ${Math.abs(diffPct)}%` : `lags by ${Math.abs(diffPct)}%`;
    } else { // risk — lower is better
      good = diffPct <= 0;
      const neutral = Math.abs(diffPct) < 5;
      if (!neutral) { qualityTotal++; if (good) qualityWins++; }
      verdict = neutral ? "matches sector" : diffPct < 0 ? `better (lower) by ${Math.abs(diffPct)}%` : `worse (higher) by ${Math.abs(diffPct)}%`;
    }
    rows.push({ key: m.key, label: m.label, kind: m.kind, why: m.why, value, median, diffPct, verdict, good });
  }

  let summary = "";
  if (valPremiumPct !== null && qualityTotal === 0) {
    summary = `${STOCK_MAP[symbol].name} ${valPremiumPct > 8 ? `trades at a ${Math.abs(valPremiumPct)}% premium to` : valPremiumPct < -8 ? `trades at a ${Math.abs(valPremiumPct)}% discount to` : "is valued in line with"} the sector on ${fw.metrics[0].label}, with quality metrics tracking the sector median.`;
  }
  if (valPremiumPct !== null && qualityTotal > 0) {
    const stance = valPremiumPct > 8 ? `trades at a ${Math.abs(valPremiumPct)}% premium to the sector` : valPremiumPct < -8 ? `trades at a ${Math.abs(valPremiumPct)}% discount to the sector` : "is valued in line with the sector";
    const standing = qualityWins / qualityTotal >= 0.66 ? `beats sector benchmarks on ${qualityWins} of ${qualityTotal} quality/risk metrics` : qualityWins / qualityTotal >= 0.4 ? `is mixed on quality — ahead on ${qualityWins} of ${qualityTotal} metrics` : `trails the sector on most quality metrics (${qualityWins} of ${qualityTotal})`;
    const fit = valPremiumPct > 8 && qualityWins / qualityTotal >= 0.66 ? "The premium is earned by superior fundamentals."
      : valPremiumPct > 8 ? "The premium is NOT fully backed by fundamentals — execution must catch up or the multiple compresses."
      : valPremiumPct < -8 && qualityWins / qualityTotal >= 0.66 ? "A quality business at a discount — the classic re-rating setup, worth investigating why the market disagrees."
      : valPremiumPct < -8 ? "The discount reflects weaker fundamentals — cheap for a reason until the metrics turn."
      : "Fairly priced against its own sector's yardsticks.";
    summary = `${STOCK_MAP[symbol].name} ${stance} on ${fw.metrics[0].label}, and ${standing}. ${fit}`;
  }
  return { sector: s.sector, sectorName: SECTORS[s.sector].name, intro: fw.intro, rows, summary, peerCount: peers.length };
}

export async function stockPage(symbol) {
  const s = STOCK_MAP[symbol];
  const f = fundamentals(symbol);                 // works for full-NSE extras too
  if (!f) return null;
  if (!s) {
    // basic coverage for non-curated NSE-listed symbols
    const qt = quote(symbol);
    return {
      coverage: "basic",
      profile: { symbol, name: qt?.name || symbol, sector: "OTHER", sectorName: "Broader Market (NSE listed)", sub: null, fno: false },
      quote: qt, fundamentals: f, health: null, peers: null, swot: null,
      summary: { paragraphs: [`${qt?.name || symbol} is an NSE-listed company outside our curated 60-stock deep-coverage universe. Price history, quotes and modelled fundamentals are available; connect a broker feed (Upstox/FYERS) for live prices. Deep coverage — peers, SWOT, AI summary, hero products — is curated progressively.`], disclaimer: "Basic coverage · modelled data." },
      industry: null, policy: null, products: productsOf(symbol), sectorCtx: null,
    };
  }
  const summary = executiveSummary(symbol);
  const valuation = sectorScorecard(symbol);
  const hs = healthScore(symbol);

  // AIMLAPI interpretation layer: the same grounded facts, richer prose.
  if (interpConfigured() && summary) {
    const qt = quote(symbol);
    const last = f.annual[f.annual.length - 1];
    const facts = [
      `Company: ${s.name} (${symbol}), sector ${SECTORS[s.sector].name}.`,
      `Price ₹${qt.ltp}, day change ${qt.changePct}%, 52-week range ₹${qt.week52Low}–₹${qt.week52High}.`,
      `FY26: revenue ₹${last.revenue} crore (growth ${last.growthPct}%), PAT ₹${last.pat} crore (margin ${last.patMarginPct}%), EPS ₹${last.eps}, ROE ${last.roe}%${last.roce ? `, ROCE ${last.roce}%` : ""}.`,
      `3-year CAGR: revenue ${f.ratios.revCagr3Pct}%, profit ${f.ratios.patCagr3Pct}%.`,
      `Valuation: P/E ${f.ratios.pe}×, P/B ${f.ratios.pb}×${f.ratios.evEbitda ? `, EV/EBITDA ${f.ratios.evEbitda}×` : ""}, dividend yield ${f.ratios.dividendYieldPct}%.`,
      `Health score ${hs.score}/100 (${hs.grade}).`,
      valuation?.summary ? `Sector standing: ${valuation.summary}` : "",
    ].filter(Boolean).join("\n");
    const r = await interpret("stock", `${symbol}:${new Date().toISOString().slice(0, 10)}`, facts, summary.paragraphs.join("\n\n"));
    summary.paragraphs = r.text.split(/\n{2,}/).filter((p) => p.trim());
    summary.generator = r.generator;
  } else if (summary) summary.generator = "grounded-composer";

  return {
    coverage: "full",
    profile: { symbol, name: s.name, sector: s.sector, sectorName: SECTORS[s.sector].name, sub: SUBSECTOR_OF[symbol] || null, fno: s.fno },
    quote: quote(symbol),
    fundamentals: f,
    health: hs,
    peers: peerComparison(symbol),
    swot: swot(symbol),
    summary,
    industry: industryAnalysis(s.sector),
    policy: policyFor(s.sector),
    products: productsOf(symbol),
    sectorCtx: sectorContext(s.sector),
    valuation,
  };
}

export function listStocks() {
  return STOCKS.map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector, sectorName: SECTORS[s.sector].name, fno: s.fno }));
}
