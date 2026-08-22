// ---------------------------------------------------------------------------
// portfolio.mjs — read a SEBI-format monthly/fortnightly portfolio disclosure.
//
// Every AMC must publish scheme portfolios in a prescribed layout, so ONE
// parser serves all of them. What differs between AMCs is how you find the
// file, not what is inside it — that part lives in the per-AMC adapters.
//
// The layout, per sheet (one sheet = one scheme):
//
//   row 0   <code>-<Scheme Name>
//   row 1   Portfolio as on 31-JUL-2026
//   row 2   ISIN | Name of Instrument | Rating/Industry | Quantity |
//           Market Value (In Rs. lakh) | % To Net Assets | Maturity Date
//   ...     section headers ("EQUITY & EQUITY RELATED"), holdings, Sub Total,
//           Total, and finally Grand Total — after which the sheet may carry
//           unrelated trailing data that must NOT be read as holdings.
//
// THE UNIT TRAP: "% To Net Assets" is a FRACTION. Excel displays 0.046 as
// 4.6%, and the Grand Total row is exactly 1. Read at face value every weight
// would be 100x too small and every overlap figure silently wrong, so the
// fraction is asserted against the Grand Total rather than assumed.
// ---------------------------------------------------------------------------

const ISIN_RE = /^IN[A-Z0-9]{10}$/;
const isIsin = (v) => typeof v === "string" && ISIN_RE.test(v.trim());

/** Rows that close a section rather than hold anything. */
const TOTAL_RE = /^(sub\s*total|total|grand\s*total)$/i;

/**
 * Map a section heading onto a small, stable vocabulary — or null when the
 * line is not a major section at all.
 *
 * This distinction matters. A sheet reads:
 *
 *   EQUITY & EQUITY RELATED                              <- major section
 *   (a) Listed / awaiting listing on the stock exchanges <- sub-heading
 *   INE040A01034  HDFC Bank Limited ...
 *
 * Letting the sub-heading reset the section files every equity holding under
 * the wrong bucket, which is exactly what it did on the first run: 66-holding
 * equity funds reported 0% equity. Returning null for sub-headings keeps the
 * major section sticky until a real one replaces it.
 */
export function classifySection(heading) {
  const h = String(heading || "").trim().toLowerCase();
  if (!h) return null;
  if (/^\([a-z]\)/.test(h)) return null;                       // "(a) Listed / awaiting listing"
  if (/equity\s*&|equity and|equities|equity related/.test(h)) return "EQUITY";
  if (/derivative|futures|options/.test(h)) return "DERIVATIVE";
  if (/money market|certificate of deposit|commercial paper|treasury bill/.test(h)) return "MONEY_MARKET";
  if (/debt instrument|debenture|bond|government securit|securitized|sdl|g-sec/.test(h)) return "DEBT";
  if (/treps|repo|cash|receivable|payable|margin deposit/.test(h)) return "CASH";
  if (/units? of|mutual fund unit|reit|invit|exchange traded fund/.test(h)) return "FUND_UNITS";
  if (/foreign securit|overseas/.test(h)) return "FOREIGN";
  return null;                                                 // not a section line
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Parse one worksheet (already converted to an array-of-arrays).
 * Returns null when the sheet is not a portfolio sheet at all.
 */
export function parseSheet(rows, { sheetName = "" } = {}) {
  if (!Array.isArray(rows) || rows.length < 5) return null;

  const headerIdx = rows.findIndex((r) => Array.isArray(r) && r.some((c) => String(c).trim().toUpperCase() === "ISIN"));
  if (headerIdx < 0) return null;

  const header = rows[headerIdx].map((c) => String(c ?? "").trim());
  const find = (re) => header.findIndex((c) => re.test(c));
  const iIsin = find(/^ISIN$/i);
  const iName = find(/name of (the )?instrument/i);
  const iInd = find(/rating|industry/i);
  const iQty = find(/^quantity/i);
  const iMv = find(/market value/i);
  const iPct = find(/%\s*to net assets/i);
  if (iIsin < 0 || iName < 0 || iPct < 0) return null;

  // The header rows above the table carry the scheme name and the as-on date.
  const above = rows.slice(0, headerIdx).flat().filter((c) => typeof c === "string");
  const asOnCell = above.find((c) => /portfolio as on/i.test(c)) || "";
  const asOn = parseAsOn(asOnCell);
  const nameCell = above.find((c) => c && !/portfolio as on/i.test(c) && c.length > 4) || sheetName;
  // "IB03-Groww Aggressive Hybrid Fund" — the AMC's internal code is not useful.
  const schemeName = String(nameCell).replace(/^[A-Z0-9]{2,6}\s*-\s*/, "").trim();

  const holdings = [];
  const sectionTotals = {};
  let section = "OTHER", heading = "";
  let grandTotal = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const label = String(r[iName] ?? "").trim();
    const pct = num(r[iPct]);

    if (/^grand\s*total$/i.test(label)) { grandTotal = pct; break; }   // nothing below matters

    if (TOTAL_RE.test(label)) {
      if (pct !== null) sectionTotals[section] = (sectionTotals[section] ?? 0) + pct;
      continue;
    }
    if (!isIsin(r[iIsin])) {
      // A label with no ISIN is a heading. Only a MAJOR one moves the section;
      // sub-headings and "NIL" lines leave it where it is.
      if (label) {
        const c = classifySection(label);
        if (c) { heading = label; section = c; }
      }
      continue;
    }
    holdings.push({
      isin: String(r[iIsin]).trim(),
      name: label,
      industry: iInd >= 0 ? (String(r[iInd] ?? "").trim() || null) : null,
      quantity: iQty >= 0 ? num(r[iQty]) : null,
      marketValueLakh: iMv >= 0 ? num(r[iMv]) : null,
      pct: pct === null ? null : pct * 100,      // fraction -> percent
      section,
    });
  }

  if (!holdings.length) return null;
  return { sheetName, schemeName, asOn, holdings, sectionTotals, grandTotal, heading };
}

