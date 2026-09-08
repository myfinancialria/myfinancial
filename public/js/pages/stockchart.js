// ---------------------------------------------------------------------------
// stockchart.js — the OHLC chart on every company page, rendered with
// TradingView's own open-source Lightweight Charts library (served locally).
//
// TradingView-grade behaviour: candles + volume histogram, the 50/200-day
// averages (computed on dailies and sampled at weekly closes, so they mean the
// same thing in both views), a crosshair with price/time axis labels, an OHLC
// legend that follows the cursor, and native scroll-to-zoom / drag-to-pan.
//
// Data is inlined per page as JSON (#scData) rather than fetched, so the chart
// draws from the first paint with no request and no flash of an empty box.
// ---------------------------------------------------------------------------

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const dataEl = $("scData"), mount = $("scChart"), wrap = $("scWrap");
  if (!dataEl || !mount || !wrap) return;
  if (typeof LightweightCharts === "undefined") {
    mount.innerHTML = '<div class="dim" style="padding:30px">Chart library failed to load — refresh the page.</div>';
    return;
  }
  const D = JSON.parse(dataEl.textContent);
  const tip = $("scTip"); if (tip) tip.hidden = true;   // superseded by the crosshair legend

  const nf = (x, d = 2) => (typeof x === "number" ? x.toLocaleString("en-IN", { maximumFractionDigits: d }) : "—");
  const volFmt = (x) => (typeof x !== "number" ? "—"
    : x >= 1e7 ? (x / 1e7).toFixed(2) + " cr" : x >= 1e5 ? (x / 1e5).toFixed(2) + " L" : x.toLocaleString("en-IN"));

  // Dates arrive as strings; Lightweight Charts wants ISO or {year,month,day}.
  const toTime = (s) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  };
  // Crosshair callbacks return business days as objects even for ISO input, so
  // every lookup key is normalised to unpadded y-m-d.
  const keyOf = (t) => (typeof t === "string" ? t.split("-").map(Number).join("-") : t.year + "-" + t.month + "-" + t.day);

  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const palette = () => ({
    up: cssVar("--up") || "#22c55e", down: cssVar("--down") || "#ef4444",
    ink: cssVar("--ink") || "#f4f4f4", dim: cssVar("--ink-dim") || "#9a9a9a",
    faint: cssVar("--ink-faint") || "#5c5c5c", line: cssVar("--line") || "#1f1f1f",
    line2: cssVar("--line-2") || "#2e2e2e",
  });

  let mode = "daily";
  const series = () => (mode === "daily"
    ? { bars: D.daily || [], s50: D.dailySma50 || [], s200: D.dailySma200 || [] }
    : { bars: D.weekly || [], s50: D.weeklySma50 || [], s200: D.weeklySma200 || [] });

  // --------------------------------- chart ----------------------------------
  let pal = palette();
  const chart = LightweightCharts.createChart(mount, {
    autoSize: true,
    layout: {
      background: { type: "solid", color: "transparent" }, textColor: pal.dim,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 11,
    },
    grid: { vertLines: { color: pal.line }, horzLines: { color: pal.line } },
    rightPriceScale: { borderColor: pal.line2, scaleMargins: { top: 0.06, bottom: 0.2 } },
    timeScale: { borderColor: pal.line2, rightOffset: 3, barSpacing: 7, minBarSpacing: 1.5 },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: pal.faint, width: 1, style: 3, labelBackgroundColor: pal.ink },
      horzLine: { color: pal.faint, width: 1, style: 3, labelBackgroundColor: pal.ink },
    },
    localization: { priceFormatter: (p) => "₹" + nf(p, p >= 1000 ? 0 : 2) },
  });

  const candles = chart.addCandlestickSeries({
    upColor: pal.up, downColor: pal.down, wickUpColor: pal.up, wickDownColor: pal.down,
    borderVisible: false, priceLineColor: pal.dim, priceLineStyle: 3,
  });
  const vol = chart.addHistogramSeries({
    priceScaleId: "vol", priceFormat: { type: "volume" },
    lastValueVisible: false, priceLineVisible: false,
  });
  chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
  const ma50 = chart.addLineSeries({ color: pal.dim, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
  const ma200 = chart.addLineSeries({ color: pal.faint, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });

  // -------------------------------- legend ----------------------------------
  const legend = document.createElement("div");
  legend.className = "tvlegend";
  wrap.appendChild(legend);
  let byKey = new Map();

  function paintLegend(i) {
    const { bars, s50, s200 } = series();
    const b = bars[i];
    if (!b) { legend.innerHTML = ""; return; }
    const [dt, o, h, l, c, v] = b;
    const prev = i > 0 ? bars[i - 1][4] : o;
    const chg = prev ? ((c - prev) / prev) * 100 : 0;
    legend.innerHTML = "<b>" + dt + "</b>&ensp;O <b>" + nf(o) + "</b> H <b>" + nf(h) + "</b> L <b>" + nf(l) + "</b> C <b>" + nf(c)
      + '</b> <span class="' + (chg >= 0 ? "up" : "down") + '">' + (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%</span>"
      + "&ensp;Vol <b>" + volFmt(v) + "</b>"
      + (typeof s50[i] === "number" ? "&ensp;50D " + nf(s50[i]) : "")
      + (typeof s200[i] === "number" ? "&ensp;200D " + nf(s200[i]) : "");
  }

  function setData() {
    const { bars, s50, s200 } = series();
    const n = bars.length;
    byKey = new Map();
    if (!n) { candles.setData([]); vol.setData([]); ma50.setData([]); ma200.setData([]); legend.innerHTML = ""; return; }
    const cd = [], vd = [], m50 = [], m200 = [];
    for (let i = 0; i < n; i++) {
      const [dt, o, h, l, c, v] = bars[i];
      const t = toTime(dt);
      cd.push({ time: t, open: o, high: h, low: l, close: c });
      vd.push({ time: t, value: v || 0, color: (c >= o ? pal.up : pal.down) + "59" });
      if (typeof s50[i] === "number") m50.push({ time: t, value: s50[i] });
      if (typeof s200[i] === "number") m200.push({ time: t, value: s200[i] });
      byKey.set(keyOf(t), i);
    }
    candles.setData(cd); vol.setData(vd); ma50.setData(m50); ma200.setData(m200);
    // open on the most recent year of dailies; the full history is a drag away
    if (mode === "daily" && n > 280) chart.timeScale().setVisibleLogicalRange({ from: n - 260, to: n + 4 });
    else chart.timeScale().fitContent();
    const span = $("scSpan");
    if (span) span.textContent = bars[0][0] + " → " + bars[n - 1][0] + " · "
      + n.toLocaleString("en-IN") + (mode === "daily" ? " sessions" : " weeks")
      + " · scroll to zoom · drag to pan · double-click to reset";
    paintLegend(n - 1);
  }

  chart.subscribeCrosshairMove((param) => {
    const { bars } = series();
    if (!param.time) { paintLegend(bars.length - 1); return; }
    const i = byKey.get(keyOf(param.time));
    if (i !== undefined) paintLegend(i);
  });
  mount.addEventListener("dblclick", () => chart.timeScale().fitContent());

  // Follow the site's light/dark toggle without a reload.
  new MutationObserver(() => {
    pal = palette();
    chart.applyOptions({
      layout: { textColor: pal.dim },
      grid: { vertLines: { color: pal.line }, horzLines: { color: pal.line } },
      rightPriceScale: { borderColor: pal.line2 }, timeScale: { borderColor: pal.line2 },
      crosshair: {
        vertLine: { color: pal.faint, labelBackgroundColor: pal.ink },
        horzLine: { color: pal.faint, labelBackgroundColor: pal.ink },
      },
    });
    candles.applyOptions({ upColor: pal.up, downColor: pal.down, wickUpColor: pal.up, wickDownColor: pal.down });
    ma50.applyOptions({ color: pal.dim });
    ma200.applyOptions({ color: pal.faint });
    setData();   // per-bar volume colours are baked in, so rebuild them
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  document.querySelectorAll(".tfbtn").forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.tf;
      document.querySelectorAll(".tfbtn").forEach((x) => x.classList.toggle("on", x === b));
      setData();
    };
  });

  setData();
})();
