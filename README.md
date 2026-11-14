# MySQL MCP server + Next.js data chat

Ask questions about your MySQL data in plain English. Claude answers by calling
read-only tools on an MCP server that sits in front of your database, and the
chat UI shows each query and its result as a table.

```
Browser ──► web/ (Next.js)  ──► Claude API (claude-opus-5-5)
               │  /api/chat          │
               │                     │ tool calls
               └──── MCP (HTTP) ◄────┘
                        │
                 mcp-server/ (Node + Express, /mcp)
                        │  read-only user, SELECT only
                        ▼
                      MySQL
```

## What's inside

| Path | What it is |
|---|---|
| `db/readonly-user.sql` | Creates a SELECT-only MySQL user for **your** database. Edit and run it as an admin. |
| `db/init/` | Sample `shop` schema, seed data and read-only user for docker-compose. |
| `mcp-server/` | Node + TypeScript MCP server (`@modelcontextprotocol/sdk`, `mysql2`, `zod`), served over Streamable HTTP on `/mcp`. |
| `web/` | Next.js (app router) chat. `app/api/chat/route.ts` calls Claude with the MCP tools and streams the reply. |
| `docker-compose.yml` | MySQL + MCP server + web, wired together. |

### MCP tools

| Tool | Purpose |
|---|---|
| `describe_schema` | Tables, columns, types and foreign keys from `INFORMATION_SCHEMA` (allowlisted tables only). Also exposed as the resource `schema://database`. |
| `find_customers`, `customer_orders`, `sales_summary`, `top_products` | Curated, parameterised example queries for the sample schema. See "Adapting to your database". |
| `run_select` | Free-form SQL, guarded (below). |

### Safety layers

1. **Database grant**: the MySQL user only has `SELECT` (on chosen tables, ideally).
2. **Read-only session**: every pooled connection runs `SET SESSION TRANSACTION READ ONLY` and `max_execution_time`.
3. **SQL guard** (`mcp-server/src/guard.ts`) on `run_select`:
   - one statement only, must be `SELECT` or `WITH … SELECT` (parsed with `node-sql-parser`)
   - every referenced table must be in the allowlist; other databases and `mysql`/`information_schema`/… are blocked
   - `INTO OUTFILE`, `LOAD_FILE`, `SLEEP`, `BENCHMARK`, locking clauses, etc. are rejected
   - `LIMIT` is added when missing, and a `LIMIT` above `QUERY_ROW_LIMIT` (500) is rejected
4. **Timeouts**: `QUERY_TIMEOUT_MS` (5 s) server-side via `max_execution_time`, plus a client timeout.
5. **Auth**: `Authorization: Bearer <key>` checked against `MCP_API_KEYS` (constant-time compare).
6. **Rate limiting**: `RATE_LIMIT_MAX` requests per key per `RATE_LIMIT_WINDOW_MS`.
7. **Query log**: every query (including rejected ones) is logged as one JSON line with the tool, SQL, params, row count, duration and a short fingerprint of the API key. Set `QUERY_LOG_FILE` to also write to a file.

## Quick start (Docker, sample data)

```bash
cp .env.example .env        # set ANTHROPIC_API_KEY and a random MCP_API_KEY
docker compose up --build
```

Open http://localhost:3000 and try "What was our revenue by month this year?".

## Running against your own database

1. **Create the read-only user.** Edit `db/readonly-user.sql` (database name, user, password; prefer table-level grants) and run it as an admin:
   ```bash
   mysql -h <host> -u root -p < db/readonly-user.sql
   ```
2. **Start the MCP server.**
   ```bash
   cd mcp-server
   npm install
   MYSQL_HOST=... MYSQL_DATABASE=... MYSQL_USER=mcp_reader MYSQL_PASSWORD=... \
   MCP_API_KEYS=$(openssl rand -hex 32) ALLOWED_TABLES=customers,orders \
   npm run dev
   ```
   It logs the tables it found on startup. Check `curl localhost:8080/health`.
3. **Start the web app.**
   ```bash
   cd web
   npm install
   cat > .env.local <<EOF
   ANTHROPIC_API_KEY=sk-ant-...
   MCP_SERVER_URL=http://localhost:8080/mcp
   MCP_API_KEY=<one of MCP_API_KEYS>
   EOF
   npm run dev
   ```

### Adapting to your database

- `ALLOWED_TABLES` decides what the model can see and query. Start small. For sensitive columns, create a view without them, grant SELECT on the view, and allowlist the view instead of the table.
- Curated tools live in `mcp-server/src/tools/curated.ts`. Each entry lists the tables it needs, an input schema (zod) and a function that builds parameterised SQL. A tool is only registered when all its tables exist and are allowlisted, so the shop examples disappear on another database. Replace them with the 3 to 10 questions your users ask most; the model prefers them over `run_select`.
- Add `COMMENT`s to your tables and columns. `describe_schema` passes them to the model and they noticeably improve its SQL.
- The system prompt is in `web/lib/config.ts`. Add business vocabulary there (for example "active customer means an order in the last 90 days").

## How the chat works (`web/`)

`MCP_MODE` picks how Claude reaches the MCP server:

- **`local` (default)**: the Next.js server connects to the MCP server as an MCP client, lists its tools, passes them to Claude as tools, and runs each tool call. Works when the MCP server is private (localhost, docker network, VPC).
- **`connector`**: uses the Claude API's MCP connector (`mcp_servers` + `mcp_toolset`, beta `mcp-client-2025-11-20`). Anthropic's servers call your MCP server directly, so it must be reachable over public HTTPS: set `MCP_PUBLIC_URL=https://your-host/mcp`, and put it behind TLS (a reverse proxy, or a tunnel while testing). Also set `ALLOWED_HOSTS` on the MCP server.

Either way, `/api/chat` streams newline-delimited JSON events (`text`, `tool_call`, `tool_result`, `notice`, `error`, `done`) and the page renders tool results as tables with a CSV download.

Details worth knowing:

- Model `claude-opus-5-5` with adaptive thinking and `effort: medium` (set `CLAUDE_MODEL` / `CLAUDE_EFFORT` to change). Server-side fallback (`fallbacks: "default"`) is on, so a policy refusal is retried on a fallback model instead of failing.
- The conversation is append-only: the server returns the full message history (including thinking blocks) in the `done` event and the browser sends it back unchanged. The system prompt and tool list never change mid-conversation. That keeps the prompt cache warm and keeps earlier thinking blocks valid.
- Set `WEB_BASIC_AUTH=user:password` to put the UI behind basic auth. Anyone who can use the chat can read the allowlisted data, so protect it before exposing it.

## Development

```bash
cd mcp-server && npm test        # SQL guard unit tests
cd mcp-server && npm run typecheck
cd web && npm run typecheck && npm run build
node scripts/generate-seed.mjs > db/init/02-seed.sql   # regenerate sample data
```

To try the MCP server from another MCP client (for example Claude Desktop or the MCP Inspector), point it at `http://localhost:8080/mcp` with header `Authorization: Bearer <key>`.
