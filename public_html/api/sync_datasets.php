<?php
/**
 * API Endpoint: Synchronize Bulk Production Logs & Historical ERP Datasets
 * Method: POST
 * Payload: { productionLogs: [...], erpRecords: [...], batchId: string, mode?: 'append'|'replace' }
 * Hostinger MySQL Integration for Centralized Persistence
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

// Support aliases for flexibility
$productionLogs = $payload['productionLogs'] ?? $payload['rawRows'] ?? [];
$erpRecords = $payload['erpRecords'] ?? $payload['historicalRawRows'] ?? $payload['historicalRows'] ?? [];
$batchId = !empty($payload['batchId']) ? trim($payload['batchId']) : uniqid('batch_', true);
$mode = strtolower(trim($payload['mode'] ?? 'append'));

if (!is_array($productionLogs)) {
    $productionLogs = [];
}
if (!is_array($erpRecords)) {
    $erpRecords = [];
}

if (count($productionLogs) === 0 && count($erpRecords) === 0) {
    json_response([
        'success' => true,
        'count' => 0,
        'message' => 'No records to synchronize',
        'timestamp' => date('c')
    ], 200);
}

$pdo = get_db_connection();
ensure_dataset_tables_exist($pdo);

// Helper function to normalize dates safely to YYYY-MM-DD
function normalize_date($rawDate) {
    if (empty($rawDate)) {
        return date('Y-m-d');
    }
    if (is_numeric($rawDate) && $rawDate > 10000 && $rawDate < 100000) {
        // Excel serial date number
        $unixTimestamp = ($rawDate - 25569) * 86400;
        return gmdate('Y-m-d', $unixTimestamp);
    }
    $ts = strtotime($rawDate);
    if ($ts !== false && $ts > 0) {
        return date('Y-m-d', $ts);
    }
    // Return today if unparseable
    return date('Y-m-d');
}

try {
    $pdo->beginTransaction();

    $prodInserted = 0;
    $erpInserted = 0;

    // Handle replace mode if explicitly requested
    if ($mode === 'replace' || $mode === 'overwrite') {
        if (count($productionLogs) > 0) {
            $pdo->exec("DELETE FROM `production_log_records`");
        }
        if (count($erpRecords) > 0) {
            $pdo->exec("DELETE FROM `historical_erp_records`");
        }
    }

    // 1. Process Production Logs
    if (count($productionLogs) > 0) {
        $stmtProd = $pdo->prepare("INSERT INTO `production_log_records` (
            `record_date`, `line_machine`, `shift`, `item_code`, `description`,
            `outer_diameter`, `wall_thickness`, `actual_output_kg`, `scrap_kg`,
            `operating_hours`, `downtime_hours`, `raw_row_json`, `upload_batch_id`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

        foreach ($productionLogs as $row) {
            if (!is_array($row)) continue;

            $dateRaw = $row['date'] ?? $row['Date'] ?? $row['record_date'] ?? '';
            $recordDate = normalize_date($dateRaw);

            $lineMachine = trim($row['machineName'] ?? $row['machineId'] ?? $row['machineRaw'] ?? $row['machine'] ?? $row['Line'] ?? 'L-01');
            $shift = trim($row['shift'] ?? $row['Shift'] ?? 'All Day');
            $itemCode = trim($row['itemCode'] ?? $row['item_code'] ?? $row['Item Code'] ?? '');
            $description = trim($row['description'] ?? $row['Description'] ?? $row['Product Description & Specs'] ?? '');
            $outerDiameter = isset($row['outerDiameter']) ? (string)$row['outerDiameter'] : (isset($row['od']) ? (string)$row['od'] : null);
            $wallThickness = isset($row['wallThickness']) ? (string)$row['wallThickness'] : (isset($row['wt']) ? (string)$row['wt'] : null);

            $actualOutputKg = is_numeric($row['totalWeight'] ?? null) ? (float)$row['totalWeight'] : (is_numeric($row['actual_output_kg'] ?? null) ? (float)$row['actual_output_kg'] : 0.0);
            $scrapKg = is_numeric($row['scrapKg'] ?? null) ? (float)$row['scrapKg'] : (is_numeric($row['scrap_kg'] ?? null) ? (float)$row['scrap_kg'] : 0.0);
            $operatingHours = is_numeric($row['operatingHours'] ?? null) ? (float)$row['operatingHours'] : (is_numeric($row['operating_hours'] ?? null) ? (float)$row['operating_hours'] : 24.0);
            $downtimeHours = is_numeric($row['downtimeHours'] ?? null) ? (float)$row['downtimeHours'] : (is_numeric($row['downtime_hours'] ?? null) ? (float)$row['downtime_hours'] : 0.0);

            $rawRowJson = json_encode($row, JSON_UNESCAPED_UNICODE);

            $stmtProd->execute([
                $recordDate,
                $lineMachine,
                $shift,
                $itemCode,
                $description,
                $outerDiameter,
                $wallThickness,
                $actualOutputKg,
                $scrapKg,
                $operatingHours,
                $downtimeHours,
                $rawRowJson,
                $batchId
            ]);
            $prodInserted++;
        }
    }

    // 2. Process Historical ERP Records
    if (count($erpRecords) > 0) {
        $stmtErp = $pdo->prepare("INSERT INTO `historical_erp_records` (
            `doc_date`, `line_machine`, `item_code`, `description`,
            `total_weight_kg`, `total_length_m`, `scrap_weight_kg`,
            `raw_row_json`, `upload_batch_id`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

        foreach ($erpRecords as $row) {
            if (!is_array($row)) continue;

            $dateRaw = $row['Date'] ?? $row['date'] ?? $row['Doc Date'] ?? $row['doc_date'] ?? '';
            $docDate = normalize_date($dateRaw);

            $lineMachine = trim($row['Machine'] ?? $row['machine'] ?? $row['line_machine'] ?? $row['primaryMachine'] ?? 'Inferred');
            $itemCode = trim($row['Item Code'] ?? $row['itemCode'] ?? $row['item_code'] ?? $row['Product Code'] ?? '');
            $description = trim($row['Product Description & Specs'] ?? $row['description'] ?? $row['Description'] ?? $row['Product Name'] ?? '');

            $totalWeightKg = is_numeric($row['Total Weight (kg)'] ?? null) ? (float)$row['Total Weight (kg)'] : (is_numeric($row['totalWeight'] ?? null) ? (float)$row['totalWeight'] : (is_numeric($row['Weight'] ?? null) ? (float)$row['Weight'] : 0.0));
            $totalLengthM = is_numeric($row['Total Length (m)'] ?? null) ? (float)$row['Total Length (m)'] : (is_numeric($row['totalLength'] ?? null) ? (float)$row['totalLength'] : (is_numeric($row['Production Qty (FG)'] ?? null) ? (float)$row['Production Qty (FG)'] : (is_numeric($row['Qty'] ?? null) ? (float)$row['Qty'] : 0.0)));
            $scrapWeightKg = is_numeric($row['Scrap / Rejection (kg)'] ?? null) ? (float)$row['Scrap / Rejection (kg)'] : (is_numeric($row['scrapKg'] ?? null) ? (float)$row['scrapKg'] : 0.0);

            $rawRowJson = json_encode($row, JSON_UNESCAPED_UNICODE);

            $stmtErp->execute([
                $docDate,
                $lineMachine,
                $itemCode,
                $description,
                $totalWeightKg,
                $totalLengthM,
                $scrapWeightKg,
                $rawRowJson,
                $batchId
            ]);
            $erpInserted++;
        }
    }

    $pdo->commit();

    json_response([
        'success' => true,
        'count' => $prodInserted + $erpInserted,
        'productionLogsCount' => $prodInserted,
        'erpRecordsCount' => $erpInserted,
        'batchId' => $batchId,
        'timestamp' => date('c')
    ], 200);

} catch (Exception $e) {
    if ($pdo && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_response([
        'success' => false,
        'message' => 'Failed to synchronize datasets: ' . $e->getMessage()
    ], 500);
}
