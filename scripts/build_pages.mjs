#!/usr/bin/env node
// ---------------------------------------------------------------------------
// build_pages.mjs — builds the static Daily Market Brief for GitHub Pages.
//
// REAL data, no keys:
//   • AMFI NAVAll        → every Direct-Growth scheme's official NAV (~2,400+)
//   • mfapi.in           → 1/3/5-yr CAGR + volatility for the category leaders
//   • Yahoo Finance      → NIFTY 50 / Bank / IT / SENSEX index closes
//
// Run by .github/workflows/pages-daily.yml every market weekday at 17:00 IST,
// or locally:  node scripts/build_pages.mjs   →  dist/index.html
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUniverse, enrich, CATEGORIES } from "../server/providers/amfi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "dist");
const IST = () => new Date(Date.now() + 330 * 60_000);
const istStamp = () => IST().toISOString().replace("T", " ").slice(0, 16) + " IST";

const NSE_HOLIDAYS = ["2026-01-26", "2026-03-03", "2026-03-27", "2026-04-03", "2026-04-14", "2026-05-01", "2026-08-15", "2026-10-02", "2026-10-20", "2026-11-10", "2026-12-25"];
const todayIST = IST().toISOString().slice(0, 10);
const dow = IST().getUTCDay();
const marketDay = dow >= 1 && dow <= 5 && !NSE_HOLIDAYS.includes(todayIST);
console.log(`[pages] ${istStamp()} · ${marketDay ? "market day" : "non-market day (weekend/holiday) — publishing latest available data"}`);

