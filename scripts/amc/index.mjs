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
  // Underscores are a separator like any other here: DSP files
  // "monthend-portfolios_31_july_2026.zip", which no date pattern below would
  // otherwise match, so the whole filing would be silently skipped.
  const n = decodeURIComponent(String(name)).replace(/_/g, " ").replace(/\s+/g, " ");
  const kind = /fortnight/i.test(n) ? "FORTNIGHTLY" : /quarter/i.test(n) ? "QUARTERLY" : /half.?year/i.test(n) ? "HALF_YEARLY" : "MONTHLY";

  // "15th August 2026" — an ordinal suffix would otherwise push this to the
  // month-end branch and date a mid-month fortnightly filing as the 31st.
  let m = n.match(/(\d{1,2})(?:st|nd|rd|th)[-\s]([A-Za-z]{3,9})[-\s,]*(\d{2,4})/i);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) return { date: iso(yr(m[3]), mo, m[1]), kind };
  }

  // "31-July-26", "31 July 2026", "July 31, 2026", "Jul-26"
  m = n.match(/(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{2,4})/);
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

/**
 * Some AMCs publish ONE FILE PER SCHEME rather than one workbook for the whole
 * range, and name them "Monthly <Scheme> - 31 July 2026.xlsx" — the word
 * "portfolio" never appears, so pickByName sees an empty listing. The period
 * still parses out of the trailing date.
 */
export function pickByPrefix(urls, { exclude } = {}) {
  const out = [];
  for (const url of urls) {
    const name = decodeURIComponent(url.split("/").pop() || "");
    if (!/^\s*(monthly|fortnightly|half.?year|quarter)/i.test(name)) continue;
    if (/proxy|voting|\baum\b|\bter\b|expense|riskometer|scheme.?info|factsheet/i.test(name)) continue;
    if (exclude && exclude.test(name)) continue;
    const p = periodFromName(name);
    if (!p) continue;
    out.push({ url, name, ...p });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Samco files carry the date as DDMMYYYY inside the name, no separators. */
export function pickSamco(urls) {
  const out = [];
  for (const url of urls) {
    const name = decodeURIComponent(url.split("/").pop() || "");
    if (!/portfolio/i.test(name)) continue;
    const m = name.match(/_(\d{2})(\d{2})(\d{4})_/);
    if (!m) continue;
    out.push({
      url, name,
      date: `${m[3]}-${m[2]}-${m[1]}`,
      kind: /fortnight/i.test(name) ? "FORTNIGHTLY" : "MONTHLY",
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const ADAPTERS = [
  {
    amc: "DSP",
    page: "https://www.dspim.com/mandatory-disclosures/portfolio-disclosures",
    // The month comes as a ZIP ("monthend-portfolios_31_july_2026.zip"); the
    // ISIN-DEBT file alongside it is a subset, and fund-performance is returns,
    // not holdings.
    pick: (urls) => pickByName(urls, { exclude: /isin|fund.?performance/i }),
  },
  {
    amc: "Groww",
    page: "https://www.growwmf.in/statutory-disclosure/portfolio",
    pick: pickByName,
  },
  {
    amc: "HDFC",
    page: "https://www.hdfcfund.com/statutory-disclosure/portfolio/monthly-portfolio",
    // 109 files for one month — one per scheme, on an open CDN.
    pick: pickByPrefix,
  },
  {
    amc: "Helios",
    page: "https://heliosmf.in/downloads",
    pick: pickByName,
  },
  {
    amc: "Samco",
    page: "https://www.samcomf.com/StatutoryDisclosure",
    pick: pickSamco,
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
