// ---------------------------------------------------------------------------
// build_site.mjs — the PUBLIC website: every company we hold real fundamentals
// for, every live mutual fund, as static pages GitHub Pages can serve.
//
//   dist/stocks.html            index of covered companies
//   dist/stock/<SYMBOL>.html    ratios · sector benchmark · 3 statements ·
//                               shareholding · corporate actions · rivals
//   dist/funds.html             all live Direct-Growth schemes, searchable
//
// Data: real fundamentals come from var/ufund/ when built locally (a token is
// present) and are snapshotted to data/fundamentals.json, which is committed so
// the 17:00 IST GitHub Actions build can regenerate the site without a token.
// Mutual fund data is fetched live from AMFI on every build — no auth needed.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist");
const CACHE = path.join(ROOT, "var", "ufund");
const SNAPSHOT = path.join(ROOT, "data", "fundamentals.json");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? "—" : Number(x).toLocaleString("en-IN", { maximumFractionDigits: d }));
const pct = (x, d = 2) => (x === null || x === undefined ? "—" : `${Number(x).toFixed(d)}%`);
const cls = (x) => (x > 0 ? "up" : x < 0 ? "down" : "");

// ------------------------------- shared chrome ------------------------------
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#f4f4f4;--ink-dim:#9a9a9a;--ink-faint:#5c5c5c;--paper:#060606;--paper-2:#0d0d0d;--line:#1f1f1f;--line-2:#2e2e2e;--inv-bg:#fff;--inv-fg:#000;--grain:.05;
--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,"Helvetica Neue",Arial,sans-serif;--serif:Georgia,"Times New Roman",serif;--mono:ui-monospace,"SF Mono",Menlo,monospace;
--ease:cubic-bezier(.22,.8,.24,1);--up:#22c55e;--down:#ef4444}
:root[data-theme=light]{--ink:#151515;--ink-dim:#55544f;--ink-faint:#96958f;--paper:#f6f5f2;--paper-2:#edece8;--line:#e0dfda;--line-2:#c9c8c2;--inv-bg:#151515;--inv-fg:#f6f5f2;--grain:.035;--up:#15803d;--down:#b91c1c}
body{background:var(--paper);color:var(--ink);font-family:var(--font);line-height:1.55;overflow-x:hidden;-webkit-font-smoothing:antialiased;transition:background .25s,color .25s}
a{color:inherit;text-decoration:none}
::selection{background:var(--inv-bg);color:var(--inv-fg)}
body::after{content:"";position:fixed;inset:-50%;z-index:90;pointer-events:none;opacity:var(--grain);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E")}
.wrap{max-width:1200px;margin:0 auto;padding:0 clamp(20px,4vw,56px) 90px}
nav.site{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:clamp(14px,2.6vw,34px);padding:16px clamp(20px,4vw,56px);
background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.wordmark{font-family:var(--serif);font-size:20px;letter-spacing:-.02em;font-style:italic}
.wordmark b{font-style:normal;font-family:var(--font);font-weight:800;letter-spacing:-.04em}
nav.site .lk{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-dim);position:relative;padding:4px 0;transition:color .25s}
nav.site .lk::after{content:"";position:absolute;left:0;bottom:0;height:1px;width:0;background:var(--ink);transition:width .3s var(--ease)}
nav.site .lk:hover,nav.site .lk.on{color:var(--ink)}nav.site .lk:hover::after,nav.site .lk.on::after{width:100%}
.spacer{flex:1}
button.tt{width:38px;height:38px;border:1px solid var(--line-2);background:transparent;color:var(--ink);font-size:15px;cursor:pointer}
.eyebrow{display:inline-flex;align-items:center;gap:12px;font-family:var(--mono);font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--ink-dim);margin-bottom:18px}
.eyebrow::before{content:"";width:44px;height:1px;background:var(--ink-dim)}
h1{font-size:clamp(34px,5.2vw,60px);line-height:1.02;letter-spacing:-.04em;font-weight:800;margin-bottom:12px}
h1 em{font-family:var(--serif);font-weight:400;font-style:italic;letter-spacing:-.02em}
h2{font-size:14px;letter-spacing:.02em;font-weight:700;margin:0}
.sub{color:var(--ink-dim);font-size:14.5px;line-height:1.75;max-width:74ch}
.head{padding:56px 0 6px}
.card{border:1px solid var(--line);background:var(--paper-2);margin-top:22px}
.card-h{padding:15px 20px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.card-b{padding:18px 20px}
.chip{display:inline-block;font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;border:1px solid var(--line-2);color:var(--ink-dim);padding:3px 9px}
.chip.ok{color:var(--ink);border-color:var(--ink)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint);font-weight:500;padding:11px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:11px 14px;border-bottom:1px solid var(--line)}
tbody tr:hover{background:color-mix(in srgb,var(--ink) 4%,transparent)}
.num{text-align:right;font-variant-numeric:tabular-nums;font-family:var(--mono);font-size:12.5px}
.up{color:var(--up)}.down{color:var(--down)}.dim{color:var(--ink-dim)}
.scroll{overflow-x:auto}
.grid{display:grid;gap:18px}
.grid>*{min-width:0}
.card{min-width:0}
.scroll{overflow-x:auto;max-width:100%}
table{min-width:max-content}
.g2{grid-template-columns:repeat(auto-fit,minmax(330px,1fr))}
.g4{grid-template-columns:repeat(auto-fit,minmax(158px,1fr))}
.stat{border:1px solid var(--line);padding:15px 17px;background:var(--paper-2)}
.stat .k{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint)}
.stat .v{font-size:23px;font-weight:800;margin-top:5px;letter-spacing:-.03em}
input.s{width:100%;background:transparent;border:1px solid var(--line-2);color:var(--ink);padding:13px 16px;font-size:14.5px;font-family:var(--font)}
input.s:focus{outline:none;border-color:var(--ink)}
.note{color:var(--ink-faint);font-size:12px;line-height:1.7;padding:14px 20px;border-top:1px solid var(--line)}
.tabs{display:flex;border-bottom:1px solid var(--line);flex-wrap:wrap}
.tabs button{background:none;border:none;border-bottom:1px solid transparent;color:var(--ink-dim);padding:12px 18px;cursor:pointer;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;font-family:var(--font)}
.tabs button.on{color:var(--ink);border-bottom-color:var(--ink)}
.strong td{font-weight:700;border-top:1px solid var(--line-2)}
footer.site{border-top:1px solid var(--line);color:var(--ink-faint);font-size:11.5px;line-height:1.8;padding:26px 0 46px;margin-top:52px}
footer.site a{color:var(--ink-dim);text-decoration:underline}
@media(max-width:640px){nav.site .lk{font-size:10.5px;letter-spacing:.08em}}
`;

// `base` is "" for root pages and "../" for pages under /stock/, so the nav
// resolves correctly from both depths.
const shell = (title, desc, body, active = "", base = "") => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>\u{1F4A0}</text></svg>">
<script>document.documentElement.dataset.theme=localStorage.getItem("myfin.theme")||"dark"</script>
<style>${CSS}</style></head><body>
<nav class="site">
<a class="wordmark" href="${base}index.html">my<b>financial</b></a>
<a class="lk${active === "stocks" ? " on" : ""}" href="${base}stocks.html">Companies</a>
<a class="lk${active === "funds" ? " on" : ""}" href="${base}funds.html">Mutual Funds</a>
<a class="lk${active === "brief" ? " on" : ""}" href="${base}brief.html">Daily Brief</a>
<div class="spacer"></div>
<button class="tt" title="Toggle light / dark" onclick="var r=document.documentElement,n=r.dataset.theme==='dark'?'light':'dark';r.dataset.theme=n;localStorage.setItem('myfin.theme',n)">\u263C</button>
</nav><div class="wrap">${body}</div>
<footer class="site"><div class="wrap">
Educational research only \u2014 not investment advice under SEBI (Investment Advisers) Regulations, 2013. Investments are subject to market risks; read all scheme-related documents carefully.<br>
Company fundamentals are real filed data via the Upstox Company Fundamentals API. Mutual fund NAVs are official AMFI data; returns are computed from published NAV history. Past performance does not indicate future results.<br>
<a href="${base}index.html">Home</a> \u00b7 <a href="https://github.com/myfinancialria/myfinancial" rel="noopener">GitHub</a>
</div></footer></body></html>`;

