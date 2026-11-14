"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/chartTool";
import { ResultTable } from "./ResultTable";

// Categorical slots in fixed order; light/dark steps are defined in globals.css.
const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

const compact = (n: number, inr: boolean) => {
  if (inr) {
    const a = Math.abs(n);
    if (a >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
    if (a >= 1e5) return `₹${+(n / 1e5).toFixed(2)} L`;
    return `₹${n.toLocaleString("en-IN")}`;
  }
  return Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
};

function formatter(spec: ChartSpec, full: boolean) {
  return (v: unknown) => {
    if (typeof v !== "number") return String(v ?? "–");
    if (spec.value_format === "percent") return `${+v.toFixed(1)}%`;
    if (full) return spec.value_format === "inr" ? `₹${v.toLocaleString("en-IN")}` : v.toLocaleString("en-IN");
    return compact(v, spec.value_format === "inr");
  };
}

const axisProps = {
  stroke: "var(--border)",
  tick: { fill: "var(--muted)", fontSize: 12 },
  tickLine: false,
};

const tooltipProps = {
  contentStyle: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 13,
  },
  labelStyle: { color: "var(--text)", fontWeight: 600 },
  itemStyle: { color: "var(--text)" },
};

export function ChartView({ spec }: { spec: ChartSpec }) {
  const [showTable, setShowTable] = useState(false);
  const rows = spec.labels.map((label, i) => {
    const row: Record<string, string | number | null> = { label };
    for (const s of spec.series) row[s.name] = s.values[i] ?? null;
    return row;
  });
  const fmtAxis = formatter(spec, false);
  const fmtFull = formatter(spec, true);
  const multi = spec.series.length > 1;
  const horizontal = spec.type === "bar" && (spec.horizontal || spec.labels.length > 14);
  const height = horizontal ? Math.max(260, spec.labels.length * 28 + 60) : 320;
  const longestLabel = Math.max(...spec.labels.map((l) => l.length));

  let chart: React.ReactElement;
  if (spec.type === "pie") {
    const s = spec.series[0];
    const data = spec.labels.map((label, i) => ({ name: label, value: s.values[i] ?? 0 }));
    chart = (
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" stroke="var(--panel)" strokeWidth={2} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={SERIES[i % SERIES.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipProps} formatter={fmtFull} />
        <Legend wrapperStyle={{ fontSize: 13, color: "var(--text)" }} />
      </PieChart>
    );
  } else if (spec.type === "line") {
    chart = (
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} tickFormatter={fmtAxis} width={72} />
        <Tooltip {...tooltipProps} formatter={fmtFull} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} />
        {multi && <Legend wrapperStyle={{ fontSize: 13 }} />}
        {spec.series.map((s, i) => (
          <Line
            key={s.name}
            dataKey={s.name}
            stroke={SERIES[i]}
            strokeWidth={2}
            dot={spec.labels.length <= 24 ? { r: 3, strokeWidth: 0, fill: SERIES[i] } : false}
            activeDot={{ r: 5, stroke: "var(--panel)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  } else {
    const radius: [number, number, number, number] = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
    chart = (
      <BarChart
        data={rows}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
        barCategoryGap="20%"
      >
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--grid)" />
        {horizontal ? (
          <>
            <XAxis type="number" {...axisProps} tickFormatter={fmtAxis} />
            <YAxis type="category" dataKey="label" {...axisProps} width={Math.min(220, longestLabel * 7 + 16)} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} axisLine={false} tickFormatter={fmtAxis} width={72} />
          </>
        )}
        <Tooltip {...tooltipProps} formatter={fmtFull} cursor={{ fill: "var(--hover)" }} />
        {multi && <Legend wrapperStyle={{ fontSize: 13 }} />}
        {spec.series.map((s, i) => (
          <Bar
            key={s.name}
            dataKey={s.name}
            fill={SERIES[i]}
            stackId={spec.stacked ? "stack" : undefined}
            radius={spec.stacked && i < spec.series.length - 1 ? 0 : radius}
            stroke="var(--panel)"
            strokeWidth={spec.stacked ? 1 : 0}
            maxBarSize={48}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    );
  }

  const table = {
    columns: ["label", ...spec.series.map((s) => s.name)],
    rows,
    rowCount: rows.length,
    truncated: false,
  };

  return (
    <div className="tool chart">
      <div className="chart-head">
        <div>
          <div className="chart-title">{spec.title}</div>
          {(spec.y_label || spec.x_label) && (
            <div className="chart-sub">{[spec.y_label, spec.x_label && `by ${spec.x_label}`].filter(Boolean).join(" ")}</div>
          )}
        </div>
        <button type="button" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? (
        <ResultTable table={table} name={spec.title.replace(/[^\w]+/g, "_").toLowerCase()} />
      ) : (
        <div className="chart-body" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
