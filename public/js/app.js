/* ===========================================================================
   app.js — boot, login (persona selection), shell chrome, routing, live strip.
   =========================================================================== */
(() => {
  "use strict";
  const { $, h, store, api, route, dispatch, connectWS, logout, fmtNum, pctCls, toast } = window.MF;

  // ------------------------------- login -------------------------------------
  async function renderLogin() {
    const app = $("#app");
    app.innerHTML = "";
    let personas = [];
    try { personas = await api("/personas"); } catch (e) { app.appendChild(h("div.boot-splash", h("div.boot-sub", `Server unreachable: ${e.message}`))); return; }
    const card = h("div.login-card",
      h("div.logo-mark", { style: { fontSize: "30px" } }, "my", h("span", "financial")),
      h("div", { style: { color: "var(--text2)", marginTop: "6px", fontSize: "14px" } },
        "Financial planning · Direct mutual funds · Equity analytics · Advisory signals · Estate planning — built for Resident Indians & NRIs."),
      h("div.login-grid",
        personas.map((p) => h("button.persona-card", { onclick: () => login(p.id) },
          h("div", { style: { fontSize: "26px" } }, p.residency === "NRI" ? "🌍" : "🇮🇳"),
          h("div.pc-name", p.name),
          h("div", { style: { color: "var(--muted)", fontSize: "12px" } }, p.email),
          h("div.pc-tags",
            h("span.chip.blue", p.residency === "NRI" ? `NRI · ${p.country}` : "Resident Indian"),
            h("span.chip" + (p.segment === "HNI" ? ".gold" : ""), p.segment === "HNI" ? "HNI Client" : "Retail"),
            h("span.chip", `Age ${p.age}`),
            p.currency !== "INR" ? h("span.chip", `${p.currency} view`) : null)))),
      h("div.login-foot", "Demo workspace with two personas exercising the Resident and NRI journeys end-to-end. Google OAuth + KYC onboarding replace this screen in production. Data is synthetic — see README for licensed-feed adapters. ",
        h("a", { href: "/", style: { color: "var(--blue)" } }, "← Back to homepage")));
    app.appendChild(h("div.login-wrap", card));
  }

  async function login(userId) {
    try {
      const { token, user } = await api("/login", { body: { userId } });
      store.token = token; store.user = user;
      localStorage.setItem("myfin.token", token);
      localStorage.removeItem("myfin.forcePicker");
      if (user.residency === "NRI" && localStorage.getItem("myfin.ccy") === null) {
        store.currency = user.currency; localStorage.setItem("myfin.ccy", user.currency);
      }
      boot();
    } catch (e) { toast(e.message, true); }
  }

  /** Public mode: no login gate — auto-enter as the demo persona. */
  async function publicSession() {
    const { token, user } = await api("/public-session");
    store.token = token; store.user = user;
    localStorage.setItem("myfin.token", token);
    return user;
  }

  // ---------------------- Connections (Upstox / FYERS / AIMLAPI) -------------
  async function connectionsModal() {
    const { h: h2, modal, api: api2 } = window.MF;
    const box = h2("div", h2("div.skeleton", { style: { height: "220px" } }));
    const m = modal("🔌 Data & AI Connections", box, { width: "680px" });
    const st = await api2("/settings/connections");
    const fld = (label, id, ph, value, type = "password") => h2("div.field",
      h2("label.lbl", label), h2("input.inp", { id, placeholder: ph, type, value: value || "", autocomplete: "off" }));
    const chip = (on, label) => h2("span.chip" + (on ? ".up" : ""), `${on ? "✓" : "○"} ${label}`);
    const provSel = h2("select.ctl", { id: "cx-provider", style: { width: "100%" } },
      [["synthetic", "Synthetic demo feed (no keys)"], ["upstox", "Upstox (live NSE)"], ["fyers", "FYERS (live NSE)"]].map(([v, l]) =>
        h2("option", { value: v, selected: v === st.provider ? "" : null }, l)));
    box.innerHTML = "";
    box.appendChild(h2("div",
      h2("div.pill-row", { style: { marginBottom: "14px" } },
        chip(st.upstox.configured, `Upstox ${st.upstox.token || ""}`),
        chip(st.fyers.configured, `FYERS ${st.fyers.token || ""}`),
        chip(st.aimlapi.configured, `AIMLAPI ${st.aimlapi.key || ""} · ${st.aimlapi.model}`)),
      h2("div.field", h2("label.lbl", "Market data provider"), provSel),
      fld("Upstox access token (expires daily — regenerate via your Upstox app's login flow)", "cx-upstox", st.upstox.configured ? "saved — paste to replace" : "eyJ…", ""),
      h2("div.grid.cols-2", { style: { gap: "10px" } },
        fld("FYERS App ID", "cx-fyers-id", "XXXXXXXX-100", st.fyers.appId, "text"),
        fld("FYERS access token", "cx-fyers-tok", st.fyers.configured ? "saved — paste to replace" : "eyJ…", "")),
      h2("div.grid.cols-2", { style: { gap: "10px" } },
        fld("AIMLAPI key — writes stock/fund interpretations & /learn articles", "cx-aiml", st.aimlapi.configured ? "saved — paste to replace" : "sk-…", ""),
        fld("AIMLAPI model", "cx-aiml-model", "gpt-4o-mini", st.aimlapi.model, "text")),
      h2("div", { style: { display: "flex", gap: "10px", marginTop: "6px", alignItems: "center", flexWrap: "wrap" } },
        h2("button.btn.primary", {
          onclick: async (e) => {
            e.target.disabled = true;
            const val = (id) => document.getElementById(id).value.trim();
            const body = { MYFIN_PROVIDER: provSel.value, AIMLAPI_MODEL: val("cx-aiml-model") };
            if (val("cx-upstox")) body.UPSTOX_ACCESS_TOKEN = val("cx-upstox");
            if (val("cx-fyers-id")) body.FYERS_APP_ID = val("cx-fyers-id");
            if (val("cx-fyers-tok")) body.FYERS_ACCESS_TOKEN = val("cx-fyers-tok");
            if (val("cx-aiml")) body.AIMLAPI_KEY = val("cx-aiml");
            try {
              const r = await api2("/settings/connections", { body });
              toast(`Saved · market feed: ${r.market.mode}${r.market.lastError ? " (check token)" : ""}`);
              m.remove(); dispatch();
            } catch (err) { toast(err.message, true); e.target.disabled = false; }
          },
        }, "Save & apply live"),
        h2("button.btn", { onclick: async () => { const s2 = await api2("/providers/status"); toast(`Feed: ${s2.market.mode} · live bars ${s2.market.symbolsWithLiveBars} · ${s2.market.lastError || "no errors"}`); } }, "Test status")),
      h2("div.disclaimer", "Secrets are AES-256-GCM encrypted at rest and never returned to the browser after saving (masked previews only). Environment variables, if set, take precedence. Broker tokens expire daily by design — the feed falls back to the synthetic engine gracefully when they lapse. On a public deployment, restrict who can open this panel.")));
  }

  // ------------------------------- shell -------------------------------------
  const NAV = [
    ["dashboard", "Dashboard"],
    ["planning", "Planning & Tax"],
    ["funds", "Mutual Funds"],
    ["equities", "Equities & Screeners"],
    ["advisory", "Advisory & Signals"],
    ["estate", "Will & Vault"],
  ];

  function shell() {
    const app = $("#app");
    app.innerHTML = "";
    const u = store.user;
    const initials = u.name.split(" ").map((x) => x[0]).slice(0, 2).join("");

    const ccySel = h("select.ccy", { onchange: (e) => { store.currency = e.target.value; localStorage.setItem("myfin.ccy", store.currency); dispatch(); } },
      Object.keys(store.fx).map((c) => h("option", { value: c, selected: c === store.currency ? "" : null }, c)));

    app.appendChild(h("header.topbar",
      h("div.topbar-inner",
        h("div.brand", { title: "Back to homepage", onclick: () => (location.href = "/") }, "my", h("span", "financial"), h("small", "WEALTH OS")),
        h("nav.mainnav",
          NAV.map(([r, label]) => h("button.nav-item", { dataset: { route: r }, onclick: () => (location.hash = `#/${r}`) }, label)),
          h("a.nav-item", { href: "/learn", title: "Plain-English guides (server-rendered)" }, "Insights ↗")),
        h("div.top-right",
          h("div.mkt-pill", h("span.mkt-dot", { id: "mktDot" }), h("span", { id: "mktPhase" }, "…"), h("span.clock", { id: "istClock" })),
          ccySel,
          h("button.theme-toggle", {
            title: "Toggle light / dark theme",
            onclick: (e) => {
              const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
              document.documentElement.dataset.theme = next;
              localStorage.setItem("myfin.theme", next);
              e.target.textContent = next === "light" ? "☾" : "☀︎";
              dispatch();               // charts re-render with the new palette
            },
          }, document.documentElement.dataset.theme === "light" ? "☾" : "☀︎"),
          h("button.theme-toggle", { title: "Data & AI connections (Upstox · FYERS · AIMLAPI)", onclick: connectionsModal }, "⚙"),
          h("div.avatar", { title: `${u.name} · click to switch persona`, onclick: () => { if (confirm("Switch persona?")) { localStorage.setItem("myfin.forcePicker", "1"); logout(); } } }, initials)))));

    app.appendChild(h("div.ticker-strip", h("div.ticker-inner", { id: "tickerStrip" }, h("span.tick-item", "loading market strip…"))));
    app.appendChild(h("main.page", h("div", { id: "view" })));
    app.appendChild(h("footer.site",
      h("div", { style: { marginBottom: "6px" } },
        h("a", { href: "/" }, "Home"), " · ", h("a", { href: "/learn" }, "Insights"), " · ",
        h("a", { href: "https://github.com/myfinancialria/myfinancial", rel: "noopener" }, "GitHub"), " · ",
        h("a", { href: "/sitemap.xml" }, "Sitemap")),
      h("div", `© ${new Date().getFullYear()} myfinancial · Educational demo platform. Synthetic feed by default — connect Upstox/FYERS for live NSE data (see README).`),
      h("div", "All analytics, signals and AI responses are informational only and do not constitute investment advice under SEBI (Investment Advisers) Regulations, 2013. Investments are subject to market risks. Documents encrypted with AES-256-GCM · DPDP-aligned data handling.")));

    window.Views.assistant.mount(app);   // floating AI drawer
  }

  // ---------------------------- live strip & clock ----------------------------
  function startClock() {
    const tick = () => {
      const ist = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
      const el = $("#istClock");
      if (el) el.textContent = `${ist.toTimeString().slice(0, 8)} IST`;
    };
    tick(); setInterval(tick, 1000);
  }

  async function refreshStatusStrip() {
    try {
      const ov = await api("/market/overview");
      const dot = $("#mktDot"), ph = $("#mktPhase");
      if (dot) dot.classList.toggle("open", ov.status.open);
      if (ph) ph.textContent = ov.status.open ? "NSE OPEN" : "NSE CLOSED";
      const items = [...ov.indices.slice(0, 8), ov.vix].filter(Boolean).map((q) =>
        h("span.tick-item", h("b", q.name), " ", fmtNum(q.ltp), " ",
          h("span", { class: pctCls(q.changePct) }, `${q.changePct > 0 ? "▲" : q.changePct < 0 ? "▼" : ""} ${Math.abs(q.changePct).toFixed(2)}%`)));
      const strip = $("#tickerStrip");
      if (strip) { strip.innerHTML = ""; [...items, ...items.map((i) => i.cloneNode(true))].forEach((i) => strip.appendChild(i)); }
    } catch { /* strip is cosmetic */ }
  }

  // ------------------------------- boot ---------------------------------------
  async function boot() {
    if (localStorage.getItem("myfin.forcePicker")) return renderLogin();
    if (!store.token) {
      try { await publicSession(); }                 // public mode: no login gate
      catch { return renderLogin(); }
    }
    try {
      store.user = await api("/me");
      store.fx = await api("/fx");
    } catch {
      try { await publicSession(); store.user = await api("/me"); store.fx = await api("/fx"); }
      catch { return renderLogin(); }
    }

    shell();
    startClock();
    connectWS();
    refreshStatusStrip();
    setInterval(refreshStatusStrip, 30000);

    route("dashboard", window.Views.dashboard);
    route("planning", window.Views.planning);
    route("funds", window.Views.funds);
    route("equities", window.Views.equities);
    route("advisory", window.Views.advisory);
    route("estate", window.Views.estate);
    if (!location.hash) location.hash = "#/dashboard";
    dispatch();
  }

  window.Views = window.Views || {};
  window.addEventListener("DOMContentLoaded", boot);
})();
