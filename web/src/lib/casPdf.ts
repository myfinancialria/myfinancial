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

export interface Cell { x: number; text: string }
export interface ExtractResult { lines: string[]; cells: Cell[][]; pages: number }

/** Thrown when the statement needs a password, or the one given is wrong. */
export class PasswordError extends Error {
  constructor(public needed: boolean) {
    super(needed ? "This statement is password protected." : "That password did not open the statement.");
    this.name = "PasswordError";
  }
}

let pdfjs: typeof import("pdfjs-dist") | null = null;

async function loadPdfjs() {
  if (pdfjs) return pdfjs;
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
  const lib = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  let doc;
  try {
    doc = await lib.getDocument({ data, password, useSystemFonts: true }).promise;
  } catch (e: any) {
    const name = String(e?.name ?? "");
    if (name === "PasswordException") throw new PasswordError(!password);
    throw e;
  }

  const lines: string[] = [];
  const cells: Cell[][] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // Group text items into visual lines by their baseline, then order each
    // line left to right. This is the same shape casparser builds from
    // PDFium's char origins.
    const rows = new Map<number, Cell[]>();
    for (const item of content.items as any[]) {
      const text = String(item.str ?? "");
      if (!text.trim()) continue;
      const x = item.transform[4] as number;
      const y = item.transform[5] as number;
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= LINE_TOLERANCE) ?? y;
      (rows.get(key) ?? rows.set(key, []).get(key)!).push({ x, text });
    }

    for (const y of [...rows.keys()].sort((a, b) => b - a)) {       // top of page first
      const row = rows.get(y)!.sort((a, b) => a.x - b.x);
      cells.push(row);
      lines.push(row.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim());
    }
    page.cleanup();
  }

  const pages = doc.numPages;
  await doc.cleanup();
  return { lines, cells, pages };
}
