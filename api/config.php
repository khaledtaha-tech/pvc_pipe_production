<?php
/**
 * Database Configuration & Shared Helpers
 * Hostinger MySQL Integration for Daily_Records
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'CORS preflight OK']);
    exit;
}

// Database Credentials
define('DB_HOST', 'localhost');
define('DB_NAME', 'u976858450_pvc_pipe');
define('DB_USER', 'u976858450_pvc_pipe');
define('DB_PASS', 'x1h5LCzMn)%6oUL');

/**
 * Standard JSON response helper
 */
function json_response($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * Establish secure PDO database connection
 * @return PDO
 */
function get_db_connection() {
    if (DB_PASS === 'DB_PASSWORD_HERE') {
        json_response([
            'success' => false,
            'code' => 'DB_CONFIG_REQUIRED',
            'message' => 'Database password has not been configured in api/config.php. Please set the real password in Hostinger File Manager.'
        ], 503);
    }

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
    ];

    try {
        return new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $e) {
        json_response([
            'success' => false,
            'code' => 'DB_CONNECTION_ERROR',
            'message' => 'Database connection failed: ' . $e->getMessage()
        ], 500);
    }
}

/**
 * Ensure dataset tables exist in MySQL database (auto-migration)
 * @param PDO $pdo
 */
function ensure_dataset_tables_exist($pdo) {
    static $checked = false;
    if ($checked) {
        return;
    }

    $sql1 = "CREATE TABLE IF NOT EXISTS `production_log_records` (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

    $sql2 = "CREATE TABLE IF NOT EXISTS `historical_erp_records` (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

    try {
        $pdo->exec($sql1);
        $pdo->exec($sql2);
        $checked = true;
    } catch (Exception $e) {
        error_log('ensure_dataset_tables_exist notice: ' . $e->getMessage());
    }
}
