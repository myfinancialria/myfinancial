/* ===========================================================================
   advisory.js — Module 5: segmented signal feeds (long-term QARP, swing,
   intraday) + HNI options desk (condors/strangles/straddles with payoffs,
   covered calls, cash-secured puts) + VIX-regime hedging.
   =========================================================================== */
(() => {
  "use strict";
  const { h, api, store, fmtMoney, fmtNum, fmtPct, pctCls, navigate, toast } = window.MF;
  const { payoffChart, oiHistogram, hbars, COLORS } = window.MFC;

  const TABS = [["longterm", "🏛️ Long-Term Wealth"], ["swing", "🌊 Swing Trades"], ["intraday", "⚡ Intraday"], ["options", "♟️ HNI Options Desk"], ["hedging", "🛡️ Hedging"]];

  async function render(rest) {
    const tab = rest?.[0] || "longterm";
    const body = h("div", { style: { marginTop: "16px" } });
    body.appendChild(h("div.skeleton", { style: { height: "380px" } }));
    ({ longterm, swing, intraday, options, hedging }[tab] || longterm)().then((el) => { body.innerHTML = ""; body.appendChild(el); })
      .catch((e) => { body.innerHTML = ""; body.appendChild(h("div.card", h("div.empty", e.message))); });
    return h("div",
      h("div.page-head",
        h("div", h("div.page-title", "Advisory & Signals"), h("div.page-sub", "Model-generated ideas across horizons — informational, not SEBI-registered advice")),
        h("div.tabs", TABS.map(([id, label]) => h("button.tab", { class: id === tab ? "active" : "", onclick: () => navigate(`#/advisory/${id}`) }, label)))),
      body);
  }

  // ------------------------------- long term ----------------------------------
  async function longterm() {
    const ideas = await api("/signals/longterm");
    return h("div",
      h("div.grid.cols-2",
        ideas.map((i) => h("div.card",
          h("div.card-head",
            h("div", h("div.card-title", { style: { cursor: "pointer" }, onclick: () => navigate(`#/equities/${i.symbol}`) }, `${i.symbol} · ${i.name}`),
              h("div.card-sub", `${i.sector} · ${i.style} · horizon ${i.horizon}`)),
            h("span.chip.up", `+${i.upsidePct}% upside`)),
          h("div.grid.cols-3", { style: { gap: "8px", marginBottom: "10px" } },
            h("div.stat", h("div.s-label", "CMP"), h("div.s-value", { style: { fontSize: "15px" } }, fmtNum(i.cmp))),
            h("div.stat", h("div.s-label", "Target"), h("div.s-value", { style: { fontSize: "15px" }, class: "up-t" }, fmtNum(i.target))),
            h("div.stat", h("div.s-label", "Quality"), h("div.s-value", { style: { fontSize: "15px" } }, `ROE ${i.metrics.roe}%`))),
          h("div.dim", { style: { fontSize: "12.8px", lineHeight: 1.6 } }, i.thesis),
          h("div.pill-row", { style: { marginTop: "10px" } },
            h("span.chip", `P/E ${i.metrics.pe}×`), h("span.chip", `Rev CAGR ${i.metrics.revCagr3}%`), h("span.chip", `PAT CAGR ${i.metrics.patCagr3}%`)))),
      ),
      h("div.disclaimer", "Quality-at-Reasonable-Price model: return on capital, growth durability, leverage and cash conversion, penalised for valuation excess. Targets are model fair-value paths, not guarantees."));
  }

  // --------------------------------- swing ------------------------------------
  async function swing() {
    const setups = await api("/signals/swing");
    if (!setups.length) return h("div.card", h("div.empty", "No setups pass the RR ≥ 1:2 + momentum filters right now."));
    const rows = setups.map((s) => h("tr.click", { onclick: () => navigate(`#/equities/${s.symbol}`) },
      h("td", h("div.sym", s.symbol), h("div.sub", s.sector)),
      h("td", s.setup),
      h("td", h("span.chip" + (s.bias === "BULLISH" ? ".up" : ".down"), s.bias)),
      h("td", h("span.vbadge", { class: s.status }, s.status)),
      h("td.num", fmtNum(s.cmp)),
      h("td.num", fmtNum(s.entry)),
      h("td.num.up-t", fmtNum(s.target1)),
      h("td.num.up-t", fmtNum(s.target2)),
      h("td.num.down-t", fmtNum(s.stop)),
      h("td", h("b", `1:${s.riskReward}`)),
      h("td.num", s.rsi)));
    const tableCard = h("div.card.flush",
      h("div.card-head", h("div",
        h("div.card-title", "🌊 Swing setups — pattern engine × momentum filter"),
        h("div.card-sub", "only RR ≥ 1:2 with EMA/RSI alignment survive"))),
      h("div.tbl-scroll", h("table.tbl",
        h("thead", h("tr", h("th", "Stock"), h("th", "Setup"), h("th", "Bias"), h("th", "Status"), h("th", "CMP"), h("th", "Entry"), h("th", "T1"), h("th", "T2"), h("th", "Stop"), h("th", "R:R"), h("th", "RSI"))),
        h("tbody", rows))));
    const playbooks = h("div.grid.cols-2", { style: { marginTop: "16px" } },
      setups.slice(0, 2).map((s) => h("div.card",
        h("div.card-title", { style: { marginBottom: "6px" } }, `${s.symbol} — playbook`),
        h("div.dim", { style: { fontSize: "12.8px" } }, s.note),
        h("div.pill-row", { style: { marginTop: "10px" } },
          h("span.chip", `ATR ${s.atr}`),
          h("span.chip", "Risk ≤ 1% capital"),
          h("span.chip", "Trail to BE after T1")))));
    return h("div",
      tableCard,
      playbooks,
      h("div.disclaimer", "Swing horizon 1–8 weeks. Position size = (capital × 1%) ÷ (entry − stop). Educational output."));
  }

  // -------------------------------- intraday ----------------------------------
  async function intraday() {
    const picks = await api("/signals/intraday");
    return h("div",
      picks.length ? h("div.grid.cols-2",
        picks.map((p) => h("div.card",
          h("div.card-head",
            h("div", h("div.card-title", `${p.bias === "LONG" ? "🟢" : "🔴"} ${p.symbol}`), h("div.card-sub", p.name)),
            h("span.chip" + (p.bias === "LONG" ? ".up" : ".down"), `${p.bias} · ${fmtPct(p.changePct)}`)),
          h("div.grid.cols-4", { style: { gap: "8px" } },
            h("div.stat", h("div.s-label", "Trigger"), h("div.s-value", { style: { fontSize: "14px" } }, fmtNum(p.entry))),
            h("div.stat", h("div.s-label", "Stop"), h("div.s-value", { style: { fontSize: "14px" }, class: "down-t" }, fmtNum(p.stop))),
            h("div.stat", h("div.s-label", "Target (2R)"), h("div.s-value", { style: { fontSize: "14px" }, class: "up-t" }, fmtNum(p.target))),
            h("div.stat", h("div.s-label", "Volume"), h("div.s-value", { style: { fontSize: "12px" } }, p.volumeNote))),
          h("div.dim", { style: { fontSize: "11.5px", marginTop: "8px" } }, p.rule)))) : h("div.card", h("div.empty", "No momentum extremes on the tape right now — picks refresh with live ticks.")),
      h("div.disclaimer", "Momentum-plus-range-position model on live snapshots. Intraday derivatives/cash trading carries high risk — 9 out of 10 individual F&O traders lose money (SEBI study)."));
  }

  // ------------------------------ options desk --------------------------------
  async function options() {
    if (store.user.segment !== "HNI") {
      return h("div.card", h("div.hni-gate",
        h("div.big", "♟️"),
        h("h3", { style: { margin: "10px 0" } }, "HNI Options Desk"),
        h("div.dim", { style: { maxWidth: "520px", margin: "0 auto 16px" } },
          "Delta-neutral premium strategies (iron condors, strangles, straddles), covered-call & cash-secured-put income screens and portfolio hedging are enabled for HNI-segment accounts with derivatives risk disclosure on file."),
        h("button.btn.primary", { onclick: () => toast("Demo: switch to the Arjun Mehta persona (HNI) to view the desk") }, "Request HNI access")));
    }
    let underlying = "NIFTY";
    const wrap = h("div");
    const paint = async () => {
      wrap.innerHTML = "";
      wrap.appendChild(h("div.skeleton", { style: { height: "420px" } }));
      const [desk, income, chain] = await Promise.all([
        api(`/signals/options-desk?underlying=${underlying}`),
        api("/signals/income"),
        api(`/market/optionchain?underlying=${underlying}`),
      ]);
      wrap.innerHTML = "";

      const stratCard = (s) => h("div.card",
        h("div.card-head",
          h("div", h("div.card-title", s.name), h("div.card-sub", s.stance)),
          h("div", { style: { textAlign: "right" } },
            h("div", { style: { fontWeight: 800, fontSize: "16px" }, class: "up-t" }, `+${fmtMoney(s.creditTotal)} credit`),
            h("div.dim", { style: { fontSize: "11px" } }, s.maxLoss ? `max loss ${fmtMoney(s.maxLoss)}` : "undefined risk"))),
        payoffChart(s.payoff, { breakevens: s.breakevens, spot: desk.spot }),
        h("div.pill-row", { style: { margin: "10px 0" } },
          h("span.chip.blue", `POP ~${s.popPct}%`),
          h("span.chip", `margin ~${fmtMoney(s.marginApprox)}`),
          h("span.chip.gold", `BE ${s.breakevens.map((b) => fmtNum(b, 0)).join(" – ")}`)),
        h("div", { style: { display: "grid", gap: "4px" } }, s.legs.map((l) => h("div.kv", h("span.dim", l.label), h("span.num", `Δ ${l.type !== "FUT" ? (l.qty > 0 ? "+" : "−") : ""}${Math.abs(l.premium)}`)))),
        h("div.dim", { style: { fontSize: "11.8px", marginTop: "8px" } }, s.when));

      wrap.appendChild(h("div.grid", { style: { gap: "16px" } },
        h("div.card",
          h("div", { style: { display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" } },
            h("div", h("div.card-title", `♟️ ${underlying} premium desk`), h("div.card-sub", `expiry ${desk.expiry} · lot ${desk.lotSize}`)),
            h("select.ctl", { onchange: (e) => { underlying = e.target.value; paint(); } }, ["NIFTY", "BANKNIFTY"].map((u2) => h("option", { value: u2, selected: u2 === underlying ? "" : null }, u2))),
            h("span.chip" + (desk.regime === "STRESSED" ? ".down" : desk.regime === "ELEVATED" ? ".gold" : ".blue"), `India VIX ${desk.vix} · ${desk.regime.replace("_", " ")}`),
            h("span.chip", `Spot ${fmtNum(desk.spot)}`),
            h("span.chip", `PCR ${chain.pcr}`), h("span.chip", `Max pain ${fmtNum(chain.maxPain, 0)}`))),
        h("div.grid.cols-3", desk.strategies.map(stratCard)),
        h("div.grid.cols-32",
          h("div.card",
            h("div.card-head", h("div", h("div.card-title", "Open interest by strike"), h("div.card-sub", `CALL (red, left) vs PUT (green, right) · ATM ${chain.atm}`))),
            oiHistogram(chain.rows, { atm: chain.atm, height: 360 })),
          h("div.grid", { style: { gap: "16px", alignContent: "start" } },
            h("div.card.flush",
              h("div.card-head", h("div", h("div.card-title", "💼 Covered calls"), h("div.card-sub", "≈5% OTM monthly on quality F&O names — ★ = you hold it"))),
              h("div.tbl-scroll", { style: { maxHeight: "240px" } }, h("table.tbl",
                h("thead", h("tr", h("th", "Stock"), h("th", "Strike"), h("th", "Premium"), h("th", "Yield/mo"), h("th", "Ann."))),
                h("tbody", income.coveredCalls.slice(0, 6).map((c2) => h("tr",
                  h("td", h("div.sym", `${c2.held ? "★ " : ""}${c2.symbol}`)),
                  h("td.num", c2.strike), h("td.num", `₹${c2.premium}`), h("td.num", `${c2.yieldPct}%`),
                  h("td", h("b.up-t", `${c2.annualizedPct}%`)))))))),
            h("div.card.flush",
              h("div.card-head", h("div", h("div.card-title", "💰 Cash-secured puts"), h("div.card-sub", "get paid to buy quality ≈5% lower"))),
              h("div.tbl-scroll", { style: { maxHeight: "240px" } }, h("table.tbl",
                h("thead", h("tr", h("th", "Stock"), h("th", "Strike"), h("th", "Premium"), h("th", "Eff. buy"), h("th", "Yield ann."))),
                h("tbody", income.cashSecuredPuts.slice(0, 6).map((c2) => h("tr",
                  h("td", h("div.sym", c2.symbol)), h("td.num", c2.strike), h("td.num", `₹${c2.premium}`),
                  h("td.num", fmtNum(c2.effectiveBuyPrice)), h("td", h("b.up-t", `${c2.annualizedPct}%`)))))))))),
        h("div.disclaimer", desk.disclaimer + " Options selling can lose more than the premium received. Figures derive from the synthetic chain via Black-Scholes.")));
    };
    await paint();
    return wrap;
  }

  // -------------------------------- hedging -----------------------------------
  async function hedging() {
    const plan = await api("/signals/hedging");
    const gauges = [["LOW_VOL", "<11"], ["NORMAL", "11–16"], ["ELEVATED", "16–21"], ["STRESSED", ">21"]];
    return h("div.grid", { style: { gap: "16px" } },
      h("div.card",
        h("div.card-head",
          h("div", h("div.card-title", "🛡️ Portfolio Hedging Plan"), h("div.card-sub", `for your ${fmtMoney(plan.portfolioValue)} equity book · beta ${plan.beta}`)),
          h("span.chip" + (plan.regime === "STRESSED" ? ".down" : plan.regime === "ELEVATED" ? ".gold" : ".up"), `VIX ${plan.vix}`)),
        h("div", { style: { display: "flex", gap: "6px", marginBottom: "12px" } },
          gauges.map(([g, range]) => h("div", { style: { flex: 1, textAlign: "center", padding: "8px", borderRadius: "8px", fontSize: "11.5px", fontWeight: 700, background: g === plan.regime ? "var(--surface3)" : "var(--bg2)", border: `1px solid ${g === plan.regime ? "var(--border2)" : "var(--border)"}`, color: g === plan.regime ? "var(--text)" : "var(--muted)" } }, `${g.replace("_", " ")} ${range}`))),
        h("div", { style: { fontSize: "13.5px", color: "var(--text2)", padding: "10px 14px", background: "var(--bg2)", borderRadius: "10px", borderLeft: "3px solid var(--blue)" } }, plan.advice)),
      h("div.grid.cols-3",
        plan.strategies.map((s) => h("div.card",
          h("div.card-title", { style: { marginBottom: "6px" } }, s.name),
          s.costTotal !== 0 ? h("div", { style: { fontSize: "20px", fontWeight: 800 }, class: s.costTotal > 0 ? "down-t" : "up-t" }, `${s.costTotal > 0 ? "cost " : "credit "}${fmtMoney(Math.abs(s.costTotal))}`) : h("div", { style: { fontSize: "20px", fontWeight: 800 } }, "zero premium"),
          s.costPctPortfolio !== undefined ? h("div.dim", { style: { fontSize: "12px" } }, `${Math.abs(s.costPctPortfolio)}% of portfolio`) : null,
          h("div.divider"),
          h("div.dim", { style: { fontSize: "12.5px", lineHeight: 1.6 } }, s.detail)))),
      h("div.disclaimer", plan.disclaimer));
  }

  window.Views = window.Views || {};
  window.Views.advisory = render;
})();
