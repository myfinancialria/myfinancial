// ---------------------------------------------------------------------------
// nri.mjs — the NRI knowledge engine.
//
// One module holding everything the site knows about non-resident Indian
// money: the residency tests, the withholding rates, the treaty ceilings, the
// repatriation limits, and the corridor-specific rules for the five places
// Indians actually live and earn — the US, Canada, the Gulf, Australia and
// New Zealand.
//
// WHY THIS IS A SHARED ENGINE AND NOT PAGE CONTENT
// The same numbers drive four different things: the searchable answer cards,
// the residency wizard, the withholding comparator and the property-sale
// calculator. Written once here, they cannot disagree with each other. This is
// the same discipline as tax.mjs — a rate change edits one line and every
// surface moves.
//
// THE ONE FACT THAT DATES EVERYTHING ELSE
// The Income-tax Act, 1961 ceased to be the law on 1 April 2026. It was
// replaced by the Income-tax Act, 2025 with the Income-tax Rules, 2026. The
// RATES did not change; every section and form number did. Content written
// before that cites dead sections, so SECTION_MAP and FORM_MAP below are
// carried as first-class searchable data rather than as footnotes.
//
// WHAT IS DELIBERATELY NOT HERE
// Point-in-time figures that rot: bank deposit rates, FX levels, fund NAVs.
// This file carries statutory structure, which stays true until a Finance Act
// moves it, and each card names the source that has to be re-checked.
// ---------------------------------------------------------------------------

export const TAX_YEAR = "2026-27";
export const LAW = "Income-tax Act, 2025 · Income-tax Rules, 2026 · Finance Act, 2026";

/* ===========================================================================
   CORRIDORS — the five places, and the single fact that shapes each one
   =========================================================================== */

export const CORRIDORS = {
  us: {
    key: "us", label: "United States", short: "US", flag: "🇺🇸",
    residents: "~5.4 million people of Indian origin",
    oneLine: "Worldwide tax, worldwide reporting, and Indian mutual funds are radioactive.",
    personalTax: true,
    ftc: true,
    indianFundsSafe: false,
    reporting: "heavy",
    ssa: false,
    estateRisk: "high",
    why: "PFIC rules turn an Indian mutual fund into a punitive, form-heavy holding. FBAR and Form 8938 apply to Indian accounts. There is no social security totalisation agreement, so up to ten years of payroll contributions can be forfeited.",
  },
  canada: {
    key: "canada", label: "Canada", short: "Canada", flag: "🇨🇦",
    residents: "~1.9 million people of Indian origin",
    oneLine: "Leaving triggers a tax on gains you never realised, and India gives no credit for it.",
    personalTax: true,
    ftc: true,
    indianFundsSafe: false,
    reporting: "heavy",
    ssa: true,
    estateRisk: "medium",
    why: "Residence is a facts-and-circumstances test, not a day count. Departure triggers a deemed disposition under s.128.1. T1135 catches Indian accounts above CAD 100,000 of cost.",
  },
  gulf: {
    key: "gulf", label: "Middle East", short: "Gulf", flag: "🇦🇪",
    residents: "~9 million Indians across the GCC",
    oneLine: "No personal income tax — so Indian withholding is a final cost with no credit anywhere.",
    personalTax: false,
    ftc: false,
    indianFundsSafe: true,
    reporting: "none",
    ssa: false,
    estateRisk: "low",
    why: "Zero personal income tax means India's exemptions are pure gain and the whole Indian product shelf is usable. It also means tax withheld in India can never be recovered, which makes the TRC and the lower-deduction certificate worth more here than anywhere else.",
  },
  australia: {
    key: "australia", label: "Australia", short: "Australia", flag: "🇦🇺",
    residents: "~1 million people of Indian origin",
    oneLine: "The temporary-resident window keeps Indian income out of the Australian net — until PR.",
    personalTax: true,
    ftc: true,
    indianFundsSafe: true,
    reporting: "medium",
    ssa: true,
    estateRisk: "low",
    why: "Temporary residents are generally not taxed on foreign income and are treated as foreign residents for CGT. The day permanent residency is granted, Indian income becomes fully assessable — which makes the PR grant date a planning date.",
  },
  nz: {
    key: "nz", label: "New Zealand", short: "NZ", flag: "🇳🇿",
    residents: "~290,000 people of Indian origin",
    oneLine: "Four years of foreign income free, then a deemed-return tax on foreign shares.",
    personalTax: true,
    ftc: true,
    indianFundsSafe: true,
    reporting: "medium",
    ssa: false,
    estateRisk: "low",
    why: "The transitional-resident exemption runs 48 months and covers most foreign income. When it ends the FIF regime taxes roughly 5% of the opening value of foreign shares whatever they actually returned.",
  },
};

export const CORRIDOR_KEYS = Object.keys(CORRIDORS);

/* ===========================================================================
   WITHHOLDING — India's domestic rate against each treaty ceiling

   Domestic rates for a non-resident carry surcharge and 4% cess on top. A
   treaty rate does NOT: the ceiling in the article is the whole tax. That is
   why a 15% treaty rate beats a 30% domestic rate by much more than half.

   The split rates in the treaties are the trap. The lower figure in a dividend
   article is for a COMPANY holding ≥10% of the payer; the lower figure in an
   interest article is for a BANK lending in the ordinary course. An individual
   NRI gets the higher figure — which for US and Canadian dividends is WORSE
   than India's own domestic rate.
   =========================================================================== */

export const INCOME_TYPES = {
  nroInterest: {
    key: "nroInterest", label: "NRO deposit interest", short: "NRO interest",
    domestic: 30, surcharge: true,
    note: "No ₹40,000/₹50,000 threshold and no Form 15G/15H for a non-resident — TDS applies from the first rupee.",
  },
  dividend: {
    key: "dividend", label: "Dividend from an Indian company", short: "Dividend",
    domestic: 20, surcharge: true,
    note: "The treaty's lower dividend figure is for corporate shareholders holding ≥10%. An individual gets the higher one.",
  },
  rent: {
    key: "rent", label: "Rent from Indian property", short: "Rent",
    domestic: 30, surcharge: true,
    note: "The tenant deducts under s.393(2) and needs a TAN — the resident-landlord provisions do not apply.",
  },
  ltcgEquity: {
    key: "ltcgEquity", label: "Long-term gain, listed equity", short: "LTCG equity",
    domestic: 12.5, surcharge: true, treatyRarelyHelps: true,
    note: "First ₹1.25 lakh a year is exempt. Most treaties leave India free to tax gains on Indian assets.",
  },
  stcgEquity: {
    key: "stcgEquity", label: "Short-term gain, listed equity", short: "STCG equity",
    domestic: 20, surcharge: true, treatyRarelyHelps: true,
    note: "An NRI cannot set the basic exemption limit against this — tax starts at the first rupee of gain.",
  },
  ltcgProperty: {
    key: "ltcgProperty", label: "Long-term gain, property", short: "LTCG property",
    domestic: 12.5, surcharge: true, treatyRarelyHelps: true,
    note: "No indexation for an NRI at all — the grandfathered 20%-with-indexation option is resident-only.",
  },
  nreInterest: {
    key: "nreInterest", label: "NRE / FCNR deposit interest", short: "NRE interest",
    domestic: 0, surcharge: false, exempt: true,
    note: "Exempt in India while you are a non-resident under FEMA. Fully taxable in the US, Canada, Australia and NZ — with no Indian tax to credit.",
  },
};

/** Treaty ceilings on India's tax, per corridor. Individual-applicable figure first. */
export const TREATY = {
  us: { dividend: 25, nroInterest: 15, rent: null, royalty: 15, fts: 15,
        trc: "IRS Form 6166, applied for on Form 8802 — allow 6-8 weeks",
        corporateDividend: 15, bankInterest: 10 },
  canada: { dividend: 25, nroInterest: 15, rent: null, royalty: 15, fts: 15,
        trc: "CRA certificate of residency",
        corporateDividend: 15, bankInterest: 10 },
  gulf: { dividend: 10, nroInterest: 12.5, rent: null, royalty: 10, fts: null,
        trc: "UAE FTA tax residency certificate — the 183-day route, NOT the 90-day one",
        corporateDividend: 10, bankInterest: 5,
        note: "Figures are the India-UAE treaty. Saudi Arabia is 5% on dividends and 10% on interest; Qatar, Kuwait, Bahrain and Oman are 10% and 10%. Neither the UAE nor the Saudi treaty has a fees-for-technical-services article at all, so service fees fall to business profits and are taxable in India only through a permanent establishment." },
  australia: { dividend: 15, nroInterest: 15, rent: null, royalty: 15, fts: 15,
        trc: "ATO certificate of residency",
        corporateDividend: 15, bankInterest: 15 },
  nz: { dividend: 15, nroInterest: 10, rent: null, royalty: 10, fts: 10,
        trc: "IRD certificate of residency",
        corporateDividend: 15, bankInterest: 10 },
};

/* --------------------------------- maths --------------------------------- */

/** Surcharge on a non-resident payment, by the size of that payment. */
export function surchargeRate(amount, isCapitalGain = false) {
  let sc = amount > 2e7 ? 25 : amount > 1e7 ? 15 : amount > 5e6 ? 10 : 0;
  if (isCapitalGain && sc > 15) sc = 15;   // ss.196/197 gains and dividends cap at 15%
  return sc;
}

/** India's effective domestic rate on a payment, surcharge and 4% cess included. */
export function domesticEffective(baseRate, amount, isCapitalGain = false) {
  const sc = surchargeRate(amount, isCapitalGain);
  return baseRate * (1 + sc / 100) * 1.04;
}

/**
 * Which rate an individual NRI actually pays on one income stream.
 *
 * s.159 [old s.90] gives the taxpayer whichever is MORE BENEFICIAL, compared
 * per stream — never blanket. This returns both sides and says which wins,
 * because for US and Canadian dividends the treaty genuinely loses.
 */
export function ratePick(incomeKey, corridor, amount = 1e6) {
  const t = INCOME_TYPES[incomeKey];
  if (!t) return null;
  const isCG = /ltcg|stcg/i.test(incomeKey);
  if (t.exempt) {
    return { exempt: true, domestic: 0, treaty: null, effective: 0, winner: "exempt",
             label: t.label, note: t.note };
  }
  const domestic = t.surcharge ? domesticEffective(t.domestic, amount, isCG) : t.domestic;
  const treaty = TREATY[corridor]?.[incomeKey] ?? null;
  const treatyWins = treaty !== null && treaty < domestic;
  return {
    exempt: false,
    label: t.label,
    domesticBase: t.domestic,
    domestic,
    treaty,
    effective: treatyWins ? treaty : domestic,
    winner: treaty === null ? "domestic-only" : treatyWins ? "treaty" : "domestic",
    saving: treatyWins ? domestic - treaty : 0,
    rupees: amount * ((treatyWins ? domestic - treaty : 0) / 100),
    note: t.note,
    treatyNote: TREATY[corridor]?.note,
    trc: TREATY[corridor]?.trc,
    rarely: !!t.treatyRarelyHelps,
  };
}

/* ===========================================================================
   RESIDENCY — s.6, carried into the 2025 Act unchanged

   The tests are mechanical, which is exactly why people get them wrong: they
   reason about intent ("I live in Dubai") when the statute counts days. This
   returns the STATUS and the PATH taken to it, so the wizard can show its
   working rather than just an answer.
   =========================================================================== */

