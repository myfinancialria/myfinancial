// ---------------------------------------------------------------------------
// page_modules.mjs — the three modules that previously needed a running server:
// Planning/Tax/Goals, Advisory & Signals, and Will & Vault.
//
// They are static pages now because the work they do does not actually need a
// server. Tax, goals and the Will are pure computation over figures the user
// types; the advisory screens run over the same published market data the
// screener uses; and the vault is genuinely BETTER client-side, since an
// encrypted document that never leaves the browser cannot leak from a server.
//
// Each page loads the shared engines as ES modules, so the tax slabs and the
// Monte Carlo here are the very same code the server runs — not a re-implementation.
// ---------------------------------------------------------------------------
import { shell } from "./shell.mjs";

const MODULE_CSS = `
.tabsbar{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--line);margin-top:24px;flex-wrap:wrap}
.tabbtn{background:none;border:none;border-bottom:2px solid transparent;color:var(--ink-dim);padding:11px 16px;cursor:pointer;
  font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.tabbtn.on{color:var(--ink);border-bottom-color:var(--ink)}
.panel{padding-top:4px}
.formgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px 16px}
.f{display:flex;flex-direction:column;gap:5px}
.f label{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint)}
.f input,.f select,.f textarea{width:100%;font-family:inherit}
.f textarea{background:var(--paper);border:1px solid var(--line-2);color:var(--ink);padding:9px 11px;min-height:74px;resize:vertical}
.verdict{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:center;padding:18px 20px;border:1px solid var(--line-2);background:var(--paper-3)}
.verdict .big{font-size:27px;font-weight:800;letter-spacing:-.03em;margin-top:3px}
.vsplit{display:flex;gap:26px}
.vsplit .v{font-size:20px;font-weight:750;margin:3px 0;font-variant-numeric:tabular-nums}
.vsplit .v.win{color:var(--up)}
.rec{border:1px solid var(--line);padding:13px 16px;margin-bottom:9px;background:var(--paper-2)}
.rec-h{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:5px;flex-wrap:wrap}
.rec .save{font-family:var(--mono);font-size:10.5px;color:var(--up);white-space:nowrap}
.rec .dim{font-size:13px;line-height:1.7}
.up{color:var(--up)}.down{color:var(--down)}.warn{color:var(--warn)}
#cashNotes{padding-left:18px;display:grid;gap:9px}
#cashNotes li{font-size:13.5px;color:var(--ink-dim);line-height:1.7}
.draft{white-space:pre-wrap;font-family:var(--mono);font-size:12px;line-height:1.75;background:var(--paper);border:1px solid var(--line-2);padding:20px;max-height:620px;overflow:auto}
.rowlist{display:grid;gap:8px}
.rowitem{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr)) 34px;gap:7px;align-items:center}
.xbtn{border:1px solid var(--line-2);background:transparent;color:var(--ink-dim);width:32px;height:32px;cursor:pointer;font-size:15px;line-height:1}
.xbtn:hover{border-color:var(--down);color:var(--down)}
.check{display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-bottom:1px solid var(--line)}
.check .box{width:17px;height:17px;border:1px solid var(--line-2);flex:0 0 auto;margin-top:2px;display:grid;place-items:center;font-size:11px}
.check .box.done{background:var(--up);border-color:var(--up);color:var(--paper)}
.locked{text-align:center;padding:34px 20px}
.sig{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);border:1px solid var(--line-2);padding:3px 9px}
.setup{border:1px solid var(--warn);padding:13px 16px;color:var(--ink-dim);font-size:13px;line-height:1.7;background:color-mix(in srgb,var(--warn) 7%,transparent)}
@media print{nav.site,footer.site,.tabsbar,.noprint{display:none!important}.draft{border:none;max-height:none;padding:0}}
`;

const money = (id, label, bind, hint) =>
  '<div class="f' + (hint === "nri" ? " nri-only" : "") + '"><label>' + label + "</label>"
  + '<input type="number" step="1000" min="0" data-bind="' + bind + '" id="' + id + '"></div>';

