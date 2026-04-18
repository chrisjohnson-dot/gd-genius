-- Add client approval fields to returns_items
ALTER TABLE `returns_items`
  ADD COLUMN `clientApprovalStatus` ENUM('pending','approved','rejected','questioned','flagged') NULL,
  ADD COLUMN `clientApprovalNote` TEXT NULL,
  ADD COLUMN `clientApprovalUpdatedAt` TIMESTAMP NULL;

-- Create return_client_instructions table
CREATE TABLE `return_client_instructions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `sessionId` INT NOT NULL,
  `itemId` INT NULL,
  `clientId` INT NOT NULL,
  `clientName` VARCHAR(256) NOT NULL DEFAULT '',
  `message` TEXT NOT NULL,
  `approvalStatus` ENUM('approved','rejected','questioned','flagged') NULL,
  `isRead` BOOLEAN NOT NULL DEFAULT FALSE,
  `readAt` TIMESTAMP NULL,
  `readByName` VARCHAR(256) NULL,
  `clearsightInstructionId` VARCHAR(256) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
