"use client";

import type { TableData } from "@/lib/events";

const fmt = (v: unknown) => (v === null || v === undefined ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));

function toCsv(t: TableData) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns.map(esc).join(","), ...t.rows.map((r) => t.columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export function ResultTable({ table, name }: { table: TableData; name: string }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(table)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  if (table.rowCount === 0) return <div className="table-foot">No rows.</div>;
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {table.columns.map((c) => (
                  <td key={c} className={typeof row[c] === "number" ? "num" : undefined}>{fmt(row[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span>
          {table.rowCount} row{table.rowCount === 1 ? "" : "s"}
          {table.truncated ? " (truncated)" : ""}
        </span>
        <button type="button" onClick={download}>Download CSV</button>
      </div>
    </>
  );
}
