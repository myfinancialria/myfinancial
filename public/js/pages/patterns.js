// ---------------------------------------------------------------------------
// patterns.js — the chart-pattern browser.
//
// Layout is master–detail: a dense table puts every detected pattern on screen
// at once, and selecting a row opens the full chart and company profile beneath
// it. Rendering one chart on demand also keeps the page light, where drawing
// several hundred candles for every card at once did not.
//
// The chart is drawn with a reserved right-hand gutter so price labels never sit
// on top of the candles, and both the level labels and the pattern anchor labels
// are pushed apart before drawing so they cannot overlap each other. Hovering
// gives a crosshair and the day's OHLC, volume and moving averages.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const inr = (x) => (typeof x === "number" ? "₹" + x.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—");
const n2 = (x, d = 2) => (typeof x === "number" ? x.toFixed(d) : "—");
const pc = (x, d = 1) => (typeof x === "number" ? (x > 0 ? "+" : "") + x.toFixed(d) + "%" : "—");
const cls = (x) => (typeof x !== "number" ? "" : x > 0 ? "up" : x < 0 ? "down" : "");
const crore = (x) => (typeof x !== "number" ? "—"
  : Math.abs(x) >= 100000 ? "₹" + (x / 100000).toFixed(2) + "L cr" : "₹" + Math.round(x).toLocaleString("en-IN") + " cr");
const vol = (x) => (typeof x !== "number" ? "—"
  : x >= 10000000 ? (x / 10000000).toFixed(2) + " cr" : x >= 100000 ? (x / 100000).toFixed(2) + " L" : x.toLocaleString("en-IN"));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let DATA = null;
let filtered = [];
let selected = null;
let sortKey = "turnover", sortDir = -1;

// ===========================================================================
// chart geometry
// ===========================================================================
const W = 1000;            // viewBox width
const GUTTER = 118;        // reserved for price labels — candles never enter it
const PLOT = W - GUTTER;
const PH = 310;            // price panel height
const GAP = 18;
const VH = 66;             // volume panel height
const H = PH + GAP + VH;

/**
 * Push labels apart so none overlap.
 * Classic one-dimensional label placement: sort by position, then walk down
 * enforcing a minimum gap, then walk back up to undo any overshoot past the
 * bottom edge. The LINE stays at the true value; only the text moves.
 */
function declutter(items, minGap, lo, hi) {
  const out = items.slice().sort((a, b) => a.y - b.y);
  for (let i = 1; i < out.length; i++) {
    if (out[i].y - out[i - 1].y < minGap) out[i].y = out[i - 1].y + minGap;
  }
  const overflow = out.length ? out[out.length - 1].y - hi : 0;
  if (overflow > 0) {
    for (let i = out.length - 1; i >= 0; i--) {
      out[i].y = Math.min(out[i].y, hi - (out.length - 1 - i) * minGap);
      if (i > 0 && out[i].y - out[i - 1].y < minGap) out[i - 1].y = out[i].y - minGap;
    }
  }
  for (const o of out) o.y = Math.max(lo, o.y);
  return out;
}

