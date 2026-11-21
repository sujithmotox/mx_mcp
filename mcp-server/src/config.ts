import { z } from "zod";

const csv = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const Env = z.object({
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default("0.0.0.0"),

  MYSQL_HOST: z.string().default("localhost"),
  MYSQL_PORT: z.coerce.number().int().default(3306),
  MYSQL_DATABASE: z.string().min(1, "MYSQL_DATABASE is required"),
  MYSQL_USER: z.string().min(1, "MYSQL_USER is required"),
  MYSQL_PASSWORD: z.string().default(""),
  MYSQL_POOL_SIZE: z.coerce.number().int().positive().default(5),

  // Comma-separated bearer keys clients must send. At least one is required.
  MCP_API_KEYS: z.string().min(1, "MCP_API_KEYS is required (comma-separated)"),
  // Comma-separated table names, or "*" for every table in MYSQL_DATABASE.
  ALLOWED_TABLES: z.string().default("*"),

  QUERY_ROW_LIMIT: z.coerce.number().int().positive().default(500),
  QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),

  // Optional: also append every query log line to this file.
  QUERY_LOG_FILE: z.string().optional(),
  // Hostnames accepted in the Host header (DNS-rebinding protection). Empty = any.
  ALLOWED_HOSTS: z.string().default(""),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  ...env,
  apiKeys: csv(env.MCP_API_KEYS),
  allowAllTables: env.ALLOWED_TABLES.trim() === "*",
  allowedTables: csv(env.ALLOWED_TABLES).map((t) => t.toLowerCase()),
  allowedHosts: csv(env.ALLOWED_HOSTS),
};

export type Config = typeof config;
