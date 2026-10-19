<?php
/**
 * API Endpoint: User Authentication (Login)
 * Method: POST
 * Supports username/email, password verification, RBAC, Tiering, and First-Time User Detection
 * Highly resilient: Uses dynamic schema queries and complete exception shielding
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method Not Allowed. Use POST.'], 405);
}

try {
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

    // Inspect existing columns in users table for fail-safe dynamic query
    $cols = $pdo->query("SHOW COLUMNS FROM `users`")->fetchAll(PDO::FETCH_COLUMN);
    $colMap = array_flip($cols);

    $fields = ['id', 'username'];
    $potentialFields = [
        'email', 'full_name', 'phone', 'password_hash', 'role',
        'subscription_tier', 'is_active', 'status', 'must_change_password',
        'avatar_url', 'access_expires_at'
    ];
    foreach ($potentialFields as $f) {
        if (isset($colMap[$f])) {
            $fields[] = "`$f`";
        }
    }

    $whereClause = '`username` = :u_id';
    $params = [':u_id' => $identifier];
    if (isset($colMap['email'])) {
        $whereClause .= ' OR `email` = :e_id';
        $params[':e_id'] = $identifier;
    }

    $stmt = $pdo->prepare('SELECT ' . implode(', ', $fields) . " FROM `users` WHERE $whereClause LIMIT 1");
    $stmt->execute($params);
    $user = $stmt->fetch();

    // Automatic bootstrap & sync for Super Admin credentials (admin / Admin@12345)
    if (($identifier === 'admin' || $identifier === 'admin@polymerops.com') && $password === 'Admin@12345') {
        $adminHash = password_hash('Admin@12345', PASSWORD_BCRYPT);
        if ($user) {
            $updates = [];
            $params = [':id' => $user['id']];

            if (isset($colMap['password_hash'])) {
                $updates[] = '`password_hash` = :hash';
                $params[':hash'] = $adminHash;
            }
            if (isset($colMap['role'])) {
                $updates[] = '`role` = \'super_admin\'';
            }
            if (isset($colMap['subscription_tier'])) {
                $updates[] = '`subscription_tier` = \'premium\'';
            }
            if (isset($colMap['is_active'])) {
                $updates[] = '`is_active` = 1';
            }
            if (isset($colMap['status'])) {
                $updates[] = '`status` = \'active\'';
            }
            if (isset($colMap['must_change_password'])) {
                $updates[] = '`must_change_password` = 0';
            }
            if (isset($colMap['access_expires_at'])) {
                $updates[] = '`access_expires_at` = NULL';
            }

            if (!empty($updates)) {
                $pdo->prepare('UPDATE `users` SET ' . implode(', ', $updates) . ' WHERE `id` = :id')->execute($params);
            }

            $user['role'] = 'super_admin';
            $user['subscription_tier'] = 'premium';
            $user['is_active'] = 1;
            $user['status'] = 'active';
            $user['must_change_password'] = 0;
            $user['access_expires_at'] = null;
        } else {
            // Build dynamic insert based on available columns
            $insCols = ['username'];
            $insVals = [':u'];
            $insParams = [':u' => 'admin'];

            if (isset($colMap['email'])) { $insCols[] = 'email'; $insVals[] = ':e'; $insParams[':e'] = 'admin@polymerops.com'; }
            if (isset($colMap['full_name'])) { $insCols[] = 'full_name'; $insVals[] = ':fn'; $insParams[':fn'] = 'Super Administrator'; }
            if (isset($colMap['password_hash'])) { $insCols[] = 'password_hash'; $insVals[] = ':ph'; $insParams[':ph'] = $adminHash; }
            if (isset($colMap['role'])) { $insCols[] = 'role'; $insVals[] = '\'super_admin\''; }
            if (isset($colMap['subscription_tier'])) { $insCols[] = 'subscription_tier'; $insVals[] = '\'premium\''; }
            if (isset($colMap['is_active'])) { $insCols[] = 'is_active'; $insVals[] = '1'; }
            if (isset($colMap['status'])) { $insCols[] = 'status'; $insVals[] = '\'active\''; }
            if (isset($colMap['must_change_password'])) { $insCols[] = 'must_change_password'; $insVals[] = '0'; }

            $insertSql = 'INSERT INTO `users` (`' . implode('`, `', $insCols) . '`) VALUES (' . implode(', ', $insVals) . ')';
            $pdo->prepare($insertSql)->execute($insParams);

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
        $features = get_tier_features($pdo, $user['subscription_tier'] ?? 'premium');

        json_response([
            'success' => true,
            'token' => $token,
            'user' => [
                'id' => (int)$user['id'],
                'username' => $user['username'],
                'email' => $user['email'] ?? 'admin@polymerops.com',
                'full_name' => $user['full_name'] ?? 'Super Administrator',
                'phone' => $user['phone'] ?? null,
                'role' => 'super_admin',
                'subscription_tier' => 'premium',
                'is_active' => 1,
                'status' => 'active',
                'must_change_password' => 0,
                'avatar_url' => $user['avatar_url'] ?? null,
                'access_expires_at' => null,
                'features' => $features
            ]
        ]);
    }

    if (!$user || empty($user['password_hash']) || !password_verify($password, $user['password_hash'])) {
        json_response(['success' => false, 'message' => 'Invalid username/email or password.'], 401);
    }

    // Check if account status is pending administrator approval
    $accountStatus = strtolower($user['status'] ?? (isset($user['is_active']) && (int)$user['is_active'] === 1 ? 'active' : 'suspended'));
    if ($accountStatus === 'pending') {
        json_response([
            'success' => false,
            'code' => 'ACCOUNT_PENDING',
            'status' => 'pending',
            'message' => 'Your account registration was received and is currently pending administrator approval. Please wait for the admin to approve and activate your account.'
        ], 403);
    }

    // Check if account is active or suspended
    if ($accountStatus === 'suspended' || (isset($user['is_active']) && (int)$user['is_active'] !== 1)) {
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

    // Guarantee admin account always receives super_admin role and premium tier
    $isAdminAccount = strtolower($user['username']) === 'admin';
    $role = $isAdminAccount ? 'super_admin' : ($user['role'] ?? 'operator');
    $tier = $isAdminAccount ? 'premium' : ($user['subscription_tier'] ?? 'free');

    if ($isAdminAccount && (($user['role'] ?? '') !== 'super_admin' || ($user['subscription_tier'] ?? '') !== 'premium')) {
        try {
            $pdo->prepare("UPDATE `users` SET `role` = 'super_admin', `subscription_tier` = 'premium', `is_active` = 1, `status` = 'active' WHERE `id` = :id")
                ->execute([':id' => $user['id']]);
        } catch (Throwable $e) {}
    }

    // Generate session token
    $token = 'pvc_user_' . $user['id'] . '_' . bin2hex(random_bytes(24));
    $features = get_tier_features($pdo, $tier);

    json_response([
        'success' => true,
        'token' => $token,
        'user' => [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'email' => $user['email'] ?? null,
            'full_name' => $user['full_name'] ?? $user['username'],
            'phone' => $user['phone'] ?? null,
            'role' => $role,
            'subscription_tier' => $tier,
            'is_active' => isset($user['is_active']) ? (int)$user['is_active'] : 1,
            'status' => $accountStatus,
            'must_change_password' => isset($user['must_change_password']) ? (int)$user['must_change_password'] : 0,
            'avatar_url' => $user['avatar_url'] ?? null,
            'access_expires_at' => $user['access_expires_at'] ?? null,
            'features' => $features
        ]
    ]);

} catch (Throwable $e) {
    json_response([
        'success' => false,
        'code' => 'LOGIN_SERVER_ERROR',
        'message' => 'Login error: ' . $e->getMessage()
    ], 500);
}
