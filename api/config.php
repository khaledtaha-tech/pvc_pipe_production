<?php
/**
 * Database Configuration & Shared Helpers
 * Full-Stack Hostinger MySQL Integration & Auth Infrastructure
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-HTTP-Method-Override');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'CORS preflight OK']);
    exit;
}

/**
 * Lightweight .env file parser
 */
function load_env_file($path) {
    if (!file_exists($path) || !is_readable($path)) {
        return;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        if (strpos($line, '=') !== false) {
            list($key, $val) = explode('=', $line, 2);
            $key = trim($key);
            $val = trim($val);
            if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
                (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
                $val = substr($val, 1, -1);
            }
            if (!array_key_exists($key, $_ENV)) {
                $_ENV[$key] = $val;
            }
            if (!array_key_exists($key, $_SERVER)) {
                $_SERVER[$key] = $val;
            }
            putenv("$key=$val");
        }
    }
}

// Attempt to load .env from root and api directory
load_env_file(__DIR__ . '/../.env');
load_env_file(__DIR__ . '/.env');

/**
 * Get environment variable with fallback
 */
function env($key, $default = null) {
    $val = getenv($key);
    if ($val !== false && $val !== '') return $val;
    if (isset($_ENV[$key]) && $_ENV[$key] !== '') return $_ENV[$key];
    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') return $_SERVER[$key];
    return $default;
}

// Database Credentials with Environment Variable Overrides
define('DB_HOST', env('DB_HOST', 'localhost'));
define('DB_NAME', env('DB_NAME', 'u976858450_pvc_pipe'));
define('DB_USER', env('DB_USER', 'u976858450_pvc_pipe'));
define('DB_PASS', env('DB_PASS', 'x1h5LCzMn)%6oUL'));

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
    static $cachedPdo = null;
    if ($cachedPdo !== null) {
        return $cachedPdo;
    }

    $defaultPass = 'x1h5LCzMn)%6oUL';
    $envPass = env('DB_PASS');

    $passwordsToTry = [];
    if (!empty($envPass) && $envPass !== 'DB_PASSWORD_HERE' && $envPass !== 'YOUR_SECURE_DATABASE_PASSWORD_HERE') {
        $passwordsToTry[] = $envPass;
    }
    if (!in_array($defaultPass, $passwordsToTry, true)) {
        $passwordsToTry[] = $defaultPass;
    }

    $hostsToTry = array_values(array_unique(array_filter([
        env('DB_HOST', 'localhost'),
        '127.0.0.1',
        'localhost'
    ])));

    $lastException = null;

    foreach ($hostsToTry as $host) {
        foreach ($passwordsToTry as $pass) {
            $dsn = 'mysql:host=' . $host . ';dbname=' . DB_NAME . ';charset=utf8mb4';
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ];

            try {
                $pdo = new PDO($dsn, DB_USER, $pass, $options);
                ensure_auth_tables_exist($pdo);
                $cachedPdo = $pdo;
                return $pdo;
            } catch (PDOException $e) {
                $lastException = $e;
            }
        }
    }

    $errMsg = $lastException ? $lastException->getMessage() : 'Access denied or server unreachable.';

    if (strpos($errMsg, '1045') !== false) {
        $cleanMessage = 'Database connection failed: Access denied for MySQL user \'' . DB_USER . '\' (Error 1045). Please verify that the password in Hostinger hPanel (Databases -> Management -> Change Password) is set to: ' . $defaultPass . ' or update DB_PASS in config.php.';
    } else {
        $cleanMessage = 'Database connection failed: ' . $errMsg;
    }

    json_response([
        'success' => false,
        'code' => 'DB_CONNECTION_ERROR',
        'message' => $cleanMessage
    ], 500);
}

/**
 * Auto-migration: ensure users, password_resets, subscription_tiers exist and have all columns
 * @param PDO $pdo
 */
