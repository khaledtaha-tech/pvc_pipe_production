<?php
/**
 * API Endpoint: Reset Password (Using Reset Token)
 * Method: POST
 * Validates 60-minute token, updates user password hash, and marks token used
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

$token = trim($payload['token'] ?? '');
$newPassword = (string)($payload['new_password'] ?? $payload['password'] ?? '');

if (empty($token)) {
    json_response(['success' => false, 'message' => 'Valid password reset token is required.'], 400);
}

if (strlen($newPassword) < 6) {
    json_response(['success' => false, 'message' => 'Password must be at least 6 characters long.'], 400);
}

$pdo = get_db_connection();

// Verify token in database
$stmt = $pdo->prepare('SELECT id, user_id, expires_at, used_at FROM `password_resets` WHERE `token` = :token LIMIT 1');
$stmt->execute([':token' => $token]);
$resetRecord = $stmt->fetch();

if (!$resetRecord) {
    json_response(['success' => false, 'message' => 'Invalid or unrecognized password reset token.'], 400);
}

if (!empty($resetRecord['used_at'])) {
    json_response(['success' => false, 'message' => 'This password reset link has already been used.'], 400);
}

if (strtotime($resetRecord['expires_at']) < time()) {
    json_response(['success' => false, 'message' => 'This password reset link has expired. Please request a new one.'], 400);
}

$userId = (int)$resetRecord['user_id'];
$hash = password_hash($newPassword, PASSWORD_BCRYPT);

// Update user password and clear must_change_password flag
$updateUser = $pdo->prepare('UPDATE `users` SET `password_hash` = :hash, `must_change_password` = 0 WHERE `id` = :uid');
$updateUser->execute([':hash' => $hash, ':uid' => $userId]);

// Mark reset token used
$updateReset = $pdo->prepare('UPDATE `password_resets` SET `used_at` = NOW() WHERE `id` = :id');
$updateReset->execute([':id' => $resetRecord['id']]);

json_response([
    'success' => true,
    'message' => 'Password has been successfully updated. You may now sign in with your new password.'
]);
