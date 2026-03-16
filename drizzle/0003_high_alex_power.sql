CREATE TABLE `customer_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`customerId` int NOT NULL,
	`customerName` varchar(256),
	`noLotMixing` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_rules_id` PRIMARY KEY(`id`)
);
