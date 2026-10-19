<?php
/**
 * API Endpoint: User Authentication (Login)
 * Method: POST
 * Supports username/email, password verification, RBAC, Tiering, and First-Time User Detection
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

$identifier = trim($payload['username'] ?? $payload['email'] ?? '');
$password = (string)($payload['password'] ?? '');

if ($identifier === '' || $password === '') {
    json_response(['success' => false, 'message' => 'Username/Email and password are required'], 400);
}

$pdo = get_db_connection();

// Fetch user by username OR email
$stmt = $pdo->prepare('SELECT id, username, email, full_name, phone, password_hash, role, subscription_tier, is_active, status, must_change_password, avatar_url, access_expires_at FROM `users` WHERE `username` = :id OR `email` = :id LIMIT 1');
$stmt->execute([':id' => $identifier]);
$user = $stmt->fetch();

// Automatic bootstrap & sync for Super Admin credentials
if (($identifier === 'admin' || $identifier === 'admin@polymerops.com') && $password === 'Admin@12345') {
    $adminHash = password_hash('Admin@12345', PASSWORD_BCRYPT);
    if ($user) {
        $updateStmt = $pdo->prepare('UPDATE `users` SET `password_hash` = :hash, `role` = \'super_admin\', `subscription_tier` = \'premium\', `is_active` = 1, `status` = \'active\', `must_change_password` = 0, `access_expires_at` = NULL WHERE `id` = :id');
        $updateStmt->execute([':hash' => $adminHash, ':id' => $user['id']]);
        $user['role'] = 'super_admin';
        $user['subscription_tier'] = 'premium';
        $user['is_active'] = 1;
        $user['status'] = 'active';
        $user['must_change_password'] = 0;
        $user['access_expires_at'] = null;
    } else {
        $insertStmt = $pdo->prepare('INSERT INTO `users` (`username`, `email`, `full_name`, `password_hash`, `role`, `subscription_tier`, `is_active`, `status`, `must_change_password`, `access_expires_at`) VALUES (\'admin\', \'admin@polymerops.com\', \'Super Administrator\', :hash, \'super_admin\', \'premium\', 1, \'active\', 0, NULL)');
        $insertStmt->execute([':hash' => $adminHash]);
        $user = [
            'id' => (int)$pdo->lastInsertId(),
            'username' => 'admin',
            'email' => 'admin@polymerops.com',
            'full_name' => 'Super Administrator',
            'phone' => null,
            'role' => 'super_admin',
            'subscription_tier' => 'premium',
            'is_active' => 1,
            'status' => 'active',
            'must_change_password' => 0,
            'avatar_url' => null,
            'access_expires_at' => null
        ];
    }

    $token = 'pvc_user_' . $user['id'] . '_' . bin2hex(random_bytes(24));
    $features = get_tier_features($pdo, $user['subscription_tier']);

    json_response([
        'success' => true,
        'token' => $token,
        'user' => [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'full_name' => $user['full_name'],
            'phone' => $user['phone'],
            'role' => $user['role'],
            'subscription_tier' => $user['subscription_tier'],
            'is_active' => (int)$user['is_active'],
            'status' => $user['status'] ?? 'active',
            'must_change_password' => (int)$user['must_change_password'],
            'avatar_url' => $user['avatar_url'],
            'access_expires_at' => $user['access_expires_at'],
            'features' => $features
        ]
    ]);
}

if (!$user || empty($user['password_hash']) || !password_verify($password, $user['password_hash'])) {
    json_response(['success' => false, 'message' => 'Invalid username/email or password.'], 401);
}

// Check if account status is pending administrator approval
$accountStatus = strtolower($user['status'] ?? ((int)$user['is_active'] === 1 ? 'active' : 'suspended'));
if ($accountStatus === 'pending') {
    json_response([
        'success' => false,
        'code' => 'ACCOUNT_PENDING',
        'status' => 'pending',
        'message' => 'Your account registration was received and is currently pending administrator approval. Please wait for the admin to approve and activate your account.'
    ], 403);
}

// Check if account is active or suspended
if ($accountStatus === 'suspended' || (int)$user['is_active'] !== 1) {
    json_response([
        'success' => false,
        'code' => 'ACCOUNT_SUSPENDED',
        'status' => 'suspended',
        'message' => 'Your account has been suspended by an administrator.'
    ], 403);
}

// Check if account access has expired
if (!empty($user['access_expires_at'])) {
    $expiresAt = strtotime($user['access_expires_at']);
    if ($expiresAt !== false && time() > $expiresAt) {
        json_response(['success' => false, 'message' => 'Your account access period has expired. Please contact an administrator.'], 403);
    }
}

// Generate session token
$token = 'pvc_user_' . $user['id'] . '_' . bin2hex(random_bytes(24));
$features = get_tier_features($pdo, $user['subscription_tier']);

json_response([
    'success' => true,
    'token' => $token,
    'user' => [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'full_name' => $user['full_name'],
        'phone' => $user['phone'],
        'role' => $user['role'],
        'subscription_tier' => $user['subscription_tier'],
        'is_active' => (int)$user['is_active'],
        'status' => $accountStatus,
        'must_change_password' => (int)$user['must_change_password'],
        'avatar_url' => $user['avatar_url'],
        'access_expires_at' => $user['access_expires_at'],
        'features' => $features
    ]
]);