// ===========================================================================
// 1. Planning, Tax & Goals
// ===========================================================================
export function planningPage() {
  const body = `
<div class="head">
  <div class="eyebrow">Planning · Tax · Goals</div>
  <h1>Your numbers, <em>worked out properly.</em></h1>
  <p class="sub">A full FY 2025-26 income-tax computation across both regimes, a cash-flow and protection review, and multi-goal feasibility by Monte Carlo simulation. This runs the same engines the platform's server runs &mdash; the slab logic, surcharge caps, 87A marginal relief and the correlated simulation are the real implementations, not a simplified web version.
  <b>Everything stays in your browser.</b> Nothing you type is sent anywhere; figures are saved locally so the page remembers them.</p>
</div>

<div class="tabsbar">
  <button class="tabbtn on" data-tab="tax">Tax centre</button>
  <button class="tabbtn" data-tab="cash">Cash flow &amp; protection</button>
  <button class="tabbtn" data-tab="goals">Goals</button>
  <div class="spacer"></div>
  <button class="btn noprint" id="resetAll">Reset</button>
</div>

<!-- ------------------------------ TAX ------------------------------ -->
<div class="panel" data-panel="tax">
  <div class="card"><div class="card-h"><h2>Your income</h2><span class="chip ok" id="taxFy"></span></div>
    <div class="card-b"><div class="formgrid">
      <div class="f"><label>Residency</label><select data-bind="profile.residency">
        <option value="RESIDENT">Resident Indian</option><option value="NRI">NRI</option></select></div>
      <div class="f"><label>Age</label><input type="number" min="18" max="100" data-bind="profile.age"></div>
      ${money("salary", "Salary (annual)", "inc.salary")}
      ${money("rent", "Rental income (annual)", "inc.rentalAnnual")}
      ${money("biz", "Business / profession", "inc.business")}
      ${money("fno", "F&O / trading gains", "inc.fnoGains")}
      ${money("div", "Dividends", "inc.dividends")}
      ${money("int", "Interest (savings, FD)", "inc.otherInterest")}
      ${money("nro", "NRO interest", "inc.nroInterest", "nri")}
      ${money("nre", "NRE interest (exempt)", "inc.nreInterest", "nri")}
      ${money("stcg", "Equity STCG (20%)", "inc.stcgEquity")}
      ${money("ltcg", "Equity LTCG (12.5%)", "inc.ltcgEquity")}
      ${money("ltcgo", "Other LTCG (12.5%)", "inc.ltcgOther")}
    </div></div>
    <div class="card-h" style="border-top:1px solid var(--line)"><h2>Deductions &amp; investments</h2>
      <span class="chip">old regime, except employer NPS</span></div>
    <div class="card-b"><div class="formgrid">
      ${money("c80", "80C — ELSS, EPF, PPF, LIC", "ded.sec80C")}
      ${money("d80", "80D — health insurance", "ded.sec80D")}
      ${money("nps1b", "80CCD(1B) — NPS self", "ded.nps80CCD1B")}
      ${money("npse", "80CCD(2) — employer NPS", "ded.npsEmployer")}
      ${money("g80", "80G — donations", "ded.donations80G")}
      ${money("hli", "Home-loan interest", "ded.homeLoanInterest")}
    </div></div>
  </div>

  <div id="taxVerdict" style="margin-top:18px"></div>

  <div class="grid g2">
    <div class="card"><div class="card-h"><h2>How the income is taxed</h2></div>
      <div class="scroll"><table><tbody id="taxHeads"></tbody></table></div></div>
    <div class="card"><div class="card-h"><h2>What you owe</h2></div>
      <div class="scroll"><table><tbody id="taxTotals"></tbody></table></div></div>
  </div>

  <div class="card"><div class="card-h"><h2>Slab by slab</h2></div>
    <div class="scroll"><table><thead><tr><th>Band</th><th class="num">Rate</th><th class="num">Income in band</th><th class="num">Tax</th></tr></thead>
    <tbody id="taxSlabs"></tbody></table></div></div>

  <div class="card"><div class="card-h"><h2>What would reduce this</h2><span class="chip">ranked by rupees saved</span></div>
    <div class="card-b" id="taxRecs"></div>
    <div class="note">An informational computation for planning, not a substitute for a Chartered Accountant or the official filing utility. Salaried taxpayers may choose their regime afresh each year.</div>
  </div>
</div>

<!-- ---------------------------- CASH FLOW --------------------------- -->
<div class="panel" data-panel="cash" hidden>
  <div class="card"><div class="card-h"><h2>Monthly cash flow, assets and cover</h2></div>
    <div class="card-b"><div class="formgrid">
      ${money("mi", "Monthly income (take-home)", "cash.monthlyIncome")}
      ${money("me", "Monthly expenses", "cash.monthlyExpense")}
      ${money("emi", "Monthly EMIs", "cash.emi")}
      ${money("as", "Total assets", "cash.assets")}
      ${money("li", "Total liabilities", "cash.liabilities")}
      ${money("lq", "Liquid savings", "cash.liquidAssets")}
      ${money("lc", "Life cover (sum assured)", "cash.lifeCover")}
      ${money("hc", "Health cover", "cash.healthCover")}
      <div class="f"><label>Dependants</label><input type="number" min="0" max="10" data-bind="cash.dependants"></div>
    </div></div>
  </div>
  <div class="grid g4" style="margin-top:16px" id="cashStats"></div>
  <div class="card"><div class="card-h"><h2>What this says</h2></div>
    <div class="card-b"><ul id="cashNotes"></ul></div>
    <div class="note">Rules of thumb, not rules: six months of outgo in reserve, EMIs under 40% of income, life cover around ten times income plus outstanding loans. Your circumstances may justify different numbers.</div>
  </div>
</div>

<!-- ------------------------------ GOALS ----------------------------- -->
<div class="panel" data-panel="goals" hidden>
  <div class="card"><div class="card-h"><h2>The goal</h2></div>
    <div class="card-b"><div class="formgrid">
      <div class="f"><label>Goal name</label><input type="text" data-bind="goal.name"></div>
      ${money("ta", "Target amount (today's money)", "goal.targetAmount")}
      <div class="f"><label>Target year</label><input type="number" min="2026" max="2090" data-bind="goal.targetYear"></div>
      ${money("cc", "Already invested", "goal.currentCorpus")}
      ${money("sip", "Monthly SIP", "goal.monthlySip")}
      <div class="f"><label>Annual step-up %</label><input type="number" min="0" max="30" step="1" data-bind="goal.stepUpPct"></div>
      <div class="f"><label>Inflation assumption %</label><input type="number" min="0" max="15" step="0.5" data-bind="goal.inflation"></div>
      <div class="f"><label>Risk appetite</label><select data-bind="goal.riskBand">
        <option value="CONSERVATIVE">Conservative</option>
        <option value="MODERATELY_CONSERVATIVE">Moderately conservative</option>
        <option value="BALANCED">Balanced</option>
        <option value="GROWTH">Growth</option>
        <option value="AGGRESSIVE">Aggressive</option></select></div>
    </div>
    <div class="dim" style="font-size:13px;margin-top:12px" id="goalAlloc"></div></div>
  </div>

  <div class="grid g4" style="margin-top:16px" id="goalStats"></div>

  <div class="card"><div class="card-h"><h2>Where this could end up</h2><span class="chip ok">2,000 simulated paths</span></div>
    <div class="card-b" style="color:var(--ink)"><div id="goalChart"></div></div>
    <div class="note" id="goalNote"></div>
  </div>

  <div class="card"><div class="card-h"><h2>Closing the gap</h2>
    <button class="btn noprint" id="solveSip">What SIP do I need?</button></div>
    <div class="card-b" id="goalSip"></div>
    <div class="note">The solver bisects for the monthly SIP that puts feasibility at 75% &mdash; a deliberately demanding bar, since a plan that works in half of futures is not a plan.</div>
  </div>
</div>`;

  return shell({
    title: "Planning, Tax & Goals — FY 2025-26 tax calculator and goal simulator | myfinancial",
    description: "Full FY 2025-26 income-tax computation across old and new regimes, cash-flow and protection review, and multi-goal Monte Carlo feasibility. Runs entirely in your browser; nothing is sent anywhere.",
    body, active: "planning",
    head: `<style>${MODULE_CSS}</style>`,
    bodyEnd: `<script type="module" src="js/planning.js"></script>`,
  });
}

