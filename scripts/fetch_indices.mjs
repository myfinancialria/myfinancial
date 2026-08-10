#!/usr/bin/env node
// ---------------------------------------------------------------------------
// fetch_indices.mjs — NSE index membership and the exchange's own sector labels.
//
// NSE publishes each index's constituent list as a plain CSV that also carries
// an Industry column. Together these give two things no price feed can:
//
//   • sector/industry classification straight from the exchange, keyless
//   • index membership — "is this in the NIFTY 50", "is it a midcap", "is it
//     in a sector index" — which is one of the most useful screener filters
//     there is, because it encodes the exchange's own liquidity and size
//     screening rather than a number we invented.
//
//   node scripts/fetch_indices.mjs
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getText, pool, fmtDuration } from "./lib/net.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const VAR = path.join(ROOT, "var", "indices");

// Broad-market indices first: they define size buckets. Sector indices follow.
// `size` marks the ones that describe market-cap tier rather than a theme.
const INDICES = [
  { file: "ind_nifty50list", name: "NIFTY 50", size: true },
  { file: "ind_niftynext50list", name: "NIFTY Next 50", size: true },
  { file: "ind_nifty100list", name: "NIFTY 100", size: true },
  { file: "ind_nifty200list", name: "NIFTY 200", size: true },
  { file: "ind_nifty500list", name: "NIFTY 500", size: true },
  { file: "ind_niftymidcap150list", name: "NIFTY Midcap 150", size: true },
  { file: "ind_niftysmallcap250list", name: "NIFTY Smallcap 250", size: true },
  { file: "ind_niftymicrocap250_list", name: "NIFTY Microcap 250", size: true },
  { file: "ind_niftytotalmarket_list", name: "NIFTY Total Market", size: true },

  { file: "ind_niftybanklist", name: "NIFTY Bank" },
  { file: "ind_niftyitlist", name: "NIFTY IT" },
  { file: "ind_niftypharmalist", name: "NIFTY Pharma" },
  { file: "ind_niftyautolist", name: "NIFTY Auto" },
  { file: "ind_niftyfmcglist", name: "NIFTY FMCG" },
  { file: "ind_niftymetallist", name: "NIFTY Metal" },
  { file: "ind_niftyrealtylist", name: "NIFTY Realty" },
  { file: "ind_niftyenergylist", name: "NIFTY Energy" },
  { file: "ind_niftyinfralist", name: "NIFTY Infrastructure" },
  { file: "ind_niftypselist", name: "NIFTY PSE" },
  { file: "ind_niftypsubanklist", name: "NIFTY PSU Bank" },
  { file: "ind_niftymnclist", name: "NIFTY MNC" },
  { file: "ind_niftyconsumptionlist", name: "NIFTY Consumption" },
  { file: "ind_niftycommoditieslist", name: "NIFTY Commodities" },
  { file: "ind_niftyservicelist", name: "NIFTY Services" },
  { file: "ind_niftyfinancelist", name: "NIFTY Financial Services" },
  { file: "ind_niftymedialist", name: "NIFTY Media" },
  { file: "ind_niftyhealthcarelist", name: "NIFTY Healthcare" },
  { file: "ind_niftyoilgaslist", name: "NIFTY Oil & Gas" },
  { file: "ind_niftyconsumerdurableslist", name: "NIFTY Consumer Durables" },
];

const url = (f) => `https://archives.nseindia.com/content/indices/${f}.csv`;

function splitCsv(line) {
  const cols = [];
  let cur = "", quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { cols.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols.map((c) => c.trim());
}

/** Rows of { symbol, industry, name } from one constituent CSV. */
function parse(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const iSym = head.findIndex((h) => h === "symbol");
  const iInd = head.findIndex((h) => h.startsWith("industry"));
  const iName = head.findIndex((h) => h.startsWith("company"));
  if (iSym < 0) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsv(lines[i]);
    const symbol = c[iSym];
    if (!symbol) continue;
    out.push({ symbol, industry: iInd >= 0 ? c[iInd] || null : null, name: iName >= 0 ? c[iName] || null : null });
  }
  return out;
}

const t0 = Date.now();
fs.mkdirSync(VAR, { recursive: true });

const results = await pool(INDICES, 4, async (ix) => {
  const cacheFile = path.join(VAR, `${ix.file}.csv`);
  let text = null;
  try {
    const st = fs.statSync(cacheFile);
    if (Date.now() - st.mtimeMs < 7 * 86_400_000) text = fs.readFileSync(cacheFile, "utf8");
  } catch { /* fetch */ }
  if (!text) {
    text = await getText(url(ix.file), { accept: "text/csv", timeout: 20_000, retries: 2, headers: { Referer: "https://www.nseindia.com/" } });
    if (!text || text.length < 100) return null;
    fs.writeFileSync(cacheFile, text);
  }
  return { ix, rows: parse(text) };
});

const bySymbol = {};
let okCount = 0;
for (const r of results) {
  if (!r?.rows?.length) continue;
  okCount++;
  for (const row of r.rows) {
    const e = (bySymbol[row.symbol] ??= { symbol: row.symbol, industry: null, name: null, indices: [], sizeIndices: [] });
    // The first list to name an industry wins; the broad lists are queried first
    // and carry NSE's canonical classification.
    if (!e.industry && row.industry) e.industry = row.industry;
    if (!e.name && row.name) e.name = row.name;
    e.indices.push(r.ix.name);
    if (r.ix.size) e.sizeIndices.push(r.ix.name);
  }
}

// A single, honest size label from the index a company actually belongs to,
// rather than a market-cap threshold we picked ourselves.
for (const e of Object.values(bySymbol)) {
  e.nseTier = e.indices.includes("NIFTY 50") ? "NIFTY 50"
    : e.indices.includes("NIFTY Next 50") ? "NIFTY Next 50"
    : e.indices.includes("NIFTY 100") ? "Large cap"
    : e.indices.includes("NIFTY Midcap 150") ? "Mid cap"
    : e.indices.includes("NIFTY Smallcap 250") ? "Small cap"
    : e.indices.includes("NIFTY Microcap 250") ? "Micro cap"
    : e.indices.includes("NIFTY 500") ? "NIFTY 500"
    : e.indices.includes("NIFTY Total Market") ? "Total Market" : null;
  e.inNifty50 = e.indices.includes("NIFTY 50");
  e.inNifty500 = e.indices.includes("NIFTY 500");
  e.sectorIndices = e.indices.filter((n) => !INDICES.find((i) => i.name === n)?.size);
}

fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(path.join(DATA, "nse_indices.json"), JSON.stringify({
  generated: new Date().toISOString(),
  source: "NSE archives index constituent lists",
  indicesFetched: okCount,
  count: Object.keys(bySymbol).length,
  symbols: bySymbol,
}));

const withIndustry = Object.values(bySymbol).filter((e) => e.industry).length;
console.log(`[ix] ${okCount}/${INDICES.length} index lists · ${Object.keys(bySymbol).length} distinct symbols · ${withIndustry} with an NSE industry label`);
const tiers = {};
for (const e of Object.values(bySymbol)) tiers[e.nseTier || "—"] = (tiers[e.nseTier || "—"] || 0) + 1;
console.log(`[ix] tiers: ${Object.entries(tiers).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`[ix] done in ${fmtDuration(Date.now() - t0)} → data/nse_indices.json`);
