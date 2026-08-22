import { useCallback, useState } from "react";

/* ---------------------------------------------------------------------------
   Persisted state.

   Planning figures, will drafts and saved screens never leave the browser.
   This is the whole storage layer: a useState that writes through to
   localStorage, merging saved values over defaults so adding a field later
   does not break someone's saved shape.
--------------------------------------------------------------------------- */

function merge<T>(defaults: T, saved: any): T {
  if (!saved || typeof saved !== "object") return structuredClone(defaults);
  const out: any = structuredClone(defaults);
  for (const k of Object.keys(out)) {
    if (saved[k] === undefined) continue;
    out[k] = out[k] && typeof out[k] === "object" && !Array.isArray(out[k])
      ? { ...out[k], ...saved[k] }
      : saved[k];
  }
  return out;
}

export function useLocal<T>(key: string, defaults: T) {
  const [value, setValue] = useState<T>(() => {
    try { return merge(defaults, JSON.parse(localStorage.getItem(key) || "null")); }
    catch { return structuredClone(defaults); }
  });

  const update = useCallback((patch: Partial<T> | ((cur: T) => T)) => {
    setValue((cur) => {
      const next = typeof patch === "function" ? (patch as (c: T) => T)(cur) : { ...cur, ...patch };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [key]);

  const reset = useCallback(() => {
    const next = structuredClone(defaults);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
    setValue(next);
    return next;
  }, [key, defaults]);

  return [value, update, reset] as const;
}
