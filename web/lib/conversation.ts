import type { ChartSpec } from "./chartTool";
import type { ChatEvent, TableData } from "./events";

export type ToolPart = {
  kind: "tool";
  id: string;
  name: string;
  input: unknown;
  result?: { isError: boolean; text: string; table?: TableData };
};

export type Part =
  | { kind: "text"; text: string }
  | ToolPart
  | { kind: "chart"; id: string; spec: ChartSpec }
  | { kind: "notice"; text: string }
  | { kind: "error"; text: string };

export type Turn = {
  user: string;
  parts: Part[];
  /** API history before this turn, so the turn can be regenerated. */
  historyBefore: unknown[];
  status: "streaming" | "done" | "stopped" | "error";
};

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  turns: Turn[];
  /** Full API conversation, returned by the server and sent back unchanged. */
  history: unknown[];
};

export function applyEvent(parts: Part[], e: ChatEvent): Part[] {
  const next = [...parts];
  const last = next[next.length - 1];
  switch (e.type) {
    case "text":
      if (last?.kind === "text") next[next.length - 1] = { ...last, text: last.text + e.text };
      else next.push({ kind: "text", text: e.text });
      break;
    case "tool_call":
      if (e.name !== "render_chart") next.push({ kind: "tool", id: e.id, name: e.name, input: e.input });
      break;
    case "tool_result": {
      const i = next.findIndex((p) => p.kind === "tool" && p.id === e.id);
      if (i >= 0) next[i] = { ...(next[i] as ToolPart), result: { isError: e.isError, text: e.text, table: e.table } };
      break;
    }
    case "chart":
      next.push({ kind: "chart", id: e.id, spec: e.spec });
      break;
    case "notice":
      next.push({ kind: "notice", text: e.message });
      break;
    case "error":
      next.push({ kind: "error", text: e.message });
      break;
  }
  return next;
}

/** Split "answer ... <followups>a|b|c</followups>" into the answer and the questions. */
export function splitFollowups(text: string): { body: string; followups: string[] } {
  const m = /<followups>([\s\S]*?)(<\/followups>|$)/i.exec(text);
  if (!m) return { body: text, followups: [] };
  const complete = Boolean(m[2]);
  const followups = complete
    ? m[1].split("|").map((q) => q.trim()).filter(Boolean).slice(0, 3)
    : [];
  return { body: text.slice(0, m.index).trimEnd(), followups };
}

// ---- Persistence (browser only) --------------------------------------------
const KEY = "mx-data-chats-v1";
const MAX_CHATS = 40;

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Conversation[]) : [];
    // A turn that was streaming when the page closed is finished now.
    return list.map((c) => ({
      ...c,
      turns: c.turns.map((t) => (t.status === "streaming" ? { ...t, status: "stopped" } : t)),
    }));
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]) {
  const sorted = [...list].filter((c) => c.turns.length).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
  // If storage is full, drop the oldest chats until it fits.
  for (let n = sorted.length; n >= 0; n--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(sorted.slice(0, n)));
      return;
    } catch {
      // quota exceeded: try with fewer chats
    }
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
