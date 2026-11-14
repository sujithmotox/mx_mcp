"use client";

import {
  AreaChart as AreaIcon,
  BarChart3,
  Download,
  LineChart as LineIcon,
  Maximize2,
  Table2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/chartTool";
import { download, inrCompact, inrFull, numCompact, numFull, slug } from "@/lib/format";
import { DataTable } from "./DataTable";

// Categorical slots in fixed order (light/dark steps live in globals.css).
const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

type Kind = "bar" | "line" | "area";

function fmt(spec: ChartSpec, full: boolean) {
  return (v: unknown) => {
    if (typeof v !== "number") return String(v ?? "—");
    if (spec.value_format === "percent") return `${+v.toFixed(1)}%`;
    if (spec.value_format === "inr") return full ? inrFull(v) : inrCompact(v);
    return full ? numFull(v) : numCompact(v);
  };
}

function ChartTooltip({ active, payload, label, spec }: any) {
  if (!active || !payload?.length) return null;
  const f = fmt(spec, true);
  return (
    <div className="min-w-40 rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-lg">
      {label !== undefined && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2.5 rounded-sm" style={{ background: p.payload?.fill ?? p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums">{f(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const axis = { stroke: "var(--line)", tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false } as const;

function useWidth() {
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

function Plot({ spec, kind, tall }: { spec: ChartSpec; kind: Kind; tall?: boolean }) {
  const [boxRef, boxWidth] = useWidth();
  return (
    <div ref={boxRef}>
      <PlotInner spec={spec} kind={kind} tall={tall} width={boxWidth} />
    </div>
  );
}

function PlotInner({ spec, kind, tall, width }: { spec: ChartSpec; kind: Kind; tall?: boolean; width: number }) {
  const rows = spec.labels.map((label, i) => {
    const row: Record<string, string | number | null> = { label };
    for (const s of spec.series) row[s.name] = s.values[i] ?? null;
    return row;
  });
  const short = fmt(spec, false);
  const multi = spec.series.length > 1;
  const refs = spec.reference_lines ?? [];
  const threshold = spec.color_by_reference && refs.length ? refs[0].value : null;
  const margin = { top: 20, right: 24, left: 4, bottom: 4 };
  const tooltip = <Tooltip content={<ChartTooltip spec={spec} />} cursor={kind === "bar" ? { fill: "var(--panel-2)" } : { stroke: "var(--muted)", strokeDasharray: "3 3" }} />;
  const legend = multi ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, paddingTop: 8 }} formatter={(v) => <span style={{ color: "var(--fg)" }}>{v}</span>} /> : null;

  if (spec.type === "pie") {
    const s = spec.series[0];
    const data = spec.labels.map((name, i) => ({ name, value: s.values[i] ?? 0, fill: SERIES[i % 8] }));
    const total = data.reduce((a, d) => a + d.value, 0);
    return (
      <ResponsiveContainer width="100%" height={tall ? 520 : 300}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={1.5} stroke="var(--panel)" strokeWidth={2} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Pie>
          <text x="50%" y="47%" textAnchor="middle" fill="var(--muted)" fontSize={12}>Total</text>
          <text x="50%" y="55%" textAnchor="middle" fill="var(--fg)" fontSize={18} fontWeight={600}>{short(total)}</text>
          {tooltip}
          <Legend iconType="circle" iconSize={8} layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 13 }} formatter={(v) => <span style={{ color: "var(--fg)" }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const horizontal = kind === "bar" && (spec.horizontal || spec.labels.length > 14);
  const longest = Math.max(...spec.labels.map((l) => l.length));
  const narrow = width < 520;
  const fontSize = narrow ? 11 : 12;
  const labelWidth = Math.min(longest * (narrow ? 6.2 : 7.2) + 12, width * (narrow ? 0.42 : 0.34), 280);
  const height = tall ? 560 : horizontal ? Math.max(260, spec.labels.length * 30 + 70) : 320;
  const showLabels = kind === "bar" && !multi && spec.labels.length <= 24;

  const refLines = refs.map((r) => (
    <ReferenceLine
      key={r.label}
      {...(horizontal ? { x: r.value } : { y: r.value })}
      stroke="var(--fg)"
      strokeOpacity={0.55}
      strokeDasharray="4 4"
      label={{ value: r.label, position: horizontal ? "top" : "insideTopRight", fill: "var(--muted)", fontSize: 11 }}
      ifOverflow="extendDomain"
    />
  ));

  if (kind === "bar") {
    const radius: [number, number, number, number] = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ ...margin, left: 0, right: showLabels && horizontal ? 52 : 24 }} barCategoryGap="22%">
          <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--grid)" />
          {horizontal ? (
            <>
              <XAxis type="number" {...axis} tickFormatter={short} tickCount={narrow ? 3 : 5} />
              <YAxis type="category" dataKey="label" {...axis} tick={{ fill: "var(--muted)", fontSize }} axisLine={false} width={labelWidth} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
              <YAxis {...axis} axisLine={false} tickFormatter={short} width={68} />
            </>
          )}
          {tooltip}
          {legend}
          {spec.series.map((s, si) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              fill={SERIES[si]}
              stackId={spec.stacked ? "stack" : undefined}
              radius={spec.stacked && si < spec.series.length - 1 ? 0 : radius}
              stroke={spec.stacked ? "var(--panel)" : undefined}
              strokeWidth={spec.stacked ? 1 : 0}
              maxBarSize={44}
              isAnimationActive={false}
            >
              {threshold !== null &&
                !multi &&
                s.values.map((v, i) => <Cell key={i} fill={v !== null && v < threshold ? "var(--below)" : SERIES[si]} />)}
              {showLabels && (
                <LabelList dataKey={s.name} position={horizontal ? "right" : "top"} formatter={short as any} style={{ fill: "var(--muted)", fontSize: 11 }} />
              )}
            </Bar>
          ))}
          {refLines}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const Chart = kind === "area" ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={rows} margin={margin}>
        <defs>
          {spec.series.map((s, i) => (
            <linearGradient key={s.name} id={`fill-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[i]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SERIES[i]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
        <YAxis {...axis} axisLine={false} tickFormatter={short} width={68} />
        {tooltip}
        {legend}
        {spec.series.map((s, i) =>
          kind === "area" ? (
            <Area key={s.name} dataKey={s.name} type="monotone" stroke={SERIES[i]} strokeWidth={2} fill={`url(#fill-${i})`} stackId={spec.stacked ? "s" : undefined} isAnimationActive={false} activeDot={{ r: 5, stroke: "var(--panel)", strokeWidth: 2 }} />
          ) : (
            <Line
              key={s.name}
              dataKey={s.name}
              type="monotone"
              stroke={SERIES[i]}
              strokeWidth={2}
              dot={spec.labels.length <= 24 ? { r: 3, strokeWidth: 0, fill: SERIES[i] } : false}
              activeDot={{ r: 5, stroke: "var(--panel)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ),
        )}
        {refLines}
      </Chart>
    </ResponsiveContainer>
  );
}

/** Copy computed colours onto an SVG clone so it renders standalone (CSS variables don't survive export). */
function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  for (const prop of ["fill", "stroke", "stop-color", "opacity", "fill-opacity", "stroke-opacity", "font-size", "font-weight", "font-family"]) {
    const v = cs.getPropertyValue(prop);
    if (v) (dst as SVGElement).style.setProperty(prop, v);
  }
  for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i], dst.children[i]);
}

async function exportPng(container: HTMLElement, spec: ChartSpec) {
  const svg = [...container.querySelectorAll("svg.recharts-surface")].sort(
    (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
  )[0] as SVGSVGElement | undefined;
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  const w = svg.clientWidth;
  const h = svg.clientHeight;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  await img.decode();

  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue("--panel").trim() || "#fff";
  const fg = css.getPropertyValue("--fg").trim() || "#000";
  const muted = css.getPropertyValue("--muted").trim() || "#666";
  const scale = 2;
  const pad = 24;
  const legendH = spec.series.length > 1 && spec.type !== "pie" ? 28 : 0;
  const headH = 56;
  const canvas = document.createElement("canvas");
  canvas.width = (w + pad * 2) * scale;
  canvas.height = (h + headH + legendH + pad * 2) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.font = "600 16px Inter, system-ui, sans-serif";
  ctx.fillText(spec.title, pad, pad + 16);
  if (spec.headline) {
    ctx.fillStyle = muted;
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.fillText(`${spec.headline.label}: ${spec.headline.value}`, pad, pad + 38);
  }
  ctx.drawImage(img, pad, pad + headH, w, h);
  if (legendH) {
    let x = pad;
    const y = pad + headH + h + 18;
    ctx.font = "13px Inter, system-ui, sans-serif";
    spec.series.forEach((s, i) => {
      ctx.fillStyle = css.getPropertyValue(`--series-${i + 1}`).trim();
      ctx.beginPath();
      ctx.arc(x + 4, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.fillText(s.name, x + 14, y);
      x += ctx.measureText(s.name).width + 34;
    });
  }
  canvas.toBlob((blob) => blob && download(`${slug(spec.title)}.png`, blob), "image/png");
}

const KIND_ICONS: { kind: Kind; icon: typeof BarChart3; label: string }[] = [
  { kind: "bar", icon: BarChart3, label: "Bar" },
  { kind: "line", icon: LineIcon, label: "Line" },
  { kind: "area", icon: AreaIcon, label: "Area" },
];

function IconButton({ onClick, label, active, children }: { onClick: () => void; label: string; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-md p-1.5 transition hover:bg-panel-2 hover:text-fg ${active ? "bg-panel-2 text-fg" : "text-muted"}`}
    >
      {children}
    </button>
  );
}

export function ChartView({ spec }: { spec: ChartSpec }) {
  const [kind, setKind] = useState<Kind>(spec.type === "pie" ? "bar" : spec.type);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [full, setFull] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const table = {
    columns: ["label", ...spec.series.map((s) => s.name)],
    rows: spec.labels.map((label, i) => Object.fromEntries([["label", label], ...spec.series.map((s) => [s.name, s.values[i]])])),
    rowCount: spec.labels.length,
    truncated: false,
  };
  const cartesian = spec.type !== "pie";

  const toolbar = (inFull: boolean) => (
    <div className="flex items-center gap-0.5">
      {cartesian && view === "chart" && (
        <div className="mr-1 flex items-center gap-0.5 rounded-lg border border-line p-0.5">
          {KIND_ICONS.map(({ kind: k, icon: Icon, label }) => (
            <IconButton key={k} onClick={() => setKind(k)} label={`${label} chart`} active={kind === k}>
              <Icon className="size-4" />
            </IconButton>
          ))}
        </div>
      )}
      <IconButton onClick={() => setView(view === "chart" ? "table" : "chart")} label={view === "chart" ? "Show table" : "Show chart"} active={view === "table"}>
        <Table2 className="size-4" />
      </IconButton>
      {view === "chart" && (
        <IconButton onClick={() => exportPng((inFull ? fullRef : ref).current!, spec)} label="Download PNG">
          <Download className="size-4" />
        </IconButton>
      )}
      {inFull ? (
        <IconButton onClick={() => setFull(false)} label="Close">
          <X className="size-4" />
        </IconButton>
      ) : (
        <IconButton onClick={() => setFull(true)} label="Full screen">
          <Maximize2 className="size-4" />
        </IconButton>
      )}
    </div>
  );

  const header = (inFull: boolean) => (
    <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
      <div className="min-w-0">
        <h3 className="font-semibold leading-snug">{spec.title}</h3>
        {(spec.y_label || spec.x_label) && (
          <p className="text-xs text-muted">{[spec.y_label, spec.x_label && `by ${spec.x_label}`].filter(Boolean).join(" ")}</p>
        )}
        {spec.headline && (
          <div className="mt-2">
            <div className="text-xs uppercase tracking-wide text-muted">{spec.headline.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{spec.headline.value}</div>
          </div>
        )}
      </div>
      {toolbar(inFull)}
    </div>
  );

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
        {header(false)}
        <div className="px-2 pb-3 pt-2" ref={ref}>
          {view === "chart" ? <Plot spec={spec} kind={kind} /> : <div className="px-2"><DataTable table={table} name={spec.title} /></div>}
        </div>
      </div>
      {full && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-8" onClick={() => setFull(false)}>
          <div className="max-h-full w-full max-w-6xl overflow-auto rounded-2xl border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {header(true)}
            <div className="px-2 pb-4 pt-2" ref={fullRef}>
              {view === "chart" ? <Plot spec={spec} kind={kind} tall /> : <div className="px-2"><DataTable table={table} name={spec.title} /></div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
