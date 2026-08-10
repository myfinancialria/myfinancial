#!/usr/bin/env node
// ---------------------------------------------------------------------------
// build_app.mjs — the public pages built on the screener data.
//
//   dist/screener.html          the interactive screener (stocks + funds)
//   dist/stocks.html            every listed company, searchable
//   dist/funds.html             every scheme, searchable
//   dist/stock/<SYMBOL>.html    one company: metrics, chart, filed data
//   dist/fund/<CODE>.html       one scheme: returns, risk, rolling, chart
//
// Per-item pages are rendered as real HTML rather than a client-side template
// so each one is independently readable, linkable and indexable — the screener
// is the tool, but these pages are what a search engine and a human land on.
//
//   node scripts/build_app.mjs      (expects dist/data/ from build_screener.mjs)
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shell, esc, CSS } from "./lib/shell.mjs";
import { screenerPage } from "./lib/screener_page.mjs";
import { STOCK_FIELDS, FUND_FIELDS } from "./lib/schema.mjs";
// Hand-written sector research that predates this pipeline. It covers only the
// curated names, but where it exists it says things no ratio can, so it is
// carried onto the new pages rather than dropped.
import { INDUSTRY, POLICY, PRODUCTS } from "../server/data/sectorIntel.js";
import { STOCK_MAP, SECTORS } from "../server/data/universe.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist");
const DATA_OUT = path.join(OUT, "data");
const DETAIL = path.join(ROOT, "var", "detail");

const readJson = (p, fb = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; } };
const num = (x, d = 2) => (typeof x === "number" && Number.isFinite(x) ? x.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");
const pct = (x, d = 1) => (typeof x === "number" && Number.isFinite(x) ? `${x > 0 ? "+" : ""}${x.toFixed(d)}%` : "—");
const cls = (x) => (typeof x !== "number" ? "" : x > 0 ? "up" : x < 0 ? "down" : "");
const crore = (x) => {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  return Math.abs(x) >= 100000 ? `₹${(x / 100000).toFixed(2)}L cr` : `₹${x.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
};

// --------------------------------- charts -----------------------------------
/** Inline SVG line chart — no library, no external request, works under CSP. */
function lineChart(points, { w = 1000, h = 240, fill = true, money = false } = {}) {
  const vals = points.map((p) => p[1]).filter((v) => typeof v === "number");
  if (vals.length < 5) return "";
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || Math.abs(hi * 0.02) || 1;
  const yMin = lo - pad, yMax = hi + pad;
  const X = (i) => (i / (points.length - 1)) * w;
  const Y = (v) => h - ((v - yMin) / (yMax - yMin)) * h;
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join("");
  const up = vals[vals.length - 1] >= vals[0];
  const col = up ? "var(--up)" : "var(--down)";
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = yMax - t * (yMax - yMin);
    const label = money ? `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
    return `<line x1="0" y1="${(t * h).toFixed(1)}" x2="${w}" y2="${(t * h).toFixed(1)}" stroke="var(--line)"/>`
      + `<text x="3" y="${(t * h - 4).toFixed(1)}" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">${label}</text>`;
  }).join("");
  return `<div class="scroll"><svg viewBox="0 0 ${w} ${h + 18}" preserveAspectRatio="none" style="width:100%;height:${h + 18}px;display:block" role="img" aria-label="price history">
${grid}${fill ? `<path d="${d}L${w} ${h}L0 ${h}Z" fill="${col}" opacity=".09"/>` : ""}
<path d="${d}" fill="none" stroke="${col}" stroke-width="1.7"/>
<text x="0" y="${h + 15}" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">${esc(points[0][0])}</text>
<text x="${w}" y="${h + 15}" text-anchor="end" fill="var(--ink-faint)" font-size="10" font-family="ui-monospace,Menlo,monospace">${esc(points[points.length - 1][0])}</text>
</svg></div>`;
}

