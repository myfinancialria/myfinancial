import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useFund, useFunds, useHoldings } from "../lib/useData";
import { Card, CardHead, Chip, Label, ErrorNote, Skeleton } from "../components/ui";
import { Reveal, Stagger, StaggerItem } from "../components/motion";
import LineChart from "../components/LineChart";
import Holdings from "../components/Holdings";
import { byUnit, inr, nf, plainPct, tone } from "../lib/format";
import { staticFundUrl, type RollingBucket } from "../lib/data";

/* ---------------------------------------------------------------------------
   One scheme.

   The headline of a fund page is the rolling-return distribution, not the
   trailing number. A trailing three-year figure is an accident of today's
   date; the rolling view answers "what did a three-year hold in this fund
   actually return, starting on any day of its life" — which is the question
   an investor is really asking.
--------------------------------------------------------------------------- */

// No "Category record" here for the same reason the static fund pages omit
// it: ranks and quartiles of past returns on a registered adviser's website
// read as recommendations.
const GROUPS = ["Returns", "Rolling returns", "Risk", "Scheme"];

/* --------------------------------- SIP ----------------------------------- */

const SIP_AMT = 10_000;

/** Annualised money-weighted return: every instalment compounded to the end
    date must sum to the final value. Solved by bisection — the function is
    monotonic in the rate, so this cannot miss. */
