// ---------------------------------------------------------------------------
// advisory.js — rule-based screens over the same published market data the
// screener uses, computed in the browser.
//
// Deliberately NOT a port of the server's signals engine: that one runs over a
// synthetic price model, whereas this runs over real NSE closes, real filed
// fundamentals and real delivery data. Every row shows the numbers that got it
// there, because a signal you cannot interrogate is just an assertion.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const inr = (x) => (typeof x === "number" ? "₹" + Math.round(x).toLocaleString("en-IN") : "—");
const n2 = (x, d = 2) => (typeof x === "number" ? x.toFixed(d) : "—");
const pc = (x, d = 1) => (typeof x === "number" ? (x > 0 ? "+" : "") + x.toFixed(d) + "%" : "—");
const cls = (x) => (typeof x !== "number" ? "" : x > 0 ? "up" : x < 0 ? "down" : "");
const crore = (x) => (typeof x !== "number" ? "—"
  : Math.abs(x) >= 100000 ? "₹" + (x / 100000).toFixed(2) + "L cr" : "₹" + Math.round(x).toLocaleString("en-IN") + " cr");

const link = (r) => 'stock/' + encodeURIComponent(r.symbol) + '.html';

let ROWS = [];

/** Render a table from column definitions, newest-first by whatever we sorted. */
function table(el, rows, cols, empty) {
  if (!rows.length) { el.innerHTML = '<tbody><tr><td class="dim" style="padding:26px 14px">' + empty + "</td></tr></tbody>"; return; }
  el.innerHTML = "<thead><tr>" + cols.map((c) => "<th" + (c.num ? ' class="num"' : "") + ">" + c.label + "</th>").join("") + "</tr></thead>"
    + "<tbody>" + rows.map((r) => "<tr>" + cols.map((c, i) => {
      const v = c.get(r);
      if (i === 0) {
        return '<td><a href="' + link(r) + '" style="font-weight:650">' + r.name + "</a>"
          + '<div class="sym dim" style="font-family:var(--mono);font-size:10.5px">' + r.symbol
          + (r.industry ? " · " + r.industry : "") + "</div></td>";
      }
      return "<td" + (c.num ? ' class="num ' + (c.tone ? cls(c.tone(r)) : "") + '"' : "") + ">" + v + "</td>";
    }).join("") + "</tr>").join("") + "</tbody>";
}

// ------------------------------- the screens --------------------------------
function quality() {
  const rows = ROWS.filter((r) =>
    r.roe >= 15 && r.roce >= 15 && r.profitMarginPct >= 8
    && (r.liabilitiesToEquity === null || r.liabilitiesToEquity <= 1.5)
    && r.peVsPeers !== null && r.peVsPeers <= 0
    && r.aboveSma200 === true && r.avgTurnoverCr >= 5,
  ).sort((a, b) => b.roce - a.roce).slice(0, 40);

  $("qualityCount").textContent = rows.length + " companies";
  table($("qualityTbl"), rows, [
    { label: "Company", get: () => "" },
    { label: "ROCE", num: true, get: (r) => n2(r.roce, 1) + "%" },
    { label: "ROE", num: true, get: (r) => n2(r.roe, 1) + "%" },
    { label: "Net margin", num: true, get: (r) => n2(r.profitMarginPct, 1) + "%" },
    { label: "P/E", num: true, get: (r) => n2(r.pe) + "×" },
    { label: "vs sub-sector", num: true, get: (r) => pc(r.peVsPeers, 0), tone: (r) => -r.peVsPeers },
    { label: "Liab/Equity", num: true, get: (r) => (r.liabilitiesToEquity === null ? "—" : n2(r.liabilitiesToEquity) + "×") },
    { label: "Market cap", num: true, get: (r) => crore(r.marketCapCr) },
    { label: "1-year", num: true, get: (r) => pc(r.ret1y), tone: (r) => r.ret1y },
  ], "Nothing passes every rule today. That happens in stretched markets — it is information, not a fault.");
}

