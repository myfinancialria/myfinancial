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
for (const f of ["screener.html", "stocks.html", "funds.html", "planning.html", "advisory.html", "estate.html", "app.css"]) {
  if (exists(f) && sizeOf(f) > 200) ok(`${f} (${(sizeOf(f) / 1024).toFixed(0)} KB)`);
  else bad(`${f} is missing or suspiciously small`);
}

// The three browser-side modules are useless without their engines: the pages
// import them as ES modules, and a missing file fails silently at runtime with
// nothing but a console error the visitor never sees.
for (const f of ["js/tax.mjs", "js/goals.mjs", "js/estate.mjs", "js/util.mjs", "js/planning.js", "js/advisory.js", "js/estate.js", "js/patterns.js"]) {
  if (exists(f) && sizeOf(f) > 100) ok(`${f}`);
  else bad(`${f} is missing — the module page that imports it will not run`);
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

  // Freshness is the whole point of a daily rebuild, and it failed silently
  // once already: sessions fetched before NSE published were blacklisted as
  // holidays and never retried, so the site kept rebuilding happily against a
  // price date that had stopped moving. Weekends and holidays make a couple of
  // days normal; four is not.
  const priceDate = stocks.priceDate;
  if (priceDate) {
    const age = (Date.now() - Date.parse(priceDate + "T12:00:00Z")) / 86_400_000;
    if (age <= 4) ok(`prices dated ${priceDate} (${age.toFixed(0)} days old)`);
    else if (age <= 6) warn(`prices dated ${priceDate} — ${age.toFixed(0)} days old; check for skipped sessions`);
    else bad(`prices dated ${priceDate} — ${age.toFixed(0)} days old. The daily refresh is not reaching the exchange.`);
  } else bad("no priceDate on the stock index");

  const withFundamentals = (stocks.rows || []).filter((r) => r[F.hasFundamentals] === true).length;
  if (withFundamentals === 0) warn("no company fundamentals in this build — run `npm run data:fundamentals` locally and commit the snapshot");
  else ok(`${withFundamentals} companies carry fundamentals`);
}

// --------------------------- cache-busting -----------------------------------
// GitHub Pages serves everything with max-age=600 and no versioning, so without
// a build stamp on each URL a visitor can get new HTML running against an old
// cached script. That once left a page rendering nothing at all. Every asset
// reference must therefore carry ?v=<build>.
{
  const pages = ["planning.html", "advisory.html", "estate.html"];
  let unversioned = 0, builds = new Set();
  for (const p of pages) {
    let html = "";
    try { html = fs.readFileSync(path.join(DIST, p), "utf8"); } catch { continue; }
    for (const m of html.matchAll(/src="(js\/[\w.-]+\.js)(\?v=([a-f0-9]+))?"/g)) {
      if (!m[3]) unversioned++; else builds.add(m[3]);
    }
  }
  for (const f of (fs.existsSync(path.join(DIST, "js")) ? fs.readdirSync(path.join(DIST, "js")) : [])) {
    const body = fs.readFileSync(path.join(DIST, "js", f), "utf8");
    for (const m of body.matchAll(/from "\.\/[\w.-]+\.mjs(\?v=([a-f0-9]+))?"/g)) {
      if (!m[2]) unversioned++; else builds.add(m[2]);
    }
    for (const m of body.matchAll(/fetch\("data\/[\w.-]+\.json(\?v=([a-f0-9]+))?"/g)) {
      if (!m[2]) unversioned++; else builds.add(m[2]);
    }
    for (const m of body.matchAll(/import\("\.\/[\w.-]+\.js(\?v=([a-f0-9]+))?"\)/g)) {
      if (!m[2]) unversioned++; else builds.add(m[2]);
    }
  }
  if (unversioned) bad(`${unversioned} asset references carry no build stamp — a stale cache could break the page`);
  else if (builds.size === 1) ok(`every asset reference stamped with build ${[...builds][0]}`);
  else if (builds.size > 1) bad(`mixed build stamps (${[...builds].join(", ")}) — assets would load inconsistently`);
}

// Element ids the page scripts write into must exist in the markup they ship
// with. This is exactly the coupling that broke when a container was renamed.
{
  const pairs = [
    ["advisory.html", ["qualityTbl", "swingTbl", "momTbl", "incTbl", "patTable", "patStatusLine", "patCount", "patBias", "patType", "patStatus", "patScore"]],
    ["planning.html", ["taxVerdict", "taxHeads", "taxTotals", "taxSlabs", "taxRecs", "cashStats", "cashNotes", "goalStats", "goalChart", "goalSip", "solveSip"]],
    ["estate.html", ["willDraft", "beneList", "assetList", "checkList", "checkScore", "vaultLocked", "vaultOpen", "docTbl", "vaultPass"]],
  ];
  let missing = 0;
  for (const [page, ids] of pairs) {
    let html = "";
    try { html = fs.readFileSync(path.join(DIST, page), "utf8"); } catch { bad(`${page} unreadable`); continue; }
    for (const id of ids) if (!html.includes(`id="${id}"`)) { bad(`${page} has no #${id}, but its script writes to it`); missing++; }
  }
  if (!missing) ok("every element id the page scripts target exists in the markup");
}

// ------------------------- sector context coverage ---------------------------
// The point of the canonical sector layer is that EVERY listed company gets an
// industry read and a policy read, not just the curated few. If a raw label
// stops mapping, this silently reverts to the old behaviour.
{
  const dir = path.join(DIST, "stock");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".html")) : [];
  let pulse = 0, policy = 0;
  for (const f of files) {
    const html = fs.readFileSync(path.join(dir, f), "utf8");
    if (html.includes("Industry pulse")) pulse++;
    if (html.includes("Government support")) policy++;
  }
  const pctOf = (n) => (files.length ? (n / files.length) * 100 : 0);
  if (pctOf(pulse) >= 99 && pctOf(policy) >= 99) ok(`sector context on ${pulse}/${files.length} company pages`);
  else bad(`industry pulse on ${pulse} and policy on ${policy} of ${files.length} pages — the sector mapping has holes`);
}

