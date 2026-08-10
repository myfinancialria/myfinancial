// ---------------------------------------------------------------------------
// net.mjs — the shared fetch layer for every data script.
//
// Three things every fetcher here needs and none of them should re-invent:
//   • a bounded worker pool, so 2,000 symbols never open 2,000 sockets
//   • retry with backoff, because free endpoints rate-limit under load
//   • a disk cache, so a re-run after a crash costs seconds instead of an hour
//
// Yahoo additionally requires a cookie + "crumb" handshake on the fundamentals
// endpoints; that is negotiated once and reused for the whole run.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch with a timeout, N retries and exponential backoff on 429/5xx. */
export async function getText(url, { timeout = 25_000, retries = 3, headers = {}, accept = "*/*" } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(Math.min(15_000, 700 * 2 ** attempt) + Math.floor(attempt * 250));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: accept, ...headers } });
      // 404 is a real answer — the symbol does not exist. Do not burn retries.
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("fetch failed");
}

export async function getJson(url, opts = {}) {
  const text = await getText(url, { accept: "application/json", ...opts });
  if (text === null) return null;
  try { return JSON.parse(text); } catch { throw new Error("bad JSON"); }
}

// ------------------------------ worker pool ---------------------------------
/**
 * Run `worker` over `items` with at most `concurrency` in flight.
 * Never rejects: a failing item resolves to null so one bad symbol out of two
 * thousand cannot abort the build. `onProgress` fires after each settle.
 */
export async function pool(items, concurrency, worker, onProgress) {
  const out = new Array(items.length);
  let next = 0, done = 0, failed = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        out[i] = await worker(items[i], i);
      } catch {
        out[i] = null;
        failed++;
      }
      done++;
      if (onProgress && (done % 25 === 0 || done === items.length)) onProgress(done, items.length, failed);
    }
  });
  await Promise.all(runners);
  return out;
}

// ------------------------------ disk cache ----------------------------------
/**
 * JSON on disk, keyed by name, valid for `maxAgeH` hours. Cheap resumability:
 * every fetcher writes through this so an interrupted run resumes for free.
 */
export function makeCache(dir, maxAgeH = 20) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (key) => path.join(dir, `${String(key).replace(/[^A-Za-z0-9._&-]/g, "_")}.json`);
  return {
    dir,
    get(key) {
      const f = file(key);
      try {
        const st = fs.statSync(f);
        if (Date.now() - st.mtimeMs > maxAgeH * 3600_000) return undefined;
        return JSON.parse(fs.readFileSync(f, "utf8"));
      } catch { return undefined; }
    },
    /** Ignores age — used as a last-resort fallback when the network is down. */
    getStale(key) {
      try { return JSON.parse(fs.readFileSync(file(key), "utf8")); } catch { return undefined; }
    },
    set(key, value) {
      try { fs.writeFileSync(file(key), JSON.stringify(value)); } catch { /* cache is best-effort */ }
      return value;
    },
    has(key) { return this.get(key) !== undefined; },
  };
}

// ------------------------------ Yahoo client --------------------------------
let crumb = null;
let cookie = null;

/** Negotiate the cookie + crumb pair Yahoo's fundamentals endpoints demand. */
export async function yahooAuth() {
  if (crumb) return { crumb, cookie };
  for (const seed of ["https://fc.yahoo.com", "https://finance.yahoo.com"]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15_000);
      const res = await fetch(seed, { signal: ctrl.signal, headers: { "User-Agent": UA } }).finally(() => clearTimeout(t));
      const setCookie = res.headers.getSetCookie?.() || [];
      const jar = setCookie.map((c) => c.split(";")[0]).join("; ");
      if (!jar) continue;
      const c = await getText("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { Cookie: jar }, retries: 2 });
      if (c && c.length > 3 && !c.includes("<")) { crumb = c.trim(); cookie = jar; return { crumb, cookie }; }
    } catch { /* try the next seed */ }
  }
  return { crumb: null, cookie: null };   // caller degrades to price-only data
}

export function yahooHeaders() {
  return cookie ? { Cookie: cookie } : {};
}

export function yahooCrumb() { return crumb; }

// --------------------------------- misc -------------------------------------
export function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function bar(done, total, width = 28) {
  const f = Math.round((done / total) * width);
  return `[${"█".repeat(f)}${"·".repeat(width - f)}] ${done}/${total}`;
}
