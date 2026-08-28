#!/usr/bin/env node
// ---------------------------------------------------------------------------
// build_insights.mjs — the pre-market brief and the post-market report.
//
//   08:00 IST  premarket   what happened overnight, and what to watch today
//   17:00 IST  postmarket  how the Indian session actually went
//   21:00 IST  evening     the same report, re-cut on the official bhavcopy
//
// A NOTE ON THE 17:00 REPORT, because it is the one thing here that cannot be
// made fully authoritative:
//
//   NSE publishes the official full bhavcopy around 18:00-18:30 IST. At 17:00
//   it does not exist yet. So the 5pm report is built from live quotes and is
//   PROVISIONAL — close enough to read the day by, but not the settled number.
//   The 21:00 run rebuilds the same block from the bhavcopy, and the page says
//   which of the two it is showing. Quietly presenting a quote as a settled
//   close would be the wrong trade for two hours of freshness.
//
// Each session writes only its own half of the file, merging over what the
// other one left, so the 8am run never blanks last night's report.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { worldQuotes, indiaIndices, fx, stockQuotes, corporateActions, news, buildNameIndex, tagHeadline,
  tradingHolidays, marketDay, previousMarketDay } from "./lib/insights_sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist", "data");
const STATE = path.join(ROOT, "var", "insights.json");

import { preMarketArticle, postMarketArticle } from "../shared/narrative.mjs";

const readJson = (p, fb = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; } };
const r2 = (x, d = 2) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(d)) : null);

/* ------------------------------ which session ---------------------------- */
const IST_OFFSET = 5.5 * 3600_000;
const istNow = () => new Date(Date.now() + IST_OFFSET);
const istHour = () => istNow().getUTCHours() + istNow().getUTCMinutes() / 60;
const istDate = () => istNow().toISOString().slice(0, 10);

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1];
const SESSION = arg("session") || (istHour() < 12 ? "premarket" : "postmarket");

/* -------------------------------- symbols -------------------------------- */
// CNBC ticker syntax: ".XXX" for an index, "@XX.1" for a front-month future.
const WORLD = [
  { key: "S&P 500", sym: ".SPX", region: "US" }, { key: "Nasdaq", sym: ".IXIC", region: "US" },
  { key: "Dow Jones", sym: ".DJI", region: "US" }, { key: "CBOE VIX", sym: ".VIX", region: "US" },
  { key: "Nikkei 225", sym: ".N225", region: "Asia" }, { key: "Hang Seng", sym: ".HSI", region: "Asia" },
  { key: "Kospi", sym: ".KS11", region: "Asia" },
  { key: "FTSE 100", sym: ".FTSE", region: "Europe" }, { key: "DAX", sym: ".GDAXI", region: "Europe" },
];
const MACRO = [
  { key: "WTI crude", sym: "@CL.1", kind: "commodity" }, { key: "Gold", sym: "@GC.1", kind: "commodity" },
  { key: "Silver", sym: "@SI.1", kind: "commodity" }, { key: "Natural gas", sym: "@NG.1", kind: "commodity" },
  { key: "US 10-year", sym: "US10Y", kind: "rate", dp: 3 },
  { key: "Dollar index", sym: ".DXY", kind: "fx", dp: 3 },
];

// Which of NSE's 139 indices are the headline ones, and which are sectors.
const BENCH = /^(NIFTY 50|NIFTY NEXT 50|NIFTY MIDCAP 100|NIFTY SMALLCAP 100|NIFTY 500|INDIA VIX)$/i;
const SECTOR = /^NIFTY (BANK|IT|AUTO|PHARMA|FMCG|METAL|REALTY|MEDIA|ENERGY|INFRASTRUCTURE|PSU BANK|HEALTHCARE INDEX|CONSUMER DURABLES|OIL & GAS|CHEMICALS|FINANCIAL SERVICES)$/i;

const asQuote = (i) => ({ key: i.index, sym: i.key, price: i.price, pct: i.pct, chg: i.chg, stale: false, at: null, currency: "INR" });

