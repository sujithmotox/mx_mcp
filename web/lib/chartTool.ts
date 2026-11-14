import { z } from "zod";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";

/**
 * render_chart is a tool the web app handles itself (it is not on the MCP server):
 * Claude queries the data with the MCP tools, then calls render_chart with the
 * numbers, and the browser draws the chart.
 */
export const CHART_TOOL_NAME = "render_chart";

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
    "or thresholds (e.g. 100 for 'Base price'); set color_by_reference to colour bars below the first line differently.",
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
    },
    required: ["type", "title", "labels", "series"],
  },
};
