// ---------------------------------------------------------------------------
// patterns.js — draws the chart patterns found at build time.
//
// Everything is precomputed and shipped in data/patterns.json: the candles, the
// 50- and 200-day averages, the volume, and the anchor points of the pattern
// itself. This file only renders — which is why a chart with 200+ candles and
// full pattern geometry paints instantly.
//
// Loaded lazily: the payload is a few hundred KB, so it is fetched the first
// time the Chart patterns tab is opened rather than on every advisory visit.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const inr = (x) => (typeof x === "number" ? "₹" + x.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—");
const n2 = (x, d = 2) => (typeof x === "number" ? x.toFixed(d) : "—");
const pc = (x, d = 1) => (typeof x === "number" ? (x > 0 ? "+" : "") + x.toFixed(d) + "%" : "—");
const cls = (x) => (typeof x !== "number" ? "" : x > 0 ? "up" : x < 0 ? "down" : "");
const crore = (x) => (typeof x !== "number" ? "—"
  : Math.abs(x) >= 100000 ? "₹" + (x / 100000).toFixed(2) + "L cr" : "₹" + Math.round(x).toLocaleString("en-IN") + " cr");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let DATA = null;
let filtered = [];
let shown = 6;

// ---------------------------------------------------------------------------
// the chart
// ---------------------------------------------------------------------------
/**
 * Candles + 50/200-DMA + volume + the pattern geometry, as one inline SVG.
 *
 * Price and volume share the horizontal axis but get their own vertical scales,
 * with volume in a band underneath — the standard arrangement, so the price
 * panel is not squashed by a single spike in turnover.
 */
