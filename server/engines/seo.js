// ---------------------------------------------------------------------------
// seo.js — SEO content engine + plain-English data interpreter.
//
// Articles for /learn are generated two ways:
//   1. GROUNDED COMPOSER (always available) — deterministic templates filled
//      with numbers computed by the live engines, written in plain English for
//      the common Indian investor (₹ examples, no jargon without translation).
//   2. AIMLAPI (optional) — set AIMLAPI_KEY and the same grounded facts are
//      handed to an LLM (api.aimlapi.com, OpenAI-compatible) to expand into
//      richer long-form copy. Facts arrive pre-computed; the model only writes.
//
// Every article ships with meta description, keywords, FAQ pairs (FAQPage
// JSON-LD) and internal links — the pages are server-rendered for crawlers.
// ---------------------------------------------------------------------------
import { q, insert } from "../lib/db.js";
import * as fundsE from "./funds.js";
import * as tax from "./tax.js";
import * as market from "./market.js";
import * as amfi from "../providers/amfi.js";
import { round1 } from "../lib/util.js";
import { cfg } from "../lib/config.js";

const INR = (x) => "₹" + Math.round(x).toLocaleString("en-IN");
const L = (x) => `₹${(x / 1e5).toFixed(x >= 1e6 ? 0 : 1)} lakh`;
const CR = (x) => `₹${(x / 1e7).toFixed(2)} crore`;

// ------------------------------ AIMLAPI adapter ------------------------------
export async function aimlapiChat(messages, { maxTokens = 1800 } = {}) {
  const key = cfg("AIMLAPI_KEY");
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60_000);
    const res = await fetch("https://api.aimlapi.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: cfg("AIMLAPI_MODEL") || "gpt-4o-mini",
        max_tokens: maxTokens,
        temperature: 0.6,
        messages,
      }),
    }).finally(() => clearTimeout(t));
    if (!res.ok) { console.log(`  seo: AIMLAPI HTTP ${res.status} — using grounded composer`); return null; }
    const json = await res.json();
    return json?.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.log("  seo: AIMLAPI unreachable —", String(e.message).slice(0, 80));
    return null;
  }
}

const AIML_SYSTEM = `You write for myfinancial, an Indian personal-finance platform. Audience: ordinary Indian savers (and NRIs) with no finance background. Rules:
- Simple English, short sentences. Explain every term in brackets the first time (e.g., "NAV (the price of one unit of a fund)").
- Use the FACTS block verbatim — never change a number, never invent data, never name funds not in the facts.
- Rupee examples over percentages where possible. Indian context: SIP, ELSS, PPF, LTCG, NRE/NRO.
- Structure with ## headings and short paragraphs; end with a 2-line "Bottom line".
- No investment advice — informational tone; SEBI disclaimer will be appended automatically.
Return ONLY the article body in markdown (no title).`;

// --------------------------- fact gatherers ----------------------------------
async function topLiveFunds(bucket, n = 3) {
  try {
    const u = await amfi.getUniverse();
    const rows = u.funds.filter((f) => f.bucket === bucket && f.r3 !== null)
      .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || (b.r3 ?? -99) - (a.r3 ?? -99)).slice(0, n);
    if (rows.length) return { rows, navDate: u.navDate, live: true };
  } catch { /* offline */ }
  return null;
}

function topSyntheticFunds(category, n = 3) {
  return fundsE.ranked().filter((f) => f.category === category).sort((a, b) => b.score - a.score).slice(0, n)
    .map((f) => ({ name: f.name, r3: f.returns["3Y"], stars: f.rating, nav: f.nav }));
}