// ------------------------------ the homepage --------------------------------
// The public landing page IS the designed homepage — same monochrome art,
// motion and copy. Only the destinations change: on GitHub Pages there is no
// server, so app routes are rewired to the static pages that hold real data,
// and the modules that genuinely need the running platform say so instead of
// pretending to work.
const REPO = "https://github.com/myfinancialria/myfinancial";
const ROUTE_MAP = [
  [/href="\/app#\/funds"/g, 'href="funds.html"'],
  [/href="\/app#\/equities\/screeners\/[a-z]+"/g, 'href="stocks.html"'],
  [/href="\/app#\/equities"/g, 'href="stocks.html"'],
  [/href="\/app#\/dashboard"/g, 'href="brief.html"'],
  [/href="\/app#\/planning\/fema"/g, `href="${REPO}#nri--fema" rel="noopener"`],
  [/href="\/app#\/planning"/g, `href="${REPO}#run-it" rel="noopener"`],
  [/href="\/app#\/advisory"/g, `href="${REPO}#run-it" rel="noopener"`],
  [/href="\/app#\/estate"/g, `href="${REPO}#run-it" rel="noopener"`],
  [/href="\/app"/g, 'href="stocks.html"'],
  [/href="\/learn"/g, `href="${REPO}#insights" rel="noopener"`],
  [/href="https:\/\/myfinancialria\.github\.io\/myfinancial\/"/g, 'href="brief.html"'],
];

