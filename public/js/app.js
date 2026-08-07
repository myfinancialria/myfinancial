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
      if (user.residency === "NRI" && localStorage.getItem("myfin.ccy") === null) {
        store.currency = user.currency; localStorage.setItem("myfin.ccy", user.currency);
      }
      boot();
    } catch (e) { toast(e.message, true); }
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
          h("div.avatar", { title: `${u.name} · click to switch persona`, onclick: () => { if (confirm("Switch persona / sign out?")) logout(); } }, initials)))));

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
    if (!store.token) return renderLogin();
    try {
      store.user = await api("/me");
      store.fx = await api("/fx");
    } catch { return renderLogin(); }

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
