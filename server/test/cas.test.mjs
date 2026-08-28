import test from "node:test";
import assert from "node:assert/strict";
import { parseCas, classifyTransaction, cleanSchemeName, parseDate, detect, findValueColumnStart } from "../../shared/cas.mjs";
import { installShims } from "../../shared/shims.mjs";
import { xirr, analyse } from "../../shared/cas_analysis.mjs";

/* ---------------------------------------------------------------------------
   A mis-parsed statement is worse than no parser: it reports someone's money
   wrongly and looks authoritative doing it. These pin the rules ported from
   codereverser/casparser, and the two places my own port went wrong first.
--------------------------------------------------------------------------- */

const cell = (rows) => rows.map((r) => r.map(([x, text]) => ({ x, text })));
const flat = (rows) => rows.map((r) => r.map((c) => c[1]).join(" "));

const STATEMENT = [
  [[56, "Consolidated Account Statement"]],
  [[56, "CAMS"]],
  [[56, "01-Apr-2025 To 31-Mar-2026"]],
  [[56, "RAHUL SHARMA"]],
  [[56, "rahul@example.com"]],
  [[56, "HDFC Mutual Fund"]],
  [[56, "Folio No: 12345678 / 90 PAN: ABCDE1234F KYC: OK"]],
  [[56, "HDFC0001-HDFC Balanced Advantage Fund - Growth - ISIN: INF179K01YV8 (Advisor: ARN-12345) Registrar : CAMS"]],
  [[56, "Opening Unit Balance: 0.000"]],
  [[56, "01-Apr-2025"], [120, "Purchase"], [330, "100,000.00"], [400, "1,000.000"], [460, "100.0000"], [520, "1,000.000"]],
  [[56, "15-Jul-2025"], [120, "IDCW Payout @ Rs. 2.50 per unit"], [330, "2,500.00"]],
  [[56, "10-Oct-2025"], [120, "Redemption"], [330, "(20,000.00)"], [400, "(160.000)"], [460, "125.0000"], [520, "840.000"]],
  [[56, "Closing Unit Balance: 840.000 NAV on 31-Mar-2026: INR 125.0000"]],
  [[56, "Total Cost Value: 84,000.00"]],
  [[56, "Valuation on 31-Mar-2026: INR 105,000.00"]],
];
const parsed = () => parseCas(flat(STATEMENT), cell(STATEMENT));

/* ------------------------------ the two bugs ------------------------------ */
test("a dividend rate in the description is not read as the amount", () => {
  // "IDCW Payout @ Rs. 2.50 per unit   2,500.00" — 2.50 is prose in the
  // description column, 2,500.00 is the amount. Flattening the row to a string
  // read the rate as the amount and the amount as units.
  const t = parsed().folios[0].schemes[0].transactions.find((x) => x.type === "DIVIDEND_PAYOUT");
  assert.equal(t.amount, 2500);
  assert.equal(t.units, null, "a payout moves no units");
  assert.equal(t.dividendRate, 2.5);
});

test("the AMC header is not mistaken for the investor's name", () => {
  assert.equal(parsed().investor.name, "RAHUL SHARMA");
});

/* ------------------------------ column finding ---------------------------- */
test("value columns are found by what recurs, not by the widest gap", () => {
  // The gaps BETWEEN value columns are wider than the gap between the
  // description and the first of them, so a widest-gap rule cut the amount
  // column off and shifted every figure one place left.
  const x = findValueColumnStart(cell(STATEMENT));
  assert.ok(x > 120 && x < 330, `boundary should sit between description and amount, got ${x}`);
});

test("with no positions at all it still parses, just less safely", () => {
  const r = parseCas(flat(STATEMENT));
  assert.equal(r.folios[0].schemes[0].transactions.length, 3);
});

/* -------------------------------- structure ------------------------------- */
test("folio, PAN and KYC are read from the folio line", () => {
  const f = parsed().folios[0];
  assert.equal(f.folio, "12345678/90");
  assert.equal(f.pan, "ABCDE1234F");
  assert.equal(f.kyc, "OK");
  assert.equal(f.amc, "HDFC Mutual Fund");
});

