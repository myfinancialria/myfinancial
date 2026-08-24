import test from "node:test";
import assert from "node:assert/strict";
import {
  CARDS, TOPICS, CORRIDORS, CORRIDOR_KEYS, INCOME_TYPES, TREATY,
  SECTION_MAP, FORM_MAP, RETURN_TIMELINE, MATRIX_ROWS, REPAT_CAP_USD,
  SOURCES, GRADES, NOT_COVERED, gapFor,
  residency, ratePick, propertySale, repatriationPlan, surchargeRate,
} from "../../shared/nri.mjs";

/* ---------------------------------------------------------------------------
   The NRI engine.

   Three things here are counter-intuitive enough that someone will eventually
   "fix" them into being wrong, so each is pinned with the reason:

     1. For an INDIVIDUAL in the US or Canada the treaty dividend rate (25%) is
        WORSE than India's own domestic rate (20%). The familiar 15% is the
        corporate rate for a shareholder holding 10% or more.
     2. TDS on a property sale by an NRI is charged on the SALE CONSIDERATION,
        not on the gain, so the withholding legitimately exceeds the tax due.
     3. The 120-day visitor and the deemed-resident both land in RNOR, not ROR
        — the rule makes you resident without making your foreign income
        taxable.
--------------------------------------------------------------------------- */

/* ------------------------------- residency -------------------------------- */

test("182 days in India makes you resident whatever else is true", () => {
  const r = residency({ daysThisYear: 182, daysPrior4: 0, nonResident9of10: true });
  assert.notEqual(r.status, "NR");
});

test("a Gulf worker home for a long holiday is still non-resident", () => {
  const r = residency({ daysThisYear: 150, daysPrior4: 400, category: "employment" });
  assert.equal(r.status, "NR");   // the employment relaxation lifts the limb to 182
});

test("the 120-day visitor rule lands in RNOR, not ROR", () => {
  const r = residency({
    daysThisYear: 130, daysPrior4: 400, daysPrior7: 900,
    category: "visiting", indianIncomeOver15L: true, nonResident9of10: false,
  });
  assert.equal(r.status, "RNOR");
});

test("below ₹15 lakh of Indian income the visitor threshold stays at 182 days", () => {
  const r = residency({
    daysThisYear: 130, daysPrior4: 400, category: "visiting", indianIncomeOver15L: false,
  });
  assert.equal(r.status, "NR");
});

test("deemed residency needs citizenship, ₹15 lakh AND no tax liability abroad", () => {
  const caught = residency({
    daysThisYear: 10, indianCitizen: true, indianIncomeOver15L: true, liableToTaxAbroad: false,
  });
  assert.equal(caught.status, "RNOR");

  const free = residency({
    daysThisYear: 10, indianCitizen: true, indianIncomeOver15L: true, liableToTaxAbroad: true,
  });
  assert.equal(free.status, "NR");

  const oci = residency({
    daysThisYear: 10, indianCitizen: false, indianIncomeOver15L: true, liableToTaxAbroad: false,
  });
  assert.equal(oci.status, "NR");
});

test("729 days over seven years is the RNOR boundary", () => {
  const base = { daysThisYear: 200, nonResident9of10: false };
  assert.equal(residency({ ...base, daysPrior7: 729 }).status, "RNOR");
  assert.equal(residency({ ...base, daysPrior7: 730 }).status, "ROR");
});

test("every decision shows its working", () => {
  const r = residency({ daysThisYear: 200, daysPrior7: 1200, nonResident9of10: false });
  assert.ok(r.path.length >= 2);
  for (const step of r.path) {
    assert.equal(typeof step.test, "string");
    assert.equal(typeof step.result, "boolean");
    assert.ok(step.detail.length > 20);
  }
});

/* --------------------------------- rates ---------------------------------- */

test("the treaty is WORSE than domestic law for US and Canadian dividends", () => {
  for (const c of ["us", "canada"]) {
    const p = ratePick("dividend", c, 1_000_000);
    assert.equal(p.treaty, 25);
    assert.equal(p.winner, "domestic", `${c}: an individual must not be given the 15% corporate rate`);
    assert.ok(p.effective < 25);
  }
});

test("the treaty roughly halves NRO interest withholding everywhere", () => {
  for (const c of CORRIDOR_KEYS) {
    const p = ratePick("nroInterest", c, 1_000_000);
    assert.equal(p.winner, "treaty");
    assert.ok(p.effective <= 15, `${c} should cap NRO interest at 15% or less`);
    assert.ok(p.domestic > 30, "the domestic figure must carry cess");
  }
});

