// ---------------------------------------------------------------------------
// learn.js — server-rendered SEO surface: /learn, /learn/:slug,
// /sitemap.xml, /robots.txt. Crawler-first: full HTML with meta description,
// canonical, OpenGraph/Twitter cards, Article + FAQPage JSON-LD, and internal
// links — monochrome styling consistent with the marketing site.
// ---------------------------------------------------------------------------
import { Router } from "express";
import * as seo from "../engines/seo.js";

export const learn = Router();

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Tiny markdown → HTML (headings, bold/italic/code, lists, tables, hr, p). */
function mdToHtml(md) {
  const lines = String(md).split("\n");
  let html = "", inUl = false, inTable = false, tableHeadDone = false;
  const flush = () => {
    if (inUl) { html += "</ul>"; inUl = false; }
    if (inTable) { html += "</tbody></table></div>"; inTable = false; tableHeadDone = false; }
  };
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\|/.test(line.trim())) {
      const t = line.trim();
      if (/^\|[\s:|-]+\|$/.test(t)) continue;
      const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      if (!inTable) {
        flush(); html += `<div class="tbl-wrap"><table><thead><tr>${cells.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
        inTable = true; tableHeadDone = true; continue;
      }
      html += `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
      continue;
    }
    if (inTable) flush();
    if (/^- /.test(line)) { if (!inUl) { html += "<ul>"; inUl = true; } html += `<li>${inline(line.slice(2))}</li>`; continue; }
    if (/^\d+\. /.test(line)) { if (!inUl) { html += "<ul class=\"ol\">"; inUl = true; } html += `<li>${inline(line.replace(/^\d+\. /, ""))}</li>`; continue; }
    flush();
    if (line.startsWith("### ")) html += `<h3>${inline(line.slice(4))}</h3>`;
    else if (line.startsWith("## ")) html += `<h2>${inline(line.slice(3))}</h2>`;
    else if (line.startsWith("# ")) html += `<h2>${inline(line.slice(2))}</h2>`;
    else if (line.trim() === "---") html += "<hr/>";
    else if (line.trim() === "") { /* paragraph break handled by <p> */ }
    else html += `<p>${inline(line)}</p>`;
  }
  flush();
  return html;
}

const CSS = `
:root{--paper:#060606;--ink:#f4f4f4;--dim:#9a9a9a;--faint:#5c5c5c;--line:#1f1f1f;--line2:#2e2e2e}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;line-height:1.75;-webkit-font-smoothing:antialiased}
a{color:inherit}
nav{position:sticky;top:0;z-index:50;display:flex;justify-content:space-between;align-items:center;padding:16px clamp(20px,4vw,56px);background:rgba(6,6,6,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.wordmark{font-family:Georgia,serif;font-style:italic;font-size:20px;text-decoration:none}
.wordmark b{font-style:normal;font-family:inherit;font-weight:800}
.navlinks{display:flex;gap:22px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.navlinks a{text-decoration:none}
.navlinks a:hover{color:#fff}
.btn{border:1px solid #fff;background:#fff;color:#000;font-size:12px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;padding:10px 18px;text-decoration:none}
.btn:hover{background:transparent;color:#fff}
main{max-width:780px;margin:0 auto;padding:60px clamp(20px,4vw,40px) 90px}
.crumb{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--faint);margin-bottom:26px}
.crumb a{color:var(--faint);text-decoration:none}.crumb a:hover{color:#fff}
h1{font-size:clamp(30px,5vw,46px);line-height:1.12;letter-spacing:-.03em;font-weight:800;margin-bottom:14px}
.meta{color:var(--faint);font-size:12.5px;margin-bottom:38px;padding-bottom:22px;border-bottom:1px solid var(--line)}
article h2{font-size:24px;letter-spacing:-.02em;margin:40px 0 12px;font-weight:750}
article h3{font-size:18px;margin:28px 0 10px}
article p{color:#c9c9c9;margin:12px 0;font-size:16px}
article li{color:#c9c9c9;margin:7px 0 7px 20px;font-size:15.5px}
article strong{color:#fff}
article code{background:#141414;border:1px solid var(--line);padding:1px 7px;border-radius:4px;font-size:13.5px}
article hr{border:none;border-top:1px dashed var(--line);margin:34px 0}
article em{color:var(--dim)}
.tbl-wrap{overflow-x:auto;margin:18px 0;border:1px solid var(--line2)}
table{border-collapse:collapse;width:100%;font-size:14px}
th{background:#101010;text-align:left;padding:10px 14px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);border-bottom:1px solid var(--line2)}
td{padding:10px 14px;border-bottom:1px solid var(--line);color:#d6d6d6}
tr:last-child td{border-bottom:none}
.faq{margin-top:50px;border-top:1px solid var(--line);padding-top:30px}
.faq h2{font-size:22px;margin-bottom:16px}
details{border:1px solid var(--line);margin-bottom:10px}
summary{cursor:pointer;padding:14px 18px;font-weight:650;font-size:15px;list-style:none}
summary::before{content:"+ ";color:var(--faint)}
details[open] summary::before{content:"− "}
details p{padding:0 18px 16px;color:#c9c9c9;font-size:14.5px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
.cardl{background:var(--paper);padding:26px;text-decoration:none;display:block;transition:background .2s}
.cardl:hover{background:#0d0d0d}
.cardl .cat{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--faint)}
.cardl h3{font-size:18px;line-height:1.35;margin:10px 0;letter-spacing:-.01em}
.cardl p{color:var(--dim);font-size:13px;line-height:1.6}
.cardl .go{margin-top:14px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.cta{margin-top:56px;border:1px solid var(--line2);padding:30px;text-align:center}
.cta h2{font-size:24px;letter-spacing:-.02em;margin-bottom:8px}
.cta p{color:var(--dim);margin-bottom:18px;font-size:14px}
footer{border-top:1px solid var(--line);color:var(--faint);font-size:11px;line-height:1.8;padding:30px clamp(20px,4vw,56px);text-align:center}
`;

