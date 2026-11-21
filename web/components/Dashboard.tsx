"use client";

import { CalendarRange, LayoutDashboard, MessageSquarePlus, Pin, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type DateRange,
  presetRange,
  RANGE_PRESETS,
  type RangePreset,
  type Widget,
  type WidgetData,
} from "@/lib/dashboard";
import { inferDates, isSeriesType } from "@/lib/chartTool";
import { PinDialog } from "./PinDialog";
import { WidgetCard } from "./WidgetCard";

const SPAN: Record<string, string> = {
  "chart-sm": "md:col-span-1 xl:col-span-4",
  "chart-md": "md:col-span-1 xl:col-span-6",
  "chart-lg": "md:col-span-2 xl:col-span-12",
  "number-sm": "md:col-span-1 xl:col-span-3",
  "number-md": "md:col-span-1 xl:col-span-4",
  "number-lg": "md:col-span-1 xl:col-span-6",
};

const RANGE_KEY = "mx-dashboard-range-v1";

function useRangeFilter() {
  const [preset, setPreset] = useState<RangePreset>("saved");
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RANGE_KEY) || "null");
      if (saved?.preset) setPreset(saved.preset);
      if (saved?.custom) setCustom(saved.custom);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify({ preset, custom }));
    } catch {}
  }, [preset, custom]);
  const range = useMemo(() => presetRange(preset, custom), [preset, custom]);
  return { preset, setPreset, custom, setCustom, range };
}

function Toast({ text }: { text: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-fg px-4 py-2 text-sm text-bg shadow-lg" role="status">
      {text}
    </div>
  );
}

export function Dashboard({
  onAsk,
  onNewChat,
  onCount,
}: {
  onAsk: (widget: Widget, data: WidgetData) => void;
  onNewChat: () => void;
  onCount?: (n: number) => void;
}) {
  const [widgets, setWidgets] = useState<Widget[] | null>(null);
  const [embedEnabled, setEmbedEnabled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Widget | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { preset, setPreset, custom, setCustom, range } = useRangeFilter();

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(() => {
    api
      .list()
      .then((r) => {
        setWidgets(r.widgets);
        setEmbedEnabled(r.embedEnabled);
        setLoadError(null);
      })
      .catch((err) => setLoadError((err as Error).message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (widgets) onCount?.(widgets.length);
  }, [widgets, onCount]);

  const saveOrder = (next: Widget[]) => {
    setWidgets(next);
    api.reorder(next.map((w) => w.id)).catch(() => flash("Couldn't save the new order."));
  };

  const move = (id: string, to: number) => {
    if (!widgets) return;
    const from = widgets.findIndex((w) => w.id === id);
    if (from < 0 || to < 0 || to >= widgets.length || from === to) return;
    const next = [...widgets];
    const [w] = next.splice(from, 1);
    next.splice(to, 0, w);
    saveOrder(next);
  };

  const copyEmbed = async (w: Widget) => {
    try {
      const { embedToken } = await api.embedToken(w.id);
      if (!embedToken) return flash("Set WIDGET_EMBED_SECRET to turn on embedding.");
      const src = `${location.origin}/embed/${w.id}?t=${embedToken}`;
      await navigator.clipboard.writeText(
        `<iframe src="${src}" title="${w.title.replaceAll('"', "&quot;")}" width="100%" height="${w.display === "number" ? 180 : 380}" style="border:0" loading="lazy"></iframe>`,
      );
      flash("Embed code copied.");
    } catch (err) {
      flash((err as Error).message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-muted">Pinned charts, re-run on your live data each time you open this page.</p>
        {widgets && widgets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm">
              <CalendarRange className="size-4 text-muted" />
              <span className="sr-only">Date range</span>
              <select value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)} className="bg-transparent outline-none">
                {RANGE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {preset === "custom" && (
              <div className="flex items-center gap-1.5 text-sm">
                <input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="rounded-lg border border-line bg-panel px-2 py-1.5" aria-label="From" />
                <span className="text-muted">to</span>
                <input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="rounded-lg border border-line bg-panel px-2 py-1.5" aria-label="To" />
              </div>
            )}
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-muted hover:text-fg"
            >
              <RefreshCw className="size-4" /> Refresh all
            </button>
          </div>
        )}
      </div>

      {loadError && <p className="mb-4 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">Couldn't load the dashboard: {loadError}</p>}

      {widgets === null && !loadError && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
          {[4, 4, 4, 6, 6].map((n, i) => (
            <div key={i} className={`h-64 animate-pulse rounded-xl border border-line bg-panel ${n === 4 ? "xl:col-span-4" : "xl:col-span-6"}`} />
          ))}
        </div>
      )}

      {widgets && widgets.length === 0 && (
        <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-dashed border-line bg-panel px-6 py-10 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-brand-soft text-brand">
            <LayoutDashboard className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Your dashboard is empty</h2>
          <p className="mt-1 text-sm text-muted">
            Ask for a chart in the chat, then press <Pin className="inline size-3.5" /> <b>Pin</b> on it. It will show up here every time you open the app, with fresh data.
          </p>
          <button
            type="button"
            onClick={onNewChat}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg shadow-sm hover:brightness-110"
          >
            <MessageSquarePlus className="size-4" /> Ask for a chart
          </button>
        </div>
      )}

      {widgets && widgets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
          {widgets.map((w, i) => (
            <div
              key={w.id}
              id={`widget-${w.id}`}
              className={`${SPAN[`${w.display}-${w.size}`]} ${w.display === "number" ? "self-start" : ""} min-w-0 rounded-xl transition ${dragId === w.id ? "opacity-40" : ""} ${overId === w.id && dragId !== w.id ? "ring-2 ring-brand/60 ring-offset-2 ring-offset-bg" : ""}`}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverId(w.id);
              }}
              onDragLeave={() => setOverId((o) => (o === w.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) move(dragId, i);
                setDragId(null);
                setOverId(null);
              }}
            >
              <WidgetCard
                key={`${w.id}-${refreshKey}`}
                widget={w}
                range={range}
                actions={{
                  onEdit: () => setEditing(w),
                  onRemove: () => {
                    setWidgets((ws) => ws?.filter((x) => x.id !== w.id) ?? null);
                    api.remove(w.id).catch(() => (flash("Couldn't remove it."), load()));
                  },
                  onAsk: (data) => onAsk(w, data),
                  onMove: (dir) => move(w.id, i + dir),
                  onCopyEmbed: embedEnabled ? () => copyEmbed(w) : undefined,
                  dragHandle: {
                    draggable: true,
                    onDragStart: (e) => {
                      setDragId(w.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", w.id);
                      const card = document.getElementById(`widget-${w.id}`);
                      if (card) e.dataTransfer.setDragImage(card, 24, 24);
                    },
                    onDragEnd: () => {
                      setDragId(null);
                      setOverId(null);
                    },
                  },
                }}
              />
            </div>
          ))}
        </div>
      )}

      {editing && (
        <PinDialog
          mode="edit"
          initial={{ title: editing.title, size: editing.size, display: editing.display, numberMode: editing.numberMode, refresh: editing.refresh, rollDates: editing.rollDates !== false }}
          hasDates={Boolean(inferDates(editing.spec.source).date_from)}
          allowNumber={isSeriesType(editing.spec.type)}
          onClose={() => setEditing(null)}
          onSubmit={async (s) => {
            const { widget } = await api.update(editing.id, s);
            setWidgets((ws) => ws?.map((x) => (x.id === widget.id ? widget : x)) ?? null);
            setEditing(null);
          }}
        />
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}
