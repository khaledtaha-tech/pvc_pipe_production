<?php
/**
 * API Endpoint: Google OAuth Authentication
 * Method: POST
 * Verifies Google ID tokens, links or provisions user accounts with RBAC & Tiers
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

$idToken = trim($payload['credential'] ?? $payload['id_token'] ?? '');
if (empty($idToken)) {
    json_response(['success' => false, 'message' => 'Google ID credential token is required'], 400);
}

// Fetch Google Client ID and Secret from environment
$googleClientId = env('GOOGLE_CLIENT_ID', '');
$googleClientSecret = env('GOOGLE_CLIENT_SECRET', '');

// Verify Google ID token via Google's tokeninfo API
$verifyUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $verifyUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false || $httpCode !== 200) {
    // If cURL failed, attempt file_get_contents fallback
    $context = stream_context_create(['http' => ['timeout' => 10]]);
    $response = @file_get_contents($verifyUrl, false, $context);
    if ($response === false) {
        json_response([
            'success' => false,
            'message' => 'Failed to verify Google authentication token: ' . ($curlError ?: 'HTTP ' . $httpCode)
        ], 401);
    }
}

$googleData = json_decode($response, true);
if (!is_array($googleData) || empty($googleData['sub']) || empty($googleData['email'])) {
    json_response([
        'success' => false,
        'message' => 'Invalid or expired Google authentication token.'
    ], 401);
}

// Validate audience if GOOGLE_CLIENT_ID is configured and not default template
if (!empty($googleClientId) && strpos($googleClientId, 'YOUR_') === false) {
    if (isset($googleData['aud']) && $googleData['aud'] !== $googleClientId) {
        json_response([
            'success' => false,
            'message' => 'Google token audience mismatch.'
        ], 401);
    }
}

$googleSub = $googleData['sub'];
$email = strtolower(trim($googleData['email']));
$name = trim($googleData['name'] ?? $googleData['given_name'] ?? '');
$picture = trim($googleData['picture'] ?? '');

$pdo = get_db_connection();

// Check if user already exists by google_id OR email
$stmt = $pdo->prepare('SELECT id, username, email, full_name, phone, role, subscription_tier, is_active, status, must_change_password, avatar_url, access_expires_at FROM `users` WHERE `google_id` = :sub OR `email` = :email LIMIT 1');
$stmt->execute([':sub' => $googleSub, ':email' => $email]);
$user = $stmt->fetch();

if ($user) {
    $accountStatus = strtolower($user['status'] ?? ((int)$user['is_active'] === 1 ? 'active' : 'suspended'));

    // Check if account is pending approval
    if ($accountStatus === 'pending') {
        json_response([
            'success' => false,
            'code' => 'ACCOUNT_PENDING',
            'status' => 'pending',
            'message' => 'Your Google account registration was received and is currently pending administrator approval. Please wait for the admin to approve and activate your account.'
        ], 403);
    }

    // Check if account is suspended
    if ($accountStatus === 'suspended' || (int)$user['is_active'] !== 1) {
        json_response([
            'success' => false,
            'code' => 'ACCOUNT_SUSPENDED',
            'status' => 'suspended',
            'message' => 'Your account has been suspended by an administrator.'
        ], 403);
    }

    // Check expiration
    if (!empty($user['access_expires_at'])) {
        $expiresAt = strtotime($user['access_expires_at']);
        if ($expiresAt !== false && time() > $expiresAt) {
            json_response(['success' => false, 'message' => 'Your account access period has expired. Please contact an administrator.'], 403);
        }
    }

    // Update missing Google metadata if needed
    $updateFields = [];
    $updateParams = [':id' => $user['id']];
    if (empty($user['google_id'])) {
        $updateFields[] = '`google_id` = :sub';
        $updateParams[':sub'] = $googleSub;
    }
    if (empty($user['avatar_url']) && !empty($picture)) {
        $updateFields[] = '`avatar_url` = :pic';
        $updateParams[':pic'] = $picture;
        $user['avatar_url'] = $picture;
    }
    if (empty($user['full_name']) && !empty($name)) {
        $updateFields[] = '`full_name` = :name';
        $updateParams[':name'] = $name;
        $user['full_name'] = $name;
    }

    if (!empty($updateFields)) {
        $pdo->prepare('UPDATE `users` SET ' . implode(', ', $updateFields) . ' WHERE `id` = :id')->execute($updateParams);
    }
} else {
    // Auto-provision new Google authenticated user with status 'pending'
    // Generate clean unique username from email
    $baseUsername = preg_replace('/[^a-zA-Z0-9_]/', '', explode('@', $email)[0]);
    if (strlen($baseUsername) < 3) $baseUsername = 'user_' . substr($googleSub, -5);
    $uniqueUsername = $baseUsername;
    $counter = 1;

    while (true) {
        $check = $pdo->prepare('SELECT id FROM `users` WHERE `username` = :u LIMIT 1');
        $check->execute([':u' => $uniqueUsername]);
        if (!$check->fetch()) {
            break;
        }
        $uniqueUsername = $baseUsername . '_' . $counter++;
    }

    $insert = $pdo->prepare('INSERT INTO `users` (
        `username`, `email`, `full_name`, `google_id`, `avatar_url`, `role`, `subscription_tier`, `is_active`, `status`, `must_change_password`
    ) VALUES (
        :u, :e, :fn, :gid, :av, 'operator', 'basic', 0, 'pending', 0
    )');
    $insert->execute([
        ':u' => $uniqueUsername,
        ':e' => $email,
        ':fn' => $name ?: $uniqueUsername,
        ':gid' => $googleSub,
        ':av' => $picture ?: null
    ]);

    json_response([
        'success' => false,
        'code' => 'ACCOUNT_PENDING',
        'status' => 'pending',
        'message' => 'Your Google account has been registered successfully! Your membership is currently pending administrator approval. You will receive access once approved by the administrator.'
    ], 403);
}

$token = 'pvc_user_' . $user['id'] . '_' . bin2hex(random_bytes(24));
$features = get_tier_features($pdo, $user['subscription_tier']);

json_response([
    'success' => true,
    'token' => $token,
    'message' => 'Signed in with Google successfully',
    'user' => [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'full_name' => $user['full_name'],
        'phone' => $user['phone'],
        'role' => $user['role'],
        'subscription_tier' => $user['subscription_tier'],
        'must_change_password' => (int)$user['must_change_password'],
        'avatar_url' => $user['avatar_url'],
        'access_expires_at' => $user['access_expires_at'],
        'features' => $features
    ]
]);
