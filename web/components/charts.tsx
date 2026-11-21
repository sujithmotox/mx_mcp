"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ChartSpec, ChartType } from "@/lib/chartTool";
import { formatDate } from "@/lib/format";
import { axis, ChartTooltip, fmtWith, SERIES, type Size, TooltipBox, useWidth } from "./chartKit";

/** Types drawn as SVG (so the PNG download works); the rest are HTML grids. */
export const hasSvg = (t: ChartType) => !["heatmap", "funnel", "table"].includes(t);
export const NEW_TYPES: ChartType[] = ["combo", "funnel", "heatmap", "scatter", "sankey", "table"];

const legendFormatter = (v: string) => <span style={{ color: "var(--fg)" }}>{v}</span>;

/** Sequential blue scale (light -> dark on light surfaces, reversed in dark mode; see globals.css). */
const seq = (t: number) => `color-mix(in oklab, var(--seq-hi) ${Math.round(t * 100)}%, var(--seq-lo))`;
const seqInk = (t: number) => (t > 0.55 ? "var(--seq-ink-hi)" : "var(--seq-ink-lo)");

// ---- Bars + line (two y-axes) ------------------------------------------------------
function Combo({ spec, size }: { spec: ChartSpec; size: Size }) {
  const rows = spec.labels.map((label, i) => {
    const r: Record<string, string | number | null> = { label };
    for (const s of spec.series) r[s.name] = s.values[i] ?? null;
    return r;
  });
  const hasRight = spec.series.some((s) => s.axis === "right");
  const left = fmtWith(spec.value_format, false);
  const right = fmtWith(spec.right_format ?? spec.value_format, false);
  const nameOf = (s: ChartSpec["series"][number]) => (hasRight ? `${s.name} (${s.axis === "right" ? "right" : "left"} axis)` : s.name);
  const formatFor = (p: any) => {
    const s = spec.series.find((x) => nameOf(x) === p.name);
    return fmtWith(s?.axis === "right" ? (spec.right_format ?? spec.value_format) : spec.value_format, true);
  };
  const height = size === "tall" ? 560 : size === "compact" ? 260 : 340;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 20, right: hasRight ? 8 : 24, left: 4, bottom: 4 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
        <YAxis yAxisId="left" {...axis} axisLine={false} tickFormatter={left} width={68} />
        {hasRight && <YAxis yAxisId="right" orientation="right" {...axis} axisLine={false} tickFormatter={right} width={60} />}
        <Tooltip content={<ChartTooltip spec={spec} formatFor={formatFor} />} cursor={{ fill: "var(--panel-2)" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 8 }} formatter={legendFormatter} />
        {spec.series.map((s, i) =>
          s.kind === "line" ? (
            <Line
              key={s.name}
              yAxisId={s.axis === "right" ? "right" : "left"}
              dataKey={s.name}
              name={nameOf(s)}
              type="monotone"
              stroke={SERIES[i]}
              strokeWidth={2}
              dot={spec.labels.length <= 24 ? { r: 3, strokeWidth: 0, fill: SERIES[i] } : false}
              activeDot={{ r: 5, stroke: "var(--panel)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ) : (
            <Bar
              key={s.name}
              yAxisId={s.axis === "right" ? "right" : "left"}
              dataKey={s.name}
              name={nameOf(s)}
              fill={SERIES[i]}
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
              isAnimationActive={false}
            />
          ),
        )}
        {(spec.reference_lines ?? []).map((r) => (
          <ReferenceLine key={r.label} yAxisId="left" y={r.value} stroke="var(--fg)" strokeOpacity={0.55} strokeDasharray="4 4"
            label={{ value: r.label, position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }} ifOverflow="extendDomain" />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---- Funnel ------------------------------------------------------------------------
function Funnel({ spec }: { spec: ChartSpec }) {
  const s = spec.series[0];
  const vals = s.values.map((v) => v ?? 0);
  const max = Math.max(...vals, 1);
  const first = vals[0] || 0;
  const f = fmtWith(spec.value_format, true);
  return (
    <div className="space-y-2.5 px-2 py-2">
      {spec.labels.map((label, i) => {
        const v = vals[i];
        const ofFirst = first ? (v / first) * 100 : null;
        const ofPrev = i > 0 && vals[i - 1] ? (v / vals[i - 1]) * 100 : null;
        return (
          <div key={label + i}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-medium">{label}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{f(v)}</span>
                {ofFirst !== null && i > 0 && <span className="ml-2 text-muted">{ofFirst.toFixed(1)}% of start</span>}
                {ofPrev !== null && (
                  <span className="ml-2 text-muted" title="Kept from the previous step">
                    · {ofPrev.toFixed(1)}% of previous
                  </span>
                )}
              </span>
            </div>
            <div className="flex h-7 justify-center rounded bg-panel-2/60">
              <div className="h-full rounded" style={{ width: `${Math.max((v / max) * 100, 0.6)}%`, background: SERIES[0] }} title={`${label}: ${f(v)}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Heat map ----------------------------------------------------------------------
function Heatmap({ spec, size }: { spec: ChartSpec; size: Size }) {
  const cells = spec.cells ?? [];
  const { xs, ys, map, min, max } = useMemo(() => {
    const xs: string[] = [];
    const ys: string[] = [];
    const map = new Map<string, number | null>();
    for (const c of cells) {
      if (!xs.includes(c.x)) xs.push(c.x);
      if (!ys.includes(c.y)) ys.push(c.y);
      map.set(`${c.y}\u0000${c.x}`, c.value);
    }
    // Numbers (hours, days of month) go in numeric order even if the query skipped some.
    const numeric = (a: string[]) => a.every((v) => v.trim() !== "" && Number.isFinite(Number(v)));
    if (numeric(xs)) xs.sort((a, b) => Number(a) - Number(b));
    if (numeric(ys)) ys.sort((a, b) => Number(a) - Number(b));
    const vals = cells.map((c) => c.value).filter((v): v is number => v !== null);
    return { xs, ys, map, min: Math.min(...vals), max: Math.max(...vals) };
  }, [cells]);
  const [hover, setHover] = useState<{ x: string; y: string; v: number | null } | null>(null);
  const f = fmtWith(spec.value_format, false);
  const full = fmtWith(spec.value_format, true);
  const showText = xs.length <= 16;
  const cellH = size === "compact" ? 26 : 32;
  const t = (v: number) => (max > min ? (v - min) / (max - min) : 1);
  return (
    <div className="px-2 pb-1">
      <div className="mb-2 flex min-h-6 items-center justify-between gap-3 text-xs text-muted">
        <span className="truncate">
          {hover ? (
            <>
              <b className="text-fg">{hover.y}</b> × <b className="text-fg">{hover.x}</b>: <span className="font-semibold text-fg tabular-nums">{hover.v === null ? "no data" : full(hover.v)}</span>
            </>
          ) : (
            "Hover a cell for its value"
          )}
        </span>
        {Number.isFinite(min) && (
          <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
            {f(min)}
            <span className="h-2.5 w-24 rounded-sm" style={{ background: "linear-gradient(90deg, var(--seq-lo), var(--seq-hi))" }} />
            {f(max)}
          </span>
        )}
      </div>
      <div className="scrollbar-thin overflow-x-auto">
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `minmax(64px, max-content) repeat(${xs.length}, minmax(${showText ? 40 : 18}px, 1fr))` }}
          onMouseLeave={() => setHover(null)}
          role="table"
          aria-label={spec.title}
        >
          <div />
          {xs.map((x) => (
            <div key={x} className="truncate px-0.5 pb-1 text-center text-[11px] text-muted" title={x} role="columnheader">
              {formatDate(x) ?? x}
            </div>
          ))}
          {ys.map((y) => (
            <div key={y} className="contents" role="row">
              <div className="truncate pr-2 text-right text-xs leading-[var(--h)] text-muted" style={{ ["--h" as string]: `${cellH}px` }} title={y} role="rowheader">
                {formatDate(y) ?? y}
              </div>
              {xs.map((x) => {
                const v = map.get(`${y}\u0000${x}`) ?? null;
                const tv = v === null ? 0 : t(v);
                return (
                  <div
                    key={x}
                    role="cell"
                    onMouseEnter={() => setHover({ x, y, v })}
                    className={`grid place-items-center rounded-[3px] text-[11px] tabular-nums outline-offset-1 hover:outline hover:outline-2 hover:outline-[var(--fg)] ${v === null ? "bg-panel-2" : ""}`}
                    style={{ height: cellH, ...(v === null ? {} : { background: seq(tv), color: seqInk(tv) }) }}
                    title={`${y} × ${x}: ${v === null ? "no data" : full(v)}`}
                  >
                    {showText && v !== null ? f(v) : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Scatter -----------------------------------------------------------------------
function ScatterPlot({ spec, size }: { spec: ChartSpec; size: Size }) {
  const points = spec.points ?? [];
  // Up to 8 groups keep their own colour (in order of first appearance); the rest fold into "Other".
  const groups = useMemo(() => {
    const names: string[] = [];
    for (const p of points) if (p.group && !names.includes(p.group)) names.push(p.group);
    const keep = names.length > 8 ? names.slice(0, 7) : names;
    const out = new Map<string, typeof points>();
    for (const p of points) {
      const g = !p.group ? "" : keep.includes(p.group) ? p.group : "Other";
      out.set(g, [...(out.get(g) ?? []), p]);
    }
    return [...out.entries()];
  }, [points]);
  const fx = fmtWith(spec.x_format, false);
  const fy = fmtWith(spec.value_format, false);
  const fxFull = fmtWith(spec.x_format, true);
  const fyFull = fmtWith(spec.value_format, true);
  const height = size === "tall" ? 560 : size === "compact" ? 260 : 360;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 16, right: 24, left: 4, bottom: 16 }}>
        <CartesianGrid stroke="var(--grid)" />
        <XAxis type="number" dataKey="x" name={spec.x_label || "x"} {...axis} tickFormatter={fx}
          label={spec.x_label ? { value: spec.x_label, position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 12 } : undefined} />
        <YAxis type="number" dataKey="y" name={spec.y_label || "y"} {...axis} axisLine={false} tickFormatter={fy} width={68} />
        <ZAxis range={[48, 48]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3", stroke: "var(--muted)" }}
          content={({ active, payload }: any) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <TooltipBox
                title={p.label || undefined}
                rows={[
                  ...(p.group ? [{ label: "Group", value: p.group }] : []),
                  { label: spec.x_label || "x", value: fxFull(p.x) },
                  { label: spec.y_label || "y", value: fyFull(p.y) },
                ]}
              />
            );
          }}
        />
        {groups.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 12 }} formatter={legendFormatter} />}
        {groups.map(([g, pts], i) => (
          <Scatter key={g || "all"} name={g || spec.y_label || "Points"} data={pts} fill={SERIES[i % 8]} fillOpacity={0.85} stroke="var(--panel)" strokeWidth={1} isAnimationActive={false} />
        ))}
        {(spec.reference_lines ?? []).map((r) => (
          <ReferenceLine key={r.label} y={r.value} stroke="var(--fg)" strokeOpacity={0.55} strokeDasharray="4 4"
            label={{ value: r.label, position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }} ifOverflow="extendDomain" />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---- Sankey ------------------------------------------------------------------------
function SankeyPlot({ spec, size }: { spec: ChartSpec; size: Size }) {
  const [ref, boxWidth] = useWidth();
  // Below ~620px the middle column's labels run into the last column's, so the chart scrolls sideways instead.
  const width = boxWidth > 0 ? Math.max(boxWidth, 620) : 0;
  const data = useMemo(() => {
    const names: string[] = [];
    const idx = (n: string) => {
      let i = names.indexOf(n);
      if (i < 0) i = names.push(n) - 1;
      return i;
    };
    const links = (spec.links ?? []).map((l) => ({ source: idx(l.from), target: idx(l.to), value: l.value }));
    return { nodes: names.map((name) => ({ name })), links };
  }, [spec.links]);
  const f = fmtWith(spec.value_format, false);
  const full = fmtWith(spec.value_format, true);
  const perColumn = Math.max(4, Math.ceil(data.nodes.length / 3));
  const height = size === "tall" ? 560 : size === "compact" ? Math.min(380, perColumn * 34 + 40) : Math.max(320, Math.min(640, perColumn * 44 + 40));
  const labelSpace = Math.min(140, width * 0.22);

  const Node = (p: any) => {
    const rightSide = p.x + p.width + labelSpace > width - 4;
    return (
      <g>
        <rect x={p.x} y={p.y} width={p.width} height={Math.max(p.height, 1)} rx={2} fill={SERIES[0]} />
        <text
          x={rightSide ? p.x - 6 : p.x + p.width + 6}
          y={p.y + p.height / 2}
          textAnchor={rightSide ? "end" : "start"}
          dominantBaseline="middle"
          fontSize={12}
          fill="var(--fg)"
        >
          {p.payload.name}
          <tspan fill="var(--muted)"> {f(p.payload.value)}</tspan>
        </text>
      </g>
    );
  };

  return (
    <div ref={ref} className="scrollbar-thin overflow-x-auto px-1">
      {width > 0 && (
        <Sankey
          width={width}
          height={height}
          data={data}
          node={Node}
          nodeWidth={10}
          nodePadding={18}
          linkCurvature={0.5}
          iterations={48}
          margin={{ top: 8, right: labelSpace, bottom: 8, left: 8 }}
          link={{ stroke: "var(--series-1)", strokeOpacity: 0.22 }}
        >
          <Tooltip
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const item = payload[0].payload?.payload ?? payload[0].payload;
              if (item?.source && item?.target)
                return <TooltipBox title={`${item.source.name} → ${item.target.name}`} rows={[{ label: "Amount", value: full(item.value) }]} />;
              return <TooltipBox title={item?.name} rows={[{ label: "Total", value: full(item?.value) }]} />;
            }}
          />
        </Sankey>
      )}
    </div>
  );
}

// ---- Coloured table ----------------------------------------------------------------
function StyledTable({ spec, size }: { spec: ChartSpec; size: Size }) {
  const columns = spec.columns ?? [];
  const rows = spec.rows ?? [];
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const stats = useMemo(() => {
    const out = new Map<string, { min: number; max: number }>();
    for (const c of columns) {
      const vals = rows.map((r) => r[c.key]).filter((v): v is number => typeof v === "number");
      if (vals.length) out.set(c.key, { min: Math.min(...vals), max: Math.max(...vals) });
    }
    return out;
  }, [columns, rows]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, sort]);
  const show = (c: (typeof columns)[number], v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (c.format === "date" || (c.format === undefined && typeof v === "string")) return formatDate(String(v)) ?? String(v);
    if (c.format === "text") return String(v);
    return fmtWith(c.format === "inr" ? "inr" : c.format === "percent" ? "percent" : "number", true)(typeof v === "number" ? v : Number(v));
  };
  const numeric = (c: (typeof columns)[number]) => stats.has(c.key) && c.format !== "text" && c.format !== "date";
  return (
    <div className={`scrollbar-thin overflow-auto px-2 ${size === "compact" ? "max-h-72" : "max-h-[480px]"}`}>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-panel">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`cursor-pointer select-none whitespace-nowrap border-b border-line px-3 py-2 text-xs font-medium text-muted hover:text-fg ${numeric(c) ? "text-right" : "text-left"}`}
                onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === -1 ? { key: c.key, dir: 1 } : null) : { key: c.key, dir: -1 }))}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label || c.key.replaceAll("_", " ")}
                  {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="hover:bg-panel-2/50">
              {columns.map((c) => {
                const v = r[c.key];
                const st = stats.get(c.key);
                const n = typeof v === "number" ? v : null;
                const t = n !== null && st ? (st.max > st.min ? (n - st.min) / (st.max - st.min) : 1) : 0;
                const style: React.CSSProperties = {};
                if (c.style === "shade" && n !== null) {
                  style.background = seq(0.08 + t * 0.8);
                  style.color = seqInk(0.08 + t * 0.8);
                }
                const barPct = c.style === "bar" && n !== null && st ? Math.max(0, (n / Math.max(st.max, 1e-9)) * 100) : null;
                return (
                  <td key={c.key} className={`whitespace-nowrap border-b border-line/70 px-3 py-1.5 tabular-nums ${numeric(c) ? "text-right" : "text-left"}`} style={style}>
                    {barPct !== null ? (
                      <div className="flex items-center justify-end gap-2">
                        <span>{show(c, v)}</span>
                        <span className="h-2 w-20 shrink-0 overflow-hidden rounded-sm bg-panel-2">
                          <span className="block h-full rounded-sm" style={{ width: `${Math.min(barPct, 100)}%`, background: SERIES[0] }} />
                        </span>
                      </div>
                    ) : (
                      show(c, v)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Draws the types added after bar/line/area/pie. */
export function ChartBody({ spec, size }: { spec: ChartSpec; size: Size }) {
  switch (spec.type) {
    case "combo":
      return <Combo spec={spec} size={size} />;
    case "funnel":
      return <Funnel spec={spec} />;
    case "heatmap":
      return <Heatmap spec={spec} size={size} />;
    case "scatter":
      return <ScatterPlot spec={spec} size={size} />;
    case "sankey":
      return <SankeyPlot spec={spec} size={size} />;
    case "table":
      return <StyledTable spec={spec} size={size} />;
    default:
      return null;
  }
}
