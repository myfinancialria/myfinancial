// ---------------------------------------------------------------------------
// tax.js — Indian income-tax engine, FY 2025-26 (AY 2026-27).
//
// The implementation now lives in shared/tax.mjs so that the public static site
// can run the very same computation in the browser. This file stays as the
// server's import path; there is exactly one copy of the logic.
// ---------------------------------------------------------------------------
export { FY, computeRegime, compare, recommendations } from "../../shared/tax.mjs";
