import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { useInsights } from "../lib/useData";
import { Card, CardHead, Chip, Label, ErrorNote, Skeleton } from "../components/ui";
import { Reveal, Stagger, StaggerItem } from "../components/motion";
import { QuoteTile, BreadthBar, SectorBars, arrow, dirTone, signed } from "../components/Market";
import { inr, isNum, nf, plainPct } from "../lib/format";
import type { Quote, Headline, CorpAction, Mover, PreMarket, PostMarket } from "../lib/data";

/* ---------------------------------------------------------------------------
   Insights — the 8am brief and the 5pm report.

   Both are built from exchange data and publishers' own syndication feeds.
   Headlines link out to whoever wrote them; no article text is reproduced.

   The page is explicit about two things it would be easy to fudge:
     · which numbers are LIVE and which are a previous close (at 8am IST the
       US has shut and Europe has not opened, so most of the world is a close)
     · whether the evening report is the settled bhavcopy or a provisional
       read taken before NSE published it
--------------------------------------------------------------------------- */

const IST = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " IST";
};
const agoMin = (iso?: string | null) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)) : null);
const freshness = (iso?: string | null) => {
  const m = agoMin(iso);
  if (m === null) return "—";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

/** Weekend or gazetted holiday — say so rather than showing a flat session. */
function ClosedNotice({ reason, lastSession }: { reason: string | null; lastSession: string | null }) {
  return (
    <Card className="mt-6 border-warn">
      <div className="px-5 py-3.5 text-[12.5px] leading-relaxed text-ink-dim">
        <b className="text-warn">Indian market closed today{reason ? ` — ${reason}` : ""}.</b>{" "}
        There is no session to report. World markets below still moved overnight, and the last Indian
        session was {lastSession ?? "the previous trading day"}.
      </div>
    </Card>
  );
}

/* ------------------------------- headlines -------------------------------- */
function NewsList({ items }: { items: Headline[] }) {
  if (!items?.length) return null;
  return (
    <div className="divide-y divide-line">
      {items.map((h, i) => (
        <motion.a key={h.link + i} href={h.link} target="_blank" rel="noopener noreferrer"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: Math.min(i, 14) * 0.02 }}
          className="group block px-5 py-3 transition-colors hover:bg-ink/[0.03]">
          <div className="text-[13px] leading-snug group-hover:text-accent">{h.title}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-faint">{h.source}</span>
            {h.at && <span className="font-mono text-[9.5px] text-ink-faint">{freshness(h.at)}</span>}
            {h.companies.map((c) => (
              <Link key={c.symbol} to={`/company/${encodeURIComponent(c.symbol)}`}
                onClick={(e) => e.stopPropagation()}
                className="border border-line-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim transition-colors hover:border-ink hover:text-ink">
                {c.symbol}
              </Link>
            ))}
            <span className="ml-auto font-mono text-[9px] text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">read ↗</span>
          </div>
        </motion.a>
      ))}
    </div>
  );
}

/* --------------------------- corporate actions ---------------------------- */
const ACTION_TONE: Record<string, "up" | "accent" | "warn" | "neutral"> = {
  DIVIDEND: "up", BONUS: "accent", SPLIT: "accent", RIGHTS: "warn", BUYBACK: "warn", OTHER: "neutral",
};

