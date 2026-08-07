// ---------------------------------------------------------------------------
// universe.js — the instrument universe for the synthetic market data engine.
//
// Real NSE symbols/sectors are used so the product surface looks and behaves
// authentically, but ALL prices, fundamentals and NAVs are generated
// deterministically by the engines (see engines/market.js, engines/funds.js).
// Swap in a licensed feed via the provider interface — never hardcode data.
// ---------------------------------------------------------------------------

// sector key → display name + RRG behaviour hints (cyclicality phase/beta)
export const SECTORS = {
  IT:        { name: "Information Technology", cycle: 0.9,  beta: 0.95 },
  BANK:      { name: "Banks",                  cycle: 0.1,  beta: 1.15 },
  NBFC:      { name: "Financial Services",     cycle: 0.25, beta: 1.25 },
  AUTO:      { name: "Automobile",             cycle: 0.45, beta: 1.10 },
  PHARMA:    { name: "Pharmaceuticals",        cycle: 0.75, beta: 0.70 },
  FMCG:      { name: "FMCG",                   cycle: 0.60, beta: 0.55 },
  METAL:     { name: "Metals & Mining",        cycle: 0.30, beta: 1.45 },
  ENERGY:    { name: "Oil, Gas & Energy",      cycle: 0.20, beta: 0.90 },
  INFRA:     { name: "Infrastructure",         cycle: 0.35, beta: 1.05 },
  REALTY:    { name: "Realty",                 cycle: 0.50, beta: 1.50 },
  CHEM:      { name: "Chemicals",              cycle: 0.65, beta: 0.95 },
  CDUR:      { name: "Consumer Durables",      cycle: 0.55, beta: 1.05 },
  TELECOM:   { name: "Telecom",                cycle: 0.15, beta: 0.85 },
  DEFENCE:   { name: "Defence & Aerospace",    cycle: 0.40, beta: 1.30 },
  OTHER:     { name: "Broader Market",         cycle: 0.50, beta: 1.00 },
};

