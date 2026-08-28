import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { parseCas, type Cas } from "@shared/cas.mjs";
import { analyse, type Analysis } from "@shared/cas_analysis.mjs";
import { extractPdf, PasswordError } from "../lib/casPdf";
import { useFunds, useHoldingsIndex } from "../lib/useData";
import { loadHoldings } from "../lib/data";
import { Card, CardHead, Chip, Label, Button, Skeleton } from "../components/ui";
import { Reveal, Stagger, StaggerItem } from "../components/motion";
import { arrow, dirTone, signed } from "../components/Market";
import { crore, inr, isNum, nf, plainPct } from "../lib/format";

/* ---------------------------------------------------------------------------
   Portfolio Analyser — read a Consolidated Account Statement.

   The statement is opened in this browser and never sent anywhere. That is not
   a feature note, it is the reason the whole thing is built this way: a CAS
   carries a PAN, a home address, an email and every transaction the holder has
   ever made. No amount of convenience justifies posting that to a server, so
   there is no server.

   Parsing follows codereverser/casparser, which is Python and cannot run here;
   the rules are ported into shared/cas.mjs where they are unit-tested.
--------------------------------------------------------------------------- */

type Stage = "idle" | "reading" | "done" | "error";

export default function Portfolio() {
  const funds = useFunds();
  const holdingsIdx = useHoldingsIndex();

  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cas, setCas] = useState<Cas | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** ISIN → scheme, so an imported statement lines up with the fund data here. */
  const fundsByIsin = useMemo(() => {
    const m = new Map<string, any>();
    const d = funds.data;
    if (!d) return m;
    for (const r of d.rows) if (r.isin) m.set(String(r.isin).toUpperCase(), r);
    return m;
  }, [funds.data]);

  const run = useCallback(async (f: File, pw: string) => {
    setStage("reading"); setError(null);
    try {
      const { lines, cells } = await extractPdf(f, pw);
      const parsed = parseCas(lines, cells);

      if (!parsed.meta.supported) {
        setStage("error");
        setError(parsed.meta.source === "NSDL" || parsed.meta.source === "CDSL"
          ? `This looks like an ${parsed.meta.source} demat statement. Only CAMS and KFintech mutual fund statements are read at the moment.`
          : "This does not look like a Consolidated Account Statement.");
        return;
      }
      if (!parsed.folios.length) {
        setStage("error");
        setError("The statement opened, but no folios could be read from it. If it is a summary rather than a detailed statement, ask CAMS for the detailed version.");
        return;
      }

      // Pull holdings only for the schemes actually held — nothing speculative.
      const codes = new Set<string>();
      for (const folio of parsed.folios) {
        for (const s of folio.schemes) {
          const ref = s.isin ? fundsByIsin.get(s.isin.toUpperCase()) : null;
          if (ref?.code) codes.add(String(ref.code));
        }
      }
      const holdings = new Map<string, any>();
      await Promise.all([...codes].map(async (c) => {
        try { const h = await loadHoldings(c); if (h) holdings.set(c, h); } catch { /* optional */ }
      }));

      setCas(parsed);
      setAnalysis(analyse(parsed, { funds: fundsByIsin, holdings }));
      setStage("done");
    } catch (e: any) {
      setStage("error");
      setError(e instanceof PasswordError
        ? e.message
        : `Could not read that file — ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }, [fundsByIsin]);

  const pick = (f: File | null) => {
    if (!f) return;
    setFile(f); setCas(null); setAnalysis(null); setStage("idle"); setError(null);
  };

  const reset = () => {
    setFile(null); setPassword(""); setCas(null); setAnalysis(null); setStage("idle"); setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <section className="pt-12 pb-4">
        <Reveal>
          <Label className="mb-3">Portfolio analyser</Label>
          <h1 className="text-[clamp(1.9rem,4.2vw,3rem)] font-extrabold leading-[1.03] tracking-[-0.04em]">
            Your statement, <em className="font-serif font-normal italic tracking-tight">read properly</em>.
          </h1>
          <p className="mt-3 max-w-[76ch] text-[14px] leading-relaxed text-ink-dim">
            Open a CAMS or KFintech Consolidated Account Statement and see what it actually says: what you paid,
            what it is worth, the return that reconciles the two, and — by looking through your funds to the
            shares they hold — where your money really sits.
          </p>
        </Reveal>
      </section>

      {/* The privacy note is first because it is the thing a reader needs
          before deciding to open the file, not a footnote afterwards. */}
      <Reveal>
        <Card className="border-accent/40">
          <div className="flex flex-wrap items-start gap-3 px-5 py-4">
            <span className="mt-0.5 text-[15px]" aria-hidden>🔒</span>
            <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-dim">
              <b className="text-ink">This file never leaves your browser.</b> It is opened here on your own
              machine — not uploaded, not stored, not sent to any server, and gone the moment you close the tab.
              A statement like this carries your PAN, your address and every transaction you have ever made, which
              is exactly why this page has no backend to send it to.
            </div>
          </div>
        </Card>
      </Reveal>

      {/* ------------------------------- input ------------------------------- */}
      {stage !== "done" && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="Open a statement" sub="CAMS or KFintech · the detailed statement, not the summary" />
            <div className="px-5 py-6">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0] ?? null); }}
                onClick={() => inputRef.current?.click()}
                className={`grid cursor-pointer place-items-center border border-dashed px-6 py-10 text-center transition-colors
                  ${dragging ? "border-accent bg-accent/[0.05]" : "border-line-2 hover:border-ink"}`}
              >
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
                  onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                <div className="text-[13.5px] font-medium">{file ? file.name : "Drop the PDF here, or click to choose"}</div>
                <div className="mt-1 text-[11.5px] text-ink-faint">
                  {file ? `${(file.size / 1024).toFixed(0)} KB · nothing has been read yet` : "Nothing is read until you press Open"}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="block min-w-[220px] flex-1">
                  <Label>Password</Label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && file) run(file, password); }}
                    placeholder="Usually your PAN, in capitals"
                    className="mt-1.5 w-full border border-line-2 bg-paper px-3 py-2 text-[13px] outline-none transition-colors focus:border-ink" />
                </label>
                <Button onClick={() => file && run(file, password)} active className="h-[38px]">
                  {stage === "reading" ? "Reading…" : "Open statement"}
                </Button>
                {file && <Button onClick={reset} className="h-[38px]">Clear</Button>}
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden">
                    <div className="mt-4 border border-down/50 px-4 py-3 text-[12.5px] leading-relaxed text-ink-dim">
                      <b className="text-down">Could not read it.</b> {error}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-5 border-t border-line pt-4 text-[11.5px] leading-relaxed text-ink-faint">
                Get a statement from CAMS at <span className="text-ink-dim">camsonline.com</span> → Statements →
                Consolidated Account Statement, or from KFintech. Ask for the <b className="text-ink-dim">detailed</b> version:
                the summary has balances but no transactions, and without transactions there is no return to compute.
                Parsing follows <span className="text-ink-dim">codereverser/casparser</span>, ported to run here.
              </div>
            </div>
          </Card>
        </Reveal>
      )}

      {stage === "reading" && <Skeleton className="mt-6 h-[220px]" />}

      {/* ------------------------------ results ------------------------------ */}
      {stage === "done" && analysis && cas && (
        <Results cas={cas} a={analysis} onReset={reset} holdingsCount={holdingsIdx.data?.count ?? 0} />
      )}
    </>
  );
}

/* --------------------------------- results -------------------------------- */
function Results({ cas, a, onReset, holdingsCount }: { cas: Cas; a: Analysis; onReset: () => void; holdingsCount: number }) {
  const t = a.totals;
  return (
    <>
      <Reveal className="mt-6">
        <Card>
          <CardHead
            title={cas.investor.name ? `${cas.investor.name}'s portfolio` : "Your portfolio"}
            sub={`${cas.statement.source} · ${cas.statement.from ?? "?"} to ${cas.statement.to ?? "?"} · ${t.folios} ${t.folios === 1 ? "folio" : "folios"}, ${t.schemes} schemes`}
            right={<Button onClick={onReset}>Clear and close</Button>}
          />
          <Stagger className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4" gap={0.04}>
            {([
              ["Current value", inr(t.value), a.asOf ? `as at ${a.asOf}` : ""],
              ["Invested", inr(t.cost ?? t.invested), t.cost ? "cost as stated" : "sum of purchases"],
              ["Gain", inr(t.gain), isNum(t.gainPct) ? `${signed(t.gainPct)} on cost` : ""],
              ["Return", isNum(t.xirr) ? `${nf(t.xirr, 1)}%` : "—", "annualised, time-weighted for every rupee"],
            ] as const).map(([l, v, s]) => (
              <StaggerItem key={l}>
                <div className="h-full bg-paper-2 px-4 py-3.5">
                  <Label>{l}</Label>
                  <div className={`mt-1.5 text-[19px] font-bold tracking-tight tnum ${l === "Gain" ? dirTone(t.gain) : ""}`}>
                    {l === "Gain" && isNum(t.gain) && <span aria-hidden className="mr-1">{arrow(t.gain)}</span>}{v}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-dim">{s}</div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
          <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
            The return is an XIRR: it weights every contribution by how long it was invested, which is the only
            fair way to compare a fund you drip-fed monthly against one you bought in a lump.
            {t.matched < t.schemes && ` ${t.schemes - t.matched} of ${t.schemes} schemes could not be matched to the fund data here, so their category and holdings are missing.`}
          </div>
        </Card>
      </Reveal>

      {a.allocation.length > 1 && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="Where the money sits" sub="By asset class, from the scheme category" />
            <div className="px-5 py-5">
              {a.allocation.map((x) => (
                <div key={x.group} className="mb-2.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 last:mb-0">
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12.5px]">{x.group}</span>
                      <span className="font-mono text-[10px] text-ink-faint tnum">{inr(x.value)}</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-line">
                      <motion.div className="h-1.5 bg-ink" initial={{ width: 0 }}
                        animate={{ width: `${x.pct ?? 0}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
                    </div>
                  </div>
                  <span className="w-[54px] text-right text-[12.5px] font-semibold tnum">{plainPct(x.pct)}</span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {a.lookThrough.stocks.length > 0 && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="The shares you actually own"
              sub={`Seen through your funds to their holdings — ${a.lookThrough.distinct} companies`}
              right={<Chip tone={(a.lookThrough.coveragePct ?? 0) > 60 ? "accent" : "warn"}>
                {plainPct(a.lookThrough.coveragePct, 0)} of the book covered
              </Chip>} />
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr>
                    {["Company", "Sector", "Held via", "Your exposure", "% of portfolio"].map((h, i) => (
                      <th key={h} className={`border-b border-line px-4 py-2.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint ${i > 1 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.lookThrough.stocks.slice(0, 25).map((x) => (
                    <tr key={x.symbol} className="border-b border-line last:border-0 hover:bg-ink/[0.03]">
                      <td className="px-4 py-2.5">
                        <Link to={`/company/${encodeURIComponent(x.symbol)}`} className="font-medium hover:text-accent">{x.name}</Link>
                        <div className="font-mono text-[9.5px] text-ink-faint">{x.symbol}</div>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-ink-dim">{x.sector ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink-dim tnum">{x.funds} {x.funds === 1 ? "fund" : "funds"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tnum">{inr(x.value)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tnum">{plainPct(x.pctOfPortfolio, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
              Computed from each fund's filed portfolio disclosure, so it covers only schemes whose holdings are
              published here — {holdingsCount} of them so far. A company appearing through several funds is the
              usual reason a portfolio is less diversified than the number of funds in it suggests.
            </div>
          </Card>
        </Reveal>
      )}

      <Reveal className="mt-6">
        <Card>
          <CardHead title="Scheme by scheme" right={<Chip>{a.schemes.length}</Chip>} />
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  {["Scheme", "Units", "NAV", "Value", "Cost", "Gain", "Return"].map((h, i) => (
                    <th key={h} className={`border-b border-line px-3 py-2.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint ${i ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.schemes.map((s, i) => (
                  <tr key={s.isin ?? s.name + i} className="border-b border-line last:border-0 hover:bg-ink/[0.03]">
                    <td className="px-3 py-2.5">
                      {s.schemeCode
                        ? <Link to={`/fund/${encodeURIComponent(s.schemeCode)}`} className="font-medium hover:text-accent">{s.name}</Link>
                        : <span className="font-medium">{s.name}</span>}
                      <div className="font-mono text-[9.5px] text-ink-faint">
                        {s.amc ?? ""}{s.category ? ` · ${s.category}` : ""} · folio {s.folio}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tnum text-ink-dim">{isNum(s.units) ? nf(s.units, 3) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tnum text-ink-dim">{isNum(s.nav) ? nf(s.nav, 2) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tnum">{inr(s.value)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tnum text-ink-dim">{inr(s.cost)}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tnum ${dirTone(s.gain)}`}>
                      {isNum(s.gain) && <span aria-hidden className="mr-1">{arrow(s.gain)}</span>}{inr(s.gain)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tnum ${dirTone(s.xirr)}`}>
                      {isNum(s.xirr) ? `${nf(s.xirr, 1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Reveal>

      <p className="mt-8 max-w-[80ch] text-[11.5px] leading-relaxed text-ink-faint">
        Read entirely in your browser; nothing was uploaded. Figures are taken from the statement as filed — where
        it states a cost, that is used; where it does not, purchases are summed. Educational research only, not
        investment advice, and not a substitute for your own records at tax time.
      </p>
    </>
  );
}
