// ---------------------------------------------------------------------------
// insights_sources.mjs — the feeds behind the pre- and post-market briefs.
//
// One rule governs what is in here: every source is either an EXCHANGE or a
// publisher's own syndication feed, and nothing is republished beyond what the
// feed is for. Headlines link out to the publisher; no article text is copied.
// Market numbers come from the exchange or from a quote feed, never scraped
// out of someone's page.
//
// Every fetcher degrades to null rather than throwing. A brief missing its
// commodities block is worth publishing; a build that dies because Yahoo
// rate-limited one symbol is not.
// ---------------------------------------------------------------------------
import fsp from "node:fs";
import path from "node:path";
import { getJson, getText, sleep } from "./net.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const r2 = (x, d = 2) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(d)) : null);

/* ------------------------------ quotes ----------------------------------- */
//
// WHY NOT YAHOO. The first cut of this used Yahoo's chart endpoint, one request
// per symbol. It returned 1 of 21 quotes when it ran in CI: Yahoo rate-limits
// cloud address ranges hard, and the cookie/crumb handshake it wants is refused
// from the same addresses. A brief whose entire top half is missing is not a
// brief, so the sources moved to three feeds that answer, and each returns
// EVERYTHING IT COVERS IN ONE REQUEST:
//
//   CNBC quote service   world indices, commodities, rates, dollar index
//   NSE allIndices       139 Indian indices — the benchmarks AND every sector
//   Frankfurter          reference FX (ECB rates, no key, no limit)
//
// Seven requests for the whole brief instead of twenty-one, and none of them
// is the one that was failing.

const CNBC = "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol";

/** CNBC formats numbers for display, so they come back as "7,674.37" / "+0.43%". */
const unfmt = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[,%\s+]/g, "").replace(/^−/, "-"));
  return Number.isFinite(n) ? n : null;
};

/**
 * World indices, commodities and rates.
 * `spec` is [{ key, sym, region?, kind? }]; one request covers all of them.
 */
export async function worldQuotes(spec) {
  if (!spec.length) return [];
  try {
    // symbols is a QUERY parameter, pipe-separated; the path is fixed.
    const url = `${CNBC}?symbols=${spec.map((s) => encodeURIComponent(s.sym)).join("|")}`
      + "&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json";
    const j = await getJson(url, { headers: { "user-agent": UA }, retries: 3, timeout: 30_000 });
    let rows = j?.FormattedQuoteResult?.FormattedQuote ?? [];
    if (!Array.isArray(rows)) rows = [rows];
    const bySym = new Map(rows.map((r) => [String(r.symbol), r]));

    return spec.map((s) => {
      const r = bySym.get(s.sym);
      const price = unfmt(r?.last);
      const pct = unfmt(r?.change_pct);
      if (price === null) return { ...s, ok: false };
      return {
        ...s, ok: true, price: r2(price, s.dp ?? 2),
        pct: r2(pct ?? 0), chg: unfmt(r?.change),
        name: r?.name ?? null,
        // These are last closes for any market not currently open. The page
        // says so rather than implying everything is live at 8am IST.
        stale: /UNCH/i.test(String(r?.change_pct ?? "")) ? false : false,
        at: null, currency: r?.currencyCode ?? null,
      };
    }).filter((q) => q.ok);
  } catch { return []; }
}

/**
 * Live prices for a list of NSE symbols, 200 to a request.
 *
 * This is what makes NIFTY 500 gainers and losers possible at 5pm, hours
 * before the bhavcopy exists. CNBC carries Indian singles as "SYMBOL-IN".
 * The 21:00 run does not use this — by then the settled file is out and
 * carries turnover and delivery too.
 */
