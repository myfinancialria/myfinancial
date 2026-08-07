// ---------------------------------------------------------------------------
// api.js — REST surface for all modules. Thin controllers over the engines.
// ---------------------------------------------------------------------------
import { Router } from "express";
import { q, insert } from "../lib/db.js";
import { issueSession, requireAuth, personas } from "../lib/auth.js";
import { uid } from "../lib/util.js";
import { FX, HOLIDAYS_2026 } from "../data/universe.js";

import * as market from "../engines/market.js";
import * as fundsE from "../engines/funds.js";
import * as tax from "../engines/tax.js";
import * as planning from "../engines/planning.js";
import * as goalsE from "../engines/goals.js";
import * as equity from "../engines/equity.js";
import * as screeners from "../engines/screeners.js";
import * as signals from "../engines/signals.js";
import * as estate from "../engines/estate.js";
import * as vault from "../engines/vault.js";
import * as assistant from "../engines/assistant.js";

export const api = Router();
const ok = (res, data) => res.json({ ok: true, data });
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
};

// ------------------------------- auth ---------------------------------------
api.get("/personas", wrap((req, res) => ok(res, personas())));
api.post("/login", wrap((req, res) => {
  const user = q.one("SELECT * FROM users WHERE id = ?", String(req.body.userId || ""));
  if (!user) return res.status(404).json({ ok: false, error: "Unknown persona" });
  ok(res, { token: issueSession(user.id), user });
}));
api.get("/me", requireAuth, wrap((req, res) => ok(res, { ...req.user, meta: JSON.parse(req.user.meta || "{}") })));

// ------------------------------ market --------------------------------------
api.get("/market/overview", wrap((req, res) => ok(res, {
  status: market.marketStatus(), indices: market.indexQuotes(), vix: market.vix(),
  advanceDecline: market.advanceDecline(),
  movers: { gainers: market.quotes().sort((a, b) => b.changePct - a.changePct).slice(0, 6), losers: market.quotes().sort((a, b) => a.changePct - b.changePct).slice(0, 6) },
})));
api.get("/market/history/:symbol", wrap((req, res) => {
  const { symbol } = req.params;
  const days = Math.min(parseInt(req.query.days || "260", 10), 3000);
  const resolution = req.query.resolution === "1W" ? "1W" : "1D";
  ok(res, { symbol, resolution, bars: resolution === "1W" ? market.weekly(symbol, Math.ceil(days / 5)) : market.daily(symbol, days) });
}));
api.get("/market/quotes", wrap((req, res) => {
  const symbols = req.query.symbols ? String(req.query.symbols).split(",") : null;
  ok(res, market.quotes(symbols));
}));
api.get("/market/optionchain", wrap((req, res) => ok(res, market.optionChain(String(req.query.underlying || "NIFTY"), req.query.expiry || null))));
api.get("/market/futures-activity", wrap((req, res) => ok(res, market.futuresActivity())));
api.get("/market/holidays", wrap((req, res) => ok(res, HOLIDAYS_2026)));
api.get("/fx", wrap((req, res) => ok(res, FX)));

// ----------------------------- planning -------------------------------------
api.get("/plan/networth", requireAuth, wrap((req, res) => ok(res, planning.netWorth(req.user.id))));
api.get("/plan/cashflow", requireAuth, wrap((req, res) => ok(res, planning.cashflow(req.user.id))));
api.get("/plan/ratios", requireAuth, wrap((req, res) => ok(res, planning.ratios(req.user.id))));
api.get("/plan/insurance", requireAuth, wrap((req, res) => ok(res, planning.insuranceAudit(req.user.id))));
api.get("/plan/fema", requireAuth, wrap((req, res) => ok(res, planning.femaGuidelines(req.user))));
api.get("/plan/holdings", requireAuth, wrap((req, res) => ok(res, planning.holdingsValued(req.user.id))));

