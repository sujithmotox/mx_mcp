"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Code2,
  GripVertical,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import type { ChartSpec } from "@/lib/chartTool";
import { api, type DateRange, formatValue, REFRESH_MS, timeAgo, type Widget, type WidgetData } from "@/lib/dashboard";
import { formatDate } from "@/lib/format";
import { ChartView } from "./ChartView";

export type WidgetActions = {
  onEdit?: () => void;
  onRemove?: () => void;
  onAsk?: (data: WidgetData) => void;
  onMove?: (dir: -1 | 1) => void;
  onCopyEmbed?: () => void;
  /** Drag handle props from the dashboard grid. */
  dragHandle?: React.HTMLAttributes<HTMLSpanElement>;
};

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Load a widget's data, re-run on the range change and on its refresh interval. */
function useWidgetData(widget: Widget, range: DateRange | null, token?: string) {
  const [state, setState] = useState<{ data?: WidgetData; error?: string; loading: boolean; dateFiltered: boolean }>({
    loading: true,
    dateFiltered: false,
  });
  const seq = useRef(0);
  const load = useCallback(
    async (fresh = false) => {
      const n = ++seq.current;
      setState((s) => ({ ...s, loading: true }));
      try {
        const r = await api.data(widget.id, { range, fresh, token });
        if (n === seq.current) setState({ data: r.data, loading: false, dateFiltered: r.dateFiltered });
      } catch (err) {
        if (n === seq.current) setState((s) => ({ ...s, error: (err as Error).message, loading: false }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widget.id, widget.updatedAt, range?.from, range?.to, token],
  );

  useEffect(() => {
    setState((s) => ({ ...s, error: undefined }));
    load();
  }, [load]);

  useEffect(() => {
    const every = REFRESH_MS[widget.refresh];
    if (!every) return;
    const t = setInterval(() => document.visibilityState === "visible" && load(true), every);
    return () => clearInterval(t);
  }, [load, widget.refresh]);

  return { ...state, reload: () => load(true) };
}

function Menu({ widget, actions, reload, data }: { widget: Widget; actions: WidgetActions; reload: () => void; data?: WidgetData }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && (setOpen(false), setConfirm(false));
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={() => {
        onClick();
        if (!danger) setOpen(false);
      }}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-panel-2 ${danger ? "text-danger" : ""}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-1.5 text-muted transition hover:bg-panel-2 hover:text-fg"
        aria-label={`Options for ${widget.title}`}
        title="Options"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-line bg-panel p-1 shadow-xl">
          {item(<RefreshCw className="size-4 text-muted" />, "Refresh now", reload)}
          {actions.onAsk && data && item(<MessageSquareText className="size-4 text-muted" />, "Ask about this", () => actions.onAsk!(data))}
          {actions.onEdit && item(<Pencil className="size-4 text-muted" />, "Edit", actions.onEdit)}
          {actions.onMove && item(<ArrowUp className="size-4 text-muted" />, "Move earlier", () => actions.onMove!(-1))}
          {actions.onMove && item(<ArrowDown className="size-4 text-muted" />, "Move later", () => actions.onMove!(1))}
          {actions.onCopyEmbed && item(<Code2 className="size-4 text-muted" />, "Copy embed code", actions.onCopyEmbed)}
          {actions.onRemove && (
            <>
              <div className="my-1 border-t border-line" />
              {item(<Trash2 className="size-4" />, confirm ? "Click again to remove" : "Remove", () => (confirm ? (setOpen(false), actions.onRemove!()) : setConfirm(true)), true)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Shell({ title, subtitle, actions, children }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-panel shadow-sm">
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug">{title}</h3>
          {subtitle}
        </div>
        <div className="flex shrink-0 items-center">{actions}</div>
      </div>
      <div className="flex-1 px-4 pb-3 pt-2">{children}</div>
    </div>
  );
}

function Status({ data, loading, dateFiltered, rangeActive, widget }: { data?: WidgetData; loading: boolean; dateFiltered: boolean; rangeActive: boolean; widget: Widget }) {
  const now = useNow();
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
      {loading ? (
        <span className="inline-flex items-center gap-1">
          <RefreshCw className="size-3 animate-spin" /> Updating
        </span>
      ) : (
        data && <span title={new Date(data.fetchedAt).toLocaleString()}>Updated {timeAgo(data.fetchedAt, now)}</span>
      )}
      {rangeActive && !dateFiltered && widget.spec.source && !widget.spec.source.date_from && (
        <span className="rounded bg-panel-2 px-1.5 py-px" title="This widget's query has no fixed dates, so the date filter doesn't change it.">
          Not date-filtered
        </span>
      )}
      {data?.truncated && <span>First 200 rows</span>}
    </div>
  );
}

function toSpec(widget: Widget, data: WidgetData): ChartSpec {
  const { source: _s, ...base } = widget.spec;
  return { ...base, title: widget.title, labels: data.labels.map((l) => formatDate(l) ?? l), series: data.series };
}

function NumberTile({ widget, data }: { widget: Widget; data: WidgetData }) {
  const s = data.series[0];
  const vals = s.values;
  const nonNull = vals.filter((v): v is number => v !== null);
  const value = widget.numberMode === "total" ? nonNull.reduce((a, b) => a + b, 0) : (nonNull[nonNull.length - 1] ?? null);
  const prev = widget.numberMode === "last" && nonNull.length > 1 ? nonNull[nonNull.length - 2] : null;
  const delta = value !== null && prev ? ((value - prev) / Math.abs(prev)) * 100 : null;
  const lastLabel = data.labels[data.labels.length - 1];
  const points = vals.map((v, i) => ({ i, v }));
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div>
        <div className="text-3xl font-semibold tabular-nums tracking-tight" title={formatValue(widget.spec, value, true)}>
          {formatValue(widget.spec, value)}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>
            {s.name}
            {widget.numberMode === "last" && lastLabel ? ` · ${formatDate(lastLabel) ?? lastLabel}` : widget.numberMode === "total" ? " · total" : ""}
          </span>
          {delta !== null && Number.isFinite(delta) && (
            <span className={`inline-flex items-center font-medium ${delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>
              {delta >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              {Math.abs(delta).toFixed(1)}% vs previous
            </span>
          )}
        </div>
      </div>
      {points.length > 1 && (
        <div className="h-12" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Area dataKey="v" type="monotone" stroke="var(--series-1)" strokeWidth={2} fill={`url(#spark-${widget.id})`} isAnimationActive={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function WidgetCard({
  widget,
  range,
  token,
  actions = {},
}: {
  widget: Widget;
  range: DateRange | null;
  token?: string;
  actions?: WidgetActions;
}) {
  const { data, error, loading, dateFiltered, reload } = useWidgetData(widget, range, token);
  const handle = actions.dragHandle && (
    <span {...actions.dragHandle} className="cursor-grab rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-fg active:cursor-grabbing" title="Drag to move" aria-hidden>
      <GripVertical className="size-4" />
    </span>
  );
  const menu = <Menu widget={widget} actions={actions} reload={reload} data={data} />;
  const status = <Status data={data} loading={loading} dateFiltered={dateFiltered} rangeActive={Boolean(range)} widget={widget} />;

  if (error && !data)
    return (
      <Shell title={widget.title} actions={<>{handle}{menu}</>}>
        <div className="flex h-full min-h-32 flex-col items-start justify-center gap-2 text-sm">
          <p className="flex items-start gap-2 text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
          <button type="button" onClick={reload} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-muted hover:text-fg">
            <RefreshCw className="size-3.5" /> Try again
          </button>
        </div>
      </Shell>
    );

  if (!data)
    return (
      <Shell title={widget.title} actions={<>{handle}{menu}</>}>
        <div className={`animate-pulse rounded-lg bg-panel-2 ${widget.display === "number" ? "h-24" : "h-56"}`} />
      </Shell>
    );

  if (!data.labels.length)
    return (
      <Shell title={widget.title} subtitle={status} actions={<>{handle}{menu}</>}>
        <p className="flex min-h-24 items-center text-sm text-muted">No data for this period.</p>
      </Shell>
    );

  if (widget.display === "number")
    return (
      <Shell title={widget.title} subtitle={status} actions={<>{handle}{menu}</>}>
        <NumberTile widget={widget} data={data} />
      </Shell>
    );

  return <ChartView key={`${widget.updatedAt}`} spec={toSpec(widget, data)} compact subtitle={status} actions={<>{handle}{menu}</>} />;
}
