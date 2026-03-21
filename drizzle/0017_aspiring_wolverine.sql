CREATE TABLE `lane_thresholds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`laneName` varchar(256) NOT NULL,
	`facilityCode` varchar(64),
	`destinationRegion` varchar(128),
	`thresholdHours` int NOT NULL DEFAULT 2,
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lane_thresholds_id` PRIMARY KEY(`id`)
);
