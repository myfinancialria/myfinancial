import test from "node:test";
import assert from "node:assert/strict";
import { buildNameIndex, tagHeadline, classifyAction } from "../../scripts/lib/insights_sources.mjs";

/* ---------------------------------------------------------------------------
   Putting a company's name against news that is not about it is the worst
   failure this feature can have — worse than tagging nothing. Every rule that
   prevents it is pinned here, using the real headlines that broke it.
--------------------------------------------------------------------------- */

const UNIVERSE = [
  { symbol: "DOLLAR", name: "Dollar Industries Limited" },
  { symbol: "VAISHALI", name: "Vaishali Pharma Limited" },
  { symbol: "PRESTIGE", name: "Prestige Estates Projects Limited" },
  { symbol: "TTKPRESTIG", name: "TTK Prestige Limited" },
  { symbol: "RPOWER", name: "Reliance Power Limited" },
  { symbol: "RELIANCE", name: "Reliance Industries Limited" },
  { symbol: "POWERGRID", name: "Power Grid Corporation of India Limited" },
  { symbol: "IDEA", name: "Vodafone Idea Limited" },
  { symbol: "JBMA", name: "JBM Auto Limited" },
  { symbol: "INFY", name: "Infosys Limited" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp Limited" },
];
const IDX = buildNameIndex(UNIVERSE);
const tag = (t) => tagHeadline(t, IDX).map((h) => h.symbol).sort();

test("a currency is not a company", () => {
  // "Dollar Industries" must not be dragged into every dollar story.
  assert.deepEqual(tag("Taiwan Dollar's August Rebound Is Looking Fragile"), []);
  assert.deepEqual(tag("Hedge Funds Ramp Up Dollar Shorts Ahead of Fiscal Plan"), []);
});

test("a person's name is not a company", () => {
  // Vaishali Parekh is an analyst quoted constantly in Indian market copy.
  assert.deepEqual(tag("Gift Nifty signals gap-up start | Vaishali Parekh recommends these stocks"), []);
});

test("a shared word does not tag both companies", () => {
  // "Prestige Estates" is not TTK Prestige.
  assert.deepEqual(tag("Prestige Estates among top picks by Choice Broking"), ["PRESTIGE"]);
  // "Reliance Industries" is not Reliance Power.
  assert.deepEqual(tag("Stocks to watch: Reliance Industries, IREDA"), ["RELIANCE"]);
});

test("a genuine two-word name is matched", () => {
  assert.deepEqual(tag("JBM Auto among 5 stocks showing bullish RSI upswing"), ["JBMA"]);
  assert.deepEqual(tag("Hero MotoCorp Share Price Live Updates"), ["HEROMOTOCO"]);
  assert.deepEqual(tag("Stocks to watch: Vodafone Idea, Power Grid"), ["IDEA", "POWERGRID"]);
});

test("a genuinely one-word company still matches", () => {
  // The rule is one-word NAME, not a name that reduces to one word.
  assert.deepEqual(tag("Infosys wins large deal in Europe"), ["INFY"]);
});

test("matching is word-bounded, not substring", () => {
  assert.deepEqual(tag("Infosystems Global reports results"), [], "must not match inside a longer word");
});

test("a headline about nothing listed tags nothing", () => {
  assert.deepEqual(tag("RBI holds repo rate steady at 6.5%"), []);
});

test("no more than three companies are tagged to one headline", () => {
  const many = "Stocks to watch: Reliance Industries, Vodafone Idea, Power Grid, JBM Auto, Infosys, Hero MotoCorp";
  assert.ok(tagHeadline(many, IDX).length <= 3);
});

test("the same company is never tagged twice on one headline", () => {
  const hits = tagHeadline("Reliance Industries: Reliance Industries posts results", IDX);
  assert.equal(new Set(hits.map((h) => h.symbol)).size, hits.length);
});

/* --------------------------- corporate actions ---------------------------- */
test("actions are classified by what an investor does about them", () => {
  assert.equal(classifyAction("Dividend - Rs 60 Per Share"), "DIVIDEND");
  assert.equal(classifyAction("Interim Dividend - Rs 2.55 Per Share"), "DIVIDEND");
  assert.equal(classifyAction("Bonus 1:1"), "BONUS");
  assert.equal(classifyAction("Face Value Split From Rs 10 To Rs 2"), "SPLIT");
  assert.equal(classifyAction("Rights 1:4"), "RIGHTS");
  assert.equal(classifyAction("Buy Back of Shares"), "BUYBACK");
  assert.equal(classifyAction("Annual General Meeting"), "OTHER");
  assert.equal(classifyAction(null), "OTHER");
});

test("a bonus issue is not misread as a dividend", () => {
  // Some subjects mention both; the corporate action that changes the share
  // count is the one that matters for a price chart.
  assert.equal(classifyAction("Bonus Issue and Dividend"), "BONUS");
});
