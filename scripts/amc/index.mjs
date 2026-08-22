// ---------------------------------------------------------------------------
// The AMC adapters.
//
// SEBI prescribes what a portfolio disclosure CONTAINS, so one parser reads
// every file (scripts/lib/portfolio.mjs). It does not prescribe how an AMC
// publishes it, so finding the file is per-AMC work — and that is all an
// adapter does.
//
// An adapter is:
//     { amc, page, pick(urls) -> [{ url, period, kind }] }
//
// `page` is a listing page served as ordinary HTML. `pick` turns the
// spreadsheet links on it into dated disclosures. Nothing here downloads or
// parses; that is the fetcher's job, so an adapter stays about ten lines and
// is cheap to add or repair when an AMC moves its files.
//
// Only AMCs whose listing page is plain server-rendered HTML live here. The
// rest need a headless browser, which is a separate and much heavier decision.
// ---------------------------------------------------------------------------

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Pull a period out of a filename. Returns {date, kind} or null. */
export function periodFromName(name) {
  const n = decodeURIComponent(String(name)).replace(/\s+/g, " ");
  const kind = /fortnight/i.test(n) ? "FORTNIGHTLY" : /quarter/i.test(n) ? "QUARTERLY" : /half.?year/i.test(n) ? "HALF_YEARLY" : "MONTHLY";

  // "31-July-26", "31 July 2026", "July 31, 2026", "Jul-26"
  let m = n.match(/(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{2,4})/);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return { date: iso(yr(m[3]), mo, m[1]), kind };
  }
  m = n.match(/([A-Za-z]{3,9})\s+(\d{1,2})\s*,?\s*(\d{4})/);
  if (m) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) return { date: iso(m[3], mo, m[2]), kind };
  }
  // "Monthly Portfolio ... July 2026" — no day, so use the month end
  m = n.match(/([A-Za-z]{3,9})[-\s]*(\d{4})/);
  if (m) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) return { date: iso(m[2], mo, new Date(Date.UTC(+m[2], mo, 0)).getUTCDate()), kind };
  }
  return null;
}

const yr = (y) => (String(y).length === 2 ? 2000 + Number(y) : Number(y));
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;

/** The default pick: any spreadsheet whose FILENAME says "portfolio". */
export function pickByName(urls, { exclude } = {}) {
  const out = [];
  for (const url of urls) {
    const name = decodeURIComponent(url.split("/").pop() || "");
    if (!/portfolio/i.test(name)) continue;
    if (/proxy|voting|\baum\b|\bter\b|expense|riskometer|scheme.?info/i.test(name)) continue;
    if (exclude && exclude.test(name)) continue;
    const p = periodFromName(name);
    if (!p) continue;
    out.push({ url, name, ...p });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const ADAPTERS = [
  {
    amc: "Groww",
    page: "https://www.growwmf.in/statutory-disclosure/portfolio",
    pick: pickByName,
  },
  {
    amc: "Nippon India",
    page: "https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures",
    // The listing carries years of history; the fetcher only takes what is new.
    pick: (urls) => pickByName(urls),
  },
  {
    amc: "Shriram",
    page: "https://www.shriramamc.in/investor-statutory-disclosures",
    pick: pickByName,
  },
];

export default ADAPTERS;
