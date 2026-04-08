-- Add transactionId, facilityName, and commitMode columns to put_away_scans
-- transactionId: links to mu_labels for MU lookup
-- facilityName: cached warehouse name for display
-- commitMode: 'extensiv' = Genius moved it automatically, 'scan' = operator will scan

ALTER TABLE `put_away_scans`
  ADD COLUMN `transactionId` int NULL,
  ADD COLUMN `facilityName` varchar(256) NULL,
  ADD COLUMN `commitMode` enum('extensiv','scan') DEFAULT 'scan';
