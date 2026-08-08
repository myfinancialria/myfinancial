// ---------------------------------------------------------------------------
// sectorIntel.js — the qualitative intelligence layer:
//   • SUBSECTOR_OF  — symbol → subsector (drives the Cyclical Graph drilldown)
//   • INDUSTRY      — per-sector current-situation analysis (FY26 context)
//   • POLICY        — government support: schemes + Union Budget provisions
//   • PRODUCTS      — hero products per company with indicative market share
// Curated as of Aug 2026. Shares/figures are indicative public estimates for
// education — verify before relying on them.
// ---------------------------------------------------------------------------

export const SUBSECTOR_OF = {
  TCS: "IT Services — Tier 1", INFY: "IT Services — Tier 1", HCLTECH: "IT Services — Tier 1", WIPRO: "IT Services — Tier 1",
  LTIM: "IT Services — Mid Tier", PERSISTENT: "IT Services — Mid Tier",
  HDFCBANK: "Banks — Private", ICICIBANK: "Banks — Private", KOTAKBANK: "Banks — Private", AXISBANK: "Banks — Private",
  SBIN: "Banks — PSU", BANKBARODA: "Banks — PSU",
  BAJFINANCE: "NBFC — Lending", CHOLAFIN: "NBFC — Lending", BAJAJFINSV: "Financial — Diversified", HDFCAMC: "Capital Markets — AMC",
  MARUTI: "Auto — PV OEM", "M&M": "Auto — PV OEM", TATAMOTORS: "Auto — PV OEM",
  "BAJAJ-AUTO": "Auto — 2/3 Wheelers", EICHERMOT: "Auto — 2/3 Wheelers", TVSMOTOR: "Auto — 2/3 Wheelers",
  SUNPHARMA: "Pharma — Branded & Specialty", CIPLA: "Pharma — Branded & Specialty", DRREDDY: "Pharma — Generics Export",
  LUPIN: "Pharma — Generics Export", DIVISLAB: "Pharma — API/CDMO",
  HINDUNILVR: "FMCG — Home & Personal Care", DABUR: "FMCG — Home & Personal Care",
  ITC: "FMCG — Foods & Tobacco", NESTLEIND: "FMCG — Foods", BRITANNIA: "FMCG — Foods",
  TATASTEEL: "Metals — Ferrous", JSWSTEEL: "Metals — Ferrous", HINDALCO: "Metals — Non-Ferrous", VEDL: "Metals — Diversified",
  RELIANCE: "Energy — Integrated", ONGC: "Energy — Upstream",
  NTPC: "Power — Generation", POWERGRID: "Power — Transmission", TATAPOWER: "Power — Integrated/RE", ADANIGREEN: "Power — Renewables",
  LT: "Infra — EPC & Engineering", ADANIPORTS: "Infra — Ports & Logistics", ULTRACEMCO: "Infra — Cement", AMBUJACEM: "Infra — Cement",
  DLF: "Realty — North", GODREJPROP: "Realty — Pan India", OBEROIRLTY: "Realty — Mumbai Luxury",
  PIDILITIND: "Chem — Specialty/Consumer", SRF: "Chem — Fluoro & Films", DEEPAKNTR: "Chem — Intermediates",
  TITAN: "Durables — Lifestyle & Jewellery", HAVELLS: "Durables — Appliances & Electricals", VOLTAS: "Durables — Cooling",
  DIXON: "Durables — EMS/Electronics",
  BHARTIARTL: "Telecom — Operators", IDEA: "Telecom — Operators", INDUSTOWER: "Telecom — Infrastructure",
  HAL: "Defence — Aerospace", BEL: "Defence — Electronics", MAZDOCK: "Defence — Shipbuilding",
};

