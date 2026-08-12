// ---------------------------------------------------------------------------
// planning.js — Planning, Tax & Goals, entirely in the browser.
//
// This imports the SAME engines the server runs (shared/tax.mjs, shared/goals.mjs),
// so the numbers here are not a simplified copy — the FY 2025-26 slab logic,
// surcharge caps, 87A marginal relief and the correlated Monte Carlo are the
// real implementations.
//
// Nothing is sent anywhere. Every figure you type stays in this browser, saved
// to localStorage so the page remembers it next time.
// ---------------------------------------------------------------------------
import { compare, recommendations, FY } from "./tax.mjs";
import { simulateGoal, requiredSip, recommendedAlloc, rebalancePrompt } from "./goals.mjs";

const $ = (id) => document.getElementById(id);
const STORE = "myfin.planning.v1";

const inr = (x) => (x === null || x === undefined || Number.isNaN(x) ? "—" : "₹" + Math.round(x).toLocaleString("en-IN"));
const pct1 = (x) => (typeof x === "number" ? x.toFixed(1) + "%" : "—");

// --------------------------------- state -----------------------------------
const DEFAULTS = {
  profile: { residency: "RESIDENT", age: 35 },
  inc: {
    salary: 1800000, rentalAnnual: 0, business: 0, fnoGains: 0, dividends: 0,
    otherInterest: 0, nroInterest: 0, nreInterest: 0,
    stcgEquity: 0, ltcgEquity: 0, ltcgOther: 0,
  },
  ded: { sec80C: 150000, sec80D: 25000, nps80CCD1B: 0, donations80G: 0, homeLoanInterest: 0, npsEmployer: 0 },
  cash: { monthlyIncome: 150000, monthlyExpense: 80000, emi: 0, assets: 5000000, liabilities: 1500000, liquidAssets: 600000, lifeCover: 5000000, healthCover: 1000000, dependants: 2 },
  // A worked example that lands mid-range on purpose: it opens showing a goal
  // that is neither comfortably funded nor hopeless, so the feasibility number
  // and the SIP solver both have something to say.
  goal: { name: "Retirement", targetAmount: 25000000, targetYear: new Date().getFullYear() + 20, currentCorpus: 2000000, monthlySip: 50000, stepUpPct: 10, riskBand: "BALANCED", inflation: 6 },
};

let S = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE));
    if (!raw) return structuredClone(DEFAULTS);
    // merge so a newly added field does not break a saved older shape
    const out = structuredClone(DEFAULTS);
    for (const k of Object.keys(out)) Object.assign(out[k], raw[k] || {});
    return out;
  } catch { return structuredClone(DEFAULTS); }
}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* private mode */ } };

// ------------------------------ input binding -------------------------------
/** Wire every [data-bind="group.field"] control to the state object. */
function bindInputs(root, onChange) {
  root.querySelectorAll("[data-bind]").forEach((el) => {
    const [group, field] = el.dataset.bind.split(".");
    const cur = S[group]?.[field];
    if (cur !== undefined && cur !== null) el.value = cur;
    const handler = () => {
      const v = el.type === "number" ? Number(el.value || 0) : el.value;
      S[group][field] = v;
      save();
      onChange();
    };
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", handler);
  });
}