test("NRE interest is exempt and never acquires a rate", () => {
  const p = ratePick("nreInterest", "us");
  assert.equal(p.exempt, true);
  assert.equal(p.effective, 0);
});

test("surcharge on capital gains is capped at 15% however large the payment", () => {
  assert.equal(surchargeRate(300_000_000, true), 15);
  assert.equal(surchargeRate(300_000_000, false), 25);
  assert.equal(surchargeRate(4_000_000, true), 0);
});

test("every corridor has a treaty row for every non-exempt income stream", () => {
  for (const c of CORRIDOR_KEYS) {
    assert.ok(TREATY[c], `no treaty block for ${c}`);
    assert.ok(TREATY[c].trc, `${c} must say how to get its residency certificate`);
    for (const k of ["dividend", "nroInterest"]) {
      assert.equal(typeof TREATY[c][k], "number", `${c}.${k} must be a rate`);
    }
  }
});

/* ------------------------------- property --------------------------------- */

test("TDS on a property sale is charged on the price, so it exceeds the tax due", () => {
  const r = propertySale({ cost: 4_000_000, sale: 12_000_000, months: 150 });
  assert.equal(r.longTerm, true);
  assert.equal(r.gain, 8_000_000);
  assert.ok(r.tdsWithheld > r.taxDue, "withholding must exceed the liability — that is the whole problem");
  assert.ok(r.blocked > 500_000);
  assert.ok(r.carryCost > 0);
});

test("a property held 24 months or less is short-term", () => {
  assert.equal(propertySale({ cost: 1e6, sale: 2e6, months: 24 }).longTerm, false);
  assert.equal(propertySale({ cost: 1e6, sale: 2e6, months: 25 }).longTerm, true);
});

test("a sale at a loss produces no gain and no tax", () => {
  const r = propertySale({ cost: 12_000_000, sale: 9_000_000, months: 100 });
  assert.equal(r.gain, 0);
  assert.equal(r.taxDue, 0);
  assert.ok(r.tdsWithheld > 0, "the buyer still withholds on the consideration — the refund route is the only remedy");
});

/* ----------------------------- repatriation -------------------------------- */

test("NRE and current income are outside the USD 1 million cap", () => {
  for (const s of ["nre", "fcnr", "current"]) {
    const p = repatriationPlan({ amountUsd: 5_000_000, source: s });
    assert.equal(p.capped, false);
    assert.equal(p.fits, true);
  }
});

test("an NRO remittance over the cap is split across the 1 April boundary", () => {
  const p = repatriationPlan({ amountUsd: 1_400_000, source: "nro", usedThisYearUsd: 0 });
  assert.equal(p.fits, false);
  assert.equal(p.split.length, 2);
  assert.equal(p.split[0].usd + p.split[1].usd, 1_400_000);
  assert.equal(p.split[0].usd, REPAT_CAP_USD);
});

test("the allowance already used reduces what is left", () => {
  const p = repatriationPlan({ amountUsd: 300_000, source: "nro", usedThisYearUsd: 800_000 });
  assert.equal(p.remaining, 200_000);
  assert.equal(p.fits, false);
});

/* -------------------------------- corpus ----------------------------------- */

test("every answer card is complete and searchable", () => {
  const ids = new Set();
  const topics = new Set(TOPICS.map(([k]) => k));
  for (const c of CARDS) {
    assert.ok(!ids.has(c.id), `duplicate card id ${c.id}`);
    ids.add(c.id);
    assert.ok(topics.has(c.topic), `${c.id} has an unknown topic "${c.topic}"`);
    assert.ok(c.q.length > 10, `${c.id} needs a real question`);
    // A flow card leads with a one-line framing and does its work in the
    // numbered steps, so it is held to a different shape than a prose answer.
    if (c.k === "flow") {
      assert.ok(c.steps?.length >= 3, `${c.id} is a flow card with no steps`);
      assert.ok(c.a.length > 30, `${c.id} needs a line framing its steps`);
    } else {
      assert.ok(c.a.length > 80, `${c.id} needs a real answer`);
    }
    // The tags line is what the search index leans on hardest. A card without
    // one is invisible to everyone who does not guess its exact wording.
    assert.ok(c.tags.split(/\s+/).length >= 6, `${c.id} needs more search tags`);
    if (c.c !== "all") {
      for (const k of c.c) assert.ok(CORRIDORS[k], `${c.id} names an unknown corridor "${k}"`);
    }
    if (c.income) assert.ok(INCOME_TYPES[c.income], `${c.id} names an unknown income stream`);
    if (c.verdict) assert.ok(["up", "down", "warn", "accent"].includes(c.verdict.tone));
  }
  assert.ok(CARDS.length >= 50, "the corpus should not shrink below 50 answers");
});

