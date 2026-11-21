"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartSpec } from "@/lib/chartTool";
import { inrCompact, inrFull, numCompact, numFull } from "@/lib/format";

// Categorical slots in fixed order (light/dark steps live in globals.css).
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

export type Kind = "bar" | "line" | "area";

export type ValueFormat = "number" | "inr" | "percent" | undefined;

export function fmtWith(format: ValueFormat, full: boolean) {
  return (v: unknown) => {
    if (typeof v !== "number") return String(v ?? "—");
    if (format === "percent") return `${+v.toFixed(1)}%`;
    if (format === "inr") return full ? inrFull(v) : inrCompact(v);
    return full ? numFull(v) : numCompact(v);
  };
}

export const fmt = (spec: Pick<ChartSpec, "value_format">, full: boolean) => fmtWith(spec.value_format, full);

export function ChartTooltip({ active, payload, label, spec, formatFor }: any) {
  if (!active || !payload?.length) return null;
  const base = fmt(spec, true);
  const f = (p: any) => (formatFor ? formatFor(p) : base)(p.value);
  return (
    <div className="min-w-40 rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-lg">
      {label !== undefined && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2.5 rounded-sm" style={{ background: p.payload?.fill ?? p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums">{f(p)}</span>
        </div>
      ))}
    </div>
  );
}

export const axis = { stroke: "var(--line)", tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false } as const;

export function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export type Size = "normal" | "tall" | "compact";

/** A tooltip-styled box for charts that draw their own hover state. */
export function TooltipBox({ title, rows }: { title?: React.ReactNode; rows: { label: React.ReactNode; value: React.ReactNode; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-lg">
      {title !== undefined && <div className="mb-1 font-medium">{title}</div>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            {r.color && <span className="size-2.5 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
