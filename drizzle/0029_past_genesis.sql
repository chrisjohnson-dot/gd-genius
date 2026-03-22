ALTER TABLE `returns_sessions` ADD `pushStatus` enum('pending','sent','failed');--> statement-breakpoint
ALTER TABLE `returns_sessions` ADD `pushAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `returns_sessions` ADD `pushError` text;--> statement-breakpoint
ALTER TABLE `returns_sessions` ADD `lastPushedAt` timestamp;