function xirr(datesMs: number[], flows: number[]): number | null {
  const end = datesMs[datesMs.length - 1];
  const YEAR = 365.25 * 86_400_000;
  const fv = (r: number) =>
    flows.reduce((s, f, i) => s + f * Math.pow(1 + r, (end - datesMs[i]) / YEAR), 0);
  let lo = -0.95, hi = 3;
  let flo = fv(lo);
  if (!Number.isFinite(flo) || flo * fv(hi) > 0) return null;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    const fm = fv(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

function sipSimulation(navPoints: [string, number][]) {
  if (navPoints.length < 13) return null;   // a year of instalments, minimum
  let units = 0, invested = 0;
  const value: [string, number][] = [];
  const paid: [string, number][] = [];
  for (const [month, nav] of navPoints) {
    if (!(nav > 0)) continue;
    units += SIP_AMT / nav;
    invested += SIP_AMT;
    value.push([month, units * nav]);
    paid.push([month, invested]);
  }
  if (value.length < 13) return null;
  const datesMs = value.map(([m]) => Date.parse(`${m}-01T00:00:00Z`));
  const flows = value.map(() => -SIP_AMT);
  datesMs.push(datesMs[datesMs.length - 1]);
  flows.push(value[value.length - 1][1]);
  return {
    value, paid, invested,
    final: value[value.length - 1][1],
    rate: xirr(datesMs, flows),
    months: value.length,
    since: value[0][0],
  };
}

function SipCard({ navPoints }: { navPoints: [string, number][] }) {
  const sip = useMemo(() => sipSimulation(navPoints), [navPoints]);
  if (!sip) return null;

  const stats: [string, string][] = [
    ["Put in", inr(sip.invested, 0)],
    ["Worth now", inr(sip.final, 0)],
    ["XIRR", sip.rate === null ? "—" : plainPct(sip.rate * 100)],
    ["Instalments", nf(sip.months, 0)],
  ];

  return (
    <Card>
      <CardHead title={`SIP of ${inr(SIP_AMT, 0)} a month`}
        sub={`every month since ${sip.since}, bought at that month's published NAV`}
        right={sip.rate !== null ? <Chip tone={sip.rate >= 0 ? "up" : "down"}>{plainPct(sip.rate * 100)} a year</Chip> : undefined} />
      <div className="px-5 py-4">
        <LineChart points={sip.value} secondary={sip.paid}
          valueLabel="SIP value" secondaryLabel="Amount put in"
          format={(v) => inr(v, 0)} />
        <div className="mt-4 grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {stats.map(([l, v]) => (
            <div key={l} className="bg-paper-2 px-3 py-2.5">
              <Label>{l}</Label>
              <div className="mt-1 text-[15px] font-bold tnum">{v}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">
          The dashed line is money put in; the solid line is what those units were worth. Simulated on the
          scheme's month-sampled NAV history — each instalment buys at that month's published NAV, with no
          exit load, expenses beyond the NAV, or tax. XIRR is the annualised money-weighted return of exactly
          this schedule. Past performance does not indicate future results.
        </p>
      </div>
    </Card>
  );
}

function RollingCard({ label, b, horizon }: { label: string; b: RollingBucket; horizon: string }) {
  const span = b.max - b.min || 1;
  const at = (v: number) => ((v - b.min) / span) * 100;

  return (
    <Card>
      <CardHead title={label} sub={`${nf(b.windows, 0)} overlapping ${horizon} windows, one for every start date`} />
      <div className="px-5 py-5">
        {/* min — median — max, drawn to scale so the skew is visible */}
        <div className="relative h-11">
          <div className="absolute inset-x-0 top-[18px] h-px bg-line-2" />
          <div className="absolute top-[13px] h-[11px] bg-ink/15"
            style={{ left: `${at(Math.max(b.min, 0))}%`, width: `${Math.max(0, at(b.max) - at(Math.max(b.min, 0)))}%` }} />
          {b.min < 0 && (
            <div className="absolute top-[13px] h-[11px] bg-down/25"
              style={{ left: 0, width: `${at(0)}%` }} />
          )}
          <div className="absolute top-[9px] h-[19px] w-0.5 bg-ink" style={{ left: `${at(b.median)}%` }} />
          <div className="absolute top-[32px] -translate-x-1/2 font-mono text-[9.5px] text-ink-faint tnum" style={{ left: `${at(b.median)}%` }}>
            median {plainPct(b.median)}
          </div>
          <div className="absolute top-0 left-0 font-mono text-[9.5px] tnum text-down">{plainPct(b.min)}</div>
          <div className="absolute top-0 right-0 font-mono text-[9.5px] tnum text-up">{plainPct(b.max)}</div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {([
            ["Average", plainPct(b.avg)],
            ["Never lost money", plainPct(b.pctPositive, 0)],
            ["Beat 8%", plainPct(b.pctAbove8, 0)],
            ["Beat 12%", plainPct(b.pctAbove12, 0)],
          ] as const).map(([l, v]) => (
            <div key={l} className="bg-paper-2 px-3 py-2.5">
              <Label>{l}</Label>
              <div className="mt-1 text-[15px] font-bold tnum">{v}</div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">
          Every window is a real holding period this scheme actually delivered. {plainPct(b.pctPositive, 0)} of {horizon} holds
          finished positive; the worst finished at {plainPct(b.min)}. That worst case is the number worth planning around.
        </p>
      </div>
    </Card>
  );
}

export default function Fund() {
  const { code = "" } = useParams();
  const index = useFunds();
  const detail = useFund(code);
  const holdings = useHoldings(code);

  const row = useMemo(
    () => index.data?.rows.find((r) => String(r.code) === String(code)) ?? null,
    [index.data, code],
  );

  if (index.error) return <ErrorNote error={index.error} />;
  if (index.loading) return <div className="space-y-4 pt-12"><Skeleton className="h-12 w-96" /><Skeleton className="h-[360px]" /></div>;

  if (!row) return (
    <Card className="mt-16 p-8">
      <div className="text-[14px] text-ink-dim">
        No scheme with code <b className="text-ink">{code}</b> in this build.{" "}
        <Link to="/funds" className="text-accent underline">Back to funds</Link>.
      </div>
    </Card>
  );

  const d = detail.data;
  const navPoints = (d?.navSeries ?? []) as [string, number][];

  const stats: [string, string, string][] = [
    ["NAV", inr(row.nav), `as at ${row.navDate}`],
    ["3-year", plainPct(row.r3y), `5-year ${plainPct(row.r5y)}`],
    ["Volatility", plainPct(row.volatility), `Sharpe ${nf(row.sharpe)}`],
    ["Worst drawdown", plainPct(row.maxDrawdownPct), row.maxDrawdownDate ? `trough ${row.maxDrawdownDate}` : ""],
  ];

  return (
    <>
      <section className="pt-12 pb-6">
        <Reveal>
          <Label className="mb-3">{row.categoryGroup}{row.category ? ` · ${row.category}` : ""}</Label>
        </Reveal>
        <Reveal delay={0.04}>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <h1 className="text-[clamp(1.7rem,3.6vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.04em]">{row.name}</h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Chip tone="accent">{row.amc}</Chip>
                {row.stale && <Chip tone="down">NAV stale</Chip>}
                <a href={staticFundUrl(String(row.code))}
                  className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint underline hover:text-ink">
                  full report ↗
                </a>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[32px] font-extrabold leading-none tracking-tight tnum">{inr(row.nav)}</div>
              <div className="mt-1.5 text-[13px] text-ink-faint">NAV · {row.navDate}</div>
            </div>
          </div>
        </Reveal>
      </section>

      <Stagger className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4" gap={0.04}>
        {stats.map(([l, v, s]) => (
          <StaggerItem key={l}>
            <div className="h-full bg-paper-2 px-4 py-3.5">
              <Label>{l}</Label>
              <div className={`mt-1.5 text-[19px] font-bold tracking-tight tnum ${l === "Worst drawdown" ? "text-down" : ""}`}>{v}</div>
              <div className="mt-0.5 text-[11px] text-ink-dim">{s}</div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal className="mt-6">
        <Card>
          <CardHead title="NAV history"
            sub={d ? `${nf(row.navPoints ?? navPoints.length, 0)} published NAVs since ${row.inceptionDate ?? "inception"}` : "loading…"}
            right={row.growth10k ? <Chip tone="up">₹10,000 → {inr(row.growth10k)}</Chip> : undefined} />
          <div className="px-5 py-4">
            {navPoints.length > 1
              ? <LineChart points={navPoints} valueLabel="NAV" format={(v) => `₹${nf(v, 2)}`} />
              : <Skeleton className="h-[260px]" />}
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
              Sampled from the scheme's full published NAV history for drawing; every return, risk and rolling
              figure on this page is computed on the complete series, not on this sample.
            </p>
          </div>
        </Card>
      </Reveal>

      {navPoints.length > 12 && (
        <Reveal className="mt-6">
          <SipCard navPoints={navPoints} />
        </Reveal>
      )}

      {holdings.data && <Holdings h={holdings.data} />}

      {(d?.rolling3y || d?.rolling5y) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {d.rolling3y && <RollingCard label="Rolling 3-year returns" b={d.rolling3y} horizon="3-year" />}
          {d.rolling5y && <RollingCard label="Rolling 5-year returns" b={d.rolling5y} horizon="5-year" />}
        </div>
      )}

      <div className="mt-6 [column-gap:1.5rem] md:[column-count:2] xl:[column-count:3]">
        {GROUPS.map((g) => {
          const fields = index.data!.meta.filter(
            (m) => m.g === g && row[m.k] !== null && row[m.k] !== undefined && row[m.k] !== "",
          );
          if (!fields.length) return null;
          return (
            <div key={g} className="mb-6 break-inside-avoid">
              <Card>
                <CardHead title={g} />
                <table className="w-full text-[12.5px]">
                  <tbody>
                    {fields.map((m) => (
                      <tr key={m.k} className="border-b border-line last:border-0">
                        <td className="px-4 py-2 text-ink-dim" title={m.h}>{m.l}</td>
                        <td className={`px-4 py-2 text-right tnum ${m.u === "%" && m.d === 1 ? tone(row[m.k]) : ""}`}>
                          {byUnit(row[m.k], m.u)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          );
        })}
      </div>

      <p className="mt-2 max-w-[80ch] text-[11.5px] leading-relaxed text-ink-faint">
        NAVs are official AMFI data for the Direct-Growth plan. Every return, risk and rolling figure here is
        computed from that published history rather than quoted from a factsheet. Past performance does not
        indicate future results.
      </p>
    </>
  );
}
