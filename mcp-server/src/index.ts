import { createHash, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { log } from "./logger.js";
import { loadSchema } from "./schema.js";
import { createMcpServer } from "./server.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// --- DNS-rebinding protection (optional) -----------------------------------
if (config.allowedHosts.length) {
  app.use((req, res, next) => {
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (!config.allowedHosts.includes(host)) return void res.status(403).json({ error: "Host not allowed" });
    next();
  });
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// --- Bearer API key auth ----------------------------------------------------
const keyDigests = config.apiKeys.map((k) => createHash("sha256").update(k).digest());

function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const digest = createHash("sha256").update(token).digest();
  const ok = token && keyDigests.some((d) => timingSafeEqual(d, digest));
  if (!ok) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="mcp"');
    return void res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
  }
  // Log a short fingerprint of the key, never the key itself.
  res.locals.client = digest.toString("hex").slice(0, 8);
  next();
}

// --- Rate limiting, per API key --------------------------------------------
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  limit: config.RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (_req, res) => String(res.locals.client),
  message: { jsonrpc: "2.0", error: { code: -32029, message: "Too many requests" }, id: null },
});

// --- MCP over Streamable HTTP (stateless: a fresh server per request) -------
app.post("/mcp", auth, limiter, async (req, res) => {
  try {
    const server = await createMcpServer({ client: res.locals.client });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    log("mcp request failed", { error: (err as Error).message });
    if (!res.headersSent)
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
});

// Stateless mode has no server-initiated streams or sessions.
const notAllowed = (_req: Request, res: Response) =>
  void res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
app.get("/mcp", notAllowed);
app.delete("/mcp", notAllowed);

async function main() {
  const tables = await loadSchema(true);
  log("schema loaded", { database: config.MYSQL_DATABASE, tables: tables.map((t) => t.name) });
  app.listen(config.PORT, config.HOST, () => log("mcp server listening", { url: `http://${config.HOST}:${config.PORT}/mcp` }));
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
