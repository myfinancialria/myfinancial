/* ---------------------------------------------------------------------------
   The vault's crypto.

   A passphrase is stretched with PBKDF2-HMAC-SHA256 (210,000 rounds, current
   OWASP guidance) into an AES-256-GCM key that exists only in memory. The
   ciphertext goes to localStorage; the key never does.

   There is no recovery path. For documents like these that is the correct
   trade — a reset link would mean someone else could use it too.
--------------------------------------------------------------------------- */

export const VAULT_KEY = "myfin.vault.v1";

export interface VaultDoc { category: string; title: string; body: string; at: number }
interface Blob { v: 1; salt: string; iv: string; data: string }

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 210000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export const vaultExists = () => localStorage.getItem(VAULT_KEY) !== null;

function read(): Blob | null {
  try { return JSON.parse(localStorage.getItem(VAULT_KEY) || "null"); } catch { return null; }
}

export interface OpenVault { key: CryptoKey; salt: Uint8Array; docs: VaultDoc[] }

/** Returns null when the passphrase does not decrypt an existing vault. */
export async function unlock(passphrase: string): Promise<OpenVault | null> {
  const existing = read();
  const salt = existing ? unb64(existing.salt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);

  if (existing) {
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(existing.iv) as BufferSource }, key, unb64(existing.data) as BufferSource,
      );
      // AES-GCM authenticates, so a wrong passphrase throws here rather than
      // silently returning garbage.
      return { key, salt, docs: JSON.parse(dec.decode(plain)) };
    } catch {
      return null;
    }
  }
  const fresh: OpenVault = { key, salt, docs: [] };
  await persist(fresh);
  return fresh;
}

export async function persist(v: OpenVault): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource }, v.key, enc.encode(JSON.stringify(v.docs)),
  );
  const blob: Blob = { v: 1, salt: b64(v.salt), iv: b64(iv), data: b64(data) };
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
}

/** Exports the ciphertext, not the contents — a backup, not a leak. */
export function exportBlob(): string | null {
  return localStorage.getItem(VAULT_KEY);
}
