// ---------------------------------------------------------------------------
// screens.mjs — encoding a saved screen, and exporting one.
//
// Lives in shared/ for the same reason tax.mjs and goals.mjs do: it is pure,
// it has no DOM in it, and it is imported by both the browser app and the test
// runner. A screener whose share links silently decode to the wrong filters is
// a bug nobody reports and everybody suffers, so the round trip is tested.
//
// The URL form carries the whole definition rather than an id. There is no
// server to look an id up in, and a link that outlives its database is worth
// more than a short one.
// ---------------------------------------------------------------------------

const toB64Url = (s) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64Url = (s) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
};

/**
 * Field names dominate the payload and repeat across filters, sort and
 * columns, so the screen is packed positionally before encoding.
 * @param {{filters:Array, sort:{f:string,dir:number}, q?:string, cols?:string[]}} s
 */
export function encodeScreen(s) {
  return toB64Url(JSON.stringify([s.filters ?? [], s.sort?.f ?? "", s.sort?.dir ?? -1, s.q ?? "", s.cols ?? []]));
}

/**
 * Decode a shared screen. Everything here came off a URL a stranger may have
 * written, so each field is validated rather than trusted: a malformed
 * condition is dropped, not applied. A screen that silently filters on garbage
 * is worse than one that arrives short.
 * @returns {{filters:Array, sort:{f:string,dir:number}, q:string, cols:string[]}|null}
 */
export function decodeScreen(code) {
  if (typeof code !== "string" || code.length < 2) return null;
  let p;
  try { p = JSON.parse(fromB64Url(code)); } catch { return null; }
  if (!Array.isArray(p) || !Array.isArray(p[0])) return null;
  return {
    filters: p[0].filter((f) => f && typeof f === "object" && typeof f.f === "string" && typeof f.op === "string"),
    sort: { f: typeof p[1] === "string" && p[1] ? p[1] : "marketCapCr", dir: p[2] === 1 ? 1 : -1 },
    q: typeof p[3] === "string" ? p[3] : "",
    cols: Array.isArray(p[4]) ? p[4].filter((c) => typeof c === "string") : [],
  };
}

/**
 * RFC 4180 CSV, with a BOM so Excel reads the rupee sign as a rupee sign
 * rather than as three characters of mojibake.
 */
export function toCsv(rows, cols) {
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => cell(c.label)).join(",")];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c.key])).join(","));
  return "﻿" + lines.join("\r\n");
}