// ------------------------------ index quotes --------------------------------
const YAHOO = [
  ["NIFTY 50", "%5ENSEI"], ["NIFTY BANK", "%5ENSEBANK"], ["NIFTY IT", "%5ECNXIT"], ["SENSEX", "%5EBSESN"], ["USD/INR", "INR%3DX"],
];
async function yahooQuote(sym) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`, {
      signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (myfinancial-pages)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const m = j?.chart?.result?.[0]?.meta;
    if (!m?.regularMarketPrice) throw new Error("no price");
    const prev = m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice;
    return { price: m.regularMarketPrice, prev, chgPct: prev ? ((m.regularMarketPrice - prev) / prev) * 100 : 0, time: m.regularMarketTime };
  } finally { clearTimeout(t); }
}

// ---------------------------------- main -------------------------------------
const universe = await getUniverse();                       // real AMFI parse
console.log(`[pages] AMFI universe: ${universe.count} Direct-Growth schemes · NAV date ${universe.navDate}`);

// AMFI has changed this file's host and its columns before, and a parser that
// quietly returns nothing publishes a brief with no funds in it — which is what
// happened for four days in August 2026. Refuse to render rather than ship an
// empty page that looks fine. This step is continue-on-error in CI, so the rest
// of the site still deploys; the failure just becomes visible.
if (universe.count < 500) {
  throw new Error(`only ${universe.count} Direct-Growth schemes parsed from AMFI — the format has probably changed again`);
}

// enrich the leaders of the buckets people actually browse (bounded & polite)
const SHOW_BUCKETS = [
  ["equity_largecap", "Large Cap"], ["equity_flexi", "Flexi / Multi Cap"], ["equity_midcap", "Mid Cap"],
  ["equity_smallcap", "Small Cap"], ["equity_index", "Index Funds"], ["elss", "ELSS (Tax Saver)"],
  ["hybrid_aggressive", "Aggressive Hybrid"], ["hybrid_balanced", "Balanced Advantage"],
  ["debt_corporate", "Corporate Bond"], ["debt_liquid", "Liquid"],
];
const BIG_AMC = /hdfc|icici|sbi|nippon|uti|axis|kotak|mirae|parag parikh|motilal|quant|tata|aditya|dsp|franklin|invesco|edelweiss|bandhan|canara/i;
const targets = [];
for (const [bucket] of SHOW_BUCKETS) {
  const rows = universe.funds.filter((f) => f.bucket === bucket)
    .sort((a, b) => Number(BIG_AMC.test(b.amc + b.name)) - Number(BIG_AMC.test(a.amc + a.name)));
  targets.push(...rows.slice(0, 9));
}
console.log(`[pages] enriching ${targets.length} scheme return-histories via mfapi.in …`);
let done = 0;
for (const f of targets) {
  await enrich(f.code).catch(() => null);
  if (++done % 20 === 0) console.log(`[pages]   ${done}/${targets.length}`);
  await new Promise((r) => setTimeout(r, 380));
}

const indices = [];
for (const [name, sym] of YAHOO) {
  try { indices.push({ name, ...(await yahooQuote(sym)) }); }
  catch (e) { console.log(`[pages] yahoo ${name} failed: ${String(e.message).slice(0, 50)}`); }
  await new Promise((r) => setTimeout(r, 400));
}

// ---- AI daily commentary (AIMLAPI_KEY from GitHub Actions Secrets) ----------
async function aiCommentary(idx, secs) {
  const key = process.env.AIMLAPI_KEY;
  if (!key) { console.log("[pages] AIMLAPI_KEY not set — skipping AI commentary"); return null; }
  const facts = [
    `Date: ${istStamp()}. ${marketDay ? "Market day." : "Weekend/holiday; latest available data."}`,
    ...idx.map((i) => `${i.name}: ${i.price.toFixed(2)} (${i.chgPct > 0 ? "+" : ""}${i.chgPct.toFixed(2)}%)`),
    ...secs.slice(0, 4).map((s) => `${s.label} leader: ${s.rows[0]?.name} (3Y CAGR ${s.rows[0]?.r3}%)`),
    `AMFI NAV date ${universe.navDate}; ${universe.count} Direct-Growth schemes tracked.`,
  ].join("\n");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45_000);
    const res = await fetch("https://api.aimlapi.com/v1/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AIMLAPI_MODEL || "gpt-4o-mini", max_tokens: 320, temperature: 0.55,
        messages: [
          { role: "system", content: "You write a daily 100-130 word Indian market note for ordinary investors. Use ONLY the numbers in FACTS — never invent or extrapolate any figure. Plain English, 2 short paragraphs, no headings, no advice, no hype. End with one calm, practical observation." },
          { role: "user", content: `FACTS:\n${facts}` },
        ],
      }),
    }).finally(() => clearTimeout(t));
    if (!res.ok) { console.log(`[pages] AIMLAPI HTTP ${res.status} — commentary skipped`); return null; }
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content?.trim();
    if (text && text.length > 60) { console.log("[pages] AI commentary generated"); return { text, model: process.env.AIMLAPI_MODEL || "gpt-4o-mini" }; }
    return null;
  } catch (e) { console.log("[pages] AIMLAPI unreachable —", String(e.message).slice(0, 60)); return null; }
}

// top-5 per bucket by 3Y CAGR among enriched
const sections = SHOW_BUCKETS.map(([bucket, label]) => ({
  label,
  rows: universe.funds.filter((f) => f.bucket === bucket && f.r3 !== null)
    .sort((a, b) => (b.r3 ?? -99) - (a.r3 ?? -99)).slice(0, 5)
    .map((f) => ({ name: f.name.replace(/ *-? *Direct.*$/i, ""), amc: f.amc, nav: f.nav, r1: f.r1, r3: f.r3, r5: f.r5, stars: f.stars })),
})).filter((s) => s.rows.length);

const commentary = await aiCommentary(indices, sections);

// compact full-universe payload for client-side search (name, amc, category, nav)
const allFunds = universe.funds.map((f) => [f.name.replace(/ *-? *Direct.*$/i, ""), f.amc, f.category, f.nav]);

// ------------------------------- render --------------------------------------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (x, d = 2) => (x === null || x === undefined ? "—" : Number(x).toLocaleString("en-IN", { maximumFractionDigits: d }));
const pct = (x, d = 2) => (x === null || x === undefined ? "—" : `${x > 0 ? "+" : ""}${Number(x).toFixed(d)}%`);
const cls = (x) => (x > 0 ? "up" : x < 0 ? "down" : "dim");

const html = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>myfinancial · Daily Market Brief — real NAVs & index closes, refreshed every market day</title>
<meta name="description" content="Real AMFI NAVs for all ${universe.count} Direct-Growth mutual funds, category leaders by 3-year CAGR, and Indian index closes — auto-refreshed every market day at 5 PM IST."/>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='black'/><text x='50' y='72' font-size='62' text-anchor='middle' fill='white' font-family='Georgia'>m</text></svg>"/>
<script>document.documentElement.dataset.theme = localStorage.getItem("myfin.theme") || "dark";</script>
<style>
:root{--paper:#060606;--ink:#f4f4f4;--dim:#9a9a9a;--faint:#5c5c5c;--line:#1f1f1f;--line2:#2e2e2e;--inv-bg:#fff;--inv-fg:#000;--up:#22c55e;--down:#f43f5e;--gold:#f59e0b;--card:#0a0a0a}
:root[data-theme="light"]{--paper:#f6f5f2;--ink:#151515;--dim:#55544f;--faint:#96958f;--line:#e0dfda;--line2:#c9c8c2;--inv-bg:#151515;--inv-fg:#f6f5f2;--up:#059669;--down:#dc2626;--gold:#b45309;--card:#fbfaf8}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;transition:background .25s,color .25s}
a{color:inherit}
.mono{font-family:ui-monospace,"SF Mono",Menlo,monospace}
nav{position:sticky;top:0;z-index:50;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px clamp(16px,4vw,48px);background:color-mix(in srgb,var(--paper) 90%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.wordmark{font-family:Georgia,serif;font-style:italic;font-size:19px;text-decoration:none}
.wordmark b{font-style:normal;font-family:inherit;font-weight:800}
.navlk{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);text-decoration:none;margin-left:6px}
.navlk:hover{color:var(--ink)}
.btn{border:1px solid var(--inv-bg);background:var(--inv-bg);color:var(--inv-fg);font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;padding:9px 15px;text-decoration:none;cursor:pointer}
.btn:hover{background:transparent;color:var(--ink)}
.tbtn{width:36px;height:36px;border:1px solid var(--line2);background:transparent;color:var(--ink);font-size:14px;cursor:pointer}
main{max-width:1080px;margin:0 auto;padding:44px clamp(16px,4vw,40px) 80px}
.crumb{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--faint);margin-bottom:18px}
h1{font-size:clamp(28px,5vw,44px);letter-spacing:-.03em;line-height:1.1;font-weight:800}
h1 em{font-family:Georgia,serif;font-weight:400}
.stamp{color:var(--dim);font-size:13px;margin:12px 0 34px}
.stamp b{color:var(--ink)}
.idx{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:40px}
.idx>div{background:var(--card);padding:16px 18px}
.idx .l{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.2em;color:var(--faint);text-transform:uppercase}
.idx .v{font-size:21px;font-weight:800;margin-top:5px;font-variant-numeric:tabular-nums}
.idx .c{font-size:12.5px;font-weight:700;margin-top:2px}
.up{color:var(--up)}.down{color:var(--down)}.dim{color:var(--dim)}
h2{font-size:20px;letter-spacing:-.02em;margin:38px 0 6px;font-weight:750}
.sub{color:var(--faint);font-size:11px;font-family:ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:18px}
@media(max-width:560px){.grid{grid-template-columns:1fr}}
.card{border:1px solid var(--line);background:var(--card)}
.card h3{font-size:13px;letter-spacing:.06em;text-transform:uppercase;padding:13px 16px;border-bottom:1px solid var(--line)}
table{border-collapse:collapse;width:100%;font-size:13px}
th{text-align:left;padding:8px 14px;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);border-bottom:1px solid var(--line);font-family:ui-monospace,Menlo,monospace}
th.r,td.r{text-align:right}
td{padding:8px 14px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:none}
td .amc{font-size:10.5px;color:var(--faint)}
.stars{color:var(--gold);font-size:11px;letter-spacing:1px}
.search{width:100%;background:var(--card);border:1px solid var(--line2);color:var(--ink);padding:12px 15px;font-size:14px;margin-bottom:12px}
.search:focus{outline:none;border-color:var(--ink)}
#allWrap{border:1px solid var(--line);background:var(--card);max-height:480px;overflow:auto}
.note{color:var(--faint);font-size:11px;line-height:1.7;border-top:1px dashed var(--line2);margin-top:44px;padding-top:16px}
.badge{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--line2);padding:4px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);font-family:ui-monospace,Menlo,monospace}
.pulse{width:7px;height:7px;border-radius:50%;background:var(--up);box-shadow:0 0 8px var(--up)}
</style>
</head>
<body>
<nav>
  <a class="wordmark" href="index.html"><b>my</b>financial</a>
  <a class="navlk" href="stocks.html">Companies</a>
  <a class="navlk" href="funds.html">Mutual Funds</a>
  <span class="badge"><span class="pulse"></span> auto-refreshed market days · 5 PM IST</span>
  <div style="display:flex;gap:10px;align-items:center">
    <button class="tbtn" onclick="const n=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=n;localStorage.setItem('myfin.theme',n);this.textContent=n==='light'?'☾':'☀︎'">☀︎</button>
    <a class="btn" href="https://github.com/myfinancialria/myfinancial">Run the full platform ↗</a>
  </div>
</nav>
<main>
  <div class="crumb">Daily market brief · India</div>
  <h1>Real numbers, <em>every market day.</em></h1>
  <p class="stamp">Generated <b>${istStamp()}</b> · AMFI NAV date <b>${esc(universe.navDate)}</b> · ${universe.count.toLocaleString("en-IN")} Direct-Growth schemes tracked · ${marketDay ? "market day ✓" : "weekend/holiday — latest available data"}</p>

  ${indices.length ? `<div class="idx">
    ${indices.map((i) => `<div><div class="l">${esc(i.name)}</div><div class="v">${num(i.price)}</div><div class="c ${cls(i.chgPct)}">${i.chgPct > 0 ? "▲" : i.chgPct < 0 ? "▼" : ""} ${pct(i.chgPct)}</div></div>`).join("")}
  </div>` : `<p class="stamp">Index quotes unavailable this run — fund data below is live from AMFI.</p>`}

  ${commentary ? `<div style="border:1px solid var(--line2);border-left:3px solid var(--gold);background:var(--card);padding:20px 22px;margin-bottom:38px">
    <div class="sub" style="margin-bottom:8px">✨ Today's read · written by ${esc(commentary.model)} from the numbers above</div>
    ${commentary.text.split(/\n{2,}/).map((p) => `<p style="color:var(--dim);font-size:14.5px;line-height:1.75;margin-bottom:8px">${esc(p)}</p>`).join("")}
    <div style="color:var(--faint);font-size:10px;margin-top:6px">AI-generated interpretation of the day's data — informational only, not advice.</div>
  </div>` : ""}

  <h2>Category leaders — by real 3-year CAGR</h2>
  <div class="sub">Official AMFI NAVs · return histories from mfapi.in · Direct plans, Growth option only</div>
  <div class="grid">
    ${sections.map((s) => `<div class="card">
      <h3>${esc(s.label)}</h3>
      <table>
        <thead><tr><th>Scheme</th><th class="r">NAV ₹</th><th class="r">1Y</th><th class="r">3Y</th><th class="r">5Y</th></tr></thead>
        <tbody>${s.rows.map((f) => `<tr>
          <td>${esc(f.name)}${f.stars ? ` <span class="stars">${"★".repeat(f.stars)}</span>` : ""}<div class="amc">${esc(f.amc)}</div></td>
          <td class="r">${num(f.nav)}</td>
          <td class="r ${cls(f.r1)}">${pct(f.r1, 1)}</td>
          <td class="r ${cls(f.r3)}">${pct(f.r3, 1)}</td>
          <td class="r ${cls(f.r5)}">${pct(f.r5, 1)}</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>`).join("")}
  </div>

  <h2>Every Direct-Growth fund in India — live NAV search</h2>
  <div class="sub">${universe.count.toLocaleString("en-IN")} schemes · type to filter · NAV date ${esc(universe.navDate)}</div>
  <input class="search" id="q" placeholder="Search any fund or AMC… e.g. Parag Parikh, HDFC Mid, Nifty 50"/>
  <div id="allWrap"><table><thead><tr><th>Scheme</th><th>AMC</th><th>Category</th><th class="r">NAV ₹</th></tr></thead><tbody id="allBody"></tbody></table></div>

  <div class="note">
    <b>How this page works:</b> a GitHub Action rebuilds it every market weekday at 17:00 IST (11:30 UTC) from official, free sources — AMFI NAVAll (fund NAVs), mfapi.in (return histories) and Yahoo Finance (index closes). AMFI typically publishes same-day NAVs late evening, so the NAV date shown may be the previous trading day at the 5 PM run. Educational information, not investment advice under SEBI (Investment Advisers) Regulations, 2013 — mutual funds are subject to market risks. Source code: <a href="https://github.com/myfinancialria/myfinancial" style="color:var(--ink)">github.com/myfinancialria/myfinancial</a>. Related: <a href="https://myfinancialria.github.io/myfinancial-advisor/" style="color:var(--ink)">robo-advisor app</a>.
  </div>
