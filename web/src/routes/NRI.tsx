import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  CORRIDORS, CORRIDOR_KEYS, INCOME_TYPES, TREATY, TOPICS, MATRIX_ROWS, RETURN_TIMELINE,
  SECTION_MAP, FORM_MAP, REPAT_SOURCES, REPAT_CAP_USD, TAX_YEAR, LAW,
  ratePick, residency, propertySale, repatriationPlan,
  type CorridorKey,
} from "@shared/nri.mjs";
import { search, byTopic, SUGGESTED, CORPUS_SIZE, type Doc, type Hit } from "../lib/nri";
import { Card, CardHead, Chip, Label, Button, Tile } from "../components/ui";
import { Reveal, Stagger, StaggerItem } from "../components/motion";
import { nf } from "../lib/format";

/* ---------------------------------------------------------------------------
   NRI — a search engine over cross-border Indian money.

   The design problem here is not "show the documents". Someone asking whether
   their bank is over-deducting does not want a page about withholding; they
   want the number, the number it should be, and the gap between them. So every
   result renders as the SHAPE of its answer:

     a rate question  → two bars, and the rupees the gap is worth on your amount
     a yes/no         → a verdict, then the reason
     a process        → numbered steps
     a renumbering    → old on the left, new on the right
     a comparison     → a matrix you can read across

   Four calculators sit alongside the search, because some questions cannot be
   answered by an article at all — they need your dates and your numbers. Each
   imports @shared/nri.mjs, so a calculator and an answer card can never
   disagree about a rate.

   Nothing typed here is sent anywhere.
--------------------------------------------------------------------------- */

const TONE: Record<string, string> = {
  up: "text-up", down: "text-down", warn: "text-warn", accent: "text-accent", neutral: "text-ink-dim",
};
const BORDER: Record<string, string> = {
  up: "border-up/45", down: "border-down/45", warn: "border-warn/45", accent: "border-accent/45", neutral: "border-line-2",
};
const FILL: Record<string, string> = {
  up: "bg-up", down: "bg-down", warn: "bg-warn", accent: "bg-accent", neutral: "bg-ink-faint",
};

/** ₹ in Indian units — a property figure is unreadable in raw digits. */
const rupees = (v: number) => {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${nf(v / 1e7, 2)} cr`;
  if (a >= 1e5) return `₹${nf(v / 1e5, 2)} L`;
  return `₹${nf(v, 0)}`;
};
const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/* ============================ viz primitives ============================== */

/** A proportional bar. The whole point of the results being graphical. */
function Bar({ value, max, tone = "neutral", label, right, strike, delay = 0 }: {
  value: number; max: number; tone?: string; label: string; right: string;
  strike?: boolean; delay?: number;
}) {
  const pct = max > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-[11.5px] ${strike ? "text-ink-faint line-through" : "text-ink-dim"}`}>{label}</span>
        <span className={`tnum text-[13px] font-semibold ${strike ? "text-ink-faint line-through" : TONE[tone]}`}>{right}</span>
      </div>
      <div className="h-2 w-full bg-line/70">
        <motion.div
          className={`h-2 ${FILL[tone]} ${strike ? "opacity-40" : ""}`}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