export function residency({
  daysThisYear = 0,
  daysPrior4 = 0,
  daysPrior7 = 0,
  nonResident9of10 = true,
  indianIncomeOver15L = false,
  category = "other",          // "employment" | "visiting" | "other"
  indianCitizen = true,
  liableToTaxAbroad = true,
} = {}) {
  const path = [];
  let resident = false, forcedRnor = false;

  if (daysThisYear >= 182) {
    resident = true;
    path.push({ test: "182-day test", result: true, detail: `${daysThisYear} days in India this tax year — 182 or more makes you resident outright.` });
  } else {
    path.push({ test: "182-day test", result: false, detail: `${daysThisYear} days in India, below 182.` });

    if (daysPrior4 >= 365) {
      let threshold = 60, why = "the ordinary 60-day limb";
      if (category === "employment") { threshold = 182; why = "you left India for employment abroad, which relaxes the 60-day limb to 182"; }
      else if (category === "visiting") {
        if (indianIncomeOver15L) { threshold = 120; why = "you are a citizen or PIO visiting India with Indian income above ₹15 lakh, so the limb is 120 days"; }
        else { threshold = 182; why = "you are a citizen or PIO visiting India with Indian income at or below ₹15 lakh, which relaxes the limb to 182"; }
      }
      const hit = daysThisYear >= threshold;
      path.push({ test: `${threshold}-day + 365-day test`, result: hit,
        detail: `${daysPrior4} days across the four preceding years is 365 or more, and ${why}. You were here ${daysThisYear} days against that ${threshold}-day threshold.` });
      if (hit) {
        resident = true;
        if (category === "visiting" && indianIncomeOver15L && daysThisYear < 182) {
          forcedRnor = true;
          path.push({ test: "120-day carve-out", result: true, detail: "Caught by the 120-day rule, you are classified RNOR by statute — foreign income stays outside India's net." });
        }
      }
    } else {
      path.push({ test: "365-day-in-4-years test", result: false, detail: `${daysPrior4} days across the four preceding years is below 365, so the second limb cannot apply.` });
    }
  }

  let deemed = false;
  if (!resident && indianCitizen && indianIncomeOver15L && !liableToTaxAbroad) {
    resident = true; deemed = true; forcedRnor = true;
    path.push({ test: "Deemed residency", result: true,
      detail: "An Indian citizen with Indian income above ₹15 lakh who is not liable to tax anywhere else is deemed resident — but lands in RNOR, so foreign income is still not taxed here." });
  } else if (!resident && indianCitizen && indianIncomeOver15L) {
    path.push({ test: "Deemed residency", result: false,
      detail: "You are liable to tax in your country of residence, so the deemed-residency rule does not reach you. A treaty-purpose TRC is the evidence that supports this." });
  }

  if (!resident) {
    return { status: "NR", label: "Non-Resident", path,
      scope: "India taxes only income received, accruing or arising in India, or deemed to accrue here under s.9. Foreign salary and foreign investment income are outside the net.",
      tone: "up" };
  }

  const rnor = forcedRnor || nonResident9of10 || daysPrior7 <= 729;
  if (rnor) {
    path.push({ test: "RNOR test", result: true,
      detail: forcedRnor ? "Statutorily RNOR by the route above."
        : nonResident9of10 ? "Non-resident in 9 of the 10 preceding years — RNOR."
        : `Only ${daysPrior7} days in India across the 7 preceding years, which is 729 or fewer — RNOR.` });
    return { status: "RNOR", label: "Resident but Not Ordinarily Resident", path,
      scope: "India taxes your Indian income plus foreign income only from a business controlled in, or a profession set up in, India. Everything else foreign stays out — and no Schedule FA foreign-asset disclosure is required yet. This is the most valuable status in Indian tax and it typically lasts two to three years.",
      tone: "warn" };
  }

  path.push({ test: "RNOR test", result: false,
    detail: `You were resident in more than 1 of the last 10 years and spent ${daysPrior7} days here over 7 years — above 729. Ordinarily resident.` });
  return { status: "ROR", label: "Resident and Ordinarily Resident", path,
    scope: "India taxes your WORLDWIDE income, and Schedule FA disclosure of every foreign asset and account becomes mandatory. Omissions carry Black Money Act penalties of ₹10 lakh per year per asset.",
    tone: "down" };
}

/* ===========================================================================
   PROPERTY SALE — the largest recoverable cash leak in NRI finance

   TDS on a sale by a non-resident is computed on the FULL SALE CONSIDERATION,
   not on the gain. On a long-held property that withholds several times the
   tax actually due, and the difference sits with the department until the
   refund arrives. A lower-deduction certificate fixes it. This function exists
   to put a rupee figure on that gap, because the abstract rule does not
   persuade anyone and the number does.
   =========================================================================== */

export function propertySale({ cost = 0, improvements = 0, sale = 0, months = 60, expenses = 0 }) {
  const longTerm = months > 24;
  const gain = Math.max(0, sale - cost - improvements - expenses);
  const isCG = true;

  const taxRate = longTerm ? 12.5 : 30;           // short-term is slab; 30% is the top slab
  const scOnGain = surchargeRate(gain, isCG);
  const taxDue = gain * (taxRate / 100) * (1 + scOnGain / 100) * 1.04;

  const scOnSale = surchargeRate(sale, isCG);
  const tdsRate = (longTerm ? 12.5 : 30) * (1 + scOnSale / 100) * 1.04;
  const tdsWithheld = sale * (tdsRate / 100);

  const blocked = Math.max(0, tdsWithheld - taxDue);
  return {
    longTerm, gain, taxRate, taxDue,
    tdsRate, tdsWithheld, blocked,
    blockedPct: tdsWithheld ? (blocked / tdsWithheld) * 100 : 0,
    // A sale in, say, June is refunded after the next year's return is processed.
    idleMonths: 14,
    carryCost: blocked * 0.07 * (14 / 12),
    indexationDenied: longTerm,
  };
}

/* ===========================================================================
   REPATRIATION — the USD 1 million bucket, and what does not go into it
   =========================================================================== */

export const REPAT_SOURCES = {
  nre:      { key: "nre",      label: "NRE account balance",              capped: false, forms: ["Form A2"], note: "Fully repatriable, no cap, no approval." },
  fcnr:     { key: "fcnr",     label: "FCNR(B) deposit",                  capped: false, forms: ["Form A2"], note: "Fully repatriable on maturity or premature withdrawal." },
  current:  { key: "current",  label: "Current income — rent, dividend, interest, pension", capped: false, forms: ["Form 145", "Form 146"], note: "Remittable without any monetary limit, and OUTSIDE the USD 1M cap. Most NRIs do not know this and needlessly spend their allowance on rent." },
  nro:      { key: "nro",      label: "NRO capital — sale proceeds, inheritance, legacy", capped: true, forms: ["Form 145", "Form 146", "Form A2"], note: "Capped at USD 1,000,000 per financial year. The limit resets on 1 April, so a large remittance can legitimately be split across two years." },
  property: { key: "property", label: "Sale proceeds of residential property bought with NRE/FCNR funds", capped: "partial", forms: ["Form 145", "Form 146", "Form A2"], note: "The amount originally remitted is repatriable for up to TWO residential properties. Gains above that, and any third property, go through the USD 1M route." },
};

export const REPAT_CAP_USD = 1_000_000;

export function repatriationPlan({ amountUsd = 0, source = "nro", usedThisYearUsd = 0 }) {
  const s = REPAT_SOURCES[source];
  if (!s) return null;
  if (s.capped !== true) {
    return { source: s, capped: false, fits: true, remaining: null, forms: s.forms,
      verdict: "No annual cap applies to this route.", split: null };
  }
  const remaining = Math.max(0, REPAT_CAP_USD - usedThisYearUsd);
  const fits = amountUsd <= remaining;
  const overflow = Math.max(0, amountUsd - remaining);
  return {
    source: s, capped: true, fits, remaining, overflow, forms: s.forms,
    verdict: fits
      ? `Fits inside this financial year's allowance, with USD ${(remaining - amountUsd).toLocaleString("en-US")} left over.`
      : `Exceeds the allowance by USD ${overflow.toLocaleString("en-US")}. Remit USD ${remaining.toLocaleString("en-US")} now and the balance on or after 1 April, when the limit resets.`,
    split: fits ? null : [{ when: "This financial year", usd: remaining }, { when: "On or after 1 April", usd: overflow }],
  };
}

/* ===========================================================================
   THE RENUMBERING — searchable in BOTH directions

   Every NRI who has ever read a tax article knows "Section 195" and "Form
   10F". Both are dead names as of 1 April 2026. Searching the old number has
   to find the new one, or the search engine is useless to the people who need
   it most.
   =========================================================================== */

export const SECTION_MAP = [
  ["6", "6", "Residence in India — unchanged, including the 182/60+365/120-day tests"],
  ["9", "9", "Income deemed to accrue or arise in India — unchanged"],
  ["10", "11 + Schedules II-VII", "Exemptions, moved into schedules"],
  ["47", "70", "Transactions not regarded as transfer"],
  ["48", "72", "Mode of computation of capital gains"],
  ["54", "82", "Gain on a residential house reinvested in another house in India"],
  ["54EC", "85", "Gain on land or building invested in NHAI/REC/PFC/IRFC bonds"],
  ["54F", "86", "Gain on any long-term asset reinvested in a residential house in India"],
  ["80C", "123", "Life insurance, PPF, ELSS and the rest of the old-regime basket"],
  ["80D", "126", "Health insurance premium"],
  ["80E", "129", "Interest on an education loan"],
  ["80G", "133", "Donations"],
  ["87A", "157", "Rebate — raised to ₹60,000, and available to RESIDENTS ONLY"],
  ["90 / 90A / 91", "159 / 160", "Double taxation relief and unilateral relief"],
  ["111A", "196", "Short-term gain on STT-paid listed equity — 20%"],
  ["112 / 112A", "197", "Capital gains rates generally — 12.5% long-term"],
  ["115C-115I", "212-218", "The special regime for NRIs holding foreign-exchange assets"],
  ["139", "263", "Return of income"],
  ["140A", "266", "Self-assessment"],
  ["195", "393(2)", "TDS on payments to non-residents — the one every NRI meets"],
];

export const FORM_MAP = [
  ["10F", "41", "Treaty self-declaration filed with the TRC — Rule 75, implementing s.159(8). Filed electronically; a PAN is not mandatory."],
  ["67", "44", "Foreign tax credit statement — must be filed BEFORE the return, or the credit is denied."],
  ["15CA", "145", "Remitter's declaration for an outward remittance."],
  ["15CB", "146", "Chartered accountant's certificate, required for taxable transfers above ₹5 lakh."],
  ["16", "130", "TDS certificate — salary, pension, interest."],
  ["16A", "131", "TDS certificate — non-salary payments."],
  ["24Q", "138", "Quarterly TDS statement — salary."],
  ["26Q", "140", "Quarterly TDS statement — other resident payments."],
  ["27Q", "144", "Quarterly TDS statement — payments to NON-RESIDENTS. This is the one your tenant or property buyer files."],
  ["26AS", "168", "Annual information statement — check it against your own records every quarter."],
  ["3CA/3CB/3CD", "26", "Tax audit report."],
];

/* ===========================================================================
   THE CORRIDOR MATRIX — one screen that answers "where do I stand?"
   =========================================================================== */