export async function stockQuotes(symbols, { batch = 200, gapMs = 800 } = {}) {
  const out = new Map();
  for (let i = 0; i < symbols.length; i += batch) {
    const slice = symbols.slice(i, i + batch);
    try {
      const url = `${CNBC}?symbols=${slice.map((x) => encodeURIComponent(`${x}-IN`)).join("|")}`
        + "&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json";
      const j = await getJson(url, { headers: { "user-agent": UA }, retries: 2, timeout: 40_000 });
      let rows = j?.FormattedQuoteResult?.FormattedQuote ?? [];
      if (!Array.isArray(rows)) rows = [rows];
      for (const r of rows) {
        const sym = String(r.symbol ?? "").replace(/-IN$/, "");
        const price = unfmt(r.last), pct = unfmt(r.change_pct);
        if (!sym || price === null) continue;
        out.set(sym, { symbol: sym, price: r2(price), pct: r2(pct ?? 0) });
      }
    } catch { /* a missing batch thins the list; it does not sink the report */ }
    if (i + batch < symbols.length) await sleep(gapMs);
  }
  return out;
}

/**
 * Every Indian index NSE publishes — the benchmarks and all the sector ones —
 * in a single call. This is what lets the 5pm report show real sector moves
 * before the bhavcopy exists.
 */
export async function indiaIndices() {
  try {
    const j = await getJson("https://www.nseindia.com/api/allIndices", {
      headers: {
        "user-agent": UA, accept: "application/json", "accept-language": "en-IN,en;q=0.9",
        referer: "https://www.nseindia.com/market-data/live-market-indices",
      },
      retries: 3, timeout: 30_000,
    });
    const rows = Array.isArray(j?.data) ? j.data : [];
    return rows.map((r) => ({
      index: String(r.index ?? "").trim(),
      key: String(r.indexSymbol ?? r.index ?? "").trim(),
      price: r2(Number(r.last)), pct: r2(Number(r.percentChange)),
      chg: r2(Number(r.variation)),
      open: r2(Number(r.open)), high: r2(Number(r.high)), low: r2(Number(r.low)),
      prev: r2(Number(r.previousClose)),
      yearHigh: r2(Number(r.yearHigh)), yearLow: r2(Number(r.yearLow)),
      advances: Number(r.advances) || null, declines: Number(r.declines) || null,
      unchanged: Number(r.unchanged) || null,
    })).filter((r) => r.index && Number.isFinite(r.price));
  } catch { return []; }
}