/** Horizontal bar showing where a value sits inside a range. */
function rangeBar(lo, hi, at, label) {
  if (![lo, hi, at].every((x) => typeof x === "number") || hi <= lo) return "";
  const p = Math.max(0, Math.min(100, ((at - lo) / (hi - lo)) * 100));
  return `<div style="margin-top:8px">
<div style="height:6px;background:var(--line);position:relative">
  <div style="position:absolute;left:${p.toFixed(1)}%;top:-4px;width:2px;height:14px;background:var(--ink)"></div>
</div>
<div style="display:flex;justify-content:space-between;margin-top:5px" class="k">
  <span>₹${num(lo, 0)}</span><span>${esc(label)}</span><span>₹${num(hi, 0)}</span>
</div></div>`;
}

// ------------------------------ stock detail --------------------------------
const STOCK_GROUPS = ["Valuation", "Profitability", "Growth", "Balance sheet", "Ownership", "Trend", "Momentum", "Volatility", "Range", "Liquidity"];

function metricTable(fields, row, group) {
  const rows = fields.filter((f) => f.group === group && row[f.key] !== null && row[f.key] !== undefined && row[f.key] !== "");
  if (!rows.length) return "";
  const cell = (f) => {
    const v = row[f.key];
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v !== "number") return esc(String(v));
    switch (f.unit) {
      case "%": return `<span class="${f.dir === 1 ? cls(v) : ""}">${num(v, 1)}%</span>`;
      case "x": return `${num(v, 2)}×`;
      case "₹": return `₹${num(v, Math.abs(v) >= 1000 ? 0 : 2)}`;
      case "₹cr": return crore(v);
      default: return num(v, Math.abs(v) >= 1000 ? 0 : 2);
    }
  };
  return `<div class="card"><div class="card-h"><h2>${esc(group)}</h2></div>
<div class="scroll"><table><tbody>
${rows.map((f) => `<tr><td><b>${esc(f.label)}</b>${f.help ? `<div class="dim" style="font-size:11.5px;font-weight:400">${esc(f.help)}</div>` : ""}</td><td class="num">${cell(f)}</td></tr>`).join("")}
</tbody></table></div></div>`;
}

