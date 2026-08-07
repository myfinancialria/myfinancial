/* ===========================================================================
   dashboard.js — Net-worth hero, goal feasibility rings, allocation, live
   holdings, market snapshot, insurance pulse.
   =========================================================================== */
(() => {
  "use strict";
  const { h, api, store, fmtMoney, fmtNum, fmtPct, pctCls, fmtVol, navigate } = window.MF;
  const { donut, ring, hbars, COLORS } = window.MFC;

  async function render() {
    const [nw, ratios, cf, goals, overview, insurance] = await Promise.all([
      api("/plan/networth"), api("/plan/ratios"), api("/plan/cashflow"),
      api("/goals"), api("/market/overview"), api("/plan/insurance"),
    ]);
    const u = store.user;

    // ------------------------------ hero -------------------------------------
    const hero = h("div.hero",
      h("div", { style: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "18px" } },
        h("div",
          h("div.hero-label", `Namaste, ${u.name.split(" ")[0]} · ${u.residency === "NRI" ? `NRI (${u.country})` : "Resident"} ${u.segment === "HNI" ? "· HNI desk" : ""}`),
          h("div.hero-nw", fmtMoney(nw.netWorth)),
          h("div.dim", { style: { fontSize: "13px" } }, "Real-time net worth · assets ", h("b", fmtMoney(nw.totalAssets)), " − liabilities ", h("b", fmtMoney(nw.totalLiabilities))),
          h("div.hero-chips",
            h("span.chip" + (ratios.dtiPct < 30 ? ".up" : ratios.dtiPct < 45 ? ".gold" : ".down"), `DTI ${ratios.dtiPct}% · ${ratios.dtiVerdict}`),
            h("span.chip" + (cf.savingsRatePct >= 25 ? ".up" : ".gold"), `Savings rate ${cf.savingsRatePct}%`),
            h("span.chip" + (ratios.emergencyMonths >= 6 ? ".up" : ".down"), `Emergency ${fmtNum(ratios.emergencyMonths, 1)} mo`),
            h("span.chip.blue", `Surplus ${fmtMoney(cf.surplus)}/mo`))),
        h("div", { style: { display: "grid", gap: "8px", alignContent: "start" } },
          h("div.stat", h("div.s-label", "Investable Assets"), h("div.s-value", fmtMoney(nw.investable)), h("div.s-note", `MF ${fmtMoney(nw.holdings.mfValue)} · Equity `, h("span", { id: "dashEqVal" }, fmtMoney(nw.holdings.eqValue)))),
          h("div.stat", h("div.s-label", "This month"), h("div.s-value", fmtMoney(cf.incomeTotal)), h("div.s-note", `income vs ${fmtMoney(cf.expenseTotal)} outgo`)))));

    // ------------------------------ goals ------------------------------------
    const goalsCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🎯 Goal Feasibility"), h("div.card-sub", "Monte Carlo · 2,000 paths per goal")),
        h("button.btn.sm", { onclick: () => navigate("#/planning/goals") }, "Manage goals →")),
      h("div", { id: "goalRings", style: { display: "grid", gap: "12px" } },
        goals.map(() => h("div.skeleton", { style: { height: "64px" } }))));

    (async () => {
      const wrap = goalsCard.querySelector("#goalRings");
      const sims = await Promise.all(goals.map((g) => api(`/goals/${g.id}/simulate`).catch(() => null)));
      wrap.innerHTML = "";
      if (!goals.length) wrap.appendChild(h("div.empty", "No goals yet — add your first under Planning → Goals."));
      sims.forEach((s, i) => {
        if (!s) return;
        const g = goals[i];
        wrap.appendChild(h("div", { style: { display: "flex", alignItems: "center", gap: "14px", cursor: "pointer", padding: "4px 2px" }, onclick: () => navigate("#/planning/goals") },
          ring(s.sim.feasibility, { size: 64 }),
          h("div", { style: { flex: 1, minWidth: 0 } },
            h("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px" } },
              h("b", `${g.icon || "🎯"} ${g.name}`), h("span.vbadge", { class: s.sim.verdict }, s.sim.verdict.replace("_", " "))),
            h("div.dim", { style: { fontSize: "12px", marginTop: "3px" } },
              `${fmtMoney(g.target_amount)} (today) → ${fmtMoney(s.sim.target)} by ${g.target_year} · SIP ${fmtMoney(g.monthly_sip)}/mo`),
            s.sim.feasibility < 75
              ? h("div", { style: { fontSize: "11.5px", color: "var(--gold)", marginTop: "2px" } }, `Needs ${fmtMoney(s.requiredSip)}/mo for 75% confidence`)
              : h("div", { style: { fontSize: "11.5px", color: "var(--up)", marginTop: "2px" } }, `Median outcome ${fmtMoney(s.sim.median)}`))));
      });
    })();

    // --------------------------- allocation ----------------------------------
    const alloc = nw.allocation;
    const allocCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🧭 Asset Allocation"), h("div.card-sub", "investable portfolio, live-valued"))),
      donut([
        { label: "Equity", value: alloc.equity, color: COLORS.BLUE },
        { label: "Debt & Cash", value: alloc.debt, color: COLORS.UP },
        { label: "Gold", value: alloc.gold, color: COLORS.GOLD },
      ], { centre: h("div", h("div", { style: { fontSize: "11px", color: "var(--muted)" } }, "INVESTABLE"), h("b", { style: { fontSize: "15px" } }, fmtMoney(nw.investable))) }),
      h("div.divider"),
      h("div", { style: { display: "grid", gap: "6px" } },
        Object.entries(nw.byClass).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) =>
          h("div.kv", h("span.dim", k.replace(/_/g, " ")), h("b", fmtMoney(v))))));

    // ---------------------------- holdings -----------------------------------
    const eqRows = nw.holdings.eq.map((x) => {
      const tr = h("tr.click", { dataset: { sym: x.symbol }, onclick: () => navigate(`#/equities/${x.symbol}`) },
        h("td", h("div.sym", x.symbol), h("div.sub", `${x.qty} sh @ ${fmtNum(x.avg_price)}`)),
        h("td.num", { dataset: { cell: "ltp" } }, fmtNum(x.ltp)),
        h("td", { dataset: { cell: "chg" }, class: pctCls(x.dayChangePct) }, fmtPct(x.dayChangePct)),
        h("td.num", fmtMoney(x.value)),
        h("td", { class: pctCls(x.pnl) }, `${x.pnl >= 0 ? "+" : ""}${fmtMoney(x.pnl)} (${fmtPct(x.pnlPct)})`));
      return tr;
    });
    const holdingsCard = h("div.card.flush",
      h("div.card-head", h("div", h("div.card-title", "📈 Direct Equity"), h("div.card-sub", "streaming via WebSocket")),
        h("button.btn.sm", { onclick: () => navigate("#/planning/balance") }, "Full balance sheet →")),
      h("div.tbl-scroll", { style: { maxHeight: "330px" } }, h("table.tbl",
        h("thead", h("tr", h("th", "Holding"), h("th", "LTP"), h("th", "Day"), h("th", "Value"), h("th", "P&L"))),
        h("tbody", eqRows))));

    // live updates
    const unsub = store.on("ticks", (ticks) => {
      if (!document.body.contains(holdingsCard)) return unsub();
      let eqTotal = 0, dirty = false;
      for (const x of nw.holdings.eq) {
        const q = store.quotes.get(x.symbol);
        if (q) { x.ltp = q.ltp; x.dayChangePct = q.changePct; x.value = Math.round(x.qty * q.ltp); }
        eqTotal += x.value;
      }
      for (const t of ticks) {
        const tr = eqRows.find((r) => r.dataset.sym === t.symbol);
        if (!tr) continue;
        dirty = true;
        const ltpCell = tr.querySelector('[data-cell="ltp"]'), chgCell = tr.querySelector('[data-cell="chg"]');
        const prev = parseFloat(ltpCell.textContent.replace(/,/g, ""));
        ltpCell.textContent = fmtNum(t.ltp);
        chgCell.textContent = fmtPct(t.changePct);
        chgCell.className = pctCls(t.changePct);
        tr.classList.remove("flash-up", "flash-down");
        void tr.offsetWidth;
        tr.classList.add(t.ltp >= prev ? "flash-up" : "flash-down");
      }
      if (dirty) { const el = holdingsCard.ownerDocument.getElementById("dashEqVal"); if (el) el.textContent = fmtMoney(eqTotal); }
    });

    // --------------------------- market snapshot ------------------------------
    const ad = overview.advanceDecline.total;
    const marketCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🏛️ Market Snapshot"), h("div.card-sub", `India VIX ${overview.vix.ltp} · ${overview.status.open ? "session live" : "last close"}`)),
        h("button.btn.sm", { onclick: () => navigate("#/equities") }, "Screeners →")),
      h("div.grid.cols-2", { style: { gap: "10px" } },
        overview.indices.slice(0, 6).map((q) => h("div.stat",
          h("div.s-label", q.name), h("div.s-value", { style: { fontSize: "16px" } }, fmtNum(q.ltp)),
          h("div", { class: pctCls(q.changePct), style: { fontSize: "12px" } }, fmtPct(q.changePct))))),
      h("div.divider"),
      h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" } },
        h("span.up-t", `▲ ${ad.advances} advancing`), h("span.dim", `${ad.unchanged} flat`), h("span.down-t", `▼ ${ad.declines} declining`)),
      h("div.bar", h("i", { style: { width: `${(ad.advances / (ad.advances + ad.declines + ad.unchanged)) * 100}%`, background: "#ffffff" } })),
      h("div.divider"),
      h("div.grid.cols-2", { style: { gap: "10px" } },
        h("div", h("div.card-sub", { style: { marginBottom: "6px" } }, "TOP GAINERS"),
          overview.movers.gainers.slice(0, 4).map((g) => h("div.kv", h("span", { style: { cursor: "pointer" }, onclick: () => navigate(`#/equities/${g.symbol}`) }, g.symbol), h("b.up-t", fmtPct(g.changePct))))),
        h("div", h("div.card-sub", { style: { marginBottom: "6px" } }, "TOP LOSERS"),
          overview.movers.losers.slice(0, 4).map((g) => h("div.kv", h("span", { style: { cursor: "pointer" }, onclick: () => navigate(`#/equities/${g.symbol}`) }, g.symbol), h("b.down-t", fmtPct(g.changePct)))))));

    // --------------------------- insurance pulse ------------------------------
    const insCard = h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🛡️ Protection Pulse"), h("div.card-sub", "cover vs liabilities & dependents")),
        h("button.btn.sm", { onclick: () => navigate("#/planning/insurance") }, "Full audit →")),
      hbars(insurance.items.map((it) => ({
        label: it.label, value: Math.min(it.have, it.need), max: it.need,
        display: `${fmtMoney(it.have)} / ${fmtMoney(it.need)}`,
        color: it.gap === 0 ? "#ffffff" : "#9f9f9f",
        note: it.gap > 0 ? `Gap ${fmtMoney(it.gap)}` : "Adequate ✓",
      })), { max: Math.max(...insurance.items.map((i) => i.need)) }));

    // --------------------------- quick actions -------------------------------
    const actions = h("div.card",
      h("div.card-title", { style: { marginBottom: "12px" } }, "⚡ Quick Actions"),
      h("div", { style: { display: "grid", gap: "8px" } },
        h("button.btn", { onclick: () => navigate("#/planning/tax") }, "🧾 Compare Old vs New regime"),
        h("button.btn", { onclick: () => navigate("#/funds/robo") }, "🤖 Build a robo portfolio"),
        h("button.btn", { onclick: () => navigate("#/equities/screeners/rrg") }, "🔄 Sector rotation (RRG)"),
        h("button.btn", { onclick: () => navigate("#/estate") }, "📜 Draft my Will"),
        u.residency === "NRI" ? h("button.btn", { onclick: () => navigate("#/planning/fema") }, "🌍 NRI / FEMA panel") : null,
        h("button.btn.primary", { onclick: () => window.Views.assistant.open("Can I achieve my goals with my current SIPs?") }, "✨ Ask the AI assistant")));

    return h("div",
      h("div.page-head",
        h("div", h("div.page-title", "Dashboard"), h("div.page-sub", `As of ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · currency view: ${store.currency}`)),
        h("div.pill-row", h("span.chip.violet", "Module 1 · Planning"), h("span.chip.blue", "Live ticks"), u.segment === "HNI" ? h("span.chip.gold", "HNI Desk enabled") : null)),
      h("div.grid", { style: { gap: "16px" } },
        hero,
        h("div.grid.cols-3", goalsCard, allocCard, marketCard),
        h("div.grid.cols-32", holdingsCard, h("div.grid", { style: { gap: "16px" } }, insCard, actions))));
  }

  window.Views = window.Views || {};
  window.Views.dashboard = render;
})();
