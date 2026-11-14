/** Events streamed from /api/chat to the browser, one JSON object per line. */
export type TableData = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  note?: string;
};

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; isError: boolean; text: string; table?: TableData }
  | { type: "notice"; message: string }
  | { type: "error"; message: string }
  // The full conversation to send back on the next turn, unchanged.
  | { type: "done"; history: unknown[] };

export function parseTable(value: unknown): TableData | undefined {
  if (value && typeof value === "object" && Array.isArray((value as TableData).columns) && Array.isArray((value as TableData).rows))
    return value as TableData;
  return undefined;
}

export function tableFromText(text: string): TableData | undefined {
  try {
    return parseTable(JSON.parse(text));
  } catch {
    return undefined;
  }
}