// Listed equity universe. base = anchor price (₹), drift = long-run annual
// return bias, vol = annualised volatility, mcap in ₹ crore (approximate tier),
// quality/growth/valuation ∈ [0,1] drive the fundamentals generator.
export const STOCKS = [
  // ------------------------------- IT ------------------------------------
  { symbol: "TCS",        name: "Tata Consultancy Services",    sector: "IT",      base: 4150, drift: 0.11, vol: 0.20, mcap: 1500000, quality: 0.92, growth: 0.55, valuation: 0.70, fno: true },
  { symbol: "INFY",       name: "Infosys",                      sector: "IT",      base: 1830, drift: 0.10, vol: 0.22, mcap: 760000,  quality: 0.88, growth: 0.52, valuation: 0.62, fno: true },
  { symbol: "HCLTECH",    name: "HCL Technologies",             sector: "IT",      base: 1690, drift: 0.11, vol: 0.23, mcap: 458000,  quality: 0.84, growth: 0.56, valuation: 0.58, fno: true },
  { symbol: "WIPRO",      name: "Wipro",                        sector: "IT",      base: 560,  drift: 0.07, vol: 0.24, mcap: 293000,  quality: 0.72, growth: 0.38, valuation: 0.48, fno: true },
  { symbol: "LTIM",       name: "LTIMindtree",                  sector: "IT",      base: 6150, drift: 0.12, vol: 0.26, mcap: 182000,  quality: 0.82, growth: 0.62, valuation: 0.72, fno: true },
  { symbol: "PERSISTENT", name: "Persistent Systems",           sector: "IT",      base: 5900, drift: 0.16, vol: 0.30, mcap: 91000,   quality: 0.85, growth: 0.78, valuation: 0.85, fno: true },
  // ------------------------------ BANKS ----------------------------------
  { symbol: "HDFCBANK",   name: "HDFC Bank",                    sector: "BANK",    base: 1720, drift: 0.12, vol: 0.19, mcap: 1310000, quality: 0.90, growth: 0.60, valuation: 0.55, fno: true },
  { symbol: "ICICIBANK",  name: "ICICI Bank",                   sector: "BANK",    base: 1250, drift: 0.14, vol: 0.20, mcap: 882000,  quality: 0.91, growth: 0.66, valuation: 0.60, fno: true },
  { symbol: "SBIN",       name: "State Bank of India",          sector: "BANK",    base: 830,  drift: 0.12, vol: 0.26, mcap: 741000,  quality: 0.74, growth: 0.58, valuation: 0.42, fno: true },
  { symbol: "KOTAKBANK",  name: "Kotak Mahindra Bank",          sector: "BANK",    base: 1840, drift: 0.10, vol: 0.21, mcap: 366000,  quality: 0.86, growth: 0.52, valuation: 0.62, fno: true },
  { symbol: "AXISBANK",   name: "Axis Bank",                    sector: "BANK",    base: 1140, drift: 0.11, vol: 0.24, mcap: 352000,  quality: 0.79, growth: 0.57, valuation: 0.50, fno: true },
  { symbol: "BANKBARODA", name: "Bank of Baroda",               sector: "BANK",    base: 252,  drift: 0.10, vol: 0.30, mcap: 130000,  quality: 0.62, growth: 0.50, valuation: 0.35, fno: true },
  // ------------------------------ NBFC -----------------------------------
  { symbol: "BAJFINANCE", name: "Bajaj Finance",                sector: "NBFC",    base: 7350, drift: 0.16, vol: 0.28, mcap: 455000,  quality: 0.89, growth: 0.76, valuation: 0.80, fno: true },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv",                sector: "NBFC",    base: 1720, drift: 0.13, vol: 0.25, mcap: 274000,  quality: 0.84, growth: 0.66, valuation: 0.70, fno: true },
  { symbol: "CHOLAFIN",   name: "Cholamandalam Investment",     sector: "NBFC",    base: 1310, drift: 0.16, vol: 0.30, mcap: 110000,  quality: 0.81, growth: 0.74, valuation: 0.74, fno: true },
  { symbol: "HDFCAMC",    name: "HDFC Asset Management",        sector: "NBFC",    base: 4180, drift: 0.14, vol: 0.26, mcap: 89000,   quality: 0.90, growth: 0.62, valuation: 0.78, fno: false },
  // ------------------------------ AUTO -----------------------------------
  { symbol: "MARUTI",     name: "Maruti Suzuki India",          sector: "AUTO",    base: 12400,drift: 0.12, vol: 0.22, mcap: 390000,  quality: 0.85, growth: 0.55, valuation: 0.60, fno: true },
  { symbol: "M&M",        name: "Mahindra & Mahindra",          sector: "AUTO",    base: 2890, drift: 0.15, vol: 0.25, mcap: 359000,  quality: 0.83, growth: 0.70, valuation: 0.62, fno: true },
  { symbol: "TATAMOTORS", name: "Tata Motors",                  sector: "AUTO",    base: 980,  drift: 0.12, vol: 0.32, mcap: 326000,  quality: 0.68, growth: 0.64, valuation: 0.45, fno: true },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto",                   sector: "AUTO",    base: 9150, drift: 0.13, vol: 0.23, mcap: 256000,  quality: 0.87, growth: 0.58, valuation: 0.68, fno: true },
  { symbol: "EICHERMOT",  name: "Eicher Motors",                sector: "AUTO",    base: 4950, drift: 0.12, vol: 0.24, mcap: 136000,  quality: 0.86, growth: 0.54, valuation: 0.70, fno: true },
  { symbol: "TVSMOTOR",   name: "TVS Motor Company",            sector: "AUTO",    base: 2450, drift: 0.16, vol: 0.28, mcap: 116000,  quality: 0.80, growth: 0.72, valuation: 0.76, fno: true },
  // ----------------------------- PHARMA ----------------------------------
  { symbol: "SUNPHARMA",  name: "Sun Pharmaceutical",           sector: "PHARMA",  base: 1760, drift: 0.13, vol: 0.21, mcap: 422000,  quality: 0.85, growth: 0.60, valuation: 0.64, fno: true },
  { symbol: "CIPLA",      name: "Cipla",                        sector: "PHARMA",  base: 1520, drift: 0.11, vol: 0.22, mcap: 123000,  quality: 0.82, growth: 0.54, valuation: 0.58, fno: true },
  { symbol: "DRREDDY",    name: "Dr. Reddy's Laboratories",     sector: "PHARMA",  base: 1290, drift: 0.10, vol: 0.23, mcap: 108000,  quality: 0.80, growth: 0.50, valuation: 0.52, fno: true },
  { symbol: "DIVISLAB",   name: "Divi's Laboratories",          sector: "PHARMA",  base: 5950, drift: 0.13, vol: 0.26, mcap: 158000,  quality: 0.88, growth: 0.62, valuation: 0.82, fno: true },
  { symbol: "LUPIN",      name: "Lupin",                        sector: "PHARMA",  base: 2080, drift: 0.13, vol: 0.26, mcap: 95000,   quality: 0.76, growth: 0.62, valuation: 0.62, fno: true },
  // ------------------------------ FMCG -----------------------------------
  { symbol: "HINDUNILVR", name: "Hindustan Unilever",           sector: "FMCG",    base: 2420, drift: 0.08, vol: 0.18, mcap: 569000,  quality: 0.92, growth: 0.40, valuation: 0.72, fno: true },
  { symbol: "ITC",        name: "ITC",                          sector: "FMCG",    base: 435,  drift: 0.10, vol: 0.18, mcap: 544000,  quality: 0.88, growth: 0.48, valuation: 0.52, fno: true },
  { symbol: "NESTLEIND",  name: "Nestlé India",                 sector: "FMCG",    base: 2280, drift: 0.10, vol: 0.19, mcap: 220000,  quality: 0.93, growth: 0.46, valuation: 0.85, fno: true },
  { symbol: "BRITANNIA",  name: "Britannia Industries",         sector: "FMCG",    base: 5450, drift: 0.10, vol: 0.20, mcap: 131000,  quality: 0.89, growth: 0.48, valuation: 0.75, fno: true },
  { symbol: "DABUR",      name: "Dabur India",                  sector: "FMCG",    base: 545,  drift: 0.08, vol: 0.20, mcap: 97000,   quality: 0.83, growth: 0.42, valuation: 0.65, fno: false },
  // ------------------------------ METAL ----------------------------------
  { symbol: "TATASTEEL",  name: "Tata Steel",                   sector: "METAL",   base: 152,  drift: 0.10, vol: 0.33, mcap: 190000,  quality: 0.66, growth: 0.52, valuation: 0.40, fno: true },
  { symbol: "JSWSTEEL",   name: "JSW Steel",                    sector: "METAL",   base: 940,  drift: 0.11, vol: 0.30, mcap: 230000,  quality: 0.70, growth: 0.56, valuation: 0.55, fno: true },
  { symbol: "HINDALCO",   name: "Hindalco Industries",          sector: "METAL",   base: 660,  drift: 0.12, vol: 0.32, mcap: 148000,  quality: 0.71, growth: 0.55, valuation: 0.42, fno: true },
  { symbol: "VEDL",       name: "Vedanta",                      sector: "METAL",   base: 445,  drift: 0.10, vol: 0.36, mcap: 174000,  quality: 0.58, growth: 0.50, valuation: 0.38, fno: true },
  // ------------------------------ ENERGY ---------------------------------
  { symbol: "RELIANCE",   name: "Reliance Industries",          sector: "ENERGY",  base: 2950, drift: 0.12, vol: 0.22, mcap: 1996000, quality: 0.84, growth: 0.58, valuation: 0.58, fno: true },
  { symbol: "ONGC",       name: "Oil & Natural Gas Corp",       sector: "ENERGY",  base: 265,  drift: 0.09, vol: 0.28, mcap: 333000,  quality: 0.64, growth: 0.42, valuation: 0.30, fno: true },
  { symbol: "NTPC",       name: "NTPC",                         sector: "ENERGY",  base: 362,  drift: 0.12, vol: 0.24, mcap: 351000,  quality: 0.72, growth: 0.52, valuation: 0.40, fno: true },
  { symbol: "POWERGRID",  name: "Power Grid Corporation",       sector: "ENERGY",  base: 315,  drift: 0.11, vol: 0.20, mcap: 293000,  quality: 0.78, growth: 0.46, valuation: 0.44, fno: true },
  { symbol: "TATAPOWER",  name: "Tata Power",                   sector: "ENERGY",  base: 415,  drift: 0.14, vol: 0.30, mcap: 133000,  quality: 0.72, growth: 0.66, valuation: 0.60, fno: true },
  { symbol: "ADANIGREEN", name: "Adani Green Energy",           sector: "ENERGY",  base: 1050, drift: 0.13, vol: 0.42, mcap: 166000,  quality: 0.58, growth: 0.80, valuation: 0.88, fno: false },
  // ------------------------------ INFRA ----------------------------------
  { symbol: "LT",         name: "Larsen & Toubro",              sector: "INFRA",   base: 3620, drift: 0.14, vol: 0.23, mcap: 498000,  quality: 0.85, growth: 0.66, valuation: 0.62, fno: true },
  { symbol: "ADANIPORTS", name: "Adani Ports & SEZ",            sector: "INFRA",   base: 1380, drift: 0.14, vol: 0.30, mcap: 298000,  quality: 0.74, growth: 0.68, valuation: 0.58, fno: true },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement",             sector: "INFRA",   base: 11300,drift: 0.13, vol: 0.22, mcap: 326000,  quality: 0.84, growth: 0.60, valuation: 0.70, fno: true },
  { symbol: "AMBUJACEM",  name: "Ambuja Cements",               sector: "INFRA",   base: 615,  drift: 0.11, vol: 0.26, mcap: 151000,  quality: 0.74, growth: 0.55, valuation: 0.56, fno: true },
  // ------------------------------ REALTY ---------------------------------
  { symbol: "DLF",        name: "DLF",                          sector: "REALTY",  base: 855,  drift: 0.15, vol: 0.32, mcap: 212000,  quality: 0.72, growth: 0.70, valuation: 0.66, fno: true },
  { symbol: "GODREJPROP", name: "Godrej Properties",            sector: "REALTY",  base: 2680, drift: 0.15, vol: 0.34, mcap: 80000,   quality: 0.74, growth: 0.74, valuation: 0.78, fno: true },
  { symbol: "OBEROIRLTY", name: "Oberoi Realty",                sector: "REALTY",  base: 1780, drift: 0.14, vol: 0.33, mcap: 65000,   quality: 0.78, growth: 0.68, valuation: 0.70, fno: true },
  // ------------------------------ CHEM -----------------------------------
  { symbol: "PIDILITIND", name: "Pidilite Industries",          sector: "CHEM",    base: 3050, drift: 0.11, vol: 0.21, mcap: 155000,  quality: 0.90, growth: 0.52, valuation: 0.82, fno: false },
  { symbol: "SRF",        name: "SRF",                          sector: "CHEM",    base: 2380, drift: 0.12, vol: 0.27, mcap: 71000,   quality: 0.79, growth: 0.60, valuation: 0.68, fno: true },
  { symbol: "DEEPAKNTR",  name: "Deepak Nitrite",               sector: "CHEM",    base: 2650, drift: 0.12, vol: 0.31, mcap: 36000,   quality: 0.76, growth: 0.60, valuation: 0.62, fno: false },
  // ------------------------------ CDUR -----------------------------------
  { symbol: "TITAN",      name: "Titan Company",                sector: "CDUR",    base: 3380, drift: 0.13, vol: 0.24, mcap: 300000,  quality: 0.90, growth: 0.64, valuation: 0.84, fno: true },
  { symbol: "HAVELLS",    name: "Havells India",                sector: "CDUR",    base: 1620, drift: 0.12, vol: 0.25, mcap: 102000,  quality: 0.84, growth: 0.58, valuation: 0.76, fno: true },
  { symbol: "VOLTAS",     name: "Voltas",                       sector: "CDUR",    base: 1480, drift: 0.13, vol: 0.30, mcap: 49000,   quality: 0.75, growth: 0.62, valuation: 0.70, fno: true },
  { symbol: "DIXON",      name: "Dixon Technologies",           sector: "CDUR",    base: 14200,drift: 0.20, vol: 0.38, mcap: 85000,   quality: 0.78, growth: 0.88, valuation: 0.92, fno: true },
  // ----------------------------- TELECOM ---------------------------------
  { symbol: "BHARTIARTL", name: "Bharti Airtel",                sector: "TELECOM", base: 1580, drift: 0.15, vol: 0.22, mcap: 948000,  quality: 0.80, growth: 0.68, valuation: 0.66, fno: true },
  { symbol: "IDEA",       name: "Vodafone Idea",                sector: "TELECOM", base: 9.2,  drift: -0.02,vol: 0.55, mcap: 64000,   quality: 0.25, growth: 0.30, valuation: 0.25, fno: true },
  { symbol: "INDUSTOWER", name: "Indus Towers",                 sector: "TELECOM", base: 355,  drift: 0.10, vol: 0.28, mcap: 96000,   quality: 0.66, growth: 0.46, valuation: 0.40, fno: true },
  // ----------------------------- DEFENCE ---------------------------------
  { symbol: "HAL",        name: "Hindustan Aeronautics",        sector: "DEFENCE", base: 4450, drift: 0.18, vol: 0.32, mcap: 298000,  quality: 0.84, growth: 0.78, valuation: 0.72, fno: true },
  { symbol: "BEL",        name: "Bharat Electronics",           sector: "DEFENCE", base: 292,  drift: 0.18, vol: 0.30, mcap: 213000,  quality: 0.82, growth: 0.76, valuation: 0.70, fno: true },
  { symbol: "MAZDOCK",    name: "Mazagon Dock Shipbuilders",    sector: "DEFENCE", base: 4150, drift: 0.20, vol: 0.40, mcap: 84000,   quality: 0.76, growth: 0.82, valuation: 0.80, fno: false },
];

