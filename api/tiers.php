<?php
/**
 * API Endpoint: Subscription Tiers & Feature Matrix
 * Method: GET, PUT
 * Manages tiers (Free, Basic, Premium) and feature permissions
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true]);
    exit;
}

require_once __DIR__ . '/config.php';

try {
    $pdo = get_db_connection();
    ensure_auth_tables_exist($pdo);

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT tier_key, name, features_json, max_active_machines, max_monthly_reports, updated_at FROM `subscription_tiers` ORDER BY FIELD(tier_key, 'free', 'basic', 'premium') ASC");
        $tiers = $stmt->fetchAll();

        foreach ($tiers as &$tier) {
            $tier['max_active_machines'] = (int)$tier['max_active_machines'];
            $tier['max_monthly_reports'] = (int)$tier['max_monthly_reports'];
            $tier['features'] = json_decode($tier['features_json'], true) ?: [];
        }
        unset($tier);

        // Feature catalogue dictionary for frontend reference
        $featureCatalog = [
            'dashboard_view' => ['name' => 'Plant Executive Dashboard', 'category' => 'view'],
            'daily_sheet_view' => ['name' => 'Daily Shift Sheet View', 'category' => 'view'],
            'daily_reconciliation' => ['name' => 'Shift Reconciliation Matrix', 'category' => 'core'],
            'manual_entry' => ['name' => 'Manual Shift Entry & Editing', 'category' => 'core'],
            'auto_reconcile' => ['name' => 'Automated Tolerancing Reconcile', 'category' => 'core'],
            'basic_excel_export' => ['name' => 'Standard Excel Report Export', 'category' => 'export'],
            'save_database' => ['name' => 'Cloud Database Saving', 'category' => 'data'],
            'master_planning' => ['name' => 'Master Extrusion Production Planning', 'category' => 'advanced'],
            'erp_data_hub' => ['name' => 'ERP Data Hub Import & Verification', 'category' => 'advanced'],
            'product_catalog_admin' => ['name' => 'Product Catalog Admin Management', 'category' => 'admin'],
            'high_res_audit_pdf' => ['name' => 'High-Res Audit PDF & Cleaned Reports', 'category' => 'export'],
            'unlimited_machines' => ['name' => 'Unlimited Machine Lines', 'category' => 'scale'],
            'unlimited_reports' => ['name' => 'Unlimited Cloud Reports', 'category' => 'scale'],
            'priority_support' => ['name' => '24/7 Priority Support & Calibration', 'category' => 'service']
        ];

        json_response([
            'success' => true,
            'tiers' => $tiers,
            'feature_catalog' => $featureCatalog
        ]);
    }

    if ($method === 'PUT') {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);

        if (!is_array($data) || empty($data['tier_key'])) {
            json_response(['success' => false, 'message' => 'tier_key is required'], 400);
        }

        $tierKey = trim($data['tier_key']);
        $name = trim($data['name'] ?? '');
        $features = isset($data['features']) && is_array($data['features']) ? json_encode($data['features']) : null;
        $maxMachines = isset($data['max_active_machines']) ? (int)$data['max_active_machines'] : null;
        $maxReports = isset($data['max_monthly_reports']) ? (int)$data['max_monthly_reports'] : null;

        $updates = [];
        $params = [':tier' => $tierKey];

        if ($name !== '') {
            $updates[] = '`name` = :name';
            $params[':name'] = $name;
        }
        if ($features !== null) {
            $updates[] = '`features_json` = :features';
            $params[':features'] = $features;
        }
        if ($maxMachines !== null) {
            $updates[] = '`max_active_machines` = :max_m';
            $params[':max_m'] = $maxMachines;
        }
        if ($maxReports !== null) {
            $updates[] = '`max_monthly_reports` = :max_r';
            $params[':max_r'] = $maxReports;
        }

        if (!empty($updates)) {
            $sql = 'UPDATE `subscription_tiers` SET ' . implode(', ', $updates) . ' WHERE `tier_key` = :tier';
            $pdo->prepare($sql)->execute($params);
        }

        json_response(['success' => true, 'message' => 'Tier configuration updated successfully']);
    }

    json_response(['success' => false, 'message' => 'Method Not Allowed'], 405);

} catch (Throwable $e) {
    json_response(['success' => false, 'message' => 'Tiers error: ' . $e->getMessage()], 500);
}