export function buildHome() {
  const src = path.join(ROOT, "public", "home.html");
  if (!fs.existsSync(src)) return false;
  let html = fs.readFileSync(src, "utf8");
  for (const [re, to] of ROUTE_MAP) html = html.replace(re, to);

  // the three module cards that need a server get an honest label
  html = html.replace(/(<a class="mod reveal" href="[^"]*github[^"]*"[^>]*>)([\s\S]*?)(<span class="go">)Open module →(<\/span>)/g,
    '$1$2<span class="mod-tag">Runs in the full platform</span>$3Get the code →$4');
  html = html.replace("</style>", `.mod-tag{position:absolute;top:clamp(26px,3vw,42px);right:clamp(26px,3vw,42px);font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);border:1px solid var(--line-2);padding:3px 8px;max-width:9em;line-height:1.35;text-align:right}
.pub-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
</style>`);

  // give the hero a second call to action pointing at the live public data
  html = html.replace(/<a class="btn" href="stocks\.html">Launch Platform <span class="arr">→<\/span><\/a>/g,
    '<a class="btn" href="stocks.html">Explore 211 Companies <span class="arr">→</span></a>');
  html = html.replace(/<a class="btn" style="font-size: 15px; padding: 16px 34px" href="stocks\.html">Launch the Platform <span class="arr">→<\/span><\/a>/,
    '<a class="btn" style="font-size:15px;padding:16px 34px" href="stocks.html">Explore the Research <span class="arr">→</span></a>');

  // nav: swap the app launcher for the public sections


  fs.writeFileSync(path.join(OUT, "index.html"), html);
  return true;
}

// ------------------------------- load data ----------------------------------
export function loadFundamentals() {
  let list = [];
  if (fs.existsSync(CACHE)) {
    for (const f of fs.readdirSync(CACHE)) {
      if (!f.endsWith(".json") || f.endsWith(".q.json")) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(CACHE, f), "utf8"));
        if (j && j.ratios) list.push(j);
      } catch { /* skip */ }
    }
  }
  if (list.length) {                                   // refresh the committed snapshot
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
    fs.writeFileSync(SNAPSHOT, JSON.stringify({ generated: new Date().toISOString(), companies: list }));
    console.log(`[site] snapshot refreshed from local cache → data/fundamentals.json (${list.length} companies)`);
  } else if (fs.existsSync(SNAPSHOT)) {
    list = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")).companies || [];
    console.log(`[site] using committed snapshot (${list.length} companies)`);
  }
  return list;
}