function stockPage(detail) {
  const m = detail.metrics;
  const bars = detail.bars || [];
  const stageNote = {
    1: "Basing — the long-term average has flattened after a decline. This is where bottoms form, but also where things go nowhere for a long time.",
    2: "Advancing — price is above a rising 30-week average. Weinstein's only buying stage.",
    3: "Topping — the advance has stalled and the average is rolling over. Momentum is leaving.",
    4: "Declining — price is below a falling 30-week average. Rallies here tend to fail.",
  }[m.stage];

  const stats = [
    ["Price", `₹${num(m.price)}`, `${pct(m.change1d, 2)} on ${esc(m.date)}`],
    ["1-year", `<span class="${cls(m.ret1y)}">${pct(m.ret1y)}</span>`, "price change"],
    m.marketCapCr ? ["Market cap", crore(m.marketCapCr), m.capTier ? `${m.capTier} cap` : ""] : null,
    m.pe ? ["P/E", `${num(m.pe)}×`, m.pb ? `P/B ${num(m.pb)}×` : ""] : null,
    m.roe ? ["ROE", `${num(m.roe, 1)}%`, m.roce ? `ROCE ${num(m.roce, 1)}%` : ""] : null,
    ["52-week range", `₹${num(m.low52w, 0)}–₹${num(m.high52w, 0)}`, `${pct(m.pctFrom52wHigh)} from high`],
    m.avgTurnoverCr ? ["Avg turnover", `₹${num(m.avgTurnoverCr, 1)} cr`, "per day, 20 sessions"] : null,
    m.avgDeliveryPct20 ? ["Delivery", `${num(m.avgDeliveryPct20, 1)}%`, "of volume, 20-day avg"] : null,
  ].filter(Boolean);

  const deep = detail.deep;
  const stmt = deep?.statements;
  const stmtTable = (rows, specs, title) => {
    if (!rows?.length || !specs?.length) return "";
    const cols = rows.slice(-5);
    const live = specs.filter((s) => cols.some((c) => c[s.k] !== null && c[s.k] !== undefined));
    if (!live.length) return "";
    return `<div class="pane" data-p="${title}"><div class="scroll"><table>
<thead><tr><th>₹ Crore</th>${cols.map((c) => `<th class="num">${esc(c.fy)}</th>`).join("")}</tr></thead>
<tbody>${live.map((s) => `<tr><td>${esc(s.label)}</td>${cols.map((c) => `<td class="num">${c[s.k] === null || c[s.k] === undefined ? "—" : num(c[s.k], 0)}</td>`).join("")}</tr>`).join("")}</tbody>
</table></div></div>`;
  };
  const panes = [
    ["P&L", stmtTable(stmt?.pnl, stmt?.specs?.pnl, "P&L")],
    ["Balance sheet", stmtTable(stmt?.balanceSheet, stmt?.specs?.bs, "Balance sheet")],
    ["Cash flow", stmtTable(stmt?.cashFlow, stmt?.specs?.cf, "Cash flow")],
  ].filter(([, h]) => h);

  const hd = deep?.holdings;
  const holdCard = hd?.rows?.length ? `<div class="card"><div class="card-h"><h2>Who owns this company</h2><span class="chip ok">Filed · ${esc(hd.periods?.[0] || "")}</span></div>
<div class="scroll"><table><thead><tr><th>Holder</th>${(hd.periods || []).slice(0, 5).map((p) => `<th class="num">${esc(p)}</th>`).join("")}</tr></thead>
<tbody>${hd.rows.map((r) => `<tr><td><b>${esc(r.label)}</b></td>${(hd.periods || []).slice(0, 5).map((_, i) => `<td class="num">${r.values[i] === null || r.values[i] === undefined ? "—" : r.values[i] + "%"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<div class="note">Promoters are the founding owners. A rising promoter stake usually signals confidence; a falling one is worth understanding before investing.</div></div>` : "";

  const peers = deep?.competitors?.length ? `<div class="card"><div class="card-h"><h2>Rivals, side by side</h2></div>
<div class="scroll"><table><thead><tr><th>Company</th><th class="num">P/E</th><th class="num">P/B</th><th class="num">ROE</th><th class="num">ROCE</th></tr></thead>
<tbody>${deep.competitors.map((p) => `<tr><td>${p.symbol ? `<a href="./${encodeURIComponent(p.symbol)}.html" style="font-weight:650">${esc(p.name)} ↗</a>` : esc(p.name)}</td>
<td class="num">${num(p.pe)}</td><td class="num">${num(p.pb)}</td><td class="num">${num(p.roe)}</td><td class="num">${num(p.roce)}</td></tr>`).join("")}</tbody></table></div></div>` : "";

  const gapWarn = m.corpActionGap ? `<div class="card" style="border-color:var(--warn)"><div class="card-b" style="font-size:13px;color:var(--ink-dim)">
<b style="color:var(--warn)">Note:</b> the price series steps sharply on ${esc(m.corpActionGap)}. That is a corporate action — a split, bonus or demerger — that this feed does not adjust for, so returns spanning that date are not meaningful.</div></div>` : "";

  // ---- curated sector research, for the names that have it ----
  const secKey = STOCK_MAP[detail.symbol]?.sector;
  const ind = secKey ? INDUSTRY[secKey] : null;
  const pol = secKey ? POLICY[secKey] : null;
  const prods = PRODUCTS[detail.symbol] || null;
  const bullets = (xs) => `<ul style="padding-left:17px;display:grid;gap:7px">${xs.map((x) => `<li style="font-size:13px;color:var(--ink-dim);line-height:1.65">${esc(x)}</li>`).join("")}</ul>`;

  const industryCard = ind ? `<div class="card"><div class="card-h"><div><h2>Industry pulse — ${esc(SECTORS[secKey]?.name || secKey)}</h2>
<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">${esc(ind.asOf || "")}</div></div></div>
<div class="card-b"><p style="color:var(--ink-dim);font-size:13.5px;line-height:1.8;margin-bottom:14px">${esc(ind.outlook)}</p>
<div class="grid g2"><div><div class="k" style="margin-bottom:8px">Tailwinds</div>${bullets(ind.drivers || [])}</div>
<div><div class="k" style="margin-bottom:8px">Risks</div>${bullets(ind.risks || [])}</div></div></div></div>` : "";

  const policyCard = pol ? `<div class="card"><div class="card-h"><h2>Government support &amp; budget provisions</h2></div>
<div class="card-b"><div class="grid g2"><div><div class="k" style="margin-bottom:8px">Schemes &amp; policy</div>${bullets(pol.schemes || [])}</div>
<div><div class="k" style="margin-bottom:8px">In the Budget</div>${bullets(pol.budget || [])}</div></div></div>
${pol.disclaimer ? `<div class="note">${esc(pol.disclaimer)}</div>` : ""}</div>` : "";

  const productsCard = prods?.length ? `<div class="card"><div class="card-h"><h2>Hero products &amp; market position</h2></div>
<div class="scroll"><table><thead><tr><th>Product</th><th>What it is</th><th class="num">Share</th></tr></thead>
<tbody>${prods.map((pr) => `<tr><td><b>${esc(pr.name)}</b>${pr.since ? `<div class="dim" style="font-size:11.5px">since ${esc(pr.since)}</div>` : ""}</td>
<td style="color:var(--ink-dim);font-size:12.5px;white-space:normal;max-width:520px">${esc(pr.what || pr.detail || "")}</td>
<td class="num">${pr.share ? esc(String(pr.share)) : "—"}</td></tr>`).join("")}</tbody></table></div>
<div class="note">Where this company's revenue actually comes from — the products behind the ratios.</div></div>` : "";

  const body = `
<div class="head">
  <div class="eyebrow">${esc(m.sector || "NSE")}${m.industry && m.industry !== m.sector ? ` · ${esc(m.industry)}` : ""}</div>
  <h1>${esc(detail.name)}</h1>
  <p class="sub"><span class="chip ok">${esc(detail.symbol)}</span> NSE${detail.isin ? ` · ISIN ${esc(detail.isin)}` : ""}${detail.listed ? ` · listed ${esc(detail.listed)}` : ""}${m.hasDeepData ? ' · <span class="chip ok">filed statements</span>' : ""}</p>
</div>
<div class="grid g4" style="margin-top:16px">
${stats.map(([k, v, s]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">${s}</div>` : ""}</div>`).join("")}
</div>
${gapWarn}
${bars.length > 5 ? `<div class="card"><div class="card-h"><div><h2>Price — ${Math.round(bars.length / 52)} years of weekly closes</h2>
<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">official NSE closing prices</div></div><span class="chip ok">Real prices</span></div>
<div class="card-b">${lineChart(bars.map((b) => [b[0], b[1]]), { money: true })}
${rangeBar(m.low52w, m.high52w, m.price, "today")}</div>
${stageNote ? `<div class="note"><b>Stage ${m.stage} — ${esc(m.stageName)}.</b> ${esc(stageNote)}</div>` : ""}</div>` : ""}
${detail.description ? `<div class="card"><div class="card-h"><h2>What this company does</h2></div><div class="card-b" style="color:var(--ink-dim);line-height:1.75;font-size:14px">${esc(detail.description)}</div></div>` : ""}
<div class="grid g2">${STOCK_GROUPS.map((g) => metricTable(STOCK_FIELDS, m, g)).join("")}</div>
${panes.length ? `<div class="card"><div class="card-h"><h2>Financial statements</h2><span class="chip">₹ crore · last 5 years</span></div>
<div class="tabs" style="display:flex;border-bottom:1px solid var(--line)">${panes.map(([l], i) => `<button class="btn" style="border:none;border-bottom:2px solid ${i === 0 ? "var(--ink)" : "transparent"}" data-t="${esc(l)}">${esc(l)}</button>`).join("")}</div>
${panes.map(([l, h], i) => h.replace('class="pane"', `class="pane" ${i ? 'style="display:none"' : ""}`)).join("")}
</div>` : ""}
${holdCard}
${peers}
${productsCard}
${industryCard}
${policyCard}
<p class="sub" style="margin-top:24px"><a href="../screener.html" style="text-decoration:underline">← Screen every company</a> · <a href="../stocks.html" style="text-decoration:underline">All companies</a></p>
<script>
document.querySelectorAll('.tabs button').forEach(function(b){b.onclick=function(){
  document.querySelectorAll('.tabs button').forEach(function(x){x.style.borderBottomColor=x===b?'var(--ink)':'transparent'});
  document.querySelectorAll('.pane').forEach(function(p){p.style.display=p.dataset.p===b.dataset.t?'':'none'});
}});
</script>`;

  const desc = `${detail.name} (${detail.symbol}) share price ₹${num(m.price)}, ${pct(m.ret1y)} over a year`
    + `${m.pe ? `, P/E ${num(m.pe)}×` : ""}${m.roe ? `, ROE ${num(m.roe, 1)}%` : ""}. `
    + `Technical and fundamental analysis with ${bars.length ? "5-year price history" : "live NSE data"}.`;
  return shell({
    title: `${detail.name} (${detail.symbol}) — share price, ratios & technicals | myfinancial`,
    description: desc, body, active: "stocks", base: "../",
  });
}

// ------------------------------- fund detail --------------------------------
const FUND_GROUPS = ["Returns", "Rolling returns", "Risk", "Ranking"];

function fundPage(d) {
  const series = d.navSeries || [];
  const stats = [
    ["NAV", `₹${num(d.nav)}`, esc(d.navDate || "")],
    d.r1y != null ? ["1-year", `<span class="${cls(d.r1y)}">${pct(d.r1y)}</span>`, "absolute"] : null,
    d.r3y != null ? ["3-year", `<span class="${cls(d.r3y)}">${pct(d.r3y)}</span>`, "CAGR"] : null,
    d.r5y != null ? ["5-year", `<span class="${cls(d.r5y)}">${pct(d.r5y)}</span>`, "CAGR"] : null,
    d.volatility != null ? ["Volatility", `${num(d.volatility, 1)}%`, "annualised, 3Y"] : null,
    d.sharpe != null ? ["Sharpe", num(d.sharpe), "return per unit of risk"] : null,
    d.maxDrawdownPct != null ? ["Worst fall", `${num(d.maxDrawdownPct, 1)}%`, "peak to trough, ever"] : null,
    d.rank ? ["Rank", `${d.rank} / ${d.rankOf}`, "in its category"] : null,
  ].filter(Boolean);

  const roll = d.rolling3y;
  const rollCard = roll ? `<div class="card"><div class="card-h"><div><h2>What investors actually got</h2>
<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">every 3-year holding period in this scheme's history · ${roll.windows} windows</div></div></div>
<div class="grid g4" style="padding:16px 18px">
<div class="stat"><div class="k">Average</div><div class="v ${cls(roll.avg)}">${pct(roll.avg)}</div></div>
<div class="stat"><div class="k">Worst</div><div class="v ${cls(roll.min)}">${pct(roll.min)}</div></div>
<div class="stat"><div class="k">Best</div><div class="v ${cls(roll.max)}">${pct(roll.max)}</div></div>
<div class="stat"><div class="k">Never lost money</div><div class="v">${num(roll.pctPositive, 0)}%</div></div>
</div>
<div class="note">A single trailing return depends entirely on which day you happen to look. This measures every possible three-year hold instead: ${num(roll.pctPositive, 0)}% of them ended positive, ${num(roll.pctAbove12, 0)}% beat 12% a year, and the worst one returned ${pct(roll.min)}.</div></div>` : "";

  const body = `
<div class="head">
  <div class="eyebrow">${esc(d.categoryGroup || "")}${d.category ? ` · ${esc(d.category)}` : ""}</div>
  <h1>${esc(d.name)}</h1>
  <p class="sub">${esc(d.amc)} · Direct plan · Growth option · scheme code ${esc(d.code)}
${d.stars ? ` · <span class="chip ok">${"★".repeat(d.stars)}</span>` : ""}${d.stale ? ' · <span class="chip" style="color:var(--warn);border-color:var(--warn)">wound up — NAV no longer updating</span>' : ""}</p>
</div>
<div class="grid g4" style="margin-top:16px">
${stats.map(([k, v, s]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">${s}</div>` : ""}</div>`).join("")}
</div>
${series.length > 5 ? `<div class="card"><div class="card-h"><div><h2>Growth of ₹10,000</h2>
<div class="k" style="margin-top:3px;letter-spacing:.05em;text-transform:none">month-end NAVs since ${esc(series[0][0])}</div></div><span class="chip ok">Real NAV history</span></div>
<div class="card-b">${lineChart(series.map((s) => [s[0], (s[1] / series[0][1]) * 10000]), { money: true })}</div>
<div class="note">₹10,000 invested at the start of this chart would be worth about <b>₹${num((series[series.length - 1][1] / series[0][1]) * 10000, 0)}</b> today, before tax. Computed from the scheme's own published NAVs. Past performance does not indicate future results.</div></div>` : ""}
${rollCard}
<div class="grid g2">${FUND_GROUPS.map((g) => metricTable(FUND_FIELDS, d, g)).join("")}</div>
<div class="card"><div class="card-h"><h2>What this means</h2></div><div class="card-b" style="color:var(--ink-dim);line-height:1.8;font-size:14px">
<p style="margin-bottom:9px">This is a <b>Direct</b> plan: no distributor commission is deducted, so it costs less every year than the Regular plan of the very same portfolio. Over a couple of decades that gap compounds into a meaningful sum.</p>
${d.volatility != null ? `<p style="margin-bottom:9px">Volatility of ${num(d.volatility, 1)}% means ${d.volatility > 18 ? "sharp swings are normal here — money you may need within three years does not belong in this fund" : d.volatility > 8 ? "moderate ups and downs are to be expected" : "the ride has been relatively smooth"}.</p>` : ""}
${d.maxDrawdownPct != null ? `<p>At its worst, this scheme fell ${num(Math.abs(d.maxDrawdownPct), 1)}% from a previous peak${d.maxDrawdownDate ? `, bottoming in ${esc(d.maxDrawdownDate)}` : ""}. Ask yourself whether you would have held through that before you buy.</p>` : ""}
</div></div>
<p class="sub" style="margin-top:24px"><a href="../screener.html" style="text-decoration:underline">← Screen every fund</a> · <a href="../funds.html" style="text-decoration:underline">All schemes</a></p>`;

  return shell({
    title: `${d.name} — NAV, returns, risk & rolling returns | myfinancial`,
    description: `${d.name} Direct Growth: NAV ₹${num(d.nav)}, ${d.r3y != null ? `3-year CAGR ${pct(d.r3y)}` : "returns"}, volatility ${num(d.volatility, 1)}%, worst drawdown ${num(d.maxDrawdownPct, 1)}%, plus rolling 3-year returns across every start date.`,
    body, active: "funds", base: "../",
  });
}

// -------------------------------- index pages --------------------------------
/**
 * A searchable index of everything. The rows ship as a compact array and are
 * rendered on demand, so a 2,000-row page stays responsive while typing.
 */
function indexPage({ kind, rows, cols, title, heading, blurb, asOf }) {
  const compact = rows.map((r) => cols.map((c) => r[c.key] ?? null));
  const body = `
<div class="head"><div class="eyebrow">${kind === "stocks" ? "Companies" : "Mutual funds"}</div>
<h1>${heading}</h1><p class="sub">${blurb}</p></div>
<div class="card">
  <div class="card-h"><h2>${rows.length.toLocaleString("en-IN")} ${kind === "stocks" ? "companies" : "schemes"}</h2>
  <span class="k">${esc(asOf)}</span></div>
  <div class="card-b"><input id="q" placeholder="Search ${kind === "stocks" ? "a company or symbol" : "a scheme or fund house"}…" style="width:100%" autocomplete="off">
  <div class="dim" style="font-size:12.5px;margin-top:8px" id="cnt"></div></div>
  <div class="scroll"><table><thead><tr>${cols.map((c, i) => `<th${i ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody id="tb"></tbody></table></div>
  <div class="card-b" style="display:flex;justify-content:center"><button class="btn" id="more">Show more</button></div>
  <div class="note">Looking for something specific? The <a href="screener.html" style="text-decoration:underline">screener</a> filters all of these on ${kind === "stocks" ? "85 technical and fundamental metrics" : "returns, rolling returns and risk"} at once.</div>
</div>
<script>
var D=${JSON.stringify(compact)};
var UNITS=${JSON.stringify(cols.map((c) => c.unit || ""))};
var LINK=${JSON.stringify(kind === "stocks" ? "stock/" : "fund/")};
var shown=100,rows=D;
function nf(v,d){return Number(v).toLocaleString("en-IN",{minimumFractionDigits:d,maximumFractionDigits:d})}
function f(v,u){
  if(v===null||v===undefined||v==="")return "—";
  if(typeof v!=="number")return String(v).replace(/</g,"&lt;");
  if(u==="%")return nf(v,1)+"%";
  if(u==="x")return nf(v,2)+"×";
  if(u==="₹")return "₹"+nf(v,Math.abs(v)>=1000?0:2);
  if(u==="₹cr")return Math.abs(v)>=100000?"₹"+nf(v/100000,2)+"L cr":"₹"+nf(v,0)+" cr";
  return nf(v,Number.isInteger(v)?0:2);
}
function paint(){
  var tb=document.getElementById("tb");
  tb.innerHTML=rows.slice(0,shown).map(function(r){
    var cells=r.map(function(v,i){
      if(i===0)return '<td><a href="'+LINK+encodeURIComponent(r[r.length-1])+'.html" style="font-weight:650">'+String(v).replace(/</g,"&lt;")+'</a></td>';
      if(i===r.length-1)return "";
      return '<td class="num'+(UNITS[i]==="%"&&typeof v==="number"?(v>0?" up":v<0?" down":""):"")+'">'+f(v,UNITS[i])+'</td>';
    }).join("");
    return "<tr>"+cells+"</tr>";
  }).join("");
  document.getElementById("cnt").textContent=rows.length.toLocaleString("en-IN")+" shown"+(rows.length>shown?" · displaying first "+shown:"");
  document.getElementById("more").hidden=rows.length<=shown;
}
document.getElementById("q").oninput=function(e){
  var v=e.target.value.toLowerCase().trim();
  rows=v?D.filter(function(r){return r.join(" ").toLowerCase().indexOf(v)>-1}):D;
  shown=100;paint();
};
document.getElementById("more").onclick=function(){shown+=400;paint()};
paint();
</script>`;
  return shell({ title, description: blurb, body, active: kind });
}

// ---------------------------------- build ------------------------------------
const t0 = Date.now();
const stocks = readJson(path.join(DATA_OUT, "stocks.json"));
const funds = readJson(path.join(DATA_OUT, "funds.json"));
if (!stocks || !funds) {
  console.error("✗ dist/data/ missing — run: node scripts/build_screener.mjs first");
  process.exit(1);
}
const unpack = (j) => j.rows.map((arr) => Object.fromEntries(j.fields.map((k, i) => [k, arr[i]])));
const stockRows = unpack(stocks);
const fundRows = unpack(funds);

fs.mkdirSync(OUT, { recursive: true });

// One stylesheet for the whole site: inlining it into 4,000+ pages would add
// tens of megabytes of identical bytes and defeat browser caching.
fs.writeFileSync(path.join(OUT, "app.css"), CSS);

// 1. the screener
fs.writeFileSync(path.join(OUT, "screener.html"), screenerPage({
  stockCount: stockRows.length, fundCount: fundRows.length,
  priceDate: stocks.priceDate, navDate: funds.navDate,
}));

// 2. index pages
const F = (k) => STOCK_FIELDS.find((f) => f.key === k);
const G = (k) => FUND_FIELDS.find((f) => f.key === k);
fs.writeFileSync(path.join(OUT, "stocks.html"), indexPage({
  kind: "stocks",
  rows: stockRows.slice().sort((a, b) => (b.marketCapCr ?? -1) - (a.marketCapCr ?? -1)).map((r) => ({ ...r, _id: r.symbol })),
  cols: [F("name"), F("sector"), F("price"), F("change1d"), F("ret1y"), F("marketCapCr"), F("pe"), F("roe"), F("avgTurnoverCr"), { key: "_id", label: "", unit: "" }],
  title: "Every NSE-listed company — prices, ratios & technicals | myfinancial",
  heading: "Every listed <em>company.</em>",
  blurb: `All ${stockRows.length.toLocaleString("en-IN")} companies listed on the NSE, with five years of official closing prices, full technicals and fundamentals. Prices as of ${stocks.priceDate}.`,
  asOf: `prices ${stocks.priceDate}`,
}));

fs.writeFileSync(path.join(OUT, "funds.html"), indexPage({
  kind: "funds",
  rows: fundRows.filter((r) => !r.stale).slice().sort((a, b) => (b.r3y ?? -99) - (a.r3y ?? -99)).map((r) => ({ ...r, _id: r.code })),
  cols: [G("name"), G("category"), G("nav"), G("r1y"), G("r3y"), G("r5y"), G("volatility"), G("sharpe"), G("stars"), { key: "_id", label: "", unit: "" }],
  title: "Every Direct-Growth mutual fund — NAV, returns & risk | myfinancial",
  heading: "Every mutual fund <em>scheme.</em>",
  blurb: `All ${fundRows.filter((r) => !r.stale).length.toLocaleString("en-IN")} live Direct-Growth schemes with official AMFI NAVs dated ${funds.navDate}. Every return, volatility, Sharpe and drawdown figure is computed here from the scheme's own published NAV history.`,
  asOf: `NAVs ${funds.navDate}`,
}));

// 3. per-item pages
let nStock = 0, nFund = 0, bytes = 0;
fs.mkdirSync(path.join(OUT, "stock"), { recursive: true });
for (const f of fs.readdirSync(path.join(DETAIL, "stock"))) {
  const d = readJson(path.join(DETAIL, "stock", f));
  if (!d?.metrics) continue;
  const html = stockPage(d);
  fs.writeFileSync(path.join(OUT, "stock", f.replace(/\.json$/, ".html")), html);
  bytes += html.length; nStock++;
}
fs.mkdirSync(path.join(OUT, "fund"), { recursive: true });
for (const f of fs.readdirSync(path.join(DETAIL, "fund"))) {
  const d = readJson(path.join(DETAIL, "fund", f));
  if (!d?.code) continue;
  const html = fundPage(d);
  fs.writeFileSync(path.join(OUT, "fund", f.replace(/\.json$/, ".html")), html);
  bytes += html.length; nFund++;
}

fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
console.log(`[app] screener.html · stocks.html (${stockRows.length}) · funds.html (${fundRows.filter((r) => !r.stale).length} live)`);
console.log(`[app] ${nStock} company pages + ${nFund} scheme pages · ${(bytes / 1024 / 1024).toFixed(1)} MB of HTML`);
console.log(`[app] done in ${((Date.now() - t0) / 1000).toFixed(1)}s → dist/`);
