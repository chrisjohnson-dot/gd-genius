ALTER TABLE `allocation_runs` MODIFY COLUMN `customerId` int;--> statement-breakpoint
ALTER TABLE `allocation_runs` ADD `customerNames` text;