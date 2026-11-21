/**
 * Curated tools: fixed, parameterised queries for the questions users ask most.
 *
 * They are safer and more predictable than free-form SQL, so the model is told
 * to prefer them. The examples below target a generic shop schema (customers, products, orders, order_items).
 * To adapt them to your database, edit or replace the entries in CURATED_TOOLS:
 * each one lists the tables it needs and builds a SQL string with `?` params.
 * A tool is only exposed when all of its tables exist and are allowlisted, so
 * these examples simply disappear when you point the server at a different DB.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import { runQuery } from "../db.js";
import type { ToolContext } from "../server.js";
import { errorResult, tableResult } from "./result.js";

type CuratedTool<S extends ZodRawShape> = {
  name: string;
  title: string;
  description: string;
  tables: string[];
  input: S;
  build: (args: z.infer<z.ZodObject<S>>) => { sql: string; params: unknown[] };
};

const define = <S extends ZodRawShape>(t: CuratedTool<S>) => t;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const CURATED_TOOLS = [
  define({
    name: "find_customers",
    title: "Find customers",
    description: "Search customers by part of their name or email. Returns id, name, email, country and signup date.",
    tables: ["customers"],
    input: {
      query: z.string().min(1).describe("Text to match against name or email"),
      limit: z.number().int().min(1).max(50).default(20),
    },
    build: ({ query, limit }) => ({
      sql: `SELECT id, name, email, country, created_at
              FROM customers
             WHERE name LIKE ? OR email LIKE ?
             ORDER BY name
             LIMIT ?`,
      params: [`%${query}%`, `%${query}%`, limit],
    }),
  }),

  define({
    name: "customer_orders",
    title: "Orders for a customer",
    description: "List a customer's orders, newest first, with item counts. Identify the customer by id or email.",
    tables: ["customers", "orders", "order_items"],
    input: {
      customer_id: z.number().int().optional(),
      email: z.string().optional(),
      status: z.enum(["pending", "paid", "shipped", "cancelled", "refunded"]).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    build: ({ customer_id, email, status, limit }) => {
      const where: string[] = [];
      const params: unknown[] = [];
      if (customer_id != null) (where.push("c.id = ?"), params.push(customer_id));
      if (email) (where.push("c.email = ?"), params.push(email));
      if (status) (where.push("o.status = ?"), params.push(status));
      if (customer_id == null && !email) throw new Error("Provide customer_id or email.");
      return {
        sql: `SELECT o.id AS order_id, o.created_at, o.status, o.total,
                     COALESCE(SUM(oi.quantity), 0) AS items
                FROM orders o
                JOIN customers c ON c.id = o.customer_id
                LEFT JOIN order_items oi ON oi.order_id = o.id
               WHERE ${where.join(" AND ")}
               GROUP BY o.id, o.created_at, o.status, o.total
               ORDER BY o.created_at DESC
               LIMIT ?`,
        params: [...params, limit],
      };
    },
  }),

  define({
    name: "sales_summary",
    title: "Sales summary",
    description:
      "Revenue and order count grouped by day, week or month for a date range. Cancelled and refunded orders are excluded.",
    tables: ["orders"],
    input: {
      period: z.enum(["day", "week", "month"]).default("month"),
      from: isoDate.describe("Start date, inclusive (YYYY-MM-DD)"),
      to: isoDate.describe("End date, inclusive (YYYY-MM-DD)"),
    },
    build: ({ period, from, to }) => {
      const bucket = {
        day: "DATE_FORMAT(created_at, '%Y-%m-%d')",
        week: "DATE_FORMAT(created_at, '%x-W%v')",
        month: "DATE_FORMAT(created_at, '%Y-%m')",
      }[period];
      return {
        sql: `SELECT ${bucket} AS period, COUNT(*) AS orders, ROUND(SUM(total), 2) AS revenue,
                     ROUND(AVG(total), 2) AS avg_order_value
                FROM orders
               WHERE status NOT IN ('cancelled', 'refunded')
                 AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
               GROUP BY period
               ORDER BY period`,
        params: [from, to],
      };
    },
  }),

  define({
    name: "top_products",
    title: "Top products",
    description: "Best-selling products by revenue or units sold, optionally within a date range and category.",
    tables: ["products", "orders", "order_items"],
    input: {
      by: z.enum(["revenue", "units"]).default("revenue"),
      from: isoDate.optional(),
      to: isoDate.optional(),
      category: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(10),
    },
    build: ({ by, from, to, category, limit }) => {
      const where = ["o.status NOT IN ('cancelled', 'refunded')"];
      const params: unknown[] = [];
      if (from) (where.push("o.created_at >= ?"), params.push(from));
      if (to) (where.push("o.created_at < DATE_ADD(?, INTERVAL 1 DAY)"), params.push(to));
      if (category) (where.push("p.category = ?"), params.push(category));
      return {
        sql: `SELECT p.id, p.sku, p.name, p.category,
                     SUM(oi.quantity) AS units, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN products p ON p.id = oi.product_id
               WHERE ${where.join(" AND ")}
               GROUP BY p.id, p.sku, p.name, p.category
               ORDER BY ${by === "units" ? "units" : "revenue"} DESC
               LIMIT ?`,
        params: [...params, limit],
      };
    },
  }),
];

export function registerCuratedTools(server: McpServer, ctx: ToolContext, available: Set<string>) {
  for (const tool of CURATED_TOOLS as unknown as CuratedTool<ZodRawShape>[]) {
    if (!tool.tables.every((t) => available.has(t))) continue;
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: { readOnlyHint: true } },
      async (args: any) => {
        let q;
        try {
          q = tool.build(args);
        } catch (err) {
          return errorResult((err as Error).message);
        }
        try {
          return tableResult(await runQuery(tool.name, q.sql, q.params, ctx.client));
        } catch (err) {
          return errorResult(`MySQL error: ${(err as Error).message}`);
        }
      },
    );
  }
}
