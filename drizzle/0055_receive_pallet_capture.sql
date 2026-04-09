-- Migration: Receiving Pallet Capture tables
-- receive_pallet_sessions: one session per Extensiv receiving transaction
CREATE TABLE `receive_pallet_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transactionId` int NOT NULL,
  `facilityId` int NOT NULL,
  `facilityName` varchar(128) NOT NULL DEFAULT '',
  `customerId` int NOT NULL,
  `customerName` varchar(128) NOT NULL DEFAULT '',
  `poNum` varchar(128),
  `referenceNum` varchar(128),
  `status` enum('open','completed') NOT NULL DEFAULT 'open',
  `nonConformingHours` decimal(5,2),
  `nonConformingReason` varchar(512),
  `totalPallets` int NOT NULL DEFAULT 0,
  `standardPallets` int NOT NULL DEFAULT 0,
  `oversizePallets` int NOT NULL DEFAULT 0,
  `otherPallets` int NOT NULL DEFAULT 0,
  `opfiPushStatus` enum('pending','sent','failed','skipped') DEFAULT 'pending',
  `opfiPushedAt` timestamp NULL,
  `opfiError` varchar(512),
  `startedBy` varchar(128),
  `completedBy` varchar(128),
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  `rps_createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `rps_updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rps_transactionId` (`transactionId`),
  KEY `idx_rps_facilityId` (`facilityId`),
  KEY `idx_rps_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- receive_pallets: one row per physical pallet in a session
CREATE TABLE `receive_pallets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sessionId` int NOT NULL,
  `palletNumber` int NOT NULL,
  `palletType` enum('standard','oversize','other') NOT NULL,
  `description` varchar(256),
  `photoUrl` varchar(512),
  `weightLbs` decimal(8,2),
  `notes` varchar(512),
  `capturedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `rp_createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rp_sessionId` (`sessionId`),
  CONSTRAINT `fk_rp_session` FOREIGN KEY (`sessionId`) REFERENCES `receive_pallet_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
