import { appendFile } from "node:fs/promises";
import { config } from "./config.js";

export type QueryLog = {
  tool: string;
  client?: string;
  sql?: string;
  params?: unknown[];
  rowCount?: number;
  truncated?: boolean;
  durationMs?: number;
  rejected?: string;
  error?: string;
};

/** One JSON line per query, to stdout and optionally QUERY_LOG_FILE. */
export function logQuery(entry: QueryLog) {
  const line = JSON.stringify({ ts: new Date().toISOString(), kind: "query", ...entry });
  console.log(line);
  if (config.QUERY_LOG_FILE) {
    appendFile(config.QUERY_LOG_FILE, line + "\n").catch((err) =>
      console.error("query log write failed:", err.message),
    );
  }
}

export function log(msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), kind: "info", msg, ...extra }));
}