// ------------------------------ article specs --------------------------------
// Each spec: gather() → facts; compose(facts) → { body, faq }
const SPECS = [
  {
    slug: "new-vs-old-tax-regime-fy-2025-26",
    title: "New vs Old Tax Regime (FY 2025-26): Which One Saves You More?",
    metaDescription: "New tax regime vs old tax regime for FY 2025-26 explained in plain English — slabs, ₹75,000 standard deduction, 87A rebate up to ₹12 lakh, and who should still pick the old regime.",
    keywords: "new tax regime vs old, income tax slabs FY 2025-26, 87A rebate 12 lakh, standard deduction 75000, which tax regime is better",
    category: "Tax",
    gather: async () => {
      const p = { residency: "RESIDENT", age: 35 };
      const inc = { salary: 1600000, rentalAnnual: 0, dividends: 0 };
      const dedFull = { sec80C: 150000, sec80D: 25000, nps80CCD1B: 50000, homeLoanInterest: 200000 };
      const withDed = tax.compare(p, inc, dedFull);
      const noDed = tax.compare(p, inc, {});
      return { withDed, noDed };
    },
    compose: (f) => ({
      body: `## The 60-second answer

For FY 2025-26 the **new regime is the default** and wins for most people. Income up to **₹12 lakh is effectively tax-free** for residents (₹12.75 lakh for salaried people, thanks to the ₹75,000 standard deduction), because of the Section 87A rebate.

The old regime only wins when your **deductions are large** — typically a home loan on a self-occupied house plus full 80C, 80D and NPS.

## A real example: ₹16 lakh salary

Our tax engine ran both regimes for a salaried resident earning ${L(1600000)} a year:

| Scenario | New regime | Old regime | Winner |
|---|---|---|---|
| No major deductions | **${INR(f.noDed.NEW.tax.total)}** | ${INR(f.noDed.OLD.tax.total)} | NEW saves ${INR(f.noDed.savings)} |
| Full deductions (80C ₹1.5L + 80D ₹25k + NPS ₹50k + home-loan interest ₹2L) | ${INR(f.withDed.NEW.tax.total)} | **${INR(f.withDed.OLD.tax.total)}** | ${f.withDed.better} saves ${INR(f.withDed.savings)} |

Read that second row carefully: even with ~₹4.25 lakh of deductions, the gap is ${INR(f.withDed.savings)}. Below roughly ₹4 lakh of deductions, the new regime usually stays ahead.

## New regime slabs, FY 2025-26

0–4L: nil · 4–8L: 5% · 8–12L: 10% · 12–16L: 15% · 16–20L: 20% · 20–24L: 25% · above 24L: 30%. Add 4% cess. Salaried standard deduction: ₹75,000.

## Who should still choose the old regime?

- You pay **home-loan interest near ₹2 lakh** on a self-occupied house (that deduction disappears in the new regime)
- You claim **HRA** on high metro rent
- Your 80C/80D/NPS buckets are genuinely full every year

## Bottom line

Compute, don't guess — salaried taxpayers may switch **every year** while filing. Run both regimes on your own numbers in the myfinancial Tax Centre in under a minute.`,
      faq: [
        ["Is income up to ₹12 lakh really tax-free in the new regime?", "Yes, for resident individuals in FY 2025-26 the Section 87A rebate wipes out tax on taxable income up to ₹12 lakh (₹12.75 lakh for salaried after the ₹75,000 standard deduction). Capital gains taxed at special rates are not covered by the rebate."],
        ["Can I switch between regimes every year?", "Salaried taxpayers can choose either regime each year while filing. If you have business income you can switch back to the old regime only once."],
        ["Does the new regime allow any deductions?", "The big survivor is employer NPS under 80CCD(2) — up to 14% of basic salary. The ₹75,000 standard deduction on salary also applies."],
      ],
    }),
  },
  {
    slug: "best-flexi-cap-funds-india",
    title: "Best Flexi Cap Funds in India Right Now — Ranked by Real Data",
    metaDescription: "Top flexi cap mutual funds in India ranked by 3-year returns and consistency from live AMFI/mfapi data, explained in plain English with what a ₹10,000 SIP could look like.",
    keywords: "best flexi cap funds, top flexi cap mutual funds India, direct plan flexi cap, flexi cap fund returns comparison",
    category: "Mutual Funds",
    gather: async () => (await topLiveFunds("equity_flexi")) || { rows: topSyntheticFunds("FLEXI"), live: false },
    compose: (f) => ({
      body: `## What is a flexi cap fund, in one line?

A flexi cap fund lets the manager buy **any size of company** — large, mid or small — shifting the mix as opportunities change. One fund, the whole market.

## The current top three${f.live ? ` (live AMFI data, NAV date ${f.navDate})` : " (platform demo data)"}

| Fund (Direct-Growth) | 3-year return (per year) | Rating |
|---|---|---|
${f.rows.map((r) => `| ${r.name.replace(/ - Direct.*$/i, "")} | ${r.r3 ?? "—"}% | ${"★".repeat(r.stars ?? 3)} |`).join("\n")}

"3-year return per year" means: if the fund did ${f.rows[0]?.r3 ?? 15}% CAGR, ₹1,00,000 invested three years ago is roughly ${INR(100000 * Math.pow(1 + (f.rows[0]?.r3 ?? 15) / 100, 3))} today.

## How to actually choose (3 checks)

1. **Direct plan, Growth option, always.** Direct plans skip distributor commission — the same fund, ~0.5–1% higher return every year, which compounds massively.
2. **Consistency beats last year's topper.** A fund that's decent every year usually beats one spectacular-then-terrible.
3. **Expense ratio under ~0.8%** for active flexi caps.

## What a ₹10,000 monthly SIP could become

At 12% a year: ~${L(2320000 / 1e5 * 1e5)} in 10 years (you invest ${L(1200000)}). At 14%: ~${L(2620000)}. Small rate differences, huge outcomes — costs and consistency matter.

## Bottom line

Pick one good flexi cap as your portfolio's growth engine, pay direct-plan prices, and let SIPs run for 7+ years. Rankings refresh daily on the myfinancial screener from official AMFI NAVs.`,
      faq: [
        ["Are flexi cap funds better than large cap funds?", "They're more flexible — managers can add mid/small caps when they're cheap. That usually means slightly higher return potential with slightly higher swings than pure large caps."],
        ["What is a Direct plan?", "The same mutual fund without distributor commission. NAV grows faster because ~0.5–1% a year isn't being paid out of your money. Buy from the AMC or a zero-commission platform."],
        ["How long should I stay invested in a flexi cap fund?", "Minimum 5 years, ideally 7–10+. Equity needs time; SIPs smooth the ride."],
      ],
    }),
  },
  {
    slug: "ltcg-tax-harvesting-125-lakh-guide",
    title: "LTCG Harvesting: The Legal Trick That Saves ₹15,625 Every Year",
    metaDescription: "Long-term capital gains harvesting explained: use the ₹1.25 lakh LTCG exemption every financial year to reset your cost price and legally cut equity tax to zero.",
    keywords: "LTCG harvesting India, 1.25 lakh LTCG exemption, capital gains tax saving equity mutual funds, tax harvesting SIP",
    category: "Tax",
    gather: async () => ({}),
    compose: () => ({
      body: `## The rule that makes this possible

Every financial year, your **first ₹1.25 lakh of long-term capital gains** (LTCG) on listed equity and equity mutual funds is **tax-free**. Above that, LTCG is taxed at 12.5%.

Most people let this ₹1.25 lakh allowance **expire unused** every 31st March. Harvesting means using it.

## How harvesting works (4 steps)

1. Find holdings you've held **over 12 months** that are sitting on gains.
2. **Sell** enough units to realise up to ₹1.25 lakh of gains this FY.
3. **Buy the same fund/stock back** in a day or two.
4. Your money never really leaves the market — but your **purchase price resets higher**, so future taxable gain is smaller.

Saved tax: 12.5% × ₹1,25,000 = **₹15,625 every single year** — ₹1.5 lakh+ over a decade, compounding.

## A worked example

You bought ₹4 lakh of an index fund in 2023; it's worth ₹5.2 lakh today (₹1.2 lakh gain, long-term).
- **Without harvesting:** sell years later, the whole accumulated gain is taxed beyond the allowance.
- **With harvesting:** sell today (₹1.2L gain → 0 tax, inside the allowance), rebuy at ₹5.2 lakh. Your cost is now ₹5.2 lakh — the ₹1.2 lakh gain has been made permanently tax-free.

## The fine print (read this)

- Only **long-term** holdings qualify (>12 months for equity). Selling earlier means 20% STCG — don't.
- Watch **exit loads** (many funds charge 1% within 365 days) and the 1–2 day settlement gap.
- The exemption is per **person** per FY — a couple can harvest ₹2.5 lakh combined.

## Bottom line

Ten minutes every January–March, ₹15,625 saved, fully legal, explicitly built into the Income-tax Act. The myfinancial Tax Centre shows your unrealised gains and how much allowance you have left.`,
      faq: [
        ["Is tax harvesting legal in India?", "Completely. You're simply using the ₹1.25 lakh annual LTCG exemption Parliament wrote into Section 112A. There is no wash-sale rule in India for this."],
        ["Do SIP instalments qualify as long-term?", "Each SIP instalment has its own 12-month clock. Funds redeem oldest-first (FIFO), so early instalments usually qualify first."],
        ["What if my gains are more than ₹1.25 lakh?", "Harvest up to the limit each year rather than all at once — the allowance resets every 1st April."],
      ],
    }),
  },
  {
    slug: "sip-step-up-power-compounding",
    title: "The 10% SIP Step-Up: How Small Annual Raises Double Your Corpus",
    metaDescription: "Step-up SIP explained with real maths — increasing your SIP 10% a year can nearly double your retirement corpus vs a flat SIP. Tables in rupees, no jargon.",
    keywords: "step up SIP calculator, SIP increase every year, top up SIP benefits, SIP vs step up SIP corpus difference",
    category: "Investing",
    gather: async () => ({}),
    compose: () => ({
      body: `## One habit, double the money

A SIP (Systematic Investment Plan) invests a fixed amount monthly. A **step-up SIP** raises that amount every year — usually alongside your salary increment. The difference over 20 years is brutal:

| Plan | Monthly start | Total invested | Corpus @12%/yr |
|---|---|---|---|
| Flat SIP | ₹25,000 | ${CR(25000 * 240)} | ~${CR(24700000)} |
| Step-up 10%/yr | ₹25,000 | ${CR(51000 * 337)}* | ~${CR(44600000)} |

*Total invested grows because instalments rise. Yes — the **corpus nearly doubles** (₹2.47 Cr → ₹4.46 Cr) from the same starting point.

## Why it works

1. **Your income grows ~8–10% a year; a flat SIP silently shrinks** as a share of income. Step-ups keep your savings rate honest.
2. **Later rupees are bigger rupees.** Year-10's ₹65,000 instalments dwarf year-1's ₹25,000 — and there are 240+ of them.
3. **It's automatic.** Every AMC and platform supports an annual top-up instruction. Decide once.

## How much step-up is right?

- Salary raises ~10%? Step up 10%.
- Variable income? Step up 5% and top up bonuses as lumpsums.
- Already saving 40%+ of income? A flat SIP is fine — you're ahead.

## Bottom line

The first SIP amount matters far less than the discipline of raising it. Set a 10% annual step-up today; your 55-year-old self will not believe the statement.`,
      faq: [
        ["What is a step-up SIP?", "A SIP where the monthly amount automatically increases by a fixed percentage (or amount) every year — e.g., ₹25,000 growing 10% annually."],
        ["Does step-up SIP need new paperwork every year?", "No. You set the top-up instruction once when starting the SIP; the increase applies automatically."],
        ["Is 12% return guaranteed?", "No. Equity returns vary year to year; 11–13% is a long-run historical range for Indian equity, not a promise. The discipline works at any realistic return."],
      ],
    }),
  },
  {
    slug: "nri-nre-vs-nro-account-guide",
    title: "NRE vs NRO Account: Where Should an NRI Keep Money in India?",
    metaDescription: "NRE vs NRO explained for NRIs — which interest is tax-free, the 30% TDS trap, the USD 1 million repatriation rule, and how DTAA cuts your tax with a TRC.",
    keywords: "NRE vs NRO account difference, NRI account tax free interest, NRO TDS 30 percent, USD 1 million repatriation 15CA 15CB, NRI DTAA benefit",
    category: "NRI",
    gather: async () => ({}),
    compose: () => ({
      body: `## The one-line rule

**Foreign earnings → NRE. Indian earnings → NRO.** Getting this wrong is the most expensive default an NRI makes.

## NRE (Non-Resident External)

- Funded from your **overseas income**
- Interest is **100% tax-free in India**
- Principal + interest **fully repatriable** — move it abroad any time, no limits, no forms
- Great for: FDs from Gulf/US/Singapore savings, investing in Indian markets on a repatriable basis

## NRO (Non-Resident Ordinary)

- Collects your **India-sourced income**: rent, dividends, pension, old savings
- Interest **fully taxable**, and banks deduct **TDS at ~30%** upfront (Section 195)
- Repatriation capped at **USD 1 million per financial year**, with a CA's Form 15CB + Form 15CA
- Your final tax may be far lower than 30% — file a return in India and claim the refund, or apply treaty rates

## The DTAA discount most NRIs never claim

India's tax treaties (with the UAE, US, UK, Singapore and 90+ countries) often cap Indian tax on interest/dividends at **10–15% instead of 30%**. To get it: give your bank a **Tax Residency Certificate (TRC)** from your country plus **Form 10F**. That's it — the TDS rate drops at source.

## Three mistakes to avoid

1. Keeping foreign savings in an **NRO** account — you volunteer 30% TDS on interest that could be 0% in NRE.
2. Using a **resident** savings account after becoming an NRI — not permitted under FEMA; convert it.
3. Forgetting **RNOR** on return to India — up to ~3 years where foreign income stays non-taxable. Plan FD maturities into that window.

## Bottom line

Route money by its **source**, claim the treaty rate with a TRC, and keep NRE for anything you may want back abroad. The myfinancial NRI panel tracks all of this against your actual accounts.`,
      faq: [
        ["Is NRE interest completely tax-free?", "In India, yes, while you're a non-resident under FEMA. Your country of residence may still tax it (the US does) — check your local rules."],
        ["How much can I repatriate from an NRO account?", "Up to USD 1 million per financial year, with Form 15CA and a chartered accountant's 15CB certificate. Current income like rent is repatriable after tax."],
        ["Can an NRI keep a normal savings account in India?", "No. On becoming an NRI you must redesignate resident accounts to NRO (or open NRE). Holding a resident account as an NRI violates FEMA."],
      ],
    }),
  },
  {
    slug: "index-funds-vs-active-funds-india",
    title: "Index Funds vs Active Funds in India: The Honest Comparison",
    metaDescription: "Index fund vs actively managed fund in India — costs, SPIVA-style evidence, when active still wins (mid/small caps), and a simple core-satellite structure.",
    keywords: "index funds vs active funds India, nifty 50 index fund returns, expense ratio comparison, core satellite portfolio India",
    category: "Investing",
    gather: async () => {
      const idx = topSyntheticFunds("INDEX", 2);
      return { idx };
    },
    compose: (f) => ({
      body: `## The 30-second version

An **index fund** simply copies a market index (like the Nifty 50) at a tiny fee (~0.1–0.3%). An **active fund** pays a manager to try to beat it (~0.5–1% in direct plans). In large caps, most active funds **fail to beat the index over 10 years** — mostly because of that fee gap. In mid/small caps, skilled managers still add value more often.

## What the fee difference does to money

₹20,000/month SIP for 20 years at 12% gross:
- Index fund at 0.2% fees → corpus ≈ **${CR(19300000)}**
- Active fund at 1.0% fees, same gross → corpus ≈ **${CR(17300000)}**

Same market, same discipline — **${CR(2000000)} less**, gone in fees. An active fund must beat the index by ~0.8%/yr *every year* just to tie.

## When active funds earn their keep

- **Mid & small caps** — less researched, more mispricing, wider winner gaps
- **Debt** — credit selection and duration calls matter
- **Flexi caps with proven, consistent managers** (judge on 5–7yr rolling returns, not last year)

## A sane structure: core & satellite

- **Core (50–70%):** Nifty 50 / Sensex index fund — cheap, boring, unkillable
- **Satellite (30–50%):** one flexi cap + one mid/small cap you genuinely trust
- Rebalance yearly; direct plans only.

## Bottom line

You don't have to pick a side. Own the market cheaply at the core, pay for skill only where skill statistically survives.`,
      faq: [
        ["Do index funds beat active funds in India?", "In large caps, most active funds have trailed the Nifty 50/Sensex over long periods after fees. In mid/small caps active managers still outperform more often — check rolling returns, not one-year tables."],
        ["What is a good expense ratio for an index fund?", "For a Nifty 50 direct-plan index fund, roughly 0.1–0.25%. Also check tracking error — under ~0.5% is good."],
        ["Are ETFs better than index funds?", "ETFs can be cheaper but need a demat account and trade at market prices (watch liquidity). Index funds are simpler for SIPs."],
      ],
    }),
  },
  {
    slug: "emergency-fund-how-much-india",
    title: "Emergency Fund: How Much Is Enough (and Where to Park It)?",
    metaDescription: "How many months of expenses your emergency fund needs, where to keep it (liquid funds vs FDs vs savings), and how to build it without pausing your SIPs.",
    keywords: "emergency fund how many months, liquid fund vs FD emergency, where to keep emergency fund India, emergency corpus calculator",
    category: "Planning",
    gather: async () => ({}),
    compose: () => ({
      body: `## The number

- **Stable salaried, double income:** 6 months of expenses
- **Single income or dependents:** 9 months
- **Business/freelance/variable pay:** 12 months

"Expenses" = rent/EMI + food + utilities + school fees + insurance premiums — what life actually costs monthly, not your income. If that's ₹80,000, a single-income family should hold ~${L(720000)}.

## Where to park it (the 3-bucket split)

| Bucket | Amount | Instrument | Why |
|---|---|---|---|
| Instant | 1 month | Savings account / sweep FD | ATM-speed access |
| Quick | 2–4 months | **Liquid fund** (T+1) | ~6–7% yield, next-day redemption |
| Deep | rest | Short FDs / ultra-short debt fund | slightly better yield, still days-fast |

Never in equity, never in your trading account, never "temporarily" in a hot stock.

## Build it without stopping SIPs

Split your monthly surplus 50:50 between the emergency bucket and SIPs until the fund is full — momentum in both. Bonuses and tax refunds go 100% to the fund until done.

## When to actually use it

Job loss, medical gap beyond insurance, urgent family travel, critical home/vehicle repair. Not for iPhones, not for "the dip".

## Bottom line

An emergency fund isn't an investment — it's the **firewall** that stops a bad month from liquidating your compounding. Fill it before chasing returns; the myfinancial dashboard shows your runway in months, live.`,
      faq: [
        ["Is a liquid fund safe for an emergency fund?", "Liquid funds hold very short government/company paper and are among the lowest-risk mutual funds. Redemptions typically credit the next working day; several AMCs offer instant redemption up to ₹50,000."],
        ["Should the emergency fund earn high returns?", "No — its job is availability, not growth. Accept savings/liquid-fund yields; take return-risk only with money that has a 5+ year runway."],
        ["Emergency fund or loan prepayment first?", "Emergency fund first, at least 3 months' worth — otherwise any shock forces fresh, costlier debt."],
      ],
    }),
  },
  {
    slug: "what-is-nav-mutual-fund-explained",
    title: "What Is NAV in Mutual Funds? (And Why a ₹10 NAV Isn't 'Cheap')",
    metaDescription: "NAV (Net Asset Value) explained simply — what the number means, why a low NAV is not cheaper, how cut-off times work, and what actually matters when picking funds.",
    keywords: "what is NAV in mutual fund, low NAV vs high NAV, mutual fund NAV meaning, NAV cut off time india",
    category: "Basics",
    gather: async () => ({}),
    compose: () => ({
      body: `## NAV in one sentence

**NAV (Net Asset Value)** is the price of **one unit** of a mutual fund: everything the fund owns, minus expenses, divided by the number of units — declared once every business day.

## The myth that refuses to die

"NFO at ₹10 NAV is cheaper than a fund at ₹500 NAV." **False.** Invest ₹10,000 in either:

- Fund A, NAV ₹10 → you get 1,000 units
- Fund B, NAV ₹500 → you get 20 units

If both portfolios grow 10%, both investments become **₹11,000**. The NAV level tells you a fund's *age and history*, not its *value*. A ₹500 NAV usually just means the fund has been compounding for years — often a good sign, not a bad one.

## What NAV is actually useful for

1. **Tracking growth** — NAV ₹50 → ₹100 means your money doubled (Growth option).
2. **Cut-off timing** — invest before **3:00 PM** (equity funds) and you get *that day's* NAV; after, the next day's. For liquid funds the cut-off is 1:30 PM.
3. **Tax lots** — each purchase's NAV is your cost price for capital-gains math.

## What matters instead when choosing funds

Rolling returns and consistency · expense ratio (direct plan) · fund size and mandate · your own horizon. NAV level appears nowhere on that list.

## Bottom line

NAV is a price tag per unit, not a value meter. Judge funds by returns after costs — the myfinancial screener ranks all 2,400+ Direct-Growth schemes on exactly that, refreshed from official AMFI data.`,
      faq: [
        ["Is a fund with lower NAV better?", "No. NAV level is irrelevant to future returns — ₹10,000 grows identically in a ₹10-NAV or ₹500-NAV fund if the portfolios perform the same."],
        ["When is NAV declared?", "Once per business day, usually by late evening, based on closing prices of everything the fund holds."],
        ["Why did my order get the next day's NAV?", "You crossed the cut-off (3:00 PM for equity funds; funds must also receive the money in time). Invest earlier in the day to be safe."],
      ],
    }),
  },
];

