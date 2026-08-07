// ---------------------------------------------------------------------------
// signals.js — Advisory & Trading Signals Suite.
//   • Long-term QARP recommendations (quality-at-reasonable-price) with a
//     fundamental thesis, target price and 2–5y horizon
//   • Swing setups derived from the pattern engine, filtered for RR ≥ 1:2
//     and momentum alignment (EMA stack + RSI band)
//   • Intraday momentum picks with strict risk parameters
//   • HNI options desk: delta-targeted iron condors, short strangles/straddles,
//     covered calls, cash-secured puts — premiums & Greeks from the BS chain —
//     plus VIX-regime-driven portfolio hedging (collar / index futures)
// Every payload carries the SEBI-context disclaimer; these are informational
// model outputs, not registered investment advice.
// ---------------------------------------------------------------------------
import { STOCKS, STOCK_MAP, SECTORS } from "../data/universe.js";
import { daily, quote, quotes, vix, optionChain, blackScholes, fundamentals, nextExpiries } from "./market.js";
import { scanPatterns, PATTERN_LABELS } from "./screeners.js";
import { fundamentals as fnd } from "./market.js";
import { emaSeries, rsiSeries, atrSeries, mean, round2, round1, clamp, DAY } from "../lib/util.js";

export const DISCLAIMER = "Model-generated information for education/research. Not investment advice; myfinancial is not a SEBI-registered investment adviser. Derivatives carry substantial risk of loss.";

// ---------------------------------------------------------------------------
// long-term QARP
// ---------------------------------------------------------------------------
export function longTermIdeas(limit = 8) {
  const scored = STOCKS.map((s) => {
    const f = fundamentals(s.symbol);
    const last = f.annual[f.annual.length - 1];
    const qt = quote(s.symbol);
    // QARP score: quality (ROE, FCF, D/E) + growth, penalised by valuation excess
    const roeScore = clamp(last.roe / 25, 0, 1.4);
    const growth = clamp(f.ratios.revCagr3Pct / 18, 0, 1.4);
    const lev = last.debtToEquity === null ? 0.7 : clamp(1 - last.debtToEquity * 0.5, 0, 1);
    const fcfConv = last.fcf === null ? 0.65 : clamp(last.fcf / Math.max(1, last.pat), 0, 1.2);
    const peFair = 14 + last.roe * 0.55 + f.ratios.revCagr3Pct * 0.5;   // heuristic fair multiple
    const valuation = clamp(peFair / Math.max(5, f.ratios.pe), 0.4, 1.6);
    const score = (roeScore * 0.3 + growth * 0.25 + lev * 0.15 + fcfConv * 0.3) * valuation;
    return { s, f, qt, last, score, peFair };
  }).sort((a, b) => b.score - a.score).slice(0, limit);

  return scored.map(({ s, f, qt, last, peFair }) => {
    // expected 2–3y return ≈ earnings compounding + partial multiple mean-reversion
    const rerate = clamp(((peFair / f.ratios.pe) - 1) * 30, -8, 18);
    const upsidePct = clamp(f.ratios.patCagr3Pct * 1.6 + rerate, 12, 48);
    const target = round2(qt.ltp * (1 + upsidePct / 100));
    return {
      symbol: s.symbol, name: s.name, sector: SECTORS[s.sector].name,
      cmp: qt.ltp, target, upsidePct: round1(upsidePct), horizon: upsidePct > 45 ? "3–5 years" : "2–3 years",
      thesis: `${s.name} compounds revenue at ${f.ratios.revCagr3Pct}% with ROE of ${last.roe}%` +
        `${last.debtToEquity !== null ? ` on a ${last.debtToEquity <= 0.3 ? "near debt-free" : "manageably levered"} balance sheet (D/E ${last.debtToEquity}×)` : ""}. ` +
        `At ${f.ratios.pe}× earnings vs a quality-adjusted fair multiple of ~${Math.round(peFair)}×, the risk-reward favours patient accumulation. ` +
        `${last.fcf ? `FCF conversion of ${Math.round((last.fcf / Math.max(1, last.pat)) * 100)}% funds growth without dilution.` : "Regulatory capital ratios remain comfortable."}`,
      metrics: { pe: f.ratios.pe, roe: last.roe, revCagr3: f.ratios.revCagr3Pct, patCagr3: f.ratios.patCagr3Pct },
      style: "QARP", disclaimer: DISCLAIMER,
    };
  });
}

