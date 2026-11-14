"use client";

import { ArrowUp, Menu, Plus, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyEvent,
  type Conversation,
  loadConversations,
  newId,
  saveConversations,
  type Turn,
} from "@/lib/conversation";
import type { ChatEvent } from "@/lib/events";
import { AssistantTurn, UserBubble } from "./AssistantTurn";
import { Sidebar } from "./Sidebar";
import { Welcome } from "./Welcome";

const titleFrom = (q: string) => (q.length > 48 ? q.slice(0, 46).trimEnd() + "…" : q);

export function App() {
  const [chats, setChats] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const loaded = useRef(false);

  useEffect(() => {
    setChats(loadConversations());
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current && !busy) saveConversations(chats);
  }, [chats, busy]);

  const active = chats.find((c) => c.id === activeId) ?? null;

  const newChat = useCallback(() => {
    if (busy) abortRef.current?.abort();
    setActiveId(null);
    setInput("");
    setSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  // Follow the stream while the user is at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chats, activeId]);

  // Auto-grow the composer.
  useEffect(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 200) + "px";
  }, [input]);

  async function send(text: string, opts: { regenerate?: boolean } = {}) {
    const message = text.trim();
    if (!message || busy) return;

    let chatId = activeId;
    let history: unknown[] = [];
    const base = chats.find((c) => c.id === chatId);
    if (opts.regenerate && base) {
      history = base.turns[base.turns.length - 1].historyBefore;
    } else if (base) {
      history = base.history;
    }

    const turn: Turn = { user: message, parts: [], historyBefore: history, status: "streaming" };
    if (!chatId || !base) {
      chatId = newId();
      const conv: Conversation = { id: chatId, title: titleFrom(message), updatedAt: Date.now(), turns: [turn], history: [] };
      setChats((cs) => [conv, ...cs]);
      setActiveId(chatId);
    } else {
      setChats((cs) =>
        cs.map((c) =>
          c.id === chatId
            ? { ...c, updatedAt: Date.now(), turns: opts.regenerate ? [...c.turns.slice(0, -1), turn] : [...c.turns, turn] }
            : c,
        ),
      );
    }

    const id = chatId;
    const updateTurn = (fn: (t: Turn) => Turn) =>
      setChats((cs) => cs.map((c) => (c.id === id ? { ...c, turns: c.turns.map((t, i) => (i === c.turns.length - 1 ? fn(t) : t)) } : c)));

    setInput("");
    setBusy(true);
    stick.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    let finished = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? "Not signed in." : `Request failed (${res.status})`);
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
          if (event.type === "done") {
            finished = true;
            const h = event.history;
            setChats((cs) => cs.map((c) => (c.id === id ? { ...c, history: h, updatedAt: Date.now() } : c)));
          } else {
            updateTurn((t) => ({ ...t, parts: applyEvent(t.parts, event) }));
          }
        }
      }
      updateTurn((t) => ({ ...t, status: finished ? (t.parts.some((p) => p.kind === "error") ? "error" : "done") : "stopped" }));
    } catch (err) {
      if (controller.signal.aborted) updateTurn((t) => ({ ...t, status: "stopped" }));
      else updateTurn((t) => ({ ...t, status: "error", parts: [...t.parts, { kind: "error", text: (err as Error).message }] }));
    } finally {
      // A stopped or failed turn leaves the API history as it was, so the next question starts clean.
      setBusy(false);
      abortRef.current = null;
    }
  }

  const regenerate = () => {
    const last = active?.turns[active.turns.length - 1];
    if (last) send(last.user, { regenerate: true });
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar: fixed on large screens, a drawer on small ones */}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar
          chats={chats}
          activeId={activeId}
          onSelect={(id) => {
            if (busy) return;
            setActiveId(id);
            setSidebarOpen(false);
          }}
          onNew={newChat}
          onDelete={(id) => {
            if (busy && id === activeId) return;
            setChats((cs) => cs.filter((c) => c.id !== id));
            if (id === activeId) setActiveId(null);
          }}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 lg:px-6">
          <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-md p-1.5 text-muted hover:bg-panel-2 lg:hidden" aria-label="Open sidebar">
            <Menu className="size-5" />
          </button>
          <h2 className="truncate font-medium">{active?.title ?? "New chat"}</h2>
          {active && (
            <button type="button" onClick={newChat} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-sm text-muted hover:text-fg">
              <Plus className="size-4" /> New
            </button>
          )}
        </header>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="scrollbar-thin flex-1 overflow-y-auto"
        >
          {!active ? (
            <Welcome onPick={(q) => send(q)} />
          ) : (
            <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 lg:px-8">
              {active.turns.map((t, i) => (
                <div key={i} className="space-y-6">
                  <UserBubble text={t.user} />
                  <AssistantTurn turn={t} isLast={i === active.turns.length - 1} onFollowup={(q) => send(q)} onRegenerate={regenerate} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2 lg:px-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mx-auto flex w-full max-w-4xl items-end gap-2 rounded-2xl border border-line bg-panel p-2 shadow-sm focus-within:border-brand/60 focus-within:ring-4 focus-within:ring-brand/10"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              autoFocus
              placeholder="Ask about auctions, enquiries, payments…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 outline-none placeholder:text-muted"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-fg text-bg transition hover:opacity-90"
                aria-label="Stop"
                title="Stop"
              >
                <Square className="size-4 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-fg transition hover:brightness-110 disabled:opacity-40"
                aria-label="Send"
              >
                <ArrowUp className="size-5" />
              </button>
            )}
          </form>
          <p className="mx-auto mt-2 max-w-4xl text-center text-xs text-muted">Read-only access · Answers can be wrong, so check the queries for important numbers.</p>
        </div>
      </main>
    </div>
  );
}