// =============================== TAX CENTRE =================================
function renderTax() {
  const cmp = compare(S.profile, S.inc, S.ded);
  const recs = recommendations(S.profile, S.inc, S.ded, cmp, {});
  const better = cmp[cmp.better];
  const worse = cmp[cmp.better === "NEW" ? "OLD" : "NEW"];

  $("taxVerdict").innerHTML =
    '<div class="verdict"><div><div class="k">Recommended for you</div>'
    + '<div class="big">' + cmp.better + " regime</div>"
    + '<div class="dim" style="font-size:13px">saves ' + inr(cmp.savings) + " a year on this income mix</div></div>"
    + '<div class="vsplit">'
    + '<div><div class="k">New regime</div><div class="v ' + (cmp.better === "NEW" ? "win" : "") + '">' + inr(cmp.NEW.tax.total) + "</div>"
    + '<div class="k">eff. ' + pct1(cmp.NEW.effectiveRatePct) + "</div></div>"
    + '<div><div class="k">Old regime</div><div class="v ' + (cmp.better === "OLD" ? "win" : "") + '">' + inr(cmp.OLD.tax.total) + "</div>"
    + '<div class="k">eff. ' + pct1(cmp.OLD.effectiveRatePct) + "</div></div>"
    + "</div></div>";

  // head-wise breakdown of the winning regime
  const h = better.heads;
  const rows = [
    ["Salary", h.salary], ["Standard deduction", -h.standardDeduction],
    ["House property", h.houseProperty], ["Business / F&O", h.business],
    ["Dividends", h.dividends], ["Interest", h.interest],
    ["NRE interest (exempt)", h.nreInterestExempt || null],
    ["Equity STCG @20%", h.stcgEquity], ["Equity LTCG @12.5%", h.ltcgEquity],
    ["  of which exempt (112A)", h.ltcgExemptionUsed ? -h.ltcgExemptionUsed : null],
    ["Other LTCG @12.5%", h.ltcgOther],
  ].filter(([, v]) => v);
  $("taxHeads").innerHTML = rows.map(([k, v]) =>
    "<tr><td>" + k + '</td><td class="num">' + inr(v) + "</td></tr>").join("")
    + '<tr class="strong"><td>Taxable at slab rates</td><td class="num">' + inr(better.slabIncome) + "</td></tr>";

  $("taxSlabs").innerHTML = (better.slabLines || []).map((l) =>
    "<tr><td>" + l.band + '</td><td class="num">' + l.rate + '%</td><td class="num">' + inr(l.amount) + '</td><td class="num">' + inr(l.tax) + "</td></tr>").join("")
    || '<tr><td colspan="4" class="dim">No slab-rate tax at this income.</td></tr>';

  const t = better.tax;
  $("taxTotals").innerHTML = [
    ["Tax on slab income", t.slab],
    ["Less: 87A rebate", t.rebate87A ? -t.rebate87A : null],
    ["Short-term capital gains", t.stcg],
    ["Long-term capital gains", t.ltcg],
    ["Surcharge" + (t.surchargeRatePct ? " @" + t.surchargeRatePct + "%" : ""), t.surcharge],
    ["Health & education cess @4%", t.cess],
  ].filter(([, v]) => v).map(([k, v]) =>
    "<tr><td>" + k + '</td><td class="num">' + inr(v) + "</td></tr>").join("")
    + '<tr class="strong"><td>Total tax payable</td><td class="num">' + inr(t.total) + "</td></tr>";

  $("taxRecs").innerHTML = recs.length
    ? recs.map((r) =>
      '<div class="rec"><div class="rec-h"><b>' + r.title + "</b>"
      + (r.impact > 0 ? '<span class="save">saves ~' + inr(r.impact) + "</span>" : "")
      + '</div><div class="dim">' + r.detail + "</div></div>").join("")
    : '<div class="dim">No further suggestions for this income mix.</div>';

  $("taxFy").textContent = FY;
  // NRI-only inputs appear only when they apply
  document.querySelectorAll(".nri-only").forEach((el) => { el.style.display = S.profile.residency === "NRI" ? "" : "none"; });
}

