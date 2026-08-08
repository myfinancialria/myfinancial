/* ===========================================================================
   equities.js — Modules 3 & 4.
   Screeners: Cyclical Graph (sectors → sub-sectors → stocks, with filters),
   chart patterns w/ volume + 50/200-DMA + sector confirmation, Weinstein
   stage analysis, 52-week breakouts, Darvas boxes, sector heatmap.
   Stock page: deep ratios, industry pulse, govt support & budget provisions,
   hero products, AI summary, SWOT, peers — for every NSE-listed symbol.
   =========================================================================== */
(() => {
  "use strict";
  const { h, api, store, fmtMoney, fmtNum, fmtPct, pctCls, fmtVol, navigate, debounce } = window.MF;
  const { candleChart, rrgPlot, hbars, COLORS, alpha } = window.MFC;

  const SCREENS = [["cyclical", "🔄 Cyclical Graph"], ["patterns", "📐 Chart Patterns"], ["weinstein", "🪜 Weinstein Stages"], ["breakouts", "🚀 52-Week Breakouts"], ["darvas", "📦 Darvas Boxes"]];

  async function render(rest) {
    if (rest?.[0] === "screeners") return hub(rest[1] === "rrg" ? "cyclical" : rest[1] || "cyclical");
    if (rest?.[0]) return stockPage(decodeURIComponent(rest[0]).toUpperCase());
    return hub("cyclical");
  }

  // ------------------------------ screeners hub -------------------------------
  async function hub(tab) {
    const search = h("input.inp", { placeholder: "🔍 Search any NSE-listed stock…", style: { maxWidth: "340px" } });
    const sugg = h("div", { style: { position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30, background: "var(--bg2)", border: "1px solid var(--border2)", marginTop: "4px", overflow: "hidden", display: "none" } });
    search.addEventListener("input", debounce(async () => {
      const q = search.value.trim();
      sugg.innerHTML = ""; sugg.style.display = q ? "block" : "none";
      if (!q) return;
      try {
        const { results, nseListed } = await api(`/equity/search?q=${encodeURIComponent(q)}`);
        results.forEach((s) => sugg.appendChild(h("div", { style: { padding: "9px 13px", cursor: "pointer", borderBottom: "1px solid var(--border)" }, onmousedown: () => navigate(`#/equities/${encodeURIComponent(s.symbol)}`) },
          h("b", s.symbol), h("span.dim", ` — ${s.name} `), s.curated ? h("span.chip.up", "deep coverage") : h("span.chip", "listed"))));
        if (!results.length) sugg.appendChild(h("div", { style: { padding: "9px 13px", color: "var(--muted)" } }, `No match across ${nseListed || "…"} NSE symbols`));
      } catch { /* best-effort */ }
    }, 160));
    search.addEventListener("blur", () => setTimeout(() => (sugg.style.display = "none"), 150));

    const body = h("div", { style: { marginTop: "16px" } });
    body.appendChild(h("div.skeleton", { style: { height: "420px" } }));
    ({ cyclical: cyclicalTab, patterns: patternsTab, weinstein: weinsteinTab, breakouts: breakoutsTab, darvas: darvasTab }[tab] || cyclicalTab)()
      .then((el) => { body.innerHTML = ""; body.appendChild(el); })
      .catch((e) => { body.innerHTML = ""; body.appendChild(h("div.card", h("div.empty", `⚠️ ${e.message}`))); });

    return h("div",
      h("div.page-head",
        h("div", h("div.page-title", "Equities & Screeners"), h("div.page-sub", "cyclical rotation · pattern detection with volume/MA confirmation · Weinstein stages · every NSE-listed stock")),
        h("div", { style: { position: "relative" } }, search, sugg)),
      await heatmapStrip(),
      h("div.tabs", { style: { marginTop: "14px" } }, SCREENS.map(([id, label]) => h("button.tab", { class: id === tab ? "active" : "", onclick: () => navigate(`#/equities/screeners/${id}`) }, label))),
      body);
  }

  // ------------------------ sector heatmap (colourful) ------------------------
  async function heatmapStrip() {
    try {
      const heat = await api("/equity/sector-heat");
      const max = Math.max(...heat.map((s) => Math.abs(s.avgChangePct)), 0.5);
      return h("div.card", { style: { marginTop: "4px" } },
        h("div.card-head", h("div", h("div.card-title", "🌡️ Sector Heatmap"), h("div.card-sub", "average day change · green advancing · red declining"))),
        h("div.heat-grid", heat.map((s) => {
          const t = Math.min(1, Math.abs(s.avgChangePct) / max);
          const col = s.avgChangePct >= 0 ? COLORS.UP : COLORS.DOWN;
          return h("div.heat-tile", {
            style: { background: alpha(col, 0.16 + t * 0.7), borderColor: alpha(col, 0.5) },
            onclick: () => navigate("#/equities/screeners/cyclical"),
            title: `${s.gainers}/${s.count} advancing`,
          },
            h("div.ht-name", s.sector),
            h("div.ht-val", `${s.avgChangePct > 0 ? "+" : ""}${s.avgChangePct}%`),
            h("div.ht-sub", `${s.gainers}/${s.count} ▲`));
        })));
    } catch { return h("div"); }
  }

  // ------------------------- Cyclical Graph (ex-RRG) ---------------------------
  async function cyclicalTab() {
    const wrap = h("div");
    const state = { scope: "subsectors", sector: null, sub: null, hidden: new Set() };

    const paint = async () => {
      wrap.innerHTML = "";
      wrap.appendChild(h("div.skeleton", { style: { height: "480px" } }));
      const qs = state.scope === "stocks"
        ? `scope=stocks&${state.sub ? `sub=${encodeURIComponent(state.sub)}` : `sector=${state.sector}`}`
        : `scope=${state.scope}`;
      const data = await api(`/screeners/rrg?${qs}`);
      wrap.innerHTML = "";

      const sectors = [...new Set(data.items.map((i) => i.sectorKey))].sort();
      const visible = () => data.items.filter((i) => !state.hidden.has(i.sectorKey));
      const chipRow = h("div.pill-row", { style: { marginBottom: "12px" } },
        h("button.fchip", { class: state.hidden.size === 0 ? "on" : "", onclick: () => { state.hidden.clear(); paint(); } }, "All"),
        sectors.map((sec) => h("button.fchip", {
          class: state.hidden.has(sec) ? "" : "on",
          onclick: () => { state.hidden.has(sec) ? state.hidden.delete(sec) : state.hidden.add(sec); paint(); },
        }, sec)),
        h("span.dim", { style: { fontSize: "11px", alignSelf: "center", marginLeft: "6px" } }, `${visible().length}/${data.items.length} shown`));

      const scopeTabs = h("div.tabs", [["sectors", "Sectors"], ["subsectors", "Sub-sectors"]].map(([id, l]) =>
        h("button.tab", { class: state.scope === id ? "active" : "", onclick: () => { state.scope = id; state.hidden.clear(); paint(); } }, l)));

      const drill = (it) => {
        if (it.kind === "SECTOR") { state.scope = "stocks"; state.sector = it.sectorKey; state.sub = null; paint(); }
        else if (it.kind === "SUBSECTOR") { state.scope = "stocks"; state.sub = it.symbol; state.sector = null; paint(); }
        else navigate(`#/equities/${it.symbol}`);
      };
      const plot = rrgPlot(visible(), { onPick: drill });

      const QDESC = {
        LEADING: ["Strong & strengthening", "ride the trend", COLORS.UP],
        WEAKENING: ["Strong but slowing", "tighten stops / book profits", COLORS.GOLD],
        LAGGING: ["Weak & weakening", "avoid fresh exposure", COLORS.DOWN],
        IMPROVING: ["Weak but turning", "early accumulation zone", COLORS.BLUE],
      };
      wrap.appendChild(h("div.grid.cols-32",
        h("div.card",
          h("div.card-head",
            h("div", h("div.card-title", `🔄 Cyclical Graph — ${state.scope === "stocks" ? (state.sub || `${data.sectorName || ""} stocks`) : state.scope === "subsectors" ? "all sub-sectors" : "sector indices"} vs ${data.benchmark}`),
              h("div.card-sub", "JdK RS-Ratio × RS-Momentum · 8-week trails · rotation runs clockwise · click any dot to drill down")),
            state.scope === "stocks" ? h("button.btn.sm", { onclick: () => { state.scope = "subsectors"; state.sub = null; state.sector = null; paint(); } }, "← Sub-sectors") : scopeTabs),
          state.scope !== "stocks" ? chipRow : null,
          plot),
        h("div.grid", { style: { gap: "16px", alignContent: "start" } },
          h("div.card",
            h("div.card-title", { style: { marginBottom: "10px" } }, "Quadrant playbook"),
            h("div", { style: { display: "grid", gap: "10px" } },
              Object.entries(QDESC).map(([q, [what, action, col]]) => h("div", { style: { borderLeft: `3px solid ${col}`, paddingLeft: "10px" } },
                h("b", { style: { color: col } }, q), h("div.dim", { style: { fontSize: "12px" } }, `${what} — ${action}`))))),
          h("div.card.flush",
            h("div.card-head", h("div.card-title", "Positions")),
            h("div.tbl-scroll", { style: { maxHeight: "380px" } }, h("table.tbl",
              h("thead", h("tr", h("th", state.scope === "stocks" ? "Stock" : "Group"), h("th", "Quadrant"), h("th", "RS"), h("th", "Mom"))),
              h("tbody", visible().sort((a, b) => b.x - a.x).map((it) => h("tr.click", { onclick: () => drill(it) },
                h("td", h("div.sym", it.name), it.memberCount ? h("div.sub", `${it.memberCount} stocks`) : null),
                h("td", h("span.chip", { style: { color: QDESC[it.quadrant][2], borderColor: alpha(QDESC[it.quadrant][2], .5) } }, it.quadrant)),
                h("td.num", fmtNum(it.x)), h("td.num", fmtNum(it.y))))))))
        )));
    };
    await paint();
    return wrap;
  }

  // -------------------------------- patterns ----------------------------------
  const prettyPattern = (p) => ({ DOUBLE_BOTTOM: "Double Bottom", HEAD_SHOULDERS: "Head & Shoulders", BULL_FLAG: "Bull Flag", CUP_HANDLE: "Cup & Handle", ASC_TRIANGLE: "Ascending Triangle" }[p] || p);
  const PATTERN_ICON = { DOUBLE_BOTTOM: "⩗", HEAD_SHOULDERS: "⩓", BULL_FLAG: "🚩", CUP_HANDLE: "☕", ASC_TRIANGLE: "◺" };

  async function patternsTab() {
    const hits = await api("/screeners/patterns");
    if (!hits.length) return h("div.card", h("div.empty", "No qualifying patterns on today's tape — detectors rerun as bars update."));
    const confChip = (ok, label) => h("span.chip" + (ok ? ".up" : ".down"), `${ok ? "✓" : "✗"} ${label}`);
    return h("div",
      h("div.grid.cols-2",
        hits.map((p) => h("div.card", { style: { cursor: "pointer", borderLeft: `3px solid ${p.bias === "BULLISH" ? COLORS.UP : COLORS.DOWN}` }, onclick: () => patternModal(p) },
          h("div.card-head",
            h("div", h("div.card-title", `${PATTERN_ICON[p.pattern] || "📐"} ${p.symbol} — ${prettyPattern(p.pattern)}`),
              h("div.card-sub", `${p.name} · depth ${p.depthPct}%`)),
            h("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } },
              h("span.chip" + (p.confirm.grade === "STRONG" ? ".up" : p.confirm.grade === "GOOD" ? ".gold" : ".down"), `Confirm ${p.confirm.score}/100`),
              h("span.vbadge", { class: p.status }, p.status))),
          h("div.grid.cols-4", { style: { gap: "8px" } },
            h("div.stat", h("div.s-label", p.bias === "BULLISH" ? "Entry ≥" : "Entry ≤"), h("div.s-value", { style: { fontSize: "15px" } }, fmtNum(p.entry))),
            h("div.stat", h("div.s-label", "Target 1 / 2"), h("div.s-value", { style: { fontSize: "15px" }, class: "up-t" }, `${fmtNum(p.target1)} / ${fmtNum(p.target2)}`)),
            h("div.stat", h("div.s-label", "Stop"), h("div.s-value", { style: { fontSize: "15px" }, class: "down-t" }, fmtNum(p.stop))),
            h("div.stat", h("div.s-label", "R : R"), h("div.s-value", { style: { fontSize: "15px" } }, `1 : ${p.riskReward}`))),
          h("div.pill-row", { style: { marginTop: "10px" } },
            confChip(p.confirm.volConfirmed, `Vol ${p.confirm.volX}×`),
            confChip(p.bias === "BULLISH" ? p.confirm.above50 : !p.confirm.above50, p.bias === "BULLISH" ? "> 50-DMA" : "< 50-DMA"),
            confChip(p.bias === "BULLISH" ? p.confirm.above200 : !p.confirm.above200, p.bias === "BULLISH" ? "> 200-DMA" : "< 200-DMA"),
            confChip(p.confirm.maAligned, "50/200 aligned"),
            p.sectorCtx ? h("span.chip" + (p.sectorCtx.supports ? ".up" : ".gold"), `Sector ${p.sectorCtx.quadrant} ${p.sectorCtx.supports ? "✓" : "·"}`) : h("span.chip", "Sector idx —")),
          h("div.dim", { style: { fontSize: "12px", marginTop: "8px" } }, `CMP ${fmtNum(p.ltp)} (${fmtPct(p.changePct)}) — click for chart with levels, 50/200-DMA & volume`)))),
      h("div.disclaimer", "A breakout is only as strong as its confirmation: demand ≥1.5× volume, price on the right side of the 50 & 200-DMA, and a sector rotating in your favour (see the Cyclical Graph)."));
  }

  async function patternModal(p) {
    const cc = candleChart({ height: 400 });
    const m = window.MF.modal(`${p.symbol} — ${prettyPattern(p.pattern)} (${p.status} · confirm ${p.confirm.score}/100)`, h("div", cc.el,
      h("div.legend-row", { style: { marginTop: "10px" } },
        h("span", h("span.legend-dot", { style: { background: COLORS.BLUE } }), `entry ${fmtNum(p.entry)}`),
        h("span", h("span.legend-dot", { style: { background: COLORS.UP } }), `T2 ${fmtNum(p.target2)}`),
        h("span", h("span.legend-dot", { style: { background: COLORS.DOWN } }), `stop ${fmtNum(p.stop)}`),
        h("span", h("span.legend-dot", { style: { background: COLORS.GOLD } }), "50-DMA"),
        h("span", h("span.legend-dot", { style: { background: COLORS.VIOLET } }), "200-DMA"),
        h("button.btn.sm.primary", { style: { marginLeft: "auto" }, onclick: () => { m.remove(); navigate(`#/equities/${p.symbol}`); } }, "Full analysis →"))),
      { width: "860px" });
    const bars = (await api(`/market/history/${p.symbol}?days=320`)).bars;
    cc.setBars(bars);
    const sma = (n) => bars.map((b, i) => { if (i + 1 < n) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += bars[k].close; return { time: b.time, value: s / n }; }).filter(Boolean);
    cc.addLine(sma(50), COLORS.GOLD); cc.addLine(sma(200), COLORS.VIOLET);
    cc.addPriceLine(p.entry, COLORS.BLUE, "entry");
    cc.addPriceLine(p.target2, COLORS.UP, "T2");
    cc.addPriceLine(p.stop, COLORS.DOWN, "SL");
    if (p.anchors?.length) cc.setMarkers(p.anchors.map((a) => ({ time: a.t, position: p.bias === "BULLISH" ? "belowBar" : "aboveBar", color: COLORS.GOLD, shape: p.bias === "BULLISH" ? "arrowUp" : "arrowDown", text: "" })));
  }

  // -------------------------------- Weinstein ---------------------------------
  async function weinsteinTab() {
    const data = await api("/screeners/weinstein");
    let stageFilter = 0;
    const wrap = h("div");
    const STAGE_META = {
      1: ["Stage 1 · Basing", COLORS.CYAN, "accumulation after decline — watch for breakouts"],
      2: ["Stage 2 · Advancing", COLORS.UP, "the only buy stage — above a rising 30-wk MA"],
      3: ["Stage 3 · Topping", COLORS.GOLD, "distribution — tighten stops"],
      4: ["Stage 4 · Declining", COLORS.DOWN, "avoid / short — rallies into the MA fail"],
    };
    const paint = () => {
      const rows = data.rows.filter((r) => !stageFilter || r.stage === stageFilter);
      wrap.innerHTML = "";
      wrap.appendChild(h("div.grid.cols-4", { style: { marginBottom: "14px" } },
        [1, 2, 3, 4].map((s) => h("div.card", { style: { cursor: "pointer", borderTop: `3px solid ${STAGE_META[s][1]}`, opacity: stageFilter && stageFilter !== s ? .5 : 1 }, onclick: () => { stageFilter = stageFilter === s ? 0 : s; paint(); } },
          h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } },
            h("b", { style: { color: STAGE_META[s][1] } }, STAGE_META[s][0]),
            h("span", { style: { fontSize: "26px", fontWeight: 800 } }, data.distribution[s])),
          h("div.dim", { style: { fontSize: "11.5px", marginTop: "4px" } }, STAGE_META[s][2])))));
      wrap.appendChild(h("div.card.flush",
        h("div.card-head", h("div", h("div.card-title", "🪜 Weinstein Stage Analysis"), h("div.card-sub", `weekly close vs 30-week MA · ${rows.length} stocks${stageFilter ? ` · stage ${stageFilter} only` : ""}`))),
        h("div.tbl-scroll", { style: { maxHeight: "560px" } }, h("table.tbl",
          h("thead", h("tr", h("th", "Stock"), h("th", "Stage"), h("th", "Weeks"), h("th", "Action"), h("th", "vs 30-wk MA"), h("th", "MA slope 6w"), h("th", "26-wk ret"), h("th", "Vol 4w/26w"))),
          h("tbody", rows.map((r) => h("tr.click", { onclick: () => navigate(`#/equities/${r.symbol}`), title: r.note },
            h("td", h("div.sym", r.symbol), h("div.sub", r.sector)),
            h("td", h("span.vbadge", { class: `S${r.stage}` }, `STAGE ${r.stage}`)),
            h("td.num", `${r.weeksInStage}w`),
            h("td", h("b", { class: r.stage === 2 ? "up-t" : r.stage === 4 ? "down-t" : "dim" }, r.action)),
            h("td", { class: pctCls(r.pctFromMa) }, fmtPct(r.pctFromMa, 1)),
            h("td", { class: pctCls(r.ma30SlopePct) }, fmtPct(r.ma30SlopePct, 1)),
            h("td", { class: pctCls(r.ret26wPct) }, fmtPct(r.ret26wPct, 1)),
            h("td.num", `${r.volRatio}×`)))))),
        h("div.disclaimer", { style: { margin: "0 18px 14px" } }, "Stan Weinstein's stage method: buy only Stage 2, avoid Stage 4, let the 30-week MA arbitrate. Click a stage card to filter.")));
    };
    paint();
    return wrap;
  }

  // ------------------------- breakouts & darvas -------------------------------
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
      table(data.approaching, "👀 Approaching the high — watchlist", "within 3% of the 52-week high", h("span.chip.gold", `${data.approaching.length} candidates`)));
  }

  async function darvasTab() {
    const rows = await api("/screeners/darvas");
    return h("div.card.flush",
      h("div.card-head", h("div", h("div.card-title", "📦 Darvas Box Consolidations"), h("div.card-sub", "tight ranges (≤9%) with volume expansion ≥1.25× — pre-breakout signature"))),
      rows.length ? h("div.tbl-scroll", h("table.tbl",
        h("thead", h("tr", h("th", "Stock"), h("th", "Status"), h("th", "Box top"), h("th", "Box bottom"), h("th", "Height"), h("th", "Bars"), h("th", "Vol ×"), h("th", "Entry"), h("th", "Stop"), h("th", "Target"))),
        h("tbody", rows.map((r) => h("tr.click", { onclick: () => navigate(`#/equities/${r.symbol}`) },
          h("td", h("div.sym", r.symbol), h("div.sub", r.name)),
          h("td", h("span.vbadge", { class: r.status }, r.status)),
          h("td.num", fmtNum(r.boxTop)), h("td.num", fmtNum(r.boxBottom)),
          h("td.num", `${r.boxHeightPct}%`), h("td.num", r.bars),
          h("td", h("b", { class: r.volumeX >= 1.5 ? "up-t" : "" }, `${r.volumeX}×`)),
          h("td.num", fmtNum(r.entry)), h("td.num.down-t", fmtNum(r.stop)), h("td.num.up-t", fmtNum(r.target)))))))
        : h("div.empty", "No tight boxes with volume expansion right now."));
  }

  // -------------------------------- stock page --------------------------------
  const R = (label, val, hint) => (val === null || val === undefined || Number.isNaN(val)) ? null :
    h("div.kv", { title: hint || "" }, h("span.dim", label), h("b", String(val)));

  async function stockPage(symbol) {
    const d = await api(`/equity/${encodeURIComponent(symbol)}`).catch(() => null);
    if (!d) return h("div.card", h("div.empty", `Unknown symbol "${symbol}"`));
    const { quote: qt, fundamentals: f, health, peers, swot, summary, profile, industry, policy, products, sectorCtx } = d;
    const rt = f.ratios;
    const rx = d.realExtras || null;
    const srcLabel = f.realSource ? f.realSource.sources.join(" + ") : null;

    const cc = candleChart({ height: 400 });
    let resolution = "1D", days = 260;
    const loadChart = async () => {
      const bars = (await api(`/market/history/${symbol}?resolution=${resolution}&days=${days}`)).bars;
      cc.setBars(bars);
      const sma = (n) => bars.map((b, i) => { if (i + 1 < n) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += bars[k].close; return { time: b.time, value: s / n }; }).filter(Boolean);
      if (resolution === "1D") { cc.addLine(sma(50), COLORS.GOLD); cc.addLine(sma(200), COLORS.VIOLET); }
    };
    const rangeBtns = h("div.range-btns",
      [["6M", "1D", 126], ["1Y", "1D", 260], ["3Y", "1D", 756], ["5Y", "1W", 1260], ["10Y", "1W", 2520]].map(([label, res, dd], i) =>
        h("button.rb", { class: i === 1 ? "active" : "", onclick: (e) => { resolution = res; days = dd; e.target.parentElement.querySelectorAll(".rb").forEach((b) => b.classList.toggle("active", b === e.target)); loadChart(); } }, label)));
    const chartCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", `${symbol} · NSE`), h("div.card-sub", "green/red candles · 50-DMA (amber) · 200-DMA (violet) · volume")), rangeBtns),
      cc.el);

    const priceEl = h("span", { style: { fontSize: "30px", fontWeight: 800 } }, fmtNum(qt.ltp));
    const chgEl = h("span", { class: pctCls(qt.changePct), style: { fontSize: "15px", fontWeight: 700 } }, `${fmtNum(qt.change)} (${fmtPct(qt.changePct)})`);
    const unsub = store.on("ticks", () => {
      const q2 = store.quotes.get(symbol);
      if (!q2) return;
      if (!document.body.contains(priceEl)) return unsub();
      priceEl.textContent = fmtNum(q2.ltp); chgEl.textContent = `${fmtNum(q2.change)} (${fmtPct(q2.changePct)})`; chgEl.className = pctCls(q2.changePct);
    });
    const header = h("div.card",
      h("div", { style: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" } },
        h("div",
          h("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } },
            h("div.page-title", profile.name), h("span.chip.blue", profile.sectorName),
            f.realSource ? h("span.chip.up", { title: `real filed fundamentals via ${srcLabel} · fetched ${f.realSource.asOf}` }, `REAL FUNDAMENTALS ✓ ${f.realSource.primary}`) : h("span.chip", "modelled data"),
            profile.sub ? h("span.chip.violet", profile.sub) : null,
            profile.fno ? h("span.chip", "F&O") : null,
            health ? h("span.chip" + (health.score >= 75 ? ".up" : health.score >= 55 ? ".gold" : ".down"), `Health ${health.score}/100`) : h("span.chip", "Basic coverage"),
            sectorCtx ? h("span.chip" + (sectorCtx.quadrant === "LEADING" ? ".up" : sectorCtx.quadrant === "LAGGING" ? ".down" : sectorCtx.quadrant === "IMPROVING" ? ".blue" : ".gold"), `Sector cycle: ${sectorCtx.quadrant}`) : null),
          h("div", { style: { display: "flex", gap: "12px", alignItems: "baseline", marginTop: "8px" } }, h("span.dim", "₹"), priceEl, chgEl),
          h("div.dim", { style: { fontSize: "12px", marginTop: "4px" } }, `Day ${fmtNum(qt.low)}–${fmtNum(qt.high)} · 52w ${fmtNum(qt.week52Low)}–${fmtNum(qt.week52High)} · Vol ${fmtVol(qt.volume)} · feed: ${qt.source}`)),
        h("div.grid.cols-3", { style: { gap: "8px", alignContent: "start" } },
          [["P/E", rt.pe + "×"], ["P/B", rt.pb + "×"], ["EV/EBITDA", rt.evEbitda ? rt.evEbitda + "×" : "—"],
           ["Mkt Cap", fmtMoney(rt.marketCap * 1e7)], ["Div Yield", rt.dividendYieldPct + "%"], ["ROE", f.annual.at(-1).roe + "%"]].map(([k, v]) =>
            h("div.stat", h("div.s-label", k), h("div.s-value", { style: { fontSize: "15px" } }, v))))));

    const isBank = rt.gnpaPct !== null && rt.gnpaPct !== undefined;
    const ratioCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🧮 Deep Ratios & Metrics"), h("div.card-sub", f.realSource ? `REAL filed data · ${srcLabel} · fetched ${f.realSource.asOf} · modelled values fill any gaps` : "modelled demo metrics · hover any row for its plain meaning"))),
      h("div.grid.cols-4", { style: { gap: "14px" } },
        h("div", h("label.lbl", "Valuation"),
          R("P/E", rt.pe + "×", "Price vs one year of profit"), R("PEG", rt.peg, "P/E ÷ profit growth — under 1 suggests growth is cheap"),
          R("EV/Sales", rt.evSales + "×"), R("Price/FCF", rt.priceToFcf ? rt.priceToFcf + "×" : null, "Price vs free cash flow"),
          R("Earnings yield", rt.earningsYieldPct + "%", "Inverse of P/E — compare with FD rates"), R("Book value/share", "₹" + fmtNum(rt.bookValuePerShare))),
        h("div", h("label.lbl", "Profitability"),
          R("ROE", f.annual.at(-1).roe + "%", "Profit per rupee of shareholder capital"), R("ROCE", f.annual.at(-1).roce ? f.annual.at(-1).roce + "%" : null),
          R("ROA", rt.roa + "%"), R("Gross margin", rt.grossMarginPct ? rt.grossMarginPct + "%" : null),
          R("Operating margin", rt.opMarginPct ? rt.opMarginPct + "%" : null), R("Dividend payout", rt.dividendPayoutPct + "%", "Share of profit returned as dividends")),
        h("div", h("label.lbl", isBank ? "Asset quality (bank)" : "Balance sheet"),
          isBank ? R("Gross NPA", rt.gnpaPct + "%", "Bad loans before provisioning — lower is better") : R("Current ratio", rt.currentRatio, "Short-term assets ÷ short-term liabilities"),
          isBank ? R("Net NPA", rt.nnpaPct + "%") : R("Quick ratio", rt.quickRatio),
          isBank ? R("CASA", rt.casaPct ? rt.casaPct + "%" : null, "Low-cost deposit share — funding moat") : R("Interest coverage", rt.interestCoverage ? rt.interestCoverage + "×" : null, "EBIT ÷ interest — higher is safer"),
          isBank ? R("Cost-to-income", rt.costToIncomePct + "%") : R("Net debt/EBITDA", rt.netDebtEbitda !== null ? rt.netDebtEbitda + "×" : null, "Years of EBITDA to repay debt"),
          R("D/E", f.annual.at(-1).debtToEquity !== null ? f.annual.at(-1).debtToEquity + "×" : null), R("Promoter holding", rt.promoterHoldingPct + "%", "Founders' skin in the game")),
        h("div", h("label.lbl", "Growth & efficiency"),
          R("Revenue CAGR 3Y", rt.revCagr3Pct + "%"), R("PAT CAGR 3Y", rt.patCagr3Pct + "%"),
          R("Asset turnover", rt.assetTurnover ? rt.assetTurnover + "×" : null, "Sales per rupee of assets"),
          R("Working-capital days", rt.workingCapitalDays !== null && rt.workingCapitalDays !== undefined ? rt.workingCapitalDays + "d" : null, "Days cash stays stuck in operations"),
          R("EPS (FY26)", "₹" + f.annual.at(-1).eps), R("FCF (FY26)", f.annual.at(-1).fcf ? "₹" + fmtNum(f.annual.at(-1).fcf, 0) + " Cr" : null))),
      h("div.disclaimer", f.realSource
        ? `Ratios sourced from real filed company data via ${srcLabel}; any metric the source does not publish falls back to a modelled value. Figures are for research, not a recommendation to buy or sell.`
        : "Modelled figures on the demo feed. Real filed fundamentals load automatically per symbol once an Upstox access token is connected (Upstox Company Fundamentals API), with Yahoo Finance as backup."));

    const industryCard = industry ? h("div.card",
      h("div.card-head",
        h("div", h("div.card-title", `🏭 Industry Pulse — ${industry.sectorName}`), h("div.card-sub", industry.asOf)),
        industry.live ? h("div.pill-row",
          h("span.chip" + (industry.live.quadrant === "LEADING" ? ".up" : industry.live.quadrant === "LAGGING" ? ".down" : industry.live.quadrant === "IMPROVING" ? ".blue" : ".gold"), `Cycle: ${industry.live.quadrant}`),
          h("span.chip" + (industry.live.m3 >= 0 ? ".up" : ".down"), `3M ${fmtPct(industry.live.m3)}`),
          h("span.chip" + (industry.live.y1 >= 0 ? ".up" : ".down"), `1Y ${fmtPct(industry.live.y1)}`),
          h("span.chip", `${industry.live.breadthPct}% > 50-DMA`)) : null),
      h("p", { style: { color: "var(--text2)", fontSize: "13.5px", lineHeight: 1.7, marginBottom: "12px" } }, industry.outlook),
      h("div.grid.cols-2", { style: { gap: "12px" } },
        h("div", h("label.lbl", "Tailwinds"), h("ul", { style: { paddingLeft: "16px", display: "grid", gap: "5px" } }, industry.drivers.map((x) => h("li", { style: { fontSize: "12.5px", color: "var(--text2)" } }, x)))),
        h("div", h("label.lbl", "Headwinds"), h("ul", { style: { paddingLeft: "16px", display: "grid", gap: "5px" } }, industry.risks.map((x) => h("li", { style: { fontSize: "12.5px", color: "var(--text2)" } }, x)))))) : null;

    const policyCard = policy ? h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🏛️ Government Support & Budget"), h("div.card-sub", `${policy.sectorName} · schemes + Union Budget provisions`))),
      h("label.lbl", "Active schemes & policy support"),
      policy.schemes.map(([name, detail]) => h("div", { style: { padding: "8px 0", borderBottom: "1px dashed var(--border)" } },
        h("b", { style: { fontSize: "13px" } }, name), h("div.dim", { style: { fontSize: "12px", marginTop: "2px" } }, detail))),
      h("label.lbl", { style: { marginTop: "14px" } }, "Budget provisions"),
      policy.budget.map(([yr, detail]) => h("div", { style: { padding: "8px 0", borderBottom: "1px dashed var(--border)" } },
        h("span.chip.blue", yr), h("div.dim", { style: { fontSize: "12.5px", marginTop: "4px" } }, detail))),
      h("div.disclaimer", policy.disclaimer)) : null;

    const productsCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "⭐ Hero Products & Market Position"), h("div.card-sub", products.curated ? "flagship products · indicative market share" : "coverage note"))),
      products.items.length ? h("div.grid", { style: { gap: "10px" } }, products.items.map((p) => h("div", { style: { border: "1px solid var(--border)", background: "var(--surface)", padding: "13px 15px" } },
        h("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" } },
          h("b", { style: { fontSize: "14px" } }, p.name), h("span.chip.up", p.share)),
        h("div.dim", { style: { fontSize: "12.5px", marginTop: "5px" } }, p.note))))
        : h("div.empty", products.note),
      products.curated ? h("div.disclaimer", "Market-share figures are indicative public estimates — verify with company filings.") : null);

    const aiCard = summary ? h("div.card",
      h("div.card-head", h("div", h("div.card-title", "✨ AI Executive Summary"), h("div.card-sub", "grounded in platform fundamentals")),
        summary.generator && summary.generator.startsWith("aimlapi") ? h("span.chip.up", `✨ written by ${summary.generator.split(":")[1]}`) : h("span.chip.violet", "grounded composer")),
      summary.paragraphs.map((p) => h("p", { style: { fontSize: "13.5px", color: "var(--text2)", marginBottom: "10px", lineHeight: 1.65 } }, p)),
      summary.disclaimer ? h("div.disclaimer", summary.disclaimer) : null) : null;

    const healthCard = health ? h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🩺 Financial Health"), h("div.card-sub", `composite ${health.score}/100 · ${health.grade}`))),
      hbars(health.pillars.map((p) => ({ label: p.name, value: p.score, display: `${p.score}/100`, color: p.score >= 70 ? COLORS.UP : p.score >= 45 ? COLORS.GOLD : COLORS.DOWN, note: p.note })), { max: 100 })) : null;

    let finCard = null;
    if (f.annual && f.statements) {
      const st = f.statements;
      const YEARS = 5;
      // generic line-item renderer: rows down, last N fiscal years across
      const stmtTable = (data, rowSpecs) => {
        const cols = data.slice(-YEARS);
        const headRow = h("tr", h("th", "₹ Cr"), cols.map((c) => h("th", { style: { textAlign: "right" } }, c.fy)));
        const bodyRows = rowSpecs.filter((r) => cols.some((c) => c[r.k] !== undefined && c[r.k] !== null)).map((r) => h("tr",
          h("td", { style: r.strong ? { fontWeight: 750 } : {} }, r.label),
          cols.map((c) => {
            const v = c[r.k];
            const disp = v === undefined || v === null ? "—" : r.k === "eps" ? "₹" + fmtNum(v) : fmtNum(v, 0);
            return h("td.num", { style: { textAlign: "right", fontWeight: r.strong ? 700 : 400, borderTop: r.strong ? "1px solid var(--border2)" : "" }, class: r.signed && v < 0 ? "down-t" : r.signed && v > 0 ? "up-t" : "" }, r.signed && v > 0 ? "+" + disp : disp);
          })));
        return h("div.tbl-scroll", h("table.tbl", h("thead", headRow), h("tbody", bodyRows)));
      };

      const PNL_ROWS = st.bankFormat
        ? [{ k: "interestEarned", label: "Interest earned" }, { k: "interestExpended", label: "Interest expended" }, { k: "nii", label: "Net interest income", strong: true }, { k: "otherIncome", label: "Other income" }, { k: "operatingExpenses", label: "Operating expenses" }, { k: "prePpop", label: "Pre-provision profit", strong: true }, { k: "provisions", label: "Provisions" }, { k: "pbt", label: "Profit before tax", strong: true }, { k: "tax", label: "Tax" }, { k: "pat", label: "Net profit (PAT)", strong: true }, { k: "eps", label: "EPS" }]
        : [{ k: "revenue", label: "Revenue" }, { k: "otherIncome", label: "Other income" }, { k: "materials", label: "Material costs" }, { k: "employee", label: "Employee costs" }, { k: "otherExpenses", label: "Other expenses" }, { k: "ebitda", label: "EBITDA", strong: true }, { k: "depreciation", label: "Depreciation" }, { k: "ebit", label: "EBIT", strong: true }, { k: "interest", label: "Interest" }, { k: "pbt", label: "Profit before tax", strong: true }, { k: "tax", label: "Tax" }, { k: "pat", label: "Net profit (PAT)", strong: true }, { k: "eps", label: "EPS" }];

      const BS_ROWS = st.bankFormat
        ? [{ k: "shareCapital", label: "Share capital" }, { k: "reservesSurplus", label: "Reserves & surplus" }, { k: "netWorth", label: "Net worth", strong: true }, { k: "deposits", label: "Deposits" }, { k: "borrowings", label: "Borrowings" }, { k: "otherLiabilities", label: "Other liabilities" }, { k: "totalLiabilities", label: "TOTAL LIABILITIES", strong: true }, { k: "cashWithRBI", label: "Cash & RBI balances" }, { k: "investments", label: "Investments" }, { k: "advances", label: "Advances (loans)" }, { k: "fixedAndOther", label: "Fixed & other assets" }, { k: "totalAssets", label: "TOTAL ASSETS", strong: true }]
        : [{ k: "shareCapital", label: "Share capital" }, { k: "reservesSurplus", label: "Reserves & surplus" }, { k: "netWorth", label: "Net worth", strong: true }, { k: "totalDebt", label: "Total debt" }, { k: "otherLiabilities", label: "Other liabilities" }, { k: "totalLiabilities", label: "TOTAL LIABILITIES", strong: true }, { k: "netFixedAssets", label: "Net fixed assets" }, { k: "cwip", label: "Capital WIP" }, { k: "investments", label: "Investments" }, { k: "inventory", label: "Inventory" }, { k: "receivables", label: "Receivables" }, { k: "cashAndBank", label: "Cash & bank" }, { k: "otherAssets", label: "Other assets" }, { k: "totalAssets", label: "TOTAL ASSETS", strong: true }];

      const CF_ROWS = st.bankFormat
        ? [{ k: "cfo", label: "Operating cash flow", strong: true, signed: true }, { k: "cfi", label: "Investing cash flow", signed: true }, { k: "cff", label: "Financing cash flow", signed: true }, { k: "netChange", label: "Net change in cash", strong: true, signed: true }, { k: "closingCash", label: "Closing cash & RBI" }]
        : [{ k: "cfo", label: "Operating cash flow", strong: true, signed: true }, { k: "capex", label: "Capex", signed: true }, { k: "cfi", label: "Investing cash flow", signed: true }, { k: "dividendsPaid", label: "Dividends paid", signed: true }, { k: "debtChange", label: "Debt raised / (repaid)", signed: true }, { k: "cff", label: "Financing cash flow", signed: true }, { k: "netChange", label: "Net change in cash", strong: true, signed: true }, { k: "closingCash", label: "Closing cash" }, { k: "fcf", label: "Free cash flow (CFO − capex)", strong: true, signed: true }];

      let mode = "pnl";
      const finBody = h("div");
      const paintFin = () => {
        finBody.innerHTML = "";
        if (mode === "pnl") finBody.appendChild(stmtTable(st.pnl, PNL_ROWS));
        else if (mode === "bs") finBody.appendChild(stmtTable(st.balanceSheet, BS_ROWS));
        else if (mode === "cf") finBody.appendChild(stmtTable(st.cashFlow, CF_ROWS));
        else {
          const rows = f.quarters.map((qr) => h("tr",
            h("td", h("b", qr.q)), h("td.num", { style: { textAlign: "right" } }, fmtNum(qr.revenue, 0)),
            h("td.num", { style: { textAlign: "right" } }, fmtNum(qr.pat, 0)), h("td.num", { style: { textAlign: "right" } }, `${qr.patMarginPct}%`)));
          finBody.appendChild(h("div.tbl-scroll", h("table.tbl", h("thead", h("tr", h("th", "Quarter"), h("th", { style: { textAlign: "right" } }, "Revenue ₹Cr"), h("th", { style: { textAlign: "right" } }, "PAT ₹Cr"), h("th", { style: { textAlign: "right" } }, "PAT margin"))), h("tbody", rows))));
        }
        finBody.appendChild(h("div.disclaimer", { style: { margin: "10px 18px 14px" } }, st.note));
      };
      paintFin();
      finCard = h("div.card.flush",
        h("div.card-head", h("div", h("div.card-title", "📊 Financial Statements"), h("div.card-sub", `P&L · balance sheet · cash flow — last ${YEARS} FYs (₹ crore)`)),
          h("div.tabs", [["pnl", "P&L"], ["bs", "Balance Sheet"], ["cf", "Cash Flow"], ["q", "Quarterly"]].map(([id, l], i) =>
            h("button.tab", { class: i === 0 ? "active" : "", onclick: (e) => { mode = id; e.target.parentElement.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === e.target)); paintFin(); } }, l)))),
        finBody);
    }

    // ---- sector valuation scorecard ----
    const valuation = d.valuation;
    const valuationCard = valuation ? h("div.card",
      h("div.card-head",
        h("div", h("div.card-title", `🎯 How ${valuation.sectorName} Is Valued — and Where ${symbol} Stands`),
          h("div.card-sub", valuation.real ? `company vs the published sector benchmark · real data` : `sector playbook metrics vs ${valuation.peerCount}-stock sector median`)),
        valuation.real ? h("span.chip.up", "REAL SECTOR BENCHMARK ✓") : null),
      h("p", { style: { color: "var(--text2)", fontSize: "13px", lineHeight: 1.7, marginBottom: "14px" } }, valuation.intro),
      h("div.tbl-scroll", h("table.tbl",
        h("thead", h("tr", h("th", "Metric"), h("th", "Why it matters here"), h("th", { style: { textAlign: "right" } }, symbol), h("th", { style: { textAlign: "right" } }, valuation.real ? "Sector" : "Sector median"), h("th", "Standing"))),
        h("tbody", valuation.rows.map((r) => h("tr",
          h("td", h("b", r.label), h("div.sub", r.kind.toUpperCase())),
          h("td", { style: { whiteSpace: "normal", maxWidth: "300px", fontSize: "12px", color: "var(--text2)" } }, r.why),
          h("td.num", { style: { textAlign: "right", fontWeight: 700 } }, fmtNum(r.value)),
          h("td.num", { style: { textAlign: "right" } }, fmtNum(r.median)),
          h("td", h("span.chip" + (Math.abs(r.diffPct) < 5 ? "" : r.good ? ".up" : ".down"), r.verdict))))))),
      valuation.summary ? h("div", { style: { marginTop: "14px", padding: "12px 15px", background: "var(--blue-bg)", borderLeft: "3px solid var(--blue)", fontSize: "13px", lineHeight: 1.65, color: "var(--text2)" } },
        h("b", { style: { color: "var(--text)" } }, "Verdict: "), valuation.summary) : null) : null;

    // ---- shareholding pattern (real, quarterly) ----
    let holdingsCard = null;
    if (rx && rx.holdings && rx.holdings.rows.length) {
      const hd = rx.holdings;
      const cols = hd.periods.slice(0, 5);
      const delta = (r) => (r.values[0] === null || r.values[1] === null ? null : Math.round((r.values[0] - r.values[1]) * 100) / 100);
      const bodyRows = hd.rows.map((r) => {
        const dv = delta(r);
        const cells = cols.map((p, i) => h("td.num", { style: { textAlign: "right", fontWeight: i === 0 ? 700 : 400 } }, r.values[i] === null || r.values[i] === undefined ? "—" : r.values[i] + "%"));
        const trend = dv === null ? h("td", "—") : h("td", h("span.chip" + (dv > 0 ? ".up" : dv < 0 ? ".down" : ""), (dv > 0 ? "▲ +" : dv < 0 ? "▼ " : "") + dv + " pp"));
        return h("tr", h("td", h("b", r.label)), ...cells, trend);
      });
      const pr = hd.latest.promoters, prPrev = hd.prev.promoters;
      const fii = hd.latest.fii, fiiPrev = hd.prev.fii;
      const bits = [];
      if (pr !== null && pr !== undefined) bits.push(`Promoters — the founding owners — hold ${pr}% of the company${prPrev != null ? (pr > prPrev ? ", and they bought more this quarter, usually a sign of confidence" : pr < prPrev ? ", and they trimmed their stake this quarter, which is worth understanding before you invest" : ", unchanged from last quarter") : ""}.`);
      if (fii !== null && fii !== undefined) bits.push(`Foreign investors hold ${fii}%${fiiPrev != null ? (fii > fiiPrev ? " and were buyers" : fii < fiiPrev ? " and were sellers" : " and stayed put") : ""} last quarter.`);
      if (hd.latest.mutual_funds != null) bits.push(`Indian mutual funds — the money of ordinary SIP investors — hold ${hd.latest.mutual_funds}%.`);
      holdingsCard = h("div.card.flush",
        h("div.card-head",
          h("div", h("div.card-title", "👥 Who Owns This Company"), h("div.card-sub", `shareholding pattern filed with the exchange · latest ${hd.periods[0]}`)),
          h("span.chip.up", "REAL ✓")),
        h("div.tbl-scroll", h("table.tbl",
          h("thead", h("tr", h("th", "Holder"), ...cols.map((p) => h("th", { style: { textAlign: "right" } }, p)), h("th", "QoQ"))),
          h("tbody", bodyRows))),
        h("div.disclaimer", bits.join(" ")));
    }

    // ---- corporate actions (real) ----
    let actionsCard = null;
    if (rx && rx.corporateActions && rx.corporateActions.length) {
      const ICON = { dividend: "💰", bonus: "🎁", split: "✂️", rights: "📜" };
      const items = rx.corporateActions.map((a) => {
        const kind = String(a.type || "").toLowerCase();
        const icon = Object.keys(ICON).find((k) => kind.includes(k));
        return h("tr",
          h("td", h("b", `${icon ? ICON[icon] + " " : ""}${String(a.type || "action").replace(/_/g, " ")}`)),
          h("td", a.date || "—"),
          h("td", { style: { whiteSpace: "normal", color: "var(--text2)" } }, a.detail === null || a.detail === undefined ? "—" : String(a.detail)));
      });
      actionsCard = h("div.card.flush",
        h("div.card-head",
          h("div", h("div.card-title", "📅 Corporate Actions"), h("div.card-sub", "dividends, bonus issues, splits and rights — as declared")),
          h("span.chip.up", "REAL ✓")),
        h("div.tbl-scroll", { style: { maxHeight: "300px" } }, h("table.tbl",
          h("thead", h("tr", h("th", "Action"), h("th", "Ex-date"), h("th", "Details"))),
          h("tbody", items))),
        h("div.disclaimer", "The ex-date is the cut-off: you must already own the share before that date to receive the dividend or bonus."));
    }

    // ---- competitors named by the exchange data feed (real) ----
    let rivalsCard = null;
    if (rx && rx.competitors && rx.competitors.length) {
      const rows = rx.competitors.map((c) => h("tr",
        h("td", h("div.sym", c.name)),
        h("td.num", c.marketCap === null || c.marketCap === undefined ? "—" : fmtNum(c.marketCap, 0)),
        h("td.num", c.pe === null || c.pe === undefined ? "—" : c.pe)));
      rivalsCard = h("div.card.flush",
        h("div.card-head",
          h("div", h("div.card-title", "⚔️ Who It Competes With"), h("div.card-sub", "rival companies in the same business")),
          h("span.chip.up", "REAL ✓")),
        h("div.tbl-scroll", { style: { maxHeight: "300px" } }, h("table.tbl",
          h("thead", h("tr", h("th", "Company"), h("th", "MCap ₹Cr"), h("th", "P/E"))),
          h("tbody", rows))));
    }

    const peersCard = peers ? h("div.card.flush",
      h("div.card-head", h("div", h("div.card-title", `🏭 ${peers.sectorName} peers`), h("div.card-sub", `medians — P/E ${peers.medians.pe}× · P/B ${peers.medians.pb}× · ROE ${peers.medians.roe}%`))),
      h("div.tbl-scroll", { style: { maxHeight: "330px" } }, h("table.tbl",
        h("thead", h("tr", h("th", "Company"), h("th", "MCap ₹Cr"), h("th", "P/E"), h("th", "P/B"), h("th", "EV/EBITDA"), h("th", "ROE"), h("th", "Growth"), h("th", "D/E"))),
        h("tbody", peers.peers.map((p) => h("tr.click", { style: p.self ? { background: "var(--blue-bg)" } : {}, onclick: () => !p.self && navigate(`#/equities/${p.symbol}`) },
          h("td", h("div.sym", p.name), p.self ? h("div.sub", "— this company") : null),
          h("td.num", fmtNum(p.mcap, 0)), h("td.num", p.pe), h("td.num", p.pb), h("td.num", p.evEbitda ?? "—"),
          h("td.num", p.roe), h("td", { class: pctCls(p.revGrowthPct) }, fmtPct(p.revGrowthPct, 1)), h("td.num", p.debtToEquity ?? "—"))))))) : null;

    const swotCard = swot ? h("div.card",
      h("div.card-head", h("div", h("div.card-title", "⚖️ Automated SWOT"), h("div.card-sub", "regenerates with every fundamental update")), h("span.chip.violet", "AI")),
      h("div.swot-grid",
        h("div.swot-cell.swot-S", h("h4", "Strengths"), h("ul", swot.strengths.map((s) => h("li", s)))),
        h("div.swot-cell.swot-W", h("h4", "Weaknesses"), h("ul", swot.weaknesses.map((s) => h("li", s)))),
        h("div.swot-cell.swot-O", h("h4", "Opportunities"), h("ul", swot.opportunities.map((s) => h("li", s)))),
        h("div.swot-cell.swot-T", h("h4", "Threats"), h("ul", swot.threats.map((s) => h("li", s)))))) : null;

    queueMicrotask(loadChart);
    return h("div",
      h("div.page-head",
        h("div.pill-row",
          h("button.btn.sm", { onclick: () => navigate("#/equities/screeners/cyclical") }, "← Screeners"),
          h("button.btn.sm", { onclick: () => window.Views.assistant.open(`Analysis of ${symbol}`) }, "💬 Ask AI about " + symbol))),
      h("div.grid", { style: { gap: "16px" } },
        header,
        h("div.grid.cols-32", chartCard, aiCard || productsCard),
        ratioCard,
        valuationCard,
        finCard ? h("div.grid.cols-32", finCard, healthCard) : null,
        holdingsCard,
        (actionsCard || rivalsCard) ? h("div.grid.cols-2", actionsCard, rivalsCard) : null,
        (industryCard || policyCard) ? h("div.grid.cols-2", industryCard, policyCard) : null,
        aiCard ? productsCard : null,
        (peersCard || swotCard) ? h("div.grid.cols-2", peersCard, swotCard) : null));
  }

  window.Views = window.Views || {};
  window.Views.equities = render;
})();
