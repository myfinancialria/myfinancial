/* ---------------------------------------------------------------------------
   The NRI search index.

   This is a search engine over a small, hand-written corpus, which makes it a
   very different problem from web search. There are ~60 answers, and the user
   already knows roughly what they want — they just do not know what it is
   called. So the work is almost entirely in the ALIASES table below.

   Someone types "195". The answer lives under s.393(2), because the section
   was renumbered on 1 April 2026, and if the search cannot bridge that gap it
   fails exactly the people it exists for. Same for "10F" → Form 41, "dubai" →
   the Gulf corridor, "PF" → EPF, "how much money can I send" → the USD 1M
   repatriation limit.

   Everything is synchronous and in-memory: the corpus is bundled, not fetched,
   so results appear on the keystroke and the surface cannot silently empty the
   way a fetch-backed one can.
--------------------------------------------------------------------------- */
import { CARDS, SECTION_MAP, FORM_MAP, CORRIDORS, TOPICS,
  type Card, type CorridorKey } from "@shared/nri.mjs";

export type DocKind = "card" | "section" | "form" | "corridor";

export interface Doc {
  id: string;
  kind: DocKind;
  title: string;
  topic: string;
  corridors: "all" | CorridorKey[];
  card?: Card;
  /** Populated for the renumbering rows, which render as their own result type. */
  map?: { old: string; now: string; what: string; type: "section" | "form" };
  corridor?: CorridorKey;
}

/* ------------------------------ the corpus -------------------------------- */

const TOPIC_LABEL = Object.fromEntries(TOPICS) as Record<string, string>;

const docs: Doc[] = [
  ...CARDS.map((c): Doc => ({
    id: c.id, kind: "card", title: c.q, topic: c.topic, corridors: c.c, card: c,
  })),
  ...SECTION_MAP.map(([old, now, what]): Doc => ({
    id: `sec-${old}`, kind: "section", title: `Section ${old} is now Section ${now}`,
    topic: "tax", corridors: "all", map: { old, now, what, type: "section" },
  })),
  ...FORM_MAP.map(([old, now, what]): Doc => ({
    id: `form-${old}`, kind: "form", title: `Form ${old} is now Form ${now}`,
    topic: "compliance", corridors: "all", map: { old, now, what, type: "form" },
  })),
  ...Object.values(CORRIDORS).map((c): Doc => ({
    id: `corridor-${c.key}`, kind: "corridor", title: `NRIs in ${c.label}`,
    topic: "residency", corridors: [c.key], corridor: c.key,
  })),
];

/* ------------------------------ tokenising -------------------------------- */

/** Keeps "10f", "393", "8938" whole — the numbers ARE the vocabulary here. */
const tokenise = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9₹%.\s-]/g, " ").split(/[\s\-.]+/)
    .map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((t) => t.length > 1 || /^\d$/.test(t));

const STOP = new Set(["the", "a", "an", "is", "are", "do", "does", "can", "i", "my", "me", "to", "of",
  "in", "on", "for", "and", "or", "it", "be", "as", "at", "if", "so", "what", "how", "when",
  "should", "will", "have", "has", "from", "with", "any", "all", "get", "there"]);

/**
 * What someone types → what the corpus calls it.
 *
 * The old→new statutory renumbering is the single biggest source of failed
 * searches, so it is expanded in BOTH directions: "195" finds 393, and "393"
 * finds the cards written around s.195's subject matter.
 */
