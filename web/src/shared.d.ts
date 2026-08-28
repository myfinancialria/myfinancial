/* ---------------------------------------------------------------------------
   Type surface for the shared engines.

   shared/*.mjs are plain ES modules with no build step — they are imported
   unchanged by the Node server, by the static pages' browser bundles, and by
   this app. Declaring their shapes here keeps the app type-checked without
   forking them into TypeScript, which would immediately start drifting.
--------------------------------------------------------------------------- */

declare module "@shared/tax.mjs" {
  export const FY: string;

  export interface TaxProfile { residency: "RESIDENT" | "NRI"; age: number }
  export interface Income {
    salary: number; rentalAnnual: number; business: number; fnoGains: number;
    dividends: number; otherInterest: number; nroInterest: number; nreInterest: number;
    stcgEquity: number; ltcgEquity: number; ltcgOther: number;
  }
  export interface Deductions {
    sec80C: number; sec80D: number; nps80CCD1B: number; donations80G: number;
    homeLoanInterest: number; npsEmployer: number;
  }
  export interface SlabLine { band: string; rate: number; amount: number; tax: number }
  export interface TaxTotals {
    slab: number; rebate87A: number; stcg: number; ltcg: number;
    surcharge: number; surchargeRatePct: number; cess: number; total: number;
  }
  export interface RegimeResult {
    regime: "NEW" | "OLD"; fy: string;
    heads: Record<string, number>;
    deductions: Record<string, number>; deductionsTotal: number;
    slabIncome: number; slabLines: SlabLine[]; tax: TaxTotals;
    effectiveRatePct: number; totalIncome: number;
  }
  export interface Comparison { NEW: RegimeResult; OLD: RegimeResult; better: "NEW" | "OLD"; savings: number }
  export interface Suggestion { id: string; title: string; detail: string; impact: number }

  export function computeRegime(regime: "NEW" | "OLD", p: TaxProfile, inc: Income, ded: Deductions): RegimeResult;
  export function compare(p: TaxProfile, inc: Income, ded: Deductions): Comparison;
  export function recommendations(p: TaxProfile, inc: Income, ded: Deductions, cmp: Comparison, ctx?: any): Suggestion[];
}

declare module "@shared/goals.mjs" {
  export interface Alloc { equity: number; debt: number; gold: number }
  export interface GoalInput {
    name: string; targetAmount: number; targetYear: number; currentCorpus: number;
    monthlySip: number; stepUpPct: number; inflation: number; alloc: Alloc; seed?: string;
  }
  export interface Bands {
    times: number[]; p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[];
  }
  export interface GoalResult {
    years: number; months: number; inflation: number; alloc: Alloc;
    target: number; targetToday: number; median: number; p10: number; p90: number;
    feasibility: number; verdict: "ACHIEVABLE" | "AT_RISK" | "UNREALISTIC";
    shortfallAtMedian: number; bands: Bands | null;
  }
  export const ASSETS: Record<string, { mu: number; sigma: number }>;
  export function simulateGoal(g: GoalInput, opts?: { paths?: number; wantBands?: boolean }): GoalResult;
  export function requiredSip(g: GoalInput, confidence?: number): number;
  export function recommendedAlloc(yearsToGoal: number, riskBand?: string): Alloc;
  export function rebalancePrompt(current: Alloc, targetAlloc: Alloc, thresholdPct?: number): any;
}

declare module "@shared/estate.mjs" {
  export interface Beneficiary { name: string; relation: string; age: string | number }
  export interface WillAsset { type: string; description: string; beneficiary: string; sharePct: string | number }
  export interface WillData {
    fullName?: string; fatherName?: string; address?: string; city?: string;
    age?: string | number; occupation?: string;
    executor?: { name?: string; relation?: string; address?: string };
    guardian?: { name?: string; relation?: string };
    witnesses?: { name?: string; address?: string }[];
    beneficiaries?: Beneficiary[]; assets?: WillAsset[];
  }
  export interface ChecklistItem { item: string; why: string; done: boolean; manual?: boolean }
  export const WILL_STEPS: { id: string; title: string; fields: string[] }[];
  export function generateDraft(d: WillData): string;
  export function estateChecklist(opts?: {
    hasWill?: boolean; vaultCategories?: string[]; residency?: string;
  }): ChecklistItem[];
}