export const INDUSTRY = {
  IT: {
    outlook: "Indian IT is grinding through a soft demand cycle: clients are prioritising cost-takeout and vendor consolidation over discretionary transformation, keeping revenue growth in mid single digits. GenAI is the swing factor — deal pipelines are strong but rate-per-effort deflation is real, so winners are those converting AI proofs-of-concept into large managed deals. Margins are protected by pyramid reset and lower attrition (~13%).",
    drivers: ["GenAI/data engineering deal flow", "US BFSI recovery in tech budgets", "Rupee depreciation (earnings tailwind)", "Vendor consolidation favouring Tier-1s"],
    risks: ["Pricing deflation from AI productivity", "US visa/immigration tightening", "GCC insourcing eating outsourcing share"],
  },
  BANK: {
    outlook: "Banking is in its healthiest balance-sheet phase in a decade — GNPA near multi-year lows (~2.5% system-wide), credit growth ~13-14% led by retail and MSME. The fight has shifted to deposits: CASA is decelerating and cost of funds is sticky, compressing NIMs 20-30bps from peak. RBI's risk-weight tightening has cooled unsecured credit growth deliberately.",
    drivers: ["Corporate capex cycle restarting", "Retail credit penetration (mortgages ~11% of GDP)", "Digital rails (UPI ~14B txns/month) lowering acquisition cost"],
    risks: ["Deposit-cost pressure on NIMs", "Unsecured/microfinance stress pockets", "Fintech competition in payments & SME lending"],
  },
  NBFC: {
    outlook: "NBFCs continue growing AUM ~18-20% by owning niches banks under-serve — used vehicles, consumer durables at point-of-sale, small-ticket business loans. RBI has raised bank-lending risk weights to NBFCs, nudging funding costs up ~40bps; diversified borrowing (NCDs, securitisation) is now a competitive moat. Asset quality holding, but leverage discipline separates compounders from casualties across cycles.",
    drivers: ["Consumption financing at POS", "Vehicle financing upcycle", "Co-lending partnerships with banks"],
    risks: ["Funding cost & liquidity cycles", "Regulatory tightening (risk weights, harmonisation)", "Credit-cost normalisation from cyclical lows"],
  },
  AUTO: {
    outlook: "The auto cycle is mid-stride: PVs are consolidating at record ~4.2M units with SUVs now ~53% of mix; two-wheelers are recovering on rural demand; CVs track infra capex. The EV transition is the structural story — ~7% PV and ~6% 2W penetration and climbing, with PLI-certified local manufacturing scaling. Premiumisation (₹10L+ PVs, 250cc+ bikes) keeps realisations rising faster than volumes.",
    drivers: ["SUV & premium 2W mix shift", "EV lineup launches with localised cells", "Rural recovery on good monsoon", "Export hubs (2W/3W to Africa, LatAm)"],
    risks: ["EV price war compressing margins", "Commodity (steel, precious-metal) inflation", "China rare-earth/magnet supply chokepoints"],
  },
  PHARMA: {
    outlook: "Pharma is in a sweet spot: US generic price erosion has cooled to low single digits, specialty/complex launches (injectables, inhalation, peptides like gSemaglutide) are driving mix, and the domestic branded market compounds ~9-10% on chronic therapies. CDMO/API players benefit from global de-risking away from China (BioSecure-style sentiment). USFDA inspections have resumed at full intensity — compliance is the licence to play.",
    drivers: ["Complex generics & peptide opportunities (GLP-1 wave)", "China+1 in APIs/CDMO", "Domestic chronic-therapy growth"],
    risks: ["USFDA observations/import alerts", "NLEM price caps on domestic portfolio", "R&D concentration in few molecules"],
  },
  FMCG: {
    outlook: "FMCG is exiting a two-year rural slowdown: volume growth is inching to ~5-6% as inflation cools and rural wages recover, while premium urban segments (bodywash, coffee, gourmet) grow double digits. Quick-commerce is reshaping distribution — now ~10%+ of urban sales for many categories — forcing pack-price architecture rework. Input costs (palm oil, wheat) are the quarterly swing factor.",
    drivers: ["Rural volume recovery + govt transfers", "Premiumisation & DTC/quick-commerce", "GST rationalisation hopes on mass categories"],
    risks: ["Regional/D2C brand share attrition", "Commodity cost spikes", "Urban mass-segment stagnation"],
  },
  METAL: {
    outlook: "Metals are trading the China puzzle: weak Chinese property demand caps global prices, while Indian demand grows ~10%+ on construction and capex — the only large market with double-digit steel consumption growth. Safeguard duty on flat-steel imports has firmed domestic realisations. Aluminium benefits from energy-transition demand (EVs, solar frames, cables); non-integrated players remain hostage to coking-coal swings.",
    drivers: ["Domestic construction & PLI-led capex", "Import protection (safeguard/anti-dumping)", "Energy-transition metal intensity"],
    risks: ["China export dumping on price", "Coking coal/alumina cost volatility", "Carbon-border taxes (EU CBAM from 2026)"],
  },
  ENERGY: {
    outlook: "India's energy complex runs two engines: legacy hydrocarbons throwing off cash (refining GRMs normalised, upstream stable at $75-80 crude) and the renewables build-out compounding ~25% — solar+wind additions hit records as round-the-clock tenders, storage mandates and green-hydrogen pilots mature. Power demand grows ~7-8% annually; peak-deficit fears keep thermal PLFs high even as RE share climbs.",
    drivers: ["Record RE capacity additions + storage tenders", "Power demand from data centres & EVs", "City-gas and petchem integration"],
    risks: ["Merchant power price normalisation", "Discom payment discipline", "Crude/GRM cyclicality"],
  },
  INFRA: {
    outlook: "Infrastructure is the fiscal policy centrepiece — public capex at ~₹11.2 lakh crore keeps order books at record highs across EPC, ports, and cement. Execution (not orders) is the differentiator now: labour availability, land, and working-capital cycles decide who converts backlog to earnings. Cement is consolidating fast — top-2 groups now control ~55% capacity — restoring pricing discipline after a bruising 2024-25.",
    drivers: ["Government capex multiplier (roads, rail, water)", "Cement consolidation & pricing repair", "Port privatisation & logistics formalisation"],
    risks: ["Fiscal consolidation slowing award velocity", "Fixed-price contract cost overruns", "Monsoon-quarter execution lulls"],
  },
  REALTY: {
    outlook: "Housing is in year five of an upcycle: top-7 city sales near record highs with inventory at decade lows (~11 months), and the mix has shifted decisively premium — ₹1.5Cr+ homes are the fastest-growing bracket. Listed developers with clean balance sheets are gaining share from broken local players; pre-sales visibility is 3-4 years for leaders. Rate cuts, whenever they land, are pure upside torque.",
    drivers: ["Premium/luxury demand momentum", "Consolidation toward branded developers", "Commercial (GCC office) absorption records"],
    risks: ["Affordability strain if rates stay high", "Approval/launch delays", "Speculative supply in select micro-markets"],
  },
  CHEM: {
    outlook: "Specialty chemicals are healing after the great destock: prices bottomed in 2024-25 as Chinese oversupply washed through, and volume-led recovery is underway with agrochem inventories normalised. The China+1 thesis is intact but selective — fluorochemicals, CDMO-adjacent intermediates and electronic chemicals are winning; commodity chemistry stays brutal. Capex announced in 2021-23 is now commissioning into a better demand year.",
    drivers: ["Global inventory restock cycle", "Fluoropolymer/refrigerant-gas value chains (AC, EV)", "Import substitution in intermediates"],
    risks: ["Chinese capacity overhang on pricing", "Crude-linked input volatility", "Environmental compliance capex"],
  },
  CDUR: {
    outlook: "Consumer durables ride two secular waves: room-AC penetration (~8% of households vs ~60% in China) growing volumes ~15%+ in hot years, and Make-in-India electronics manufacturing (EMS) compounding 25%+ as global brands localise phones, TVs and wearables under PLI. Premium lifestyle (jewellery, watches, eyewear) continues its formalisation grab from the unorganised sector. Summer intensity and festive seasons make quarters lumpy.",
    drivers: ["AC/cooling penetration story", "PLI-fuelled EMS order books", "Gold-price-led jewellery formalisation"],
    risks: ["Weather-dependent cooling demand", "EMS margin thinness & client concentration", "Import content in compressors/panels"],
  },
  TELECOM: {
    outlook: "Telecom has settled into a 2.5-player market with repaired economics: ARPU has climbed to ~₹250 after successive tariff hikes with more likely, 5G covers most of the population (monetisation still nascent — FWA is the first real use case), and capex intensity is falling from peak. The structural winners are those with fibre, spectrum depth and enterprise/cloud attach; the third operator survives on relief packages and tariff support.",
    drivers: ["Tariff-repair cycle continuing", "5G FWA & enterprise/IoT attach", "Data consumption ~25GB/user/month compounding"],
    risks: ["Third-operator stress → regulatory intervention", "AGR/spectrum payout schedules", "Capex resurgence if 6G/densification accelerates"],
  },
  DEFENCE: {
    outlook: "Defence indigenisation is a decade-scale re-rating: domestic procurement share is mandated at 75% of the capital budget, order books at HAL/BEL/shipyards run 3-6× annual revenue, and export ambitions (₹50,000 crore target by 2029) are becoming real via Akash, BrahMos and patrol vessels. Execution throughput and supply-chain depth (engines, semiconductors) are the binding constraints, not demand.",
    drivers: ["₹6.8L cr defence budget, 75% domestic procurement", "Positive-indigenisation lists banning imports", "Export corridor momentum (BrahMos, Akash, vessels)"],
    risks: ["Order-to-delivery execution lags", "Engine/critical-component import dependence", "Single-customer (MoD) pricing power"],
  },
};