// ---------------------------------------------------------------------------
// swing setups (pattern engine + momentum filter, RR ≥ 2 enforced)
// ---------------------------------------------------------------------------
export function swingSetups() {
  const hits = scanPatterns();
  const out = [];
  for (const h of hits) {
    if (h.riskReward < 2) continue;
    const bars = daily(h.symbol, 80);
    const closes = bars.map((b) => b.close);
    const e20 = emaSeries(closes, 20).at(-1), e50 = emaSeries(closes, 50).at(-1);
    const rsi = rsiSeries(closes, 14).at(-1);
    const alignedBull = h.bias === "BULLISH" && closes.at(-1) > e50 && rsi >= 48 && rsi <= 76;
    const alignedBear = h.bias === "BEARISH" && closes.at(-1) < e20 && rsi <= 52;
    if (!alignedBull && !alignedBear) continue;
    const atr = atrSeries(bars, 14).at(-1);
    out.push({
      symbol: h.symbol, name: h.name, sector: SECTORS[h.sector]?.name, bias: h.bias,
      setup: PATTERN_LABELS[h.pattern], status: h.status, cmp: h.ltp,
      entry: h.entry, target1: h.target1, target2: h.target2, stop: h.stop,
      riskReward: h.riskReward, rsi: Math.round(rsi), atr: round2(atr),
      note: h.status.includes("BREAK")
        ? `Trigger active — ${h.bias === "BULLISH" ? "breakout above" : "breakdown below"} ${h.bias === "BULLISH" ? h.entry : h.entry} with pattern depth ${h.depthPct}%. Trail to breakeven after T1.`
        : `Setup forming — arm alerts at ${h.entry}; enter only on close ${h.bias === "BULLISH" ? "above" : "below"} trigger with volume.`,
      disclaimer: DISCLAIMER,
    });
  }
  return out.sort((a, b) => b.riskReward - a.riskReward).slice(0, 12);
}

// ---------------------------------------------------------------------------
// intraday momentum picks
// ---------------------------------------------------------------------------
export function intradayPicks() {
  const qs = quotes().filter((q) => !q.isIndex);
  const picks = [];
  for (const q of qs) {
    const rangePos = (q.ltp - q.low) / Math.max(0.01, q.high - q.low);   // where in day range
    const stretch = Math.abs(q.changePct);
    if (stretch < 1.2) continue;
    const bull = q.changePct > 0 && rangePos > 0.7;
    const bear = q.changePct < 0 && rangePos < 0.3;
    if (!bull && !bear) continue;
    const bars = daily(q.symbol, 30);
    const atr = atrSeries(bars, 14).at(-1);
    const entry = bull ? round2(q.high * 1.0015) : round2(q.low * 0.9985);
    const stop = bull ? round2(Math.max(q.low, entry - atr * 0.8)) : round2(Math.min(q.high, entry + atr * 0.8));
    const risk = Math.abs(entry - stop);
    const target = bull ? round2(entry + risk * 2) : round2(entry - risk * 2);
    picks.push({
      symbol: q.symbol, name: q.name, bias: bull ? "LONG" : "SHORT", cmp: q.ltp,
      changePct: q.changePct, entry, stop, target, riskReward: 2,
      volumeNote: q.volume > 8_000_000 ? "High participation" : "Normal volume",
      rule: "Risk ≤ 0.5% of capital per trade · exit by 15:15 IST · no averaging against the move",
      disclaimer: DISCLAIMER,
    });
  }
  return picks.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 8);
}

