import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { compare, recommendations, FY } from "@shared/tax.mjs";
import { simulateGoal, requiredSip, recommendedAlloc } from "@shared/goals.mjs";
import type { GoalResult } from "@shared/goals.mjs";
import { Card, CardHead, Chip, Label, Button } from "../components/ui";
import { Reveal } from "../components/motion";
import { useLocal } from "../lib/useLocal";
import { inr, nf, plainPct } from "../lib/format";

/* ---------------------------------------------------------------------------
   Planning, Tax & Goals.

   The engines here are imported, not reimplemented: @shared/tax.mjs and
   @shared/goals.mjs are the same modules the Node server runs and the static
   planning page loads. The FY 2025-26 slabs, surcharge caps, 87A marginal
   relief and correlated Monte Carlo are the real implementations, so a number
   shown here cannot disagree with a number shown anywhere else.

   Nothing is sent anywhere. Every figure typed on this page stays in this
   browser, saved to localStorage.
--------------------------------------------------------------------------- */

const STORE = "myfin.planning.v1";

const DEFAULTS = {
  profile: { residency: "RESIDENT" as "RESIDENT" | "NRI", age: 35 },
  inc: {
    salary: 1800000, rentalAnnual: 0, business: 0, fnoGains: 0, dividends: 0,
    otherInterest: 0, nroInterest: 0, nreInterest: 0,
    stcgEquity: 0, ltcgEquity: 0, ltcgOther: 0,
  },
  ded: { sec80C: 150000, sec80D: 25000, nps80CCD1B: 0, donations80G: 0, homeLoanInterest: 0, npsEmployer: 0 },
  cash: {
    monthlyIncome: 150000, monthlyExpense: 80000, emi: 0, assets: 5000000, liabilities: 1500000,
    liquidAssets: 600000, lifeCover: 5000000, healthCover: 1000000, dependants: 2,
  },
  goal: {
    name: "Retirement", targetAmount: 25000000, targetYear: new Date().getFullYear() + 20,
    currentCorpus: 2000000, monthlySip: 50000, stepUpPct: 10, riskBand: "BALANCED", inflation: 6,
  },
};

type State = typeof DEFAULTS;

/* ------------------------------- inputs ---------------------------------- */
function Num({ label, value, onChange, hint, step }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string; step?: number;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value || 0))}
        className="mt-1.5 w-full border border-line-2 bg-paper px-3 py-2 text-[13px] tnum outline-none transition-colors focus:border-ink" />
      {hint && <div className="mt-1 text-[10.5px] text-ink-faint">{hint}</div>}
    </label>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full border border-line-2 bg-paper px-3 py-2 text-[13px] outline-none transition-colors focus:border-ink">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

const KV = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <tr className={`border-b border-line last:border-0 ${strong ? "font-semibold" : ""}`}>
    <td className={`px-4 py-2 ${strong ? "" : "text-ink-dim"}`}>{k}</td>
    <td className="px-4 py-2 text-right tnum">{v}</td>
  </tr>
);

