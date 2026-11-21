import { z } from "zod";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";

/**
 * render_chart is a tool the web app handles itself (it is not on the MCP server):
 * Claude queries the data with the MCP tools, then calls render_chart with the
 * numbers, and the browser draws the chart.
 */
export const CHART_TOOL_NAME = "render_chart";

const COL = z.string().min(1).max(120);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Where a chart's numbers came from, so a pinned dashboard widget can re-run the
 * same database tool call and redraw the chart with fresh data. Which *_column
 * fields are needed depends on the chart type (see requiredColumns).
 */
export const ChartSource = z.object({
  tool: z.string().min(1).max(80).refine((t) => t !== CHART_TOOL_NAME, "source.tool must be a database tool"),
  arguments: z.record(z.string(), z.unknown()),
  // bar, line, area, pie, combo, funnel
  label_column: COL.optional(),
  value_columns: z.array(z.object({ column: COL, name: z.string().min(1).max(60) })).min(1).max(8).optional(),
  // heatmap (x, y, value) and scatter (x, y)
  x_column: COL.optional(),
  y_column: COL.optional(),
  value_column: COL.optional(),
  point_label_column: COL.optional(),
  group_column: COL.optional(),
  // sankey (from, to, value)
  from_column: COL.optional(),
  to_column: COL.optional(),
  /** Literal dates (YYYY-MM-DD) used in the query; the dashboard date filter swaps them. */
  date_from: DAY.optional(),
  date_to: DAY.optional(),
});
export type ChartSource = z.infer<typeof ChartSource>;

export const CHART_TYPES = ["bar", "line", "area", "pie", "combo", "funnel", "heatmap", "scatter", "sankey", "table"] as const;
export type ChartType = (typeof CHART_TYPES)[number];
/** Types drawn from labels + series. */
export const SERIES_TYPES: readonly ChartType[] = ["bar", "line", "area", "pie", "combo", "funnel"];
export const isSeriesType = (t: ChartType) => SERIES_TYPES.includes(t);

const FORMAT = z.enum(["number", "inr", "percent"]);

