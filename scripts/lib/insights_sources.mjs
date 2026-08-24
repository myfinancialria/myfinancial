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
import { getJson, getText, sleep } from "./net.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const r2 = (x, d = 2) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(d)) : null);

/* ------------------------------ quotes ----------------------------------- */
/**
 * Index / FX / commodity quotes.
 *
 * Yahoo rate-limits an address that asks quickly, so requests are spaced and
 * a failure on one symbol never sinks the rest. `stale` is set when the quote
 * is older than a day, which matters at 8am: Europe has not opened and the US
 * has closed, so those are LAST CLOSE, not live, and the page must say so.
 */
export async function quotes(symbols, { gapMs = 900 } = {}) {
  const out = [];
  for (const s of symbols) {
    try {
      const j = await getJson(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.sym)}?interval=1d&range=5d`,
        { headers: { "user-agent": UA }, retries: 2, timeout: 20_000 },
      );
      const m = j?.chart?.result?.[0]?.meta;
      if (!m?.regularMarketPrice) { out.push({ ...s, ok: false }); continue; }
      const prev = m.chartPreviousClose ?? m.previousClose ?? null;
      const at = m.regularMarketTime ? m.regularMarketTime * 1000 : null;
      out.push({
        ...s, ok: true,
        price: r2(m.regularMarketPrice, s.dp ?? 2),
        prev: r2(prev, s.dp ?? 2),
        chg: prev ? r2(m.regularMarketPrice - prev, s.dp ?? 2) : null,
        pct: prev ? r2(((m.regularMarketPrice - prev) / prev) * 100) : null,
        at: at ? new Date(at).toISOString() : null,
        // more than 26h old = not today's session anywhere on earth
        stale: at ? Date.now() - at > 26 * 3600_000 : true,
        currency: m.currency ?? null,
      });
    } catch { out.push({ ...s, ok: false }); }
    await sleep(gapMs);
  }
  return out;
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