// ===========================================================================
// 2. Advisory & Signals
// ===========================================================================
export function advisoryPage({ priceDate, stockCount }) {
  const body = `
<div class="head">
  <div class="eyebrow">Advisory &amp; Signals</div>
  <h1>Ideas with the <em>reasoning attached.</em></h1>
  <p class="sub">Rule-based screens over all ${stockCount.toLocaleString("en-IN")} NSE-listed companies, rebuilt every market day from official exchange data (prices as of ${priceDate}). Every idea shows the rules it passed and the numbers behind it, so you can disagree with it on the evidence rather than take it on trust.</p>
</div>

<div class="card" style="border-color:var(--warn)">
  <div class="card-b" style="font-size:13px;line-height:1.75;color:var(--ink-dim)">
    <b style="color:var(--warn)">Educational research, not investment advice.</b>
    myfinancial is not a SEBI-registered investment adviser or research analyst. These are mechanical screens over public data, not recommendations, and nothing here accounts for your circumstances, horizon or risk tolerance. Levels are computed from price history, not predictions. Do your own work, and size positions so that being wrong is survivable.
  </div>
</div>

<div class="tabsbar">
  <button class="tabbtn on" data-tab="quality">Long-term ideas</button>
  <button class="tabbtn" data-tab="swing">Swing setups</button>
  <button class="tabbtn" data-tab="momentum">Momentum</button>
  <button class="tabbtn" data-tab="income">Income &amp; hedging</button>
</div>

<div class="panel" data-panel="quality">
  <div class="card"><div class="card-h"><div><h2>Quality at a reasonable price</h2>
    <div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">high return on capital, sensible leverage, not expensive against its own sub-sector, and trending up</div></div>
    <span class="chip" id="qualityCount"></span></div>
    <div class="scroll"><table id="qualityTbl"></table></div>
    <div class="note">The screen: ROE and ROCE both at least 15%, net margin 8%+, liabilities under 1.5&times; equity, priced at or below the sub-sector median P/E, above the 200-day average, and at least &#8377;5 crore traded a day. Ranked by return on capital.</div>
  </div>
</div>

<div class="panel" data-panel="swing" hidden>
  <div class="card"><div class="card-h"><div><h2>Swing setups</h2>
    <div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">pullbacks and breakouts in confirmed uptrends, with levels from the stock's own volatility</div></div>
    <span class="chip" id="swingCount"></span></div>
    <div class="scroll"><table id="swingTbl"></table></div>
    <div class="note">Entry, stop and target are derived from the 14-day Average True Range &mdash; the stop sits 1.5&times; ATR below entry and the target 3&times; ATR above, so every setup shown carries a 2:1 reward-to-risk by construction. A wide ATR means a wider stop and a smaller position, not a tighter stop.</div>
  </div>
</div>

<div class="panel" data-panel="momentum" hidden>
  <div class="card"><div class="card-h"><div><h2>Relative-strength leaders</h2>
    <div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">strongest one-year performers still in a confirmed advance</div></div>
    <span class="chip" id="momCount"></span></div>
    <div class="scroll"><table id="momTbl"></table></div>
    <div class="note">RS rank is the percentile of one-year return against every listed company: 95 means only 5% of the market did better. Momentum persists on average and reverses violently in particular &mdash; these need stops more than conviction.</div>
  </div>
</div>

<div class="panel" data-panel="income" hidden>
  <div class="card"><div class="card-h"><div><h2>Dividend income</h2>
    <div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">yield backed by profits, summed from each company's own filed payouts</div></div>
    <span class="chip" id="incCount"></span></div>
    <div class="scroll"><table id="incTbl"></table></div>
    <div class="note">Yield is the total cash dividend declared over the last twelve months divided by today's price. A very high yield usually means the price has fallen for a reason &mdash; check why before buying it for the income.</div>
  </div>

  <div class="card"><div class="card-h"><h2>Portfolio hedging</h2></div>
    <div class="card-b"><div class="formgrid" style="max-width:640px">
      <div class="f"><label>Portfolio value (&#8377;)</label><input type="number" id="hedgeValue" value="10000000" step="100000"></div>
      <div class="f"><label>Portfolio beta</label><input type="number" id="hedgeBeta" value="1.0" step="0.05" min="0.1" max="3"></div>
    </div>
    <div id="hedgeOut" style="margin-top:16px"></div></div>
    <div class="note">Index-hedge sizing arithmetic only. Options pricing and the live chain need the running platform &mdash; this page deliberately shows only what can be computed honestly from published exchange data.</div>
  </div>
</div>`;

  return shell({
    title: "Advisory & Signals — rule-based ideas over every NSE company | myfinancial",
    description: `Quality, value, swing and momentum screens over all ${stockCount} NSE-listed companies, rebuilt each market day from official exchange data. Every idea shows the rules it passed. Educational research, not investment advice.`,
    body, active: "advisory",
    head: `<style>${MODULE_CSS}</style>`,
    bodyEnd: `<script type="module" src="js/advisory.js"></script>`,
  });
}