// ============================ NET WORTH & CASH FLOW =========================
function renderCash() {
  const c = S.cash;
  const netWorth = c.assets - c.liabilities;
  const surplus = c.monthlyIncome - c.monthlyExpense - c.emi;
  const savingsRate = c.monthlyIncome > 0 ? (surplus / c.monthlyIncome) * 100 : 0;
  const dti = c.monthlyIncome > 0 ? (c.emi / c.monthlyIncome) * 100 : 0;
  const emergencyMonths = c.monthlyExpense + c.emi > 0 ? c.liquidAssets / (c.monthlyExpense + c.emi) : 0;
  // the standard planning rule of thumb: cover ~10x income, and clear the debt
  const recommendedLife = c.monthlyIncome * 12 * 10 + c.liabilities;
  const lifeGap = Math.max(0, recommendedLife - c.lifeCover);
  const recommendedHealth = c.dependants > 2 ? 1500000 : 1000000;
  const healthGap = Math.max(0, recommendedHealth - c.healthCover);

  const tile = (k, v, sub, tone) =>
    '<div class="stat"><div class="k">' + k + '</div><div class="v ' + (tone || "") + '">' + v + "</div>"
    + '<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">' + sub + "</div></div>";

  $("cashStats").innerHTML =
    tile("Net worth", inr(netWorth), inr(c.assets) + " assets − " + inr(c.liabilities) + " debt", netWorth >= 0 ? "" : "down")
    + tile("Monthly surplus", inr(surplus), pct1(savingsRate) + " of income saved", surplus > 0 ? "up" : "down")
    + tile("Debt-to-income", pct1(dti), dti > 40 ? "above the 40% comfort limit" : "within a healthy range", dti > 40 ? "down" : "up")
    + tile("Emergency fund", emergencyMonths.toFixed(1) + " months", emergencyMonths >= 6 ? "at least six months covered" : "aim for six months of outgo", emergencyMonths >= 6 ? "up" : "down");

  const notes = [];
  if (savingsRate < 20) notes.push("A savings rate of " + pct1(savingsRate) + " is thin. Most plans assume 20–30%; the single biggest lever on every goal below is this number, not the return you chase.");
  if (dti > 40) notes.push("EMIs take " + pct1(dti) + " of income. Above roughly 40% lenders baulk and a job gap becomes dangerous — clear the costliest loan before adding investments.");
  if (emergencyMonths < 6) notes.push("An emergency fund of " + emergencyMonths.toFixed(1) + " months sits below the six-month norm. Top it up in a liquid fund before locking money into long-dated goals.");
  if (lifeGap > 0) notes.push("Life cover looks short by about " + inr(lifeGap) + ". A common yardstick is ten times annual income plus outstanding loans (" + inr(recommendedLife) + " here), so dependants can clear debt and replace income.");
  if (healthGap > 0) notes.push("Health cover of " + inr(c.healthCover) + " is below the " + inr(recommendedHealth) + " a family of this size would typically want in a metro.");
  if (!notes.length) notes.push("Cash flow, debt, emergency fund and protection all look reasonable on these figures.");
  $("cashNotes").innerHTML = notes.map((n) => "<li>" + n + "</li>").join("");
}

// ================================= GOALS ====================================
let lastSim = null;

function renderGoal() {
  const g = S.goal;
  const years = Math.max(0.5, g.targetYear - new Date().getFullYear());
  const alloc = recommendedAlloc(years, g.riskBand);
  const input = {
    name: g.name, targetAmount: g.targetAmount, targetYear: g.targetYear,
    currentCorpus: g.currentCorpus, monthlySip: g.monthlySip, stepUpPct: g.stepUpPct,
    inflation: (g.inflation || 6) / 100, alloc, seed: g.name,
  };

  const sim = simulateGoal(input, { paths: 2000, wantBands: true });
  lastSim = sim;

  const tone = sim.verdict === "ACHIEVABLE" ? "up" : sim.verdict === "AT_RISK" ? "warn" : "down";
  const label = { ACHIEVABLE: "On track", AT_RISK: "At risk", UNREALISTIC: "Not on track" }[sim.verdict];

  $("goalStats").innerHTML =
    '<div class="stat"><div class="k">Feasibility</div><div class="v ' + tone + '">' + sim.feasibility + "%</div>"
    + '<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">' + label + "</div></div>"
    + '<div class="stat"><div class="k">Target in ' + g.targetYear + '</div><div class="v">' + inr(sim.target) + "</div>"
    + '<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">' + inr(sim.targetToday) + " in today's money</div></div>"
    + '<div class="stat"><div class="k">Median outcome</div><div class="v">' + inr(sim.median) + "</div>"
    + '<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">'
    + (sim.shortfallAtMedian > 0 ? "short by " + inr(sim.shortfallAtMedian) : "clears the target") + "</div></div>"
    + '<div class="stat"><div class="k">Range of outcomes</div><div class="v" style="font-size:17px">' + inr(sim.p10) + " – " + inr(sim.p90) + "</div>"
    + '<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">10th to 90th percentile</div></div>';

  $("goalAlloc").innerHTML = "Recommended glide path for " + years.toFixed(0) + " years at "
    + g.riskBand.toLowerCase().replace(/_/g, " ") + " risk: <b>"
    + Math.round(alloc.equity * 100) + "% equity · " + Math.round(alloc.debt * 100) + "% debt · "
    + Math.round(alloc.gold * 100) + "% gold</b>. Equity is trimmed automatically as the goal approaches.";

  drawBands(sim, input);

  $("goalSip").innerHTML = "";
  $("goalNote").innerHTML = "Simulated over 2,000 correlated paths for equity, debt and gold "
    + "(11.5% / 6.8% / 8.5% long-run returns, with the historical negative equity–debt correlation). "
    + "The target is inflated at " + (g.inflation || 6) + "% a year, so " + inr(sim.targetToday)
    + " today becomes " + inr(sim.target) + " by " + g.targetYear + ". "
    + "Feasibility is the share of paths that finish at or above that inflated target.";
}

