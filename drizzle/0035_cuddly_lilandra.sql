ALTER TABLE `allocation_run_orders` ADD `verificationStatus` enum('pending','verified','partial','mismatch','failed');--> statement-breakpoint
ALTER TABLE `allocation_run_orders` ADD `verificationDetail` json;--> statement-breakpoint
ALTER TABLE `allocation_runs` ADD `verificationStatus` enum('pending','verified','partial','mismatch','failed');--> statement-breakpoint
ALTER TABLE `allocation_runs` ADD `verificationDetail` json;--> statement-breakpoint
ALTER TABLE `allocation_runs` ADD `verifiedAt` timestamp;