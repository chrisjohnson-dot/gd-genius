CREATE TABLE `put_away_priority` (
	`id` int AUTO_INCREMENT NOT NULL,
	`config_id` int NOT NULL,
	`facility_id` int NOT NULL,
	`customer_id` int NOT NULL,
	`aisle` varchar(50) NOT NULL,
	`level` varchar(50) NOT NULL DEFAULT '*',
	`priority_order` int NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `put_away_priority_id` PRIMARY KEY(`id`)
);