function chart(h) {
  const bars = h.bars;
  const n = bars.length;
  const W = 1000, PH = 300, VH = 62, GAP = 14;
  const H = PH + GAP + VH;

  // price scale must contain the candles AND every level we draw
  const levels = [h.entry, h.stop, h.target1, h.target2, h.neckline].filter((x) => typeof x === "number");
  const hi = Math.max(...bars.map((b) => b[2]), ...levels);
  const lo = Math.min(...bars.map((b) => b[3]), ...levels);
  const pad = (hi - lo) * 0.06 || 1;
  const yMax = hi + pad, yMin = Math.max(0, lo - pad);

  const X = (i) => (i / Math.max(1, n - 1)) * W;
  const Y = (v) => PH - ((v - yMin) / (yMax - yMin)) * PH;
  const cw = Math.max(1.4, (W / n) * 0.62);

  // ---- candles ----
  let candles = "";
  for (let i = 0; i < n; i++) {
    const [, o, hh, l, c] = bars[i];
    const up = c >= o;
    const col = up ? "var(--up)" : "var(--down)";
    const x = X(i);
    const yO = Y(o), yC = Y(c);
    const top = Math.min(yO, yC);
    const bh = Math.max(0.8, Math.abs(yC - yO));
    candles += '<line x1="' + x.toFixed(1) + '" y1="' + Y(hh).toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + Y(l).toFixed(1)
      + '" stroke="' + col + '" stroke-width="0.8"/>'
      + '<rect x="' + (x - cw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + cw.toFixed(1) + '" height="' + bh.toFixed(1)
      + '" fill="' + col + '" opacity="' + (up ? "0.9" : "1") + '"/>';
  }

  // ---- moving averages ----
  const maPath = (arr) => {
    let d = "", started = false;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (v === null || v === undefined) { started = false; continue; }
      d += (started ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1);
      started = true;
    }
    return d;
  };
  const ma50 = maPath(h.sma50), ma200 = maPath(h.sma200);

  // ---- volume band, coloured by the day's direction ----
  const vols = bars.map((b) => b[5] || 0);
  const vMax = Math.max(...vols) || 1;
  let volBars = "";
  for (let i = 0; i < n; i++) {
    const bh = (vols[i] / vMax) * VH;
    const up = bars[i][4] >= bars[i][1];
    volBars += '<rect x="' + (X(i) - cw / 2).toFixed(1) + '" y="' + (VH - bh).toFixed(1) + '" width="' + cw.toFixed(1)
      + '" height="' + bh.toFixed(1) + '" fill="' + (up ? "var(--up)" : "var(--down)") + '" opacity=".45"/>';
  }

  // ---- horizontal levels ----
  const level = (v, colour, label, dash) => {
    if (typeof v !== "number") return "";
    const y = Y(v);
    if (y < -2 || y > PH + 2) return "";
    return '<line x1="0" y1="' + y.toFixed(1) + '" x2="' + W + '" y2="' + y.toFixed(1) + '" stroke="' + colour
      + '" stroke-width="1.2"' + (dash ? ' stroke-dasharray="' + dash + '"' : "") + '/>'
      + '<text x="' + (W - 4) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="end" fill="' + colour
      + '" font-size="10.5" font-family="ui-monospace,Menlo,monospace">' + label + "</text>";
  };

  // ---- the pattern itself: connect the anchors, mark each one ----
  const A = h.anchors;
  let geometry = "";
  if (A.length >= 2) {
    const d = A.map((a, i) => (i ? "L" : "M") + X(a.i).toFixed(1) + " " + Y(a.price).toFixed(1)).join("");
    geometry += '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="5 4" opacity=".95"/>';
  }
  for (const a of A) {
    geometry += '<circle cx="' + X(a.i).toFixed(1) + '" cy="' + Y(a.price).toFixed(1) + '" r="4.5" fill="var(--paper)" stroke="var(--accent)" stroke-width="2"/>'
      + '<text x="' + X(a.i).toFixed(1) + '" y="' + (Y(a.price) - 11).toFixed(1) + '" text-anchor="middle" fill="var(--accent)" '
      + 'font-size="10" font-family="ui-monospace,Menlo,monospace">' + esc(a.label) + "</text>";
  }

  // ---- price gridlines ----
  let grid = "";
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const v = yMax - t * (yMax - yMin);
    grid += '<line x1="0" y1="' + (t * PH).toFixed(1) + '" x2="' + W + '" y2="' + (t * PH).toFixed(1) + '" stroke="var(--line)"/>'
      + '<text x="3" y="' + (t * PH - 4).toFixed(1) + '" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">'
      + Math.round(v).toLocaleString("en-IN") + "</text>";
  }

  return '<div class="scroll"><svg viewBox="0 0 ' + W + " " + (H + 16) + '" preserveAspectRatio="none" '
    + 'style="width:100%;height:' + (H + 16) + 'px;display:block" role="img" aria-label="'
    + esc(h.symbol + " daily chart showing a " + h.patternLabel) + '">'
    + grid
    + candles
    + (ma200 ? '<path d="' + ma200 + '" fill="none" stroke="var(--ink-faint)" stroke-width="1.6"/>' : "")
    + (ma50 ? '<path d="' + ma50 + '" fill="none" stroke="var(--ink-dim)" stroke-width="1.3" stroke-dasharray="4 3"/>' : "")
    + level(h.neckline, "var(--accent)", "neckline " + inr(h.neckline), "2 3")
    + level(h.entry, "var(--ink)", "entry " + inr(h.entry))
    + level(h.stop, "var(--down)", "stop " + inr(h.stop), "5 4")
    + level(h.target2, "var(--up)", "target " + inr(h.target2), "5 4")
    + geometry
    + '<g transform="translate(0 ' + (PH + GAP) + ')">' + volBars
    + '<text x="3" y="10" fill="var(--ink-faint)" font-size="9.5" font-family="ui-monospace,Menlo,monospace">VOLUME</text></g>'
    + '<text x="0" y="' + (H + 13) + '" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">' + bars[0][0] + "</text>"
    + '<text x="' + W + '" y="' + (H + 13) + '" text-anchor="end" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">'
    + bars[n - 1][0] + "</text>"
    + "</svg></div>";
}

// ---------------------------------------------------------------------------
// the card around each chart
// ---------------------------------------------------------------------------
function ratioRow(label, mine, median, unit, lowerIsBetter) {
  if (typeof mine !== "number" && typeof median !== "number") return "";
  let verdict = "—", tone = "";
  if (typeof mine === "number" && typeof median === "number" && median !== 0) {
    const diff = ((mine - median) / Math.abs(median)) * 100;
    const better = lowerIsBetter ? diff < 0 : diff > 0;
    verdict = Math.abs(diff) < 5 ? "in line" : Math.abs(diff).toFixed(0) + "% " + (diff > 0 ? "above" : "below");
    tone = Math.abs(diff) < 5 ? "dim" : better ? "up" : "down";
  }
  const fmt = (v) => (typeof v !== "number" ? "—" : unit === "%" ? v.toFixed(1) + "%" : unit === "x" ? v.toFixed(2) + "×" : v.toFixed(2));
  return "<tr><td>" + label + '</td><td class="num">' + fmt(mine) + '</td><td class="num dim">' + fmt(median)
    + '</td><td class="' + tone + '">' + verdict + "</td></tr>";
}