// ------------------------------ generation -----------------------------------
const DISCLAIMER = "\n\n---\n*This article is educational information from myfinancial, not investment advice under SEBI (Investment Advisers) Regulations, 2013. Mutual fund investments are subject to market risks — read all scheme-related documents carefully. Tax rules per Finance Act for FY 2025-26; confirm with a Chartered Accountant.*";

export async function generateArticle(spec, { useLLM = true } = {}) {
  const facts = await spec.gather().catch(() => ({}));
  const grounded = spec.compose(facts);
  let body = grounded.body;
  let generator = "grounded-composer";
  if (useLLM && cfg("AIMLAPI_KEY")) {
    const llm = await aimlapiChat([
      { role: "system", content: AIML_SYSTEM },
      { role: "user", content: `Title: ${spec.title}\nTarget keywords: ${spec.keywords}\n\nFACTS (verbatim, do not alter numbers):\n${grounded.body}\n\nRewrite/expand this into a richer 900-1200 word article for the same audience. Keep every number and fund name exactly as given. Keep the tables.` },
    ]);
    if (llm && llm.length > 400) { body = llm; generator = `aimlapi:${cfg("AIMLAPI_MODEL") || "gpt-4o-mini"}`; }
  }
  const now = Date.now();
  const row = {
    slug: spec.slug, title: spec.title, meta_description: spec.metaDescription,
    keywords: spec.keywords, category: spec.category,
    body_md: body + DISCLAIMER, faq: JSON.stringify(grounded.faq || []),
    generator, created: q.one("SELECT created FROM articles WHERE slug = ?", spec.slug)?.created || now, updated: now,
  };
  insert("articles", row);
  return row;
}

