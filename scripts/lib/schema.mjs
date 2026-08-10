// ---------------------------------------------------------------------------
// schema.mjs — the single definition of every field the screener knows about.
//
// One list drives three things that would otherwise drift apart:
//   • which columns the build writes into the index
//   • which filters the UI offers, and how it formats/labels them
//   • the order and grouping the field picker presents
//
// Field properties:
//   key     property name on a row
//   label   what a human sees
//   group   the section it appears under in the filter and column pickers
//   unit    "%" | "x" | "₹" | "₹cr" | "n" | "" — drives formatting
//   dir     1  higher is better · -1 lower is better · 0 neither
//   type    "num" | "bool" | "cat" | "text"
//   col     true if it is one of the default visible columns
//   help    a one-line plain-English explanation shown on hover
// ---------------------------------------------------------------------------

export const STOCK_FIELDS = [
  // ---------------------------------- identity ------------------------------
  // `name` is column one and renders the symbol beneath it, so `symbol` is a
  // filterable field but not a default column — it would just repeat itself.
  { key: "name", label: "Company", group: "Company", type: "text", col: true },
  { key: "symbol", label: "Symbol", group: "Company", type: "text" },
  { key: "sector", label: "Sector", group: "Company", type: "cat", col: true },
  { key: "industry", label: "Industry", group: "Company", type: "cat" },
  { key: "nseTier", label: "NSE index tier", group: "Company", type: "cat", col: true, help: "Which broad NSE index the company belongs to — the exchange's own size and liquidity classification, not a threshold we chose." },
  { key: "inNifty50", label: "In NIFTY 50", group: "Company", type: "bool", dir: 1 },
  { key: "inNifty500", label: "In NIFTY 500", group: "Company", type: "bool", dir: 1 },
  { key: "sectorIndex", label: "Sector index", group: "Company", type: "cat", help: "The NSE sector index this company is a constituent of, if any." },
  { key: "capTier", label: "Size by market cap", group: "Company", type: "cat", help: "Mega ≥ ₹1L cr · Large ≥ ₹20k cr · Mid ≥ ₹5k cr · Small ≥ ₹500 cr · Micro below that" },

  // ----------------------------------- price --------------------------------
  { key: "price", label: "Price", group: "Price", unit: "₹", dir: 0, type: "num", col: true },
  { key: "change1d", label: "1-day", group: "Price", unit: "%", dir: 1, type: "num", col: true },
  { key: "ret1w", label: "1-week", group: "Price", unit: "%", dir: 1, type: "num" },
  { key: "ret1m", label: "1-month", group: "Price", unit: "%", dir: 1, type: "num" },
  { key: "ret3m", label: "3-month", group: "Price", unit: "%", dir: 1, type: "num", col: true },
  { key: "ret6m", label: "6-month", group: "Price", unit: "%", dir: 1, type: "num" },
  { key: "ret1y", label: "1-year", group: "Price", unit: "%", dir: 1, type: "num", col: true },
  { key: "ret3y", label: "3-year CAGR", group: "Price", unit: "%", dir: 1, type: "num" },
  { key: "ret5y", label: "5-year CAGR", group: "Price", unit: "%", dir: 1, type: "num" },

  // -------------------------------- valuation -------------------------------
  { key: "marketCapCr", label: "Market cap", group: "Valuation", unit: "₹cr", dir: 0, type: "num", col: true },
  { key: "pe", label: "P/E", group: "Valuation", unit: "x", dir: -1, type: "num", col: true, help: "Price paid for ₹1 of yearly profit. Lower is cheaper — but cheap often means the market expects trouble." },
  { key: "forwardPe", label: "Forward P/E", group: "Valuation", unit: "x", dir: -1, type: "num", help: "P/E on next year's expected earnings." },
  { key: "pb", label: "P/B", group: "Valuation", unit: "x", dir: -1, type: "num", col: true, help: "Price against the net assets on the books." },
  { key: "pegRatio", label: "PEG", group: "Valuation", unit: "x", dir: -1, type: "num", help: "P/E divided by growth. Below 1 is the classic 'growth at a reasonable price' marker." },
  { key: "priceToSales", label: "P/S", group: "Valuation", unit: "x", dir: -1, type: "num" },
  { key: "evEbitda", label: "EV/EBITDA", group: "Valuation", unit: "x", dir: -1, type: "num", help: "Whole-business value against operating cash profit — comparable across debt levels." },
  { key: "earningsYieldPct", label: "Earnings yield", group: "Valuation", unit: "%", dir: 1, type: "num", help: "The inverse of P/E. Compare it against a fixed deposit rate." },
  { key: "dividendYieldPct", label: "Dividend yield", group: "Valuation", unit: "%", dir: 1, type: "num" },
  { key: "peVsSector", label: "P/E vs sector", group: "Valuation", unit: "%", dir: -1, type: "num", help: "How far the P/E sits from the median of its own sector. Negative = cheaper than peers." },

  // ------------------------------ profitability -----------------------------
  { key: "roe", label: "ROE", group: "Profitability", unit: "%", dir: 1, type: "num", col: true, help: "Profit earned on shareholders' own money." },
  { key: "roce", label: "ROCE", group: "Profitability", unit: "%", dir: 1, type: "num", help: "Return on all capital employed, borrowed money included." },
  { key: "roa", label: "ROA", group: "Profitability", unit: "%", dir: 1, type: "num" },
  { key: "profitMarginPct", label: "Net margin", group: "Profitability", unit: "%", dir: 1, type: "num" },
  { key: "operatingMarginPct", label: "Operating margin", group: "Profitability", unit: "%", dir: 1, type: "num" },
  { key: "grossMarginPct", label: "Gross margin", group: "Profitability", unit: "%", dir: 1, type: "num" },
  { key: "ebitdaMarginPct", label: "EBITDA margin", group: "Profitability", unit: "%", dir: 1, type: "num" },
  { key: "roeVsSector", label: "ROE vs sector", group: "Profitability", unit: "%", dir: 1, type: "num" },

  // --------------------------------- growth ---------------------------------
  { key: "revenueGrowthPct", label: "Revenue growth", group: "Growth", unit: "%", dir: 1, type: "num" },
  { key: "earningsGrowthPct", label: "Earnings growth", group: "Growth", unit: "%", dir: 1, type: "num" },
  { key: "revenueCr", label: "Revenue", group: "Growth", unit: "₹cr", dir: 1, type: "num" },
  { key: "eps", label: "EPS", group: "Growth", unit: "₹", dir: 1, type: "num" },

  // ------------------------------ balance sheet -----------------------------
  { key: "debtToEquity", label: "Debt / Equity", group: "Balance sheet", unit: "x", dir: -1, type: "num", help: "Borrowings against own funds. Above 1 means more debt than equity." },
  { key: "currentRatio", label: "Current ratio", group: "Balance sheet", unit: "x", dir: 1, type: "num" },
  { key: "quickRatio", label: "Quick ratio", group: "Balance sheet", unit: "x", dir: 1, type: "num" },
  { key: "bookValue", label: "Book value", group: "Balance sheet", unit: "₹", dir: 1, type: "num" },

  // ------------------------------- ownership --------------------------------
  { key: "promoterHoldingPct", label: "Promoter holding", group: "Ownership", unit: "%", dir: 1, type: "num", help: "The founding owners' stake. A high, stable stake usually signals commitment." },
  { key: "institutionHoldingPct", label: "Institutional holding", group: "Ownership", unit: "%", dir: 1, type: "num" },

  // --------------------------------- trend ----------------------------------
  { key: "stage", label: "Weinstein stage", group: "Trend", unit: "n", dir: 0, type: "num", col: true, help: "1 basing · 2 advancing · 3 topping · 4 declining, from the 30-week average." },
  { key: "pctFromSma50", label: "vs 50-DMA", group: "Trend", unit: "%", dir: 0, type: "num" },
  { key: "pctFromSma200", label: "vs 200-DMA", group: "Trend", unit: "%", dir: 0, type: "num", col: true },
  { key: "pctFromMa30w", label: "vs 30-week MA", group: "Trend", unit: "%", dir: 0, type: "num" },
  { key: "aboveSma50", label: "Above 50-DMA", group: "Trend", type: "bool", dir: 1 },
  { key: "aboveSma200", label: "Above 200-DMA", group: "Trend", type: "bool", dir: 1 },
  { key: "goldenCross", label: "Golden cross", group: "Trend", type: "bool", dir: 1, help: "50-day average above the 200-day average." },
  { key: "supertrendBullish", label: "Supertrend up", group: "Trend", type: "bool", dir: 1 },
  { key: "sma50", label: "50-DMA", group: "Trend", unit: "₹", dir: 0, type: "num" },
  { key: "sma200", label: "200-DMA", group: "Trend", unit: "₹", dir: 0, type: "num" },

  // -------------------------------- momentum --------------------------------
  { key: "rsi14", label: "RSI (14)", group: "Momentum", unit: "n", dir: 0, type: "num", col: true, help: "Above 70 is stretched, below 30 is washed out — in a strong trend it can stay pinned for months." },
  { key: "macdHist", label: "MACD histogram", group: "Momentum", unit: "n", dir: 1, type: "num" },
  { key: "macdBullish", label: "MACD bullish", group: "Momentum", type: "bool", dir: 1 },
  { key: "adx14", label: "ADX (14)", group: "Momentum", unit: "n", dir: 1, type: "num", help: "Trend strength regardless of direction. Above 25 is a real trend; below 20 is chop." },
  { key: "plusDI", label: "+DI", group: "Momentum", unit: "n", dir: 1, type: "num" },
  { key: "minusDI", label: "−DI", group: "Momentum", unit: "n", dir: -1, type: "num" },
  { key: "stochK", label: "Stochastic %K", group: "Momentum", unit: "n", dir: 0, type: "num" },
  { key: "cci20", label: "CCI (20)", group: "Momentum", unit: "n", dir: 0, type: "num" },
  { key: "mfi14", label: "MFI (14)", group: "Momentum", unit: "n", dir: 0, type: "num", help: "RSI weighted by money flow — momentum that accounts for volume." },
  { key: "rsRank1y", label: "RS rank 1Y", group: "Momentum", unit: "n", dir: 1, type: "num", col: true, help: "Percentile of 1-year return against every other listed company. 100 = strongest in the market." },
  { key: "rsRank3m", label: "RS rank 3M", group: "Momentum", unit: "n", dir: 1, type: "num" },

  // ------------------------------- volatility -------------------------------
  { key: "atrPct", label: "ATR %", group: "Volatility", unit: "%", dir: 0, type: "num", help: "Average daily range as a share of price — how much this share typically moves in a day." },
  { key: "volatility", label: "Volatility", group: "Volatility", unit: "%", dir: -1, type: "num", help: "Annualised standard deviation of daily returns." },
  { key: "beta", label: "Beta", group: "Volatility", unit: "x", dir: 0, type: "num", help: "Move relative to the market. Above 1 amplifies both directions." },
  { key: "bbPercentB", label: "Bollinger %B", group: "Volatility", unit: "n", dir: 0, type: "num", help: "0 = at the lower band, 100 = at the upper band." },
  { key: "bbWidthPct", label: "Bollinger width", group: "Volatility", unit: "%", dir: 0, type: "num", help: "A narrow band means a squeeze — volatility often expands afterwards." },
  { key: "maxDrawdownPct", label: "Max drawdown", group: "Volatility", unit: "%", dir: 1, type: "num", help: "Worst peak-to-trough fall over the available history." },

  // --------------------------------- range ----------------------------------
  { key: "pctFrom52wHigh", label: "From 52w high", group: "Range", unit: "%", dir: 1, type: "num", col: true },
  { key: "pctFrom52wLow", label: "From 52w low", group: "Range", unit: "%", dir: 1, type: "num" },
  { key: "rangePosition52w", label: "52w range position", group: "Range", unit: "n", dir: 1, type: "num", help: "0 = sitting on the 52-week low, 100 = at the 52-week high." },
  { key: "pctFromAllTimeHigh", label: "From all-time high", group: "Range", unit: "%", dir: 1, type: "num" },
  { key: "high52w", label: "52-week high", group: "Range", unit: "₹", dir: 0, type: "num" },
  { key: "low52w", label: "52-week low", group: "Range", unit: "₹", dir: 0, type: "num" },

  // -------------------------------- liquidity -------------------------------
  { key: "avgTurnoverCr", label: "Avg turnover", group: "Liquidity", unit: "₹cr", dir: 1, type: "num", col: true, help: "Average rupee value traded per day over 20 sessions. The honest test of whether you can actually buy it." },
  { key: "avgDeliveryPct20", label: "Delivery %", group: "Liquidity", unit: "%", dir: 1, type: "num", col: true, help: "Share of traded volume actually delivered rather than squared off intraday. High delivery = genuine buying." },
  { key: "deliveryPct", label: "Delivery % (today)", group: "Liquidity", unit: "%", dir: 1, type: "num" },
  { key: "volumeRatio", label: "Volume vs 50d", group: "Liquidity", unit: "x", dir: 1, type: "num" },
  { key: "avgVolume20", label: "Avg volume (20d)", group: "Liquidity", unit: "n", dir: 1, type: "num" },
  { key: "volume", label: "Volume", group: "Liquidity", unit: "n", dir: 0, type: "num" },

  // -------------------------------- coverage --------------------------------
  { key: "hasFundamentals", label: "Has fundamentals", group: "Coverage", type: "bool", dir: 1 },
  { key: "hasDeepData", label: "Has filed statements", group: "Coverage", type: "bool", dir: 1, help: "Full P&L, balance sheet, cash flow and shareholding from the company's filings." },
];

