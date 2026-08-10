#!/usr/bin/env node
// NAV history for the funds people actually browse, cached + snapshotted so the
// public fund pages can draw a real growth chart without any API in CI.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SNAP = path.join(ROOT, "data", "navs.json");
const { getUniverse, schemeHistory } = await import("../server/providers/amfi.js");

const u = await getUniverse();
// every live scheme gets its own page — a partial list is exactly the "missing
// data" problem this is meant to solve
const targets = u.funds.filter((f) => !f.stale);
const existing = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, "utf8")) : {};
console.log(`fetching NAV history for ${targets.length} funds (have ${Object.keys(existing).length})…`);
let ok = 0;
for (const [i, f] of targets.entries()) {
  if (existing[f.code]) { ok++; continue; }
  try {
    const { navs } = await schemeHistory(f.code);
    if (navs.length > 60) {
      // monthly samples keep the payload small while the shape stays honest
      const monthly = [];
      let lastKey = "";
      for (const n of navs) {
        const d = new Date(n.time * 1000).toISOString().slice(0, 7);
        if (d !== lastKey) { monthly.push([d, Math.round(n.value * 100) / 100]); lastKey = d; }
      }
      existing[f.code] = monthly.slice(-121);
      ok++;
    }
  } catch { /* skip */ }
  if ((i + 1) % 40 === 0) { console.log(`  ${i + 1}/${targets.length}`); fs.writeFileSync(SNAP, JSON.stringify(existing)); }
  await new Promise((r) => setTimeout(r, 320));
}
fs.mkdirSync(path.dirname(SNAP), { recursive: true });
fs.writeFileSync(SNAP, JSON.stringify(existing));
console.log(`done: ${Object.keys(existing).length} funds with NAV history → data/navs.json (${(fs.statSync(SNAP).size/1024).toFixed(0)} KB)`);