/* ------------------------------ the universe ----------------------------- */
function loadUniverse() {
  const s = readJson(path.join(OUT, "stocks.json"));
  if (!s) return null;
  const F = Object.fromEntries(s.fields.map((k, i) => [k, i]));
  const rows = s.rows.map((r) => ({
    symbol: r[F.symbol], name: r[F.name], sector: r[F.sectorGroup] ?? r[F.sector], industry: r[F.industry],
    price: r[F.price], change1d: r[F.change1d], ret1y: r[F.ret1y],
    marketCapCr: r[F.marketCapCr], avgTurnoverCr: r[F.avgTurnoverCr],
    volumeRatio: r[F.volumeRatio], deliveryPct: r[F.deliveryPct] ?? r[F.avgDeliveryPct20],
    nseTier: r[F.nseTier], inNifty50: r[F.inNifty50], inNifty500: r[F.inNifty500], isin: r[F.isin],
  }));
  return { priceDate: s.priceDate, rows };
}

/* ------------------------------- breadth --------------------------------- */
/** Advance/decline and the movers, from the settled bhavcopy. */
function fromBhavcopy(u) {
  const liquid = u.rows.filter((r) => typeof r.change1d === "number" && (r.avgTurnoverCr ?? 0) >= 1);
  const adv = liquid.filter((r) => r.change1d > 0).length;
  const dec = liquid.filter((r) => r.change1d < 0).length;
  const unch = liquid.length - adv - dec;
  // Gainers and losers are drawn from the NIFTY 500 — a defined, investable
  // universe. Ranking all 2,065 names surfaces illiquid micro-caps whose 15%
  // move is two trades, which tells a reader nothing.
  const n500 = liquid.filter((r) => r.inNifty500 === true);
  const pool = n500.length >= 50 ? n500 : liquid.filter((r) => (r.avgTurnoverCr ?? 0) >= 5);
  const top = (dir) => pool
    .sort((a, b) => dir * (b.change1d - a.change1d))
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, name: r.name, price: r2(r.price), pct: r2(r.change1d), sector: r.sector, turnoverCr: r2(r.avgTurnoverCr, 0) }));

  // Sector move = turnover-weighted, so one thin stock cannot swing a sector.
  const bySector = new Map();
  for (const r of liquid) {
    if (!r.sector) continue;
    const s = bySector.get(r.sector) ?? { sector: r.sector, w: 0, wpct: 0, n: 0, adv: 0 };
    const w = Math.max(0.01, r.avgTurnoverCr ?? 0.01);
    s.w += w; s.wpct += w * r.change1d; s.n++; if (r.change1d > 0) s.adv++;
    bySector.set(r.sector, s);
  }
  const sectors = [...bySector.values()]
    .filter((s) => s.n >= 3)
    .map((s) => ({ sector: s.sector, pct: r2(s.wpct / s.w), count: s.n, advancePct: r2((s.adv / s.n) * 100, 0) }))
    .sort((a, b) => b.pct - a.pct);

  const volume = liquid
    .filter((r) => (r.volumeRatio ?? 0) >= 2 && (r.avgTurnoverCr ?? 0) >= 5)
    .sort((a, b) => b.volumeRatio - a.volumeRatio).slice(0, 8)
    .map((r) => ({ symbol: r.symbol, name: r.name, pct: r2(r.change1d), volumeRatio: r2(r.volumeRatio, 1), deliveryPct: r2(r.deliveryPct, 0) }));

  return {
    basis: "OFFICIAL", universe: liquid.length,
    breadth: { advances: adv, declines: dec, unchanged: unch, ratio: dec ? r2(adv / dec) : null },
    gainers: top(1), losers: top(-1), sectors, volume,
  };
}

/**
 * The session at 5pm, before the bhavcopy exists.
 *
 * NSE publishes advances and declines with each index, so the NIFTY 500's own
 * counts describe the day's breadth across 500 companies without a single
 * extra request — and without pretending to be the settled file.
 */
