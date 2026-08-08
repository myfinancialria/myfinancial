# myfinancial — Wealth OS for Resident Indians & NRIs

An enterprise-grade **financial planning, direct mutual fund, equity analytics, quantitative screening, advisory-signals and estate-planning platform**, built as a runnable full-stack product. Two demo personas (a Resident HNI and a Dubai-based NRI) exercise every journey end-to-end.

```bash
npm install
npm start          # → http://localhost:5599
```

**📈 Live public page:** [myfinancialria.github.io/myfinancial](https://myfinancialria.github.io/myfinancial/) — the **Daily Market Brief**, rebuilt automatically **every market weekday at 5:00 PM IST** by [`pages-daily.yml`](.github/workflows/pages-daily.yml) with real data: official AMFI NAVs for all ~2,400 Direct-Growth schemes (searchable), category leaders by real 3-year CAGR (mfapi.in), and index closes (Yahoo Finance). No keys, no server — pure GitHub Actions → GitHub Pages.

Node ≥ 22 required (uses built-in `node:sqlite`). No build step, no external services, no API keys needed to run.

---

## Module map (spec → code)

| # | Module | Server engine | UI |
|---|--------|--------------|-----|
| 1 | Financial intake, cash-flow ledger, balance sheet, net worth, DTI, insurance audit | `server/engines/planning.js` | Planning & Tax → Cash Flow / Balance Sheet / Insurance |
| 1 | Indian tax engine — **FY 2025-26 old vs new regime**, STCG 20% / LTCG 12.5%, surcharge (CG-capped), 87A + marginal relief, NRI rules, ranked savings recommendations | `server/engines/tax.js` | Planning & Tax → Tax Centre (live what-if sliders) |
| 1 | Multi-goal **Monte Carlo** (2,000 correlated equity/debt/gold paths, Cholesky), Goal Feasibility Index, required-SIP solver, glide-path allocation, rebalancing prompts | `server/engines/goals.js` | Planning & Tax → Goals · Dashboard rings · Goal Lab |
| 1 | **Will wizard** (Indian Succession Act conventions) + estate checklist; **AES-256-GCM vault** with per-user scrypt keys | `server/engines/estate.js`, `vault.js` | Will & Vault |
| 2 | Direct MF universe, factor metrics (**Sharpe, Sortino, Jensen's alpha, beta, SD, tracking error, rolling 3Y**), z-scored multi-factor category ranking, screener, SIP backtester (XIRR), **robo-advisory** questionnaire → model portfolios | `server/engines/funds.js` | Mutual Funds (+ `/robo`) |
| 3 | Fundamentals (8y annual + quarterly), health score, peer/industry benchmarking (P/E, P/B, EV/EBITDA vs sector medians), **automated SWOT**, **AI executive summary** — every sentence traceable to a computed number | `server/engines/equity.js` | Equities → any stock |
| 4 | **RRG** (JdK RS-Ratio × RS-Momentum, 8-week trails, sector → constituent drill-down), pattern detectors (double bottom, H&S, bull flag, cup & handle, ascending triangle) on fractal pivots with measured-move targets, **52-week weekly breakouts** (≥2× 20-wk volume) + watchlist tier, **Darvas boxes** | `server/engines/screeners.js` | Equities → Screeners |
| 5 | QARP long-term ideas (thesis + target + horizon), swing setups (**RR ≥ 1:2 enforced**, EMA/RSI aligned), intraday momentum picks, **HNI options desk** (iron condor / short strangle / straddle priced off the Black-Scholes chain with payoff diagrams, POP, breakevens), covered calls & cash-secured puts, **VIX-regime hedging** (puts / collar / futures overlay) | `server/engines/signals.js` | Advisory & Signals (HNI desk is segment-gated) |
| 6 | **Agentic assistant** — dual retrieval RAG: BM25 over a curated SEBI/tax/FEMA knowledge base **plus** tool-grounding that runs the real engines on the client's own data (tax compare, Monte Carlo, rankings). Citations on every answer; optional Claude adapter | `server/engines/assistant.js`, `server/data/knowledge.js` | ✨ floating drawer |

**Try the spec's own question** in the assistant: *“Can I achieve ₹5 crore in 12 years with my current SIPs?”* — it runs the Monte Carlo engine and answers with the feasibility index, percentile bands and required SIP, with knowledge-base citations.

## Equity intelligence & screeners

- **Light / dark theme** across the marketing site, app and /learn pages (☀︎/☾ toggle, shared via localStorage) with full colour semantics: **green = bullish, red = bearish**, everywhere from candles to heatmaps.
- **All NSE-listed stocks** (~2,000+): the official NSE symbol master is fetched & cached at boot; every symbol is searchable, chartable and quotable. The curated 60 get deep coverage; the rest get basic coverage until curated.
- **30+ ratios per company**: PEG, EV/Sales, Price/FCF, earnings yield, ROA, gross/operating margins, current/quick ratios, interest coverage, net-debt/EBITDA, working-capital days, promoter holding — plus bank-specific GNPA/NNPA/CASA/cost-to-income.
- **Industry Pulse** per sector: curated FY26 situation analysis (outlook, tailwinds, headwinds) fused with live stats (cycle quadrant, 1M/3M/1Y index moves, % of members above the 50-DMA).
- **Government Support & Budget** section per sector: PLI schemes, missions and Union Budget FY26 provisions, curated with a verification disclaimer.
- **Hero Products**: flagship products per covered company with indicative market share (Maruti's Brezza ~41% PV share, Fevicol ~70% adhesives, HAL's Tejas order book…).
- **Cyclical Graph** (evolved from RRG): sectors → **42 sub-sectors** (equal-weight composites) → constituent stocks, with multi-select sector filters and click-to-drill-down.
- **Chart patterns with confirmation stack**: every detection is scored 0–100 on breakout volume (≥1.5× 20-day), position vs **50-DMA and 200-DMA**, MA alignment — and validated against the stock's **sector cycle quadrant**.
- **Weinstein Stage Analysis** screener: weekly closes vs the 30-week MA classify every stock into Stage 1–4 with weeks-in-stage, MA slope and volume ratios.
- **Sector heatmap** and colour-coded dashboards throughout.

## Personas

| | Arjun Mehta | Meera Krishnan |
|---|---|---|
| Residency | Resident (Mumbai) | **NRI** (Dubai, UAE) |
| Segment | **HNI** — options desk unlocked | Retail — desk shows upgrade gate |
| Tax surface | Old-vs-new with home loan, F&O business income, 80C/80D/NPS, LTCG harvesting | Foreign salary excluded, **NRE interest exempt**, NRO TDS, **no 87A rebate**, DTAA/RNOR planning |
| Extras | ESOPs, 4 goals across all three verdicts | NRE/NRO accounts, FEMA panel, AED currency view |

## Architecture

```
public/  (zero-build SPA)                     server/
  js/core.js    store·router·fmt·ws            index.js         Express + WS + static
  js/charts.js  LW-Charts wrappers + SVG       routes/api.js    thin REST controllers
  js/views/*    one file per module            lib/             db(sqlite) · auth · util(seeded RNG, stats)
                                               data/            universe (60+ NSE stocks, 36 funds) · knowledge base
  TradingView Lightweight Charts (MIT)         engines/         market · funds · tax · planning · goals ·
  served from node_modules — no CDN                             equity · screeners · signals · estate · vault · assistant
```

- **Deterministic synthetic market data**: every OHLCV bar is a pure function of `(symbol, calendar date)` — seeded regime-GBM walks, level-anchored at a fixed date, with realistic volume signatures (expansion on 52-week breakouts). History never rewrites across restarts, exactly like a real feed. India VIX is a floored mean-reverting OU process; option chains are Black-Scholes priced off it with put skew; fund NAVs are benchmark-beta + skill-alpha − expense drag + tracking noise, so Sharpe/alpha/TE are *real computations*.
- **Persistence**: `node:sqlite` (`server/var/myfinancial.db`, auto-seeded on first boot; delete the folder to reset).
- **Auth**: HMAC-signed sessions; persona login. Swap `POST /api/login` for a Google OIDC code exchange in production — session issuance and everything downstream is unchanged.
- **Live ticks**: WebSocket `/ws` random-walks LTPs and streams batches; the dashboard holdings table and stock pages patch in place.

### Live market data — Upstox & FYERS (built in)

Broker adapters ship in `server/providers/`. Pick one and export its tokens:

```bash
# Upstox v2 (https://upstox.com/developer/api) — daily token from your app's OAuth flow
export MYFIN_PROVIDER=upstox
export UPSTOX_ACCESS_TOKEN=eyJ...

# or FYERS v3 (https://myapi.fyers.in) — appId + daily access token
export MYFIN_PROVIDER=fyers
export FYERS_APP_ID=XXXXXXXX-100
export FYERS_ACCESS_TOKEN=eyJ...

npm start
```

How it behaves: candles sync every 15 minutes and quotes every 5 seconds into an in-memory cache; the engines read the cache first and the deterministic synthetic feed backfills anything the broker window doesn't cover (deep history is spliced level-matched at the seam, so 10-year lookbacks keep working). Upstox instrument keys are resolved from their published NSE master (downloaded & cached — no hardcoded ISINs); FYERS symbols are derived (`NSE:RELIANCE-EQ`). Zero config → pure synthetic mode. Check `GET /api/providers/status` any time. Note broker tokens expire daily — refresh them via each broker's login flow.

### Live mutual-fund universe, goal baskets & rebalancing

Ports the pipeline from [`myfinancialria/myfinancial-advisor`](https://github.com/myfinancialria/myfinancial-advisor):
- **All-India universe** (`server/providers/amfi.js`): official **AMFI NAVAll** (≈2,400+ Direct-Growth schemes, cached 12h) → advisor's category taxonomy → **mfapi.in** enrichment (1/3/5-yr CAGR + volatility, cached, politeness-throttled with a boot warmup) → per-category 1–5★ ranking. Screener with search/category/asset-class/rating filters lives at **Mutual Funds → All-India Live**; any scheme opens its full NAV history chart.
- **Goal baskets** (`server/engines/baskets.js`, robo.py port): SEBI-style risk band + years-to-goal → glide-path-capped equity/debt/gold (money needed soon can't ride the market) → top-ranked live funds per sleeve (synthetic curated funds as offline fallback) → units bought at NAV.
- **Rebalancing**: drift vs target weights with **fresh-SIP-first** orders — sell only beyond the ±5% threshold, with LTCG (₹1.25L exemption) and exit-load warnings on every plan.

### SEO content engine & /learn

Server-rendered, crawler-first pages: **`/learn`** (index) and **`/learn/<slug>`** with meta description, canonical, OpenGraph, `Article` + `FAQPage` JSON-LD, plus **`/sitemap.xml`** and **`/robots.txt`**. Eight articles seed automatically at boot from the **grounded composer** — plain-English pieces whose every number comes from the live engines (tax comparisons, top-fund tables from AMFI data, SIP math), written for the common Indian investor.

Optional LLM layer via **AIMLAPI** (OpenAI-compatible):

```bash
export AIMLAPI_KEY=sk-...
export AIMLAPI_MODEL=gpt-4o-mini   # optional, default shown
# then, authenticated: POST /api/seo/regenerate        (all articles)
#                      POST /api/seo/regenerate {"slug":"..."}  (one)
```

The LLM receives the pre-computed facts and expands the copy — numbers and fund names are contractually locked in the prompt; without a key the grounded composer output stands. Fund detail pages also carry a "🗣️ In plain words" interpretation generated from the same engine.

### Other production notes

Public redistribution of real-time NSE/BSE data requires an exchange licence (broker APIs above are licensed for your own use). Vendors like Global Datafeeds/TrueData offer redistribution-licensed feeds behind the same provider interface.

### AI assistant LLM adapter

Grounded answers are composed deterministically (so the demo needs no keys). Set `ANTHROPIC_API_KEY` (and optionally `MYFIN_LLM_MODEL`, default `claude-sonnet-5`) and the same grounded context is verbalised by Claude instead — numbers, verdicts and citations are locked by contract in the prompt.

## Security & compliance posture

- **Vault**: AES-256-GCM, 96-bit random IV + auth tag per document, per-user scrypt-derived keys (`MYFIN_SECRET` env; envelope-encrypt with KMS in production). Tampered ciphertext fails decryption.
- **Transport**: TLS 1.3 terminates at the edge proxy in production; security headers set on every response.
- **DPDP alignment**: consent-scoped demo data, erasure via vault delete, no third-party calls, breach-notification duty documented in the knowledge base.
- **SEBI separation**: every signal, ranking and AI answer carries an explicit *information vs advice* disclaimer; the platform does not present itself as an RIA. F&O risk disclosures shown on the desk.
- **Currency**: primary INR with lakh/crore formatting; instant USD/AED/SGD/GBP/EUR conversion for NRIs (top-bar selector).

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `5599` | HTTP + WS port |
| `MYFIN_SECRET` | dev value | Session HMAC + vault KDF master — **set in production** |
| `MYFIN_PROVIDER` | `synthetic` | Market feed: `upstox` \| `fyers` \| `synthetic` |
| `UPSTOX_ACCESS_TOKEN` | unset | Upstox v2 daily access token |
| `FYERS_APP_ID` / `FYERS_ACCESS_TOKEN` | unset | FYERS v3 credentials |
| `AIMLAPI_KEY` | unset | Enables LLM enhancement of /learn articles (aimlapi.com) |
| `AIMLAPI_MODEL` | `gpt-4o-mini` | AIMLAPI model id |
| `ANTHROPIC_API_KEY` | unset | Enables Claude verbalisation in the assistant |
| `MYFIN_LLM_MODEL` | `claude-sonnet-5` | Assistant model id |

## Disclaimers

Educational demo. All market data is synthetically generated; all analytics, rankings, signals and AI output are informational model outputs, **not** investment advice under the SEBI (Investment Advisers) Regulations, 2013, and not a substitute for a Chartered Accountant or a lawyer. Derivatives carry substantial risk.
