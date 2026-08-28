import test from "node:test";
import assert from "node:assert/strict";
import { transmission, preMarketArticle, postMarketArticle } from "../../shared/narrative.mjs";

/* ---------------------------------------------------------------------------
   The article is the one part of this site that speaks in sentences, which
   makes it the one part that could assert something untrue. These tests pin
   the two rules that matter: it never forecasts, and it never describes a
   channel that the data did not actually trigger.
--------------------------------------------------------------------------- */

const q = (key, price, pct, extra = {}) => ({ key, price, pct, ...extra });
// A forecast is a claim that a NAMED THING WILL DO SOMETHING — not any use of
// the word "will". The article legitimately says "nothing will trade today" of
// a closed market, and "not what the market will do with it" while explicitly
// refusing to forecast. So the pattern targets the construction, plus the
// advice verbs, and is self-tested below against a planted forecast.
const SUBJECT = "(?:nifty|sensex|market|markets|index|indices|shares?|stocks?|rupee|crude|gold|prices?|it)";
const FORECAST = new RegExp(
  `\\b${SUBJECT}\\s+(?:will|should|is likely to|are likely to|is expected to|are expected to|is going to|may|could)\\s+`
  + `(?:open|close|rise|fall|drop|gain|jump|slide|rally|correct|move|head|trade)\\b`
  + `|\\b(?:we|you)\\s+(?:recommend|suggest|advise)\\b`
  + `|\\btarget price\\b|\\b(?:buy|sell|accumulate)\\s+(?:this|these|the)\\b`,
  "i");

test("the forecast detector actually detects forecasts", () => {
  // Without this the test above could pass by being toothless.
  for (const planted of [
    "The Nifty will open lower this morning.",
    "Markets are likely to fall on the back of weak global cues.",
    "Crude could rise further from here.",
    "We recommend accumulating on dips.",
    "Target price of 2,400 implies 12% upside.",
  ]) assert.ok(FORECAST.test(planted), `should have flagged: ${planted}`);

  for (const fine of [
    "Indian markets are shut today, so nothing below will trade until the next session.",
    "They describe the connection, not what the market will do with it.",
    "Crude is up 3.6%, which widens the import bill.",
  ]) assert.equal(FORECAST.test(fine), false, `should NOT have flagged: ${fine}`);
});

const allText = (secs) => secs.flatMap((s) => [s.heading, s.lead ?? "", ...s.paras]).join(" ");

test("the article never forecasts and never advises", () => {
  const d = {
    forDate: "2026-08-25", marketOpen: true,
    global: [q("S&P 500", 7674, -1.8), q("Nasdaq", 26180, -2.1), q("Dow Jones", 53277, -1.2),
             q("Nikkei 225", 65968, -2.2), q("Hang Seng", 25459, -1.9), q("Kospi", 6683, -3.3)],
    macro: [q("WTI crude", 92.4, 3.6), q("Gold", 4699, 2.1), q("US 10-year", 4.9, 2.8), q("Dollar index", 99.8, 0.9)],
    india: [q("NIFTY 50", 24301, -0.4), q("INDIA VIX", 22.5, 14)],
    corporateActions: [], watchlist: [], news: [],
  };
  const text = allText(preMarketArticle(d));
  const m = text.match(FORECAST);
  assert.equal(m, null, `article must not forecast or advise — found "${m?.[0]}" in: ${text.slice(0, 200)}`);
});

test("a transmission channel only appears when its number actually moved", () => {
  const quiet = transmission({
    global: [q("S&P 500", 7674, 0.1)],
    macro: [q("WTI crude", 85, 0.2), q("Dollar index", 98, 0.05), q("US 10-year", 4.7, 0.1)],
    india: [q("INDIA VIX", 11, 0.2)],
  });
  // Only VIX speaks when nothing moved; it reports a level, not a move.
  assert.deepEqual(quiet.map((c) => c.channel), ["Expected swings"]);
});

test("a big crude move explains the mechanism in both directions", () => {
  const up = transmission({ macro: [q("WTI crude", 95, 4)] })[0];
  assert.equal(up.channel, "Crude oil");
  assert.match(up.text, /import/i, "must say why crude matters to India specifically");

  const down = transmission({ macro: [q("WTI crude", 70, -4)] })[0];
  assert.match(down.text, /fall|smaller|cheaper/i);
  assert.notEqual(up.text, down.text, "direction must change the explanation, not just the number");
});

