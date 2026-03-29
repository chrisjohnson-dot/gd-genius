CREATE TABLE `mu_labels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`config_id` int NOT NULL,
	`transaction_id` int NOT NULL,
	`receiver_item_id` int NOT NULL,
	`sku` varchar(100) NOT NULL,
	`mu_label` varchar(100) NOT NULL,
	`mu_type` varchar(50) NOT NULL DEFAULT 'Pallet',
	`qty` int NOT NULL DEFAULT 1,
	`synced_to_extensiv` boolean NOT NULL DEFAULT false,
	`created_at` bigint NOT NULL,
	CONSTRAINT `mu_labels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receipt_item_confirmations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`config_id` int NOT NULL,
	`transaction_id` int NOT NULL,
	`receiver_item_id` int NOT NULL,
	`sku` varchar(100) NOT NULL,
	`expected_qty` int NOT NULL,
	`confirmed_qty` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'confirmed',
	`note` text,
	`confirmed_by` varchar(255),
	`confirmed_at` bigint NOT NULL,
	CONSTRAINT `receipt_item_confirmations_id` PRIMARY KEY(`id`)
);
