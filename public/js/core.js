/* ===========================================================================
   core.js — SPA foundation: dom builder, store, api client, router, INR/fx
   formatting, websocket, toasts, markdown-lite.
   =========================================================================== */
(() => {
  "use strict";

  // ------------------------------ dom ---------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /** h('div.card', {onclick}, child1, child2 …) — hyperscript-lite */
  function h(tag, attrs, ...children) {
    if (attrs && (typeof attrs !== "object" || Array.isArray(attrs) || attrs instanceof Node)) { children.unshift(attrs); attrs = null; }
    const [name, ...classes] = tag.split(".");
    const el = document.createElement(name || "div");
    if (classes.length) el.className = classes.join(" ");
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "class") el.className += (el.className ? " " : "") + v;
      else el.setAttribute(k, v);
    }
    const append = (c) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) return c.forEach(append);
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    children.forEach(append);
    return el;
  }

  // ------------------------------ store --------------------------------------
  const store = {
    token: localStorage.getItem("myfin.token") || null,
    user: null,
    currency: localStorage.getItem("myfin.ccy") || "INR",
    fx: { INR: 1, USD: 87.4, AED: 23.8, SGD: 65.2, GBP: 111.5, EUR: 95.3 },
    quotes: new Map(),           // live quote cache (WS-fed)
    _subs: new Map(),
    on(evt, fn) { (this._subs.get(evt) || this._subs.set(evt, new Set()).get(evt)).add(fn); return () => this._subs.get(evt)?.delete(fn); },
    emit(evt, data) { this._subs.get(evt)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },
  };

  // ------------------------------ api ----------------------------------------
  async function api(path, opts = {}) {
    const res = await fetch(`/api${path}`, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      headers: { ...(opts.body ? { "content-type": "application/json" } : {}), ...(store.token ? { authorization: `Bearer ${store.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    if (res.status === 401) { logout(false); throw new Error("Session expired — please sign in again"); }
    if (!json.ok) throw new Error(json.error || "Request failed");
    return json.data;
  }
  const del = (path) => api(path, { method: "DELETE" });

  function logout(reload = true) {
    localStorage.removeItem("myfin.token");
    store.token = null; store.user = null;
    if (reload) location.reload();
  }

  // --------------------------- number formatting ------------------------------
  const CCY_SYM = { INR: "₹", USD: "$", AED: "د.إ", SGD: "S$", GBP: "£", EUR: "€" };

  /** Convert INR → active display currency. */
  const cx = (inr) => inr / (store.fx[store.currency] || 1);

  /** Compact: ₹1.24 Cr / ₹23.5 L / ₹85,400 — converted ccy uses K/M/B. */
  function fmtMoney(inr, { compact = true, digits = 0 } = {}) {
    if (inr === null || inr === undefined || isNaN(inr)) return "—";
    const sign = inr < 0 ? "−" : "";
    const v = Math.abs(cx(inr));
    const sym = CCY_SYM[store.currency];
    if (!compact) return sign + sym + v.toLocaleString(store.currency === "INR" ? "en-IN" : "en-US", { maximumFractionDigits: digits });
    if (store.currency === "INR") {
      if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(v >= 1e9 ? 0 : 2)} Cr`;
      if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(v >= 1e6 ? 1 : 2)} L`;
      if (v >= 1000) return `${sign}₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
      return `${sign}₹${v.toFixed(digits)}`;
    }
    if (v >= 1e9) return `${sign}${sym}${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${sign}${sym}${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${sign}${sym}${(v / 1e3).toFixed(1)}K`;
    return `${sign}${sym}${v.toFixed(digits)}`;
  }

  const fmtNum = (x, d = 2) => (x === null || x === undefined || isNaN(x) ? "—" : Number(x).toLocaleString("en-IN", { maximumFractionDigits: d }));
  const fmtPct = (x, d = 2, signed = true) => (x === null || x === undefined || isNaN(x) ? "—" : `${signed && x > 0 ? "+" : ""}${Number(x).toFixed(d)}%`);
  const pctCls = (x) => (x > 0 ? "up-t" : x < 0 ? "down-t" : "dim");
  const fmtVol = (v) => (v >= 1e7 ? (v / 1e7).toFixed(1) + " Cr" : v >= 1e5 ? (v / 1e5).toFixed(1) + " L" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(v ?? "—"));
  const fmtDate = (tsSec) => new Date(tsSec * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });

  // ------------------------------ router --------------------------------------
  const routes = {};
  let currentView = null;
  function route(name, renderFn) { routes[name] = renderFn; }
  function navigate(hash) { location.hash = hash; }
  async function dispatch() {
    const [name, ...rest] = location.hash.replace(/^#\/?/, "").split("/");
    const fn = routes[name] || routes.dashboard;
    const main = $("#view");
    if (!main) return;
    currentView = name || "dashboard";
    window.scrollTo(0, 0);
    $$(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.route === (routes[name] ? name : "dashboard")));
    main.innerHTML = "";
    main.appendChild(h("div.grid", { style: { gap: "16px" } }, h("div.skeleton", { style: { height: "120px" } }), h("div.skeleton", { style: { height: "300px" } })));
    try {
      const el = await fn(rest);
      if (currentView !== (name || "dashboard")) return; // stale render guard
      main.innerHTML = "";
      main.appendChild(el);
    } catch (e) {
      console.error(e);
      main.innerHTML = "";
      main.appendChild(h("div.card", h("div.empty", `⚠️ ${e.message}`)));
    }
  }
  window.addEventListener("hashchange", dispatch);
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // ------------------------------ websocket -----------------------------------
  let ws = null, wsRetry = 0;
  function connectWS() {
    try { ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`); }
    catch { return; }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "ticks") {
          for (const q of msg.data) store.quotes.set(q.symbol, q);
          store.emit("ticks", msg.data);
        }
      } catch { /* ignore */ }
    };
    ws.onopen = () => { wsRetry = 0; };
    ws.onclose = () => { setTimeout(connectWS, Math.min(15000, 1000 * 2 ** wsRetry++)); };
  }

  // ------------------------------ toast ---------------------------------------
  function toast(msg, isErr = false) {
    let wrapEl = $(".toast-wrap") || document.body.appendChild(h("div.toast-wrap"));
    const t = h(`div.toast${isErr ? ".err" : ""}`, msg);
    wrapEl.appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }

  // --------------------------- markdown-lite ----------------------------------
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function md(text) {
    const lines = String(text).split("\n");
    let html = "", inUl = false, inTable = false;
    const flush = () => { if (inUl) { html += "</ul>"; inUl = false; } if (inTable) { html += "</table>"; inTable = false; } };
    const inline = (s) => esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/_(.+?)_/g, "<i>$1</i>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^\|/.test(line)) {
        if (/^\|[\s:|-]+\|$/.test(line)) continue;              // separator row
        if (!inTable) { flush(); html += "<table>"; inTable = true; }
        const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
        html += `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
        continue;
      }
      if (/^- /.test(line)) { if (inTable) flush(); if (!inUl) { html += "<ul>"; inUl = true; } html += `<li>${inline(line.slice(2))}</li>`; continue; }
      flush();
      if (/^### /.test(line)) html += `<p><b>${inline(line.slice(4))}</b></p>`;
      else if (/^## /.test(line)) html += `<p><b>${inline(line.slice(3))}</b></p>`;
      else if (line === "") html += "";
      else html += `<p>${inline(line)}</p>`;
    }
    flush();
    return html;
  }

  // ------------------------------ misc ----------------------------------------
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const stars = (n) => { const el = h("span.stars"); el.innerHTML = "★".repeat(n) + `<span class="off">${"★".repeat(5 - n)}</span>`; return el; };
  function modal(title, content, { width } = {}) {
    const back = h("div.modal-back", { onclick: (e) => { if (e.target === back) back.remove(); } },
      h("div.modal", width ? { style: { width } } : null,
        h("div.modal-head", h("div.modal-title", title), h("button.x-btn", { onclick: () => back.remove() }, "×")),
        content));
    document.body.appendChild(back);
    return back;
  }

  window.MF = { $, $$, h, store, api, del, logout, fmtMoney, fmtNum, fmtPct, pctCls, fmtVol, fmtDate, route, navigate, dispatch, connectWS, toast, md, esc, debounce, stars, modal, CCY_SYM };
})();
