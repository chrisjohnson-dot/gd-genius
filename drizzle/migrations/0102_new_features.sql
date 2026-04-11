-- Media Attachments (Photo Capture)
CREATE TABLE IF NOT EXISTS media_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  category ENUM('item_condition','packaging','damage','label','other') NOT NULL DEFAULT 'other',
  file_key VARCHAR(512) NOT NULL,
  file_url TEXT NOT NULL,
  file_size_bytes INT NOT NULL DEFAULT 0,
  mime_type VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
  width INT,
  height INT,
  note TEXT,
  captured_by INT,
  captured_at BIGINT NOT NULL,
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_captured_by (captured_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Throughput Snapshots (Predictive Workload)
CREATE TABLE IF NOT EXISTS throughput_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warehouse_id VARCHAR(64) NOT NULL,
  stage VARCHAR(64) NOT NULL,
  hour_bucket BIGINT NOT NULL,
  orders_processed INT NOT NULL DEFAULT 0,
  worker_count INT NOT NULL DEFAULT 0,
  avg_time_seconds INT NOT NULL DEFAULT 0,
  recorded_at BIGINT NOT NULL,
  INDEX idx_wh_stage_hour (warehouse_id, stage, hour_bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Workload Forecasts (Predictive Workload)
CREATE TABLE IF NOT EXISTS workload_forecasts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warehouse_id VARCHAR(64) NOT NULL,
  forecast_at BIGINT NOT NULL,
  stage VARCHAR(64) NOT NULL,
  current_queue INT NOT NULL DEFAULT 0,
  projected_completion_at BIGINT,
  sla_breach_count INT NOT NULL DEFAULT 0,
  throughput_per_hour DECIMAL(8,2) NOT NULL DEFAULT 0,
  required_throughput DECIMAL(8,2) NOT NULL DEFAULT 0,
  bottleneck TINYINT(1) NOT NULL DEFAULT 0,
  actual_breach_count INT,
  INDEX idx_wh_forecast (warehouse_id, forecast_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Onboarding Steps (Guided Onboarding)
CREATE TABLE IF NOT EXISTS onboarding_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role VARCHAR(64) NOT NULL,
  step_order INT NOT NULL,
  step_key VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  target_route VARCHAR(255),
  target_selector VARCHAR(255),
  action_type ENUM('navigate','highlight','interact','read') NOT NULL DEFAULT 'navigate',
  INDEX idx_role_order (role, step_order),
  UNIQUE KEY uq_step_key (step_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Onboarding Progress (Guided Onboarding)
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  step_key VARCHAR(128) NOT NULL,
  completed_at BIGINT,
  skipped TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_user_step (user_id, step_key),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
