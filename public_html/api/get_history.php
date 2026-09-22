<?php
/**
 * API Endpoint: Get Saved Reports History List
 * Method: GET
 * Params: ?limit=100&date=YYYY-MM-DD
 * Hostinger MySQL Integration for Daily_Records
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method Not Allowed. Use GET.'], 405);
}

$limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? min(500, max(1, (int)$_GET['limit'])) : 100;
$date = isset($_GET['date']) ? trim($_GET['date']) : null;

$pdo = get_db_connection();

try {
    if (!empty($date)) {
        $stmt = $pdo->prepare("SELECT
            id, client_id, report_date, line_machine, plant_name,
            total_output_pcs, operating_hours, total_downtime_hours,
            actual_output_rate_kg_h, oee_pct,
            created_at, updated_at
            FROM daily_reports
            WHERE report_date = ?
            ORDER BY line_machine ASC
            LIMIT ?");
        $stmt->bindValue(1, $date, PDO::PARAM_STR);
        $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        $stmt->execute();
    } else {
        $stmt = $pdo->prepare("SELECT
            id, client_id, report_date, line_machine, plant_name,
            total_output_pcs, operating_hours, total_downtime_hours,
            actual_output_rate_kg_h, oee_pct,
            created_at, updated_at
            FROM daily_reports
            ORDER BY report_date DESC, updated_at DESC
            LIMIT ?");
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
    }

    $rows = $stmt->fetchAll();

    $items = array_map(function($r) {
        return [
            'id' => (int)$r['id'],
            'client_id' => $r['client_id'],
            'report_date' => $r['report_date'],
            'line_machine' => $r['line_machine'],
            'plant_name' => $r['plant_name'],
            'total_output_pcs' => (float)$r['total_output_pcs'],
            'operating_hours' => (float)$r['operating_hours'],
            'total_downtime_hours' => (float)$r['total_downtime_hours'],
            'actual_output_rate_kg_h' => (float)$r['actual_output_rate_kg_h'],
            'oee_pct' => (float)$r['oee_pct'],
            'created_at' => $r['created_at'],
            'updated_at' => $r['updated_at'],
            'timestamp' => strtotime($r['updated_at'] ?: $r['created_at']) * 1000
        ];
    }, $rows);

    json_response([
        'success' => true,
        'count' => count($items),
        'items' => $items
    ]);

} catch (Exception $e) {
    json_response([
        'success' => false,
        'code' => 'HISTORY_ERROR',
        'message' => 'Failed to fetch history list: ' . $e->getMessage()
    ], 500);
}
