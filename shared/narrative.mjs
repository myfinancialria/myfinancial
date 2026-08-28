// ---------------------------------------------------------------------------
// narrative.mjs — the plain-English article that sits on top of the numbers.
//
// WHAT THIS WILL AND WILL NOT SAY
//
// It describes what happened and explains the MECHANISM by which one market
// touches another. It never predicts. "Brent is up 3%, and India imports
// about 85% of its crude, so a sustained rise widens the import bill" is a
// fact and a mechanism. "Nifty will open lower" is a forecast, and this file
// does not make them — not because forecasts are hard, but because a page
// that quietly mixes them in with measured data teaches a reader to trust
// both equally.
//
// Every sentence is generated from a number that is on the page beside it, so
// a reader can check the claim against the figure. Nothing is written by a
// language model: this is a pure function of the data, which is why it can run
// unattended three times a day and be the same prose for the same numbers.
//
// Jargon is either avoided or explained in the sentence that uses it. The
// reader this is written for knows what a share is and not much more.
// ---------------------------------------------------------------------------

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const pc = (v, d = 1) => (isNum(v) ? `${v > 0 ? "up " : v < 0 ? "down " : ""}${Math.abs(v).toFixed(d)}%` : "—");
const signed = (v, d = 2) => (isNum(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%` : "—");
const n0 = (v) => (isNum(v) ? Math.round(v).toLocaleString("en-IN") : "—");
const find = (list, key) => (list ?? []).find((q) => q.key === key);
const list = (xs) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** Same, but for a truncated list — "A, B, C and others", never "B and C and others". */
const listMore = (xs, max) => (xs.length <= max ? list(xs) : `${xs.slice(0, max).join(", ")} and others`);

/** "up sharply" / "a little lower" — a size word, so the reader need not read the number. */
function size(pct) {
  const a = Math.abs(pct ?? 0);
  if (a >= 2) return "sharply";
  if (a >= 1) return "notably";
  if (a >= 0.3) return "modestly";
  return "barely";
}

/* ===========================================================================
   How one market reaches another.

   Each rule states a mechanism that is true whether or not it fired today,
   and only appears when the number crossed a level where it starts to matter.
   The wording deliberately stops at "this is the channel" — what the market
   does with it is not something this page claims to know.
=========================================================================== */
export function transmission({ global = [], macro = [], india = [] } = {}) {
  const out = [];
  const q = (k) => find(global, k) ?? find(macro, k) ?? find(india, k);

  const brent = q("WTI crude") ?? q("Brent crude");
  if (brent && Math.abs(brent.pct) >= 1.5) {
    const up = brent.pct > 0;
    out.push({
      channel: "Crude oil", level: `$${brent.price}`, move: brent.pct,
      text: up
        ? `Crude is ${pc(brent.pct)}. India buys about 85% of the oil it uses from abroad, so a sustained rise makes the country's import bill bigger and tends to weigh on the rupee. It also raises costs for anyone who turns oil into something else — paint, tyres, plastics — and squeezes the state fuel retailers, who cannot always raise pump prices to match. Companies that pump oil out of the ground earn more.`
        : `Crude is ${pc(brent.pct)}. Because India imports most of its oil, a fall is broadly helpful: a smaller import bill, less pressure on the rupee, and cheaper raw material for paint, tyre and plastics makers. The state fuel retailers keep more of the margin between what they pay and what they charge.`,
    });
  }

  const dxy = q("Dollar index");
  if (dxy && Math.abs(dxy.pct) >= 0.4) {
    const up = dxy.pct > 0;
    out.push({
      channel: "The dollar", level: String(dxy.price), move: dxy.pct,
      text: up
        ? `The dollar is ${pc(dxy.pct)} against other major currencies. When the dollar strengthens, money parked in countries like India is worth less once converted back, so foreign funds often take some off the table — and the rupee tends to weaken.`
        : `The dollar is ${pc(dxy.pct)}. A softer dollar usually makes markets like India more attractive to foreign investors, because returns are worth more once converted back home.`,
    });
  }

  const ust = q("US 10-year");
  if (ust && Math.abs(ust.pct) >= 1.5) {
    const up = ust.pct > 0;
    out.push({
      channel: "US interest rates", level: `${ust.price}%`, move: ust.pct,
      text: up
        ? `The interest the US government pays to borrow for ten years has risen to ${ust.price}%. That is the safest return available anywhere, so when it goes up, money has less reason to travel to riskier markets — and companies valued on profits far in the future look dearer.`
        : `The ten-year US government borrowing rate has eased to ${ust.price}%. A lower safe return abroad usually makes riskier markets, India among them, comparatively more appealing.`,
    });
  }

  const us = ["S&P 500", "Nasdaq", "Dow Jones"].map((k) => q(k)).filter(Boolean);
  if (us.length) {
    const avg = us.reduce((a, x) => a + (x.pct ?? 0), 0) / us.length;
    if (Math.abs(avg) >= 0.6) {
      out.push({
        channel: "Wall Street", level: null, move: avg,
        text: avg < 0
          ? `American markets closed ${pc(avg)} overnight. Two things usually follow. Indian technology companies earn most of their money from American clients, so weakness there tends to show up in them first. And a nervous night abroad often means Indian shares open lower before finding their own footing.`
          : `American markets closed ${pc(avg)} overnight. A good night on Wall Street tends to lift the mood at the Indian open, and it particularly helps Indian technology companies, whose customers are largely American.`,
      });
    }
  }

  const asia = ["Nikkei 225", "Hang Seng", "Kospi"].map((k) => q(k)).filter(Boolean);
  if (asia.length >= 2) {
    const avg = asia.reduce((a, x) => a + (x.pct ?? 0), 0) / asia.length;
    if (Math.abs(avg) >= 0.6) {
      out.push({
        channel: "Asian markets", level: null, move: avg,
        text: `Asian markets are trading ${pc(avg)} this morning — ${list(asia.map((a) => `${a.key} ${signed(a.pct)}`))}. These are open while India is, so they are the closest live read on how the region feels today, rather than a snapshot from last night.`,
      });
    }
  }

  const gold = q("Gold");
  if (gold && gold.pct >= 1.2) {
    out.push({
      channel: "Gold", level: `$${gold.price}`, move: gold.pct,
      text: `Gold is ${pc(gold.pct)}. Money usually moves into gold when investors want somewhere safe to sit, so a sharp rise is worth noticing as a mood signal even if you own none of it.`,
    });
  }

  const vix = q("INDIA VIX");
  if (vix && isNum(vix.price)) {
    const hot = vix.price >= 18;
    out.push({
      channel: "Expected swings", level: String(vix.price), move: vix.pct,
      text: hot
        ? `India VIX is at ${vix.price}. This is the market's own estimate of how much it expects to move, and at this level it is braced for a bumpy stretch rather than a quiet one.`
        : `India VIX is at ${vix.price}, which is calm. The market is not currently pricing in large daily swings.`,
    });
  }
  return out;
}

