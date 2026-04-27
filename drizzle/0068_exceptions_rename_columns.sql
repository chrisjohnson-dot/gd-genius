-- Rename exceptions.priority → exception_priority and exceptions.status → exception_status
-- to match what Drizzle ORM generates (uses enum type name as column name)
ALTER TABLE `exceptions`
  CHANGE COLUMN `priority` `exception_priority` ENUM('critical','high','medium','low') NOT NULL DEFAULT 'medium',
  CHANGE COLUMN `status` `exception_status` ENUM('open','in_progress','resolved','dismissed') NOT NULL DEFAULT 'open';
