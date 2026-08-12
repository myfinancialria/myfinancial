// ---------------------------------------------------------------------------
// tax.js — Indian income-tax computation engine, FY 2025-26 (AY 2026-27).
//
// Computes BOTH regimes side-by-side with the full head-wise breakdown:
// salary, house property, business/F&O, capital gains (equity STCG 20%,
// equity LTCG 12.5% over ₹1.25L, other LTCG 12.5%), dividends & interest.
// Handles resident vs NRI rules (no 87A rebate for NRIs, NRE interest exempt,
// NRO fully taxable, DTAA notes) plus surcharge (incl. 15% cap on CG),
// marginal relief and cess. Also emits ranked tax-saving recommendations.
//
// NOTE: informational computation for planning — not a substitute for a
// Chartered Accountant or the official utility.
// ---------------------------------------------------------------------------
import { round2, clamp } from "./util.mjs";

export const FY = "FY 2025-26 (AY 2026-27)";

const NEW_SLABS = [
  [400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15],
  [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30],
];
const OLD_SLABS = (age) => [
  [age >= 80 ? 500000 : age >= 60 ? 300000 : 250000, 0],
  [500000, 0.05], [1000000, 0.20], [Infinity, 0.30],
];

function slabTax(income, slabs) {
  let tax = 0, prev = 0;
  const lines = [];
  for (const [upto, rate] of slabs) {
    if (income <= prev) break;
    const amt = Math.min(income, upto) - prev;
    if (amt > 0 && rate > 0) { tax += amt * rate; lines.push({ band: `${fmtL(prev)}–${upto === Infinity ? "∞" : fmtL(upto)}`, rate: rate * 100, amount: Math.round(amt), tax: Math.round(amt * rate) }); }
    prev = upto;
  }
  return { tax, lines };
}
const fmtL = (x) => (x >= 10000000 ? `${x / 10000000}Cr` : `${x / 100000}L`);

/**
 * @param {object} p profile: { residency:'RESIDENT'|'NRI', age, regime:'NEW'|'OLD' }
 * @param {object} inc income heads (annual ₹)
 * @param {object} ded deductions/investments (annual ₹) — used by OLD regime mostly
 */
