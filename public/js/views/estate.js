/* ===========================================================================
   estate.js — Module 1.4: interactive Will wizard with live draft preview,
   estate-readiness checklist, and the AES-256 encrypted document vault.
   =========================================================================== */
(() => {
  "use strict";
  const { h, api, del, store, fmtNum, toast, navigate, dispatch } = window.MF;

  const TABS = [["will", "📜 Will Preparation"], ["vault", "🔐 Document Vault"], ["checklist", "✅ Estate Readiness"]];

  async function render(rest) {
    const tab = rest?.[0] || "will";
    const body = h("div", { style: { marginTop: "16px" } });
    body.appendChild(h("div.skeleton", { style: { height: "380px" } }));
    ({ will: willTab, vault: vaultTab, checklist: checklistTab }[tab] || willTab)()
      .then((el) => { body.innerHTML = ""; body.appendChild(el); })
      .catch((e) => { body.innerHTML = ""; body.appendChild(h("div.card", h("div.empty", `⚠️ ${e.message}`))); });
    return h("div",
      h("div.page-head",
        h("div", h("div.page-title", "Will & Document Vault"), h("div.page-sub", "Guided Indian Will drafting · AES-256-GCM encrypted storage · succession readiness")),
        h("div.tabs", TABS.map(([id, label]) => h("button.tab", { class: id === tab ? "active" : "", onclick: () => navigate(`#/estate/${id}`) }, label)))),
      body);
  }

  // --------------------------------- will -------------------------------------
  async function willTab() {
    const existing = await api("/estate/will");
    const u = store.user;
    const meta = u.meta || {};
    const blank = {
      fullName: u.name, age: u.age, pan: meta.pan || "", address: meta.city || "", city: meta.city || "", occupation: meta.occupation || "",
      beneficiaries: [{ name: "", relation: "", age: "" }],
      assets: [{ type: "REAL_ESTATE", description: "", beneficiary: "", sharePct: 100 }],
      executor: { name: "", relation: "", address: "" }, alternateExecutor: { name: "", relation: "" },
      guardian: { name: "", relation: "", address: "" }, residuaryBeneficiary: "", specialInstructions: "",
      witness1: { name: "", address: "" }, witness2: { name: "", address: "" },
    };
    // merge saved data over the blank scaffold so every nested object exists
    const saved = existing?.data && Object.keys(existing.data).length ? existing.data : {};
    const data = { ...blank, ...saved };
    for (const k of ["executor", "alternateExecutor", "guardian", "witness1", "witness2"]) data[k] = { ...blank[k], ...(saved[k] || {}) };
    if (!Array.isArray(data.beneficiaries) || !data.beneficiaries.length) data.beneficiaries = blank.beneficiaries;
    if (!Array.isArray(data.assets) || !data.assets.length) data.assets = blank.assets;

    const preview = h("div.will-paper", existing?.draft || "Fill the wizard and press “Generate draft” — your Will renders here in real time.");
    const inp = (obj, key, ph, attrs = {}) => h("input.inp", { value: obj[key] ?? "", placeholder: ph, oninput: (e) => (obj[key] = e.target.value), ...attrs });

    const beneList = h("div", { style: { display: "grid", gap: "8px" } });
    const paintBene = () => {
      beneList.innerHTML = "";
      data.beneficiaries.forEach((b, i) => beneList.appendChild(
        h("div", { style: { display: "grid", gridTemplateColumns: "2fr 1.4fr 0.8fr auto", gap: "8px" } },
          inp(b, "name", "Full name"), inp(b, "relation", "Relation (Wife/Son/…)"), inp(b, "age", "Age", { type: "number" }),
          h("button.btn.sm.danger", { onclick: () => { data.beneficiaries.splice(i, 1); paintBene(); } }, "×"))));
      beneList.appendChild(h("button.btn.sm", { onclick: () => { data.beneficiaries.push({ name: "", relation: "", age: "" }); paintBene(); } }, "+ beneficiary"));
    };
    paintBene();

    const assetList = h("div", { style: { display: "grid", gap: "8px" } });
    const ASSET_TYPES = ["REAL_ESTATE", "BANK_ACCOUNTS", "DEMAT_MF", "GOLD_JEWELLERY", "VEHICLE", "BUSINESS", "DIGITAL_ASSETS", "OTHER"];
    const paintAssets = () => {
      assetList.innerHTML = "";
      data.assets.forEach((a, i) => assetList.appendChild(
        h("div", { style: { display: "grid", gridTemplateColumns: "1.2fr 2fr 1.4fr .7fr auto", gap: "8px" } },
          h("select.ctl", { onchange: (e) => (a.type = e.target.value) }, ASSET_TYPES.map((t) => h("option", { value: t, selected: t === a.type ? "" : null }, t.replace(/_/g, " ")))),
          inp(a, "description", "Description (e.g. Flat 1802, Powai)"), inp(a, "beneficiary", "Goes to (name)"), inp(a, "sharePct", "%", { type: "number" }),
          h("button.btn.sm.danger", { onclick: () => { data.assets.splice(i, 1); paintAssets(); } }, "×"))));
      assetList.appendChild(h("button.btn.sm", { onclick: () => { data.assets.push({ type: "OTHER", description: "", beneficiary: "", sharePct: 100 }); paintAssets(); } }, "+ asset"));
    };
    paintAssets();

    const generate = async () => {
      const saved = await api("/estate/will", { body: { data } });
      preview.textContent = saved.draft;
      toast("Draft generated & saved");
      return saved;
    };

    const form = h("div.grid", { style: { gap: "14px", alignContent: "start" } },
      h("div.card",
        h("div.card-title", { style: { marginBottom: "10px" } }, "1 · Testator"),
        h("div.grid.cols-2", { style: { gap: "8px" } },
          inp(data, "fullName", "Full legal name"), inp(data, "age", "Age", { type: "number" }),
          inp(data, "pan", "PAN"), inp(data, "occupation", "Occupation"),
          inp(data, "address", "Residential address"), inp(data, "city", "City of signing"))),
      h("div.card", h("div.card-title", { style: { marginBottom: "10px" } }, "2 · Beneficiaries"), beneList),
      h("div.card", h("div.card-title", { style: { marginBottom: "10px" } }, "3 · Asset distribution"), assetList,
        h("div.field", { style: { marginTop: "10px" } }, h("label.lbl", "Residuary estate goes to"), inp(data, "residuaryBeneficiary", "Everything not listed above"))),
      h("div.card",
        h("div.card-title", { style: { marginBottom: "10px" } }, "4 · Executor & guardianship"),
        h("div.grid.cols-3", { style: { gap: "8px" } },
          inp(data.executor, "name", "Executor name"), inp(data.executor, "relation", "Relation"), inp(data.executor, "address", "Executor address")),
        h("div.grid.cols-2", { style: { gap: "8px", marginTop: "8px" } },
          inp(data.alternateExecutor, "name", "Alternate executor (optional)"), inp(data.alternateExecutor, "relation", "Relation")),
        h("div.card-sub", { style: { margin: "10px 0 6px" } }, "GUARDIAN FOR MINOR CHILDREN (if any)"),
        h("div.grid.cols-3", { style: { gap: "8px" } },
          inp(data.guardian, "name", "Guardian name"), inp(data.guardian, "relation", "Relation"), inp(data.guardian, "address", "Guardian address"))),
      h("div.card",
        h("div.card-title", { style: { marginBottom: "10px" } }, "5 · Witnesses & special instructions"),
        h("div.grid.cols-2", { style: { gap: "8px" } },
          inp(data.witness1, "name", "Witness 1 name"), inp(data.witness1, "address", "Witness 1 address"),
          inp(data.witness2, "name", "Witness 2 name"), inp(data.witness2, "address", "Witness 2 address")),
        h("textarea.inp", { rows: 3, placeholder: "Special instructions (organ donation, digital accounts, pet care…)", style: { marginTop: "8px" }, oninput: (e) => (data.specialInstructions = e.target.value) }, data.specialInstructions || "")),
      h("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } },
        h("button.btn.primary", { onclick: generate }, "⚙️ Generate draft"),
        h("button.btn.green", {
          onclick: async () => {
            const saved = await generate();
            const blob = new Blob([saved.draft], { type: "text/plain;charset=utf-8" });
            const a = h("a", { href: URL.createObjectURL(blob), download: `Will_${(data.fullName || "draft").replace(/\s+/g, "_")}.txt` });
            document.body.appendChild(a); a.click(); a.remove();
          },
        }, "⬇️ Download .txt"),
        h("button.btn", {
          onclick: async () => {
            const saved = await generate();
            await api("/vault/upload", { body: { name: `Will_${new Date().toISOString().slice(0, 10)}.txt`, category: "WILL", mime: "text/plain", dataBase64: btoa(unescape(encodeURIComponent(saved.draft))) } });
            toast("Encrypted copy stored in vault 🔐");
          },
        }, "🔐 Save to vault")));

    return h("div.grid.cols-2",
      form,
      h("div.card", { style: { alignSelf: "start", position: "sticky", top: "86px" } },
        h("div.card-head", h("div", h("div.card-title", "Live draft preview"), h("div.card-sub", existing ? `last saved ${new Date(existing.updated).toLocaleString("en-IN")}` : "unsigned draft — review with a lawyer"))),
        preview,
        h("div.disclaimer", "Valid Indian Will essentials: sound mind, signature, TWO non-beneficiary witnesses. Registration optional (recommended). Nominations don't override a Will — keep them aligned.")));
  }

  // --------------------------------- vault ------------------------------------
  async function vaultTab() {
    const { docs, categories } = await api("/vault/list");
    const catSel = h("select.ctl", categories.map((c) => h("option", { value: c }, c.replace(/_/g, " "))));
    const file = h("input", { type: "file", style: { display: "none" } });
    const drop = h("div.drop-zone",
      h("div", { style: { fontSize: "26px" } }, "🔐"),
      h("div", { style: { marginTop: "6px" } }, "Drop a file or click to upload — encrypted with AES-256-GCM before it touches the database"),
      h("div.dim", { style: { fontSize: "11px", marginTop: "4px" } }, "tax returns · property deeds · policies · KYC · max 3 MB"));
    drop.onclick = () => file.click();
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); };
    file.onchange = () => file.files[0] && upload(file.files[0]);

    async function upload(f) {
      if (f.size > 3 * 1024 * 1024) return toast("Max 3 MB in demo", true);
      const buf = await f.arrayBuffer();
      let bin = ""; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await api("/vault/upload", { body: { name: f.name, category: catSel.value, mime: f.type || "application/octet-stream", dataBase64: btoa(bin) } });
      toast(`"${f.name}" encrypted & stored`);
      dispatch();
    }

    async function download(d) {
      const doc = await api(`/vault/doc/${d.id}`);
      const bytes = Uint8Array.from(atob(doc.dataBase64), (c) => c.charCodeAt(0));
      const a = h("a", { href: URL.createObjectURL(new Blob([bytes], { type: doc.mime })), download: doc.name });
      document.body.appendChild(a); a.click(); a.remove();
    }

    const CAT_ICON = { TAX_RETURNS: "🧾", PROPERTY_DEEDS: "🏠", INSURANCE_POLICIES: "🛡️", KYC: "🪪", WILL: "📜", BANK: "🏦", OTHER: "📄" };
    return h("div.grid.cols-32",
      h("div.card",
        h("div.card-head",
          h("div", h("div.card-title", "🔐 Cloud Vault"), h("div.card-sub", `${docs.length} encrypted documents · per-user scrypt-derived keys`)),
          h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, h("label.lbl", { style: { margin: 0 } }, "Category"), catSel)),
        drop, file,
        h("div.divider"),
        docs.length ? h("div", { style: { display: "grid", gap: "8px" } },
          docs.map((d) => h("div", { style: { display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: "var(--bg2)", borderRadius: "10px", border: "1px solid var(--border)" } },
            h("div", { style: { fontSize: "20px" } }, CAT_ICON[d.category] || "📄"),
            h("div", { style: { flex: 1, minWidth: 0 } },
              h("div", { style: { fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis" } }, d.name),
              h("div.dim", { style: { fontSize: "11px" } }, `${d.category.replace(/_/g, " ")} · ${(d.size / 1024).toFixed(1)} KB · ${new Date(d.created).toLocaleDateString("en-IN")} · ${d.encryption}`)),
            h("span.chip.up", "🔒 AES-256"),
            h("button.btn.sm", { onclick: () => download(d) }, "Decrypt ⬇"),
            h("button.btn.sm.danger", { onclick: async () => { if (confirm(`Delete "${d.name}"?`)) { await del(`/vault/doc/${d.id}`); toast("Deleted"); dispatch(); } } }, "×"))))
          : h("div.empty", "Vault is empty — upload your first document above.")),
      h("div.card", { style: { alignSelf: "start" } },
        h("div.card-title", { style: { marginBottom: "12px" } }, "How the vault protects you"),
        [["AES-256-GCM", "Authenticated encryption — tampered ciphertext fails to decrypt."],
         ["Per-user keys", "scrypt(master, user-salt) → unique key per client; KMS envelope encryption in production."],
         ["Zero plaintext at rest", "Only IV + auth tag + ciphertext are stored."],
         ["TLS 1.3 in transit", "Terminated at the edge proxy in production."],
         ["DPDP-aligned", "Consent-based processing, right to erasure, breach notification duty."]].map(([t, b]) =>
          h("div", { style: { padding: "9px 0", borderBottom: "1px dashed var(--border)" } }, h("b", t), h("div.dim", { style: { fontSize: "12px", marginTop: "2px" } }, b))),
        h("div.lock-note", { style: { marginTop: "12px" } }, "🔒 Deleting a document destroys its ciphertext immediately.")));
  }

  // ------------------------------- checklist ----------------------------------
  async function checklistTab() {
    const items = await api("/estate/checklist");
    const done = items.filter((i) => i.done).length;
    return h("div.grid.cols-32",
      h("div.card",
        h("div.card-head", h("div", h("div.card-title", "✅ Estate readiness"), h("div.card-sub", `${done}/${items.length} complete`))),
        h("div.bar.green", { style: { marginBottom: "14px" } }, h("i", { style: { width: `${(done / items.length) * 100}%` } })),
        items.map((i) => h("div", { style: { display: "flex", gap: "12px", padding: "12px 0", borderBottom: "1px dashed var(--border)" } },
          h("div", { style: { fontSize: "18px" } }, i.done ? "✅" : i.manual ? "🔲" : "⚠️"),
          h("div", h("b", i.item, i.manual ? h("span.chip", { style: { marginLeft: "8px" } }, "self-attest") : null),
            h("div.dim", { style: { fontSize: "12.5px", marginTop: "2px" } }, i.why))))),
      h("div.card", { style: { alignSelf: "start" } },
        h("div.card-title", { style: { marginBottom: "10px" } }, "Succession quick-facts"),
        [["No estate tax in India", "Estate duty was abolished in 1985 — but succession friction is real; a Will removes it."],
         ["Nominee ≠ heir", "A nominee holds assets in trust for legal heirs; the Will governs ownership."],
         ["Two witnesses", "Mandatory for validity; they must not be beneficiaries."],
         ["Probate", "Needed mainly in Mumbai/Kolkata/Chennai jurisdictions or for immovable property there."]].map(([t, b]) =>
          h("div", { style: { padding: "9px 0", borderBottom: "1px dashed var(--border)" } }, h("b", t), h("div.dim", { style: { fontSize: "12px", marginTop: "2px" } }, b)))));
  }

  window.Views = window.Views || {};
  window.Views.estate = render;
})();
