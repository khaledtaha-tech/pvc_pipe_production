<?php
/**
 * API Endpoint: Delete Daily Report
 * Method: POST or DELETE
 * Params: ?id=123 or JSON payload {"id": 123}
 * Hostinger MySQL Integration for Daily_Records
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST' && $method !== 'DELETE') {
    json_response(['success' => false, 'message' => 'Method Not Allowed. Use POST or DELETE.'], 405);
}

$id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int)$_GET['id'] : null;

if (!$id) {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $body = json_decode($rawInput, true);
        if (isset($body['id']) && is_numeric($body['id'])) {
            $id = (int)$body['id'];
        }
    }
}

if (!$id) {
    json_response(['success' => false, 'message' => 'Valid numeric "id" parameter is required'], 400);
}

$pdo = get_db_connection();

try {
    $stmt = $pdo->prepare("DELETE FROM daily_reports WHERE id = ?");
    $stmt->execute([$id]);

    if ($stmt->rowCount() > 0) {
        json_response([
            'success' => true,
            'id' => $id,
            'message' => 'Report and associated hourly records successfully deleted'
        ], 200);
    } else {
        json_response([
            'success' => false,
            'message' => 'Report not found or already deleted'
        ], 404);
    }
} catch (Exception $e) {
    json_response([
        'success' => false,
        'code' => 'DELETE_ERROR',
        'message' => 'Failed to delete report: ' . $e->getMessage()
    ], 500);
}
