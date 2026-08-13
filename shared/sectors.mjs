// ---------------------------------------------------------------------------
// sectors.mjs — one sector taxonomy for the whole listed market, plus the
// structural context and policy backdrop that applies to each.
//
// The raw data arrives with 58 different sector strings, because NSE's index
// labels and the wider feed's labels are mixed together: "Textile" and
// "Textiles", "Metal" and "Metals & Mining", "IT - Software" and "Information
// Technology" and "Technology" all appear. They are collapsed here into 18
// canonical sectors so that every listed company — not just the sixty-odd with
// hand-written research — gets an industry read and a policy read.
//
// A deliberate choice about WHAT is written here: this is STRUCTURAL context —
// what drives a sector's economics, what breaks them, and which government
// schemes and budget lines actually apply. It is not a market call, and it does
// not carry point-in-time figures that would quietly rot between refreshes.
// Structural descriptions stay true for years; "GRMs are $9/bbl this quarter"
// is wrong within weeks and there is no honest way to keep 18 of those current
// in a static build.
// ---------------------------------------------------------------------------

/** Canonical sector → the raw labels that should map into it. */
const MAP = {
  IT: ["information technology", "it - software", "technology", "software", "it services", "computers - software"],
  BANK: ["banks", "bank", "private sector bank", "public sector bank"],
  FIN: ["financial services", "nbfc", "finance", "investment", "insurance", "capital markets", "financial technology (fintech)", "holding company"],
  AUTO: ["automobile and auto components", "automobile", "auto ancillary", "automobiles", "auto components", "tyres"],
  PHARMA: ["healthcare", "pharmaceuticals", "healthcare services", "pharmaceuticals & biotechnology", "hospital", "diagnostics"],
  FMCG: ["fast moving consumer goods", "consumer defensive", "consumer food", "tobacco products", "tobacco", "tea/coffee", "agricultural food & other products", "food beverages & tobacco"],
  METAL: ["metals & mining", "metal", "steel & iron products", "steel", "minerals", "mining", "basic materials", "non - ferrous metals"],
  ENERGY: ["oil gas & consumable fuels", "energy", "oil exploration", "oil & gas", "petroleum products", "gas"],
  POWER: ["power", "utilities", "electric utilities", "renewable energy"],
  INFRA: ["construction", "infrastructure", "engineering", "construction materials", "cement", "cement & cement products", "ports", "logistics"],
  REALTY: ["realty", "real estate", "residential commercial projects"],
  CHEM: ["chemicals", "agrochemicals", "fertilizers", "fertilisers", "plastic products", "petrochemicals", "chemicals & petrochemicals"],
  CDUR: ["consumer durables", "household appliances", "consumer electronics", "jewellery", "footwear"],
  TELECOM: ["telecommunication", "communication services", "telecom", "media entertainment & publication", "media", "entertainment"],
  CAPGOODS: ["capital goods", "industrials", "industrial manufacturing", "compressors", "electrical equipment", "machinery", "aerospace & defense", "defence"],
  TEXTILE: ["textiles", "textile", "apparel", "forest materials", "paper"],
  SERVICES: ["consumer services", "services", "consumer cyclical", "retailing", "hotel", "hotels", "airlines", "educational institutions", "tourism"],
  DIVERS: ["diversified", "trading", "miscellaneous", "conglomerate", "dvr"],
};

const LOOKUP = (() => {
  const out = new Map();
  for (const [key, labels] of Object.entries(MAP)) for (const l of labels) out.set(l, key);
  return out;
})();