export const POLICY = {
  IT: {
    schemes: [
      ["IndiaAI Mission (₹10,372 cr)", "Compute infrastructure (18k+ GPUs), AI innovation centres and startup financing — Tier-1s and mid-caps partner on sovereign-AI workloads."],
      ["SEZ / DESH policy flexibility", "Work-from-home and floor-wise denotification eased for IT SEZs, protecting tax-efficient delivery campuses."],
      ["Data Centre infrastructure status", "Easier/cheaper financing for the data-centre build-out that IT services monetise via cloud and GCC work."],
    ],
    budget: [
      ["FY26", "IndiaAI mission outlay stepped up; R&D & innovation corpus of ₹1 lakh crore (interest-free 50-yr loans) benefits deep-tech ecosystem IT firms service."],
      ["FY26", "No change to export-linked tax regimes; safe-harbour margins for GCC transfer pricing rationalised — supportive of the GCC boom Indian IT co-serves."],
    ],
  },
  BANK: {
    schemes: [
      ["IBC & NARCL", "Insolvency code + bad bank keep legacy NPA resolution moving; recovery discipline underpins the clean-balance-sheet cycle."],
      ["UPI incentive scheme", "MDR-free UPI backed by government incentive payouts (~₹1,500 cr) — banks gain low-cost deposits and data trails."],
      ["PM Jan Dhan / DBT rails", "460M+ accounts anchor CASA and cross-sell for PSU banks especially."],
    ],
    budget: [
      ["FY26", "No fresh PSU-bank recapitalisation needed — first cycle in years; government instead pushing PSB efficiency benchmarking (EASE 7.0)."],
      ["FY26", "Credit-guarantee scheme for MSMEs enhanced (cover up to ₹10 cr), expanding secured MSME lending pools for banks and NBFCs."],
    ],
  },
  NBFC: {
    schemes: [
      ["Co-lending framework", "RBI's co-lending model lets NBFCs originate with bank balance sheets — priority-sector arbitrage in vehicle/MSME loans."],
      ["Account Aggregator + OCEN", "Consent-based data rails cut underwriting cost for small-ticket credit — structural enabler for consumption lenders."],
    ],
    budget: [
      ["FY26", "MSME credit-guarantee enhancement and Mudra limit raise (₹20 lakh) expand the addressable book for small-business lenders."],
      ["FY26", "No securitisation tax friction added; NBFC-friendly status quo on TDS for listed NCDs maintained."],
    ],
  },
  AUTO: {
    schemes: [
      ["PM E-DRIVE (₹10,900 cr)", "Demand incentives for e-2W/3W, e-buses and charging infra — successor to FAME-II, running through FY26."],
      ["PLI-Auto (₹25,938 cr)", "Incentives for advanced automotive tech (EVs, hydrogen) — Tata Motors, M&M, TVS among certified beneficiaries."],
      ["Vehicle Scrappage Policy", "Fleet-renewal push with registered scrapping centres; CV replacement demand support."],
    ],
    budget: [
      ["FY26", "Customs duty on critical minerals (lithium, cobalt) fully exempted — cell localisation economics improved."],
      ["FY26", "EV manufacturing scheme (SPMEPCI) operational: 15% concessional duty for global OEMs committing $500M+ local investment — validates India as EV export base."],
    ],
  },
  PHARMA: {
    schemes: [
      ["PLI Pharma (₹15,000 cr) + PLI Bulk Drugs (₹6,940 cr)", "Production incentives for complex generics, biosimilars and 41 critical APIs — reversing China API dependence."],
      ["Bulk Drug & MedTech Parks", "Common-infrastructure parks (Himachal, Gujarat, AP) cutting API conversion costs."],
      ["PRIP scheme (₹5,000 cr)", "Research-linked incentives for novel drugs/biologics — nudging discovery R&D."],
    ],
    budget: [
      ["FY26", "Customs exemptions extended to 36 additional life-saving drugs (oncology/rare disease) — volume enabler for specialty portfolios."],
      ["FY26", "Healthcare allocation up ~10%; Ayushman Bharat expansion (70+ seniors) widens the insured therapy market."],
    ],
  },
  FMCG: {
    schemes: [
      ["PLI Food Processing (₹10,900 cr)", "Incentives for ready-to-eat, marine, mozzarella etc. — ITC, Nestlé ecosystems benefit."],
      ["PM Garib Kalyan Anna Yojana", "Free foodgrain for 800M+ people extended — floors rural purchasing power for staples."],
      ["Jal Jeevan / rural infrastructure", "Tap-water and road connectivity deepen distribution reach into Bharat."],
    ],
    budget: [
      ["FY26", "Income-tax relief (nil tax to ₹12L) is a direct urban-consumption stimulus — discretionary FMCG the first-order beneficiary."],
      ["FY26", "Kisan Credit Card limit raised to ₹5 lakh; higher rural transfers support volume recovery in mass categories."],
    ],
  },
  METAL: {
    schemes: [
      ["PLI Specialty Steel (₹6,322 cr)", "Value-added steel (coated, electrical) capacity incentives — JSW/Tata participants."],
      ["Safeguard duty on flat steel", "12% provisional safeguard against import surges protects domestic realisations."],
      ["National Steel Policy", "300MT capacity vision by 2030 with PSU capex and logistics support."],
    ],
    budget: [
      ["FY26", "Basic customs duty exemptions on scrap and critical minerals (cobalt, lithium waste) aid secondary/non-ferrous producers."],
      ["FY26", "Record capex allocation (roads, rail) is the volume engine for domestic steel/cement demand."],
    ],
  },
  ENERGY: {
    schemes: [
      ["PLI Solar Modules (₹24,000 cr)", "Integrated polysilicon-to-module capacity — import substitution vs Chinese panels."],
      ["National Green Hydrogen Mission (₹19,744 cr)", "Electrolyser + green-H2 production incentives; refineries and fertiliser offtake mandates coming."],
      ["PM Surya Ghar (₹75,021 cr)", "Rooftop solar for 1 crore homes with central assistance — discom-linked distributed generation."],
      ["Smart-meter / RDSS (₹3L cr+)", "Distribution reform underwriting discom payment discipline."],
    ],
    budget: [
      ["FY26", "Nuclear Energy Mission: ₹20,000 cr for SMR R&D with 100GW-by-2047 ambition and private participation amendments — long-duration signal for power capex."],
      ["FY26", "Customs exemptions on 35 capital goods for EV/mobile battery manufacturing — battery-storage cost curve support."],
    ],
  },
  INFRA: {
    schemes: [
      ["PM Gati Shakti", "Unified multi-modal masterplan de-bottlenecking project approvals across rail, road, ports."],
      ["National Infrastructure Pipeline", "₹111 lakh crore project pipeline anchoring EPC order books."],
      ["NHAI monetisation (InvITs/TOT)", "Recycling capital keeps award velocity high without ballooning debt."],
    ],
    budget: [
      ["FY26", "Public capex sustained at ~₹11.2 lakh crore (~3.1% of GDP); 50-yr interest-free loans to states (₹1.5L cr) multiply project starts."],
      ["FY26", "Maritime Development Fund (₹25,000 cr) and UDAN expansion — ports/airports pipeline; Jal Jeevan extended to 2028."],
    ],
  },
  REALTY: {
    schemes: [
      ["SWAMIH Fund II (₹15,000 cr)", "Last-mile funding completing stalled projects — inventory clearing, buyer-confidence repair."],
      ["PMAY-Urban 2.0 (₹10L cr assistance)", "1 crore additional urban homes with interest subsidy — affordable segment demand floor."],
      ["RERA regime", "Consumer-protection discipline consolidating share toward compliant, listed developers."],
    ],
    budget: [
      ["FY26", "Second self-occupied house now tax-exempt on notional rent; TDS threshold on rent raised to ₹6L — investor-demand friendly."],
      ["FY26", "Urban Challenge Fund (₹1 lakh crore) for city redevelopment — unlocks brownfield land economics in metros."],
    ],
  },
  CHEM: {
    schemes: [
      ["PCPIR / Chemical parks", "Investment-region infrastructure for petro-chem clusters (Dahej, Paradip)."],
      ["Anti-dumping / QCO regime", "Duties + quality-control orders on key intermediates counter Chinese undercutting."],
    ],
    budget: [
      ["FY26", "Customs rationalisation continues on specialty-chem feedstocks; agrochem export incentive architecture retained (RoDTEP)."],
      ["FY26", "R&D corpus access for deep-tech chemistry (electronic chemicals, battery materials) via the ₹1L cr innovation fund."],
    ],
  },
  CDUR: {
    schemes: [
      ["PLI White Goods (₹6,238 cr)", "AC & LED component localisation — compressors, copper tubing, controllers (Voltas/Havells ecosystem)."],
      ["PLI Large-Scale Electronics (₹22,919 cr new components scheme)", "Mobile/electronics components push — Dixon-type EMS the direct winner."],
      ["India Semiconductor Mission (₹76,000 cr)", "Fabs/OSAT plants (Micron, Tata, CG) — upstream depth for EMS."],
    ],
    budget: [
      ["FY26", "₹12L nil-tax slab lifts urban discretionary demand — ACs, jewellery, electronics first in line."],
      ["FY26", "BCD exemptions on open cells/components for TVs & mobiles deepen EMS value-add margins."],
    ],
  },
  TELECOM: {
    schemes: [
      ["Telecom PLI (₹12,195 cr)", "Network-gear localisation (routers, radios) — import substitution in 4G/5G equipment."],
      ["BharatNet (₹1.39L cr revamp)", "Fibre to every gram panchayat — rural broadband backhaul demand for operators/towercos."],
      ["Spectrum reforms", "Longer tenures, no SUC on new spectrum, easier surrender — structural cash-flow relief."],
    ],
    budget: [
      ["FY26", "BharatNet allocation stepped up; digital-infrastructure status eases tower/fibre financing."],
      ["FY26", "AGR-relief instalment framework maintained for the stressed third operator — sector stability signal."],
    ],
  },
  DEFENCE: {
    schemes: [
      ["Positive Indigenisation Lists", "5 lists banning import of 500+ items — guaranteed domestic order flow to HAL/BEL/yards."],
      ["Defence corridors (UP, TN)", "Cluster infrastructure + iDEX startup grants building component depth."],
      ["Export push (₹50,000 cr by 2029)", "BrahMos, Akash, Pinaka, patrol-vessel exports with lines of credit."],
    ],
    budget: [
      ["FY26", "Defence budget ₹6.81 lakh crore with 75% of capital procurement reserved for domestic industry — the core earnings visibility engine."],
      ["FY26", "R&D earmark for private sector/iDEX raised; emergency-procurement powers extended post-operations — order-flow accelerant."],
    ],
  },
};

