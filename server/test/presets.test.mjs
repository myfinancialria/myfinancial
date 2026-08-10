// ---------------------------------------------------------------------------
// Every ready-made screen must actually return something.
//
// This exists because of a specific, repeated failure: a preset filters on a
// field the data does not carry (Upstox publishes no debtToEquity, no market
// cap and no dividend yield), and because a numeric threshold can never be met
// by a blank, the screen silently returns zero rows. It looks like "nothing
// qualifies today" rather than "this screen is broken".
//
// The predicate below is a copy of the one the browser runs, so a preset that
// passes here behaves the same on the page.
//
// Skips itself when dist/data has not been built yet, so a fresh clone can run
// `npm test` without first running a 30-minute data pipeline.
// ---------------------------------------------------------------------------
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STOCK_PRESETS, FUND_PRESETS } from "../../scripts/lib/screener_page.mjs";
import { STOCK_FIELDS, FUND_FIELDS } from "../../scripts/lib/schema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "..", "dist", "data");

const load = (file) => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(DIST, file), "utf8"));
    return j.rows.map((arr) => Object.fromEntries(j.fields.map((k, i) => [k, arr[i]])));
  } catch { return null; }
};

/** The browser's filter predicate, verbatim in behaviour. */
function passes(row, f) {
  const v = row[f.f];
  switch (f.op) {
    case "notnull": return v !== null && v !== undefined && v !== "";
    case "true": return v === true;
    case "false": return v === false || v === null;
    case "in": return Array.isArray(f.a) && f.a.length ? f.a.map(String).includes(String(v)) : true;
    case "notin": return Array.isArray(f.a) && f.a.length ? !f.a.map(String).includes(String(v)) : true;
    case "contains": return String(v ?? "").toLowerCase().includes(String(f.a ?? "").toLowerCase());
    default: break;
  }
  if (typeof v !== "number") return false;
  const a = Number(f.a), b = Number(f.b);
  switch (f.op) {
    case ">=": return v >= a;
    case "<=": return v <= a;
    case ">": return v > a;
    case "<": return v < a;
    case "=": return v === a;
    case "between": return v >= a && v <= b;
    default: return true;
  }
}

const suites = [
  { label: "stock", presets: STOCK_PRESETS, fields: STOCK_FIELDS, rows: load("stocks.json"), min: 3 },
  { label: "fund", presets: FUND_PRESETS, fields: FUND_FIELDS, rows: load("funds.json"), min: 3 },
];

for (const s of suites) {
  test(`${s.label} presets only reference fields that exist in the schema`, () => {
    const known = new Set(s.fields.map((f) => f.key));
    for (const p of s.presets) {
      for (const f of p.filters) {
        assert.ok(known.has(f.f), `preset "${p.name}" filters on unknown field "${f.f}"`);
      }
      if (p.sort) assert.ok(known.has(p.sort.f), `preset "${p.name}" sorts on unknown field "${p.sort.f}"`);
    }
  });

  test(`${s.label} presets each return results`, { skip: s.rows ? false : "dist/data not built" }, () => {
    for (const p of s.presets) {
      const out = s.rows.filter((r) => p.filters.every((f) => passes(r, f)));
      assert.ok(
        out.length >= s.min,
        `preset "${p.name}" returned ${out.length} rows (expected ≥ ${s.min}). `
        + `Per-condition survivors: ${p.filters.map((f) => `${f.f}=${s.rows.filter((r) => passes(r, f)).length}`).join(", ")}`,
      );
    }
  });

  test(`${s.label} presets do not filter on an empty field`, { skip: s.rows ? false : "dist/data not built" }, () => {
    for (const p of s.presets) {
      for (const f of p.filters) {
        if (["true", "false", "notnull"].includes(f.op)) continue;
        const present = s.rows.filter((r) => r[f.f] !== null && r[f.f] !== undefined && r[f.f] !== "").length;
        assert.ok(
          present > 0,
          `preset "${p.name}" filters on "${f.f}", which is empty for all ${s.rows.length} rows — the screen can only return nothing`,
        );
      }
    }
  });
}