/** Seed all articles once (grounded composer — instant, no key needed). */
export async function seedArticles({ force = false } = {}) {
  const have = q.one("SELECT COUNT(*) AS c FROM articles").c;
  if (have >= SPECS.length && !force) return { seeded: 0, total: have };
  let n = 0;
  for (const spec of SPECS) {
    try { await generateArticle(spec, { useLLM: false }); n++; } catch (e) { console.log("  seo: seed failed", spec.slug, e.message); }
  }
  console.log(`  seo: ${n} articles ready at /learn${cfg("AIMLAPI_KEY") ? " (POST /api/seo/regenerate to enhance with AIMLAPI)" : " (set AIMLAPI_KEY to enhance with LLM copy)"}`);
  return { seeded: n, total: q.one("SELECT COUNT(*) AS c FROM articles").c };
}

/** Regenerate all (or one) with the LLM layer if configured. */
export async function regenerate(slug = null) {
  const specs = slug ? SPECS.filter((s) => s.slug === slug) : SPECS;
  const out = [];
  for (const spec of specs) out.push(await generateArticle(spec, { useLLM: true }));
  return out.map((r) => ({ slug: r.slug, generator: r.generator }));
}

export function listArticles() {
  return q.all("SELECT slug, title, meta_description, category, generator, updated FROM articles ORDER BY updated DESC");
}
export function getArticle(slug) {
  const a = q.one("SELECT * FROM articles WHERE slug = ?", slug);
  return a ? { ...a, faq: JSON.parse(a.faq || "[]") } : null;
}
export const specsMeta = () => SPECS.map((s) => ({ slug: s.slug, title: s.title, category: s.category }));

