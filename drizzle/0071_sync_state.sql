-- Migration 0071: sync_state table
-- Tracks the last successful sync timestamp per (config_id, facility_id, sync_type)
-- Used by incremental sync jobs to only fetch new/updated records from Extensiv.

CREATE TABLE IF NOT EXISTS sync_state (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  config_id     INT         NOT NULL,
  facility_id   INT         NOT NULL DEFAULT 0,  -- 0 = all facilities / not facility-scoped
  sync_type     VARCHAR(64) NOT NULL,             -- e.g. 'mu_on_file', 'item_dims'
  last_synced_at BIGINT     NOT NULL,             -- Unix ms of last successful sync end
  updated_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sync_state (config_id, facility_id, sync_type)
);
