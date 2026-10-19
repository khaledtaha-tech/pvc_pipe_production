<?php
/**
 * API Endpoint: Forgot Password / Request Reset Link
 * Method: POST
 * Generates secure 60-minute token, stores in DB, and dispatches reset email
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';

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

$identifier = trim($payload['email'] ?? $payload['username'] ?? $payload['identifier'] ?? '');
if ($identifier === '') {
    json_response(['success' => false, 'message' => 'Please provide your registered email address or username.'], 400);
}

$pdo = get_db_connection();

// Find user by email or username
$stmt = $pdo->prepare('SELECT id, username, email, full_name, is_active FROM `users` WHERE `email` = :id OR `username` = :id LIMIT 1');
$stmt->execute([':id' => $identifier]);
$user = $stmt->fetch();

// Standard security practice: respond with positive message even if user not found to prevent account enumeration
if (!$user) {
    json_response([
        'success' => true,
        'message' => 'If an account exists with that email/username, a password reset link has been dispatched.'
    ]);
}

if ((int)$user['is_active'] !== 1) {
    json_response(['success' => false, 'message' => 'This account is currently suspended. Please contact an administrator.'], 403);
}

// Generate cryptographically secure token
$token = bin2hex(random_bytes(32));
$expiresAt = date('Y-m-d H:i:s', time() + 3600); // 1 hour validity

// Invalidate any existing unused reset tokens for this user
$pdo->prepare('UPDATE `password_resets` SET `used_at` = NOW() WHERE `user_id` = :uid AND `used_at` IS NULL')
    ->execute([':uid' => $user['id']]);

// Insert new token
$insertStmt = $pdo->prepare('INSERT INTO `password_resets` (`user_id`, `token`, `expires_at`) VALUES (:uid, :token, :expires)');
$insertStmt->execute([
    ':uid' => $user['id'],
    ':token' => $token,
    ':expires' => $expiresAt
]);

// Build recovery URL
$appUrl = rtrim(env('APP_URL', 'https://pipe1.polymerops.com'), '/');
$resetUrl = $appUrl . '/?reset_token=' . $token;

// Target email
$targetEmail = !empty($user['email']) ? $user['email'] : ($identifier . '@polymerops.com');
$targetName = !empty($user['full_name']) ? $user['full_name'] : $user['username'];

// Dispatch email
$mailResult = send_password_reset_email($targetEmail, $targetName, $resetUrl);

// Debug helper in local development
$debugInfo = null;
if (env('APP_ENV') === 'development' || strpos($_SERVER['HTTP_HOST'] ?? '', 'localhost') !== false) {
    $debugInfo = [
        'reset_url' => $resetUrl,
        'token' => $token,
        'mail_status' => $mailResult
    ];
}

json_response([
    'success' => true,
    'message' => 'Password reset link has been dispatched to your email address.',
    'email_sent_to' => preg_replace('/(?<=.{2}).(?=.*@)/u', '*', $targetEmail),
    'debug' => $debugInfo
]);