export const MATRIX_ROWS = [
  { key: "personalTax", label: "Personal income tax at home",
    get: (c) => (c.personalTax ? { v: "Yes", tone: "down" } : { v: "None", tone: "up" }) },
  { key: "ftc", label: "Credit for Indian tax paid",
    get: (c) => (c.ftc ? { v: "Available", tone: "up" } : { v: "None — Indian tax is a final cost", tone: "warn" }) },
  { key: "indianFundsSafe", label: "Indian mutual funds usable",
    get: (c) => (c.indianFundsSafe ? { v: "Yes", tone: "up" } : { v: "No — punitive", tone: "down" }) },
  { key: "reporting", label: "Foreign-asset reporting burden",
    get: (c) => ({ v: c.reporting === "heavy" ? "Heavy" : c.reporting === "medium" ? "Moderate" : "None",
                   tone: c.reporting === "heavy" ? "down" : c.reporting === "medium" ? "warn" : "up" }) },
  { key: "ssa", label: "Social security agreement with India",
    get: (c) => (c.ssa ? { v: "Yes", tone: "up" } : { v: "No", tone: "down" }) },
  { key: "estateRisk", label: "Estate / death-tax exposure",
    get: (c) => ({ v: c.estateRisk === "high" ? "High" : c.estateRisk === "medium" ? "Medium" : "Low",
                   tone: c.estateRisk === "high" ? "down" : c.estateRisk === "medium" ? "warn" : "up" }) },
];

/* ===========================================================================
   THE RETURN TIMELINE — sequencing, because most of it can only be done early
   =========================================================================== */

export const RETURN_TIMELINE = [
  { at: "T−36 months", title: "Buy Indian health insurance", why: "Waiting periods start at issuance, not at arrival. Buy now and you land in India already through the 24-36 month pre-existing-disease clock.", tone: "warn" },
  { at: "T−24 months", title: "Compute your RNOR window", why: "Two to three tax years of foreign income staying outside India's net. The return date itself can add or remove a whole year of it — returning in early April rather than late March shifts the entire schedule.", tone: "accent" },
  { at: "T−12 months", title: "Realise foreign capital gains", why: "Sell appreciated foreign shares, funds, ESOPs and RSUs while foreign gains are outside India's reach. US residents: exit PFICs here, not later.", tone: "accent" },
  { at: "T−6 months", title: "Book FCNR(B) deposits, long tenor", why: "FCNR interest stays exempt right through the RNOR period — unlike NRE interest, which stops the day your FEMA status changes. You cannot open FCNR once resident.", tone: "up" },
  { at: "T−3 months", title: "Value every foreign asset; settle residency paperwork", why: "Canada deems a disposition on exit and Australia triggers CGT event I1. Decide on the US green card — keeping it means lifelong US worldwide tax from India.", tone: "warn" },
  { at: "Return day", title: "Record the date and every valuation", why: "FEMA residency changes immediately, on intent — not at the end of the tax year.", tone: "neutral" },
  { at: "T+2 weeks", title: "Redesignate accounts; open RFC", why: "NRE/NRO become resident accounts. Move NRE and FCNR balances into a Resident Foreign Currency account instead of letting the bank convert them to rupees. Banks rarely offer RFC — ask for it by name.", tone: "up" },
  { at: "RNOR years", title: "File on Indian income only", why: "Foreign income is not taxable and no Schedule FA disclosure is due. Keep the two income streams strictly separable in your records.", tone: "up" },
  { at: "ROR year", title: "The cliff", why: "Worldwide income becomes taxable, Schedule FA disclosure becomes mandatory, and RFC interest becomes taxable — all on the same day. Build the foreign-asset inventory twelve months before this.", tone: "down" },
];

/* ===========================================================================
   THE ANSWER CORPUS

   Each card answers one question the way it actually gets asked. `verdict` is
   what makes the search feel like an answer engine rather than a document
   search: the result leads with YES / NO / IT DEPENDS and the reason, and the
   detail follows underneath.

   `c` is the list of corridors a card is relevant to, or "all". Filtering by
   corridor is what turns a generic NRI encyclopaedia into something that
   speaks to the person reading it.
   =========================================================================== */

const C_ALL = "all";