export const SECTOR_NAMES = {
  IT: "Information Technology", BANK: "Banks", FIN: "Financial Services",
  AUTO: "Automobile & Components", PHARMA: "Pharmaceuticals & Healthcare",
  FMCG: "FMCG & Consumer Staples", METAL: "Metals & Mining", ENERGY: "Oil, Gas & Energy",
  POWER: "Power & Utilities", INFRA: "Infrastructure & Construction", REALTY: "Real Estate",
  CHEM: "Chemicals & Fertilisers", CDUR: "Consumer Durables", TELECOM: "Telecom & Media",
  CAPGOODS: "Capital Goods & Engineering", TEXTILE: "Textiles & Paper",
  SERVICES: "Consumer Services", DIVERS: "Diversified",
};

/**
 * Collapse whatever sector/industry strings a company carries into one of the
 * canonical keys. The narrower sub-sector is consulted first because it is the
 * more specific of the two — a bank labelled only "Financial Services" at the
 * sector level is still a bank in its industry label.
 */
export function canonicalSector(sector, industry) {
  for (const raw of [industry, sector]) {
    if (!raw) continue;
    const k = String(raw).toLowerCase().trim();
    if (LOOKUP.has(k)) return LOOKUP.get(k);
    // fall back to a keyword scan for labels not enumerated above
    for (const [key, labels] of Object.entries(MAP)) {
      for (const l of labels) {
        if (l.length > 4 && k.includes(l)) return key;
      }
    }
  }
  const s = `${industry || ""} ${sector || ""}`.toLowerCase();
  if (/bank/.test(s)) return "BANK";
  if (/insur|financ|credit|asset manage|broker/.test(s)) return "FIN";
  if (/pharma|drug|medical|hospital|biotech|health/.test(s)) return "PHARMA";
  if (/steel|alumin|copper|zinc|mining|ore/.test(s)) return "METAL";
  if (/chemical|fertil|pesticid/.test(s)) return "CHEM";
  if (/power|electric|renewab|solar/.test(s)) return "POWER";
  if (/oil|gas|petrol|refin|coal/.test(s)) return "ENERGY";
  if (/software|computer|internet|semiconduct/.test(s)) return "IT";
  if (/auto|vehicle|tyre/.test(s)) return "AUTO";
  if (/cement|construct|infra|engineer/.test(s)) return "INFRA";
  if (/estate|realt|hous/.test(s)) return "REALTY";
  if (/textile|apparel|garment|paper/.test(s)) return "TEXTILE";
  if (/telecom|media|broadcast|publish/.test(s)) return "TELECOM";
  if (/retail|hotel|restaurant|airline|travel|educat/.test(s)) return "SERVICES";
  if (/machin|equipment|industrial|defence|defense|aerospace/.test(s)) return "CAPGOODS";
  if (/food|beverage|tobacco|household|personal/.test(s)) return "FMCG";
  if (/appliance|durable|jewell|footwear/.test(s)) return "CDUR";
  return "DIVERS";
}

