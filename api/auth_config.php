<?php
/**
 * API Endpoint: Public Auth Configuration
 * Method: GET
 * Safely provides public configuration (like Google OAuth Client ID) to the frontend client
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true]);
    exit;
}

require_once __DIR__ . '/config.php';

$googleClientId = env('VITE_GOOGLE_CLIENT_ID', env('GOOGLE_CLIENT_ID', ''));
$appUrl = env('APP_URL', '');

json_response([
    'success' => true,
    'google_client_id' => $googleClientId,
    'app_url' => $appUrl
]);
