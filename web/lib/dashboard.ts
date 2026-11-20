import type { ChartSpec } from "./chartTool";
import { inrCompact, inrFull, numCompact, numFull } from "./format";
import type { DateRange, Widget, WidgetSettings } from "./widgets";

export type { DateRange, Widget, WidgetSettings };

export type WidgetData = {
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  rowCount: number;
  truncated: boolean;
  fetchedAt: number;
};

// ---- API ----------------------------------------------------------------------
async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  list: () => fetch("/api/widgets", { cache: "no-store" }).then((r) => json<{ widgets: Widget[]; embedEnabled: boolean }>(r)),
  create: (settings: WidgetSettings, spec: ChartSpec) =>
    fetch("/api/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings, spec }),
    }).then((r) => json<{ widget: Widget }>(r)),
  update: (id: string, patch: Partial<WidgetSettings>) =>
    fetch(`/api/widgets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => json<{ widget: Widget }>(r)),
  remove: (id: string) => fetch(`/api/widgets/${id}`, { method: "DELETE" }).then((r) => (r.ok ? null : json(r))),
  reorder: (ids: string[]) =>
    fetch("/api/widgets/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then((r) => json<{ widgets: Widget[] }>(r)),
  embedToken: (id: string) => fetch(`/api/widgets/${id}`).then((r) => json<{ embedToken: string | null }>(r)),
  data: (id: string, opts: { range?: DateRange | null; fresh?: boolean; token?: string }) => {
    const q = new URLSearchParams();
    if (opts.range) {
      q.set("from", opts.range.from);
      q.set("to", opts.range.to);
    }
    if (opts.fresh) q.set("fresh", "1");
    if (opts.token) q.set("t", opts.token);
    return fetch(`/api/widgets/${id}/data?${q}`, { cache: "no-store" }).then((r) =>
      json<{ widget: Widget; data: WidgetData; dateFiltered: boolean }>(r),
    );
  },
};

// ---- Date filter ---------------------------------------------------------------
export type RangePreset = "saved" | "7d" | "30d" | "month" | "lastmonth" | "year" | "custom";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "saved", label: "Dates as pinned" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "lastmonth", label: "Last month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function presetRange(preset: RangePreset, custom?: DateRange): DateRange | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = (n: number) => new Date(today.getTime() - n * 864e5);
  switch (preset) {
    case "7d":
      return { from: iso(daysAgo(6)), to: iso(today) };
    case "30d":
      return { from: iso(daysAgo(29)), to: iso(today) };
    case "month":
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
    case "lastmonth":
      return {
        from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: iso(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case "year":
      return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) };
    case "custom":
      return custom && custom.from && custom.to && custom.from <= custom.to ? custom : null;
    default:
      return null;
  }
}

// ---- Display helpers -----------------------------------------------------------
export const REFRESH_MS: Record<Widget["refresh"], number | null> = { open: null, "5m": 5 * 60_000, "1h": 60 * 60_000 };

export function formatValue(spec: Pick<ChartSpec, "value_format">, v: number | null, full = false) {
  if (v === null || !Number.isFinite(v)) return "—";
  if (spec.value_format === "percent") return `${+v.toFixed(1)}%`;
  if (spec.value_format === "inr") return full ? inrFull(v) : inrCompact(v);
  return full ? numFull(v) : numCompact(v);
}

export function timeAgo(ms: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString();
}

/** A short CSV of the widget's current data, for "Ask about this". */
export function dataAsCsv(labels: string[], series: WidgetData["series"], max = 60) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [["label", ...series.map((s) => s.name)].map(esc).join(",")];
  labels.slice(0, max).forEach((l, i) => lines.push([l, ...series.map((s) => s.values[i] ?? "")].map(esc).join(",")));
  if (labels.length > max) lines.push(`… ${labels.length - max} more rows`);
  return lines.join("\n");
}
