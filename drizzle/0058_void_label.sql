-- Add void tracking columns to small_parcel_sessions
-- Also update the status enum to include 'voided'
ALTER TABLE `small_parcel_sessions`
  ADD COLUMN `voidedAt` timestamp NULL,
  ADD COLUMN `voidReason` varchar(512) NULL,
  MODIFY COLUMN `status` enum('scanning','ready','label_purchased','cancelled','voided') NOT NULL DEFAULT 'scanning';
