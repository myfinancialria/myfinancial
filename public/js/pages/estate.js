// ---------------------------------------------------------------------------
// estate.js — Will wizard and encrypted vault, entirely client-side.
//
// The draft is produced by shared/estate.mjs — the same generator the server
// uses. The vault uses the Web Crypto API: a passphrase is stretched with
// PBKDF2 into an AES-256-GCM key that exists only in memory. Nothing is
// uploaded, and there is no recovery path, which is the correct trade for
// documents like these.
// ---------------------------------------------------------------------------
import { generateDraft, estateChecklist } from "./estate.mjs";

const $ = (id) => document.getElementById(id);
const WILL_KEY = "myfin.will.v1";
const VAULT_KEY = "myfin.vault.v1";

// ================================ Will wizard ===============================
let W = load();

function load() {
  try { return JSON.parse(localStorage.getItem(WILL_KEY)) || seed(); } catch { return seed(); }
}
function seed() {
  return { beneficiaries: [{ name: "", relation: "", age: "" }], assets: [{ type: "", description: "", beneficiary: "", sharePct: "" }] };
}
const saveWill = () => { try { localStorage.setItem(WILL_KEY, JSON.stringify(W)); } catch { /* private mode */ } };

/** Read/write "executor.name" style paths so the markup stays declarative. */
function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
}
function setPath(obj, path, value) {
  const parts = path.split(".");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = value;
}

function renderRows() {
  $("beneList").innerHTML = (W.beneficiaries || []).map((b, i) =>
    '<div class="rowitem">'
    + '<input type="text" placeholder="Name" value="' + esc(b.name) + '" data-bene="' + i + '.name">'
    + '<input type="text" placeholder="Relation" value="' + esc(b.relation) + '" data-bene="' + i + '.relation">'
    + '<input type="number" placeholder="Age" value="' + esc(b.age) + '" data-bene="' + i + '.age">'
    + '<button class="xbtn" data-delbene="' + i + '">&times;</button></div>').join("");

  $("assetList").innerHTML = (W.assets || []).map((a, i) =>
    '<div class="rowitem">'
    + '<input type="text" placeholder="Type (flat, shares…)" value="' + esc(a.type) + '" data-asset="' + i + '.type">'
    + '<input type="text" placeholder="Description" value="' + esc(a.description) + '" data-asset="' + i + '.description">'
    + '<input type="text" placeholder="Goes to" value="' + esc(a.beneficiary) + '" data-asset="' + i + '.beneficiary">'
    + '<input type="number" placeholder="Share %" value="' + esc(a.sharePct) + '" data-asset="' + i + '.sharePct">'
    + '<button class="xbtn" data-delasset="' + i + '">&times;</button></div>').join("");

  // rebind the freshly written rows
  document.querySelectorAll("[data-bene]").forEach((el) => {
    el.oninput = () => {
      const [i, f] = el.dataset.bene.split(".");
      W.beneficiaries[i][f] = el.value; saveWill(); renderDraft();
    };
  });
  document.querySelectorAll("[data-asset]").forEach((el) => {
    el.oninput = () => {
      const [i, f] = el.dataset.asset.split(".");
      W.assets[i][f] = el.value; saveWill(); renderDraft();
    };
  });
  document.querySelectorAll("[data-delbene]").forEach((el) => {
    el.onclick = () => { W.beneficiaries.splice(Number(el.dataset.delbene), 1); saveWill(); renderRows(); renderDraft(); };
  });
  document.querySelectorAll("[data-delasset]").forEach((el) => {
    el.onclick = () => { W.assets.splice(Number(el.dataset.delasset), 1); saveWill(); renderRows(); renderDraft(); };
  });
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function renderDraft() {
  $("willDraft").textContent = generateDraft(W);
  renderChecklist();
}

// ============================== Estate checklist ============================
function renderChecklist() {
  const hasWill = !!(W.fullName && W.executor?.name && (W.assets || []).some((a) => a.description));
  const cats = [...new Set(vaultDocs.map((d) => d.category))];
  const items = estateChecklist({ hasWill, vaultCategories: cats, residency: "RESIDENT" });
  const done = items.filter((i) => i.done).length;
  $("checkScore").textContent = done + " of " + items.length + " done";
  $("checkList").innerHTML = items.map((i) =>
    '<div class="check"><div class="box' + (i.done ? " done" : "") + '">' + (i.done ? "✓" : "") + "</div>"
    + "<div><b>" + i.item + "</b>" + (i.manual ? ' <span class="sig">check yourself</span>' : "")
    + '<div class="dim" style="font-size:12.5px;line-height:1.65;margin-top:3px">' + i.why + "</div></div></div>").join("");
}

// ================================== Vault ===================================
// PBKDF2 → AES-GCM. The key lives only in this variable, never on disk.
let vaultKey = null;
let vaultDocs = [];

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    // 210,000 rounds is the current OWASP guidance for PBKDF2-HMAC-SHA256
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

function readVault() {
  try { return JSON.parse(localStorage.getItem(VAULT_KEY)); } catch { return null; }
}

async function unlock(passphrase) {
  const existing = readVault();
  const salt = existing ? unb64(existing.salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);

  if (existing) {
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(existing.iv) }, key, unb64(existing.data),
      );
      vaultDocs = JSON.parse(dec.decode(plain));
    } catch {
      // AES-GCM authenticates, so a wrong passphrase fails here rather than
      // silently returning garbage.
      return false;
    }
  } else {
    vaultDocs = [];
    await persist(key, salt);
  }
  vaultKey = { key, salt };
  return true;
}

