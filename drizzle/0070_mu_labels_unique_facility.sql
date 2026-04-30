-- Add facility_id column to mu_labels for per-warehouse tracking
ALTER TABLE `mu_labels` ADD COLUMN `facility_id` int NULL;

-- Add unique constraint so nightly sync can upsert without duplicates
-- (config_id, receiver_item_id, mu_label) uniquely identifies a MU assignment
ALTER TABLE `mu_labels` ADD CONSTRAINT `mu_labels_unique_assignment`
  UNIQUE (`config_id`, `receiver_item_id`, `mu_label`);
