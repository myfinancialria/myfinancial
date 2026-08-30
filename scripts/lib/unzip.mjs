// ---------------------------------------------------------------------------
// unzip.mjs — read the members of a ZIP, using only node:zlib.
//
// Some AMCs (DSP) publish the month's portfolios as a ZIP of workbooks rather
// than as a workbook or a file per scheme. That is a third packaging shape for
// data this pipeline already knows how to parse, so it is worth about forty
// lines of central-directory reading — and not worth a fifth dependency in a
// project that deliberately runs on four.
//
// Only what a disclosure ZIP actually uses is implemented: stored (method 0)
// and deflate (method 8), no encryption, no ZIP64. Anything else throws.
// ---------------------------------------------------------------------------
import zlib from "node:zlib";

const EOCD = 0x06054b50, CEN = 0x02014b50;

/** @returns {{name: string, buf: Buffer}[]} */
export function unzip(buf) {
  // The end-of-central-directory record sits in the last 64KB, after a
  // variable-length comment, so it is found by scanning backwards.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a ZIP (no end-of-central-directory record)");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN) throw new Error("corrupt ZIP central directory");
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue;                       // directory entry
    // The local header repeats the name and extra fields at its own lengths.
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressed);

    if (method === 0) out.push({ name, buf: Buffer.from(raw) });
    else if (method === 8) out.push({ name, buf: zlib.inflateRawSync(raw) });
    else throw new Error(`unsupported ZIP compression method ${method} for ${name}`);
  }
  return out;
}

export default unzip;