</main>
<script>
const FUNDS = ${JSON.stringify(allFunds)};
const body = document.getElementById("allBody");
const num = (x) => Number(x).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const esc2 = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
function paint(rows) {
  body.innerHTML = rows.slice(0, 300).map(f =>
    '<tr><td>' + esc2(f[0]) + '</td><td style="color:var(--dim)">' + esc2(f[1]) + '</td><td style="color:var(--dim)">' + esc2(f[2]) + '</td><td class="r">' + num(f[3]) + '</td></tr>').join("") +
    (rows.length > 300 ? '<tr><td colspan="4" style="color:var(--faint)">…' + (rows.length - 300).toLocaleString("en-IN") + ' more — refine the search</td></tr>' : "");
}
paint(FUNDS);
document.getElementById("q").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  paint(!q ? FUNDS : FUNDS.filter(f => (f[0] + " " + f[1] + " " + f[2]).toLowerCase().includes(q)));
});
document.querySelector(".tbtn").textContent = document.documentElement.dataset.theme === "light" ? "☾" : "☀︎";
</script>
</body></html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "brief.html"), html);
fs.writeFileSync(path.join(OUT_DIR, ".nojekyll"), "");
const enriched = universe.funds.filter((f) => f.enriched).length;
console.log(`[pages] wrote dist/brief.html (${(html.length / 1024).toFixed(0)} KB) · ${sections.length} category tables · ${enriched} schemes enriched · ${indices.length}/${YAHOO.length} indices`);

// The landing page only. Company, fund and screener pages are now produced by
// build_app.mjs from the full screener dataset — every listed company rather
// than the subset a token had fetched — so buildSite() is deliberately NOT
// called here: it would overwrite those pages with the narrower older ones.
const { buildHome } = await import("./build_site.mjs");
console.log(buildHome() ? "[site] homepage = the designed landing page (dist/index.html)" : "[site] home.html missing — no landing page written");
