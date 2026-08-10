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
import { INDUSTRY, POLICY, PRODUCTS, SUBSECTOR_OF } from "../server/data/sectorIntel.js";
import { STOCK_MAP, SECTORS } from "../server/data/universe.js";

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
<a class="lk${active === "screeners" ? " on" : ""}" href="${base}screeners.html">Screeners</a>
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
  // the app's screener routes now have a real static counterpart
  [/href="\/app#\/equities\/screeners\/[a-z]+"/g, 'href="screener.html"'],
  [/href="\/app#\/equities\/screeners"/g, 'href="screener.html"'],
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

  // The landing page's nav is written for the running app, where everything sits
  // behind /app. On the public site the data pages ARE the product, so put them
  // first — a visitor should reach the screener without reading a pitch.
  html = html.replace(
    '<a href="#platform">Platform</a>',
    '<a href="screener.html">Screener</a><a href="stocks.html">Companies</a><a href="funds.html">Mutual Funds</a><a href="#platform">Platform</a>',
  );

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

// ------------------------------ price chart ---------------------------------
const BARS_DIR = path.join(ROOT, "var", "ubars");
const BARS_SNAP = path.join(ROOT, "data", "bars.json");
let barsSnapshot = null;

export function loadBars() {
  const out = {};
  if (fs.existsSync(BARS_DIR)) {
    for (const f of fs.readdirSync(BARS_DIR)) {
      if (!f.endsWith(".json")) continue;
      try { out[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(BARS_DIR, f), "utf8")); } catch { /* skip */ }
    }
  }
  if (Object.keys(out).length) return out;
  if (!barsSnapshot && fs.existsSync(BARS_SNAP)) barsSnapshot = JSON.parse(fs.readFileSync(BARS_SNAP, "utf8"));
  return barsSnapshot || {};
}

const sma = (vals, n, i) => (i + 1 < n ? null : vals.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n);

/**
 * Inline SVG price chart — real closes, 50/200-day moving averages, volume
 * bars. No libraries, no external requests: it renders anywhere, including
 * inside a strict CSP.
 */
