CREATE TABLE `shipwell_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL DEFAULT 'Default',
	`email` varchar(320) NOT NULL,
	`password` varchar(512) NOT NULL,
	`environment` enum('sandbox','production') NOT NULL DEFAULT 'sandbox',
	`isActive` boolean NOT NULL DEFAULT true,
	`cachedToken` varchar(512),
	`tokenExpiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shipwell_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `order_tracking` ADD `shipwellOrderId` varchar(64);--> statement-breakpoint
ALTER TABLE `order_tracking` ADD `shipwellPoUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `order_tracking` ADD `shipwellSentAt` timestamp;