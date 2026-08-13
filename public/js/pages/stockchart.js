// ---------------------------------------------------------------------------
// stockchart.js — the OHLC candle chart on every company page.
//
// Daily and weekly candles, a volume panel, the 50- and 200-day averages, and a
// hover readout giving that bar's open, high, low, close, change and volume.
//
// The moving averages are computed on the daily series in both views and merely
// sampled at each week's close, so the 50-DMA line means the same thing whether
// you are looking at daily or weekly candles.
//
// Data is inlined per page as JSON rather than fetched, so the chart is drawn
// from the first paint with no request and no flash of an empty box.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const inr = (x) => (typeof x === "number" ? "₹" + x.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—");
const volFmt = (x) => (typeof x !== "number" ? "—"
  : x >= 10000000 ? (x / 10000000).toFixed(2) + " cr" : x >= 100000 ? (x / 100000).toFixed(2) + " L" : x.toLocaleString("en-IN"));

const W = 1000, GUTTER = 96, PLOT = W - GUTTER;
const PH = 320, GAP = 16, VH = 70;
const H = PH + GAP + VH;

let D = null;              // the inlined payload
let mode = "daily";

function series() {
  return mode === "daily"
    ? { bars: D.daily, s50: D.dailySma50, s200: D.dailySma200 }
    : { bars: D.weekly, s50: D.weeklySma50, s200: D.weeklySma200 };
}

function draw() {
  const { bars, s50, s200 } = series();
  const n = bars.length;
  if (!n) { $("scChart").innerHTML = '<div class="dim" style="padding:30px">No price history.</div>'; return; }

  const highs = bars.map((b) => b[2]), lows = bars.map((b) => b[3]);
  const maVals = [...s50, ...s200].filter((x) => typeof x === "number");
  const hi = Math.max(...highs, ...maVals);
  const lo = Math.min(...lows, ...maVals);
  const pad = (hi - lo) * 0.06 || 1;
  const yMax = hi + pad, yMin = Math.max(0, lo - pad);

  const X = (i) => (i / Math.max(1, n - 1)) * PLOT;
  const Y = (v) => PH - ((v - yMin) / (yMax - yMin)) * PH;
  const cw = Math.max(1.2, (PLOT / n) * 0.64);

  let candles = "";
  for (let i = 0; i < n; i++) {
    const [, o, h, l, c] = bars[i];
    const col = c >= o ? "var(--up)" : "var(--down)";
    const x = X(i), yO = Y(o), yC = Y(c);
    candles += '<line x1="' + x.toFixed(1) + '" y1="' + Y(h).toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + Y(l).toFixed(1)
      + '" stroke="' + col + '" stroke-width="0.85"/>'
      + '<rect x="' + (x - cw / 2).toFixed(1) + '" y="' + Math.min(yO, yC).toFixed(1) + '" width="' + cw.toFixed(1)
      + '" height="' + Math.max(0.9, Math.abs(yC - yO)).toFixed(1) + '" fill="' + col + '"/>';
  }

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
  const p50 = maPath(s50), p200 = maPath(s200);

  const vols = bars.map((b) => b[5] || 0);
  const vMax = Math.max(...vols) || 1;
  let volBars = "";
  for (let i = 0; i < n; i++) {
    const bh = (vols[i] / vMax) * VH;
    volBars += '<rect x="' + (X(i) - cw / 2).toFixed(1) + '" y="' + (VH - bh).toFixed(1) + '" width="' + cw.toFixed(1)
      + '" height="' + bh.toFixed(1) + '" fill="' + (bars[i][4] >= bars[i][1] ? "var(--up)" : "var(--down)") + '" opacity=".45"/>';
  }

  let grid = "";
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const v = yMax - t * (yMax - yMin);
    grid += '<line x1="0" y1="' + (t * PH).toFixed(1) + '" x2="' + PLOT + '" y2="' + (t * PH).toFixed(1) + '" stroke="var(--line)"/>'
      + '<text x="' + (PLOT + 8) + '" y="' + (t * PH + 3).toFixed(1) + '" fill="var(--ink-faint)" font-size="10.5" '
      + 'font-family="ui-monospace,Menlo,monospace">' + Math.round(v).toLocaleString("en-IN") + "</text>";
  }

  // last close, marked in the gutter so it never sits over the candles
  const last = bars[n - 1][4];
  const lastY = Y(last);
  const lastTag = '<line x1="0" y1="' + lastY.toFixed(1) + '" x2="' + PLOT + '" y2="' + lastY.toFixed(1)
    + '" stroke="var(--ink)" stroke-width="1" stroke-dasharray="3 3" opacity=".5"/>'
    + '<rect x="' + PLOT + '" y="' + (lastY - 8).toFixed(1) + '" width="' + GUTTER + '" height="16" fill="var(--ink)"/>'
    + '<text x="' + (PLOT + 8) + '" y="' + (lastY + 3.5).toFixed(1) + '" fill="var(--paper)" font-size="10.5" font-weight="700" '
    + 'font-family="ui-monospace,Menlo,monospace">' + Math.round(last).toLocaleString("en-IN") + "</text>";

  $("scChart").innerHTML =
    '<svg id="scSvg" viewBox="0 0 ' + W + " " + (H + 16) + '" preserveAspectRatio="none" style="width:100%;height:'
    + (H + 16) + 'px;display:block" role="img" aria-label="' + mode + ' candles with volume and moving averages">'
    + grid + candles
    + (p200 ? '<path d="' + p200 + '" fill="none" stroke="var(--ink-faint)" stroke-width="1.7"/>' : "")
    + (p50 ? '<path d="' + p50 + '" fill="none" stroke="var(--ink-dim)" stroke-width="1.4" stroke-dasharray="4 3"/>' : "")
    + lastTag
    + '<g transform="translate(0 ' + (PH + GAP) + ')">' + volBars
    + '<text x="3" y="10" fill="var(--ink-faint)" font-size="9.5" font-family="ui-monospace,Menlo,monospace">VOLUME</text></g>'
    + '<text x="0" y="' + (H + 13) + '" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">' + bars[0][0] + "</text>"
    + '<text x="' + PLOT + '" y="' + (H + 13) + '" text-anchor="end" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">'
    + bars[n - 1][0] + "</text>"
    + '<g id="scCross" style="display:none;pointer-events:none">'
    + '<line id="scCrossX" y1="0" y2="' + (PH + GAP + VH) + '" stroke="var(--ink)" stroke-width="0.8" stroke-dasharray="3 3" opacity=".55"/>'
    + "</g></svg>";

  wireHover();
  const span = mode === "daily" ? Math.round(n / 21) + " months of daily candles" : Math.round(n / 52) + " years of weekly candles";
  $("scSpan").textContent = span;
}

