<?php
/**
 * API Endpoint: Machine-Mold Baseline Operating Catalog
 * Methods:
 *   GET: Retrieve central baseline standards
 *   POST / PUT: Upsert single standard or batch standards
 *   DELETE: Remove baseline standard by line_id & product_code
 * Hostinger MySQL Integration for Centralized Persistence
 */

require_once __DIR__ . '/config.php';

$pdo = get_db_connection();
ensure_baseline_table_exists($pdo);

/**
 * Ensure pvc_baseline_standards table exists in MySQL database (auto-migration)
 * @param PDO $pdo
 */
function ensure_baseline_table_exists($pdo) {
    static $checked = false;
    if ($checked) {
        return;
    }
    $sql = "CREATE TABLE IF NOT EXISTS `pvc_baseline_standards` (
      `line_id` VARCHAR(50) NOT NULL,
      `product_code` VARCHAR(50) NOT NULL,
      `baseline_pcs_h` INT NOT NULL,
      `notes` TEXT NULL,
      `approved_date` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`line_id`, `product_code`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql);
    $checked = true;
}

$method = $_SERVER['REQUEST_METHOD'];

// Handle GET: retrieve all standards or specific line/product
if ($method === 'GET') {
    try {
        $lineId = isset($_GET['line_id']) ? trim($_GET['line_id']) : (isset($_GET['lineId']) ? trim($_GET['lineId']) : null);
        $productCode = isset($_GET['product_code']) ? trim($_GET['product_code']) : (isset($_GET['productCode']) ? trim($_GET['productCode']) : null);

        $where = [];
        $params = [];
        if (!empty($lineId)) {
            $where[] = "`line_id` = ?";
            $params[] = strtoupper($lineId);
        }
        if (!empty($productCode)) {
            $where[] = "`product_code` = ?";
            $params[] = strtoupper($productCode);
        }

        $whereClause = count($where) > 0 ? "WHERE " . implode(" AND ", $where) : "";
        $sql = "SELECT `line_id`, `product_code`, `baseline_pcs_h`, `notes`, `approved_date`
                FROM `pvc_baseline_standards`
                {$whereClause}
                ORDER BY `line_id` ASC, `product_code` ASC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $catalog = [];
        $data = [];

        foreach ($rows as $row) {
            $lId = strtoupper(trim($row['line_id']));
            $pCode = strtoupper(trim($row['product_code']));
            $rate = (int)$row['baseline_pcs_h'];
            $key = "{$lId}__{$pCode}";
            $date = !empty($row['approved_date']) ? substr($row['approved_date'], 0, 10) : date('Y-m-d');
            $notes = $row['notes'] !== null ? trim($row['notes']) : '';

            $entry = [
                'lineId' => $lId,
                'productCode' => $pCode,
                'baselinePcsH' => $rate,
                'dailyTargetPcs' => $rate * 24,
                'approvedDate' => $date,
                'notes' => $notes
            ];

            $catalog[$key] = $entry;
            $data[] = [
                'line_id' => $lId,
                'product_code' => $pCode,
                'baseline_pcs_h' => $rate,
                'notes' => $notes,
                'approved_date' => $row['approved_date']
            ];
        }

        json_response([
            'success' => true,
            'count' => count($rows),
            'catalog' => $catalog,
            'data' => $data,
            'timestamp' => date('c')
        ], 200);
    } catch (PDOException $e) {
        json_response(['success' => false, 'message' => 'Database query failed: ' . $e->getMessage()], 500);
    }
}

