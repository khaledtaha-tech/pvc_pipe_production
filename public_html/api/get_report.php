<?php
/**
 * API Endpoint: Get Daily Report & Hourly Records
 * Method: GET
 * Params: ?id=123 OR ?date=YYYY-MM-DD&line=LINE_ID
 * Hostinger MySQL Integration for Daily_Records
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(['success' => false, 'message' => 'Method Not Allowed. Use GET.'], 405);
}

$id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int)$_GET['id'] : null;
$date = isset($_GET['date']) ? trim($_GET['date']) : null;
$line = isset($_GET['line']) ? trim($_GET['line']) : null;

if (!$id && (!$date || !$line)) {
    json_response([
        'success' => false,
        'message' => 'Provide either an "id" parameter or both "date" and "line" query parameters'
    ], 400);
}

$pdo = get_db_connection();

try {
    if ($id) {
        $stmt = $pdo->prepare("SELECT * FROM daily_reports WHERE id = ?");
        $stmt->execute([$id]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM daily_reports WHERE report_date = ? AND line_machine = ?");
        $stmt->execute([$date, $line]);
    }

    $row = $stmt->fetch();
    if (!$row) {
        json_response([
            'success' => false,
            'message' => 'Report not found for specified query'
        ], 404);
    }

    $report_id = (int)$row['id'];

    // Retrieve associated 24 hourly records
    $stmtH = $pdo->prepare("SELECT * FROM hourly_records WHERE report_id = ? ORDER BY hour_index ASC");
    $stmtH->execute([$report_id]);
    $hourlyRows = $stmtH->fetchAll();

    // Reconstruct report object
    $reportObj = null;
    if (!empty($row['raw_json'])) {
        $reportObj = json_decode($row['raw_json'], true);
    }

    if (!$reportObj || !is_array($reportObj)) {
        // Fallback reconstruction from columns
        $reportObj = [
            'id' => $row['client_id'] ?: 'db_' . $row['id'],
            'db_id' => $report_id,
            'header' => [
                'date' => $row['report_date'],
                'lineId' => $row['line_machine'],
                'lineCustom' => '',
                'plantName' => $row['plant_name']
            ],
            'refs' => [
                '1' => [
                    'od' => $row['ref1_od'] ?: '',
                    'wt' => $row['ref1_wt'] ?: '',
                    'pipeLength' => $row['ref1_length'] ?: '',
                    'cls' => $row['ref1_class'] ?: '',
                    'speed' => $row['ref1_speed'] ?: '',
                    'stdWeight' => $row['ref1_std_weight'] ?: '',
                    'targetRate' => $row['ref1_target_rate'] ?: ''
                ],
                '2' => [
                    'od' => $row['ref2_od'] ?: '',
                    'wt' => $row['ref2_wt'] ?: '',
                    'pipeLength' => $row['ref2_length'] ?: '',
                    'cls' => $row['ref2_class'] ?: '',
                    'speed' => $row['ref2_speed'] ?: '',
                    'stdWeight' => $row['ref2_std_weight'] ?: '',
                    'targetRate' => $row['ref2_target_rate'] ?: ''
                ]
            ],
            'summary' => [
                'startCounter' => (string)($row['start_counter'] ?? 0),
                'endCounter' => (string)($row['end_counter'] ?? 0),
                'totalOutput' => (string)($row['total_output_pcs'] ?? 0),
                'totalBundles' => (string)($row['total_bundles'] ?? 0),
                'totalScrapPipes' => (string)($row['total_scrap_pcs'] ?? 0),
                'totalPurgeKg' => (string)($row['total_purge_kg'] ?? 0),
                'haulOffMeter' => $row['haul_off_meter'] ?: '',
                'resinLot' => $row['resin_lot'] ?: '',
                'shift1Lead' => $row['shift1_lead'] ?: '',
                'shift2Lead' => $row['shift2_lead'] ?: '',
                'plantManager' => $row['plant_manager'] ?: ''
            ],
            'slots' => []
        ];
    }

    $reportObj['db_id'] = $report_id;
    $reportObj['updatedAt'] = strtotime($row['updated_at']) * 1000;

    // Attach hourly records to slots
    if (!empty($hourlyRows)) {
        $slots = [];
        foreach ($hourlyRows as $h) {
            $slots[] = [
                'index' => (int)$h['hour_index'],
                'window' => $h['hour_window'],
                'shift' => (int)$h['shift'],
                'startHour' => (int)$h['start_hour'],
                'ref' => $h['ref_key'] ?: '1',
                'downtime' => (float)$h['downtime_min'],
                'reason' => $h['downtime_reason'] ?: '',
                'target' => (float)$h['target_pcs'],
                'actual' => (float)$h['actual_pcs'],
                'scrap' => (float)$h['scrap_pcs'],
                'good' => (float)$h['good_pcs'],
                'bundles' => (int)$h['bundles'],
                'bundle' => (int)$h['bundles'],
                'purge' => (float)$h['purge_kg'],
                'endCounter' => (float)$h['end_counter'],
                'notes' => $h['notes'] ?: ''
            ];
        }
        $reportObj['slots'] = $slots;
    }

    json_response([
        'success' => true,
        'report' => $reportObj,
        'metrics' => [
            'operating_hours' => (float)$row['operating_hours'],
            'total_downtime_hours' => (float)$row['total_downtime_hours'],
            'actual_output_rate_kg_h' => (float)$row['actual_output_rate_kg_h'],
            'capacity_utilization_pct' => (float)$row['capacity_utilization_pct'],
            'availability_pct' => (float)$row['availability_pct'],
            'performance_pct' => (float)$row['performance_pct'],
            'quality_pct' => (float)$row['quality_pct'],
            'oee_pct' => (float)$row['oee_pct']
        ],
        'hourly' => $hourlyRows
    ]);

} catch (Exception $e) {
    json_response([
        'success' => false,
        'code' => 'FETCH_ERROR',
        'message' => 'Failed to fetch daily report: ' . $e->getMessage()
    ], 500);
}
