<?php
/**
 * API Endpoint: User Management (RBAC & Tier Control)
 * Methods: GET, POST, PUT, DELETE, OPTIONS
 * Hostinger MySQL Integration & Super Admin User Management
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
    ensure_auth_tables_exist($pdo);

    // -----------------------------------------------------------------------------
    // 1. GET: List All Users (Excludes password_hash)
    // -----------------------------------------------------------------------------
    if ($method === 'GET') {
        // If specific ID requested
        if (!empty($_GET['id'])) {
            $stmt = $pdo->prepare('SELECT id, username, email, full_name, phone, role, subscription_tier, is_active, status, must_change_password, avatar_url, access_expires_at, created_at, updated_at FROM `users` WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => (int)$_GET['id']]);
            $user = $stmt->fetch();
            if (!$user) {
                json_response(['success' => false, 'message' => 'User not found'], 404);
            }
            $user['id'] = (int)$user['id'];
            $user['is_active'] = (int)$user['is_active'];
            $user['status'] = strtolower($user['status'] ?? ($user['is_active'] ? 'active' : 'suspended'));
            $user['must_change_password'] = (int)$user['must_change_password'];
            $user['features'] = get_tier_features($pdo, $user['subscription_tier'] ?? 'basic');
            json_response(['success' => true, 'user' => $user]);
        }

        $stmt = $pdo->query('SELECT id, username, email, full_name, phone, role, subscription_tier, is_active, status, must_change_password, avatar_url, access_expires_at, created_at, updated_at FROM `users` ORDER BY id ASC');
        $users = $stmt->fetchAll();

        foreach ($users as &$u) {
            $u['id'] = (int)$u['id'];
            $u['is_active'] = (int)$u['is_active'];
            $u['status'] = strtolower($u['status'] ?? ($u['is_active'] ? 'active' : 'suspended'));
            $u['must_change_password'] = (int)$u['must_change_password'];
            $u['features'] = get_tier_features($pdo, $u['subscription_tier'] ?? 'basic');
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
        $email = !empty($input['email']) ? strtolower(trim($input['email'])) : null;
        $fullName = !empty($input['full_name']) ? trim($input['full_name']) : null;
        $phone = !empty($input['phone']) ? trim($input['phone']) : null;
        $role = trim($input['role'] ?? 'operator');
        $tier = trim($input['subscription_tier'] ?? 'basic');
        $isActive = isset($input['is_active']) ? ((int)$input['is_active'] ? 1 : 0) : 1;
        // Default must_change_password to 1 so registered users are prompted on first login
        $mustChangePassword = isset($input['must_change_password']) ? ((int)$input['must_change_password'] ? 1 : 0) : 1;
        $accessExpiresAt = sanitize_datetime($input['access_expires_at'] ?? null);

        if ($username === '') {
            json_response(['success' => false, 'message' => 'Username is required'], 400);
        }
        if ($password === '') {
            json_response(['success' => false, 'message' => 'Password is required'], 400);
        }

        // Validate valid roles & tiers
        $validRoles = ['super_admin', 'admin', 'supervisor', 'operator', 'viewer'];
        if (!in_array($role, $validRoles, true)) {
            $role = 'operator';
        }

        $validTiers = ['basic', 'pro', 'enterprise', 'premium'];
        if (!in_array($tier, $validTiers, true)) {
            $tier = 'basic';
        }

        // Check if username already exists
        $checkStmt = $pdo->prepare('SELECT id FROM `users` WHERE username = :username LIMIT 1');
        $checkStmt->execute([':username' => $username]);
        if ($checkStmt->fetch()) {
            json_response(['success' => false, 'message' => 'Username already exists'], 409);
        }

        // Check if email already exists
        if (!empty($email)) {
            $checkEmail = $pdo->prepare('SELECT id FROM `users` WHERE email = :email LIMIT 1');
            $checkEmail->execute([':email' => $email]);
            if ($checkEmail->fetch()) {
                json_response(['success' => false, 'message' => 'Email address is already in use by another account'], 409);
            }
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        $status = trim($input['status'] ?? ($isActive ? 'active' : 'pending'));

        $insertStmt = $pdo->prepare('INSERT INTO `users` (username, email, full_name, phone, password_hash, role, subscription_tier, is_active, status, must_change_password, access_expires_at) VALUES (:username, :email, :full_name, :phone, :password_hash, :role, :subscription_tier, :is_active, :status, :must_change_password, :access_expires_at)');
        $insertStmt->execute([
            ':username' => $username,
            ':email' => $email,
            ':full_name' => $fullName,
            ':phone' => $phone,
            ':password_hash' => $passwordHash,
            ':role' => $role,
            ':subscription_tier' => $tier,
            ':is_active' => $isActive,
            ':status' => $status,
            ':must_change_password' => $mustChangePassword,
            ':access_expires_at' => $accessExpiresAt
        ]);

        $newId = (int)$pdo->lastInsertId();

        json_response([
            'success' => true,
            'message' => 'User created successfully',
            'user' => [
                'id' => $newId,
                'username' => $username,
                'email' => $email,
                'full_name' => $fullName,
                'phone' => $phone,
                'role' => $role,
                'subscription_tier' => $tier,
                'is_active' => $isActive,
                'status' => $status,
                'must_change_password' => $mustChangePassword,
                'access_expires_at' => $accessExpiresAt,
                'features' => get_tier_features($pdo, $tier)
            ]
        ], 201);
    }

    // -----------------------------------------------------------------------------
    // 3. PUT: Update User (Allow/Suspend, Tier, Role, Password, Details)
    // -----------------------------------------------------------------------------
    if ($method === 'PUT') {
        $input = get_json_input();
        $id = isset($input['id']) ? (int)$input['id'] : (isset($_GET['id']) ? (int)$_GET['id'] : 0);

        if ($id <= 0) {
            json_response(['success' => false, 'message' => 'Valid User ID is required'], 400);
        }

        // Fetch existing record
        $fetchStmt = $pdo->prepare('SELECT id, username, email, full_name, phone, role, subscription_tier, is_active, status, must_change_password, avatar_url, access_expires_at FROM `users` WHERE id = :id LIMIT 1');
        $fetchStmt->execute([':id' => $id]);
        $existing = $fetchStmt->fetch();

        if (!$existing) {
            json_response(['success' => false, 'message' => 'User not found'], 404);
        }

        $isRootAdmin = ($existing['username'] === 'admin');
        $isAdminRole = ($existing['role'] === 'super_admin' || $existing['role'] === 'admin');

        // Protection: Prevent suspending or demoting the root 'admin'
        if ($isRootAdmin) {
            if ((isset($input['is_active']) && (int)$input['is_active'] === 0) || (isset($input['status']) && $input['status'] !== 'active')) {
                json_response(['success' => false, 'message' => 'Primary Super Admin account cannot be suspended or set to pending.'], 400);
            }
            if (isset($input['role']) && trim($input['role']) !== 'super_admin') {
                json_response(['success' => false, 'message' => 'Primary Super Admin role cannot be demoted.'], 400);
            }
        }

        // Protection rule: Prevent deactivating or demoting the last active super_admin/admin
        $willDeactivate = (isset($input['is_active']) && (int)$input['is_active'] === 0);
        $willDemote = (isset($input['role']) && !in_array(trim($input['role']), ['super_admin', 'admin'], true));

        if ($isAdminRole && ($willDeactivate || $willDemote)) {
            $adminCountStmt = $pdo->prepare("SELECT COUNT(*) FROM `users` WHERE role IN ('super_admin', 'admin') AND is_active = 1 AND id != :id");
            $adminCountStmt->execute([':id' => $id]);
            $remainingAdmins = (int)$adminCountStmt->fetchColumn();

            if ($remainingAdmins === 0) {
                json_response(['success' => false, 'message' => 'Cannot suspend or demote the last remaining active administrator.'], 400);
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

        if (array_key_exists('email', $input)) {
            $newEmail = !empty($input['email']) ? strtolower(trim($input['email'])) : null;
            if ($newEmail !== $existing['email']) {
                if ($newEmail !== null) {
                    $eCheck = $pdo->prepare('SELECT id FROM `users` WHERE email = :email AND id != :id LIMIT 1');
                    $eCheck->execute([':email' => $newEmail, ':id' => $id]);
                    if ($eCheck->fetch()) {
                        json_response(['success' => false, 'message' => 'Email address is already in use by another account'], 409);
                    }
                }
                $updates[] = '`email` = :email';
                $params[':email'] = $newEmail;
            }
        }

        if (array_key_exists('full_name', $input)) {
            $updates[] = '`full_name` = :full_name';
            $params[':full_name'] = !empty($input['full_name']) ? trim($input['full_name']) : null;
        }

        if (array_key_exists('phone', $input)) {
            $updates[] = '`phone` = :phone';
            $params[':phone'] = !empty($input['phone']) ? trim($input['phone']) : null;
        }

        if (isset($input['role'])) {
            $newRole = trim($input['role']);
            $validRoles = ['super_admin', 'admin', 'supervisor', 'operator', 'viewer'];
            if (in_array($newRole, $validRoles, true)) {
                $updates[] = '`role` = :role';
                $params[':role'] = $newRole;
            }
        }

        if (isset($input['subscription_tier'])) {
            $newTier = trim($input['subscription_tier']);
            $validTiers = ['basic', 'pro', 'enterprise', 'premium'];
            if (in_array($newTier, $validTiers, true)) {
                $updates[] = '`subscription_tier` = :subscription_tier';
                $params[':subscription_tier'] = $newTier;
            }
        }

        if (isset($input['action']) && $input['action'] === 'approve') {
            $updates[] = '`status` = :approved_status';
            $params[':approved_status'] = 'active';
            $updates[] = '`is_active` = 1';
        } elseif (isset($input['status'])) {
            $newStatus = strtolower(trim($input['status']));
            if (in_array($newStatus, ['active', 'pending', 'suspended'], true)) {
                $updates[] = '`status` = :status';
                $params[':status'] = $newStatus;
                if ($newStatus === 'active') {
                    $updates[] = '`is_active` = 1';
                } else {
                    $updates[] = '`is_active` = 0';
                }
            }
        } elseif (isset($input['is_active'])) {
            $activeVal = (int)$input['is_active'] ? 1 : 0;
            $updates[] = '`is_active` = :is_active';
            $params[':is_active'] = $activeVal;
            $updates[] = '`status` = :derived_status';
            $params[':derived_status'] = $activeVal ? 'active' : 'suspended';
        }

        if (isset($input['must_change_password'])) {
            $updates[] = '`must_change_password` = :must_change_password';
            $params[':must_change_password'] = (int)$input['must_change_password'] ? 1 : 0;
        }

        if (array_key_exists('access_expires_at', $input)) {
            $updates[] = '`access_expires_at` = :access_expires_at';
            $params[':access_expires_at'] = sanitize_datetime($input['access_expires_at']);
        }

        if (!empty($input['password'])) {
            $updates[] = '`password_hash` = :password_hash';
            $params[':password_hash'] = password_hash((string)$input['password'], PASSWORD_BCRYPT);
        }

        if (!empty($updates)) {
            $sql = 'UPDATE `users` SET ' . implode(', ', $updates) . ' WHERE id = :id';
            $updateStmt = $pdo->prepare($sql);
            $updateStmt->execute($params);
        }

        // Fetch updated user
        $refetchStmt = $pdo->prepare('SELECT id, username, email, full_name, phone, role, subscription_tier, is_active, status, must_change_password, avatar_url, access_expires_at, created_at, updated_at FROM `users` WHERE id = :id LIMIT 1');
        $refetchStmt->execute([':id' => $id]);
        $updatedUser = $refetchStmt->fetch();
        $updatedUser['id'] = (int)$updatedUser['id'];
        $updatedUser['is_active'] = (int)$updatedUser['is_active'];
        $updatedUser['status'] = strtolower($updatedUser['status'] ?? ($updatedUser['is_active'] ? 'active' : 'suspended'));
        $updatedUser['must_change_password'] = (int)$updatedUser['must_change_password'];
        $updatedUser['features'] = get_tier_features($pdo, $updatedUser['subscription_tier'] ?? 'basic');

        json_response([
            'success' => true,
            'message' => 'User updated successfully',
            'user' => $updatedUser
        ]);
    }

    // -----------------------------------------------------------------------------
    // 4. DELETE: Delete User (Cannot delete primary admin or last active admin)
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

        // Root admin cannot be deleted
        if ($existing['username'] === 'admin') {
            json_response(['success' => false, 'message' => 'The primary Super Administrator account cannot be deleted.'], 403);
        }

        // Protection rule: Prevent deleting the last active admin/super_admin
        if ($existing['role'] === 'super_admin' || $existing['role'] === 'admin') {
            $adminCountStmt = $pdo->prepare("SELECT COUNT(*) FROM `users` WHERE role IN ('super_admin', 'admin') AND is_active = 1 AND id != :id");
            $adminCountStmt->execute([':id' => $id]);
            $remainingAdmins = (int)$adminCountStmt->fetchColumn();

            if ($remainingAdmins === 0) {
                json_response(['success' => false, 'message' => 'Cannot delete the last remaining active administrator.'], 400);
            }
        }

        // Clean up any password reset records first
        $pdo->prepare('DELETE FROM `password_resets` WHERE user_id = :id')->execute([':id' => $id]);

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