export const FUND_FIELDS = [
  { key: "code", label: "Code", group: "Scheme", type: "text" },
  { key: "name", label: "Scheme", group: "Scheme", type: "text", col: true },
  { key: "amc", label: "Fund house", group: "Scheme", type: "cat", col: true },
  { key: "categoryGroup", label: "Asset class", group: "Scheme", type: "cat", col: true },
  { key: "category", label: "Category", group: "Scheme", type: "cat", col: true },
  { key: "ageYears", label: "Age", group: "Scheme", unit: "n", dir: 1, type: "num", help: "Years since the scheme's first published NAV." },

  { key: "nav", label: "NAV", group: "Returns", unit: "₹", dir: 0, type: "num", col: true },
  { key: "r1m", label: "1-month", group: "Returns", unit: "%", dir: 1, type: "num" },
  { key: "r3m", label: "3-month", group: "Returns", unit: "%", dir: 1, type: "num" },
  { key: "r6m", label: "6-month", group: "Returns", unit: "%", dir: 1, type: "num" },
  { key: "r1y", label: "1-year", group: "Returns", unit: "%", dir: 1, type: "num", col: true },
  { key: "r2y", label: "2-year CAGR", group: "Returns", unit: "%", dir: 1, type: "num" },
  { key: "r3y", label: "3-year CAGR", group: "Returns", unit: "%", dir: 1, type: "num", col: true },
  { key: "r5y", label: "5-year CAGR", group: "Returns", unit: "%", dir: 1, type: "num", col: true },
  { key: "r7y", label: "7-year CAGR", group: "Returns", unit: "%", dir: 1, type: "num" },
  { key: "r10y", label: "10-year CAGR", group: "Returns", unit: "%", dir: 1, type: "num" },
  { key: "rSinceInception", label: "Since inception", group: "Returns", unit: "%", dir: 1, type: "num" },
  { key: "growth10k", label: "₹10k grew to", group: "Returns", unit: "₹", dir: 1, type: "num", help: "What ₹10,000 invested at inception would be worth now, before tax." },

  { key: "rolling3yAvg", label: "Rolling 3Y avg", group: "Rolling returns", unit: "%", dir: 1, type: "num", col: true, help: "Average 3-year return across EVERY possible start date — not the accident of today's window." },
  { key: "rolling3yMin", label: "Rolling 3Y worst", group: "Rolling returns", unit: "%", dir: 1, type: "num", help: "The worst any 3-year holding period ever delivered." },
  { key: "rolling3yMax", label: "Rolling 3Y best", group: "Rolling returns", unit: "%", dir: 1, type: "num" },
  { key: "rolling3yPctPositive", label: "3Y windows positive", group: "Rolling returns", unit: "%", dir: 1, type: "num", help: "Share of 3-year holding periods that did not lose money." },
  { key: "rolling3yPctAbove12", label: "3Y windows > 12%", group: "Rolling returns", unit: "%", dir: 1, type: "num" },
  { key: "rolling5yAvg", label: "Rolling 5Y avg", group: "Rolling returns", unit: "%", dir: 1, type: "num" },

  { key: "volatility", label: "Volatility", group: "Risk", unit: "%", dir: -1, type: "num", col: true, help: "Annualised standard deviation over three years. Higher means a bumpier ride." },
  { key: "sharpe", label: "Sharpe", group: "Risk", unit: "n", dir: 1, type: "num", col: true, help: "Return above the 6.5% risk-free rate, per unit of volatility. Higher is better paid risk." },
  { key: "sortino", label: "Sortino", group: "Risk", unit: "n", dir: 1, type: "num", help: "Like Sharpe, but only counts downside moves as risk." },
  { key: "downsideDeviation", label: "Downside deviation", group: "Risk", unit: "%", dir: -1, type: "num" },
  { key: "maxDrawdownPct", label: "Max drawdown", group: "Risk", unit: "%", dir: 1, type: "num", col: true, help: "The worst peak-to-trough fall the scheme has ever had." },
  { key: "maxDrawdown3yPct", label: "Max drawdown (3Y)", group: "Risk", unit: "%", dir: 1, type: "num" },
  { key: "currentDrawdownPct", label: "Below its peak", group: "Risk", unit: "%", dir: 1, type: "num" },

  { key: "stars", label: "Stars", group: "Ranking", unit: "n", dir: 1, type: "num", col: true, help: "5 = top fifth of its own category on 3-year CAGR." },
  { key: "rank", label: "Rank in category", group: "Ranking", unit: "n", dir: -1, type: "num", col: true },
  { key: "percentile", label: "Percentile", group: "Ranking", unit: "n", dir: -1, type: "num", help: "Lower is better: 5 means top 5% of the category." },
  { key: "quartile", label: "Quartile", group: "Ranking", unit: "n", dir: -1, type: "num" },
  { key: "sharperank", label: "Sharpe rank", group: "Ranking", unit: "n", dir: -1, type: "num" },
  { key: "stale", label: "Wound up", group: "Ranking", type: "bool", dir: -1, help: "The NAV stopped updating — the scheme is no longer investable." },
];

export const stockKeys = () => STOCK_FIELDS.map((f) => f.key);
export const fundKeys = () => FUND_FIELDS.map((f) => f.key);

/** The metadata the browser needs, without the build-only bits. */
export const clientMeta = (fields) => fields.map((f) => ({
  k: f.key, l: f.label, g: f.group, u: f.unit || "", d: f.dir ?? 0, t: f.type || "num",
  c: !!f.col, h: f.help || "",
}));
