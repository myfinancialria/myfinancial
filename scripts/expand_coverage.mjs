#!/usr/bin/env node
// ---------------------------------------------------------------------------
// expand_coverage.mjs — pull real fundamentals for every company named as a
// rival by the companies already covered, so peer links resolve to real pages
// instead of dead ends. Repeat passes widen the graph one ring at a time.
//
//   node scripts/expand_coverage.mjs [rings]        (default 1)
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(__dirname, "..", "var", "ufund");
const rings = Number(process.argv[2] || 1);

const uf = await import("../server/providers/ufundamentals.js");
if (!uf.configured()) { console.error("✗ No Upstox token — run npm run login:upstox first."); process.exit(1); }

const cachedSymbols = () => new Set(fs.readdirSync(CACHE).filter((f) => f.endsWith(".json") && !f.endsWith(".q.json")).map((f) => f.replace(/\.json$/, "")));

for (let ring = 1; ring <= rings; ring++) {
  const have = cachedSymbols();
  const wanted = new Set();
  for (const sym of have) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(CACHE, `${sym}.json`), "utf8"));
      for (const c of j?.competitors || []) if (c.symbol && !have.has(c.symbol)) wanted.add(c.symbol);
    } catch { /* skip */ }
  }
  const todo = [...wanted];
  if (!todo.length) { console.log(`ring ${ring}: nothing new to fetch`); break; }
  console.log(`ring ${ring}: ${have.size} covered → fetching ${todo.length} newly-named rivals…`);
  let ok = 0;
  for (const [i, sym] of todo.entries()) {
    const wait = uf.cooldownMs();
    if (wait) { console.log(`   rate limited — waiting ${Math.ceil(wait / 1000)}s`); await new Promise((r) => setTimeout(r, wait + 1500)); }
    if (await uf.fundamentals(sym).catch(() => null)) ok++;
    if ((i + 1) % 25 === 0) console.log(`   ${i + 1}/${todo.length} (${ok} with data)`);
    await new Promise((r) => setTimeout(r, 900));
  }
  console.log(`ring ${ring} done: +${ok} companies · total covered ${cachedSymbols().size}`);
}
console.log(`\nCoverage now ${cachedSymbols().size} companies. Rebuild the site with: node scripts/build_pages.mjs`);