/* --------------------------- shared components --------------------------- */
// Rupee crore, written the way an Indian reader writes it. No "5.0k crore".
const cr = (v) => (isNum(v) ? `₹${Math.round(Math.abs(v)).toLocaleString("en-IN")} crore` : "—");
const uniq = (xs) => [...new Set(xs)];

/** "Who is driving the tape" — the two institutional flows, in plain terms. */
export function flowsSection(flows) {
  if (!flows?.length) return null;
  const d = flows[0];
  const fii = d.fii?.net, dii = d.dii?.net;
  if (!isNum(fii) && !isNum(dii)) return null;

  const paras = [];
  const side = (v) => (v > 0 ? "bought" : v < 0 ? "sold" : "were flat");
  paras.push(
    `On ${d.date}, foreign investors ${side(fii)} ${cr(fii)} of Indian shares and domestic institutions ${side(dii)} ${cr(dii)}. ` +
    `Foreign investors are overseas funds; domestic institutions are mostly Indian mutual funds and insurers, which is largely your neighbours' monthly SIP money arriving.`,
  );
  if (isNum(fii) && isNum(dii)) {
    if (fii < 0 && dii > 0) paras.push(`They were on opposite sides — foreigners taking money out while domestic funds put it in. Domestic buying has repeatedly cushioned foreign selling in recent years, which is why heavy outflows no longer knock the market the way they once did.`);
    else if (fii > 0 && dii > 0) paras.push(`Both were buyers, which is the most supportive combination for the market.`);
    else if (fii < 0 && dii < 0) paras.push(`Both were sellers. That is the least supportive combination, because there is no domestic bid absorbing the foreign exit.`);
    else if (fii > 0 && dii < 0) paras.push(`Foreigners were buying while domestic funds took some off the table.`);
  }
  const run = flows.filter((x) => isNum(x.fii?.net));
  if (run.length >= 3) {
    const neg = run.filter((x) => x.fii.net < 0).length;
    if (neg === run.length) paras.push(`Foreign investors have now sold on each of the last ${run.length} sessions shown.`);
    else if (neg === 0) paras.push(`Foreign investors have bought on each of the last ${run.length} sessions shown.`);
  }
  return { id: "flows", heading: "Who is driving the tape — FII and DII flows", paras };
}

