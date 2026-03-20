CREATE TABLE `sla_requirements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`clientName` varchar(256) NOT NULL,
	`slaDays` int NOT NULL DEFAULT 2,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sla_requirements_id` PRIMARY KEY(`id`)
);
