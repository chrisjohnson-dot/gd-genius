-- Migration 006: EDI Retailers and EDI Escalations tables

CREATE TABLE IF NOT EXISTS `edi_retailers` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(255) NOT NULL,
  `requires_edi` boolean NOT NULL DEFAULT true,
  `aliases` json,
  `notes` text,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS `edi_escalations` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `config_id` int NOT NULL,
  `order_number` varchar(128) NOT NULL,
  `customer_name` varchar(255),
  `ship_date` varchar(32),
  `tracking_number` varchar(128),
  `flagged_by` varchar(255) NOT NULL,
  `flagged_at` bigint NOT NULL,
  `notes` text,
  `resolved_at` bigint,
  `resolved_by` varchar(255),
  `status` enum('open','resolved','dismissed') NOT NULL DEFAULT 'open'
);