// --------------------------- company page charts -----------------------------
// The candles are inlined per page, so a page can ship a chart container with no
// data behind it and fail silently. Sample a few and check both are present.
{
  const dir = path.join(DIST, "stock");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".html")) : [];
  const sample = files.filter((_, i) => i % Math.max(1, Math.floor(files.length / 25)) === 0).slice(0, 25);
  let noData = 0, noModule = 0, badShape = 0;
  for (const f of sample) {
    const html = fs.readFileSync(path.join(dir, f), "utf8");
    if (!html.includes('id="scWrap"')) continue;             // too little history to chart
    if (!/js\/stockchart\.js/.test(html)) { noModule++; continue; }
    const m = html.match(/id="scData">([\s\S]*?)<\/script>/);
    if (!m) { noData++; continue; }
    try {
      const j = JSON.parse(m[1]);
      if (!j.daily?.length || !j.weekly?.length
        || j.dailySma50.length !== j.daily.length || j.weeklySma200.length !== j.weekly.length) badShape++;
    } catch { badShape++; }
  }
  if (noModule) bad(`${noModule} company pages draw a chart container but never load the chart module`);
  else if (noData) bad(`${noData} company pages have a chart container with no inlined data`);
  else if (badShape) bad(`${badShape} company pages have candle data whose moving averages do not align`);
  else ok(`company charts intact across ${sample.length} sampled pages (daily + weekly candles, aligned averages)`);
}

