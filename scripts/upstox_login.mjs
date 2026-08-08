#!/usr/bin/env node
// ---------------------------------------------------------------------------
// upstox_login.mjs — one interactive Upstox login, then everything is automatic
// for the rest of the trading day.
//
// Upstox OAuth2: authorize URL → you log in (mobile + OTP + PIN) → the redirect
// carries ?code=… → that code is EXCHANGED for an access_token valid until
// ~03:30 IST the next morning. Upstox issues no retail refresh token, so this
// login is the daily ceiling — the script makes it a ~60 second job.
//
//   node scripts/upstox_login.mjs
//
//   1. reads UPSTOX_API_KEY / UPSTOX_API_SECRET from env/.env (or asks),
//      prints and opens your login URL
//   2. you log in; paste back the redirected URL (or just the code)
//   3. exchanges it → then OFFERS to:
//        • write .env with today's access token
//        • push the token into the running app (http://localhost:5599)
//        • update the GitHub secret UPSTOX_ACCESS_TOKEN (via gh CLI)
//
// The token unlocks BOTH live prices AND the Upstox Company Fundamentals API
// (real filed statements, ratios with sector benchmarks, shareholding).
// ---------------------------------------------------------------------------
import fs from "node:fs";
import readline from "node:readline/promises";
import { execFileSync, execSync } from "node:child_process";

// Non-interactive mode: pass the redirected URL (or bare code) as an argument
//   node scripts/upstox_login.mjs "https://127.0.0.1:5000/callback?code=…"
// Everything — exchange, .env write, app push — then runs without prompts.
// This is the path to use when your app's registered redirect URI points
// somewhere this server cannot listen (a different host, port or scheme).
const ARG = process.argv[2] || "";
const AUTO = !!ARG;

const rl = AUTO ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, def = "") => {
  if (AUTO) return def;                       // accept every default, ask nothing
  return ((await rl.question(def ? `${q} [${def}]: ` : `${q}: `)) || def).trim();
};

try {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* optional */ }

console.log("\n◆ Upstox login helper — unlocks live prices + REAL company fundamentals\n");
const apiKey = process.env.UPSTOX_API_KEY || await ask("Upstox API Key (from account.upstox.com → Apps → your app)");
const apiSecret = process.env.UPSTOX_API_SECRET || await ask("Upstox API Secret");
const redirect = process.env.UPSTOX_REDIRECT_URI || await ask("Redirect URI registered on the app", "http://localhost:5599/upstox/callback");

let pasted = ARG;
if (!AUTO) {
  const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?client_id=${encodeURIComponent(apiKey)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&state=myfinancial`;
  console.log(`\n1) Open this URL and log in (mobile number + OTP + PIN):\n\n   ${authUrl}\n`);
  try { execFileSync(process.platform === "darwin" ? "open" : "xdg-open", [authUrl], { stdio: "ignore" }); console.log("   (opened in your browser)"); } catch { /* manual open */ }
  pasted = await ask("\n2) After login you land on the redirect page — paste the FULL URL from the address bar (or just the code)");
}
const code = (pasted.match(/[?&]code=([^&\s]+)/) || [, pasted])[1];
if (!code || code.length < 6) { console.error("✗ That doesn't look like an authorization code."); process.exit(1); }

console.log("\n3) Exchanging the code for today's access token …");
const res = await fetch("https://api.upstox.com/v2/login/authorization/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
  body: new URLSearchParams({
    code: decodeURIComponent(code), client_id: apiKey, client_secret: apiSecret,
    redirect_uri: redirect, grant_type: "authorization_code",
  }),
});
const j = await res.json().catch(() => ({}));
if (!res.ok || !j.access_token) {
  console.error(`✗ Exchange failed (HTTP ${res.status}): ${j.errors?.[0]?.message || j.message || JSON.stringify(j).slice(0, 220)}`);
  console.error("  Authorization codes expire within minutes — rerun and paste promptly.");
  console.error("  Also confirm the Redirect URI here matches the one registered on the app exactly.");
  process.exit(1);
}
const token = j.access_token;
console.log(`   ✓ access_token: ${token.slice(0, 10)}…(${token.length} chars) — valid until ~03:30 IST tomorrow`);
if (j.user_name) console.log(`   ✓ authenticated as: ${j.user_name}${j.user_id ? ` (${j.user_id})` : ""}`);

// quick capability probe: does this token actually reach the fundamentals API?
try {
  const probe = await fetch("https://api.upstox.com/v2/fundamentals/INE002A01018/key-ratios", {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
  });
  if (probe.ok) {
    const pj = await probe.json();
    const n = (Array.isArray(pj?.data) ? pj.data : pj?.data?.key_ratios || []).length;
    console.log(`   ✓ Company Fundamentals API reachable — ${n} key ratios returned for the test ISIN.`);
  } else {
    console.log(`   ! Fundamentals API returned HTTP ${probe.status} — if this is 401/403, enable the Company Fundamentals entitlement on your Upstox app. Live prices will still work.`);
  }
} catch { /* network hiccup — not fatal */ }

if ((await ask("\nWrite/refresh local .env with these Upstox values? (y/n)", "y")).toLowerCase().startsWith("y")) {
  let env = "";
  try { env = fs.readFileSync(".env", "utf8"); } catch { /* new file */ }
  const put = (k, v) => { env = env.match(new RegExp(`^${k}=`, "m")) ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : env + (env.endsWith("\n") || !env ? "" : "\n") + `${k}=${v}\n`; };
  put("UPSTOX_API_KEY", apiKey); put("UPSTOX_API_SECRET", apiSecret);
  put("UPSTOX_REDIRECT_URI", redirect); put("UPSTOX_ACCESS_TOKEN", token);
  fs.writeFileSync(".env", env);
  console.log("   ✓ .env written (gitignored — never committed).");
}

if ((await ask("Push the token into the running app at http://localhost:5599 now? (y/n)", "y")).toLowerCase().startsWith("y")) {
  try {
    const sess = await (await fetch("http://localhost:5599/api/public-session")).json();
    const push = await (await fetch("http://localhost:5599/api/settings/connections", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sess.data.token}` },
      body: JSON.stringify({ UPSTOX_ACCESS_TOKEN: token }),
    })).json();
    console.log(push?.ok
      ? "   ✓ app updated — real fundamentals begin caching in the background (about 90 seconds for the curated universe)."
      : `   ✗ push failed: ${JSON.stringify(push).slice(0, 140)}`);
  } catch (e) { console.log(`   ✗ local app not reachable (${e.message}) — start it with npm start, then rerun.`); }
}

if ((await ask("Update GitHub secret UPSTOX_ACCESS_TOKEN via gh CLI? (y/n)", "n")).toLowerCase().startsWith("y")) {
  try {
    execSync("gh secret set UPSTOX_ACCESS_TOKEN", { input: token, stdio: ["pipe", "inherit", "inherit"] });
    console.log("   ✓ GitHub secret updated — the 17:00 IST Pages build can use it today.");
  } catch { console.log("   ✗ gh CLI failed — run manually:  gh secret set UPSTOX_ACCESS_TOKEN"); }
}

console.log("\nDone. Upstox tokens expire ~03:30 IST daily — rerun this before the market opens.");
console.log("Cached fundamentals stay valid for 3 days, so stock pages keep their real data even after the token lapses.\n");
if (rl) rl.close();