/** Reference levels, framed as arithmetic rather than prediction. */
export function levelsSection(levels) {
  const rows = (levels ?? []).filter((l) => l.pivots);
  if (!rows.length) return null;
  const n = rows[0];
  return {
    id: "levels", heading: "Reference levels for the session",
    paras: [
      `These come from one published formula applied to yesterday's high, low and close — the same arithmetic every desk runs, which is what makes the numbers mildly self-fulfilling. They are markers, not targets.`,
      `For the ${n.index}, yesterday's range puts the midpoint at ${n0(n.pivots.pivot)}. The first level above is ${n0(n.pivots.r1)} and the first below is ${n0(n.pivots.s1)}; beyond those sit ${n0(n.pivots.r2)} and ${n0(n.pivots.s2)}.`,
      `A price pushing through one of these tends to draw attention from traders watching the same numbers. It says nothing about whether the move is justified.`,
    ],
  };
}

/** Everything the exchange has told us is scheduled. */
export function calendarSection(events, forDate) {
  const list_ = events ?? [];
  if (!list_.length) return null;
  const todayMs = Date.parse(`${forDate}T00:00:00Z`);
  const today = list_.filter((e) => e.ms === todayMs);
  const results = list_.filter((e) => e.isResult);
  const paras = [];
  if (today.length) {
    paras.push(`${today.length} ${today.length === 1 ? "company has" : "companies have"} a board meeting today: ${listMore(uniq(today.map((e) => e.symbol)), 8)}. Boards meet to approve results, dividends or fundraising, and the share often moves on what they decide.`);
  }
  if (results.length) {
    paras.push(`${results.length} ${results.length === 1 ? "company reports" : "companies report"} results in the next week: ${listMore(uniq(results.map((e) => e.symbol)), 8)}. Results days are the most reliable source of large single-stock moves.`);
  }
  if (!paras.length) return null;
  return { id: "calendar", heading: "What is scheduled", paras };
}

/** The sources, named. */
export function sourcesSection() {
  return {
    id: "sources", heading: "Where these numbers come from",
    paras: [
      `Indian index levels, market breadth, corporate actions, board meetings and institutional flows: the National Stock Exchange. Company prices and the day's movers: the exchange's official end-of-day file, or live prices before it is published.`,
      `World indices, commodities and US interest rates: CNBC's public quote service. Reference exchange rates: the European Central Bank, via Frankfurter.`,
      `Headlines are taken from publishers' own feeds and link back to them — the headline and the publisher only, never the article.`,
    ],
  };
}

