-- Migration: Add ClearSight push tracking columns to shipments table
-- These columns track the status of outbound pushes from GD Genius to ClearSight.

ALTER TABLE `shipments`
  ADD COLUMN `clear_sight_push_status` ENUM('pending','sent','failed') NULL AFTER `notes`,
  ADD COLUMN `clear_sight_push_attempts` INT NOT NULL DEFAULT 0 AFTER `clear_sight_push_status`,
  ADD COLUMN `clear_sight_push_error` VARCHAR(512) NULL AFTER `clear_sight_push_attempts`,
  ADD COLUMN `clear_sight_last_pushed_at` TIMESTAMP NULL AFTER `clear_sight_push_error`;
