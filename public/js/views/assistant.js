/* ===========================================================================
   assistant.js — Module 6: context-aware AI drawer. Dual-RAG chat grounded in
   the client's own engines, with knowledge-base citations and follow-ups.
   =========================================================================== */
(() => {
  "use strict";
  const { h, api, store, md, toast } = window.MF;

  let drawer, body, fuRow, input, backdrop, mounted = false;

  function bubble(role, content, extra = {}) {
    const el = h(`div.msg.${role === "user" ? "user" : "bot"}`);
    if (role === "user") el.textContent = content;
    else el.innerHTML = md(content);
    if (extra.citations?.length) {
      el.appendChild(h("div.cite-row",
        h("span", { style: { fontSize: "10px", color: "var(--muted)" } }, "sources:"),
        extra.citations.map((c) => h("span.cite", { title: c.snippet }, c.title.length > 34 ? c.title.slice(0, 33) + "…" : c.title))));
    }
    return el;
  }

  function setFollowups(list) {
    fuRow.innerHTML = "";
    (list || []).slice(0, 3).forEach((f) => fuRow.appendChild(h("button.fu-btn", { onclick: () => send(f) }, f)));
  }

  async function send(text) {
    const q = (text ?? input.value).trim();
    if (!q) return;
    input.value = "";
    body.appendChild(bubble("user", q));
    const typing = h("div.msg.bot", h("div.typing", h("i"), h("i"), h("i")));
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;
    try {
      const r = await api("/assistant/ask", { body: { question: q } });
      typing.remove();
      body.appendChild(bubble("assistant", r.answer, { citations: r.citations }));
      setFollowups(r.followups);
    } catch (e) {
      typing.remove();
      body.appendChild(bubble("assistant", `⚠️ ${e.message}`));
    }
    body.scrollTop = body.scrollHeight;
  }

  async function loadHistory() {
    try {
      const hist = await api("/assistant/history");
      body.innerHTML = "";
      if (!hist.length) {
        body.appendChild(bubble("assistant",
          `Namaste **${store.user.name.split(" ")[0]}** 🙏 — I'm your myfinancial assistant.\n\nI answer from **your actual data** (net worth, goals, holdings, tax ledger) plus a knowledge base of SEBI, tax and FEMA rules. Every number I quote is computed by the platform engines, with sources cited.\n\nTry one of the prompts below.`));
        setFollowups([
          "Can I achieve my retirement goal?",
          "Which tax regime saves me more?",
          store.user.residency === "NRI" ? "Can I repatriate my NRO balance?" : "Harvest my LTCG tax-free?",
        ]);
      } else {
        for (const m2 of hist) body.appendChild(bubble(m2.role, m2.content));
        setFollowups(["What changed in my plan today?", "Which tax regime saves me more?", "Best flexi cap funds"]);
      }
      body.scrollTop = body.scrollHeight;
    } catch { /* drawer opens lazily */ }
  }

  function mount(appRoot) {
    if (mounted) return;
    mounted = true;
    backdrop = h("div.drawer-backdrop", { onclick: close });
    fuRow = h("div.ai-followups");
    body = h("div.ai-body");
    input = h("input.inp", { placeholder: "Ask about your goals, taxes, funds, stocks, NRI rules…", style: { flex: 1 }, onkeydown: (e) => e.key === "Enter" && send() });
    drawer = h("div.ai-drawer",
      h("div.ai-head",
        h("div", h("b", "✨ AI Assistant"), h("div", { style: { fontSize: "11px", color: "var(--text2)" } }, "dual-RAG · grounded in your financial context")),
        h("button.x-btn", { onclick: close }, "×")),
      body, fuRow,
      h("div.ai-input", input, h("button.btn.primary", { onclick: () => send() }, "Send")),
      h("div.ai-disc", "AI-generated information, not SEBI-registered investment advice. Verify before acting."));
    appRoot.appendChild(backdrop);
    appRoot.appendChild(drawer);
    appRoot.appendChild(h("button.ai-fab", { title: "AI Assistant (Module 6)", onclick: () => (drawer.classList.contains("open") ? close() : open()) }, "✨"));
    loadHistory();
  }

  function open(prefill) {
    drawer.classList.add("open");
    backdrop.classList.add("show");
    if (prefill) { setTimeout(() => send(prefill), 250); }
    else input.focus();
  }
  function close() {
    drawer.classList.remove("open");
    backdrop.classList.remove("show");
  }

  window.Views = window.Views || {};
  window.Views.assistant = { mount, open, close };
})();
