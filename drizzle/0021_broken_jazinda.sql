CREATE TABLE `client_visibility` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`clientId` int NOT NULL,
	`clientName` varchar(256) NOT NULL,
	`isVisible` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_visibility_id` PRIMARY KEY(`id`)
);
