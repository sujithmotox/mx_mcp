/** Display helpers shared by tables and charts (Indian number formatting). */

export const inrCompact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${+(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};

export const inrFull = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const numCompact = (n: number) =>
  Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const numFull = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-12 14:05:00" -> "12 Nov 2026, 14:05". Returns null when not a date. */
export function formatDate(v: string): string | null {
  const m = DATE_RE.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`;
  return h && !(h === "00" && mi === "00") ? `${date}, ${h}:${mi}` : date;
}

const MONEY_COL = /(amount|price|total|revenue|payout|margin|value|cost|fee|gst|tcs|bid|paid|selling|purchase|deduction|commission)/i;
const NOT_MONEY = /(_id$|^id$|count|bids$|^with_|^num_|^n_|^no_of|_pct$|pct|percent|ratio|qty|quantity|kms?$|year|score|_no$)/i;

/** Heuristic: does this column hold rupee amounts? */
export const isMoneyColumn = (name: string) => MONEY_COL.test(name) && !NOT_MONEY.test(name);

export function formatCell(column: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return isMoneyColumn(column) ? inrFull(v) : numFull(v);
  if (typeof v === "string") return formatDate(v) ?? v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return JSON.stringify(v);
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(esc).join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s: string) => s.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").toLowerCase() || "data";