function chart(h) {
  const bars = h.bars;
  const n = bars.length;

  const levels = [h.entry, h.stop, h.target1, h.target2, h.neckline].filter((x) => typeof x === "number");
  const hi = Math.max(...bars.map((b) => b[2]), ...levels);
  const lo = Math.min(...bars.map((b) => b[3]), ...levels);
  const pad = (hi - lo) * 0.07 || 1;
  const yMax = hi + pad, yMin = Math.max(0, lo - pad);

  const X = (i) => (i / Math.max(1, n - 1)) * PLOT;
  const Y = (v) => PH - ((v - yMin) / (yMax - yMin)) * PH;
  const cw = Math.max(1.5, (PLOT / n) * 0.62);

  // ------------------------------- candles ---------------------------------
  let candles = "";
  for (let i = 0; i < n; i++) {
    const [, o, hh, l, c] = bars[i];
    const up = c >= o;
    const col = up ? "var(--up)" : "var(--down)";
    const x = X(i), yO = Y(o), yC = Y(c);
    candles += '<line x1="' + x.toFixed(1) + '" y1="' + Y(hh).toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + Y(l).toFixed(1)
      + '" stroke="' + col + '" stroke-width="0.9"/>'
      + '<rect x="' + (x - cw / 2).toFixed(1) + '" y="' + Math.min(yO, yC).toFixed(1) + '" width="' + cw.toFixed(1)
      + '" height="' + Math.max(0.9, Math.abs(yC - yO)).toFixed(1) + '" fill="' + col + '"/>';
  }

  // --------------------------- moving averages -----------------------------
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

  // ------------------------------- volume ----------------------------------
  const vols = bars.map((b) => b[5] || 0);
  const vMax = Math.max(...vols) || 1;
  let volBars = "";
  for (let i = 0; i < n; i++) {
    const bh = (vols[i] / vMax) * VH;
    volBars += '<rect x="' + (X(i) - cw / 2).toFixed(1) + '" y="' + (VH - bh).toFixed(1) + '" width="' + cw.toFixed(1)
      + '" height="' + bh.toFixed(1) + '" fill="' + (bars[i][4] >= bars[i][1] ? "var(--up)" : "var(--down)") + '" opacity=".45"/>';
  }

  // ------------------- price levels, labelled in the gutter -----------------
  const wanted = [
    { v: h.target2, colour: "var(--up)", text: "TARGET", sub: inr(h.target2), dash: "6 4" },
    { v: h.entry, colour: "var(--ink)", text: "ENTRY", sub: inr(h.entry), dash: "" },
    { v: h.neckline, colour: "var(--accent)", text: "NECKLINE", sub: inr(h.neckline), dash: "2 3" },
    { v: h.stop, colour: "var(--down)", text: "EXIT / STOP", sub: inr(h.stop), dash: "6 4" },
  ].filter((l) => typeof l.v === "number" && Y(l.v) >= -4 && Y(l.v) <= PH + 4)
    .map((l) => ({ ...l, trueY: Y(l.v), y: Y(l.v) }));

  const placed = declutter(wanted, 30, 12, PH - 4);
  let levelLines = "";
  for (const l of placed) {
    levelLines +=
      // the line sits at the real price, and stops at the gutter
      '<line x1="0" y1="' + l.trueY.toFixed(1) + '" x2="' + PLOT + '" y2="' + l.trueY.toFixed(1)
      + '" stroke="' + l.colour + '" stroke-width="1.3"' + (l.dash ? ' stroke-dasharray="' + l.dash + '"' : "") + '/>'
      // a connector into the gutter when the label had to be nudged
      + '<path d="M' + PLOT + ' ' + l.trueY.toFixed(1) + 'L' + (PLOT + 8) + ' ' + l.y.toFixed(1) + "L" + (W - 4) + " " + l.y.toFixed(1)
      + '" fill="none" stroke="' + l.colour + '" stroke-width="1" opacity=".55"/>'
      + '<text x="' + (PLOT + 12) + '" y="' + (l.y - 3).toFixed(1) + '" fill="' + l.colour
      + '" font-size="9.5" font-family="ui-monospace,Menlo,monospace" letter-spacing=".08em">' + l.text + "</text>"
      + '<text x="' + (PLOT + 12) + '" y="' + (l.y + 9).toFixed(1) + '" fill="' + l.colour
      + '" font-size="11.5" font-weight="700" font-family="ui-monospace,Menlo,monospace">' + l.sub + "</text>";
  }

  // ---------------------- the pattern, drawn on the price -------------------
  const A = h.anchors;
  let geometry = "";
  if (A.length >= 2) {
    geometry += '<path d="' + A.map((a, i) => (i ? "L" : "M") + X(a.i).toFixed(1) + " " + Y(a.price).toFixed(1)).join("")
      + '" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-dasharray="5 4" opacity=".9"/>';
  }
  // Every anchor gets a marker dot, but a triangle has three "Resistance" and
  // three "Rising low" anchors — labelling all six stacks identical words on top
  // of each other and tells the reader nothing extra. Each distinct role is
  // named once; the dashed line already shows the rest of the geometry.
  for (const a of A) {
    geometry += '<circle cx="' + X(a.i).toFixed(1) + '" cy="' + Y(a.price).toFixed(1)
      + '" r="4.5" fill="var(--paper)" stroke="var(--accent)" stroke-width="2"/>';
  }

  // Labels go above a peak and below a trough, relative to the pattern's own
  // midpoint, so they lean away from the shape rather than sitting on it.
  const midPrice = A.length ? (Math.max(...A.map((x) => x.price)) + Math.min(...A.map((x) => x.price))) / 2 : 0;
  const namedOnce = [];
  const usedLabels = new Set();
  for (const a of A) {
    if (usedLabels.has(a.label)) continue;
    usedLabels.add(a.label);
    const above = a.price >= midPrice;
    // half-width of the centred text, so overlap can be tested honestly
    const halfW = (a.label.length * 10 * 0.6) / 2;
    namedOnce.push({
      x: Math.max(halfW + 4, Math.min(PLOT - halfW - 8, X(a.i))),
      anchorX: X(a.i), yDot: Y(a.price),
      y: Y(a.price) + (above ? -16 : 22), above, halfW, label: a.label,
    });
  }

  // Iteratively push apart any two labels whose boxes still intersect.
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let i = 0; i < namedOnce.length; i++) {
      for (let k = i + 1; k < namedOnce.length; k++) {
        const p = namedOnce[i], q = namedOnce[k];
        const xOverlap = Math.abs(p.x - q.x) < p.halfW + q.halfW + 8;
        const yOverlap = Math.abs(p.y - q.y) < 14;
        if (!xOverlap || !yOverlap) continue;
        const lower = p.y >= q.y ? p : q;
        const upper = lower === p ? q : p;
        lower.y += 8; upper.y -= 8;
        moved = true;
      }
    }
    if (!moved) break;
  }

  for (const m of namedOnce) {
    const y = Math.max(12, Math.min(PH - 6, m.y));
    geometry += '<line x1="' + m.anchorX.toFixed(1) + '" y1="' + m.yDot.toFixed(1) + '" x2="' + m.x.toFixed(1)
      + '" y2="' + (y + (m.above ? 3 : -8)).toFixed(1) + '" stroke="var(--accent)" stroke-width="0.8" opacity=".5"/>'
      + '<text x="' + m.x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" fill="var(--accent)" '
      + 'font-size="10" font-weight="650" font-family="ui-monospace,Menlo,monospace">' + esc(m.label) + "</text>";
  }

  // ------------------------------ gridlines ---------------------------------
  let grid = "";
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const v = yMax - t * (yMax - yMin);
    grid += '<line x1="0" y1="' + (t * PH).toFixed(1) + '" x2="' + PLOT + '" y2="' + (t * PH).toFixed(1) + '" stroke="var(--line)"/>'
      + '<text x="3" y="' + (t * PH - 4).toFixed(1) + '" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">'
      + Math.round(v).toLocaleString("en-IN") + "</text>";
  }

  const svg = '<svg id="patSvg" viewBox="0 0 ' + W + " " + (H + 16) + '" preserveAspectRatio="none" '
    + 'style="width:100%;height:' + (H + 16) + 'px;display:block" role="img" aria-label="'
    + esc(h.symbol + " daily chart showing a " + h.patternLabel) + '">'
    + grid + candles
    + (ma200 ? '<path d="' + ma200 + '" fill="none" stroke="var(--ink-faint)" stroke-width="1.7"/>' : "")
    + (ma50 ? '<path d="' + ma50 + '" fill="none" stroke="var(--ink-dim)" stroke-width="1.4" stroke-dasharray="4 3"/>' : "")
    + levelLines + geometry
    + '<g transform="translate(0 ' + (PH + GAP) + ')">' + volBars
    + '<text x="3" y="10" fill="var(--ink-faint)" font-size="9.5" font-family="ui-monospace,Menlo,monospace">VOLUME</text></g>'
    + '<text x="0" y="' + (H + 13) + '" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">' + bars[0][0] + "</text>"
    + '<text x="' + PLOT + '" y="' + (H + 13) + '" text-anchor="end" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">'
    + bars[n - 1][0] + "</text>"
    // crosshair, revealed on hover
    + '<g id="patCross" style="display:none;pointer-events:none">'
    + '<line id="patCrossX" y1="0" y2="' + (PH + GAP + VH) + '" stroke="var(--ink)" stroke-width="0.8" stroke-dasharray="3 3" opacity=".6"/>'
    + '<rect id="patCrossBar" y="0" width="1" height="' + PH + '" fill="var(--ink)" opacity=".07"/>'
    + "</g></svg>";

  return '<div class="chartwrap" id="patChartWrap">' + svg + '<div class="tip" id="patTip" hidden></div></div>';
}