// ---------------------------------------------------------------------------
// HNI options desk
// ---------------------------------------------------------------------------
function findStrikeByDelta(rows, type, targetAbsDelta) {
  let best = null, bestDiff = 1e9;
  for (const r of rows) {
    const d = Math.abs(r[type === "CE" ? "ce" : "pe"].delta);
    const diff = Math.abs(d - targetAbsDelta);
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  }
  return best;
}

function payoffSeries(legs, spot, lot) {
  // legs: [{type:'CE'|'PE'|'FUT', strike, premium, qty(+long/-short)}]
  const pts = [];
  for (let s = spot * 0.88; s <= spot * 1.12; s += spot * 0.004) {
    let pnl = 0;
    for (const l of legs) {
      const intrinsic = l.type === "CE" ? Math.max(0, s - l.strike) : l.type === "PE" ? Math.max(0, l.strike - s) : s - l.strike;
      pnl += l.qty * (intrinsic - (l.type === "FUT" ? 0 : l.premium));
    }
    pts.push({ s: round2(s), pnl: Math.round(pnl * lot) });
  }
  return pts;
}

export function optionsDesk(underlying = "NIFTY") {
  const chain = optionChain(underlying);
  if (!chain) return null;
  const v = vix()?.ltp ?? 14;
  const regime = v < 11 ? "LOW_VOL" : v < 16 ? "NORMAL" : v < 21 ? "ELEVATED" : "STRESSED";
  const { rows, spot, lotSize, expiry } = chain;
  const strategies = [];

  // ---- Iron Condor: sell ~20Δ both sides, buy wings 2 steps further ----
  const scPut = findStrikeByDelta(rows, "PE", 0.20);
  const scCall = findStrikeByDelta(rows, "CE", 0.20);
  const step = chain.step;
  const wingPut = rows.find((r) => r.strike === scPut.strike - 2 * step);
  const wingCall = rows.find((r) => r.strike === scCall.strike + 2 * step);
  if (scPut && scCall && wingPut && wingCall) {
    const credit = scPut.pe.price + scCall.ce.price - wingPut.pe.price - wingCall.ce.price;
    const width = 2 * step;
    const legs = [
      { type: "PE", strike: scPut.strike, premium: scPut.pe.price, qty: -1 },
      { type: "CE", strike: scCall.strike, premium: scCall.ce.price, qty: -1 },
      { type: "PE", strike: wingPut.strike, premium: wingPut.pe.price, qty: 1 },
      { type: "CE", strike: wingCall.strike, premium: wingCall.ce.price, qty: 1 },
    ];
    strategies.push({
      id: "iron_condor", name: "Iron Condor", stance: "Delta-neutral premium capture",
      legs: legs.map((l) => ({ ...l, label: `${l.qty > 0 ? "Buy" : "Sell"} ${l.strike} ${l.type} @ ₹${l.premium}` })),
      credit: round2(credit), creditTotal: Math.round(credit * lotSize),
      maxLoss: Math.round((width - credit) * lotSize),
      breakevens: [round2(scPut.strike - credit), round2(scCall.strike + credit)],
      popPct: Math.round((1 - (Math.abs(scPut.pe.delta) + Math.abs(scCall.ce.delta))) * 100),
      marginApprox: Math.round((width - credit) * lotSize * 1.1),
      payoff: payoffSeries(legs, spot, lotSize),
      when: "Rangebound view; best entered when IV is elevated and expected to compress.",
    });
  }

  // ---- Short Strangle: sell ~15Δ both sides ----
  const ssPut = findStrikeByDelta(rows, "PE", 0.15);
  const ssCall = findStrikeByDelta(rows, "CE", 0.15);
  if (ssPut && ssCall) {
    const credit = ssPut.pe.price + ssCall.ce.price;
    const legs = [
      { type: "PE", strike: ssPut.strike, premium: ssPut.pe.price, qty: -1 },
      { type: "CE", strike: ssCall.strike, premium: ssCall.ce.price, qty: -1 },
    ];
    strategies.push({
      id: "short_strangle", name: "Short Strangle", stance: "Undefined-risk premium selling — HNI margin required",
      legs: legs.map((l) => ({ ...l, label: `Sell ${l.strike} ${l.type} @ ₹${l.premium}` })),
      credit: round2(credit), creditTotal: Math.round(credit * lotSize),
      maxLoss: null, breakevens: [round2(ssPut.strike - credit), round2(ssCall.strike + credit)],
      popPct: Math.round((1 - (Math.abs(ssPut.pe.delta) + Math.abs(ssCall.ce.delta))) * 100),
      marginApprox: Math.round(spot * lotSize * 0.14 * 2 * 0.7),
      payoff: payoffSeries(legs, spot, lotSize),
      when: `Exit at 50% of credit or 2× credit loss. Size ≤ 5% of portfolio margin. Current VIX ${v} → ${regime === "ELEVATED" || regime === "STRESSED" ? "rich premiums, wider strikes advised" : "premiums moderate"}.`,
    });
  }

  // ---- Short Straddle (ATM) ----
  const atmRow = rows.find((r) => r.atm);
  if (atmRow) {
    const credit = atmRow.ce.price + atmRow.pe.price;
    const legs = [
      { type: "CE", strike: atmRow.strike, premium: atmRow.ce.price, qty: -1 },
      { type: "PE", strike: atmRow.strike, premium: atmRow.pe.price, qty: -1 },
    ];
    strategies.push({
      id: "short_straddle", name: "Short Straddle", stance: "Max theta at ATM — expiry-day / event-crush play",
      legs: legs.map((l) => ({ ...l, label: `Sell ${l.strike} ${l.type} @ ₹${l.premium}` })),
      credit: round2(credit), creditTotal: Math.round(credit * lotSize), maxLoss: null,
      breakevens: [round2(atmRow.strike - credit), round2(atmRow.strike + credit)],
      popPct: 55, marginApprox: Math.round(spot * lotSize * 0.16 * 2 * 0.7),
      payoff: payoffSeries(legs, spot, lotSize),
      when: "Requires active delta management; hedge with the underlying beyond ±0.5% drift.",
    });
  }
  return { underlying, spot, expiry, lotSize, vix: v, regime, strategies, disclaimer: DISCLAIMER };
}