// ---------------------- LLM interpretation service ---------------------------
// Grounded facts in → richer plain-English prose out. Numbers are contractually
// locked in the prompt; 12h cache bounds cost; instant fallback when no key.
const interpCache = new Map(); // cacheKey → { text, generator, at }
const INTERP_TTL = 12 * 3600_000;

const INTERP_SYSTEM = `You are myfinancial's interpreter for ordinary Indian investors. You receive verified FACTS about a stock, fund or sector. Write a clear, warm interpretation in plain English:
- NEVER change, invent or extrapolate a number. Every figure you mention must appear in the FACTS.
- Explain jargon in brackets on first use. Use ₹ examples where natural.
- 2-3 short paragraphs, no headings, no bullet lists, no hype words.
- You are informational, not advisory — no buy/sell language.`;

export async function interpret(kind, cacheKey, facts, fallbackText) {
  const ck = `${kind}:${cacheKey}`;
  const hit = interpCache.get(ck);
  if (hit && Date.now() - hit.at < INTERP_TTL) return hit;
  let out = { text: fallbackText, generator: "grounded-composer", at: Date.now() };
  if (cfg("AIMLAPI_KEY")) {
    const llm = await aimlapiChat([
      { role: "system", content: INTERP_SYSTEM },
      { role: "user", content: `Interpret this ${kind} for a first-time Indian investor.\n\nFACTS (verbatim, source of truth):\n${facts}\n\nOur draft (improve on it without changing any number):\n${fallbackText}` },
    ], { maxTokens: 550 });
    if (llm && llm.length > 120) out = { text: llm.trim(), generator: `aimlapi:${cfg("AIMLAPI_MODEL") || "gpt-4o-mini"}`, at: Date.now() };
  }
  interpCache.set(ck, out);
  return out;
}
export const interpConfigured = () => !!cfg("AIMLAPI_KEY");