// ------------------------------ company page --------------------------------
const RATIO_ROWS = [
  ["pe", "P/E", "What you pay for ₹1 of yearly profit", "×"],
  ["pb", "P/B", "Price against net assets on the books", "×"],
  ["evEbitda", "EV/EBITDA", "Whole-business value vs operating cash profit", "×"],
  ["roe", "ROE", "Profit earned on shareholders' own money", "%"],
  ["roce", "ROCE", "Return on all capital employed, debt included", "%"],
  ["roa", "ROA", "Profit squeezed from every rupee of assets", "%"],
  ["patMarginPct", "Net margin", "Final profit per ₹100 of sales", "%"],
  ["quickRatio", "Quick ratio", "Can short-term dues be met without selling stock", "×"],
  ["debtToEquity", "Debt / Equity", "Borrowings against own funds", "×"],
  ["dividendYieldPct", "Dividend yield", "Cash returned yearly as % of price", "%"],
  ["eps", "EPS", "Profit attributable to each share", "₹"],
  ["revGrowthPct", "Revenue growth", "Latest year versus the one before", "%"],
];

function stmtTable(rows, specs) {
  if (!rows?.length || !specs?.length) return "";
  const cols = rows.slice(-5);
  const live = specs.filter((s) => cols.some((c) => c[s.k] !== null && c[s.k] !== undefined));
  return `<div class="scroll"><table><thead><tr><th>₹ Crore</th>${cols.map((c) => `<th class="num">${esc(c.fy)}</th>`).join("")}</tr></thead><tbody>
${live.map((s) => `<tr${s.strong ? ' class="strong"' : ""}><td>${esc(s.label)}</td>${cols.map((c) => {
    const v = c[s.k];
    const d = v === null || v === undefined ? "—" : /^eps/i.test(s.k) ? "₹" + num(v) : num(v, 0);
    return `<td class="num ${s.signed ? cls(v) : ""}">${d}</td>`;
  }).join("")}</tr>`).join("\n")}
</tbody></table></div>`;
}