function card(h) {
  const c = h.company, r = h.ratios, m = h.peerMedians || {};
  const biasTone = h.bias === "BULLISH" ? "up" : "down";
  const gradeTone = h.confirm.grade === "STRONG" ? "up" : h.confirm.grade === "GOOD" ? "" : "warn";

  const stat = (k, v, sub, tone) =>
    '<div class="stat"><div class="k">' + k + '</div><div class="v ' + (tone || "") + '" style="font-size:18px">' + v + "</div>"
    + (sub ? '<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">' + sub + "</div>" : "") + "</div>";

  return '<div class="card pattern-card">'
    + '<div class="card-h"><div>'
    + '<h2 style="font-size:16px"><a href="stock/' + encodeURIComponent(h.symbol) + '.html">' + esc(h.name) + "</a></h2>"
    + '<div class="k" style="margin-top:4px;letter-spacing:.05em;text-transform:none">' + esc(h.symbol)
    + (c.industry ? " · " + esc(c.industry) : "") + (c.nseTier ? " · " + esc(c.nseTier) : "") + "</div></div>"
    + '<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">'
    + '<span class="chip ' + (h.bias === "BULLISH" ? "ok" : "") + '">' + esc(h.patternLabel) + "</span>"
    + '<span class="chip">' + h.status + "</span>"
    + '<span class="chip ' + (gradeTone === "up" ? "ok" : "") + '">' + h.confirm.grade + " " + h.confirm.score + "/100</span>"
    + "</div></div>"

    // ---------------- the chart ----------------
    + '<div class="card-b" style="padding-bottom:6px">' + chart(h) + "</div>"
    + '<div class="legend">'
    + '<span><i class="sw" style="background:var(--ink-dim)"></i>50-DMA ' + inr(h.confirm.ma50) + "</span>"
    + '<span><i class="sw" style="background:var(--ink-faint)"></i>200-DMA ' + inr(h.confirm.ma200) + "</span>"
    + '<span><i class="sw" style="background:var(--accent)"></i>pattern &amp; neckline</span>'
    + '<span><i class="sw" style="background:var(--down)"></i>stop</span>'
    + '<span><i class="sw" style="background:var(--up)"></i>target</span>'
    + "</div>"

    // ---------------- the trade geometry ----------------
    + '<div class="grid g4" style="padding:0 18px 4px">'
    + stat("Price", inr(c.price), pc(c.change1d, 2) + " today", cls(c.change1d))
    + stat("Entry", inr(h.entry), h.status === "BREAKOUT" || h.status === "BREAKDOWN" ? "level already taken out" : "on a close through")
    + stat("Stop", inr(h.stop), n2(Math.abs((h.entry - h.stop) / h.entry) * 100, 1) + "% risk", "down")
    + stat("Target", inr(h.target2), h.riskReward + ":1 reward-to-risk", "up")
    + "</div>"

    + '<div class="note" style="border-top:none">'
    + esc(DATA.notes[h.pattern] || "")
    + " <b>Confirmation:</b> volume " + n2(h.confirm.volX) + "× its 20-day average, price "
    + (h.confirm.above50 ? "above" : "below") + " the 50-day and " + (h.confirm.above200 ? "above" : "below")
    + " the 200-day average, and the two averages "
    + (h.confirm.maAligned ? "aligned with" : "against") + " this pattern's direction. "
    + "The measured target is the pattern's own depth (" + n2(h.depthPct, 1) + "%) projected from the neckline — a convention, not a forecast."
    + "</div>"

    // ---------------- who the company is ----------------
    + '<div class="card-h" style="border-top:1px solid var(--line)"><h2 style="font-size:13px">The company</h2>'
    + '<span class="chip">' + esc(c.sector || "—") + "</span></div>"
    + (c.description ? '<div class="card-b" style="color:var(--ink-dim);font-size:13px;line-height:1.7;padding-bottom:6px">' + esc(c.description) + "…</div>" : "")
    + '<div class="grid g4" style="padding:6px 18px 14px">'
    + stat("Market cap", crore(c.marketCapCr), c.nseTier || "")
    + stat("52-week range", inr(c.low52w) + " – " + inr(c.high52w), pc(c.pctFrom52wHigh) + " from high")
    + stat("1-year", pc(c.ret1y), "3-month " + pc(c.ret3m), cls(c.ret1y))
    + stat("Stage", (c.stage ?? "—") + " · " + esc(c.stageName || "—"), "RSI " + n2(c.rsi14, 0) + " · ADX " + n2(c.adx14, 0))
    + stat("Liquidity", "₹" + n2(c.avgTurnoverCr, 1) + " cr/day", "20-session average")
    + stat("Delivery", n2(c.avgDeliveryPct20, 1) + "%", "of volume taken home")
    + stat("Volatility", n2(c.atrPct, 2) + "% ATR", "beta " + n2(c.beta))
    + stat("Listed", esc(c.listed || "—"), c.employees ? Number(c.employees).toLocaleString("en-IN") + " employees" : "")
    + "</div>"

    // ---------------- ratios vs the sub-sector ----------------
    + '<div class="card-h" style="border-top:1px solid var(--line)"><h2 style="font-size:13px">Ratios against its sub-sector</h2>'
    + '<span class="chip">' + esc(c.industry || "—") + (h.peerCount ? " · " + h.peerCount + " listed" : "") + "</span></div>"
    + '<div class="scroll"><table><thead><tr><th>Ratio</th><th class="num">' + esc(h.symbol)
    + '</th><th class="num">Sub-sector median</th><th>Standing</th></tr></thead><tbody>'
    + ratioRow("P/E", r.pe, m.pe, "x", true)
    + ratioRow("P/B", r.pb, m.pb, "x", true)
    + ratioRow("EV/EBITDA", r.evEbitda, m.evEbitda, "x", true)
    + ratioRow("ROE", r.roe, m.roe, "%", false)
    + ratioRow("ROCE", r.roce, m.roce, "%", false)
    + ratioRow("Net margin", r.profitMarginPct, m.profitMarginPct, "%", false)
    + ratioRow("Dividend yield", r.dividendYieldPct, m.dividendYieldPct, "%", false)
    + ratioRow("1-year return", c.ret1y, m.ret1y, "%", false)
    + "</tbody></table></div>"
    + (h.peers.length
      ? '<div class="note">Competing with ' + h.peers.map((p) => '<a href="stock/' + encodeURIComponent(p.symbol) + '.html">' + esc(p.name) + "</a>").join(", ")
        + ". Promoters hold " + n2(r.promoterHoldingPct, 1) + "%"
        + (typeof r.liabilitiesToEquity === "number" ? "; liabilities are " + n2(r.liabilitiesToEquity) + "× equity" : "") + "."
      : "")
    + "</div></div>";
}

