/* ---------------------------------------------------------------------------
   The data layer.

   The build publishes its indexes columnar — a `fields` header plus rows of
   bare values — because repeating ~90 key names across 2,000 rows would be two
   thirds of the payload. This unpacks them once, caches the result, and hands
   the rest of the app ordinary objects.
--------------------------------------------------------------------------- */

export type Row = Record<string, any>;

export interface FieldMeta {
  k: string; l: string; g: string; u: string;
  d: number; t: "num" | "bool" | "cat" | "text"; c: boolean; h: string;
}

export interface Index {
  generated: string;
  priceDate?: string;
  navDate?: string;
  count: number;
  liveCount?: number;
  fields: string[];
  meta: FieldMeta[];
  rows: Row[];
  byKey: Record<string, FieldMeta>;
  cats: Record<string, string[]>;
}

/** /myfinancial/app/ → /myfinancial/data/ — absolute, so it works from any route. */
const DATA_BASE = import.meta.env.BASE_URL.replace(/app\/?$/, "") + "data/";

const cache = new Map<string, Promise<any>>();

function get<T>(file: string, transform: (raw: any) => T): Promise<T> {
  if (!cache.has(file)) {
    cache.set(file, fetch(DATA_BASE + file)
      .then((r) => { if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`); return r.json(); })
      .then(transform)
      .catch((e) => { cache.delete(file); throw e; }));
  }
  return cache.get(file)!;
}

function unpack(raw: any): Index {
  const rows: Row[] = raw.rows.map((arr: any[]) => {
    const o: Row = {};
    for (let i = 0; i < raw.fields.length; i++) o[raw.fields[i]] = arr[i];
    return o;
  });
  const byKey: Record<string, FieldMeta> = {};
  for (const m of raw.meta) byKey[m.k] = m;

  // Distinct values for every categorical field, so filters can offer real
  // options rather than asking the user to guess the spelling.
  const cats: Record<string, string[]> = {};
  for (const m of raw.meta as FieldMeta[]) {
    if (m.t !== "cat") continue;
    const s = new Set<string>();
    for (const r of rows) {
      const v = r[m.k];
      if (v !== null && v !== undefined && v !== "") s.add(String(v));
    }
    cats[m.k] = [...s].sort();
  }
  return { ...raw, rows, byKey, cats };
}

export const loadStocks = () => get<Index>("stocks.json", unpack);
export const loadFunds = () => get<Index>("funds.json", unpack);

export interface PatternHit {
  symbol: string; name: string; pattern: string; patternLabel: string;
  bias: "BULLISH" | "BEARISH"; status: "FORMING" | "BREAKOUT" | "BREAKDOWN";
  entry: number; stop: number; target1: number; target2: number;
  neckline: number; depthPct: number; riskReward: number;
  confirm: { volX: number; ma50: number; ma200: number; above50: boolean; above200: boolean; maAligned: boolean; score: number; grade: string };
  anchors: { i: number; t: string; price: number; label: string }[];
  bars: [string, number, number, number, number, number][];
  sma50: (number | null)[]; sma200: (number | null)[];
  company: Row; ratios: Row; peerMedians: Row | null; peerCount: number | null; peers: Row[];
}

export interface Patterns {
  generated: string; priceDate: string; detected: number; count: number;
  notes: Record<string, string>; hits: PatternHit[];
}

export const loadPatterns = () => get<Patterns>("patterns.json", (r) => r as Patterns);

/** The pre-rendered page for a company, still the canonical deep link. */
export const staticStockUrl = (symbol: string) =>
  import.meta.env.BASE_URL.replace(/app\/?$/, "") + "stock/" + encodeURIComponent(symbol) + ".html";
