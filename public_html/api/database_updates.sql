-- ==============================================================================
-- PVC PIPE PRODUCTION - Comprehensive Database Migration & Update Script
-- Hostinger Database: u976858450_pvc_pipe
-- Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- Safe & Idempotent: Can be run multiple times without duplicate errors
-- Features: Full Auth (RBAC), Pending User Approval, Price-Free Subscription Tiers
-- ==============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- 1. Create or Verify Base Tables
-- ------------------------------------------------------------------------------

-- Users Table
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

-- Password Resets Table
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

-- Subscription Tiers Table (Strictly NO price columns)
CREATE TABLE IF NOT EXISTS `subscription_tiers` (
  `tier_key` VARCHAR(50) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `features_json` LONGTEXT NOT NULL,
  `max_active_machines` INT DEFAULT 7,
  `max_monthly_reports` INT DEFAULT 100,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Idempotent Column & Index Migration Procedure
--    Safely alters existing tables only if columns or indexes are missing
-- ------------------------------------------------------------------------------

DELIMITER $$

DROP PROCEDURE IF EXISTS `ApplyPvcSchemaUpdates`$$
CREATE PROCEDURE `ApplyPvcSchemaUpdates`()
BEGIN
  -- 2.1 USERS TABLE: Check and add missing columns
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `email` VARCHAR(150) NULL UNIQUE AFTER `username`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'full_name'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `full_name` VARCHAR(150) NULL AFTER `email`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(50) NULL AFTER `full_name`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `role` VARCHAR(50) NOT NULL DEFAULT 'operator' AFTER `password_hash`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'subscription_tier'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `subscription_tier` VARCHAR(50) NOT NULL DEFAULT 'free' AFTER `role`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `subscription_tier`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'active' AFTER `is_active`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'google_id'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `google_id` VARCHAR(100) NULL UNIQUE AFTER `must_change_password`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar_url'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `avatar_url` VARCHAR(255) NULL AFTER `google_id`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'access_expires_at'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `access_expires_at` DATETIME DEFAULT NULL AFTER `avatar_url`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'updated_at'
  ) THEN
    ALTER TABLE `users` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;
  END IF;

  -- 2.2 USERS TABLE: Check and add indexes
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_status'
  ) THEN
    ALTER TABLE `users` ADD INDEX `idx_status` (`status`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_tier'
  ) THEN
    ALTER TABLE `users` ADD INDEX `idx_tier` (`subscription_tier`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_role'
  ) THEN
    ALTER TABLE `users` ADD INDEX `idx_role` (`role`);
  END IF;

  -- 2.3 SUBSCRIPTION_TIERS: Remove price_usd_monthly if it existed previously
  IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscription_tiers' AND COLUMN_NAME = 'price_usd_monthly'
  ) THEN
    ALTER TABLE `subscription_tiers` DROP COLUMN `price_usd_monthly`;
  END IF;

  -- 2.4 Synchronize user statuses for existing rows
  UPDATE `users` 
  SET `status` = IF(`is_active` = 1, 'active', 'suspended') 
  WHERE `status` IS NULL OR `status` = '';

END$$

DELIMITER ;

-- Execute the update procedure
CALL `ApplyPvcSchemaUpdates`();

-- Clean up migration procedure
DROP PROCEDURE IF EXISTS `ApplyPvcSchemaUpdates`;

-- ------------------------------------------------------------------------------
-- 3. Seed Default Subscription Tiers (Price-Free Feature Tiers: Basic, Pro, Enterprise, Premium)
-- ------------------------------------------------------------------------------

-- Migrate any users currently on 'free' to 'basic' and purge 'free' tier
UPDATE `users` SET `subscription_tier` = 'basic' WHERE `subscription_tier` = 'free' OR `subscription_tier` IS NULL OR `subscription_tier` = '';
DELETE FROM `subscription_tiers` WHERE `tier_key` = 'free';

INSERT INTO `subscription_tiers` (`tier_key`, `name`, `features_json`, `max_active_machines`, `max_monthly_reports`) VALUES
('basic', 'Basic Tier', '["dashboard_view", "daily_sheet_view", "daily_reconciliation", "basic_excel_export", "save_database"]', 3, 100),
('pro', 'Professional Tier', '["dashboard_view", "daily_sheet_view", "daily_reconciliation", "manual_entry", "auto_reconcile", "basic_excel_export", "save_database", "machine_settings", "shift_sop_pdf"]', 7, 300),
('enterprise', 'Enterprise Tier', '["dashboard_view", "daily_sheet_view", "daily_reconciliation", "manual_entry", "auto_reconcile", "basic_excel_export", "save_database", "machine_settings", "shift_sop_pdf", "master_planning", "erp_data_hub", "unique_catalog_matrix", "high_res_audit_pdf"]', 15, 1500),
('premium', 'Premium Tier', '["dashboard_view", "daily_sheet_view", "daily_reconciliation", "manual_entry", "auto_reconcile", "basic_excel_export", "save_database", "machine_settings", "shift_sop_pdf", "master_planning", "erp_data_hub", "unique_catalog_matrix", "high_res_audit_pdf", "product_catalog_admin", "unlimited_machines", "unlimited_reports", "user_rbac_management", "priority_support"]', 50, 10000)
ON DUPLICATE KEY UPDATE 
  `name` = VALUES(`name`), 
  `features_json` = VALUES(`features_json`),
  `max_active_machines` = VALUES(`max_active_machines`),
  `max_monthly_reports` = VALUES(`max_monthly_reports`);

-- ------------------------------------------------------------------------------
-- 4. Ensure Default Root Super Admin Exists
-- ------------------------------------------------------------------------------

INSERT INTO `users` (`username`, `email`, `full_name`, `password_hash`, `role`, `subscription_tier`, `is_active`, `status`, `must_change_password`)
VALUES (
  'admin',
  'admin@polymerops.com',
  'Super Administrator',
  '$2y$10$eEcfq20Hh1wYj5JkWp/s4.vD9zXj96rVlh3qFz87E1cZkW4o1gKqu', -- Admin@12345
  'super_admin',
  'premium',
  1,
  'active',
  0
)
ON DUPLICATE KEY UPDATE 
  `role` = 'super_admin', 
  `subscription_tier` = 'premium',
  `is_active` = 1,
  `status` = 'active';

SET FOREIGN_KEY_CHECKS = 1;

-- ==============================================================================
-- End of Migration Script
-- ==============================================================================
