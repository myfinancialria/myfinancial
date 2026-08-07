/* ===========================================================================
   equities.js — Module 3 & 4: stock deep-dive (AI summary, health, peers,
   SWOT, financials) + quant screeners (RRG, patterns, 52w breakouts, Darvas).
   =========================================================================== */
(() => {
  "use strict";
  const { h, api, store, fmtMoney, fmtNum, fmtPct, pctCls, fmtVol, navigate, debounce } = window.MF;
  const { candleChart, rrgPlot, hbars, COLORS } = window.MFC;

  const SCREENS = [["rrg", "🔄 RRG Rotation"], ["patterns", "📐 Chart Patterns"], ["breakouts", "🚀 52-Week Breakouts"], ["darvas", "📦 Darvas Boxes"]];

  async function render(rest) {
    if (rest?.[0] === "screeners") return hub(rest[1] || "rrg");
    if (rest?.[0]) return stockPage(rest[0].toUpperCase());
    return hub("rrg");
  }

  // ------------------------------ screeners hub -------------------------------
  async function hub(tab) {
    const stocks = await api("/equity/list");
    const search = h("input.inp", { placeholder: "🔍 Open a stock — symbol or name…", style: { maxWidth: "340px" } });
    const sugg = h("div", { style: { position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30, background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: "10px", marginTop: "4px", overflow: "hidden", display: "none" } });
    search.addEventListener("input", debounce(() => {
      const q = search.value.trim().toUpperCase();
      sugg.innerHTML = ""; sugg.style.display = q ? "block" : "none";
      if (!q) return;
      stocks.filter((s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q)).slice(0, 8).forEach((s) =>
        sugg.appendChild(h("div", { style: { padding: "9px 13px", cursor: "pointer", borderBottom: "1px solid var(--border)" }, onmousedown: () => navigate(`#/equities/${s.symbol}`) },
          h("b", s.symbol), h("span.dim", ` — ${s.name} · ${s.sectorName}`))));
    }, 120));
    search.addEventListener("blur", () => setTimeout(() => (sugg.style.display = "none"), 150));

    const body = h("div", { style: { marginTop: "16px" } });
    body.appendChild(h("div.skeleton", { style: { height: "420px" } }));
    ({ rrg: rrgTab, patterns: patternsTab, breakouts: breakoutsTab, darvas: darvasTab }[tab] || rrgTab)()
      .then((el) => { body.innerHTML = ""; body.appendChild(el); })
      .catch((e) => { body.innerHTML = ""; body.appendChild(h("div.card", h("div.empty", `⚠️ ${e.message}`))); });

    return h("div",
      h("div.page-head",
        h("div", h("div.page-title", "Equities & Screeners"), h("div.page-sub", "Relative rotation · automated pattern detection · weekly breakouts · box consolidations")),
        h("div", { style: { position: "relative" } }, search, sugg)),
      h("div.tabs", SCREENS.map(([id, label]) => h("button.tab", { class: id === tab ? "active" : "", onclick: () => navigate(`#/equities/screeners/${id}`) }, label))),
      body);
  }

  // ---------------------------------- RRG -------------------------------------
  async function rrgTab() {
    const wrap = h("div.grid.cols-32");
    const paint = async (scope, sector) => {
      wrap.innerHTML = "";
      wrap.appendChild(h("div.skeleton", { style: { height: "480px" } }));
      const data = await api(`/screeners/rrg?scope=${scope}${sector ? `&sector=${sector}` : ""}`);
      wrap.innerHTML = "";
      const plot = rrgPlot(data.items, {
        onPick: (it) => it.kind === "SECTOR" ? paint("stocks", it.sectorKey) : navigate(`#/equities/${it.symbol}`),
      });
      wrap.appendChild(h("div.card",
        h("div.card-head",
          h("div", h("div.card-title", `🔄 ${scope === "sectors" ? "Sector Rotation" : `${data.sectorName} — constituents`} vs ${data.benchmark}`),
            h("div.card-sub", "JdK RS-Ratio × RS-Momentum · 8-week trails · click a dot to drill down")),
          scope === "stocks" ? h("button.btn.sm", { onclick: () => paint("sectors", null) }, "← All sectors") : null),
        plot));
      const QDESC = {
        LEADING: ["Strong & strengthening", "ride the trend", COLORS.UP],
        WEAKENING: ["Strong but slowing", "tighten stops / book profits", COLORS.GOLD],
        LAGGING: ["Weak & weakening", "avoid fresh exposure", COLORS.DOWN],
        IMPROVING: ["Weak but turning", "early accumulation zone", COLORS.BLUE],
      };
      wrap.appendChild(h("div.grid", { style: { gap: "16px", alignContent: "start" } },
        h("div.card",
          h("div.card-title", { style: { marginBottom: "10px" } }, "Quadrant playbook"),
          h("div", { style: { display: "grid", gap: "10px" } },
            Object.entries(QDESC).map(([q, [what, action, col]]) => h("div", { style: { borderLeft: `3px solid ${col}`, paddingLeft: "10px" } },
              h("b", { style: { color: col } }, q), h("div.dim", { style: { fontSize: "12px" } }, `${what} — ${action}`))))),
        h("div.card.flush",
          h("div.card-head", h("div.card-title", "Positions")),
          h("div.tbl-scroll", { style: { maxHeight: "330px" } }, h("table.tbl",
            h("thead", h("tr", h("th", scope === "sectors" ? "Sector" : "Stock"), h("th", "Quadrant"), h("th", "RS"), h("th", "Momentum"))),
            h("tbody", data.items.sort((a, b) => b.x - a.x).map((it) => h("tr.click", { onclick: () => it.kind === "SECTOR" ? paint("stocks", it.sectorKey) : navigate(`#/equities/${it.symbol}`) },
              h("td", h("div.sym", it.name)),
              h("td", h("span.chip", { style: { color: QDESC[it.quadrant][2], borderColor: QDESC[it.quadrant][2] + "66" } }, it.quadrant)),
              h("td.num", fmtNum(it.x)), h("td.num", fmtNum(it.y))))))))));
    };
    await paint("sectors", null);
    return wrap;
  }

  // -------------------------------- patterns ----------------------------------
  const PATTERN_ICON = { DOUBLE_BOTTOM: "⩗", HEAD_SHOULDERS: "⩓", BULL_FLAG: "🚩", CUP_HANDLE: "☕", ASC_TRIANGLE: "◺" };
  async function patternsTab() {
    const hits = await api("/screeners/patterns");
    if (!hits.length) return h("div.card", h("div.empty", "No qualifying patterns on today's tape — detectors rerun as bars update."));
    return h("div",
      h("div.grid.cols-2",
        hits.map((p) => h("div.card", { style: { cursor: "pointer" }, onclick: () => stockModalChart(p) },
          h("div.card-head",
            h("div", h("div.card-title", `${PATTERN_ICON[p.pattern] || "📐"} ${p.symbol} — ${prettyPattern(p.pattern)}`),
              h("div.card-sub", `${p.name} · pattern depth ${p.depthPct}%`)),
            h("div", { style: { display: "flex", gap: "6px" } },
              h("span.chip" + (p.bias === "BULLISH" ? ".up" : ".down"), p.bias),
              h("span.vbadge", { class: p.status }, p.status))),
          h("div.grid.cols-4", { style: { gap: "8px" } },
            h("div.stat", h("div.s-label", p.bias === "BULLISH" ? "Entry ≥" : "Entry ≤"), h("div.s-value", { style: { fontSize: "15px" } }, fmtNum(p.entry))),
            h("div.stat", h("div.s-label", "Target 1 / 2"), h("div.s-value", { style: { fontSize: "15px" } }, `${fmtNum(p.target1)} / ${fmtNum(p.target2)}`)),
            h("div.stat", h("div.s-label", "Stop"), h("div.s-value", { style: { fontSize: "15px" }, class: "down-t" }, fmtNum(p.stop))),
            h("div.stat", h("div.s-label", "R : R"), h("div.s-value", { style: { fontSize: "15px" }, class: p.riskReward >= 2 ? "up-t" : "" }, `1 : ${p.riskReward}`))),
          h("div.dim", { style: { fontSize: "12px", marginTop: "8px" } }, `CMP ${fmtNum(p.ltp)} (${fmtPct(p.changePct)}) — click for chart with levels`)))),
      h("div.disclaimer", "Detected on daily bars via fractal-pivot geometry with measured-move targets. Educational scanner output — validate volume/context before acting."));
  }
  const prettyPattern = (p) => ({ DOUBLE_BOTTOM: "Double Bottom", HEAD_SHOULDERS: "Head & Shoulders", BULL_FLAG: "Bull Flag", CUP_HANDLE: "Cup & Handle", ASC_TRIANGLE: "Ascending Triangle" }[p] || p);

  async function stockModalChart(p) {
    const cc = candleChart({ height: 380 });
    const m = window.MF.modal(`${p.symbol} — ${prettyPattern(p.pattern)} (${p.status})`, h("div", cc.el,
      h("div.legend-row", { style: { marginTop: "10px" } },
        h("span", h("span.legend-dot", { style: { background: COLORS.BLUE } }), `entry ${fmtNum(p.entry)}`),
        h("span", h("span.legend-dot", { style: { background: COLORS.UP } }), `targets ${fmtNum(p.target1)} / ${fmtNum(p.target2)}`),
        h("span", h("span.legend-dot", { style: { background: COLORS.DOWN } }), `stop ${fmtNum(p.stop)}`),
        h("button.btn.sm.primary", { style: { marginLeft: "auto" }, onclick: () => { m.remove(); navigate(`#/equities/${p.symbol}`); } }, "Open full analysis →")),
    ), { width: "820px" });
    const bars = (await api(`/market/history/${p.symbol}?days=210`)).bars;
    cc.setBars(bars);
    cc.addPriceLine(p.entry, "#ffffff", "entry");
    cc.addPriceLine(p.target2, "#bfbfbf", "T2");
    cc.addPriceLine(p.stop, "#6f6f6f", "SL");
    if (p.anchors?.length) cc.setMarkers(p.anchors.map((a) => ({ time: a.t, position: p.bias === "BULLISH" ? "belowBar" : "aboveBar", color: "#ffffff", shape: p.bias === "BULLISH" ? "arrowUp" : "arrowDown", text: "" })));
  }

  // -------------------------------- breakouts ---------------------------------
  async function breakoutsTab() {
    const data = await api("/screeners/breakouts52w");
    const table = (rows, title, sub, badge) => h("div.card.flush",
      h("div.card-head", h("div", h("div.card-title", title), h("div.card-sub", sub)), badge),
      rows.length ? h("div.tbl-scroll", h("table.tbl",
        h("thead", h("tr", h("th", "Stock"), h("th", "LTP"), h("th", "Day"), h("th", "Weekly close"), h("th", "Prior 52w high"), h("th", "Distance"), h("th", "Vol ×20w avg"))),
        h("tbody", rows.map((r) => h("tr.click", { onclick: () => navigate(`#/equities/${r.symbol}`) },
          h("td", h("div.sym", r.symbol), h("div.sub", r.name)),
          h("td.num", fmtNum(r.ltp)), h("td", { class: pctCls(r.changePct) }, fmtPct(r.changePct)),
          h("td.num", fmtNum(r.weeklyClose)), h("td.num", fmtNum(r.prior52wHigh)),
          h("td", { class: pctCls(r.distancePct) }, fmtPct(r.distancePct)),
          h("td", h("b", { class: r.volumeX >= 2 ? "up-t" : "" }, `${fmtNum(r.volumeX, 1)}×`))))))) : h("div.empty", "None on the current weekly bar."));
    return h("div.grid", { style: { gap: "16px" } },
      table(data.confirmed, "🚀 Confirmed weekly breakouts", `weekly close ≥ prior 52-week high with ≥${data.volMultiple}× 20-week volume`, h("span.vbadge.BREAKOUT", `${data.confirmed.length} LIVE`)),
      table(data.approaching, "👀 Approaching the high — watchlist", "within 3% of the 52-week high, ranked by proximity & volume build-up", h("span.chip.gold", `${data.approaching.length} candidates`)),
      h("div.disclaimer", "Momentum leaders make new highs on expanding participation. Wait for the WEEKLY close to confirm; volume expansion filters false pokes."));
  }

  // --------------------------------- darvas -----------------------------------
  async function darvasTab() {
    const rows = await api("/screeners/darvas");
    return h("div.grid", { style: { gap: "16px" } },
      h("div.card.flush",
        h("div.card-head", h("div", h("div.card-title", "📦 Darvas Box Consolidations"), h("div.card-sub", "tight ranges (≤9%) with volume expansion ≥1.25× box average — pre-breakout signature"))),
        rows.length ? h("div.tbl-scroll", h("table.tbl",
          h("thead", h("tr", h("th", "Stock"), h("th", "Status"), h("th", "Box top"), h("th", "Box bottom"), h("th", "Height"), h("th", "Bars"), h("th", "Vol ×"), h("th", "Entry"), h("th", "Stop"), h("th", "Target"))),
          h("tbody", rows.map((r) => h("tr.click", { onclick: () => navigate(`#/equities/${r.symbol}`) },
            h("td", h("div.sym", r.symbol), h("div.sub", r.name)),
            h("td", h("span.vbadge", { class: r.status }, r.status)),
            h("td.num", fmtNum(r.boxTop)), h("td.num", fmtNum(r.boxBottom)),
            h("td.num", `${r.boxHeightPct}%`), h("td.num", r.bars),
            h("td", h("b", { class: r.volumeX >= 1.5 ? "up-t" : "" }, `${r.volumeX}×`)),
            h("td.num", fmtNum(r.entry)), h("td.num.down-t", fmtNum(r.stop)), h("td.num.up-t", fmtNum(r.target)))))))
          : h("div.empty", "No tight boxes with volume expansion right now — check back as the tape evolves.")),
      h("div.disclaimer", "Nicolas Darvas's method: trade only when price escapes the box ceiling with volume; the box floor is the stop."));
  }

  // -------------------------------- stock page --------------------------------
  async function stockPage(symbol) {
    const d = await api(`/equity/${symbol}`).catch(() => null);
    if (!d) return h("div.card", h("div.empty", `Unknown symbol "${symbol}"`));
    const { quote: qt, fundamentals: f, health, peers, swot, summary, profile } = d;

    // chart with EMAs
    const cc = candleChart({ height: 400 });
    let resolution = "1D", days = 260;
    const loadChart = async () => {
      const bars = (await api(`/market/history/${symbol}?resolution=${resolution}&days=${days}`)).bars;
      cc.setBars(bars);
      const closes = bars.map((b) => ({ time: b.time, close: b.close }));
      const ema = (n) => { const k = 2 / (n + 1); let p = null; return closes.map((c) => ({ time: c.time, value: p = p === null ? c.close : c.close * k + p * (1 - k) })); };
      cc.addLine(ema(20), "#c9c9c9"); cc.addLine(ema(50), "#6f6f6f");
    };
    const rangeBtns = h("div.range-btns",
      [["6M", "1D", 126], ["1Y", "1D", 260], ["3Y", "1D", 756], ["5Y", "1W", 1260], ["10Y", "1W", 2520]].map(([label, res, dd], i) =>
        h("button.rb", { class: i === 1 ? "active" : "", onclick: (e) => { resolution = res; days = dd; e.target.parentElement.querySelectorAll(".rb").forEach((b) => b.classList.toggle("active", b === e.target)); loadChart(); } }, label)));

    const chartCard = h("div.card",
      h("div.card-head",
        h("div", h("div.card-title", `${symbol} · NSE`), h("div.card-sub", "EMA 20 (light) · EMA 50 (dark) · volume")),
        rangeBtns),
      cc.el);

    // live header
    const priceEl = h("span", { style: { fontSize: "30px", fontWeight: 800 } }, fmtNum(qt.ltp));
    const chgEl = h("span", { class: pctCls(qt.changePct), style: { fontSize: "15px", fontWeight: 700 } }, `${fmtNum(qt.change)} (${fmtPct(qt.changePct)})`);
    const unsub = store.on("ticks", () => {
      const q2 = store.quotes.get(symbol);
      if (!q2) return;
      if (!document.body.contains(priceEl)) return unsub();
      priceEl.textContent = fmtNum(q2.ltp);
      chgEl.textContent = `${fmtNum(q2.change)} (${fmtPct(q2.changePct)})`;
      chgEl.className = pctCls(q2.changePct);
    });

    const header = h("div.card",
      h("div", { style: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" } },
        h("div",
          h("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } },
            h("div.page-title", profile.name), h("span.chip.blue", profile.sectorName), profile.fno ? h("span.chip.violet", "F&O") : null,
            h("span.chip" + (health.score >= 75 ? ".up" : health.score >= 55 ? ".gold" : ".down"), `Health ${health.score}/100 · ${health.grade}`)),
          h("div", { style: { display: "flex", gap: "12px", alignItems: "baseline", marginTop: "8px" } }, h("span.dim", "₹"), priceEl, chgEl),
          h("div.dim", { style: { fontSize: "12px", marginTop: "4px" } }, `Day ${fmtNum(qt.low)}–${fmtNum(qt.high)} · 52w ${fmtNum(qt.week52Low)}–${fmtNum(qt.week52High)} · Vol ${fmtVol(qt.volume)}`)),
        h("div.grid.cols-3", { style: { gap: "8px", alignContent: "start" } },
          [["P/E", f.ratios.pe + "×"], ["P/B", f.ratios.pb + "×"], ["EV/EBITDA", f.ratios.evEbitda ? f.ratios.evEbitda + "×" : "—"],
           ["Mkt Cap", fmtMoney(f.ratios.marketCap * 1e7)], ["Div Yield", f.ratios.dividendYieldPct + "%"], ["ROE", f.annual.at(-1).roe + "%"]].map(([k, v]) =>
            h("div.stat", h("div.s-label", k), h("div.s-value", { style: { fontSize: "15px" } }, v))))));

    // AI summary
    const aiCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "✨ AI Executive Summary"), h("div.card-sub", "generated from platform fundamentals — every figure traceable below")),
        h("span.chip.violet", "AI")),
      summary.paragraphs.map((p) => h("p", { style: { fontSize: "13.5px", color: "var(--text2)", marginBottom: "10px", lineHeight: 1.65 } }, p)),
      h("div.disclaimer", summary.disclaimer));

    // health pillars
    const healthCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🩺 Financial Health"), h("div.card-sub", `composite ${health.score}/100`))),
      hbars(health.pillars.map((p) => ({ label: p.name, value: p.score, display: `${p.score}/100`, color: p.score >= 70 ? "#ffffff" : p.score >= 45 ? "#9f9f9f" : "repeating-linear-gradient(45deg,#8a8a8a 0 6px,#4a4a4a 6px 12px)", note: p.note })), { max: 100 }));

    // financials
    let mode = "annual";
    const finBody = h("div");
    const paintFin = () => {
      finBody.innerHTML = "";
      if (mode === "annual") {
        finBody.appendChild(h("div.tbl-scroll", h("table.tbl",
          h("thead", h("tr", h("th", "FY"), h("th", "Revenue ₹Cr"), h("th", "Growth"), h("th", f.annual[0].ebitda ? "EBITDA %" : "NIM %"), h("th", "PAT ₹Cr"), h("th", "PAT %"), h("th", "EPS"), h("th", "ROE"), h("th", "ROCE"), h("th", "D/E"), h("th", "FCF ₹Cr"))),
          h("tbody", f.annual.map((a) => h("tr",
            h("td", h("b", a.fy)), h("td.num", fmtNum(a.revenue, 0)),
            h("td", { class: pctCls(a.growthPct) }, fmtPct(a.growthPct, 1)),
            h("td.num", a.ebitdaMarginPct ?? a.nim ?? "—"),
            h("td.num", fmtNum(a.pat, 0)), h("td.num", a.patMarginPct),
            h("td.num", a.eps), h("td.num", a.roe), h("td.num", a.roce ?? "—"),
            h("td.num", a.debtToEquity ?? "—"), h("td.num", a.fcf ? fmtNum(a.fcf, 0) : "—")))))));
      } else {
        finBody.appendChild(h("div.tbl-scroll", h("table.tbl",
          h("thead", h("tr", h("th", "Quarter"), h("th", "Revenue ₹Cr"), h("th", "PAT ₹Cr"), h("th", "PAT margin"))),
          h("tbody", f.quarters.map((qr) => h("tr", h("td", h("b", qr.q)), h("td.num", fmtNum(qr.revenue, 0)), h("td.num", fmtNum(qr.pat, 0)), h("td.num", `${qr.patMarginPct}%`)))))));
      }
    };
    paintFin();
    const finCard = h("div.card.flush",
      h("div.card-head", h("div", h("div.card-title", "📊 Financial Statements"), h("div.card-sub", `Rev CAGR 3Y ${f.ratios.revCagr3Pct}% · PAT CAGR ${f.ratios.patCagr3Pct}%`)),
        h("div.tabs", [["annual", "Annual"], ["quarters", "Quarterly"]].map(([id, l]) => h("button.tab", { class: id === "annual" ? "active" : "", onclick: (e) => { mode = id; e.target.parentElement.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === e.target)); paintFin(); } }, l)))),
      finBody);

    // peers
    const peersCard = h("div.card.flush",
      h("div.card-head", h("div", h("div.card-title", `🏭 ${peers.sectorName} peers`), h("div.card-sub", `sector medians — P/E ${peers.medians.pe}× · P/B ${peers.medians.pb}× · ROE ${peers.medians.roe}%`))),
      h("div.tbl-scroll", { style: { maxHeight: "330px" } }, h("table.tbl",
        h("thead", h("tr", h("th", "Company"), h("th", "MCap ₹Cr"), h("th", "P/E"), h("th", "P/B"), h("th", "EV/EBITDA"), h("th", "ROE"), h("th", "Growth"), h("th", "D/E"))),
        h("tbody", peers.peers.map((p) => h("tr.click", { style: p.self ? { background: "rgba(255,255,255,.06)" } : {}, onclick: () => !p.self && navigate(`#/equities/${p.symbol}`) },
          h("td", h("div.sym", p.name), p.self ? h("div.sub", "— this company") : null),
          h("td.num", fmtNum(p.mcap, 0)), h("td.num", p.pe), h("td.num", p.pb), h("td.num", p.evEbitda ?? "—"),
          h("td.num", p.roe), h("td", { class: pctCls(p.revGrowthPct) }, fmtPct(p.revGrowthPct, 1)), h("td.num", p.debtToEquity ?? "—")))))));

    // SWOT
    const swotCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "⚖️ Automated SWOT"), h("div.card-sub", "regenerates with every fundamental update")), h("span.chip.violet", "AI")),
      h("div.swot-grid",
        h("div.swot-cell.swot-S", h("h4", "Strengths"), h("ul", swot.strengths.map((s) => h("li", s)))),
        h("div.swot-cell.swot-W", h("h4", "Weaknesses"), h("ul", swot.weaknesses.map((s) => h("li", s)))),
        h("div.swot-cell.swot-O", h("h4", "Opportunities"), h("ul", swot.opportunities.map((s) => h("li", s)))),
        h("div.swot-cell.swot-T", h("h4", "Threats"), h("ul", swot.threats.map((s) => h("li", s))))));

    queueMicrotask(loadChart);
    return h("div",
      h("div.page-head",
        h("div.pill-row",
          h("button.btn.sm", { onclick: () => navigate("#/equities/screeners/rrg") }, "← Screeners"),
          h("button.btn.sm", { onclick: () => window.Views.assistant.open(`Analysis of ${symbol}`) }, "💬 Ask AI about " + symbol))),
      h("div.grid", { style: { gap: "16px" } },
        header,
        h("div.grid.cols-32", chartCard, aiCard),
        h("div.grid.cols-32", finCard, healthCard),
        h("div.grid.cols-2", peersCard, swotCard)));
  }

  window.Views = window.Views || {};
  window.Views.equities = render;
})();