// ------------------------------ chart patterns ------------------------------
const patterns = readJson(path.join(DIST, "data", "patterns.json"));
if (!patterns) warn("data/patterns.json missing — the chart-patterns tab will be empty");
else {
  const n = patterns.hits?.length || 0;
  if (n >= 10) ok(`${n} chart patterns drawn (of ${patterns.detected} detected)`);
  else warn(`only ${n} chart patterns — a quiet market, or detection has broken`);
  // A chart is worthless if its geometry falls outside the window it ships.
  const broken = (patterns.hits || []).filter((h) =>
    !h.bars?.length || !h.anchors?.length
    || h.anchors.some((a) => a.i < 0 || a.i >= h.bars.length)
    || h.sma50?.length !== h.bars.length || h.sma200?.length !== h.bars.length).length;
  if (broken === 0) ok("every pattern chart has in-range anchors and aligned moving averages");
  else bad(`${broken} pattern charts would draw incorrectly`);
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

// The screener's JavaScript is assembled inside a template literal, so a stray
// backtick in it truncates the script and ships a page that renders but does
// nothing. Parse every inline block rather than trusting that it looks right.
{
  const blocks = [...screener.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let broken = 0;
  for (const b of blocks) {
    try { new Function(b); } catch { broken++; }
  }
  if (!blocks.length) bad("screener.html has no inline script at all");
  else if (broken) bad(`${broken} of ${blocks.length} inline script blocks in screener.html do not parse`);
  else ok(`${blocks.length} inline script blocks parse cleanly`);
}

// ============================ the React app =================================
// The app is a second front end over the same published data. It renders
// nothing itself — every surface is a fetch — so an empty data directory
// produces a page that loads, paints its chrome, and silently shows nothing.
// These checks are the reason that cannot ship.

{
  const shell = (() => { try { return fs.readFileSync(path.join(DIST, "app", "index.html"), "utf8"); } catch { return ""; } })();
  if (!shell) bad("app/index.html is missing — the React app did not build");
  else {
    // Every hashed asset the shell references must actually exist. A stale
    // index.html pointing at a bundle from a previous build is a white screen.
    const refs = [...shell.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1]);
    const missing = refs.filter((r) => !exists(r.replace(/^\/myfinancial\//, "")));
    if (!refs.length) bad("app/index.html references no bundles at all");
    else if (missing.length) bad(`app shell references ${missing.length} missing bundle(s): ${missing.join(", ")}`);
    else ok(`app shell references ${refs.length} bundles, all present`);
  }

  // The 404 shim is what makes a deep link like /app/company/RELIANCE work on a
  // host with no rewrite rules. Without it every shared link 404s.
  const notFound = (() => { try { return fs.readFileSync(path.join(DIST, "404.html"), "utf8"); } catch { return ""; } })();
  if (/spa:redirect/.test(notFound) && /\/app\//.test(notFound)) ok("404 shim will route deep app links back to the shell");
  else bad("404.html no longer parks deep app paths — every shared app link would 404");
}

// --------------------- per-company detail the app fetches --------------------
{
  const dir = path.join(DIST, "data", "stock");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  const expected = stocks?.rows?.length ?? 0;
  if (files.length < expected * 0.95) {
    bad(`only ${files.length} per-company detail files for ${expected} companies — the app's company pages would 404`);
  } else {
    ok(`${files.length} per-company detail files published`);
    // Sample the contents rather than trusting the count: a directory full of
    // {} would pass a file count and fail every page.
    const sample = files.filter((_, i) => i % Math.ceil(files.length / 40) === 0).slice(0, 40);
    let noCandles = 0, noDeep = 0, noPeers = 0, noSector = 0;
    for (const f of sample) {
      const d = readJson(path.join(dir, f));
      if (!d?.daily?.length || !d.weekly?.length) noCandles++;
      if (!d?.deep?.statements?.pnl?.length) noDeep++;
      if (!d?.peerGroup?.rows?.length) noPeers++;
      if (!d?.sectorKey) noSector++;
    }
    if (noCandles) bad(`${noCandles}/${sample.length} sampled companies ship no candles`);
    else ok(`sampled ${sample.length} companies — all carry daily and weekly candles`);
    if (noSector) bad(`${noSector}/${sample.length} sampled companies have no sector key — industry and policy would not render`);
    else ok("every sampled company resolves to a canonical sector");
    // Filed statements and peer groups are genuinely absent for some names, so
    // these are warnings about coverage, not failures.
    if (noDeep > sample.length * 0.25) warn(`${noDeep}/${sample.length} sampled companies have no filed statements`);
    if (noPeers > sample.length * 0.25) warn(`${noPeers}/${sample.length} sampled companies have no peer group`);
  }
}

// ---------------------- per-scheme detail the app fetches --------------------
{
  const dir = path.join(DIST, "data", "fund");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  const expected = funds?.rows?.length ?? 0;
  if (files.length < expected * 0.95) {
    bad(`only ${files.length} per-scheme detail files for ${expected} schemes — the app's fund pages would 404`);
  } else {
    ok(`${files.length} per-scheme detail files published`);
    const sample = files.filter((_, i) => i % Math.ceil(files.length / 25) === 0).slice(0, 25);
    const noSeries = sample.filter((f) => !(readJson(path.join(dir, f))?.navSeries?.length > 1)).length;
    if (noSeries) bad(`${noSeries}/${sample.length} sampled schemes ship no NAV series — the fund chart would be blank`);
    else ok(`sampled ${sample.length} schemes — all carry a NAV series`);
  }
}

// ----------------------------- sector research ------------------------------
{
  const sec = readJson(path.join(DIST, "data", "sectors.json"));
  if (!sec?.names) bad("data/sectors.json missing — industry pulse and policy would not render in the app");
  else {
    const keys = Object.keys(sec.names);
    const noPulse = keys.filter((k) => !sec.pulse?.[k]?.outlook);
    const noPolicy = keys.filter((k) => !sec.policy?.[k]?.schemes?.length);
    if (noPulse.length) bad(`${noPulse.length} sectors have no industry pulse: ${noPulse.join(", ")}`);
    else ok(`industry pulse written for all ${keys.length} canonical sectors`);
    if (noPolicy.length) bad(`${noPolicy.length} sectors have no policy section: ${noPolicy.join(", ")}`);
    else ok(`government support written for all ${keys.length} sectors`);
    if (!sec.caveat) warn("sectors.json carries no caveat line");
  }
}

// -------------------------------- daily brief --------------------------------
// The brief is a bonus page and never blocks a deploy, but it has silently
// emptied itself once already, so its state is at least reported.
{
  const kb = sizeOf("brief.html") / 1024;
  if (!exists("brief.html")) warn("brief.html missing — the daily brief did not render");
  else if (kb < 40) warn(`brief.html is only ${kb.toFixed(0)} KB — the fund universe behind it is probably empty`);
  else ok(`daily brief rendered (${kb.toFixed(0)} KB)`);
}

console.log("────────────────────────────────────────────────────────────");
if (failures) {
  console.log(`✗ ${failures} check${failures === 1 ? "" : "s"} failed${warnings ? `, ${warnings} warning${warnings === 1 ? "" : "s"}` : ""} — NOT publishing.`);
  process.exit(1);
}
console.log(`✓ all checks passed${warnings ? ` (${warnings} warning${warnings === 1 ? "" : "s"})` : ""} — safe to publish.`);