function swing() {
  // Two setups, both requiring a confirmed Stage 2 advance and real liquidity:
  //   pullback — price has come back toward the 50-day average with RSI reset
  //   breakout — price pressing the 52-week high on expanding volume
  const base = ROWS.filter((r) => r.stage === 2 && r.avgTurnoverCr >= 5 && r.atr14 > 0 && r.adx14 >= 18);

  const setups = [];
  for (const r of base) {
    let kind = null;
    if (r.pctFromSma50 !== null && r.pctFromSma50 >= -6 && r.pctFromSma50 <= 2 && r.rsi14 >= 38 && r.rsi14 <= 58) kind = "Pullback to the 50-day";
    else if (r.pctFrom52wHigh >= -3 && r.volumeRatio >= 1.5) kind = "Breakout on volume";
    if (!kind) continue;
    // Levels from the stock's own volatility, so the risk is scaled to how much
    // this share actually moves rather than to a fixed percentage.
    const entry = r.price;
    const stop = entry - 1.5 * r.atr14;
    const target = entry + 3 * r.atr14;
    setups.push({ ...r, kind, entry, stop, target, riskPct: ((entry - stop) / entry) * 100 });
  }
  const rows = setups.sort((a, b) => b.rsRank1y - a.rsRank1y).slice(0, 40);

  $("swingCount").textContent = rows.length + " setups";
  table($("swingTbl"), rows, [
    { label: "Company", get: () => "" },
    { label: "Setup", get: (r) => r.kind },
    { label: "Entry", num: true, get: (r) => inr(r.entry) },
    { label: "Stop", num: true, get: (r) => inr(r.stop) },
    { label: "Target", num: true, get: (r) => inr(r.target) },
    { label: "Risk", num: true, get: (r) => n2(r.riskPct, 1) + "%" },
    { label: "R:R", num: true, get: () => "2.0" },
    { label: "RSI", num: true, get: (r) => n2(r.rsi14, 0) },
    { label: "ADX", num: true, get: (r) => n2(r.adx14, 0) },
  ], "No setups qualify today.");
}

function momentum() {
  const rows = ROWS.filter((r) =>
    r.rsRank1y >= 90 && r.stage === 2 && r.avgTurnoverCr >= 5 && r.pctFrom52wHigh >= -15,
  ).sort((a, b) => b.rsRank1y - a.rsRank1y).slice(0, 40);

  $("momCount").textContent = rows.length + " leaders";
  table($("momTbl"), rows, [
    { label: "Company", get: () => "" },
    { label: "RS rank", num: true, get: (r) => n2(r.rsRank1y, 0) },
    { label: "1-year", num: true, get: (r) => pc(r.ret1y), tone: (r) => r.ret1y },
    { label: "3-month", num: true, get: (r) => pc(r.ret3m), tone: (r) => r.ret3m },
    { label: "From 52w high", num: true, get: (r) => pc(r.pctFrom52wHigh), tone: (r) => r.pctFrom52wHigh },
    { label: "vs 200-DMA", num: true, get: (r) => pc(r.pctFromSma200), tone: (r) => r.pctFromSma200 },
    { label: "Delivery", num: true, get: (r) => n2(r.avgDeliveryPct20, 0) + "%" },
    { label: "Turnover", num: true, get: (r) => "₹" + n2(r.avgTurnoverCr, 0) + " cr" },
  ], "No leaders qualify today.");
}

function income() {
  const rows = ROWS.filter((r) =>
    r.dividendYieldPct >= 2 && r.roe >= 10 && r.pe > 0 && r.pe <= 30 && r.avgTurnoverCr >= 2,
  ).sort((a, b) => b.dividendYieldPct - a.dividendYieldPct).slice(0, 40);

  $("incCount").textContent = rows.length + " payers";
  table($("incTbl"), rows, [
    { label: "Company", get: () => "" },
    { label: "Yield", num: true, get: (r) => n2(r.dividendYieldPct, 2) + "%" },
    { label: "Dividend/share", num: true, get: (r) => inr(r.dividendPerShare) },
    { label: "Payout", num: true, get: (r) => (r.payoutRatioPct === null ? "—" : n2(r.payoutRatioPct, 0) + "%") },
    { label: "P/E", num: true, get: (r) => n2(r.pe) + "×" },
    { label: "ROE", num: true, get: (r) => n2(r.roe, 1) + "%" },
    { label: "1-year", num: true, get: (r) => pc(r.ret1y), tone: (r) => r.ret1y },
  ], "No qualifying dividend payers today.");
}