test("scheme identity, balances and valuation are read", () => {
  const s = parsed().folios[0].schemes[0];
  assert.equal(s.isin, "INF179K01YV8");
  assert.equal(s.advisor, "ARN-12345");
  assert.equal(s.rta, "CAMS");
  assert.equal(s.close, 840);
  assert.equal(s.nav, 125);
  assert.equal(s.cost, 84000);
  assert.equal(s.valuation, 105000);
  assert.equal(s.navDate, "2026-03-31");
});

test("the statement period and source are identified", () => {
  const r = parsed();
  assert.deepEqual([r.statement.from, r.statement.to], ["2025-04-01", "2026-03-31"]);
  assert.equal(r.meta.source, "CAMS");
  assert.equal(r.meta.kind, "DETAILED");
});

test("a demat statement is refused rather than half-read", () => {
  const d = detect("NSDL Consolidated Account Statement for demat holdings");
  assert.equal(d.supported, false);
  assert.equal(d.source, "NSDL");
});

/* ---------------------------- classification ------------------------------ */
test("transactions are classified the way casparser classifies them", () => {
  const T = (d, u) => classifyTransaction(d, u).type;
  assert.equal(T("Purchase", 100), "PURCHASE");
  assert.equal(T("Systematic Investment - Instalment 4", 10), "PURCHASE_SIP");
  assert.equal(T("SIP Purchase", 10), "PURCHASE_SIP");
  assert.equal(T("Redemption", -10), "REDEMPTION");
  assert.equal(T("Switch In from X", 10), "SWITCH_IN");
  assert.equal(T("Switch Out to Y - Merger", -10), "SWITCH_OUT_MERGER");
  assert.equal(T("STP In", 10), "SWITCH_IN");
  assert.equal(T("Gift In", 10), "GIFT_IN");
  assert.equal(T("Redemption - cheque dishonoured", -10), "REVERSAL");
  assert.equal(T("Segregated Portfolio creation", 5), "SEGREGATION");
  assert.equal(T("*** Stamp Duty ***", null), "STAMP_DUTY_TAX");
  assert.equal(T("STT Paid", null), "STT_TAX");
  assert.equal(T("TDS on redemption", null), "TDS_TAX");
});

test("a reinvested dividend is not a payout", () => {
  const re = classifyTransaction("IDCW Reinvestment @ Rs. 1.20 per unit", 12);
  assert.equal(re.type, "DIVIDEND_REINVEST");
  assert.equal(re.dividendRate, 1.2);
  assert.equal(classifyTransaction("IDCW Payout @ Rs. 1.20 per unit", null).type, "DIVIDEND_PAYOUT");
});

test("scheme names lose the noise a CAS wraps them in", () => {
  assert.equal(
    cleanSchemeName("HDFC Top 100 Fund (formerly HDFC Top 200) - Growth - ISIN: INF179K01BB8 (Advisor: ARN-1) Registrar : CAMS"),
    "HDFC Top 100 Fund - Growth",
  );
});

test("dates parse in every shape a CAS writes them", () => {
  for (const s of ["25-Oct-2021", "25 Oct 2021", "25Oct2021", "5-Jan-2026"]) {
    assert.match(parseDate(s) ?? "", /^\d{4}-\d{2}-\d{2}$/, `failed on "${s}"`);
  }
  assert.equal(parseDate("25-Xyz-2021"), null);
  assert.equal(parseDate("not a date"), null);
});

/* ---------------------------------- XIRR ---------------------------------- */
test("XIRR on a simple doubling over one year is about 100%", () => {
  const r = xirr([{ date: "2025-01-01", amount: -100000 }, { date: "2026-01-01", amount: 200000 }]);
  assert.ok(r > 99 && r < 101, `expected ~100%, got ${r}`);
});

test("XIRR weights each rupee by how long it was invested", () => {
  // ₹120k in twelve monthly instalments, worth ₹130k at the end: the absolute
  // gain is 8.3%, but the average rupee was invested about half a year, so the
  // annualised figure is roughly double.
  const flows = [
    ...Array.from({ length: 12 }, (_, i) => ({ date: `2025-${String(i + 1).padStart(2, "0")}-01`, amount: -10000 })),
    { date: "2026-01-01", amount: 130000 },
  ];
  const r = xirr(flows);
  assert.ok(r > 14 && r < 18, `expected ~15-16%, got ${r}`);
});

