import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { usePatterns } from "../lib/useData";
import { Card, CardHead, Label, Chip, Button, ErrorNote, Skeleton } from "../components/ui";
import { Reveal } from "../components/motion";
import CandleChart from "../components/CandleChart";
import { crore, inr, nf, pct, plainPct, tone } from "../lib/format";

export default function Patterns() {
  const { data, loading, error } = usePatterns();
  const [bias, setBias] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const hits = useMemo(() => {
    if (!data) return [];
    return data.hits.filter((h) =>
      (!bias || h.bias === bias) && (!status || h.status === status) && (!type || h.pattern === type));
  }, [data, bias, status, type]);

  const types = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, string>();
    for (const h of data.hits) m.set(h.pattern, h.patternLabel);
    return [...m.entries()];
  }, [data]);

  if (error) return <ErrorNote error={error} />;
  const sel = hits.find((h) => h.symbol === open) ?? null;

  return (
    <>
      <section className="pt-12 pb-7">
        <Reveal><Label className="mb-3.5">Chart patterns</Label></Reveal>
        <Reveal delay={0.05}>
          <h1 className="text-[clamp(2rem,4.6vw,3.1rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
            Classical formations,{" "}
            <span className="font-serif font-normal italic text-ink-dim">drawn.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-4 max-w-[70ch] text-[14px] leading-relaxed text-ink-dim">
            {data ? `${nf(data.detected, 0)} formations detected across the liquid universe on ${data.priceDate}; the ${data.count} best-confirmed are here.` : "Loading…"}{" "}
            A pattern describes what price has already done — the measured target is a convention, not a forecast,
            and roughly half of all textbook patterns fail.
          </p>
        </Reveal>
      </section>

      <Reveal>
        <div className="flex flex-wrap gap-2">
          <Button active={!bias && !status && !type} onClick={() => { setBias(""); setStatus(""); setType(""); }}>All</Button>
          <Button active={bias === "BULLISH"} onClick={() => setBias(bias === "BULLISH" ? "" : "BULLISH")}>Bullish</Button>
          <Button active={bias === "BEARISH"} onClick={() => setBias(bias === "BEARISH" ? "" : "BEARISH")}>Bearish</Button>
          <span className="mx-1 w-px bg-line" />
          {(["FORMING", "BREAKOUT", "BREAKDOWN"] as const).map((s) => (
            <Button key={s} active={status === s} onClick={() => setStatus(status === s ? "" : s)}>{s.toLowerCase()}</Button>
          ))}
          <span className="mx-1 w-px bg-line" />
          {types.map(([k, l]) => (
            <Button key={k} active={type === k} onClick={() => setType(type === k ? "" : k)}>{l}</Button>
          ))}
        </div>
      </Reveal>

      <Reveal className="mt-6">
        <Card>
          <CardHead title="Detected patterns" sub="Select any row to open its chart"
            right={<Chip>{nf(hits.length, 0)} of {data?.count ?? 0}</Chip>} />
          {loading ? <Skeleton className="h-[420px]" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line">
                    {["Company", "Pattern", "Stage", "Price", "Entry", "Exit / stop", "Target", "R:R", "Confirm"].map((h, i) => (
                      <th key={h} className={`whitespace-nowrap bg-paper-2 px-3 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-faint ${i ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hits.map((h) => (
                    <>
                      <motion.tr key={h.symbol} onClick={() => setOpen(open === h.symbol ? null : h.symbol)}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
                        className={`cursor-pointer border-b border-line transition-colors hover:bg-paper-3 ${open === h.symbol ? "bg-paper-3" : ""}`}>
                        <td className="px-3 py-2.5">
                          <span className="block font-semibold">{h.name}</span>
                          <span className="block font-mono text-[10px] text-ink-faint">{h.symbol}{h.company.industry ? ` · ${h.company.industry}` : ""}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Chip tone={h.bias === "BULLISH" ? "up" : "down"}>{h.patternLabel}</Chip>
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono text-[10px] ${h.status === "BREAKOUT" ? "text-up" : h.status === "BREAKDOWN" ? "text-down" : "text-ink-dim"}`}>{h.status}</td>
                        <td className="px-3 py-2.5 text-right tnum">{inr(h.company.price)}</td>
                        <td className="px-3 py-2.5 text-right tnum">{inr(h.entry)}</td>
                        <td className="px-3 py-2.5 text-right tnum text-down">{inr(h.stop)}</td>
                        <td className="px-3 py-2.5 text-right tnum text-up">{inr(h.target2)}</td>
                        <td className="px-3 py-2.5 text-right tnum">{nf(h.riskReward, 1)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-block min-w-[30px] px-1.5 py-0.5 text-center font-mono text-[10.5px] ${h.confirm.score >= 80 ? "bg-up/20 text-up" : h.confirm.score >= 50 ? "bg-line text-ink-dim" : "bg-warn/20 text-warn"}`}>
                            {h.confirm.score}
                          </span>
                        </td>
                      </motion.tr>
                      <AnimatePresence>
                        {open === h.symbol && (
                          <tr>
                            <td colSpan={9} className="bg-paper-3 p-0">
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden">
                                <Detail hit={h} note={data!.notes[h.pattern]} />
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </>
                  ))}
                  {!hits.length && !loading && (
                    <tr><td colSpan={9} className="px-5 py-16 text-center text-[13px] text-ink-dim">
                      Nothing matches these filters today.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Reveal>
    </>
  );
}

function Detail({ hit, note }: { hit: any; note?: string }) {
  const px = hit.company.price;
  const triggered = (hit.bias === "BULLISH" && px > hit.entry) || (hit.bias === "BEARISH" && px < hit.entry);
  const riskNow = hit.bias === "BULLISH" ? px - hit.stop : hit.stop - px;
  const rewardNow = hit.bias === "BULLISH" ? hit.target2 - px : px - hit.target2;
  const rrNow = riskNow > 0 ? rewardNow / riskNow : null;
  const m = hit.peerMedians ?? {};

  return (
    <div className="p-5">
      <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Entry", inr(hit.entry), hit.status === "FORMING" ? "on a close through" : "already taken out", ""],
          ["Exit / stop-loss", inr(hit.stop), `risk ${plainPct(Math.abs((hit.entry - hit.stop) / hit.entry) * 100)}`, "text-down"],
          ["Target", inr(hit.target2), `first stop ${inr(hit.target1)}`, "text-up"],
          ["Reward : risk", `${nf(hit.riskReward, 1)} : 1`, `confirmation ${hit.confirm.score}/100`, ""],
        ].map(([l, v, s, t]) => (
          <div key={l as string} className="bg-paper-2 px-4 py-3">
            <Label>{l}</Label>
            <div className={`mt-1 text-[19px] font-bold tracking-tight tnum ${t}`}>{v}</div>
            <div className="mt-0.5 text-[11px] text-ink-dim">{s}</div>
          </div>
        ))}
      </div>

      {triggered && (
        <div className={`mt-4 border px-4 py-3 text-[12.5px] leading-relaxed ${rrNow !== null && rrNow < 1 ? "border-down bg-down/10" : "border-warn bg-warn/10"} text-ink-dim`}>
          <b className="text-ink">This pattern has already {hit.bias === "BULLISH" ? "broken out" : "broken down"}.</b>{" "}
          Price is {inr(px)}, past the {inr(hit.entry)} entry. Buying here risks {inr(Math.abs(riskNow))} a share to make {inr(Math.abs(rewardNow))}
          {rrNow !== null && <> — <b className="text-ink">{nf(rrNow, 1)} : 1</b> from today's price rather than the {nf(hit.riskReward, 1)} : 1 the pattern offered at the neckline</>}
          {rrNow !== null && rrNow < 1 && " — less than a rupee of reward per rupee risked, which is a chase, not a setup."}
        </div>
      )}

      <div className="mt-4 border border-line bg-paper-2 px-4 py-4">
        <CandleChart bars={hit.bars} sma50={hit.sma50} sma200={hit.sma200} />
      </div>

      {note && <p className="mt-3 max-w-[92ch] text-[12.5px] leading-relaxed text-ink-dim">{note}</p>}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <Label className="mb-2">The company</Label>
          <div className="grid grid-cols-2 gap-px bg-line">
            {[
              ["Market cap", crore(hit.company.marketCapCr)],
              ["Liquidity", `₹${nf(hit.company.avgTurnoverCr ?? 0, 1)} cr/day`],
              ["Delivery", plainPct(hit.company.avgDeliveryPct20)],
              ["1-year", pct(hit.company.ret1y)],
            ].map(([l, v]) => (
              <div key={l} className="bg-paper-2 px-3 py-2.5">
                <Label>{l}</Label><div className="mt-0.5 text-[13px] font-semibold tnum">{v}</div>
              </div>
            ))}
          </div>
          <Link to={`/company/${encodeURIComponent(hit.symbol)}`} className="mt-3 inline-block text-[12px] text-accent underline">
            Full company page →
          </Link>
        </div>
        <div>
          <Label className="mb-2">Against its sub-sector{hit.peerCount ? ` · ${hit.peerCount} listed` : ""}</Label>
          <table className="w-full text-[12px]">
            <tbody>
              {([["P/E", "pe", "x"], ["ROE", "roe", "%"], ["ROCE", "roce", "%"], ["Net margin", "profitMarginPct", "%"]] as const).map(([l, k, u]) => {
                const mine = hit.ratios[k], med = m[k];
                const diff = typeof mine === "number" && typeof med === "number" && med !== 0 ? ((mine - med) / Math.abs(med)) * 100 : null;
                const lower = k === "pe";
                return (
                  <tr key={k} className="border-b border-line last:border-0">
                    <td className="py-1.5 text-ink-dim">{l}</td>
                    <td className="py-1.5 text-right tnum">{typeof mine === "number" ? (u === "%" ? plainPct(mine) : `${nf(mine, 2)}×`) : "—"}</td>
                    <td className="py-1.5 text-right tnum text-ink-faint">{typeof med === "number" ? (u === "%" ? plainPct(med) : `${nf(med, 2)}×`) : "—"}</td>
                    <td className={`py-1.5 text-right text-[11px] ${diff === null ? "text-ink-faint" : Math.abs(diff) < 5 ? "text-ink-dim" : (lower ? diff < 0 : diff > 0) ? "text-up" : "text-down"}`}>
                      {diff === null ? "—" : Math.abs(diff) < 5 ? "in line" : `${Math.abs(diff).toFixed(0)}% ${diff > 0 ? "above" : "below"}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