// --------------------- plain-English interpreters ----------------------------
/** One-paragraph plain-language read of a fund's metrics (for detail pages). */
export function plainEnglishFund(m) {
  if (!m) return null;
  const r3 = m.returns?.["3Y"];
  const grew = r3 ? INR(100000 * Math.pow(1 + r3 / 100, 3)) : null;
  const risk = m.stdDev > 18 ? "swings a lot — expect drops of 20%+ in bad years" : m.stdDev > 10 ? "moves with the market — dips of 10–15% are normal" : "is relatively steady";
  const skill = m.alpha === null ? "" : m.alpha > 1.5 ? ` The manager has beaten a simple index approach by about ${round1(m.alpha)}% a year after adjusting for risk — genuine value-add.` : m.alpha < -0.5 ? " After adjusting for risk it has lagged a plain index fund — you're paying for management that hasn't added value lately." : " Its risk-adjusted performance is roughly line-ball with the index.";
  return `In plain words: ₹1 lakh invested here 3 years ago would be about ${grew || "—"} today (${r3 ?? "—"}% a year). The fund ${risk}, and costs ${m.expenseRatio}% a year in the direct plan.${skill} ${m.rating >= 4 ? "It currently ranks in the top tier of its category on our combined score." : m.rating <= 2 ? "It currently ranks in the bottom half of its category — compare peers before committing." : ""}`;
}
