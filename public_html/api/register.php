<?php
/**
 * API Endpoint: Public User Self-Registration
 * Method: POST
 * Registers new user accounts with status 'pending' awaiting Admin approval
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true]);
    exit;
}

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['success' => false, 'message' => 'Method Not Allowed. Use POST.'], 405);
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    json_response(['success' => false, 'message' => 'Invalid JSON payload'], 400);
}

$username = trim($data['username'] ?? '');
$password = (string)($data['password'] ?? '');
$email = strtolower(trim($data['email'] ?? ''));
$fullName = trim($data['full_name'] ?? $data['name'] ?? '');
$phone = trim($data['phone'] ?? '');

if (empty($username) || strlen($username) < 3) {
    json_response(['success' => false, 'message' => 'Username must be at least 3 characters long.'], 400);
}

if (!preg_match('/^[a-zA-Z0-9_\-\.]+$/', $username)) {
    json_response(['success' => false, 'message' => 'Username may only contain letters, numbers, dots, and underscores.'], 400);
}

if (empty($password) || strlen($password) < 6) {
    json_response(['success' => false, 'message' => 'Password must be at least 6 characters long.'], 400);
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(['success' => false, 'message' => 'A valid email address is required.'], 400);
}

try {
    $pdo = get_db_connection();
    ensure_auth_tables_exist($pdo);

    // Check if username is taken
    $uStmt = $pdo->prepare('SELECT id FROM `users` WHERE `username` = :u LIMIT 1');
    $uStmt->execute([':u' => $username]);
    if ($uStmt->fetch()) {
        json_response(['success' => false, 'message' => 'Username is already taken by another account.'], 409);
    }

    // Check if email is taken
    $eStmt = $pdo->prepare('SELECT id FROM `users` WHERE `email` = :e LIMIT 1');
    $eStmt->execute([':e' => $email]);
    if ($eStmt->fetch()) {
        json_response(['success' => false, 'message' => 'Email address is already registered. Please sign in or use forgot password.'], 409);
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);

    $insert = $pdo->prepare('INSERT INTO `users` (
        `username`, `email`, `full_name`, `phone`, `password_hash`, `role`, `subscription_tier`, `is_active`, `status`, `must_change_password`
    ) VALUES (
        :u, :e, :fn, :ph, :hash, 'operator', 'basic', 0, 'pending', 0
    )');

    $insert->execute([
        ':u' => $username,
        ':e' => $email,
        ':fn' => $fullName ?: null,
        ':ph' => $phone ?: null,
        ':hash' => $passwordHash
    ]);

    $newId = (int)$pdo->lastInsertId();

    json_response([
        'success' => true,
        'code' => 'REGISTER_PENDING_APPROVAL',
        'status' => 'pending',
        'message' => 'Your account registration was received successfully! Membership is currently pending administrator approval. You will be able to log in once an admin activates your account.',
        'user' => [
            'id' => $newId,
            'username' => $username,
            'email' => $email,
            'full_name' => $fullName,
            'status' => 'pending'
        ]
    ], 201);

} catch (Throwable $e) {
    json_response([
        'success' => false,
        'message' => 'Registration error: ' . $e->getMessage()
    ], 500);
}
