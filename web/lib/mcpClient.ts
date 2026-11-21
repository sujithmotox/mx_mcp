import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { settings } from "./config";

/** Connect to the MCP server as a client (used in MCP_MODE=local). */
export async function connectMcp() {
  const client = new Client({ name: "mysql-mcp-web", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(settings.mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${settings.mcpApiKey}` } },
  });
  await client.connect(transport);
  return client;
}