test("channels describe a route, never an outcome", () => {
  const all = transmission({
    global: [q("S&P 500", 7674, -2), q("Nasdaq", 26180, -2), q("Dow Jones", 53277, -2),
             q("Nikkei 225", 65968, -2), q("Hang Seng", 25459, -2), q("Kospi", 6683, -2)],
    macro: [q("WTI crude", 95, 4), q("Dollar index", 100, 1.2), q("US 10-year", 5, 3), q("Gold", 4800, 2)],
    india: [q("INDIA VIX", 25, 20)],
  });
  assert.ok(all.length >= 5, "a violent night should trigger several channels");
  for (const c of all) assert.equal(c.text.match(FORECAST), null, `"${c.channel}" forecasts: ${c.text}`);
});

test("a closed market is reported as closed, with no session invented", () => {
  const secs = postMarketArticle({
    marketOpen: false, closedReason: "Diwali Laxmi Pujan", lastSession: "2026-11-06",
    indices: [], breadth: null, gainers: [], losers: [], sectors: [], volume: [],
  });
  assert.equal(secs.length, 1);
  assert.match(secs[0].paras[0], /Diwali/);
  assert.match(secs[0].paras[0], /no session/i);
});

test("an index rising while most shares fall is called out, not glossed over", () => {
  const secs = postMarketArticle({
    marketOpen: true, basis: "OFFICIAL",
    indices: [q("NIFTY 50", 24300, 0.8)],
    breadth: { advances: 120, declines: 360, unchanged: 20, ratio: 0.33 },
    gainers: [], losers: [], sectors: [], volume: [],
  });
  const text = allText(secs);
  assert.match(text, /handful of very large companies|carried by/i,
    "a narrow rally is the single most misleading thing an index can do; it must be said");
});

test("a provisional report says the official file has not landed", () => {
  const secs = postMarketArticle({
    marketOpen: true, basis: "PROVISIONAL",
    indices: [q("NIFTY 50", 24300, 0.2)],
    breadth: { advances: 250, declines: 240, unchanged: 10, ratio: 1.04 },
    gainers: [], losers: [], sectors: [], volume: [],
  });
  assert.match(allText(secs), /official file|rebuilds/i);
});

test("the ex-date explanation says the drop is arithmetic", () => {
  const secs = preMarketArticle({
    forDate: "2026-08-25", marketOpen: true, global: [], macro: [], india: [],
    watchlist: [],
    corporateActions: [{ symbol: "ITC", exDate: "25-Aug-2026", exMs: Date.parse("2026-08-25T00:00:00Z"), kind: "DIVIDEND" }],
    news: [],
  });
  const text = allText(secs);
  assert.match(text, /arithmetic|mechanical/i, "readers panic at ex-date gaps; the page must explain them");
});

test("a truncated list reads as a list, not 'B and C and others'", () => {
  const many = ["A", "B", "C", "D", "E", "F", "G", "H"].map((s) => ({
    symbol: s, exDate: "25-Aug-2026", exMs: Date.parse("2026-08-25T00:00:00Z"), kind: "DIVIDEND",
  }));
  const text = allText(preMarketArticle({
    forDate: "2026-08-25", marketOpen: true, global: [], macro: [], india: [],
    watchlist: [], corporateActions: many, news: [],
  }));
  assert.doesNotMatch(text, /\band\s+\w+\s+and others/, "double 'and' before 'and others'");
  assert.match(text, /and others/);
});

test("no section is emitted with nothing in it", () => {
  const secs = preMarketArticle({
    forDate: "2026-08-25", marketOpen: true,
    global: [], macro: [], india: [], corporateActions: [], watchlist: [], news: [],
  });
  for (const s of secs) assert.ok(s.paras.length > 0, `section "${s.heading}" is empty`);
});

test("the same data always produces the same words", () => {
  const d = {
    forDate: "2026-08-25", marketOpen: true,
    global: [q("S&P 500", 7674, -1.2)], macro: [q("WTI crude", 92, 3)],
    india: [q("NIFTY 50", 24301, -0.4)], corporateActions: [], watchlist: [], news: [],
  };
  assert.deepEqual(preMarketArticle(d), preMarketArticle(d));
});
