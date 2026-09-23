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
define('DB_NAME', 'u976858450_Daily_Records');
define('DB_USER', 'u976858450_Daily_Records');
define('DB_PASS', 'DB_PASSWORD_HERE'); // Replace with live database password

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