// ------------------------------ hero products --------------------------------
// share = indicative market position (public estimates), note = why it matters.
export const PRODUCTS = {
  TCS: [
    ["TCS BaNCS", "Core banking platform at 450+ financial institutions globally", "Product revenue with annuity stickiness rare among services peers"],
    ["ignio", "AIOps/automation suite", "Flagship of the products & platforms bet; cross-sold into managed ops deals"],
    ["Consulting & GenAI services", "#1 Indian IT by revenue (~$30B)", "Scale player in vendor consolidation; 300+ GenAI engagements in delivery"],
  ],
  INFY: [
    ["Finacle (EdgeVerve)", "Core banking in 100+ countries, ~1B accounts touched", "Product moat: banks rarely switch cores"],
    ["Infosys Topaz", "GenAI services & platform layer", "The AI storefront converting POCs to production programs"],
    ["Cobalt cloud", "Cloud transformation framework", "Anchor for large-deal wins ($2B+ TCV quarters)"],
  ],
  HCLTECH: [["HCLSoftware (BigFix, AppScan, Unica)", "~$1.5B software ARR", "Only Indian major with a genuine enterprise-software P&L"], ["Engineering & R&D services", "#1 Indian ER&D outsourcer", "Aerospace, semicon and telecom engineering — stickiest budgets in IT"]],
  WIPRO: [["FullStride Cloud", "Cloud transformation practice", "Consolidates hyperscaler partnerships"], ["Wipro Enterprise Futuring w/ AI", "GenAI delivery platform", "Turnaround bet under consulting-heavy leadership"]],
  LTIM: [["Fosfor", "Data-to-decisions product suite", "Differentiates vs pure services mid-caps"], ["BFSI modernisation", "~35% revenue from BFSI", "Merged entity punches into Tier-1 deal sizes"]],
  PERSISTENT: [["Digital product engineering", "Builds software for ISVs/hyperscalers", "Highest growth percentile in Indian IT for 4 years running"], ["Healthcare & fintech platforms", "Long-cycle co-build contracts", "Revenue/head premium vs services peers"]],
  HDFCBANK: [["Retail lending suite", "~11% of system credit-card spends; mortgage book #1 post-merger", "Lowest-cost liability franchise funds category leadership"], ["PayZapp & SmartHub Vyapar", "10M+ merchant ecosystem", "Payments data → underwriting edge"]],
  ICICIBANK: [["iMobile Pay & InstaBIZ", "30M+ app users; open-architecture payments", "Digital origination drives best-in-class ROE (~18%)"], ["Corporate & SME banking", "Top-2 private corporate bank", "Granular, collateralised growth book"]],
  SBIN: [["YONO", "~120M registered users — India's largest bank super-app", "Digital deposits & xsell at PSU scale"], ["Home loans", "#1 mortgage lender (~₹7L cr book)", "The default banker to Bharat — 22,000+ branches"]],
  KOTAKBANK: [["Kotak 811", "Digital savings acquisition engine", "Low-cost liability build post embargo lift"], ["Wealth & securities", "Top-3 wealth manager", "Fee-income diversification"]],
  AXISBANK: [["Burgundy / Burgundy Private", "₹5L cr+ wealth AUM", "Premiumisation of liability franchise"], ["Flipkart Axis credit card", "#4 card issuer, co-brand engine", "Digital partnerships drive retail fees"]],
  BANKBARODA: [["bob World", "30M+ digital users", "PSU digital leader after SBI"], ["International book", "~15% overseas advances", "Trade-finance niche among PSBs"]],
  BAJFINANCE: [["Consumer-durable POS financing", "Dominant EMI-financing network (~1.5L+ stores)", "The original moat: 0%-EMI checkout ownership"], ["Bajaj EMI Card", "50M+ customer franchise", "Cross-sell flywheel — 6+ products per customer cohort"]],
  BAJAJFINSV: [["Bajaj Allianz (Life & General JVs)", "Top-5 private insurers", "Holding-co of finance + insurance troika"], ["Bajaj Markets/Finserv Health", "Digital marketplaces", "Optionality layers on the lending core"]],
  CHOLAFIN: [["Vehicle finance", "~₹1L cr AUM, used-CV specialist", "Murugappa underwriting culture through cycles"], ["Loan against property & SME", "Fast-scaling secured book", "Diversification beyond autos"]],
  HDFCAMC: [["HDFC Flexi/Mid/Balanced funds", "~13% equity-AUM share, #1 profitability", "Brand + distribution = highest yields in AMC land"], ["SIP book", "₹3,000 cr+ monthly flows", "Annuity-like revenue visibility"]],
  MARUTI: [["Brezza / Grand Vitara / Fronx", "~41% PV market share overall", "SUV gap now closing — 25%+ SUV share and rising"], ["Swift / Baleno / WagonR", "Hatchback dominance (~65% share)", "Entry-segment recovery is pure Maruti torque"], ["Ertiga/Eeco (CNG leadership)", "~70% of CNG PV sales", "Multi-powertrain hedge while EV ramps"]],
  "M&M": [["Scorpio-N / Thar / XUV700", "#1 SUV maker by revenue (~22% share)", "Authentic-SUV brand power with 18-month order books at peak"], ["Swaraj + Mahindra tractors", "~42% tractor share", "Farm cash cow funding auto capex"], ["Last-mile EVs (Treo)", "~55% e-3W share", "Quiet EV leadership where economics already work"]],
  TATAMOTORS: [["Nexon / Punch / Tiago EV", "~55-60% India EV share", "First-mover EV franchise with Fiat-derived platforms"], ["JLR (Defender, RR)", "Global luxury margin engine", "Free-cash machine when chips/China cooperate"], ["CV franchise", "~38% CV share", "Infra-cycle proxy with margin discipline"]],
  "BAJAJ-AUTO": [["Pulsar franchise", "#1 sports-commuter brand", "Export + domestic premium mix"], ["3-wheelers", "~75% autos share, export leader", "Cash-cow duopoly; e-autos scaling"], ["Chetak EV", "Top-3 e-scooter", "Legacy brand reborn electric"]],
  EICHERMOT: [["Royal Enfield Classic/Hunter 350", ">85% of 250cc+ motorcycles", "Category-defining brand with cult exports"], ["VECV (Volvo-Eicher CVs)", "~17% LMD truck share", "Premium trucking JV upside"]],
  TVSMOTOR: [["Jupiter", "#2 scooter (~25% share)", "Family-scooter juggernaut"], ["Apache", "Premium motorcycle export brand", "Racing DNA premiumisation"], ["iQube", "Top-3 e-scooter", "Credible EV scaling with PLI certification"]],
  SUNPHARMA: [["Ilumya / Winlevi / Cequa", "$1B+ global specialty franchise", "Only Indian pharma with real innovative-dermatology presence"], ["India Rx leadership", "#1 domestic (~8.5% share)", "13 brands in India's top-300"]],
  CIPLA: [["Respiratory franchise (Foracort, Duolin)", "#1 India inhalation (~25% share)", "Device+molecule complexity = durable moat"], ["US complex generics", "gRevlimid, gAdvair ramp", "Complex launches driving US $1B run-rate"]],
  DRREDDY: [["gRevlimid & complex injectables", "Top US generics earner", "Cash windfall funding biosimilars/CDMO pivots"], ["Biosimilars (rituximab etc.)", "Emerging-market biologics", "Next-decade optionality"]],
  DIVISLAB: [["Custom synthesis (CDMO)", "Trusted supplier to global innovators", "Contrast-media & peptide building blocks scaling"], ["Generic APIs", "World #1 in naproxen, dextromethorphan", "Scale + chemistry = cost leadership"]],
  LUPIN: [["gSpiriva / inhalation US", "First-to-market complex respiratory generics", "Inhalation chemistry few can replicate"], ["India chronic portfolio", "Top-5 in cardiac/diabetes", "Chronic mix = pricing resilience"]],
  HINDUNILVR: [["Surf Excel", "India's largest FMCG brand (₹5,000 cr+)", "Premium laundry kept compounding through slowdown"], ["Dove / Ponds / Lakmé", "Beauty & personal care leadership", "Margin-rich beauty portfolio; Lakmé #1 cosmetics"], ["Horlicks / Boost", "#1 health food drinks (~50% share)", "GSK acquisition digesting into distribution muscle"]],
  ITC: [["Aashirvaad", "#1 branded atta (₹8,000 cr+ brand)", "FMCG-foods engine of the non-cigarette pivot"], ["Sunfeast / Bingo / Yippee", "Top-3 in biscuits/snacks/noodles", "20+ ₹500cr FMCG brands built organically"], ["Cigarettes", "~77% legal-market share", "Cash fortress funding everything else"]],
  NESTLEIND: [["Maggi", "~60% instant-noodle share", "One of India's deepest food moats"], ["KitKat / Munch", "#1 wafer chocolates", "Confectionery volume machine"], ["Nescafé", "#1 instant coffee", "Premiumisation + out-of-home growth"]],
  BRITANNIA: [["Good Day / Marie Gold / NutriChoice", "#1 biscuits (~33% share)", "Distribution to 2.8M+ outlets"], ["Adjacent bakery (cake, rusk, bread)", "Top-2 positions", "Total-foods strategy beyond biscuits"]],
  DABUR: [["Dabur Chyawanprash / Honey", ">60% and ~45% shares", "Ayurveda trust franchise"], ["Real juices", "#1 packaged juice (~50%)", "Beverage growth engine"], ["Vatika / Amla hair oils", "#1 hair-oil portfolio", "Bharat-first personal care"]],
  TATASTEEL: [["Tata Tiscon / Steelium", "#1 branded rebar & CR retail", "B2C steel branding nobody else cracked"], ["Kalinganagar/NINL expansion", "+5MTPA low-cost brownfield", "India-centric volume growth as Europe restructures"]],
  JSWSTEEL: [["Coated & colour steel (JSW Colouron)", "#1 coated-steel producer", "Value-added mix ~60% cushions cycles"], ["27→37MTPA capacity roadmap", "India's largest steelmaker by capacity", "Growth capex with brownfield economics"]],
  HINDALCO: [["Novelis", "World #1 aluminium rolling & recycling", "Beverage-can and auto-sheet annuity in USD"], ["Domestic smelting+downstream", "Integrated low-cost producer", "Energy-transition metal beta with downstream shield"]],
  VEDL: [["Hindustan Zinc", "~75% India primary zinc, top-5 global silver", "Cash engine of the group"], ["Aluminium (Jharsuguda)", "India's largest smelter", "Cost-curve leverage to power/alumina"]],
  RELIANCE: [["Jio", "~470M subscribers, #1 telecom", "Digital backbone: 5G, FWA (AirFiber), JioBharat"], ["Reliance Retail", "India's #1 retailer (19k+ stores)", "Grocery-to-fashion scale no peer matches"], ["O2C complex", "World-scale refining/petchem", "Cash generator funding new energy giga-factories"]],
  ONGC: [["Domestic upstream", "~70% of India's crude & gas output", "Energy-security core with KG-basin ramp"], ["OPaL/MRPL value chain", "Petchem & refining integration", "Gas-price reform beneficiary"]],
  NTPC: [["Thermal fleet", "~76GW, ~25% of India's generation", "Regulated-return annuity with fuel pass-through"], ["NTPC Green", "30GW+ RE pipeline", "Listed green arm re-rating the parent"]],
  POWERGRID: [["Inter-state transmission", "~85% of ISTS network", "Regulated ROE ~15.5% monopoly rails"], ["TBCB project wins", "Competitive transmission pipeline", "RE-evacuation build-out = fresh growth leg"]],
  TATAPOWER: [["Rooftop solar & EV charging", "#1 rooftop installer; 5,500+ charge points", "Consumer-facing energy transition play"], ["Odisha discoms", "10M+ customers", "Distribution turnaround template"]],
  ADANIGREEN: [["Khavda RE park", "World's largest single-site RE build (30GW plan)", "Execution scale advantage in solar+wind hybrids"], ["25GW+ operating/contracted", "India's #1 pure-play RE", "SECI-backed PPAs = cash-flow visibility"]],
  LT: [["Heavy civil & transport infra", "Metros, HSR, airports, expressways", "Order book ₹4.7L cr+ — a proxy for India capex"], ["Defence & precision engineering", "K9 Vajra, submarines, shipyards", "Private defence prime scaling"], ["LTTS/LTIM/Realty", "Services & development portfolio", "Asset-light earnings diversification"]],
  ADANIPORTS: [["Mundra", "India's #1 commercial port (~27% national cargo)", "West-coast gateway with rail/ICD integration"], ["Logistics & SEZ", "End-to-end cargo chain", "Transshipment (Vizhinjam) upside"]],
  ULTRACEMCO: [["UltraTech grey cement", "#1 capacity (~155 MTPA, ~24% share)", "Pan-India footprint = pricing & lead-distance edge"], ["Building solutions (UBS)", "3,500+ retail stores", "B2C cement retailing moat"]],
  AMBUJACEM: [["Ambuja+ACC combine", "~100 MTPA group capacity (#2)", "Adani cost-reengineering (green power, logistics)"], ["Premium brands", "Ambuja Kawach/Plus", "Premiumisation in a commodity"]],
  DLF: [["DLF Privana/Camellias (Gurugram luxury)", "₹20k cr+ annual pre-sales leader", "Land bank at legacy cost = margin unmatchable"], ["DCCDL rentals", "45M sq ft offices/malls", "Annuity NOI ₹5,000 cr+"]],
  GODREJPROP: [["Pan-metro residential", "#1 by bookings value (₹22k cr+)", "Brand + capital access = project-aggregation machine"], ["Godrej-branded townships", "NCR/MMR/Pune/Bengaluru", "JV-light land strategy"]],
  OBEROIRLTY: [["360 West / Sky City / Forestville", "Mumbai luxury specialist", "Industry-best margins (~50%+ EBITDA)"], ["Commerz & Oberoi Mall annuity", "Premium office/retail", "Mixed-use flywheel in supply-starved MMR"]],
  PIDILITIND: [["Fevicol", "~70% adhesives share — generic name for the category", "Carpenter-network moat 60 years deep"], ["Dr. Fixit", "#1 waterproofing", "Construction-chemicals growth engine"], ["Fevikwik/M-Seal", "Instant adhesives & sealants dominance", "₹100+ cr brands across the wall"]],
  SRF: [["Fluorochemicals & ref-gases", "#1 domestic refrigerants", "HFC→HFO transition chemistry few possess"], ["Specialty fluorines (agro/pharma)", "Patented-intermediate CDMO", "The margin star of Indian chemicals"], ["Packaging films", "BOPP/BOPET scale", "Cyclical but cash-generative"]],
  DEEPAKNTR: [["Phenol-acetone", "~75% domestic phenol share", "Import substitution done — downstream derivatives next"], ["Nitrites/nitro-toluenes", "Global top-3 positions", "Chemistry depth in niche intermediates"]],
  TITAN: [["Tanishq", "#1 jewellery brand (~8% of a massive market, rising)", "Formalisation + gold-exchange trust = decade runway"], ["Titan/Fastrack/Sonata watches", "~60% organised watch market", "Category custodian since the 90s"], ["Titan EyePlus & CaratLane", "#1 optical chain; #1 omni jewellery", "Adjacency machine keeps compounding"]],
  HAVELLS: [["Lloyd", "Top-3 room ACs", "Consumer-durables leg atop electricals base"], ["Switchgear & cables", "~20% organised switchgear", "Electrician-channel brand equity"], ["Crabtree/Standard", "Premium & mass switches", "Full price-ladder coverage"]],
  VOLTAS: [["Voltas room ACs", "#1 (~18-20% share) for two decades", "Summer-India pure play with UP scale"], ["Voltas-Beko", "Fast-growing refrigerators/washers JV", "White-goods #3 ambition"]],
  DIXON: [["Mobile EMS (Motorola, Xiaomi, Longcheer)", "India's #1 electronics manufacturer", "PLI's biggest winner — smartphone export ramp"], ["LED TVs & lighting ODM", "~35% India TV ODM share", "Own-design margins atop assembly scale"], ["Wearables/IT hardware", "New verticals scaling", "Component backward-integration next leg"]],
  BHARTIARTL: [["Airtel mobile", "~390M subs, ARPU leader (₹250+)", "Premium-subscriber machine with 5G depth"], ["Airtel Business + Nxtra", "#1 enterprise connectivity & data centres", "B2B engine growing double digits"], ["Africa (14 markets)", "150M+ subscribers", "Second S-curve with mobile-money kicker"]],
  IDEA: [["Vi mobile", "~200M subs, #3 operator", "Survival hinges on tariff repair + relief package"], ["Vi Business", "Enterprise niche", "Retention play amid subscriber churn"]],
  INDUSTOWER: [["Tower portfolio", "~230k towers — India's largest", "5G densification volumes with Airtel anchor"], ["Rural/lean-site rollout", "Sharing-economics leader", "Vi-collection risk is the discount, densification the upside"]],
  HAL: [["Tejas LCA Mk1A", "₹48k cr order — India's fighter backbone", "97 more approved; Mk2 & AMCA pipeline behind it"], ["ALH Dhruv/Prachand helicopters", "Indigenous rotary fleet", "Export interest from LatAm/SEA"], ["Engines (with GE/Safran talks)", "License + co-develop path", "The margin unlock of the decade if landed"]],
  BEL: [["Radars & EW suites", "~60% share of defence electronics", "Akash, Arudhra, Uttam AESA programme flow"], ["QRSAM/Akash weapon systems", "Missile-systems electronics", "₹75k cr+ order book, 3.5× revenue"]],
  MAZDOCK: [["Scorpene submarines (P-75)", "India's only conventional-sub yard", "3 add-on boats + P-75I candidacy"], ["P-15B destroyers/frigates", "Visakhapatnam-class deliveries", "Surface-fleet expansion annuity"]],
};

