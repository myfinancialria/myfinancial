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

server.listen(PORT, () => {
  console.log(`\n  myfinancial ▸ http://localhost:${PORT}`);
  console.log(`  market ${marketStatus().open ? "OPEN" : "CLOSED"} (IST ${marketStatus().istTime}) · live ticks simulated on /ws\n`);
});