async function nifty500Movers(universe) {
  const members = universe.rows.filter((r) => r.inNifty500 === true);
  if (members.length < 100) return null;
  const quotes = await stockQuotes(members.map((r) => r.symbol));
  const byS = new Map(members.map((r) => [r.symbol, r]));
  const rows = [...quotes.values()]
    .filter((q) => Number.isFinite(q.pct) && byS.has(q.symbol))
    .map((q) => ({ symbol: q.symbol, name: byS.get(q.symbol).name, sector: byS.get(q.symbol).sector, price: q.price, pct: q.pct }));
  if (rows.length < 100) return null;                       // too thin to rank honestly
  const rank = (dir) => [...rows].sort((a, b) => dir * (b.pct - a.pct)).slice(0, 10);
  return { covered: rows.length, gainers: rank(1), losers: rank(-1) };
}

function fromIndices(nse) {
  const broad = nse.find((i) => /^NIFTY 500$/i.test(i.index)) ?? nse.find((i) => /^NIFTY 50$/i.test(i.index));
  if (!broad || broad.advances === null) return null;
  const total = (broad.advances ?? 0) + (broad.declines ?? 0) + (broad.unchanged ?? 0);
  if (total < 10) return null;
  return {
    basis: "PROVISIONAL", universe: total, breadthFrom: broad.index,
    breadth: {
      advances: broad.advances ?? 0, declines: broad.declines ?? 0, unchanged: broad.unchanged ?? 0,
      ratio: broad.declines ? r2(broad.advances / broad.declines) : null,
    },
    gainers: [], losers: [], sectors: [], volume: [],
  };
}

/* ---------------------------------- run ---------------------------------- */
const t0 = Date.now();
console.log(`── building insights · ${SESSION} · ${istDate()} ${istNow().toISOString().slice(11, 16)} IST ──`);

const universe = loadUniverse();
if (!universe) { console.log("[insights] no stocks.json — run build_screener.mjs first"); process.exit(0); }

const nameIndex = buildNameIndex(universe.rows);
const state = readJson(STATE, {});

// The schedules run Mon-Fri, which is not the same as every market day: India
// closes for about twenty public holidays a year. On one of those the world
// still moves overnight and the brief is still worth publishing — but the page
// must say the Indian market is shut rather than report a session that did not
// happen.
const holidays = await tradingHolidays(path.join(ROOT, "var", "nse_holidays.json"));
const today = marketDay(istDate(), holidays);
const lastSession = previousMarketDay(istDate(), holidays);
console.log(`[insights] ${istDate()} · ${today.open ? "market day" : `market CLOSED — ${today.reason}`}` +
            `${today.open ? "" : ` · last session ${lastSession ?? "unknown"}`}`);

const headlines = await news({ limit: 45 });
const tagged = headlines.map((h) => ({ ...h, ms: undefined, companies: tagHeadline(h.title, nameIndex) }));
const inNews = (() => {
  const m = new Map();
  for (const h of tagged) for (const c of h.companies) {
    const e = m.get(c.symbol) ?? { ...c, headlines: 0, sample: h.title };
    e.headlines++; m.set(c.symbol, e);
  }
  return [...m.values()].sort((a, b) => b.headlines - a.headlines).slice(0, 12);
})();
console.log(`[insights] news: ${tagged.length} headlines · ${inNews.length} companies identified`);