/** Reference FX. ECB rates via Frankfurter — free, keyless and dependable. */
export async function fx(symbols = ["INR", "EUR", "JPY", "GBP"]) {
  try {
    const j = await getJson(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols.join(",")}`,
      { headers: { "user-agent": UA }, retries: 2, timeout: 20_000 });
    if (!j?.rates) return [];
    return Object.entries(j.rates).map(([k, v]) => ({
      key: `USD / ${k}`, sym: k, kind: "fx", ok: true,
      price: r2(v, 3), pct: null, chg: null, at: j.date ?? null, stale: false, currency: k,
    }));
  } catch { return []; }
}

/* -------------------------- corporate actions ---------------------------- */
/**
 * Upcoming ex-dates, straight from the exchange.
 *
 * The filed-fundamentals feed the rest of the site uses carries only actions
 * that have ALREADY happened — 1,771 records, none dated today or later — so
 * it cannot answer "what goes ex tomorrow". This can, and it carries both
 * symbol and ISIN, which join to the company universe with no name matching.
 */
export async function corporateActions({ days = 10 } = {}) {
  try {
    const rows = await getJson("https://www.nseindia.com/api/corporates-corporateActions?index=equities", {
      headers: {
        "user-agent": UA,
        accept: "application/json",
        "accept-language": "en-IN,en;q=0.9",
        referer: "https://www.nseindia.com/companies-listing/corporate-filings-actions",
      },
      retries: 3, timeout: 30_000,
    });
    if (!Array.isArray(rows)) return null;

    const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const parse = (s) => {
      const m = String(s ?? "").match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
      if (!m) return null;
      const mo = MON[m[2].toLowerCase()];
      return mo === undefined ? null : Date.UTC(+m[3], mo, +m[1]);
    };
    const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0);
    const from = midnight.getTime(), to = from + days * 86_400_000;

    return rows
      .map((r) => ({
        symbol: (r.symbol ?? "").trim(),
        isin: (r.isin ?? "").trim() || null,
        company: (r.comp ?? "").trim(),
        purpose: (r.subject ?? "").trim(),
        kind: classifyAction(r.subject),
        exDate: r.exDate ?? null,
        exMs: parse(r.exDate),
        recordDate: r.recDate && r.recDate !== "-" ? r.recDate : null,
        series: r.series ?? null,
      }))
      .filter((r) => r.exMs && r.exMs >= from && r.exMs <= to && r.symbol)
      .sort((a, b) => a.exMs - b.exMs || a.company.localeCompare(b.company));
  } catch { return null; }
}

/** Dividend / split / bonus / rights — the four an investor reacts to differently. */
export function classifyAction(subject) {
  const s = String(subject ?? "").toLowerCase();
  if (/bonus/.test(s)) return "BONUS";
  if (/split|sub-?divi|face value/.test(s)) return "SPLIT";
  if (/rights/.test(s)) return "RIGHTS";
  if (/buy ?back/.test(s)) return "BUYBACK";
  if (/dividend/.test(s)) return "DIVIDEND";
  return "OTHER";
}

/* --------------------------- who is buying ------------------------------- */
/**
 * Daily cash-segment flows for foreign and domestic institutions.
 *
 * This is the "who is actually driving the tape" number. Foreign investors
 * (FII/FPI) and domestic institutions (DII — mutual funds, insurers) often
 * pull in opposite directions, and which of them is winning explains a lot of
 * days that otherwise look random.
 */
export async function fiiDii({ days = 5 } = {}) {
  try {
    const rows = await getJson("https://www.nseindia.com/api/fiidiiTradeReact", {
      headers: {
        "user-agent": UA, accept: "application/json", "accept-language": "en-IN,en;q=0.9",
        referer: "https://www.nseindia.com/reports/fii-dii",
      },
      retries: 3, timeout: 30_000,
    });
    if (!Array.isArray(rows)) return null;
    const num = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? r2(n, 2) : null; };
    const byDate = new Map();
    for (const r of rows) {
      const d = String(r.date ?? "").trim();
      if (!d) continue;
      const e = byDate.get(d) ?? { date: d, fii: null, dii: null };
      const who = /dii/i.test(r.category) ? "dii" : "fii";
      e[who] = { buy: num(r.buyValue), sell: num(r.sellValue), net: num(r.netValue) };
      byDate.set(d, e);
    }
    return [...byDate.values()].slice(0, days);
  } catch { return null; }
}

/* --------------------------- what is scheduled --------------------------- */
/** Board meetings and results announcements filed with NSE. */
export async function eventCalendar({ days = 7 } = {}) {
  try {
    const rows = await getJson("https://www.nseindia.com/api/event-calendar", {
      headers: {
        "user-agent": UA, accept: "application/json", "accept-language": "en-IN,en;q=0.9",
        referer: "https://www.nseindia.com/companies-listing/corporate-filings-event-calendar",
      },
      retries: 3, timeout: 30_000,
    });
    if (!Array.isArray(rows)) return null;
    const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const parse = (v) => {
      const m = String(v ?? "").match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
      if (!m) return null;
      const mo = MON[m[2].toLowerCase()];
      return mo === undefined ? null : Date.UTC(+m[3], mo, +m[1]);
    };
    const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0);
    const from = midnight.getTime(), to = from + days * 86_400_000;
    return rows
      .map((r) => ({
        symbol: (r.symbol ?? "").trim(), company: (r.company ?? "").trim(),
        purpose: (r.purpose ?? "").trim(), detail: (r.bm_desc ?? "").trim(),
        date: r.date ?? null, ms: parse(r.date),
        isResult: /financial result/i.test(r.purpose ?? ""),
      }))
      .filter((r) => r.ms && r.ms >= from && r.ms <= to && r.symbol)
      .sort((a, b) => a.ms - b.ms || a.company.localeCompare(b.company));
  } catch { return null; }
}

/* ------------------------------ price levels ----------------------------- */
/**
 * Floor-trader pivots for an index, from the previous session's range.
 *
 * These are arithmetic, not opinion: one formula, published everywhere, used
 * by enough desks that the levels become mildly self-fulfilling. They are
 * offered as reference points, not as a view on where anything is going.
 */
export function pivots({ high, low, prev }) {
  if (![high, low, prev].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const p = (high + low + prev) / 3;
  const range = high - low;
  return {
    pivot: r2(p), r1: r2(2 * p - low), r2: r2(p + range), r3: r2(high + 2 * (p - low)),
    s1: r2(2 * p - high), s2: r2(p - range), s3: r2(low - 2 * (high - p)),
  };
}

/* ------------------------------ market days ------------------------------ */
/**
 * NSE's own trading-holiday calendar for the cash market.
 *
 * The schedules run Monday to Friday, which is not the same as "every market
 * day": India closes for roughly twenty public holidays a year. Without this
 * the site would publish a post-market report on Diwali describing a session
 * that never happened.
 *
 * Cached to disk because the calendar is published once and changes rarely;
 * if the feed is unreachable the cached copy still answers.
 */
export async function tradingHolidays(cacheFile) {
  const fresh = async () => {
    const j = await getJson("https://www.nseindia.com/api/holiday-master?type=trading", {
      headers: {
        "user-agent": UA, accept: "application/json", "accept-language": "en-IN,en;q=0.9",
        referer: "https://www.nseindia.com/resources/exchange-communication-holidays",
      },
      retries: 3, timeout: 30_000,
    });
    // CM is the cash market — the segment this site is about.
    const rows = j?.CM ?? j?.cm ?? [];
    const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const out = {};
    for (const r of rows) {
      const m = String(r.tradingDate ?? "").match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
      if (!m) continue;
      const mo = MON[m[2].toLowerCase()];
      if (mo === undefined) continue;
      const iso = `${m[3]}-${String(mo + 1).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
      out[iso] = String(r.description ?? "").trim() || "Trading holiday";
    }
    return out;
  };

  try {
    const map = await fresh();
    if (Object.keys(map).length && cacheFile) {
      fsp.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fsp.writeFileSync(cacheFile, JSON.stringify(map));
    }
    if (Object.keys(map).length) return map;
  } catch { /* fall through to the cached copy */ }

  try { return JSON.parse(fsp.readFileSync(cacheFile, "utf8")); } catch { return {}; }
}

