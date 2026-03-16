CREATE TABLE `schedule_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`cronExpression` varchar(128) NOT NULL DEFAULT '0 0 8,12,16 * * *',
	`timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
	`lastRunAt` timestamp,
	`lastRunStatus` varchar(32),
	`lastRunSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customer_rules` ADD `facilityId` int;--> statement-breakpoint
ALTER TABLE `customer_rules` ADD `facilityName` varchar(256);--> statement-breakpoint
ALTER TABLE `customer_rules` ADD `autoRun` boolean DEFAULT false NOT NULL;