export const ChartSpec = z
  .object({
    type: z.enum(CHART_TYPES),
    title: z.string().min(1).max(120),
    // Series types
    labels: z.array(z.string().max(80)).max(200).default([]),
    series: z
      .array(
        z.object({
          name: z.string().min(1).max(60),
          values: z.array(z.number().nullable()),
          /** combo only */
          kind: z.enum(["bar", "line"]).optional(),
          /** combo only: which y-axis */
          axis: z.enum(["left", "right"]).optional(),
        }),
      )
      .max(8)
      .default([]),
    horizontal: z.boolean().optional(),
    stacked: z.boolean().optional(),
    value_format: FORMAT.optional(),
    /** combo: format of the right axis */
    right_format: FORMAT.optional(),
    /** scatter: format of the x values */
    x_format: FORMAT.optional(),
    x_label: z.string().max(60).optional(),
    y_label: z.string().max(60).optional(),
    headline: z.object({ label: z.string().max(60), value: z.string().max(40) }).optional(),
    reference_lines: z.array(z.object({ value: z.number(), label: z.string().max(40) })).max(3).optional(),
    color_by_reference: z.boolean().optional(),
    // heatmap
    cells: z.array(z.object({ x: z.string().max(80), y: z.string().max(80), value: z.number().nullable() })).max(1500).optional(),
    // scatter
    points: z
      .array(z.object({ x: z.number(), y: z.number(), label: z.string().max(80).optional(), group: z.string().max(60).optional() }))
      .max(500)
      .optional(),
    // sankey
    links: z.array(z.object({ from: z.string().min(1).max(80), to: z.string().min(1).max(80), value: z.number() })).max(200).optional(),
    // table
    columns: z
      .array(
        z.object({
          key: COL,
          label: z.string().max(60).optional(),
          format: z.enum(["text", "number", "inr", "percent", "date"]).optional(),
          style: z.enum(["plain", "shade", "bar"]).optional(),
        }),
      )
      .max(12)
      .optional(),
    rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).max(200).optional(),
    source: ChartSource.optional(),
  })
  .superRefine((s, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (isSeriesType(s.type)) {
      if (!s.labels.length || !s.series.length) return fail(`A ${s.type} chart needs labels and at least one series.`);
      if (!s.series.every((x) => x.values.length === s.labels.length)) fail("Every series must have exactly one value per label.");
    }
    switch (s.type) {
      case "pie":
        if (s.series.length !== 1 || s.labels.length > 8) fail("A pie chart takes one series with at most 8 slices. Use a bar chart instead.");
        break;
      case "funnel":
        if (s.series.length !== 1 || s.labels.length < 2 || s.labels.length > 12)
          fail("A funnel takes one series with 2 to 12 stages, in order from first to last.");
        break;
      case "combo":
        if (s.series.length < 2 || !s.series.some((x) => x.kind === "line") || !s.series.some((x) => x.kind !== "line"))
          fail("A combo chart needs at least one series with kind 'bar' and one with kind 'line'.");
        break;
      case "heatmap": {
        if (!s.cells?.length) return fail("A heatmap needs cells: [{x, y, value}].");
        const xs = new Set(s.cells.map((c) => c.x));
        const ys = new Set(s.cells.map((c) => c.y));
        if (xs.size > 40 || ys.size > 40) fail("A heatmap can have at most 40 columns and 40 rows. Group the data more coarsely.");
        break;
      }
      case "scatter":
        if (!s.points || s.points.length < 2) fail("A scatter plot needs at least 2 points: [{x, y, label?, group?}].");
        break;
      case "sankey": {
        if (!s.links?.length) return fail("A sankey needs links: [{from, to, value}].");
        if (s.links.some((l) => l.from === l.to)) return fail("A sankey link can't go from a stage to itself.");
        if (s.links.some((l) => !(l.value > 0))) return fail("Sankey link values must be positive.");
        if (hasCycle(s.links)) fail("A sankey can't have loops (A → B → A). Prefix names with their stage, e.g. 'Lead: Web', 'Result: Sold'.");
        break;
      }
      case "table":
        if (!s.columns?.length || !s.rows?.length) fail("A table needs columns: [{key, ...}] and rows: [{key: value}].");
        break;
    }
  });

export type ChartSpec = z.infer<typeof ChartSpec>;
export type ChartSpecInput = z.input<typeof ChartSpec>;

export function hasCycle(links: { from: string; to: string }[]) {
  const next = new Map<string, string[]>();
  for (const l of links) next.set(l.from, [...(next.get(l.from) ?? []), l.to]);
  const state = new Map<string, 1 | 2>();
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return true;
    if (state.get(n) === 2) return false;
    state.set(n, 1);
    for (const m of next.get(n) ?? []) if (visit(m)) return true;
    state.set(n, 2);
    return false;
  };
  return [...next.keys()].some(visit);
}

/** The result columns a chart type needs from its source, or an error message. */
export function requiredColumns(spec: Pick<ChartSpec, "type" | "columns">, src: ChartSource): string[] | string {
  const need = (...cols: (string | undefined)[]) => cols.filter((c): c is string => Boolean(c));
  switch (spec.type) {
    case "heatmap":
      return src.x_column && src.y_column && src.value_column ? need(src.x_column, src.y_column, src.value_column) : "heatmap source needs x_column, y_column and value_column";
    case "scatter":
      return src.x_column && src.y_column ? need(src.x_column, src.y_column, src.point_label_column, src.group_column) : "scatter source needs x_column and y_column";
    case "sankey":
      return src.from_column && src.to_column && src.value_column ? need(src.from_column, src.to_column, src.value_column) : "sankey source needs from_column, to_column and value_column";
    case "table":
      return (spec.columns ?? []).map((c) => c.key);
    default:
      return src.label_column && src.value_columns?.length
        ? need(src.label_column, ...src.value_columns.map((v) => v.column))
        : `${spec.type} source needs label_column and value_columns`;
  }
}