async function persist(key = vaultKey?.key, salt = vaultKey?.salt) {
  if (!key) return;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(vaultDocs)));
  localStorage.setItem(VAULT_KEY, JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), data: b64(data) }));
}

function renderDocs() {
  $("docTbl").innerHTML = vaultDocs.length
    ? vaultDocs.map((d, i) =>
      "<tr><td>" + d.category.replace(/_/g, " ") + "</td><td><b>" + esc(d.title) + "</b></td>"
      + '<td class="dim" style="white-space:normal;max-width:420px">' + esc(d.body || "") + "</td>"
      + "<td>" + new Date(d.at).toLocaleDateString("en-IN") + "</td>"
      + '<td><button class="xbtn" data-deldoc="' + i + '">&times;</button></td></tr>').join("")
    : '<tr><td colspan="5" class="dim" style="padding:22px 14px">Nothing stored yet.</td></tr>';
  document.querySelectorAll("[data-deldoc]").forEach((el) => {
    el.onclick = async () => {
      vaultDocs.splice(Number(el.dataset.deldoc), 1);
      await persist(); renderDocs(); renderChecklist();
    };
  });
}

function showVault(open) {
  $("vaultLocked").hidden = open;
  $("vaultOpen").hidden = !open;
}

// ---------------------------------- boot ------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tabbtn").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".tabbtn").forEach((x) => x.classList.toggle("on", x === b));
      document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    };
  });

  // plain fields
  document.querySelectorAll("[data-will]").forEach((el) => {
    const v = getPath(W, el.dataset.will);
    if (v !== undefined && v !== null) el.value = v;
    el.oninput = () => { setPath(W, el.dataset.will, el.value); saveWill(); renderDraft(); };
  });

  $("addBene").onclick = () => { (W.beneficiaries ||= []).push({ name: "", relation: "", age: "" }); saveWill(); renderRows(); renderDraft(); };
  $("addAsset").onclick = () => { (W.assets ||= []).push({ type: "", description: "", beneficiary: "", sharePct: "" }); saveWill(); renderRows(); renderDraft(); };
  $("printWill").onclick = () => window.print();
  $("downloadWill").onclick = () => {
    const blob = new Blob([generateDraft(W)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "will-draft-" + new Date().toISOString().slice(0, 10) + ".txt";
    a.click(); URL.revokeObjectURL(a.href);
  };

  $("vaultHint").textContent = readVault()
    ? "A vault already exists in this browser — enter its passphrase to open it."
    : "No vault yet. The passphrase you choose now becomes the only way in.";

  $("vaultUnlock").onclick = async () => {
    const pass = $("vaultPass").value;
    if (pass.length < 8) { $("vaultHint").textContent = "Use at least 8 characters."; return; }
    $("vaultUnlock").disabled = true; $("vaultUnlock").textContent = "Deriving key…";
    const ok = await unlock(pass);
    $("vaultUnlock").disabled = false; $("vaultUnlock").textContent = "Unlock";
    if (!ok) { $("vaultHint").textContent = "That passphrase does not decrypt this vault."; return; }
    $("vaultPass").value = "";
    showVault(true); renderDocs(); renderChecklist();
  };
  $("vaultPass").addEventListener("keydown", (e) => { if (e.key === "Enter") $("vaultUnlock").click(); });

  $("vaultLock").onclick = () => { vaultKey = null; vaultDocs = []; showVault(false); renderChecklist(); };

  $("docAdd").onclick = async () => {
    const title = $("docTitle").value.trim();
    if (!title) return;
    vaultDocs.push({ category: $("docCat").value, title, body: $("docBody").value.trim(), at: Date.now() });
    await persist();
    $("docTitle").value = ""; $("docBody").value = "";
    renderDocs(); renderChecklist();
  };

  $("vaultExport").onclick = () => {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return;
    const blob = new Blob([raw], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "myfinancial-vault-encrypted-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click(); URL.revokeObjectURL(a.href);
  };

  renderRows();
  renderDraft();
});
