/* Side-effect module: installs the platform shims into whatever scope it is
   evaluated in. Kept separate so it can be imported BEFORE pdf.js and run
   synchronously — see pdfWorker.ts for why that ordering matters. */
import { installShims } from "@shared/shims.mjs";

installShims(self as unknown as typeof globalThis);