const TYPE_GUIDE =
  "Pick the type from the data's job: " +
  "line (or area for one total) for change over time; " +
  "bar to compare categories (horizontal=true for long or many labels; sort by value); " +
  "pie only for parts of one whole with 6 or fewer slices; " +
  "funnel for stages in order (one series, first stage first) - it shows % kept at each step; " +
  "heatmap for two categories × one number (weekday × hour, city × make), as cells [{x, y, value}]; " +
  "scatter to compare two numbers per item (price vs bid), as points [{x, y, label, group}]; " +
  "sankey for flows between stages, as links [{from, to, value}] (no loops; give each stage's nodes distinct names); " +
  "table with columns [{key, label, format, style}] and rows when exact numbers matter - style 'shade' colours cells by value, 'bar' draws an in-cell bar; " +
  "combo (bars + a line, two y-axes) ONLY when the user asks for two measures of different scale in one chart: each series sets kind 'bar' or 'line' and axis 'left' or 'right' (right_format for the right axis); otherwise prefer two charts.";

export const chartTool: BetaTool = {
  name: CHART_TOOL_NAME,
  description:
    "Draw a chart or formatted table for the user from numbers you already fetched with the database tools. " +
    "Use it whenever the user asks for a chart, graph, plot, heat map, funnel, sankey or table, or when a trend or comparison is clearer as a picture. " +
    "Never draw charts with text or ASCII. " +
    TYPE_GUIDE +
    " For series types (bar, line, area, pie, combo, funnel) send labels plus up to 8 series of plain numbers " +
    "(no currency symbols or commas), null for missing; use one value_format, and never mix measures of different scale " +
    "except in a combo. If a type doesn't suit the data (a pie with many slices, a sankey without stages), use a better one and say why. " +
    "Add a headline (one key figure, e.g. {label: 'Average top bid', value: '78% of base'}) and reference_lines for targets " +
    "or thresholds (e.g. 100 for 'Base price'); set color_by_reference to colour bars below the first line differently. " +
    "Always add `source` when the chart's data comes straight from the rows of one database tool call: it lets the user " +
    "pin the chart to their dashboard, where it re-runs that call for fresh data. Name the result columns that feed it: " +
    "label_column + value_columns for series types; x_column, y_column, value_column for heatmap; x_column, y_column " +
    "(+ point_label_column, group_column) for scatter; from_column, to_column, value_column for sankey; a table's column keys " +
    "are result column names. Do the formatting and maths in SQL (DATE_FORMAT for labels, ratios, ORDER BY) so the result " +
    "columns are exactly what the chart shows. When the query covers a fixed date range, write it as " +
    "col >= 'date_from' AND col < DATE_ADD('date_to', INTERVAL 1 DAY) and always set date_from and date_to (first and last day " +
    "included), so pinned widgets can move their dates forward each day and the dashboard's date filter can swap them. " +
    "For rolling windows use CURDATE() in SQL instead and omit date_from/date_to.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: [...CHART_TYPES] },
      title: { type: "string", description: "Short title that says what is measured, e.g. 'Revenue by month, 2026 (₹)'" },
      labels: { type: "array", items: { type: "string" }, description: "Series types: categories, periods or funnel stages, in display order" },
      series: {
        type: "array",
        description: "Series types: up to 8 series, one value per label",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            values: { type: "array", items: { type: ["number", "null"] } },
            kind: { type: "string", enum: ["bar", "line"], description: "combo only" },
            axis: { type: "string", enum: ["left", "right"], description: "combo only" },
          },
          required: ["name", "values"],
        },
      },
      horizontal: { type: "boolean", description: "Bar charts only: horizontal bars" },
      stacked: { type: "boolean", description: "Bar charts with several series: stack them" },
      value_format: { type: "string", enum: ["number", "inr", "percent"], description: "inr = Indian rupees. For combo: the left axis" },
      right_format: { type: "string", enum: ["number", "inr", "percent"], description: "combo: the right axis" },
      x_format: { type: "string", enum: ["number", "inr", "percent"], description: "scatter: the x values" },
      x_label: { type: "string" },
      y_label: { type: "string" },
      headline: {
        type: "object",
        properties: { label: { type: "string" }, value: { type: "string" } },
        required: ["label", "value"],
        description: "One key figure shown above the chart",
      },
      reference_lines: {
        type: "array",
        items: { type: "object", properties: { value: { type: "number" }, label: { type: "string" } }, required: ["value", "label"] },
        description: "Target/threshold lines (bar, line, area, combo left axis, scatter y)",
      },
      color_by_reference: { type: "boolean", description: "Bar charts: grey out bars below the first reference line" },
      cells: {
        type: "array",
        description: "heatmap: one cell per x/y pair; order of first appearance is the display order",
        items: {
          type: "object",
          properties: { x: { type: "string" }, y: { type: "string" }, value: { type: ["number", "null"] } },
          required: ["x", "y", "value"],
        },
      },
      points: {
        type: "array",
        description: "scatter: up to 500 points",
        items: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, label: { type: "string" }, group: { type: "string" } },
          required: ["x", "y"],
        },
      },
      links: {
        type: "array",
        description: "sankey: flows between stages, value > 0, no loops",
        items: {
          type: "object",
          properties: { from: { type: "string" }, to: { type: "string" }, value: { type: "number" } },
          required: ["from", "to", "value"],
        },
      },
      columns: {
        type: "array",
        description: "table: up to 12 columns; key is the result column name",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            format: { type: "string", enum: ["text", "number", "inr", "percent", "date"] },
            style: { type: "string", enum: ["plain", "shade", "bar"], description: "shade: colour by value; bar: in-cell bar" },
          },
          required: ["key"],
        },
      },
      rows: { type: "array", items: { type: "object" }, description: "table: up to 200 rows of {key: value}" },
      source: {
        type: "object",
        description: "The database tool call whose result rows hold exactly this chart's data (usually your last run_select).",
        properties: {
          tool: { type: "string", description: "Tool name, e.g. run_select" },
          arguments: { type: "object", description: "The exact arguments you passed, e.g. {\"sql\": \"SELECT ...\"}" },
          label_column: { type: "string" },
          value_columns: {
            type: "array",
            items: {
              type: "object",
              properties: { column: { type: "string" }, name: { type: "string", description: "Series name, same as in series" } },
              required: ["column", "name"],
            },
          },
          x_column: { type: "string" },
          y_column: { type: "string" },
          value_column: { type: "string" },
          point_label_column: { type: "string" },
          group_column: { type: "string" },
          from_column: { type: "string" },
          to_column: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD literal used in the query as the first day, if any" },
          date_to: { type: "string", description: "YYYY-MM-DD literal used in the query as the last day, if any" },
        },
        required: ["tool", "arguments"],
      },
    },
    required: ["type", "title"],
  },
};

