"use client";

import { AlertTriangle, Check, Copy, CornerDownRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChartSpec } from "@/lib/chartTool";
import { splitFollowups, type ToolPart, type Turn } from "@/lib/conversation";
import { ChartView } from "./ChartView";
import { DataTable } from "./DataTable";
import { Logo } from "./Logo";
import { Steps } from "./Steps";

export function UserBubble({ text, images }: { text: string; images?: { thumb: string }[] }) {
  return (
    <div className="flex flex-col items-end gap-2">
      {images && images.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
          {images.map((im, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={im.thumb} alt={`Reference image ${i + 1}`} className="h-28 max-w-56 rounded-xl border border-line object-cover shadow-sm" />
          ))}
        </div>
      )}
      {text && <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-fg px-4 py-2.5 text-bg">{text}</div>}
    </div>
  );
}

export function AssistantTurn({
  turn,
  isLast,
  onFollowup,
  onRegenerate,
  onPin,
  pinnedIds,
}: {
  turn: Turn;
  isLast: boolean;
  onFollowup: (q: string) => void;
  onRegenerate: () => void;
  onPin?: (spec: ChartSpec, chartId: string) => void;
  pinnedIds?: Set<string>;
}) {
  const [copied, setCopied] = useState(false);
  const streaming = turn.status === "streaming";
  const steps = turn.parts.filter((p): p is ToolPart => p.kind === "tool");
  const hasChart = turn.parts.some((p) => p.kind === "chart");
  const textParts = turn.parts.filter((p) => p.kind === "text");
  const lastText = textParts[textParts.length - 1];
  const { followups } = lastText ? splitFollowups(lastText.text) : { followups: [] };

  // Show the last successful query result under the answer, unless a chart already shows the data.
  const lastTable = [...steps].reverse().find((s) => s.result?.table && !s.result.isError && s.result.table.rowCount > 0);
  const showResult = !streaming && !hasChart && lastTable?.result?.table && lastTable.result.table.rowCount > 1;

  const answerText = textParts.map((p) => splitFollowups(p.text).body).join("\n\n").trim();
  const nothingYet = streaming && turn.parts.length === 0;

  return (
    <div className="group flex gap-3">
      <Logo className="mt-0.5 size-7 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        {nothingYet && (
          <div className="flex items-center gap-2 pt-1 text-sm text-muted">
            <span className="flex gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted" />
            </span>
            Thinking
          </div>
        )}
        <Steps steps={steps} running={streaming} />
        {turn.parts.map((p, i) => {
          if (p.kind === "text") {
            const body = splitFollowups(p.text).body;
            if (!body.trim()) return null;
            const caret = streaming && p === lastText && i === turn.parts.length - 1;
            return (
              <div key={i} className={`md ${caret ? "streaming" : ""}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              </div>
            );
          }
          if (p.kind === "chart")
            return (
              <ChartView
                key={p.id}
                spec={p.spec}
                pinned={pinnedIds?.has(p.id)}
                onPin={p.spec.source && onPin && !streaming ? () => onPin(p.spec, p.id) : undefined}
              />
            );
          if (p.kind === "notice")
            return (
              <p key={i} className="flex items-center gap-2 text-sm text-muted">
                <AlertTriangle className="size-4" /> {p.text}
              </p>
            );
          if (p.kind === "error")
            return (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {p.text}
              </div>
            );
          return null;
        })}
        {turn.status === "stopped" && <p className="text-sm text-muted">Stopped.</p>}
        {showResult && <DataTable table={lastTable!.result!.table!} name="result" />}

        {!streaming && (
          <div className="flex items-center gap-1 text-muted opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
            {answerText && (
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(answerText).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                }
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-panel-2 hover:text-fg"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
              </button>
            )}
            {isLast && (
              <button type="button" onClick={onRegenerate} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-panel-2 hover:text-fg">
                <RotateCcw className="size-3.5" /> Regenerate
              </button>
            )}
          </div>
        )}

        {isLast && !streaming && followups.length > 0 && (
          <div className="flex flex-col items-start gap-1.5 pt-1">
            {followups.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onFollowup(q)}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-left text-sm transition hover:border-brand hover:text-brand"
              >
                <CornerDownRight className="size-3.5 shrink-0 text-muted" />
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