declare module "@shared/util.mjs" {
  export function clamp(x: number, lo: number, hi: number): number;
  export function round2(x: number): number;
  export function percentile(sorted: number[], p: number): number;
  export function rng(seedStr: string): () => number;
}

declare module "@shared/screens.mjs" {
  export interface SortSpec { f: string; dir: 1 | -1 }
  export interface ScreenDef { filters: any[]; sort: SortSpec; q?: string; cols?: string[] }
  export function encodeScreen(s: ScreenDef): string;
  export function decodeScreen(code: string): ScreenDef | null;
  export function toCsv(rows: Record<string, any>[], cols: { key: string; label: string }[]): string;
}

declare module "@shared/nri.mjs" {
  export const TAX_YEAR: string;
  export const LAW: string;

  export type CorridorKey = "us" | "canada" | "gulf" | "australia" | "nz";
  export interface Corridor {
    key: CorridorKey; label: string; short: string; flag: string;
    residents: string; oneLine: string; why: string;
    personalTax: boolean; ftc: boolean; indianFundsSafe: boolean;
    reporting: "heavy" | "medium" | "none"; ssa: boolean;
    estateRisk: "high" | "medium" | "low";
  }
  export const CORRIDORS: Record<CorridorKey, Corridor>;
  export const CORRIDOR_KEYS: CorridorKey[];

  export interface IncomeType {
    key: string; label: string; short: string;
    domestic: number; surcharge: boolean; exempt?: boolean;
    treatyRarelyHelps?: boolean; note: string;
  }
  export const INCOME_TYPES: Record<string, IncomeType>;
  export const TREATY: Record<CorridorKey, Record<string, any>>;

  export interface RatePick {
    exempt: boolean; label: string; note: string;
    domesticBase?: number; domestic: number; treaty: number | null;
    effective: number; winner: "treaty" | "domestic" | "domestic-only" | "exempt";
    saving?: number; rupees?: number; treatyNote?: string; trc?: string; rarely?: boolean;
  }
  export function surchargeRate(amount: number, isCapitalGain?: boolean): number;
  export function domesticEffective(baseRate: number, amount: number, isCapitalGain?: boolean): number;
  export function ratePick(incomeKey: string, corridor: CorridorKey, amount?: number): RatePick | null;

  export interface ResidencyStep { test: string; result: boolean; detail: string }
  export interface ResidencyResult {
    status: "NR" | "RNOR" | "ROR"; label: string;
    path: ResidencyStep[]; scope: string; tone: "up" | "warn" | "down";
  }
  export function residency(input: {
    daysThisYear?: number; daysPrior4?: number; daysPrior7?: number;
    nonResident9of10?: boolean; indianIncomeOver15L?: boolean;
    category?: "employment" | "visiting" | "other";
    indianCitizen?: boolean; liableToTaxAbroad?: boolean;
  }): ResidencyResult;

  export interface PropertyResult {
    longTerm: boolean; gain: number; taxRate: number; taxDue: number;
    tdsRate: number; tdsWithheld: number; blocked: number; blockedPct: number;
    idleMonths: number; carryCost: number; indexationDenied: boolean;
  }
  export function propertySale(input: {
    cost?: number; improvements?: number; sale?: number; months?: number; expenses?: number;
  }): PropertyResult;

  export interface RepatSource { key: string; label: string; capped: boolean | "partial"; forms: string[]; note: string }
  export const REPAT_SOURCES: Record<string, RepatSource>;
  export const REPAT_CAP_USD: number;
  export function repatriationPlan(input: { amountUsd?: number; source?: string; usedThisYearUsd?: number }): {
    source: RepatSource; capped: boolean; fits: boolean; remaining: number | null;
    overflow?: number; forms: string[]; verdict: string;
    split: { when: string; usd: number }[] | null;
  } | null;

  export const SECTION_MAP: [string, string, string][];
  export const FORM_MAP: [string, string, string][];
  export interface MatrixRow { key: string; label: string; get: (c: Corridor) => { v: string; tone: string } }
  export const MATRIX_ROWS: MatrixRow[];
  export interface TimelineStep { at: string; title: string; why: string; tone: string }
  export const RETURN_TIMELINE: TimelineStep[];