test("every corridor is covered by more than one answer", () => {
  for (const k of CORRIDOR_KEYS) {
    const n = CARDS.filter((c) => c.c !== "all" && c.c.includes(k)).length;
    assert.ok(n >= 2, `${k} has only ${n} corridor-specific answers`);
  }
});

test("the renumbering carries the sections and forms people actually search for", () => {
  const secs = new Map(SECTION_MAP.map(([o, n]) => [o, n]));
  assert.equal(secs.get("195"), "393(2)");
  assert.equal(secs.get("87A"), "157");
  const forms = new Map(FORM_MAP.map(([o, n]) => [o, n]));
  assert.equal(forms.get("10F"), "41");
  assert.equal(forms.get("67"), "44");
  assert.equal(forms.get("15CA"), "145");
});

test("the return timeline runs from before departure to the ROR cliff", () => {
  assert.ok(RETURN_TIMELINE.length >= 6);
  assert.ok(RETURN_TIMELINE[0].at.startsWith("T−"));
  assert.match(RETURN_TIMELINE[RETURN_TIMELINE.length - 1].at, /ROR/);
  for (const s of RETURN_TIMELINE) assert.ok(s.why.length > 40);
});

test("the comparison matrix resolves a cell for every corridor", () => {
  for (const row of MATRIX_ROWS) {
    for (const k of CORRIDOR_KEYS) {
      const cell = row.get(CORRIDORS[k]);
      assert.ok(cell.v && cell.tone, `${row.key} × ${k} produced no cell`);
    }
  }
});

/* ------------------------------ provenance --------------------------------- */

test("every answer cites at least one real source and carries an evidence grade", () => {
  for (const c of CARDS) {
    // An ungraded or uncited card must fail loudly rather than defaulting: the
    // direct-answer panel shows both to the reader, and a silent default there
    // would be a fabricated assurance.
    assert.ok(GRADES[c.g], `${c.id} has no evidence grade`);
    assert.ok(c.s.length >= 1, `${c.id} cites no source`);
    for (const id of c.s) assert.ok(SOURCES[id], `${c.id} cites unknown source "${id}"`);
  }
});

test("every source is openable and declares what it is", () => {
  for (const [id, s] of Object.entries(SOURCES)) {
    assert.match(s.url, /^https:\/\//, `${id} has no https URL`);
    // A citation reads as a citation, not as an acronym: the label has to say
    // what the reader is being sent to, not just who published it.
    assert.ok(s.label.length > 8 && /\s/.test(s.label), `${id} needs a label that says what it is`);
    assert.ok(["primary", "regulator", "secondary"].includes(s.authority), `${id} has no authority level`);
  }
});

test("the corridor answers cite that corridor's own tax authority", () => {
  const expect = { us: /irs|ssa/, canada: /cra|can/, australia: /ato/, nz: /ird/, gulf: /uae|oman|pwcUae/ };
  for (const [k, re] of Object.entries(expect)) {
    const cards = CARDS.filter((c) => c.c !== "all" && c.c.includes(k) && c.topic !== "insurance");
    const cited = cards.some((c) => c.s.some((id) => re.test(id)));
    assert.ok(cited, `no ${k} answer cites a ${k} authority`);
  }
});

/* --------------------------- what it does not know ------------------------- */

test("out-of-scope subjects are declared, with a reason and somewhere to go", () => {
  assert.ok(NOT_COVERED.length >= 5);
  for (const g of NOT_COVERED) {
    assert.ok(g.label && g.match && g.why.length > 60 && g.where.length > 20, `${g.id} is incomplete`);
  }
});

test("a question about an uncovered subject is recognised as uncovered", () => {
  assert.equal(gapFor("uk tax for nri")?.id, "uk");
  assert.equal(gapFor("can i buy bitcoin as an nri")?.id, "crypto");
  assert.equal(gapFor("should i set up a family trust")?.id, "trusts");
  assert.equal(gapFor("h1b visa sponsorship")?.id, "immigration");
  assert.equal(gapFor("singapore nri account")?.id, "singapore");
});

test("questions the corpus DOES answer are not mistaken for gaps", () => {
  // The regression this pins: a bare "tax" in the state-tax term list matched
  // almost every real question and sent it to the wrong "not covered" notice.
  for (const q of ["nro interest tds", "selling my flat", "how many days can i stay in india",
                   "ppf interest", "what is section 195", "nre or nro account"]) {
    assert.equal(gapFor(q), null, `"${q}" was wrongly treated as out of scope`);
  }
});
