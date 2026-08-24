import { getJson, sleep } from "./scripts/lib/net.mjs";
const SYMS = [["NIFTY 50","^NSEI"],["SENSEX","^BSESN"],["S&P 500","^GSPC"],["NASDAQ","^IXIC"],
              ["USD/INR","INR=X"],["Gold","GC=F"],["INDIA VIX","^INDIAVIX"]];
console.log("cooling down 45s, then 3s between requests…");
await sleep(45000);
let ok = 0;
for (const [label, sym] of SYMS) {
  try {
    const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
      { retries: 3, timeout: 20000 });
    const m = j?.chart?.result?.[0]?.meta;
    const prev = m?.chartPreviousClose ?? m?.previousClose;
    const pct = prev && m?.regularMarketPrice ? ((m.regularMarketPrice - prev) / prev) * 100 : null;
    console.log(label.padEnd(12), sym.padEnd(10), String(m?.regularMarketPrice?.toFixed(2) ?? "—").padStart(11),
      (pct == null ? "—" : (pct > 0 ? "+" : "") + pct.toFixed(2) + "%").padStart(8));
    if (m?.regularMarketPrice) ok++;
  } catch (e) { console.log(label.padEnd(12), sym.padEnd(10), "✗", String(e.message).slice(0, 30)); }
  await sleep(3000);
}
console.log(`\n${ok}/${SYMS.length} resolved with 3s spacing`);