// ===========================================================================
// 3. Will & Vault
// ===========================================================================
export function estatePage() {
  const body = `
<div class="head">
  <div class="eyebrow">Will &amp; Vault</div>
  <h1>A Will, drafted <em>properly.</em></h1>
  <p class="sub">A guided wizard that produces a draft Will following Indian Succession Act, 1925 conventions &mdash; revocation, executor, specific bequests, residuary clause, guardianship for minors and a two-witness attestation block &mdash; plus an encrypted vault for the documents your executor will need to find.
  <b>Both run entirely in your browser.</b> The draft and the vault never leave this device.</p>
</div>

<div class="tabsbar">
  <button class="tabbtn on" data-tab="will">Will wizard</button>
  <button class="tabbtn" data-tab="checklist">Estate checklist</button>
  <button class="tabbtn" data-tab="vault">Encrypted vault</button>
</div>

<div class="panel" data-panel="will">
  <div class="card"><div class="card-h"><h2>Testator</h2></div>
    <div class="card-b"><div class="formgrid">
      <div class="f"><label>Full name</label><input type="text" data-will="fullName"></div>
      <div class="f"><label>Age</label><input type="number" min="18" max="110" data-will="age"></div>
      <div class="f"><label>PAN</label><input type="text" data-will="pan"></div>
      <div class="f"><label>Occupation</label><input type="text" data-will="occupation"></div>
      <div class="f"><label>City of execution</label><input type="text" data-will="city"></div>
      <div class="f" style="grid-column:1/-1"><label>Address</label><input type="text" data-will="address"></div>
    </div></div>
  </div>

  <div class="card"><div class="card-h"><h2>Beneficiaries</h2><button class="btn noprint" id="addBene">+ Add</button></div>
    <div class="card-b"><div class="rowlist" id="beneList"></div>
    <div class="dim" style="font-size:12.5px;margin-top:10px">Give an age for minors &mdash; a guardianship clause is added automatically for anyone under 18.</div></div>
  </div>

  <div class="card"><div class="card-h"><h2>Assets &amp; bequests</h2><button class="btn noprint" id="addAsset">+ Add</button></div>
    <div class="card-b"><div class="rowlist" id="assetList"></div></div>
  </div>

  <div class="card"><div class="card-h"><h2>Executor, guardian &amp; witnesses</h2></div>
    <div class="card-b"><div class="formgrid">
      <div class="f"><label>Executor name</label><input type="text" data-will="executor.name"></div>
      <div class="f"><label>Executor relation</label><input type="text" data-will="executor.relation"></div>
      <div class="f"><label>Executor address</label><input type="text" data-will="executor.address"></div>
      <div class="f"><label>Alternate executor</label><input type="text" data-will="alternateExecutor.name"></div>
      <div class="f"><label>Alternate relation</label><input type="text" data-will="alternateExecutor.relation"></div>
      <div class="f"><label>Residuary beneficiary</label><input type="text" data-will="residuaryBeneficiary"></div>
      <div class="f"><label>Guardian for minors</label><input type="text" data-will="guardian.name"></div>
      <div class="f"><label>Guardian relation</label><input type="text" data-will="guardian.relation"></div>
      <div class="f"><label>Guardian address</label><input type="text" data-will="guardian.address"></div>
      <div class="f"><label>Witness 1 name</label><input type="text" data-will="witness1.name"></div>
      <div class="f"><label>Witness 1 address</label><input type="text" data-will="witness1.address"></div>
      <div class="f"><label>Witness 2 name</label><input type="text" data-will="witness2.name"></div>
      <div class="f"><label>Witness 2 address</label><input type="text" data-will="witness2.address"></div>
      <div class="f" style="grid-column:1/-1"><label>Special instructions</label><textarea data-will="specialInstructions"></textarea></div>
    </div></div>
  </div>

  <div class="card"><div class="card-h"><h2>Draft</h2>
    <div class="row" style="display:flex;gap:8px">
      <button class="btn noprint" id="printWill">Print / PDF</button>
      <button class="btn noprint" id="downloadWill">Download</button>
    </div></div>
    <div class="card-b"><div class="draft" id="willDraft"></div></div>
    <div class="note">A draft for review by a qualified lawyer, not an executed Will. Two independent witnesses who are <b>not</b> beneficiaries must attest it. Registration is optional in India but recommended. Nominations on bank, demat and insurance accounts do not override a Will &mdash; align them, or your executor inherits a dispute.</div>
  </div>
</div>

<div class="panel" data-panel="checklist" hidden>
  <div class="card"><div class="card-h"><h2>Estate readiness</h2><span class="chip" id="checkScore"></span></div>
    <div class="card-b" id="checkList"></div>
    <div class="note">Ticked automatically from what you have completed on this page and stored in the vault.</div>
  </div>
</div>

<div class="panel" data-panel="vault" hidden>
  <div class="card"><div class="card-h"><h2>Encrypted vault</h2><span class="chip ok">AES-256-GCM · in this browser</span></div>
    <div id="vaultLocked" class="locked">
      <p class="sub" style="margin:0 auto 16px">Set a passphrase to encrypt the vault. It is stretched with PBKDF2 (210,000 rounds of SHA-256) into an AES-256-GCM key that never leaves this browser and is never stored &mdash; so if you forget the passphrase, the contents are gone. That is the point.</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <input type="password" id="vaultPass" placeholder="Passphrase" style="min-width:250px">
        <button class="btn pri" id="vaultUnlock">Unlock</button>
      </div>
      <div class="dim" style="font-size:12.5px;margin-top:12px" id="vaultHint"></div>
    </div>
    <div id="vaultOpen" hidden>
      <div class="card-b">
        <div class="formgrid">
          <div class="f"><label>Category</label><select id="docCat">
            <option value="WILL">Will</option><option value="PROPERTY_DEEDS">Property deeds</option>
            <option value="INSURANCE_POLICIES">Insurance policies</option><option value="KYC">KYC / identity</option>
            <option value="BANK">Bank &amp; demat</option><option value="OTHER">Other</option></select></div>
          <div class="f"><label>Title</label><input type="text" id="docTitle" placeholder="e.g. Flat sale deed 2019"></div>
          <div class="f" style="grid-column:1/-1"><label>Details / where the original is kept</label><textarea id="docBody"></textarea></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn pri" id="docAdd">Encrypt &amp; store</button>
          <button class="btn" id="vaultExport">Export encrypted backup</button>
          <button class="btn" id="vaultLock">Lock</button>
        </div>
      </div>
      <div class="scroll"><table><thead><tr><th>Category</th><th>Title</th><th>Details</th><th>Added</th><th></th></tr></thead>
        <tbody id="docTbl"></tbody></table></div>
    </div>
    <div class="note">Encryption happens in this browser with the Web Crypto API. There is no server, no account and no recovery: the exported backup is ciphertext, useless without your passphrase. Store scans of originals in a safe or a bank locker &mdash; this vault is for the index that tells your executor where to look.</div>
  </div>
</div>`;

  return shell({
    title: "Will & Vault — draft an Indian Will and store the papers encrypted | myfinancial",
    description: "A guided Will wizard following Indian Succession Act conventions, an estate-readiness checklist, and an AES-256-GCM encrypted vault. Everything runs in your browser and never leaves the device.",
    body, active: "estate",
    head: `<style>${MODULE_CSS}</style>`,
    bodyEnd: `<script type="module" src="js/estate.js"></script>`,
  });
}
