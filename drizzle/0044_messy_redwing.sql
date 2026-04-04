ALTER TABLE `label_scan_settings` ADD `plcProtocol` varchar(16) DEFAULT 'modbus' NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `plcIp` varchar(128) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `plcPort` int DEFAULT 502 NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `plcUnitId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `plcStubMode` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `enipSlot` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `enipPath` varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `enipTagBeltStop` varchar(128) DEFAULT 'GD_BeltStop' NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `enipTagTampFire` varchar(128) DEFAULT 'GD_TampFire' NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `enipTagDivertOn` varchar(128) DEFAULT 'GD_DivertOn' NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `modbusCoilBeltStop` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `modbusCoilTampFire` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `label_scan_settings` ADD `modbusCoilDivertOn` int DEFAULT 2 NOT NULL;