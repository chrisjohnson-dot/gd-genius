-- Migration: Create b2b_cadence_cache table
-- Pre-aggregated B2B order drop cadence data derived from order_tracking.
-- Refreshed nightly by /api/scheduled/refreshCadenceCache heartbeat.

CREATE TABLE IF NOT EXISTS `b2b_cadence_cache` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `facility_id` int,
  `client_id` int,
  `row_type` enum('weekday_avg','weekly_vol') NOT NULL,
  `week_iso` varchar(10),
  `dow` int NOT NULL,
  `order_count` int NOT NULL DEFAULT 0,
  `total_units` int NOT NULL DEFAULT 0,
  `avg_units_per_order` decimal(10,4),
  `computed_at` timestamp NOT NULL DEFAULT (now())
);

CREATE INDEX `b2b_cadence_cache_row_type_idx` ON `b2b_cadence_cache` (`row_type`);
CREATE INDEX `b2b_cadence_cache_facility_client_idx` ON `b2b_cadence_cache` (`facility_id`, `client_id`);
