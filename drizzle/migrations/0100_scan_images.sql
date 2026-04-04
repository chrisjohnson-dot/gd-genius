-- Migration: Add scan image columns to production_scans and Camera C / retention to label_scan_settings

-- Camera A/B pre-apply images and Camera C post-apply image on production_scans
ALTER TABLE production_scans
  ADD COLUMN camAImageUrl VARCHAR(1024) NULL,
  ADD COLUMN camAImageKey VARCHAR(512) NULL,
  ADD COLUMN camBImageUrl VARCHAR(1024) NULL,
  ADD COLUMN camBImageKey VARCHAR(512) NULL,
  ADD COLUMN postApplyImageUrl VARCHAR(1024) NULL,
  ADD COLUMN postApplyImageKey VARCHAR(512) NULL,
  ADD COLUMN postApplyReceivedAt TIMESTAMP NULL;

-- Camera C seat and image retention policy on label_scan_settings
ALTER TABLE label_scan_settings
  ADD COLUMN camCIp VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN camCPort INT NOT NULL DEFAULT 8080,
  ADD COLUMN scanImageRetentionDays INT NOT NULL DEFAULT 60;