/* ============================== pre-market ================================ */
export function preMarketArticle(d) {
  const secs = [];
  const g = d.global ?? [], m = d.macro ?? [], ind = d.india ?? [];
  const q = (k) => find(g, k) ?? find(m, k) ?? find(ind, k);
  const closed = d.marketOpen === false;

  /* --- the short version --- */
  const us = ["S&P 500", "Nasdaq", "Dow Jones"].map(q).filter(Boolean);
  const usAvg = us.length ? us.reduce((a, x) => a + (x.pct ?? 0), 0) / us.length : null;
  const asia = ["Nikkei 225", "Hang Seng", "Kospi"].map(q).filter(Boolean);
  const asiaAvg = asia.length ? asia.reduce((a, x) => a + (x.pct ?? 0), 0) / asia.length : null;
  const nifty = find(ind, "NIFTY 50");

  const lead = [];
  if (isNum(usAvg)) lead.push(`America finished ${pc(usAvg)} overnight`);
  if (isNum(asiaAvg)) lead.push(`Asia is trading ${pc(asiaAvg)} this morning`);
  const brent = q("WTI crude") ?? q("Brent crude");
  if (brent) lead.push(`crude is ${pc(brent.pct)} at $${brent.price}`);

  const short = [];
  if (lead.length) short.push(`${lead.map((s, i) => (i ? s : s[0].toUpperCase() + s.slice(1))).join(", ")}.`);
  if (closed) {
    short.push(`Indian markets are shut today${d.closedReason ? ` for ${d.closedReason}` : ""}, so nothing below will trade until the next session. The overnight moves still matter — they will be waiting when the market reopens.`);
  } else if (nifty) {
    short.push(`The Nifty 50 — the index of India's fifty largest listed companies — closed its last session at ${n0(nifty.price)}.`);
  }
  if (short.length) secs.push({ id: "short", heading: "The short version", paras: short });

  /* --- what happened overnight --- */
  const overnight = [];
  if (us.length) {
    overnight.push(`American markets closed while India was asleep: ${list(us.map((x) => `${x.key} ${signed(x.pct)}`))}. These are last night's closing figures, not live prices — the US market is shut now.`);
  }
  if (asia.length) {
    overnight.push(`Asian markets are open as you read this: ${list(asia.map((x) => `${x.key} ${signed(x.pct)}`))}. Because they trade in roughly the same hours as India, they are the freshest signal of regional mood available before the Indian open.`);
  }
  const eu = ["FTSE 100", "DAX"].map(q).filter(Boolean);
  if (eu.length) {
    overnight.push(`Europe has not opened yet — ${list(eu.map((x) => `${x.key} ${signed(x.pct)}`))} are yesterday's closes. European trading begins around 12:30 in the afternoon, Indian time.`);
  }
  if (overnight.length) secs.push({ id: "overnight", heading: "What happened while India slept", paras: overnight });

  /* --- global → India --- */
  const chans = transmission({ global: g, macro: m, india: ind });
  if (chans.length) {
    secs.push({
      id: "transmission",
      heading: "How global markets traded — and what it means for India",
      lead: "These are the routes by which something that happened abroad turns into a price change here. They describe the connection, not what the market will do with it.",
      paras: chans.map((c) => c.text),
      channels: chans.map((c) => ({ channel: c.channel, level: c.level, move: c.move })),
    });
  }

  /* --- what to watch --- */
  const watch = [];
  if ((d.watchlist ?? []).length) {
    watch.push(`These are the companies large enough to move the whole index that are also in this morning's news. A big company moving a lot pulls the index with it; a small one, however dramatic the story, mostly does not.`);
  }
  if ((d.corporateActions ?? []).length) {
    const today = d.corporateActions.filter((a) => a.exDate && d.forDate && a.exMs === Date.parse(`${d.forDate}T00:00:00Z`));
    if (today.length) {
      watch.push(`${today.length} ${today.length === 1 ? "company goes" : "companies go"} ex-dividend today: ${listMore(uniq(today.map((a) => a.symbol)), 6)}. On the ex-date a share opens lower by roughly the dividend, because a buyer from today does not receive it. That drop is arithmetic, not the market's opinion of the company.`);
    } else {
      watch.push(`Nothing goes ex-dividend today. When a company does, its share price drops by about the dividend on that morning — that fall is mechanical and not a verdict on the business.`);
    }
  }
  if (watch.length) secs.push({ id: "watch", heading: "What to watch in today's session", paras: watch });

  /* --- the new sections, in the order a reader wants them --- */
  const flows = flowsSection(d.flows);
  if (flows) secs.splice(3, 0, flows);
  const levels = levelsSection(d.levels);
  if (levels) secs.push(levels);
  const cal = calendarSection(d.events, d.forDate);
  if (cal) secs.push(cal);

  /* --- bottom line --- */
  const bl = [];
  if (closed) bl.push(`Markets are shut today${d.closedReason ? ` for ${d.closedReason}` : ""}. Nothing above trades until the next session.`);
  else {
    const bits = [];
    if (isNum(usAvg)) bits.push(`Wall Street ${pc(usAvg)}`);
    if (isNum(asiaAvg)) bits.push(`Asia ${pc(asiaAvg)}`);
    const br = q("WTI crude") ?? q("Brent crude");
    if (br) bits.push(`crude ${pc(br.pct)}`);
    const f = (d.flows ?? [])[0];
    if (f && isNum(f.fii?.net)) bits.push(`foreign investors ${f.fii.net > 0 ? "buyers" : "sellers"} last session`);
    if (bits.length) bl.push(`${bits.join(", ")}.`);
    bl.push(`Nothing here predicts the day. It tells you what the market is walking into, which is the part you can actually know before the bell.`);
  }
  secs.push({ id: "bottom", heading: "Bottom line", paras: bl });
  secs.push(sourcesSection());

  return secs;
}

