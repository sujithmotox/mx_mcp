-- docker-compose only: read-only user with table-level grants on the sample DB.
-- The password matches MYSQL_READER_PASSWORD's default in docker-compose.yml.
CREATE USER IF NOT EXISTS 'mcp_reader'@'%' IDENTIFIED BY 'reader-pass';
GRANT SELECT ON `shop`.`customers`   TO 'mcp_reader'@'%';
GRANT SELECT ON `shop`.`products`    TO 'mcp_reader'@'%';
GRANT SELECT ON `shop`.`orders`      TO 'mcp_reader'@'%';
GRANT SELECT ON `shop`.`order_items` TO 'mcp_reader'@'%';
ALTER USER 'mcp_reader'@'%' WITH MAX_USER_CONNECTIONS 10;
FLUSH PRIVILEGES;
