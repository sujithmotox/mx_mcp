import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadSchema, schemaToText } from "../schema.js";

export function registerSchemaTools(server: McpServer) {
  // As a resource: clients that support resources can attach the schema as context.
  server.registerResource(
    "database-schema",
    "schema://database",
    {
      title: "Database schema",
      description: "Tables, columns and foreign keys the assistant is allowed to query.",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/plain", text: schemaToText(await loadSchema()) }],
    }),
  );

  // As a tool: the model can call it on demand (most chat clients only use tools).
  server.registerTool(
    "describe_schema",
    {
      title: "Describe schema",
      description:
        "List the tables you can query, with columns, types and foreign keys. Call this before writing SQL for run_select. " +
        "Pass `tables` to only describe some of them.",
      inputSchema: {
        tables: z.array(z.string()).optional().describe("Optional table names to describe. Omit for all tables."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ tables }) => {
      let all = await loadSchema();
      if (tables?.length) {
        const want = new Set(tables.map((t) => t.toLowerCase()));
        all = all.filter((t) => want.has(t.name.toLowerCase()));
      }
      const text = all.length ? schemaToText(all) : "No matching tables are available.";
      return { content: [{ type: "text", text }] };
    },
  );
}