function Actions({ rows }: { rows: CorpAction[] }) {
  const byDate = useMemo(() => {
    const m = new Map<string, CorpAction[]>();
    for (const r of rows) (m.get(r.exDate) ?? m.set(r.exDate, []).get(r.exDate)!).push(r);
    return [...m.entries()];
  }, [rows]);
  if (!rows.length) return <div className="px-5 py-7 text-[13px] text-ink-dim">No ex-dates in the next ten sessions.</div>;

  return (
    <div className="divide-y divide-line">
      {byDate.map(([date, list]) => (
        <div key={date} className="px-5 py-3.5">
          <div className="mb-2 flex items-baseline gap-3">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink">{date}</span>
            <span className="text-[11px] text-ink-faint">{list.length} {list.length === 1 ? "company" : "companies"} go ex</span>
          </div>
          <div className="grid gap-1.5">
            {list.map((a) => (
              <div key={a.symbol + a.purpose} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                <div className="min-w-0">
                  <Link to={`/company/${encodeURIComponent(a.symbol)}`} className="text-[12.5px] font-medium hover:text-accent">
                    {a.company}
                  </Link>
                  <div className="truncate text-[11.5px] text-ink-dim">{a.purpose}</div>
                </div>
                <Chip tone={ACTION_TONE[a.kind] ?? "neutral"}>{a.kind.toLowerCase()}</Chip>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- movers --------------------------------- */
function Movers({ title, rows, sub }: { title: string; rows: Mover[]; sub?: string }) {
  if (!rows?.length) return null;
  return (
    <Card>
      <CardHead title={title} sub={sub} />
      <div className="divide-y divide-line">
        {rows.map((r) => (
          <Link key={r.symbol} to={`/company/${encodeURIComponent(r.symbol)}`}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 px-5 py-2.5 transition-colors hover:bg-ink/[0.03]">
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-medium">{r.name}</div>
              <div className="font-mono text-[9.5px] text-ink-faint">{r.symbol}{r.sector ? ` · ${r.sector}` : ""}</div>
            </div>
            <span className="text-[12px] tnum text-ink-dim">{inr(r.price)}</span>
            <span className={`w-[76px] text-right text-[12.5px] font-semibold tnum ${dirTone(r.pct)}`}>
              <span aria-hidden className="mr-1">{arrow(r.pct)}</span>{signed(r.pct)}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------- quote grid ------------------------------- */
function Quotes({ list, cols = 4 }: { list: Quote[]; cols?: number }) {
  if (!list?.length) return null;
  return (
    <Stagger className={`grid gap-px bg-line sm:grid-cols-2 ${cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`} gap={0.03}>
      {list.map((q) => (
        <StaggerItem key={q.key}>
          <QuoteTile label={q.key} price={q.price} pct={q.pct}
            dp={q.kind === "fx" || q.kind === "rate" ? 3 : 2}
            sub={q.stale ? "last close" : "live"} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/* ------------------------------- pre-market ------------------------------- */
function PreMarketView({ d }: { d: PreMarket }) {
  const regions = ["US", "Asia", "Europe"] as const;
  return (
    <>
      {d.marketOpen === false && <ClosedNotice reason={d.closedReason} lastSession={d.lastSession} />}
      <Reveal className="mt-6">
        <Card>
          <CardHead title="Overnight, around the world"
            sub="At 8am IST the US has closed and Europe has not opened, so those are last closes; Asia is trading."
            right={<Chip>{d.global.length} markets</Chip>} />
          <div className="px-5 py-4">
            {regions.map((r) => {
              const list = d.global.filter((q) => q.region === r);
              if (!list.length) return null;
              return (
                <div key={r} className="mb-4 last:mb-0">
                  <Label className="mb-2">{r}</Label>
                  <Quotes list={list} />
                </div>
              );
            })}
          </div>
        </Card>
      </Reveal>

      {d.macro.length > 0 && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="Currency, commodities and rates" sub="The inputs that set the tone before India opens" />
            <div className="px-5 py-4"><Quotes list={d.macro} /></div>
          </Card>
        </Reveal>
      )}

      {d.india.length > 0 && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="India, at the last close" sub={`Previous session ${d.previousClose.date}`} />
            <div className="px-5 py-4"><Quotes list={d.india} cols={3} /></div>
          </Card>
        </Reveal>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Reveal>
          <Card>
            <CardHead title="Going ex-dividend and ex-bonus"
              sub="Filed with NSE — the price adjusts on the ex-date, so this is not a fall"
              right={<Chip tone="accent">{d.corporateActions.length}</Chip>} />
            <Actions rows={d.corporateActions} />
          </Card>
        </Reveal>

        <Reveal>
          <Card>
            <CardHead title="In the news this morning" right={<Chip>{d.news.length} headlines</Chip>} />
            {d.inNews.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3.5">
                {d.inNews.map((c) => (
                  <Link key={c.symbol} to={`/company/${encodeURIComponent(c.symbol)}`}
                    className="border border-line-2 px-2 py-1 text-[11px] text-ink-dim transition-colors hover:border-ink hover:text-ink">
                    {c.symbol}
                    {c.headlines > 1 && <span className="ml-1.5 font-mono text-[9px] text-ink-faint">{c.headlines}</span>}
                  </Link>
                ))}
              </div>
            )}
            <NewsList items={d.news} />
          </Card>
        </Reveal>
      </div>
    </>
  );
}

/* ------------------------------ post-market ------------------------------- */
function PostMarketView({ d }: { d: PostMarket }) {
  const provisional = d.basis === "PROVISIONAL";
  return (
    <>
      {d.marketOpen === false && <ClosedNotice reason={d.closedReason} lastSession={d.lastSession} />}

      {d.basis === "UNAVAILABLE" && (
        <Card className="mt-6 border-warn">
          <div className="px-5 py-3.5 text-[12.5px] leading-relaxed text-ink-dim">
            <b className="text-warn">No session to report.</b> The official bhavcopy is still dated {d.bhavcopyDate},
            and NSE's live index feed did not answer, so there is nothing here that could honestly be called
            today's close. Headlines below are current. This resolves on the next market day — a report built from nothing
            would be worse than an empty one.
          </div>
        </Card>
      )}

      {provisional && (
        <Card className="mt-6 border-warn">
          <div className="px-5 py-3.5 text-[12.5px] leading-relaxed text-ink-dim">
            <b className="text-warn">Provisional.</b> NSE publishes the official bhavcopy around 18:30 IST, so these
            are NSE's own live index levels and advance/decline counts rather than settled closes. The evening
            refresh rebuilds this from the official file and adds the individual movers, delivery data and
            turnover — the numbers can move slightly between the two.
          </div>
        </Card>
      )}

      {d.indices.length > 0 && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="Where the indices finished" right={<Chip tone={provisional ? "warn" : "up"}>{provisional ? "provisional" : "official close"}</Chip>} />
            <div className="px-5 py-4"><Quotes list={d.indices} cols={3} /></div>
          </Card>
        </Reveal>
      )}

      {d.breadth && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="Market breadth"
              sub={d.basis === "OFFICIAL"
                ? `${d.universe ?? 0} traded names with real turnover`
                : `${d.universe ?? 0} companies in the ${d.breadthFrom ?? "index"}, counted by NSE`}
              right={d.breadth.ratio ? <Chip tone={d.breadth.ratio >= 1 ? "up" : "down"}>{nf(d.breadth.ratio, 2)}:1 adv/dec</Chip> : undefined} />
            <div className="px-5 py-5">
              <BreadthBar advances={d.breadth.advances} declines={d.breadth.declines} unchanged={d.breadth.unchanged} />
              <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">
                Breadth says how broad a move was. An index can rise while most shares fall — when advances and
                declines are close, the headline number is being carried by a handful of large companies.
              </p>
            </div>
          </Card>
        </Reveal>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Movers title="Biggest gainers" rows={d.gainers} sub={d.basis === "OFFICIAL" ? "liquid names only — ₹5 cr+ average turnover" : "NIFTY 50"} />
        <Movers title="Biggest losers" rows={d.losers} sub={d.basis === "OFFICIAL" ? "liquid names only — ₹5 cr+ average turnover" : "NIFTY 50"} />
      </div>

      {d.sectors.length > 0 && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="How the sectors moved" sub="Turnover-weighted, so one thin stock cannot swing a sector" />
            <div className="px-5 py-5"><SectorBars rows={d.sectors} /></div>
          </Card>
        </Reveal>
      )}

      {d.volume.length > 0 && (
        <Reveal className="mt-6">
          <Card>
            <CardHead title="Unusual volume" sub="Traded at least twice their normal volume today" />
            <div className="divide-y divide-line">
              {d.volume.map((v) => (
                <Link key={v.symbol} to={`/company/${encodeURIComponent(v.symbol)}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 px-5 py-2.5 transition-colors hover:bg-ink/[0.03]">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">{v.name}</div>
                    <div className="font-mono text-[9.5px] text-ink-faint">{v.symbol}</div>
                  </div>
                  <span className="text-[12px] tnum text-ink-dim">
                    {nf(v.volumeRatio, 1)}× volume{isNum(v.deliveryPct) ? ` · ${plainPct(v.deliveryPct, 0)} delivery` : ""}
                  </span>
                  <span className={`w-[76px] text-right text-[12.5px] font-semibold tnum ${dirTone(v.pct)}`}>
                    <span aria-hidden className="mr-1">{arrow(v.pct)}</span>{signed(v.pct)}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      <Reveal className="mt-6">
        <Card>
          <CardHead title="What moved the tape" right={<Chip>{d.news.length} headlines</Chip>} />
          {d.inNews.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3.5">
              {d.inNews.map((c) => (
                <Link key={c.symbol} to={`/company/${encodeURIComponent(c.symbol)}`}
                  className="border border-line-2 px-2 py-1 text-[11px] text-ink-dim transition-colors hover:border-ink hover:text-ink">
                  {c.symbol}{c.headlines > 1 && <span className="ml-1.5 font-mono text-[9px] text-ink-faint">{c.headlines}</span>}
                </Link>
              ))}
            </div>
          )}
          <NewsList items={d.news} />
        </Card>
      </Reveal>
    </>
  );
}

/* ---------------------------------- page ---------------------------------- */
export default function Insights() {
  const { data, loading, error } = useInsights();
  const [params, setParams] = useSearchParams();

  // Default to whichever brief is the current one: the morning brief until the
  // market has closed and been reported, the evening report after.
  const preferred = data?.postmarket && data.premarket
    ? (Date.parse(data.postmarket.asOf) >= Date.parse(data.premarket.asOf) ? "post" : "pre")
    : data?.postmarket ? "post" : "pre";
  const tab = params.get("t") ?? preferred;

  if (error) return <ErrorNote error={error} />;

  return (
    <>
      <section className="pt-12 pb-4">
        <Reveal>
          <Label className="mb-3">Insights</Label>
          <h1 className="text-[clamp(1.9rem,4.2vw,3rem)] font-extrabold leading-[1.03] tracking-[-0.04em]">
            The market, <em className="font-serif font-normal italic tracking-tight">twice a day</em>.
          </h1>
          <p className="mt-3 max-w-[78ch] text-[14px] leading-relaxed text-ink-dim">
            A brief before the open at 8am and a report after the close at 5pm — built from exchange data and
            publishers' own feeds, with every headline linking back to whoever wrote it.
          </p>
        </Reveal>
      </section>

      {loading && <div className="space-y-3 pt-4"><Skeleton className="h-11 w-full" /><Skeleton className="h-[440px] w-full" /></div>}

      {data && (
        <>
          <Reveal delay={0.05}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
              {([["pre", "Pre-market brief", data.premarket?.asOf], ["post", "Post-market report", data.postmarket?.asOf]] as const).map(([id, label, at]) => (
                <button key={id} onClick={() => setParams(id === preferred ? {} : { t: id }, { replace: true })}
                  disabled={!at}
                  className={`border px-3.5 py-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40
                    ${tab === id ? "border-ink bg-ink text-paper font-semibold" : "border-line-2 text-ink-dim hover:border-ink hover:text-ink"}`}>
                  {label}
                  {at && <span className={`ml-2 font-mono text-[9.5px] ${tab === id ? "opacity-70" : "text-ink-faint"}`}>{freshness(at)}</span>}
                </button>
              ))}
              <div className="flex-1" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                {tab === "pre" ? IST(data.premarket?.asOf) : IST(data.postmarket?.asOf)}
              </span>
            </div>
          </Reveal>

          {tab === "pre"
            ? (data.premarket ? <PreMarketView d={data.premarket} />
              : <Card className="mt-6 p-7"><div className="text-[13px] text-ink-dim">This morning's brief has not been built yet. It publishes at 8am IST on market days.</div></Card>)
            : (data.postmarket ? <PostMarketView d={data.postmarket} />
              : <Card className="mt-6 p-7"><div className="text-[13px] text-ink-dim">Today's report has not been built yet. It publishes at 5pm IST on market days.</div></Card>)}

          <p className="mt-8 max-w-[80ch] text-[11.5px] leading-relaxed text-ink-faint">
            Index, currency and commodity levels are quote data; corporate actions are filed with NSE; company
            moves are computed from the official NSE bhavcopy. Headlines are taken from publishers' own RSS feeds —
            the headline, the publisher and a link, never the article. Direction is shown by an arrow and a signed
            number as well as by colour, so it reads the same without colour vision. Educational research only, not
            investment advice.
          </p>
        </>
      )}
    </>
  );
}