/** The USD 1M repatriation bucket, drawn as a bucket. */
function Gauge({ used, adding, cap }: { used: number; adding: number; cap: number }) {
  const u = Math.min(100, (used / cap) * 100);
  const a = Math.min(100 - u, (adding / cap) * 100);
  const over = Math.max(0, used + adding - cap);
  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden border border-line-2 bg-paper">
        <motion.div className="h-full bg-ink-faint/60" initial={{ width: 0 }} animate={{ width: `${u}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
        <motion.div className={`h-full ${over ? "bg-down" : "bg-up"}`} initial={{ width: 0 }} animate={{ width: `${a}%` }}
          transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-faint">
        <span>{usd(used)} already used</span>
        <span>cap {usd(cap)} / financial year</span>
      </div>
    </div>
  );
}

/** Domestic vs treaty, side by side, with the winner called. */
function RateCompare({ incomeKey, corridor, amount }: {
  incomeKey: string; corridor: CorridorKey; amount: number;
}) {
  const p = ratePick(incomeKey, corridor, amount);
  if (!p) return null;
  if (p.exempt) {
    return (
      <div className="border border-up/40 bg-up/5 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-semibold text-up">Exempt in India</span>
          <span className="tnum text-[19px] font-bold text-up">0%</span>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-dim">{p.note}</p>
      </div>
    );
  }
  const max = Math.max(p.domestic, p.treaty ?? 0);
  const treatyWins = p.winner === "treaty";
  return (
    <div className="space-y-3">
      <Bar label="India's domestic rate (with surcharge and cess)" tone={treatyWins ? "neutral" : "accent"}
        value={p.domestic} max={max} right={`${nf(p.domestic, 1)}%`} strike={treatyWins} />
      {p.treaty !== null ? (
        <Bar label={`Treaty ceiling — ${CORRIDORS[corridor].label}`} tone={treatyWins ? "up" : "neutral"}
          value={p.treaty} max={max} right={`${nf(p.treaty, 1)}%`} strike={!treatyWins} delay={0.12} />
      ) : (
        <div className="text-[11.5px] text-ink-faint">No separate treaty rate applies to this stream.</div>
      )}
      <div className={`flex flex-wrap items-baseline justify-between gap-2 border px-3.5 py-2.5
        ${treatyWins ? "border-up/40 bg-up/5" : "border-warn/40 bg-warn/5"}`}>
        <div className="text-[11.5px]">
          <span className={`font-semibold ${treatyWins ? "text-up" : "text-warn"}`}>
            {treatyWins ? "The treaty wins." : "The treaty is worse — take the domestic rate."}
          </span>{" "}
          <span className="text-ink-dim">You pay <b className="tnum text-ink">{nf(p.effective, 1)}%</b>.</span>
        </div>
        {treatyWins && (
          <div className="tnum text-[12px] text-up">
            saves {rupees(p.rupees ?? 0)} on {rupees(amount)}
          </div>
        )}
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-dim">{p.note}</p>
      {treatyWins && p.trc && (
        <p className="text-[11.5px] leading-relaxed text-ink-faint">
          <b className="text-ink-dim">To get it:</b> {p.trc}, plus Form 41 filed on the e-filing portal — given to the
          payer <i>before</i> the income is credited.
        </p>
      )}
    </div>
  );
}

/* ============================== result cards ============================== */

const VerdictTag = ({ v, tone }: { v: string; tone: string }) => (
  <span className={`inline-block border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]
    ${BORDER[tone]} ${TONE[tone]}`}>{v}</span>
);

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-3 space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center border border-line-2 font-mono text-[10px] text-ink-dim">
            {i + 1}
          </span>
          <span className="text-[12.5px] leading-relaxed text-ink-dim">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * One answer.
 *
 * The header is a button so the whole row is the hit target — which means the
 * ink colour has to be set on it explicitly. A button does not inherit the
 * page colour, and the failure is quiet: the heading renders in the browser
 * default and ends up dimmer than the body text underneath it.
 */
function ResultCard({ doc, corridor, amount, open, onToggle }: {
  doc: Doc; corridor: CorridorKey | "all"; amount: number; open: boolean; onToggle: () => void;
}) {
  /* the renumbering rows — old on the left, new on the right */
  if (doc.map) {
    const { old, now, what, type } = doc.map;
    return (
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Label>{type === "section" ? "Renumbered section" : "Renumbered form"}</Label>
          <div className="flex items-center gap-3">
            <span className="tnum text-[15px] text-ink-faint line-through">{type === "section" ? "s." : "Form "}{old}</span>
            <span className="text-ink-faint">→</span>
            <span className="tnum text-[17px] font-bold text-accent">{type === "section" ? "s." : "Form "}{now}</span>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">{what}</p>
      </Card>
    );
  }

  /* a corridor overview */
  if (doc.corridor) {
    const c = CORRIDORS[doc.corridor];
    return (
      <Card className="px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="text-[18px]">{c.flag}</span>
          <h3 className="text-[14px] font-semibold tracking-tight">NRIs in {c.label}</h3>
          <Chip>{c.residents}</Chip>
        </div>
        <p className="mt-2 text-[13px] font-medium text-ink">{c.oneLine}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">{c.why}</p>
      </Card>
    );
  }

  const card = doc.card!;
  const tone = card.verdict?.tone ?? (card.k === "trap" ? "warn" : "neutral");
  const scope = card.c === "all" ? null : (card.c as CorridorKey[]);

  return (
    <Card className={card.k === "trap" ? "border-warn/30" : ""}>
      <button onClick={onToggle} className="block w-full px-5 py-4 text-left text-ink">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h3 className="max-w-[58ch] text-[14px] font-semibold leading-snug tracking-tight">{card.q}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {scope?.map((k) => <Chip key={k}>{CORRIDORS[k].flag} {CORRIDORS[k].short}</Chip>)}
            {card.verdict && <VerdictTag v={card.verdict.v} tone={tone} />}
          </div>
        </div>
        <p className={`mt-2 text-[12.5px] leading-relaxed text-ink-dim ${open ? "" : "line-clamp-2"}`}>{card.a}</p>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-line px-5 py-4">
              {card.steps && <Steps steps={card.steps} />}
              {card.a2 && <p className="text-[12.5px] leading-relaxed text-ink-dim">{card.a2}</p>}
              {card.income && corridor !== "all" && (
                <RateCompare incomeKey={card.income} corridor={corridor} amount={amount} />
              )}
              {card.income && corridor === "all" && (
                <div className="border border-line-2 bg-paper-3/50 px-3.5 py-2.5 text-[11.5px] text-ink-dim">
                  Pick a corridor above to see this rate compared against your treaty, with the rupee difference.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* =============================== inputs =================================== */

function Num({ label, value, onChange, hint, step, suffix }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string; step?: number; suffix?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="relative mt-1.5">
        <input type="number" value={value} step={step}
          onChange={(e) => onChange(Number(e.target.value || 0))}
          className="w-full border border-line-2 bg-paper px-3 py-2 text-[13px] text-ink tnum outline-none transition-colors focus:border-ink" />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-faint">{suffix}</span>}
      </div>
      {hint && <div className="mt-1 text-[10.5px] leading-snug text-ink-faint">{hint}</div>}
    </label>
  );
}

function Pick({ label, value, onChange, options, hint }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]; hint?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full border border-line-2 bg-paper px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-ink">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {hint && <div className="mt-1 text-[10.5px] leading-snug text-ink-faint">{hint}</div>}
    </label>
  );
}

const YesNo = ({ label, value, onChange, hint }: {
  label: string; value: boolean; onChange: (v: boolean) => void; hint?: string;
}) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-1.5 flex gap-1.5">
      <Button active={value} onClick={() => onChange(true)}>Yes</Button>
      <Button active={!value} onClick={() => onChange(false)}>No</Button>
    </div>
    {hint && <div className="mt-1 text-[10.5px] leading-snug text-ink-faint">{hint}</div>}
  </div>
);

/* ========================== tool · residency ============================== */

function ResidencyWizard() {
  const [s, set] = useState({
    daysThisYear: 45, daysPrior4: 120, daysPrior7: 200,
    nonResident9of10: true, indianIncomeOver15L: false,
    category: "employment", indianCitizen: true, liableToTaxAbroad: true,
  });
  const upd = (p: Partial<typeof s>) => set({ ...s, ...p });
  const r = useMemo(() => residency({ ...s, category: s.category as any }), [s]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
      <Card>
        <CardHead title="Your days in India" sub="Both the arrival day and the departure day count." />
        <div className="space-y-4 p-5">
          <Num label="Days in India this tax year" value={s.daysThisYear} onChange={(v) => upd({ daysThisYear: v })}
            hint="1 April 2026 to 31 March 2027" />
          <Num label="Days across the 4 preceding tax years" value={s.daysPrior4} onChange={(v) => upd({ daysPrior4: v })}
            hint="365 or more opens the second test" />
          <Num label="Days across the 7 preceding tax years" value={s.daysPrior7} onChange={(v) => upd({ daysPrior7: v })}
            hint="729 or fewer keeps you in RNOR" />
          <Pick label="Which describes you" value={s.category} onChange={(v) => upd({ category: v })}
            options={[["employment", "Indian citizen who left India for employment abroad"],
                      ["visiting", "Citizen or person of Indian origin visiting India"],
                      ["other", "Neither"]]} />
          <YesNo label="Indian-source income above ₹15 lakh?" value={s.indianIncomeOver15L}
            onChange={(v) => upd({ indianIncomeOver15L: v })}
            hint="Above this, a visitor's threshold drops from 182 days to 120." />
          <YesNo label="Non-resident in 9 of the last 10 years?" value={s.nonResident9of10}
            onChange={(v) => upd({ nonResident9of10: v })} />
          <YesNo label="Indian citizen?" value={s.indianCitizen} onChange={(v) => upd({ indianCitizen: v })}
            hint="An OCI holder with foreign citizenship is outside the deemed-residency rule." />
          <YesNo label="Liable to tax in your country of residence?" value={s.liableToTaxAbroad}
            onChange={(v) => upd({ liableToTaxAbroad: v })}
            hint="A zero-tax country still counts if you are tax-resident there with a treaty TRC." />
        </div>
      </Card>

      <div className="space-y-5">
        <Card className={BORDER[r.tone]}>
          <div className="p-6">
            <Label>Your residential status for tax year {TAX_YEAR}</Label>
            <AnimatePresence mode="wait">
              <motion.div key={r.status}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}>
                <div className={`mt-2 text-[34px] font-bold leading-none tracking-tight ${TONE[r.tone]}`}>{r.status}</div>
                <div className="mt-1.5 text-[13px] text-ink-dim">{r.label}</div>
              </motion.div>
            </AnimatePresence>
            <p className="mt-4 max-w-[70ch] border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-dim">{r.scope}</p>
          </div>
        </Card>

        <Card>
          <CardHead title="How it was decided" sub="Each statutory test, in the order s.6 applies them." />
          <div className="divide-y divide-line">
            {r.path.map((p, i) => (
              <div key={i} className="flex gap-3.5 px-5 py-3.5">
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border text-[11px] leading-none
                  ${p.result ? "border-up/50 text-up" : "border-line-2 text-ink-faint"}`}>
                  {p.result ? "✓" : "✗"}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold">{p.test}</div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-ink-dim">{p.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ========================= tool · withholding ============================= */

function WithholdingExplorer({ corridor, setCorridor }: {
  corridor: CorridorKey; setCorridor: (c: CorridorKey) => void;
}) {
  const [incomeKey, setIncome] = useState("nroInterest");
  const [amount, setAmount] = useState(5000000);
  const keys = Object.keys(INCOME_TYPES);

  return (
    <div className="space-y-5">
      <Card>
        <CardHead title="What India actually withholds, and what the treaty caps it at"
          sub="Section 159 gives you whichever is more beneficial — compared per income stream, never blanket." />
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div className="space-y-4">
            <div>
              <Label>Income stream</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {keys.map((k) => (
                  <Button key={k} active={incomeKey === k} onClick={() => setIncome(k)}>
                    {INCOME_TYPES[k].short}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Country of residence</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CORRIDOR_KEYS.map((k) => (
                  <Button key={k} active={corridor === k} onClick={() => setCorridor(k)}>
                    {CORRIDORS[k].flag} {CORRIDORS[k].short}
                  </Button>
                ))}
              </div>
            </div>
            <Num label="Amount of that income, a year" value={amount} onChange={setAmount} step={100000}
              hint="Drives the surcharge band and the rupee difference." />
          </div>
          <div className="border border-line bg-paper-3/40 p-5">
            <RateCompare incomeKey={incomeKey} corridor={corridor} amount={amount} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Every stream, every corridor"
          sub="The rate an individual NRI actually pays — the lower of India's own rate and the treaty ceiling." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-faint">Income</th>
                {CORRIDOR_KEYS.map((k) => (
                  <th key={k} className="px-4 py-2.5 text-right font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-faint">
                    {CORRIDORS[k].flag} {CORRIDORS[k].short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((ik) => (
                <tr key={ik} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 text-ink-dim">{INCOME_TYPES[ik].label}</td>
                  {CORRIDOR_KEYS.map((ck) => {
                    const p = ratePick(ik, ck, amount)!;
                    const treaty = p.winner === "treaty";
                    return (
                      <td key={ck} className="px-4 py-2.5 text-right">
                        <span className={`tnum font-semibold ${p.exempt ? "text-up" : treaty ? "text-up" : "text-ink"}`}>
                          {p.exempt ? "exempt" : `${nf(p.effective, 1)}%`}
                        </span>
                        {!p.exempt && (
                          <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">
                            {treaty ? "treaty" : "domestic"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
          Domestic figures carry surcharge and 4% cess; a treaty ceiling does not — the rate in the article is the whole
          tax, which is why a 15% treaty rate beats a 30% domestic rate by much more than half. Where a treaty column
          reads <span className="text-ink-dim">domestic</span>, the treaty is the worse of the two: the lower dividend
          figure people quote is for a company holding 10% or more of the payer, not for an individual.
          {TREATY[corridor]?.note && <> <span className="text-ink-dim">{TREATY[corridor].note}</span></>}
        </div>
      </Card>
    </div>
  );
}

/* ========================== tool · property sale ========================== */

function PropertyCalc() {
  const [s, set] = useState({ cost: 4000000, improvements: 0, expenses: 200000, sale: 12000000, months: 150 });
  const upd = (p: Partial<typeof s>) => set({ ...s, ...p });
  const r = useMemo(() => propertySale(s), [s]);
  const max = Math.max(r.tdsWithheld, r.taxDue, 1);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
      <Card>
        <CardHead title="Your sale" sub="Nothing typed here leaves this browser." />
        <div className="space-y-4 p-5">
          <Num label="What you paid for it" value={s.cost} onChange={(v) => upd({ cost: v })} step={100000} />
          <Num label="Cost of improvements" value={s.improvements} onChange={(v) => upd({ improvements: v })} step={50000} />
          <Num label="Sale price" value={s.sale} onChange={(v) => upd({ sale: v })} step={100000} />
          <Num label="Transfer expenses" value={s.expenses} onChange={(v) => upd({ expenses: v })} step={25000}
            hint="Brokerage, legal, stamp costs of the sale." />
          <Num label="Months held" value={s.months} onChange={(v) => upd({ months: v })} suffix="months"
            hint="More than 24 months is long-term." />
        </div>
      </Card>

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile label="Your gain" value={rupees(r.gain)} sub={r.longTerm ? "Long-term" : "Short-term"} />
          <Tile label="Tax actually due" value={rupees(r.taxDue)} sub={`${r.taxRate}% + surcharge + cess`} />
          <Tile label="TDS the buyer withholds" value={rupees(r.tdsWithheld)}
            sub={`${nf(r.tdsRate, 2)}% of the SALE PRICE`} tone="text-warn" />
        </div>

        <Card>
          <CardHead title="Why the buyer withholds so much more than you owe"
            sub="For an NRI seller, TDS is computed on the whole consideration — not on the gain." />
          <div className="space-y-4 p-5">
            <Bar label="Tax you actually owe on the gain" tone="up" value={r.taxDue} max={max} right={rupees(r.taxDue)} />
            <Bar label="TDS deducted from your sale proceeds" tone="warn" value={r.tdsWithheld} max={max}
              right={rupees(r.tdsWithheld)} delay={0.12} />
            {r.blocked > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                className="border border-down/40 bg-down/5 px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-down">Stuck with the department</span>
                  <span className="tnum text-[21px] font-bold text-down">{rupees(r.blocked)}</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">
                  That is {nf(r.blockedPct, 0)}% of what was withheld, and it is refunded only after you file — roughly
                  {" "}{r.idleMonths} months later, interest-free. At 7% that idle money costs you about{" "}
                  <b className="tnum text-ink">{rupees(r.carryCost)}</b>.
                </p>
              </motion.div>
            )}
            <div className="border border-accent/40 bg-accent/5 px-4 py-3.5">
              <div className="text-[12px] font-semibold text-accent">The fix, and it is a form</div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">
                Apply to the Assessing Officer (International Taxation) for a lower or nil deduction certificate,
                6-8 weeks <i>before</i> the sale. It directs the buyer to deduct on the computed gain instead of the sale
                price — turning {rupees(r.tdsWithheld)} of withholding into roughly {rupees(r.taxDue)}. Take the purchase
                deed, the sale agreement, proof of cost and improvement, and your PAN.
              </p>
            </div>
            {r.indexationDenied && (
              <p className="text-[11.5px] leading-relaxed text-ink-faint">
                No indexation is applied above, and that is correct: the grandfathered choice of 20% with indexation for
                property bought before 23 July 2024 is given by statute to “an individual or HUF, being a resident”.
                A non-resident pays 12.5% on the raw rupee gain however long they held it.
              </p>
            )}
            <p className="text-[11.5px] leading-relaxed text-ink-faint">
              The buyer also needs a TAN, must deposit the tax and must file the quarterly non-resident statement
              (Form 144, was 27Q). Buyers routinely deduct 1% under the resident provision by mistake — and are then
              personally liable for the shortfall, with interest. Put the seller's residential status in the agreement.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ========================= tool · repatriation ============================ */

function RepatriationPlanner() {
  const [amountUsd, setAmount] = useState(400000);
  const [source, setSource] = useState("nro");
  const [used, setUsed] = useState(0);
  const plan = useMemo(() => repatriationPlan({ amountUsd, source, usedThisYearUsd: used }), [amountUsd, source, used]);
  if (!plan) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
      <Card>
        <CardHead title="What you want to send out" />
        <div className="space-y-4 p-5">
          <Pick label="Where the money is coming from" value={source} onChange={setSource}
            options={Object.values(REPAT_SOURCES).map((s) => [s.key, s.label] as [string, string])} />
          <Num label="Amount" value={amountUsd} onChange={setAmount} step={25000} suffix="USD" />
          <Num label="Already remitted from NRO this financial year" value={used} onChange={setUsed} step={25000}
            suffix="USD" hint="The allowance resets every 1 April." />
        </div>
      </Card>

      <div className="space-y-5">
        <Card className={plan.capped && !plan.fits ? BORDER.warn : BORDER.up}>
          <div className="p-6">
            <Label>Verdict</Label>
            <div className={`mt-2 text-[19px] font-semibold leading-snug ${plan.capped && !plan.fits ? "text-warn" : "text-up"}`}>
              {plan.capped ? (plan.fits ? "This fits inside this year's allowance." : "This needs splitting across two financial years.") :
                "No annual cap applies to this route."}
            </div>
            <p className="mt-2 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-dim">{plan.verdict}</p>
            <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-dim">{plan.source.note}</p>
          </div>
        </Card>

        {plan.capped && (
          <Card>
            <CardHead title="Your USD 1 million bucket for this financial year" />
            <div className="p-5">
              <Gauge used={used} adding={amountUsd} cap={REPAT_CAP_USD} />
              {plan.split && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {plan.split.map((s) => (
                    <div key={s.when} className="border border-line-2 px-4 py-3">
                      <Label>{s.when}</Label>
                      <div className="mt-1 tnum text-[19px] font-bold">{usd(s.usd)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}

        <Card>
          <CardHead title="Paperwork" sub="Renumbered on 1 April 2026 — 15CA and 15CB are now 145 and 146." />
          <div className="flex flex-wrap gap-2 p-5">
            {plan.forms.map((f) => <Chip key={f} tone="accent">{f}</Chip>)}
          </div>
          <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
            The Liberalised Remittance Scheme, its USD 250,000 limit and its TCS apply to persons resident <i>in</i>
            {" "}India — not to you. An NRI remitting from an NRO account uses the Remittance of Assets route. If a bank
            applies LRS or TCS to your NRO remittance, they have misclassified you.
          </div>
        </Card>
      </div>
    </div>
  );
}

/* =========================== tool · compare =============================== */

function Compare({ onPick }: { onPick: (c: CorridorKey) => void }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHead title="The five corridors, read across"
          sub="Where you live changes the answer more than anything you own." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                <th className="px-5 py-3 text-left font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-faint">Dimension</th>
                {CORRIDOR_KEYS.map((k) => (
                  <th key={k} className="px-4 py-3 text-left">
                    <button onClick={() => onPick(k)} className="group text-left text-ink">
                      <div className="text-[15px]">{CORRIDORS[k].flag}</div>
                      <div className="mt-0.5 text-[12px] font-semibold transition-colors group-hover:text-accent">
                        {CORRIDORS[k].short}
                      </div>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX_ROWS.map((row) => (
                <tr key={row.key} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 text-ink-dim">{row.label}</td>
                  {CORRIDOR_KEYS.map((k) => {
                    const cell = row.get(CORRIDORS[k]);
                    return (
                      <td key={k} className="px-4 py-3">
                        <span className={`inline-block border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em]
                          ${BORDER[cell.tone]} ${TONE[cell.tone]}`}>{cell.v}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead title="Moving back to India"
          sub="Most of this only works before you land — the RNOR window is the highest-value planning period an NRI gets." />
        <div className="relative p-5 pl-8">
          <div className="absolute bottom-8 left-[26px] top-8 w-px bg-line" />
          <Stagger className="space-y-5">
            {RETURN_TIMELINE.map((t) => (
              <StaggerItem key={t.at} className="relative flex gap-4">
                <span className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-paper ${FILL[t.tone]}`} />
                <div className="min-w-0 -mt-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">{t.at}</span>
                    <span className={`text-[13px] font-semibold ${TONE[t.tone]}`}>{t.title}</span>
                  </div>
                  <p className="mt-1 max-w-[78ch] text-[12.5px] leading-relaxed text-ink-dim">{t.why}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </Card>
    </div>
  );
}

/* ============================ tool · browse =============================== */

function Browse({ corridor, onOpen }: { corridor: CorridorKey | "all"; onOpen: (q: string) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        {TOPICS.map(([key, label]) => {
          const items = byTopic(key, corridor);
          if (!items.length) return null;
          return (
            <Card key={key}>
              <CardHead title={label} sub={`${items.length} answer${items.length === 1 ? "" : "s"}`} />
              <div className="divide-y divide-line">
                {items.map((d) => (
                  <button key={d.id} onClick={() => onOpen(d.card!.q)}
                    className="block w-full px-5 py-2.5 text-left text-[12.5px] text-ink-dim transition-colors hover:bg-paper-3/60 hover:text-ink">
                    {d.card!.q}
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHead title="The renumbering, in full"
          sub="Everything published before 1 April 2026 cites sections and forms that no longer exist." />
        <div className="grid gap-x-8 gap-y-0 p-5 md:grid-cols-2">
          {[...SECTION_MAP.map((r) => ["s.", r] as const), ...FORM_MAP.map((r) => ["Form ", r] as const)]
            .map(([prefix, [old, now, what]]) => (
              <div key={prefix + old} className="flex items-baseline gap-3 border-b border-line py-2.5 last:border-0">
                <span className="tnum w-[92px] shrink-0 text-[12px] text-ink-faint line-through">{prefix}{old}</span>
                <span className="tnum w-[80px] shrink-0 text-[12.5px] font-semibold text-accent">{prefix}{now}</span>
                <span className="min-w-0 text-[11.5px] leading-snug text-ink-dim">{what}</span>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}

/* ================================= page ================================== */

const TABS: [string, string][] = [
  ["answers", "Answers"],
  ["residency", "Am I an NRI?"],
  ["rates", "What gets deducted"],
  ["property", "Selling property"],
  ["repatriate", "Sending money out"],
  ["compare", "Compare countries"],
  ["browse", "Browse everything"],
];

export default function NRI() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [corridor, setCorridor] = useState<CorridorKey | "all">((params.get("c") as CorridorKey) ?? "all");
  const [tab, setTab] = useState(params.get("t") ?? "answers");
  const [amount, setAmount] = useState(1000000);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const box = useRef<HTMLInputElement>(null);

  // The URL carries the question, so an answer can be sent to someone. The 404
  // shim already parks deep app paths, so these links survive a cold load.
  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (corridor !== "all") next.set("c", corridor);
    if (tab !== "answers") next.set("t", tab);
    setParams(next, { replace: true });
  }, [query, corridor, tab, setParams]);

  // "/" focuses the box from anywhere on the page, as every search UI does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== box.current) { e.preventDefault(); box.current?.focus(); }
      if (e.key === "Escape") box.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hits: Hit[] = useMemo(
    () => (query.trim().length > 1 ? search(query, corridor) : []),
    [query, corridor]);

  const ask = (q: string) => { setQuery(q); setTab("answers"); setOpen(new Set()); box.current?.focus(); };
  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const active = corridor !== "all" ? CORRIDORS[corridor] : null;
  const suggestions = SUGGESTED.filter((s) => !s.for || s.for === corridor).slice(0, 8);

  return (
    <div className="pt-9">
      {/* ------------------------------ hero ------------------------------ */}
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[34px] italic leading-none tracking-tight">NRI</h1>
            <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-ink-dim">
              Investing, tax, remittance, insurance and treaty relief for Indians in the United States, Canada, the
              Gulf, Australia and New Zealand. Ask it the way you would ask a person.
            </p>
          </div>
          <div className="text-right">
            <Label>Law in force</Label>
            <div className="mt-1 text-[11.5px] text-ink-dim">Tax year {TAX_YEAR}</div>
            <div className="text-[10.5px] text-ink-faint">{LAW}</div>
          </div>
        </div>
      </Reveal>

      {/* ----------------------------- search ----------------------------- */}
      <Reveal delay={0.05} className="mt-7">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-ink-faint">⌕</span>
          <input
            ref={box}
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (tab !== "answers") setTab("answers"); }}
            placeholder="NRO interest, selling my flat, Section 195, PPF, how much can I send home…"
            className="w-full border border-line-2 bg-paper-2/70 py-4 pl-11 pr-24 text-[15px] text-ink outline-none
              transition-colors placeholder:text-ink-faint focus:border-ink"
          />
          <div className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {query ? (
              <button onClick={() => setQuery("")}
                className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint transition-colors hover:text-ink">
                clear
              </button>
            ) : (
              <span className="hidden border border-line-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint sm:inline">/</span>
            )}
          </div>
        </div>

        {/* corridor selector — the single biggest determinant of the answer */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Label className="mr-1">I live in</Label>
          <Button active={corridor === "all"} onClick={() => setCorridor("all")}>Anywhere</Button>
          {CORRIDOR_KEYS.map((k) => (
            <Button key={k} active={corridor === k} onClick={() => setCorridor(k)}>
              {CORRIDORS[k].flag} {CORRIDORS[k].short}
            </Button>
          ))}
        </div>

        <AnimatePresence>
          {active && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="mt-3 border-l-2 border-accent/60 bg-paper-2/50 py-2.5 pl-4 pr-4">
                <div className="text-[12.5px] font-medium">{active.oneLine}</div>
                <div className="mt-1 max-w-[86ch] text-[11.5px] leading-relaxed text-ink-dim">{active.why}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Reveal>

      {/* ------------------------------ tabs ------------------------------ */}
      <div className="mt-7 flex flex-wrap gap-1.5 border-b border-line pb-3">
        {TABS.map(([k, l]) => (
          <Button key={k} active={tab === k} onClick={() => setTab(k)}>{l}</Button>
        ))}
      </div>

      <div className="mt-6">
        <AnimatePresence mode="wait">
          <motion.div key={tab}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24 }}>

            {tab === "answers" && (
              <>
                {hits.length > 0 ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[12px] text-ink-faint">
                        <b className="text-ink-dim">{hits.length}</b> answer{hits.length === 1 ? "" : "s"} for
                        {" "}<span className="text-ink">“{query.trim()}”</span>
                        {active && <> · scored for <span className="text-ink">{active.label}</span></>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label>Rate examples on</Label>
                        <input type="number" value={amount} step={100000} onChange={(e) => setAmount(Number(e.target.value || 0))}
                          className="w-32 border border-line-2 bg-paper px-2.5 py-1 text-[12px] text-ink tnum outline-none focus:border-ink" />
                      </div>
                    </div>
                    <Stagger className="space-y-3" gap={0.035}>
                      {hits.map((h) => (
                        <StaggerItem key={h.doc.id}>
                          <ResultCard doc={h.doc} corridor={corridor} amount={amount}
                            open={open.has(h.doc.id)} onToggle={() => toggle(h.doc.id)} />
                        </StaggerItem>
                      ))}
                    </Stagger>
                  </>
                ) : query.trim().length > 1 ? (
                  <Card className="p-8 text-center">
                    <div className="text-[14px] font-semibold">Nothing matched “{query.trim()}”.</div>
                    <p className="mx-auto mt-2 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-dim">
                      Try the thing rather than the rule — “my flat”, “my bank deducted too much”, “moving back”.
                      Old section and form numbers work too: 195, 10F, 15CB.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                      {SUGGESTED.slice(0, 6).map((s) => (
                        <Button key={s.q} onClick={() => ask(s.q)}>{s.q}</Button>
                      ))}
                    </div>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <Label>Start here</Label>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {suggestions.map((s) => (
                          <Button key={s.q} onClick={() => ask(s.q)}>{s.q}</Button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        ["Am I an NRI?", "Work the day counts and see which statutory test decides it.", "residency"],
                        ["What gets deducted", "Domestic rate against your treaty, per income stream.", "rates"],
                        ["Selling property", "Why the buyer withholds far more than you owe.", "property"],
                        ["Sending money out", "The USD 1 million bucket, and what stays outside it.", "repatriate"],
                      ].map(([t, d, go], i) => (
                        <Reveal key={t} delay={i * 0.04}>
                          <button onClick={() => setTab(go)}
                            className="h-full w-full border border-line bg-paper-2/70 px-4 py-4 text-left text-ink transition-colors hover:border-ink">
                            <div className="text-[13px] font-semibold">{t}</div>
                            <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-dim">{d}</div>
                          </button>
                        </Reveal>
                      ))}
                    </div>

                    <Card>
                      <CardHead title="The one that dates everything else"
                        sub="Every article written before 1 April 2026 cites sections that no longer exist." />
                      <div className="grid gap-x-8 p-5 md:grid-cols-2">
                        {[["s.195", "s.393(2)", "TDS on payments to non-residents"],
                          ["s.90", "s.159", "Double taxation relief"],
                          ["s.87A", "s.157", "Rebate — residents only"],
                          ["Form 10F", "Form 41", "Treaty self-declaration"],
                          ["Form 67", "Form 44", "Foreign tax credit"],
                          ["Form 15CA/CB", "Form 145/146", "Outward remittance"]].map(([o, n, w]) => (
                          <div key={o} className="flex items-baseline gap-3 border-b border-line py-2.5 last:border-0">
                            <span className="tnum w-[104px] shrink-0 text-[12px] text-ink-faint line-through">{o}</span>
                            <span className="tnum w-[104px] shrink-0 text-[12.5px] font-semibold text-accent">{n}</span>
                            <span className="text-[11.5px] text-ink-dim">{w}</span>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-line px-5 py-3 text-[11.5px] text-ink-faint">
                        Rates did not change on 1 April 2026 — the citations did. Income up to 31 March 2026 is still
                        governed by the 1961 Act, so an AY 2026-27 return still uses the old names.
                      </div>
                    </Card>
                  </div>
                )}
              </>
            )}

            {tab === "residency" && <ResidencyWizard />}
            {tab === "rates" && (
              <WithholdingExplorer
                corridor={corridor === "all" ? "gulf" : corridor}
                setCorridor={(c) => setCorridor(c)} />
            )}
            {tab === "property" && <PropertyCalc />}
            {tab === "repatriate" && <RepatriationPlanner />}
            {tab === "compare" && <Compare onPick={(c) => { setCorridor(c); setTab("answers"); }} />}
            {tab === "browse" && <Browse corridor={corridor} onOpen={ask} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="mt-10 max-w-[92ch] border-t border-line pt-5 text-[11.5px] leading-relaxed text-ink-faint">
        {CORPUS_SIZE} answers, written against the Income-tax Act, 2025, the Income-tax Rules, 2026, the Finance Act,
        2026, FEMA and the RBI Master Directions, and each corridor's own tax authority. Cross-border positions turn on
        facts this page cannot see — confirm anything material with a qualified adviser in <i>both</i> countries.
        Educational research only, not tax, legal or investment advice.
      </p>
    </div>
  );
}
