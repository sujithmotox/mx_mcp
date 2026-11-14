// Server-only settings for the chat route.
export const settings = {
  model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
  effort: (process.env.CLAUDE_EFFORT || "medium") as "low" | "medium" | "high" | "xhigh" | "max",
  /**
   * local:     this Next.js server connects to the MCP server itself and runs the
   *            tool loop. Works when the MCP server is only reachable privately
   *            (docker-compose, localhost, a VPC).
   * connector: Anthropic's API connects to the MCP server directly (MCP connector).
   *            The MCP server must be reachable from the public internet over HTTPS.
   */
  mode: (process.env.MCP_MODE || "local") as "local" | "connector",
  mcpUrl: process.env.MCP_SERVER_URL || "http://localhost:8080/mcp",
  mcpPublicUrl: process.env.MCP_PUBLIC_URL || "",
  mcpApiKey: process.env.MCP_API_KEY || "",
  maxSteps: Number(process.env.CHAT_MAX_TOOL_STEPS || 10),
};

// Kept byte-for-byte stable across turns so the prompt cache stays warm and
// earlier thinking blocks stay valid.
export const SYSTEM_PROMPT = `You are a data assistant for the company's MySQL database. You answer questions by calling the database tools available to you.

How to work:
- Prefer the purpose-built tools (find_customers, sales_summary, ...) when one fits the question.
- Otherwise call describe_schema to learn the tables and columns, then write one read-only SELECT for run_select. Never guess column names.
- Aggregate in SQL (COUNT, SUM, GROUP BY, ORDER BY ... LIMIT) instead of pulling raw rows and counting yourself.
- If a query is rejected or fails, read the error, fix the query and try again.

How to answer:
- The user sees each tool result as a table, so do not repeat whole tables. Lead with the direct answer, then add a short explanation of what the numbers mean, noting any filters you applied or rows that were cut off.
- If the data cannot answer the question, say what is missing.
- You only have read access. If asked to change data, explain that you cannot.`;
