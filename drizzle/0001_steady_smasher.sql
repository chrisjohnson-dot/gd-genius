CREATE TABLE `allocation_run_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`orderId` int NOT NULL,
	`referenceNum` varchar(256),
	`status` enum('allocated','skipped','failed') NOT NULL,
	`skipReason` text,
	`allocationDetail` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `allocation_run_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `allocation_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`customerId` int NOT NULL,
	`customerName` varchar(256),
	`facilityId` int NOT NULL,
	`facilityName` varchar(256),
	`status` enum('proposed','confirmed','cancelled','failed') NOT NULL DEFAULT 'proposed',
	`orderCount` int DEFAULT 0,
	`allocatedCount` int DEFAULT 0,
	`skippedCount` int DEFAULT 0,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`confirmedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `allocation_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(128) NOT NULL,
	`entityType` varchar(64),
	`entityId` varchar(64),
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extensiv_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`clientId` varchar(128) NOT NULL,
	`clientSecret` varchar(256) NOT NULL,
	`tplGuid` varchar(128) NOT NULL,
	`userLoginId` int NOT NULL,
	`baseUrl` varchar(256) NOT NULL DEFAULT 'https://secure-wms.com',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extensiv_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `location_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`customerId` int NOT NULL,
	`customerName` varchar(256),
	`facilityId` int NOT NULL,
	`facilityName` varchar(256),
	`locationId` int NOT NULL,
	`locationName` varchar(256) NOT NULL,
	`locationType` enum('staging','pick_face','warehouse') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `location_configs_id` PRIMARY KEY(`id`)
);
