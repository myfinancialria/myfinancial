// ---------------------------------------------------------------------------
// screener_page.mjs — the interactive screener.
//
// The whole index (about 2,000 companies × 85 metrics, or 2,400 schemes × 40)
// is downloaded once as a columnar payload and filtered in memory. There is no
// server and no query round-trip, so every keystroke re-screens the entire
// market instantly — which is the point: a screener you have to wait for is a
// screener you stop exploring with.
//
// Saved screens live in localStorage, and every screen is also encoded into the
// URL, so a screen can be bookmarked or sent to someone else without an account.
// ---------------------------------------------------------------------------
import { shell } from "./shell.mjs";

// Ready-made screens. Each is an ordinary filter set — opening one and then
// editing it is the intended way to learn what the fields do.
export const STOCK_PRESETS = [
  {
    id: "quality", name: "Quality compounders",
    why: "Businesses that earn a high return on their own capital without leaning heavily on liabilities, and are still trending up.",
    filters: [
      { f: "roe", op: ">=", a: 15 }, { f: "roce", op: ">=", a: 15 },
      { f: "liabilitiesToEquity", op: "<=", a: 1.5 },
      { f: "profitMarginPct", op: ">=", a: 8 }, { f: "avgTurnoverCr", op: ">=", a: 5 },
      { f: "aboveSma200", op: "true" },
    ],
    sort: { f: "roe", dir: -1 },
  },
  {
    id: "value",
    name: "Value, but not broken",
    why: "Cheap against earnings and book AND cheaper than its own sector, while still holding above its long-term average — the filter that separates value from a falling knife.",
    filters: [
      { f: "pe", op: "between", a: 3, b: 18 }, { f: "pb", op: "<=", a: 3 },
      { f: "peVsSector", op: "<=", a: -10 }, { f: "roe", op: ">=", a: 10 },
      { f: "avgTurnoverCr", op: ">=", a: 2 },
    ],
    sort: { f: "pe", dir: 1 },
  },
  {
    id: "momentum", name: "Momentum leaders",
    why: "Top of the market on one-year relative strength, in a confirmed uptrend, and near their highs.",
    filters: [
      { f: "rsRank1y", op: ">=", a: 85 }, { f: "stage", op: "=", a: 2 },
      { f: "pctFrom52wHigh", op: ">=", a: -12 }, { f: "adx14", op: ">=", a: 20 },
      { f: "avgTurnoverCr", op: ">=", a: 5 },
    ],
    sort: { f: "rsRank1y", dir: -1 },
  },
  {
    id: "breakout", name: "Breaking out on volume",
    why: "Within a few percent of the 52-week high with today's volume well above its own average.",
    filters: [
      { f: "pctFrom52wHigh", op: ">=", a: -3 }, { f: "volumeRatio", op: ">=", a: 1.8 },
      { f: "avgTurnoverCr", op: ">=", a: 3 },
    ],
    sort: { f: "volumeRatio", dir: -1 },
  },
  {
    id: "delivery", name: "Quiet accumulation",
    why: "High delivery percentage means buyers are taking shares home rather than trading them intraday — and these are still well off their highs.",
    filters: [
      { f: "avgDeliveryPct20", op: ">=", a: 60 }, { f: "pctFrom52wHigh", op: "<=", a: -15 },
      { f: "stage", op: "in", a: ["1", "2"] }, { f: "avgTurnoverCr", op: ">=", a: 2 },
    ],
    sort: { f: "avgDeliveryPct20", dir: -1 },
  },
  {
    id: "oversold", name: "Oversold quality",
    why: "Profitable, low-debt companies whose price has been beaten down — a watchlist, not a buy list.",
    filters: [
      { f: "rsi14", op: "<=", a: 35 }, { f: "roe", op: ">=", a: 12 },
      { f: "liabilitiesToEquity", op: "<=", a: 2 }, { f: "avgTurnoverCr", op: ">=", a: 3 },
    ],
    sort: { f: "rsi14", dir: 1 },
  },
  {
    id: "dividend", name: "Dividend payers",
    why: "A meaningful yield, summed from the company's own declared dividends over the last year, backed by profits rather than by a collapsing share price.",
    filters: [
      { f: "dividendYieldPct", op: ">=", a: 2 },
      { f: "roe", op: ">=", a: 10 }, { f: "pe", op: "<=", a: 30 },
      { f: "avgTurnoverCr", op: ">=", a: 2 },
    ],
    sort: { f: "dividendYieldPct", dir: -1 },
  },
  {
    id: "smallcap", name: "Small caps waking up",
    why: "Smaller companies with real liquidity that have just turned up through their long-term average.",
    filters: [
      { f: "nseTier", op: "in", a: ["Mid cap", "Small cap"] }, { f: "aboveSma200", op: "true" },
      { f: "ret3m", op: ">=", a: 10 }, { f: "avgTurnoverCr", op: ">=", a: 2 },
    ],
    sort: { f: "ret3m", dir: -1 },
  },
  {
    id: "squeeze", name: "Volatility squeeze",
    why: "Bollinger bands unusually tight — a coiled spring. Direction is not predicted, only the compression.",
    filters: [
      { f: "bbWidthPct", op: "<=", a: 8 }, { f: "avgTurnoverCr", op: ">=", a: 3 },
      { f: "adx14", op: "<=", a: 20 },
    ],
    sort: { f: "bbWidthPct", dir: 1 },
  },
  {
    id: "stage4", name: "Stage 4 — avoid",
    why: "Price below a falling 30-week average. Shown so you can check whether something you hold is here.",
    filters: [{ f: "stage", op: "=", a: 4 }, { f: "avgTurnoverCr", op: ">=", a: 3 }],
    sort: { f: "ret1y", dir: 1 },
  },
];

