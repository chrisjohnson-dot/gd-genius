CREATE TABLE `sla_facility_thresholds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`facilityId` int NOT NULL,
	`facilityName` varchar(256) NOT NULL,
	`greenThreshold` int NOT NULL DEFAULT 98,
	`yellowThreshold` int NOT NULL DEFAULT 95,
	`notes` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sla_facility_thresholds_id` PRIMARY KEY(`id`),
	CONSTRAINT `sla_facility_thresholds_facilityId_unique` UNIQUE(`facilityId`)
);
