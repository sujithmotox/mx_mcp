import { type ChartSource, type ChartSpec, hasCycle } from "./chartTool";
import type { TableData } from "./events";
import { formatDate } from "./format";

/** Shared by the server (widget refresh) and the browser (table view, CSV). */

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const label = (v: unknown) => {
  const s = String(v ?? "—");
  return (formatDate(s) ?? s).slice(0, 80);
};

/** Rebuild a chart's data from fresh query rows, keeping its settings. */
export function applyRows(spec: ChartSpec, source: ChartSource, rowsIn: Record<string, unknown>[]): ChartSpec {
  const { headline: _stale, ...base } = spec;
  switch (spec.type) {
    case "heatmap":
      return {
        ...base,
        cells: rowsIn.slice(0, 1500).map((r) => ({ x: label(r[source.x_column!]), y: label(r[source.y_column!]), value: num(r[source.value_column!]) })),
      };
    case "scatter":
      return {
        ...base,
        points: rowsIn
          .map((r) => ({
            x: num(r[source.x_column!]),
            y: num(r[source.y_column!]),
            label: source.point_label_column ? String(r[source.point_label_column] ?? "").slice(0, 80) : undefined,
            group: source.group_column ? String(r[source.group_column] ?? "—").slice(0, 60) : undefined,
          }))
          .filter((p): p is { x: number; y: number; label: string | undefined; group: string | undefined } => p.x !== null && p.y !== null)
          .slice(0, 500),
      };
    case "sankey":
      return {
        ...base,
        links: rowsIn
          .map((r) => ({ from: String(r[source.from_column!] ?? "—").slice(0, 80), to: String(r[source.to_column!] ?? "—").slice(0, 80), value: num(r[source.value_column!]) ?? 0 }))
          .filter((l) => l.value > 0 && l.from !== l.to)
          // Merge repeated pairs, keep the 200 biggest, and skip any link that would close a loop.
          .reduce((acc, l) => {
            const same = acc.find((x) => x.from === l.from && x.to === l.to);
            if (same) same.value += l.value;
            else acc.push({ ...l });
            return acc;
          }, [] as { from: string; to: string; value: number }[])
          .sort((a, b) => b.value - a.value)
          .slice(0, 200)
          .reduce((acc, l) => (hasCycle([...acc, l]) ? acc : [...acc, l]), [] as { from: string; to: string; value: number }[]),
      };
    case "table": {
      const keys = (spec.columns ?? []).map((c) => c.key);
      return {
        ...base,
        rows: rowsIn.slice(0, 200).map((r) =>
          Object.fromEntries(keys.map((k) => [k, typeof r[k] === "number" || typeof r[k] === "string" ? (r[k] as string | number) : r[k] == null ? null : String(r[k])])),
        ),
      };
    }
    default: {
      const rows = rowsIn.slice(0, 200);
      const old = new Map(spec.series.map((s) => [s.name, s]));
      return {
        ...base,
        labels: rows.map((r) => label(r[source.label_column!])),
        series: (source.value_columns ?? []).map((c) => ({
          ...old.get(c.name),
          name: c.name,
          values: rows.map((r) => num(r[c.column])),
        })),
      };
    }
  }
}

export function isEmpty(spec: ChartSpec) {
  switch (spec.type) {
    case "heatmap":
      return !spec.cells?.length;
    case "scatter":
      return !spec.points?.length;
    case "sankey":
      return !spec.links?.length;
    case "table":
      return !spec.rows?.length;
    default:
      return !spec.labels.length;
  }
}

/** The chart's data as a plain table (table view, CSV, "Ask about this"). */
export function specToTable(spec: ChartSpec): TableData {
  const t = (columns: string[], rows: Record<string, unknown>[]): TableData => ({ columns, rows, rowCount: rows.length, truncated: false });
  switch (spec.type) {
    case "heatmap":
      return t(["row", "column", "value"], (spec.cells ?? []).map((c) => ({ row: c.y, column: c.x, value: c.value })));
    case "scatter": {
      const pts = spec.points ?? [];
      const hasLabel = pts.some((p) => p.label);
      const hasGroup = pts.some((p) => p.group);
      const x = spec.x_label || "x";
      const y = spec.y_label || "y";
      return t(
        [...(hasLabel ? ["label"] : []), ...(hasGroup ? ["group"] : []), x, y],
        pts.map((p) => ({ ...(hasLabel ? { label: p.label } : {}), ...(hasGroup ? { group: p.group } : {}), [x]: p.x, [y]: p.y })),
      );
    }
    case "sankey":
      return t(["from", "to", "value"], (spec.links ?? []).map((l) => ({ ...l })));
    case "table":
      return t((spec.columns ?? []).map((c) => c.key), spec.rows ?? []);
    default:
      return t(
        ["label", ...spec.series.map((s) => s.name)],
        spec.labels.map((l, i) => Object.fromEntries([["label", l], ...spec.series.map((s) => [s.name, s.values[i]])])),
      );
  }
}

export function specToCsv(spec: ChartSpec, max = 60) {
  const { columns, rows } = specToTable(spec);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [columns.map(esc).join(",")];
  for (const r of rows.slice(0, max)) lines.push(columns.map((c) => esc(r[c])).join(","));
  if (rows.length > max) lines.push(`… ${rows.length - max} more rows`);
  return lines.join("\n");
}
