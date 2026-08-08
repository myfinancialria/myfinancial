#!/usr/bin/env node
// ---------------------------------------------------------------------------
// fyers_login.mjs — the once-per-~15-days FYERS login, made painless.
//
// FYERS's flow: login URL → you authenticate (OTP/TOTP + PIN) → redirect
// carries a short-lived auth_code → that code must be EXCHANGED for the
// access_token (1 day) + refresh_token (~15 days). This script does every
// step around your login automatically:
//
//   node scripts/fyers_login.mjs
//
//   1. asks for App ID + Secret (or reads FYERS_APP_ID / FYERS_SECRET_ID
//      from env/.env), prints your login URL and opens it
//   2. you log in; paste back the redirected URL (or just the auth_code)
//   3. exchanges it → prints token validity, then OFFERS to:
//        • update the GitHub secret  FYERS_REFRESH_TOKEN   (via gh CLI)
//        • write .env with today's access token
//        • push the token into the local app (http://localhost:5599)
//   After this, the 08:45 IST workflow keeps everything automatic until the
//   refresh token lapses again.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import fs from "node:fs";
import readline from "node:readline/promises";
import { execFileSync, execSync } from "node:child_process";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, def = "") => ((await rl.question(def ? `${q} [${def}]: ` : `${q}: `)) || def).trim();

// pick up .env if present
try {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* optional */ }

console.log("\n◆ FYERS login helper — one interactive login, ~15 days of automation\n");
const appId = process.env.FYERS_APP_ID || await ask("FYERS App ID (e.g. AB12345-100)");
const secret = process.env.FYERS_SECRET_ID || await ask("FYERS Secret ID (from myapi.fyers.in → your app)");
const redirect = await ask("Redirect URI registered on your app", "https://trade.fyers.in/api-login/redirect-uri/index.html");

const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&state=myfinancial`;
console.log(`\n1) Open this URL and log in (OTP/TOTP + PIN):\n\n   ${authUrl}\n`);
try { execFileSync(process.platform === "darwin" ? "open" : "xdg-open", [authUrl], { stdio: "ignore" }); console.log("   (opened in your browser)"); } catch { /* manual open */ }

const pasted = await ask("\n2) After login you land on the redirect page — paste the FULL URL from the address bar (or just the auth_code)");
const authCode = (pasted.match(/auth_code=([^&\s]+)/) || [, pasted])[1];
if (!authCode || authCode.length < 20) { console.error("✗ That doesn't look like an auth code."); process.exit(1); }

const appIdHash = crypto.createHash("sha256").update(`${appId}:${secret}`).digest("hex");
console.log("\n3) Exchanging auth_code for tokens …");
const res = await fetch("https://api-t1.fyers.in/api/v3/validate-authcode", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ grant_type: "authorization_code", appIdHash, code: authCode }),
});
const j = await res.json().catch(() => ({}));
if (!res.ok || j.s !== "ok" || !j.access_token) {
  console.error(`✗ Exchange failed (HTTP ${res.status}): ${j.message || JSON.stringify(j).slice(0, 200)}`);
  console.error("  Auth codes expire in minutes — rerun and paste promptly.");
  process.exit(1);
}
const { access_token, refresh_token } = j;
console.log(`   ✓ access_token (valid today): ${access_token.slice(0, 10)}…(${access_token.length} chars)`);
console.log(`   ✓ refresh_token (valid ~15 days): ${refresh_token ? refresh_token.slice(0, 10) + "…(" + refresh_token.length + " chars)" : "NOT ISSUED — enable it on your FYERS app settings"}`);

// ---- automate the follow-ups ------------------------------------------------
if (refresh_token && (await ask("\nUpdate GitHub secret FYERS_REFRESH_TOKEN now via gh CLI? (y/n)", "y")).toLowerCase().startsWith("y")) {
  try {
    execSync("gh secret set FYERS_REFRESH_TOKEN", { input: refresh_token, stdio: ["pipe", "inherit", "inherit"] });
    console.log("   ✓ GitHub secret FYERS_REFRESH_TOKEN updated — the 08:45 IST workflow is now self-sufficient.");
  } catch { console.log("   ✗ gh CLI failed — run manually:  gh secret set FYERS_REFRESH_TOKEN"); }
}

if ((await ask("Write/refresh local .env with these FYERS values? (y/n)", "y")).toLowerCase().startsWith("y")) {
  let env = "";
  try { env = fs.readFileSync(".env", "utf8"); } catch { /* new file */ }
  const put = (k, v) => { env = env.match(new RegExp(`^${k}=`, "m")) ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : env + (env.endsWith("\n") || !env ? "" : "\n") + `${k}=${v}\n`; };
  put("FYERS_APP_ID", appId); put("FYERS_SECRET_ID", secret);
  put("FYERS_ACCESS_TOKEN", access_token);
  if (refresh_token) put("FYERS_REFRESH_TOKEN", refresh_token);
  put("MYFIN_PROVIDER", "fyers");
  fs.writeFileSync(".env", env);
  console.log("   ✓ .env written (gitignored).");
}

if ((await ask("Push today's token into the local app at http://localhost:5599 now? (y/n)", "y")).toLowerCase().startsWith("y")) {
  try {
    const sess = await (await fetch("http://localhost:5599/api/public-session")).json();
    const push = await (await fetch("http://localhost:5599/api/settings/connections", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sess.data.token}` },
      body: JSON.stringify({ MYFIN_PROVIDER: "fyers", FYERS_APP_ID: appId, FYERS_ACCESS_TOKEN: access_token }),
    })).json();
    console.log(push?.ok ? `   ✓ local app now on live FYERS data (mode=${push.data.market.mode}) — candles syncing.` : `   ✗ push failed: ${JSON.stringify(push).slice(0, 120)}`);
  } catch (e) { console.log(`   ✗ local app not reachable (${e.message}) — start it with npm start.`); }
}

console.log("\nDone. Daily refresh: automatic at 08:45 IST via GitHub Actions. Re-run this script when the refresh token lapses (~15 days).\n");
rl.close();