api.post("/plan/cashflow", requireAuth, wrap((req, res) => {
  const { kind, category, label, monthly } = req.body;
  if (!["INCOME", "EXPENSE"].includes(kind) || !label || !(monthly >= 0)) throw new Error("kind, label, monthly required");
  ok(res, insert("cashflow", { id: uid("cf"), user_id: req.user.id, kind, category: category || "VARIABLE", label: String(label).slice(0, 80), monthly: Number(monthly), meta: "{}" }));
}));
api.delete("/plan/cashflow/:id", requireAuth, wrap((req, res) => { q.run("DELETE FROM cashflow WHERE id = ? AND user_id = ?", req.params.id, req.user.id); ok(res, { deleted: true }); }));

api.post("/plan/asset", requireAuth, wrap((req, res) => {
  const { cls, label, value } = req.body;
  if (!cls || !label || !(value >= 0)) throw new Error("class, label, value required");
  ok(res, insert("assets", { id: uid("as"), user_id: req.user.id, class: cls, label: String(label).slice(0, 80), value: Number(value), meta: "{}" }));
}));
api.delete("/plan/asset/:id", requireAuth, wrap((req, res) => { q.run("DELETE FROM assets WHERE id = ? AND user_id = ?", req.params.id, req.user.id); ok(res, { deleted: true }); }));
api.post("/plan/liability", requireAuth, wrap((req, res) => {
  const { type, label, outstanding, emi, rate, months_left } = req.body;
  if (!type || !label || !(outstanding >= 0)) throw new Error("type, label, outstanding required");
  ok(res, insert("liabilities", { id: uid("lb"), user_id: req.user.id, type, label: String(label).slice(0, 80), outstanding: Number(outstanding), emi: Number(emi || 0), rate: Number(rate || 0), months_left: Number(months_left || 0) }));
}));
api.delete("/plan/liability/:id", requireAuth, wrap((req, res) => { q.run("DELETE FROM liabilities WHERE id = ? AND user_id = ?", req.params.id, req.user.id); ok(res, { deleted: true }); }));

// -------------------------------- tax ----------------------------------------
api.get("/tax/compare", requireAuth, wrap((req, res) => {
  const overrides = { stcgEquity: Number(req.query.stcg || 0), ltcgEquity: Number(req.query.ltcg || 0) };
  const ti = planning.buildTaxInput(req.user.id, overrides);
  const cmp = tax.compare(ti.profile, ti.income, ti.deductions);
  const hv = planning.holdingsValued(req.user.id);
  const unrealizedLtcg = [...hv.mf, ...hv.eq].filter((h) => h.pnl > 0).reduce((a, h) => a + h.pnl, 0) * 0.7;
  const topElss = fundsE.ranked().filter((f) => f.category === "ELSS").sort((a, b) => b.score - a.score)[0]?.name;
  const meta = JSON.parse(req.user.meta || "{}");
  const recs = tax.recommendations(ti.profile, ti.income, ti.deductions, cmp, { unrealizedLtcg, topElss, dtaaCountry: meta.dtaaCountry });
  ok(res, { input: ti, compare: cmp, recommendations: recs, fy: tax.FY });
}));

// ------------------------------- goals ---------------------------------------
const goalRow = (g) => ({ ...g, alloc: JSON.parse(g.alloc) });
api.get("/goals", requireAuth, wrap((req, res) => ok(res, q.all("SELECT * FROM goals WHERE user_id = ?", req.user.id).map(goalRow))));
api.post("/goals", requireAuth, wrap((req, res) => {
  const { name, icon, target_amount, target_year, inflation, current_corpus, monthly_sip, alloc, priority } = req.body;
  if (!name || !(target_amount > 0) || !(target_year > 2025)) throw new Error("name, target_amount, target_year required");
  const g = insert("goals", { id: uid("gl"), user_id: req.user.id, name: String(name).slice(0, 60), icon: icon || "🎯", target_amount: +target_amount, target_year: +target_year, priority: priority || "MEDIUM", inflation: +(inflation ?? 0.06), current_corpus: +(current_corpus || 0), monthly_sip: +(monthly_sip || 0), alloc: JSON.stringify(alloc || { equity: 0.6, debt: 0.3, gold: 0.1 }) });
  ok(res, goalRow(g));
}));
api.put("/goals/:id", requireAuth, wrap((req, res) => {
  const g = q.one("SELECT * FROM goals WHERE id = ? AND user_id = ?", req.params.id, req.user.id);
  if (!g) throw new Error("Goal not found");
  const merged = { ...g, ...req.body, id: g.id, user_id: g.user_id, alloc: JSON.stringify(req.body.alloc ? req.body.alloc : JSON.parse(g.alloc)) };
  ok(res, goalRow(insert("goals", merged)));
}));
api.delete("/goals/:id", requireAuth, wrap((req, res) => { q.run("DELETE FROM goals WHERE id = ? AND user_id = ?", req.params.id, req.user.id); ok(res, { deleted: true }); }));

