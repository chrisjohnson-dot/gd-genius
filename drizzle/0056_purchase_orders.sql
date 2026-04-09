-- Migration: purchase_orders table
-- Stores GD Genius purchase orders pushed to OpFi

CREATE TABLE IF NOT EXISTS `purchase_orders` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `po_number`           VARCHAR(64)  NOT NULL UNIQUE,
  `customer_id`         VARCHAR(64)  NOT NULL,
  `customer_name`       VARCHAR(255) NOT NULL,
  `warehouse`           ENUM('Columbus','Reno','Toronto','Calgary') NOT NULL,
  `po_date`             DATE         NOT NULL,
  `billing_period`      VARCHAR(7)   NOT NULL COMMENT 'YYYY-MM',
  `kitting_charge`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `labour_charge`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `material_charge`     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_charge`        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `currency`            ENUM('USD','CAD') NOT NULL DEFAULT 'CAD',
  `notes`               TEXT         NULL,
  `opfi_push_status`    ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  `opfi_push_error`     TEXT         NULL,
  `opfi_push_attempts`  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `opfi_last_pushed_at` BIGINT       NULL COMMENT 'Unix ms',
  `created_by`          VARCHAR(128) NULL,
  `created_at`          BIGINT       NOT NULL DEFAULT (UNIX_TIMESTAMP() * 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
