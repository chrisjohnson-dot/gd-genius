-- Add facilityId and facilityName columns to returns_sessions table
ALTER TABLE `returns_sessions`
  ADD COLUMN `facilityId` int NULL AFTER `warehouseName`,
  ADD COLUMN `facilityName` varchar(256) NULL AFTER `facilityId`;
