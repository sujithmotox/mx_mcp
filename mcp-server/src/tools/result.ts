import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { QueryResult } from "../db.js";

/**
 * Tool results are returned as JSON text (what the model reads) and as
 * structuredContent (what typed clients, like the web UI, can render as a table).
 */
export function tableResult(result: QueryResult, note?: string): CallToolResult {
  const payload = { ...result, ...(note ? { note } : {}) };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
