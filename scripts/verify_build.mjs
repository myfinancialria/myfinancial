#!/usr/bin/env node
// ---------------------------------------------------------------------------
// verify_build.mjs — refuse to publish a broken or silently-empty site.
//
// A daily unattended build has one dangerous failure mode: it succeeds, but with
// nothing in it. An upstream source changes shape, a parser quietly returns zero
// rows, and the site deploys as an empty shell that looks fine to the workflow.
// These checks exist to make that impossible.
//
// Exit code 1 fails the workflow BEFORE the deploy step, so the previously
// published site stays up rather than being replaced by a broken one.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

let failures = 0, warnings = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); failures++; };
const warn = (m) => { console.log(`  ! ${m}`); warnings++; };

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const exists = (rel) => fs.existsSync(path.join(DIST, rel));
const sizeOf = (rel) => { try { return fs.statSync(path.join(DIST, rel)).size; } catch { return 0; } };

console.log("── verifying the build ─────────────────────────────────────");

// ---------------------------- required pages --------------------------------
for (const f of ["screener.html", "stocks.html", "funds.html", "app.css"]) {
  if (exists(f) && sizeOf(f) > 200) ok(`${f} (${(sizeOf(f) / 1024).toFixed(0)} KB)`);
  else bad(`${f} is missing or suspiciously small`);
}
// .nojekyll is meant to be empty — it exists purely to stop GitHub Pages from
// running Jekyll, which would drop the directories we generate.
if (exists(".nojekyll")) ok(".nojekyll present");
else bad(".nojekyll missing — GitHub Pages would run Jekyll over the output");

// ------------------------------ stock index ---------------------------------
const stocks = readJson(path.join(DIST, "data", "stocks.json"));
if (!stocks) bad("data/stocks.json is missing or unparseable");
else {
  const n = stocks.rows?.length || 0;
  if (n >= 1500) ok(`${n} companies in the screener index`);
  else bad(`only ${n} companies — expected at least 1,500 listed names`);

  const F = Object.fromEntries((stocks.fields || []).map((k, i) => [k, i]));
  for (const key of ["symbol", "name", "price", "ret1y", "rsi14", "avgTurnoverCr", "sector"]) {
    if (F[key] === undefined) bad(`field "${key}" missing from the index`);
  }

  // Every row must at least have a symbol and a tradeable price.
  const broken = (stocks.rows || []).filter((r) => !r[F.symbol] || typeof r[F.price] !== "number" || r[F.price] <= 0).length;
  if (broken === 0) ok("every row has a symbol and a positive price");
  else bad(`${broken} rows have no symbol or a non-positive price`);

  // Coverage of the computed technicals — these come from prices alone, so
  // anything less than near-total coverage means the maths broke, not the feed.
  const cover = (key, min, label) => {
    const c = (stocks.rows || []).filter((r) => typeof r[F[key]] === "number").length;
    const pctv = (c / n) * 100;
    if (pctv >= min) ok(`${label}: ${pctv.toFixed(0)}% of rows`);
    else bad(`${label}: only ${pctv.toFixed(0)}% of rows (expected ≥ ${min}%)`);
  };
  cover("rsi14", 90, "RSI computed");
  cover("sma200", 80, "200-day average computed");
  cover("ret1y", 80, "1-year return computed");
  cover("avgTurnoverCr", 90, "turnover computed");

  // Sanity: a market where nothing moved, or everything doubled, is a bug.
  const rets = (stocks.rows || []).map((r) => r[F.ret1y]).filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (rets.length) {
    const median = rets[Math.floor(rets.length / 2)];
    if (median > -60 && median < 120) ok(`median 1-year return ${median.toFixed(1)}% is plausible`);
    else bad(`median 1-year return ${median.toFixed(1)}% is implausible — check corporate-action adjustment`);
  }

  // Corporate-action adjustment: a huge crop of ~-50% one-year returns is the
  // signature of unadjusted bonuses slipping through.
  const near50 = rets.filter((r) => r > -53 && r < -47).length;
  if (rets.length && near50 / rets.length > 0.06) {
    warn(`${((near50 / rets.length) * 100).toFixed(1)}% of 1-year returns cluster near -50% — possible unadjusted splits/bonuses`);
  } else ok("no suspicious cluster of -50% returns");

  const priceDate = stocks.priceDate;
  if (priceDate) {
    const age = (Date.now() - Date.parse(priceDate + "T12:00:00Z")) / 86_400_000;
    if (age <= 6) ok(`prices dated ${priceDate} (${age.toFixed(0)} days old)`);
    else warn(`prices dated ${priceDate} — ${age.toFixed(0)} days old`);
  } else bad("no priceDate on the stock index");

  const withFundamentals = (stocks.rows || []).filter((r) => r[F.hasFundamentals] === true).length;
  if (withFundamentals === 0) warn("no company fundamentals in this build — run `npm run data:fundamentals` locally and commit the snapshot");
  else ok(`${withFundamentals} companies carry fundamentals`);
}

// ------------------------------- fund index ---------------------------------
const funds = readJson(path.join(DIST, "data", "funds.json"));
if (!funds) bad("data/funds.json is missing or unparseable");
else {
  const n = funds.rows?.length || 0;
  if (n >= 1200) ok(`${n} mutual fund schemes`);
  else bad(`only ${n} schemes — expected at least 1,200`);

  const F = Object.fromEntries((funds.fields || []).map((k, i) => [k, i]));
  const live = (funds.rows || []).filter((r) => r[F.stale] !== true);
  if (live.length >= 1000) ok(`${live.length} schemes still publishing a NAV`);
  else bad(`only ${live.length} live schemes`);

  const withR3 = live.filter((r) => typeof r[F.r3y] === "number").length;
  const pctR3 = (withR3 / Math.max(1, live.length)) * 100;
  if (pctR3 >= 60) ok(`3-year returns on ${pctR3.toFixed(0)}% of live schemes`);
  else bad(`3-year returns on only ${pctR3.toFixed(0)}% of live schemes`);

  const r3 = live.map((r) => r[F.r3y]).filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (r3.length) {
    const med = r3[Math.floor(r3.length / 2)];
    if (med > -10 && med < 40) ok(`median 3-year fund CAGR ${med.toFixed(1)}% is plausible`);
    else bad(`median 3-year fund CAGR ${med.toFixed(1)}% is implausible`);
  }
}

// ------------------------------ detail pages --------------------------------
for (const [dir, min] of [["stock", 1500], ["fund", 1200]]) {
  const p = path.join(DIST, dir);
  const count = fs.existsSync(p) ? fs.readdirSync(p).filter((f) => f.endsWith(".html")).length : 0;
  if (count >= min) ok(`${count} ${dir} pages rendered`);
  else bad(`only ${count} ${dir} pages (expected ≥ ${min})`);
}

// The screener is useless if its script did not make it into the page.
const screener = (() => { try { return fs.readFileSync(path.join(DIST, "screener.html"), "utf8"); } catch { return ""; } })();
if (/data\/stocks\.json/.test(screener) && /addFilter/.test(screener)) ok("screener page carries its filter logic and data reference");
else bad("screener.html looks incomplete");

console.log("────────────────────────────────────────────────────────────");
if (failures) {
  console.log(`✗ ${failures} check${failures === 1 ? "" : "s"} failed${warnings ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""} — NOT publishing.`);
  process.exit(1);
}
console.log(`✓ all checks passed${warnings ? ` (${warnings} warning${warnings === 1 ? "" : "s"})` : ""} — safe to publish.`);