/** Covered calls & cash-secured puts on liquid quality stocks. */
export function stockIncomeStrategies(holdingSymbols = []) {
  const candidates = STOCKS.filter((s) => s.fno && s.quality >= 0.78).slice(0, 10);
  const expiry = nextExpiries(1)[0];
  const T = Math.max(7, (Date.parse(expiry) - Date.now()) / DAY + 21) / 365;   // monthly-ish
  const v = (vix()?.ltp ?? 14) / 100;
  const out = { coveredCalls: [], cashSecuredPuts: [], expiryNote: "Monthly series", disclaimer: DISCLAIMER };
  for (const s of candidates) {
    const q0 = quote(s.symbol);
    // single-stock IV runs well above index IV — scale by idiosyncratic vol
    const iv = clamp(v * (1.7 + 2.2 * s.vol), 0.16, 0.6);
    const lot = Math.max(50, Math.round(700000 / q0.ltp / 25) * 25);
    // covered call: ~5% OTM
    const ccK = Math.round((q0.ltp * 1.05) / 10) * 10;
    const cc = blackScholes({ S: q0.ltp, K: ccK, T, iv, type: "CE" });
    out.coveredCalls.push({
      symbol: s.symbol, name: s.name, held: holdingSymbols.includes(s.symbol),
      cmp: q0.ltp, strike: ccK, premium: cc.price, lot,
      yieldPct: round2((cc.price / q0.ltp) * 100),
      annualizedPct: round2((cc.price / q0.ltp) * 12 * 100),
      assignmentReturnPct: round2(((ccK - q0.ltp + cc.price) / q0.ltp) * 100),
      note: holdingSymbols.includes(s.symbol) ? "You hold this — write against existing shares." : "Requires 1 lot of underlying.",
    });
    // cash-secured put: ~5% OTM
    const cspK = Math.round((q0.ltp * 0.95) / 10) * 10;
    const csp = blackScholes({ S: q0.ltp, K: cspK, T, iv, type: "PE" });
    out.cashSecuredPuts.push({
      symbol: s.symbol, name: s.name, cmp: q0.ltp, strike: cspK, premium: csp.price, lot,
      cashRequired: Math.round(cspK * lot),
      yieldOnCashPct: round2((csp.price / cspK) * 100),
      annualizedPct: round2((csp.price / cspK) * 12 * 100),
      effectiveBuyPrice: round2(cspK - csp.price),
      discountToCmpPct: round2(((q0.ltp - (cspK - csp.price)) / q0.ltp) * 100),
      note: "Get paid to set a limit order on a stock you want to own.",
    });
  }
  out.coveredCalls.sort((a, b) => (b.held ? 1 : 0) - (a.held ? 1 : 0) || b.annualizedPct - a.annualizedPct);
  out.cashSecuredPuts.sort((a, b) => b.annualizedPct - a.annualizedPct);
  return out;
}

