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

// ISO 6166: two-letter country code, nine alphanumerics, one check digit.
// Matching only "IN..." silently dropped every overseas feeder and ETF —
// Nippon's Japan Equity, US Equity and Hang Seng BeES parsed as empty and were
// reported as "no portfolio table", which is not what was wrong with them.
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const isIsin = (v) => typeof v === "string" && ISIN_RE.test(v.trim().toUpperCase());

/**
 * Indian listed EQUITY specifically — the only thing that can be matched
 * against the NSE universe. INE is the company-share series; INF is mutual
 * fund units, IN0/IN1/IN2 are government and other debt.
 */
export const isIndianEquityIsin = (isin) => /^INE[A-Z0-9]{8}[0-9]$/.test(String(isin || "").toUpperCase());

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

  // Header labels vary between AMCs even though the columns do not. Groww
  // writes "% To Net Assets" and "Market Value (In Rs. lakh)"; Nippon writes
  // "% to NAV" and "Market/Fair Value\r\n( Rs. in Lacs)" — embedded newline and
  // all. So labels are whitespace-normalised and matched loosely, which is the
  // difference between one parser and one parser per AMC.
  const header = rows[headerIdx].map((c) => String(c ?? "").replace(/\s+/g, " ").trim());
  const find = (re) => header.findIndex((c) => re.test(c));
  const iIsin = find(/^ISIN$/i);
  const iName = find(/name of (the )?instrument/i);
  const iInd = find(/rating|industry/i);
  const iQty = find(/^quantity/i);
  const iMv = find(/market\s*\/?\s*(fair\s*)?value|fair value/i);
  const iPct = find(/%\s*to\s*(net\s*asset|nav)/i);
  if (iIsin < 0 || iName < 0 || iPct < 0) return null;

  // The header rows above the table carry the scheme name and the as-on date.
  const above = rows.slice(0, headerIdx).flat().filter((c) => typeof c === "string");
  const asOnCell = above.find((c) => /portfolio\s*(statement\s*)?as on/i.test(c)) || "";
  const asOn = parseAsOn(asOnCell);
  const schemeName = pickSchemeName(above, sheetName);

  // ---- pass 1: find the Grand Total, which declares the convention --------
  // Groww and Nippon file fractions (Grand Total 1); Shriram files percentages
  // (Grand Total 100). Both are valid readings of "% to Net Assets" and the
  // file itself is the only thing that says which. Deciding from the Grand
  // Total rather than guessing is what stops HDFC Bank being published at 714%.
  let grandTotal = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    if (/^grand\s*total$/i.test(String(r[iName] ?? "").trim())) { grandTotal = num(r[iPct]); break; }
  }
  const scale = grandTotal !== null && Math.abs(grandTotal - 1) < 0.02 ? 100
    : grandTotal !== null && Math.abs(grandTotal - 100) < 2 ? 1
      : null;                                   // unrecognised — validate() rejects

  // ---- pass 2: read the holdings ------------------------------------------
  const holdings = [];
  const sectionTotals = {};
  let section = "OTHER", heading = "";

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const label = String(r[iName] ?? "").trim();
    const pct = num(r[iPct]);

    if (/^grand\s*total$/i.test(label)) break;                        // nothing below matters

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
      pct: pct === null || scale === null ? null : pct * scale,
      section,
    });
  }

  return { sheetName, schemeName, asOn, holdings, sectionTotals, grandTotal, scale, heading };
}

/**
 * The scheme name out of the cells above the table.
 *
 * AMCs pad these rows with internal codes and regulatory blurb: Groww writes
 * "IB03-Groww Aggressive Hybrid Fund" in one cell, Nippon puts "RLMF001" in
 * one cell and "Nippon India Growth Mid Cap Fund (Mid Cap Fund- An open ended
 * equity scheme predominantly investing in mid cap stocks)" in the next. Take
 * the cell that actually names a fund, then strip the code and the blurb.
 */
export function pickSchemeName(cells, fallback = "") {
  const clean = (c) => String(c ?? "")
    .replace(/\s+/g, " ").trim()
    .replace(/^[A-Z]{2,6}\s*\d{0,4}\s*-\s*/, "")            // "IB03-", "RLMF001-"
    .replace(/\s*\((?:an?|the)?\s*open[- ]ended[^)]*\)\s*/i, " ")  // the SEBI blurb
    .replace(/\s*\([^)]{40,}\)\s*/g, " ")                    // any long parenthetical
    .replace(/\s+/g, " ").trim();

  // Disclosure sheets are padded with riskometer copy and suitability notes.
  const prose = /investors?\s|suitable|seeking|risk-?o-?meter|principal will be|consult their|^\W/i;

  const cands = (cells || [])
    .map(clean)
    .filter((c) => c.length > 5 && c.length < 110 && !prose.test(c)
      && !/portfolio\s*(statement\s*)?as on/i.test(c));

  const named = cands.filter((c) => /\b(fund|scheme|etf|plan)\b/i.test(c));
  // Real names are short; anything long that survived is still descriptive.
  const best = (named.length ? named : cands).sort((a, b) => a.length - b.length)[0];
  return best || clean(fallback) || String(fallback || "").trim();
}

/** "Portfolio as on 31-JUL-2026" and "as on July 31,2026" -> "2026-07-31" */
export function parseAsOn(text) {
  const t = String(text || "");
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;

  // 31-JUL-2026 / 31 July 2026 / 5-Jan-2026
  let m = t.match(/(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/,]*(\d{4})/);
  if (m) { const mo = MON[m[2].slice(0, 3).toLowerCase()]; if (mo) return iso(m[3], mo, m[1]); }

  // July 31,2026 / July 31, 2026 — Nippon's wording
  m = t.match(/([A-Za-z]{3,9})\s+(\d{1,2})\s*,?\s*(\d{4})/);
  if (m) { const mo = MON[m[1].slice(0, 3).toLowerCase()]; if (mo) return iso(m[3], mo, m[2]); }

  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
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
  else if (parsed.scale === null) problems.push(`Grand Total is ${parsed.grandTotal} — neither 1 nor 100, so the weight convention is unknown`);

  // Holdings deliberately do NOT have to sum to 100. Cash, TREPS and net
  // receivables carry no ISIN, so they are not holdings — and a fund can be
  // over 100% invested against a negative payable (Groww's Smallcap 250
  // Momentum index fund is 103.45% invested against -3.45% receivable, and
  // grand-totals to exactly 100). Rejecting that was a bug in this check, not
  // a problem with the disclosure.
  const sum = parsed.holdings.reduce((a, h) => a + (h.pct ?? 0), 0);
  if (sum > 110) problems.push(`holdings sum to ${sum.toFixed(2)}% — implausibly geared`);
  if (sum < 1) problems.push(`holdings sum to ${sum.toFixed(2)}% — nothing was read`);

  if (!parsed.holdings.length) problems.push("no ISIN-bearing holdings (commodity or fully unlisted scheme)");

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
    if (!p) { skipped.push({ sheet: name, why: "no portfolio table (not a scheme sheet)" }); continue; }
    const v = validate(p);
    if (!v.ok) { skipped.push({ sheet: name, scheme: p.schemeName, why: v.problems.join("; ") }); continue; }
    schemes.push({ amc, ...p, indianEquityCount: p.holdings.filter((h) => h.section === "EQUITY" && isIndianEquityIsin(h.isin)).length, equityPct: p.holdings.filter((h) => h.section === "EQUITY").reduce((a, h) => a + (h.pct ?? 0), 0), investedPct: v.investedPct });
  }
  return { schemes, skipped };
}
