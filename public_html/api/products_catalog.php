<?php
/**
 * API Endpoint: Central Product Catalog & Specs Registry
 * Methods:
 *   GET: Retrieve central product catalog items
 *   POST / PUT: Upsert single product or batch of products
 *   DELETE: Remove product by item_code
 * Hostinger MySQL Integration for Centralized Persistence
 */

require_once __DIR__ . '/config.php';

$pdo = get_db_connection();
ensure_products_table_exists($pdo);

/**
 * Ensure pvc_product_catalog table exists in MySQL database (auto-migration)
 * @param PDO $pdo
 */
function ensure_products_table_exists($pdo) {
    static $checked = false;
    if ($checked) {
        return;
    }
    $sql = "CREATE TABLE IF NOT EXISTS `pvc_product_catalog` (
      `item_code` VARCHAR(50) NOT NULL PRIMARY KEY,
      `description` VARCHAR(255) NOT NULL,
      `od_mm` VARCHAR(50) NULL,
      `wall_thickness` VARCHAR(50) NULL,
      `material` VARCHAR(50) DEFAULT 'uPVC',
      `unit_weight` DECIMAL(10,3) DEFAULT NULL,
      `pipe_length` DECIMAL(6,2) DEFAULT 6.00,
      `nominal_speed` DECIMAL(6,2) DEFAULT NULL,
      `target_pcs_h` INT DEFAULT NULL,
      `primary_extruder` VARCHAR(50) DEFAULT NULL,
      `compatible_machines` TEXT DEFAULT NULL,
      `historical_rate_kgh` DECIMAL(10,2) DEFAULT NULL,
      `is_pending` TINYINT(1) DEFAULT 0,
      `source` VARCHAR(50) DEFAULT 'manual',
      `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX `idx_prod_pending` (`is_pending`),
      INDEX `idx_prod_primary` (`primary_extruder`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $pdo->exec($sql);
    $checked = true;
}

$method = $_SERVER['REQUEST_METHOD'];

// Handle GET: retrieve all products or specific item
if ($method === 'GET') {
    try {
        $itemCode = isset($_GET['item_code']) ? trim($_GET['item_code']) : (isset($_GET['itemCode']) ? trim($_GET['itemCode']) : null);
        $query = isset($_GET['q']) ? trim($_GET['q']) : (isset($_GET['query']) ? trim($_GET['query']) : null);

        $where = [];
        $params = [];
        if (!empty($itemCode)) {
            $where[] = "UPPER(`item_code`) = ?";
            $params[] = strtoupper($itemCode);
        }
        if (!empty($query)) {
            $where[] = "(`item_code` LIKE ? OR `description` LIKE ? OR `od_mm` LIKE ?)";
            $qLike = "%{$query}%";
            $params[] = $qLike;
            $params[] = $qLike;
            $params[] = $qLike;
        }

        $whereClause = count($where) > 0 ? "WHERE " . implode(" AND ", $where) : "";
        $sql = "SELECT `item_code`, `description`, `od_mm`, `wall_thickness`, `material`,
                       `unit_weight`, `pipe_length`, `nominal_speed`, `target_pcs_h`,
                       `primary_extruder`, `compatible_machines`, `historical_rate_kgh`,
                       `is_pending`, `source`, `updated_at`
                FROM `pvc_product_catalog`
                {$whereClause}
                ORDER BY `item_code` ASC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $catalog = [];
        $products = [];

        foreach ($rows as $row) {
            $code = trim($row['item_code']);
            $normKey = strtoupper($code);
            $uWeight = $row['unit_weight'] !== null ? (float)$row['unit_weight'] : 0.0;
            $entry = [
                'itemCode' => $code,
                'description' => $row['description'] !== null ? trim($row['description']) : '',
                'odMm' => $row['od_mm'] !== null ? trim($row['od_mm']) : '',
                'wallThickness' => $row['wall_thickness'] !== null ? trim($row['wall_thickness']) : '',
                'material' => $row['material'] !== null ? trim($row['material']) : 'uPVC',
                'unitWeight' => $uWeight,
                'stdWeight' => $uWeight,
                'pipeLength' => $row['pipe_length'] !== null ? (float)$row['pipe_length'] : 6.00,
                'nominalSpeed' => $row['nominal_speed'] !== null ? (float)$row['nominal_speed'] : null,
                'targetPcsH' => $row['target_pcs_h'] !== null ? (int)$row['target_pcs_h'] : null,
                'primaryExtruder' => $row['primary_extruder'] !== null ? trim($row['primary_extruder']) : '',
                'compatibleMachines' => $row['compatible_machines'] !== null ? trim($row['compatible_machines']) : '',
                'historicalRateKgH' => $row['historical_rate_kgh'] !== null ? (float)$row['historical_rate_kgh'] : null,
                'isPending' => (bool)$row['is_pending'],
                'source' => $row['source'] !== null ? trim($row['source']) : 'manual',
                'updatedAt' => $row['updated_at']
            ];

            $catalog[$normKey] = $entry;
            $products[] = $entry;
        }

        json_response([
            'success' => true,
            'count' => count($rows),
            'catalog' => $catalog,
            'products' => $products,
            'timestamp' => date('c')
        ], 200);
    } catch (PDOException $e) {
        json_response(['success' => false, 'message' => 'Database query failed: ' . $e->getMessage()], 500);
    }
}

// Handle POST or PUT: upsert product(s)
if ($method === 'POST' || $method === 'PUT') {
    $rawInput = file_get_contents('php://input');
    if (empty($rawInput)) {
        json_response(['success' => false, 'message' => 'Empty request body'], 400);
    }

    $payload = json_decode($rawInput, true);
    if (!is_array($payload)) {
        json_response(['success' => false, 'message' => 'Invalid JSON payload'], 400);
    }

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
            INSERT INTO `pvc_product_catalog` (
                `item_code`, `description`, `od_mm`, `wall_thickness`, `material`,
                `unit_weight`, `pipe_length`, `nominal_speed`, `target_pcs_h`,
                `primary_extruder`, `compatible_machines`, `historical_rate_kgh`,
                `is_pending`, `source`, `updated_at`
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, NOW()
            ) ON DUPLICATE KEY UPDATE
                `description` = VALUES(`description`),
                `od_mm` = COALESCE(NULLIF(VALUES(`od_mm`), ''), `od_mm`),
                `wall_thickness` = COALESCE(NULLIF(VALUES(`wall_thickness`), ''), `wall_thickness`),
                `material` = VALUES(`material`),
                `unit_weight` = COALESCE(VALUES(`unit_weight`), `unit_weight`),
                `pipe_length` = COALESCE(VALUES(`pipe_length`), `pipe_length`),
                `nominal_speed` = COALESCE(VALUES(`nominal_speed`), `nominal_speed`),
                `target_pcs_h` = COALESCE(VALUES(`target_pcs_h`), `target_pcs_h`),
                `primary_extruder` = COALESCE(NULLIF(VALUES(`primary_extruder`), ''), `primary_extruder`),
                `compatible_machines` = COALESCE(NULLIF(VALUES(`compatible_machines`), ''), `compatible_machines`),
                `historical_rate_kgh` = COALESCE(VALUES(`historical_rate_kgh`), `historical_rate_kgh`),
                `is_pending` = CASE WHEN `is_pending` = 0 THEN 0 ELSE VALUES(`is_pending`) END,
                `updated_at` = NOW()
        ");

        $savedCount = 0;
        foreach ($itemsToSave as $item) {
            $itemCode = trim($item['itemCode'] ?? $item['item_code'] ?? $item['code'] ?? '');
            if (empty($itemCode)) continue;

            $desc = trim($item['description'] ?? $item['productDescription'] ?? $item['spec'] ?? "Product Code {$itemCode}");
            $odMm = trim($item['odMm'] ?? $item['od_mm'] ?? '');
            $wt = trim($item['wallThickness'] ?? $item['wall_thickness'] ?? '');
            $mat = trim($item['material'] ?? 'uPVC');

            $unitWeight = isset($item['unitWeight']) ? (float)$item['unitWeight'] : (isset($item['unit_weight']) ? (float)$item['unit_weight'] : (isset($item['stdWeight']) ? (float)$item['stdWeight'] : null));
            $pipeLength = isset($item['pipeLength']) ? (float)$item['pipeLength'] : (isset($item['pipe_length']) ? (float)$item['pipe_length'] : 6.00);
            $speed = isset($item['nominalSpeed']) ? (float)$item['nominalSpeed'] : (isset($item['nominal_speed']) ? (float)$item['nominal_speed'] : null);
            $targetPcsH = isset($item['targetPcsH']) ? (int)$item['targetPcsH'] : (isset($item['target_pcs_h']) ? (int)$item['target_pcs_h'] : null);

            $primaryMach = trim($item['primaryExtruder'] ?? $item['primary_extruder'] ?? '');
            $compatMach = trim($item['compatibleMachines'] ?? $item['compatible_machines'] ?? '');
            $histRate = isset($item['historicalRateKgH']) ? (float)$item['historicalRateKgH'] : (isset($item['historical_rate_kgh']) ? (float)$item['historical_rate_kgh'] : null);
            $isPending = !empty($item['isPending']) || !empty($item['is_pending']) ? 1 : 0;
            $source = trim($item['source'] ?? 'manual');

            $stmt->execute([
                $itemCode,
                $desc,
                !empty($odMm) ? $odMm : null,
                !empty($wt) ? $wt : null,
                !empty($mat) ? $mat : 'uPVC',
                $unitWeight !== null && $unitWeight > 0 ? $unitWeight : null,
                $pipeLength !== null && $pipeLength > 0 ? $pipeLength : 6.00,
                $speed !== null && $speed > 0 ? $speed : null,
                $targetPcsH !== null && $targetPcsH > 0 ? $targetPcsH : null,
                !empty($primaryMach) ? $primaryMach : null,
                !empty($compatMach) ? $compatMach : null,
                $histRate !== null && $histRate > 0 ? $histRate : null,
                $isPending,
                !empty($source) ? $source : 'manual'
            ]);
            $savedCount++;
        }

        json_response([
            'success' => true,
            'message' => "Successfully saved {$savedCount} product catalog record(s)",
            'count' => $savedCount
        ], 200);
    } catch (PDOException $e) {
        json_response(['success' => false, 'message' => 'Database upsert failed: ' . $e->getMessage()], 500);
    }
}

// Handle DELETE: remove product
if ($method === 'DELETE') {
    $itemCode = isset($_GET['item_code']) ? trim($_GET['item_code']) : (isset($_GET['itemCode']) ? trim($_GET['itemCode']) : null);
    if (empty($itemCode)) {
        json_response(['success' => false, 'message' => 'Missing item_code parameter'], 400);
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM `pvc_product_catalog` WHERE UPPER(`item_code`) = ?");
        $stmt->execute([strtoupper($itemCode)]);
        $deleted = $stmt->rowCount();

        json_response([
            'success' => true,
            'message' => "Product {$itemCode} removed from catalog",
            'deletedCount' => $deleted
        ], 200);
    } catch (PDOException $e) {
        json_response(['success' => false, 'message' => 'Database deletion failed: ' . $e->getMessage()], 500);
    }
}

json_response(['success' => false, 'message' => 'Method not allowed'], 405);
