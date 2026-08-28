// ---------------------------------------------------------------------------
// cas.mjs — read a CAMS / KFintech Consolidated Account Statement.
//
// WHY THIS IS A PORT AND NOT A DEPENDENCY
//
// The reference implementation is codereverser/casparser, which is Python and
// leans on pypdfium2's raw ctypes surface (FPDFText_GetCharOrigin and friends)
// for per-glyph positions. Neither Python nor a native PDF library can run on
// a static site, and this site has no backend.
//
// It could have had one. That is the decision worth explaining: a CAS carries
// the holder's PAN, address, email, every folio and every transaction they
// have ever made. It is the single most sensitive document a retail investor
// owns. Sending it to a server — anyone's server — to save some porting work
// is a bad trade made on someone else's behalf. So the statement is read in
// the reader's own browser and never leaves it.
//
// This file is the part that can be tested without a PDF: positioned text
// lines in, a portfolio out. The pdf.js glue that produces those lines lives
// in the app; it is thin on purpose, because everything that can be got wrong
// is here, where it can be tested.
//
// Ported behaviours are marked ← casparser so the lineage of each rule is
// clear if the upstream one changes.
// ---------------------------------------------------------------------------

/* ------------------------------- utilities -------------------------------- */
const num = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[(),\s]/g, "").replace(/^₹|^INR/i, "");
  if (!s || !/[0-9]/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // A CAS writes negatives in parentheses: (1,234.56)
  return /^\(.*\)$/.test(String(v).trim()) ? -n : n;
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "25-Oct-2021", "25 Oct 2021", "25Oct2021" → "2021-10-25". ← casparser DATE_CELL_RE */
export function parseDate(s) {
  const m = String(s ?? "").match(/(\d{1,2})[-\s]*([A-Za-z]{3})[a-z]*[-\s]*(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[2].toLowerCase()];
  if (mo === undefined) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}

/* ------------------------- transaction classification --------------------- */
// ← casparser/parsers/_classify.py::get_transaction_type
const DIVIDEND_RE = /(?:div\.|dividend|idcw)[\s\S]*?@\s*Rs\.?\s*([\d.]+)(?:\s+per\s+unit)?/i;
const REINVEST_RE = /reinvest/i;
const STP_RE = /\bs\s*t\s*p\b|systematic\s+transfer/i;
const REVERSAL_RE = /reversal|rejection|dishonoured|mismatch|insufficient\s+balance|payment\s+not\s+received/i;

export function classifyTransaction(description, units) {
  const d = String(description ?? "").toLowerCase();
  const div = d.match(DIVIDEND_RE);
  if (div) {
    return {
      type: REINVEST_RE.test(d) ? "DIVIDEND_REINVEST" : "DIVIDEND_PAYOUT",
      dividendRate: num(div[1]),
    };
  }
  if (units === null || units === undefined) {
    if (d.includes("stt")) return { type: "STT_TAX", dividendRate: null };
    if (d.includes("stamp")) return { type: "STAMP_DUTY_TAX", dividendRate: null };
    if (d.includes("tds")) return { type: "TDS_TAX", dividendRate: null };
    return { type: "MISC", dividendRate: null };
  }
  if (units > 0) {
    if (d.includes("gift")) return { type: "GIFT_IN", dividendRate: null };
    if (d.includes("switch") || STP_RE.test(d)) {
      return { type: d.includes("merger") ? "SWITCH_IN_MERGER" : "SWITCH_IN", dividendRate: null };
    }
    if (d.includes("segregat")) return { type: "SEGREGATION", dividendRate: null };
    if (d.includes("sip") || d.includes("systematic") || /instal+ment/i.test(d) || /sys[\s\S]+?invest/i.test(d)) {
      return { type: "PURCHASE_SIP", dividendRate: null };
    }
    return { type: "PURCHASE", dividendRate: null };
  }
  if (units < 0) {
    if (d.includes("gift")) return { type: "GIFT_OUT", dividendRate: null };
    if (REVERSAL_RE.test(d)) return { type: "REVERSAL", dividendRate: null };
    if (d.includes("switch") || STP_RE.test(d)) {
      return { type: d.includes("merger") ? "SWITCH_OUT_MERGER" : "SWITCH_OUT", dividendRate: null };
    }
    return { type: "REDEMPTION", dividendRate: null };
  }
  return { type: "UNKNOWN", dividendRate: null };
}

/** Money actually left or reached the investor's bank on this transaction. */
export const isExternalFlow = (t) =>
  ["PURCHASE", "PURCHASE_SIP", "REDEMPTION", "DIVIDEND_PAYOUT"].includes(t);

/* --------------------------- scheme name tidy-up -------------------------- */
// ← casparser/parsers/_classify.py::get_parsed_scheme_name
export function cleanSchemeName(raw) {
  return String(raw ?? "")
    // The RTA's own scheme code prefixes the name — "HDFC0001-HDFC Balanced
    // Advantage Fund". It means nothing to a reader and differs between
    // registrars for the same fund. ← casparser _SCHEME_CODE_RE
    .replace(/^\s*[A-Z0-9]+(?: [A-Z0-9]+)*\s*-\s*(?=[A-Za-z])/, "")
    .replace(/\((formerly|erstwhile)[^)]*\)/gi, " ")
    .replace(/\(\s*demat[^)]*\)/gi, " ")
    .replace(/[-\s]*ISIN\s*:\s*[A-Z0-9]*/gi, " ")
    .replace(/[-\s]*\(\s*Advisor\s*:\s*[^)]*\)/gi, " ")
    .replace(/Registrar\s*:.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* --------------------------------- anchors -------------------------------- */
// ← casparser/parsers/cams_detailed.py
const RE = {
  casType: /consolidated\s+account\s+(statement|summary)/i,
  folio: /Folio\s+No\s*:\s*(\d+(?:\s*\/\s*\d+)?)(?:.*?PAN\s*:\s*([A-Z]{5}\d{4}[A-Z]))?(?:.*?KYC\s*:\s*(OK|NOT OK))?/i,
  isinAnywhere: /\bINF[0-9A-Z]{8}\d\b/,
  amc: /^(.+?\s+(?:MF|Mutual\s*Fund|Fund\s*House))$/i,
  openBal: /Opening\s+Unit\s+Balance\s*:?\s*([\d,.]+)/i,
  closeBal: /Closing\s+Unit\s+Balance\s*:?\s*([\d,.]+)/i,
  nav: /NAV\s+on\s+(\d{2}-[A-Za-z]{3}-\d{4})\s*:\s*INR\s*([\d,.]+)/i,
  valuation: /(?:Valuation|Market\s+Value)\s+on\s+(\d{2}-[A-Za-z]{3}-\d{4})\s*:\s*INR\s*([\d,.]+)/i,
  costValue: /Total\s+Cost\s+Value\s*:?\s*([\d,.]+)/i,
  period: /(\d{2}-[A-Za-z]{3}-\d{4})\s+To\s+(\d{2}-[A-Za-z]{3}-\d{4})/i,
  email: /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  rta: /\b(CAMS|KFINTECH|KFIN|KARVY)\b/i,
  schemeHead: /^\s*[A-Z0-9]+(?: [A-Z0-9]+)*\s*-\s*\S/,
  dateCell: /^\s*(\d{1,2}[-\s]*[A-Za-z]{3}[-\s]*\d{4})/,
};

/** Which statement this is, and from whom. ← casparser/parsers/detect.py */
export function detect(text) {
  const t = String(text ?? "");

  // THE DEPOSITORY MARKER IS CHECKED FIRST, AND THAT ORDER MATTERS.
  //
  // NSDL issues a document also titled "Consolidated Account Statement" — it
  // just holds shares rather than fund units. Testing for the title before the
  // issuer classified an NSDL demat statement as a CAMS one and handed it to a
  // parser that would have reported the holder's equities as mutual funds.
  // ← casparser/parsers/detect.py looks for the source marker first for the
  // same reason.
  if (/\bNSDL\b/i.test(t)) return { source: "NSDL", kind: "DEMAT", supported: false };
  if (/\bCDSL\b/i.test(t)) return { source: "CDSL", kind: "DEMAT", supported: false };

  if (!RE.casType.test(t)) return { source: "UNKNOWN", kind: "UNKNOWN", supported: false };
  const summary = /consolidated\s+account\s+summary/i.test(t);
  const rta = t.match(RE.rta);
  return {
    source: rta ? (/^K/i.test(rta[1]) ? "KFINTECH" : "CAMS") : "CAMS",
    kind: summary ? "SUMMARY" : "DETAILED",
    supported: true,
  };
}

/* --------------------------------- parse ---------------------------------- */
/**
 * Turn the statement's text lines into folios, schemes and transactions.
 *
 * `lines` is an ordered array of strings — one per visual line of the PDF,
 * already assembled from positioned glyphs by the caller.
 */
const NUMERIC_CELL_RE = /^\(?-?[\d,]+\.\d{2,4}\)?$/;
const NUMERIC_CELL_RE_G = /\(?-?[\d,]+\.\d{2,4}\)?/g;

/**
 * Where the table's value columns begin, in PDF points.
 *
 * Value columns are right-aligned and repeat down the page, so the numeric
 * cells cluster tightly on the right while description text sprawls on the
 * left. Taking the leftmost of those right-hand clusters gives the boundary
 * without needing to find a header row — which some templates do not have.
 */
export function findValueColumnStart(rows) {
  // A VALUE COLUMN RECURS; A NUMBER IN PROSE DOES NOT.
  //
  // The amount, units, NAV and balance columns land at the same x on every
  // row of the table. A figure quoted inside a description — a dividend rate,
  // an instalment number — lands wherever the sentence happens to put it, and
  // never twice in the same place. So the columns are the x positions that
  // repeat, and the leftmost of those is where the values begin.
  //
  // Finding it by the widest gap does not work: the gaps between the value
  // columns themselves are wider than the gap between prose and the first of
  // them, so that heuristic cut the amount column off.
  const buckets = new Map();                        // rounded x -> rows seen on
  rows.forEach((cells, row) => {
    if (!cells?.length) return;
    for (const c of cells) {
      if (!NUMERIC_CELL_RE.test(c.text)) continue;
      const key = Math.round(c.x / 6) * 6;          // tolerate sub-point drift
      (buckets.get(key) ?? buckets.set(key, new Set()).get(key)).add(row);
    }
  });
  const recurring = [...buckets.entries()]
    .filter(([, seenOn]) => seenOn.size >= 2)
    .map(([x]) => x)
    .sort((a, b) => a - b);
  return recurring.length ? recurring[0] - 4 : Infinity;
}

/**
 * @param {string[]} lines  one string per visual line
 * @param {Array<Array<{x:number,text:string}>>} [cells]  the same lines as
 *        positioned cells. Supplying these is what makes dividend and
 *        tax rows parse correctly; without them the parser degrades to
 *        reading numbers in word order.
 */
export function parseCas(lines, cells = []) {
  const all = (lines ?? []).map((l) => String(l ?? "").replace(/\s+/g, " ").trim());
  const valueColumnStart = findValueColumnStart(cells);
  const text = all.join("\n");
  const meta = detect(text);

  const period = text.match(RE.period);
  const statement = {
    source: meta.source, kind: meta.kind,
    from: period ? parseDate(period[1]) : null,
    to: period ? parseDate(period[2]) : null,
  };

  const investor = {
    email: (text.match(RE.email) ?? [])[1] ?? null,
    // The name sits above the address block, before the first folio.
    name: (() => {
      const i = all.findIndex((l) => RE.folio.test(l));
      const head = all.slice(0, i < 0 ? 12 : i);
      const cand = head.filter((l) =>
        /^[A-Z][A-Za-z .'&-]{4,60}$/.test(l)
        && !RE.casType.test(l) && !RE.rta.test(l)
        && !RE.amc.test(l));      // "HDFC Mutual Fund" is an AMC, not the holder
      return cand.length ? cand[cand.length - 1] : null;
    })(),
  };

  const folios = [];
  let folio = null, scheme = null, amc = null;

  const pushScheme = () => { if (folio && scheme) folio.schemes.push(scheme); scheme = null; };
  const pushFolio = () => { pushScheme(); if (folio) folios.push(folio); folio = null; };

  for (let i = 0; i < all.length; i++) {
    const line = all[i];
    if (!line) continue;

    const f = line.match(RE.folio);
    if (f) {
      pushFolio();
      folio = { folio: f[1].replace(/\s+/g, ""), pan: f[2] ?? null, kyc: f[3] ?? null, amc, schemes: [] };
      continue;
    }

    const a = line.match(RE.amc);
    if (a && !RE.folio.test(line) && line.length < 70) { amc = a[1].trim(); if (folio) folio.amc = amc; continue; }

    // A scheme header carries an ISIN, or looks like "CODE-Name".
    const isin = (line.match(RE.isinAnywhere) ?? [])[0] ?? null;
    if (folio && (isin || (RE.schemeHead.test(line) && /[a-z]/.test(line) && line.length > 18 && !RE.dateCell.test(line)))) {
      if (scheme && !isin && !RE.schemeHead.test(line)) { /* continuation */ }
      else {
        pushScheme();
        scheme = {
          name: cleanSchemeName(line), isin, amc,
          advisor: (line.match(/\(\s*Advisor\s*:\s*([^)]+?)\)/i) ?? [])[1]?.trim() ?? null,
          rta: (line.match(RE.rta) ?? [])[1]?.toUpperCase() ?? null,
          open: null, close: null, nav: null, navDate: null, valuation: null, valuationDate: null,
          cost: null, transactions: [],
        };
        continue;
      }
    }
    if (!scheme) continue;

    const ob = line.match(RE.openBal); if (ob) { scheme.open = num(ob[1]); continue; }
    const cb = line.match(RE.closeBal); if (cb) scheme.close = num(cb[1]);
    const nv = line.match(RE.nav); if (nv) { scheme.navDate = parseDate(nv[1]); scheme.nav = num(nv[2]); }
    const vl = line.match(RE.valuation); if (vl) { scheme.valuationDate = parseDate(vl[1]); scheme.valuation = num(vl[2]); }
    const cv = line.match(RE.costValue); if (cv) scheme.cost = num(cv[1]);
    if (cb || nv || vl || cv) continue;

    // A transaction row: a leading date, then description and numbers.
    const d = line.match(RE.dateCell);
    if (!d) continue;
    const date = parseDate(d[1]);
    if (!date) continue;

    const rest = line.slice(d[0].length).trim();

    // COLUMNS, NOT WORD ORDER.
    //
    // Flattening the row to a string and taking the numbers in order gets
    // dividend rows wrong: "IDCW Payout @ Rs. 2.50 per unit   3,282.67" reads
    // 2.50 as the amount, because the rate is prose sitting in the description
    // column. casparser avoids this by using glyph positions, and so does this
    // — when the caller supplies them. `numericCells` are the cells whose x
    // falls in the table's value columns; anything left of that is description.
    const positioned = cells[i];
    let cols, description;
    if (positioned?.length) {
      const valueCells = positioned.filter((c) => c.x >= valueColumnStart && NUMERIC_CELL_RE.test(c.text));
      cols = valueCells.sort((a, b) => a.x - b.x).map((c) => c.text);
      description = positioned
        .filter((c) => c.x < valueColumnStart)
        .sort((a, b) => a.x - b.x).map((c) => c.text).join(" ")
        .replace(RE.dateCell, "").replace(/\s+/g, " ").trim();
    } else {
      cols = [...rest.matchAll(NUMERIC_CELL_RE_G)].map((m) => m[0]);
      description = (cols.length ? rest.slice(0, rest.lastIndexOf(cols[0])) : rest).trim() || rest;
    }

    const [amount, units, nav, balance] = [cols[0], cols[1], cols[2], cols[3]].map(num);
    const { type, dividendRate } = classifyTransaction(description, units);
    scheme.transactions.push({
      date, description, amount, units, nav, balance, type, dividendRate,
    });
  }
  pushFolio();

  return { statement, investor, folios, meta };
}
