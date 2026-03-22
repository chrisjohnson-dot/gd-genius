CREATE TABLE `sla_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requirementId` int NOT NULL,
	`clientId` int NOT NULL,
	`clientName` varchar(256) NOT NULL,
	`ruleName` varchar(128) NOT NULL,
	`slaDays` int NOT NULL DEFAULT 2,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sla_rules_id` PRIMARY KEY(`id`)
);