// Handle POST or PUT: upsert standard(s)
if ($method === 'POST' || $method === 'PUT') {
    $rawInput = file_get_contents('php://input');
    if (empty($rawInput)) {
        json_response(['success' => false, 'message' => 'Empty request body'], 400);
    }

    $payload = json_decode($rawInput, true);
    if (!is_array($payload)) {
        json_response(['success' => false, 'message' => 'Invalid JSON payload'], 400);
    }

    // Support single item, items array, or catalog map
    $itemsToSave = [];
    if (isset($payload['items']) && is_array($payload['items'])) {
        $itemsToSave = $payload['items'];
    } elseif (isset($payload['catalog']) && is_array($payload['catalog'])) {
        $itemsToSave = array_values($payload['catalog']);
    } elseif (isset($payload[0]) && is_array($payload[0])) {
        $itemsToSave = $payload;
    } else {
        $itemsToSave = [$payload];
    }

    if (count($itemsToSave) === 0) {
        json_response(['success' => false, 'message' => 'No items provided for saving'], 400);
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO `pvc_baseline_standards` (`line_id`, `product_code`, `baseline_pcs_h`, `notes`, `approved_date`)
            VALUES (?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
              `baseline_pcs_h` = VALUES(`baseline_pcs_h`),
              `notes` = VALUES(`notes`),
              `approved_date` = NOW()
        ");

        $savedCount = 0;
        foreach ($itemsToSave as $item) {
            $lineId = strtoupper(trim($item['lineId'] ?? $item['line_id'] ?? ''));
            $productCode = strtoupper(trim($item['productCode'] ?? $item['product_code'] ?? ''));
            $rate = (int)($item['baselinePcsH'] ?? $item['baseline_pcs_h'] ?? $item['rate'] ?? 0);
            $notes = isset($item['notes']) ? trim((string)$item['notes']) : '';

            // If rate is 0 but dailyTarget is provided
            if ($rate <= 0 && !empty($item['dailyTargetPcs'])) {
                $rate = (int)round((float)$item['dailyTargetPcs'] / 24);
            }

            if (empty($lineId) || empty($productCode) || $rate <= 0) {
                continue;
            }

            $stmt->execute([$lineId, $productCode, $rate, $notes]);
            $savedCount++;
        }

        json_response([
            'success' => true,
            'message' => "Successfully saved {$savedCount} baseline standard(s)",
            'savedCount' => $savedCount,
            'timestamp' => date('c')
        ], 200);
    } catch (PDOException $e) {
        json_response(['success' => false, 'message' => 'Failed to save baseline standards: ' . $e->getMessage()], 500);
    }
}

// Handle DELETE: remove standard(s)
if ($method === 'DELETE') {
    $rawInput = file_get_contents('php://input');
    $payload = !empty($rawInput) ? json_decode($rawInput, true) : [];

    $lineId = isset($_GET['line_id']) ? trim($_GET['line_id']) : (isset($_GET['lineId']) ? trim($_GET['lineId']) : ($payload['lineId'] ?? $payload['line_id'] ?? ''));
    $productCode = isset($_GET['product_code']) ? trim($_GET['product_code']) : (isset($_GET['productCode']) ? trim($_GET['productCode']) : ($payload['productCode'] ?? $payload['product_code'] ?? ''));
    $clearAll = (!empty($_GET['clear']) && $_GET['clear'] === 'all') || (!empty($payload['clear']) && $payload['clear'] === 'all');

    try {
        if ($clearAll) {
            $pdo->exec("TRUNCATE TABLE `pvc_baseline_standards`");
            json_response([
                'success' => true,
                'message' => 'All baseline standards cleared successfully',
                'cleared' => true
            ], 200);
        }

        $lineId = strtoupper(trim($lineId));
        $productCode = strtoupper(trim($productCode));

        if (empty($lineId) || empty($productCode)) {
            json_response(['success' => false, 'message' => 'Missing line_id or product_code'], 400);
        }

        $stmt = $pdo->prepare("DELETE FROM `pvc_baseline_standards` WHERE `line_id` = ? AND `product_code` = ?");
        $stmt->execute([$lineId, $productCode]);
        $deleted = $stmt->rowCount() > 0;

        json_response([
            'success' => true,
            'message' => $deleted ? 'Baseline standard deleted successfully' : 'Record not found',
            'deleted' => $deleted,
            'lineId' => $lineId,
            'productCode' => $productCode
        ], 200);
    } catch (PDOException $e) {
        json_response(['success' => false, 'message' => 'Failed to delete baseline standard: ' . $e->getMessage()], 500);
    }
}

json_response(['success' => false, 'message' => 'Method Not Allowed'], 405);
