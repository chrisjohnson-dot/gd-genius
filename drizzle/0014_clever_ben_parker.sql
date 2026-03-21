ALTER TABLE `order_tracking` ADD `shipwellShipmentId` varchar(64);--> statement-breakpoint
ALTER TABLE `order_tracking` ADD `shipwellShipmentUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `order_tracking` ADD `shipwellStatus` varchar(64);--> statement-breakpoint
ALTER TABLE `order_tracking` ADD `shipwellStatusUpdatedAt` timestamp;