/** Percentile fan chart, drawn as inline SVG. */
function drawBands(sim, input) {
  const b = sim.bands;
  const el = $("goalChart");
  if (!b || !b.times.length) { el.innerHTML = ""; return; }
  const W = 1000, H = 260;
  const maxY = Math.max(...b.p90, sim.target) * 1.05;
  const X = (i) => (i / (b.times.length - 1)) * W;
  const Y = (v) => H - (v / maxY) * H;
  const path = (arr) => arr.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("");
  const band = (lo, hi) => path(hi) + "L" + X(lo.length - 1).toFixed(1) + " " + Y(lo[lo.length - 1]).toFixed(1)
    + lo.slice().reverse().map((v, i) => "L" + X(lo.length - 1 - i).toFixed(1) + " " + Y(v).toFixed(1)).join("") + "Z";
  const targetY = Y(sim.target);

  el.innerHTML = '<svg viewBox="0 0 ' + W + " " + (H + 20) + '" preserveAspectRatio="none" style="width:100%;height:' + (H + 20) + 'px;display:block" role="img" aria-label="Projected corpus percentile bands">'
    + '<path d="' + band(b.p10, b.p90) + '" fill="currentColor" opacity=".10"/>'
    + '<path d="' + band(b.p25, b.p75) + '" fill="currentColor" opacity=".16"/>'
    + '<path d="' + path(b.p50) + '" fill="none" stroke="currentColor" stroke-width="2"/>'
    + '<line x1="0" y1="' + targetY.toFixed(1) + '" x2="' + W + '" y2="' + targetY.toFixed(1) + '" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="6 4"/>'
    + '<text x="6" y="' + (targetY - 6).toFixed(1) + '" fill="var(--warn)" font-size="11" font-family="ui-monospace,Menlo,monospace">target ' + inr(sim.target) + "</text>"
    + '<text x="0" y="' + (H + 15) + '" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">today</text>'
    + '<text x="' + W + '" y="' + (H + 15) + '" text-anchor="end" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">' + input.targetYear + "</text>"
    + "</svg>";
}

// ---------------------------------- boot ------------------------------------
function renderAll() { renderTax(); renderCash(); renderGoal(); }

document.addEventListener("DOMContentLoaded", () => {
  bindInputs(document, renderAll);

  // tabs
  document.querySelectorAll(".tabbtn").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".tabbtn").forEach((x) => x.classList.toggle("on", x === b));
      document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    };
  });

  // The SIP solver runs 18 bisection rounds of 500 paths, so it is on demand
  // rather than on every keystroke.
  $("solveSip").onclick = () => {
    const btn = $("solveSip");
    btn.disabled = true; btn.textContent = "Solving…";
    setTimeout(() => {
      const g = S.goal;
      const years = Math.max(0.5, g.targetYear - new Date().getFullYear());
      const need = requiredSip({
        name: g.name, targetAmount: g.targetAmount, targetYear: g.targetYear,
        currentCorpus: g.currentCorpus, monthlySip: g.monthlySip, stepUpPct: g.stepUpPct,
        inflation: (g.inflation || 6) / 100, alloc: recommendedAlloc(years, g.riskBand), seed: g.name,
      }, 75);
      const delta = need - g.monthlySip;
      $("goalSip").innerHTML = '<div class="rec"><div class="rec-h"><b>' + inr(need)
        + " a month reaches this goal with 75% confidence</b></div><div class=\"dim\">"
        + (delta > 0
          ? "That is " + inr(delta) + " more than the " + inr(g.monthlySip) + " you are investing now. Raising the annual step-up is usually easier than finding the whole increase today."
          : "You are already investing " + inr(-delta) + " more than needed — the goal is comfortably funded, and the surplus could go to another goal.")
        + "</div></div>";
      btn.disabled = false; btn.textContent = "What SIP do I need?";
    }, 30);
  };

  $("resetAll").onclick = () => {
    if (!confirm("Reset every figure on this page to the example values?")) return;
    S = structuredClone(DEFAULTS); save();
    document.querySelectorAll("[data-bind]").forEach((el) => {
      const [g, f] = el.dataset.bind.split(".");
      if (S[g]?.[f] !== undefined) el.value = S[g][f];
    });
    renderAll();
  };

  renderAll();
});
