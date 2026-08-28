import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { Card, Label, Chip } from "./ui";
import { Reveal } from "./motion";
import { arrow, dirTone, signed } from "./Market";
import type { ArticleSection } from "../lib/data";

/* ---------------------------------------------------------------------------
   The written brief.

   Set as prose, not as another card of figures: a wider leading, a real
   reading measure, and generous space between paragraphs. The point is that
   somebody can read it top to bottom in a minute and know what happened,
   without having to interpret a single table.

   Every sentence is generated from a number shown elsewhere on the page, so
   the prose and the data can never drift apart.
--------------------------------------------------------------------------- */

export default function Article({ sections }: { sections: ArticleSection[] }) {
  if (!sections?.length) return null;

  return (
    <Reveal className="mt-6">
      <Card>
        <div className="border-b border-line px-5 py-3.5 sm:px-8">
          <Label>In plain English</Label>
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <div className="max-w-[68ch]">
            {sections.map((s, si) => (
              <motion.section key={s.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: Math.min(si, 5) * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className="mb-8 last:mb-0">
                <h3 className="text-[15px] font-bold tracking-tight">{s.heading}</h3>

                {s.lead && (
                  <p className="mt-1.5 text-[12.5px] italic leading-relaxed text-ink-faint">{s.lead}</p>
                )}

                {/* The channel chips give the reader the shape of the argument
                    before the sentences explain it. */}
                {s.channels && s.channels.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.channels.map((c) => (
                      <span key={c.channel}
                        className="inline-flex items-baseline gap-1.5 border border-line-2 px-2 py-1 text-[11px]">
                        <span className="text-ink-dim">{c.channel}</span>
                        {c.level && <span className="tnum text-ink">{c.level}</span>}
                        {c.move !== null && (
                          <span className={`tnum font-semibold ${dirTone(c.move)}`}>
                            <span aria-hidden className="mr-0.5">{arrow(c.move)}</span>{signed(c.move, 1)}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 space-y-3.5">
                  {s.paras.map((p, i) => (
                    <p key={i} className="text-[14px] leading-[1.75] text-ink-dim">{p}</p>
                  ))}
                </div>
              </motion.section>
            ))}
          </div>

          <p className="mt-9 max-w-[68ch] border-t border-line pt-4 text-[11.5px] leading-relaxed text-ink-faint">
            Written from the figures on this page by a fixed set of rules, not by a language model — the same
            numbers always produce the same words, and every claim can be checked against the data beside it.
            It explains how one market reaches another; it does not forecast what any of them will do next.
          </p>
        </div>
      </Card>
    </Reveal>
  );
}

/** Companies big enough to move the index that are also in today's news. */
export function Watchlist({ items }: { items: { symbol: string; name: string; sample: string; marketCapCr: number | null; sector: string | null; heavyweight: boolean; headlines: number }[] }) {
  if (!items?.length) return null;
  const cr = (v: number | null) =>
    v === null ? "—" : v >= 100000 ? `₹${(v / 100000).toFixed(2)}L cr` : `₹${Math.round(v).toLocaleString("en-IN")} cr`;

  return (
    <div className="divide-y divide-line">
      {items.map((w) => (
        <Link key={w.symbol} to={`/company/${encodeURIComponent(w.symbol)}`}
          className="block px-5 py-3.5 transition-colors hover:bg-ink/[0.03]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold">{w.name}</span>
            <span className="flex items-center gap-2">
              {w.heavyweight && <Chip tone="accent">index heavyweight</Chip>}
              <span className="font-mono text-[10.5px] text-ink-faint tnum">{cr(w.marketCapCr)}</span>
            </span>
          </div>
          <div className="mt-1 text-[12.5px] leading-snug text-ink-dim">{w.sample}</div>
          <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-faint">
            {w.symbol}{w.sector ? ` · ${w.sector}` : ""}{w.headlines > 1 ? ` · ${w.headlines} headlines` : ""}
          </div>
        </Link>
      ))}
    </div>
  );
}
