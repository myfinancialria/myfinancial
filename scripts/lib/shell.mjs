// ---------------------------------------------------------------------------
// shell.mjs — the chrome every generated page shares: tokens, nav, footer.
//
// Kept deliberately close to the existing site's visual language (monochrome,
// hairline rules, mono eyebrows, serif italic accents) so the new screener does
// not read as a bolted-on second product. Light and dark are both first-class:
// the theme is written to localStorage and applied before first paint, so there
// is no flash of the wrong theme.
// ---------------------------------------------------------------------------

export const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#f4f4f4;--ink-dim:#9a9a9a;--ink-faint:#5c5c5c;
  --paper:#060606;--paper-2:#0d0d0d;--paper-3:#141414;
  --line:#1f1f1f;--line-2:#2e2e2e;--inv-bg:#fff;--inv-fg:#000;
  --up:#22c55e;--down:#ef4444;--warn:#f59e0b;--accent:#60a5fa;
  --font:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,"Helvetica Neue",Arial,sans-serif;
  --serif:Georgia,"Times New Roman",serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
:root[data-theme=light]{
  --ink:#151515;--ink-dim:#55544f;--ink-faint:#8b8a84;
  --paper:#f6f5f2;--paper-2:#fbfaf8;--paper-3:#edece8;
  --line:#e0dfda;--line-2:#c9c8c2;--inv-bg:#151515;--inv-fg:#f6f5f2;
  --up:#15803d;--down:#b91c1c;--warn:#b45309;--accent:#1d4ed8;
}
body{background:var(--paper);color:var(--ink);font-family:var(--font);line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
::selection{background:var(--inv-bg);color:var(--inv-fg)}
.wrap{max-width:1480px;margin:0 auto;padding:0 clamp(14px,3vw,40px) 80px}
nav.site{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:clamp(12px,2.2vw,30px);
  padding:14px clamp(14px,3vw,40px);background:color-mix(in srgb,var(--paper) 90%,transparent);
  backdrop-filter:blur(14px);border-bottom:1px solid var(--line);flex-wrap:wrap}
.wordmark{font-family:var(--serif);font-size:19px;letter-spacing:-.02em;font-style:italic;white-space:nowrap}
.wordmark b{font-style:normal;font-family:var(--font);font-weight:800;letter-spacing:-.04em}
nav.site .lk{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-dim);position:relative;padding:4px 0;white-space:nowrap}
nav.site .lk::after{content:"";position:absolute;left:0;bottom:0;height:1px;width:0;background:var(--ink);transition:width .3s cubic-bezier(.22,.8,.24,1)}
nav.site .lk:hover,nav.site .lk.on{color:var(--ink)}
nav.site .lk:hover::after,nav.site .lk.on::after{width:100%}
.spacer{flex:1}
button.tt{width:36px;height:36px;border:1px solid var(--line-2);background:transparent;color:var(--ink);font-size:14px;cursor:pointer}
button.tt:hover{border-color:var(--ink)}
.eyebrow{display:inline-flex;align-items:center;gap:12px;font-family:var(--mono);font-size:10.5px;letter-spacing:.28em;text-transform:uppercase;color:var(--ink-dim);margin-bottom:14px}
.eyebrow::before{content:"";width:38px;height:1px;background:var(--ink-dim)}
h1{font-size:clamp(28px,4.4vw,48px);line-height:1.04;letter-spacing:-.04em;font-weight:800;margin-bottom:10px}
h1 em{font-family:var(--serif);font-weight:400;font-style:italic;letter-spacing:-.02em}
h2{font-size:14px;letter-spacing:.01em;font-weight:700;margin:0}
.sub{color:var(--ink-dim);font-size:14px;line-height:1.7;max-width:80ch}
.head{padding:40px 0 4px}
.card{border:1px solid var(--line);background:var(--paper-2);margin-top:18px}
.card-h{padding:13px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.card-b{padding:16px 18px}
.chip{display:inline-block;font-family:var(--mono);font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;border:1px solid var(--line-2);color:var(--ink-dim);padding:3px 9px}
.chip.ok{color:var(--ink);border-color:var(--ink)}
.k{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint);font-weight:500;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid var(--line)}
tbody tr:hover{background:color-mix(in srgb,var(--ink) 4%,transparent)}
.num{text-align:right;font-variant-numeric:tabular-nums;font-family:var(--mono);font-size:12px}
.up{color:var(--up)}.down{color:var(--down)}.dim{color:var(--ink-dim)}.faint{color:var(--ink-faint)}
.scroll{overflow-x:auto;max-width:100%}
/* Metric cards vary a lot in height — Valuation has a dozen rows, Ownership two.
   A grid leaves ragged holes under the short ones, so they flow down columns
   instead and pack tight. break-inside keeps a card whole. */
