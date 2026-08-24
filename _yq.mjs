import { yahooAuth, yahooHeaders, getJson, sleep } from "./scripts/lib/net.mjs";
const SYMS = [
  ["India · NIFTY 50","^NSEI"],["India · SENSEX","^BSESN"],["India · BANK NIFTY","^NSEBANK"],
  ["India · NIFTY IT","^CNXIT"],["India · INDIA VIX","^INDIAVIX"],
  ["GIFT NIFTY?","NIFTY_F1.NS"],
  ["US · S&P 500","^GSPC"],["US · NASDAQ","^IXIC"],["US · DOW","^DJI"],["US · VIX","^VIX"],
  ["Asia · NIKKEI","^N225"],["Asia · HANG SENG","^HSI"],["Asia · SHANGHAI","000001.SS"],["Asia · KOSPI","^KS11"],
  ["EU · FTSE 100","^FTSE"],["EU · DAX","^GDAXI"],
  ["FX · USD/INR","INR=X"],["FX · Dollar index","DX-Y.NYB"],
  ["Cmdty · Brent","BZ=F"],["Cmdty · Gold","GC=F"],["Bond · US 10Y","^TNX"],
];
const auth = await yahooAuth();
console.log("yahoo auth:", auth.crumb ? "crumb acquired" : "NO crumb (degrading)");
console.log();
for (const [label, sym] of SYMS) {
  try {
    const j = await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
      { headers: yahooHeaders(), retries: 2, timeout: 20000 });
    const m = j?.chart?.result?.[0]?.meta;
    if (!m?.regularMarketPrice) { console.log(label.padEnd(22), sym.padEnd(13), "✗ no price"); continue; }
    const prev = m.chartPreviousClose ?? m.previousClose;
    const pct = prev ? ((m.regularMarketPrice - prev) / prev) * 100 : null;
    console.log(label.padEnd(22), sym.padEnd(13),
      String(m.regularMarketPrice.toFixed(2)).padStart(11),
      (pct == null ? "—" : (pct > 0 ? "+" : "") + pct.toFixed(2) + "%").padStart(8),
      (m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString().slice(0, 16) : "?"),
      m.exchangeTimezoneName ?? "");
  } catch (e) { console.log(label.padEnd(22), sym.padEnd(13), "✗", String(e.message).slice(0, 40)); }
  await sleep(350);
}