/** Crosshair + OHLC readout. Attached after the SVG is in the document. */
function wireHover(h) {
  const wrap = $("patChartWrap");
  const svg = $("patSvg");
  const tip = $("patTip");
  const cross = $("patCross");
  const cx = $("patCrossX");
  const cbar = $("patCrossBar");
  if (!wrap || !svg) return;
  const n = h.bars.length;

  const move = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;              // viewBox is linear
    const vx = frac * W;
    if (vx < 0 || vx > PLOT) { leave(); return; }
    const i = Math.max(0, Math.min(n - 1, Math.round((vx / PLOT) * (n - 1))));
    const b = h.bars[i];
    const x = (i / Math.max(1, n - 1)) * PLOT;

    cross.style.display = "";
    cx.setAttribute("x1", x); cx.setAttribute("x2", x);
    cbar.setAttribute("x", x - 0.5);

    const prev = i > 0 ? h.bars[i - 1][4] : b[1];
    const chg = prev ? ((b[4] - prev) / prev) * 100 : 0;
    tip.innerHTML =
      '<div class="tip-d">' + b[0] + "</div>"
      + '<div class="tip-g">'
      + "<span>O</span><b>" + inr(b[1]) + "</b>"
      + "<span>H</span><b>" + inr(b[2]) + "</b>"
      + "<span>L</span><b>" + inr(b[3]) + "</b>"
      + "<span>C</span><b class=\"" + cls(chg) + '">' + inr(b[4]) + "</b>"
      + "</div>"
      + '<div class="tip-r"><span class="' + cls(chg) + '">' + pc(chg, 2) + "</span> · Vol " + vol(b[5]) + "</div>"
      + '<div class="tip-r dim">50-DMA ' + inr(h.sma50[i]) + " · 200-DMA " + inr(h.sma200[i]) + "</div>";

    // keep the tooltip inside the chart, and on the opposite side of the cursor
    const px = (x / W) * wrap.clientWidth;
    const flip = px > wrap.clientWidth * 0.55;
    tip.hidden = false;
    tip.style.left = flip ? "" : (px + 14) + "px";
    tip.style.right = flip ? (wrap.clientWidth - px + 14) + "px" : "";
  };
  const leave = () => { tip.hidden = true; cross.style.display = "none"; };

  wrap.addEventListener("mousemove", (e) => move(e.clientX));
  wrap.addEventListener("mouseleave", leave);
  wrap.addEventListener("touchmove", (e) => { if (e.touches[0]) move(e.touches[0].clientX); }, { passive: true });
  wrap.addEventListener("touchend", leave);
}

