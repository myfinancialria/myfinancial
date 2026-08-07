/* ===========================================================================
   funds.js — Module 2: Direct MF screener, fund deep-dive (NAV vs benchmark,
   rolling returns, SIP backtester), robo-advisory questionnaire → portfolio.
   =========================================================================== */
(() => {
  "use strict";
  const { h, api, del, store, fmtMoney, fmtNum, fmtPct, pctCls, stars, toast, navigate, debounce } = window.MF;
  const { lineChart, donut, radar, COLORS } = window.MFC;

  async function render(rest) {
    if (rest?.[0] === "robo") return robo();
    if (rest?.[0] === "live") return liveUniverse();
    if (rest?.[0] === "baskets") return basketsView();
    if (rest?.[0] && rest[0].startsWith("MF")) return detail(rest[0]);
    return screener();
  }

  const fundTabs = (active) => h("div.tabs", { style: { marginBottom: "16px" } },
    [["", "Curated Screener"], ["live", "🇮🇳 All-India Live (AMFI)"], ["baskets", "🧺 Goal Baskets"], ["robo", "🤖 Robo-Advisory"]].map(([id, label]) =>
      h("button.tab", { class: id === active ? "active" : "", onclick: () => navigate(`#/funds${id ? "/" + id : ""}`) }, label)));

  // ---------------------- All-India live universe (AMFI) ---------------------
  async function liveUniverse() {
    const buckets = await api("/mflive/buckets");
    const state = { q: "", bucket: "", assetClass: "", minStars: 0, sort: "r3", dir: "desc" };
    const info = h("span.chip.blue", "loading…");
    const tblWrap = h("div.tbl-scroll", { style: { maxHeight: "600px" } });

    const load = debounce(async () => {
      tblWrap.innerHTML = "";
      tblWrap.appendChild(h("div.skeleton", { style: { height: "300px" } }));
      try {
        const data = await api(`/mflive/screen?q=${encodeURIComponent(state.q)}&bucket=${state.bucket}&assetClass=${state.assetClass}&minStars=${state.minStars}&sort=${state.sort}&dir=${state.dir}&limit=150`);
        info.textContent = `${data.total.toLocaleString("en-IN")} Direct-Growth schemes · NAV date ${data.navDate}`;
        tblWrap.innerHTML = "";
        const sortTh = (key, label) => h("th.sortable", { onclick: () => { state.dir = state.sort === key && state.dir === "desc" ? "asc" : "desc"; state.sort = key; load(); } },
          `${label} ${state.sort === key ? (state.dir === "desc" ? "▼" : "▲") : ""}`);
        tblWrap.appendChild(h("table.tbl",
          h("thead", h("tr", h("th", "Scheme"), h("th", "Category"), h("th", "Rating"), sortTh("nav", "NAV"), sortTh("r1", "1Y"), sortTh("r3", "3Y"), sortTh("r5", "5Y"), sortTh("vol", "Volatility"))),
          h("tbody", data.funds.map((f) => h("tr.click", { onclick: () => liveSchemeModal(f) },
            h("td", { style: { whiteSpace: "normal", maxWidth: "380px" } }, h("div.sym", f.name.replace(/ - Direct.*$/i, "")), h("div.sub", `${f.amc} · code ${f.code}`)),
            h("td", h("span.chip", f.category)),
            h("td", f.stars ? stars(f.stars) : h("span.dim", "—")),
            h("td.num", fmtNum(f.nav)),
            h("td", { class: pctCls(f.r1) }, f.r1 === null ? h("span.dim", "…") : fmtPct(f.r1, 1, false)),
            h("td", { class: pctCls(f.r3) }, f.r3 === null ? h("span.dim", "…") : fmtPct(f.r3, 1, false)),
            h("td", { class: pctCls(f.r5) }, f.r5 === null ? h("span.dim", "…") : fmtPct(f.r5, 1, false)),
            h("td.num", f.vol === null ? "—" : `${f.vol}%`))))));
      } catch (e) {
        tblWrap.innerHTML = "";
        tblWrap.appendChild(h("div.empty", `Live AMFI feed unreachable (${e.message}). The curated screener keeps working offline — retry when online.`));
        info.textContent = "offline";
      }
    }, 250);

    const filters = h("div.card",
      h("div", { style: { display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr 1fr", gap: "10px", alignItems: "end" } },
        h("div", h("label.lbl", "Search scheme / AMC"), h("input.inp", { placeholder: "e.g. Parag Parikh, HDFC…", oninput: (e) => { state.q = e.target.value; load(); } })),
        h("div", h("label.lbl", "Category"), h("select.ctl", { style: { width: "100%" }, onchange: (e) => { state.bucket = e.target.value; load(); } },
          h("option", { value: "" }, "All categories"), buckets.map((b) => h("option", { value: b.key }, b.label)))),
        h("div", h("label.lbl", "Asset class"), h("select.ctl", { style: { width: "100%" }, onchange: (e) => { state.assetClass = e.target.value; load(); } },
          ["", "equity", "hybrid", "debt", "gold"].map((a) => h("option", { value: a }, a || "All")))),
        h("div", h("label.lbl", "Min rating"), h("select.ctl", { style: { width: "100%" }, onchange: (e) => { state.minStars = +e.target.value; load(); } },
          ["0", "3", "4", "5"].map((r) => h("option", { value: r }, r === "0" ? "Any" : `${r}★+`))))));

    load();
    return h("div",
      h("div.page-head",
        h("div", h("div.page-title", "All-India Mutual Fund Universe"),
          h("div.page-sub", "Every Direct-Growth scheme from official AMFI NAVs · returns & volatility enriched live from mfapi.in · click any scheme for its NAV history")),
        info),
      fundTabs("live"),
      h("div.grid", { style: { gap: "16px" } }, filters, h("div.card.flush", tblWrap),
        h("div.disclaimer", { style: { border: "none" } }, "Data: AMFI NAVAll (official, free) + mfapi.in histories, cached server-side. Returns are trailing CAGR; “…” means enrichment is still fetching — reopen in a few seconds. Direct plans only. Not investment advice.")));
  }

  async function liveSchemeModal(f) {
    const chart = lineChart({ height: 300 });
    const statsRow = h("div.grid.cols-4", { style: { gap: "8px", marginBottom: "10px" } }, h("div.skeleton", { style: { height: "58px", gridColumn: "1 / -1" } }));
    window.MF.modal(f.name.replace(/ - Direct.*$/i, ""), h("div",
      h("div.dim", { style: { fontSize: "12px", marginBottom: "10px" } }, `${f.amc} · ${f.category} · AMFI code ${f.code} · Direct-Growth`),
      statsRow, chart.el,
      h("div.disclaimer", "Full NAV history from mfapi.in. Past performance does not guarantee future returns.")), { width: "860px" });
    try {
      const d = await api(`/mflive/scheme/${f.code}`);
      statsRow.innerHTML = "";
      const m = d.metrics || {};
      [["NAV", fmtNum(m.nav ?? f.nav)], ["1Y CAGR", m.r1 === null || m.r1 === undefined ? "—" : `${m.r1}%`], ["3Y CAGR", m.r3 === null || m.r3 === undefined ? "—" : `${m.r3}%`], ["5Y CAGR", m.r5 === null || m.r5 === undefined ? "—" : `${m.r5}%`]]
        .forEach(([k, v]) => statsRow.appendChild(h("div.stat", h("div.s-label", k), h("div.s-value", { style: { fontSize: "16px" } }, v))));
      chart.addSeries(d.navs.filter((x, i, arr) => i % Math.max(1, Math.floor(arr.length / 1200)) === 0), { color: COLORS.BLUE, title: "NAV" });
    } catch (e) { toast(`mfapi fetch failed: ${e.message}`, true); }
  }

  // --------------------------- goal baskets ----------------------------------
  async function basketsView() {
    const [list, goals] = await Promise.all([api("/baskets"), api("/goals")]);
    const wrap = h("div.grid", { style: { gap: "16px" } });

    // create-from-goal card
    const goalSel = h("select.ctl", goals.map((g) => h("option", { value: g.id }, `${g.icon || "🎯"} ${g.name} (${g.target_year})`)));
    const lumpsum = h("input.inp", { type: "number", value: 500000, min: 0 });
    const monthly = h("input.inp", { type: "number", value: 25000, min: 0 });
    const previewBox = h("div");
    const createCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🧺 Create a basket from a goal"),
        h("div.card-sub", "risk band + years-to-goal → allocation (glide-path capped) → top-ranked live AMFI funds per sleeve"))),
      goals.length ? h("div", { style: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "10px", alignItems: "end" } },
        h("div", h("label.lbl", "Goal"), goalSel),
        h("div", h("label.lbl", "Lumpsum now (₹)"), lumpsum),
        h("div", h("label.lbl", "Monthly SIP (₹)"), monthly),
        h("button.btn.primary", {
          onclick: async () => {
            previewBox.innerHTML = "";
            previewBox.appendChild(h("div.skeleton", { style: { height: "180px", marginTop: "12px" } }));
            const p = await api("/baskets/preview", { body: { goalId: goalSel.value } });
            previewBox.innerHTML = "";
            previewBox.appendChild(h("div", { style: { marginTop: "14px" } },
              h("div.pill-row", { style: { marginBottom: "10px" } },
                h("span.chip.violet", `Band: ${p.band}`), h("span.chip.blue", `${p.years} yrs → ${p.alloc.equity}/${p.alloc.debt}/${p.alloc.gold} E/D/G`),
                h("span.chip", `expected ~${fmtNum(p.expectedReturnPct, 1)}%/yr`)),
              h("table.tbl",
                h("thead", h("tr", h("th", "Sleeve"), h("th", "Fund"), h("th", "Source"), h("th", "3Y"), h("th", "Weight"))),
                h("tbody", p.proposal.map((x) => h("tr",
                  h("td", x.sleeve), h("td", { style: { whiteSpace: "normal" } }, h("div.sym", x.name.replace(/ - Direct.*$/i, ""))),
                  h("td", h("span.chip" + (x.source === "amfi-live" ? ".up" : ""), x.source === "amfi-live" ? "AMFI live" : "demo")),
                  h("td", { class: pctCls(x.r3) }, x.r3 === null ? "—" : fmtPct(x.r3, 1, false)),
                  h("td.num", `${x.targetWeight}%`))))),
              h("button.btn.green", { style: { marginTop: "12px" }, onclick: async () => {
                await api("/baskets/from-goal", { body: { goalId: goalSel.value, lumpsum: +lumpsum.value, monthly: +monthly.value } });
                toast("Basket created 🧺"); window.MF.dispatch();
              } }, `💾 Create basket with ${fmtMoney(+lumpsum.value)}`)));
          },
        }, "Preview")) : h("div.empty", "Add a goal under Planning → Goals first."),
      previewBox);
    wrap.appendChild(createCard);

    for (const b of list) wrap.appendChild(basketCard(b));
    if (!list.length) wrap.appendChild(h("div.card", h("div.empty", "No baskets yet — create one from a goal above. Baskets track drift against target weights and generate tax-aware rebalancing orders.")));

    return h("div",
      h("div.page-head",
        h("div", h("div.page-title", "Goal Baskets & Rebalancing"),
          h("div.page-sub", "replicates the myfinancial-advisor engine: SEBI-style band → glide-path allocation → live fund selection → drift-triggered, SIP-first rebalancing"))),
      fundTabs("baskets"), wrap);
  }

  function basketCard(b) {
    const rebBox = h("div");
    return h("div.card",
      h("div.card-head",
        h("div", h("div.card-title", `🧺 ${b.name}`),
          h("div.card-sub", `${b.band} · ${b.years} yrs · target ${b.alloc.equity}/${b.alloc.debt}/${b.alloc.gold} E/D/G · expected ~${fmtNum(b.expectedReturnPct, 1)}%/yr`)),
        h("div", { style: { textAlign: "right" } },
          h("div", { style: { fontWeight: 800, fontSize: "18px" } }, fmtMoney(b.value)),
          h("div", { class: pctCls(b.pnl), style: { fontSize: "12px" } }, `${b.pnl >= 0 ? "+" : ""}${fmtMoney(b.pnl)} (${fmtPct(b.pnlPct, 1)})`))),
      h("table.tbl",
        h("thead", h("tr", h("th", "Fund"), h("th", "Sleeve"), h("th", "Units"), h("th", "NAV"), h("th", "Value"), h("th", "Now vs Target"), h("th", "Drift"))),
        h("tbody", b.holdings.map((x2) => {
          const drift = Math.round((x2.currentWeight - x2.targetWeight) * 10) / 10;
          return h("tr",
            h("td", { style: { whiteSpace: "normal", maxWidth: "300px" } }, h("div.sym", x2.name.replace(/ - Direct.*$/i, "")), h("div.sub", x2.source === "amfi-live" ? "live NAV · AMFI" : "demo NAV")),
            h("td", h("span.chip", x2.sleeve.split("—")[0].trim())),
            h("td.num", fmtNum(x2.units)), h("td.num", fmtNum(x2.nav)), h("td.num", fmtMoney(x2.value)),
            h("td.num", `${x2.currentWeight}% / ${x2.targetWeight}%`),
            h("td", h("b", { class: Math.abs(drift) > 5 ? "down-t" : Math.abs(drift) > 2 ? "" : "up-t" }, `${drift > 0 ? "+" : ""}${drift}%`)));
        }))),
      h("div", { style: { display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" } },
        h("button.btn.primary.sm", {
          onclick: async () => {
            rebBox.innerHTML = "";
            rebBox.appendChild(h("div.skeleton", { style: { height: "140px", marginTop: "10px" } }));
            const plan = await api(`/baskets/${b.id}/rebalance`);
            rebBox.innerHTML = "";
            rebBox.appendChild(h("div", { style: { marginTop: "12px" } },
              h("div.card-sub", { style: { marginBottom: "8px" } }, plan.needsRebalance ? "REBALANCING ORDERS (threshold ±5%)" : "WITHIN TOLERANCE — NO ORDERS NEEDED"),
              plan.needsRebalance ? h("table.tbl",
                h("thead", h("tr", h("th", "Action"), h("th", "Fund"), h("th", "Drift"), h("th", "Amount"), h("th", "≈ Units"))),
                h("tbody", plan.orders.filter((o) => o.action !== "HOLD").map((o) => h("tr",
                  h("td", h("span.vbadge", { class: o.action === "BUY" ? "ACHIEVABLE" : o.action === "SELL" ? "UNREALISTIC" : "AT_RISK" }, o.action.replace("_", " "))),
                  h("td", { style: { whiteSpace: "normal", maxWidth: "280px" } }, o.name.replace(/ - Direct.*$/i, "")),
                  h("td", { class: o.driftPct > 0 ? "down-t" : "up-t" }, `${o.driftPct > 0 ? "+" : ""}${o.driftPct}%`),
                  h("td.num", fmtMoney(o.amount)), h("td.num", fmtNum(o.units)))))) : null,
              plan.notes.map((n) => h("div.dim", { style: { fontSize: "12px", marginTop: "6px" } }, "💡 ", n))));
          },
        }, "⚖️ Rebalancing plan"),
        h("button.btn.sm", {
          onclick: async () => {
            const amt = prompt("Invest additional amount (₹) at target weights:", "100000");
            if (!amt || !(+amt > 0)) return;
            await api(`/baskets/${b.id}/invest`, { body: { amount: +amt } });
            toast("Invested at target weights"); window.MF.dispatch();
          },
        }, "+ Invest"),
        h("button.btn.sm.danger", { style: { marginLeft: "auto" }, onclick: async () => { if (confirm("Delete this basket?")) { await del(`/baskets/${b.id}`); toast("Basket deleted"); window.MF.dispatch(); } } }, "Delete")),
      rebBox);
  }

  // ------------------------------- screener -----------------------------------
  async function screener() {
    const meta = await api("/funds/meta");
    const state = { q: "", category: "", amc: "", minAum: 0, maxEr: 99, minRating: 0, sort: "score", dir: "desc" };
    const tblWrap = h("div.tbl-scroll", { style: { maxHeight: "640px" } });

    const load = debounce(async () => {
      tblWrap.innerHTML = "";
      tblWrap.appendChild(h("div.skeleton", { style: { height: "300px" } }));
      const rows = await api(`/funds/screen?q=${encodeURIComponent(state.q)}&category=${state.category}&amc=${encodeURIComponent(state.amc)}&minAum=${state.minAum}&maxEr=${state.maxEr}&minRating=${state.minRating}&sort=${state.sort}&dir=${state.dir}`);
      tblWrap.innerHTML = "";
      const sortTh = (key, label) => h("th.sortable", { onclick: () => { state.dir = state.sort === key && state.dir === "desc" ? "asc" : "desc"; state.sort = key; load(); } },
        `${label} ${state.sort === key ? (state.dir === "desc" ? "▼" : "▲") : ""}`);
      tblWrap.appendChild(h("table.tbl",
        h("thead", h("tr",
          h("th", "Fund"), h("th", "Rating"), sortTh("r1", "1Y"), sortTh("r3", "3Y"), sortTh("r5", "5Y"),
          sortTh("sharpe", "Sharpe"), sortTh("alpha", "Alpha"), sortTh("sd", "SD"), h("th", "TE"), sortTh("er", "Expense"), sortTh("aum", "AUM"))),
        h("tbody", rows.map((f) => h("tr.click", { onclick: () => navigate(`#/funds/${f.code}`) },
          h("td", h("div.sym", f.name), h("div.sub", `${f.amc} · ${f.categoryName} · #${f.categoryRank}/${f.categoryCount} in category`)),
          h("td", stars(f.rating)),
          h("td", { class: pctCls(f.returns["1Y"]) }, fmtPct(f.returns["1Y"], 1, false)),
          h("td", { class: pctCls(f.returns["3Y"]) }, fmtPct(f.returns["3Y"], 1, false)),
          h("td", { class: pctCls(f.returns["5Y"]) }, fmtPct(f.returns["5Y"], 1, false)),
          h("td.num", fmtNum(f.sharpe)),
          h("td", { class: f.alpha === null ? "dim" : pctCls(f.alpha) }, f.alpha === null ? "—" : fmtPct(f.alpha, 1)),
          h("td.num", fmtNum(f.stdDev, 1)),
          h("td.num", f.trackingError === null ? "—" : fmtNum(f.trackingError, 1)),
          h("td.num", `${f.expenseRatio}%`),
          h("td.num", `₹${fmtNum(f.aum, 0)} Cr`))))));
      count.textContent = `${rows.length} direct schemes`;
    }, 200);

    const count = h("span.chip.blue", "…");
    const inp = (attrs, key, ev = "input") => h("input.inp", { ...attrs, [`on${ev}`]: (e) => { state[key] = e.target.value; load(); } });
    const filters = h("div.card",
      h("div", { style: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: "10px", alignItems: "end" } },
        h("div", h("label.lbl", "Search"), inp({ placeholder: "fund or AMC…" }, "q")),
        h("div", h("label.lbl", "Category"), h("select.ctl", { style: { width: "100%" }, onchange: (e) => { state.category = e.target.value; load(); } },
          h("option", { value: "" }, "All"), meta.categories.map((c) => h("option", { value: c.key }, c.name)))),
        h("div", h("label.lbl", "AMC"), h("select.ctl", { style: { width: "100%" }, onchange: (e) => { state.amc = e.target.value; load(); } },
          h("option", { value: "" }, "All"), meta.amcs.map((a) => h("option", a)))),
        h("div", h("label.lbl", "Min AUM (₹Cr)"), inp({ type: "number", placeholder: "0" }, "minAum", "change")),
        h("div", h("label.lbl", "Max expense %"), inp({ type: "number", step: "0.1", placeholder: "any" }, "maxEr", "change")),
        h("div", h("label.lbl", "Min rating"), h("select.ctl", { style: { width: "100%" }, onchange: (e) => { state.minRating = +e.target.value; load(); } },
          ["0", "3", "4", "5"].map((r) => h("option", { value: r }, r === "0" ? "Any" : `${r}★+`))))));

    load();
    return h("div",
      h("div.page-head",
        h("div", h("div.page-title", "Direct Mutual Funds"),
          h("div.page-sub", "Zero-commission direct plans · multi-factor ranks: Sharpe, Sortino, Jensen's alpha, rolling consistency, cost")),
        h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, count)),
      fundTabs(""),
      h("div.grid", { style: { gap: "16px" } }, filters, h("div.card.flush", tblWrap),
        h("div.disclaimer", { style: { border: "none" } }, "Rankings are model outputs on synthetic demo NAVs — methodology: 22% Sharpe · 18% Sortino · 20% alpha · 15% 3Y return · 10% rolling-min consistency · 10% cost · 5% tracking error, z-scored within category. Mutual fund investments are subject to market risks; read all scheme-related documents carefully.")));
  }

  // ------------------------------- detail -------------------------------------
  async function detail(code) {
    const [d, sipDefault] = await Promise.all([api(`/funds/${code}`), api(`/funds/${code}/sip?monthly=25000&years=5`)]);

    // NAV vs benchmark chart with range switching
    const chart = lineChart({ height: 330 });
    const ranges = { "1Y": 252, "3Y": 756, "5Y": 1260, "10Y": 2520 };
    let activeRange = "5Y";
    const paint = () => {
      chart.clear();
      const n = ranges[activeRange];
      chart.addSeries(d.navs.slice(-n), { color: COLORS.BLUE, title: "NAV" });
      if (d.bench) chart.addSeries(d.bench.slice(-n), { color: "#7a7a7a", title: d.benchName, fill: false });
    };
    const rangeBtns = h("div.range-btns", Object.keys(ranges).map((r) =>
      h("button.rb", { class: r === activeRange ? "active" : "", onclick: (e) => { activeRange = r; paint(); e.target.parentElement.querySelectorAll(".rb").forEach((b) => b.classList.toggle("active", b === e.target)); } }, r)));

    const navCard = h("div.card",
      h("div.card-head",
        h("div", h("div.card-title", `📈 NAV — ${fmtNum(d.nav)}`), h("div.card-sub", `vs ${d.benchName || "category median"} (rebased) · since ${d.inception}`)),
        rangeBtns),
      chart.el,
      h("div.legend-row", { style: { marginTop: "8px" } },
        h("span", h("span.legend-dot", { style: { background: COLORS.BLUE } }), d.name),
        d.bench ? h("span", h("span.legend-dot", { style: { background: "#7a7a7a" } }), `${d.benchName} TRI (rebased)`) : null));

    // rolling 3Y chart
    const roll = lineChart({ height: 200 });
    const rollCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🔁 Rolling 3Y CAGR"), h("div.card-sub", `avg ${fmtPct(d.rolling3YAvg, 1, false)} · worst window ${fmtPct(d.rolling3YMin, 1, false)}`))),
      roll.el);

    // SIP lab
    const sipM = h("input.inp", { type: "number", value: 25000, min: 500 });
    const sipY = h("select.ctl", ["3", "5", "10"].map((y) => h("option", { value: y, selected: y === "5" ? "" : null }, `${y} years`)));
    const sipOut = h("div");
    const sipChart = lineChart({ height: 210 });
    const paintSip = (s) => {
      sipOut.innerHTML = "";
      sipOut.appendChild(h("div.grid.cols-3", { style: { gap: "10px", margin: "12px 0" } },
        h("div.stat", h("div.s-label", "Invested"), h("div.s-value", fmtMoney(s.invested))),
        h("div.stat", h("div.s-label", "Value today"), h("div.s-value", fmtMoney(s.value))),
        h("div.stat", h("div.s-label", "XIRR"), h("div.s-value", { class: pctCls(s.xirrPct) }, fmtPct(s.xirrPct, 1)))));
      sipChart.clear();
      sipChart.addSeries(s.timeline.map((t) => ({ time: t.time, value: t.value })), { color: COLORS.UP, title: "Value" });
      sipChart.addSeries(s.timeline.map((t) => ({ time: t.time, value: t.invested })), { color: "#7a7a7a", title: "Invested", fill: false });
    };
    const sipCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🧮 SIP Backtester"), h("div.card-sub", "actual point-to-point accumulation on this NAV history"))),
      h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "end" } },
        h("div", h("label.lbl", "Monthly SIP"), sipM), h("div", h("label.lbl", "Period"), sipY),
        h("button.btn.primary", { onclick: async () => paintSip(await api(`/funds/${code}/sip?monthly=${sipM.value}&years=${sipY.value}`)) }, "Run")),
      sipOut, sipChart.el);

    // metrics + peers
    const m = d;
    const factCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "Factor profile"), h("div.card-sub", `#${m.categoryRank} of ${m.categoryCount} in ${m.categoryName}`)), stars(m.rating)),
      h("div", { style: { display: "flex", justifyContent: "center" } },
        radar([
          { axis: "Sharpe", value: Math.min(100, m.sharpe * 55) },
          { axis: "Sortino", value: Math.min(100, m.sortino * 40) },
          { axis: "Alpha", value: 50 + (m.alpha ?? 0) * 8 },
          { axis: "Consistency", value: 50 + (m.rolling3YMin ?? 0) * 2.4 },
          { axis: "Low Cost", value: 100 - m.expenseRatio * 55 },
          { axis: "Low Risk", value: 100 - m.stdDev * 3.2 },
        ], { size: 240 })),
      h("div.kv", h("span.dim", "Returns 1/3/5/10Y"), h("b", `${fmtNum(m.returns["1Y"], 1)} / ${fmtNum(m.returns["3Y"], 1)} / ${fmtNum(m.returns["5Y"], 1)} / ${fmtNum(m.returns["10Y"], 1)}%`)),
      h("div.kv", h("span.dim", "Sharpe / Sortino"), h("b", `${m.sharpe} / ${m.sortino}`)),
      h("div.kv", h("span.dim", "Alpha / Beta"), h("b", `${m.alpha ?? "—"}% / ${m.beta ?? "—"}`)),
      h("div.kv", h("span.dim", "Std Dev / Tracking error"), h("b", `${m.stdDev}% / ${m.trackingError ?? "—"}%`)),
      h("div.kv", h("span.dim", "Max drawdown (3Y)"), h("b.down-t", `−${m.maxDrawdown}%`)),
      h("div.kv", h("span.dim", "Expense (direct)"), h("b", `${m.expenseRatio}%`)),
      h("div.kv", h("span.dim", "AUM"), h("b", `₹${fmtNum(m.aum, 0)} Cr`)));

    const peersCard = h("div.card.flush",
      h("div.card-head", h("div", h("div.card-title", "Category peers"), h("div.card-sub", m.categoryName))),
      h("div.tbl-scroll", { style: { maxHeight: "260px" } }, h("table.tbl",
        h("thead", h("tr", h("th", "Fund"), h("th", "Rating"), h("th", "3Y"), h("th", "Sharpe"), h("th", "ER"))),
        h("tbody", d.peers.sort((a, b) => b.score - a.score).map((p) => h("tr.click", { onclick: () => navigate(`#/funds/${p.code}`) },
          h("td", h("div.sym", { style: p.code === code ? { color: "var(--blue)" } : {} }, p.name)),
          h("td", stars(p.rating)), h("td", { class: pctCls(p.returns["3Y"]) }, fmtPct(p.returns["3Y"], 1, false)),
          h("td.num", fmtNum(p.sharpe)), h("td.num", `${p.expenseRatio}%`)))))));

    queueMicrotask(() => {
      paint();
      roll.addSeries(d.rolling3Y.map((r) => ({ time: r.time, value: r.cagr })), { color: COLORS.VIOLET, title: "3Y CAGR %" });
      paintSip(sipDefault);
    });

    const plainCard = d.plainEnglish ? h("div.card", { style: { borderLeft: "3px solid var(--blue)" } },
      h("div.card-title", { style: { marginBottom: "8px" } }, "🗣️ In plain words"),
      h("div.dim", { style: { fontSize: "13.5px", lineHeight: 1.7 } }, d.plainEnglish)) : null;

    return h("div",
      h("div.page-head",
        h("div",
          h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, h("div.page-title", d.name), stars(d.rating)),
          h("div.page-sub", `${d.amc} · ${d.categoryName} · Direct — Growth · Benchmark ${d.benchName || "—"}`)),
        h("button.btn", { onclick: () => navigate("#/funds") }, "← All funds")),
      h("div.grid", { style: { gap: "16px" } },
        plainCard,
        h("div.grid.cols-32", navCard, factCard),
        h("div.grid.cols-3", rollCard, sipCard, peersCard),
        h("div.disclaimer", { style: { border: "none" } }, "Direct plan — no distributor commission. NAVs are synthetic demo data; metrics recompute from the series. Not investment advice.")));
  }

  // -------------------------------- robo --------------------------------------
  async function robo() {
    const questions = await api("/robo/questions");
    const answers = {};
    const monthly = h("input.inp", { type: "number", value: 50000, min: 1000, style: { maxWidth: "200px" } });
    const out = h("div");

    const qCards = questions.map((q, qi) => {
      const opts = h("div", { style: { display: "grid", gap: "8px" } },
        q.options.map(([label, val]) => h("button.btn", {
          style: { justifyContent: "flex-start", width: "100%" },
          onclick: (e) => {
            answers[q.id] = val;
            e.target.closest("div").querySelectorAll(".btn").forEach((b) => (b.style.borderColor = "var(--border2)", b.style.background = "var(--surface2)"));
            e.target.style.borderColor = "var(--blue)"; e.target.style.background = "rgba(255,255,255,.12)";
            prog.querySelector("i").style.width = `${(Object.keys(answers).length / questions.length) * 100}%`;
          },
        }, label)));
      return h("div.card", h("div.card-title", { style: { marginBottom: "10px" } }, `${qi + 1}. ${q.text}`), opts);
    });
    const prog = h("div.bar", { style: { margin: "4px 0 14px" } }, h("i", { style: { width: "0%" } }));

    const submit = h("button.btn.primary", {
      style: { padding: "11px 26px" },
      onclick: async () => {
        if (Object.keys(answers).length < questions.length) return toast(`Answer all ${questions.length} questions (${Object.keys(answers).length} done)`, true);
        out.innerHTML = ""; out.appendChild(h("div.skeleton", { style: { height: "260px" } }));
        const r = await api("/robo/profile", { body: { answers, monthly: +monthly.value } });
        out.innerHTML = "";
        const p = r.portfolio;
        const centreEl = h("div",
          h("div", { style: { fontSize: "11px", color: "var(--muted)" } }, "MONTHLY"),
          h("b", fmtMoney(p.monthly)));
        const allocDonut = donut(
          [
            { label: "Equity", value: p.model.equityPct, color: COLORS.BLUE },
            { label: "Debt", value: p.model.debtPct, color: COLORS.UP },
            { label: "Gold", value: p.model.goldPct, color: COLORS.GOLD },
            { label: "Liquid", value: p.model.liquidPct, color: "#5a5a5a" },
          ].filter((s) => s.value > 0),
          { centre: centreEl });
        const pickRows = p.picks.map((pk) => h("tr.click", { onclick: () => navigate(`#/funds/${pk.code}`) },
          h("td", pk.bucket),
          h("td", h("div.sym", pk.name), h("div.sub", `${pk.rating}★ · Sharpe ${pk.sharpe} · ER ${pk.er}%`)),
          h("td.num", `${pk.weight}%`),
          h("td.num", fmtMoney(pk.monthly))));
        const pickTable = h("div", { style: { flex: 1, minWidth: "300px" } },
          h("table.tbl",
            h("thead", h("tr", h("th", "Sleeve"), h("th", "Fund (top-ranked)"), h("th", "Weight"), h("th", "SIP"))),
            h("tbody", pickRows)));
        const resultCard = h("div.card",
          h("div.card-head",
            h("div",
              h("div.card-title", `Your risk profile: ${r.band.replace(/_/g, " ")}`),
              h("div.card-sub", `score ${r.score}/100 · expected portfolio return ~${p.expReturnPct}% p.a.`)),
            h("span.chip.violet", `Risk score ${r.score}`)),
          h("div", { style: { display: "flex", gap: "26px", flexWrap: "wrap", alignItems: "center" } }, allocDonut, pickTable),
          h("div.disclaimer", "Goals auto-map to this allocation; funds are the current top-ranked direct plans per sleeve and refresh with rankings. Model output — not personal advice; consult a SEBI-RIA for bespoke plans."));
        out.appendChild(h("div.grid", { style: { gap: "16px" } }, resultCard));
        toast("Risk profile saved to your account");
      },
    }, "Generate my portfolio →");

    return h("div",
      h("div.page-head",
        h("div", h("div.page-title", "Robo-Advisory"), h("div.page-sub", "7-question risk profiling → zero-commission direct fund portfolio"))),
      fundTabs("robo"),
      prog,
      h("div.grid.cols-2", qCards),
      h("div.card", { style: { marginTop: "16px" } },
        h("div", { style: { display: "flex", gap: "14px", alignItems: "end", flexWrap: "wrap" } },
          h("div", h("label.lbl", "Monthly investment (₹)"), monthly), submit)),
      h("div", { style: { marginTop: "16px" } }, out));
  }

  window.Views = window.Views || {};
  window.Views.funds = render;
})();
