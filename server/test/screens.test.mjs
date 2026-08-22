import test from "node:test";
import assert from "node:assert/strict";
import { encodeScreen, decodeScreen, toCsv } from "../../shared/screens.mjs";

/* ---------------------------------------------------------------------------
   A share link is the one part of the screener with no server behind it: the
   whole definition rides in the URL. If encode and decode ever disagree, a
   link silently applies the wrong filters and the recipient has no way to
   know. These tests exist to make that a build failure rather than a surprise.
--------------------------------------------------------------------------- */

const SCREEN = {
  filters: [
    { f: "roe", op: ">=", a: 15 },
    { f: "pe", op: "between", a: 3, b: 18 },
    { f: "aboveSma200", op: "true" },
    { f: "sector", op: "in", a: ["Financial Services"] },
  ],
  sort: { f: "roce", dir: -1 },
  q: "bank",
  cols: ["name", "pe", "roe"],
};

test("a screen survives the encode/decode round trip exactly", () => {
  const back = decodeScreen(encodeScreen(SCREEN));
  assert.deepEqual(back.filters, SCREEN.filters);
  assert.deepEqual(back.sort, SCREEN.sort);
  assert.equal(back.q, SCREEN.q);
  assert.deepEqual(back.cols, SCREEN.cols);
});

test("the encoding is URL-safe and needs no escaping", () => {
  const code = encodeScreen(SCREEN);
  assert.match(code, /^[A-Za-z0-9_-]+$/, "must survive being pasted into a query string");
  assert.equal(encodeURIComponent(code), code, "must not change under URI encoding");
});

test("non-ASCII in a search term survives", () => {
  // Scheme and company names carry ₹, ampersands and accented characters.
  const s = { ...SCREEN, q: "Mahindra & Mahindra ₹ café" };
  assert.equal(decodeScreen(encodeScreen(s)).q, s.q);
});

test("a malformed or hostile code is refused rather than half-applied", () => {
  for (const bad of ["", "!", "zzzz", "e30", btoa("null"), btoa('{"a":1}'), btoa("[1,2,3]")]) {
    const out = decodeScreen(bad);
    assert.ok(out === null || Array.isArray(out.filters), `"${bad}" must not produce a broken screen`);
  }
});

test("garbage conditions inside a valid envelope are dropped, not applied", () => {
  const code = encodeScreen({
    filters: [{ f: "roe", op: ">=", a: 15 }, { nonsense: true }, null, "string", { f: "pe" }],
    sort: { f: "pe", dir: 1 },
  });
  const back = decodeScreen(code);
  assert.equal(back.filters.length, 1, "only the well-formed condition should survive");
  assert.equal(back.filters[0].f, "roe");
});

test("a missing sort falls back rather than producing an undefined column", () => {
  const back = decodeScreen(encodeScreen({ filters: [], sort: { f: "", dir: -1 } }));
  assert.equal(back.sort.f, "marketCapCr");
  assert.equal(back.sort.dir, -1);
});

test("an ascending sort stays ascending", () => {
  assert.equal(decodeScreen(encodeScreen({ filters: [], sort: { f: "pe", dir: 1 } })).sort.dir, 1);
});

test("a realistic screen encodes small enough to paste anywhere", () => {
  // Ten conditions and twenty columns is a heavy screen; it must still land
  // well inside what a browser address bar and a chat app will carry.
  const heavy = {
    filters: Array.from({ length: 10 }, (_, i) => ({ f: `measure${i}`, op: ">=", a: i })),
    sort: { f: "marketCapCr", dir: -1 },
    q: "",
    cols: Array.from({ length: 20 }, (_, i) => `column${i}`),
  };
  assert.ok(encodeScreen(heavy).length < 1200, "encoded screen should stay short");
});

/* ------------------------------- CSV export ------------------------------- */
const COLS = [{ key: "name", label: "Company" }, { key: "pe", label: "P/E" }];

test("CSV quotes commas, quotes and newlines the way RFC 4180 requires", () => {
  const csv = toCsv(
    [{ name: 'Tata Consultancy, "TCS"', pe: 28.4 }, { name: "Line\nbreak", pe: null }],
    COLS,
  );
  const body = csv.replace(/^﻿/, "").split("\r\n");
  assert.equal(body[0], "Company,P/E");
  assert.equal(body[1], '"Tata Consultancy, ""TCS""",28.4');
  assert.ok(body[2].startsWith('"Line\nbreak"'), "an embedded newline must be quoted");
  assert.ok(body[2].endsWith(","), "a null must export as an empty cell, not the word null");
});

test("CSV starts with a BOM so Excel reads the rupee sign correctly", () => {
  assert.ok(toCsv([{ name: "₹", pe: 1 }], COLS).startsWith("﻿"));
});

test("CSV exports one row per record and one column per spec", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ name: `Co ${i}`, pe: i }));
  const lines = toCsv(rows, COLS).replace(/^﻿/, "").split("\r\n");
  assert.equal(lines.length, 26, "header plus every row");
  assert.equal(lines[25], "Co 24,24");
});