if (SESSION === "premarket") {
  const [world, macro, nse, rates] = [await worldQuotes(WORLD), await worldQuotes(MACRO), await indiaIndices(), await fx(["INR"])];
  const ca = await corporateActions({ days: 10 });
  console.log(`[insights] world ${world.length}/${WORLD.length} · macro ${macro.length}/${MACRO.length}` +
              ` · NSE indices ${nse.length} · FX ${rates.length} · corporate actions ${ca ? ca.length : "unavailable"}`);

  // Companies big enough to move the index that are ALSO in this morning's
  // news. A ₹500 cr company with a dramatic headline does not move the Nifty;
  // a ₹5 lakh cr one with a dull headline can.
  const bySymbol = new Map(universe.rows.map((r) => [r.symbol, r]));
  const watchlist = inNews
    .map((c) => ({ ...c, row: bySymbol.get(c.symbol) }))
    .filter((c) => c.row && (c.row.marketCapCr ?? 0) > 0)
    .sort((a, b) => (b.row.marketCapCr ?? 0) - (a.row.marketCapCr ?? 0))
    .slice(0, 8)
    .map((c) => ({
      symbol: c.symbol, name: c.name, headlines: c.headlines, sample: c.sample,
      marketCapCr: r2(c.row.marketCapCr, 0), sector: c.row.sector,
      heavyweight: c.row.inNifty50 === true || (c.row.marketCapCr ?? 0) >= 100000,
      lastPct: r2(c.row.change1d),
    }));

  state.premarket = {
    asOf: new Date().toISOString(), forDate: istDate(),
    marketOpen: today.open, closedReason: today.reason, lastSession,
    watchlist,
    global: world, macro: [...macro, ...rates],
    india: nse.filter((i) => BENCH.test(i.index)).map(asQuote),
    previousClose: { date: universe.priceDate },
    corporateActions: ca ?? [],
    news: tagged.slice(0, 24), inNews,
  };
  state.premarket.article = preMarketArticle(state.premarket);
} else {
  const nse = await indiaIndices();
  const bhavIsToday = universe.priceDate === istDate();
  // A closed market has no breadth and no movers. Reporting the stale index
  // levels NSE keeps serving would read as though a session had happened.
  let session = !today.open ? null : bhavIsToday ? fromBhavcopy(universe) : fromIndices(nse);
  // Before the bhavcopy exists, rank the NIFTY 500 on live prices instead.
  if (session && session.basis === "PROVISIONAL" && !session.gainers.length) {
    const live = await nifty500Movers(universe);
    if (live) {
      session = { ...session, gainers: live.gainers, losers: live.losers, moversFrom: `NIFTY 500 · ${live.covered} of 500 quoted` };
      console.log(`[insights] live NIFTY 500 movers: ${live.covered} of 500 quoted`);
    }
  }
  console.log(`[insights] NSE indices ${nse.length} · session basis ${session?.basis ?? "unavailable"}` +
              `${bhavIsToday ? "" : ` (bhavcopy still at ${universe.priceDate}; NSE publishes it ~18:30 IST)`}`);

  // Sector moves come from NSE's own sector indices, which exist at 5pm — the
  // turnover-weighted approximation is only needed when they do not answer.
  const sectors = nse.filter((i) => SECTOR.test(i.index))
    .map((i) => ({ sector: i.index.replace(/^NIFTY /, "").replace(/ INDEX$/, ""), pct: i.pct,
                   count: (i.advances ?? 0) + (i.declines ?? 0) + (i.unchanged ?? 0),
                   advancePct: (i.advances ?? 0) + (i.declines ?? 0) > 0 ? Math.round((i.advances / ((i.advances ?? 0) + (i.declines ?? 0) + (i.unchanged ?? 0))) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);

  state.postmarket = {
    asOf: new Date().toISOString(), forDate: istDate(),
    marketOpen: today.open, closedReason: today.reason, lastSession,
    bhavcopyDate: universe.priceDate,
    indices: today.open ? nse.filter((i) => BENCH.test(i.index)).map(asQuote) : [],
    ...(session ?? { basis: today.open ? "UNAVAILABLE" : "CLOSED", breadth: null, gainers: [], losers: [], volume: [] }),
    sectors: today.open ? (sectors.length ? sectors : (session?.sectors ?? [])) : [],
    news: tagged.slice(0, 24), inNews,
  };
  state.postmarket.article = postMarketArticle(state.postmarket);
}

state.generated = new Date().toISOString();
fs.mkdirSync(path.dirname(STATE), { recursive: true });
fs.writeFileSync(STATE, JSON.stringify(state));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "insights.json"), JSON.stringify(state));

const kb = (fs.statSync(path.join(OUT, "insights.json")).size / 1024).toFixed(0);
console.log("────────────────────────────────────────────────────────────");
console.log(`[insights] published ${kb} KB · premarket ${state.premarket ? state.premarket.forDate : "—"} · postmarket ${state.postmarket ? state.postmarket.forDate : "—"}`);
console.log(`[insights] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
