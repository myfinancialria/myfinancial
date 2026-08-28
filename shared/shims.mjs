// ---------------------------------------------------------------------------
// shims.mjs — stand-ins for two platform APIs that pdf.js 6 requires.
//
// pdf.js calls Promise.withResolvers (27 times) and AbortSignal.any. Both
// arrived in Safari 17.4, March 2024. On anything older the library throws
// from inside its own minified code, and the reader is shown a TypeError
// naming variables that exist in no file they could ever look at.
//
// Both are small enough to stand in for honestly, so an older browser gets a
// working page instead of a well-explained failure. Native implementations are
// never replaced.
// ---------------------------------------------------------------------------

/** @returns {string[]} the names of the shims that were actually installed */
export function installShims(scope = globalThis) {
  const installed = [];

  if (typeof scope.Promise?.withResolvers !== "function") {
    scope.Promise.withResolvers = function withResolvers() {
      let resolve, reject;
      const promise = new scope.Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
    installed.push("Promise.withResolvers");
  }

  if (typeof scope.AbortSignal === "function" && typeof scope.AbortSignal.any !== "function") {
    scope.AbortSignal.any = function any(signals) {
      const controller = new scope.AbortController();
      for (const s of Array.from(signals ?? [])) {
        // An already-aborted signal wins immediately; there is nothing to wait for.
        if (s.aborted) { controller.abort(s.reason); break; }
        s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
      }
      return controller.signal;
    };
    installed.push("AbortSignal.any");
  }

  return installed;
}
