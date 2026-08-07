// ---------------------------------------------------------------------------
// db.js — SQLite persistence (node:sqlite, zero external deps).
// Holds client financial context: profile, cashflow ledger, balance sheet,
// insurance, goals, holdings, encrypted vault, wills, sessions, chat history.
// ---------------------------------------------------------------------------
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { uid } from "./util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "var");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "myfinancial.db"));

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT,
  residency TEXT CHECK(residency IN ('RESIDENT','NRI')) DEFAULT 'RESIDENT',
  country TEXT DEFAULT 'IN', currency TEXT DEFAULT 'INR',
  segment TEXT DEFAULT 'RETAIL',          -- RETAIL | HNI
  age INTEGER, retirement_age INTEGER DEFAULT 60, dependents INTEGER DEFAULT 0,
  risk_tolerance TEXT DEFAULT 'MODERATE', -- CONSERVATIVE|MODERATE|AGGRESSIVE (self-declared)
  risk_score INTEGER,                     -- 1..100 from robo questionnaire
  tax_regime TEXT DEFAULT 'NEW',          -- NEW | OLD (preference)
  meta TEXT DEFAULT '{}', created INTEGER
);

CREATE TABLE IF NOT EXISTS cashflow (
  id TEXT PRIMARY KEY, user_id TEXT, kind TEXT CHECK(kind IN ('INCOME','EXPENSE')),
  category TEXT, label TEXT, monthly REAL, meta TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, user_id TEXT, class TEXT, label TEXT, value REAL, meta TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS liabilities (
  id TEXT PRIMARY KEY, user_id TEXT, type TEXT, label TEXT,
  outstanding REAL, emi REAL, rate REAL, months_left INTEGER
);

CREATE TABLE IF NOT EXISTS insurance (
  id TEXT PRIMARY KEY, user_id TEXT, type TEXT, label TEXT, cover REAL, premium REAL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY, user_id TEXT, name TEXT, icon TEXT,
  target_amount REAL, target_year INTEGER, priority TEXT DEFAULT 'HIGH',
  inflation REAL DEFAULT 0.06, current_corpus REAL DEFAULT 0, monthly_sip REAL DEFAULT 0,
  alloc TEXT DEFAULT '{"equity":0.6,"debt":0.3,"gold":0.1}'
);

CREATE TABLE IF NOT EXISTS holdings_mf (
  id TEXT PRIMARY KEY, user_id TEXT, fund_code TEXT, units REAL, avg_nav REAL, sip_monthly REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS holdings_eq (
  id TEXT PRIMARY KEY, user_id TEXT, symbol TEXT, qty REAL, avg_price REAL
);

CREATE TABLE IF NOT EXISTS vault_docs (
  id TEXT PRIMARY KEY, user_id TEXT, name TEXT, category TEXT, mime TEXT,
  size INTEGER, iv TEXT, tag TEXT, ciphertext BLOB, created INTEGER
);

CREATE TABLE IF NOT EXISTS wills (
  id TEXT PRIMARY KEY, user_id TEXT, data TEXT, draft TEXT, updated INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT, created INTEGER, expires INTEGER
);

CREATE TABLE IF NOT EXISTS chat_history (
  id TEXT PRIMARY KEY, user_id TEXT, role TEXT, content TEXT, meta TEXT DEFAULT '{}', created INTEGER
);

CREATE TABLE IF NOT EXISTS baskets (
  id TEXT PRIMARY KEY, user_id TEXT, goal_id TEXT, name TEXT, created INTEGER,
  band TEXT, years REAL, alloc TEXT DEFAULT '{}', holdings TEXT DEFAULT '[]',
  monthly_sip REAL DEFAULT 0, invested REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS articles (
  slug TEXT PRIMARY KEY, title TEXT, meta_description TEXT, keywords TEXT,
  category TEXT, body_md TEXT, faq TEXT DEFAULT '[]',
  generator TEXT DEFAULT 'grounded-composer',      -- or 'aimlapi:<model>'
  created INTEGER, updated INTEGER
);
`);

// ------------------------------- helpers -----------------------------------

export const q = {
  one: (sql, ...args) => db.prepare(sql).get(...args),
  all: (sql, ...args) => db.prepare(sql).all(...args),
  run: (sql, ...args) => db.prepare(sql).run(...args),
};

export function insert(table, obj) {
  const keys = Object.keys(obj);
  const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
  db.prepare(sql).run(...keys.map((k) => obj[k]));
  return obj;
}

// ------------------------------ demo seed ----------------------------------
// Two personas that exercise the Resident vs NRI product surface end-to-end.

export function seedIfEmpty() {
  const n = q.one("SELECT COUNT(*) AS c FROM users").c;
  if (n > 0) return;

  const now = Date.now();

  // ── Persona 1: Resident HNI — Arjun Mehta, 38, Mumbai, salaried + ESOPs ──
  insert("users", {
    id: "u_arjun", email: "arjun.mehta@example.in", name: "Arjun Mehta",
    residency: "RESIDENT", country: "IN", currency: "INR", segment: "HNI",
    age: 38, retirement_age: 55, dependents: 2, risk_tolerance: "AGGRESSIVE",
    risk_score: null, tax_regime: "NEW",
    meta: JSON.stringify({ city: "Mumbai", occupation: "VP Engineering, listed tech co", pan: "AXXPM1234X", maritalStatus: "Married" }),
    created: now,
  });
  const cfA = [
    ["INCOME", "SALARY", "Salary (gross)", 708333, { annual: 8500000 }],
    ["INCOME", "RENTAL", "Rental — Pune flat", 45000, {}],
    ["INCOME", "DIVIDEND", "Dividends", 12500, { annual: 150000 }],
    ["INCOME", "CAPITAL_GAINS", "Trading income (F&O, avg.)", 66667, { annual: 800000 }],
    ["EXPENSE", "FIXED", "Household & utilities", 145000, {}],
    ["EXPENSE", "FIXED", "Kids' school fees", 60000, {}],
    ["EXPENSE", "FIXED", "EMIs (auto-listed from loans)", 0, { computed: true }],
    ["EXPENSE", "VARIABLE", "Lifestyle, travel & dining", 85000, {}],
    ["EXPENSE", "DISCRETIONARY", "Gadgets / club / misc", 40000, {}],
  ];
  for (const [kind, category, label, monthly, meta] of cfA)
    insert("cashflow", { id: uid("cf"), user_id: "u_arjun", kind, category, label, monthly, meta: JSON.stringify(meta) });

  const assetsA = [
    ["REAL_ESTATE", "Primary residence — Powai", 32500000],
    ["REAL_ESTATE", "Rental flat — Pune", 11000000],
    ["EQUITY", "Direct equity portfolio", 0],           // valued live from holdings_eq
    ["MUTUAL_FUND", "Direct MF portfolio", 0],          // valued live from holdings_mf
    ["EPF", "EPF corpus", 4800000],
    ["PPF", "PPF (self)", 1650000],
    ["NPS", "NPS Tier-1", 1240000],
    ["GOLD", "Gold (SGB + jewellery)", 2100000],
    ["CASH", "Savings & FDs", 3500000],
    ["ESOP", "Unvested ESOPs (vested value)", 6500000],
  ];
  for (const [cls, label, value] of assetsA)
    insert("assets", { id: uid("as"), user_id: "u_arjun", class: cls, label, value, meta: "{}" });

  insert("liabilities", { id: uid("lb"), user_id: "u_arjun", type: "HOME_LOAN", label: "Home loan — Powai (HDFC)", outstanding: 14800000, emi: 131000, rate: 8.6, months_left: 174 });
  insert("liabilities", { id: uid("lb"), user_id: "u_arjun", type: "VEHICLE_LOAN", label: "Car loan — XUV700", outstanding: 900000, emi: 28500, rate: 9.2, months_left: 34 });
  insert("liabilities", { id: uid("lb"), user_id: "u_arjun", type: "CREDIT_CARD", label: "Credit cards (revolving)", outstanding: 180000, emi: 180000, rate: 42, months_left: 1 });

  insert("insurance", { id: uid("in"), user_id: "u_arjun", type: "TERM", label: "Term life — HDFC Click2Protect", cover: 20000000, premium: 32000 });
  insert("insurance", { id: uid("in"), user_id: "u_arjun", type: "HEALTH", label: "Family floater — Niva Bupa", cover: 2500000, premium: 41000 });

  const goalsA = [
    ["Retirement at 55", "🏖️", 90000000, 2043, "HIGH", 0.045, 15000000, 220000, { equity: 0.65, debt: 0.25, gold: 0.10 }],
    ["Kids' foreign education", "🎓", 12000000, 2038, "HIGH", 0.08, 4500000, 90000, { equity: 0.60, debt: 0.35, gold: 0.05 }],
    ["Beach house — Alibaug", "🏠", 30000000, 2033, "MEDIUM", 0.06, 2500000, 50000, { equity: 0.55, debt: 0.40, gold: 0.05 }],
    ["Europe sabbatical", "✈️", 4000000, 2030, "LOW", 0.05, 1500000, 55000, { equity: 0.40, debt: 0.55, gold: 0.05 }],
  ];
  for (const [name, icon, amt, yr, pr, inf, corpus, sip, alloc] of goalsA)
    insert("goals", { id: uid("gl"), user_id: "u_arjun", name, icon, target_amount: amt, target_year: yr, priority: pr, inflation: inf, current_corpus: corpus, monthly_sip: sip, alloc: JSON.stringify(alloc) });

  const mfA = [
    ["MF014", 5200, 62.4, 50000],  // Parag Parikh Flexi
    ["MF006", 3100, 128.0, 30000], // HDFC Midcap
    ["MF010", 2050, 118.0, 25000], // Nippon Small Cap
    ["MF021", 9800, 128.0, 40000], // UTI Nifty 50
    ["MF030", 42000, 24.1, 30000], // ICICI Corp Bond
    ["MF019", 900, 310.0, 12500],  // Quant ELSS
  ];
  for (const [code, units, nav, sip] of mfA)
    insert("holdings_mf", { id: uid("hm"), user_id: "u_arjun", fund_code: code, units, avg_nav: nav, sip_monthly: sip });

  const eqA = [
    ["RELIANCE", 400, 2410], ["HDFCBANK", 800, 1495], ["TCS", 250, 3620],
    ["BAJFINANCE", 150, 6480], ["LT", 300, 2890], ["TITAN", 220, 2950],
    ["HAL", 350, 3120], ["DIXON", 40, 9800], ["ITC", 2400, 372], ["SUNPHARMA", 500, 1380],
  ];
  for (const [symbol, qty, avg] of eqA)
    insert("holdings_eq", { id: uid("he"), user_id: "u_arjun", symbol, qty, avg_price: avg });

  // ── Persona 2: NRI — Meera Krishnan, 34, Dubai (UAE), consultant ─────────
  insert("users", {
    id: "u_meera", email: "meera.krishnan@example.ae", name: "Meera Krishnan",
    residency: "NRI", country: "AE", currency: "AED", segment: "RETAIL",
    age: 34, retirement_age: 58, dependents: 1, risk_tolerance: "MODERATE",
    risk_score: null, tax_regime: "NEW",
    meta: JSON.stringify({ city: "Dubai", occupation: "Management Consultant", pan: "BXXPK5678Y", maritalStatus: "Married", nriSince: 2019, dtaaCountry: "UAE", accounts: { NRE: "ICICI NRE ****4410", NRO: "HDFC NRO ****2216" } }),
    created: now,
  });
  const cfM = [
    ["INCOME", "SALARY", "Salary (Dubai, tax-free locally)", 550000, { currency: "AED", amountFx: 23000 }],
    ["INCOME", "RENTAL", "Rental — Chennai flat (NRO)", 32000, { nro: true, tdsApplies: true }],
    ["INCOME", "DIVIDEND", "Dividends — Indian equities (NRO)", 6000, { nro: true }],
    ["EXPENSE", "FIXED", "Dubai rent & living", 260000, { currency: "AED" }],
    ["EXPENSE", "VARIABLE", "Family support (India)", 40000, {}],
    ["EXPENSE", "DISCRETIONARY", "Travel & lifestyle", 55000, {}],
  ];
  for (const [kind, category, label, monthly, meta] of cfM)
    insert("cashflow", { id: uid("cf"), user_id: "u_meera", kind, category, label, monthly, meta: JSON.stringify(meta) });

  const assetsM = [
    ["REAL_ESTATE", "Chennai flat (rented)", 9500000],
    ["MUTUAL_FUND", "Direct MF portfolio (NRE)", 0],
    ["EQUITY", "Indian equities (PIS)", 0],
    ["CASH", "NRE fixed deposits", 4200000],
    ["CASH", "NRO savings", 850000],
    ["GOLD", "Gold", 900000],
    ["INTL", "Dubai savings & investments", 5200000],
  ];
  for (const [cls, label, value] of assetsM)
    insert("assets", { id: uid("as"), user_id: "u_meera", class: cls, label, value, meta: "{}" });

  insert("liabilities", { id: uid("lb"), user_id: "u_meera", type: "HOME_LOAN", label: "Home loan — Chennai (SBI NRI)", outstanding: 4100000, emi: 42000, rate: 8.9, months_left: 132 });

  insert("insurance", { id: uid("in"), user_id: "u_meera", type: "TERM", label: "Term life — LIC (NRI plan)", cover: 10000000, premium: 21000 });
  insert("insurance", { id: uid("in"), user_id: "u_meera", type: "HEALTH", label: "India health cover (parents visit)", cover: 1000000, premium: 18000 });

  const goalsM = [
    ["Retirement (India return)", "🏖️", 40000000, 2050, "HIGH", 0.045, 4000000, 90000, { equity: 0.60, debt: 0.30, gold: 0.10 }],
    ["Child's education", "🎓", 10000000, 2040, "HIGH", 0.08, 2600000, 60000, { equity: 0.65, debt: 0.30, gold: 0.05 }],
    ["Bengaluru apartment", "🏠", 12000000, 2032, "MEDIUM", 0.06, 5500000, 100000, { equity: 0.45, debt: 0.50, gold: 0.05 }],
  ];
  for (const [name, icon, amt, yr, pr, inf, corpus, sip, alloc] of goalsM)
    insert("goals", { id: uid("gl"), user_id: "u_meera", name, icon, target_amount: amt, target_year: yr, priority: pr, inflation: inf, current_corpus: corpus, monthly_sip: sip, alloc: JSON.stringify(alloc) });

  const mfM = [
    ["MF002", 4800, 74.0, 30000],
    ["MF014", 3600, 66.2, 30000],
    ["MF007", 1900, 96.5, 20000],
    ["MF028", 5200, 402.0, 0],
    ["MF031", 60000, 26.8, 0],
  ];
  for (const [code, units, nav, sip] of mfM)
    insert("holdings_mf", { id: uid("hm"), user_id: "u_meera", fund_code: code, units, avg_nav: nav, sip_monthly: sip });

  const eqM = [
    ["ICICIBANK", 500, 1010], ["INFY", 300, 1520], ["BHARTIARTL", 400, 1180], ["TITAN", 100, 3120],
  ];
  for (const [symbol, qty, avg] of eqM)
    insert("holdings_eq", { id: uid("he"), user_id: "u_meera", symbol, qty, avg_price: avg });
}
