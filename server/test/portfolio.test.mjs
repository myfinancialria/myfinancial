import test from "node:test";
import assert from "node:assert/strict";
import { parseSheet, validate, parseAsOn, classifySection, parseWorkbook } from "../../scripts/lib/portfolio.mjs";
import { commonHoldings, overlapPct, overlapMatrix, heldAcross, portfolioDuplication } from "../../shared/overlap.mjs";

/* ---------------------------------------------------------------------------
   The disclosure format has two traps, both of which bit on the first run
   against a real AMC file. Both are pinned here.
--------------------------------------------------------------------------- */

const HEADER = [null, "ISIN", "Name of Instrument", "Rating/Industry", "Quantity", "Market Value (In Rs. lakh)", "% To Net Assets", "Maturity Date"];

/** A sheet in the real shape: title, as-on, header, sections, totals. */
const sheet = (rows) => [
  ["EH", "IB03-Example Equity Fund", null, null, null, null, null, null],
  [null, "Portfolio as on 31-JUL-2026", null, null, null, null, null, null],
  HEADER,
  ...rows,
];
const hold = (isin, name, industry, pct) => [null, isin, name, industry, 100, 250.5, pct, null];

test("the % column is read as a fraction, not a percentage", () => {
  const p = parseSheet(sheet([
    [null, null, "EQUITY & EQUITY RELATED", null, null, null, null, null],
    [null, null, "(a) Listed / awaiting listing on the stock exchanges", null, null, null, null, null],
    hold("INE040A01034", "HDFC Bank Limited", "Banks", 0.0822),
    [null, null, "Grand Total", null, null, null, 1, null],
  ]));
  // 0.0822 in the file means 8.22% of net assets.
  assert.equal(p.scale, 100, "Grand Total of 1 means the column is fractions");
  assert.equal(Math.round(p.holdings[0].pct * 100) / 100, 8.22);
});

test("a sub-heading does not steal holdings from its major section", () => {
  // This is the bug that reported 0% equity for a 66-holding equity fund:
  // "(a) Listed / awaiting listing..." was overwriting the EQUITY section.
  const p = parseSheet(sheet([
    [null, null, "EQUITY & EQUITY RELATED", null, null, null, null, null],
    [null, null, "(a) Listed / awaiting listing on the stock exchanges", null, null, null, null, null],
    hold("INE040A01034", "HDFC Bank Limited", "Banks", 0.5),
    [null, null, "(b) Unlisted", null, null, null, "NIL", null],
    [null, null, "DEBT INSTRUMENTS", null, null, null, null, null],
    [null, null, "(a) Listed / awaiting listing on Stock Exchanges", null, null, null, null, null],
    hold("INE001A07TU4", "Some NCD", "CRISIL AAA", 0.5),
    [null, null, "Grand Total", null, null, null, 1, null],
  ]));
  assert.equal(p.holdings[0].section, "EQUITY");
  assert.equal(p.holdings[1].section, "DEBT");
});

test("classifySection ignores sub-headings and recognises major ones", () => {
  assert.equal(classifySection("(a) Listed / awaiting listing on the stock exchanges"), null);
  assert.equal(classifySection("(b) Unlisted"), null);
  assert.equal(classifySection("EQUITY & EQUITY RELATED"), "EQUITY");
  assert.equal(classifySection("DEBT INSTRUMENTS"), "DEBT");
  assert.equal(classifySection("MONEY MARKET INSTRUMENTS"), "MONEY_MARKET");
  assert.equal(classifySection("Cash & Cash Equivalents"), "CASH");
});

test("a fund over 100% invested against a negative payable is accepted", () => {
  // Groww's Smallcap 250 Momentum index fund really is 103.45% invested with
  // a -3.45% net receivable, grand-totalling to exactly 1. Rejecting that was
  // a bug in the validator, not a problem with the disclosure.
  const p = parseSheet(sheet([
    [null, null, "EQUITY & EQUITY RELATED", null, null, null, null, null],
    hold("INE040A01034", "HDFC Bank Limited", "Banks", 1.0345),
    [null, null, "Cash & Cash Equivalents", null, null, null, null, null],
    [null, null, "Net Receivable/Payable", null, null, null, -0.0345, null],
    [null, null, "Grand Total", null, null, null, 1, null],
  ]));
  assert.ok(validate(p).ok, validate(p).problems.join("; "));
});

test("a file quoting percentages is read as percentages, not rescaled", () => {
  // Shriram files Grand Total 100 with HDFC Bank at 7.14; Groww and Nippon
  // file Grand Total 1 with the same idea expressed as 0.0714. Both are valid
  // readings of "% to Net Assets" and only the Grand Total says which is meant,
  // so the convention is detected rather than assumed in either direction.
  const p = parseSheet(sheet([
    [null, null, "EQUITY & EQUITY RELATED", null, null, null, null, null],
    hold("INE040A01034", "HDFC Bank Ltd.", "Banks", 7.14),
    [null, null, "Grand Total", null, null, null, 100, null],
  ]));
  assert.equal(p.scale, 1, "already percentages");
  assert.equal(p.holdings[0].pct, 7.14);
  assert.ok(validate(p).ok);
});

