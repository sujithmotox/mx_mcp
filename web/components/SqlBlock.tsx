"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const KEYWORDS =
  "select|from|where|and|or|not|in|is|null|as|on|join|left|right|inner|outer|cross|group|by|order|having|limit|offset|union|all|distinct|case|when|then|else|end|with|asc|desc|between|like|exists|interval|over|partition";
const FUNCS = "count|sum|avg|min|max|round|coalesce|date|date_format|date_add|date_sub|now|curdate|year|month|day|concat|ifnull|nullif|cast|lower|upper|datediff|timestampdiff|week|quarter|greatest|least|abs";

const TOKEN = new RegExp(
  `('(?:[^'\\\\]|\\\\.)*')|(\\b\\d+(?:\\.\\d+)?\\b)|\\b(${FUNCS})(?=\\s*\\()|\\b(${KEYWORDS})\\b`,
  "gi",
);

function highlight(sql: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of sql.matchAll(TOKEN)) {
    if (m.index! > last) out.push(sql.slice(last, m.index));
    const cls = m[1] ? "sql-str" : m[2] ? "sql-num" : m[3] ? "sql-fn" : "sql-kw";
    out.push(
      <span key={i++} className={cls}>
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  out.push(sql.slice(last));
  return out;
}

/** Light formatting: put major clauses on their own lines. */
function pretty(sql: string) {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|RIGHT JOIN|INNER JOIN|JOIN|UNION ALL|UNION)\b/gi, "\n$1")
    .trim();
}

export function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  const text = pretty(sql);
  return (
    <div className="group relative rounded-lg border border-line bg-code">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(sql).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted opacity-0 transition group-hover:opacity-100 focus:opacity-100"
        aria-label="Copy SQL"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="scrollbar-thin overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">
        {highlight(text)}
      </pre>
    </div>
  );
}
