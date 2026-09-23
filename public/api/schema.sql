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
  `password_hash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'operator',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `access_expires_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_username` (`username`),
  INDEX `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