function priceChart(bars, { w = 1100, h = 300, vh = 54 } = {}) {
  if (!bars || bars.length < 30) return "";
  const closes = bars.map((b) => b[1]);
  const vols = bars.map((b) => b[2] || 0);
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const pad = (hi - lo) * 0.08 || 1;
  const yMin = lo - pad, yMax = hi + pad;
  const X = (i) => (i / (bars.length - 1)) * w;
  const Y = (v) => h - ((v - yMin) / (yMax - yMin)) * h;
  const line = (pick) => {
    let d = "", started = false;
    bars.forEach((_, i) => {
      const v = pick(i);
      if (v === null || v === undefined) { started = false; return; }
      d += `${started ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;
      started = true;
    });
    return d;
  };
  const priceD = line((i) => closes[i]);
  const ma50 = line((i) => sma(closes, 50, i));
  const ma200 = line((i) => sma(closes, 200, i));
  const up = closes[closes.length - 1] >= closes[0];
  const stroke = up ? "var(--up)" : "var(--down)";
  const maxVol = Math.max(...vols) || 1;
  const volBars = bars.map((b, i) => {
    const bw = Math.max(0.6, w / bars.length - 0.4);
    const bh = ((b[2] || 0) / maxVol) * vh;
    return `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${(vh - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="currentColor" opacity=".28"/>`;
  }).join("");
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = yMax - t * (yMax - yMin);
    return `<line x1="0" y1="${(t * h).toFixed(1)}" x2="${w}" y2="${(t * h).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
<text x="4" y="${(t * h - 4).toFixed(1)}" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">${num(v, 0)}</text>`;
  }).join("");
  const firstDate = bars[0][0], lastDate = bars[bars.length - 1][0];
  return `<div class="scroll"><svg viewBox="0 0 ${w} ${h + vh + 18}" preserveAspectRatio="none" style="width:100%;height:${h + vh + 18}px;display:block" role="img" aria-label="Daily closing price">
${gridY}
<path d="${priceD}" fill="none" stroke="${stroke}" stroke-width="1.8"/>
${ma50 ? `<path d="${ma50}" fill="none" stroke="var(--ink-dim)" stroke-width="1" stroke-dasharray="4 3"/>` : ""}
${ma200 ? `<path d="${ma200}" fill="none" stroke="var(--ink-faint)" stroke-width="1"/>` : ""}
<g transform="translate(0 ${h + 14})" color="var(--ink-dim)">${volBars}</g>
<text x="0" y="${h + vh + 16}" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">${firstDate}</text>
<text x="${w}" y="${h + vh + 16}" text-anchor="end" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">${lastDate}</text>
</svg></div>`;
}

/** Small inline sparkline for list rows and fund cards. */
function sparkline(values, { w = 150, h = 34 } = {}) {
  if (!values || values.length < 5) return "";
  const lo = Math.min(...values), hi = Math.max(...values), rng = hi - lo || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - ((v - lo) / rng) * h).toFixed(1)}`).join("");
  const up = values[values.length - 1] >= values[0];
  return `<svg viewBox="0 0 ${w} ${h}" style="width:${w}px;height:${h}px;display:block"><path d="${d}" fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="1.5"/></svg>`;
}

// --------------------- SWOT & health from the real data ----------------------
// Derived from filed figures and the published sector benchmark, so the verdict
// matches the numbers shown on the same page.
function analyse(c, bars) {
  const r = c.ratios || {};
  const b = Object.fromEntries((c.sectorBenchmarks || []).filter((x) => x.key && x.sector !== null).map((x) => [x.key, x.sector]));
  const pnl = c.statements?.pnl || [];
  const hd = c.holdings;
  const S = [], W = [], O = [], T = [];
  const better = (k, higher = true) => (r[k] == null || b[k] == null ? null : higher ? r[k] > b[k] * 1.05 : r[k] < b[k] * 0.95);

  if (better("roce")) S.push(`Earns a ROCE of ${pct(r.roce)} against a sector benchmark of ${pct(b.roce)} — capital works harder here than at the average peer.`);
  else if (better("roce") === false) W.push(`ROCE of ${pct(r.roce)} trails the sector's ${pct(b.roce)}, so each rupee of capital earns less than at rivals.`);
  if (better("roe")) S.push(`Return on equity of ${pct(r.roe)} beats the sector's ${pct(b.roe)}.`);
  else if (better("roe") === false) W.push(`Return on equity of ${pct(r.roe)} is below the sector's ${pct(b.roe)}.`);
  if (r.patMarginPct != null && r.patMarginPct > 12) S.push(`Keeps ${pct(r.patMarginPct)} of every rupee of sales as final profit — a comfortable margin cushion.`);
  if (r.patMarginPct != null && r.patMarginPct < 5) W.push(`A thin net margin of ${pct(r.patMarginPct)} leaves little room if costs rise.`);
  if (better("pe", false)) O.push(`Trades at ${num(r.pe)}× earnings versus the sector's ${num(b.pe)}× — cheaper than peers, which is worth investigating rather than assuming is a bargain.`);
  if (better("pe", true)) T.push(`At ${num(r.pe)}× earnings against the sector's ${num(b.pe)}×, the price already assumes things go well; disappointment tends to be punished.`);
  if (r.debtToEquity != null && r.debtToEquity > 1) T.push(`Borrowings run at ${num(r.debtToEquity)}× equity, so interest costs bite harder if rates stay high.`);
  if (r.debtToEquity != null && r.debtToEquity < 0.3) S.push(`Carries little debt (${num(r.debtToEquity)}× equity), which keeps the company flexible in a downturn.`);
  if (r.quickRatio != null && r.quickRatio < 0.7) W.push(`A quick ratio of ${num(r.quickRatio)} means short-term dues are not fully covered by liquid assets.`);

  if (pnl.length >= 2) {
    const last = pnl[pnl.length - 1], prev = pnl[pnl.length - 2];
    const lr = last.totalRevenue ?? last.revenue, pr = prev.totalRevenue ?? prev.revenue;
    if (lr && pr) {
      const g = ((lr - pr) / Math.abs(pr)) * 100;
      if (g > 12) S.push(`Revenue grew ${pct(g)} in ${last.fy}, comfortably ahead of inflation.`);
      else if (g < 3) W.push(`Revenue moved just ${pct(g)} in ${last.fy} — growth has stalled.`);
    }
    if (last.pat != null && prev.pat != null && prev.pat > 0) {
      const g = ((last.pat - prev.pat) / Math.abs(prev.pat)) * 100;
      if (g > 15) O.push(`Profit rose ${pct(g)} in ${last.fy}; sustained, that compounds quickly.`);
      if (g < -10) T.push(`Profit fell ${pct(g)} in ${last.fy}, which is the number to watch next quarter.`);
    }
  }
  if (hd?.latest && hd?.prev) {
    const p0 = hd.latest.promoters, p1 = hd.prev.promoters;
    if (p0 != null && p1 != null && p0 > p1 + 0.05) S.push(`Promoters raised their stake to ${pct(p0)} last quarter — the owners are buying.`);
    if (p0 != null && p1 != null && p0 < p1 - 0.05) T.push(`Promoter holding slipped to ${pct(p0)} from ${pct(p1)}; understand why before investing.`);
    const f0 = hd.latest.fii, f1 = hd.prev.fii;
    if (f0 != null && f1 != null && f0 < f1 - 0.3) T.push(`Foreign investors trimmed from ${pct(f1)} to ${pct(f0)}.`);
    if (f0 != null && f1 != null && f0 > f1 + 0.3) O.push(`Foreign investors added, moving from ${pct(f1)} to ${pct(f0)}.`);
  }
  if (bars?.length > 200) {
    const closes = bars.map((x) => x[1]);
    const last = closes[closes.length - 1];
    const ma200v = sma(closes, 200, closes.length - 1);
    if (ma200v && last > ma200v * 1.02) O.push(`The price sits above its 200-day average, the simplest sign the longer trend is still up.`);
    if (ma200v && last < ma200v * 0.98) T.push(`The price is below its 200-day average — the longer trend has turned down.`);
  }

  // health: five pillars, each scored only where real data supports it
  const pillars = [];
  const push = (name, score, note) => { if (score !== null) pillars.push({ name, score: Math.max(0, Math.min(100, Math.round(score))), note }); };
  const growth = (() => {
    if (pnl.length < 2) return null;
    const l = pnl[pnl.length - 1], p = pnl[pnl.length - 2];
    const lr = l.totalRevenue ?? l.revenue, pr = p.totalRevenue ?? p.revenue;
    if (!lr || !pr) return null;
    const g = ((lr - pr) / Math.abs(pr)) * 100;
    return { s: 50 + g * 2.2, note: `Revenue ${g >= 0 ? "up" : "down"} ${pct(Math.abs(g))} in ${l.fy}` };
  })();
  if (growth) push("Growth", growth.s, growth.note);
  if (r.roce != null) push("Profitability", 40 + r.roce * 2.2, `ROCE ${pct(r.roce)}${b.roce != null ? ` vs sector ${pct(b.roce)}` : ""}`);
  if (r.debtToEquity != null) push("Balance sheet", 100 - r.debtToEquity * 38, `Debt/equity ${num(r.debtToEquity)}×`);
  else if (r.quickRatio != null) push("Balance sheet", 40 + r.quickRatio * 40, `Quick ratio ${num(r.quickRatio)}`);
  if (r.pe != null && b.pe != null) push("Valuation", 100 - ((r.pe - b.pe) / Math.abs(b.pe)) * 55 - 12, `P/E ${num(r.pe)}× vs sector ${num(b.pe)}×`);
  if (hd?.latest?.promoters != null) push("Ownership", 45 + hd.latest.promoters * 0.75, `Promoters hold ${pct(hd.latest.promoters)}`);

  const score = pillars.length ? Math.round(pillars.reduce((a, p) => a + p.score, 0) / pillars.length) : null;
  const grade = score === null ? null : score >= 75 ? "STRONG" : score >= 58 ? "STEADY" : score >= 42 ? "MIXED" : "FRAGILE";
  return { swot: { strengths: S, weaknesses: W, opportunities: O, threats: T }, health: score === null ? null : { score, grade, pillars } };
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

function companyPage(c, bySymbol, allBars = {}) {
  const r = c.ratios || {};
  const bars = allBars[c.symbol] || null;
  const { swot, health } = analyse(c, bars);
  const st = c.statements || {};
  const bench = (c.sectorBenchmarks || []).filter((b) => b.company !== null && b.sector !== null);
  const hd = c.holdings;

  const last = bars?.[bars.length - 1] || null;
  const prev = bars?.[bars.length - 2] || null;
  const chgPct = last && prev && prev[1] ? ((last[1] - prev[1]) / prev[1]) * 100 : null;
  const yrAgo = bars && bars.length > 250 ? bars[bars.length - 251][1] : bars?.[0]?.[1] ?? null;
  const yrPct = last && yrAgo ? ((last[1] - yrAgo) / yrAgo) * 100 : null;
  const hi52 = bars ? Math.max(...bars.slice(-252).map((b) => b[1])) : null;
  const lo52 = bars ? Math.min(...bars.slice(-252).map((b) => b[1])) : null;

  const statCells = [
    last ? ["Close", "₹" + num(last[1]), chgPct === null ? "" : `<span class="${cls(chgPct)}">${chgPct > 0 ? "+" : ""}${chgPct.toFixed(2)}%</span> on ${esc(last[0])}`] : null,
    yrPct !== null ? ["1-year", `<span class="${cls(yrPct)}">${yrPct > 0 ? "+" : ""}${yrPct.toFixed(1)}%</span>`, "price change"] : null,
    hi52 !== null ? ["52-week range", `₹${num(lo52, 0)} – ₹${num(hi52, 0)}`, "low to high"] : null,
    health ? ["Health", `${health.score}/100`, health.grade] : null,
    ["P/E", num(r.pe) + "×", r.pb != null ? `P/B ${num(r.pb)}×` : ""],
    ["ROCE", pct(r.roce), r.roe != null ? `ROE ${pct(r.roe)}` : ""],
  ].filter(Boolean);
  const stats = statCells.map(([k, v, sub]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="k" style="margin-top:4px;letter-spacing:.06em;text-transform:none">${sub}</div>` : ""}</div>`).join("");

  const spanPct = bars && bars.length > 1 && bars[0][1] ? ((bars[bars.length - 1][1] - bars[0][1]) / bars[0][1]) * 100 : null;
  const spanMonths = bars ? Math.round(bars.length / 21) : 0;
  const chartCard = bars ? `<div class="card"><div class="card-h"><div><h2>Price history — last ${spanMonths} months <span class="${cls(spanPct)}">${spanPct === null ? "" : (spanPct > 0 ? "+" : "") + spanPct.toFixed(1) + "%"}</span></h2><div class="k" style="margin-top:3px;letter-spacing:.06em;text-transform:none">daily closes · dashed 50-day · solid 200-day moving average · volume below · the line is coloured over this whole window, which can differ from the 1-year figure above</div></div><span class="chip ok">Real prices</span></div>
<div class="card-b" style="padding-bottom:8px">${priceChart(bars)}</div>
${(() => { let ca = null; for (let i = 1; i < bars.length; i++) { const j = Math.abs((bars[i][1] - bars[i - 1][1]) / bars[i - 1][1]) * 100; if (j > 35) ca = bars[i][0]; } return ca ? `<div class="note" style="color:var(--ink)"><b>Note:</b> the price steps sharply on ${esc(ca)}. That is a corporate action — a demerger, split or bonus — that this price feed does not adjust for, so percentage changes spanning that date are not meaningful.</div>` : ""; })()}
<div class="note">Moving averages smooth the noise: when the price holds above its 200-day average the longer trend is generally up, and below it, down. Prices are exchange closes, not live quotes.</div></div>` : "";

  const swotCard = (swot.strengths.length + swot.weaknesses.length + swot.opportunities.length + swot.threats.length) ? `<div class="card"><div class="card-h"><h2>SWOT</h2><span class="chip ok">From the filed numbers</span></div>
<div class="card-b"><div class="grid g2">
${[["Strengths", swot.strengths], ["Weaknesses", swot.weaknesses], ["Opportunities", swot.opportunities], ["Threats", swot.threats]]
  .map(([t, xs]) => `<div><div class="k" style="margin-bottom:8px">${t}</div>${xs.length ? `<ul style="padding-left:17px;display:grid;gap:7px">${xs.map((x) => `<li style="font-size:13px;color:var(--ink-dim);line-height:1.65">${esc(x)}</li>`).join("")}</ul>` : `<div class="dim" style="font-size:12.5px">Nothing notable in the filed data.</div>`}</div>`).join("")}
</div></div>
<div class="note">Every point is derived from this company's filed figures and its published sector benchmark — not opinion. It is research, not a recommendation.</div></div>` : "";

  const healthCard = health ? `<div class="card"><div class="card-h"><div><h2>Financial health</h2><div class="k" style="margin-top:3px;letter-spacing:.06em;text-transform:none">${health.score}/100 · ${health.grade}</div></div></div>
<div class="scroll"><table><tbody>${health.pillars.map((pl) => `<tr><td><b>${esc(pl.name)}</b><div class="dim" style="font-size:11.5px">${esc(pl.note)}</div></td><td class="num">${pl.score}</td><td style="width:40%"><div style="height:5px;background:var(--line);position:relative"><div style="position:absolute;inset:0 auto 0 0;width:${pl.score}%;background:var(--ink)"></div></div></td></tr>`).join("")}</tbody></table></div>
<div class="note">Each pillar is scored only where the filed data supports it, then averaged. A high score is not a buy signal — it describes the business, not the price you pay.</div></div>` : "";

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


  // curated sector intelligence — only for names in the deep-coverage universe
  const meta = STOCK_MAP[c.symbol];
  const secKey = meta?.sector;
  const ind = secKey ? INDUSTRY[secKey] : null;
  const pol = secKey ? POLICY[secKey] : null;
  const prods = PRODUCTS[c.symbol] || null;
  const list2 = (xs) => `<ul style="padding-left:17px;display:grid;gap:7px">${xs.map((x) => `<li style="font-size:13px;color:var(--ink-dim);line-height:1.65">${esc(x)}</li>`).join("")}</ul>`;

  const industryCard = ind ? `<div class="card"><div class="card-h"><div><h2>Industry pulse — ${esc(SECTORS[secKey]?.name || secKey)}</h2><div class="k" style="margin-top:3px;letter-spacing:.06em;text-transform:none">${esc(ind.asOf || "")}</div></div></div>
<div class="card-b"><p style="color:var(--ink-dim);font-size:13.5px;line-height:1.8;margin-bottom:14px">${esc(ind.outlook)}</p>
<div class="grid g2"><div><div class="k" style="margin-bottom:8px">Tailwinds</div>${list2(ind.drivers || [])}</div>
<div><div class="k" style="margin-bottom:8px">Risks</div>${list2(ind.risks || [])}</div></div></div></div>` : "";

  const policyCard = pol ? `<div class="card"><div class="card-h"><h2>Government support &amp; budget provisions</h2></div>
<div class="card-b"><div class="grid g2"><div><div class="k" style="margin-bottom:8px">Schemes &amp; policy</div>${list2(pol.schemes || [])}</div>
<div><div class="k" style="margin-bottom:8px">In the Budget</div>${list2(pol.budget || [])}</div></div></div>
${pol.disclaimer ? `<div class="note">${esc(pol.disclaimer)}</div>` : ""}</div>` : "";

  const productsCard = prods?.length ? `<div class="card"><div class="card-h"><h2>Hero products &amp; market position</h2></div>
<div class="scroll"><table><thead><tr><th>Product</th><th>What it is</th><th class="num">Share</th></tr></thead>
<tbody>${prods.map((pr) => `<tr><td><b>${esc(pr.name)}</b>${pr.since ? `<div class="dim" style="font-size:11.5px">since ${esc(pr.since)}</div>` : ""}</td>
<td style="color:var(--ink-dim);font-size:12.5px;white-space:normal;max-width:520px">${esc(pr.what || pr.detail || "")}</td>
<td class="num">${pr.share ? esc(String(pr.share)) : "—"}</td></tr>`).join("")}</tbody></table></div>
<div class="note">Where a company's revenue actually comes from — the products behind the ratios.</div></div>` : "";

  const tabs = [["pnl", "P&amp;L", stmtTable(st.pnl, st.specs?.pnl)], ["bs", "Balance Sheet", stmtTable(st.balanceSheet, st.specs?.bs)], ["cf", "Cash Flow", stmtTable(st.cashFlow, st.specs?.cf)]]
    .filter(([, , html]) => html);

  const body = `
<h1>${esc(c.name || c.symbol)}</h1>
<div class="sub">${esc(c.symbol)} · NSE${c.profile?.sector ? ` · ${esc(c.profile.sector)}` : ""} · <span class="chip ok">Real filed data</span> as of ${esc(c.asOf)}</div>
<div class="grid g4" style="margin-top:18px">${stats}</div>
${chartCard}
${c.profile?.description ? `<div class="card"><div class="card-h"><h2>What this company does</h2></div><div class="card-b" style="color:var(--dim);line-height:1.75">${esc(c.profile.description)}</div></div>` : ""}
<div class="grid g2">
  <div class="card"><div class="card-h"><h2>Key ratios</h2><span class="chip ok">Real</span></div>
    <div class="scroll"><table><tbody>${ratioRows}</tbody></table></div></div>
  ${benchRows ? `<div class="card"><div class="card-h"><h2>Against its sector</h2><span class="chip ok">Real benchmark</span></div>
    <div class="scroll"><table><thead><tr><th>Metric</th><th class="num">${esc(c.symbol)}</th><th class="num">Sector</th><th>Standing</th></tr></thead><tbody>${benchRows}</tbody></table></div></div>` : ""}
</div>
${swotCard}
${healthCard}
${productsCard}
${industryCard}
${policyCard}
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



// -------------------------------- screeners ---------------------------------
// Every screen below is computed from the real daily closes we cache, not from
// a model: Weinstein stages off the 30-week average, breakouts off the true
// 52-week high, rotation against an equal-weight composite of covered names.
const pctChange = (a, b) => (a && b ? ((b - a) / Math.abs(a)) * 100 : null);

function screenerData(list, allBars) {
  const rows = [];
  for (const c of list) {
    const bars = allBars[c.symbol];
    if (!bars || bars.length < 220) continue;
    const closes = bars.map((b) => b[1]);
    const vols = bars.map((b) => b[2] || 0);
    const last = closes[closes.length - 1];
    const ma30w = sma(closes, 150, closes.length - 1);
    const ma30wPrev = sma(closes, 150, closes.length - 22);
    const ma50 = sma(closes, 50, closes.length - 1);
    const win = closes.slice(-252);
    const hi52 = Math.max(...win), lo52 = Math.min(...win);
    const volAvg = vols.slice(-51, -1).reduce((a, b) => a + b, 0) / 50 || 1;
    const volX = (vols[vols.length - 1] || 0) / volAvg;
    // a single-session move beyond 35% is a demerger/split the feed has not
    // adjusted for, not a market move — return figures across it are meaningless
    let corpAction = null;
    for (let i = 1; i < closes.length; i++) {
      const j = Math.abs((closes[i] - closes[i - 1]) / closes[i - 1]) * 100;
      if (j > 35) corpAction = { date: bars[i][0], from: closes[i - 1], to: closes[i], pct: j };
    }
    const rising = ma30w && ma30wPrev ? ma30w > ma30wPrev : null;
    let stage = null, stageWhy = "";
    if (ma30w !== null && rising !== null) {
      if (last > ma30w && rising) { stage = 2; stageWhy = "Advancing — price above a rising 30-week average"; }
      else if (last < ma30w && !rising) { stage = 4; stageWhy = "Declining — price below a falling 30-week average"; }
      else if (last > ma30w && !rising) { stage = 3; stageWhy = "Topping — price still above, but the average has rolled over"; }
      else { stage = 1; stageWhy = "Basing — price below a flat/turning average"; }
    }
    rows.push({
      symbol: c.symbol, name: c.name || c.symbol, sector: (c.profile?.sector && !/^(dvr|na)$/i.test(c.profile.sector)) ? c.profile.sector : (STOCK_MAP[c.symbol] ? SECTORS[STOCK_MAP[c.symbol].sector]?.name : null) || "Other",
      last, d1: pctChange(closes[closes.length - 2], last),
      m3: pctChange(closes[Math.max(0, closes.length - 64)], last),
      m6: pctChange(closes[Math.max(0, closes.length - 127)], last),
      y1: pctChange(closes[Math.max(0, closes.length - 252)], last),
      hi52, lo52, fromHigh: ((last - hi52) / hi52) * 100, ma50, ma30w, stage, stageWhy, volX, corpAction,
      pe: c.ratios?.pe ?? null, roce: c.ratios?.roce ?? null,
    });
  }
  // rotation vs an equal-weight composite of everything covered
  const avg = (k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0) / (rows.length || 1);
  const b3 = avg("m3"), b6 = avg("m6");
  for (const r of rows) {
    r.rs = (r.m6 ?? 0) - b6;                       // relative strength
    r.rm = (r.m3 ?? 0) - b3;                       // relative momentum
    r.quadrant = r.rs >= 0 && r.rm >= 0 ? "LEADING" : r.rs >= 0 ? "WEAKENING" : r.rm >= 0 ? "IMPROVING" : "LAGGING";
  }
  return rows;
}

function screenersPage(rows) {
  const excluded = rows.filter((r) => r.corpAction);
  const n2 = (v, suf = "") => (v === null || v === undefined ? "—" : num(v) + suf);
  const sgn = (v) => (v === null || v === undefined ? "—" : `<span class="${cls(v)}">${v > 0 ? "+" : ""}${v.toFixed(1)}%</span>`);

  // sector heat, from real one-day moves
  const bySector = {};
  for (const r of rows) (bySector[r.sector] ||= []).push(r);
  const heat = Object.entries(bySector).map(([sec, xs]) => ({
    sector: sec, n: xs.length,
    avg: xs.reduce((a, x) => a + (x.d1 ?? 0), 0) / xs.length,
    up: xs.filter((x) => (x.d1 ?? 0) > 0).length,
  })).sort((a, b) => b.avg - a.avg);
  const maxHeat = Math.max(...heat.map((h) => Math.abs(h.avg)), 0.4);
  const heatTiles = heat.map((h) => {
    const t = Math.min(1, Math.abs(h.avg) / maxHeat);
    const col = h.avg >= 0 ? "var(--up)" : "var(--down)";
    return `<div style="border:1px solid var(--line);padding:13px 15px;background:color-mix(in srgb,${col} ${(12 + t * 48).toFixed(0)}%,transparent)">
<div style="font-size:12px;font-weight:650">${esc(h.sector)}</div>
<div style="font-size:19px;font-weight:800;letter-spacing:-.02em;margin-top:3px">${h.avg > 0 ? "+" : ""}${h.avg.toFixed(2)}%</div>
<div class="k" style="letter-spacing:.06em;text-transform:none;margin-top:2px">${h.up}/${h.n} advancing</div></div>`;
  }).join("");

  const table = (items, cols, empty) => items.length
    ? `<div class="scroll"><table><thead><tr>${cols.map((c) => `<th${c[2] ? ' class="num"' : ""}>${c[0]}</th>`).join("")}</tr></thead>
<tbody>${items.map((r) => `<tr><td><a href="stock/${encodeURIComponent(r.symbol)}.html" style="font-weight:650">${esc(r.name)} ↗</a><div class="dim" style="font-size:11.5px">${esc(r.symbol)} · ${esc(r.sector)}</div></td>${cols.slice(1).map((c) => `<td${c[2] ? ' class="num"' : ""}>${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : `<div class="card-b dim">${empty}</div>`;

  const clean = rows.filter((r) => !r.corpAction);
  const stage2 = clean.filter((r) => r.stage === 2).sort((a, b) => (b.rs ?? -99) - (a.rs ?? -99)).slice(0, 40);
  const stage4 = clean.filter((r) => r.stage === 4).sort((a, b) => (a.rs ?? 99) - (b.rs ?? 99)).slice(0, 25);
  const breakouts = clean.filter((r) => r.fromHigh > -3).sort((a, b) => b.fromHigh - a.fromHigh).slice(0, 30);
  const leaders = clean.filter((r) => r.quadrant === "LEADING").sort((a, b) => b.rs - a.rs).slice(0, 30);
  const improving = clean.filter((r) => r.quadrant === "IMPROVING").sort((a, b) => b.rm - a.rm).slice(0, 25);

  const body = `
<div class="head"><div class="eyebrow">Screeners</div>
<h1>What the market is <em>actually</em> doing</h1>
<div class="sub">${excluded.length ? `${excluded.length} ${excluded.length === 1 ? "company is" : "companies are"} held out of the return screens below (${excluded.map((r) => esc(r.symbol)).join(", ")}) because the price feed is not adjusted for a demerger or split — comparing prices across that break would be meaningless.<br><br>` : ""}Every screen below is computed from real daily closes for ${rows.length - excluded.length} covered companies — stage analysis off the 30-week average, breakouts off the true 52-week high, rotation against an equal-weight composite of the same universe. Research, not recommendations.</div></div>

<div class="card"><div class="card-h"><h2>Sector heatmap</h2><span class="chip ok">Real closes</span></div>
<div class="card-b"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(168px,1fr))">${heatTiles}</div></div>
<div class="note">Average one-day move of the covered companies in each sector. Green is advancing, red declining.</div></div>

<div class="card"><div class="card-h"><div><h2>Weinstein Stage 2 — advancing</h2><div class="k" style="margin-top:3px;letter-spacing:.06em;text-transform:none">price above a rising 30-week average, sorted by relative strength</div></div><span class="chip">${stage2.length} names</span></div>
${table(stage2, [["Company"], ["1Y", (r) => sgn(r.y1), 1], ["3M", (r) => sgn(r.m3), 1], ["From 52w high", (r) => sgn(r.fromHigh), 1], ["Rel. strength", (r) => sgn(r.rs), 1], ["P/E", (r) => n2(r.pe), 1]], "No names qualify today.")}
<div class="note">Stan Weinstein's framework: Stage 1 bases, Stage 2 advances, Stage 3 tops, Stage 4 declines. Stage 2 is where sustained uptrends live — but a stage is a description of the past, not a forecast.</div></div>

<div class="card"><div class="card-h"><div><h2>Near 52-week highs</h2><div class="k" style="margin-top:3px;letter-spacing:.06em;text-transform:none">within 3% of the highest close in a year</div></div><span class="chip">${breakouts.length} names</span></div>
${table(breakouts, [["Company"], ["Close", (r) => "₹" + num(r.last), 1], ["52w high", (r) => "₹" + num(r.hi52), 1], ["From high", (r) => sgn(r.fromHigh), 1], ["Volume vs 50d", (r) => n2(r.volX, "×"), 1], ["1Y", (r) => sgn(r.y1), 1]], "Nothing near its high.")}
<div class="note">A push to new highs on volume above the 50-day average is the classic confirmation; the same move on thin volume often fades.</div></div>

<div class="grid g2">
<div class="card"><div class="card-h"><div><h2>Leading</h2><div class="k" style="margin-top:3px;letter-spacing:.06em;text-transform:none">strong and still strengthening</div></div></div>
${table(leaders, [["Company"], ["6M", (r) => sgn(r.m6), 1], ["3M", (r) => sgn(r.m3), 1]], "None.")}</div>
<div class="card"><div class="card-h"><div><h2>Improving</h2><div class="k" style="margin-top:3px;letter-spacing:.06em;text-transform:none">still weak, but momentum has turned up</div></div></div>
${table(improving, [["Company"], ["6M", (r) => sgn(r.m6), 1], ["3M", (r) => sgn(r.m3), 1]], "None.")}</div>
</div>

<div class="card"><div class="card-h"><div><h2>Weinstein Stage 4 — declining</h2><div class="k" style="margin-top:3px;letter-spacing:.06em;text-transform:none">price below a falling 30-week average</div></div><span class="chip">${stage4.length} names</span></div>
${table(stage4, [["Company"], ["1Y", (r) => sgn(r.y1), 1], ["3M", (r) => sgn(r.m3), 1], ["From 52w high", (r) => sgn(r.fromHigh), 1], ["P/E", (r) => n2(r.pe), 1]], "None.")}
<div class="note">Falling knives: cheap valuations here often get cheaper. Nothing on this page is advice to buy or sell.</div></div>`;
  return shell("Screeners — stage analysis, breakouts & rotation | myfinancial",
    "Weinstein stage analysis, 52-week breakouts, sector heatmap and relative rotation computed from real NSE closing prices.", body, "screeners");
}

// -------------------------------- fund page ---------------------------------
const NAV_SNAP = path.join(ROOT, "data", "navs.json");
export function loadNavs() {
  try { return JSON.parse(fs.readFileSync(NAV_SNAP, "utf8")); } catch { return {}; }
}

/** Growth of ₹10,000 — the shape of the fund, in money people recognise. */
function navChart(series, { w = 1000, h = 250 } = {}) {
  if (!series || series.length < 6) return "";
  const base = series[0][1];
  const vals = series.map((s2) => (s2[1] / base) * 10000);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  const yMin = Math.min(lo - pad, 10000 * 0.98), yMax = hi + pad;
  const X = (i) => (i / (vals.length - 1)) * w;
  const Y = (v) => h - ((v - yMin) / (yMax - yMin)) * h;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
  const area = `${d}L${w} ${h}L0 ${h}Z`;
  const up = vals[vals.length - 1] >= 10000;
  const col = up ? "var(--up)" : "var(--down)";
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = yMax - t * (yMax - yMin);
    return `<line x1="0" y1="${(t * h).toFixed(1)}" x2="${w}" y2="${(t * h).toFixed(1)}" stroke="var(--line)"/><text x="4" y="${(t * h - 4).toFixed(1)}" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">₹${num(v, 0)}</text>`;
  }).join("");
  return `<div class="scroll"><svg viewBox="0 0 ${w} ${h + 18}" preserveAspectRatio="none" style="width:100%;height:${h + 18}px;display:block" role="img" aria-label="Growth of ten thousand rupees">
${grid}<path d="${area}" fill="${col}" opacity=".10"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.8"/>
<text x="0" y="${h + 16}" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">${series[0][0]}</text>
<text x="${w}" y="${h + 16}" text-anchor="end" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">${series[series.length - 1][0]}</text></svg></div>`;
}

function fundPage(f, series) {
  const grew = series && series.length > 5 ? (series[series.length - 1][1] / series[0][1]) * 10000 : null;
  const years = series ? Math.round(series.length / 12) : 0;
  const stats = [
    ["NAV", "₹" + num(f.nav), f.navDate],
    f.r1 != null ? ["1 year", `<span class="${cls(f.r1)}">${f.r1 > 0 ? "+" : ""}${f.r1}%</span>`, "annualised"] : null,
    f.r3 != null ? ["3 year", `<span class="${cls(f.r3)}">${f.r3 > 0 ? "+" : ""}${f.r3}%</span>`, "CAGR"] : null,
    f.r5 != null ? ["5 year", `<span class="${cls(f.r5)}">${f.r5 > 0 ? "+" : ""}${f.r5}%</span>`, "CAGR"] : null,
    f.vol != null ? ["Volatility", num(f.vol) + "%", "yearly swing"] : null,
  ].filter(Boolean).map(([k, v, sub]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="k" style="margin-top:4px;letter-spacing:.06em;text-transform:none">${sub}</div></div>`).join("");

  const plain = [];
  if (grew) plain.push(`₹10,000 put into this scheme at the start of the period shown would be worth about <b>₹${num(grew, 0)}</b> today, before tax.`);
  if (f.r3 != null) plain.push(f.r3 > 12 ? `Its three-year CAGR of ${f.r3}% is ahead of what a fixed deposit would have paid, but that came with day-to-day ups and downs.` : `Its three-year CAGR is ${f.r3}%.`);
  if (f.vol != null) plain.push(f.vol > 18 ? `Volatility of ${num(f.vol)}% means sharp swings are normal here — money you may need within three years does not belong in this fund.` : `Volatility of ${num(f.vol)}% is relatively contained for its category.`);
  plain.push("This is a <b>Direct</b> plan: no distributor commission is deducted, so it costs less every year than the Regular plan of the same scheme.");

  const body = `
<div class="head"><div class="eyebrow">${esc(f.category)}</div>
<h1>${esc(f.name.replace(/ *-? *Direct.*$/i, ""))}</h1>
<div class="sub">${esc(f.amc)} · Direct plan · Growth option · scheme code ${esc(f.code)}</div></div>
<div class="grid g4" style="margin-top:18px">${stats}</div>
${series ? `<div class="card"><div class="card-h"><div><h2>Growth of ₹10,000</h2><div class="k" style="margin-top:3px;letter-spacing:.06em;text-transform:none">month-end NAVs, ${years} years</div></div><span class="chip ok">Real NAV history</span></div>
<div class="card-b" style="padding-bottom:8px">${navChart(series)}</div>
<div class="note">Computed from the scheme's own published NAV history. Past performance does not indicate future results.</div></div>` : ""}
<div class="card"><div class="card-h"><h2>What this means</h2></div>
<div class="card-b" style="color:var(--ink-dim);line-height:1.8;font-size:14px">${plain.map((x) => `<p style="margin-bottom:10px">${x}</p>`).join("")}</div>
<div class="note">Educational information, not investment advice. Mutual funds are subject to market risks; read all scheme-related documents carefully.</div></div>
<p class="sub" style="margin-top:26px"><a href="../funds.html">← All mutual funds</a></p>`;
  return shell(`${f.name.replace(/ *-? *Direct.*$/i, "")} — NAV, returns & growth chart | myfinancial`,
    `Real NAV, 1/3/5-year returns and growth chart for ${f.name.replace(/ *-? *Direct.*$/i, "")} Direct Growth.`, body, "funds", "../");
}

function fundsPage(funds, navDate, withPages = new Set()) {
  const live = funds.filter((f) => !f.stale);
  const compact = live.map((f) => [f.name.replace(/ *-? *Direct.*$/i, "").slice(0, 74), f.amc, f.category, f.nav, f.r1, f.r3, f.r5, withPages.has(f.code) ? f.code : 0]);
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
 tb.innerHTML=rows.slice(0,400).map(function(f){return '<tr><td>'+(f[7]?'<a href="fund/'+f[7]+'.html" style="font-weight:650">'+f[0].replace(/</g,'&lt;')+' ↗</a>':'<b>'+f[0].replace(/</g,'&lt;')+'</b>')+'<div class="dim" style="font-size:11.5px">'+f[1]+'</div></td><td class="dim">'+f[2]+'</td><td class="num">'+n(f[3])+'</td><td class="num '+c(f[4])+'">'+n(f[4])+'</td><td class="num '+c(f[5])+'">'+n(f[5])+'</td><td class="num '+c(f[6])+'">'+n(f[6])+'</td></tr>'}).join('');
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
  const allBars = loadBars();
  for (const c of list) fs.writeFileSync(path.join(OUT, "stock", `${c.symbol}.html`), companyPage(c, bySymbol, allBars));
  fs.writeFileSync(path.join(OUT, "stocks.html"), stocksIndex(list));
  const screenRows = screenerData(list, allBars);
  fs.writeFileSync(path.join(OUT, "screeners.html"), screenersPage(screenRows));
  const navs = loadNavs();
  const withPages = new Set();
  if (funds.length) {
    fs.mkdirSync(path.join(OUT, "fund"), { recursive: true });
    for (const f of funds) {
      if (f.stale || !navs[f.code]) continue;
      fs.writeFileSync(path.join(OUT, "fund", `${f.code}.html`), fundPage(f, navs[f.code]));
      withPages.add(f.code);
    }
    fs.writeFileSync(path.join(OUT, "funds.html"), fundsPage(funds, navDate, withPages));
  }
  console.log(`[site] wrote stocks.html + ${list.length} company pages${funds.length ? ` + funds.html (${funds.filter((f) => !f.stale).length} live schemes, ${withPages.size} with their own page)` : ""}`);
  console.log(`[site] screeners.html — ${screenRows.length} companies with enough history to screen`);
  return { companies: list.length, funds: funds.filter((f) => !f.stale).length, screened: screenRows.length };
}

if (import.meta.url === `file://${process.argv[1]}`) buildSite();
