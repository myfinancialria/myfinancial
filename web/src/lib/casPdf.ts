/* ---------------------------------------------------------------------------
   The PDF half of the CAS reader.

   Deliberately thin. Everything that can be got wrong — what a row means, how
   a dividend differs from a purchase, where the value columns start — lives in
   shared/cas.mjs where it is unit-tested. This file only turns a PDF into
   positioned text, which is either right or throws.

   The file is read with FileReader and handed to pdf.js as bytes. It is never
   uploaded, never sent to a worker off-origin, and nothing about it is stored.
   A CAS carries a PAN, an address and a complete transaction history; the
   only safe place to open one is the reader's own machine.
--------------------------------------------------------------------------- */

import { installShims } from "@shared/shims.mjs";

export interface Cell { x: number; text: string }
export interface ExtractResult { lines: string[]; cells: Cell[][]; pages: number }

/** Thrown when the statement needs a password, or the one given is wrong. */
export class PasswordError extends Error {
  constructor(public needed: boolean) {
    super(needed ? "This statement is password protected." : "That password did not open the statement.");
    this.name = "PasswordError";
  }
}

/** The stage a failure happened at, so an error report says something useful. */
export class StageError extends Error {
  constructor(public stage: string, public original: unknown) {
    const raw = original instanceof Error ? original.message : String(original);
    super(`${stage} — ${raw}`);
    this.name = "StageError";
    if (original instanceof Error && original.stack) this.stack = original.stack;
  }
}

const at = async <T>(stage: string, fn: () => Promise<T> | T): Promise<T> => {
  try { return await fn(); }
  catch (e) { throw e instanceof StageError ? e : new StageError(stage, e); }
};

let pdfjs: typeof import("pdfjs-dist") | null = null;

async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  installShims();
  const lib = await import("pdfjs-dist");
  // The worker ships with the package; bundling it via Vite keeps everything
  // same-origin, which matters more here than in an ordinary PDF viewer.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfjs = lib;
  return lib;
}

/** Rows within this many points of each other are the same visual line. */
const LINE_TOLERANCE = 3;

export async function extractPdf(file: File, password: string): Promise<ExtractResult> {
  const lib = await at("loading the PDF reader", () => loadPdfjs());
  const data = await at("reading the file off disk", async () => new Uint8Array(await file.arrayBuffer()));

  let doc;
  try {
    doc = await lib.getDocument({ data, password, useSystemFonts: true }).promise;
  } catch (e: any) {
    const name = String(e?.name ?? "");
    if (name === "PasswordException") throw new PasswordError(!password);
    throw new StageError("opening the PDF", e);
  }

  const lines: string[] = [];
  const cells: Cell[][] = [];

  for (let p = 1; p <= doc.numPages; p++) {
   await at(`extracting text from page ${p} of ${doc.numPages}`, async () => {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // Group text items into visual lines by their baseline, then order each
    // line left to right. This is the same shape casparser builds from
    // PDFium's char origins.
    const rows = new Map<number, Cell[]>();
    // Array.from, not for-of: a marked-content entry carries no transform, and
    // whatever getTextContent hands back only has to be array-LIKE.
    for (const item of Array.from<any>(content.items ?? [])) {
      const text = String(item?.str ?? "");
      if (!text.trim() || !item?.transform) continue;
      const x = item.transform[4] as number;
      const y = item.transform[5] as number;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= LINE_TOLERANCE) ?? y;
      (rows.get(key) ?? rows.set(key, []).get(key)!).push({ x, text });
    }

    for (const y of [...rows.keys()].sort((a, b) => b - a)) {       // top of page first
      const row = rows.get(y)!.sort((a, b) => a.x - b.x);
      cells.push(row);
      lines.push(row.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim());
    }
    page.cleanup();
   });
  }

  const pages = doc.numPages;
  await doc.cleanup();
  return { lines, cells, pages };
}