const shellHtml = ({ title, metaDescription, canonical, ogType = "article", jsonLd = [], body, keywords }) => `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDescription)}"/>
${keywords ? `<meta name="keywords" content="${esc(keywords)}"/>` : ""}
<link rel="canonical" href="${esc(canonical)}"/>
<meta name="robots" content="index,follow"/>
<meta property="og:site_name" content="myfinancial"/>
<meta property="og:type" content="${ogType}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(metaDescription)}"/>
<meta property="og:url" content="${esc(canonical)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(metaDescription)}"/>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='black'/><text x='50' y='72' font-size='62' text-anchor='middle' fill='white' font-family='Georgia'>m</text></svg>"/>
${jsonLd.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n")}
<style>${CSS}</style>
</head>
<body>
<nav>
  <a class="wordmark" href="/"><b>my</b>financial</a>
  <div class="navlinks"><a href="/learn">Insights</a><a href="/#modules">Platform</a><a href="/#personas">Personas</a></div>
  <a class="btn" href="/app">Launch App</a>
</nav>
${body}
<footer>© ${new Date().getFullYear()} myfinancial · Educational content, not investment advice under SEBI (Investment Advisers) Regulations, 2013. Mutual funds are subject to market risks.<br/>Live NAVs from AMFI · scheme histories via mfapi.in · market data adapters for Upstox &amp; FYERS.</footer>
</body></html>`;

const base = (req) => `${req.protocol}://${req.get("host")}`;

