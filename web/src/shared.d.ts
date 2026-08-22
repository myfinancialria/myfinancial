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
