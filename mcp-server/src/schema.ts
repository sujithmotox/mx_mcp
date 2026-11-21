import { config } from "./config.js";
import { runQuery } from "./db.js";

export type Column = { name: string; type: string; nullable: boolean; key: string; comment: string };
export type Table = {
  name: string;
  comment: string;
  approxRows: number | null;
  columns: Column[];
  foreignKeys: { column: string; references: string }[];
};

let cache: { at: number; tables: Table[] } | null = null;
const TTL_MS = 5 * 60_000;

/** Tables the server may expose: everything in the DB, filtered by ALLOWED_TABLES. */
export async function loadSchema(force = false): Promise<Table[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.tables;
  const db = config.MYSQL_DATABASE;

  const [tables, columns, fks] = await Promise.all([
    runQuery(
      "schema",
      `SELECT TABLE_NAME AS name, TABLE_COMMENT AS comment, TABLE_ROWS AS approxRows
         FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE IN ('BASE TABLE','VIEW')
        ORDER BY TABLE_NAME`,
      [db],
    ),
    runQuery(
      "schema",
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
              COLUMN_KEY AS \`key\`, COLUMN_COMMENT AS comment
         FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [db],
    ),
    runQuery(
      "schema",
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS refTable,
              REFERENCED_COLUMN_NAME AS refCol
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [db],
    ),
  ]);

  const allowed = (t: string) => config.allowAllTables || config.allowedTables.includes(t.toLowerCase());
  const out: Table[] = tables.rows
    .filter((t) => allowed(String(t.name)))
    .map((t) => ({
      name: String(t.name),
      comment: String(t.comment ?? ""),
      approxRows: t.approxRows == null ? null : Number(t.approxRows),
      columns: columns.rows
        .filter((c) => c.tableName === t.name)
        .map((c) => ({
          name: String(c.name),
          type: String(c.type),
          nullable: c.nullable === "YES",
          key: String(c.key ?? ""),
          comment: String(c.comment ?? ""),
        })),
      foreignKeys: fks.rows
        .filter((f) => f.tableName === t.name && allowed(String(f.refTable)))
        .map((f) => ({ column: String(f.col), references: `${f.refTable}.${f.refCol}` })),
    }));

  cache = { at: Date.now(), tables: out };
  return out;
}

/** Lower-cased names of the tables run_select may read. */
export async function allowedTableSet(): Promise<Set<string>> {
  return new Set((await loadSchema()).map((t) => t.name.toLowerCase()));
}

/** Compact text form, cheap for the model to read. */
export function schemaToText(tables: Table[]): string {
  return tables
    .map((t) => {
      const head = `TABLE ${t.name}${t.approxRows ? ` (~${t.approxRows} rows)` : ""}${t.comment ? ` -- ${t.comment}` : ""}`;
      const cols = t.columns.map(
        (c) =>
          `  ${c.name} ${c.type}${c.nullable ? "" : " NOT NULL"}${c.key === "PRI" ? " PRIMARY KEY" : ""}${c.comment ? ` -- ${c.comment}` : ""}`,
      );
      const fks = t.foreignKeys.map((f) => `  FK ${f.column} -> ${f.references}`);
      return [head, ...cols, ...fks].join("\n");
    })
    .join("\n\n");
}
