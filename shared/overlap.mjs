// ---------------------------------------------------------------------------
// overlap.mjs — how much of two funds is the same bet.
//
// Pure, no DOM, no fetch: imported by the build, by the browser app and by the
// tests, like the other shared engines.
//
// THE ONE THING PEOPLE GET WRONG
// ------------------------------
// Overlap is NOT the sum of the weights of the shared names. If fund A holds
// 8% HDFC Bank and fund B holds 5%, the part that genuinely duplicates is 5%
// — the smaller of the two. Summing them (13%) double-counts, and summing only
// A's side ignores that B is less exposed.
//
//     overlap = Σ min(wA, wB)  over every instrument in both
//
// That is the standard measure, it is bounded 0–100%, and it answers the real
// question: if I own both of these, how much of my money is buying the same
// shares twice?
// ---------------------------------------------------------------------------

const byIsin = (holdings) => {
  const m = new Map();
  for (const h of holdings || []) {
    if (!h?.isin) continue;
    // A scheme can list the same ISIN twice (e.g. a hedged position split
    // across sections). Summing is right: it is one economic exposure.
    m.set(h.isin, (m.get(h.isin) ?? 0) + (h.pct ?? 0));
  }
  return m;
};

/**
 * Instruments held by BOTH schemes, with each side's weight.
 * Sorted by the overlapping portion, largest first — the names that actually
 * drive the duplication come out on top.
 */
export function commonHoldings(a, b) {
  const A = byIsin(a.holdings), B = byIsin(b.holdings);
  const names = new Map();
  for (const h of [...(a.holdings || []), ...(b.holdings || [])]) if (h?.isin && h.name) names.set(h.isin, h.name);

  const out = [];
  for (const [isin, wA] of A) {
    const wB = B.get(isin);
    if (wB === undefined) continue;
    out.push({ isin, name: names.get(isin) ?? isin, a: wA, b: wB, shared: Math.min(wA, wB) });
  }
  return out.sort((x, y) => y.shared - x.shared);
}

/** Σ min(wA, wB) — the share of each portfolio that is the same holdings. */
export function overlapPct(a, b) {
  return commonHoldings(a, b).reduce((s, h) => s + h.shared, 0);
}

/**
 * Pairwise overlap across N schemes, as a matrix plus a flat list of pairs.
 * N is small in practice (someone compares the funds they own), so the O(n²)
 * is fine and stays in the browser.
 */
export function overlapMatrix(schemes) {
  const n = schemes.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  const pairs = [];
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 100;
    for (let j = i + 1; j < n; j++) {
      const common = commonHoldings(schemes[i], schemes[j]);
      const pct = common.reduce((s, h) => s + h.shared, 0);
      matrix[i][j] = matrix[j][i] = pct;
      pairs.push({ i, j, a: schemes[i], b: schemes[j], pct, common });
    }
  }
  return { matrix, pairs: pairs.sort((x, y) => y.pct - x.pct) };
}

/**
 * Every instrument across N schemes, with how many hold it and at what weight.
 * This is what answers "which of my funds all own the same thing" for more
 * than two at a time.
 */
export function heldAcross(schemes) {
  const rows = new Map();
  schemes.forEach((s, idx) => {
    for (const [isin, pct] of byIsin(s.holdings)) {
      let r = rows.get(isin);
      if (!r) {
        const named = (s.holdings || []).find((h) => h.isin === isin);
        r = { isin, name: named?.name ?? isin, industry: named?.industry ?? null, weights: Array(schemes.length).fill(null), count: 0 };
        rows.set(isin, r);
      }
      r.weights[idx] = pct;
      r.count++;
    }
  });
  return [...rows.values()]
    .map((r) => {
      const held = r.weights.filter((w) => w !== null);
      return { ...r, avg: held.reduce((a, w) => a + w, 0) / held.length, max: Math.max(...held) };
    })
    .sort((a, b) => b.count - a.count || b.max - a.max);
}

/**
 * Overlap weighted by what you actually hold. Two funds that overlap 60% matter
 * far less if one is 5% of your money than if they are half each.
 * `amounts` are rupee values aligned with `schemes`.
 */
export function portfolioDuplication(schemes, amounts) {
  const total = amounts.reduce((a, x) => a + (x || 0), 0);
  if (!total) return { total: 0, duplicatedPct: 0, byInstrument: [] };

  // Effective weight of each instrument in the COMBINED book.
  const combined = new Map();
  schemes.forEach((s, i) => {
    const share = (amounts[i] || 0) / total;
    for (const [isin, pct] of byIsin(s.holdings)) {
      const c = combined.get(isin) ?? { isin, name: (s.holdings.find((h) => h.isin === isin)?.name) ?? isin, pct: 0, funds: 0 };
      c.pct += pct * share;
      c.funds++;
      combined.set(isin, c);
    }
  });
  const byInstrument = [...combined.values()].sort((a, b) => b.pct - a.pct);
  // "Duplicated" = the weight sitting in instruments more than one fund holds.
  const duplicatedPct = byInstrument.filter((c) => c.funds > 1).reduce((a, c) => a + c.pct, 0);
  return { total, duplicatedPct, byInstrument };
}
