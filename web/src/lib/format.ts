/* Formatting, in Indian conventions throughout — lakh and crore, not million. */

export const nf = (v: number, d = 2) =>
  v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

export const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export const inr = (v: unknown, d?: number) =>
  isNum(v) ? "₹" + nf(v, d ?? (Math.abs(v) >= 1000 ? 0 : 2)) : "—";

export const pct = (v: unknown, d = 1) =>
  isNum(v) ? `${v > 0 ? "+" : ""}${v.toFixed(d)}%` : "—";

export const plainPct = (v: unknown, d = 1) => (isNum(v) ? `${v.toFixed(d)}%` : "—");

export const mult = (v: unknown, d = 2) => (isNum(v) ? `${nf(v, d)}×` : "—");

/** ₹ crore, stepping up to lakh-crore where the number would otherwise sprawl. */
export const crore = (v: unknown) => {
  if (!isNum(v)) return "—";
  if (Math.abs(v) >= 100000) return `₹${nf(v / 100000, 2)}L cr`;
  return `₹${nf(v, 0)} cr`;
};

/** Share counts and volumes, in lakh/crore. */
export const qty = (v: unknown) => {
  if (!isNum(v)) return "—";
  if (Math.abs(v) >= 1e7) return `${nf(v / 1e7, 2)} cr`;
  if (Math.abs(v) >= 1e5) return `${nf(v / 1e5, 2)} L`;
  return nf(v, 0);
};

export const tone = (v: unknown) =>
  !isNum(v) ? "text-ink-dim" : v > 0 ? "text-up" : v < 0 ? "text-down" : "text-ink-dim";

/** Format by the unit the field schema declares, so one function serves every table. */
export function byUnit(v: unknown, unit: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (!isNum(v)) return String(v);
  switch (unit) {
    case "%": return `${nf(v, 1)}%`;
    case "x": return mult(v);
    case "₹": return inr(v);
    case "₹cr": return crore(v);
    case "n": return Math.abs(v) >= 1e5 ? qty(v) : nf(v, Number.isInteger(v) ? 0 : 2);
    default: return nf(v, 2);
  }
}

export const relativeDay = (iso?: string) => {
  if (!iso) return "";
  const days = Math.round((Date.now() - Date.parse(`${iso}T12:00:00Z`)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};
