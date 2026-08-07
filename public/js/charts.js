/* ===========================================================================
   charts.js — TradingView Lightweight Charts wrappers + hand-rolled SVG/canvas
   components: donut, radar, RRG plot, payoff diagram, OI histogram, fan chart.
   =========================================================================== */
(() => {
  "use strict";
  const { h } = window.MF;

  const THEME = {
    layout: { background: { type: "solid", color: "transparent" }, textColor: "#a6b8d6", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: 11 },
    grid: { vertLines: { color: "rgba(29,50,82,.35)" }, horzLines: { color: "rgba(29,50,82,.35)" } },
    rightPriceScale: { borderColor: "rgba(42,68,112,.8)" },
    timeScale: { borderColor: "rgba(42,68,112,.8)", timeVisible: false },
    crosshair: { vertLine: { color: "#4c8dff", width: 1, style: 2, labelBackgroundColor: "#2f6fe0" }, horzLine: { color: "#4c8dff", width: 1, style: 2, labelBackgroundColor: "#2f6fe0" } },
  };
  const UP = "#10b981", DOWN = "#f43f5e", BLUE = "#4c8dff", GOLD = "#f0b429", VIOLET = "#8b5cf6", CYAN = "#22d3ee";

  function baseChart(el, height, extra = {}) {
    const chart = LightweightCharts.createChart(el, { height, autoSize: true, ...THEME, ...extra });
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return chart;
  }

  /** Candlestick + volume chart. Returns {el, chart, candles, setBars, addLine, markers}. */
  function candleChart({ height = 380 } = {}) {
    const el = h("div.lw");
    let chart, candles, volume;
    const init = () => {
      chart = baseChart(el, height);
      candles = chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN });
      volume = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    };
    return {
      el, get chart() { return chart; },
      setBars(bars) {
        if (!chart) init();
        candles.setData(bars);
        volume.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? "rgba(16,185,129,.35)" : "rgba(244,63,94,.35)" })));
        chart.timeScale().fitContent();
      },
      update(bar) { candles?.update(bar); },
      addLine(data, color = BLUE, opts = {}) {
        if (!chart) init();
        const s = chart.addLineSeries({ color, lineWidth: 1.6, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...opts });
        s.setData(data);
        return s;
      },
      setMarkers(m) { candles?.setMarkers(m); },
      addPriceLine(price, color, title) { candles?.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }); },
    };
  }

  /** Multi-line/area comparison chart. */
  function lineChart({ height = 300, area = true } = {}) {
    const el = h("div.lw");
    let chart;
    const series = [];
    const ensure = () => { if (!chart) chart = baseChart(el, height); return chart; };
    return {
      el, get chart() { return chart; },
      addSeries(data, { color = BLUE, title = "", fill = area } = {}) {
        ensure();
        const s = fill
          ? chart.addAreaSeries({ lineColor: color, topColor: color + "44", bottomColor: color + "05", lineWidth: 2, title, priceLineVisible: false })
          : chart.addLineSeries({ color, lineWidth: 1.8, title, priceLineVisible: false });
        s.setData(data);
        series.push(s);
        chart.timeScale().fitContent();
        return s;
      },
      clear() { series.forEach((s) => chart?.removeSeries(s)); series.length = 0; },
      fit() { chart?.timeScale().fitContent(); },
    };
  }

  // ------------------------------- SVG helpers --------------------------------
  const NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  /** Donut allocation chart with legend. slices: [{label, value, color}] */
  function donut(slices, { size = 168, hole = 0.62, centre = null } = {}) {
    const total = slices.reduce((a, s) => a + s.value, 0) || 1;
    const svg = svgEl("svg", { viewBox: "0 0 100 100", width: size, height: size });
    let angle = -90;
    for (const s of slices) {
      const sweep = (s.value / total) * 360;
      if (sweep <= 0) continue;
      const large = sweep > 180 ? 1 : 0;
      const r = 42, cx0 = 50, cy0 = 50;
      const rad = (a) => [cx0 + r * Math.cos((a * Math.PI) / 180), cy0 + r * Math.sin((a * Math.PI) / 180)];
      const [x1, y1] = rad(angle), [x2, y2] = rad(angle + sweep - 0.5);
      const path = svgEl("path", {
        d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
        stroke: s.color, "stroke-width": 100 * (1 - hole) * 0.16, fill: "none", "stroke-linecap": "butt",
      });
      path.appendChild(svgEl("title")).textContent = `${s.label}: ${((s.value / total) * 100).toFixed(1)}%`;
      svg.appendChild(path);
      angle += sweep;
    }
    const wrap = h("div", { style: { display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" } });
    const holder = h("div", { style: { position: "relative", width: `${size}px`, height: `${size}px` } }, svg);
    if (centre) holder.appendChild(h("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" } }, centre));
    wrap.appendChild(holder);
    wrap.appendChild(h("div", { style: { display: "grid", gap: "7px" } },
      slices.map((s) => h("div.legend-row", h("span", h("span.legend-dot", { style: { background: s.color } }), `${s.label}`), h("b", { style: { marginLeft: "auto", fontSize: "12px" } }, `${((s.value / total) * 100).toFixed(0)}%`)))));
    return wrap;
  }

  /** Radar chart (0..100 axes). data: [{axis, value}] */
  function radar(data, { size = 220, color = BLUE } = {}) {
    const svg = svgEl("svg", { viewBox: "-110 -110 220 220", width: size, height: size });
    const n = data.length, R = 82;
    for (const ring of [0.25, 0.5, 0.75, 1]) {
      const pts = data.map((_, i) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return `${R * ring * Math.cos(a)},${R * ring * Math.sin(a)}`; }).join(" ");
      svg.appendChild(svgEl("polygon", { points: pts, fill: "none", stroke: "rgba(42,68,112,.6)", "stroke-width": 0.8 }));
    }
    data.forEach((d, i) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      svg.appendChild(svgEl("line", { x1: 0, y1: 0, x2: R * Math.cos(a), y2: R * Math.sin(a), stroke: "rgba(42,68,112,.6)", "stroke-width": 0.8 }));
      const t = svgEl("text", { x: (R + 16) * Math.cos(a), y: (R + 14) * Math.sin(a) + 3, "text-anchor": "middle", "font-size": 9, fill: "#a6b8d6" });
      t.textContent = d.axis;
      svg.appendChild(t);
    });
    const pts = data.map((d, i) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; const r = R * Math.max(0.04, Math.min(1, d.value / 100)); return `${r * Math.cos(a)},${r * Math.sin(a)}`; }).join(" ");
    svg.appendChild(svgEl("polygon", { points: pts, fill: color + "33", stroke: color, "stroke-width": 1.6 }));
    return svg;
  }

  /** RRG scatter with quadrants + trails. items from /screeners/rrg. */
  function rrgPlot(items, { size = 520, onPick = null } = {}) {
    const wrap = h("div", { style: { position: "relative" } });
    const svg = svgEl("svg", { viewBox: "0 0 100 100", width: "100%", style: `max-width:${size}px; display:block; margin:0 auto;` });
    // domain: centre 100, span dynamic
    const xs = items.flatMap((it) => it.trail.map((p) => p.x));
    const ys = items.flatMap((it) => it.trail.map((p) => p.y));
    const span = Math.max(2.2, ...xs.map((x) => Math.abs(x - 100)), ...ys.map((y) => Math.abs(y - 100))) * 1.15;
    const X = (v) => 50 + ((v - 100) / span) * 46;
    const Y = (v) => 50 - ((v - 100) / span) * 46;
    // quadrant fills
    const quads = [
      { x: 50, y: 0, c: "rgba(16,185,129,.10)", label: "LEADING", lx: 96, ly: 6, anchor: "end", col: UP },
      { x: 50, y: 50, c: "rgba(240,180,41,.09)", label: "WEAKENING", lx: 96, ly: 97, anchor: "end", col: GOLD },
      { x: 0, y: 50, c: "rgba(244,63,94,.09)", label: "LAGGING", lx: 4, ly: 97, anchor: "start", col: DOWN },
      { x: 0, y: 0, c: "rgba(76,141,255,.10)", label: "IMPROVING", lx: 4, ly: 6, anchor: "start", col: BLUE },
    ];
    for (const q of quads) {
      svg.appendChild(svgEl("rect", { x: q.x, y: q.y, width: 50, height: 50, fill: q.c }));
      const t = svgEl("text", { x: q.lx, y: q.ly, "font-size": 3.4, fill: q.col, "font-weight": 700, "text-anchor": q.anchor, "letter-spacing": ".4" });
      t.textContent = q.label;
      svg.appendChild(t);
    }
    svg.appendChild(svgEl("line", { x1: 50, y1: 0, x2: 50, y2: 100, stroke: "rgba(166,184,214,.4)", "stroke-width": 0.35 }));
    svg.appendChild(svgEl("line", { x1: 0, y1: 50, x2: 100, y2: 50, stroke: "rgba(166,184,214,.4)", "stroke-width": 0.35 }));
    const QCOL = { LEADING: UP, WEAKENING: GOLD, LAGGING: DOWN, IMPROVING: BLUE };
    for (const it of items) {
      const col = QCOL[it.quadrant];
      // trail
      const pts = it.trail.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ");
      svg.appendChild(svgEl("polyline", { points: pts, fill: "none", stroke: col, "stroke-width": 0.5, opacity: 0.65, "stroke-dasharray": "1 .7" }));
      it.trail.slice(0, -1).forEach((p, i) => svg.appendChild(svgEl("circle", { cx: X(p.x), cy: Y(p.y), r: 0.55 + i * 0.08, fill: col, opacity: 0.5 })));
      // head
      const cx0 = X(it.x), cy0 = Y(it.y);
      const g = svgEl("g", { style: onPick ? "cursor:pointer" : "" });
      g.appendChild(svgEl("circle", { cx: cx0, cy: cy0, r: 1.7, fill: col, stroke: "#0b1728", "stroke-width": 0.4 }));
      const label = svgEl("text", { x: cx0 + 2.3, y: cy0 + 1, "font-size": 2.9, fill: "#eaf1fd", "font-weight": 600 });
      label.textContent = it.symbol.replace("NIFTY", "");
      g.appendChild(label);
      g.appendChild(svgEl("title")).textContent = `${it.name} — ${it.quadrant} (RS ${it.x}, Mom ${it.y})`;
      if (onPick) g.addEventListener("click", () => onPick(it));
      svg.appendChild(g);
    }
    // axes labels
    const ax = svgEl("text", { x: 50, y: 99.5, "font-size": 2.6, fill: "#647a9e", "text-anchor": "middle" }); ax.textContent = "JdK RS-Ratio →";
    const ay = svgEl("text", { x: 1.4, y: 50, "font-size": 2.6, fill: "#647a9e", transform: "rotate(-90 1.4 50)", "text-anchor": "middle" }); ay.textContent = "JdK RS-Momentum →";
    svg.appendChild(ax); svg.appendChild(ay);
    wrap.appendChild(svg);
    return wrap;
  }

  /** Option strategy payoff diagram. pts: [{s, pnl}], breakevens: [] */
  function payoffChart(pts, { height = 190, breakevens = [], spot = null } = {}) {
    const w = 560, hgt = height;
    const svg = svgEl("svg", { viewBox: `0 0 ${w} ${hgt}`, width: "100%", preserveAspectRatio: "none", style: "display:block" });
    const xs = pts.map((p) => p.s), ys = pts.map((p) => p.pnl);
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymax = Math.max(...ys.map(Math.abs), 1) * 1.15;
    const X = (v) => ((v - xmin) / (xmax - xmin)) * (w - 20) + 10;
    const Y = (v) => hgt / 2 - (v / ymax) * (hgt / 2 - 12);
    // zero line
    svg.appendChild(svgEl("line", { x1: 0, y1: Y(0), x2: w, y2: Y(0), stroke: "rgba(166,184,214,.35)", "stroke-width": 1 }));
    // profit/loss areas
    let dUp = "", dDn = "";
    pts.forEach((p, i) => {
      const cmd = `${i === 0 ? "M" : "L"} ${X(p.s)} ${Y(Math.max(0, p.pnl))}`;
      const cmd2 = `${i === 0 ? "M" : "L"} ${X(p.s)} ${Y(Math.min(0, p.pnl))}`;
      dUp += cmd + " "; dDn += cmd2 + " ";
    });
    svg.appendChild(svgEl("path", { d: `${dUp} L ${X(xmax)} ${Y(0)} L ${X(xmin)} ${Y(0)} Z`, fill: "rgba(16,185,129,.18)" }));
    svg.appendChild(svgEl("path", { d: `${dDn} L ${X(xmax)} ${Y(0)} L ${X(xmin)} ${Y(0)} Z`, fill: "rgba(244,63,94,.16)" }));
    // pnl line
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${X(p.s)} ${Y(p.pnl)}`).join(" ");
    svg.appendChild(svgEl("path", { d: line, fill: "none", stroke: "#eaf1fd", "stroke-width": 1.8 }));
    for (const be of breakevens) {
      svg.appendChild(svgEl("line", { x1: X(be), y1: 8, x2: X(be), y2: hgt - 8, stroke: GOLD, "stroke-width": 1, "stroke-dasharray": "4 3" }));
      const t = svgEl("text", { x: X(be), y: 10, "font-size": 9.5, fill: GOLD, "text-anchor": "middle" }); t.textContent = Math.round(be).toLocaleString("en-IN");
      svg.appendChild(t);
    }
    if (spot) {
      svg.appendChild(svgEl("line", { x1: X(spot), y1: 8, x2: X(spot), y2: hgt - 8, stroke: BLUE, "stroke-width": 1.2 }));
      const t = svgEl("text", { x: X(spot), y: hgt - 2, "font-size": 9.5, fill: BLUE, "text-anchor": "middle" }); t.textContent = "spot";
      svg.appendChild(t);
    }
    return svg;
  }

  /** OI histogram per strike: rows from option chain. */
  function oiHistogram(rows, { atm, height = 300 } = {}) {
    const maxOI = Math.max(...rows.flatMap((r) => [r.ce.oi, r.pe.oi]));
    const wrap = h("div", { style: { display: "grid", gap: "3px", maxHeight: `${height}px`, overflowY: "auto", padding: "2px 0" } });
    for (const r of [...rows].reverse()) {
      const ceW = (r.ce.oi / maxOI) * 100, peW = (r.pe.oi / maxOI) * 100;
      wrap.appendChild(h("div", { style: { display: "grid", gridTemplateColumns: "1fr 74px 1fr", alignItems: "center", gap: "8px", fontSize: "11px" } },
        h("div", { style: { display: "flex", justifyContent: "flex-end" } },
          h("div", { title: `CALL OI ${(r.ce.oi / 1e5).toFixed(1)}L (${r.ce.oiChg >= 0 ? "+" : ""}${(r.ce.oiChg / 1e5).toFixed(1)}L)`, style: { width: `${Math.max(1.5, ceW)}%`, height: "13px", borderRadius: "3px 0 0 3px", background: r.ce.oiChg >= 0 ? "rgba(244,63,94,.75)" : "rgba(244,63,94,.35)" } })),
        h("div", { style: { textAlign: "center", fontFamily: "var(--mono)", fontWeight: r.strike === atm ? 800 : 400, color: r.strike === atm ? "#f0b429" : "var(--text2)" } }, String(r.strike)),
        h("div", h("div", { title: `PUT OI ${(r.pe.oi / 1e5).toFixed(1)}L (${r.pe.oiChg >= 0 ? "+" : ""}${(r.pe.oiChg / 1e5).toFixed(1)}L)`, style: { width: `${Math.max(1.5, peW)}%`, height: "13px", borderRadius: "0 3px 3px 0", background: r.pe.oiChg >= 0 ? "rgba(16,185,129,.75)" : "rgba(16,185,129,.35)" } }))));
    }
    return wrap;
  }

  /** Monte Carlo fan chart from bands {times, p10..p90} + target line. */
  function fanChart(bands, target, { height = 240 } = {}) {
    const w = 640, hgt = height;
    const svg = svgEl("svg", { viewBox: `0 0 ${w} ${hgt}`, width: "100%", preserveAspectRatio: "none" });
    const n = bands.times.length;
    const ymax = Math.max(bands.p90[n - 1], target) * 1.08;
    const X = (i) => (i / (n - 1)) * (w - 60) + 8;
    const Y = (v) => hgt - 22 - (v / ymax) * (hgt - 36);
    const band = (loArr, hiArr, fill) => {
      let d = "";
      hiArr.forEach((v, i) => (d += `${i === 0 ? "M" : "L"} ${X(i)} ${Y(v)} `));
      for (let i = n - 1; i >= 0; i--) d += `L ${X(i)} ${Y(loArr[i])} `;
      svg.appendChild(svgEl("path", { d: d + "Z", fill }));
    };
    band(bands.p10, bands.p90, "rgba(76,141,255,.12)");
    band(bands.p25, bands.p75, "rgba(76,141,255,.20)");
    const median = bands.p50.map((v, i) => `${i === 0 ? "M" : "L"} ${X(i)} ${Y(v)}`).join(" ");
    svg.appendChild(svgEl("path", { d: median, fill: "none", stroke: BLUE, "stroke-width": 2 }));
    // target line
    svg.appendChild(svgEl("line", { x1: 0, y1: Y(target), x2: w - 46, y2: Y(target), stroke: GOLD, "stroke-dasharray": "5 4", "stroke-width": 1.4 }));
    const tt = svgEl("text", { x: w - 44, y: Y(target) + 3, "font-size": 10, fill: GOLD }); tt.textContent = "target";
    svg.appendChild(tt);
    // year labels
    for (const fr of [0, 0.25, 0.5, 0.75, 1]) {
      const i = Math.round(fr * (n - 1));
      const t = svgEl("text", { x: X(i), y: hgt - 6, "font-size": 9.5, fill: "#647a9e", "text-anchor": "middle" });
      t.textContent = `${bands.times[i].toFixed(0)}y`;
      svg.appendChild(t);
    }
    // y labels
    for (const fr of [0.33, 0.66, 1]) {
      const v = ymax * fr;
      const t = svgEl("text", { x: w - 4, y: Y(v) + 3, "font-size": 9, fill: "#647a9e", "text-anchor": "end" });
      t.textContent = v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : `${(v / 1e5).toFixed(0)}L`;
      svg.appendChild(t);
    }
    return svg;
  }

  /** Feasibility ring (SVG donut gauge). */
  function ring(pct, { size = 74, color = null, label = "" } = {}) {
    const col = color || (pct >= 75 ? UP : pct >= 45 ? GOLD : DOWN);
    const svg = svgEl("svg", { viewBox: "0 0 42 42", width: size, height: size });
    svg.appendChild(svgEl("circle", { cx: 21, cy: 21, r: 17, fill: "none", stroke: "rgba(29,50,82,.9)", "stroke-width": 4.4 }));
    const c = 2 * Math.PI * 17;
    svg.appendChild(svgEl("circle", {
      cx: 21, cy: 21, r: 17, fill: "none", stroke: col, "stroke-width": 4.4, "stroke-linecap": "round",
      "stroke-dasharray": `${(pct / 100) * c} ${c}`, transform: "rotate(-90 21 21)",
    }));
    const t = svgEl("text", { x: 21, y: 22.5, "text-anchor": "middle", "font-size": 9.6, fill: "#eaf1fd", "font-weight": 700 });
    t.textContent = `${Math.round(pct)}%`;
    svg.appendChild(t);
    if (label) { const l = svgEl("text", { x: 21, y: 30, "text-anchor": "middle", "font-size": 4.6, fill: "#a6b8d6" }); l.textContent = label; svg.appendChild(l); }
    return svg;
  }

  /** Horizontal mini bars: items [{label, value, color, note}] */
  function hbars(items, { max = null } = {}) {
    const mx = max ?? Math.max(...items.map((i) => Math.abs(i.value)), 1);
    return h("div", { style: { display: "grid", gap: "10px" } }, items.map((it) =>
      h("div",
        h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" } },
          h("span.dim", it.label), h("b", it.display ?? it.value)),
        h("div.bar", h("i", { style: { width: `${Math.min(100, (Math.abs(it.value) / mx) * 100)}%`, background: it.color || "linear-gradient(90deg,#2f6fe0,#4c8dff)" } })),
        it.note ? h("div", { style: { fontSize: "10.5px", color: "var(--muted)", marginTop: "3px" } }, it.note) : null)));
  }

  window.MFC = { candleChart, lineChart, donut, radar, rrgPlot, payoffChart, oiHistogram, fanChart, ring, hbars, COLORS: { UP, DOWN, BLUE, GOLD, VIOLET, CYAN } };
})();
