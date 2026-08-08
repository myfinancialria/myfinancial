#!/usr/bin/env node
// ---------------------------------------------------------------------------
// refresh_fyers_token.mjs — fully automatic daily broker token refresh.
//
// FYERS access tokens expire daily, but the REFRESH TOKEN issued at login is
// valid ~15 days and can be exchanged headlessly (refresh_token + API pin →
// fresh access token). This script:
//   1. exchanges FYERS_REFRESH_TOKEN for a new access token
//   2. pushes it into the running app via the ⚙ Connections API (APP_URL)
// so the platform stays on live NSE data with zero manual logins for ~2 weeks
// at a time. Re-login once when the refresh token itself expires.
//
// Inputs (env / GitHub Actions Secrets):
//   FYERS_APP_ID          e.g. AB12345-100
//   FYERS_SECRET_ID       app secret from myapi.fyers.in
//   FYERS_REFRESH_TOKEN   from the login response
//   FYERS_PIN             your 4-digit API pin
//   APP_URL               e.g. https://myfinancial.onrender.com  (optional —
//                         omit to just print/export the token)
//
// NOTE: Upstox has no refresh-token flow for standard retail apps — SEBI-era
// rules require an interactive login daily, so Upstox cannot be automated
// this way. Use FYERS for unattended live data, or paste the Upstox token
// into ⚙ Connections each morning.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import fs from "node:fs";

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.log(`[fyers-refresh] ${k} not set — nothing to do (add it with: gh secret set ${k})`); process.exit(0); }
  return v.trim();
};

const appId = need("FYERS_APP_ID");
const secret = need("FYERS_SECRET_ID");
const refreshToken = need("FYERS_REFRESH_TOKEN");
const pin = need("FYERS_PIN");
const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");

const appIdHash = crypto.createHash("sha256").update(`${appId}:${secret}`).digest("hex");

console.log(`[fyers-refresh] exchanging refresh token for ${appId} …`);
const res = await fetch("https://api-t1.fyers.in/api/v3/validate-refresh-token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ grant_type: "refresh_token", appIdHash, refresh_token: refreshToken, pin }),
});
const json = await res.json().catch(() => ({}));
if (!res.ok || json.s !== "ok" || !json.access_token) {
  console.error(`[fyers-refresh] FAILED (HTTP ${res.status}): ${json.message || json.s || "no access_token"} — the refresh token may have expired (~15 days). Log in once at myapi.fyers.in and update FYERS_REFRESH_TOKEN.`);
  process.exit(1);
}
const accessToken = json.access_token;
console.log(`[fyers-refresh] fresh access token issued (${accessToken.slice(0, 10)}…, ${accessToken.length} chars)`);

// expose for chained CI steps without printing the full token to logs
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `FYERS_ACCESS_TOKEN=${accessToken}\n`);

if (!appUrl) { console.log("[fyers-refresh] APP_URL not set — token exported; not pushing to any app."); process.exit(0); }

console.log(`[fyers-refresh] pushing to ${appUrl} …`);
const sess = await (await fetch(`${appUrl}/api/public-session`)).json();
if (!sess?.ok) { console.error("[fyers-refresh] could not open app session:", JSON.stringify(sess).slice(0, 120)); process.exit(1); }
const push = await (await fetch(`${appUrl}/api/settings/connections`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${sess.data.token}` },
  body: JSON.stringify({ MYFIN_PROVIDER: "fyers", FYERS_APP_ID: appId, FYERS_ACCESS_TOKEN: accessToken }),
})).json();
if (!push?.ok) { console.error("[fyers-refresh] push failed:", JSON.stringify(push).slice(0, 160)); process.exit(1); }
console.log(`[fyers-refresh] ✅ app is now on live FYERS data (mode=${push.data.market.mode}). Valid until ~tomorrow's refresh.`);
