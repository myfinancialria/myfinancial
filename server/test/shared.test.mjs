// ---------------------------------------------------------------------------
// The shared engines run in BOTH the Node server and the browser, so they must
// stay free of anything server-only and keep producing the same answers. These
// tests pin the tax arithmetic against hand-computed figures rather than
// against the engine's own output.
// ---------------------------------------------------------------------------
import test from "node:test";
import assert from "node:assert/strict";
import { compare, computeRegime } from "../../shared/tax.mjs";
import { simulateGoal, requiredSip, recommendedAlloc } from "../../shared/goals.mjs";
import { generateDraft, estateChecklist, WILL_STEPS } from "../../shared/estate.mjs";

test("new-regime tax on a ₹24L salary matches a hand computation", () => {
  // 24,00,000 − 75,000 standard deduction = 23,25,000 taxable
  //   0–4L nil · 4–8L @5% = 20,000 · 8–12L @10% = 40,000
  //   12–16L @15% = 60,000 · 16–20L @20% = 80,000 · 20–23.25L @25% = 81,250
  //   = 2,81,250 + 4% cess = 2,92,500
  const r = computeRegime("NEW", { residency: "RESIDENT", age: 35 }, { salary: 2400000 }, {});
  assert.equal(r.tax.slab, 281250);
  assert.equal(r.tax.cess, 11250);
  assert.equal(r.tax.total, 292500);
});

test("old-regime tax on a ₹24L salary with full 80C matches a hand computation", () => {
  // 24,00,000 − 50,000 − 1,50,000 = 22,00,000
  //   0–2.5L nil · 2.5–5L @5% = 12,500 · 5–10L @20% = 1,00,000 · >10L @30% = 3,60,000
  //   = 4,72,500 + 4% cess = 4,91,400
  const r = computeRegime("OLD", { residency: "RESIDENT", age: 35 }, { salary: 2400000 }, { sec80C: 150000 });
  assert.equal(r.tax.slab, 472500);
  assert.equal(r.tax.total, 491400);
});

test("87A makes ₹12L of salary tax-free under the new regime", () => {
  const r = computeRegime("NEW", { residency: "RESIDENT", age: 35 }, { salary: 1200000 }, {});
  assert.equal(r.tax.total, 0);
});

test("NRIs get no 87A rebate", () => {
  const res = computeRegime("NEW", { residency: "RESIDENT", age: 35 }, { salary: 700000 }, {});
  const nri = computeRegime("NEW", { residency: "NRI", age: 35 }, { salary: 700000 }, {});
  assert.equal(res.tax.total, 0);
  assert.ok(nri.tax.total > 0, "an NRI on the same salary should owe tax");
});

test("NRE interest is exempt while NRO interest is taxed", () => {
  const p = { residency: "NRI", age: 40 };
  const nre = computeRegime("NEW", p, { salary: 2000000, nreInterest: 500000 }, {});
  const nro = computeRegime("NEW", p, { salary: 2000000, nroInterest: 500000 }, {});
  assert.ok(nro.tax.total > nre.tax.total, "NRO interest must increase the bill");
  assert.equal(nre.heads.nreInterestExempt, 500000);
});

test("equity LTCG is exempt up to ₹1.25L then taxed at 12.5%", () => {
  const p = { residency: "RESIDENT", age: 35 };
  const under = computeRegime("NEW", p, { ltcgEquity: 125000 }, {});
  const over = computeRegime("NEW", p, { ltcgEquity: 225000 }, {});
  assert.equal(under.tax.ltcg, 0);
  assert.equal(over.tax.ltcg, Math.round(100000 * 0.125));
});

test("compare() picks the cheaper regime", () => {
  const cmp = compare({ residency: "RESIDENT", age: 35 }, { salary: 2400000 }, { sec80C: 150000 });
  assert.equal(cmp.better, "NEW");
  assert.equal(cmp.savings, Math.abs(cmp.NEW.tax.total - cmp.OLD.tax.total));
});