// ---- Dates in a chart's query ---------------------------------------------------
export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Fill in date_from / date_to when Claude wrote fixed dates in the SQL but didn't
 * declare them, e.g. `col >= '2026-11-06' AND col < '2026-11-21'` gives
 * 2026-11-06 .. 2026-11-20. Leaves the source alone when it can't tell.
 */
export function inferDates(source: ChartSource): ChartSource {
  if (source.date_from && source.date_to) return source;
  const text = JSON.stringify(source.arguments);
  const D = `'(\\d{4}-\\d{2}-\\d{2})(?:[ T][\\d:.]+)?'`;
  const lows: string[] = [];
  const highs: string[] = [];
  for (const m of text.matchAll(new RegExp(`(>=|>)\\s*${D}`, "g"))) lows.push(m[2]);
  for (const m of text.matchAll(new RegExp(`(<=|<)\\s*${D}`, "g"))) highs.push(m[1] === "<" ? addDays(m[2], -1) : m[2]);
  for (const m of text.matchAll(new RegExp(`BETWEEN\\s+${D}\\s+AND\\s+${D}`, "gi"))) {
    lows.push(m[1]);
    highs.push(m[2]);
  }
  for (const m of text.matchAll(new RegExp(`DATE_ADD\\(\\s*${D}\\s*,\\s*INTERVAL\\s+1\\s+DAY\\s*\\)`, "gi"))) highs.push(m[1]);
  if (!lows.length || !highs.length) return source;
  const from = lows.sort()[0];
  const to = highs.sort().at(-1)!;
  return from <= to ? { ...source, date_from: source.date_from ?? from, date_to: source.date_to ?? to } : source;
}
