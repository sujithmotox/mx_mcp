"use client";

import { AlertCircle, Check, ChevronRight, Database, Loader2, Table2, Wrench } from "lucide-react";
import { useState } from "react";
import type { ToolPart } from "@/lib/conversation";
import { DataTable } from "./DataTable";
import { SqlBlock } from "./SqlBlock";

const describe = (p: ToolPart) => {
  if (p.name === "describe_schema") return "Looked up the table structure";
  if (p.name === "run_select") return "Ran a query";
  return `Used ${p.name.replace(/_/g, " ")}`;
};

function StepIcon({ p }: { p: ToolPart }) {
  if (!p.result) return <Loader2 className="size-3.5 animate-spin text-brand" />;
  if (p.result.isError) return <AlertCircle className="size-3.5 text-danger" />;
  if (p.name === "describe_schema") return <Table2 className="size-3.5 text-muted" />;
  if (p.name === "run_select") return <Database className="size-3.5 text-muted" />;
  return <Wrench className="size-3.5 text-muted" />;
}

function Step({ p }: { p: ToolPart }) {
  const [open, setOpen] = useState(false);
  const input = p.input as Record<string, unknown> | null;
  const sql = input && typeof input.sql === "string" ? input.sql : null;
  const rows = p.result?.table?.rowCount;
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-panel-2"
      >
        <StepIcon p={p} />
        <span className="truncate">{describe(p)}</span>
        {rows !== undefined && <span className="shrink-0 text-xs text-muted">· {rows} row{rows === 1 ? "" : "s"}</span>}
        {p.result?.isError && <span className="shrink-0 text-xs text-danger">· failed, retried</span>}
        <ChevronRight className={`ml-auto size-3.5 shrink-0 text-muted transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="mb-2 ml-6 mt-1 space-y-2">
          {sql ? (
            <SqlBlock sql={sql} />
          ) : (
            input && Object.keys(input).length > 0 && (
              <pre className="rounded-lg border border-line bg-code px-3 py-2 font-mono text-xs">{JSON.stringify(input, null, 2)}</pre>
            )
          )}
          {p.result?.table ? (
            <DataTable table={p.result.table} name={p.name} />
          ) : p.result ? (
            <pre className={`scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-code px-3 py-2 font-mono text-xs ${p.result.isError ? "text-danger" : "text-muted"}`}>
              {p.result.text}
            </pre>
          ) : null}
        </div>
      )}
    </li>
  );
}

export function Steps({ steps, running }: { steps: ToolPart[]; running: boolean }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const queries = steps.filter((s) => s.name !== "describe_schema").length;
  const pending = steps.some((s) => !s.result);
  const label = pending && running
    ? `Working… ${steps.length} step${steps.length === 1 ? "" : "s"}`
    : queries
      ? `Ran ${queries} quer${queries === 1 ? "y" : "ies"}`
      : "Checked the table structure";
  return (
    <div className="rounded-xl border border-line bg-panel">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted hover:text-fg">
        {pending && running ? <Loader2 className="size-4 animate-spin text-brand" /> : <Check className="size-4 text-brand" />}
        <span>{label}</span>
        <ChevronRight className={`ml-auto size-4 transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <ol className="space-y-0.5 border-t border-line px-1.5 py-1.5">
          {steps.map((s) => (
            <Step key={s.id} p={s} />
          ))}
        </ol>
      )}
    </div>
  );
}
