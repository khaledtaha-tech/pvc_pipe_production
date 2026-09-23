<?php
/**
 * API Endpoint: User Authentication (Login)
 * Method: POST
 * Hostinger MySQL Integration
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method Not Allowed. Use POST.'], 405);
}

$rawInput = file_get_contents('php://input');
if (empty($rawInput)) {
    json_response(['success' => false, 'message' => 'Empty request body'], 400);
}

$payload = json_decode($rawInput, true);
if (!is_array($payload)) {
    json_response(['success' => false, 'message' => 'Invalid JSON payload'], 400);
}

$username = trim($payload['username'] ?? '');
$password = (string)($payload['password'] ?? '');

if ($username === '' || $password === '') {
    json_response(['success' => false, 'message' => 'Username and password are required'], 400);
}

$pdo = get_db_connection();

// Ensure users table exists
$tableSql = "CREATE TABLE IF NOT EXISTS `users` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
$pdo->exec($tableSql);

// Fetch user by username
$stmt = $pdo->prepare('SELECT id, username, password_hash, role, is_active, access_expires_at FROM `users` WHERE `username` = :username LIMIT 1');
$stmt->execute([':username' => $username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    json_response(['success' => false, 'message' => 'Invalid username or password'], 401);
}

// Check if account is active
if ((int)$user['is_active'] !== 1) {
    json_response(['success' => false, 'message' => 'Account is disabled'], 403);
}

// Check if access has expired
if (!empty($user['access_expires_at'])) {
    $expiresAt = strtotime($user['access_expires_at']);
    if ($expiresAt !== false && time() > $expiresAt) {
        json_response(['success' => false, 'message' => 'Account access has expired'], 403);
    }
}

// Generate session token
$token = bin2hex(random_bytes(32));

json_response([
    'success' => true,
    'token' => $token,
    'user' => [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'role' => $user['role'],
        'access_expires_at' => $user['access_expires_at']
    ]
]);
