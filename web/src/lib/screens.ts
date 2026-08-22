/* ---------------------------------------------------------------------------
   Saved screens — the browser half.

   The encoding and the CSV writer live in @shared/screens.mjs so the same code
   the app ships is the code the test suite runs. What is left here is the part
   that genuinely needs a browser: localStorage and a download.
--------------------------------------------------------------------------- */

export { encodeScreen, decodeScreen, toCsv } from "@shared/screens.mjs";

export type Op = ">=" | "<=" | "between" | "=" | ">" | "<" | "notnull" | "true" | "false" | "in" | "contains";
export interface Filter { f: string; op: Op; a?: any; b?: any }

export interface Screen {
  name: string;
  filters: Filter[];
  sort: { f: string; dir: 1 | -1 };
  q?: string;
  cols?: string[];
  savedAt?: number;
}

const STORE = "myfin.screens.v1";

export function listSaved(): Screen[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export function saveScreen(s: Screen): Screen[] {
  const all = listSaved().filter((x) => x.name !== s.name);
  const next = [{ ...s, savedAt: Date.now() }, ...all].slice(0, 40);
  try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

export function deleteScreen(name: string): Screen[] {
  const next = listSaved().filter((x) => x.name !== name);
  try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
