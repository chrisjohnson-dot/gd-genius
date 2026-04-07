-- Add outbound staging fields to order_tracking table
ALTER TABLE `order_tracking`
  ADD COLUMN `outboundLocation` varchar(256) NULL AFTER `shipReadyAt`,
  ADD COLUMN `palletCount` int NOT NULL DEFAULT 0 AFTER `outboundLocation`;