export const FUND_PRESETS = [
  {
    id: "consistent", name: "Consistent equity",
    why: "Equity schemes whose average 3-year rolling return has been strong AND which have never lost money over any 3-year window.",
    filters: [
      { f: "categoryGroup", op: "in", a: ["Equity"] }, { f: "rolling3yAvg", op: ">=", a: 14 },
      { f: "rolling3yPctPositive", op: ">=", a: 95 }, { f: "ageYears", op: ">=", a: 5 },
      { f: "stale", op: "false" },
    ],
    sort: { f: "rolling3yAvg", dir: -1 },
  },
  {
    id: "sharpe", name: "Best risk-adjusted",
    why: "Highest return per unit of volatility over three years — the funds that did not make you suffer for the return.",
    filters: [{ f: "sharpe", op: ">=", a: 0.8 }, { f: "ageYears", op: ">=", a: 3 }, { f: "stale", op: "false" }],
    sort: { f: "sharpe", dir: -1 },
  },
  {
    id: "topquartile", name: "Top quartile, 5 years",
    why: "Schemes in the best quarter of their own category, with a five-year record to judge them on.",
    filters: [
      { f: "quartile", op: "=", a: 1 }, { f: "r5y", op: ">=", a: 12 },
      { f: "ageYears", op: ">=", a: 5 }, { f: "stale", op: "false" },
    ],
    sort: { f: "r5y", dir: -1 },
  },
  {
    id: "lowvol", name: "Steady, low volatility",
    why: "Modest swings with a respectable return — for money that cannot ride out a 40% drawdown.",
    filters: [
      { f: "volatility", op: "<=", a: 8 }, { f: "r3y", op: ">=", a: 7 },
      { f: "maxDrawdownPct", op: ">=", a: -12 }, { f: "stale", op: "false" },
    ],
    sort: { f: "r3y", dir: -1 },
  },
  {
    id: "index", name: "Index funds",
    why: "The cheapest way to own the market. Compare tracking against each other rather than chasing the leader.",
    filters: [{ f: "categoryGroup", op: "in", a: ["Index / ETF / FoF"] }, { f: "stale", op: "false" }],
    sort: { f: "r5y", dir: -1 },
  },
  {
    id: "elss", name: "ELSS tax savers",
    why: "Section 80C schemes with a three-year lock-in, ranked on how they actually did over rolling three-year holds.",
    filters: [{ f: "category", op: "contains", a: "ELSS" }, { f: "stale", op: "false" }],
    sort: { f: "rolling3yAvg", dir: -1 },
  },
  {
    id: "smallcapf", name: "Small & mid cap",
    why: "The high-return, high-drawdown end of equity. Look at the worst rolling window before the best.",
    filters: [
      { f: "category", op: "contains", a: "Cap" }, { f: "volatility", op: ">=", a: 14 },
      { f: "ageYears", op: ">=", a: 5 }, { f: "stale", op: "false" },
    ],
    sort: { f: "rolling3yMin", dir: -1 },
  },
  {
    id: "debt", name: "Debt — parked money",
    why: "Low-volatility debt schemes for money you may need soon. Check the worst drawdown, not just the yield.",
    filters: [
      { f: "categoryGroup", op: "in", a: ["Debt"] }, { f: "volatility", op: "<=", a: 3 },
      { f: "r1y", op: ">=", a: 5 }, { f: "stale", op: "false" },
    ],
    sort: { f: "r1y", dir: -1 },
  },
];

