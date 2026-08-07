// ---------------------------------------------------------------------------
// assistant.js — Context-Aware Agentic AI Assistant.
//
// Architecture (dual-retrieval RAG + tool grounding):
//   1. RETRIEVE: BM25 over the global knowledge base (SEBI/tax/FEMA docs)
//   2. GROUND:   intent router calls the REAL platform engines (tax compare,
//                Monte Carlo, planner, fund ranker, screeners) on the client's
//                own data — answers quote computed numbers, never guesses
//   3. COMPOSE:  deterministic composer builds the answer with citations;
//                if ANTHROPIC_API_KEY is set, Claude verbalises the same
//                grounded context instead (adapter pattern — same inputs).
// ---------------------------------------------------------------------------
import { KNOWLEDGE } from "../data/knowledge.js";
import { q, insert } from "../lib/db.js";
import { uid, round2 } from "../lib/util.js";
import * as tax from "./tax.js";
import * as planning from "./planning.js";
import * as goalsEngine from "./goals.js";
import * as funds from "./funds.js";
import * as market from "./market.js";
import * as signals from "./signals.js";
import { STOCK_MAP, STOCKS, FUND_MAP } from "../data/universe.js";

// ------------------------------ BM25 index ---------------------------------
const tokenize = (s) => String(s).toLowerCase().replace(/[^a-z0-9₹%&\s-]/g, " ").split(/[\s-]+/).filter((t) => t.length > 1);

const INDEX = (() => {
  const docs = KNOWLEDGE.map((d) => ({ ...d, tokens: tokenize(`${d.title} ${d.tags.join(" ")} ${d.text}`) }));
  const df = new Map();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.tokens.length, 0) / docs.length;
  return { docs, df, avgLen, N: docs.length };
})();

export function retrieve(query, k = 3) {
  const qTokens = tokenize(query);
  const K1 = 1.4, B = 0.75;
  const scores = INDEX.docs.map((d) => {
    const tf = new Map();
    for (const t of d.tokens) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const t of new Set(qTokens)) {
      const f = tf.get(t) || 0;
      if (!f) continue;
      const idf = Math.log(1 + (INDEX.N - (INDEX.df.get(t) || 0) + 0.5) / ((INDEX.df.get(t) || 0) + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (d.tokens.length / INDEX.avgLen))));
    }
    return { doc: d, score };
  }).filter((x) => x.score > 1.2).sort((a, b) => b.score - a.score).slice(0, k);
  return scores.map((s) => ({ id: s.doc.id, title: s.doc.title, snippet: s.doc.text.slice(0, 320) + "…", score: round2(s.score) }));
}

// --------------------------- client context --------------------------------
function clientContext(userId) {
  const user = q.one("SELECT * FROM users WHERE id = ?", userId);
  if (!user) return null;
  const nw = planning.netWorth(userId);
  const cf = planning.cashflow(userId);
  const rt = planning.ratios(userId);
  const goals = q.all("SELECT * FROM goals WHERE user_id = ?", userId);
  return { user, nw, cf, rt, goals };
}

const INR = (x) => "₹" + Math.round(x).toLocaleString("en-IN");
const CR = (x) => (Math.abs(x) >= 1e7 ? `₹${(x / 1e7).toFixed(2)} Cr` : Math.abs(x) >= 1e5 ? `₹${(x / 1e5).toFixed(1)} L` : INR(x));

// ------------------------------ intents ------------------------------------
const parseAmount = (text) => {
  const m = text.match(/₹?\s*([\d.]+)\s*(crore|cr|lakh|lac|l\b|k\b)?/i);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const unit = (m[2] || "").toLowerCase();
  if (unit.startsWith("cr")) v *= 1e7;
  else if (unit.startsWith("l")) v *= 1e5;
  else if (unit === "k") v *= 1e3;
  else if (v < 100) v *= 1e7; // "5 crore" implied when tiny bare number with goal phrasing
  return v;
};
const parseYears = (text) => {
  const m = text.match(/(\d{1,2})\s*(?:years?|yrs?|साल)/i);
  return m ? parseInt(m[1], 10) : null;
};

