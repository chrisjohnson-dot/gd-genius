-- Add matchType to sla_ship_to_rules (exact | contains | starts_with)
ALTER TABLE `sla_ship_to_rules`
  ADD COLUMN `matchType` varchar(16) NOT NULL DEFAULT 'exact' AFTER `shipToName`;

-- Add shipDays to sla_requirements (comma-separated 0-6, NULL = any day)
ALTER TABLE `sla_requirements`
  ADD COLUMN `shipDays` varchar(16) NULL AFTER `slaDays`;
