-- Create a read-only MySQL user for the MCP server.
-- Run this as an admin user against YOUR database, after editing the three values:
--   your_database   -> the schema the assistant may read
--   mcp_reader      -> the user name (keep it in MYSQL_USER)
--   change-me       -> a long random password (keep it in MYSQL_PASSWORD)
-- Restrict the host part ('%') to the MCP server's address when you can, e.g. '10.0.%'.

CREATE USER IF NOT EXISTS 'mcp_reader'@'%' IDENTIFIED BY 'change-me';

-- Option A: read every table in the database.
GRANT SELECT, SHOW VIEW ON `your_database`.* TO 'mcp_reader'@'%';

-- Option B (stricter): grant table by table instead of Option A, and set the same
-- list in ALLOWED_TABLES. Comment out Option A if you use this.
-- GRANT SELECT ON `your_database`.`customers` TO 'mcp_reader'@'%';
-- GRANT SELECT ON `your_database`.`orders`    TO 'mcp_reader'@'%';

-- Keep the account from hogging the server.
ALTER USER 'mcp_reader'@'%' WITH MAX_USER_CONNECTIONS 10;

-- Tip: to hide sensitive columns (password hashes, tokens, personal data),
-- grant SELECT on a VIEW that leaves them out instead of on the base table.

FLUSH PRIVILEGES;
