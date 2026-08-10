#!/usr/bin/env node
// ---------------------------------------------------------------------------
// fetch_bars.mjs — real daily price history for every covered company, cached
// to var/ubars/ and snapshotted to data/bars.json so the static site can draw
// real price charts without a token in CI.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const UFUND = path.join(ROOT, "var", "ufund");
const BARS = path.join(ROOT, "var", "ubars");
const SNAP = path.join(ROOT, "data", "bars.json");
const TTL = 20 * 3600_000;

const up = await import("../server/providers/upstox.js");
if (!up.configured()) { console.error("✗ No Upstox token — run npm run login:upstox"); process.exit(1); }

fs.mkdirSync(BARS, { recursive: true });
const symbols = fs.readdirSync(UFUND).filter((f) => f.endsWith(".json") && !f.endsWith(".q.json")).map((f) => f.replace(/\.json$/, ""));
console.log(`fetching daily candles for ${symbols.length} companies…`);

let ok = 0, skip = 0, fail = 0;
for (const [i, sym] of symbols.entries()) {
  const file = path.join(BARS, `${sym}.json`);
  try { if (Date.now() - fs.statSync(file).mtimeMs < TTL) { skip++; ok++; continue; } } catch { /* fetch */ }
  try {
    const bars = await up.daily(sym, 400);
    if (bars?.length > 30) {
      // keep it compact: date (yyyy-mm-dd) + close + volume is all a chart needs
      const slim = bars.map((b) => [new Date(b.time * 1000).toISOString().slice(0, 10), Math.round(b.close * 100) / 100, b.volume || 0]);
      fs.writeFileSync(file, JSON.stringify(slim));
      ok++;
    } else fail++;
  } catch { fail++; }
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${symbols.length} (${ok} ok, ${fail} unavailable)`);
  await new Promise((r) => setTimeout(r, 260));
}

// snapshot for CI (last 400 sessions each, compact)
const snap = {};
for (const f of fs.readdirSync(BARS)) {
  if (!f.endsWith(".json")) continue;
  try { snap[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(BARS, f), "utf8")); } catch { /* skip */ }
}
fs.mkdirSync(path.dirname(SNAP), { recursive: true });
fs.writeFileSync(SNAP, JSON.stringify(snap));
console.log(`done: ${ok} with price history (${skip} already fresh, ${fail} unavailable) → data/bars.json (${(fs.statSync(SNAP).size / 1024 / 1024).toFixed(1)} MB)`);