// -------------------------------- index --------------------------------------
learn.get("/learn", (req, res) => {
  const arts = seo.listArticles();
  const body = `<main>
  <div class="crumb"><a href="/">myfinancial</a> / insights</div>
  <h1>Money, explained for India.</h1>
  <p class="meta">Plain-English guides written from the platform's own computed data — tax engines, live AMFI NAVs, Monte Carlo simulations. No jargon without a translation.</p>
  <div class="cards">
    ${arts.map((a) => `<a class="cardl" href="/learn/${esc(a.slug)}">
      <div class="cat">${esc(a.category)}</div>
      <h3>${esc(a.title)}</h3>
      <p>${esc(a.meta_description.slice(0, 130))}…</p>
      <div class="go">Read →</div>
    </a>`).join("")}
  </div>
  <div class="cta">
    <h2>See your own numbers instead</h2>
    <p>Two demo personas — a Mumbai HNI and a Dubai NRI — with every module live. No signup.</p>
    <a class="btn" href="/app">Launch the platform →</a>
  </div>
</main>`;
  res.send(shellHtml({
    title: "Insights — Personal Finance, Tax & Investing Guides for India | myfinancial",
    metaDescription: "Plain-English guides on Indian taxes, mutual funds, SIPs, NRI money rules and investing — generated from live data and real calculations, for the common investor.",
    canonical: `${base(req)}/learn`, ogType: "website",
    jsonLd: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: "myfinancial Insights", url: `${base(req)}/learn`, hasPart: arts.map((a) => ({ "@type": "Article", headline: a.title, url: `${base(req)}/learn/${a.slug}` })) }],
    body,
  }));
});

// -------------------------------- article ------------------------------------
learn.get("/learn/:slug", (req, res) => {
  const a = seo.getArticle(req.params.slug);
  if (!a) return res.status(404).send(shellHtml({ title: "Not found — myfinancial", metaDescription: "Article not found", canonical: `${base(req)}/learn`, body: `<main><h1>Article not found</h1><p class="meta"><a href="/learn" style="color:#fff">← All insights</a></p></main>` }));
  const others = seo.listArticles().filter((x) => x.slug !== a.slug).slice(0, 3);
  const canonical = `${base(req)}/learn/${a.slug}`;
  const updated = new Date(a.updated).toISOString();
  const body = `<main>
  <div class="crumb"><a href="/">myfinancial</a> / <a href="/learn">insights</a> / ${esc(a.category.toLowerCase())}</div>
  <h1>${esc(a.title)}</h1>
  <div class="meta">${esc(a.category)} · Updated ${new Date(a.updated).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · ${a.generator.startsWith("aimlapi") ? "AI-assisted, data-grounded" : "Generated from live platform data"}</div>
  <article>${mdToHtml(a.body_md)}</article>
  ${a.faq.length ? `<div class="faq"><h2>Frequently asked questions</h2>${a.faq.map(([q2, ans]) => `<details><summary>${esc(q2)}</summary><p>${esc(ans)}</p></details>`).join("")}</div>` : ""}
  <div class="cta">
    <h2>Run this on your own numbers</h2>
    <p>The platform computes your taxes, goals, funds and rebalancing live — free demo, no signup.</p>
    <a class="btn" href="/app">Open myfinancial →</a>
  </div>
  ${others.length ? `<div style="margin-top:46px"><div class="crumb">Keep reading</div><div class="cards">${others.map((o) => `<a class="cardl" href="/learn/${esc(o.slug)}"><div class="cat">${esc(o.category)}</div><h3>${esc(o.title)}</h3><div class="go">Read →</div></a>`).join("")}</div></div>` : ""}
</main>`;
  res.send(shellHtml({
    title: `${a.title} | myfinancial`,
    metaDescription: a.meta_description, keywords: a.keywords, canonical,
    jsonLd: [
      { "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.meta_description, dateModified: updated, datePublished: new Date(a.created).toISOString(), author: { "@type": "Organization", name: "myfinancial" }, publisher: { "@type": "Organization", name: "myfinancial" }, mainEntityOfPage: canonical },
      ...(a.faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: a.faq.map(([q2, ans]) => ({ "@type": "Question", name: q2, acceptedAnswer: { "@type": "Answer", text: ans } })) }] : []),
    ],
    body,
  }));
});

// ---------------------------- sitemap & robots --------------------------------
learn.get("/sitemap.xml", (req, res) => {
  const b = base(req);
  const urls = [
    { loc: `${b}/`, pri: "1.0" },
    { loc: `${b}/app`, pri: "0.8" },
    { loc: `${b}/learn`, pri: "0.9" },
    ...seo.listArticles().map((a) => ({ loc: `${b}/learn/${a.slug}`, pri: "0.8", lastmod: new Date(a.updated).toISOString().slice(0, 10) })),
  ];
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.pri}</priority></url>`).join("\n")}
</urlset>`);
});

learn.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${base(req)}/sitemap.xml\n`);
});
