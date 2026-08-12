// ---------------------------------------------------------------------------
// estate.js — Interactive Will Preparation (server side).
//
// WILL_STEPS, generateDraft and estateChecklist now live in shared/estate.mjs so
// the public static site can run the same wizard in the browser. Only the
// database-backed persistence remains here.
// ---------------------------------------------------------------------------
import { q, insert } from "../lib/db.js";
import { uid } from "../lib/util.js";
import { generateDraft, estateChecklist as pureChecklist } from "../../shared/estate.mjs";

export { WILL_STEPS, generateDraft } from "../../shared/estate.mjs";

export function saveWill(userId, data) {
  const draft = generateDraft(data || {});
  const existing = q.one("SELECT id FROM wills WHERE user_id = ?", userId);
  const id = existing?.id || uid("will");
  insert("wills", { id, user_id: userId, data: JSON.stringify(data || {}), draft, updated: Date.now() });
  return { id, draft, updated: Date.now() };
}

export function getWill(userId) {
  const w = q.one("SELECT * FROM wills WHERE user_id = ?", userId);
  return w ? { id: w.id, data: JSON.parse(w.data || "{}"), draft: w.draft, updated: w.updated } : null;
}

/** Estate-readiness checklist derived from the client's actual stored data. */
export function estateChecklist(userId) {
  const will = q.one("SELECT id FROM wills WHERE user_id = ?", userId);
  const docs = q.all("SELECT category FROM vault_docs WHERE user_id = ?", userId).map((d) => d.category);
  const user = q.one("SELECT * FROM users WHERE id = ?", userId);
  return pureChecklist({ hasWill: !!will, vaultCategories: docs, residency: user?.residency || "RESIDENT" });
}