const toSimInput = (g) => ({ name: g.name, targetAmount: g.target_amount, targetYear: g.target_year, inflation: g.inflation, currentCorpus: g.current_corpus, monthlySip: g.monthly_sip, stepUpPct: 0, alloc: JSON.parse(g.alloc), seed: g.id });
api.get("/goals/:id/simulate", requireAuth, wrap((req, res) => {
  const g = q.one("SELECT * FROM goals WHERE id = ? AND user_id = ?", req.params.id, req.user.id);
  if (!g) throw new Error("Goal not found");
  const sim = goalsE.simulateGoal(toSimInput(g));
  const required = goalsE.requiredSip(toSimInput(g), 75);
  const yearsToGoal = g.target_year - new Date().getFullYear();
  const recommended = goalsE.recommendedAlloc(yearsToGoal, req.user.risk_tolerance === "AGGRESSIVE" ? "AGGRESSIVE" : req.user.risk_tolerance === "CONSERVATIVE" ? "CONSERVATIVE" : "BALANCED");
  const rebalance = goalsE.rebalancePrompt(JSON.parse(g.alloc), recommended);
  ok(res, { goal: goalRow(g), sim, requiredSip: required, recommendedAlloc: recommended, rebalance });
}));
api.post("/goals/simulate-adhoc", requireAuth, wrap((req, res) => {
  const { targetAmount, years, monthlySip, currentCorpus, inflation, alloc, stepUpPct } = req.body;
  const sim = goalsE.simulateGoal({ name: "adhoc", targetAmount: +targetAmount, targetYear: new Date().getFullYear() + +years, inflation: +(inflation ?? 0), currentCorpus: +(currentCorpus || 0), monthlySip: +(monthlySip || 0), stepUpPct: +(stepUpPct || 0), alloc: alloc || { equity: 0.6, debt: 0.3, gold: 0.1 }, seed: "adhoc-ui" });
  ok(res, sim);
}));

// ------------------------------- funds ---------------------------------------
api.get("/funds/meta", wrap((req, res) => ok(res, { amcs: fundsE.AMCS, categories: fundsE.CATEGORIES })));
api.get("/funds/screen", wrap((req, res) => ok(res, fundsE.screen({
  q: req.query.q || "", category: req.query.category || "", amc: req.query.amc || "",
  minAum: Number(req.query.minAum || 0), maxEr: Number(req.query.maxEr || 99),
  minRating: Number(req.query.minRating || 0), sort: req.query.sort || "score", dir: req.query.dir || "desc",
}))));
api.get("/funds/:code", wrap((req, res) => {
  const d = fundsE.fundDetail(req.params.code, Math.min(Number(req.query.years || 10), 10));
  if (!d) return res.status(404).json({ ok: false, error: "Unknown fund" });
  ok(res, d);
}));
api.get("/funds/:code/sip", wrap((req, res) => ok(res, fundsE.sipBacktest(req.params.code, Number(req.query.monthly || 10000), Number(req.query.years || 5)))));

// -------------------------------- robo ---------------------------------------
api.get("/robo/questions", wrap((req, res) => ok(res, fundsE.RISK_QUESTIONS)));
api.post("/robo/profile", requireAuth, wrap((req, res) => {
  const prof = fundsE.riskProfile(req.body.answers || {});
  q.run("UPDATE users SET risk_score = ? WHERE id = ?", prof.score, req.user.id);
  const monthly = Number(req.body.monthly || 25000);
  ok(res, { ...prof, portfolio: fundsE.roboPortfolio(prof.band, monthly) });
}));