// ===========================================================================
// the master list
// ===========================================================================
const COLS = [
  { key: "name", label: "Company", get: (h) => h.name },
  { key: "pattern", label: "Pattern", get: (h) => h.patternLabel },
  { key: "status", label: "Stage", get: (h) => h.status },
  { key: "price", label: "Price", num: true, get: (h) => h.company.price },
  { key: "entry", label: "Entry", num: true, get: (h) => h.entry },
  { key: "stop", label: "Exit / stop", num: true, get: (h) => h.stop },
  { key: "target", label: "Target", num: true, get: (h) => h.target2 },
  { key: "rr", label: "R:R", num: true, get: (h) => h.riskReward },
  { key: "score", label: "Confirm", num: true, get: (h) => h.confirm.score },
  { key: "turnover", label: "₹ cr/day", num: true, get: (h) => h.company.avgTurnoverCr },
];

function renderTable() {
  const head = "<thead><tr>" + COLS.map((c) =>
    '<th class="' + (c.num ? "num " : "") + 'sortable" data-sort="' + c.key + '">' + c.label
    + (sortKey === c.key ? '<span class="ar">' + (sortDir === -1 ? "▾" : "▴") + "</span>" : "") + "</th>").join("") + "</tr></thead>";

  const rows = filtered.map((h) => {
    const on = selected === h.symbol;
    return '<tr class="prow' + (on ? " on" : "") + '" data-sym="' + h.symbol + '">'
      + "<td><b>" + esc(h.name) + '</b><div class="sub2">' + esc(h.symbol) + (h.company.industry ? " · " + esc(h.company.industry) : "") + "</div></td>"
      + '<td><span class="pill ' + (h.bias === "BULLISH" ? "bull" : "bear") + '">' + esc(h.patternLabel) + "</span></td>"
      + '<td><span class="stage s-' + h.status.toLowerCase() + '">' + h.status + "</span></td>"
      + '<td class="num">' + inr(h.company.price) + "</td>"
      + '<td class="num">' + inr(h.entry) + "</td>"
      + '<td class="num down">' + inr(h.stop) + "</td>"
      + '<td class="num up">' + inr(h.target2) + "</td>"
      + '<td class="num">' + n2(h.riskReward, 1) + "</td>"
      + '<td class="num"><span class="score s' + (h.confirm.score >= 80 ? "3" : h.confirm.score >= 50 ? "2" : "1") + '">' + h.confirm.score + "</span></td>"
      + '<td class="num">' + n2(h.company.avgTurnoverCr, 1) + "</td></tr>"
      + (on ? '<tr class="drow"><td colspan="' + COLS.length + '"><div id="patDetail"></div></td></tr>' : "");
  }).join("");

  $("patTable").innerHTML = head + "<tbody>" + rows + "</tbody>";

  $("patTable").querySelectorAll("th.sortable").forEach((th) => {
    th.onclick = () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === "name" || k === "pattern" || k === "status" ? 1 : -1; }
      sortRows(); renderTable(); if (selected) paintDetail();
    };
  });
  $("patTable").querySelectorAll("tr.prow").forEach((tr) => {
    tr.onclick = () => select(selected === tr.dataset.sym ? null : tr.dataset.sym);
  });
}

