// ---------------------------------------------------------------------------
// vault.js — Secure Document Vault.
// AES-256-GCM authenticated encryption with a per-user key derived via scrypt
// from the server master secret. Ciphertext, IV and auth tag are stored; the
// plaintext never touches disk. PRODUCTION SWAP: replace deriveKey with a KMS
// (AWS KMS / GCP Cloud KMS) data-key per document + envelope encryption.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import { q, insert } from "../lib/db.js";
import { uid } from "../lib/util.js";

const MASTER = process.env.MYFIN_SECRET || "dev-only-secret-rotate-in-prod";
const keyCache = new Map();

function deriveKey(userId) {
  if (!keyCache.has(userId)) {
    keyCache.set(userId, crypto.scryptSync(MASTER, `vault:${userId}`, 32, { N: 16384, r: 8, p: 1 }));
  }
  return keyCache.get(userId);
}

export function storeDoc(userId, { name, category = "OTHER", mime = "application/octet-stream", dataBase64 }) {
  const plain = Buffer.from(dataBase64, "base64");
  if (plain.length > 3 * 1024 * 1024) throw new Error("File too large (max 3 MB in demo)");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(userId), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const doc = {
    id: uid("doc"), user_id: userId, name: String(name).slice(0, 120), category, mime,
    size: plain.length, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"),
    ciphertext: enc, created: Date.now(),
  };
  insert("vault_docs", doc);
  return { id: doc.id, name: doc.name, category, mime, size: doc.size, created: doc.created, encryption: "AES-256-GCM" };
}

export function listDocs(userId) {
  return q.all("SELECT id, name, category, mime, size, created FROM vault_docs WHERE user_id = ? ORDER BY created DESC", userId)
    .map((d) => ({ ...d, encryption: "AES-256-GCM" }));
}

export function readDoc(userId, docId) {
  const d = q.one("SELECT * FROM vault_docs WHERE id = ? AND user_id = ?", docId, userId);
  if (!d) return null;
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(userId), Buffer.from(d.iv, "base64"));
  decipher.setAuthTag(Buffer.from(d.tag, "base64"));
  const plain = Buffer.concat([decipher.update(d.ciphertext), decipher.final()]); // throws on tamper
  return { name: d.name, mime: d.mime, dataBase64: plain.toString("base64") };
}

export function deleteDoc(userId, docId) {
  q.run("DELETE FROM vault_docs WHERE id = ? AND user_id = ?", docId, userId);
  return { deleted: true };
}

export const VAULT_CATEGORIES = ["TAX_RETURNS", "PROPERTY_DEEDS", "INSURANCE_POLICIES", "KYC", "WILL", "BANK", "OTHER"];
