import { z } from "zod";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";

/**
 * render_chart is a tool the web app handles itself (it is not on the MCP server):
 * Claude queries the data with the MCP tools, then calls render_chart with the
 * numbers, and the browser draws the chart.
 */
export const CHART_TOOL_NAME = "render_chart";

/**
 * Where a chart's numbers came from, so a pinned dashboard widget can re-run the
 * same database tool call and redraw the chart with fresh data.
 */
export const ChartSource = z.object({
  tool: z.string().min(1).max(80).refine((t) => t !== CHART_TOOL_NAME, "source.tool must be a database tool"),
  arguments: z.record(z.string(), z.unknown()),
  label_column: z.string().min(1).max(120),
  value_columns: z
    .array(z.object({ column: z.string().min(1).max(120), name: z.string().min(1).max(60) }))
    .min(1)
    .max(8),
  /** Literal dates (YYYY-MM-DD) used in the query; the dashboard date filter swaps them. */
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ChartSource = z.infer<typeof ChartSource>;

export const ChartSpec = z
  .object({
    type: z.enum(["bar", "line", "area", "pie"]),
    title: z.string().min(1).max(120),
    labels: z.array(z.string().max(80)).min(1).max(200),
    series: z
      .array(z.object({ name: z.string().min(1).max(60), values: z.array(z.number().nullable()) }))
      .min(1)
      .max(8),
    horizontal: z.boolean().optional(),
    stacked: z.boolean().optional(),
    value_format: z.enum(["number", "inr", "percent"]).optional(),
    x_label: z.string().max(60).optional(),
    y_label: z.string().max(60).optional(),
    headline: z.object({ label: z.string().max(60), value: z.string().max(40) }).optional(),
    reference_lines: z.array(z.object({ value: z.number(), label: z.string().max(40) })).max(3).optional(),
    color_by_reference: z.boolean().optional(),
    source: ChartSource.optional(),
  })
  .refine((s) => s.series.every((x) => x.values.length === s.labels.length), {
    message: "Every series must have exactly one value per label.",
  })
  .refine((s) => s.type !== "pie" || (s.series.length === 1 && s.labels.length <= 8), {
    message: "A pie chart takes one series with at most 8 slices. Use a bar chart instead.",
  });

export type ChartSpec = z.infer<typeof ChartSpec>;

export const chartTool: BetaTool = {
  name: CHART_TOOL_NAME,
  description:
    "Draw a chart for the user from numbers you already fetched with the database tools. " +
    "Use it whenever the user asks for a chart, graph or plot, or when a trend or comparison is clearer as a picture. " +
    "Never draw charts with text or ASCII. " +
    "Pick: line (or area for a single total) for change over time (labels are dates or periods in order); bar to compare categories " +
    "(set horizontal=true when labels are long or there are more than ~12 of them; sort bars by value); " +
    "pie only for parts of one whole with 6 or fewer slices. Up to 8 series; values are plain numbers " +
    "(no currency symbols or commas), null for missing. Use one value_format for all series and never mix " +
    "measures of different scale in one chart: make two charts instead. " +
    "Add a headline (one key figure, e.g. {label: 'Average top bid', value: '78% of base'}) and reference_lines for targets " +
    "or thresholds (e.g. 100 for 'Base price'); set color_by_reference to colour bars below the first line differently. " +
    "Always add `source` when the labels and values come straight from the rows of one database tool call: it lets the user " +
    "pin the chart to their dashboard, where it re-runs that call for fresh data. Do the formatting and maths in SQL " +
    "(DATE_FORMAT for labels, ratios, ORDER BY) so the result columns are exactly what the chart shows. When the query covers " +
    "a fixed date range, set date_from and date_to to the first and last day included, written in the SQL as " +
    "col >= 'date_from' AND col < DATE_ADD('date_to', INTERVAL 1 DAY), and always set date_from and date_to whenever the SQL " +
    "contains fixed dates, so pinned widgets can move their dates forward each day and the dashboard's date filter can swap them. " +
    "For rolling windows use CURDATE() in SQL instead and omit date_from/date_to.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["bar", "line", "area", "pie"] },
      title: { type: "string", description: "Short title that says what is measured, e.g. 'Revenue by month, 2026 (₹)'" },
      labels: { type: "array", items: { type: "string" }, description: "X-axis categories or periods, in display order" },
      series: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            values: { type: "array", items: { type: ["number", "null"] }, description: "One value per label" },
          },
          required: ["name", "values"],
        },
      },
      horizontal: { type: "boolean", description: "Bar charts only: horizontal bars" },
      stacked: { type: "boolean", description: "Bar charts with several series: stack them" },
      value_format: { type: "string", enum: ["number", "inr", "percent"], description: "inr = Indian rupees" },
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
        description: "Horizontal (or vertical for horizontal bars) target/threshold lines",
      },
      color_by_reference: { type: "boolean", description: "Bar charts: grey out bars below the first reference line" },
      source: {
        type: "object",
        description: "The database tool call whose result rows hold exactly these labels and values (usually your last run_select).",
        properties: {
          tool: { type: "string", description: "Tool name, e.g. run_select" },
          arguments: { type: "object", description: "The exact arguments you passed, e.g. {\"sql\": \"SELECT ...\"}" },
          label_column: { type: "string", description: "Result column used for labels" },
          value_columns: {
            type: "array",
            items: {
              type: "object",
              properties: { column: { type: "string" }, name: { type: "string", description: "Series name, same as in series" } },
              required: ["column", "name"],
            },
          },
          date_from: { type: "string", description: "YYYY-MM-DD literal used in the query as the first day, if any" },
          date_to: { type: "string", description: "YYYY-MM-DD literal used in the query as the last day, if any" },
        },
        required: ["tool", "arguments", "label_column", "value_columns"],
      },
    },
    required: ["type", "title", "labels", "series"],
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