test("the Monte Carlo is deterministic for a given goal", () => {
  const g = { name: "T", targetAmount: 10000000, targetYear: new Date().getFullYear() + 15, currentCorpus: 500000, monthlySip: 30000, alloc: { equity: 0.6, debt: 0.3, gold: 0.1 } };
  const a = simulateGoal(g, { paths: 400, wantBands: false });
  const b = simulateGoal(g, { paths: 400, wantBands: false });
  assert.equal(a.feasibility, b.feasibility);
  assert.equal(a.median, b.median);
});

test("a bigger SIP cannot lower feasibility", () => {
  const base = { name: "T", targetAmount: 10000000, targetYear: new Date().getFullYear() + 12, currentCorpus: 0, alloc: { equity: 0.6, debt: 0.3, gold: 0.1 } };
  const small = simulateGoal({ ...base, monthlySip: 10000 }, { paths: 600, wantBands: false });
  const large = simulateGoal({ ...base, monthlySip: 60000 }, { paths: 600, wantBands: false });
  assert.ok(large.feasibility >= small.feasibility);
});

test("requiredSip reaches the requested confidence", () => {
  const g = { name: "T", targetAmount: 5000000, targetYear: new Date().getFullYear() + 10, currentCorpus: 0, alloc: { equity: 0.6, debt: 0.3, gold: 0.1 } };
  const sip = requiredSip(g, 75);
  assert.ok(sip > 0);
  const check = simulateGoal({ ...g, monthlySip: sip }, { paths: 1500, wantBands: false });
  assert.ok(check.feasibility >= 68, `feasibility at the solved SIP was ${check.feasibility}%`);
});

test("the glide path holds less equity as the goal nears", () => {
  const far = recommendedAlloc(25, "BALANCED");
  const near = recommendedAlloc(2, "BALANCED");
  assert.ok(far.equity > near.equity);
  for (const a of [far, near]) {
    assert.ok(Math.abs(a.equity + a.debt + a.gold - 1) < 0.02, "allocation must sum to 1");
  }
});

test("the Will draft carries every mandatory clause", () => {
  const draft = generateDraft({
    fullName: "Test Testator", age: 50, pan: "ABCDE1234F", address: "Bengaluru",
    beneficiaries: [{ name: "Child", relation: "son", age: 10 }],
    assets: [{ type: "Flat", description: "Apt 1", beneficiary: "Child" }],
    executor: { name: "Exec", relation: "spouse" }, residuaryBeneficiary: "Spouse",
    guardian: { name: "Aunt", relation: "sister" },
  });
  for (const clause of ["LAST WILL AND TESTAMENT", "REVOCATION", "APPOINTMENT OF EXECUTOR", "RESIDUARY ESTATE", "GUARDIANSHIP", "ATTESTATION"]) {
    assert.ok(draft.includes(clause), `draft is missing the ${clause} clause`);
  }
});

test("a guardianship clause appears only when there is a minor and a guardian", () => {
  const noMinor = generateDraft({ fullName: "X", beneficiaries: [{ name: "A", relation: "spouse", age: 45 }] });
  assert.ok(!noMinor.includes("GUARDIANSHIP"));
});

test("the estate checklist reflects what has been done", () => {
  const empty = estateChecklist({});
  const done = estateChecklist({ hasWill: true, vaultCategories: ["WILL", "KYC"] });
  assert.equal(empty.filter((i) => i.done).length, 0);
  assert.ok(done.filter((i) => i.done).length >= 3);
  assert.ok(estateChecklist({ residency: "NRI" }).length > empty.length, "NRIs get an extra cross-border item");
});

test("the wizard exposes every step the page renders", () => {
  assert.equal(WILL_STEPS.length, 7);
  for (const s of WILL_STEPS) assert.ok(s.id && s.title);
});
