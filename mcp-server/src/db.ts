import mysql, { type FieldPacket, type RowDataPacket } from "mysql2/promise";
import { config } from "./config.js";
import { logQuery } from "./logger.js";

export const pool = mysql.createPool({
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,
  database: config.MYSQL_DATABASE,
  connectionLimit: config.MYSQL_POOL_SIZE,
  waitForConnections: true,
  dateStrings: true, // return DATE/DATETIME as strings so JSON is stable
  supportBigNumbers: true,
  bigNumberStrings: false, // COUNT(*) etc. come back as numbers when they fit
  decimalNumbers: true,
});

// Defence in depth on top of the SELECT-only grant: every pooled connection is
// read-only and has a server-side execution time cap for SELECT statements.
pool.on("connection", (conn) => {
  conn.query(`SET SESSION TRANSACTION READ ONLY`);
  conn.query(`SET SESSION max_execution_time = ${Number(config.QUERY_TIMEOUT_MS)}`);
});

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
};

/**
 * Run a parameterised read query, log it, and cap rows at QUERY_ROW_LIMIT.
 * Every tool goes through here so logging and limits are applied in one place.
 */
export async function runQuery(
  tool: string,
  sql: string,
  params: unknown[] = [],
  client?: string,
): Promise<QueryResult> {
  const started = Date.now();
  try {
    const [rows, fields] = (await pool.query({ sql, values: params, timeout: config.QUERY_TIMEOUT_MS + 1000 })) as [
      RowDataPacket[],
      FieldPacket[],
    ];
    const limit = config.QUERY_ROW_LIMIT;
    const truncated = rows.length > limit;
    const out = truncated ? rows.slice(0, limit) : rows;
    const result: QueryResult = {
      columns: (fields ?? []).map((f) => f.name),
      rows: out.map((r) => ({ ...r })),
      rowCount: out.length,
      truncated,
    };
    logQuery({ tool, client, sql, params, rowCount: result.rowCount, truncated, durationMs: Date.now() - started });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logQuery({ tool, client, sql, params, durationMs: Date.now() - started, error: message });
    throw err;
  }
}