/* ================================ TAX ==================================== */
function TaxCentre({ S, set }: { S: State; set: (p: Partial<State>) => void }) {
  const cmp = useMemo(() => compare(S.profile, S.inc, S.ded), [S.profile, S.inc, S.ded]);
  const recs = useMemo(() => recommendations(S.profile, S.inc, S.ded, cmp, {}), [S.profile, S.inc, S.ded, cmp]);
  const better = cmp[cmp.better];
  const nri = S.profile.residency === "NRI";

  const heads: [string, number][] = ([
    ["Salary", better.heads.salary],
    ["Standard deduction", -better.heads.standardDeduction],
    ["House property", better.heads.houseProperty],
    ["Business / F&O", better.heads.business],
    ["Dividends", better.heads.dividends],
    ["Interest", better.heads.interest],
    ["NRE interest (exempt)", better.heads.nreInterestExempt || 0],
    ["Equity STCG @20%", better.heads.stcgEquity],
    ["Equity LTCG @12.5%", better.heads.ltcgEquity],
    ["  of which exempt (112A)", better.heads.ltcgExemptionUsed ? -better.heads.ltcgExemptionUsed : 0],
    ["Other LTCG @12.5%", better.heads.ltcgOther],
  ] as [string, number][]).filter(([, v]) => v);

  const t = better.tax;
  const totals: [string, number][] = ([
    ["Tax on slab income", t.slab],
    ["Less: 87A rebate", t.rebate87A ? -t.rebate87A : 0],
    ["Short-term capital gains", t.stcg],
    ["Long-term capital gains", t.ltcg],
    [`Surcharge${t.surchargeRatePct ? ` @${t.surchargeRatePct}%` : ""}`, t.surcharge],
    ["Health & education cess @4%", t.cess],
  ] as [string, number][]).filter(([, v]) => v);

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHead title="You" />
          <div className="grid gap-3.5 px-5 py-4">
            <Select label="Residency" value={S.profile.residency}
              onChange={(v) => set({ profile: { ...S.profile, residency: v as "RESIDENT" | "NRI" } })}
              options={[["RESIDENT", "Resident Indian"], ["NRI", "Non-resident (NRI)"]]} />
            <Num label="Age" value={S.profile.age} onChange={(v) => set({ profile: { ...S.profile, age: v } })} />
          </div>
        </Card>

        <Card>
          <CardHead title="Income" sub="annual, in rupees" />
          <div className="grid gap-3.5 px-5 py-4">
            <Num label="Salary" value={S.inc.salary} onChange={(v) => set({ inc: { ...S.inc, salary: v } })} />
            <Num label="Rental income" value={S.inc.rentalAnnual} onChange={(v) => set({ inc: { ...S.inc, rentalAnnual: v } })}
              hint="30% standard deduction is applied for you" />
            <Num label="Business / profession" value={S.inc.business} onChange={(v) => set({ inc: { ...S.inc, business: v } })} />
            <Num label="F&O gains" value={S.inc.fnoGains} onChange={(v) => set({ inc: { ...S.inc, fnoGains: v } })}
              hint="non-speculative business income" />
            <Num label="Dividends" value={S.inc.dividends} onChange={(v) => set({ inc: { ...S.inc, dividends: v } })} />
            <Num label="Interest (bank, bonds)" value={S.inc.otherInterest} onChange={(v) => set({ inc: { ...S.inc, otherInterest: v } })} />
            {nri && <>
              <Num label="NRO interest" value={S.inc.nroInterest} onChange={(v) => set({ inc: { ...S.inc, nroInterest: v } })} hint="taxable" />
              <Num label="NRE interest" value={S.inc.nreInterest} onChange={(v) => set({ inc: { ...S.inc, nreInterest: v } })} hint="exempt under s.10(4)(ii)" />
            </>}
            <Num label="Equity STCG" value={S.inc.stcgEquity} onChange={(v) => set({ inc: { ...S.inc, stcgEquity: v } })} hint="taxed at 20%" />
            <Num label="Equity LTCG" value={S.inc.ltcgEquity} onChange={(v) => set({ inc: { ...S.inc, ltcgEquity: v } })} hint="₹1.25L exempt, then 12.5%" />
            <Num label="Other LTCG" value={S.inc.ltcgOther} onChange={(v) => set({ inc: { ...S.inc, ltcgOther: v } })} hint="property, gold, debt — 12.5%" />
          </div>
        </Card>

        <Card>
          <CardHead title="Deductions" sub="old regime only — the new regime allows almost none" />
          <div className="grid gap-3.5 px-5 py-4">
            <Num label="Section 80C" value={S.ded.sec80C} onChange={(v) => set({ ded: { ...S.ded, sec80C: v } })} hint="capped at ₹1,50,000" />
            <Num label="Section 80D (health)" value={S.ded.sec80D} onChange={(v) => set({ ded: { ...S.ded, sec80D: v } })} />
            <Num label="NPS 80CCD(1B)" value={S.ded.nps80CCD1B} onChange={(v) => set({ ded: { ...S.ded, nps80CCD1B: v } })} hint="extra ₹50,000" />
            <Num label="Employer NPS 80CCD(2)" value={S.ded.npsEmployer} onChange={(v) => set({ ded: { ...S.ded, npsEmployer: v } })}
              hint="allowed in BOTH regimes" />
            <Num label="Home loan interest" value={S.ded.homeLoanInterest} onChange={(v) => set({ ded: { ...S.ded, homeLoanInterest: v } })} />
            <Num label="Donations 80G" value={S.ded.donations80G} onChange={(v) => set({ ded: { ...S.ded, donations80G: v } })} />
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Reveal>
          <Card>
            <CardHead title="Verdict" sub={FY} right={<Chip tone="accent">{cmp.better} regime</Chip>} />
            <div className="grid gap-px bg-line sm:grid-cols-3">
              <div className="bg-paper-2 px-5 py-5">
                <Label>Recommended</Label>
                <div className="mt-1.5 text-[26px] font-extrabold tracking-tight">{cmp.better}</div>
                <div className="mt-1 text-[12px] text-ink-dim">saves {inr(cmp.savings)} a year</div>
              </div>
              {(["NEW", "OLD"] as const).map((k) => (
                <div key={k} className="bg-paper-2 px-5 py-5">
                  <Label>{k} regime</Label>
                  <div className={`mt-1.5 text-[22px] font-extrabold tracking-tight tnum ${cmp.better === k ? "text-up" : "text-ink-dim"}`}>
                    {inr(cmp[k].tax.total)}
                  </div>
                  <div className="mt-1 text-[11.5px] text-ink-faint">effective {plainPct(cmp[k].effectiveRatePct)}</div>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHead title="Income, head by head" sub={`${cmp.better} regime`} />
            <table className="w-full text-[12.5px]">
              <tbody>
                {heads.map(([k, v]) => <KV key={k} k={k} v={inr(v)} />)}
                <KV k="Taxable at slab rates" v={inr(better.slabIncome)} strong />
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHead title="Slab by slab" />
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  {["Band", "Rate", "Amount", "Tax"].map((h, i) => (
                    <th key={h} className={`border-b border-line px-4 py-2.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint ${i ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {better.slabLines.length ? better.slabLines.map((l) => (
                  <tr key={l.band} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 text-ink-dim">{l.band}</td>
                    <td className="px-4 py-2 text-right tnum">{l.rate}%</td>
                    <td className="px-4 py-2 text-right tnum">{inr(l.amount)}</td>
                    <td className="px-4 py-2 text-right tnum">{inr(l.tax)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-4 py-5 text-ink-dim">No slab-rate tax at this income.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        <Card>
          <CardHead title="What you owe" />
          <table className="w-full text-[12.5px]">
            <tbody>
              {totals.map(([k, v]) => <KV key={k} k={k} v={inr(v)} />)}
              <KV k="Total tax payable" v={inr(t.total)} strong />
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHead title="What would move the number" right={<Chip>{recs.length}</Chip>} />
          <div className="divide-y divide-line">
            {recs.length ? recs.map((r) => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <b className="text-[13px]">{r.title}</b>
                  {r.impact > 0 && <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-up">saves ~{inr(r.impact)}</span>}
                </div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-ink-dim">{r.detail}</div>
              </div>
            )) : <div className="px-5 py-6 text-[13px] text-ink-dim">No further suggestions for this income mix.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================ CASH FLOW ================================== */
function CashFlow({ S, set }: { S: State; set: (p: Partial<State>) => void }) {
  const c = S.cash;
  const netWorth = c.assets - c.liabilities;
  const surplus = c.monthlyIncome - c.monthlyExpense - c.emi;
  const savingsRate = c.monthlyIncome > 0 ? (surplus / c.monthlyIncome) * 100 : 0;
  const dti = c.monthlyIncome > 0 ? (c.emi / c.monthlyIncome) * 100 : 0;
  const emergencyMonths = c.monthlyExpense + c.emi > 0 ? c.liquidAssets / (c.monthlyExpense + c.emi) : 0;
  const recommendedLife = c.monthlyIncome * 12 * 10 + c.liabilities;
  const lifeGap = Math.max(0, recommendedLife - c.lifeCover);
  const recommendedHealth = c.dependants > 2 ? 1500000 : 1000000;
  const healthGap = Math.max(0, recommendedHealth - c.healthCover);

  const notes: string[] = [];
  if (savingsRate < 20) notes.push(`A savings rate of ${plainPct(savingsRate)} is thin. Most plans assume 20–30%; the single biggest lever on every goal is this number, not the return you chase.`);
  if (dti > 40) notes.push(`EMIs take ${plainPct(dti)} of income. Above roughly 40% lenders baulk and a job gap becomes dangerous — clear the costliest loan before adding investments.`);
  if (emergencyMonths < 6) notes.push(`An emergency fund of ${nf(emergencyMonths, 1)} months sits below the six-month norm. Top it up in a liquid fund before locking money into long-dated goals.`);
  if (lifeGap > 0) notes.push(`Life cover looks short by about ${inr(lifeGap)}. A common yardstick is ten times annual income plus outstanding loans (${inr(recommendedLife)} here), so dependants can clear debt and replace income.`);
  if (healthGap > 0) notes.push(`Health cover of ${inr(c.healthCover)} is below the ${inr(recommendedHealth)} a family of this size would typically want in a metro.`);
  if (!notes.length) notes.push("Cash flow, debt, emergency fund and protection all look reasonable on these figures.");

  const stats: [string, string, string, string][] = [
    ["Net worth", inr(netWorth), `${inr(c.assets)} assets − ${inr(c.liabilities)} debt`, netWorth >= 0 ? "" : "text-down"],
    ["Monthly surplus", inr(surplus), `${plainPct(savingsRate)} of income saved`, surplus > 0 ? "text-up" : "text-down"],
    ["Debt-to-income", plainPct(dti), dti > 40 ? "above the 40% comfort limit" : "within a healthy range", dti > 40 ? "text-down" : "text-up"],
    ["Emergency fund", `${nf(emergencyMonths, 1)} months`, emergencyMonths >= 6 ? "at least six months covered" : "aim for six months of outgo", emergencyMonths >= 6 ? "text-up" : "text-down"],
  ];

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHead title="Your numbers" />
        <div className="grid gap-3.5 px-5 py-4">
          <Num label="Monthly income" value={c.monthlyIncome} onChange={(v) => set({ cash: { ...c, monthlyIncome: v } })} />
          <Num label="Monthly expenses" value={c.monthlyExpense} onChange={(v) => set({ cash: { ...c, monthlyExpense: v } })} />
          <Num label="Monthly EMIs" value={c.emi} onChange={(v) => set({ cash: { ...c, emi: v } })} />
          <Num label="Total assets" value={c.assets} onChange={(v) => set({ cash: { ...c, assets: v } })} />
          <Num label="Total liabilities" value={c.liabilities} onChange={(v) => set({ cash: { ...c, liabilities: v } })} />
          <Num label="Liquid assets" value={c.liquidAssets} onChange={(v) => set({ cash: { ...c, liquidAssets: v } })} hint="cash, liquid funds, sweep FDs" />
          <Num label="Life cover" value={c.lifeCover} onChange={(v) => set({ cash: { ...c, lifeCover: v } })} />
          <Num label="Health cover" value={c.healthCover} onChange={(v) => set({ cash: { ...c, healthCover: v } })} />
          <Num label="Dependants" value={c.dependants} onChange={(v) => set({ cash: { ...c, dependants: v } })} />
        </div>
      </Card>

      <div className="space-y-6">
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(([l, v, s, tn]) => (
            <div key={l} className="bg-paper-2 px-4 py-4">
              <Label>{l}</Label>
              <div className={`mt-1.5 text-[20px] font-extrabold tracking-tight tnum ${tn}`}>{v}</div>
              <div className="mt-0.5 text-[11px] text-ink-dim">{s}</div>
            </div>
          ))}
        </div>

        <Card>
          <CardHead title="What these figures say" />
          <ul className="space-y-3 px-5 py-4">
            {notes.map((n, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-ink-dim">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />{n}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ============================== GOALS ==================================== */
function GoalBands({ sim, targetYear }: { sim: GoalResult; targetYear: number }) {
  const b = sim.bands;
  if (!b || !b.times.length) return null;
  const W = 1000, H = 260;
  const maxY = Math.max(...b.p90, sim.target) * 1.05;
  const X = (i: number) => (i / (b.times.length - 1)) * W;
  const Y = (v: number) => H - (v / maxY) * H;
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
  const band = (lo: number[], hi: number[]) =>
    path(hi) + lo.slice().reverse().map((v, i) => `L${X(lo.length - 1 - i).toFixed(1)} ${Y(v).toFixed(1)}`).join("") + "Z";
  const ty = Y(sim.target);

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} preserveAspectRatio="none" style={{ width: "100%", height: H + 20, display: "block" }}
      role="img" aria-label="Projected corpus percentile bands">
      <path d={band(b.p10, b.p90)} className="fill-ink" opacity={0.1} />
      <path d={band(b.p25, b.p75)} className="fill-ink" opacity={0.16} />
      <path d={path(b.p50)} fill="none" className="stroke-ink" strokeWidth={2} />
      <line x1={0} y1={ty} x2={W} y2={ty} className="stroke-warn" strokeWidth={1.5} strokeDasharray="6 4" />
      <text x={6} y={ty - 6} className="fill-warn" fontSize={11} fontFamily="ui-monospace,Menlo,monospace">target {inr(sim.target)}</text>
      <text x={0} y={H + 15} className="fill-ink-faint" fontSize={10} fontFamily="ui-monospace,Menlo,monospace">today</text>
      <text x={W} y={H + 15} textAnchor="end" className="fill-ink-faint" fontSize={10} fontFamily="ui-monospace,Menlo,monospace">{targetYear}</text>
    </svg>
  );
}

function Goals({ S, set }: { S: State; set: (p: Partial<State>) => void }) {
  const g = S.goal;
  const [sipAnswer, setSipAnswer] = useState<{ need: number; delta: number } | null>(null);
  const [solving, setSolving] = useState(false);

  const years = Math.max(0.5, g.targetYear - new Date().getFullYear());
  const alloc = useMemo(() => recommendedAlloc(years, g.riskBand), [years, g.riskBand]);
  const input = useMemo(() => ({
    name: g.name, targetAmount: g.targetAmount, targetYear: g.targetYear,
    currentCorpus: g.currentCorpus, monthlySip: g.monthlySip, stepUpPct: g.stepUpPct,
    inflation: (g.inflation || 6) / 100, alloc, seed: g.name,
  }), [g, alloc]);

  const sim = useMemo(() => simulateGoal(input, { paths: 2000, wantBands: true }), [input]);

  const verdictTone = sim.verdict === "ACHIEVABLE" ? "text-up" : sim.verdict === "AT_RISK" ? "text-warn" : "text-down";
  const verdictLabel = { ACHIEVABLE: "On track", AT_RISK: "At risk", UNREALISTIC: "Not on track" }[sim.verdict];

  const solve = () => {
    setSolving(true);
    // 18 bisection rounds of 500 paths — heavy enough to be on demand rather
    // than on every keystroke.
    setTimeout(() => {
      const need = requiredSip(input, 75);
      setSipAnswer({ need, delta: need - g.monthlySip });
      setSolving(false);
    }, 20);
  };

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHead title="The goal" />
        <div className="grid gap-3.5 px-5 py-4">
          <label className="block">
            <Label>Name</Label>
            <input value={g.name} onChange={(e) => set({ goal: { ...g, name: e.target.value } })}
              className="mt-1.5 w-full border border-line-2 bg-paper px-3 py-2 text-[13px] outline-none focus:border-ink" />
          </label>
          <Num label="Target amount (today's money)" value={g.targetAmount} onChange={(v) => set({ goal: { ...g, targetAmount: v } })} />
          <Num label="Target year" value={g.targetYear} onChange={(v) => set({ goal: { ...g, targetYear: v } })} />
          <Num label="Current corpus" value={g.currentCorpus} onChange={(v) => set({ goal: { ...g, currentCorpus: v } })} />
          <Num label="Monthly SIP" value={g.monthlySip} onChange={(v) => set({ goal: { ...g, monthlySip: v } })} />
          <Num label="Annual step-up %" value={g.stepUpPct} onChange={(v) => set({ goal: { ...g, stepUpPct: v } })}
            hint="raising the SIP each year as income grows" />
          <Num label="Inflation %" value={g.inflation} onChange={(v) => set({ goal: { ...g, inflation: v } })} step={0.5} />
          <Select label="Risk band" value={g.riskBand} onChange={(v) => set({ goal: { ...g, riskBand: v } })}
            options={[["CONSERVATIVE", "Conservative"], ["BALANCED", "Balanced"], ["AGGRESSIVE", "Aggressive"]]} />
          <Button onClick={solve} active className="mt-1 w-full justify-center">
            {solving ? "Solving…" : "What SIP do I need?"}
          </Button>
        </div>
      </Card>

      <div className="space-y-6">
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-paper-2 px-4 py-4">
            <Label>Feasibility</Label>
            <div className={`mt-1.5 text-[24px] font-extrabold tracking-tight tnum ${verdictTone}`}>{sim.feasibility}%</div>
            <div className="mt-0.5 text-[11px] text-ink-dim">{verdictLabel}</div>
          </div>
          <div className="bg-paper-2 px-4 py-4">
            <Label>Target in {g.targetYear}</Label>
            <div className="mt-1.5 text-[20px] font-extrabold tracking-tight tnum">{inr(sim.target)}</div>
            <div className="mt-0.5 text-[11px] text-ink-dim">{inr(sim.targetToday)} in today's money</div>
          </div>
          <div className="bg-paper-2 px-4 py-4">
            <Label>Median outcome</Label>
            <div className="mt-1.5 text-[20px] font-extrabold tracking-tight tnum">{inr(sim.median)}</div>
            <div className="mt-0.5 text-[11px] text-ink-dim">
              {sim.shortfallAtMedian > 0 ? `short by ${inr(sim.shortfallAtMedian)}` : "clears the target"}
            </div>
          </div>
          <div className="bg-paper-2 px-4 py-4">
            <Label>Range of outcomes</Label>
            <div className="mt-1.5 text-[15px] font-extrabold tracking-tight tnum">{inr(sim.p10)} – {inr(sim.p90)}</div>
            <div className="mt-0.5 text-[11px] text-ink-dim">10th to 90th percentile</div>
          </div>
        </div>

        {sipAnswer && (
          <Card className="border-ink">
            <div className="px-5 py-4">
              <b className="text-[13.5px]">{inr(sipAnswer.need)} a month reaches this goal with 75% confidence</b>
              <div className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">
                {sipAnswer.delta > 0
                  ? `That is ${inr(sipAnswer.delta)} more than the ${inr(g.monthlySip)} you are investing now. Raising the annual step-up is usually easier than finding the whole increase today.`
                  : `You are already investing ${inr(-sipAnswer.delta)} more than needed — the goal is comfortably funded, and the surplus could go to another goal.`}
              </div>
            </div>
          </Card>
        )}

        <Card>
          <CardHead title="Where this could land"
            sub={`${Math.round(alloc.equity * 100)}% equity · ${Math.round(alloc.debt * 100)}% debt · ${Math.round(alloc.gold * 100)}% gold, glided down as the goal approaches`} />
          <div className="px-5 py-4">
            <GoalBands sim={sim} targetYear={g.targetYear} />
            <div className="mt-3 flex flex-wrap gap-4 font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-faint">
              <span><i className="mr-1.5 inline-block h-2 w-3.5 align-middle bg-ink opacity-10" />10th–90th percentile</span>
              <span><i className="mr-1.5 inline-block h-2 w-3.5 align-middle bg-ink opacity-25" />25th–75th</span>
              <span><i className="mr-1.5 inline-block h-0.5 w-3.5 align-middle bg-ink" />median path</span>
              <span><i className="mr-1.5 inline-block h-0 w-3.5 align-middle border-t-2 border-dashed border-warn" />target</span>
            </div>
          </div>
          <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
            Simulated over 2,000 correlated paths for equity, debt and gold (11.5% / 6.8% / 8.5% long-run
            returns, with the historical negative equity–debt correlation). The target is inflated at {g.inflation}% a
            year, so {inr(sim.targetToday)} today becomes {inr(sim.target)} by {g.targetYear}. Feasibility is the share of
            paths that finish at or above that inflated target — not a promise about any single one of them.
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================================ page =================================== */
const TABS = [["tax", "Tax centre"], ["cash", "Net worth & cash flow"], ["goals", "Goals"]] as const;

export default function Planning() {
  const [S, set, reset] = useLocal<State>(STORE, DEFAULTS);
  const [params, setParams] = useSearchParams();
  const tab = params.get("t") ?? "tax";

  return (
    <>
      <section className="pt-12 pb-4">
        <Reveal>
          <Label className="mb-3">Planning, tax &amp; goals</Label>
          <h1 className="text-[clamp(1.9rem,4.2vw,3rem)] font-extrabold leading-[1.03] tracking-[-0.04em]">
            Your numbers, <em className="font-serif font-normal italic tracking-tight">never ours</em>.
          </h1>
          <p className="mt-3 max-w-[78ch] text-[14px] leading-relaxed text-ink-dim">
            The {FY} slab logic, surcharge caps, 87A marginal relief and the correlated Monte Carlo behind the goal
            projection are the real engines, not a simplified copy — the same modules the rest of this platform runs.
            Everything you type stays in this browser: there is no account, no upload and no server to send it to.
          </p>
        </Reveal>
      </section>

      <Reveal delay={0.05}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setParams(id === "tax" ? {} : { t: id }, { replace: true })}
              className={`border px-3.5 py-2 text-[12px] transition-colors
                ${tab === id ? "border-ink bg-ink text-paper font-semibold" : "border-line-2 text-ink-dim hover:border-ink hover:text-ink"}`}>
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <Button onClick={() => { if (confirm("Reset every figure on this page to the example values?")) reset(); }}>
            Reset
          </Button>
        </div>
      </Reveal>

      {tab === "tax" && <TaxCentre S={S} set={set} />}
      {tab === "cash" && <CashFlow S={S} set={set} />}
      {tab === "goals" && <Goals S={S} set={set} />}

      <p className="mt-8 max-w-[80ch] text-[11.5px] leading-relaxed text-ink-faint">
        A planning tool, not a tax return and not advice. Slab rates, surcharge and rebate thresholds are as
        legislated for {FY}; your actual liability depends on facts this page does not ask for. Confirm anything
        material with a qualified professional before acting on it.
      </p>
    </>
  );
}
