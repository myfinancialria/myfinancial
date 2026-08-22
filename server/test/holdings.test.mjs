import test from "node:test";
import assert from "node:assert/strict";
import { normaliseSchemeName, matchScheme } from "../../scripts/build_holdings.mjs";
import { periodFromName, pickByName } from "../../scripts/amc/index.mjs";

/* ---------------------------------------------------------------------------
   Matching a disclosed PORTFOLIO to an AMFI SCHEME.

   A disclosure names a portfolio; AMFI names a plan. One portfolio backs
   several plans, so the name is the only join available — and a scheme
   attached to the wrong portfolio would publish someone else's holdings under
   this fund's name. Every rule that stops that is pinned here.
--------------------------------------------------------------------------- */

const scheme = (name) => ({ code: name.replace(/\W/g, "").slice(0, 8), name });

test("plan and option words are stripped before comparing", () => {
  assert.equal(
    normaliseSchemeName("Nippon India Growth Fund - Direct Plan - Growth Option"),
    normaliseSchemeName("NIPPON INDIA GROWTH FUND"),
  );
});

test("ampersand and 'and' are the same word", () => {
  assert.equal(
    normaliseSchemeName("Nippon India Banking & Financial Services Fund"),
    normaliseSchemeName("Nippon India Banking and Financial Services Fund"),
  );
});

test("AMFI's segregated-portfolio footnote is not part of the name", () => {
  assert.equal(
    normaliseSchemeName("Nippon India Aggressive Hybrid Fund (Existing Number of Segregated Portfolios - 2)"),
    normaliseSchemeName("Nippon India Aggressive Hybrid Fund"),
  );
});

test("Nippon's risk descriptor is dropped from a disclosed name", () => {
  assert.equal(
    normaliseSchemeName("Nippon India Floater Fund . Relatively High interest rate risk"),
    normaliseSchemeName("Nippon India Floater Fund"),
  );
});

test("an abbreviated disclosure still finds its scheme", () => {
  // "Non-Cycl" in the filing, "Non-Cyclical" at AMFI — the same fund.
  const hit = matchScheme("Groww Nifty Non-Cycl Consumer Index Fund",
    [scheme("Groww Nifty Non-Cyclical Consumer Index Fund"), scheme("Groww Nifty 50 Index Fund")]);
  assert.ok(hit, "should match through the abbreviation");
  assert.match(hit.scheme.name, /Non-Cyclical/);
});

test("an ETF is never handed an index fund's holdings", () => {
  // Same index, different products, different portfolios, one word apart.
  const hit = matchScheme("Groww Nifty India Railways PSU ETF",
    [scheme("Groww Nifty India Railways PSU Index Fund")]);
  assert.equal(hit, null);
});

test("a fund-of-funds is not confused with the fund it feeds on", () => {
  assert.equal(matchScheme("Quantum Nifty 50 ETF FOF", [scheme("Quantum Nifty 50 ETF")]), null);
});

test("a near-miss is refused rather than guessed at", () => {
  // "Growth Fund" and "Growth Mid Cap Fund" are different schemes.
  const hit = matchScheme("Nippon India Growth Mid Cap Fund", [scheme("Nippon India Growth Fund")]);
  assert.equal(hit, null, "must not attach a mid-cap portfolio to the flagship");
});

test("an exact match wins and scores 1", () => {
  const hit = matchScheme("Shriram Flexi Cap Fund",
    [scheme("Shriram Multi Sector Rotation Fund"), scheme("Shriram Flexi Cap Fund - Direct Plan - Growth")]);
  assert.equal(hit.score, 1);
  assert.match(hit.scheme.name, /Flexi Cap/);
});

test("no candidates means no match, not a crash", () => {
  assert.equal(matchScheme("Anything Fund", []), null);
});

/* ------------------------- filing discovery ------------------------------- */
test("a period is read from however the AMC names its file", () => {
  assert.deepEqual(periodFromName("NIMF-MONTHLY-PORTFOLIO-31-July-26.xls"), { date: "2026-07-31", kind: "MONTHLY" });
  assert.deepEqual(periodFromName("NIMF-FORTNIGHTLY-PORTFOLIO-15-Aug-26.xls"), { date: "2026-08-15", kind: "FORTNIGHTLY" });
  assert.deepEqual(periodFromName("Monthly Portfolio- June 30, 2026.xlsx"), { date: "2026-06-30", kind: "MONTHLY" });
  assert.deepEqual(periodFromName("ZN250 - Quarterly Portfolio March 2025.xlsx"), { date: "2025-03-31", kind: "QUARTERLY" });
});

test("a filename with no date is skipped rather than dated today", () => {
  assert.equal(periodFromName("Portfolio.xlsx"), null);
});

test("a month-only filename resolves to that month's end", () => {
  assert.equal(periodFromName("Monthly-Portfolio-Shriram-Mutual-Fund-July-2026.xls").date, "2026-07-31");
  assert.equal(periodFromName("Monthly-Portfolio-Feb-2024.xls").date, "2024-02-29", "leap year");
});

test("non-portfolio disclosures on the same page are ignored", () => {
  const picked = pickByName([
    "https://x/Monthly Portfolio- July 31 2026.xlsx",
    "https://x/Proxy-Voting-Apr-2026.xlsx",
    "https://x/AUM-Disclosure-July-2026.xlsx",
    "https://x/TER-Portfolio-July-2026.xlsx",
  ]);
  assert.equal(picked.length, 1);
  assert.match(picked[0].name, /Monthly Portfolio/);
});

test("filings come back newest first", () => {
  const picked = pickByName([
    "https://x/Monthly Portfolio- May 31, 2026.xlsx",
    "https://x/Monthly Portfolio- July 31 2026.xlsx",
    "https://x/Monthly Portfolio- June 30, 2026.xlsx",
  ]);
  assert.deepEqual(picked.map((p) => p.date), ["2026-07-31", "2026-06-30", "2026-05-31"]);
});
