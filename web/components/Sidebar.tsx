"use client";

import { MessageSquare, Moon, PanelLeftClose, Plus, Sun, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Conversation } from "@/lib/conversation";
import { Logo } from "./Logo";

function groupChats(list: Conversation[]) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const c of [...list].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (c.updatedAt >= startToday) groups[0].items.push(c);
    else if (c.updatedAt >= startToday - 7 * 864e5) groups[1].items.push(c);
    else groups[2].items.push(c);
  }
  return groups.filter((g) => g.items.length);
}

function useHealth() {
  const [h, setH] = useState<{ ok: boolean; model?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((j) => alive && setH(j))
        .catch(() => alive && setH({ ok: false }));
    check();
    const t = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return h;
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };
  return (
    <button type="button" onClick={toggle} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-fg" aria-label="Toggle dark mode" title="Toggle dark mode">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function Sidebar({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  chats: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const health = useHealth();
  return (
    <aside className="flex h-full w-72 flex-col border-r border-line bg-panel">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Logo />
        <div className="leading-tight">
          <div className="font-semibold">MotoXchange</div>
          <div className="text-xs text-muted">Data assistant</div>
        </div>
        <button type="button" onClick={onClose} className="ml-auto rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-fg lg:hidden" aria-label="Close sidebar">
          <PanelLeftClose className="size-4" />
        </button>
      </div>
      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg shadow-sm transition hover:brightness-110"
        >
          <Plus className="size-4" /> New chat
          <kbd className="ml-auto rounded border border-white/30 px-1.5 text-[10px] font-normal opacity-80">⌘K</kbd>
        </button>
      </div>
      <nav className="scrollbar-thin mt-4 flex-1 overflow-y-auto px-2 pb-4">
        {chats.length === 0 && <p className="px-3 text-sm text-muted">Your chats will appear here.</p>}
        {groupChats(chats).map((g) => (
          <div key={g.label} className="mb-3">
            <div className="px-3 pb-1 text-xs font-medium text-muted">{g.label}</div>
            {g.items.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center rounded-lg text-sm ${c.id === activeId ? "bg-panel-2 text-fg" : "text-fg/80 hover:bg-panel-2/70"}`}
              >
                <button type="button" onClick={() => onSelect(c.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left">
                  <MessageSquare className="size-3.5 shrink-0 text-muted" />
                  <span className="truncate">{c.title}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  className="mr-1 rounded p-1 text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
                  aria-label="Delete chat"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs text-muted">
        <span className={`size-2 rounded-full ${health === null ? "bg-muted" : health.ok ? "bg-emerald-500" : "bg-red-500"}`} />
        <span className="truncate">
          {health === null ? "Checking database…" : health.ok ? "Database connected" : "Database unreachable"}
          {health?.model && <span className="block truncate text-[11px] opacity-70">{health.model}</span>}
        </span>
        <span className="ml-auto">
          <ThemeToggle />
        </span>
      </div>
    </aside>
  );
}