export function screenerPage({ stockCount, fundCount, priceDate, navDate }) {
  const body = `
<div class="head">
  <div class="eyebrow">Screener</div>
  <h1>Screen every listed company<br>and <em>every mutual fund.</em></h1>
  <p class="sub">${stockCount.toLocaleString("en-IN")} NSE-listed companies across ${"85"} technical and fundamental metrics, and ${fundCount.toLocaleString("en-IN")} mutual fund schemes across 40 return and risk measures. Build any combination of conditions, save it, and share it as a link. Everything runs in your browser &mdash; nothing you build here is sent anywhere.</p>
</div>

<div class="tabsbar" id="tabs">
  <button class="tabbtn on" data-tab="stocks">Stocks <span class="cnt">${stockCount.toLocaleString("en-IN")}</span></button>
  <button class="tabbtn" data-tab="funds">Mutual funds <span class="cnt">${fundCount.toLocaleString("en-IN")}</span></button>
  <div class="spacer"></div>
  <span class="k" id="asof">prices ${priceDate} &middot; NAVs ${navDate}</span>
</div>

<div id="presets" class="presets"></div>
<div id="presetWhy" class="presetwhy"></div>

<div class="card" style="margin-top:14px">
  <div class="card-h">
    <h2>Conditions</h2>
    <div class="row" style="gap:8px">
      <input id="q" placeholder="Search name or symbol…" style="min-width:210px">
      <button class="btn" id="addFilter">+ Add condition</button>
      <button class="btn" id="clearFilters">Clear</button>
    </div>
  </div>
  <div class="card-b"><div id="filters" class="filters"></div>
    <div id="noFilters" class="dim" style="font-size:13px">No conditions yet — every listed name is shown. Add a condition, or start from a ready-made screen above.</div>
  </div>
  <div class="note" id="matchNote"></div>
</div>

<div class="card">
  <div class="card-h">
    <div class="row" style="gap:10px;align-items:baseline">
      <h2 id="resultTitle">Results</h2>
      <span class="k" id="resultCount"></span>
    </div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <select id="savedSel" title="Saved screens"><option value="">Saved screens…</option></select>
      <button class="btn" id="saveBtn">Save</button>
      <button class="btn" id="delBtn" title="Delete the selected saved screen">Delete</button>
      <button class="btn" id="shareBtn">Copy link</button>
      <button class="btn" id="colsBtn">Columns</button>
      <button class="btn" id="csvBtn">CSV</button>
    </div>
  </div>
  <div id="colsPanel" class="colspanel" hidden></div>
  <div class="scroll"><table id="tbl">
    <thead><tr id="thead"></tr></thead>
    <tbody id="tbody"></tbody>
  </table></div>
  <div class="card-b" style="display:flex;justify-content:center">
    <button class="btn" id="moreBtn" hidden>Show more</button>
  </div>
  <div class="note" id="coverageNote"></div>
</div>`;

  const head = `<style>
.tabsbar{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--line);margin-top:26px;flex-wrap:wrap}
.tabbtn{background:none;border:none;border-bottom:2px solid transparent;color:var(--ink-dim);padding:11px 16px;cursor:pointer;
  font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.tabbtn.on{color:var(--ink);border-bottom-color:var(--ink)}
.tabbtn .cnt{font-family:var(--mono);font-size:10px;color:var(--ink-faint);margin-left:5px;letter-spacing:0}
.row{display:flex;align-items:center;flex-wrap:wrap}
.presets{display:flex;gap:7px;flex-wrap:wrap;margin-top:16px}
.pchip{border:1px solid var(--line-2);background:transparent;color:var(--ink-dim);padding:6px 12px;cursor:pointer;font-size:12px;white-space:nowrap}
.pchip:hover{border-color:var(--ink);color:var(--ink)}
.pchip.on{background:var(--inv-bg);color:var(--inv-fg);border-color:var(--inv-bg);font-weight:650}
.presetwhy{color:var(--ink-dim);font-size:13px;line-height:1.65;margin-top:10px;min-height:1.2em;max-width:88ch}
.filters{display:grid;gap:8px}
.frow{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.frow select,.frow input{min-height:34px}
.frow .fld{min-width:200px}
.frow .op{min-width:120px}
.frow .val{width:110px}
.frow .catval{min-width:200px;max-width:340px}
.sparse{font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;color:var(--warn);border:1px solid var(--warn);padding:2px 7px;cursor:help;white-space:nowrap}
.xbtn{border:1px solid var(--line-2);background:transparent;color:var(--ink-dim);width:32px;height:32px;cursor:pointer;font-size:15px;line-height:1}
.xbtn:hover{border-color:var(--down);color:var(--down)}
.colspanel{border-bottom:1px solid var(--line);padding:14px 18px;background:var(--paper-3);
  display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:5px 16px;max-height:340px;overflow:auto}
.colspanel .cgrp{grid-column:1/-1;margin-top:8px}
.colspanel label{display:flex;gap:7px;align-items:center;font-size:12.5px;color:var(--ink-dim);cursor:pointer;padding:2px 0}
.colspanel label:hover{color:var(--ink)}
.colspanel input{accent-color:var(--ink)}
#tbl th{cursor:pointer;user-select:none;position:sticky;top:0;background:var(--paper-2);z-index:2}
#tbl th:hover{color:var(--ink)}
#tbl th .ar{color:var(--ink);margin-left:3px}
#tbl td:first-child,#tbl th:first-child{position:sticky;left:0;background:var(--paper-2);z-index:1}
#tbl tbody tr:hover td:first-child{background:var(--paper-3)}
.nm{font-weight:650}
.sym{font-family:var(--mono);font-size:10.5px;color:var(--ink-faint)}
.badge{display:inline-block;font-family:var(--mono);font-size:9px;padding:1px 5px;border:1px solid var(--line-2);color:var(--ink-faint);margin-left:5px}
.empty{padding:40px 18px;text-align:center;color:var(--ink-dim)}
@media(max-width:640px){.frow .fld{min-width:150px}.frow .val{width:88px}}
</style>`;

  const bodyEnd = `<script>
const STOCK_PRESETS=${JSON.stringify(STOCK_PRESETS)};
const FUND_PRESETS=${JSON.stringify(FUND_PRESETS)};
${CLIENT_JS}
</script>`;

  return shell({
    title: "Stock & mutual fund screener — every NSE company, every scheme | myfinancial",
    description: `Screen all ${stockCount} NSE-listed companies on 85 technical and fundamental metrics and ${fundCount} mutual fund schemes on returns, rolling returns and risk. Build, save and share your own filters. Free, no login.`,
    body, active: "screener", head, bodyEnd,
  });
}

