#!/usr/bin/env node
// ---------------------------------------------------------------------------
// fetch_holdings.mjs — pull each AMC's latest portfolio disclosure.
//
//   AMC listing page  →  spreadsheet links  →  newest per (amc, kind)
//        ↓
//   var/holdings/<amc>/<kind>-<date>.<ext>     raw, cached forever
//   var/holdings/manifest.json                 what we hold and when we got it
//
// A published disclosure never changes — it is a statutory filing for a date
// that has passed — so anything already downloaded is never fetched again.
// That is what makes the daily poll cheap: on a normal day it is a handful of
// listing-page requests and no downloads at all.
//
// ON FRESHNESS: portfolios are NOT live data. SEBI requires monthly
// disclosure within 10 days of month end, plus fortnightly for debt schemes
// (many AMCs publish fortnightly for everything). So the freshest holdings
// that exist anywhere are days old by construction. Polling daily gets them
// within hours of publication, which is as live as this data gets.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTERS } from "./amc/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "var", "holdings");
const MANIFEST = path.join(OUT, "manifest.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const ARGS = new Set(process.argv.slice(2));
const ONLY = (process.argv.find((a) => a.startsWith("--amc=")) || "").split("=")[1];
const KEEP = Number((process.argv.find((a) => a.startsWith("--keep=")) || "").split("=")[1] || 2);

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; } };

async function get(url, { timeout = 60_000, binary = false } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: c.signal, redirect: "follow",
      headers: { "user-agent": UA, "accept-language": "en-IN,en;q=0.9" },
    });
    if (!r.ok) return { ok: false, status: r.status };
    return binary
      ? { ok: true, buf: Buffer.from(await r.arrayBuffer()), url: r.url }
      : { ok: true, html: await r.text(), url: r.url };
  } catch (e) {
    return { ok: false, status: 0, err: e.name };
  } finally { clearTimeout(t); }
}

const absolute = (href, base) => { try { return new URL(href, base).href; } catch { return null; } };

const t0 = Date.now();
console.log("── fetching portfolio disclosures ──────────────────────────");

const manifest = readJson(MANIFEST, { files: {} });
let downloaded = 0, skipped = 0, failed = 0;

for (const a of ADAPTERS) {
  if (ONLY && slug(a.amc) !== slug(ONLY)) continue;

  const listing = await get(a.page, { timeout: 45_000 });
  if (!listing.ok) {
    console.log(`  ✗ ${a.amc.padEnd(15)} listing unreachable (${listing.status || listing.err})`);
    failed++;
    continue;
  }
  const links = [...listing.html.matchAll(/href="([^"]+\.(?:xlsx?|zip))"/gi)]
    .map((m) => absolute(m[1], listing.url)).filter(Boolean);
  const found = a.pick([...new Set(links)]);

  if (!found.length) {
    console.log(`  ✗ ${a.amc.padEnd(15)} listing has no portfolio files — layout changed?`);
    failed++;
    continue;
  }

  // Newest few per kind. History is not re-downloaded every day; --keep raises
  // it when backfilling.
  const byKind = new Map();
  for (const f of found) {
    const list = byKind.get(f.kind) ?? [];
    if (list.length < KEEP) { list.push(f); byKind.set(f.kind, list); }
  }

  for (const [kind, list] of byKind) {
    for (const f of list) {
      const ext = (f.name.match(/\.(xlsx?|zip)$/i) || [, "xls"])[1].toLowerCase();
      const rel = path.join(slug(a.amc), `${kind.toLowerCase()}-${f.date}.${ext}`);
      const dest = path.join(OUT, rel);
      if (fs.existsSync(dest) && !ARGS.has("--force")) { skipped++; continue; }

      const dl = await get(f.url, { timeout: 180_000, binary: true });
      if (!dl.ok || dl.buf.length < 20_000) {
        console.log(`  ✗ ${a.amc.padEnd(15)} ${f.name.slice(0, 44)} (${dl.status || dl.err || dl.buf?.length + "b"})`);
        failed++;
        continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, dl.buf);
      manifest.files[rel] = { amc: a.amc, kind, date: f.date, source: f.url, bytes: dl.buf.length, fetched: new Date().toISOString() };
      downloaded++;
      console.log(`  ✓ ${a.amc.padEnd(15)} ${kind.toLowerCase().padEnd(12)} ${f.date}  ${(dl.buf.length / 1024).toFixed(0)} KB`);
    }
  }
}

fs.mkdirSync(OUT, { recursive: true });
manifest.updated = new Date().toISOString();
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

const latest = Object.values(manifest.files).sort((a, b) => b.date.localeCompare(a.date))[0];
console.log("────────────────────────────────────────────────────────────");
console.log(`[holdings] ${downloaded} new · ${skipped} already held · ${failed} failed · ${Object.keys(manifest.files).length} files total`);
if (latest) console.log(`[holdings] freshest disclosure: ${latest.amc} ${latest.kind.toLowerCase()} as at ${latest.date}`);
console.log(`[holdings] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