/**
 * Selecting a pattern writes it into the URL (#patterns/HINDALCO), so a
 * particular chart can be linked to rather than only described.
 */
function select(symbol) {
  selected = symbol;
  history.replaceState(null, "", "#patterns" + (symbol ? "/" + symbol : ""));
  renderTable();
  if (selected) {
    paintDetail();
    document.querySelector("tr.prow.on")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function sortRows() {
  const col = COLS.find((c) => c.key === sortKey) || COLS[COLS.length - 1];
  filtered.sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (typeof x === "string" || typeof y === "string") return sortDir * String(x).localeCompare(String(y));
    return sortDir * ((x ?? -Infinity) - (y ?? -Infinity));
  });
}

// ===========================================================================
// the detail panel
// ===========================================================================
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

function paintDetail() {
  const h = filtered.find((x) => x.symbol === selected);
  const el = $("patDetail");
  if (!h || !el) return;
  const c = h.company, r = h.ratios, m = h.peerMedians || {};
  const riskPct = Math.abs((h.entry - h.stop) / h.entry) * 100;
  const rewardPct = Math.abs((h.target2 - h.entry) / h.entry) * 100;

  // Once a pattern has broken out, the textbook entry is behind us. Quoting the
  // pattern's own reward-to-risk then flatters it badly: someone acting today
  // buys at the market, not at the neckline, so they carry a wider stop for a
  // smaller remaining move. Both numbers are shown, and the one that applies to
  // a decision taken now is the second.
  const px = c.price;
  const triggered = (h.bias === "BULLISH" && px > h.entry) || (h.bias === "BEARISH" && px < h.entry);
  const riskNow = h.bias === "BULLISH" ? px - h.stop : h.stop - px;
  const rewardNow = h.bias === "BULLISH" ? h.target2 - px : px - h.target2;
  const rrNow = riskNow > 0 ? rewardNow / riskNow : null;

  const stat = (k, v, sub, tone) =>
    '<div class="stat"><div class="k">' + k + '</div><div class="v ' + (tone || "") + '" style="font-size:17px">' + v + "</div>"
    + (sub ? '<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">' + sub + "</div>" : "") + "</div>";

  el.innerHTML =
    // ---------------- the trade, stated plainly and separately ----------------
    '<div class="plan">'
    + '<div class="plan-i"><div class="plan-k">Entry</div><div class="plan-v">' + inr(h.entry) + "</div>"
    + '<div class="plan-s">' + (h.status === "FORMING" ? "on a close through this level" : "level already taken out") + "</div></div>"
    + '<div class="plan-i down"><div class="plan-k">Exit / stop-loss</div><div class="plan-v">' + inr(h.stop) + "</div>"
    + '<div class="plan-s">risk ' + n2(riskPct, 1) + "% from entry</div></div>"
    + '<div class="plan-i up"><div class="plan-k">Target</div><div class="plan-v">' + inr(h.target2) + "</div>"
    + '<div class="plan-s">reward ' + n2(rewardPct, 1) + "% · first stop " + inr(h.target1) + "</div></div>"
    + '<div class="plan-i"><div class="plan-k">Reward : risk</div><div class="plan-v">' + n2(h.riskReward, 1) + " : 1</div>"
    + '<div class="plan-s">at the pattern entry · confirmation ' + h.confirm.score + "/100</div></div>"
    + "</div>"

    + (triggered
      ? '<div class="alert' + (rrNow !== null && rrNow < 1 ? " bad" : "") + '">'
        + "<b>This pattern has already " + (h.bias === "BULLISH" ? "broken out" : "broken down") + ".</b> "
        + "Price is " + inr(px) + ", past the " + inr(h.entry) + " entry. Buying here means risking "
        + inr(Math.abs(riskNow)) + " a share to make " + inr(Math.abs(rewardNow))
        + (rrNow !== null ? ", a reward-to-risk of <b>" + n2(rrNow, 1) + " : 1</b> from today's price rather than the "
          + n2(h.riskReward, 1) + " : 1 the pattern offered at the neckline" : "")
        + (rrNow !== null && rrNow < 1 ? " — less than one rupee of reward per rupee risked, which is a chase, not a setup." : ".")
        + "</div>"
      : "")

    // ------------------------------- the chart -------------------------------
    + chart(h)
    + '<div class="legend">'
    + '<span><i class="sw" style="background:var(--up)"></i>up day</span>'
    + '<span><i class="sw" style="background:var(--down)"></i>down day</span>'
    + '<span><i class="sw dash" style="background:var(--ink-dim)"></i>50-DMA ' + inr(h.confirm.ma50) + "</span>"
    + '<span><i class="sw" style="background:var(--ink-faint)"></i>200-DMA ' + inr(h.confirm.ma200) + "</span>"
    + '<span><i class="sw dash" style="background:var(--accent)"></i>pattern</span>'
    + '<span class="dim">hover the chart for that day’s OHLC and volume</span>'
    + "</div>"

    + '<div class="note" style="border-top:1px solid var(--line)">' + esc(DATA.notes[h.pattern] || "")
    + " <b>Confirmation:</b> volume " + n2(h.confirm.volX) + "× its 20-day average, price "
    + (h.confirm.above50 ? "above" : "below") + " the 50-day and " + (h.confirm.above200 ? "above" : "below")
    + " the 200-day average, and the two averages " + (h.confirm.maAligned ? "aligned with" : "against")
    + " this pattern's direction. The target is the pattern's own depth (" + n2(h.depthPct, 1)
    + "%) projected from the neckline — a convention, not a forecast.</div>"

    // ------------------------------ the company ------------------------------
    + '<div class="dsec"><h3>The company</h3><span class="chip">' + esc(c.sector || "—")
    + (c.industry ? " · " + esc(c.industry) : "") + "</span></div>"
    + (c.description ? '<p class="dtext">' + esc(c.description) + "…</p>" : "")
    + '<div class="grid g4" style="margin-bottom:14px">'
    + stat("Market cap", crore(c.marketCapCr), c.nseTier || "")
    + stat("52-week range", inr(c.low52w) + " – " + inr(c.high52w), pc(c.pctFrom52wHigh) + " from high")
    + stat("1-year", pc(c.ret1y), "3-month " + pc(c.ret3m), cls(c.ret1y))
    + stat("Stage", (c.stage ?? "—") + " · " + esc(c.stageName || "—"), "RSI " + n2(c.rsi14, 0) + " · ADX " + n2(c.adx14, 0))
    + stat("Liquidity", "₹" + n2(c.avgTurnoverCr, 1) + " cr/day", "20-session average")
    + stat("Delivery", n2(c.avgDeliveryPct20, 1) + "%", "of volume taken home")
    + stat("Volatility", n2(c.atrPct, 2) + "% ATR", "beta " + n2(c.beta))
    + stat("Listed", esc(c.listed || "—"), c.employees ? Number(c.employees).toLocaleString("en-IN") + " employees" : "")
    + "</div>"

    // -------------------------- ratios vs sub-sector -------------------------
    + '<div class="dsec"><h3>Ratios against its sub-sector</h3><span class="chip">' + esc(c.industry || "—")
    + (h.peerCount ? " · " + h.peerCount + " listed" : "") + "</span></div>"
    + '<div class="scroll"><table class="rt"><thead><tr><th>Ratio</th><th class="num">' + esc(h.symbol)
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
    + '<p class="dtext" style="margin-top:10px">'
    + (h.peers.length ? "Competes with " + h.peers.map((p) => '<a href="stock/' + encodeURIComponent(p.symbol) + '.html">' + esc(p.name) + "</a>").join(", ") + ". " : "")
    + "Promoters hold " + n2(r.promoterHoldingPct, 1) + "%"
    + (typeof r.liabilitiesToEquity === "number" ? "; liabilities are " + n2(r.liabilitiesToEquity) + "× equity" : "")
    + '. <a href="stock/' + encodeURIComponent(h.symbol) + '.html">Full company page →</a></p>';

  wireHover(h);
}