// --------------------------------- hedging ----------------------------------
const NIFTY_LOT = 75;

function hedge() {
  const value = Number($("hedgeValue").value || 0);
  const beta = Number($("hedgeBeta").value || 1);
  if (!value || !beta) { $("hedgeOut").innerHTML = ""; return; }
  const exposure = value * beta;
  // A NIFTY future's notional is index level x lot size. We do not carry a live
  // index quote on this page, so the arithmetic is expressed per index level.
  const perLotAt = (idx) => idx * NIFTY_LOT;
  const lotsAt = (idx) => exposure / perLotAt(idx);
  const rows = [24000, 25000, 26000].map((idx) =>
    "<tr><td>NIFTY at " + idx.toLocaleString("en-IN") + "</td>"
    + '<td class="num">' + inr(perLotAt(idx)) + "</td>"
    + '<td class="num">' + lotsAt(idx).toFixed(2) + "</td>"
    + '<td class="num">' + Math.round(lotsAt(idx)) + "</td></tr>").join("");

  $("hedgeOut").innerHTML =
    '<div class="dim" style="font-size:13.5px;line-height:1.75;margin-bottom:12px">'
    + "A portfolio of " + inr(value) + " with a beta of " + beta.toFixed(2)
    + " behaves like " + inr(exposure) + " of index exposure. To neutralise it you would short that much NIFTY notional; "
    + "one lot is " + NIFTY_LOT + " units, so the number of lots depends on where the index is trading:</div>"
    + '<div class="scroll"><table><thead><tr><th>Index level</th><th class="num">Notional per lot</th>'
    + '<th class="num">Lots to neutralise</th><th class="num">Rounded</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
    + '<div class="dim" style="font-size:13px;line-height:1.75;margin-top:12px">'
    + "A full hedge gives up the upside as well as the downside, and costs margin plus roll. "
    + "Partial hedges (a third to a half) are the more common choice around a known event. "
    + "Beta drifts, so a hedge sized today is approximate tomorrow.</div>";
}

// ---------------------------------- boot ------------------------------------
/** Tabs are addressable (#patterns), so a view can be linked to directly. */
async function openTab(tab, { push = true } = {}) {
  const btn = [...document.querySelectorAll(".tabbtn")].find((b) => b.dataset.tab === tab);
  if (!btn) return;
  document.querySelectorAll(".tabbtn").forEach((x) => x.classList.toggle("on", x === btn));
  document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  if (push && location.hash.slice(1).split("/")[0] !== tab) history.replaceState(null, "", "#" + tab);
  // The pattern payload ships candles for every chart, so it is fetched the
  // first time that tab is opened rather than on every visit to this page.
  if (tab === "patterns") {
    const { initPatterns } = await import("./patterns.js");
    initPatterns();
  }
}

(async function boot() {
  document.querySelectorAll(".tabbtn").forEach((b) => {
    b.onclick = () => openTab(b.dataset.tab);
  });
  window.addEventListener("hashchange", () => openTab(location.hash.slice(1).split("/")[0] || "quality", { push: false }));
  const initial = location.hash.slice(1).split("/")[0];
  if (initial) openTab(initial, { push: false });
  $("hedgeValue").oninput = hedge;
  $("hedgeBeta").oninput = hedge;
  hedge();

  try {
    const res = await fetch("data/stocks.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    ROWS = j.rows.map((arr) => {
      const o = {};
      for (let i = 0; i < j.fields.length; i++) o[j.fields[i]] = arr[i];
      return o;
    });
  } catch (e) {
    for (const id of ["qualityTbl", "swingTbl", "momTbl", "incTbl"]) {
      $(id).innerHTML = '<tbody><tr><td class="dim" style="padding:26px 14px">Could not load market data (' + e.message + ").</td></tr></tbody>";
    }
    return;
  }
  quality(); swing(); momentum(); income();
})();
