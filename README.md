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
                        │  read-only, SELECT only
                        ▼
                      MySQL
```

## Run it on your laptop

You need Node 20 or newer, network access to your MySQL, and an Anthropic API key
(https://console.anthropic.com).

**1. MCP server** (terminal 1)

```bash
cd mcp-server
npm install
cp .env.example .env      # Windows: copy .env.example .env
# edit .env: MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD, MCP_API_KEYS
npm run dev
```

It prints the tables it found and `mcp server listening`. Check it with
`curl http://localhost:8080/health`.

**2. Chat app** (terminal 2)

```bash
cd web
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
# edit .env.local: ANTHROPIC_API_KEY, and MCP_API_KEY = the same value as MCP_API_KEYS above
npm run dev
```

Open http://localhost:3000 and ask a question.

## Before you point it at real data

- **Use a read-only MySQL user.** `db/readonly-user.sql` creates one (edit the database name and password first, and prefer table-level grants). For a quick test an existing user works, because the server also runs every connection as `READ ONLY` and only allows SELECT, but production should use the read-only user.
- **Limit the tables.** Set `ALLOWED_TABLES=table1,table2` instead of `*`. Leave out tables with passwords, tokens or personal data, or expose a view without those columns.
- **Protect the chat UI.** Anyone who can open it can read the allowed data. Set `WEB_BASIC_AUTH=user:password` in `web/.env.local`, or put it behind your own login.

## MCP tools

| Tool | Purpose |
|---|---|
| `describe_schema` | Tables, columns, types, comments and foreign keys from `INFORMATION_SCHEMA` (allowed tables only). Also exposed as the resource `schema://database`. |
| `run_select` | Free-form SQL, guarded (below). |
| `find_customers`, `customer_orders`, `sales_summary`, `top_products` | Examples of curated, parameterised query tools. They only appear when tables with those names exist. |

### Safety layers

1. **Database grant**: the MySQL user only has `SELECT`.
2. **Read-only session**: every pooled connection runs `SET SESSION TRANSACTION READ ONLY` and `max_execution_time`.
3. **SQL guard** (`mcp-server/src/guard.ts`) on `run_select`:
   - one statement only, must be `SELECT` or `WITH … SELECT` (parsed with `node-sql-parser`)
   - every referenced table must be allowed; other databases and `mysql`/`information_schema`/… are blocked
   - `INTO OUTFILE`, `LOAD_FILE`, `SLEEP`, `BENCHMARK`, locking clauses, etc. are rejected
   - `LIMIT` is added when missing, and a `LIMIT` above `QUERY_ROW_LIMIT` (500) is rejected
4. **Timeouts**: `QUERY_TIMEOUT_MS` (5 s).
5. **Auth**: `Authorization: Bearer <key>` checked against `MCP_API_KEYS`.
6. **Rate limiting**: `RATE_LIMIT_MAX` requests per key per `RATE_LIMIT_WINDOW_MS`.
7. **Query log**: every query (including rejected ones) is logged as one JSON line. Set `QUERY_LOG_FILE` to also write it to a file.

## Making answers better for your data

- Add `COMMENT`s to important tables and columns. `describe_schema` passes them to the model.
- Add business terms to the system prompt in `web/lib/config.ts` (for example "an active listing means status = 'live'").
- Replace the example tools in `mcp-server/src/tools/curated.ts` with the questions your users ask most. Each entry lists the tables it needs, an input schema (zod) and a function that builds parameterised SQL. The model prefers these over `run_select`.

## Dashboard (pinned charts)

Every chart in the chat has a **Pin** button. A pinned chart becomes a widget on the
**Dashboard**, which is the home screen once something is pinned.

- **Live data, not a snapshot.** When Claude draws a chart it also records the database
  tool call behind it (`source` in `render_chart`). A widget re-runs that call through the
  MCP server every time the dashboard opens, so the read-only checks, table allowlist and
  row limit all still apply, and no Claude call is needed. Results are cached for 30 s.
- **Settings per widget:** title, chart or number tile (latest value or total, with a trend
  line), size (small, medium, wide) and refresh (on open, every 5 minutes, hourly).
- **Keep dates moving** (on by default): a widget whose query uses fixed dates slides them
  forward by the days since it was pinned, so a 6–20 Nov chart shows 7–21 Nov the next day.
  The app reads the dates from the SQL (`>= '…'`, `< '…'`, `BETWEEN`) when Claude didn't
  list them. Each widget shows the dates it ran for. Turn it off in the widget's Edit dialog.
- **Date filter:** the dashboard's range (last 7 days, this month, custom…) is applied to
  widgets whose query was written with fixed dates. Widgets with rolling windows
  (`CURDATE()`) are marked "Not date-filtered".
- **Arrange:** drag a widget by its handle, or use Move earlier / later in its menu.
- **Ask about this:** opens a new chat with the widget's query and current data attached.
- **Storage:** widgets are saved in `web/data/widgets.json` on the web server (set
  `WIDGETS_FILE` to move it). Everyone using the app sees the same dashboard. MySQL is not
  written to. Back this file up if the dashboard matters.

### Showing a widget in another app

Set `WIDGET_EMBED_SECRET` (any long random string) in `web/.env.local` and restart. Each
widget's menu then has **Copy embed code**, which copies an `<iframe>` for
`/embed/<id>?t=<token>`. The token opens only that widget, and works even when
`WEB_BASIC_AUTH` is on, so only use it on pages that are behind your own login. For a
Next.js app, copy `examples/MxWidget.tsx` and use `<MxWidget baseUrl=… id=… token=… />`.
Changing the secret invalidates every embed link.

## Reference images

Attach a screenshot of a chart (📎 button, paste, or drag it onto the chat) and ask Claude to
build the same chart from your data; sending just the image works too. Up to 4 images per
message, PNG/JPG/GIF/WebP, 5 MB each; large ones are shrunk in the browser first.

Images are uploaded once to the Anthropic Files API (`web/app/api/uploads/route.ts`) and the
chat refers to them by file id, so they aren't re-sent with every later message. They expire
after 90 days, after which that chat can't be continued (start a new one). Claude draws the
chart from real query results, never from numbers in the image, and says what it couldn't copy.

## Customising the chat UI

- Welcome-screen questions: `web/components/suggestions.ts`
- Colours (brand orange, light and dark themes, chart series): the tokens at the top of `web/app/globals.css`
- Logo: `web/components/Logo.tsx`

Chats are saved in the browser (localStorage), so each person sees only their own history.

## How the chat works

`web/app/api/chat/route.ts` streams newline-delimited JSON events (`text`, `tool_call`, `tool_result`, `chart`, `notice`, `error`, `done`). Widgets use `web/app/api/widgets/*`. By default (`MCP_MODE=local`) the Next.js server connects to the MCP server, gives its tools to Claude and runs each tool call. `MCP_MODE=connector` instead uses the Claude API's MCP connector, which needs the MCP server on a public HTTPS URL (`MCP_PUBLIC_URL`).

The model is `claude-opus-5-5` with adaptive thinking and `effort: medium` (`CLAUDE_MODEL` / `CLAUDE_EFFORT` to change). The conversation history is append-only and sent back unchanged each turn, which keeps the prompt cache warm.

## Development

```bash
cd mcp-server && npm test && npm run typecheck   # SQL guard tests
cd web && npm run typecheck && npm run build
```

To use the MCP server from another MCP client (Claude Desktop, MCP Inspector), point it at
`http://localhost:8080/mcp` with header `Authorization: Bearer <key>`.