function companyPage(c, bySymbol) {
  const r = c.ratios || {};
  const st = c.statements || {};
  const bench = (c.sectorBenchmarks || []).filter((b) => b.company !== null && b.sector !== null);
  const hd = c.holdings;

  const stats = [["P/E", num(r.pe) + "×"], ["P/B", num(r.pb) + "×"], ["ROE", pct(r.roe)], ["ROCE", pct(r.roce)]]
    .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

  const ratioRows = RATIO_ROWS.filter(([k]) => r[k] !== null && r[k] !== undefined)
    .map(([k, label, why, suf]) => `<tr><td><b>${label}</b><div class="dim" style="font-size:11.5px">${why}</div></td><td class="num">${suf === "₹" ? "₹" + num(r[k]) : num(r[k]) + suf}</td></tr>`).join("");

  const benchRows = bench.map((b) => {
    const diff = b.sector ? ((b.company - b.sector) / Math.abs(b.sector)) * 100 : 0;
    const val = /^(pe|pb|evEbitda)$/.test(b.key) ? diff <= 0 : diff >= 0;
    const word = Math.abs(diff) < 5 ? "in line with sector" : `${Math.abs(diff).toFixed(1)}% ${diff > 0 ? "above" : "below"} sector`;
    return `<tr><td><b>${esc(b.name)}</b></td><td class="num">${num(b.company)}</td><td class="num dim">${num(b.sector)}</td><td class="${Math.abs(diff) < 5 ? "dim" : val ? "up" : "down"}">${word}</td></tr>`;
  }).join("");

  const holdRows = hd ? hd.rows.map((row) => {
    const d = row.values[0] !== null && row.values[1] !== null ? row.values[0] - row.values[1] : null;
    return `<tr><td><b>${esc(row.label)}</b></td>${hd.periods.slice(0, 5).map((p, i) => `<td class="num">${row.values[i] === null || row.values[i] === undefined ? "—" : row.values[i] + "%"}</td>`).join("")}<td class="num ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d === null ? "—" : (d > 0 ? "+" : "") + d.toFixed(2)}</td></tr>`;
  }).join("") : "";

  const rivalRows = (c.competitors || []).map((p0) => {
    // a covered peer's ratios come from its own record — no extra API calls
    const own = p0.symbol ? bySymbol.get(p0.symbol) : null;
    const p = own ? { ...p0, pe: p0.pe ?? own.pe, pb: p0.pb ?? own.pb, evEbitda: p0.evEbitda ?? own.evEbitda, roe: p0.roe ?? own.roe, roce: p0.roce ?? own.roce } : p0;
    const link = p.symbol && bySymbol.has(p.symbol);
    const nm = link ? `<a href="./${encodeURIComponent(p.symbol)}.html" style="font-weight:650">${esc(p.name)} ↗</a>` : esc(p.name);
    return `<tr><td>${nm}<div class="dim" style="font-size:11.5px">${p.symbol ? esc(p.symbol) : "not NSE-listed"}</div></td><td class="num">${num(p.pe)}</td><td class="num">${num(p.pb)}</td><td class="num">${num(p.evEbitda)}</td><td class="num">${num(p.roe)}</td><td class="num">${num(p.roce)}</td></tr>`;
  }).join("");

  const actionRows = (c.corporateActions || []).map((a) =>
    `<tr><td><b>${esc(a.type)}</b></td><td>${esc(a.date || "—")}</td><td class="dim">${esc(a.detail || "—")}</td></tr>`).join("");

  const tabs = [["pnl", "P&amp;L", stmtTable(st.pnl, st.specs?.pnl)], ["bs", "Balance Sheet", stmtTable(st.balanceSheet, st.specs?.bs)], ["cf", "Cash Flow", stmtTable(st.cashFlow, st.specs?.cf)]]
    .filter(([, , html]) => html);

  const body = `
<h1>${esc(c.name || c.symbol)}</h1>
<div class="sub">${esc(c.symbol)} · NSE${c.profile?.sector ? ` · ${esc(c.profile.sector)}` : ""} · <span class="chip ok">Real filed data</span> as of ${esc(c.asOf)}</div>
<div class="grid g4" style="margin-top:18px">${stats}</div>
${c.profile?.description ? `<div class="card"><div class="card-h"><h2>What this company does</h2></div><div class="card-b" style="color:var(--dim);line-height:1.75">${esc(c.profile.description)}</div></div>` : ""}
<div class="grid g2">
  <div class="card"><div class="card-h"><h2>Key ratios</h2><span class="chip ok">Real</span></div>
    <div class="scroll"><table><tbody>${ratioRows}</tbody></table></div></div>
  ${benchRows ? `<div class="card"><div class="card-h"><h2>Against its sector</h2><span class="chip ok">Real benchmark</span></div>
    <div class="scroll"><table><thead><tr><th>Metric</th><th class="num">${esc(c.symbol)}</th><th class="num">Sector</th><th>Standing</th></tr></thead><tbody>${benchRows}</tbody></table></div></div>` : ""}
</div>
${tabs.length ? `<div class="card"><div class="card-h"><h2>Financial statements</h2><span class="chip">₹ crore · last 5 years</span></div>
<div class="tabs">${tabs.map(([id, label], i) => `<button class="${i === 0 ? "on" : ""}" data-t="${id}">${label}</button>`).join("")}</div>
${tabs.map(([id, , html], i) => `<div class="pane" data-p="${id}" style="${i ? "display:none" : ""}">${html}</div>`).join("")}
<div class="note">${esc(st.note || "")}</div></div>` : ""}
${holdRows ? `<div class="card"><div class="card-h"><h2>Who owns this company</h2><span class="chip ok">Real · ${esc(hd.periods[0])}</span></div>
<div class="scroll"><table><thead><tr><th>Holder</th>${hd.periods.slice(0, 5).map((p) => `<th class="num">${esc(p)}</th>`).join("")}<th class="num">QoQ</th></tr></thead><tbody>${holdRows}</tbody></table></div>
<div class="note">Promoters are the founding owners. A rising promoter stake usually signals confidence; a falling one is worth understanding before investing.</div></div>` : ""}
<div class="grid g2">
${rivalRows ? `<div class="card"><div class="card-h"><h2>Rivals, side by side</h2><span class="chip ok">Real</span></div>
<div class="scroll"><table><thead><tr><th>Company</th><th class="num">P/E</th><th class="num">P/B</th><th class="num">EV/EBITDA</th><th class="num">ROE</th><th class="num">ROCE</th></tr></thead><tbody>${rivalRows}</tbody></table></div>
<div class="note">Click any NSE-listed rival to open its full page.</div></div>` : ""}
${actionRows ? `<div class="card"><div class="card-h"><h2>Corporate actions</h2><span class="chip ok">Real</span></div>
<div class="scroll"><table><thead><tr><th>Action</th><th>Ex-date</th><th>Details</th></tr></thead><tbody>${actionRows}</tbody></table></div>
<div class="note">You must own the share before the ex-date to receive the dividend or bonus.</div></div>` : ""}
</div>
<p class="sub" style="margin-top:26px"><a href="../stocks.html">← All companies</a></p>
<script>
document.querySelectorAll('.tabs button').forEach(function(b){b.onclick=function(){
  document.querySelectorAll('.tabs button').forEach(function(x){x.classList.toggle('on',x===b)});
  document.querySelectorAll('.pane').forEach(function(p){p.style.display=p.dataset.p===b.dataset.t?'':'none'});
}});
</script>`;
  return shell(`${c.name || c.symbol} — ratios, statements & shareholding | myfinancial`,
    `Real filed fundamentals for ${c.name || c.symbol}: P/E, ROE, ROCE, full P&L, balance sheet, cash flow, shareholding pattern and peer comparison.`, body, "stocks", "../");
}

