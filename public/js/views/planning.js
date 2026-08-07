/* ===========================================================================
   planning.js — Module 1: intake & profiling, cash-flow ledger, balance sheet,
   Indian tax centre (old vs new), multi-goal Monte Carlo, insurance audit,
   NRI/FEMA panel.
   =========================================================================== */
(() => {
  "use strict";
  const { h, api, del, store, fmtMoney, fmtNum, fmtPct, pctCls, toast, modal, navigate, dispatch } = window.MF;
  const { donut, fanChart, ring, hbars, COLORS } = window.MFC;

  const TABS = [["overview", "Cash Flow"], ["balance", "Balance Sheet"], ["tax", "Tax Centre"], ["goals", "Goals & Monte Carlo"], ["insurance", "Insurance Audit"]];

  async function render(rest) {
    const tab = rest?.[0] || "overview";
    const isNRI = store.user.residency === "NRI";
    const tabs = [...TABS, ...(isNRI ? [["fema", "NRI & FEMA"]] : [])];
    const body = h("div", { style: { marginTop: "16px" } });
    const el = h("div",
      h("div.page-head",
        h("div", h("div.page-title", "Financial Planning & Taxes"),
          h("div.page-sub", "Intake · cash-flow ledger · balance sheet · dual-regime tax engine · goal feasibility")),
        h("div.tabs", tabs.map(([id, label]) => h("button.tab", { class: id === tab ? "active" : "", onclick: () => navigate(`#/planning/${id}`) }, label)))),
      body);
    body.appendChild(await ({ overview, balance, tax, goals, insurance, fema }[tab] || overview)());
    return el;
  }

  // ------------------------------ cash flow ----------------------------------
  async function overview() {
    const cf = await api("/plan/cashflow");
    const row = (r, kind) => h("div.kv",
      h("span", h("span.dim", `${r.category} · `), r.label,
        h("button.x-btn", { style: { fontSize: "13px", marginLeft: "6px" }, title: "remove", onclick: async () => { await del(`/plan/cashflow/${r.id}`); toast("Removed"); dispatch(); } }, "×")),
      h("b", { class: kind === "INCOME" ? "up-t" : "" }, fmtMoney(r.monthly) + "/mo"));

    const addForm = (kind) => {
      const cat = h("select.ctl", (kind === "INCOME" ? ["SALARY", "BUSINESS", "RENTAL", "DIVIDEND", "CAPITAL_GAINS", "OTHER"] : ["FIXED", "VARIABLE", "DISCRETIONARY"]).map((c) => h("option", c)));
      const label = h("input.inp", { placeholder: kind === "INCOME" ? "e.g. Freelance income" : "e.g. Streaming subscriptions" });
      const amt = h("input.inp", { type: "number", placeholder: "₹ / month", min: 0 });
      return h("div", { style: { display: "grid", gridTemplateColumns: "1fr 2fr 1fr auto", gap: "8px", marginTop: "12px" } },
        cat, label, amt,
        h("button.btn.sm.primary", {
          onclick: async () => {
            if (!label.value || !amt.value) return toast("Label and amount required", true);
            await api("/plan/cashflow", { body: { kind, category: cat.value, label: label.value, monthly: +amt.value } });
            toast(`${kind === "INCOME" ? "Income" : "Expense"} added`); dispatch();
          },
        }, "+ Add"));
    };

    return h("div.grid.cols-2",
      h("div.card",
        h("div.card-head", h("div", h("div.card-title", "💰 Income Streams"), h("div.card-sub", `${fmtMoney(cf.incomeTotal)}/month gross`))),
        cf.incomes.map((r) => row(r, "INCOME")), addForm("INCOME")),
      h("div.card",
        h("div.card-head", h("div", h("div.card-title", "💸 Expenses"), h("div.card-sub", `${fmtMoney(cf.expenseTotal)}/month incl. EMIs ${fmtMoney(cf.emiTotal)}`))),
        h("div.kv", h("span", h("span.dim", "FIXED · "), "Loan EMIs (auto from liabilities)"), h("b", fmtMoney(cf.emiTotal) + "/mo")),
        cf.expenses.map((r) => row(r, "EXPENSE")), addForm("EXPENSE"),
        h("div.divider"),
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          h("div", h("div.card-sub", "MONTHLY SURPLUS"), h("div", { style: { fontSize: "22px", fontWeight: 800 }, class: cf.surplus >= 0 ? "up-t" : "down-t" }, fmtMoney(cf.surplus))),
          h("div", { style: { textAlign: "right" } }, h("div.card-sub", "SAVINGS RATE"), h("div", { style: { fontSize: "22px", fontWeight: 800 } }, `${cf.savingsRatePct}%`))),
        h("div.bar.green", { style: { marginTop: "8px" } }, h("i", { style: { width: `${Math.min(100, cf.savingsRatePct)}%` } }))));
  }

  // ---------------------------- balance sheet ---------------------------------
  const ASSET_CLASSES = ["REAL_ESTATE", "EQUITY", "MUTUAL_FUND", "EPF", "PPF", "NPS", "GOLD", "CASH", "ESOP", "INTL", "OTHER"];
  async function balance() {
    const [nw, ratios] = await Promise.all([api("/plan/networth"), api("/plan/ratios")]);
    const assetRow = (a) => h("div.kv",
      h("span", h("span.chip", { style: { marginRight: "8px" } }, a.class.replace(/_/g, " ")), a.label, a.live ? h("span.chip.blue", { style: { marginLeft: "6px" } }, "LIVE") : null,
        a.live ? null : h("button.x-btn", { style: { fontSize: "13px", marginLeft: "6px" }, onclick: async () => { await del(`/plan/asset/${a.id}`); toast("Asset removed"); dispatch(); } }, "×")),
      h("b", fmtMoney(a.value)));

    const cls = h("select.ctl", ASSET_CLASSES.map((c) => h("option", c)));
    const lbl = h("input.inp", { placeholder: "e.g. REC bonds" });
    const val = h("input.inp", { type: "number", placeholder: "current value ₹" });
    const liabT = h("select.ctl", ["HOME_LOAN", "PERSONAL_LOAN", "VEHICLE_LOAN", "CREDIT_CARD", "EDUCATION_LOAN", "OTHER"].map((c) => h("option", c)));
    const liabL = h("input.inp", { placeholder: "e.g. Personal loan — HDFC" });
    const liabO = h("input.inp", { type: "number", placeholder: "outstanding ₹" });
    const liabE = h("input.inp", { type: "number", placeholder: "EMI ₹/mo" });

    return h("div.grid.cols-32",
      h("div.grid", { style: { gap: "16px" } },
        h("div.card",
          h("div.card-head", h("div", h("div.card-title", "🏦 Assets"), h("div.card-sub", `${fmtMoney(nw.totalAssets)} total — MF & equity valued live`))),
          nw.assets.sort((a, b) => b.value - a.value).map(assetRow),
          h("div", { style: { display: "grid", gridTemplateColumns: "1fr 2fr 1fr auto", gap: "8px", marginTop: "12px" } },
            cls, lbl, val, h("button.btn.sm.primary", { onclick: async () => { if (!lbl.value || !val.value) return toast("Fill label & value", true); await api("/plan/asset", { body: { cls: cls.value, label: lbl.value, value: +val.value } }); toast("Asset added"); dispatch(); } }, "+ Add"))),
        h("div.card",
          h("div.card-head", h("div", h("div.card-title", "🧾 Liabilities"), h("div.card-sub", `${fmtMoney(nw.totalLiabilities)} outstanding`))),
          nw.liabilities.map((l) => h("div.kv",
            h("span", h("span.chip", { style: { marginRight: "8px" } }, l.type.replace(/_/g, " ")), l.label,
              h("span.dim", ` · ${l.rate}% · ${l.months_left} mo left`),
              h("button.x-btn", { style: { fontSize: "13px", marginLeft: "6px" }, onclick: async () => { await del(`/plan/liability/${l.id}`); toast("Liability removed"); dispatch(); } }, "×")),
            h("span", h("b.down-t", fmtMoney(l.outstanding)), h("span.dim", ` · EMI ${fmtMoney(l.emi)}`)))),
          h("div", { style: { display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr auto", gap: "8px", marginTop: "12px" } },
            liabT, liabL, liabO, liabE,
            h("button.btn.sm.primary", { onclick: async () => { if (!liabL.value || !liabO.value) return toast("Fill label & outstanding", true); await api("/plan/liability", { body: { type: liabT.value, label: liabL.value, outstanding: +liabO.value, emi: +liabE.value || 0 } }); toast("Liability added"); dispatch(); } }, "+ Add")))),
      h("div.grid", { style: { gap: "16px", alignContent: "start" } },
        h("div.card",
          h("div.card-title", { style: { marginBottom: "10px" } }, "Net Worth"),
          h("div", { style: { fontSize: "30px", fontWeight: 800 } }, fmtMoney(nw.netWorth)),
          h("div.divider"),
          h("div.kv", h("span.dim", "Debt-to-Income"), h("b", { class: ratios.dtiPct < 30 ? "up-t" : ratios.dtiPct < 45 ? "" : "down-t" }, `${ratios.dtiPct}% (${ratios.dtiVerdict})`)),
          h("div.kv", h("span.dim", "Leverage (liab/assets)"), h("b", `${ratios.leverage}%`)),
          h("div.kv", h("span.dim", "Liquid assets"), h("b", fmtMoney(ratios.liquidAssets))),
          h("div.kv", h("span.dim", "Emergency runway"), h("b", { class: ratios.emergencyMonths >= 6 ? "up-t" : "down-t" }, `${fmtNum(ratios.emergencyMonths, 1)} months`))),
        h("div.card",
          h("div.card-title", { style: { marginBottom: "12px" } }, "Mix by class"),
          donut(Object.entries(nw.byClass).map(([k, v], i) => ({ label: k.replace(/_/g, " "), value: v, color: [COLORS.BLUE, COLORS.UP, COLORS.GOLD, COLORS.VIOLET, COLORS.CYAN, "#fb7185", "#a3e635", "#f97316", "#64748b", "#e879f9"][i % 10] }))))));
  }

  // ------------------------------ tax centre ----------------------------------
  async function tax() {
    let stcg = 150000, ltcg = 300000;
    const wrap = h("div");
    const load = async () => {
      wrap.innerHTML = "";
      wrap.appendChild(h("div.skeleton", { style: { height: "300px" } }));
      const data = await api(`/tax/compare?stcg=${stcg}&ltcg=${ltcg}`);
      wrap.innerHTML = "";
      wrap.appendChild(paint(data));
    };

    const regimeCard = (r, better) => h("div.card", { style: better ? { borderColor: "rgba(16,185,129,.55)", boxShadow: "0 0 0 1px rgba(16,185,129,.35)" } : {} },
      h("div.card-head",
        h("div", h("div.card-title", `${r.regime} Regime`), h("div.card-sub", r.fy)),
        better ? h("span.vbadge.ACHIEVABLE", "RECOMMENDED") : null),
      h("div", { style: { fontSize: "27px", fontWeight: 800 } }, fmtMoney(r.tax.total)),
      h("div.dim", { style: { fontSize: "12px", marginBottom: "10px" } }, `effective rate ${r.effectiveRatePct}% on ${fmtMoney(r.totalIncome)}`),
      h("div.kv", h("span.dim", "Taxable (slab) income"), h("b", fmtMoney(r.slabIncome))),
      r.slabLines.map((l) => h("div.kv", h("span.dim", { style: { paddingLeft: "12px" } }, `${l.band} @ ${l.rate}%`), h("span", fmtMoney(l.tax)))),
      r.tax.rebate87A ? h("div.kv", h("span.dim", "87A rebate"), h("b.up-t", `− ${fmtMoney(r.tax.rebate87A)}`)) : null,
      h("div.kv", h("span.dim", "STCG @20%"), h("span", fmtMoney(r.tax.stcg))),
      h("div.kv", h("span.dim", "LTCG @12.5% (over ₹1.25L)"), h("span", fmtMoney(r.tax.ltcg))),
      r.tax.surcharge ? h("div.kv", h("span.dim", `Surcharge (${r.tax.surchargeRatePct}%, CG capped 15%)`), h("span", fmtMoney(r.tax.surcharge))) : null,
      h("div.kv", h("span.dim", "Health & education cess 4%"), h("span", fmtMoney(r.tax.cess))),
      r.deductions.length ? h("div", h("div.divider"), h("div.card-sub", { style: { marginBottom: "6px" } }, "DEDUCTIONS APPLIED"),
        r.deductions.map((d) => h("div.kv", h("span.dim", `${d.code} · ${d.label}`), h("span", fmtMoney(d.amount))))) : null);

    const paint = (data) => {
      const { compare: cmp, recommendations: recs, input } = data;
      const slider = (label, val, max, onch) => {
        const out = h("b", fmtMoney(val));
        const inp = h("input.slider", { type: "range", min: 0, max, step: 25000, value: val, oninput: (e) => { out.textContent = fmtMoney(+e.target.value); }, onchange: (e) => onch(+e.target.value) });
        return h("div.field", h("div", { style: { display: "flex", justifyContent: "space-between" } }, h("label.lbl", label), out), inp);
      };
      return h("div.grid", { style: { gap: "16px" } },
        h("div.card",
          h("div.card-head",
            h("div", h("div.card-title", "🧮 What-if: capital gains this FY"),
              h("div.card-sub", `auto-built from your ledger — salary ${fmtMoney(input.income.salary)}, rental ${fmtMoney(input.income.rentalAnnual)}, F&O ${fmtMoney(input.income.fnoGains)}${store.user.residency === "NRI" ? " · NRI: foreign salary excluded, NRE interest exempt, no 87A rebate" : ""}`)),
            h("span.chip.blue", data.fy)),
          h("div.grid.cols-2",
            slider("Equity STCG realised", stcg, 3000000, (v) => { stcg = v; load(); }),
            slider("Equity LTCG realised", ltcg, 5000000, (v) => { ltcg = v; load(); }))),
        h("div.grid.cols-2", regimeCard(cmp.NEW, cmp.better === "NEW"), regimeCard(cmp.OLD, cmp.better === "OLD")),
        h("div.card",
          h("div.card-head", h("div", h("div.card-title", `💡 Tax-saving moves — worth ${fmtMoney(recs.reduce((a, r) => a + r.impact, 0))}`), h("div.card-sub", "ranked by rupee impact, generated from your data"))),
          recs.length ? recs.map((r) => h("div", { style: { padding: "10px 0", borderBottom: "1px dashed var(--border)" } },
            h("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px" } },
              h("b", r.title), r.impact ? h("span.chip.up", `saves ~${fmtMoney(r.impact)}`) : h("span.chip", "hygiene")),
            h("div.dim", { style: { fontSize: "12.5px", marginTop: "4px" } }, r.detail))) : h("div.empty", "You're fully optimised for this year 🎉"),
          h("div.disclaimer", "Computed under ", data.fy, ". Informational — confirm with a Chartered Accountant before filing. Slabs/sections per Finance Act; STCG 20% u/s 111A, LTCG 12.5% u/s 112A above ₹1.25L.")));
    };
    load();
    return wrap;
  }

  // -------------------------------- goals -------------------------------------
  async function goals() {
    const list = await api("/goals");
    const grid = h("div.grid.cols-2");
    for (const g of list) grid.appendChild(goalCard(g));
    grid.appendChild(adhocCard());
    return h("div", grid);
  }

  function goalCard(g) {
    const box = h("div.card", h("div.skeleton", { style: { height: "180px" } }));
    (async () => {
      const s = await api(`/goals/${g.id}/simulate`);
      box.innerHTML = "";
      box.appendChild(h("div.card-head",
        h("div", h("div.card-title", `${g.icon || "🎯"} ${g.name}`),
          h("div.card-sub", `${fmtMoney(g.target_amount)} today → ${fmtMoney(s.sim.target)} by ${g.target_year} (${(g.inflation * 100).toFixed(1)}% infl.)`)),
        h("span.vbadge", { class: s.sim.verdict }, s.sim.verdict.replace("_", " "))));
      box.appendChild(h("div", { style: { display: "flex", gap: "16px", alignItems: "center", marginBottom: "10px" } },
        ring(s.sim.feasibility, { size: 84, label: "feasible" }),
        h("div", { style: { flex: 1 } },
          h("div.kv", h("span.dim", "Corpus today"), h("b", fmtMoney(g.current_corpus))),
          h("div.kv", h("span.dim", "SIP"), h("b", `${fmtMoney(g.monthly_sip)}/mo`)),
          h("div.kv", h("span.dim", "Median outcome"), h("b", fmtMoney(s.sim.median))),
          h("div.kv", h("span.dim", "P10 – P90"), h("b", `${fmtMoney(s.sim.p10)} – ${fmtMoney(s.sim.p90)}`)))));
      if (s.sim.bands) box.appendChild(fanChart(s.sim.bands, s.sim.target, { height: 190 }));
      box.appendChild(h("div", { style: { display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap", alignItems: "center" } },
        s.sim.feasibility < 75 ? h("span.chip.gold", `Need ${fmtMoney(s.requiredSip)}/mo for 75%`) : h("span.chip.up", "On track ✓"),
        s.rebalance.needs ? h("span.chip.down", `Drift: rebalance ${Object.entries(s.rebalance.drift).filter(([, v]) => Math.abs(v) > s.rebalance.thresholdPct).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}%`).join(", ")}`) : h("span.chip", "Allocation in tolerance"),
        h("span.chip.blue", `Suggested: ${Math.round(s.recommendedAlloc.equity * 100)}/${Math.round(s.recommendedAlloc.debt * 100)}/${Math.round(s.recommendedAlloc.gold * 100)} E/D/G`),
        h("button.btn.sm.danger", { style: { marginLeft: "auto" }, onclick: async () => { if (confirm(`Delete goal "${g.name}"?`)) { await del(`/goals/${g.id}`); toast("Goal deleted"); dispatch(); } } }, "Delete")));
    })().catch((e) => { box.innerHTML = ""; box.appendChild(h("div.empty", e.message)); });
    return box;
  }

  function adhocCard() {
    const f = {
      name: h("input.inp", { placeholder: 'e.g. "Startup seed fund"' }),
      amount: h("input.inp", { type: "number", placeholder: "target (today's ₹)", value: 10000000 }),
      years: h("input.inp", { type: "number", placeholder: "years", value: 10, min: 1, max: 40 }),
      sip: h("input.inp", { type: "number", placeholder: "SIP ₹/mo", value: 50000 }),
      corpus: h("input.inp", { type: "number", placeholder: "starting corpus ₹", value: 0 }),
      inflation: h("input.inp", { type: "number", placeholder: "inflation %", value: 6, step: 0.5 }),
      equity: h("input.inp", { type: "number", value: 60, min: 0, max: 100 }),
    };
    const out = h("div");
    return h("div.card",
      h("div.card-head", h("div", h("div.card-title", "🧪 Goal Lab — simulate anything"), h("div.card-sub", "2,000-path Monte Carlo, correlated equity/debt/gold"))),
      h("div.grid.cols-2", { style: { gap: "10px" } },
        h("div.field", h("label.lbl", "Goal name"), f.name),
        h("div.field", h("label.lbl", "Target (today's cost)"), f.amount),
        h("div.field", h("label.lbl", "Horizon (years)"), f.years),
        h("div.field", h("label.lbl", "Monthly SIP"), f.sip),
        h("div.field", h("label.lbl", "Current corpus"), f.corpus),
        h("div.field", h("label.lbl", "Inflation %"), f.inflation),
        h("div.field", h("label.lbl", "Equity % (rest → debt/gold 3:1)"), f.equity)),
      h("button.btn.primary", {
        onclick: async () => {
          out.innerHTML = ""; out.appendChild(h("div.skeleton", { style: { height: "120px", marginTop: "12px" } }));
          const eq = Math.min(100, Math.max(0, +f.equity.value)) / 100;
          const rest = 1 - eq;
          const sim = await api("/goals/simulate-adhoc", { body: { targetAmount: +f.amount.value, years: +f.years.value, monthlySip: +f.sip.value, currentCorpus: +f.corpus.value, inflation: +f.inflation.value / 100, alloc: { equity: eq, debt: rest * 0.75, gold: rest * 0.25 } } });
          out.innerHTML = "";
          out.appendChild(h("div", { style: { marginTop: "14px" } },
            h("div", { style: { display: "flex", gap: "14px", alignItems: "center", marginBottom: "10px" } },
              ring(sim.feasibility, { size: 76 }),
              h("div", h("div", h("b", `${sim.feasibility}% feasible — `), h("span.vbadge", { class: sim.verdict }, sim.verdict.replace("_", " "))),
                h("div.dim", { style: { fontSize: "12.5px" } }, `Inflated target ${fmtMoney(sim.target)} · median ${fmtMoney(sim.median)} · P10 ${fmtMoney(sim.p10)}`))),
            sim.bands ? fanChart(sim.bands, sim.target, { height: 170 }) : null,
            h("div", { style: { marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" } },
              h("button.btn.sm.green", {
                onclick: async () => {
                  await api("/goals", { body: { name: f.name.value || "New goal", icon: "🎯", target_amount: +f.amount.value, target_year: new Date().getFullYear() + +f.years.value, inflation: +f.inflation.value / 100, current_corpus: +f.corpus.value, monthly_sip: +f.sip.value, alloc: { equity: eq, debt: rest * 0.75, gold: rest * 0.25 } } });
                  toast("Goal saved to your plan"); navigate("#/planning/goals"); dispatch();
                },
              }, "💾 Save as goal"))));
        },
      }, "Run simulation"),
      out);
  }

  // ------------------------------ insurance -----------------------------------
  async function insurance() {
    const audit = await api("/plan/insurance");
    return h("div.grid.cols-31",
      h("div.grid", { style: { gap: "16px" } },
        audit.items.map((it) => h("div.card",
          h("div.card-head",
            h("div", h("div.card-title", `${{ TERM: "🕊️", HEALTH: "🏥", CRITICAL_ILLNESS: "❤️‍🩹" }[it.type] || "🛡️"} ${it.label}`),
              h("div.card-sub", it.gap === 0 ? "Cover adequate" : `Gap of ${fmtMoney(it.gap)}`)),
            it.gap === 0 ? h("span.vbadge.ACHIEVABLE", "COVERED") : h("span.vbadge.AT_RISK", "GAP")),
          h("div.grid.cols-3", { style: { gap: "10px", marginBottom: "10px" } },
            h("div.stat", h("div.s-label", "You have"), h("div.s-value", fmtMoney(it.have))),
            h("div.stat", h("div.s-label", "You need"), h("div.s-value", fmtMoney(it.need))),
            h("div.stat", h("div.s-label", "Shortfall"), h("div.s-value", { class: it.gap ? "down-t" : "up-t" }, it.gap ? fmtMoney(it.gap) : "None"))),
          h("div.bar" + (it.gap === 0 ? ".green" : ".gold"), h("i", { style: { width: `${Math.min(100, (it.have / it.need) * 100)}%` } })),
          h("div.dim", { style: { fontSize: "12.5px", marginTop: "10px" } }, it.note)))),
      h("div.card", { style: { alignSelf: "start" } },
        h("div.card-title", { style: { marginBottom: "12px" } }, "Coverage score"),
        h("div", { style: { textAlign: "center" } }, ring(audit.score, { size: 120, label: "audit" })),
        h("div.divider"),
        h("div.kv", h("span.dim", "Active policies"), h("b", audit.policies.length)),
        audit.policies.map((p) => h("div.kv", h("span.dim", p.label.slice(0, 26)), h("b", fmtMoney(p.cover)))),
        h("div.kv", h("span.dim", "Annual premiums"), h("b", fmtMoney(audit.premiumTotal))),
        h("div.disclaimer", "Needs model: term = 10× income + liabilities − 60% investable; health floor by city tier & dependents; CI = 3× income. Review after every life event.")));
  }

  // -------------------------------- FEMA --------------------------------------
  async function fema() {
    const data = await api("/plan/fema");
    if (!data) return h("div.card", h("div.empty", "FEMA panel applies to NRI profiles."));
    return h("div.grid.cols-32",
      h("div.card",
        h("div.card-head", h("div", h("div.card-title", "🌍 FEMA & NRI Compliance"), h("div.card-sub", "account structure, investing rails, repatriation"))),
        data.rules.map((r) => h("div", { style: { padding: "10px 0", borderBottom: "1px dashed var(--border)" } },
          h("b", r.title), h("div.dim", { style: { fontSize: "12.5px", marginTop: "3px" } }, r.body)))),
      h("div.grid", { style: { gap: "16px", alignContent: "start" } },
        h("div.card",
          h("div.card-title", { style: { marginBottom: "10px" } }, "Your linked accounts"),
          Object.entries(data.accounts).map(([k, v]) => h("div.kv", h("span.chip.blue", k), h("b", v))),
          h("div.disclaimer", "NRE interest: tax-free · NRO: 30% TDS u/s 195, repatriation ≤ USD 1M/FY with 15CA/CB.")),
        h("div.card",
          h("div.card-title", { style: { marginBottom: "10px" } }, "Ask the assistant"),
          ["Can I repatriate my NRO balance?", "How does the DTAA cut my TDS?", "What is RNOR when I return?"].map((q) =>
            h("button.btn", { style: { width: "100%", marginBottom: "8px", justifyContent: "flex-start" }, onclick: () => window.Views.assistant.open(q) }, "💬 ", q)))));
  }

  window.Views = window.Views || {};
  window.Views.planning = render;
})();
