"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatEvent, TableData } from "@/lib/events";
import { ResultTable } from "./ResultTable";

type Part =
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; name: string; input: unknown; result?: { isError: boolean; text: string; table?: TableData } }
  | { kind: "notice"; text: string }
  | { kind: "error"; text: string };

type Turn = { user: string; parts: Part[] };

const SUGGESTIONS = [
  "What was our revenue by month this year?",
  "Top 5 products by units sold in the last 90 days",
  "Which countries have the most customers?",
  "Show the latest orders for customer 12",
];

function apply(parts: Part[], e: ChatEvent): Part[] {
  const next = [...parts];
  const last = next[next.length - 1];
  switch (e.type) {
    case "text":
      if (last?.kind === "text") next[next.length - 1] = { ...last, text: last.text + e.text };
      else next.push({ kind: "text", text: e.text });
      break;
    case "tool_call":
      next.push({ kind: "tool", id: e.id, name: e.name, input: e.input });
      break;
    case "tool_result": {
      const i = next.findIndex((p) => p.kind === "tool" && p.id === e.id);
      const result = { isError: e.isError, text: e.text, table: e.table };
      if (i >= 0) next[i] = { ...(next[i] as Extract<Part, { kind: "tool" }>), result };
      break;
    }
    case "notice":
      next.push({ kind: "notice", text: e.message });
      break;
    case "error":
      next.push({ kind: "error", text: e.message });
      break;
  }
  return next;
}

function ToolCard({ part }: { part: Extract<Part, { kind: "tool" }> }) {
  const input = part.input as Record<string, unknown> | null;
  const sql = input && typeof input.sql === "string" ? input.sql : null;
  return (
    <div className="tool">
      <details open={Boolean(part.result?.table) || part.result?.isError}>
        <summary>
          Tool <b>{part.name}</b>
          <span className={`badge${part.result?.isError ? " err" : ""}`}>
            {!part.result ? <span className="dots">running</span> : part.result.isError ? "error" : "done"}
          </span>
        </summary>
        <pre>{sql ?? JSON.stringify(part.input, null, 2)}</pre>
        {part.result?.table ? (
          <ResultTable table={part.result.table} name={part.name} />
        ) : part.result ? (
          <pre>{part.result.text}</pre>
        ) : null}
      </details>
    </div>
  );
}

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // The API-side conversation, returned by the server and sent back unchanged.
  const history = useRef<unknown[]>([]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { user: message, parts: [] }]);
    const update = (fn: (parts: Part[]) => Part[]) =>
      setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, parts: fn(turn.parts) } : turn)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history.current }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as ChatEvent;
          if (event.type === "done") history.current = event.history;
          else update((parts) => apply(parts, event));
        }
      }
    } catch (err) {
      update((parts) => [...parts, { kind: "error", text: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    history.current = [];
    setTurns([]);
  };

  return (
    <div className="shell">
      <header>
        <h1>Data chat</h1>
        {turns.length > 0 && <button onClick={reset} disabled={busy}>New chat</button>}
      </header>

      <main className="log">
        {turns.length === 0 && (
          <div className="empty">
            <h2>Ask about your data</h2>
            Questions are answered from your MySQL database through read-only tools.
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className="msg-user">{turn.user}</div>
            <div className="msg-assistant">
              {turn.parts.map((p, j) =>
                p.kind === "text" ? (
                  <div key={j} className="text md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
                  </div>
                ) : p.kind === "tool" ? (
                  <ToolCard key={j} part={p} />
                ) : (
                  <div key={j} className={p.kind}>{p.text}</div>
                ),
              )}
              {busy && i === turns.length - 1 && turn.parts.length === 0 && <div className="notice dots">Thinking</div>}
            </div>
          </div>
        ))}
      </main>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="inner">
          <textarea
            rows={1}
            value={input}
            placeholder="Ask a question about your data…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button type="submit" disabled={busy || !input.trim()}>Send</button>
        </div>
      </form>
    </div>
  );
}
