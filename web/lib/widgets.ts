import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { addDays, type ChartSource, ChartSpec, inferDates } from "./chartTool";
import { parseTable } from "./events";
import { connectMcp } from "./mcpClient";

/**
 * Dashboard widgets: pinned charts saved on the web server (not in MySQL, which
 * stays read-only). A widget keeps the chart's settings plus its `source`, and
 * every refresh re-runs that database tool call through the MCP server, so all
 * the read-only checks still apply.
 */
export const WidgetSettings = z.object({
  title: z.string().trim().min(1).max(120),
  size: z.enum(["sm", "md", "lg"]),
  display: z.enum(["chart", "number"]),
  /** For display=number: show the last value or the total of the first series. */
  numberMode: z.enum(["last", "total"]),
  refresh: z.enum(["open", "5m", "1h"]),
  /** Slide the query's fixed dates forward by the days since pinning (missing = on). */
  rollDates: z.boolean().optional(),
});
export type WidgetSettings = z.infer<typeof WidgetSettings>;

export type Widget = WidgetSettings & {
  id: string;
  spec: ChartSpec & { source: ChartSource };
  createdAt: string;
  updatedAt: string;
};

export type DateRange = { from: string; to: string };

const FILE = process.env.WIDGETS_FILE || path.join(process.cwd(), "data", "widgets.json");

// ---- Storage (one JSON file, writes serialised) ------------------------------
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function readAll(): Promise<Widget[]> {
  try {
    const raw = JSON.parse(await readFile(FILE, "utf8"));
    return Array.isArray(raw?.widgets) ? raw.widgets : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(widgets: Widget[]) {
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ version: 1, widgets }, null, 2));
  await rename(tmp, FILE);
}

export const listWidgets = () => serial(readAll);

export async function getWidget(id: string) {
  return (await listWidgets()).find((w) => w.id === id) ?? null;
}

export function createWidget(settings: WidgetSettings, spec: Widget["spec"]) {
  return serial(async () => {
    const all = await readAll();
    const now = new Date().toISOString();
    const id = Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
    const { headline: _h, ...rest } = spec; // a headline is a one-off sentence that goes stale
    const w: Widget = { ...settings, id, spec: { ...rest, source: inferDates(spec.source) } as Widget["spec"], createdAt: now, updatedAt: now };
    await writeAll([w, ...all]);
    return w;
  });
}

export function updateWidget(id: string, patch: Partial<WidgetSettings>) {
  return serial(async () => {
    const all = await readAll();
    const i = all.findIndex((w) => w.id === id);
    if (i < 0) return null;
    all[i] = { ...all[i], ...patch, updatedAt: new Date().toISOString() };
    await writeAll(all);
    cache.clear();
    return all[i];
  });
}

export function deleteWidget(id: string) {
  return serial(async () => {
    const all = await readAll();
    const next = all.filter((w) => w.id !== id);
    if (next.length === all.length) return false;
    await writeAll(next);
    return true;
  });
}

export function reorderWidgets(ids: string[]) {
  return serial(async () => {
    const all = await readAll();
    const pos = new Map(ids.map((id, i) => [id, i]));
    all.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    await writeAll(all);
    return all;
  });
}

// ---- Running a widget's source --------------------------------------------------
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** The dates a widget shows now: the dashboard filter, else its pinned dates moved forward. */
export function effectiveWindow(w: Widget, range?: DateRange): DateRange | undefined {
  const src = inferDates(w.spec.source); // widgets pinned before dates were inferred
  if (!src.date_from || !src.date_to) return undefined;
  if (range) return range;
  const shift = w.rollDates === false ? 0 : Math.max(0, daysBetween(localDate(new Date(w.createdAt)), localDate(new Date())));
  return { from: addDays(src.date_from, shift), to: addDays(src.date_to, shift) };
}

/**
 * Rewrite the query's date literals for a window. The first day is swapped
 * directly; the last day may be written inclusively ('to') or as the day after
 * ('to + 1', for `col < '...'`), and both forms are handled.
 */