export const CARDS = [
/* --------------------------------- residency ------------------------------ */
{ id: "res-who", topic: "residency", k: "answer", c: C_ALL,
  q: "Who counts as an NRI?",
  verdict: { v: "TWO DIFFERENT TESTS", tone: "warn" },
  a: "India runs two separate residency tests and they routinely disagree. The Income-tax Act decides what India can TAX you on, by a mechanical day count. FEMA decides what accounts and investments you may HOLD, by intent and purpose of stay. Someone who moves to Dubai on 1 September is a person resident outside India under FEMA that same week — and may still be resident under the Income-tax Act for that whole tax year.",
  tags: "nri definition meaning who is an nri fema income tax act difference resident non-resident status" },

{ id: "res-182", topic: "residency", k: "answer", c: C_ALL,
  q: "How many days can I stay in India without becoming a tax resident?",
  verdict: { v: "182 — OR 120 IF INDIAN INCOME > ₹15L", tone: "warn" },
  a: "You are resident if you spend 182 days or more in India in the tax year, or 60 days or more in the year plus 365 days across the four preceding years. That 60-day limb relaxes to 182 days for an Indian citizen who left for employment abroad, and for a citizen or PIO visiting India. But if you are visiting and your Indian income exceeds ₹15 lakh, the relaxation drops to 120 days. Both the day of arrival and the day of departure count.",
  tags: "182 days 120 days 60 days 365 four years day count how long stay india limit visit" },

{ id: "res-rnor", topic: "residency", k: "answer", c: C_ALL,
  q: "What is RNOR and why does everyone say it matters?",
  verdict: { v: "THE BEST STATUS IN INDIAN TAX", tone: "up" },
  a: "Resident but Not Ordinarily Resident. You qualify if you were non-resident in 9 of the 10 preceding years, or spent 729 days or fewer in India across the 7 preceding years. An RNOR pays Indian tax on Indian income only — foreign salary, foreign investment income and foreign capital gains stay outside the net — and files no Schedule FA foreign-asset disclosure. A returning NRI typically gets two to three years of it, and most people waste them.",
  tags: "rnor resident not ordinarily resident 729 days 9 out of 10 returning nri window foreign income" },

{ id: "res-deemed", topic: "residency", k: "trap", c: ["gulf"],
  q: "Does the deemed-residency rule make Gulf NRIs taxable in India?",
  verdict: { v: "RARELY — AND ONLY AS RNOR", tone: "up" },
  a: "The rule catches an INDIAN CITIZEN whose Indian income exceeds ₹15 lakh and who is not liable to tax in any other country by reason of domicile or residence. Three things blunt it: it does not apply to OCI holders with foreign citizenship, it needs Indian income above ₹15 lakh, and the status conferred is RNOR — so foreign income still is not taxed in India. A genuine UAE residence with a treaty-purpose TRC on the 183-day route is the defence.",
  tags: "deemed resident stateless indian 15 lakh gulf dubai uae not liable to tax anywhere citizen" },

{ id: "res-tiebreak", topic: "residency", k: "flow", c: C_ALL,
  q: "Both countries say I'm resident. Who wins?",
  a: "The treaty tie-breaker in Article 4 runs in strict order and stops at the first test that separates them.",
  steps: ["Permanent home available to you — if in only one state, that state wins",
          "Centre of vital interests — family, employment, where your affairs are administered",
          "Habitual abode",
          "Nationality",
          "Mutual agreement between the two tax authorities"],
  a2: "You need a TRC from the country you claim, plus Form 41. A tie-breaker settles treaty residence only — India's right to tax Indian-source income, and your filing obligation, survive it.",
  tags: "dual resident tie breaker article 4 permanent home centre of vital interests two countries both" },

/* --------------------------------- banking -------------------------------- */
{ id: "bank-which", topic: "banking", k: "table", c: C_ALL,
  q: "NRE or NRO — which account do I need?",
  verdict: { v: "BOTH, FOR DIFFERENT MONEY", tone: "accent" },
  a: "NRE takes foreign earnings only: interest is exempt in India, and the balance is fully repatriable with no cap and no approval. NRO takes Indian-source income — rent, dividends, pension, old deposits — where interest is taxable at roughly 31.2% TDS and repatriation runs through the USD 1 million route. Indian income credited to an NRE account is a FEMA contravention. Open both, with the same bank.",
  tags: "nre vs nro which account difference open bank account repatriable taxable interest" },

{ id: "bank-fcnr", topic: "banking", k: "answer", c: C_ALL,
  q: "What is FCNR and when is it better than an NRE deposit?",
  verdict: { v: "WHEN YOU WILL SPEND THE MONEY ABROAD", tone: "up" },
  a: "FCNR(B) is a term deposit of one to five years held in foreign currency, so rupee depreciation cannot touch the principal. Interest is exempt in India and — unlike NRE interest — the exemption survives into the RNOR period after you return. It yields less than an NRE rupee deposit, and that gap is the price of removing currency risk. For anyone returning to India, booking FCNR before landing is the single best-value pre-return action.",
  tags: "fcnr foreign currency deposit rupee risk depreciation dollar deposit term rnor exempt" },

{ id: "bank-rfc", topic: "banking", k: "answer", c: C_ALL,
  q: "What happens to my NRE account when I move back to India?",
  verdict: { v: "REDESIGNATE — AND ASK FOR RFC", tone: "warn" },
  a: "FEMA residency changes the day you return with intent to stay, so NRE and NRO must be redesignated as resident accounts. Rather than letting the bank convert your NRE and FCNR balances into rupees, credit them to a Resident Foreign Currency (RFC) account: it holds foreign currency in India, is fully repatriable, converts back to NRE/FCNR if you go abroad again, and its interest is exempt while you are RNOR. Banks almost never offer RFC — ask for it by name, before your deposits mature.",
  tags: "rfc resident foreign currency account returning nri convert nre nro redesignate move back" },

{ id: "bank-resident-acct", topic: "banking", k: "trap", c: C_ALL,
  q: "Can I keep my old resident savings account after moving abroad?",
  verdict: { v: "NO", tone: "down" },
  a: "A person resident outside India may not hold a resident savings account. It must be redesignated as NRO or closed. Keeping it open 'because UPI is easier' is a FEMA contravention with penalties up to three times the sum involved, and it typically surfaces at the worst moment — when a bank reconciles during a large property sale.",
  tags: "resident savings account keep old account fema violation penalty upi redesignate nro" },

{ id: "bank-2026rates", topic: "banking", k: "answer", c: C_ALL,
  q: "Why are NRE and FCNR rates unusually high right now?",
  verdict: { v: "RBI LIFTED THE CEILINGS — UNTIL 30 SEP 2026", tone: "up" },
  a: "By six Amendment Directions dated 17 June 2026 the RBI temporarily withdrew the interest-rate ceiling on FCNR(B) deposits of 3-to-5 year tenor and the cap on NRE deposit rates for 3-year-and-above tenors, across every category of bank, until 30 September 2026. NRO-to-NRE transfers are excluded. Rate-shop hard and lock long tenors while the relaxation holds.",
  tags: "rbi june 2026 rate ceiling withdrawn nre fcnr high rates deposit best rate september 2026" },

/* -------------------------------- investing ------------------------------- */
{ id: "inv-mf-us", topic: "investing", k: "trap", c: ["us"],
  q: "Can I invest in Indian mutual funds from the US?",
  verdict: { v: "LEGALLY YES — FINANCIALLY, DON'T", tone: "down" },
  a: "An Indian mutual fund is a PFIC. The default s.1291 regime taxes gains at the highest ordinary rate for each prior year plus a compounding interest charge; a mark-to-market election under s.1296 is usually the least-bad route; and QEF is effectively unavailable because Indian AMCs do not issue PFIC Annual Information Statements. You file Form 8621 per fund, per year. Hold individual Indian stocks, NRE/FCNR deposits, US-domiciled India funds, or GIFT City vehicles instead.",
  tags: "pfic mutual fund us america form 8621 1291 mark to market qef indian mutual fund usa nri invest" },

{ id: "inv-mf-canada", topic: "investing", k: "trap", c: ["canada"],
  q: "Are Indian mutual funds a problem for Canadian residents?",
  verdict: { v: "YES — T1135 PLUS s.94.1", tone: "down" },
  a: "Canada has no PFIC regime, but Indian mutual funds are specified foreign property for T1135 reporting and can fall within the offshore investment fund property rules in s.94.1, which impute income where a main reason for holding is tax deferral. Direct Indian equities, NRE/FCNR deposits and GIFT City products avoid both problems.",
  tags: "canada mutual fund t1135 offshore investment fund 94.1 specified foreign property indian funds" },

{ id: "inv-mf-how", topic: "investing", k: "answer", c: ["gulf", "australia", "nz"],
  q: "How do I invest in Indian mutual funds as an NRI?",
  verdict: { v: "STRAIGHTFORWARD FROM THIS CORRIDOR", tone: "up" },
  a: "Invest in rupees from an NRE account (redemption repatriable) or an NRO account (not repatriable). PAN, KYC and a FATCA/CRS declaration are mandatory; SEBI relaxed geo-tagging for NRI digital re-KYC in December 2025, so remote re-KYC is now workable. Keep repatriable and non-repatriable folios separate from day one — mixing them is painful to unwind. Unlike for residents, the AMC deducts TDS on your redemption.",
  tags: "how to invest mutual funds nri kyc fatca nre nro folio sip amc tds redemption" },

{ id: "inv-equity-pis", topic: "investing", k: "table", c: C_ALL,
  q: "PIS or non-PIS — how should an NRI buy Indian shares?",
  a: "PIS is the RBI reporting overlay that lets you buy listed equity on a repatriable basis through an NRE-PIS account: the bank reports trades and polices the caps, and charges for it. Non-PIS through an NRO account needs no permission, costs less and has fewer frictions — but the proceeds are non-repatriable except through the USD 1M route. If the capital came from abroad and might go back, use NRE-PIS. If it came from Indian rent or an inheritance, it is already NRO money — use non-PIS and save the fees.",
  a2: "Common to both: delivery only, no intraday, no short selling, 5% per-company limit per NRI. F&O only through a SEBI-registered custodian with a CP code, on a non-repatriable basis.",
  tags: "pis portfolio investment scheme non-pis nro demat trading shares equity intraday fno futures options" },

{ id: "inv-ppf", topic: "investing", k: "trap", c: C_ALL,
  q: "What happens to my PPF account after I become an NRI?",
  verdict: { v: "0% INTEREST SINCE 1 OCT 2024", tone: "down" },
  a: "You cannot open a new PPF account as an NRI, and an existing one runs to maturity but cannot be extended. Worse: under the Department of Economic Affairs guidance effective 1 October 2024 on irregular small-savings accounts, NRI-held PPF accounts opened under the 1968 scheme earned the post-office savings rate up to 30 September 2024 and 0% after that. If you are still holding one past maturity, it is earning nothing. Check the maturity date and take the money out.",
  tags: "ppf nri zero interest 0% october 2024 extend maturity public provident fund small savings" },

{ id: "inv-closed", topic: "investing", k: "answer", c: C_ALL,
  q: "Which Indian schemes are closed to NRIs?",
  verdict: { v: "MOST GOVERNMENT SMALL SAVINGS", tone: "warn" },
  a: "No new PPF, no Sukanya Samriddhi, no Senior Citizens' Savings Scheme, no NSC, KVP, POMIS or other post-office schemes, and no fresh Sovereign Gold Bonds. What IS open: mutual funds, listed equity, NPS Tier I, bank deposits, corporate bonds and NCDs, real estate other than agricultural land, and GIFT City products.",
  tags: "ppf ssy sukanya scss nsc kvp post office sovereign gold bond closed not allowed schemes eligible" },

{ id: "inv-nps", topic: "investing", k: "answer", c: C_ALL,
  q: "Can an NRI open NPS?",
  verdict: { v: "YES — TIER I ONLY", tone: "up" },
  a: "NRIs and OCI cardholders aged 18 to 70 can open NPS Tier I with PAN, KYC and an NRE or NRO account. Tier II is not available. Fund it from NRE to keep proceeds repatriable. At exit, up to 60% comes out as a lump sum and at least 40% must buy an annuity — which is a long-dated rupee liability, so think hard if you intend to retire outside India. US and Canadian residents should check treatment at home: NPS is not a treaty-recognised pension, so its growth may be currently taxable there.",
  tags: "nps national pension scheme nri oci tier 1 tier 2 annuity 40% retirement pension" },

{ id: "inv-gift", topic: "investing", k: "answer", c: C_ALL,
  q: "What is GIFT City and why do NRIs keep being told to use it?",
  verdict: { v: "INDIAN EXPOSURE IN DOLLARS", tone: "up" },
  a: "India's IFSC at GIFT City, regulated by IFSCA, is treated as offshore for many purposes. It offers foreign-currency deposits with IFSC banking units, AIFs and PMS in USD (the PMS minimum was cut to USD 75,000), IFSC life insurance with proceeds exempt from April 2025, and remote video-KYC onboarding. For US and Canadian NRIs it can deliver Indian market exposure without the onshore mutual fund's PFIC or T1135 baggage — but a foreign fund is still a foreign fund to the IRS, so confirm the specific structure with a home-country adviser.",
  tags: "gift city ifsc ifsca dollar usd deposits aif pms nri offshore india exposure video kyc" },

/* ---------------------------------- tax ----------------------------------- */
{ id: "tax-newact", topic: "tax", k: "map", c: C_ALL,
  q: "Section 195? Form 10F? Are those still the right names?",
  verdict: { v: "NO — EVERY NUMBER MOVED ON 1 APRIL 2026", tone: "down" },
  a: "The Income-tax Act, 1961 ceased to be the law on 1 April 2026, replaced by the Income-tax Act, 2025 and the Income-tax Rules, 2026. Rates did not change; section and form numbers did. s.195 is now s.393(2), s.90 is s.159, s.87A is s.157, s.112 is s.197, and Chapter XII-A for NRIs is ss.212-218. Form 10F is Form 41, Form 67 is Form 44, and 15CA/15CB are 145/146. Income up to 31 March 2026 is still governed by the old Act, so AY 2026-27 returns use the old names.",
  tags: "section 195 393 90 159 87a 157 112 197 115f form 10f 41 67 44 15ca 145 15cb 146 new income tax act 2025 renumbered 2026" },

{ id: "tax-slabs", topic: "tax", k: "answer", c: C_ALL,
  q: "What are the tax slabs for an NRI in 2026-27?",
  a: "The new regime is the default and Budget 2026 left the slabs unchanged: nil to ₹4 lakh, 5% to ₹8 lakh, 10% to ₹12 lakh, 15% to ₹16 lakh, 20% to ₹20 lakh, 25% to ₹24 lakh and 30% above. Surcharge runs 10/15/25% and is capped at 25% in the new regime, with a 15% cap on capital gains and dividends. Cess is 4%.",
  a2: "Three things an NRI does NOT get: the s.157 [87A] rebate of ₹60,000, which is residents-only; the basic exemption set against ss.196/197 capital gains; and any indexation on property.",
  tags: "slabs rates 2026-27 new regime old regime surcharge cess rebate 87a 157 basic exemption 4 lakh" },

{ id: "tax-cg", topic: "tax", k: "table", c: C_ALL,
  q: "What capital gains tax does an NRI pay?",
  a: "Listed equity and equity mutual funds: 20% short-term (12 months or less), 12.5% long-term above a ₹1.25 lakh annual exemption. Property and unlisted shares: long-term after 24 months at 12.5% with NO indexation, short-term at slab. Debt funds bought on or after 1 April 2023 are always taxed at slab. The ₹1.25 lakh equity exemption does apply to NRIs; the basic exemption limit does not.",
  tags: "capital gains ltcg stcg 12.5 20 percent equity property unlisted debt fund 1.25 lakh indexation" },

{ id: "tax-indexation", topic: "tax", k: "trap", c: C_ALL,
  q: "Can I use indexation on a property I bought before July 2024?",
  verdict: { v: "NOT AS AN NRI", tone: "down" },
  a: "The grandfathered choice between 12.5% without indexation and 20% with it, for property acquired before 23 July 2024, is given by statute to 'an individual or HUF, being a resident.' A non-resident is excluded. Whenever you bought it, you pay 12.5% on the raw rupee gain, with decades of inflation taxed as if it were profit.",
  tags: "indexation grandfathering 23 july 2024 20% with indexation property resident only nri excluded cost inflation" },

{ id: "tax-nro-tds", topic: "tax", k: "rate", c: C_ALL,
  q: "Why is my bank deducting 31.2% on my NRO interest?",
  verdict: { v: "THAT IS THE DOMESTIC RATE — THE TREATY HALVES IT", tone: "warn" },
  a: "TDS on NRO interest is 30% plus surcharge plus 4% cess under s.393(2) — roughly 31.2% where no surcharge applies. There is no threshold and no Form 15G/15H for non-residents. A treaty residency certificate plus Form 41, given to the bank BEFORE the interest is credited, cuts it to 15% (US, Canada, Australia), 12.5% (UAE) or 10% (New Zealand). Miss the window and you can still claim the treaty rate in your return — it just costs you the money's time value for up to eighteen months.",
  income: "nroInterest",
  tags: "nro interest tds 30% 31.2 why deducted reduce dtaa trc form 10f 41 bank fixed deposit" },

{ id: "tax-dividend", topic: "tax", k: "rate", c: ["us", "canada"],
  q: "What tax do I pay on Indian dividends from the US or Canada?",
  verdict: { v: "20% DOMESTIC — THE TREATY IS WORSE", tone: "warn" },
  a: "India's domestic rate on dividends to a non-resident is 20% plus surcharge and cess. The India-US and India-Canada treaties cap dividends at 25% for individuals — the 15% figure everyone quotes is for a COMPANY holding at least 10% of the payer. So here the treaty loses, and you take the domestic rate. This is the clearest example of why the treaty must be compared per income stream, never applied blanket.",
  income: "dividend",
  tags: "dividend tax us canada 25% 15% 20% treaty worse domestic rate which is lower" },

{ id: "tax-rent", topic: "tax", k: "answer", c: C_ALL,
  q: "How is my Indian rental income taxed, and who deducts TDS?",
  verdict: { v: "THE TENANT MUST — AND NEEDS A TAN", tone: "warn" },
  a: "Compute it exactly as a resident does: gross rent less municipal taxes, less a 30% standard deduction, less home-loan interest. But TDS is the tenant's job under s.393(2) at 30% plus surcharge and cess — not the resident-landlord provisions — so the tenant needs a TAN and must file the quarterly non-resident statement (Form 144). Most individual tenants will not do this. Either get a lower-deduction certificate so their obligation shrinks, or accept the 31.2% and reclaim it by filing.",
  income: "rent",
  tags: "rent rental income tds tenant tan 30% standard deduction 194i 194ib landlord nri property let out" },

{ id: "tax-filing", topic: "tax", k: "answer", c: C_ALL,
  q: "Do I have to file an Indian tax return as an NRI?",
  verdict: { v: "USUALLY YES — TO GET MONEY BACK", tone: "accent" },
  a: "You must file if Indian income exceeds the basic exemption, or to claim a refund of over-deducted TDS, or to carry forward losses. Reclaiming excess TDS is why most NRIs file at all. Use ITR-2 (ITR-3 with business income); ITR-1 and ITR-4 are not available to non-residents. Section 216 [115G] excuses you entirely where your income is only investment income or long-term gains on foreign-exchange assets and TDS is complete.",
  tags: "itr file return nri itr-2 due date july refund tds claim 115g 216 not required exemption" },

{ id: "tax-115f", topic: "tax", k: "answer", c: C_ALL,
  q: "Is there a special tax regime just for NRIs?",
  verdict: { v: "YES — ss.212-218, AND IT IS UNDERUSED", tone: "up" },
  a: "The old Chapter XII-A, now ss.212-218, applies to a non-resident Indian holding specified assets acquired in convertible foreign exchange. s.214 charges 20% on investment income and 10%/12.5% on long-term gains; s.215 exempts the gain entirely if the net consideration is reinvested in specified assets within six months and held three years; s.216 removes the filing requirement in some cases; s.217 lets the benefit continue after you become resident. s.213 blocks deductions and indexation, so run both computations and use s.218 to opt out where the general provisions win.",
  tags: "115c 115d 115e 115f 115g 115h 115i chapter xii-a 212 213 214 215 216 217 218 foreign exchange asset reinvest exemption special provisions" },

/* -------------------------------- property -------------------------------- */
{ id: "prop-buy", topic: "property", k: "answer", c: C_ALL,
  q: "What property can an NRI buy in India?",
  verdict: { v: "ANYTHING BUT FARMLAND", tone: "up" },
  a: "Residential and commercial property, any number, any value, no RBI approval. NOT agricultural land, plantation property or farmhouses — buying those is a FEMA contravention with penalties up to three times the value, and it happens most often when a relative 'buys it in your name'. Inheritance is different: an NRI or OCI may inherit and hold agricultural land. Payment must be in rupees through banking channels, never in foreign currency or cash.",
  tags: "buy property india nri oci agricultural land farmhouse plantation allowed limit rbi approval inherit" },

{ id: "prop-tds", topic: "property", k: "trap", c: C_ALL,
  q: "Why is the buyer deducting so much TDS when I sell my flat?",
  verdict: { v: "IT'S ON THE SALE PRICE, NOT THE GAIN", tone: "down" },
  a: "For a resident seller the buyer deducts 1% above ₹50 lakh. For an NRI seller the buyer deducts under s.393(2) at 12.5% long-term or 30% short-term, plus surcharge and cess, on the ENTIRE SALE CONSIDERATION, with no threshold — and needs a TAN to do it. On a flat bought for ₹40 lakh and sold for ₹1.2 crore, tax actually due is about ₹11.4 lakh but roughly ₹17.9 lakh is withheld. The difference sits with the department for over a year.",
  a2: "The fix is a lower-deduction certificate from the Assessing Officer (International Taxation), applied for 6-8 weeks before the sale, directing the buyer to deduct on the computed gain instead. It is the highest-return paperwork in NRI finance.",
  tags: "tds sale of property nri buyer tan 12.5 lower deduction certificate 197 refund stuck full consideration 194ia" },

{ id: "prop-exempt", topic: "property", k: "answer", c: C_ALL,
  q: "How do I avoid capital gains tax on selling Indian property?",
  a: "Three reinvestment exemptions, all available to NRIs: s.82 [54] reinvest the gain from a residential house into another residential house; s.86 [54F] reinvest the net consideration from any long-term asset into a residential house; s.85 [54EC] put gains from land or building into NHAI/REC/PFC/IRFC bonds within six months, capped at ₹50 lakh with a five-year lock-in. The replacement house must be IN INDIA — buying in Dubai or Toronto does not qualify. If the purchase will not complete before the filing due date, park the money in a Capital Gains Account Scheme account first.",
  tags: "save capital gains tax property 54 54f 54ec bonds exemption reinvest house capital gains account scheme" },

{ id: "prop-repat", topic: "property", k: "answer", c: C_ALL,
  q: "Can I send the money abroad after selling my Indian property?",
  verdict: { v: "YES — IN TWO BUCKETS", tone: "up" },
  a: "If the property was bought with NRE/FCNR funds or a foreign inward remittance, the amount originally remitted is repatriable, for up to TWO residential properties. Gains above that, and any third property, go through the USD 1 million per financial year NRO route with Forms 145 and 146. The two-property limit applies to residential property only, not commercial. Clear the TDS first, and if the total exceeds USD 1 million, split the remittance across the 1 April boundary.",
  tags: "repatriate property sale proceeds abroad two properties usd 1 million limit send money after selling" },

/* ------------------------------- remittance ------------------------------- */
{ id: "rem-1m", topic: "remittance", k: "answer", c: C_ALL,
  q: "How much money can I take out of India in a year?",
  verdict: { v: "USD 1M FROM NRO — AND UNLIMITED CURRENT INCOME", tone: "up" },
  a: "NRE and FCNR balances are fully repatriable with no cap at all. From NRO, capital — sale proceeds, inheritance, legacy — is capped at USD 1,000,000 per financial year. But CURRENT INCOME — rent, dividends, interest, pension — is remittable without any monetary limit and does NOT consume that allowance. Most NRIs do not know this and needlessly spend their million-dollar limit on rent.",
  tags: "usd 1 million limit repatriation nro send money home abroad annually per year how much maximum transfer out of india cap current income rent pension dividend" },

{ id: "rem-forms", topic: "remittance", k: "flow", c: C_ALL,
  q: "What paperwork do I need to remit money out of India?",
  a: "Three documents and one bank form, in this order.",
  steps: ["Your CA issues Form 146 (was 15CB) certifying the nature of the remittance, its taxability and the rate applied — required for taxable transfers above ₹5 lakh",
          "You file Form 145 (was 15CA) on the e-filing portal, quoting the Form 146 acknowledgement",
          "The bank takes Form A2 plus its own request form",
          "The remittance executes"],
  a2: "Remittances initiated before 1 April 2026 remain valid on the old 15CA/15CB. From that date use 145/146.",
  tags: "15ca 15cb form 145 146 a2 ca certificate remittance process paperwork documents outward" },

{ id: "rem-lrs", topic: "remittance", k: "trap", c: C_ALL,
  q: "Does the LRS limit and 20% TCS apply to me?",
  verdict: { v: "NO — LRS IS FOR RESIDENTS", tone: "up" },
  a: "The Liberalised Remittance Scheme, its USD 250,000 limit and its TCS are for PERSONS RESIDENT IN INDIA. An NRI remitting out of an NRO account uses the Remittance of Assets route instead, and is not subject to LRS TCS. If a bank tries to apply LRS or TCS to your NRO remittance, they have misclassified you — say so.",
  tags: "lrs liberalised remittance scheme 250000 tcs 20% resident nri applicable not remittance of assets" },

{ id: "rem-ustax", topic: "remittance", k: "answer", c: ["us"],
  q: "Is there a 1% US tax on money I send to India?",
  verdict: { v: "ONLY ON CASH TRANSFERS", tone: "up" },
  a: "The One Big Beautiful Bill Act's 1% remittance excise tax took effect on 1 January 2026, but it applies only where the transfer is funded with cash, a money order, a cashier's check or a similar physical instrument. Transfers funded from a bank account, a debit or credit card, or a digital wallet are exempt. Since that is how essentially all NRI remittance is done, this tax does not touch most people. The alarming 2025 coverage was about a much broader earlier draft.",
  tags: "1% remittance tax us obbba 2026 excise money transfer india cash wire bank account exempt" },

/* ---------------------------------- dtaa ---------------------------------- */
{ id: "dtaa-claim", topic: "dtaa", k: "flow", c: C_ALL,
  q: "How do I actually claim DTAA benefit?",
  a: "Four documents, given to every payer — your bank, the share registrar, your tenant — before the income is credited. Refresh them every year.",
  steps: ["A Tax Residency Certificate from your country of residence",
          "Form 41 (was Form 10F), filed electronically on the Indian e-filing portal — a PAN is not mandatory",
          "A self-declaration of beneficial ownership and no Indian permanent establishment, in the payer's format",
          "Your PAN, where you have one"],
  a2: "Miss the pre-deduction window and the treaty rate can still be claimed in your return as a refund — it just costs you the time value of the money.",
  tags: "how to claim dtaa trc tax residency certificate form 10f 41 documents bank lower tds treaty benefit" },

{ id: "dtaa-worse", topic: "dtaa", k: "trap", c: ["us", "canada"],
  q: "Is the DTAA rate always better than the Indian rate?",
  verdict: { v: "NO", tone: "down" },
  a: "s.159 [old s.90] gives you whichever is MORE BENEFICIAL, compared per income stream. For an individual in the US or Canada the treaty caps dividends at 25% while India's own domestic rate is 20% — the treaty is worse and you take the domestic rate. On NRO interest the treaty wins decisively, halving 31.2% to 15%. Compare stream by stream, every year.",
  tags: "dtaa better worse than domestic rate compare which lower dividend 25 20 percent per income stream" },

{ id: "dtaa-uaetrc", topic: "dtaa", k: "trap", c: ["gulf"],
  q: "I'm a Dubai resident — is my TRC good enough for the treaty?",
  verdict: { v: "ONLY ON THE 183-DAY ROUTE", tone: "down" },
  a: "Cabinet Decision 85 of 2022 gives three routes to UAE tax residency: centre of financial and personal interests, 183 days, or 90 days for a UAE resident or GCC national with a home or job there. But the Federal Tax Authority issues a TRC for DOUBLE TAX TREATY purposes only on the 183-day route. The 90-day route establishes domestic residency and will not get you a treaty TRC. Plenty of Dubai-based NRIs who spend 100-150 days in the UAE assume they are covered. They are not.",
  tags: "uae trc 183 days 90 days cabinet decision 85 dubai tax residency certificate treaty fta emaratax" },

{ id: "dtaa-noftc", topic: "dtaa", k: "answer", c: ["gulf"],
  q: "I pay no tax in the Gulf — can I recover the Indian TDS?",
  verdict: { v: "NO. IT IS A FINAL COST", tone: "warn" },
  a: "A foreign tax credit needs foreign tax to credit it against. With no personal income tax in the UAE, Saudi Arabia, Qatar, Kuwait, Bahrain or Oman (until 2028), Indian tax withheld is unrecoverable — permanently. That is precisely why the paperwork matters more in this corridor than anywhere else: the TRC and Form 41, the lower-deduction certificate before a property sale, and choosing NRE over NRO wherever possible.",
  tags: "gulf no income tax foreign tax credit recover indian tds final cost uae saudi qatar kuwait unrecoverable" },

{ id: "dtaa-ftc-india", topic: "dtaa", k: "trap", c: C_ALL,
  q: "How do I claim credit in India for tax paid abroad?",
  verdict: { v: "FORM 44 — BEFORE YOU FILE", tone: "warn" },
  a: "Form 44 (was Form 67) must be filed with proof of the foreign tax paid BEFORE you file the return that claims the credit. Filing it late has been a recurring cause of denied credits. This matters the year you become RNOR or ROR on returning to India, which is exactly when people are least focused on Indian compliance.",
  tags: "form 67 44 foreign tax credit india claim relief 90 91 159 160 before filing denied" },

/* -------------------------------- insurance ------------------------------- */
{ id: "ins-gst", topic: "insurance", k: "answer", c: C_ALL,
  q: "Is there still 18% GST on my Indian insurance premium?",
  verdict: { v: "NO — ZERO SINCE 22 SEPTEMBER 2025", tone: "up" },
  a: "The GST Council's 56th meeting exempted all INDIVIDUAL life and health insurance policies, including family floaters and reinsurance, from 18% to zero with effect from 22 September 2025. Group and employer-sponsored policies remain at 18%. This also retires the old NRI workaround of paying from an NRE account to reclaim the 18% as an export of services — for individual policies there is no longer any GST to reclaim.",
  tags: "gst insurance 18% zero exempt 22 september 2025 premium life health nri refund nre export of services" },

{ id: "ins-term", topic: "insurance", k: "answer", c: C_ALL,
  q: "Can an NRI buy term life insurance in India?",
  verdict: { v: "YES — AND IT IS 30-60% CHEAPER", tone: "up" },
  a: "Every major Indian insurer covers NRIs and OCI holders. Medicals are done at empanelled centres abroad, by video underwriting, or during a visit to India — and buying while visiting, with an Indian address and Indian medicals, is often cheaper. Premiums vary by country of residence. Critically: PAY FROM YOUR NRE ACCOUNT if you want the death benefit to be freely repatriable to your family abroad, and keep the FIRC and NRE debit records for the life of the policy — the insurer asks for proof of premium source at claim.",
  tags: "term insurance nri buy india life cover cheaper medical test claim payout nre repatriable premium" },

{ id: "ins-10d", topic: "insurance", k: "trap", c: C_ALL,
  q: "Is my insurance maturity amount tax-free?",
  verdict: { v: "ONLY UNDER THE PREMIUM CAPS", tone: "warn" },
  a: "The death benefit is exempt regardless of premium size. Maturity proceeds are exempt only if aggregate annual premium across ALL your life policies is ₹5 lakh or less (policies issued on or after 1 April 2023), ULIP premium is ₹2.5 lakh or less (from 1 February 2021), and the sum assured is at least 10× the annual premium. The s.123 [80C] premium deduction exists only in the old regime, so for an NRI on the default new regime it is not a reason to buy anything.",
  tags: "10 10d maturity tax free 5 lakh premium cap ulip 2.5 lakh sum assured 10 times 80c deduction" },

{ id: "ins-ulip-us", topic: "insurance", k: "trap", c: ["us", "canada"],
  q: "Should I buy an Indian ULIP or endowment policy?",
  verdict: { v: "NOT FROM THE US OR CANADA", tone: "down" },
  a: "An Indian ULIP can be treated as a PFIC or a foreign investment contract, generating annual US tax and Form 8621 reporting on a product sold to you as tax-free; in Canada the cash value is specified foreign property for T1135 and Indian policies generally fail the exempt-policy rules, so accrual taxation can apply. Add the ₹5 lakh and ₹2.5 lakh Indian premium caps, long lock-ins and poor liquidity across a geographically unstable life stage. Buy term, invest separately.",
  tags: "ulip endowment money back investment insurance us canada pfic t1135 avoid bad product" },

{ id: "ins-health", topic: "insurance", k: "answer", c: C_ALL,
  q: "Should I buy Indian health insurance before moving back?",
  verdict: { v: "YES — YEARS BEFORE", tone: "up" },
  a: "Indian health policies carry a 24-36 month pre-existing-disease waiting period, disease-specific waits, a 30-day initial wait and a 60-month moratorium after which the insurer cannot contest a claim on non-disclosure grounds. Every one of those clocks starts at POLICY ISSUANCE, not at your arrival. Buy three years before you move back and you land fully covered; buy on arrival and you are uninsured for what matters for two to three years. Separately, buy parents' cover early — Indian insurers price and underwrite far more harshly after 60.",
  tags: "health insurance nri oci india buy before returning waiting period pre-existing moratorium parents cover" },

/* -------------------------------- benefits -------------------------------- */
{ id: "ben-oci", topic: "benefits", k: "table", c: C_ALL,
  q: "OCI or NRI — what's the actual difference?",
  a: "An NRI is an Indian CITIZEN living abroad; an OCI holder is a FOREIGN citizen of Indian origin. OCI gives a lifelong visa, no FRRO registration, and parity with NRIs in financial, economic and educational matters — except agricultural land. What OCI does not give: the vote, government jobs, or constitutional office. An NRI can register as an overseas elector and vote, but must vote IN PERSON. Aadhaar: an NRI with an Indian passport can enrol with no waiting period; an OCI needs 182 days of residence in the preceding 12 months.",
  tags: "oci vs nri difference card benefits voting rights aadhaar pio agricultural land education quota passport" },

{ id: "ben-ssa-us", topic: "benefits", k: "trap", c: ["us"],
  q: "Do I get my US Social Security contributions back if I return to India?",
  verdict: { v: "NOT UNLESS YOU HIT 40 QUARTERS", tone: "down" },
  a: "There is NO totalisation agreement between India and the United States. You pay 6.2% Social Security plus 1.45% Medicare from day one, employer-matched, and if you leave before accumulating 40 quarters — ten years — of coverage you qualify for nothing and the contributions are simply gone. For a decade-long US stint that is a five-to-six-figure forfeiture. An agreement has been discussed since the 2000s without conclusion; do not plan on it arriving.",
  tags: "social security totalisation agreement us india refund 40 quarters 10 years h1b forfeit medicare fica" },

{ id: "ben-ssa", topic: "benefits", k: "answer", c: ["canada", "australia"],
  q: "Does India have a social security agreement with my country?",
  verdict: { v: "YES", tone: "up" },
  a: "India has SSAs in force with Canada (since 1 August 2015), Australia, and a group of mainly European countries plus Japan and South Korea. An SSA does three things: detachment, so a posted worker keeps contributing at home and is exempt from host contributions on production of a Certificate of Coverage from EPFO (up to 60 months under the Canada agreement); totalisation, adding periods in both countries to meet minimum qualifying periods; and exportability, paying the pension into an account in the other country.",
  tags: "social security agreement ssa canada australia certificate of coverage epfo totalisation cpp pension detachment" },

{ id: "ben-epf", topic: "benefits", k: "answer", c: C_ALL,
  q: "What happens to my EPF when I move abroad?",
  a: "The account continues and keeps earning, but interest on a post-employment balance becomes taxable in India. Full withdrawal is permitted on permanent settlement abroad, without the usual retirement-age or unemployment conditions. If your destination has an SSA with India, get a Certificate of Coverage from EPFO to avoid paying into both systems. US residents should note that the US treatment of EPF is genuinely unsettled — no definitive IRS guidance exists and practitioner positions differ materially.",
  tags: "epf pf provident fund nri withdraw abroad taxable interest certificate of coverage international worker" },

/* --------------------------------- return --------------------------------- */
{ id: "ret-window", topic: "return", k: "answer", c: C_ALL,
  q: "What should I do before moving back to India?",
  verdict: { v: "MOST OF IT ONLY WORKS BEFOREHAND", tone: "warn" },
  a: "Book FCNR(B) deposits — the interest exemption survives into RNOR and you cannot open one once resident. Realise foreign capital gains while they are outside India's net. Exit PFICs if you are a US person. Buy Indian health insurance two to three years ahead so the waiting periods are already served. Value every foreign asset on the return date. Decide on the US green card, because keeping it means lifelong US worldwide taxation from India. And compute the RNOR window before booking the flight — returning in early April rather than late March can add an entire tax-free year.",
  tags: "returning to india checklist before moving back rnor planning fcnr green card sell foreign shares timing" },

{ id: "ret-ror", topic: "return", k: "trap", c: C_ALL,
  q: "What changes when I become ROR?",
  verdict: { v: "EVERYTHING, ON ONE DAY", tone: "down" },
  a: "Worldwide income becomes taxable in India, Schedule FA disclosure of every foreign asset and account becomes mandatory, RFC interest becomes taxable, and foreign tax credit claims begin — needing Form 44 filed before the return. Black Money Act penalties for a missed foreign-asset disclosure run to ₹10 lakh per year per asset. Build the foreign-asset inventory twelve months ahead and rationalise accounts: fewer accounts means a shorter Schedule FA and less risk.",
  tags: "ror ordinarily resident worldwide income schedule fa black money act foreign assets disclosure penalty" },

{ id: "ret-canada-exit", topic: "return", k: "trap", c: ["canada"],
  q: "Will Canada tax me when I leave for India?",
  verdict: { v: "YES — ON GAINS YOU NEVER REALISED", tone: "down" },
  a: "Section 128.1 deems you to have disposed of most capital property at fair market value on ceasing residence, and you pay Canadian tax on the accrued gain. Canadian real property and registered plans are excluded. File T1161 and T1243; T1244 lets you defer payment until actual sale. The asymmetry that catches people: India does not recognise deemed disposition, gives NO credit for the exit tax, and does not step up your Indian cost base — so the same gain can be taxed twice with no relief.",
  tags: "canada departure tax deemed disposition 128.1 t1161 t1243 t1244 leaving canada exit tax india no credit" },

{ id: "ret-aus-pr", topic: "return", k: "answer", c: ["australia"],
  q: "Why does my Australian PR grant date matter for Indian income?",
  verdict: { v: "IT ENDS THE TEMPORARY-RESIDENT EXEMPTION", tone: "warn" },
  a: "As a temporary resident on a 482, 485 or 500 visa, foreign-source income is generally not taxed in Australia and CGT applies only to taxable Australian property — so Indian interest, dividends, rent and capital gains stay outside the Australian net. The day permanent residency is granted, all of it becomes assessable. That makes the PR grant date a planning date: realise Indian gains and restructure Indian holdings before it, not after.",
  tags: "australia temporary resident pr permanent residency 482 485 500 visa foreign income exempt cgt indian income" },

{ id: "ret-nz-48", topic: "return", k: "answer", c: ["nz"],
  q: "What is the New Zealand four-year exemption?",
  verdict: { v: "48 MONTHS, AUTOMATIC, ONCE PER LIFETIME", tone: "up" },
  a: "A new migrant, or a returning New Zealander who has not been tax-resident for 10 years, is a transitional resident: most foreign-sourced income is exempt from NZ tax for 48 months from becoming resident, and the FIF regime does not apply. Foreign employment income and services income are the exceptions. It applies automatically, you get it once, and electing Working for Families tax credits ends it early. Diarise the end date on arrival — the FIF regime switches on the next day and taxes roughly 5% of the opening value of foreign shares whatever they actually returned.",
  tags: "new zealand transitional resident 48 months four year exemption fif foreign investment fund 50000 fdr" },

{ id: "ret-us-estate", topic: "property", k: "trap", c: ["gulf", "us"],
  q: "I hold US stocks. Is there an estate tax problem?",
  verdict: { v: "YES — THE EXEMPTION IS USD 60,000", tone: "down" },
  a: "If you are not a US citizen and not US-domiciled, US estate tax hits your US-situs assets — US stocks, US-domiciled ETFs, US real estate — above just USD 60,000, at rates up to 40%. A US citizen gets USD 13.99 million. There is no India-US estate tax treaty, and India gives no credit. Indian shares, Indian funds, Indian property and NRE/NRO/FCNR balances are NOT US-situs and pass free of tax on both sides. The mitigation is to hold US-market exposure through non-US-domiciled funds — Irish-domiciled UCITS ETFs, for instance — rather than US-domiciled ones. Indian brokers selling US-stock access almost never raise this.",
  tags: "us estate tax 60000 non resident alien us stocks etf 40% death inheritance situs ucits irish domiciled" },

/* ------------------------------- compliance ------------------------------- */
{ id: "comp-fbar", topic: "compliance", k: "answer", c: ["us"],
  q: "Do I have to report my Indian bank accounts to the IRS?",
  verdict: { v: "YES — PROBABLY BOTH FORMS", tone: "warn" },
  a: "FBAR (FinCEN 114) is required if the AGGREGATE maximum of all foreign accounts exceeded USD 10,000 at any point in the calendar year — three accounts of $4,000, $3,500 and $3,000 means all three get reported. It covers NRE, NRO, FCNR, demat and cash-value policies, and signature authority over a parent's account. Form 8938 is filed with the return above higher thresholds: $50,000/$75,000 single in the US, up to $400,000/$600,000 married abroad. Filing one does not excuse the other. Non-willful FBAR penalties run to roughly USD 16,536 per violation; willful, the greater of ~USD 165,353 or 50% of the balance.",
  tags: "fbar fincen 114 form 8938 fatca report indian accounts irs 10000 threshold penalty nre nro demat" },

{ id: "comp-t1135", topic: "compliance", k: "answer", c: ["canada"],
  q: "Do I have to report my Indian assets to the CRA?",
  verdict: { v: "ABOVE CAD 100,000 OF COST", tone: "warn" },
  a: "Form T1135 is required if the total COST — not market value — of specified foreign property exceeded CAD 100,000 at any time in the year. That includes Indian bank accounts, demat and brokerage accounts, Indian mutual funds and shares, and Indian INVESTMENT real estate. A home you use personally is excluded. Between CAD 100,000 and 250,000 you use the simplified method; above that, detailed per-property reporting. Penalties are CAD 25/day to a maximum of CAD 2,500, gross negligence up to 5% of value, and the reassessment window extends by three years.",
  tags: "t1135 cra canada foreign property report 100000 cost specified foreign property penalty nre nro" },

{ id: "comp-dates", topic: "compliance", k: "answer", c: C_ALL,
  q: "What are the key dates in an NRI's year?",
  a: "1 April: new tax year, and the USD 1 million NRO repatriation limit resets — the reason a large remittance can legitimately be split across the boundary. 15 June / 15 September / 15 December / 15 March: advance tax instalments, payable if Indian liability after TDS exceeds ₹10,000. 31 July: ITR due date for non-audit cases, though extensions are now near-annual — check the CBDT notification. 31 March: last day to use the year's repatriation allowance. Ongoing: refresh the TRC and Form 41 with every payer annually, and apply for a lower-deduction certificate 6-8 weeks before any property sale.",
  tags: "due date calendar itr july 31 advance tax 15 june march financial year deadlines repatriation limit reset" },

{ id: "comp-pan", topic: "compliance", k: "answer", c: C_ALL,
  q: "Do I need a PAN, and what about Aadhaar linking?",
  verdict: { v: "PAN YES, LINKING GENERALLY NOT", tone: "accent" },
  a: "A PAN is effectively mandatory — for filing, for most investments, for property transactions, and to avoid punitive withholding. NRIs apply on Form 49A (Indian citizens) or 49AA (foreign citizens and OCI). The PAN-Aadhaar linking mandate applies to residents, but you must ensure your residential status is correctly recorded with the department, or the automated process can flag your PAN inoperative — which triggers 20% TDS and blocks refunds. Note that Form 41 for treaty relief can now be filed WITHOUT a PAN.",
  tags: "pan card aadhaar linking nri mandatory inoperative 49a 49aa apply status update 20% tds" },
];