const ALIASES: Record<string, string[]> = {
  // the renumbering, both ways
  "195": ["393", "tds", "nonresident", "withholding"], "393": ["195", "tds"],
  "10f": ["41", "trc", "treaty", "dtaa"], "41": ["10f", "trc", "treaty"],
  "67": ["44", "foreign", "credit"], "44": ["67", "foreign", "credit"],
  "15ca": ["145", "remittance"], "15cb": ["146", "remittance"],
  "145": ["15ca", "remittance"], "146": ["15cb", "remittance"],
  "87a": ["157", "rebate"], "157": ["87a", "rebate"],
  "90": ["159", "dtaa", "treaty"], "159": ["90", "dtaa"],
  "112": ["197", "capital", "gains"], "111a": ["196", "stcg"],
  "115f": ["215", "reinvest"], "115e": ["214"], "115g": ["216"],
  "26as": ["168"], "16a": ["131"], "27q": ["144"],
  // vocabulary
  usa: ["us", "america", "american"], america: ["us"], american: ["us"],
  dubai: ["uae", "gulf", "emirates"], uae: ["gulf", "emirates", "dubai"],
  abudhabi: ["uae", "gulf"], sharjah: ["uae", "gulf"],
  saudi: ["gulf"], qatar: ["gulf"], kuwait: ["gulf"], bahrain: ["gulf"], oman: ["gulf"],
  emirates: ["uae", "gulf"], middleeast: ["gulf"], gcc: ["gulf"],
  aussie: ["australia"], kiwi: ["nz", "zealand"], zealand: ["nz"],
  canadian: ["canada"], toronto: ["canada"], vancouver: ["canada"],
  // things people say vs things the statute says
  tds: ["withholding", "deducted", "deduction"],
  withholding: ["tds"], deducted: ["tds"], deduct: ["tds"],
  send: ["remit", "repatriate", "transfer"], transfer: ["remit", "repatriate"],
  remit: ["repatriate", "remittance"], repatriate: ["remittance", "repatriation"],
  money: ["funds", "amount"],
  pf: ["epf", "provident"], provident: ["epf", "ppf"],
  mf: ["mutual", "fund"], sip: ["mutual", "fund"],
  fd: ["deposit", "fixed"], deposit: ["fd"],
  flat: ["property", "house", "apartment", "real", "estate"],
  house: ["property"], apartment: ["property"], land: ["property", "agricultural"],
  sell: ["sale", "selling"], selling: ["sale"], buy: ["purchase", "buying"],
  buying: ["purchase"], purchase: ["buy"],
  tax: ["taxation", "taxable"], taxes: ["tax"], taxable: ["tax"],
  return: ["itr", "filing", "file"], itr: ["return", "filing"], file: ["filing", "return"],
  moving: ["move", "return", "returning", "relocate"],
  relocate: ["return", "returning", "move"], back: ["return", "returning"],
  retire: ["retirement", "return"], retiring: ["retirement"],
  wife: ["spouse", "family"], kids: ["children", "family"], parents: ["family"],
  will: ["succession", "estate", "inheritance"], die: ["death", "estate", "succession"],
  inherit: ["inheritance", "succession"], nominee: ["nomination", "succession"],
  // Deliberately NOT expanded into "term" and "health": they are different
  // products, and expanding one query into both makes "term insurance" rank
  // the health card first.
  insurance: ["policy", "cover"], policy: ["insurance"], cover: ["insurance"],
  visa: ["residency", "status"], greencard: ["us", "residency"],
  h1b: ["us"], h1: ["us"], l1: ["us"], oci: ["citizenship"], pio: ["oci"],
  stocks: ["equity", "shares"], shares: ["equity", "stocks"], share: ["equity"],
  demat: ["equity", "pis"], trading: ["equity", "pis"],
  crypto: ["vda"], dtaa: ["treaty", "dta"], treaty: ["dtaa"], dta: ["dtaa"],
  exempt: ["exemption", "free"], free: ["exempt"],
  save: ["saving", "reduce"], reduce: ["lower", "save"], avoid: ["save", "reduce"],
  limit: ["cap", "maximum"], cap: ["limit"], max: ["limit", "maximum"],
  rnor: ["ordinarily", "resident"], nre: ["account"], nro: ["account"],
  fatca: ["fbar", "reporting", "8938"], fbar: ["fatca", "reporting", "114"],
  pfic: ["mutual", "fund", "8621"], "8621": ["pfic"], "8938": ["fatca"],
  t1135: ["canada", "reporting"], "1135": ["t1135", "canada"],
};

const expand = (tokens: string[]): string[] => {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    for (const a of ALIASES[t] ?? []) out.add(a);
  }
  return [...out];
};

/* -------------------------------- indexing -------------------------------- */

/** token → docId → accumulated field weight. */
const index = new Map<string, Map<string, number>>();