// ---------------------------------------------------------------------------
// list plumbing
// ---------------------------------------------------------------------------
function apply() {
  const bias = $("patBias").value;
  const pat = $("patType").value;
  const status = $("patStatus").value;
  const minScore = Number($("patScore").value || 0);

  filtered = DATA.hits.filter((h) =>
    (!bias || h.bias === bias)
    && (!pat || h.pattern === pat)
    && (!status || h.status === status)
    && h.confirm.score >= minScore);

  shown = 6;
  $("patCount").textContent = filtered.length + " of " + DATA.hits.length + " shown";
  paint();
}

function paint() {
  const wrap = $("patList");
  if (!filtered.length) {
    wrap.innerHTML = '<div class="card"><div class="card-b dim">No pattern matches these filters today. Loosen one — a quiet market genuinely produces fewer clean setups.</div></div>';
    $("patMore").hidden = true;
    return;
  }
  wrap.innerHTML = filtered.slice(0, shown).map(card).join("");
  $("patMore").hidden = filtered.length <= shown;
  $("patMore").textContent = "Show more (" + (filtered.length - shown) + " left)";
}

export async function initPatterns() {
  if (DATA) return;
  $("patStatusLine").textContent = "Loading charts…";
  try {
    const res = await fetch("data/patterns.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    DATA = await res.json();
  } catch (e) {
    $("patStatusLine").textContent = "Could not load the pattern data (" + e.message + ").";
    return;
  }

  // populate the pattern-type filter from what was actually found today
  const types = [...new Set(DATA.hits.map((h) => h.pattern))];
  const labels = Object.fromEntries(DATA.hits.map((h) => [h.pattern, h.patternLabel]));
  $("patType").innerHTML = '<option value="">Every pattern</option>'
    + types.map((t) => '<option value="' + t + '">' + labels[t] + "</option>").join("");

  $("patStatusLine").innerHTML = DATA.detected.toLocaleString("en-IN")
    + " patterns detected across the liquid universe on " + DATA.priceDate
    + "; the " + DATA.count + " best-confirmed are charted here.";

  for (const id of ["patBias", "patType", "patStatus", "patScore"]) $(id).onchange = apply;
  $("patMore").onclick = () => { shown += 6; paint(); };
  apply();
}