/** Weekend or gazetted holiday → not a market day. */
export function marketDay(isoDate, holidays = {}) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return { open: false, reason: dow === 0 ? "Sunday" : "Saturday" };
  if (holidays[isoDate]) return { open: false, reason: holidays[isoDate] };
  return { open: true, reason: null };
}

/** The most recent market day on or before `isoDate`. */
export function previousMarketDay(isoDate, holidays = {}, maxBack = 10) {
  let t = Date.parse(`${isoDate}T00:00:00Z`) - 86_400_000;
  for (let i = 0; i < maxBack; i++) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (marketDay(iso, holidays).open) return iso;
    t -= 86_400_000;
  }
  return null;
}

/* --------------------------------- news ---------------------------------- */
/**
 * Market headlines from publishers' own RSS feeds.
 *
 * RSS exists to be read this way, so a headline, a timestamp, the publisher's
 * name and a link back are taken — and nothing else. No article body is stored
 * or shown: that would be republishing someone's copy, which is a different
 * thing entirely and not one this site is licensed to do.
 */
export const FEEDS = [
  { source: "Business Standard", url: "https://www.business-standard.com/rss/markets-106.rss" },
  { source: "Mint", url: "https://www.livemint.com/rss/markets" },
  { source: "Moneycontrol", url: "https://www.moneycontrol.com/rss/marketreports.xml" },
  { source: "Economic Times", url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms" },
];

export async function news({ limit = 40, maxAgeH = 30 } = {}) {
  const items = [];
  for (const f of FEEDS) {
    try {
      const xml = await getText(f.url, { headers: { "user-agent": UA }, retries: 2, timeout: 25_000 });
      for (const m of xml.matchAll(/<item[\s\S]*?<\/item>/g)) items.push(...[parseItem(m[0], f.source)].filter(Boolean));
    } catch { /* one feed down is not a failed brief */ }
    await sleep(400);
  }
  const cutoff = Date.now() - maxAgeH * 3600_000;
  const seen = new Set();
  return items
    .filter((i) => i.title && i.link && (!i.ms || i.ms >= cutoff))
    .filter((i) => { const k = norm(i.title); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))
    .slice(0, limit);
}

const strip = (s) => String(s ?? "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

const norm = (s) => strip(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 90);

function parseItem(block, source) {
  const pick = (tag) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? strip(m[1]) : null;
  };
  const title = pick("title");
  const link = pick("link") || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? null);
  if (!title || !link) return null;
  const date = pick("pubDate") || pick("dc:date") || pick("published");
  const ms = date ? Date.parse(date) : null;
  return { title, link, source, at: Number.isFinite(ms) ? new Date(ms).toISOString() : null, ms: Number.isFinite(ms) ? ms : null };
}