const add = (token: string, id: string, weight: number) => {
  let m = index.get(token);
  if (!m) index.set(token, (m = new Map()));
  m.set(id, (m.get(id) ?? 0) + weight);
};

const field = (text: string | undefined, id: string, weight: number) => {
  if (!text) return;
  for (const t of tokenise(text)) if (!STOP.has(t)) add(t, id, weight);
};

for (const d of docs) {
  field(d.title, d.id, 6);
  field(TOPIC_LABEL[d.topic], d.id, 2);
  if (d.card) {
    field(d.card.tags, d.id, 4);          // the tags line is written FOR search
    field(d.card.verdict?.v, d.id, 3);
    field(d.card.a, d.id, 1.4);
    field(d.card.a2, d.id, 1);
    field((d.card.steps ?? []).join(" "), d.id, 1);
  }
  if (d.map) { field(d.map.what, d.id, 3); field(`${d.map.old} ${d.map.now}`, d.id, 8); }
  if (d.corridor) {
    const c = CORRIDORS[d.corridor];
    field(`${c.label} ${c.short}`, d.id, 6);
    field(`${c.oneLine} ${c.why}`, d.id, 1.2);
  }
}

// Rarer words should count for more, so "PFIC" outranks "tax" in a two-word
// query. With a corpus this small a plain log inverse frequency is enough.
const idf = new Map<string, number>();
for (const [token, m] of index) idf.set(token, Math.log(1 + docs.length / m.size));

const byId = new Map(docs.map((d) => [d.id, d]));

/* -------------------------------- searching ------------------------------- */

export interface Hit { doc: Doc; score: number }

