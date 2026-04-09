import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const sql = [
  "CREATE TABLE IF NOT EXISTS `purchase_orders` (",
  "  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,",
  "  `po_number` VARCHAR(64) NOT NULL UNIQUE,",
  "  `customer_id` VARCHAR(64) NOT NULL,",
  "  `customer_name` VARCHAR(255) NOT NULL,",
  "  `warehouse` ENUM('Columbus','Reno','Toronto','Calgary') NOT NULL,",
  "  `po_date` DATE NOT NULL,",
  "  `billing_period` VARCHAR(7) NOT NULL,",
  "  `kitting_charge` DECIMAL(10,2) NOT NULL DEFAULT 0.00,",
  "  `labour_charge` DECIMAL(10,2) NOT NULL DEFAULT 0.00,",
  "  `material_charge` DECIMAL(10,2) NOT NULL DEFAULT 0.00,",
  "  `total_charge` DECIMAL(10,2) NOT NULL DEFAULT 0.00,",
  "  `currency` ENUM('USD','CAD') NOT NULL DEFAULT 'CAD',",
  "  `notes` TEXT NULL,",
  "  `opfi_push_status` ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',",
  "  `opfi_push_error` TEXT NULL,",
  "  `opfi_push_attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,",
  "  `opfi_last_pushed_at` BIGINT NULL,",
  "  `created_by` VARCHAR(128) NULL,",
  "  `created_at` BIGINT NOT NULL DEFAULT 0",
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
].join("\n");

await conn.execute(sql);
console.log("purchase_orders table created (or already exists)");
await conn.end();