// Indices — synthetic composites of member sectors.
export const INDICES = [
  { symbol: "NIFTY",        name: "Nifty 50",          base: 24350, drift: 0.115, vol: 0.155, members: null },
  { symbol: "BANKNIFTY",    name: "Nifty Bank",        base: 52200, drift: 0.12,  vol: 0.19,  members: ["BANK"] },
  { symbol: "NIFTYIT",      name: "Nifty IT",          base: 39800, drift: 0.10,  vol: 0.21,  members: ["IT"] },
  { symbol: "NIFTYAUTO",    name: "Nifty Auto",        base: 24900, drift: 0.13,  vol: 0.21,  members: ["AUTO"] },
  { symbol: "NIFTYPHARMA",  name: "Nifty Pharma",      base: 21600, drift: 0.12,  vol: 0.19,  members: ["PHARMA"] },
  { symbol: "NIFTYFMCG",    name: "Nifty FMCG",        base: 58900, drift: 0.09,  vol: 0.15,  members: ["FMCG"] },
  { symbol: "NIFTYMETAL",   name: "Nifty Metal",       base: 9350,  drift: 0.10,  vol: 0.28,  members: ["METAL"] },
  { symbol: "NIFTYENERGY",  name: "Nifty Energy",      base: 39600, drift: 0.11,  vol: 0.21,  members: ["ENERGY"] },
  { symbol: "NIFTYINFRA",   name: "Nifty Infra",       base: 8900,  drift: 0.12,  vol: 0.20,  members: ["INFRA"] },
  { symbol: "NIFTYREALTY",  name: "Nifty Realty",      base: 1030,  drift: 0.14,  vol: 0.29,  members: ["REALTY"] },
  { symbol: "NIFTYMIDCAP",  name: "Nifty Midcap 150",  base: 21200, drift: 0.14,  vol: 0.20,  members: null },
  { symbol: "INDIAVIX",     name: "India VIX",         base: 13.8,  drift: 0,     vol: 0.9,   members: null, isVix: true },
];

