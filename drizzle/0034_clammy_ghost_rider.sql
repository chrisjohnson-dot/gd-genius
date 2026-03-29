CREATE TABLE `sla_daily_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`facilityId` int NOT NULL,
	`facilityName` varchar(256) NOT NULL,
	`snapshotDate` varchar(10) NOT NULL,
	`inSlaCount` int NOT NULL DEFAULT 0,
	`totalCount` int NOT NULL DEFAULT 0,
	`slaRate` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sla_daily_snapshots_id` PRIMARY KEY(`id`)
);
