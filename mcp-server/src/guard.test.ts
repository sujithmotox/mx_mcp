import { test } from "node:test";
import assert from "node:assert/strict";
import { guardSelect, GuardError } from "./guard.js";

const o = { allowedTables: new Set(["orders", "customers", "order_items"]), allowAll: false, database: "shop", rowLimit: 500 };
const ok = (q: string) => guardSelect(q, o).sql;
const bad = (q: string, re: RegExp) => assert.throws(() => guardSelect(q, o), (e: unknown) => e instanceof GuardError && re.test((e as Error).message));

test("adds a LIMIT when missing", () => {
  assert.equal(ok("SELECT * FROM orders"), "SELECT * FROM orders LIMIT 501");
  assert.equal(ok("select id from orders;"), "select id from orders LIMIT 501");
});

test("keeps a LIMIT under the cap and rejects one above it", () => {
  assert.equal(ok("SELECT * FROM orders LIMIT 10"), "SELECT * FROM orders LIMIT 10");
  assert.equal(ok("SELECT * FROM orders LIMIT 20, 10"), "SELECT * FROM orders LIMIT 20, 10");
  bad("SELECT * FROM orders LIMIT 10000", /above the maximum/);
});

test("allows joins, subqueries and CTEs over allowlisted tables", () => {
  ok("SELECT c.name, COUNT(*) FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.name");
  ok("WITH t AS (SELECT customer_id FROM orders) SELECT * FROM t JOIN customers c ON c.id = t.customer_id");
  ok("SELECT * FROM orders WHERE id IN (SELECT order_id FROM order_items)");
  ok("SELECT * FROM shop.orders");
});

test("wraps UNIONs", () => {
  assert.match(ok("SELECT id FROM orders UNION SELECT id FROM customers"), /^SELECT \* FROM \(.*\) AS _guarded LIMIT 501$/);
});

test("rejects writes, multiple statements and DDL", () => {
  bad("DELETE FROM orders", /Only SELECT/);
  bad("UPDATE orders SET total = 0", /Only SELECT/);
  bad("SELECT 1; DROP TABLE orders", /single statement/);
  bad("DROP TABLE orders", /Only SELECT/);
  bad("/* hi */ INSERT INTO orders VALUES (1)", /Only SELECT/);
});

test("rejects tables outside the allowlist and other databases", () => {
  bad("SELECT * FROM users", /not in the allowlist/);
  bad("SELECT (SELECT MAX(id) FROM secrets) FROM orders", /not in the allowlist/);
  bad("SELECT * FROM mysql.user", /not allowed/);
  bad("SELECT * FROM information_schema.tables", /not allowed/);
  bad("SELECT * FROM other_db.orders", /not allowed/);
});

test("rejects dangerous functions", () => {
  bad("SELECT SLEEP(10)", /not allowed/);
  bad("SELECT * FROM orders INTO OUTFILE '/tmp/x'", /not allowed/);
  bad("SELECT LOAD_FILE('/etc/passwd')", /not allowed/);
  bad("SELECT * FROM orders FOR UPDATE", /not allowed/);
});
