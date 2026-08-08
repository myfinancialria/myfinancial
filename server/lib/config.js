// ---------------------------------------------------------------------------
// config.js — runtime configuration with two layers:
//   1. environment variables (highest precedence, ops-controlled)
//   2. the encrypted `settings` table (set from the in-app Connections panel)
// Secrets are AES-256-GCM encrypted at rest with a scrypt-derived system key.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { q, insert } from "./db.js";

// ---- .env auto-load (no dependency): keys live in the repo FOLDER, never in
// git — .env is gitignored; commit .env.example with placeholders instead.
try {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
  if (fs.existsSync(envPath)) {
    let loaded = 0;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !m[1].startsWith("#") && !process.env[m[1]]) { process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); loaded++; }
    }
    if (loaded) console.log(`  config: loaded ${loaded} value(s) from .env`);
  }
} catch { /* .env is optional */ }

const MASTER = process.env.MYFIN_SECRET || "dev-only-secret-rotate-in-prod";
const KEY = crypto.scryptSync(MASTER, "settings:v1", 32, { N: 16384, r: 8, p: 1 });

const KNOWN = ["MYFIN_PROVIDER", "UPSTOX_ACCESS_TOKEN", "FYERS_APP_ID", "FYERS_ACCESS_TOKEN", "AIMLAPI_KEY", "AIMLAPI_MODEL"];
const SECRET_KEYS = new Set(["UPSTOX_ACCESS_TOKEN", "FYERS_ACCESS_TOKEN", "AIMLAPI_KEY"]);

const cache = new Map();

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return `enc:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}
function decrypt(stored) {
  if (!String(stored).startsWith("enc:")) return stored;
  const [, iv, tag, data] = String(stored).split(":");
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** Effective value: env var wins, else encrypted DB setting, else null. */
export function cfg(key) {
  if (process.env[key]) return process.env[key];
  if (cache.has(key)) return cache.get(key);
  try {
    const row = q.one("SELECT value FROM settings WHERE key = ?", key);
    const val = row ? decrypt(row.value) : null;
    cache.set(key, val);
    return val;
  } catch { return null; }
}

export function setCfg(key, value) {
  if (!KNOWN.includes(key)) throw new Error(`Unknown setting ${key}`);
  const v = String(value ?? "").trim();
  if (!v) { q.run("DELETE FROM settings WHERE key = ?", key); cache.delete(key); return { key, cleared: true }; }
  insert("settings", { key, value: SECRET_KEYS.has(key) ? encrypt(v) : v, updated: Date.now() });
  cache.set(key, v);
  return { key, saved: true };
}

const mask = (v) => (!v ? null : v.length <= 8 ? "••••" : `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} chars)`);

/** Masked snapshot for the Connections UI — secrets never leave the server. */
export function connectionsStatus() {
  const val = (k) => cfg(k);
  return {
    provider: val("MYFIN_PROVIDER") || "synthetic",
    upstox: { configured: !!val("UPSTOX_ACCESS_TOKEN"), token: mask(val("UPSTOX_ACCESS_TOKEN")), fromEnv: !!process.env.UPSTOX_ACCESS_TOKEN },
    fyers: { configured: !!(val("FYERS_APP_ID") && val("FYERS_ACCESS_TOKEN")), appId: val("FYERS_APP_ID") || null, token: mask(val("FYERS_ACCESS_TOKEN")), fromEnv: !!process.env.FYERS_ACCESS_TOKEN },
    aimlapi: { configured: !!val("AIMLAPI_KEY"), key: mask(val("AIMLAPI_KEY")), model: val("AIMLAPI_MODEL") || "gpt-4o-mini", fromEnv: !!process.env.AIMLAPI_KEY },
  };
}
