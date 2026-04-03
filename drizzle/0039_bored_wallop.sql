CREATE TABLE `label_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`barcode` varchar(128) NOT NULL,
	`filename` varchar(512) NOT NULL,
	`s3Key` varchar(512) NOT NULL,
	`s3Url` varchar(1024) NOT NULL,
	`batchName` varchar(256),
	`clientName` varchar(256),
	`labelType` varchar(32) NOT NULL DEFAULT 'ucc128',
	`uploadedBy` varchar(256),
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `label_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `label_scan_cartons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`barcode` varchar(128) NOT NULL,
	`labelFileId` int,
	`dispatched` boolean NOT NULL DEFAULT false,
	`dispatchedAt` timestamp,
	`hasException` boolean NOT NULL DEFAULT false,
	`exceptionReason` varchar(64),
	`exceptionDetail` text,
	`exceptionResolvedBy` varchar(256),
	`exceptionResolvedAt` timestamp,
	`qcItemCount` int,
	`qcPhotos` json,
	`qcNotes` text,
	`scannedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `label_scan_cartons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `label_scan_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderRef` varchar(256) NOT NULL,
	`clientName` varchar(256),
	`expectedCartons` int,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`printerIp` varchar(128),
	`printerPort` int,
	`scannedCount` int NOT NULL DEFAULT 0,
	`dispatchedCount` int NOT NULL DEFAULT 0,
	`exceptionCount` int NOT NULL DEFAULT 0,
	`createdBy` varchar(256),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `label_scan_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `label_scan_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`printerIp` varchar(128) NOT NULL DEFAULT '',
	`printerPort` int NOT NULL DEFAULT 9100,
	`gs1Prefix` varchar(32) NOT NULL DEFAULT '',
	`labelFolderPath` varchar(512) NOT NULL DEFAULT '',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `label_scan_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `qc_pallets` ADD `photoUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `qc_scan_sessions` ADD `isBatch` boolean DEFAULT false NOT NULL;