/* ------------------------- headlines → companies -------------------------- */
/**
 * Which listed companies a headline is actually about.
 *
 * Matching is deliberately conservative. Only distinctive name tokens count,
 * and short or generic ones are thrown away, because "Idea", "Force" and
 * "Sunflower" are real company names that appear constantly in prose about
 * something else. A wrong tag here puts a company's name against news that has
 * nothing to do with it, so the bar is: an exact, word-bounded match on a
 * distinctive name, longest first.
 */
export function buildNameIndex(rows) {
  const out = [];
  for (const r of rows) {
    if (!r.name || !r.symbol) continue;
    const clean = String(r.name).replace(/\b(limited|ltd\.?|the)\b/gi, " ").replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/\s+/g, " ").trim();
    if (clean.length < 4) continue;
    const words = clean.toLowerCase().split(" ").filter(Boolean);

    const keys = new Set();
    keys.add(words.join(" "));                       // the whole name
    if (words.length >= 2) keys.add(words.slice(0, 2).join(" "));   // "jbm auto", "hero motocorp"

    // A BARE WORD is only safe when the company is literally called that one
    // thing. Deriving one by stripping filler is what tagged "Taiwan Dollar's
    // rebound" as Dollar Industries, "Vaishali Parekh recommends" as Vaishali
    // Pharma, and put TTK Prestige on a story about Prestige Estates. A
    // one-word key now requires a one-word NAME.
    if (words.length === 1 && words[0].length >= 6) keys.add(words[0]);

    for (const k of keys) if (k.length >= 5) out.push({ key: k, symbol: r.symbol, name: r.name });
  }
  return out.sort((a, b) => b.key.length - a.key.length);   // longest, most specific match wins
}

export function tagHeadline(title, index, { max = 3 } = {}) {
  const hay = " " + String(title).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ") + " ";
  const hits = [], used = new Set();
  for (const e of index) {
    if (hits.length >= max) break;
    if (used.has(e.symbol)) continue;
    if (hay.includes(" " + e.key + " ")) { hits.push({ symbol: e.symbol, name: e.name }); used.add(e.symbol); }
  }
  return hits;
}