function withWindow(source: ChartSource, win?: DateRange) {
  const json = JSON.stringify(source.arguments);
  if (!win || !source.date_from || !source.date_to) return source.arguments;
  if (win.from === source.date_from && win.to === source.date_to) return source.arguments;
  const map = new Map([
    [source.date_from, win.from],
    [source.date_to, win.to],
    [addDays(source.date_to, 1), addDays(win.to, 1)],
  ]);
  // Only touch quoted dates ('2026-11-06' or '2026-11-06 00:00:00').
  const out = json.replace(/'(\d{4}-\d{2}-\d{2})/g, (m, d: string) => (map.has(d) ? `'${map.get(d)}` : m));
  return JSON.parse(out) as Record<string, unknown>;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// One MCP client shared by all widget refreshes. The MCP server is stateless, so
// after the first handshake each refresh is a single request (this matters for
// the MCP server's per-key rate limit when a dashboard has many widgets).
let shared: Promise<Awaited<ReturnType<typeof connectMcp>>> | null = null;
function mcpClient() {
  shared ??= connectMcp().catch((err) => {
    shared = null;
    throw err;
  });
  return shared;
}

async function callTool(name: string, args: Record<string, unknown>) {
  try {
    return await (await mcpClient()).callTool({ name, arguments: args });
  } catch (err) {
    const msg = (err as Error).message;
    if (/Too many requests|-32029/.test(msg))
      throw new Error("The MCP server's rate limit was reached. Wait a minute, or raise RATE_LIMIT_MAX in mcp-server/.env.");
    // The connection may have gone stale (MCP server restarted): reconnect once.
    shared = null;
    return (await mcpClient()).callTool({ name, arguments: args });
  }
}

export async function runSource(source: ChartSource, win?: DateRange) {
  const res = await callTool(source.tool, withWindow(source, win));
    const content = (res.content ?? []) as { type: string; text?: string }[];
    const text = content.map((c) => c.text ?? "").join("\n");
    if (res.isError) throw new Error(text || "The query failed.");
    const table = parseTable(res.structuredContent) ?? parseTable(safeJson(text));
    if (!table) throw new Error("The tool did not return a table.");
    const missing = [source.label_column, ...source.value_columns.map((c) => c.column)].filter(
      (c) => !table.columns.includes(c),
    );
    if (missing.length) throw new Error(`The result has no column ${missing.map((m) => `"${m}"`).join(", ")}.`);
    const rows = table.rows.slice(0, 200);
    return {
      labels: rows.map((r) => String(r[source.label_column] ?? "—").slice(0, 80)),
      series: source.value_columns.map((c) => ({ name: c.name, values: rows.map((r) => toNumber(r[c.column])) })),
      rowCount: table.rowCount,
      truncated: table.truncated || table.rows.length > 200,
    };
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Short cache so a dashboard opened in several tabs doesn't hit the database repeatedly.
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; data: Awaited<ReturnType<typeof runSource>> }>();

export async function widgetData(w: Widget, range?: DateRange, fresh = false) {
  const win = effectiveWindow(w, range);
  const key = `${w.id}|${w.updatedAt}|${win?.from ?? ""}|${win?.to ?? ""}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return { ...hit.data, fetchedAt: hit.at, window: win };
  const data = await runSource(inferDates(w.spec.source), win);
  const at = Date.now();
  cache.set(key, { at, data });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return { ...data, fetchedAt: at, window: win };
}

// ---- Embedding -------------------------------------------------------------------
/** A per-widget token: it lets a page view that one widget and nothing else. */
export function embedToken(id: string) {
  const secret = process.env.WIDGET_EMBED_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`widget:${id}`).digest("base64url");
}

export function checkEmbedToken(id: string, token: string | null) {
  const expected = embedToken(id);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const DateRangeQuery = z
  .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .refine((r) => r.from <= r.to, "from must be on or before to");
