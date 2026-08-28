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
  // Installing a shim must never be the thing that breaks the page. A locked
  // down or unusual environment can refuse the assignment, and the right
  // outcome then is a missing shim, not a failed read.
  const define = (label, fn) => { try { fn(); installed.push(label); } catch { /* leave it native */ } };

  if (typeof scope.Promise?.withResolvers !== "function") define("Promise.withResolvers", () => {
    scope.Promise.withResolvers = function withResolvers() {
      let resolve, reject;
      const promise = new scope.Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  });

  if (typeof scope.AbortSignal === "function" && typeof scope.AbortSignal.any !== "function") define("AbortSignal.any", () => {
    scope.AbortSignal.any = function any(signals) {
      const controller = new scope.AbortController();
      for (const s of Array.from(signals ?? [])) {
        // An already-aborted signal wins immediately; there is nothing to wait for.
        if (s.aborted) { controller.abort(s.reason); break; }
        s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
      }
      return controller.signal;
    };
  });

  // pdf.js reads page text with `for await (const chunk of stream)`, over the
  // ReadableStream that streamTextContent returns. Chrome and Firefox iterate
  // a stream; Safari is the one engine that has never shipped
  // ReadableStream.prototype[Symbol.asyncIterator], so that line throws
  // "undefined is not a function" and no page text is ever read.
  //
  // This is the WHATWG async-iterator, which is defined in terms of a reader —
  // so it behaves the same way, including releasing the lock and cancelling
  // the stream when a loop is abandoned early.
  const RS = scope.ReadableStream;
  if (typeof RS === "function" && typeof RS.prototype?.[Symbol.asyncIterator] !== "function") define("ReadableStream.asyncIterator", () => {
    const values = function values({ preventCancel = false } = {}) {
      const reader = this.getReader();
      return {
        async next() {
          try {
            const { done, value } = await reader.read();
            if (done) reader.releaseLock();
            return { done, value };
          } catch (e) {
            reader.releaseLock();
            throw e;
          }
        },
        async return(value) {
          // Abandoning the loop must not leave the stream locked.
          if (preventCancel) reader.releaseLock();
          else {
            const cancelled = reader.cancel(value);
            reader.releaseLock();
            await cancelled;
          }
          return { done: true, value };
        },
        [Symbol.asyncIterator]() { return this; },
      };
    };
    if (typeof RS.prototype.values !== "function") RS.prototype.values = values;
    RS.prototype[Symbol.asyncIterator] = values;
  });

  return installed;
}
