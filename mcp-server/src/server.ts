import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { allowedTableSet } from "./schema.js";
import { registerCuratedTools } from "./tools/curated.js";
import { registerRunSelect } from "./tools/runSelect.js";
import { registerSchemaTools } from "./tools/schemaTools.js";

export type ToolContext = {
  /** A short, non-secret id for the API key that made the request (for logs). */
  client?: string;
};

export async function createMcpServer(ctx: ToolContext) {
  const server = new McpServer(
    { name: "mysql-data", version: "0.1.0" },
    {
      instructions:
        "Read-only access to the company MySQL database. Prefer the purpose-built tools; " +
        "use describe_schema then run_select for anything else. Never guess column names.",
    },
  );
  registerSchemaTools(server);
  registerCuratedTools(server, ctx, await allowedTableSet());
  registerRunSelect(server, ctx);
  return server;
}