// ---------------------------------------------------------------------------
// How each sector is VALUED — the metrics practitioners actually anchor on,
// and why. keys map to computed ratios; kind: "valuation" (lower = cheaper)
// or "quality" (higher = better) or "risk" (lower = better).
// ---------------------------------------------------------------------------
export const SECTOR_VALUATION = {
  BANK: {
    intro: "Banks are valued on price-to-book against the ROE they generate — because a bank's assets are loans marked close to fair value, book value is the real anchor. A bank earning 16%+ ROE with clean assets deserves 2-3× book; one earning 10% with rising NPAs struggles to hold 1×.",
    metrics: [
      { key: "pb", label: "Price / Book", kind: "valuation", why: "The anchor multiple — book value ≈ loan book marked near fair value" },
      { key: "roe", label: "ROE", kind: "quality", why: "What justifies the book multiple — the compounding rate of the bank" },
      { key: "roa", label: "ROA", kind: "quality", why: "Leverage-free profitability; 1%+ is strong for Indian banks" },
      { key: "gnpaPct", label: "Gross NPA", kind: "risk", why: "Asset-quality — bad loans erode book value directly" },
      { key: "casaPct", label: "CASA", kind: "quality", why: "Low-cost deposit share — the funding moat behind NIMs" },
      { key: "costToIncomePct", label: "Cost-to-income", kind: "risk", why: "Operating efficiency of the franchise" },
    ],
  },
  NBFC: {
    intro: "NBFCs are judged like banks — price-to-book vs ROE — but with a premium/penalty for funding resilience, since they borrow wholesale rather than gather deposits. AUM growth quality and through-cycle credit costs separate compounders from blow-ups.",
    metrics: [
      { key: "pb", label: "Price / Book", kind: "valuation", why: "Book anchors lender valuation" },
      { key: "roe", label: "ROE", kind: "quality", why: "The multiple justifier" },
      { key: "roa", label: "ROA", kind: "quality", why: "2%+ ROA marks a superior lending franchise" },
      { key: "revCagr3Pct", label: "AUM/income growth", kind: "quality", why: "Growth engine — but only with credit discipline" },
    ],
  },
  IT: {
    intro: "IT services trade on P/E and EV/EBITDA against revenue growth and margin stability — asset-light businesses where free cash conversion is king. Rupee EPS growth plus 85%+ FCF conversion and buyback/dividend yields set the premium between Tier-1s.",
    metrics: [
      { key: "pe", label: "P/E", kind: "valuation", why: "Primary multiple for asset-light compounders" },
      { key: "evEbitda", label: "EV/EBITDA", kind: "valuation", why: "Cross-checks P/E adjusting for cash piles" },
      { key: "opMarginPct", label: "Operating margin", kind: "quality", why: "Pricing power + pyramid efficiency (industry band ~15-26%)" },
      { key: "revCagr3Pct", label: "Revenue CAGR", kind: "quality", why: "Deal-wins converting to growth — the re-rating trigger" },
      { key: "priceToFcf", label: "Price/FCF", kind: "valuation", why: "Cash conversion honesty check on earnings" },
    ],
  },
  AUTO: {
    intro: "Autos are cyclical manufacturers valued on EV/EBITDA through the cycle — volume growth, realisation per vehicle and margin torque matter more than a point-in-time P/E. Franchise strength (SUV share, EV positioning) earns the premium.",
    metrics: [
      { key: "evEbitda", label: "EV/EBITDA", kind: "valuation", why: "Standard multiple for cyclical manufacturers" },
      { key: "pe", label: "P/E", kind: "valuation", why: "Secondary check at mid-cycle earnings" },
      { key: "revCagr3Pct", label: "Revenue CAGR", kind: "quality", why: "Volume × realisation growth" },
      { key: "opMarginPct", label: "Operating margin", kind: "quality", why: "Mix (SUV/premium) and commodity pass-through power" },
      { key: "roce", label: "ROCE", kind: "quality", why: "Capital discipline across capex cycles" },
    ],
  },
  PHARMA: {
    intro: "Pharma is a sum-of-parts market: domestic branded franchises deserve FMCG-like P/Es, US generics get cyclical multiples, and specialty/CDMO pipelines are optionality. Gross margin signals the mix quality; EV/EBITDA is the working multiple.",
    metrics: [
      { key: "pe", label: "P/E", kind: "valuation", why: "Headline multiple, blended across segments" },
      { key: "evEbitda", label: "EV/EBITDA", kind: "valuation", why: "Preferred for R&D-heavy comparisons" },
      { key: "grossMarginPct", label: "Gross margin", kind: "quality", why: "Specialty/branded mix vs commodity generics (60%+ = quality mix)" },
      { key: "revCagr3Pct", label: "Revenue CAGR", kind: "quality", why: "Launch momentum + domestic chronic growth" },
      { key: "roce", label: "ROCE", kind: "quality", why: "R&D productivity check" },
    ],
  },
  FMCG: {
    intro: "FMCG carries India's scarcity premium — 45-65× P/E for businesses with near-infinite ROCE, decades of pricing power and negative working capital. Volume growth is the re-rating currency; payout ratios and ROCE justify the multiple.",
    metrics: [
      { key: "pe", label: "P/E", kind: "valuation", why: "The premium gauge — India's most expensive sector for a reason" },
      { key: "revCagr3Pct", label: "Revenue CAGR", kind: "quality", why: "Volume-led growth is what re-rates FMCG" },
      { key: "grossMarginPct", label: "Gross margin", kind: "quality", why: "Brand pricing power vs input inflation" },
      { key: "roce", label: "ROCE", kind: "quality", why: "Capital-light compounding (often 40%+)" },
      { key: "dividendPayoutPct", label: "Payout ratio", kind: "quality", why: "Cash return culture backs the premium" },
    ],
  },
  METAL: {
    intro: "Metals are deep cyclicals valued on EV/EBITDA at normalised spreads and EV per tonne of capacity — buy at high multiples on trough earnings, sell at low multiples on peak. Balance-sheet leverage decides who survives the trough.",
    metrics: [
      { key: "evEbitda", label: "EV/EBITDA", kind: "valuation", why: "The cycle multiple — read against where spreads are" },
      { key: "netDebtEbitda", label: "Net debt/EBITDA", kind: "risk", why: "Survival metric — >3× at the peak is a red flag" },
      { key: "opMarginPct", label: "Operating margin", kind: "quality", why: "Cost-curve position (integration, captive mines)" },
      { key: "pb", label: "Price/Book", kind: "valuation", why: "Trough-cycle floor valuation" },
    ],
  },
  ENERGY: {
    intro: "Energy splits into regulated utilities (valued on P/B against assured regulated ROE) and commodity producers (EV/EBITDA, dividend yield). Renewables platforms trade on EV/MW and growth pipeline instead of current earnings.",
    metrics: [
      { key: "evEbitda", label: "EV/EBITDA", kind: "valuation", why: "Cash-flow multiple across the complex" },
      { key: "pb", label: "Price/Book", kind: "valuation", why: "Regulated-asset-base anchor for utilities" },
      { key: "dividendYieldPct", label: "Dividend yield", kind: "quality", why: "Cash-return floor for mature producers" },
      { key: "roce", label: "ROCE", kind: "quality", why: "Against ~15.5% regulated ROE benchmarks" },
    ],
  },
  INFRA: {
    intro: "Infra/EPC is valued on EV/EBITDA with the real diligence in the order book (book-to-bill), execution velocity and working-capital hygiene — receivables from governments decide whether accounting profit becomes cash. Cement inside this sector trades on EV/tonne.",
    metrics: [
      { key: "evEbitda", label: "EV/EBITDA", kind: "valuation", why: "Standard for asset/execution businesses" },
      { key: "revCagr3Pct", label: "Revenue CAGR", kind: "quality", why: "Order-book conversion into execution" },
      { key: "interestCoverage", label: "Interest coverage", kind: "quality", why: "Leverage discipline — EPC graveyards are full of 1× coverage names" },
      { key: "workingCapitalDays", label: "Working-capital days", kind: "risk", why: "Government receivables stretch kills cash conversion" },
    ],
  },
  REALTY: {
    intro: "Developers are valued on NAV (land bank marked to market) with price-to-book as the listed proxy, plus pre-sales momentum — bookings today are P&L three years out. Net debt is the cycle-survival metric.",
    metrics: [
      { key: "pb", label: "Price/Book (NAV proxy)", kind: "valuation", why: "Land bank value is the real asset" },
      { key: "revCagr3Pct", label: "Revenue CAGR", kind: "quality", why: "Proxy for pre-sales converting to recognition" },
      { key: "netDebtEbitda", label: "Net debt/EBITDA", kind: "risk", why: "Leverage killed an entire generation of developers" },
      { key: "roe", label: "ROE", kind: "quality", why: "Asset-turn discipline on the land bank" },
    ],
  },
  CHEM: {
    intro: "Specialty chemicals earn P/E premiums proportional to chemistry depth — fluorination, multi-step synthesis, CDMO contracts — visible in gross margins. Commodity chemistry trades on EV/EBITDA at spread cycles.",
    metrics: [
      { key: "pe", label: "P/E", kind: "valuation", why: "Specialty premium gauge" },
      { key: "evEbitda", label: "EV/EBITDA", kind: "valuation", why: "Cycle-adjusted cross-check" },
      { key: "grossMarginPct", label: "Gross margin", kind: "quality", why: "Chemistry complexity shows up here first" },
      { key: "revCagr3Pct", label: "Revenue CAGR", kind: "quality", why: "Capex commissioning into demand" },
    ],
  },
  CDUR: {
    intro: "Consumer durables & EMS trade on P/E against growth — penetration stories (ACs) and PLI-fuelled manufacturing (EMS) justify 40-70× when growth is 25%+. Working-capital efficiency separates brands from box-movers.",
    metrics: [
      { key: "pe", label: "P/E", kind: "valuation", why: "Growth-premium gauge" },
      { key: "revCagr3Pct", label: "Revenue CAGR", kind: "quality", why: "The entire bull case — penetration + PLI ramp" },
      { key: "roce", label: "ROCE", kind: "quality", why: "Brand strength vs contract-manufacturing thinness" },
      { key: "workingCapitalDays", label: "Working-capital days", kind: "risk", why: "Channel inventory discipline" },
    ],
  },
  TELECOM: {
    intro: "Telecom is valued on EV/EBITDA — capex-heavy, high-depreciation businesses where operating cash matters more than accounting EPS. ARPU trajectory and leverage decide the multiple; towers/infra get annuity multiples.",
    metrics: [
      { key: "evEbitda", label: "EV/EBITDA", kind: "valuation", why: "The sector's lingua franca — EPS is depreciation-distorted" },
      { key: "netDebtEbitda", label: "Net debt/EBITDA", kind: "risk", why: "Spectrum debt loads make this existential" },
      { key: "opMarginPct", label: "EBITDA margin", kind: "quality", why: "ARPU flow-through to profitability" },
      { key: "revCagr3Pct", label: "Revenue CAGR", kind: "quality", why: "Tariff repair + subscriber mix" },
    ],
  },
  DEFENCE: {
    intro: "Defence PSUs are valued on P/E against order-book visibility — books at 3-6× revenue justify premium multiples if execution converts. Working capital (government receivables) and margin mix (indigenous vs licence) are the quality tells.",
    metrics: [
      { key: "pe", label: "P/E", kind: "valuation", why: "Headline multiple on visible earnings" },
      { key: "revCagr3Pct", label: "Revenue CAGR", kind: "quality", why: "Order-book → revenue conversion rate" },
      { key: "roe", label: "ROE", kind: "quality", why: "Execution efficiency on government capital" },
      { key: "workingCapitalDays", label: "Working-capital days", kind: "risk", why: "MoD payment cycles strain cash" },
    ],
  },
};

export const SECTOR_PRODUCT_TEMPLATE = {
  IT: "software services, engineering and platform contracts", BANK: "deposits, loans, cards and fee products",
  NBFC: "loan products across vehicles, SME and consumer credit", AUTO: "vehicle platforms and mobility services",
  PHARMA: "formulations, APIs and specialty therapies", FMCG: "branded consumer staples portfolios",
  METAL: "primary and value-added metal products", ENERGY: "energy production, refining and distribution",
  INFRA: "EPC contracts and infrastructure assets", REALTY: "residential and commercial developments",
  CHEM: "specialty and commodity chemistry", CDUR: "consumer appliances and electronics",
  TELECOM: "connectivity, spectrum and digital services", DEFENCE: "defence platforms and systems",
};
