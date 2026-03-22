CREATE TABLE `pallet_scans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trackingNumber` varchar(256) NOT NULL,
	`doorNumber` varchar(64),
	`warehouseName` varchar(256),
	`carrierName` varchar(256),
	`referenceNumber` varchar(256),
	`notes` text,
	`scannedBy` varchar(256),
	`status` varchar(32) NOT NULL DEFAULT 'loaded',
	`scannedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pallet_scans_id` PRIMARY KEY(`id`)
);
