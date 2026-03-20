CREATE TABLE `order_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`extensivOrderId` int NOT NULL,
	`referenceNum` varchar(256),
	`poNum` varchar(256),
	`configId` int NOT NULL,
	`clientId` int NOT NULL,
	`clientName` varchar(256) NOT NULL,
	`facilityId` int NOT NULL,
	`facilityName` varchar(256),
	`shipToName` varchar(512),
	`shipToCity` varchar(256),
	`totalPieces` int DEFAULT 0,
	`skuCount` int DEFAULT 0,
	`notes` text,
	`extensivStatus` int DEFAULT 0,
	`creationDate` varchar(64),
	`lifecycleStatus` enum('unallocated','allocated','picking','qc','qc_complete','ship_ready') NOT NULL DEFAULT 'unallocated',
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSyncedAt` timestamp NOT NULL DEFAULT (now()),
	`allocatedAt` timestamp,
	`pickingAt` timestamp,
	`qcAt` timestamp,
	`qcCompleteAt` timestamp,
	`shipReadyAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `order_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `allocation_runs` MODIFY COLUMN `status` enum('proposed','confirmed','cancelled','failed','unallocated') NOT NULL DEFAULT 'proposed';--> statement-breakpoint
ALTER TABLE `allocation_run_orders` ADD `shipToName` varchar(512);--> statement-breakpoint
ALTER TABLE `allocation_runs` ADD `documentsPrintedAt` timestamp;