// ------------------------------ index pages ---------------------------------
function stocksIndex(list) {
  const rows = list.map((c) => {
    const r = c.ratios || {};
    return `<tr><td><a href="./stock/${encodeURIComponent(c.symbol)}.html" style="font-weight:650">${esc(c.name || c.symbol)}</a><div class="dim" style="font-size:11.5px">${esc(c.symbol)}${c.profile?.sector ? " · " + esc(c.profile.sector) : ""}</div></td>
<td class="num">${num(r.pe)}</td><td class="num">${num(r.pb)}</td><td class="num">${num(r.roe)}</td><td class="num">${num(r.roce)}</td><td class="num">${num(r.patMarginPct)}</td></tr>`;
  }).join("");
  const body = `<h1>Companies</h1>
<div class="sub">${list.length} NSE-listed companies with real filed fundamentals — ratios, three financial statements, shareholding and peer comparison for each.</div>
<div class="card"><div class="card-h"><h2>Coverage</h2><span class="chip ok">Real filed data</span></div>
<div class="card-b"><input class="s" id="q" placeholder="Search a company or symbol…" autocomplete="off"></div>
<div class="scroll"><table id="t"><thead><tr><th>Company</th><th class="num">P/E</th><th class="num">P/B</th><th class="num">ROE %</th><th class="num">ROCE %</th><th class="num">Net margin %</th></tr></thead><tbody>${rows}</tbody></table></div></div>
<script>
var q=document.getElementById('q');q.oninput=function(){var v=q.value.toLowerCase();
document.querySelectorAll('#t tbody tr').forEach(function(tr){tr.style.display=tr.innerText.toLowerCase().indexOf(v)>-1?'':'none'})};
</script>`;
  return shell("Companies — real fundamentals for NSE-listed stocks | myfinancial",
    "Ratios, P&L, balance sheet, cash flow, shareholding and peer comparison for NSE-listed companies, from real filed data.", body, "stocks");
}