export function search(query: string, corridor: CorridorKey | "all" = "all", limit = 24): Hit[] {
  const raw = tokenise(query).filter((t) => !STOP.has(t));
  if (!raw.length) return [];
  const terms = expand(raw);
  const scores = new Map<string, number>();

  for (const term of terms) {
    const weight = idf.get(term) ?? 1;
    const exact = index.get(term);
    if (exact) for (const [id, w] of exact) scores.set(id, (scores.get(id) ?? 0) + w * weight);

    // Prefix matching, so results are useful mid-word while still typing.
    // Scored well below an exact hit, or "pro" would outrank "property".
    if (term.length >= 3) {
      for (const [token, m] of index) {
        if (token !== term && token.startsWith(term)) {
          const w2 = (idf.get(token) ?? 1) * 0.35;
          for (const [id, w] of m) scores.set(id, (scores.get(id) ?? 0) + w * w2);
        }
      }
    }
  }
  if (!scores.size) return [];

  const q = query.toLowerCase().trim();
  const hits: Hit[] = [];
  for (const [id, base] of scores) {
    const doc = byId.get(id)!;
    let score = base;

    // A card whose question literally contains what was typed is the answer.
    if (doc.title.toLowerCase().includes(q) && q.length > 3) score *= 2.2;

    // Corridor relevance. A card scoped to your corridor is promoted hard; one
    // scoped to a DIFFERENT corridor is pushed down but never hidden — the US
    // PFIC warning is still worth seeing when you are about to move there.
    if (corridor !== "all" && Array.isArray(doc.corridors)) {
      score *= doc.corridors.includes(corridor) ? 1.9 : 0.28;
    }

    // Cards lead with a verdict, so they answer faster than a lookup row.
    if (doc.card?.verdict) score *= 1.12;

    hits.push({ doc, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Everything in a topic, for the browse view. */
export const byTopic = (topic: string, corridor: CorridorKey | "all" = "all"): Doc[] =>
  docs.filter((d) => d.kind === "card" && d.topic === topic)
    .filter((d) => corridor === "all" || d.corridors === "all" ||
      (Array.isArray(d.corridors) && d.corridors.includes(corridor)));

/** The questions worth surfacing before anyone has typed anything. */
export const SUGGESTED: { q: string; for?: CorridorKey }[] = [
  { q: "How many days can I stay in India?" },
  { q: "Why is my bank deducting 31.2% on NRO interest?" },
  { q: "Selling my flat — why is TDS so high?" },
  { q: "How much money can I take out of India?" },
  { q: "Is Section 195 still called that?" },
  { q: "What is RNOR?" },
  { q: "Can I invest in Indian mutual funds?", for: "us" },
  { q: "Is my PPF still earning interest?" },
  { q: "NRE or NRO — which account?" },
  { q: "Do I need to report Indian accounts?", for: "us" },
  { q: "What is the four-year exemption?", for: "nz" },
  { q: "Will Canada tax me when I leave?", for: "canada" },
  { q: "Is my Dubai TRC good enough?", for: "gulf" },
  { q: "Why does my PR date matter?", for: "australia" },
];

export const CORPUS_SIZE = docs.length;

/* ---------------------------------------------------------------------------
   Direct answers.

   The rule this obeys: NOTHING IS GENERATED. An answer is assembled out of
   sentences that already exist in the corpus, chosen because they contain the
   words that were asked about, and shown with the card they came from and the
   authority behind that card. There is no model in this path and no prose is
   written at runtime, so an answer cannot say something the corpus does not.

   The other half is admitting ignorance. A retrieval engine over sixty answers
   will always return SOMETHING, and the least-bad match rendered confidently is
   how a reference tool starts misleading people. Three outcomes are possible
   here and only one of them is an answer:

     answer   the corpus covers the question and one card clearly owns it
     partial  something related is here, but it does not squarely answer this
     none     not in the corpus — and where that is a subject deliberately out
              of scope, it says which and where to go instead
--------------------------------------------------------------------------- */
import { SOURCES, GRADES, gapFor } from "@shared/nri.mjs";

export interface SourceRef { id: string; label: string; url: string; authority: string }

export interface Answer {
  kind: "answer" | "partial" | "none";
  query: string;
  primary?: Doc;
  /** Verbatim sentences lifted from the primary card. Never paraphrased. */
  sentences: string[];
  verdict?: { v: string; tone: string };
  supporting: Doc[];
  sources: SourceRef[];
  grade: string | null;
  gradeNote?: string;
  /** How much of what was asked is actually present in the primary card, 0-1. */
  coverage: number;
  /** How far clear of the runner-up the primary is. */
  margin: number;
  gap?: { id: string; label: string; match: string; why: string; where: string } | null;
  nearest: Doc[];
  /** Query words the corpus has nothing indexed against at all. */
  unmatched: string[];
}

/** Sentence split that survives "s.393(2)", "₹1.25 lakh" and "1 April 2026". */
const sentences = (text: string): string[] =>
  text.split(/(?<=[.?!])\s+(?=[A-Z“"(])/).map((s) => s.trim()).filter(Boolean);

/**
 * How much of the question this document actually addresses.
 *
 * Measured on the RAW words typed, not the alias-expanded ones — expansion is
 * there to find candidates, and letting it also score them would make every
 * document look like it covered everything.
 */
function coverageOf(docId: string, rawTerms: string[]): { score: number; unmatched: string[] } {
  if (!rawTerms.length) return { score: 0, unmatched: [] };
  let hit = 0;
  const unmatched: string[] = [];
  for (const t of rawTerms) {
    if (index.get(t)?.has(docId)) { hit += 1; continue; }
    // An alias reaching this document counts, but only half: it means the
    // corpus talks about the same thing in different words.
    const viaAlias = (ALIASES[t] ?? []).some((a) => index.get(a)?.has(docId));
    if (viaAlias) { hit += 0.5; continue; }
    if (!index.has(t)) unmatched.push(t);
  }
  return { score: hit / rawTerms.length, unmatched };
}

const sourcesFor = (docs: Doc[]): SourceRef[] => {
  const seen = new Map<string, SourceRef>();
  for (const d of docs) {
    // A renumbering row is a statement about the Act and the Rules themselves.
    const ids = d.card?.s ?? (d.map ? ["itdNewAct", "itdForms"] : d.corridor ? ["dtaaTexts"] : []);
    for (const id of ids) {
      const s = (SOURCES as any)[id];
      if (s && !seen.has(id)) seen.set(id, { id, ...s });
    }
  }
  // Primary law first — a reader deciding what to trust should see it first.
  const rank = { primary: 0, regulator: 1, secondary: 2 } as Record<string, number>;
  return [...seen.values()].sort((a, b) => rank[a.authority] - rank[b.authority]);
};

export function answer(query: string, corridor: CorridorKey | "all" = "all"): Answer {
  const rawTerms = tokenise(query).filter((t) => !STOP.has(t));
  const hits = search(query, corridor, 12);
  const base: Answer = {
    kind: "none", query, sentences: [], supporting: [], sources: [],
    grade: null, coverage: 0, margin: 0, nearest: [], unmatched: [], gap: gapFor(query),
  };
  if (!hits.length || !rawTerms.length) return base;

  const top = hits[0];
  const { score: coverage, unmatched } = coverageOf(top.doc.id, rawTerms);
  const margin = hits[1] ? top.score / hits[1].score : 3;
  const nearest = hits.slice(0, 4).map((h) => h.doc);

  // An out-of-scope subject beats retrieval, and it has to. The corpus indexes
  // nothing against "bitcoin", but it does index "buy" and "nri" — so without
  // this, "can I buy bitcoin as an NRI" answers with the rules on agricultural
  // land, confidently and completely wrongly. If the word that carries the
  // question is a word this corpus has never heard of, and it belongs to a
  // subject we know we do not cover, that is the answer.
  const gap = base.gap;
  if (gap && unmatched.some((w) => gap.match.includes(w))) {
    return { ...base, kind: "none", gap, nearest, coverage, margin, unmatched };
  }

  // Related, but not an answer to THIS question. Better said than dressed up.
  if (coverage < 0.34) {
    return { ...base, kind: "none", nearest, coverage, margin, unmatched };
  }

  const doc = top.doc;
  let lines: string[] = [];
  if (doc.map) {
    const { old, now, what, type } = doc.map;
    const w = type === "section" ? "Section" : "Form";
    lines = [`${w} ${old} is now ${w} ${now} — ${what}`,
      "The Income-tax Act, 1961 was replaced by the Income-tax Act, 2025 on 1 April 2026. The rates did not change; the section and form numbers did."];
  } else if (doc.corridor) {
    const c = CORRIDORS[doc.corridor];
    lines = [c.oneLine, c.why];
  } else if (doc.card) {
    const pool = [...sentences(doc.card.a), ...(doc.card.a2 ? sentences(doc.card.a2) : [])];
    const wanted = new Set(rawTerms.flatMap((t) => [t, ...(ALIASES[t] ?? [])]));
    const matched = pool.filter((s) => tokenise(s).some((w) => wanted.has(w)));
    // Fall back to the card's own opening rather than inventing a summary.
    lines = (matched.length ? matched : pool).slice(0, 3);
  }

  // Supporting cards must earn their place: they have to address some of what
  // was asked too, and add a topic the primary did not already cover.
  const usedTopics = new Set([doc.topic]);
  const supporting: Doc[] = [];
  for (const h of hits.slice(1)) {
    if (supporting.length >= 2) break;
    if (coverageOf(h.doc.id, rawTerms).score < 0.5) continue;
    // Must be in the same league as the primary. A long tail of 10%-relevant
    // cards is how a short citation list turns into an unreadable one.
    if (h.score < top.score * 0.25) continue;
    if (usedTopics.has(h.doc.topic)) continue;
    usedTopics.add(h.doc.topic);
    supporting.push(h.doc);
  }

  const confident = coverage >= 0.75 || (coverage >= 0.5 && margin >= 1.2);
  // A renumbering row is read straight off the Act and the Rules.
  const grade = doc.card?.g ?? (doc.map ? "A" : null);
  return {
    ...base,
    kind: confident ? "answer" : "partial",
    primary: doc,
    sentences: lines,
    verdict: doc.card?.verdict,
    supporting,
    sources: sourcesFor([doc, ...supporting]),
    grade,
    gradeNote: grade ? (GRADES as any)[grade] : undefined,
    coverage, margin, unmatched,
    nearest: hits.slice(1, 4).map((h) => h.doc),
    gap: null,
  };
}
