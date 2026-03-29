CREATE TABLE `put_away_scans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`facilityId` int NOT NULL,
	`customerId` int NOT NULL,
	`customerName` varchar(256),
	`sku` varchar(256) NOT NULL,
	`description` varchar(512),
	`lotNumber` varchar(128),
	`expirationDate` varchar(32),
	`confirmedLocation` varchar(256),
	`confirmedLocationType` enum('pick_face','warehouse','staging'),
	`suggestedLocation` varchar(256),
	`suggestedLocationType` enum('pick_face','warehouse','staging'),
	`qty` int NOT NULL DEFAULT 1,
	`sessionId` varchar(64) NOT NULL,
	`scannedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `put_away_scans_id` PRIMARY KEY(`id`)
);