// --------------------------- direct mutual funds ----------------------------
// category → benchmark index symbol + return/vol characteristics
export const MF_CATEGORIES = {
  LARGE:   { name: "Large Cap",        bench: "NIFTY",       drift: 0.115, vol: 0.155 },
  MID:     { name: "Mid Cap",          bench: "NIFTYMIDCAP", drift: 0.145, vol: 0.20 },
  SMALL:   { name: "Small Cap",        bench: "NIFTYMIDCAP", drift: 0.16,  vol: 0.24 },
  FLEXI:   { name: "Flexi Cap",        bench: "NIFTY",       drift: 0.13,  vol: 0.17 },
  ELSS:    { name: "ELSS (Tax Saver)", bench: "NIFTY",       drift: 0.13,  vol: 0.175 },
  INDEX:   { name: "Index Fund",       bench: "NIFTY",       drift: 0.115, vol: 0.155 },
  SECTORAL:{ name: "Sectoral / Thematic", bench: "NIFTYIT",  drift: 0.14,  vol: 0.23 },
  HYBRID:  { name: "Aggressive Hybrid",bench: "NIFTY",       drift: 0.105, vol: 0.11 },
  DEBT:    { name: "Debt — Corporate/Gilt", bench: null,     drift: 0.072, vol: 0.025 },
  LIQUID:  { name: "Liquid",           bench: null,          drift: 0.066, vol: 0.006 },
  GOLD:    { name: "Gold ETF FoF",     bench: null,          drift: 0.09,  vol: 0.14 },
};

