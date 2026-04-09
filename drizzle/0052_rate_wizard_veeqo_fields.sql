-- Add Veeqo Rate Shopping API fields to rate_wizard_shipments
ALTER TABLE `rate_wizard_shipments`
  ADD COLUMN `remote_shipment_id` varchar(100) DEFAULT NULL,
  ADD COLUMN `request_token` varchar(255) DEFAULT NULL;
