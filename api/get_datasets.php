<?php
/**
 * API Endpoint: Retrieve Central Production Logs & Historical ERP Datasets
 * Method: GET
 * Params: ?limit=10000&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&type=all|production|erp
 * Hostinger MySQL Integration for Centralized Persistence
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method Not Allowed. Use GET.'], 405);
}

$limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? min(50000, max(1, (int)$_GET['limit'])) : 10000;
$startDate = isset($_GET['startDate']) ? trim($_GET['startDate']) : null;
$endDate = isset($_GET['endDate']) ? trim($_GET['endDate']) : null;
$type = isset($_GET['type']) ? strtolower(trim($_GET['type'])) : 'all';

$pdo = get_db_connection();
ensure_dataset_tables_exist($pdo);

$productionLogs = [];
$erpRecords = [];

try {
    // 1. Fetch Production Logs
    if ($type === 'all' || $type === 'production') {
        $where = [];
        $params = [];

        if (!empty($startDate)) {
            $where[] = "record_date >= ?";
            $params[] = $startDate;
        }
        if (!empty($endDate)) {
            $where[] = "record_date <= ?";
            $params[] = $endDate;
        }

        $whereClause = count($where) > 0 ? "WHERE " . implode(" AND ", $where) : "";
        $sql = "SELECT `id`, `record_date`, `line_machine`, `shift`, `item_code`, `description`,
                       `outer_diameter`, `wall_thickness`, `actual_output_kg`, `scrap_kg`,
                       `operating_hours`, `downtime_hours`, `raw_row_json`, `upload_batch_id`, `created_at`
                FROM `production_log_records`
                {$whereClause}
                ORDER BY `record_date` ASC, `id` ASC
                LIMIT " . (int)$limit;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        foreach ($rows as $r) {
            if (!empty($r['raw_row_json'])) {
                $decoded = json_decode($r['raw_row_json'], true);
                if (is_array($decoded) && count($decoded) > 0) {
                    if (empty($decoded['id'])) {
                        $decoded['id'] = 'db_' . $r['id'];
                    }
                    $productionLogs[] = $decoded;
                    continue;
                }
            }

            // Structured fallback
            $productionLogs[] = [
                'id' => 'db_' . $r['id'],
                'date' => $r['record_date'],
                'machineName' => $r['line_machine'],
                'machineRaw' => $r['line_machine'],
                'shift' => $r['shift'],
                'itemCode' => $r['item_code'],
                'description' => $r['description'],
                'outerDiameter' => $r['outer_diameter'],
                'wallThickness' => $r['wall_thickness'],
                'totalWeight' => (float)$r['actual_output_kg'],
                'scrapKg' => (float)$r['scrap_kg'],
                'operatingHours' => (float)$r['operating_hours'],
                'downtimeHours' => (float)$r['downtime_hours']
            ];
        }
    }

    // 2. Fetch Historical ERP Records
    if ($type === 'all' || $type === 'erp') {
        $where = [];
        $params = [];

        if (!empty($startDate)) {
            $where[] = "doc_date >= ?";
            $params[] = $startDate;
        }
        if (!empty($endDate)) {
            $where[] = "doc_date <= ?";
            $params[] = $endDate;
        }

        $whereClause = count($where) > 0 ? "WHERE " . implode(" AND ", $where) : "";
        $sql = "SELECT `id`, `doc_date`, `line_machine`, `item_code`, `description`,
                       `total_weight_kg`, `total_length_m`, `scrap_weight_kg`,
                       `raw_row_json`, `upload_batch_id`, `created_at`
                FROM `historical_erp_records`
                {$whereClause}
                ORDER BY `doc_date` ASC, `id` ASC
                LIMIT " . (int)$limit;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        foreach ($rows as $r) {
            if (!empty($r['raw_row_json'])) {
                $decoded = json_decode($r['raw_row_json'], true);
                if (is_array($decoded) && count($decoded) > 0) {
                    $erpRecords[] = $decoded;
                    continue;
                }
            }

            // Structured fallback
            $erpRecords[] = [
                'Date' => $r['doc_date'],
                'Item Code' => $r['item_code'],
                'Product Description & Specs' => $r['description'],
                'Machine' => $r['line_machine'],
                'Total Weight (kg)' => (float)$r['total_weight_kg'],
                'Total Length (m)' => (float)$r['total_length_m'],
                'Scrap / Rejection (kg)' => (float)$r['scrap_weight_kg']
            ];
        }
    }

    json_response([
        'success' => true,
        'productionLogs' => $productionLogs,
        'erpRecords' => $erpRecords,
        'count' => count($productionLogs) + count($erpRecords),
        'productionLogsCount' => count($productionLogs),
        'erpRecordsCount' => count($erpRecords),
        'timestamp' => date('c')
    ], 200);

} catch (Exception $e) {
    json_response([
        'success' => false,
        'message' => 'Failed to retrieve datasets: ' . $e->getMessage()
    ], 500);
}