// skill ∈ [-1,1] drives alpha; er = expense ratio (direct plan, %)
export const FUNDS = [
  { code: "MF001", name: "Axis Bluechip Fund",                    amc: "Axis MF",          category: "LARGE",   aum: 33500, er: 0.65, skill: 0.15, inception: 2010, nav0: 52 },
  { code: "MF002", name: "Mirae Asset Large Cap Fund",            amc: "Mirae Asset MF",   category: "LARGE",   aum: 39800, er: 0.54, skill: 0.35, inception: 2008, nav0: 98 },
  { code: "MF003", name: "ICICI Pru Bluechip Fund",               amc: "ICICI Prudential", category: "LARGE",   aum: 62100, er: 0.87, skill: 0.45, inception: 2008, nav0: 104 },
  { code: "MF004", name: "SBI Bluechip Fund",                     amc: "SBI MF",           category: "LARGE",   aum: 49300, er: 0.80, skill: 0.10, inception: 2006, nav0: 84 },
  { code: "MF005", name: "Nippon India Large Cap Fund",           amc: "Nippon India MF",  category: "LARGE",   aum: 34200, er: 0.66, skill: 0.50, inception: 2007, nav0: 86 },
  { code: "MF006", name: "HDFC Mid-Cap Opportunities Fund",       amc: "HDFC MF",          category: "MID",     aum: 77600, er: 0.74, skill: 0.55, inception: 2007, nav0: 172 },
  { code: "MF007", name: "Kotak Emerging Equity Fund",            amc: "Kotak MF",         category: "MID",     aum: 51400, er: 0.36, skill: 0.45, inception: 2007, nav0: 128 },
  { code: "MF008", name: "Motilal Oswal Midcap Fund",             amc: "Motilal Oswal MF", category: "MID",     aum: 26300, er: 0.57, skill: 0.65, inception: 2014, nav0: 96 },
  { code: "MF009", name: "Axis Midcap Fund",                      amc: "Axis MF",          category: "MID",     aum: 30100, er: 0.53, skill: 0.20, inception: 2011, nav0: 104 },
  { code: "MF010", name: "Nippon India Small Cap Fund",           amc: "Nippon India MF",  category: "SMALL",   aum: 62000, er: 0.68, skill: 0.70, inception: 2010, nav0: 172 },
  { code: "MF011", name: "SBI Small Cap Fund",                    amc: "SBI MF",           category: "SMALL",   aum: 34100, er: 0.66, skill: 0.55, inception: 2009, nav0: 178 },
  { code: "MF012", name: "Quant Small Cap Fund",                  amc: "Quant MF",         category: "SMALL",   aum: 26600, er: 0.64, skill: 0.60, inception: 2013, nav0: 260 },
  { code: "MF013", name: "Axis Small Cap Fund",                   amc: "Axis MF",          category: "SMALL",   aum: 24500, er: 0.55, skill: 0.40, inception: 2013, nav0: 98 },
  { code: "MF014", name: "Parag Parikh Flexi Cap Fund",           amc: "PPFAS MF",         category: "FLEXI",   aum: 89400, er: 0.62, skill: 0.75, inception: 2013, nav0: 78 },
  { code: "MF015", name: "HDFC Flexi Cap Fund",                   amc: "HDFC MF",          category: "FLEXI",   aum: 66300, er: 0.77, skill: 0.55, inception: 1995, nav0: 1720 },
  { code: "MF016", name: "UTI Flexi Cap Fund",                    amc: "UTI MF",           category: "FLEXI",   aum: 24100, er: 0.87, skill: 0.05, inception: 1992, nav0: 296 },
  { code: "MF017", name: "Franklin India Flexi Cap Fund",         amc: "Franklin Templeton",category: "FLEXI",  aum: 17800, er: 0.94, skill: 0.40, inception: 1994, nav0: 1560 },
  { code: "MF018", name: "Mirae Asset ELSS Tax Saver Fund",       amc: "Mirae Asset MF",   category: "ELSS",    aum: 25500, er: 0.58, skill: 0.45, inception: 2015, nav0: 46 },
  { code: "MF019", name: "Quant ELSS Tax Saver Fund",             amc: "Quant MF",         category: "ELSS",    aum: 11200, er: 0.65, skill: 0.55, inception: 2000, nav0: 380 },
  { code: "MF020", name: "Axis ELSS Tax Saver Fund",              amc: "Axis MF",          category: "ELSS",    aum: 34900, er: 0.78, skill: 0.05, inception: 2009, nav0: 92 },
  { code: "MF021", name: "UTI Nifty 50 Index Fund",               amc: "UTI MF",           category: "INDEX",   aum: 21500, er: 0.17, skill: 0.0,  inception: 2000, nav0: 158 },
  { code: "MF022", name: "HDFC Index Fund — Nifty 50 Plan",       amc: "HDFC MF",          category: "INDEX",   aum: 18800, er: 0.20, skill: 0.0,  inception: 2002, nav0: 214 },
  { code: "MF023", name: "ICICI Pru Nifty Next 50 Index Fund",    amc: "ICICI Prudential", category: "INDEX",   aum: 6800,  er: 0.30, skill: 0.02, inception: 2010, nav0: 58 },
  { code: "MF024", name: "ICICI Pru Technology Fund",             amc: "ICICI Prudential", category: "SECTORAL",aum: 14400, er: 0.99, skill: 0.35, inception: 2000, nav0: 218 },
  { code: "MF025", name: "SBI Banking & Financial Services Fund", amc: "SBI MF",           category: "SECTORAL",aum: 7800,  er: 0.79, skill: 0.35, inception: 2015, nav0: 40 },
  { code: "MF026", name: "Nippon India Pharma Fund",              amc: "Nippon India MF",  category: "SECTORAL",aum: 8600,  er: 0.88, skill: 0.30, inception: 2004, nav0: 486 },
  { code: "MF027", name: "ICICI Pru Equity & Debt Fund",          amc: "ICICI Prudential", category: "HYBRID",  aum: 41200, er: 0.98, skill: 0.55, inception: 1999, nav0: 388 },
  { code: "MF028", name: "HDFC Balanced Advantage Fund",          amc: "HDFC MF",          category: "HYBRID",  aum: 96500, er: 0.73, skill: 0.45, inception: 1994, nav0: 512 },
  { code: "MF029", name: "SBI Equity Hybrid Fund",                amc: "SBI MF",           category: "HYBRID",  aum: 74800, er: 0.74, skill: 0.25, inception: 1995, nav0: 288 },
  { code: "MF030", name: "ICICI Pru Corporate Bond Fund",         amc: "ICICI Prudential", category: "DEBT",    aum: 29900, er: 0.35, skill: 0.30, inception: 2009, nav0: 28 },
  { code: "MF031", name: "HDFC Short Term Debt Fund",             amc: "HDFC MF",          category: "DEBT",    aum: 15600, er: 0.29, skill: 0.25, inception: 2010, nav0: 30 },
  { code: "MF032", name: "SBI Magnum Gilt Fund",                  amc: "SBI MF",           category: "DEBT",    aum: 11400, er: 0.46, skill: 0.30, inception: 2000, nav0: 62 },
  { code: "MF033", name: "Parag Parikh Liquid Fund",              amc: "PPFAS MF",         category: "LIQUID",  aum: 2600,  er: 0.16, skill: 0.05, inception: 2018, nav0: 1380 },
  { code: "MF034", name: "SBI Liquid Fund",                       amc: "SBI MF",           category: "LIQUID",  aum: 71200, er: 0.18, skill: 0.05, inception: 2004, nav0: 3820 },
  { code: "MF035", name: "Nippon India Gold Savings Fund",        amc: "Nippon India MF",  category: "GOLD",    aum: 2200,  er: 0.34, skill: 0.0,  inception: 2011, nav0: 28 },
  { code: "MF036", name: "SBI Gold Fund",                         amc: "SBI MF",           category: "GOLD",    aum: 2900,  er: 0.42, skill: 0.0,  inception: 2011, nav0: 24 },
];

// ------------------------------ FX rates ------------------------------------
// ₹ per unit of foreign currency (indicative; the UI treats INR as primary).
export const FX = { INR: 1, USD: 87.4, AED: 23.8, SGD: 65.2, GBP: 111.5, EUR: 95.3 };

// NSE market holidays (subset, informational)
export const HOLIDAYS_2026 = [
  "2026-01-26", "2026-03-03", "2026-03-27", "2026-04-03", "2026-04-14",
  "2026-05-01", "2026-08-15", "2026-10-02", "2026-10-20", "2026-11-10", "2026-12-25",
];

export const STOCK_MAP = Object.fromEntries(STOCKS.map((s) => [s.symbol, s]));
export const INDEX_MAP = Object.fromEntries(INDICES.map((s) => [s.symbol, s]));
export const FUND_MAP = Object.fromEntries(FUNDS.map((f) => [f.code, f]));