// ---------------------------------------------------------------------------
// Everything below runs in the browser.
// ---------------------------------------------------------------------------
const CLIENT_JS = String.raw`
"use strict";
const SRC = { stocks: "data/stocks.json", funds: "data/funds.json" };
const LINK = { stocks: (r) => "stock/" + encodeURIComponent(r.symbol) + ".html",
               funds:  (r) => "fund/" + encodeURIComponent(r.code) + ".html" };
const STORE = "myfin.screens.v1";
const PAGE = 100;

const store = {                                    // fields, meta, rows, byKey
  stocks: null, funds: null,
};
let state = { tab: "stocks", filters: [], cols: null, sort: null, q: "", preset: null, shown: PAGE };

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

// ------------------------------- formatting --------------------------------
const nf = (v, d) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
function fmt(v, unit) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v !== "number") return String(v);
  switch (unit) {
    case "%": return nf(v, 1) + "%";
    case "x": return nf(v, 2) + "×";
    case "₹": return "₹" + nf(v, Math.abs(v) >= 1000 ? 0 : 2);
    case "₹cr":
      if (Math.abs(v) >= 100000) return "₹" + nf(v / 100000, 2) + "L cr";
      return "₹" + nf(v, 0) + " cr";
    case "n":
      if (Math.abs(v) >= 10000000) return nf(v / 10000000, 2) + " cr";
      if (Math.abs(v) >= 100000) return nf(v / 100000, 2) + " L";
      return nf(v, Number.isInteger(v) ? 0 : 2);
    default: return nf(v, 2);
  }
}
// Only colour things where a sign genuinely means better or worse.
function cls(v, f) { return (typeof v === "number" && f.u === "%" && f.d === 1) ? (v > 0 ? "up" : v < 0 ? "down" : "") : ""; }

// --------------------------------- loading ----------------------------------
async function load(tab) {
  if (store[tab]) return store[tab];
  const res = await fetch(SRC[tab]);
  if (!res.ok) throw new Error("could not load " + SRC[tab]);
  const j = await res.json();
  // columnar → objects, once
  const rows = j.rows.map((arr) => { const o = {}; for (let i = 0; i < j.fields.length; i++) o[j.fields[i]] = arr[i]; return o; });
  const byKey = {}; for (const m of j.meta) byKey[m.k] = m;
  const cats = {};                                  // distinct values for cat fields
  for (const m of j.meta) if (m.t === "cat") {
    const s = new Set();
    for (const r of rows) if (r[m.k] !== null && r[m.k] !== undefined && r[m.k] !== "") s.add(String(r[m.k]));
    cats[m.k] = [...s].sort();
  }
  // How much of the universe actually carries each field. A numeric threshold
  // cannot be met by a blank, so filtering on a sparse field quietly discards
  // most of the market — the UI warns rather than letting that pass unnoticed.
  const cov = {};
  for (const m of j.meta) {
    let n = 0;
    for (const r of rows) { const v = r[m.k]; if (v !== null && v !== undefined && v !== "") n++; }
    cov[m.k] = rows.length ? n / rows.length : 0;
  }
  store[tab] = { ...j, rows, byKey, cats, cov };
  return store[tab];
}

// -------------------------------- filtering ---------------------------------
const OPS = {
  num: [[">=", "at least"], ["<=", "at most"], ["between", "between"], ["=", "equals"], [">", "greater than"], ["<", "less than"], ["notnull", "has a value"]],
  bool: [["true", "is yes"], ["false", "is no"]],
  cat: [["in", "is one of"], ["notin", "is not"], ["contains", "contains"]],
  text: [["contains", "contains"], ["=", "equals"]],
};

function passes(row, f, meta) {
  const m = meta[f.f]; if (!m) return true;
  const v = row[f.f];
  switch (f.op) {
    case "notnull": return v !== null && v !== undefined && v !== "";
    case "true": return v === true;
    case "false": return v === false || v === null;   // "not a golden cross" includes unknown
    case "in": return Array.isArray(f.a) && f.a.length ? f.a.map(String).includes(String(v)) : true;
    case "notin": return Array.isArray(f.a) && f.a.length ? !f.a.map(String).includes(String(v)) : true;
    case "contains": return String(v ?? "").toLowerCase().includes(String(f.a ?? "").toLowerCase());
  }
  // numeric comparisons: a missing value can never satisfy a threshold
  if (typeof v !== "number") return false;
  const a = Number(f.a), b = Number(f.b);
  switch (f.op) {
    case ">=": return Number.isFinite(a) ? v >= a : true;
    case "<=": return Number.isFinite(a) ? v <= a : true;
    case ">": return Number.isFinite(a) ? v > a : true;
    case "<": return Number.isFinite(a) ? v < a : true;
    case "=": return Number.isFinite(a) ? v === a : true;
    case "between": return (!Number.isFinite(a) || v >= a) && (!Number.isFinite(b) || v <= b);
  }
  return true;
}

function apply() {
  const d = store[state.tab];
  let rows = d.rows;
  const q = state.q.trim().toLowerCase();
  if (q) rows = rows.filter((r) => ((r.name || "") + " " + (r.symbol || "") + " " + (r.amc || "")).toLowerCase().includes(q));
  for (const f of state.filters) rows = rows.filter((r) => passes(r, f, d.byKey));
  if (state.sort) {
    const { f, dir } = state.sort;
    rows = rows.slice().sort((x, y) => {
      const a = x[f], b = y[f];
      const an = a === null || a === undefined || a === "", bn = b === null || b === undefined || b === "";
      if (an && bn) return 0;
      if (an) return 1;                              // blanks always sink, either direction
      if (bn) return -1;
      if (typeof a === "string" || typeof b === "string") return dir * String(a).localeCompare(String(b));
      return dir * (a - b);
    });
  }
  return rows;
}

// ------------------------------- filter rows --------------------------------
function fieldSelect(value, onChange) {
  const d = store[state.tab];
  const sel = el("select", "fld");
  const groups = {};
  for (const m of d.meta) (groups[m.g] ||= []).push(m);
  for (const [g, items] of Object.entries(groups)) {
    const og = el("optgroup"); og.label = g;
    for (const m of items) {
      const o = el("option", null, m.l + (m.u === "%" ? " (%)" : m.u === "x" ? " (×)" : ""));
      o.value = m.k; if (m.k === value) o.selected = true;
      if (m.h) o.title = m.h;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  sel.onchange = () => onChange(sel.value);
  return sel;
}

function renderFilters() {
  const wrap = $("filters"); wrap.innerHTML = "";
  const d = store[state.tab];
  $("noFilters").hidden = state.filters.length > 0;

  state.filters.forEach((f, i) => {
    const m = d.byKey[f.f] || { t: "num", u: "", l: f.f };
    const row = el("div", "frow");
    row.appendChild(fieldSelect(f.f, (k) => {
      const nm = d.byKey[k];
      state.filters[i] = { f: k, op: OPS[nm.t || "num"][0][0], a: nm.t === "cat" ? [] : "" };
      state.preset = null; renderFilters(); run();
    }));

    const ops = OPS[m.t] || OPS.num;
    const opSel = el("select", "op");
    for (const [v, label] of ops) { const o = el("option", null, label); o.value = v; if (v === f.op) o.selected = true; opSel.appendChild(o); }
    opSel.onchange = () => { state.filters[i].op = opSel.value; state.preset = null; renderFilters(); run(); };
    row.appendChild(opSel);

    if (f.op === "in" || f.op === "notin") {
      const ms = el("select", "catval"); ms.multiple = true; ms.size = 1;
      ms.style.height = "34px";
      for (const v of (d.cats[f.f] || [])) {
        const o = el("option", null, v); o.value = v;
        if (Array.isArray(f.a) && f.a.map(String).includes(String(v))) o.selected = true;
        ms.appendChild(o);
      }
      ms.onchange = () => { state.filters[i].a = [...ms.selectedOptions].map((o) => o.value); state.preset = null; run(); };
      ms.onfocus = () => { ms.size = Math.min(8, (d.cats[f.f] || []).length || 1); ms.style.height = "auto"; };
      ms.onblur = () => { ms.size = 1; ms.style.height = "34px"; };
      row.appendChild(ms);
    } else if (f.op === "true" || f.op === "false" || f.op === "notnull") {
      // no value needed
    } else if (m.t === "cat" || m.t === "text") {
      const inp = el("input", "catval"); inp.value = f.a ?? ""; inp.placeholder = "text…";
      inp.oninput = () => { state.filters[i].a = inp.value; state.preset = null; run(); };
      row.appendChild(inp);
    } else {
      const mk = (key, ph) => {
        const inp = el("input", "val"); inp.type = "number"; inp.step = "any";
        inp.value = f[key] ?? ""; inp.placeholder = ph;
        inp.oninput = () => { state.filters[i][key] = inp.value; state.preset = null; run(); };
        return inp;
      };
      row.appendChild(mk("a", m.u === "%" ? "%" : "value"));
      if (f.op === "between") { row.appendChild(el("span", "dim", "and")); row.appendChild(mk("b", "")); }
      if (m.u) row.appendChild(el("span", "k", m.u === "₹cr" ? "₹ cr" : m.u));
    }

    if (m.h) { const q = el("span", "k"); q.textContent = "ⓘ"; q.title = m.h; q.style.cursor = "help"; row.appendChild(q); }

    // Numeric conditions on a thinly-covered field silently drop every row that
    // has no value for it. Say so, next to the condition causing it.
    const coverage = d.cov?.[f.f];
    const needsValue = !["true", "false", "notnull"].includes(f.op);
    if (needsValue && coverage !== undefined && coverage < 0.6) {
      const shown = (coverage * 100).toFixed(0);
      const wrn = el("span", "sparse", "only " + shown + "% have this");
      wrn.title = m.l + " is present for " + shown + "% of the universe. Rows without a value cannot satisfy a"
        + " threshold, so this condition excludes them.";
      row.appendChild(wrn);
    }

    const x = el("button", "xbtn", "×"); x.title = "Remove";
    x.onclick = () => { state.filters.splice(i, 1); state.preset = null; renderFilters(); run(); };
    row.appendChild(x);
    wrap.appendChild(row);
  });
}

// --------------------------------- columns ----------------------------------
function defaultCols() { return store[state.tab].meta.filter((m) => m.c).map((m) => m.k); }

function renderColsPanel() {
  const p = $("colsPanel"); p.innerHTML = "";
  const d = store[state.tab];
  const groups = {};
  for (const m of d.meta) (groups[m.g] ||= []).push(m);
  for (const [g, items] of Object.entries(groups)) {
    const h = el("div", "cgrp k", g); p.appendChild(h);
    for (const m of items) {
      const lab = el("label");
      const cb = el("input"); cb.type = "checkbox"; cb.checked = state.cols.includes(m.k);
      cb.onchange = () => {
        if (cb.checked) { if (!state.cols.includes(m.k)) state.cols.push(m.k); }
        else state.cols = state.cols.filter((k) => k !== m.k);
        run();
      };
      lab.appendChild(cb); lab.appendChild(document.createTextNode(m.l));
      if (m.h) lab.title = m.h;
      p.appendChild(lab);
    }
  }
}

// --------------------------------- results ----------------------------------
let lastRows = [];
function renderTable(rows) {
  const d = store[state.tab];
  const head = $("thead"); head.innerHTML = "";
  const cols = state.cols.filter((k) => d.byKey[k]);

  for (const k of cols) {
    const m = d.byKey[k];
    const th = el("th", m.t === "num" ? "num" : null);
    th.textContent = m.l;
    if (m.h) th.title = m.h;
    if (state.sort && state.sort.f === k) th.appendChild(el("span", "ar", state.sort.dir === -1 ? "▾" : "▴"));
    th.onclick = () => {
      // first click sorts the way that field is "good": returns high, P/E low
      const cur = state.sort && state.sort.f === k ? state.sort.dir : null;
      state.sort = { f: k, dir: cur === null ? (m.d === -1 ? 1 : -1) : -cur };
      run();
    };
    head.appendChild(th);
  }

  const tb = $("tbody"); tb.innerHTML = "";
  if (!rows.length) {
    const tr = el("tr"), td = el("td");
    td.colSpan = cols.length || 1; td.className = "empty";
    td.textContent = "Nothing matches all of these conditions. Loosen one — or clear them and start again.";
    tr.appendChild(td); tb.appendChild(tr); return;
  }
  const slice = rows.slice(0, state.shown);
  const frag = document.createDocumentFragment();
  for (const r of slice) {
    const tr = el("tr");
    cols.forEach((k, ci) => {
      const m = d.byKey[k];
      const v = r[k];
      const td = el("td", m.t === "num" ? "num " + cls(v, m) : cls(v, m));
      if (ci === 0) {
        const a = el("a", "nm", v === null || v === undefined ? (r.symbol || r.code) : String(v));
        a.href = LINK[state.tab](r);
        td.appendChild(a);
        const sub = state.tab === "stocks" ? r.symbol : r.amc;
        if (sub) td.appendChild(el("div", "sym", sub));
        if (state.tab === "stocks" && r.hasDeepData) { const b = el("span", "badge", "filings"); b.title = "Full P&L, balance sheet, cash flow and shareholding available"; td.appendChild(b); }
        if (state.tab === "funds" && r.stale) { const b = el("span", "badge", "wound up"); b.title = "NAV no longer updating"; td.appendChild(b); }
      } else {
        td.textContent = fmt(v, m.u);
      }
      tr.appendChild(td);
    });
    frag.appendChild(tr);
  }
  tb.appendChild(frag);
  $("moreBtn").hidden = rows.length <= state.shown;
  $("moreBtn").textContent = "Show more (" + (rows.length - state.shown).toLocaleString("en-IN") + " left)";
}

function run() {
  const d = store[state.tab];
  const rows = apply();
  lastRows = rows;
  renderTable(rows);
  const total = d.rows.length;
  $("resultCount").textContent = rows.length.toLocaleString("en-IN") + " of " + total.toLocaleString("en-IN");
  $("matchNote").textContent = state.filters.length
    ? rows.length.toLocaleString("en-IN") + " of " + total.toLocaleString("en-IN") + " " + (state.tab === "stocks" ? "companies" : "schemes") + " match all " + state.filters.length + " condition" + (state.filters.length === 1 ? "" : "s") + "."
    : "No conditions applied — showing everything.";
  coverageNote(rows);
  syncUrl();
}

function coverageNote(rows) {
  const n = $("coverageNote");
  if (state.tab === "stocks") {
    const withF = rows.filter((r) => r.hasFundamentals).length;
    const deep = rows.filter((r) => r.hasDeepData).length;
    n.innerHTML = "Prices, volumes and delivery percentages come from NSE's own daily bhavcopy and cover every listed company. "
      + "Fundamental fields are available for " + withF.toLocaleString("en-IN") + " of these " + rows.length.toLocaleString("en-IN")
      + " rows, and " + deep.toLocaleString("en-IN") + " carry full filed statements. "
      + "<b>A condition on a fundamental field silently excludes companies with no data for it</b> — that is deliberate: a blank cannot be judged against a threshold.";
  } else {
    const live = rows.filter((r) => !r.stale).length;
    n.innerHTML = live.toLocaleString("en-IN") + " of these " + rows.length.toLocaleString("en-IN") + " schemes are still publishing a NAV. "
      + "Returns beyond one year are CAGR; rolling figures are computed across every start date in the scheme's history, which is a fairer measure than a single trailing window. "
      + "All figures are Direct plan, Growth option.";
  }
}

// ------------------------------ saved screens -------------------------------
const readSaved = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const writeSaved = (v) => localStorage.setItem(STORE, JSON.stringify(v));

function refreshSaved(select) {
  const saved = readSaved();
  const sel = $("savedSel");
  sel.innerHTML = '<option value="">Saved screens…</option>';
  for (const name of Object.keys(saved).sort()) {
    const o = el("option", null, name); o.value = name;
    if (name === select) o.selected = true;
    sel.appendChild(o);
  }
}

// -------------------------------- share URL ---------------------------------
const packState = () => ({ t: state.tab, f: state.filters, c: state.cols, s: state.sort, q: state.q, p: state.preset });
function syncUrl() {
  try {
    const s = btoa(unescape(encodeURIComponent(JSON.stringify(packState())))).replace(/=+$/, "");
    history.replaceState(null, "", "#" + s);
  } catch { /* a URL that will not encode is not worth breaking the page for */ }
}
function restoreFromHash() {
  if (!location.hash || location.hash.length < 4) return false;
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
    if (!o || !SRC[o.t]) return false;
    state.tab = o.t; state.filters = o.f || []; state.cols = o.c || null;
    state.sort = o.s || null; state.q = o.q || ""; state.preset = o.p || null;
    return true;
  } catch { return false; }
}

// --------------------------------- presets ----------------------------------
function renderPresets() {
  const list = state.tab === "stocks" ? STOCK_PRESETS : FUND_PRESETS;
  const wrap = $("presets"); wrap.innerHTML = "";
  for (const p of list) {
    const b = el("button", "pchip" + (state.preset === p.id ? " on" : ""), p.name);
    b.onclick = () => {
      state.preset = p.id;
      state.filters = JSON.parse(JSON.stringify(p.filters));
      state.sort = p.sort ? { f: p.sort.f, dir: p.sort.dir } : null;
      state.shown = PAGE;
      // surface the fields the screen actually filters on, so the numbers being
      // judged are the numbers on screen
      const base = defaultCols();
      for (const f of state.filters) if (!base.includes(f.f)) base.push(f.f);
      if (p.sort && !base.includes(p.sort.f)) base.push(p.sort.f);
      state.cols = base;
      renderPresets(); renderFilters(); renderColsPanel(); run();
    };
    wrap.appendChild(b);
  }
  const cur = list.find((p) => p.id === state.preset);
  $("presetWhy").textContent = cur ? cur.why : "";
}

// ---------------------------------- boot ------------------------------------
async function switchTab(tab, keep) {
  state.tab = tab;
  document.querySelectorAll(".tabbtn").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  await load(tab);
  if (!keep) { state.filters = []; state.sort = null; state.preset = null; state.q = ""; state.cols = null; }
  if (!state.cols || !state.cols.length) state.cols = defaultCols();
  // Default ordering uses a field every row actually has. Market cap would be
  // the obvious choice but it comes from the fundamentals layer, which does not
  // cover the long tail — sorting on it would shuffle the uncovered names
  // arbitrarily. Rupee turnover comes from the exchange for every company.
  if (!state.sort) state.sort = { f: tab === "stocks" ? "avgTurnoverCr" : "r3y", dir: -1 };
  state.shown = PAGE;
  $("q").value = state.q;
  $("resultTitle").textContent = tab === "stocks" ? "Companies" : "Schemes";
  renderPresets(); renderFilters(); renderColsPanel(); run();
}

(async function boot() {
  const fromUrl = restoreFromHash();
  try {
    await switchTab(state.tab, fromUrl);
  } catch (e) {
    $("tbody").innerHTML = '<tr><td class="empty">Could not load the screener data (' + String(e.message) + '). If you are opening this file directly from disk, serve the folder over HTTP instead — browsers block local fetches.</td></tr>';
    return;
  }
  refreshSaved();

  document.querySelectorAll(".tabbtn").forEach((b) => { b.onclick = () => switchTab(b.dataset.tab, false); });
  $("addFilter").onclick = () => {
    const d = store[state.tab];
    const first = d.meta.find((m) => m.t === "num" && !state.filters.some((f) => f.f === m.k)) || d.meta[0];
    state.filters.push({ f: first.k, op: (OPS[first.t] || OPS.num)[0][0], a: first.t === "cat" ? [] : "" });
    state.preset = null; renderPresets(); renderFilters(); run();
  };
  $("clearFilters").onclick = () => { state.filters = []; state.preset = null; state.q = ""; $("q").value = ""; renderPresets(); renderFilters(); run(); };
  let qt = null;
  $("q").oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; state.shown = PAGE; run(); }, 140); };
  $("colsBtn").onclick = () => { $("colsPanel").hidden = !$("colsPanel").hidden; };
  $("moreBtn").onclick = () => { state.shown += PAGE * 4; renderTable(lastRows); };

  $("saveBtn").onclick = () => {
    const name = prompt("Name this screen:", ($("savedSel").value || (state.preset ? (state.tab === "stocks" ? STOCK_PRESETS : FUND_PRESETS).find((p) => p.id === state.preset)?.name : "") || "My screen"));
    if (!name) return;
    const saved = readSaved();
    saved[name] = packState();
    writeSaved(saved); refreshSaved(name);
    $("saveBtn").textContent = "Saved ✓";
    setTimeout(() => { $("saveBtn").textContent = "Save"; }, 1400);
  };
  $("savedSel").onchange = async () => {
    const name = $("savedSel").value; if (!name) return;
    const s = readSaved()[name]; if (!s) return;
    state.filters = s.f || []; state.cols = s.c || null; state.sort = s.s || null;
    state.q = s.q || ""; state.preset = s.p || null;
    await switchTab(s.t || state.tab, true);
    refreshSaved(name);
  };
  $("delBtn").onclick = () => {
    const name = $("savedSel").value;
    if (!name || !confirm('Delete the saved screen "' + name + '"?')) return;
    const saved = readSaved(); delete saved[name]; writeSaved(saved); refreshSaved();
  };
  $("shareBtn").onclick = async () => {
    syncUrl();
    try { await navigator.clipboard.writeText(location.href); $("shareBtn").textContent = "Copied ✓"; }
    catch { $("shareBtn").textContent = "Copy from the address bar"; }
    setTimeout(() => { $("shareBtn").textContent = "Copy link"; }, 1800);
  };
  $("csvBtn").onclick = () => {
    const d = store[state.tab];
    const cols = state.cols.filter((k) => d.byKey[k]);
    const esc2 = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.map((k) => esc2(d.byKey[k].l)).join(",")];
    for (const r of lastRows) lines.push(cols.map((k) => esc2(r[k])).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "myfinancial-" + state.tab + "-screen.csv";
    a.click(); URL.revokeObjectURL(a.href);
  };
})();
`;