function fundsPage(funds, navDate) {
  const live = funds.filter((f) => !f.stale);
  const compact = live.map((f) => [f.name.replace(/ *-? *Direct.*$/i, "").slice(0, 74), f.amc, f.category, f.nav, f.r1, f.r3, f.r5, f.stars || 0]);
  const withRet = live.filter((f) => f.enriched).length;
  const body = `<h1>Mutual Funds</h1>
<div class="sub">Every live Direct-Growth scheme — ${live.length.toLocaleString("en-IN")} funds, official AMFI NAVs dated ${esc(navDate)}. ${withRet.toLocaleString("en-IN")} carry returns computed from published NAV history. Wound-up schemes are excluded.</div>
<div class="card"><div class="card-h"><h2>Screener</h2><span class="chip ok">Live AMFI data</span></div>
<div class="card-b"><input class="s" id="q" placeholder="Search fund or AMC — e.g. &quot;Parag Parikh&quot;, &quot;index&quot;, &quot;small cap&quot;…" autocomplete="off">
<div class="sub" style="margin-top:9px" id="cnt"></div></div>
<div class="scroll"><table id="t"><thead><tr><th>Scheme (Direct · Growth)</th><th>Category</th><th class="num">NAV ₹</th><th class="num">1Y</th><th class="num">3Y</th><th class="num">5Y</th></tr></thead><tbody></tbody></table></div>
<div class="note">Direct plans carry no distributor commission, so they cost less than regular plans every year — over decades that gap compounds meaningfully. Returns are CAGR from published NAV history; past performance does not indicate future results.</div></div>
<script>
var D=${JSON.stringify(compact)};
var tb=document.querySelector('#t tbody'),q=document.getElementById('q'),cnt=document.getElementById('cnt');
function n(x){return x===null||x===undefined?'—':Number(x).toLocaleString('en-IN',{maximumFractionDigits:2})}
function c(x){return x>0?'up':x<0?'down':''}
function paint(rows){
 tb.innerHTML=rows.slice(0,400).map(function(f){return '<tr><td><b>'+f[0].replace(/</g,'&lt;')+'</b><div class="dim" style="font-size:11.5px">'+f[1]+'</div></td><td class="dim">'+f[2]+'</td><td class="num">'+n(f[3])+'</td><td class="num '+c(f[4])+'">'+n(f[4])+'</td><td class="num '+c(f[5])+'">'+n(f[5])+'</td><td class="num '+c(f[6])+'">'+n(f[6])+'</td></tr>'}).join('');
 cnt.textContent=rows.length.toLocaleString('en-IN')+' funds'+(rows.length>400?' — showing first 400, refine your search':'');
}
q.oninput=function(){var v=q.value.toLowerCase();paint(v?D.filter(function(f){return (f[0]+' '+f[1]+' '+f[2]).toLowerCase().indexOf(v)>-1}):D)};
paint(D);
</script>`;
  return shell("Mutual Funds — every live Direct-Growth scheme | myfinancial",
    "Searchable list of all live Direct-Growth mutual fund schemes with official AMFI NAVs and real 1/3/5-year returns.", body, "funds");
}

// --------------------------------- build ------------------------------------
export function buildSite({ funds = [], navDate = "" } = {}) {
  const list = loadFundamentals().sort((a, b) => (a.name || a.symbol).localeCompare(b.name || b.symbol));
  const bySymbol = new Map(list.map((c) => [c.symbol, c.ratios || {}]));
  fs.mkdirSync(path.join(OUT, "stock"), { recursive: true });
  for (const c of list) fs.writeFileSync(path.join(OUT, "stock", `${c.symbol}.html`), companyPage(c, bySymbol));
  fs.writeFileSync(path.join(OUT, "stocks.html"), stocksIndex(list));
  if (funds.length) fs.writeFileSync(path.join(OUT, "funds.html"), fundsPage(funds, navDate));
  console.log(`[site] wrote stocks.html + ${list.length} company pages${funds.length ? ` + funds.html (${funds.filter((f) => !f.stale).length} live schemes)` : ""}`);
  return { companies: list.length, funds: funds.filter((f) => !f.stale).length };
}

if (import.meta.url === `file://${process.argv[1]}`) buildSite();