test("a Grand Total that is neither 1 nor 100 is refused, not guessed at", () => {
  const p = parseSheet(sheet([
    [null, null, "EQUITY & EQUITY RELATED", null, null, null, null, null],
    hold("INE040A01034", "HDFC Bank Limited", "Banks", 5),
    [null, null, "Grand Total", null, null, null, 7.5, null],
  ]));
  assert.equal(p.scale, null);
  const v = validate(p);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(" "), /weight convention is unknown/);
});

test("nothing below the Grand Total is read as a holding", () => {
  const p = parseSheet(sheet([
    [null, null, "EQUITY & EQUITY RELATED", null, null, null, null, null],
    hold("INE040A01034", "HDFC Bank Limited", "Banks", 1),
    [null, null, "Grand Total", null, null, null, 1, null],
    [null, "INE009A01021", "Infosys Limited", "IT", 1, 1, 0.5, null],   // trailing junk
  ]));
  assert.equal(p.holdings.length, 1);
});

test("the as-on date is normalised to ISO", () => {
  assert.equal(parseAsOn("Portfolio as on 31-JUL-2026"), "2026-07-31");
  assert.equal(parseAsOn("Portfolio as on 5-Jan-2026"), "2026-01-05");
  assert.equal(parseAsOn("nothing here"), null);
});

test("a workbook reports what it skipped rather than dropping it silently", () => {
  const good = sheet([
    [null, null, "EQUITY & EQUITY RELATED", null, null, null, null, null],
    hold("INE040A01034", "HDFC Bank Limited", "Banks", 1),
    [null, null, "Grand Total", null, null, null, 1, null],
  ]);
  const { schemes, skipped } = parseWorkbook([["EH", good], ["Version", [["v1.0"]]]]);
  assert.equal(schemes.length, 1);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].sheet, "Version");
});

/* ------------------------------- overlap ---------------------------------- */
const fund = (name, hs) => ({ schemeName: name, holdings: hs.map(([isin, n, pct]) => ({ isin, name: n, pct })) });

const A = fund("A", [["IN1", "HDFC Bank", 8], ["IN2", "ICICI Bank", 5], ["IN3", "Infosys", 4]]);
const B = fund("B", [["IN1", "HDFC Bank", 5], ["IN2", "ICICI Bank", 6], ["IN4", "TCS", 3]]);

test("overlap takes the SMALLER weight, never the sum", () => {
  const common = commonHoldings(A, B);
  assert.equal(common.length, 2);
  const hdfc = common.find((c) => c.isin === "IN1");
  assert.equal(hdfc.a, 8);
  assert.equal(hdfc.b, 5);
  assert.equal(hdfc.shared, 5, "8% and 5% duplicate 5%, not 13% and not 8%");
  assert.equal(overlapPct(A, B), 10);   // min(8,5) + min(5,6)
});

test("overlap is symmetric", () => {
  assert.equal(overlapPct(A, B), overlapPct(B, A));
});

test("a fund overlaps itself completely, and a disjoint fund not at all", () => {
  assert.equal(Math.round(overlapPct(A, A)), 17);   // its own invested total
  const Z = fund("Z", [["IN9", "Other", 10]]);
  assert.equal(overlapPct(A, Z), 0);
  assert.deepEqual(commonHoldings(A, Z), []);
});

test("the same ISIN listed twice is one exposure, summed", () => {
  const D = fund("D", [["IN1", "HDFC Bank", 3], ["IN1", "HDFC Bank", 2]]);
  assert.equal(commonHoldings(D, fund("E", [["IN1", "HDFC Bank", 10]]))[0].a, 5);
});

test("the pairwise matrix is symmetric with a full diagonal", () => {
  const { matrix, pairs } = overlapMatrix([A, B]);
  assert.equal(matrix[0][0], 100);
  assert.equal(matrix[0][1], matrix[1][0]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].pct, 10);
});

test("heldAcross counts how many schemes hold each name", () => {
  const rows = heldAcross([A, B]);
  const hdfc = rows.find((r) => r.isin === "IN1");
  assert.equal(hdfc.count, 2);
  assert.deepEqual(hdfc.weights, [8, 5]);
  assert.equal(rows.find((r) => r.isin === "IN4").count, 1);
  assert.equal(rows[0].count, 2, "most-held first");
});

test("duplication is weighted by what you actually hold", () => {
  // Equal money in both: HDFC is 8% of A and 5% of B -> 6.5% of the book.
  const eq = portfolioDuplication([A, B], [100000, 100000]);
  const hdfc = eq.byInstrument.find((c) => c.isin === "IN1");
  assert.equal(Math.round(hdfc.pct * 100) / 100, 6.5);
  assert.equal(hdfc.funds, 2);

  // A fund that is a rounding error in the book cannot dominate the answer.
  const skew = portfolioDuplication([A, B], [1000000, 1000]);
  assert.ok(skew.duplicatedPct < eq.duplicatedPct + 1);
  assert.ok(skew.byInstrument.find((c) => c.isin === "IN4").pct < 0.01);
});

test("an empty book does not divide by zero", () => {
  const r = portfolioDuplication([A, B], [0, 0]);
  assert.equal(r.total, 0);
  assert.equal(r.duplicatedPct, 0);
});
