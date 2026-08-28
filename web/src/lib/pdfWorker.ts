/* ---------------------------------------------------------------------------
   The pdf.js worker, with the shims installed first.

   A Web Worker has its own global scope, so patching Promise on the page does
   nothing for the worker — and the worker calls Promise.withResolvers thirteen
   times. Shimming only the main thread would have looked like a fix, passed a
   browser test that strips the API from the page, and still failed on the
   machine it was meant to help.

   These two imports are STATIC, and the order is the whole point. Static
   imports evaluate in declaration order, synchronously, before this module
   finishes — so the shims are in place by the time pdf.js runs, and pdf.js has
   attached its message listener before the worker starts handling messages.

   The obvious version — installShims(self) followed by a top-level `await
   import(...)` — hangs. Evaluation pauses at the await, the worker begins
   dispatching queued messages, and the page's first messages arrive before
   pdf.js is listening. They are dropped and the reader sits on "Reading…"
   forever with no error at all.
--------------------------------------------------------------------------- */
import "./installShims";
import "pdfjs-dist/build/pdf.worker.mjs";