// ---------------------------------------------------------------------------
// Structural industry context. Written to describe how a sector MAKES money and
// what breaks it, not where it is in the cycle this quarter.
// ---------------------------------------------------------------------------
export const INDUSTRY_PULSE = {
  IT: {
    outlook: "Indian IT services sell skilled engineering hours at a cost advantage, so earnings turn on three things: the volume of discretionary technology spending at large Western enterprises, the rupee, and utilisation. The industry has moved up from staffing towards managed services and platform work, which raises revenue per employee but ties growth more tightly to client capital budgets than to headcount.",
    drivers: ["Enterprise digital and cloud migration budgets", "A weaker rupee, which lands almost entirely in operating profit", "Higher-value work: data, engineering services and AI integration"],
    risks: ["Client budget freezes in a US or European slowdown — spending is discretionary and cuts come fast", "Wage inflation and attrition eroding the cost arbitrage", "Visa and onshore-hiring rules raising delivery cost", "Automation compressing the billable-hours model the sector was built on"],
  },
  BANK: {
    outlook: "A bank earns the spread between what it pays for deposits and what it charges for loans, less what it loses to defaults. Everything else is detail. The structural story in India is credit penetration rising from a low base against nominal GDP, with the constraint being deposits: lending has repeatedly outrun deposit growth, which caps how fast a bank can expand without paying up for funding.",
    drivers: ["Credit growth running ahead of nominal GDP as penetration rises", "Low-cost current and savings deposits, which decide the funding cost", "Fee income from payments, cards and third-party distribution"],
    risks: ["Asset quality in unsecured retail and microfinance, where losses appear late and together", "Deposit competition compressing margins when liquidity tightens", "Rate cuts repricing floating-rate loans faster than deposits", "Regulatory shifts in risk weights and provisioning"],
  },
  FIN: {
    outlook: "Non-bank lenders, insurers and asset managers monetise reach where banks are thin — small-ticket loans, deep distribution, and long-duration savings. They fund themselves in the wholesale market rather than from deposits, which makes the cost and availability of funding the single biggest swing factor in their economics.",
    drivers: ["Underserved borrowers banks reach poorly, at wider spreads", "Financialisation of household savings into mutual funds, insurance and equities", "Co-lending and partnership models that lower capital intensity"],
    risks: ["Funding cost and availability — a wholesale-funded lender in a liquidity squeeze is a different business", "Asset-liability mismatch if long assets are funded short", "Credit costs in unsecured and microfinance books", "Regulatory tightening on risk weights, pricing and collections practice"],
  },
  AUTO: {
    outlook: "A high-fixed-cost, cyclical manufacturing business where volume decides margin. Indian demand is structurally underpenetrated across two-wheelers, passenger vehicles and commercial vehicles, but is highly sensitive to financing cost, fuel prices and rural income. Electrification is redrawing the component supply chain: fewer parts per vehicle, different suppliers, and battery cost as the new determinant of price.",
    drivers: ["Low vehicle penetration against rising incomes", "Premiumisation — buyers trading up to SUVs and higher-spec models", "Replacement demand and export programmes"],
    risks: ["Interest rates, since most vehicles are financed", "Commodity costs — steel, aluminium and precious metals in catalysts", "The electric transition stranding conventional powertrain suppliers", "Regulatory shifts in emissions and safety norms raising the cost base"],
  },
  PHARMA: {
    outlook: "Two very different businesses share the label. Generic exporters compete on manufacturing cost and regulatory compliance into price-eroding markets, where a single plant inspection can decide a year's earnings. Domestic-branded formulations behave like consumer businesses, with pricing power, doctor relationships and steady volumes. Hospitals and diagnostics are capacity businesses judged on occupancy and revenue per bed.",
    drivers: ["Patent expiries opening generic opportunities", "A domestic branded market growing with incomes and insurance coverage", "Complex generics, biosimilars and speciality products carrying real margin"],
    risks: ["Regulatory action — an adverse inspection at a single plant can shut a revenue line", "US generic price erosion, which is structural rather than cyclical", "Price control on essential medicines", "Concentration in a few products or a few customers"],
  },
  FMCG: {
    outlook: "Consumer staples sell small-ticket, repeat-purchase products through vast distribution networks. The moat is shelf reach and brand recall, not technology, and the economics turn on volume growth plus the gap between input costs and what can be passed on in price. Rural demand is roughly a third of the market and swings with the monsoon and farm incomes.",
    drivers: ["Rural recovery and premiumisation within existing categories", "Distribution depth, which competitors cannot replicate quickly", "Direct-to-consumer and quick-commerce channels reaching new buyers"],
    risks: ["Input cost inflation — palm oil, crude derivatives, packaging — outrunning price increases", "Monsoon failure hitting rural volumes", "Regional and private-label competition on price", "Slow volume growth being masked by price-led revenue"],
  },
  METAL: {
    outlook: "A price-taking commodity business. Producers do not set steel or aluminium prices; global demand, Chinese supply and energy costs do. What a company controls is its cost per tonne, its captive raw material, and its balance sheet — which is what determines whether it survives the downcycle it will certainly face.",
    drivers: ["Domestic infrastructure and construction demand", "Captive ore and coal, which decides position on the cost curve", "Import protection when global prices collapse"],
    risks: ["The commodity cycle itself, which is not manageable, only survivable", "Chinese export volumes setting the global price", "Energy and coking coal costs", "Leverage taken on at the top of a cycle"],
  },
  ENERGY: {
    outlook: "Refining and marketing earn a processing spread — the gap between crude bought and products sold — which is set globally and only loosely related to the crude price itself. Upstream producers are geared directly to crude. Gas distribution is a regulated-return utility with volume growth. State-owned marketers additionally carry the policy burden of retail pricing, which can override the economics entirely.",
    drivers: ["Refining spreads, driven by global product demand against refining capacity", "City gas distribution volumes as networks extend", "Petrochemical integration lifting the value of each barrel"],
    risks: ["Crude volatility, which moves inventory gains and losses violently", "Administered retail pricing overriding market economics at state-owned marketers", "The energy transition compressing long-run demand for transport fuels", "Heavy, long-cycle capital commitments made against uncertain demand"],
  },
  POWER: {
    outlook: "Generation is a capacity business selling under long-term contracts or into the merchant market; transmission and distribution are regulated-return utilities. Indian demand grows faster than GDP as electrification deepens, while the mix shifts hard towards renewables. The binding constraint across the sector is the financial health of state distribution companies, which are the ultimate payer.",
    drivers: ["Electricity demand outpacing GDP growth", "Renewable capacity build-out and storage tenders", "Regulated returns on transmission and distribution assets"],
    risks: ["Discom payment delays — the receivable is the sector's chronic problem", "Merchant tariffs normalising as capacity arrives", "Fuel supply and imported coal costs for thermal plants", "Land acquisition and evacuation infrastructure delaying projects"],
  },
  INFRA: {
    outlook: "Contractors convert an order book into revenue and are judged on execution pace, working capital and whether they get paid. Cement and building materials are regional businesses where freight economics create local pricing power. Both are geared to government capital expenditure, which is a political variable as much as an economic one.",
    drivers: ["Government capital spending on roads, rail, ports and urban infrastructure", "Order book depth and the pace of conversion into revenue", "Regional pricing discipline in cement"],
    risks: ["Working capital and receivables from government counterparties", "Input costs — cement, steel, fuel — on fixed-price contracts", "Execution delays from land acquisition and clearances", "Aggressive bidding winning orders that cannot be delivered profitably"],
  },
  REALTY: {
    outlook: "Developers are leveraged, cash-flow-cyclical businesses selling a product bought almost entirely on credit, which makes mortgage rates the primary demand variable. Consolidation after RERA and the funding squeeze has favoured branded developers with balance sheets. Commercial and rental portfolios behave quite differently: they are annuity assets valued on occupancy and rent escalation.",
    drivers: ["Consolidation towards branded developers buyers will trust with an advance", "Mortgage affordability relative to income", "Commercial leasing demand from services and global capability centres"],
    risks: ["Interest rates, which set both demand and the cost of carrying inventory", "Unsold inventory and the cost of holding it", "Approval and clearance delays", "Land cost paid at the top of a cycle"],
  },
  CHEM: {
    outlook: "Speciality chemicals sell engineered molecules into qualified supply chains, where customer approval takes years and switching is hard — that is the moat. Commodity chemicals and fertilisers are price-takers exposed to feedstock and to Chinese capacity. Fertiliser economics are dominated by the government subsidy mechanism rather than by the market.",
    drivers: ["Supply chains diversifying manufacturing away from a single country", "Customer qualification, which locks in speciality revenue for years", "Import substitution and downstream integration"],
    risks: ["Chinese capacity returning and collapsing prices", "Feedstock costs tied to crude and natural gas", "Environmental compliance and plant-level shutdown risk", "Subsidy timing and receivables for fertiliser producers"],
  },
  CDUR: {
    outlook: "Discretionary purchases with strong seasonality — air conditioning to summer, jewellery and appliances to the festive and wedding calendar. Penetration is low and rising with incomes, but demand can be deferred, which makes these among the first categories cut when households feel squeezed. Brand, distribution and after-sales service are the durable advantages.",
    drivers: ["Low household penetration across categories", "Premiumisation and replacement cycles", "Organised retail and financing at the point of sale taking share from the unorganised trade"],
    risks: ["Demand deferral in a slowdown — nobody has to replace a refrigerator this year", "An unseasonal summer or a weak festive season", "Import dependence on components", "Gold price volatility for jewellers, which moves both cost and demand"],
  },
  TELECOM: {
    outlook: "Telecom is a capital-devouring business with high fixed costs and a small number of players, so returns depend almost entirely on pricing discipline and revenue per user rather than on subscriber growth. Media and entertainment monetise attention through advertising and subscription, and advertising is one of the first budgets cut in a slowdown.",
    drivers: ["Tariff repair lifting revenue per user", "Data consumption growth and the shift to higher-value plans", "Enterprise connectivity, data centres and fixed wireless"],
    risks: ["Spectrum costs and continuous capital expenditure with long payback", "Regulatory levies and licence fee structures", "Price competition, which the sector has repeatedly proved willing to restart", "Advertising cyclicality for media businesses"],
  },
  CAPGOODS: {
    outlook: "Engineering and capital goods firms sell into other people's capital expenditure, so they are a geared bet on the investment cycle. Order book, order inflow and execution margin are the three numbers that matter. Defence and railways add a long-cycle, policy-driven order stream where indigenisation targets create visibility that ordinary industrial demand does not.",
    drivers: ["A private capital-expenditure cycle alongside government infrastructure spending", "Defence indigenisation and railway modernisation orders", "Import substitution in industrial equipment"],
    risks: ["Order inflow drying up when customers defer investment", "Fixed-price contracts against volatile input costs", "Execution and receivables from government buyers", "Long project cycles that hide cost overruns until late"],
  },
  TEXTILE: {
    outlook: "A low-margin, working-capital-heavy manufacturing business competing internationally on cost, where the two swing variables are raw material prices — cotton or crude-linked synthetics — and market access. Trade agreements and competitor-country tariffs often matter more to an exporter's economics than anything within the company's control.",
    drivers: ["Global sourcing diversification away from a single country", "Free-trade agreements improving access to large consumer markets", "Government incentive schemes for integrated textile capacity"],
    risks: ["Cotton and synthetic fibre price swings", "Currency and freight costs on thin margins", "Competition from lower-cost manufacturing bases", "Working capital absorbing whatever the business earns"],
  },
  SERVICES: {
    outlook: "Retail, hospitality, travel and consumer platforms convert discretionary spending into revenue, with operating leverage that works powerfully in both directions: same-store growth or occupancy above breakeven drops through to profit, and below it does the reverse. The structural driver is formalisation — organised players taking share from the unorganised trade.",
    drivers: ["Organised retail and branded services taking share", "Discretionary spending rising with household income", "Store or room expansion where unit economics genuinely work"],
    risks: ["Operating leverage in reverse when footfall or occupancy falls", "Rental and wage cost inflation on fixed commitments", "Online competition and discount-led customer acquisition", "Expansion outrunning the economics of each new unit"],
  },
  DIVERS: {
    outlook: "Holding companies and diversified groups are valued on the sum of their parts, usually at a discount to it, because control sits away from the minority shareholder and capital gets allocated between businesses on grounds the outside investor cannot see. What matters is the quality of the underlying operating businesses and the record of the people allocating cash between them.",
    drivers: ["Value in underlying operating businesses or listed stakes", "Capital allocation discipline across the portfolio", "Restructuring or demerger unlocking a holding-company discount"],
    risks: ["The holding-company discount, which can persist indefinitely", "Cross-subsidy of weak businesses by strong ones", "Opacity — the consolidated accounts obscure how each unit performs", "Governance and related-party transactions"],
  },
};