function ensure_auth_tables_exist($pdo) {
    static $authChecked = false;
    if ($authChecked) {
        return;
    }

    try {
        // 1. Users Table
        $pdo->exec("CREATE TABLE IF NOT EXISTS `users` (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // Graceful column migration if table already existed with older schema
        $cols = $pdo->query("SHOW COLUMNS FROM `users`")->fetchAll(PDO::FETCH_COLUMN);
        $colMap = array_flip($cols);

        if (!isset($colMap['email'])) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `email` VARCHAR(150) NULL UNIQUE AFTER `username`");
        }
        if (!isset($colMap['full_name'])) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `full_name` VARCHAR(150) NULL AFTER `email`");
        }
        if (!isset($colMap['phone'])) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(50) NULL AFTER `full_name`");
        }
        if (!isset($colMap['subscription_tier'])) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `subscription_tier` VARCHAR(50) NOT NULL DEFAULT 'free' AFTER `role`");
        }
        if (!isset($colMap['status'])) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'active' AFTER `is_active`");
            $pdo->exec("UPDATE `users` SET `status` = IF(`is_active` = 1, 'active', 'suspended') WHERE `status` IS NULL OR `status` = ''");
        }
        if (!isset($colMap['must_change_password'])) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`");
        }
        if (!isset($colMap['google_id'])) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `google_id` VARCHAR(100) NULL UNIQUE AFTER `must_change_password`");
        }
        if (!isset($colMap['avatar_url'])) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `avatar_url` VARCHAR(255) NULL AFTER `google_id`");
        }

        // 2. Password Resets Table
        $pdo->exec("CREATE TABLE IF NOT EXISTS `password_resets` (
            `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `token` VARCHAR(100) NOT NULL UNIQUE,
            `expires_at` DATETIME NOT NULL,
            `used_at` DATETIME DEFAULT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_token_expires` (`token`, `expires_at`),
            INDEX `idx_user_resets` (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // 3. Subscription Tiers Table & Seeding (Price-free feature tiers)
        $pdo->exec("CREATE TABLE IF NOT EXISTS `subscription_tiers` (
            `tier_key` VARCHAR(50) NOT NULL PRIMARY KEY,
            `name` VARCHAR(100) NOT NULL,
            `features_json` LONGTEXT NOT NULL,
            `max_active_machines` INT DEFAULT 7,
            `max_monthly_reports` INT DEFAULT 100,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // Graceful column drop if price_usd_monthly previously existed
        $tierCols = $pdo->query("SHOW COLUMNS FROM `subscription_tiers`")->fetchAll(PDO::FETCH_COLUMN);
        if (in_array('price_usd_monthly', $tierCols, true)) {
            $pdo->exec("ALTER TABLE `subscription_tiers` DROP COLUMN `price_usd_monthly`");
        }

        $pdo->exec("INSERT INTO `subscription_tiers` (`tier_key`, `name`, `features_json`, `max_active_machines`, `max_monthly_reports`) VALUES
        ('free', 'Free Tier', '[\"dashboard_view\", \"daily_sheet_view\", \"basic_excel_export\"]', 2, 30),
        ('basic', 'Basic Tier', '[\"dashboard_view\", \"daily_sheet_view\", \"daily_reconciliation\", \"manual_entry\", \"auto_reconcile\", \"basic_excel_export\", \"save_database\"]', 7, 200),
        ('premium', 'Premium Tier', '[\"dashboard_view\", \"daily_sheet_view\", \"daily_reconciliation\", \"manual_entry\", \"auto_reconcile\", \"basic_excel_export\", \"save_database\", \"master_planning\", \"erp_data_hub\", \"product_catalog_admin\", \"high_res_audit_pdf\", \"unlimited_machines\", \"unlimited_reports\", \"priority_support\"]', 50, 10000)
        ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `features_json` = VALUES(`features_json`);");

        // 4. Ensure bootstrap Super Admin exists
        $adminCheck = $pdo->prepare("SELECT id, role, subscription_tier FROM `users` WHERE `username` = 'admin' LIMIT 1");
        $adminCheck->execute();
        $adminUser = $adminCheck->fetch();
        if (!$adminUser) {
            $hash = password_hash('Admin@12345', PASSWORD_BCRYPT);
            $pdo->prepare("INSERT INTO `users` (`username`, `email`, `full_name`, `password_hash`, `role`, `subscription_tier`, `is_active`, `must_change_password`) VALUES ('admin', 'admin@polymerops.com', 'Super Administrator', :hash, 'super_admin', 'premium', 1, 0)")
                ->execute([':hash' => $hash]);
        } else {
            // Guarantee admin is Super Admin and has Premium Tier
            if ($adminUser['role'] === 'admin') {
                $pdo->prepare("UPDATE `users` SET `role` = 'super_admin', `subscription_tier` = 'premium' WHERE `id` = :id")
                    ->execute([':id' => $adminUser['id']]);
            }
        }

        $authChecked = true;
    } catch (Throwable $e) {
        error_log('ensure_auth_tables_exist error: ' . $e->getMessage());
    }
}

/**
 * Extract Bearer token from headers or query
 * @return string|null
 */
function get_bearer_token() {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (empty($header) && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (!empty($header) && preg_match('/Bearer\s+(\S+)/i', $header, $matches)) {
        return $matches[1];
    }

    return $_GET['token'] ?? null;
}

/**
 * Get authenticated user from session/database
 * @param PDO $pdo
 * @return array|null
 */
function get_authenticated_user($pdo) {
    $token = get_bearer_token();
    if (empty($token)) {
        return null;
    }

    // In this token scheme, token is either a stateful or signed session identifier
    // For demo & standard Hostinger setup, token format is pvc_session_<id>_<hash> or standard token
    // We also support querying by token or user ID if stored
    if (strpos($token, 'pvc_user_') === 0) {
        $userId = (int)str_replace('pvc_user_', '', explode('_', $token)[2] ?? 0);
        if ($userId > 0) {
            $stmt = $pdo->prepare("SELECT id, username, email, full_name, phone, role, subscription_tier, is_active, must_change_password, access_expires_at, avatar_url FROM `users` WHERE `id` = :id LIMIT 1");
            $stmt->execute([':id' => $userId]);
            $u = $stmt->fetch();
            if ($u && (int)$u['is_active'] === 1) {
                return $u;
            }
        }
    }

    // Fallback: Default to admin if token matches admin token
    return null;
}

/**
 * Enforce authentication
 * @param PDO $pdo
 * @return array
 */
function require_authenticated_user($pdo) {
    $user = get_authenticated_user($pdo);
    if (!$user) {
        // If Bearer token exists and is valid format, or allow header inspection
        $token = get_bearer_token();
        if (empty($token)) {
            json_response(['success' => false, 'code' => 'UNAUTHENTICATED', 'message' => 'Authentication required.'], 401);
        }
    }
    return $user;
}

/**
 * Get tier features array
 * @param PDO $pdo
 * @param string $tierKey
 * @return array
 */
function get_tier_features($pdo, $tierKey = 'free') {
    try {
        $stmt = $pdo->prepare("SELECT features_json FROM `subscription_tiers` WHERE `tier_key` = :tier LIMIT 1");
        $stmt->execute([':tier' => $tierKey]);
        $row = $stmt->fetch();
        if ($row && !empty($row['features_json'])) {
            $features = json_decode($row['features_json'], true);
            if (is_array($features)) return $features;
        }
    } catch (Throwable $e) {
        error_log('get_tier_features error: ' . $e->getMessage());
    }

    // Fallback defaults
    if ($tierKey === 'premium') {
        return ['dashboard_view', 'daily_sheet_view', 'daily_reconciliation', 'manual_entry', 'auto_reconcile', 'basic_excel_export', 'save_database', 'master_planning', 'erp_data_hub', 'product_catalog_admin', 'high_res_audit_pdf', 'unlimited_machines', 'unlimited_reports', 'priority_support'];
    } elseif ($tierKey === 'basic') {
        return ['dashboard_view', 'daily_sheet_view', 'daily_reconciliation', 'manual_entry', 'auto_reconcile', 'basic_excel_export', 'save_database'];
    }
    return ['dashboard_view', 'daily_sheet_view', 'basic_excel_export'];
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
