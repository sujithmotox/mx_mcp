-- Sample "shop" schema used by docker-compose. Replace with your own database.
CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  country CHAR(2) NOT NULL COMMENT 'ISO 3166-1 alpha-2',
  created_at DATETIME NOT NULL
) COMMENT 'People who have an account';

CREATE TABLE products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(60) NOT NULL,
  price DECIMAL(10,2) NOT NULL COMMENT 'Current list price'
) COMMENT 'Catalogue';

CREATE TABLE orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  status ENUM('pending','paid','shipped','cancelled','refunded') NOT NULL,
  total DECIMAL(10,2) NOT NULL COMMENT 'Sum of line items',
  created_at DATETIME NOT NULL,
  KEY idx_orders_created (created_at),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL COMMENT 'Price paid per unit',
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id)
);

-- A table the assistant must NOT see. It is left out of ALLOWED_TABLES and
-- the read-only user has no grant on it.
CREATE TABLE admin_users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL,
  password_hash VARCHAR(255) NOT NULL
);
INSERT INTO admin_users (username, password_hash) VALUES ('root', '$2b$12$not-a-real-hash');
