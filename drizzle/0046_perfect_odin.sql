-- Migration: add po_type, po_status, and type-specific columns to purchase_orders
-- Also create the table if it doesn't exist yet (idempotent)

-- First, create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS `purchase_orders` (
  `id`                  INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `po_number`           VARCHAR(64)  NOT NULL UNIQUE,
  `po_type`             ENUM('kitting','labor','materials') NOT NULL DEFAULT 'kitting',
  `po_status`           ENUM('pending','approved','invoiced','rejected','received','ordered') NOT NULL DEFAULT 'pending',
  `customer_id`         VARCHAR(64)  NOT NULL,
  `customer_name`       VARCHAR(255) NOT NULL,
  `po_warehouse`        ENUM('Columbus','Reno','Toronto','Calgary') NOT NULL,
  `po_date`             VARCHAR(10)  NOT NULL,
  `billing_period`      VARCHAR(7)   NOT NULL,
  `kitting_charge`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `labour_charge`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `material_charge`     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_charge`        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `po_currency`         ENUM('USD','CAD') NOT NULL DEFAULT 'CAD',
  `sku`                 VARCHAR(128) NULL,
  `sku_description`     VARCHAR(255) NULL,
  `qty`                 INT NULL,
  `unit_cost`           DECIMAL(10,4) NULL,
  `employee_name`       VARCHAR(128) NULL,
  `employee_role`       VARCHAR(128) NULL,
  `hours_worked`        DECIMAL(8,2) NULL,
  `hourly_rate`         DECIMAL(10,2) NULL,
  `item_name`           VARCHAR(255) NULL,
  `vendor_name`         VARCHAR(255) NULL,
  `notes`               TEXT NULL,
  `opfi_push_status`    ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  `opfi_push_error`     TEXT NULL,
  `opfi_push_attempts`  INT NOT NULL DEFAULT 0,
  `opfi_last_pushed_at` BIGINT NULL,
  `created_by`          VARCHAR(128) NULL,
  `created_at`          BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add new columns if the table already exists (ALTER TABLE IF NOT EXISTS column pattern)
ALTER TABLE `purchase_orders`
  ADD COLUMN IF NOT EXISTS `po_type`        ENUM('kitting','labor','materials') NOT NULL DEFAULT 'kitting' AFTER `po_number`,
  ADD COLUMN IF NOT EXISTS `po_status`      ENUM('pending','approved','invoiced','rejected','received','ordered') NOT NULL DEFAULT 'pending' AFTER `po_type`,
  ADD COLUMN IF NOT EXISTS `sku`            VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS `sku_description` VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `qty`            INT NULL,
  ADD COLUMN IF NOT EXISTS `unit_cost`      DECIMAL(10,4) NULL,
  ADD COLUMN IF NOT EXISTS `employee_name`  VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS `employee_role`  VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS `hours_worked`   DECIMAL(8,2) NULL,
  ADD COLUMN IF NOT EXISTS `hourly_rate`    DECIMAL(10,2) NULL,
  ADD COLUMN IF NOT EXISTS `item_name`      VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `vendor_name`    VARCHAR(255) NULL;
