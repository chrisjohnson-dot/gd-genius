-- QR Scanning Integration: customer_app_configs, qr_scan_sessions, qr_scans

CREATE TABLE IF NOT EXISTS `customer_app_configs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `customerId` varchar(256) NOT NULL,
  `customerName` varchar(256) NOT NULL,
  `appUrl` varchar(1024) NOT NULL,
  `authHeader` varchar(512),
  `enabled` boolean NOT NULL DEFAULT true,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `customer_app_configs_customerId_unique` (`customerId`)
);

CREATE TABLE IF NOT EXISTS `qr_scan_sessions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `sessionId` varchar(64) NOT NULL,
  `runId` varchar(64) NOT NULL,
  `lineId` varchar(64) NOT NULL DEFAULT 'LINE-1',
  `customerId` varchar(256) NOT NULL,
  `customerName` varchar(256) NOT NULL,
  `customerAppUrl` varchar(1024) NOT NULL,
  `status` enum('active','paused','closed') NOT NULL DEFAULT 'active',
  `totalScanned` int NOT NULL DEFAULT 0,
  `totalForwarded` int NOT NULL DEFAULT 0,
  `totalErrors` int NOT NULL DEFAULT 0,
  `startedBy` varchar(256),
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `qr_scan_sessions_sessionId_unique` (`sessionId`)
);

CREATE TABLE IF NOT EXISTS `qr_scans` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `qrScanId` varchar(64) NOT NULL,
  `sessionId` varchar(64) NOT NULL,
  `runId` varchar(64) NOT NULL,
  `cartonId` varchar(64),
  `qrData` text NOT NULL,
  `qrParsed` json,
  `camera` varchar(32) DEFAULT 'unknown',
  `forwarded` boolean NOT NULL DEFAULT false,
  `forwardedAt` timestamp,
  `forwardAttempts` int NOT NULL DEFAULT 0,
  `forwardError` text,
  `customerResponseStatus` int,
  `customerResponseBody` text,
  `scannedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `qr_scans_qrScanId_unique` (`qrScanId`)
);