.metricflow{column-count:1;column-gap:16px;margin-top:18px}
@media(min-width:720px){.metricflow{column-count:2}}
@media(min-width:1180px){.metricflow{column-count:3}}
.metricflow>.card{break-inside:avoid;-webkit-column-break-inside:avoid;page-break-inside:avoid;margin:0 0 16px;display:inline-block;width:100%}
/* candle chart shared by company pages */
.tfbar{display:flex;border:1px solid var(--line-2)}
.tfbtn{background:none;border:none;color:var(--ink-dim);padding:7px 15px;cursor:pointer;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-family:inherit}
.tfbtn.on{background:var(--inv-bg);color:var(--inv-fg);font-weight:650}
.chartwrap{position:relative}
.chartwrap .tip{position:absolute;top:10px;z-index:5;pointer-events:none;background:var(--paper);border:1px solid var(--line-2);
  padding:9px 12px;font-size:12px;line-height:1.5;box-shadow:0 6px 22px rgba(0,0,0,.28);min-width:172px}
.tip-d{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--ink-faint);margin-bottom:5px}
.tip-g{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:2px 8px;align-items:baseline}
.tip-g span{font-family:var(--mono);font-size:10px;color:var(--ink-faint)}
.tip-g b{font-variant-numeric:tabular-nums;font-size:12px}
.tip-r{margin-top:5px;font-size:11.5px;font-variant-numeric:tabular-nums}
.legend{display:flex;gap:15px;flex-wrap:wrap;padding:10px 0 2px;font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-faint)}
.legend .sw{display:inline-block;width:15px;height:2px;margin-right:5px;vertical-align:middle}
.legend .sw.dash{background:none!important;border-top:2px dashed currentColor}
.grid{display:grid;gap:16px}
.g2{grid-template-columns:repeat(auto-fit,minmax(330px,1fr))}
.g4{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.stat{border:1px solid var(--line);padding:14px 16px;background:var(--paper-2)}
.stat .v{font-size:21px;font-weight:800;margin-top:4px;letter-spacing:-.03em}
input,select,button{font-family:inherit;font-size:13px;color:var(--ink)}
input,select{background:var(--paper);border:1px solid var(--line-2);padding:8px 10px}
input:focus,select:focus{outline:none;border-color:var(--ink)}
.btn{border:1px solid var(--line-2);background:transparent;color:var(--ink);padding:8px 14px;cursor:pointer;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.btn:hover{border-color:var(--ink)}
.btn.pri{background:var(--inv-bg);color:var(--inv-fg);border-color:var(--inv-bg);font-weight:650}
.btn.pri:hover{background:transparent;color:var(--ink)}
.note{color:var(--ink-faint);font-size:11.5px;line-height:1.7;padding:13px 18px;border-top:1px solid var(--line)}
footer.site{border-top:1px solid var(--line);color:var(--ink-faint);font-size:11.5px;line-height:1.8;padding:24px 0 44px;margin-top:48px}
footer.site a{color:var(--ink-dim);text-decoration:underline}
@media(max-width:700px){nav.site .lk{font-size:10px;letter-spacing:.06em}}
`;

const NAV = [
  ["app", "app/", "App"],
  ["stocks", "stocks.html", "Companies"],
  ["screener", "screener.html", "Screener"],
  ["funds", "funds.html", "Mutual Funds"],
  ["planning", "planning.html", "Planning &amp; Tax"],
  ["advisory", "advisory.html", "Advisory"],
  ["estate", "estate.html", "Will &amp; Vault"],
  ["brief", "brief.html", "Daily Brief"],
];

/**
 * Wrap page content in the site chrome.
 * `base` is "" for root pages and "../" for pages one directory down.
 */
export function shell({ title, description, body, active = "", base = "", head = "", bodyEnd = "" }) {
  return `<!doctype html><html lang="en-IN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='black'/><text x='50' y='72' font-size='62' text-anchor='middle' fill='white' font-family='Georgia'>m</text></svg>">
<script>document.documentElement.dataset.theme=localStorage.getItem("myfin.theme")||"dark"</script>
<link rel="stylesheet" href="${base}app.css">${head}
</head><body>
<nav class="site">
<a class="wordmark" href="${base}index.html">my<b>financial</b></a>
${NAV.map(([id, href, label]) => `<a class="lk${active === id ? " on" : ""}" href="${base}${href}">${label}</a>`).join("\n")}
<div class="spacer"></div>
<button class="tt" title="Toggle light / dark" onclick="var r=document.documentElement,n=r.dataset.theme==='dark'?'light':'dark';r.dataset.theme=n;localStorage.setItem('myfin.theme',n)">&#9788;</button>
</nav>
<div class="wrap">${body}</div>
<footer class="site"><div class="wrap">
Educational research only &mdash; not investment advice under SEBI (Investment Advisers) Regulations, 2013. Investments are subject to market risks; read all scheme-related documents carefully.<br>
Prices, volumes and delivery percentages are official NSE bhavcopy data. Mutual fund NAVs are official AMFI data; every return, risk and rolling figure is computed here from published NAV history. Company fundamentals are filed data. Past performance does not indicate future results.<br>
<a href="${base}index.html">Home</a> &middot; <a href="https://github.com/myfinancialria/myfinancial" rel="noopener">Source</a>
</div></footer>${bodyEnd}
</body></html>`;
}