function goalIntent(userId, text, ctx) {
  const amount = /(₹|\bcr|crore|lakh|lac)/i.test(text) ? parseAmount(text) : null;
  const years = parseYears(text);
  let goal = ctx.goals.find((g) => text.toLowerCase().includes(g.name.toLowerCase().split(" ")[0].toLowerCase()) && g.name.length > 3);
  if (!goal && !amount) goal = ctx.goals.find((g) => /retire/i.test(text) && /retire/i.test(g.name));

  let simInput, label;
  if (amount && years) {
    const sipMatch = text.match(/sip[s]?\s*(?:of\s*)?₹?\s*([\d,.]+)\s*(k|l|lakh)?/i);
    let sip = ctx.goals.reduce((a, g) => a + g.monthly_sip, 0) || 50000;
    if (sipMatch) { sip = parseFloat(sipMatch[1].replace(/,/g, "")); if ((sipMatch[2] || "").toLowerCase().startsWith("l")) sip *= 1e5; if ((sipMatch[2] || "").toLowerCase() === "k") sip *= 1e3; }
    simInput = { name: "adhoc", targetAmount: amount, targetYear: new Date().getFullYear() + years, inflation: 0, currentCorpus: 0, monthlySip: sip, alloc: { equity: 0.65, debt: 0.25, gold: 0.1 }, seed: `adhoc:${amount}:${years}` };
    label = `${CR(amount)} in ${years} years with SIPs of ${INR(sip)}/month`;
  } else if (goal) {
    simInput = { name: goal.name, targetAmount: goal.target_amount, targetYear: goal.target_year, inflation: goal.inflation, currentCorpus: goal.current_corpus, monthlySip: goal.monthly_sip, alloc: JSON.parse(goal.alloc), seed: goal.id };
    label = `your "${goal.name}" goal (${CR(goal.target_amount)} today-cost by ${goal.target_year})`;
  } else return null;

  const sim = goalsEngine.simulateGoal(simInput, { wantBands: false });
  const req = goalsEngine.requiredSip(simInput, 75);
  const verdictText = { ACHIEVABLE: "on track", AT_RISK: "at risk", UNREALISTIC: "not on track" }[sim.verdict];
  return {
    computed: { type: "goal", sim, requiredSip: req },
    answer: `**Feasibility check — ${label}**\n\nRunning 2,000 Monte Carlo market paths on a ${Math.round(sim.alloc.equity * 100)}/${Math.round(sim.alloc.debt * 100)}/${Math.round(sim.alloc.gold * 100)} equity/debt/gold mix:\n\n- **Goal Feasibility Index: ${sim.feasibility}%** → **${sim.verdict.replace("_", " ")}** (${verdictText})\n- Target (inflation-adjusted): **${CR(sim.target)}** in ${sim.years} years${simInput.inflation ? ` (${(simInput.inflation * 100).toFixed(1)}% inflation on today's ${CR(sim.targetToday)})` : ""}\n- Median projected corpus: **${CR(sim.median)}** · pessimistic (P10): ${CR(sim.p10)} · optimistic (P90): ${CR(sim.p90)}\n${sim.feasibility < 75 ? `- To reach **75% confidence**, the required SIP is **${INR(req)}/month**${simInput.monthlySip ? ` (vs ${INR(simInput.monthlySip)} now — a gap of ${INR(Math.max(0, req - simInput.monthlySip))})` : ""}. Alternatives: extend the timeline, trim the target, or step up SIPs 10% annually.` : `- You're comfortably placed — consider de-risking the last 3 years toward debt (glide path) to protect the outcome.`}`,
    kbQuery: "goal monte carlo feasibility sip",
  };
}

function taxIntent(userId, text, ctx) {
  const ti = planning.buildTaxInput(userId);
  const cmp = tax.compare(ti.profile, ti.income, ti.deductions);
  const homeLoanAngle = /home\s*loan|24\s*\(?b\)?|interest/i.test(text);
  const rows = (r) => `slab ₹${(r.tax.slab).toLocaleString("en-IN")}${r.tax.rebate87A ? ` − 87A rebate ₹${r.tax.rebate87A.toLocaleString("en-IN")}` : ""} + STCG ₹${r.tax.stcg.toLocaleString("en-IN")} + LTCG ₹${r.tax.ltcg.toLocaleString("en-IN")}${r.tax.surcharge ? ` + surcharge ₹${r.tax.surcharge.toLocaleString("en-IN")}` : ""} + cess ₹${r.tax.cess.toLocaleString("en-IN")}`;
  let extra = "";
  if (homeLoanAngle) {
    extra = `\n\n**Home-loan angle:** in the NEW regime, self-occupied home-loan interest gets **no deduction**; your ledger shows interest of ~${INR(ti.deductions.homeLoanInterest)} this year${ti.income.rentalAnnual ? `, and since you have rental income, interest remains deductible against rent in both regimes (loss set-off differs)` : ""}. That deduction is a key reason the OLD regime ${cmp.better === "OLD" ? "wins" : "still loses"} for you this year.`;
  }
  return {
    computed: { type: "tax", cmp },
    answer: `**${tax.FY} — regime comparison on your actual ledger** (${ctx.user.residency === "NRI" ? "NRI computation: foreign salary excluded, NRE interest exempt, no 87A rebate" : "resident computation"}):\n\n| | NEW regime | OLD regime |\n|---|---|---|\n| Taxable slab income | ${INR(cmp.NEW.slabIncome)} | ${INR(cmp.OLD.slabIncome)} |\n| Total tax | **${INR(cmp.NEW.tax.total)}** | **${INR(cmp.OLD.tax.total)}** |\n| Effective rate | ${cmp.NEW.effectiveRatePct}% | ${cmp.OLD.effectiveRatePct}% |\n\n**Verdict: the ${cmp.better} regime saves you ${INR(cmp.savings)}** this year.\n\n- NEW: ${rows(cmp.NEW)}\n- OLD: ${rows(cmp.OLD)} (after ${INR(cmp.OLD.deductionsTotal)} of deductions)${extra}`,
    kbQuery: homeLoanAngle ? "home loan tax regime 24b" : "new old tax regime slabs",
  };
}

function netWorthIntent(userId, text, ctx) {
  const { nw, rt, cf } = ctx;
  return {
    computed: { type: "networth" },
    answer: `**Your balance sheet right now** (live-valued):\n\n- **Net worth: ${CR(nw.netWorth)}** — assets ${CR(nw.totalAssets)} minus liabilities ${CR(nw.totalLiabilities)}\n- Investable allocation: **${Math.round(nw.allocation.equity * 100)}% equity / ${Math.round(nw.allocation.debt * 100)}% debt / ${Math.round(nw.allocation.gold * 100)}% gold**\n- Monthly surplus: ${INR(cf.surplus)} (savings rate ${cf.savingsRatePct}%)\n- Debt-to-income: **${rt.dtiPct}%** (${rt.dtiVerdict.toLowerCase()}) · emergency runway **${rt.emergencyMonths} months** ${rt.emergencyMonths >= 6 ? "✓" : "— below the 6-month floor; top up liquid funds first"}\n- Holdings marked to market: MF ${CR(nw.holdings.mfValue)} · direct equity ${CR(nw.holdings.eqValue)}`,
    kbQuery: "asset allocation emergency fund",
  };
}

function fundIntent(userId, text) {
  const catMap = { "large": "LARGE", "mid": "MID", "small": "SMALL", "flexi": "FLEXI", "elss": "ELSS", "tax saver": "ELSS", "index": "INDEX", "hybrid": "HYBRID", "debt": "DEBT", "liquid": "LIQUID", "gold": "GOLD" };
  let cat = null;
  for (const k of Object.keys(catMap)) if (text.toLowerCase().includes(k)) { cat = catMap[k]; break; }
  const list = funds.ranked().filter((f) => !cat || f.category === cat).sort((a, b) => b.score - a.score).slice(0, 3);
  if (!list.length) return null;
  return {
    computed: { type: "funds", picks: list.map((f) => f.code) },
    answer: `**Top-ranked ${cat ? list[0].categoryName : "funds across categories"}** by the platform's multi-factor model (Sharpe·Sortino·alpha·rolling-consistency·cost):\n\n${list.map((f, i) => `${i + 1}. **${f.name}** — ${f.rating}★, 3Y ${f.returns["3Y"]}% CAGR, Sharpe ${f.sharpe}, alpha ${f.alpha ?? "—"}%, ER ${f.expenseRatio}% (direct)`).join("\n")}\n\nRankings are within-category and re-compute as NAVs update. Direct plans only — zero commission. Past returns don't guarantee future results.`,
    kbQuery: "mutual fund metrics sharpe alpha direct",
  };
}

function stockIntent(userId, text) {
  const words = text.toUpperCase().split(/[^A-Z&-]+/);
  let sym = words.find((w) => STOCK_MAP[w]);
  if (!sym) {
    const byName = STOCKS.find((s) => text.toLowerCase().includes(s.name.toLowerCase().split(" ")[0].toLowerCase()) && s.name.split(" ")[0].length > 3);
    sym = byName?.symbol;
  }
  if (!sym) return null;
  const f = market.fundamentals(sym);
  const qt = market.quote(sym);
  const last = f.annual[f.annual.length - 1];
  return {
    computed: { type: "stock", symbol: sym },
    answer: `**${STOCK_MAP[sym].name} (${sym})** — ₹${qt.ltp.toLocaleString("en-IN")} (${qt.changePct >= 0 ? "+" : ""}${qt.changePct}% today)\n\n- Revenue CAGR (3Y) **${f.ratios.revCagr3Pct}%**, PAT CAGR **${f.ratios.patCagr3Pct}%**, ROE **${last.roe}%**${last.roce ? `, ROCE ${last.roce}%` : ""}\n- Valuation: **${f.ratios.pe}× P/E**, ${f.ratios.pb}× P/B${f.ratios.evEbitda ? `, EV/EBITDA ${f.ratios.evEbitda}×` : ""} · 52-week range ₹${qt.week52Low}–₹${qt.week52High}\n- ${last.debtToEquity !== null ? `Debt/Equity ${last.debtToEquity}×` : "Bank/NBFC — leverage per regulatory norms"} · FY26 PAT margin ${last.patMarginPct}%\n\nOpen the full page (AI summary, SWOT, peer comps) under **Equities → ${sym}**. This is information, not a recommendation to buy or sell.`,
    kbQuery: "glossary valuation",
  };
}

function optionsIntent(userId, text) {
  const desk = signals.optionsDesk("NIFTY");
  const ic = desk.strategies.find((s) => s.id === "iron_condor");
  return {
    computed: { type: "options" },
    answer: `**Options income desk — NIFTY ${desk.expiry}** (spot ${desk.spot.toLocaleString("en-IN")}, India VIX ${desk.vix} → ${desk.regime.replace("_", " ").toLowerCase()} regime):\n\n${desk.strategies.map((s) => `- **${s.name}**: credit ${INR(s.creditTotal)}/lot${s.maxLoss ? `, max loss ${INR(s.maxLoss)}` : " (undefined risk)"}, POP ≈${s.popPct}%, breakevens ${s.breakevens.map((b) => b.toLocaleString("en-IN")).join(" / ")}`).join("\n")}\n\n${ic ? `The defined-risk iron condor is the standard starting point: ${ic.legs.map((l) => l.label).join("; ")}.` : ""} Full payoff diagrams and covered-call/CSP screens are in **Advisory → HNI Options Desk**.\n\n⚠️ ${signals.DISCLAIMER}`,
    kbQuery: "options selling iron condor strangle risk",
  };
}

function harvestIntent(userId, text, ctx) {
  const hv = planning.holdingsValued(userId);
  const unrealized = [...hv.mf, ...hv.eq].filter((h) => h.pnl > 0).reduce((a, h) => a + h.pnl, 0);
  const room = 125000;
  const usable = Math.min(room, unrealized);
  return {
    computed: { type: "harvest", unrealized },
    answer: `**LTCG harvesting check:** you carry roughly **${CR(unrealized)}** of unrealised gains across MF + equity holdings (long-term portions qualify).\n\n- Every FY, the first **₹1.25 lakh** of equity LTCG is tax-free u/s 112A.\n- Harvesting ${INR(usable)} now and repurchasing resets your cost basis — saving **${INR(Math.round(usable * 0.125))}** of future 12.5% LTCG tax, at zero tax cost today.\n- Mind exit loads (<1 yr on some funds), the 1-day settlement gap on repurchase, and don't harvest positions held <12 months (those would be STCG at 20%).`,
    kbQuery: "ltcg harvesting capital gains 1.25 lakh",
  };
}

function nriIntent(userId, text, ctx) {
  if (ctx.user.residency !== "NRI" && !/nri|nre|nro|repatriat|dtaa|fema/i.test(text)) return null;
  const fema = planning.femaGuidelines(ctx.user) || { rules: [] };
  const relevant = fema.rules.filter((r) => text.toLowerCase().match(/repatriat|remit|transfer|send/) ? /NRO|NRE/.test(r.title) : true).slice(0, 3);
  return {
    computed: { type: "nri" },
    answer: `**NRI compliance snapshot${ctx.user.residency === "NRI" ? ` for ${ctx.user.name}` : ""}:**\n\n${relevant.map((r) => `- **${r.title}** — ${r.body}`).join("\n")}\n\nThe full FEMA panel (accounts, PIS, property, DTAA with ${JSON.parse(ctx.user.meta || "{}").dtaaCountry || "your residence country"}) lives under **Planning → NRI & FEMA**.`,
    kbQuery: "nri nre nro dtaa fema repatriation",
  };
}

// ------------------------------ router -------------------------------------
const ROUTES = [
  { test: (t) => /(achieve|reach|feasib|on track|enough|goal|retire|crore in \d|₹.*in \d+ ?y)/i.test(t) && /\d|goal|retire/i.test(t), fn: goalIntent },
  { test: (t) => /(regime|how much tax|tax liab|income tax|tax impact|tax.*home loan|home loan.*tax)/i.test(t), fn: taxIntent },
  { test: (t) => /(harvest|1\.25|ltcg.*free|tax.*gains)/i.test(t), fn: harvestIntent },
  { test: (t) => /(net ?worth|balance sheet|asset alloc|how am i doing|financial health|portfolio summary)/i.test(t), fn: netWorthIntent },
  { test: (t) => /(fund|elss|sip.*(which|best)|large cap|mid cap|small cap|flexi|index fund)/i.test(t), fn: fundIntent },
  { test: (t) => /(condor|strangle|straddle|covered call|cash.?secured|option|hedge|hedging)/i.test(t), fn: optionsIntent },
  { test: (t) => /(nre|nro|repatriat|dtaa|fema|rnor|remit)/i.test(t), fn: nriIntent },
  { test: (t) => /[A-Z]{2,}/.test(t) || /(stock|share|analysis of|fundamentals)/i.test(t), fn: stockIntent },
];

export async function ask(userId, question) {
  const ctx = clientContext(userId);
  if (!ctx) throw new Error("Unknown user");
  let result = null;
  for (const r of ROUTES) {
    if (r.test(question)) {
      try { result = r.fn(userId, question, ctx); } catch { result = null; }
      if (result) break;
    }
  }
  const citations = retrieve(result?.kbQuery || question, 3);

  let answer;
  if (result) {
    answer = result.answer;
  } else if (citations.length) {
    const top = KNOWLEDGE.find((k) => k.id === citations[0].id);
    answer = `**${top.title}**\n\n${top.text}\n\n_Want this applied to your own numbers? Ask e.g. “Which tax regime saves me more?” or “Can I reach my retirement goal?” — I'll run the platform engines on your data._`;
  } else {
    answer = `I can help with goal feasibility (Monte Carlo on your SIPs), old-vs-new tax regime on your actual ledger, fund rankings, stock fundamentals, options income strategies, and NRI/FEMA rules. Try: _“Can I achieve ₹5 crore in 12 years with my current SIPs?”_`;
  }

  // Optional LLM verbalisation layer (same grounded context, nicer prose)
  const llm = await maybeLLM(question, answer, citations, ctx);
  if (llm) answer = llm;

  const response = {
    answer,
    citations,
    grounded: !!result,
    computedType: result?.computed?.type || null,
    disclaimer: "AI-generated information from your data + the platform knowledge base — not SEBI-registered investment advice.",
    followups: suggestFollowups(result?.computed?.type, ctx),
  };
  insert("chat_history", { id: uid("ch"), user_id: userId, role: "user", content: question, meta: "{}", created: Date.now() });
  insert("chat_history", { id: uid("ch"), user_id: userId, role: "assistant", content: answer, meta: JSON.stringify({ citations: citations.map((c) => c.id), type: response.computedType }), created: Date.now() });
  return response;
}

function suggestFollowups(type, ctx) {
  const base = {
    goal: ["What SIP do I need for 90% confidence?", "Show my other goals' feasibility", "How should the allocation change near the goal?"],
    tax: ["How can I reduce this further?", "What if I harvest ₹1.25L of LTCG?", "Explain the home-loan impact on regimes"],
    networth: ["Is my asset allocation right for my goals?", "Do I need to rebalance?", "Check my insurance gaps"],
    funds: ["Compare these funds' rolling returns", "Build me a robo portfolio", "What's the SIP tax treatment?"],
    stock: ["Show the SWOT analysis", "How does it compare to peers?", "Any swing setups on it?"],
    options: ["Build a hedging plan for my portfolio", "Covered calls on my holdings", "Explain iron condor risk"],
    harvest: ["Run my regime comparison", "Which holdings qualify as long-term?"],
    nri: ["Can I repatriate my NRO balance?", "How does DTAA cut my TDS?", "What happens when I return to India?"],
  }[type];
  return base || ["Which tax regime saves me more?", `Can I achieve ${ctx.goals[0] ? `my ${ctx.goals[0].name}` : "₹5 crore in 12 years"}?`, "Best flexi cap funds", "Hedge my portfolio"];
}

export function history(userId, limit = 40) {
  return q.all("SELECT role, content, meta, created FROM chat_history WHERE user_id = ? ORDER BY created DESC LIMIT ?", userId, limit).reverse();
}

// ----------------------- optional Claude adapter ----------------------------
async function maybeLLM(question, groundedAnswer, citations, ctx) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.MYFIN_LLM_MODEL || "claude-sonnet-5",
        max_tokens: 700,
        system: "You are myfinancial's assistant for Indian & NRI investors. Rewrite the grounded draft answer into clear, warm, precise prose. NEVER change any number, verdict or regulatory claim in the draft. Keep markdown tables/lists where they aid scanning. End with the one-line disclaimer from the draft if present. Do not add recommendations beyond the draft.",
        messages: [{ role: "user", content: `Client: ${ctx.user.name} (${ctx.user.residency}).\nQuestion: ${question}\n\nGrounded draft (source of truth):\n${groundedAnswer}\n\nKnowledge citations:\n${citations.map((c) => `- ${c.title}: ${c.snippet}`).join("\n")}` }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.content?.[0]?.text || null;
  } catch {
    return null; // deterministic composer already produced a full answer
  }
}