export function computeRegime(regime, p, inc, ded) {
  const isNRI = p.residency === "NRI";
  const salary = Math.max(0, inc.salary || 0);
  const stdDed = salary > 0 ? (regime === "NEW" ? 75000 : 50000) : 0;

  // House property: 30% standard deduction on rent; loan interest set-off (loss capped ₹2L)
  const rent = Math.max(0, inc.rentalAnnual || 0);
  const hpInterest = Math.max(0, ded.homeLoanInterest || 0);
  const allowLoanInterest = regime === "OLD" || rent > 0; // new regime: only against let-out income
  let houseProp = rent * 0.7 - (allowLoanInterest ? hpInterest : 0);
  houseProp = Math.max(houseProp, regime === "OLD" ? -200000 : (rent > 0 ? Math.max(-0, rent * 0.7 - hpInterest) : 0));
  if (regime === "NEW" && houseProp < 0) houseProp = 0;   // no HP loss set-off in new regime

  const business = Math.max(0, inc.business || 0) + Math.max(0, inc.fnoGains || 0); // F&O = non-speculative business income
  const dividends = Math.max(0, inc.dividends || 0);
  const nroInterest = isNRI ? Math.max(0, inc.nroInterest || 0) : 0;
  const nreInterest = isNRI ? Math.max(0, inc.nreInterest || 0) : 0;   // EXEMPT
  const otherInterest = Math.max(0, inc.otherInterest || 0);

  // Chapter VI-A — old regime only (new regime keeps employer NPS 80CCD(2))
  let deductions = 0;
  const dedLines = [];
  if (regime === "OLD") {
    const c80 = clamp(ded.sec80C || 0, 0, 150000);
    const d80 = clamp(ded.sec80D || 0, 0, p.age >= 60 ? 100000 : 75000);
    const nps = clamp(ded.nps80CCD1B || 0, 0, 50000);
    const g80 = clamp(ded.donations80G || 0, 0, 1e9);
    if (c80) dedLines.push({ code: "80C", label: "ELSS/EPF/PPF/LIC etc.", amount: c80 });
    if (d80) dedLines.push({ code: "80D", label: "Health insurance premium", amount: d80 });
    if (nps) dedLines.push({ code: "80CCD(1B)", label: "NPS self contribution", amount: nps });
    if (g80) dedLines.push({ code: "80G", label: "Eligible donations", amount: g80 });
    deductions = c80 + d80 + nps + g80;
  }
  const npsEmployer = clamp(ded.npsEmployer || 0, 0, salary * (regime === "NEW" ? 0.14 : 0.10));
  if (npsEmployer) dedLines.push({ code: "80CCD(2)", label: "Employer NPS (both regimes)", amount: Math.round(npsEmployer) });

  // ------- normal (slab-rate) income -------
  const grossSlabIncome = salary - stdDed + houseProp + business + dividends + nroInterest + otherInterest - npsEmployer;
  const slabIncome = Math.max(0, grossSlabIncome - deductions);

  // ------- special-rate income -------
  const stcgEq = Math.max(0, inc.stcgEquity || 0);                       // 111A @20%
  const ltcgEqGross = Math.max(0, inc.ltcgEquity || 0);                  // 112A @12.5% over 1.25L
  const ltcgEqTaxable = Math.max(0, ltcgEqGross - 125000);
  const ltcgOther = Math.max(0, inc.ltcgOther || 0);                     // 112 @12.5%

  const { tax: baseSlabTax, lines: slabLines } = slabTax(slabIncome, regime === "NEW" ? NEW_SLABS : OLD_SLABS(isNRI ? 0 : p.age || 0));
  const stcgTax = stcgEq * 0.20;
  const ltcgTax = (ltcgEqTaxable + ltcgOther) * 0.125;

  // ------- 87A rebate (residents only; not on special-rate income) -------
  let rebate = 0;
  const totalIncome = slabIncome + stcgEq + ltcgEqGross + ltcgOther;
  if (!isNRI) {
    if (regime === "NEW" && slabIncome <= 1200000) rebate = Math.min(baseSlabTax, 60000);
    if (regime === "OLD" && slabIncome <= 500000) rebate = Math.min(baseSlabTax, 12500);
    // marginal relief just above ₹12L (new regime)
    if (regime === "NEW" && slabIncome > 1200000) {
      const excess = slabIncome - 1200000;
      if (baseSlabTax > excess) rebate = baseSlabTax - excess;
    }
  }

  let taxBeforeSurcharge = Math.max(0, baseSlabTax - rebate) + stcgTax + ltcgTax;

  // ------- surcharge with CG cap & marginal relief (simplified) -------
  let surchargeRate = 0;
  if (totalIncome > 50000000 && regime === "OLD") surchargeRate = 0.37;
  else if (totalIncome > 20000000) surchargeRate = 0.25;
  else if (totalIncome > 10000000) surchargeRate = 0.15;
  else if (totalIncome > 5000000) surchargeRate = 0.10;
  const cgTax = stcgTax + ltcgTax;
  const cgSurcharge = cgTax * Math.min(surchargeRate, 0.15);            // CG surcharge capped 15%
  const otherSurcharge = (taxBeforeSurcharge - cgTax) * surchargeRate;
  const surcharge = surchargeRate ? cgSurcharge + otherSurcharge : 0;

  const cess = (taxBeforeSurcharge + surcharge) * 0.04;
  const total = Math.round(taxBeforeSurcharge + surcharge + cess);

  return {
    regime, fy: FY,
    heads: {
      salary: Math.round(salary), standardDeduction: stdDed,
      houseProperty: Math.round(houseProp), business: Math.round(business),
      dividends, interest: Math.round(otherInterest + nroInterest),
      nreInterestExempt: Math.round(nreInterest),
      stcgEquity: Math.round(stcgEq), ltcgEquity: Math.round(ltcgEqGross),
      ltcgExemptionUsed: Math.min(125000, ltcgEqGross), ltcgOther: Math.round(ltcgOther),
    },
    deductions: dedLines, deductionsTotal: Math.round(deductions + npsEmployer),
    slabIncome: Math.round(slabIncome), slabLines,
    tax: {
      slab: Math.round(baseSlabTax), rebate87A: Math.round(rebate),
      stcg: Math.round(stcgTax), ltcg: Math.round(ltcgTax),
      surcharge: Math.round(surcharge), surchargeRatePct: surchargeRate * 100,
      cess: Math.round(cess), total,
    },
    effectiveRatePct: totalIncome > 0 ? round2((total / totalIncome) * 100) : 0,
    totalIncome: Math.round(totalIncome),
  };
}

export function compare(p, inc, ded) {
  const NEW = computeRegime("NEW", p, inc, ded);
  const OLD = computeRegime("OLD", p, inc, ded);
  const better = NEW.tax.total <= OLD.tax.total ? "NEW" : "OLD";
  return { NEW, OLD, better, savings: Math.abs(NEW.tax.total - OLD.tax.total) };
}

