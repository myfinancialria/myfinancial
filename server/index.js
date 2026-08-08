// ---------------------------------------------------------------------------
// myfinancial server — REST API + WebSocket live ticks + static SPA.
//   npm start → http://localhost:5599
// ---------------------------------------------------------------------------
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

import { seedIfEmpty } from "./lib/db.js";
import { cfg, setCfg } from "./lib/config.js";
import { restart as liveRestart } from "./providers/live.js";
import { startTicker, marketStatus, startLiveFeed, loadNseMaster } from "./engines/market.js";
import { api } from "./routes/api.js";
import { learn } from "./routes/learn.js";
import { seedArticles } from "./engines/seo.js";
import { warmup as amfiWarmup } from "./providers/amfi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5599;

seedIfEmpty();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "6mb" }));

// security headers (TLS 1.3 terminates at the reverse proxy in production)
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "same-origin");
  if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
  next();
});

app.use("/api", api);
app.use(learn);                 // /learn, /learn/:slug, /sitemap.xml, /robots.txt (server-rendered SEO)

// vendor: TradingView Lightweight Charts (MIT) served from node_modules
app.get("/vendor/lightweight-charts.js", (req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.sendFile(path.join(__dirname, "..", "node_modules", "lightweight-charts", "dist", "lightweight-charts.standalone.production.js"));
});

// ---- Upstox OAuth callback: the whole daily login, hands-free ---------------
// You click one link, log in at Upstox, and land back here. The code is
// exchanged server-side with your stored key/secret, the token is saved
// encrypted, the live feed restarts and real fundamentals begin caching.
// (Upstox issues no retail refresh token, so this daily click is the ceiling.)
app.get("/upstox/callback", async (req, res) => {
  const page = (title, body, ok = true) => res.status(ok ? 200 : 400).type("html").send(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>
     <style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0a0a0a;color:#f2f2f2;
     display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}
     .card{max-width:520px;border:1px solid #262626;padding:32px 34px;background:#111}
     h1{font-size:19px;margin:0 0 12px;letter-spacing:-.01em}p{color:#a3a3a3;line-height:1.65;font-size:14px;margin:0 0 10px}
     a{color:#f2f2f2;display:inline-block;margin-top:16px;padding:9px 18px;border:1px solid #404040;text-decoration:none;font-size:13px}
     a:hover{background:#1a1a1a}</style>
     <div class="card"><h1>${title}</h1>${body}<a href="/app#/equities/RELIANCE">Open the app →</a></div>`);
  try {
    const { code, error } = req.query;
    if (error || !code) return page("Upstox login was not completed", `<p>${error ? String(error).slice(0, 200) : "No authorization code came back."} Reopen the Connections panel and try Connect again.</p>`, false);
    const apiKey = cfg("UPSTOX_API_KEY"), apiSecret = cfg("UPSTOX_API_SECRET");
    if (!apiKey || !apiSecret) return page("Upstox app credentials missing", "<p>Save your Upstox API key and secret in ⚙ Connections first, then click Connect.</p>", false);
    const r = await fetch("https://api.upstox.com/v2/login/authorization/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        code: String(code), client_id: apiKey, client_secret: apiSecret,
        redirect_uri: cfg("UPSTOX_REDIRECT_URI") || `${req.protocol}://${req.get("host")}/upstox/callback`,
        grant_type: "authorization_code",
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      const msg = j?.errors?.[0]?.message || j?.message || `HTTP ${r.status}`;
      return page("Token exchange failed", `<p>${String(msg).slice(0, 240)}</p><p>Authorization codes expire within minutes — click Connect and complete the login promptly. Also confirm the redirect URI registered on your Upstox app matches this address exactly.</p>`, false);
    }
    setCfg("UPSTOX_ACCESS_TOKEN", j.access_token);
    if (!cfg("MYFIN_PROVIDER") || cfg("MYFIN_PROVIDER") === "synthetic") setCfg("MYFIN_PROVIDER", "upstox");
    liveRestart();
    const { STOCKS } = await import("./data/universe.js");
    const uf = await import("./providers/ufundamentals.js");
    uf.warmup(STOCKS.map((s) => s.symbol), { startDelayMs: 500 }).catch(() => {});
    page("Upstox connected ✓", `<p>Signed in${j.user_name ? ` as <b>${String(j.user_name).slice(0, 60)}</b>` : ""}. Live NSE prices are on, and real company fundamentals — statements, ratios with sector benchmarks, shareholding — are caching in the background now (about 90 seconds).</p><p>The token expires around 3:30 AM IST. Click Connect again tomorrow.</p>`);
  } catch (e) {
    page("Something went wrong", `<p>${String(e.message).slice(0, 200)}</p>`, false);
  }
});

// marketing site at /, application SPA at /app
const pub = path.join(__dirname, "..", "public");
app.get("/", (req, res) => res.sendFile(path.join(pub, "home.html")));
app.get(["/app", "/app/*"], (req, res) => res.sendFile(path.join(pub, "index.html")));
app.use(express.static(pub, { index: false }));
app.get("*", (req, res) => res.sendFile(path.join(pub, "home.html")));

const server = http.createServer(app);

// ------------------------------ WebSocket -----------------------------------
const wss = new WebSocketServer({ server, path: "/ws" });
function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) if (client.readyState === 1) client.send(payload);
}
wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "hello", status: marketStatus(), ts: Date.now() }));
});
startTicker(broadcast);
startLiveFeed();               // no-op unless MYFIN_PROVIDER=upstox|fyers + tokens set
seedArticles().catch((e) => console.log("  seo seed:", e.message));
amfiWarmup().catch(() => {});   // background: real returns for the live MF screener & baskets
loadNseMaster().catch(() => {}); // background: full NSE symbol master (~2,000 listed companies)
// background: REAL company fundamentals — Upstox first (filed exchange data),
// Yahoo as the always-available backup for anything Upstox does not cover.
(async () => {
  const { STOCKS } = await import("./data/universe.js");
  const syms = STOCKS.map((s) => s.symbol);
  const uf = await import("./providers/ufundamentals.js");
  const yf = await import("./providers/yfundamentals.js");
  if (uf.configured()) uf.warmup(syms).catch(() => {});
  yf.warmup(syms).catch(() => {});
})();

server.listen(PORT, () => {
  console.log(`\n  myfinancial ▸ http://localhost:${PORT}`);
  console.log(`  market ${marketStatus().open ? "OPEN" : "CLOSED"} (IST ${marketStatus().istTime}) · live ticks simulated on /ws\n`);
});
