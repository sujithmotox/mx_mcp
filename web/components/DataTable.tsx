"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { TableData } from "@/lib/events";
import { download, formatCell, slug, toCsv } from "@/lib/format";

const PAGE = 20;

export function DataTable({ table, name, bare }: { table: TableData; name: string; bare?: boolean }) {
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const numeric = useMemo(() => {
    const set = new Set<string>();
    for (const c of table.columns) {
      const vals = table.rows.map((r) => r[c]).filter((v) => v !== null && v !== undefined);
      if (vals.length && vals.every((v) => typeof v === "number")) set.add(c);
    }
    return set;
  }, [table]);

  const rows = useMemo(() => {
    let rs = table.rows;
    const q = query.trim().toLowerCase();
    if (q) rs = rs.filter((r) => table.columns.some((c) => String(r[c] ?? "").toLowerCase().includes(q)));
    if (sort) {
      rs = [...rs].sort((a, b) => {
        const x = a[sort.col];
        const y = b[sort.col];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
      });
    }
    return rs;
  }, [table, query, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, current * PAGE + PAGE);

  if (table.rowCount === 0) return <p className="px-4 py-3 text-sm text-muted">The query returned no rows.</p>;

  const toggleSort = (col: string) =>
    setSort((s) => (s?.col !== col ? { col, dir: numeric.has(col) ? -1 : 1 } : s.dir === 1 ? { col, dir: -1 } : null));

  return (
    <div className={bare ? "" : "overflow-hidden rounded-xl border border-line bg-panel"}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-xs text-muted">
          {rows.length === table.rowCount ? `${table.rowCount} rows` : `${rows.length} of ${table.rowCount} rows`}
          {table.truncated && " · first 500 only"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {table.rowCount > 8 && (
            <label className="flex items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1 text-sm">
              <Search className="size-3.5 text-muted" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Filter"
                className="w-28 bg-transparent outline-none placeholder:text-muted sm:w-36"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => download(`${slug(name)}.csv`, new Blob([toCsv(table.columns, rows)], { type: "text/csv" }))}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-fg"
          >
            <Download className="size-3.5" /> CSV
          </button>
        </div>
      </div>
      <div className="scrollbar-thin max-h-[440px] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-panel-2">
            <tr>
              {table.columns.map((c) => (
                <th
                  key={c}
                  onClick={() => toggleSort(c)}
                  className={`cursor-pointer select-none whitespace-nowrap border-b border-line px-3 py-2 font-medium text-muted hover:text-fg ${numeric.has(c) ? "text-right" : "text-left"}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.replace(/_/g, " ")}
                    {sort?.col === c && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-panel-2/60">
                {table.columns.map((c) => (
                  <td
                    key={c}
                    className={`whitespace-nowrap px-3 py-2 ${numeric.has(c) ? "text-right tabular-nums" : ""} ${row[c] === null || row[c] === undefined ? "text-muted" : ""}`}
                  >
                    {formatCell(c, row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-1.5 text-xs text-muted">
          <span>
            Page {current + 1} of {pages}
          </span>
          <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded p-1 hover:bg-panel-2 disabled:opacity-40" aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded p-1 hover:bg-panel-2 disabled:opacity-40" aria-label="Next page">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