test("XIRR refuses cashflows it cannot solve", () => {
  assert.equal(xirr([{ date: "2025-01-01", amount: -1000 }]), null, "one flow is not a return");
  assert.equal(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2025-06-01", amount: -1000 }]), null,
    "all outflows have no rate of return");
  assert.equal(xirr([]), null);
});

test("a total loss does not crash the solver", () => {
  const r = xirr([{ date: "2025-01-01", amount: -100000 }, { date: "2026-01-01", amount: 1 }]);
  assert.ok(r === null || r < -90, `a near-total loss should be strongly negative, got ${r}`);
});

/* -------------------------------- analysis -------------------------------- */
test("the portfolio totals reconcile with the statement", () => {
  const a = analyse(parsed());
  assert.equal(a.totals.schemes, 1);
  assert.equal(a.totals.folios, 1);
  assert.equal(a.totals.value, 105000);
  assert.equal(a.totals.cost, 84000);
  assert.equal(a.totals.gain, 21000);
  assert.equal(a.totals.gainPct, 25);
  assert.equal(a.totals.invested, 100000, "only purchases count as invested");
  assert.equal(a.totals.withdrawn, 22500, "redemption plus payout");
});

test("an unmatched scheme is counted as unmatched rather than guessed", () => {
  const a = analyse(parsed(), { funds: new Map() });
  assert.equal(a.totals.matched, 0);
  assert.equal(a.schemes[0].category, null);
});

