<?php
/**
 * API Endpoint: User Management (CRUD)
 * Methods: GET, POST, PUT, DELETE, OPTIONS
 * Hostinger MySQL Integration
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-HTTP-Method-Override');

// Handle preflight OPTIONS immediately
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'CORS preflight OK']);
    exit;
}

require_once __DIR__ . '/config.php';

// Detect request method (with support for method spoofing)
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST') {
    if (isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
        $method = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
    } elseif (isset($_GET['_method'])) {
        $method = strtoupper($_GET['_method']);
    }
}

// Helper to parse JSON input
function get_json_input() {
    $raw = file_get_contents('php://input');
    if (empty($raw)) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// Helper to sanitize date/datetime or return null
function sanitize_datetime($dt) {
    if (empty($dt) || $dt === 'null' || $dt === null) return null;
    $timestamp = strtotime((string)$dt);
    if ($timestamp === false) return null;
    return date('Y-m-d H:i:s', $timestamp);
}

try {
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

    // -----------------------------------------------------------------------------
    // 1. GET: List All Users (Excludes password_hash)
    // -----------------------------------------------------------------------------
    if ($method === 'GET') {
        // If specific ID requested
        if (!empty($_GET['id'])) {
            $stmt = $pdo->prepare('SELECT id, username, role, is_active, access_expires_at, created_at FROM `users` WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => (int)$_GET['id']]);
            $user = $stmt->fetch();
            if (!$user) {
                json_response(['success' => false, 'message' => 'User not found'], 404);
            }
            $user['id'] = (int)$user['id'];
            $user['is_active'] = (int)$user['is_active'];
            json_response(['success' => true, 'user' => $user]);
        }

        $stmt = $pdo->query('SELECT id, username, role, is_active, access_expires_at, created_at FROM `users` ORDER BY id ASC');
        $users = $stmt->fetchAll();

        foreach ($users as &$u) {
            $u['id'] = (int)$u['id'];
            $u['is_active'] = (int)$u['is_active'];
        }
        unset($u);

        json_response([
            'success' => true,
            'count' => count($users),
            'users' => $users
        ]);
    }

    // -----------------------------------------------------------------------------
    // 2. POST: Create New User
    // -----------------------------------------------------------------------------
    if ($method === 'POST') {
        $input = get_json_input();

        $username = trim($input['username'] ?? '');
        $password = (string)($input['password'] ?? '');
        $role = trim($input['role'] ?? 'operator');
        $isActive = isset($input['is_active']) ? ((int)$input['is_active'] ? 1 : 0) : 1;
        $accessExpiresAt = sanitize_datetime($input['access_expires_at'] ?? null);

        if ($username === '') {
            json_response(['success' => false, 'message' => 'Username is required'], 400);
        }
        if ($password === '') {
            json_response(['success' => false, 'message' => 'Password is required'], 400);
        }

        // Check if username already exists
        $checkStmt = $pdo->prepare('SELECT id FROM `users` WHERE username = :username LIMIT 1');
        $checkStmt->execute([':username' => $username]);
        if ($checkStmt->fetch()) {
            json_response(['success' => false, 'message' => 'Username already exists'], 409);
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT);

        $insertStmt = $pdo->prepare('INSERT INTO `users` (username, password_hash, role, is_active, access_expires_at) VALUES (:username, :password_hash, :role, :is_active, :access_expires_at)');
        $insertStmt->execute([
            ':username' => $username,
            ':password_hash' => $passwordHash,
            ':role' => $role,
            ':is_active' => $isActive,
            ':access_expires_at' => $accessExpiresAt
        ]);

        $newId = (int)$pdo->lastInsertId();

        json_response([
            'success' => true,
            'message' => 'User created successfully',
            'user' => [
                'id' => $newId,
                'username' => $username,
                'role' => $role,
                'is_active' => $isActive,
                'access_expires_at' => $accessExpiresAt
            ]
        ], 201);
    }

    // -----------------------------------------------------------------------------
    // 3. PUT: Update User (is_active, access_expires_at, role, password)
    // -----------------------------------------------------------------------------
    if ($method === 'PUT') {
        $input = get_json_input();
        $id = isset($input['id']) ? (int)$input['id'] : (isset($_GET['id']) ? (int)$_GET['id'] : 0);

        if ($id <= 0) {
            json_response(['success' => false, 'message' => 'Valid User ID is required'], 400);
        }

        // Fetch existing record
        $fetchStmt = $pdo->prepare('SELECT id, username, role, is_active, access_expires_at FROM `users` WHERE id = :id LIMIT 1');
        $fetchStmt->execute([':id' => $id]);
        $existing = $fetchStmt->fetch();

        if (!$existing) {
            json_response(['success' => false, 'message' => 'User not found'], 404);
        }

        // Protection rule: Prevent deactivating or demoting the last active admin
        $isCurrentlyAdmin = ($existing['role'] === 'admin' && (int)$existing['is_active'] === 1);
        $willDeactivate = (isset($input['is_active']) && (int)$input['is_active'] === 0);
        $willDemote = (isset($input['role']) && trim($input['role']) !== 'admin');

        if ($isCurrentlyAdmin && ($willDeactivate || $willDemote)) {
            $adminCountStmt = $pdo->prepare("SELECT COUNT(*) FROM `users` WHERE role = 'admin' AND is_active = 1 AND id != :id");
            $adminCountStmt->execute([':id' => $id]);
            $remainingAdmins = (int)$adminCountStmt->fetchColumn();

            if ($remainingAdmins === 0) {
                json_response(['success' => false, 'message' => 'Cannot deactivate or demote the last remaining active admin'], 400);
            }
        }

        $updates = [];
        $params = [':id' => $id];

        if (isset($input['username'])) {
            $newUsername = trim($input['username']);
            if ($newUsername !== '' && $newUsername !== $existing['username']) {
                $uCheck = $pdo->prepare('SELECT id FROM `users` WHERE username = :username AND id != :id LIMIT 1');
                $uCheck->execute([':username' => $newUsername, ':id' => $id]);
                if ($uCheck->fetch()) {
                    json_response(['success' => false, 'message' => 'Username already in use by another account'], 409);
                }
                $updates[] = '`username` = :username';
                $params[':username'] = $newUsername;
            }
        }

        if (isset($input['role'])) {
            $updates[] = '`role` = :role';
            $params[':role'] = trim($input['role']);
        }

        if (isset($input['is_active'])) {
            $updates[] = '`is_active` = :is_active';
            $params[':is_active'] = (int)$input['is_active'] ? 1 : 0;
        }

        if (array_key_exists('access_expires_at', $input)) {
            $updates[] = '`access_expires_at` = :access_expires_at';
            $params[':access_expires_at'] = sanitize_datetime($input['access_expires_at']);
        }

        if (!empty($input['password'])) {
            $updates[] = '`password_hash` = :password_hash';
            $params[':password_hash'] = password_hash((string)$input['password'], PASSWORD_BCRYPT);
        }

        if (empty($updates)) {
            json_response(['success' => true, 'message' => 'No changes submitted', 'user' => $existing]);
        }

        $sql = 'UPDATE `users` SET ' . implode(', ', $updates) . ' WHERE id = :id';
        $updateStmt = $pdo->prepare($sql);
        $updateStmt->execute($params);

        // Fetch updated user
        $refetchStmt = $pdo->prepare('SELECT id, username, role, is_active, access_expires_at, created_at FROM `users` WHERE id = :id LIMIT 1');
        $refetchStmt->execute([':id' => $id]);
        $updatedUser = $refetchStmt->fetch();
        $updatedUser['id'] = (int)$updatedUser['id'];
        $updatedUser['is_active'] = (int)$updatedUser['is_active'];

        json_response([
            'success' => true,
            'message' => 'User updated successfully',
            'user' => $updatedUser
        ]);
    }

    // -----------------------------------------------------------------------------
    // 4. DELETE: Delete User (Cannot delete last active admin)
    // -----------------------------------------------------------------------------
    if ($method === 'DELETE') {
        $input = get_json_input();
        $id = isset($_GET['id']) ? (int)$_GET['id'] : (isset($input['id']) ? (int)$input['id'] : 0);

        if ($id <= 0) {
            json_response(['success' => false, 'message' => 'Valid User ID is required'], 400);
        }

        $fetchStmt = $pdo->prepare('SELECT id, username, role, is_active FROM `users` WHERE id = :id LIMIT 1');
        $fetchStmt->execute([':id' => $id]);
        $existing = $fetchStmt->fetch();

        if (!$existing) {
            json_response(['success' => false, 'message' => 'User not found'], 404);
        }

        // Protection rule: Prevent deleting the last active admin
        if ($existing['role'] === 'admin') {
            $adminCountStmt = $pdo->prepare("SELECT COUNT(*) FROM `users` WHERE role = 'admin' AND is_active = 1 AND id != :id");
            $adminCountStmt->execute([':id' => $id]);
            $remainingAdmins = (int)$adminCountStmt->fetchColumn();

            if ($remainingAdmins === 0) {
                json_response(['success' => false, 'message' => 'Cannot delete the last remaining active admin'], 400);
            }
        }

        $delStmt = $pdo->prepare('DELETE FROM `users` WHERE id = :id');
        $delStmt->execute([':id' => $id]);

        json_response([
            'success' => true,
            'message' => 'User deleted successfully'
        ]);
    }

    json_response(['success' => false, 'message' => 'Method Not Allowed'], 405);

} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'User management error: ' . $e->getMessage()
    ], 500);
}