// ---------------------------------------------------------------------------
// Government support. Schemes and budget mechanisms are matters of public
// record and change slowly, so they age far better than market commentary.
// ---------------------------------------------------------------------------
export const SECTOR_POLICY = {
  IT: {
    schemes: ["Special Economic Zone and Software Technology Park frameworks for export-oriented units", "India Semiconductor Mission and design-linked incentives for chip design and fabrication", "Digital India and IndiaAI programmes funding public digital infrastructure and compute"],
    budget: ["Tax treatment of export earnings and SEZ transitions", "Public spending on digital public infrastructure, which flows to domestic system integrators", "Skilling programmes subsidising the engineering talent pipeline"],
  },
  BANK: {
    schemes: ["Priority Sector Lending targets directing credit to agriculture, small enterprise and weaker sections", "Credit guarantee schemes for micro and small enterprises, which lower the effective risk weight", "Jan Dhan, Aadhaar and UPI rails cutting the cost of acquiring and serving a customer"],
    budget: ["Recapitalisation of public sector banks where required", "Interest subvention on priority segments such as agriculture and housing", "Deposit insurance limits and the resolution framework"],
  },
  FIN: {
    schemes: ["Co-lending framework letting non-banks originate against bank balance sheets", "Credit guarantee cover on small-enterprise lending", "Insurance and pension penetration programmes widening the savings pool"],
    budget: ["Tax treatment of savings, insurance premiums and capital gains, which steers household allocation", "Refinance windows through development finance institutions", "Regulatory capital and risk-weight changes, which act like fiscal policy for lenders"],
  },
  AUTO: {
    schemes: ["Production Linked Incentive for automobiles and auto components", "FAME and successor schemes subsidising electric vehicle purchase and charging", "Advanced Chemistry Cell battery manufacturing incentives", "Vehicle scrappage policy creating replacement demand"],
    budget: ["Customs duty structure on components and completed vehicles", "GST rates by vehicle category, which materially change on-road price", "Public spending on charging infrastructure and electric buses"],
  },
  PHARMA: {
    schemes: ["Production Linked Incentive for pharmaceuticals and bulk drugs", "Bulk Drug Park scheme reducing dependence on imported active ingredients", "Ayushman Bharat expanding insured demand for hospital treatment"],
    budget: ["Research and development incentives and weighted deductions", "Price control through the National List of Essential Medicines", "Public health spending, which is the demand side for hospitals and diagnostics"],
  },
  FMCG: {
    schemes: ["Production Linked Incentive for food processing", "Rural employment and income-support programmes underpinning rural demand", "Agricultural infrastructure funding for cold chain and storage"],
    budget: ["GST rates across food and personal care categories", "Income tax relief, which lands quickly in discretionary consumption", "Rural spending allocations, since roughly a third of demand is rural"],
  },
  METAL: {
    schemes: ["Production Linked Incentive for speciality steel", "National Mineral Policy and auction-based mineral concessions", "Import duties and anti-dumping action when global prices collapse"],
    budget: ["Export duty changes on ore and finished metal, which can reprice the sector overnight", "Infrastructure capital expenditure driving domestic demand", "Coal and mining royalty structures"],
  },
  ENERGY: {
    schemes: ["City Gas Distribution licensing rounds expanding the piped gas network", "Ethanol blending programme creating assured demand", "National Green Hydrogen Mission and refinery decarbonisation support", "Strategic petroleum reserves"],
    budget: ["Excise duty on transport fuels, which moves both retail price and marketing margin", "Subsidy compensation for state-owned marketers when retail prices are held", "Capital support for refinery upgrades and petrochemical integration"],
  },
  POWER: {
    schemes: ["Revamped Distribution Sector Scheme, conditional on distribution companies cutting losses", "Solar and wind capacity programmes, PM-KUSUM and rooftop solar", "Late Payment Surcharge rules enforcing discom payment discipline"],
    budget: ["Transmission capital expenditure and green energy corridors", "Renewable purchase obligations creating assured offtake", "Viability gap funding for storage and hybrid projects"],
  },
  INFRA: {
    schemes: ["National Infrastructure Pipeline and PM Gati Shakti coordinating project delivery", "Bharatmala and Sagarmala for roads and ports", "PM Awas Yojana driving housing and therefore cement demand"],
    budget: ["The central capital expenditure allocation, which is the single most important number for this sector", "Asset monetisation recycling capital into new projects", "Interest-free capital expenditure loans to states"],
  },
  REALTY: {
    schemes: ["RERA, which raised compliance cost and pushed consolidation towards credible developers", "PM Awas Yojana supporting affordable housing demand", "SWAMIH stress fund completing stalled projects"],
    budget: ["Tax deduction on home loan interest and principal", "Affordable housing definitions and the GST rate on under-construction property", "Stamp duty, which is a state-level lever on transaction volumes"],
  },
  CHEM: {
    schemes: ["Production Linked Incentive across chemical value chains", "Petroleum, Chemicals and Petrochemicals Investment Regions", "Nutrient Based Subsidy governing fertiliser economics"],
    budget: ["Fertiliser subsidy allocation and the timeliness of its release, which decides working capital", "Customs duty on imported intermediates", "Environmental compliance funding and effluent infrastructure"],
  },
  CDUR: {
    schemes: ["Production Linked Incentive for white goods, air conditioners and LED lighting", "Phased Manufacturing Programme raising local component content", "Gold monetisation and hallmarking rules formalising the jewellery trade"],
    budget: ["Customs duty on components against finished goods, which decides whether local assembly pays", "GST rates on discretionary durables", "Import duty on gold, which moves jewellery demand directly"],
  },
  TELECOM: {
    schemes: ["Production Linked Incentive for telecom and networking equipment", "BharatNet extending fibre to rural areas", "Spectrum auction terms, payment moratoria and licence-fee rationalisation"],
    budget: ["Adjusted Gross Revenue definitions and levy rates", "Universal Service Obligation Fund deployment", "Public funding for rural connectivity and data centre policy"],
  },
  CAPGOODS: {
    schemes: ["Defence indigenisation lists restricting imports of specified equipment", "Make in India and public procurement preference for local suppliers", "Railway modernisation, rolling stock and station redevelopment programmes"],
    budget: ["Defence capital acquisition budget and the share reserved for domestic industry", "Railway capital expenditure", "Central capital expenditure, which drives the private investment cycle behind it"],
  },
  TEXTILE: {
    schemes: ["Production Linked Incentive for man-made fibre and technical textiles", "PM MITRA integrated textile parks", "Rebate of State and Central Taxes and Levies for exporters"],
    budget: ["Cotton import duty and minimum support price, which set the input cost", "Export incentive and duty drawback rates", "Free trade agreements determining access to major consumer markets"],
  },
  SERVICES: {
    schemes: ["Open Network for Digital Commerce lowering the cost of reaching customers online", "Tourism infrastructure and hotel classification support", "Skilling programmes for retail and hospitality staff"],
    budget: ["GST rates on hotels, restaurants and services", "Income tax relief feeding discretionary spending", "Aviation and tourism infrastructure spending"],
  },
  DIVERS: {
    schemes: ["Sector-specific schemes apply to each underlying business rather than to the holding structure"],
    budget: ["Tax treatment of dividends and capital gains between group entities", "Rules on related-party transactions and minority shareholder protection"],
  },
};

export const POLICY_CAVEAT =
  "Structural sector context and the policy backdrop that applies to it — not a market call, and not specific to this company. "
  + "Schemes and budget lines are matters of public record but change with each Union Budget; verify current terms before relying on them.";
