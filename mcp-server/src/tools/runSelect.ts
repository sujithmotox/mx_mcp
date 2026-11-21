import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { runQuery } from "../db.js";
import { GuardError, guardSelect } from "../guard.js";
import { logQuery } from "../logger.js";
import { allowedTableSet } from "../schema.js";
import { errorResult, tableResult } from "./result.js";
import type { ToolContext } from "../server.js";

export function registerRunSelect(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "run_select",
    {
      title: "Run a read-only SQL query",
      description:
        `Run one read-only MySQL SELECT (or WITH ... SELECT) against the allowed tables and get rows back. ` +
        `Prefer the purpose-built tools when one fits. Results are capped at ${config.QUERY_ROW_LIMIT} rows and ` +
        `${config.QUERY_TIMEOUT_MS} ms; aggregate in SQL (COUNT, SUM, GROUP BY) instead of fetching raw rows. ` +
        `Call describe_schema first if you are unsure of table or column names.`,
      inputSchema: {
        sql: z.string().min(1).max(10_000).describe("A single MySQL SELECT statement."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ sql }) => {
      let guarded;
      try {
        guarded = guardSelect(sql, {
          allowedTables: await allowedTableSet(),
          allowAll: false, // always check against the discovered (already filtered) table list
          database: config.MYSQL_DATABASE,
          rowLimit: config.QUERY_ROW_LIMIT,
        });
      } catch (err) {
        if (err instanceof GuardError) {
          logQuery({ tool: "run_select", client: ctx.client, sql, rejected: err.message });
          return errorResult(`Query rejected: ${err.message}`);
        }
        throw err;
      }
      try {
        const result = await runQuery("run_select", guarded.sql, [], ctx.client);
        return tableResult(
          result,
          result.truncated ? `Only the first ${config.QUERY_ROW_LIMIT} rows are shown. Aggregate or filter to see the rest.` : undefined,
        );
      } catch (err) {
        const e = err as { code?: string; message?: string };
        if (e.code === "ER_QUERY_TIMEOUT" || /maximum statement execution time/i.test(e.message ?? ""))
          return errorResult(`Query took longer than ${config.QUERY_TIMEOUT_MS} ms. Add filters or aggregate.`);
        const hint = /Duplicate column name/i.test(e.message ?? "") ? " Give each selected column a unique alias." : "";
        return errorResult(`MySQL error: ${e.message ?? String(err)}.${hint}`);
      }
    },
  );
}
