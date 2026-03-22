CREATE TABLE `qc_flagged_scans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int,
	`referenceNumber` varchar(128),
	`upc` varchar(128),
	`sku` varchar(128),
	`description` text,
	`flaggedBy` varchar(256),
	`status` varchar(32) NOT NULL DEFAULT 'open',
	`resolvedBy` varchar(256),
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qc_flagged_scans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qc_pallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`palletUpc` varchar(128),
	`palletNumber` int NOT NULL DEFAULT 1,
	`items` json,
	`builtAt` timestamp DEFAULT (now()),
	`shippedAt` timestamp,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qc_pallets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qc_scan_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`sku` varchar(128) NOT NULL,
	`upc` varchar(128),
	`description` varchar(512),
	`expectedQty` int NOT NULL DEFAULT 0,
	`scannedQty` int NOT NULL DEFAULT 0,
	`caseAmount` int NOT NULL DEFAULT 1,
	`scanTimestamps` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qc_scan_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qc_scan_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referenceNumber` varchar(128) NOT NULL,
	`batchIdentifiers` text,
	`warehouseId` int,
	`warehouseName` varchar(128),
	`customerId` int,
	`customerName` varchar(256),
	`destinationAddress` text,
	`distributionCenter` varchar(128),
	`poNumber` varchar(128),
	`trackingNumber` varchar(256),
	`status` varchar(32) NOT NULL DEFAULT 'scanning',
	`foundInExtensiv` boolean NOT NULL DEFAULT true,
	`completedAt` timestamp,
	`shippedAt` timestamp,
	`createdBy` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qc_scan_sessions_id` PRIMARY KEY(`id`)
);
