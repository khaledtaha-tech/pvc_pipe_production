-- ==============================================================================
-- Hostinger MySQL Database Schema for Daily Production Records
-- Database: u976858450_Daily_Records
-- Collation: utf8mb4_unicode_ci
-- ==============================================================================

CREATE TABLE IF NOT EXISTS `daily_reports` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `client_id` VARCHAR(64) NULL,
  `report_date` DATE NOT NULL,
  `line_machine` VARCHAR(100) NOT NULL,
  `plant_name` VARCHAR(150) DEFAULT 'PVC PIPE EXTRUSION PLANT',

  -- Extrusion Specification Reference 1
  `ref1_od` VARCHAR(50) DEFAULT NULL,
  `ref1_wt` VARCHAR(50) DEFAULT NULL,
  `ref1_length` VARCHAR(50) DEFAULT NULL,
  `ref1_class` VARCHAR(50) DEFAULT NULL,
  `ref1_speed` DECIMAL(8,2) DEFAULT NULL,
  `ref1_std_weight` DECIMAL(8,3) DEFAULT NULL,
  `ref1_target_rate` DECIMAL(8,2) DEFAULT NULL,

  -- Extrusion Specification Reference 2
  `ref2_od` VARCHAR(50) DEFAULT NULL,
  `ref2_wt` VARCHAR(50) DEFAULT NULL,
  `ref2_length` VARCHAR(50) DEFAULT NULL,
  `ref2_class` VARCHAR(50) DEFAULT NULL,
  `ref2_speed` DECIMAL(8,2) DEFAULT NULL,
  `ref2_std_weight` DECIMAL(8,3) DEFAULT NULL,
  `ref2_target_rate` DECIMAL(8,2) DEFAULT NULL,

  -- Shift Production & Counter Summaries
  `start_counter` DECIMAL(10,2) DEFAULT 0.00,
  `end_counter` DECIMAL(10,2) DEFAULT 0.00,
  `total_output_pcs` DECIMAL(10,2) DEFAULT 0.00,
  `total_bundles` INT DEFAULT 0,
  `total_scrap_pcs` INT DEFAULT 0,
  `total_purge_kg` DECIMAL(10,2) DEFAULT 0.00,
  `haul_off_meter` VARCHAR(50) DEFAULT NULL,
  `resin_lot` VARCHAR(100) DEFAULT NULL,
  `shift1_lead` VARCHAR(100) DEFAULT NULL,
  `shift2_lead` VARCHAR(100) DEFAULT NULL,
  `plant_manager` VARCHAR(100) DEFAULT NULL,

  -- Engineering & Operational KPIs
  `operating_hours` DECIMAL(5,2) DEFAULT 0.00,
  `total_downtime_hours` DECIMAL(5,2) DEFAULT 0.00,
  `total_downtime_min` DECIMAL(8,2) DEFAULT 0.00,
  `actual_output_rate_kg_h` DECIMAL(10,2) DEFAULT 0.00,
  `nominal_capacity_kg_h` DECIMAL(10,2) DEFAULT 0.00,
  `capacity_utilization_pct` DECIMAL(5,2) DEFAULT 0.00,

  -- Overall Equipment Effectiveness (OEE) Metrics
  `availability_pct` DECIMAL(5,2) DEFAULT 0.00,
  `performance_pct` DECIMAL(5,2) DEFAULT 0.00,
  `quality_pct` DECIMAL(5,2) DEFAULT 0.00,
  `oee_pct` DECIMAL(5,2) DEFAULT 0.00,

  -- Full JSON Payload for Lossless 100% Frontend State Reconstruction
  `raw_json` LONGTEXT NULL,

  -- Record Timestamps
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Constraints and Indexes
  UNIQUE KEY `uk_date_line` (`report_date`, `line_machine`),
  INDEX `idx_report_date` (`report_date`),
  INDEX `idx_line_machine` (`line_machine`),
  INDEX `idx_oee` (`oee_pct`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hourly_records` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `report_id` INT UNSIGNED NOT NULL,
  `hour_index` TINYINT UNSIGNED NOT NULL,
  `hour_window` VARCHAR(50) NOT NULL,
  `shift` TINYINT UNSIGNED NOT NULL,
  `start_hour` TINYINT UNSIGNED NOT NULL,
  `ref_key` VARCHAR(10) DEFAULT '1',
  `downtime_min` DECIMAL(5,2) DEFAULT 0.00,
  `downtime_reason` TEXT DEFAULT NULL,
  `target_pcs` DECIMAL(8,2) DEFAULT 0.00,
  `actual_pcs` DECIMAL(8,2) DEFAULT 0.00,
  `scrap_pcs` DECIMAL(8,2) DEFAULT 0.00,
  `good_pcs` DECIMAL(8,2) DEFAULT 0.00,
  `bundles` INT DEFAULT 0,
  `purge_kg` DECIMAL(8,2) DEFAULT 0.00,
  `end_counter` DECIMAL(10,2) DEFAULT 0.00,
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign Key Constraint & Indexes
  CONSTRAINT `fk_hourly_report` FOREIGN KEY (`report_id`) REFERENCES `daily_reports` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `uk_report_hour` (`report_id`, `hour_index`),
  INDEX `idx_report_id` (`report_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `email` VARCHAR(150) NULL UNIQUE,
  `full_name` VARCHAR(150) NULL,
  `phone` VARCHAR(50) NULL,
  `password_hash` VARCHAR(255) NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'operator',
  `subscription_tier` VARCHAR(50) NOT NULL DEFAULT 'free',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 0,
  `google_id` VARCHAR(100) NULL UNIQUE,
  `avatar_url` VARCHAR(255) NULL,
  `access_expires_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_username` (`username`),
  INDEX `idx_email` (`email`),
  INDEX `idx_role` (`role`),
  INDEX `idx_tier` (`subscription_tier`),
  INDEX `idx_status` (`status`),
  INDEX `idx_google_id` (`google_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `token` VARCHAR(100) NOT NULL UNIQUE,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_token_expires` (`token`, `expires_at`),
  INDEX `idx_user_resets` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscription_tiers` (
  `tier_key` VARCHAR(50) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `features_json` LONGTEXT NOT NULL,
  `max_active_machines` INT DEFAULT 7,
  `max_monthly_reports` INT DEFAULT 100,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default subscription tiers (Price-free feature tiers)
INSERT INTO `subscription_tiers` (`tier_key`, `name`, `features_json`, `max_active_machines`, `max_monthly_reports`) VALUES
('free', 'Free Tier', '["dashboard_view", "daily_sheet_view", "basic_excel_export"]', 2, 30),
('basic', 'Basic Tier', '["dashboard_view", "daily_sheet_view", "daily_reconciliation", "manual_entry", "auto_reconcile", "basic_excel_export", "save_database"]', 7, 200),
('premium', 'Premium Tier', '["dashboard_view", "daily_sheet_view", "daily_reconciliation", "manual_entry", "auto_reconcile", "basic_excel_export", "save_database", "master_planning", "erp_data_hub", "product_catalog_admin", "high_res_audit_pdf", "unlimited_machines", "unlimited_reports", "priority_support"]', 50, 10000)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `features_json` = VALUES(`features_json`);

-- ==============================================================================
-- Central Production Log & Historical ERP Dataset Persistence
-- ==============================================================================

CREATE TABLE IF NOT EXISTS `production_log_records` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `record_date` DATE NOT NULL,
  `line_machine` VARCHAR(100) NOT NULL,
  `shift` VARCHAR(50) DEFAULT NULL,
  `item_code` VARCHAR(100) DEFAULT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `outer_diameter` VARCHAR(50) DEFAULT NULL,
  `wall_thickness` VARCHAR(50) DEFAULT NULL,
  `actual_output_kg` DECIMAL(12,2) DEFAULT 0.00,
  `scrap_kg` DECIMAL(10,2) DEFAULT 0.00,
  `operating_hours` DECIMAL(5,2) DEFAULT 0.00,
  `downtime_hours` DECIMAL(5,2) DEFAULT 0.00,
  `raw_row_json` LONGTEXT NULL,
  `upload_batch_id` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_prod_date_line` (`record_date`, `line_machine`),
  INDEX `idx_prod_item` (`item_code`),
  INDEX `idx_prod_batch` (`upload_batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `historical_erp_records` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `doc_date` DATE NOT NULL,
  `line_machine` VARCHAR(100) NOT NULL,
  `item_code` VARCHAR(100) DEFAULT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `total_weight_kg` DECIMAL(14,2) DEFAULT 0.00,
  `total_length_m` DECIMAL(14,2) DEFAULT 0.00,
  `scrap_weight_kg` DECIMAL(12,2) DEFAULT 0.00,
  `raw_row_json` LONGTEXT NULL,
  `upload_batch_id` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_erp_date` (`doc_date`),
  INDEX `idx_erp_line` (`line_machine`),
  INDEX `idx_erp_item` (`item_code`),
  INDEX `idx_erp_batch` (`upload_batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pvc_baseline_standards` (
  `line_id` VARCHAR(50) NOT NULL,
  `product_code` VARCHAR(50) NOT NULL,
  `baseline_pcs_h` INT NOT NULL,
  `notes` TEXT NULL,
  `approved_date` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`line_id`, `product_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pvc_product_catalog` (
  `item_code` VARCHAR(50) NOT NULL PRIMARY KEY,
  `description` VARCHAR(255) NOT NULL,
  `od_mm` VARCHAR(50) NULL,
  `wall_thickness` VARCHAR(50) NULL,
  `material` VARCHAR(50) DEFAULT 'uPVC',
  `unit_weight` DECIMAL(10,3) DEFAULT NULL,
  `pipe_length` DECIMAL(6,2) DEFAULT 6.00,
  `nominal_speed` DECIMAL(6,2) DEFAULT NULL,
  `target_pcs_h` INT DEFAULT NULL,
  `primary_extruder` VARCHAR(50) DEFAULT NULL,
  `compatible_machines` TEXT DEFAULT NULL,
  `historical_rate_kgh` DECIMAL(10,2) DEFAULT NULL,
  `is_pending` TINYINT(1) DEFAULT 0,
  `source` VARCHAR(50) DEFAULT 'manual',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_prod_pending` (`is_pending`),
  INDEX `idx_prod_primary` (`primary_extruder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