// ------------------------------ equities -------------------------------------
api.get("/equity/list", wrap((req, res) => ok(res, equity.listStocks())));
api.get("/equity/:symbol", wrap((req, res) => {
  const page = equity.stockPage(req.params.symbol.toUpperCase());
  if (!page) return res.status(404).json({ ok: false, error: "Unknown symbol" });
  ok(res, page);
}));

// ------------------------------ screeners ------------------------------------
api.get("/screeners/rrg", wrap((req, res) => ok(res, screeners.rrg({ scope: req.query.scope === "stocks" ? "stocks" : "sectors", sector: req.query.sector || null, benchmark: req.query.benchmark || "NIFTY" }))));
api.get("/screeners/patterns", wrap((req, res) => ok(res, screeners.scanPatterns())));
api.get("/screeners/breakouts52w", wrap((req, res) => ok(res, screeners.scan52wBreakouts(Number(req.query.volx || 2)))));
api.get("/screeners/darvas", wrap((req, res) => ok(res, screeners.scanDarvas())));

// ------------------------------- signals -------------------------------------
api.get("/signals/longterm", wrap((req, res) => ok(res, signals.longTermIdeas())));
api.get("/signals/swing", wrap((req, res) => ok(res, signals.swingSetups())));
api.get("/signals/intraday", wrap((req, res) => ok(res, signals.intradayPicks())));
api.get("/signals/options-desk", requireAuth, wrap((req, res) => ok(res, signals.optionsDesk(String(req.query.underlying || "NIFTY")))));
api.get("/signals/income", requireAuth, wrap((req, res) => {
  const held = q.all("SELECT symbol FROM holdings_eq WHERE user_id = ?", req.user.id).map((h) => h.symbol);
  ok(res, signals.stockIncomeStrategies(held));
}));
api.get("/signals/hedging", requireAuth, wrap((req, res) => {
  const hv = planning.holdingsValued(req.user.id);
  const value = Number(req.query.value || hv.eqValue + hv.mfValue * 0.75) || 10000000;
  ok(res, signals.hedgingPlan(value, Number(req.query.beta || 1.05)));
}));

// ------------------------------ estate & vault -------------------------------
api.get("/estate/will", requireAuth, wrap((req, res) => ok(res, estate.getWill(req.user.id))));
api.post("/estate/will", requireAuth, wrap((req, res) => ok(res, estate.saveWill(req.user.id, req.body.data || {}))));
api.get("/estate/checklist", requireAuth, wrap((req, res) => ok(res, estate.estateChecklist(req.user.id))));
api.get("/estate/steps", wrap((req, res) => ok(res, estate.WILL_STEPS)));

api.get("/vault/list", requireAuth, wrap((req, res) => ok(res, { docs: vault.listDocs(req.user.id), categories: vault.VAULT_CATEGORIES })));
api.post("/vault/upload", requireAuth, wrap((req, res) => ok(res, vault.storeDoc(req.user.id, req.body))));
api.get("/vault/doc/:id", requireAuth, wrap((req, res) => {
  const d = vault.readDoc(req.user.id, req.params.id);
  if (!d) return res.status(404).json({ ok: false, error: "Not found" });
  ok(res, d);
}));
api.delete("/vault/doc/:id", requireAuth, wrap((req, res) => ok(res, vault.deleteDoc(req.user.id, req.params.id))));

// ------------------------------ assistant ------------------------------------
api.post("/assistant/ask", requireAuth, wrap(async (req, res) => {
  const question = String(req.body.question || "").slice(0, 600);
  if (!question.trim()) throw new Error("Question required");
  ok(res, await assistant.ask(req.user.id, question));
}));
api.get("/assistant/history", requireAuth, wrap((req, res) => ok(res, assistant.history(req.user.id))));