/** "Portfolio as on 31-JUL-2026" -> "2026-07-31" */
export function parseAsOn(text) {
  const m = String(text || "").match(/(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/](\d{4})/);
  if (!m) {
    const iso = String(text || "").match(/(\d{4})-(\d{2})-(\d{2})/);
    return iso ? iso[0] : null;
  }
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const mo = MON[m[2].slice(0, 3).toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

/**
 * Sanity-check a parsed sheet. A disclosure that does not add up is a parse
 * bug, not a data point — better to drop the scheme and say so than to publish
 * weights that quietly do not sum to a portfolio.
 */
export function validate(parsed) {
  const problems = [];

  // The Grand Total is the file's OWN arithmetic, so it is the honest check.
  if (parsed.grandTotal === null) problems.push("no Grand Total row");
  else if (Math.abs(parsed.grandTotal - 1) > 0.02) {
    problems.push(Math.abs(parsed.grandTotal - 100) < 2
      ? "Grand Total is 100 — this file uses percents, not fractions"
      : `Grand Total is ${parsed.grandTotal}, expected 1`);
  }

  // Holdings deliberately do NOT have to sum to 100. Cash, TREPS and net
  // receivables carry no ISIN, so they are not holdings — and a fund can be
  // over 100% invested against a negative payable (Groww's Smallcap 250
  // Momentum index fund is 103.45% invested against -3.45% receivable, and
  // grand-totals to exactly 100). Rejecting that was a bug in this check, not
  // a problem with the disclosure.
  const sum = parsed.holdings.reduce((a, h) => a + (h.pct ?? 0), 0);
  if (sum > 110) problems.push(`holdings sum to ${sum.toFixed(2)}% — implausibly geared`);
  if (sum < 1) problems.push(`holdings sum to ${sum.toFixed(2)}% — nothing was read`);

  const noPct = parsed.holdings.filter((h) => h.pct === null).length;
  if (noPct > parsed.holdings.length * 0.1) problems.push(`${noPct} of ${parsed.holdings.length} holdings carry no weight`);

  return { ok: problems.length === 0, problems, investedPct: sum };
}

/** Parse a whole workbook: one sheet per scheme. `sheets` is [name, rows][]. */
export function parseWorkbook(sheets, { amc = "" } = {}) {
  const schemes = [], skipped = [];
  for (const [name, rows] of sheets) {
    let p = null;
    try { p = parseSheet(rows, { sheetName: name }); } catch (e) { skipped.push({ sheet: name, why: e.message }); continue; }
    if (!p) { skipped.push({ sheet: name, why: "no portfolio table" }); continue; }
    const v = validate(p);
    if (!v.ok) { skipped.push({ sheet: name, scheme: p.schemeName, why: v.problems.join("; ") }); continue; }
    schemes.push({ amc, ...p, equityPct: p.holdings.filter((h) => h.section === "EQUITY").reduce((a, h) => a + (h.pct ?? 0), 0), investedPct: v.investedPct });
  }
  return { schemes, skipped };
}
