-- Migration: add sla_ship_to_rules table for per-ship-to SLA overrides
CREATE TABLE IF NOT EXISTS `sla_ship_to_rules` (
  `id`          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `clientId`    INT NOT NULL,
  `clientName`  VARCHAR(256) NOT NULL,
  `shipToName`  VARCHAR(256) NOT NULL,
  `slaDays`     INT NOT NULL DEFAULT 2,
  `notes`       TEXT NULL,
  `createdAt`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_sla_ship_to_client` (`clientId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