/** Topic labels, in the order the browser shows them. */
export const TOPICS = [
  ["residency", "Residency & status"],
  ["banking", "Accounts & banking"],
  ["investing", "Investing"],
  ["tax", "Indian tax"],
  ["property", "Property & succession"],
  ["remittance", "Remittance"],
  ["dtaa", "Treaties & DTAA"],
  ["insurance", "Insurance"],
  ["benefits", "Benefits & entitlements"],
  ["return", "Returning to India"],
  ["compliance", "Compliance"],
];

/* ===========================================================================
   PROVENANCE

   Every answer has to be traceable to something a reader can open. This is the
   registry those citations point at — the authority itself wherever one exists,
   and a named secondary summary only where a primary source is not machine
   reachable (India's official DTAA rate chart, for one, blocks automated
   retrieval, so the treaty table is carried against PwC's published summary and
   labelled as such rather than being dressed up as the statute).

   `authority` is what the reader is being asked to trust:
     primary    the statute, the rule, the regulator's own direction
     regulator  a government or regulator page that restates its own rules
     secondary  a professional summary — reliable, but not the source of law
   =========================================================================== */

export const SOURCES = {
  ita2025:    { label: "Income-tax Act, 2025 (as amended by the Finance Act, 2026)", authority: "primary",
                url: "https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf" },
  itdNR:      { label: "Income Tax Department — Non-Resident guidance", authority: "regulator",
                url: "https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/non-resident" },
  itdReturn:  { label: "Income Tax Department — return applicable to a non-resident individual", authority: "regulator",
                url: "https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-0" },
  itdForms:   { label: "Income Tax Department — income tax forms", authority: "regulator",
                url: "https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/income-tax-forms" },
  itdNewAct:  { label: "Income Tax Department — objective and scope of the new Act", authority: "regulator",
                url: "https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/objective-and-scope-new-act" },
  dtaaTexts:  { label: "Income Tax Department — DTAA texts, all countries", authority: "primary",
                url: "https://www.incometaxindia.gov.in/pages/international-taxation/dtaa.aspx" },
  dtaaChart:  { label: "Income Tax Department — Tax Rates, DTAA v. Income-tax Act", authority: "regulator",
                url: "https://www.incometaxindia.gov.in/w/%E2%80%8Btax-rates-dtaa-v.-income-tax-act" },
  pwcWHT:     { label: "PwC Worldwide Tax Summaries — India, withholding taxes", authority: "secondary",
                url: "https://taxsummaries.pwc.com/india/corporate/withholding-taxes" },
  rbiMD:      { label: "RBI — Master Directions", authority: "primary",
                url: "https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx" },
  rbiRemit:   { label: "RBI — Remittance of Assets (FEMA 13(R)) FAQs", authority: "primary",
                url: "https://www.rbi.org.in/commonman/english/scripts/FAQs.aspx?Id=17" },
  rbiNRI:     { label: "RBI — Master Circular, remittance facilities for NRIs", authority: "primary",
                url: "https://www.rbi.org.in/commonman/english/scripts/Notification.aspx?Id=843" },
  rbiNRO:     { label: "RBI — Master Circular on NRO accounts", authority: "primary",
                url: "https://www.rbi.org.in/commonman/english/scripts/Notification.aspx?Id=847" },
  rbiFema:    { label: "RBI — FEMA notifications", authority: "primary",
                url: "https://www.rbi.org.in/Scripts/BS_FemaNotifications.aspx" },
  deaSmall:   { label: "Ministry of Finance (DEA) — irregular small-savings accounts, effective 1 October 2024", authority: "regulator",
                url: "https://www.businesstoday.in/personal-finance/investment/story/new-ppf-rules-from-oct-1-these-public-provident-accounts-will-not-earn-any-interest-know-why-444717-2024-09-06" },
  pfrda:      { label: "PFRDA — National Pension System rules for NRIs and OCI holders", authority: "regulator",
                url: "https://www.pfrda.org.in/" },
  sebi:       { label: "SEBI — mutual fund and KYC regulations", authority: "regulator", url: "https://www.sebi.gov.in/" },
  amfi:       { label: "AMFI — mutual fund industry standards and scheme data", authority: "regulator", url: "https://www.amfiindia.com/" },
  meaPIS:     { label: "Ministry of External Affairs — Portfolio Investment Scheme for NRIs", authority: "regulator",
                url: "https://www.mea.gov.in/images/pdf/shares-and-securities.pdf" },
  ifsca:      { label: "IFSCA — GIFT City International Financial Services Centre", authority: "regulator",
                url: "https://ifsca.gov.in/" },
  dfsGst:     { label: "Department of Financial Services — GST exemption on individual life and health insurance", authority: "regulator",
                url: "https://www.financialservices.gov.in/exemption-gst-all-individual-life-insurance-and-health-insurance-policies" },
  irdai:      { label: "IRDAI — insurance regulations, waiting periods and the moratorium", authority: "regulator", url: "https://irdai.gov.in/" },
  mhaOci:     { label: "Ministry of Home Affairs — OCI scheme", authority: "primary",
                url: "https://www.mha.gov.in/en/documents/oci" },
  uidai:      { label: "UIDAI — Aadhaar enrolment rules for NRIs and OCI holders", authority: "regulator", url: "https://uidai.gov.in/" },
  eci:        { label: "Election Commission of India — overseas electors", authority: "regulator", url: "https://eci.gov.in/" },
  epfo:       { label: "EPFO — International Workers and Certificate of Coverage", authority: "regulator",
                url: "https://www.epfindia.gov.in/site_en/International_workers.php" },
  irsFbar:    { label: "IRS — Report of Foreign Bank and Financial Accounts (FBAR)", authority: "primary",
                url: "https://www.irs.gov/businesses/small-businesses-self-employed/report-of-foreign-bank-and-financial-accounts-fbar" },
  irs8938:    { label: "IRS — comparison of Form 8938 and FBAR requirements", authority: "primary",
                url: "https://www.irs.gov/businesses/comparison-of-form-8938-and-fbar-requirements" },
  irs8621:    { label: "IRS — About Form 8621 (PFIC)", authority: "primary",
                url: "https://www.irs.gov/forms-pubs/about-form-8621" },
  irs1116:    { label: "IRS — Foreign Tax Credit", authority: "primary",
                url: "https://www.irs.gov/individuals/international-taxpayers/foreign-tax-credit" },
  irs8802:    { label: "IRS — Form 8802, US residency certification (Form 6166)", authority: "primary",
                url: "https://www.irs.gov/individuals/international-taxpayers/form-8802-application-for-united-states-residency-certification" },
  irsSpt:     { label: "IRS — substantial presence test", authority: "primary",
                url: "https://www.irs.gov/individuals/international-taxpayers/substantial-presence-test" },
  irsEstate:  { label: "IRS — estate tax for nonresidents not citizens of the United States", authority: "primary",
                url: "https://www.irs.gov/businesses/small-businesses-self-employed/some-nonresidents-with-us-assets-must-file-estate-tax-returns" },
  irsRemit:   { label: "Federal Register — Excise Tax on Remittance Transfers (13 April 2026)", authority: "primary",
                url: "https://www.federalregister.gov/documents/2026/04/13/2026-07085/excise-tax-on-remittance-transfers" },
  ssaList:    { label: "US Social Security Administration — totalization agreements (India is not a party)", authority: "primary",
                url: "https://www.ssa.gov/international/agreements_overview.html" },
  craT1135:   { label: "CRA — Form T1135, Foreign Income Verification Statement", authority: "primary",
                url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t1135.html" },
  craLeaving: { label: "CRA — leaving Canada (emigrants) and the departure tax", authority: "primary",
                url: "https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/individuals-leaving-entering-canada-non-residents/leaving-canada-emigrants.html" },
  craResid:   { label: "CRA — determining your residency status", authority: "primary",
                url: "https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/information-been-moved/determining-your-residency-status.html" },
  canSsa:     { label: "Government of Canada — Canada-India Social Security Agreement, in force 1 August 2015", authority: "primary",
                url: "https://www.canada.ca/en/news/archive/2015/07/agreement-social-security-between-canada-republic-india-comes-into-force-august-1-2015.html" },
  atoResid:   { label: "ATO — your tax residency", authority: "primary",
                url: "https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/your-tax-residency" },
  atoTemp:    { label: "ATO — foreign and temporary residents", authority: "primary",
                url: "https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/your-tax-residency/foreign-and-temporary-residents" },
  atoCgt:     { label: "ATO — how changing residency affects CGT", authority: "primary",
                url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/foreign-residents-and-capital-gains-tax/how-changing-residency-affects-cgt" },
  irdTrans:   { label: "IRD New Zealand — temporary tax exemption for transitional residents", authority: "primary",
                url: "https://www.ird.govt.nz/roles/nz-tax-residents/exemption" },
  irdFif:     { label: "IRD New Zealand — IR461, guide to foreign investment funds", authority: "primary",
                url: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir400---ir499/ir461/ir461.pdf" },
  uaeFta:     { label: "UAE Federal Tax Authority — issuance of tax residency certificates", authority: "primary",
                url: "https://tax.gov.ae/en/services/issuance.of.tax.certificates.aspx" },
  pwcUae:     { label: "PwC — United Arab Emirates, individual residence (Cabinet Decision 85 of 2022)", authority: "secondary",
                url: "https://taxsummaries.pwc.com/united-arab-emirates/individual/residence" },
  omanPit:    { label: "Oman Royal Decree 56/2025 — Personal Income Tax Law, effective 1 January 2028", authority: "primary",
                url: "https://decree.om/2025/rd20250056/" },
  eyEosb:     { label: "EY — UAE voluntary alternative end-of-service benefits scheme", authority: "secondary",
                url: "https://www.ey.com/en_gl/technical/tax-alerts/uae-introduces-voluntary-alternative-end-of-service-benefits-sch" },
};

/* ---------------------------------------------------------------------------
   Card → [evidence grade, ...source ids].

   The grade is how strong the evidence behind that answer actually is, carried
   through to the reader rather than kept in a build note:

     A  confirmed against a government, regulator or tax-authority source
     B  consistent across several independent reputable sources
     C  a single source, or sources partly disagreed — confirm before relying

   Held apart from the card literals so the corpus stays readable, and merged in
   below. A card with no entry here would cite nothing at all, so that is a test
   failure and a build failure, not a default.
--------------------------------------------------------------------------- */

const CARD_META = {
  "res-who":            ["A", "itdNR", "ita2025", "rbiFema"],
  "res-182":            ["A", "itdNR", "ita2025"],
  "res-rnor":           ["A", "itdNR", "ita2025"],
  "res-deemed":         ["B", "itdNR", "ita2025", "uaeFta"],
  "res-tiebreak":       ["A", "dtaaTexts", "itdNR"],

  "bank-which":         ["A", "rbiMD", "rbiNRO", "rbiRemit"],
  "bank-fcnr":          ["B", "rbiMD", "itdNR"],
  "bank-rfc":           ["B", "rbiMD", "rbiFema"],
  "bank-resident-acct": ["A", "rbiMD", "rbiFema"],
  "bank-2026rates":     ["C", "rbiMD", "rbiFema"],

  "inv-mf-us":          ["A", "irs8621"],
  "inv-mf-canada":      ["B", "craT1135"],
  "inv-mf-how":         ["B", "sebi", "amfi", "rbiMD"],
  "inv-equity-pis":     ["B", "meaPIS", "rbiMD", "sebi"],
  "inv-ppf":            ["B", "deaSmall"],
  "inv-closed":         ["B", "deaSmall", "rbiMD"],
  "inv-nps":            ["B", "pfrda"],
  "inv-gift":           ["B", "ifsca"],

  "tax-newact":         ["A", "itdNewAct", "ita2025", "itdForms"],
  "tax-slabs":          ["B", "ita2025", "itdReturn"],
  "tax-cg":             ["B", "ita2025", "itdNR"],
  "tax-indexation":     ["B", "ita2025", "itdNR"],
  "tax-nro-tds":        ["B", "ita2025", "itdNR", "dtaaChart"],
  "tax-dividend":       ["A", "pwcWHT", "dtaaTexts", "ita2025"],
  "tax-rent":           ["B", "ita2025", "itdNR"],
  "tax-filing":         ["A", "itdReturn", "itdNR"],
  "tax-115f":           ["A", "itdNR", "ita2025"],

  "prop-buy":           ["B", "rbiFema", "rbiMD", "mhaOci"],
  "prop-tds":           ["B", "ita2025", "itdNR"],
  "prop-exempt":        ["B", "ita2025", "itdNR"],
  "prop-repat":         ["B", "rbiRemit", "rbiNRI"],
  "ret-us-estate":      ["A", "irsEstate"],

  "rem-1m":             ["A", "rbiRemit", "rbiNRI"],
  "rem-forms":          ["B", "itdForms", "rbiRemit"],
  "rem-lrs":            ["A", "rbiRemit", "rbiNRI"],
  "rem-ustax":          ["A", "irsRemit"],

  "dtaa-claim":         ["A", "dtaaTexts", "itdForms", "irs8802"],
  "dtaa-worse":         ["A", "pwcWHT", "dtaaTexts", "ita2025"],
  "dtaa-uaetrc":        ["A", "uaeFta", "pwcUae"],
  "dtaa-noftc":         ["A", "uaeFta", "omanPit"],
  "dtaa-ftc-india":     ["B", "itdForms", "ita2025"],

  "ins-gst":            ["A", "dfsGst"],
  "ins-term":           ["B", "irdai", "rbiMD"],
  "ins-10d":            ["B", "ita2025", "irdai"],
  "ins-ulip-us":        ["B", "irs8621", "craT1135"],
  "ins-health":         ["B", "irdai"],

  "ben-oci":            ["B", "mhaOci", "uidai", "eci"],
  "ben-ssa-us":         ["A", "ssaList", "epfo"],
  "ben-ssa":            ["A", "canSsa", "epfo"],
  "ben-epf":            ["B", "epfo"],

  "ret-window":         ["B", "itdNR", "rbiMD"],
  "ret-ror":            ["A", "itdNR", "ita2025"],
  "ret-canada-exit":    ["B", "craLeaving", "craResid"],
  "ret-aus-pr":         ["A", "atoTemp", "atoResid", "atoCgt"],
  "ret-nz-48":          ["A", "irdTrans", "irdFif"],

  "comp-fbar":          ["A", "irsFbar", "irs8938"],
  "comp-t1135":         ["B", "craT1135"],
  "comp-dates":         ["B", "itdReturn", "rbiRemit"],
  "comp-pan":           ["C", "itdForms", "itdNR"],
};

for (const c of CARDS) {
  const m = CARD_META[c.id];
  c.g = m?.[0] ?? null;                 // null, not "B" — an ungraded card must fail loudly
  c.s = m ? m.slice(1) : [];
}

export const GRADES = {
  A: "Confirmed against a government, regulator or tax-authority source.",
  B: "Consistent across several independent reputable sources.",
  C: "A single source, or sources partly disagreed — confirm before relying on it.",
};

/* ===========================================================================
   WHAT THIS DOES NOT KNOW

   The honest half of an answer engine. Without this a query about UK tax or
   crypto returns the least-bad match and reads as an answer, which is worse
   than silence. Each entry is a subject deliberately outside the corpus, the
   reason, and where the reader should actually go.
   =========================================================================== */

export const NOT_COVERED = [
  { id: "uk", label: "The United Kingdom corridor",
    match: "uk united kingdom britain british england london scotland wales hmrc isa premium bond non-dom",
    why: "This knowledge base covers five corridors — the US, Canada, the Gulf, Australia and New Zealand. The UK is not one of them, and UK residence, domicile and remittance-basis rules are different enough that borrowing an answer from another corridor would be wrong.",
    where: "HMRC guidance on residence and domicile, and the India-UK DTAA text on the Income Tax Department's treaty page." },
  { id: "singapore", label: "Singapore, the EU and other corridors",
    match: "singapore malaysia hong kong japan germany france netherlands ireland europe eu south africa kenya nigeria mauritius",
    why: "Outside the five corridors this knowledge base was researched for. The Indian half of an answer would still hold, but the host-country half — which is usually the half that decides the outcome — has not been checked.",
    where: "PwC Worldwide Tax Summaries for the country, plus the relevant India DTAA text." },
  { id: "crypto", label: "Crypto and virtual digital assets",
    match: "crypto cryptocurrency bitcoin ethereum vda virtual digital asset nft token web3 binance coinbase",
    why: "India's 30% VDA regime, its 1% TDS and the cross-border treatment of virtual digital assets are not in this corpus. The rules are moving quickly and a stale answer here would be actively harmful.",
    where: "The Income-tax Act, 2025 provisions on virtual digital assets, and current CBDT circulars." },
  { id: "trusts", label: "Trusts and complex structures",
    match: "trust trustee settlor discretionary offshore structure llp holding company family office foundation",
    why: "Indian private trusts, and the US and Canadian reporting that attaches to a foreign trust, are a specialist area this corpus does not attempt. Getting it wrong is expensive in both directions.",
    where: "A cross-border trust specialist in both jurisdictions — this is not a question to settle from a web page." },
  { id: "business", label: "Business structures and permanent establishment",
    match: "permanent establishment pe transfer pricing poem place of effective management incorporate company startup consultancy invoice gst registration payroll",
    why: "This corpus answers personal cross-border money questions. Whether your consulting arrangement creates an Indian permanent establishment, and how it should be priced, turns on facts and contracts a knowledge base cannot see.",
    where: "A chartered accountant with international tax practice, working from your actual contracts." },
  { id: "statetax", label: "US state and Canadian provincial tax",
    match: "california texas jersey state statewide provincial province ontario quebec columbia franchise",
    why: "Only federal treatment is covered. US state tax is a real and frequently large cost for returnees — California in particular is aggressive about residence — and it is not governed by the India treaty at all.",
    where: "The state or provincial revenue authority, and a preparer licensed in that state." },
  { id: "immigration", label: "Immigration and visa questions",
    match: "visa sponsorship green card lottery citizenship application pr points test naturalisation passport renewal consulate appointment i-140 eb2 express entry",
    why: "Tax residence and immigration status are different systems that only occasionally line up — the ATO says so explicitly. This corpus answers the tax and money half only.",
    where: "The immigration authority itself, or a registered migration agent." },
];

/** The out-of-scope subject a query is really about, or null. */
export function gapFor(query) {
  // Two letters, because "uk" and "eu" are the whole question when someone asks
  // one — a three-character floor silently drops the only word that mattered.
  const words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  if (!words.length) return null;
  let best = null, bestHits = 0;
  for (const g of NOT_COVERED) {
    const terms = new Set(g.match.split(/\s+/));
    const hits = words.filter((w) => terms.has(w)).length;
    if (hits > bestHits) { best = g; bestHits = hits; }
  }
  return bestHits > 0 ? best : null;
}