// ===========================================================================
// filters & boot
// ===========================================================================
function apply() {
  const bias = $("patBias").value, pat = $("patType").value;
  const status = $("patStatus").value, minScore = Number($("patScore").value || 0);
  filtered = DATA.hits.filter((h) =>
    (!bias || h.bias === bias) && (!pat || h.pattern === pat)
    && (!status || h.status === status) && h.confirm.score >= minScore);
  if (selected && !filtered.some((h) => h.symbol === selected)) selected = null;
  sortRows();
  $("patCount").textContent = filtered.length + " of " + DATA.hits.length + " shown";
  renderTable();
  if (selected) paintDetail();
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

  const types = [...new Set(DATA.hits.map((h) => h.pattern))];
  const labels = Object.fromEntries(DATA.hits.map((h) => [h.pattern, h.patternLabel]));
  $("patType").innerHTML = '<option value="">Every pattern</option>'
    + types.map((t) => '<option value="' + t + '">' + labels[t] + "</option>").join("");

  $("patStatusLine").innerHTML = DATA.detected.toLocaleString("en-IN")
    + " patterns detected across the liquid universe on " + DATA.priceDate
    + "; the " + DATA.count + " best-confirmed are listed here. Select any row to open its chart.";

  for (const id of ["patBias", "patType", "patStatus", "patScore"]) $(id).onchange = apply;

  // #patterns/HINDALCO opens straight onto that chart
  const deep = location.hash.slice(1).split("/")[1];
  if (deep && DATA.hits.some((x) => x.symbol === deep)) selected = deep;
  apply();
  if (selected) document.querySelector("tr.prow.on")?.scrollIntoView({ block: "center" });
}
