// ---------------------------------------------------------------------------
// auth.js — session auth with HMAC-signed opaque tokens.
//
// Demo mode ships two personas (Resident HNI / NRI) selectable at login.
// Production swap: replace `login` with a Google OAuth (OIDC) code exchange
// and keep the same session issuance — the rest of the app is unchanged.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import { q, insert } from "./db.js";

const SECRET = process.env.MYFIN_SECRET || "dev-only-secret-rotate-in-prod";
const SESSION_TTL = 7 * 86400_000;

function sign(payload) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function issueSession(userId) {
  const body = `${userId}.${Date.now().toString(36)}.${crypto.randomBytes(9).toString("base64url")}`;
  const token = `${body}.${sign(body)}`;
  insert("sessions", { token, user_id: userId, created: Date.now(), expires: Date.now() + SESSION_TTL });
  return token;
}

export function verifySession(token) {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const body = token.slice(0, i), sig = token.slice(i + 1);
  const expect = sign(body);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  const row = q.one("SELECT * FROM sessions WHERE token = ?", token);
  if (!row || row.expires < Date.now()) return null;
  return q.one("SELECT * FROM users WHERE id = ?", row.user_id) || null;
}

/** Express middleware — attaches req.user or 401s. */
export function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : req.query.token;
  const user = verifySession(token);
  if (!user) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
  req.user = user;
  next();
}

export function personas() {
  return q.all("SELECT id, name, email, residency, country, currency, segment, age FROM users");
}
