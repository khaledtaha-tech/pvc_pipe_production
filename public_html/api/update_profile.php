<?php
/**
 * API Endpoint: Mandatory First-Time Profile Setup & User Profile Update
 * Method: POST or PUT
 * Enables users to complete profile, update personal data, and set new mandatory password
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST' && $method !== 'PUT') {
    json_response(['success' => false, 'message' => 'Method Not Allowed. Use POST or PUT.'], 405);
}

$rawInput = file_get_contents('php://input');
if (empty($rawInput)) {
    json_response(['success' => false, 'message' => 'Empty request body'], 400);
}

$payload = json_decode($rawInput, true);
if (!is_array($payload)) {
    json_response(['success' => false, 'message' => 'Invalid JSON payload'], 400);
}

$userId = isset($payload['user_id']) ? (int)$payload['user_id'] : (isset($payload['id']) ? (int)$payload['id'] : 0);
if ($userId <= 0) {
    // Attempt to extract from bearer token
    $bearer = get_bearer_token();
    if ($bearer && strpos($bearer, 'pvc_user_') === 0) {
        $parts = explode('_', $bearer);
        $userId = (int)($parts[2] ?? 0);
    }
}

if ($userId <= 0) {
    json_response(['success' => false, 'message' => 'User ID is required.'], 400);
}

$pdo = get_db_connection();

// Verify user exists
$stmt = $pdo->prepare('SELECT id, username, email, full_name, phone, role, subscription_tier, is_active, must_change_password, avatar_url, access_expires_at FROM `users` WHERE `id` = :id LIMIT 1');
$stmt->execute([':id' => $userId]);
$user = $stmt->fetch();

if (!$user) {
    json_response(['success' => false, 'message' => 'User account not found.'], 404);
}

if ((int)$user['is_active'] !== 1) {
    json_response(['success' => false, 'message' => 'Your account is suspended. Please contact an administrator.'], 403);
}

$newPassword = (string)($payload['new_password'] ?? $payload['password'] ?? '');
$fullName = isset($payload['full_name']) ? trim($payload['full_name']) : null;
$email = isset($payload['email']) ? strtolower(trim($payload['email'])) : null;
$phone = isset($payload['phone']) ? trim($payload['phone']) : null;

// If user is required to change password, enforce password submission
$mustChange = (int)$user['must_change_password'] === 1;
if ($mustChange && empty($newPassword)) {
    json_response(['success' => false, 'message' => 'You must set a new personal password on your first login.'], 400);
}

if (!empty($newPassword) && strlen($newPassword) < 6) {
    json_response(['success' => false, 'message' => 'New password must be at least 6 characters long.'], 400);
}

// Validate unique email if email is being changed
if (!empty($email) && $email !== strtolower((string)$user['email'])) {
    $emailCheck = $pdo->prepare('SELECT id FROM `users` WHERE `email` = :email AND `id` != :id LIMIT 1');
    $emailCheck->execute([':email' => $email, ':id' => $userId]);
    if ($emailCheck->fetch()) {
        json_response(['success' => false, 'message' => 'Email address is already in use by another account.'], 409);
    }
}

$updateFields = [];
$params = [':id' => $userId];

if (!empty($newPassword)) {
    $updateFields[] = '`password_hash` = :hash';
    $params[':hash'] = password_hash($newPassword, PASSWORD_BCRYPT);
    $updateFields[] = '`must_change_password` = 0';
}

if ($fullName !== null) {
    $updateFields[] = '`full_name` = :fn';
    $params[':fn'] = $fullName;
}

if ($email !== null) {
    $updateFields[] = '`email` = :email';
    $params[':email'] = $email ?: null;
}

if ($phone !== null) {
    $updateFields[] = '`phone` = :phone';
    $params[':phone'] = $phone ?: null;
}

if (!empty($updateFields)) {
    $sql = 'UPDATE `users` SET ' . implode(', ', $updateFields) . ' WHERE `id` = :id';
    $pdo->prepare($sql)->execute($params);
}

// Refetch updated user
$refetch = $pdo->prepare('SELECT id, username, email, full_name, phone, role, subscription_tier, is_active, must_change_password, avatar_url, access_expires_at FROM `users` WHERE `id` = :id LIMIT 1');
$refetch->execute([':id' => $userId]);
$updatedUser = $refetch->fetch();

$features = get_tier_features($pdo, $updatedUser['subscription_tier']);

json_response([
    'success' => true,
    'message' => 'Profile updated successfully.',
    'user' => [
        'id' => (int)$updatedUser['id'],
        'username' => $updatedUser['username'],
        'email' => $updatedUser['email'],
        'full_name' => $updatedUser['full_name'],
        'phone' => $updatedUser['phone'],
        'role' => $updatedUser['role'],
        'subscription_tier' => $updatedUser['subscription_tier'],
        'must_change_password' => (int)$updatedUser['must_change_password'],
        'avatar_url' => $updatedUser['avatar_url'],
        'access_expires_at' => $updatedUser['access_expires_at'],
        'features' => $features
    ]
]);
