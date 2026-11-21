import sqlParser from "node-sql-parser";

const { Parser } = sqlParser;
const parser = new Parser();
const opt = { database: "MySQL" };

export class GuardError extends Error {}

export type GuardOptions = {
  /** Lower-cased table names the query may read. Ignored when allowAll is true. */
  allowedTables: Set<string>;
  allowAll: boolean;
  /** The only database (schema) a query may reference. */
  database: string;
  /** Maximum rows a query may return. */
  rowLimit: number;
};

// Functions and clauses that have no place in a read-only reporting query.
const FORBIDDEN =
  /\b(into\s+(outfile|dumpfile)|load_file|sleep|benchmark|get_lock|release_lock|is_free_lock|for\s+update|for\s+share|lock\s+in\s+share\s+mode)\b/i;

const SYSTEM_SCHEMAS = new Set(["information_schema", "mysql", "performance_schema", "sys"]);

function stripComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(--\s|#)[^\n]*/g, " ")
    .trim();
}

function cteNames(ast: any): string[] {
  const names: string[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node.with)) {
      for (const w of node.with) {
        const n = typeof w.name === "string" ? w.name : w.name?.value;
        if (n) names.push(String(n).toLowerCase());
      }
    }
    for (const v of Object.values(node)) if (v && typeof v === "object") walk(v);
  };
  walk(ast);
  return names;
}

/** Returns the row count of a top-level LIMIT clause, or null when there is none. */
function limitCount(ast: any): number | null | "invalid" {
  const lim = ast?.limit;
  if (!lim || !Array.isArray(lim.value) || lim.value.length === 0) return null;
  // MySQL: "LIMIT count", "LIMIT offset, count", "LIMIT count OFFSET offset"
  const node = lim.value.length === 2 && lim.seperator === "," ? lim.value[1] : lim.value[0];
  return node?.type === "number" ? Number(node.value) : "invalid";
}

/**
 * Validate a model-written query and return the SQL to execute.
 * Throws GuardError with a message meant to be shown back to the model.
 */
export function guardSelect(input: string, o: GuardOptions): { sql: string; tables: string[] } {
  let sql = stripComments(input).replace(/;\s*$/, "").trim();
  if (!sql) throw new GuardError("Query is empty.");
  if (sql.includes(";")) throw new GuardError("Only a single statement is allowed (remove ';').");
  if (!/^(select|with)\b/i.test(sql)) throw new GuardError("Only SELECT (or WITH ... SELECT) queries are allowed.");
  if (FORBIDDEN.test(sql)) throw new GuardError("Query uses a function or clause that is not allowed.");

  let ast: any;
  try {
    ast = parser.astify(sql, opt);
  } catch (err) {
    throw new GuardError(
      `Could not parse the query (${(err as Error).message.slice(0, 160)}). Try a simpler SELECT.`,
    );
  }
  if (Array.isArray(ast)) {
    if (ast.length !== 1) throw new GuardError("Only a single statement is allowed.");
    ast = ast[0];
  }
  if (ast.type !== "select") throw new GuardError("Only SELECT queries are allowed.");

  const ctes = new Set(cteNames(ast));
  const tables = new Set<string>();
  for (const entry of parser.tableList(sql, opt)) {
    const [op, db, table] = entry.split("::");
    if (op !== "select") throw new GuardError("Only SELECT queries are allowed.");
    const t = table.toLowerCase();
    if (db && db !== "null") {
      const d = db.toLowerCase();
      if (SYSTEM_SCHEMAS.has(d) || d !== o.database.toLowerCase())
        throw new GuardError(`Access to database '${db}' is not allowed.`);
    }
    if (ctes.has(t)) continue;
    if (!o.allowAll && !o.allowedTables.has(t)) throw new GuardError(`Table '${table}' is not in the allowlist.`);
    tables.add(t);
  }

  const max = o.rowLimit;
  if (ast._next || ast.set_op) {
    // UNION etc.: wrap so the cap applies to the combined result.
    sql = `SELECT * FROM (${sql}) AS _guarded LIMIT ${max + 1}`;
  } else {
    const n = limitCount(ast);
    if (n === "invalid") throw new GuardError("LIMIT must be a literal number.");
    if (n === null) sql = `${sql} LIMIT ${max + 1}`;
    else if (n > max) throw new GuardError(`LIMIT ${n} is above the maximum of ${max} rows.`);
  }

  return { sql, tables: [...tables] };
}
