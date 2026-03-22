CREATE TABLE `returns_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`sku` varchar(256) NOT NULL,
	`description` varchar(512),
	`quantity` int NOT NULL DEFAULT 1,
	`condition` enum('new','good','damaged','unsellable') NOT NULL DEFAULT 'good',
	`disposition` enum('restock','quarantine','destroy','return_to_vendor') NOT NULL DEFAULT 'restock',
	`lotNumber` varchar(128),
	`notes` text,
	`scannedByName` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `returns_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `returns_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`warehouseName` varchar(256) NOT NULL,
	`clientId` int NOT NULL,
	`clientName` varchar(256) NOT NULL,
	`status` enum('open','closed','cancelled') NOT NULL DEFAULT 'open',
	`referenceNumber` varchar(128),
	`notes` text,
	`createdByName` varchar(256),
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `returns_sessions_id` PRIMARY KEY(`id`)
);