/** VIX-aware portfolio hedging plan for an equity book. */
export function hedgingPlan(portfolioValue = 10000000, beta = 1.0) {
  const chain = optionChain("NIFTY");
  const v = vix()?.ltp ?? 14;
  const spot = chain.spot, lot = chain.lotSize;
  const notionalPerLot = spot * lot;
  const futLots = Math.round((portfolioValue * beta) / notionalPerLot * 10) / 10;
  const putRow = chain.rows.find((r) => r.strike <= spot * 0.95 && r.strike > spot * 0.93) || chain.rows[4];
  const callRow = chain.rows.find((r) => r.strike >= spot * 1.03 && r.strike < spot * 1.05) || chain.rows[chain.rows.length - 5];
  const putCost = putRow.pe.price * lot * Math.ceil(futLots);
  const callIncome = callRow.ce.price * lot * Math.ceil(futLots);
  const regime = v < 11 ? "LOW_VOL" : v < 16 ? "NORMAL" : v < 21 ? "ELEVATED" : "STRESSED";
  return {
    vix: v, regime, portfolioValue, beta,
    advice: regime === "LOW_VOL"
      ? "Volatility is cheap — buying protection now is efficient. Prefer outright puts over collars."
      : regime === "NORMAL"
        ? "Neutral regime — hedge event windows (budget, elections, Fed) rather than carrying permanent protection."
        : "Volatility is rich — favour collars (short calls fund the puts) or futures over expensive outright puts.",
    strategies: [
      { id: "protective_put", name: `Protective Puts (${putRow.strike} PE)`, lots: Math.ceil(futLots), costTotal: Math.round(putCost), costPctPortfolio: round2((putCost / portfolioValue) * 100), floorsLossAtPct: round2(((spot * 0.95) / spot - 1) * 100 * beta), detail: `Buy ${Math.ceil(futLots)} lot(s) of ${putRow.strike} PE @ ₹${putRow.pe.price} — caps portfolio downside near ${putRow.strike}.` },
      { id: "collar", name: `Zero-cost-ish Collar (${putRow.strike}P / ${callRow.strike}C)`, lots: Math.ceil(futLots), costTotal: Math.round(putCost - callIncome), costPctPortfolio: round2(((putCost - callIncome) / portfolioValue) * 100), detail: `Fund puts by writing ${callRow.strike} CE @ ₹${callRow.ce.price}; upside capped ~${round1((callRow.strike / spot - 1) * 100)}% for the series.` },
      { id: "futures", name: "Index Futures Overlay", lots: futLots, costTotal: 0, detail: `Short ${futLots} NIFTY futures lot(s) (≈₹${Math.round(notionalPerLot / 1000) * 1000 * futLots} notional) to cut beta to ~0. Margin ≈ ₹${Math.round(notionalPerLot * 0.12 * futLots).toLocaleString("en-IN")}. Use for sharp, tactical de-risking.` },
    ],
    disclaimer: DISCLAIMER,
  };
}