function wireHover() {
  const wrap = $("scWrap"), svg = $("scSvg"), tip = $("scTip");
  const cross = $("scCross"), cx = $("scCrossX");
  if (!wrap || !svg) return;
  const { bars, s50, s200 } = series();
  const n = bars.length;

  const move = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * W;
    if (vx < 0) { leave(); return; }
    const i = Math.max(0, Math.min(n - 1, Math.round((Math.min(vx, PLOT) / PLOT) * (n - 1))));
    const b = bars[i];
    const x = (i / Math.max(1, n - 1)) * PLOT;
    cross.style.display = "";
    cx.setAttribute("x1", x); cx.setAttribute("x2", x);

    const prev = i > 0 ? bars[i - 1][4] : b[1];
    const chg = prev ? ((b[4] - prev) / prev) * 100 : 0;
    const tone = chg > 0 ? "up" : chg < 0 ? "down" : "";
    tip.innerHTML =
      '<div class="tip-d">' + b[0] + (mode === "weekly" ? " · week ending" : "") + "</div>"
      + '<div class="tip-g"><span>O</span><b>' + inr(b[1]) + "</b><span>H</span><b>" + inr(b[2]) + "</b>"
      + "<span>L</span><b>" + inr(b[3]) + '</b><span>C</span><b class="' + tone + '">' + inr(b[4]) + "</b></div>"
      + '<div class="tip-r"><span class="' + tone + '">' + (chg > 0 ? "+" : "") + chg.toFixed(2) + "%</span> · Vol " + volFmt(b[5]) + "</div>"
      + '<div class="tip-r dim">50-DMA ' + inr(s50[i]) + " · 200-DMA " + inr(s200[i]) + "</div>";

    const px = (x / W) * wrap.clientWidth;
    const flip = px > wrap.clientWidth * 0.55;
    tip.hidden = false;
    tip.style.left = flip ? "" : (px + 14) + "px";
    tip.style.right = flip ? (wrap.clientWidth - px + 14) + "px" : "";
  };
  const leave = () => { tip.hidden = true; cross.style.display = "none"; };

  wrap.onmousemove = (e) => move(e.clientX);
  wrap.onmouseleave = leave;
  wrap.ontouchmove = (e) => { if (e.touches[0]) move(e.touches[0].clientX); };
  wrap.ontouchend = leave;
}

document.addEventListener("DOMContentLoaded", () => {
  const node = $("scData");
  if (!node) return;
  try { D = JSON.parse(node.textContent); } catch { return; }
  if (!D?.daily?.length) return;

  document.querySelectorAll("[data-tf]").forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.tf;
      document.querySelectorAll("[data-tf]").forEach((x) => x.classList.toggle("on", x === b));
      draw();
    };
  });
  draw();

  // statement tabs live on the same page
  document.querySelectorAll(".tabs button").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".tabs button").forEach((x) => { x.style.borderBottomColor = x === b ? "var(--ink)" : "transparent"; });
      document.querySelectorAll(".pane").forEach((p) => { p.style.display = p.dataset.p === b.dataset.t ? "" : "none"; });
    };
  });
});