/** Ranked, quantified tax-saving recommendations. */
export function recommendations(p, inc, ded, cmp, ctx = {}) {
  const recs = [];
  const isNRI = p.residency === "NRI";
  const marginal = (reg) => {
    const si = reg.slabIncome;
    if (reg.regime === "NEW") return si > 2400000 ? 0.30 : si > 2000000 ? 0.25 : si > 1600000 ? 0.20 : si > 1200000 ? 0.15 : si > 800000 ? 0.10 : 0.05;
    return si > 1000000 ? 0.30 : si > 500000 ? 0.20 : 0.05;
  };

  if (cmp.savings > 1000)
    recs.push({
      id: "regime", impact: cmp.savings, title: `Opt for the ${cmp.better} tax regime`,
      detail: `For ${FY}, the ${cmp.better} regime saves you ₹${cmp.savings.toLocaleString("en-IN")} vs the ${cmp.better === "NEW" ? "OLD" : "NEW"} regime on your current income mix. Salaried taxpayers may switch regimes every year while filing.`,
    });

  if (!isNRI || true) { // NRIs can also invest under 80C (not PPF fresh a/c); keep with caveat
    const c80Gap = Math.max(0, 150000 - (ded.sec80C || 0));
    if (c80Gap > 0 && cmp.better === "OLD")
      recs.push({
        id: "80c", impact: Math.round(c80Gap * marginal(cmp.OLD) * 1.04),
        title: `Fill the ₹${c80Gap.toLocaleString("en-IN")} gap in Section 80C`,
        detail: `ELSS funds have the shortest lock-in (3 years) among 80C options${isNRI ? " and are NRI-eligible (PPF fresh accounts are not permitted for NRIs)" : "; PPF/EPF/NPS also qualify"}. At your marginal rate this saves ≈₹${Math.round(c80Gap * marginal(cmp.OLD) * 1.04).toLocaleString("en-IN")} (old regime only). ${ctx.topElss ? `Top-ranked ELSS on the platform: ${ctx.topElss}.` : ""}`,
      });
    const npsGap = Math.max(0, 50000 - (ded.nps80CCD1B || 0));
    if (npsGap > 0 && cmp.better === "OLD" && !isNRI)
      recs.push({
        id: "nps", impact: Math.round(npsGap * marginal(cmp.OLD) * 1.04),
        title: `Invest ₹${npsGap.toLocaleString("en-IN")} more in NPS u/s 80CCD(1B)`,
        detail: `The exclusive ₹50,000 NPS window sits over and above 80C — worth ≈₹${Math.round(npsGap * marginal(cmp.OLD) * 1.04).toLocaleString("en-IN")} at your marginal rate under the old regime.`,
      });
  }

  if ((ded.sec80D || 0) === 0 && cmp.better === "OLD")
    recs.push({ id: "80d", impact: Math.round(25000 * marginal(cmp.OLD) * 1.04), title: "Claim health-insurance premium under 80D", detail: "Premiums up to ₹25,000 (₹50,000 for senior-citizen parents, claimable additionally) are deductible in the old regime — and the cover itself closes a protection gap." });

  const harvestRoom = Math.max(0, 125000 - (inc.ltcgEquity || 0));
  if (harvestRoom > 0 && (ctx.unrealizedLtcg ?? 0) > 0)
    recs.push({
      id: "harvest", impact: Math.round(Math.min(harvestRoom, ctx.unrealizedLtcg) * 0.125),
      title: `Harvest ₹${Math.min(harvestRoom, ctx.unrealizedLtcg).toLocaleString("en-IN")} of long-term gains tax-free`,
      detail: `You have ₹${Math.round(ctx.unrealizedLtcg).toLocaleString("en-IN")} of unrealised LTCG in equities/equity MFs and ₹${harvestRoom.toLocaleString("en-IN")} of unused 112A exemption this FY. Sell and immediately re-buy (resetting cost basis) to lock the exemption — saves 12.5% on the harvested amount in future.`,
    });

  if ((inc.fnoGains || 0) > 0)
    recs.push({ id: "fno", impact: 0, title: "F&O is business income — maintain books", detail: "F&O profit is taxed at slab as non-speculative business income. Claim direct expenses (brokerage, data, advisory), consider presumptive 44AD only if eligible, and note tax-audit thresholds. Losses set off against all heads except salary and carry forward 8 years." });

  if (isNRI) {
    if ((inc.nroInterest || 0) > 0)
      recs.push({ id: "nre", impact: Math.round((inc.nroInterest || 0) * 0.3), title: "Shift NRO balances to NRE where the money is repatriable", detail: "NRE interest is fully tax-exempt in India while NRO interest suffers ~30% TDS u/s 195. Funds that are repatriable (foreign earnings) belong in NRE. NRO→NRE transfers are allowed up to USD 1M/yr with Form 15CA/CB." });
    recs.push({ id: "dtaa", impact: 0, title: `Use the ${ctx.dtaaCountry || "residence-country"} DTAA`, detail: `File Form 10F + Tax Residency Certificate to claim treaty rates (e.g., lower TDS on dividends/interest) and avoid double taxation via the credit method in your residence country. NRO deposit TDS can often be reduced below 30% under the treaty.` });
    recs.push({ id: "rnor", impact: 0, title: "Plan your return using RNOR status", detail: "On returning to India you may qualify as Resident-but-Not-Ordinarily-Resident for up to ~3 years — foreign income generally stays non-taxable in India during RNOR. Sequence FD maturities and ESOP sales into those years." });
  }

  return recs.sort((a, b) => b.impact - a.impact);
}