  export interface Verdict { v: string; tone: "up" | "down" | "warn" | "accent" }
  export interface Card {
    id: string; topic: string; k: "answer" | "rate" | "trap" | "flow" | "map" | "table";
    c: "all" | CorridorKey[]; q: string; a: string; a2?: string;
    verdict?: Verdict; steps?: string[]; income?: string; tags: string;
    /** Evidence grade, merged in from CARD_META. Null means ungraded, which is a build failure. */
    g: "A" | "B" | "C" | null;
    /** Source ids into SOURCES, merged in from CARD_META. */
    s: string[];
  }

  export interface Source { label: string; url: string; authority: "primary" | "regulator" | "secondary" }
  export const SOURCES: Record<string, Source>;
  export const GRADES: Record<string, string>;

  export interface Gap { id: string; label: string; match: string; why: string; where: string }
  export const NOT_COVERED: Gap[];
  export function gapFor(query: string): Gap | null;
  export const CARDS: Card[];
  export const TOPICS: [string, string][];
}

declare module "@shared/cas.mjs" {
  export interface CasTransaction {
    date: string; description: string;
    amount: number | null; units: number | null; nav: number | null; balance: number | null;
    type: string; dividendRate: number | null;
  }
  export interface CasScheme {
    name: string; isin: string | null; amc: string | null; advisor: string | null; rta: string | null;
    open: number | null; close: number | null; nav: number | null; navDate: string | null;
    valuation: number | null; valuationDate: string | null; cost: number | null;
    transactions: CasTransaction[];
  }
  export interface CasFolio { folio: string; pan: string | null; kyc: string | null; amc: string | null; schemes: CasScheme[] }
  export interface Cas {
    statement: { source: string; kind: string; from: string | null; to: string | null };
    investor: { name: string | null; email: string | null };
    folios: CasFolio[];
    meta: { source: string; kind: string; supported: boolean };
  }
  export function parseCas(lines: string[], cells?: { x: number; text: string }[][]): Cas;
  export function detect(text: string): { source: string; kind: string; supported: boolean };
  export function classifyTransaction(description: string, units: number | null): { type: string; dividendRate: number | null };
  export function cleanSchemeName(raw: string): string;
  export function parseDate(s: string): string | null;
  export function findValueColumnStart(rows: { x: number; text: string }[][]): number;
  export function isExternalFlow(type: string): boolean;
}

declare module "@shared/cas_analysis.mjs" {
  import type { Cas } from "@shared/cas.mjs";
  export interface AnalysedScheme {
    folio: string; amc: string | null; name: string; isin: string | null;
    units: number | null; nav: number | null; navDate: string | null;
    value: number | null; cost: number | null; invested: number | null; withdrawn: number | null;
    gain: number | null; gainPct: number | null; xirr: number | null;
    transactions: number; category: string | null; categoryGroup: string | null;
    schemeCode: string | null; matched: boolean;
  }
  export interface Analysis {
    asOf: string | null;
    totals: {
      schemes: number; folios: number; value: number | null; cost: number | null;
      invested: number | null; withdrawn: number | null; gain: number | null;
      gainPct: number | null; xirr: number | null; matched: number;
    };
    schemes: AnalysedScheme[];
    allocation: { group: string; value: number; pct: number | null }[];
    lookThrough: {
      coveredValue: number | null; coveragePct: number | null; distinct: number;
      stocks: { symbol: string; name: string; sector: string | null; value: number; funds: number; pctOfPortfolio: number | null }[];
    };
  }
  export function analyse(cas: Cas, ctx?: { funds?: Map<string, any>; holdings?: Map<string, any> }): Analysis;
  export function xirr(flows: { date: string; amount: number }[], opts?: any): number | null;
  export function schemeCashflows(scheme: any, asOf: string | null): { date: string; amount: number }[];
}

declare module "@shared/shims.mjs" {
  /** Installs stand-ins for platform APIs pdf.js needs; returns what it added. */
  export function installShims(scope?: any): string[];
}
