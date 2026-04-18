-- Migration 005: Add scan station columns to returns_items
ALTER TABLE `returns_items`
  ADD COLUMN `upcCode` varchar(64) DEFAULT NULL,
  ADD COLUMN `photos` text DEFAULT NULL;