/* ============================== post-market =============================== */
export function postMarketArticle(d) {
  const secs = [];
  const idx = d.indices ?? [];
  const nifty = find(idx, "NIFTY 50") ?? idx[0];
  const b = d.breadth;
  const closed = d.marketOpen === false;

  if (closed) {
    return [{
      id: "closed", heading: "No session today",
      paras: [`Indian markets were shut${d.closedReason ? ` for ${d.closedReason}` : ""}, so there is no session to report. The last one ran on ${d.lastSession ?? "the previous trading day"}. World markets kept trading, and the headlines below are current.`],
    }];
  }

  /* --- the short version --- */
  const short = [];
  if (nifty) {
    short.push(`The Nifty 50 finished ${size(nifty.pct)} ${nifty.pct >= 0 ? "higher" : "lower"} at ${n0(nifty.price)}, ${signed(nifty.pct)} on the day.`);
  }
  if (b) {
    const total = b.advances + b.declines + b.unchanged;
    const share = total ? Math.round((b.advances / total) * 100) : 0;
    short.push(`Of the ${n0(total)} companies counted, ${n0(b.advances)} rose and ${n0(b.declines)} fell — ${share}% of them ended the day higher.`);
    if (nifty && isNum(nifty.pct)) {
      const narrow = nifty.pct > 0.2 && share < 45;
      const broad = nifty.pct > 0.2 && share > 60;
      const resilient = nifty.pct < -0.2 && share > 55;
      if (narrow) short.push(`That is worth pausing on: the index rose while most shares fell. When that happens the gain is being carried by a handful of very large companies rather than by the market as a whole.`);
      else if (broad) short.push(`The gain was broad — most shares joined in, not just the biggest few.`);
      else if (resilient) short.push(`Curiously, the index fell while most shares rose. The drop is coming from a few large companies rather than from weakness everywhere.`);
    }
  }
  if (d.basis === "PROVISIONAL") {
    short.push(`These are live figures taken after the close. The exchange publishes its official file around half past six in the evening, and this page rebuilds on it at nine — small differences between the two are normal.`);
  }
  if (short.length) secs.push({ id: "short", heading: "How the market behaved today", paras: short });

  /* --- sectors --- */
  const sec = d.sectors ?? [];
  if (sec.length >= 3) {
    const top = sec[0], bot = sec[sec.length - 1];
    const paras = [
      `${top.sector} led the day at ${signed(top.pct)}, and ${bot.sector} lagged at ${signed(bot.pct)}. A sector index simply groups companies doing similar work, so this shows which parts of the economy investors favoured today.`,
    ];
    const spread = (top.pct ?? 0) - (bot.pct ?? 0);
    paras.push(spread >= 2
      ? `The gap between best and worst was wide — ${spread.toFixed(1)} percentage points — which usually means money moved between sectors rather than in or out of the market as a whole.`
      : `The spread between best and worst was narrow, so the day was less about choosing between sectors and more about the market moving together.`);
    secs.push({ id: "sectors", heading: "Sectors — winners and losers", paras });
  }

  /* --- movers --- */
  const gain = d.gainers ?? [], lose = d.losers ?? [];
  if (gain.length || lose.length) {
    const paras = [];
    if (gain.length) paras.push(`The biggest riser among the Nifty 500 was ${gain[0].name} at ${signed(gain[0].pct)}${gain[1] ? `, followed by ${gain[1].name} at ${signed(gain[1].pct)}` : ""}.`);
    if (lose.length) paras.push(`The steepest fall was ${lose[0].name} at ${signed(lose[0].pct)}${lose[1] ? `, then ${lose[1].name} at ${signed(lose[1].pct)}` : ""}.`);
    paras.push(`A single day's move is not by itself a reason to buy or sell. Large moves usually have a cause — results, an order, a downgrade, a corporate action — and the headlines below are where to start looking for it.`);
    secs.push({ id: "movers", heading: "Stocks that moved the market", paras });
  }

  /* --- volume --- */
  if ((d.volume ?? []).length) {
    secs.push({
      id: "volume", heading: "Where trading was unusually heavy",
      paras: [`These shares changed hands at least twice as often as they normally do. Heavy volume means an unusual number of people wanted in or out, which makes the day's price move more meaningful than the same move on a quiet day.`],
    });
  }

  const flows = flowsSection(d.flows);
  if (flows) secs.push(flows);

  /* --- setup for tomorrow --- */
  const setup = [];
  const ex = (d.corporateActions ?? []).filter((a) => a.exMs && a.exMs > Date.parse(`${d.forDate}T00:00:00Z`));
  if (ex.length) setup.push(`${ex.length} ${ex.length === 1 ? "company goes" : "companies go"} ex-dividend or ex-bonus in the coming sessions, starting with ${listMore(uniq(ex.map((a) => a.symbol)), 5)}. Those shares will open lower by roughly the amount involved, which is arithmetic rather than selling.`);
  const res = (d.events ?? []).filter((e) => e.isResult);
  if (res.length) setup.push(`${res.length} ${res.length === 1 ? "company reports" : "companies report"} results shortly: ${listMore(uniq(res.map((e) => e.symbol)), 8)}.`);
  setup.push(`The next session takes its first cue from how America closes tonight and how Asia opens in the morning. Both are in the pre-market brief here at 8am.`);
  secs.push({ id: "setup", heading: "Setup for tomorrow", paras: setup });
  secs.push(sourcesSection());

  return secs;
}