test("look-through only claims the value it can actually see", () => {
  const funds = new Map([["INF179K01YV8", { code: "9999", categoryGroup: "Hybrid", category: "Balanced Advantage" }]]);
  const holdings = new Map([["9999", { holdings: [
    { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Financials", pct: 8 },
    { symbol: "RELIANCE", name: "Reliance", sector: "Energy", pct: 5 },
  ] }]]);
  const a = analyse(parsed(), { funds, holdings });
  assert.equal(a.totals.matched, 1);
  assert.equal(a.lookThrough.coveragePct, 100);
  const hdfc = a.lookThrough.stocks.find((s) => s.symbol === "HDFCBANK");
  assert.equal(hdfc.value, 8400, "8% of a ₹105,000 holding");
  assert.equal(hdfc.pctOfPortfolio, 8);
});

test("with no holdings published, look-through is empty rather than invented", () => {
  const funds = new Map([["INF179K01YV8", { code: "9999", categoryGroup: "Hybrid" }]]);
  const a = analyse(parsed(), { funds, holdings: new Map() });
  assert.equal(a.lookThrough.stocks.length, 0);
  assert.equal(a.lookThrough.coveragePct, 0);
});

test("an empty statement analyses to nothing, not to NaN", () => {
  const a = analyse({ statement: {}, folios: [] });
  assert.equal(a.totals.schemes, 0);
  assert.equal(a.totals.value, 0);
  assert.equal(a.totals.xirr, null);
});

test("an NSDL statement is caught even though it shares the CAS title", () => {
  // NSDL's demat statement is ALSO called a Consolidated Account Statement.
  // Matching the title before the issuer sent it to the mutual-fund parser.
  const d = detect("NSDL\nConsolidated Account Statement\nDemat Account No: IN300xxx");
  assert.equal(d.source, "NSDL");
  assert.equal(d.supported, false);
  assert.equal(detect("CDSL Consolidated Account Statement").source, "CDSL");
});

test("a CAMS statement is still recognised", () => {
  const d = detect("CAMS\nConsolidated Account Statement\n01-Apr-2025 To 31-Mar-2026");
  assert.equal(d.source, "CAMS");
  assert.equal(d.supported, true);
});

test("the registrar's scheme code is stripped from the name", () => {
  // "HDFC0001-" is the RTA's internal code; it differs between registrars for
  // the same fund and means nothing to the holder.
  assert.equal(cleanSchemeName("HDFC0001-HDFC Balanced Advantage Fund - Growth"), "HDFC Balanced Advantage Fund - Growth");
  assert.equal(cleanSchemeName("IPRU002-ICICI Prudential Bluechip Fund - Growth"), "ICICI Prudential Bluechip Fund - Growth");
  // A name that merely contains a dash keeps it.
  assert.equal(cleanSchemeName("Nippon India Growth Fund - Growth"), "Nippon India Growth Fund - Growth");
});

// ---------------------------------------------------------------------------
// pdf.js 6 requires Promise.withResolvers and AbortSignal.any, both of which
// landed in Safari 17.4. These pin the stand-ins against the real thing.
// ---------------------------------------------------------------------------
/** Stands in for an engine whose Promise predates withResolvers. */
class FakePromise { constructor(executor) { return new Promise(executor); } }
/** Stands in for an AbortSignal constructor with no static `any`. */
function AbortSignalStub() {}

test("the shims install only what is missing, and leave natives alone", () => {
  const native = { Promise, AbortSignal, AbortController };
  assert.deepEqual(installShims(native), [], "nothing to do on a modern engine");

  // A stub that does NOT inherit Promise's statics — an old engine's Promise.
  const scope = { Promise: FakePromise, AbortSignal: AbortSignalStub, AbortController };
  assert.deepEqual(installShims(scope).sort(), ["AbortSignal.any", "Promise.withResolvers"]);
});

test("withResolvers resolves and rejects like the native one", async () => {
  const scope = { Promise: FakePromise };
  installShims(scope);
  const ok = scope.Promise.withResolvers();
  ok.resolve(42);
  assert.equal(await ok.promise, 42);

  const bad = scope.Promise.withResolvers();
  bad.reject(new Error("nope"));
  await assert.rejects(bad.promise, /nope/);
});

test("AbortSignal.any follows whichever signal aborts, and honours one already aborted", () => {
  const scope = { Promise, AbortSignal: AbortSignalStub, AbortController };
  installShims(scope);

  const a = new AbortController(), b = new AbortController();
  const later = scope.AbortSignal.any([a.signal, b.signal]);
  assert.equal(later.aborted, false, "nothing has aborted yet");
  b.abort("because");
  assert.equal(later.aborted, true);
  assert.equal(later.reason, "because", "the reason is carried through");

  const done = new AbortController();
  done.abort("already");
  const immediate = scope.AbortSignal.any([done.signal]);
  assert.equal(immediate.aborted, true, "an already-aborted signal wins at once");
  assert.equal(immediate.reason, "already");

  assert.equal(scope.AbortSignal.any([]).aborted, false, "an empty list never aborts");
});

test("a Safari-style ReadableStream becomes async-iterable", async () => {
  // Safari has never shipped ReadableStream.prototype[Symbol.asyncIterator],
  // which is the line pdf.js reads page text with.
  class SafariStream {
    constructor(chunks) { this._chunks = chunks.slice(); this.cancelled = false; }
    getReader() {
      const s = this;
      return {
        async read() { return s._chunks.length ? { done: false, value: s._chunks.shift() } : { done: true }; },
        releaseLock() { s.unlocked = true; },
        async cancel(reason) { s.cancelled = true; s.reason = reason; },
      };
    }
  }
  const scope = { Promise, AbortSignal, AbortController, ReadableStream: SafariStream };
  assert.ok(installShims(scope).includes("ReadableStream.asyncIterator"));

  const read = [];
  for await (const chunk of new SafariStream([{ items: [1, 2] }, { items: [3] }])) read.push(...chunk.items);
  assert.deepEqual(read, [1, 2, 3], "every chunk is delivered, in order");

  // Abandoning the loop must cancel the stream and release the lock, or the
  // next read of the same document deadlocks.
  const abandoned = new SafariStream([{ items: [1] }, { items: [2] }]);
  for await (const _ of abandoned) break;
  assert.equal(abandoned.cancelled, true, "an abandoned loop cancels");
  assert.equal(abandoned.unlocked, true, "an abandoned loop releases the lock");
});

test("a native async-iterable stream is left alone", () => {
  const scope = { Promise, AbortSignal, AbortController, ReadableStream };
  assert.ok(!installShims(scope).includes("ReadableStream.asyncIterator"));
});
