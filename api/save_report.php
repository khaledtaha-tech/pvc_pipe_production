<?php
/**
 * API Endpoint: Save Daily Report & Hourly Records
 * Method: POST
 * Hostinger MySQL Integration for Daily_Records
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

// Support payload structured as { report: {...}, derived: {...} } or direct report object
$report = isset($payload['report']) && is_array($payload['report']) ? $payload['report'] : $payload;
$derived = isset($payload['derived']) && is_array($payload['derived']) ? $payload['derived'] : null;

$header = $report['header'] ?? [];
$report_date = trim($header['date'] ?? '');
$lineId = trim($header['lineId'] ?? '');
$lineCustom = trim($header['lineCustom'] ?? '');
$line_machine = ($lineId === '__CUSTOM__' && !empty($lineCustom)) ? $lineCustom : $lineId;
$plant_name = trim($header['plantName'] ?? 'PVC PIPE EXTRUSION PLANT');

if (empty($report_date) || empty($line_machine)) {
    json_response([
        'success' => false,
        'message' => 'Missing mandatory fields: report date and machine/line identifier are required'
    ], 400);
}

$client_id = $report['id'] ?? null;
$refs = $report['refs'] ?? [];
$ref1 = $refs['1'] ?? [];
$ref2 = $refs['2'] ?? [];
$summary = $report['summary'] ?? [];

// Helper functions for numeric sanitization
$toNum = function($v, $default = 0) {
    return is_numeric($v) ? (float)$v : $default;
};
$toInt = function($v, $default = 0) {
    return is_numeric($v) ? (int)$v : $default;
};

// Extrusion Specs - Ref 1
$ref1_od = !empty($ref1['od']) ? (string)$ref1['od'] : null;
$ref1_wt = !empty($ref1['wt']) ? (string)$ref1['wt'] : null;
$ref1_length = !empty($ref1['pipeLength']) ? (string)$ref1['pipeLength'] : null;
$ref1_class = !empty($ref1['cls']) ? (string)$ref1['cls'] : null;
$ref1_speed = !empty($ref1['speed']) ? $toNum($ref1['speed']) : null;
$ref1_std_weight = !empty($ref1['stdWeight']) ? $toNum($ref1['stdWeight']) : null;
$ref1_target_rate = !empty($ref1['targetRate']) ? $toNum($ref1['targetRate']) : null;

// Extrusion Specs - Ref 2
$ref2_od = !empty($ref2['od']) ? (string)$ref2['od'] : null;
$ref2_wt = !empty($ref2['wt']) ? (string)$ref2['wt'] : null;
$ref2_length = !empty($ref2['pipeLength']) ? (string)$ref2['pipeLength'] : null;
$ref2_class = !empty($ref2['cls']) ? (string)$ref2['cls'] : null;
$ref2_speed = !empty($ref2['speed']) ? $toNum($ref2['speed']) : null;
$ref2_std_weight = !empty($ref2['stdWeight']) ? $toNum($ref2['stdWeight']) : null;
$ref2_target_rate = !empty($ref2['targetRate']) ? $toNum($ref2['targetRate']) : null;

// Counters & Summaries
$start_counter = $toNum($summary['startCounter'] ?? 0);
$end_counter = $toNum($summary['endCounter'] ?? 0);
$total_output_pcs = $toNum($summary['totalOutput'] ?? 0);
$total_bundles = $toInt($summary['totalBundles'] ?? 0);
$total_scrap_pcs = $toInt($summary['totalScrapPipes'] ?? 0);
$total_purge_kg = $toNum($summary['totalPurgeKg'] ?? 0);
$haul_off_meter = !empty($summary['haulOffMeter']) ? (string)$summary['haulOffMeter'] : null;
$resin_lot = !empty($summary['resinLot']) ? (string)$summary['resinLot'] : null;
$shift1_lead = !empty($summary['shift1Lead']) ? (string)$summary['shift1Lead'] : null;
$shift2_lead = !empty($summary['shift2Lead']) ? (string)$summary['shift2Lead'] : null;
$plant_manager = !empty($summary['plantManager']) ? (string)$summary['plantManager'] : null;

// Operational & OEE KPIs
$operating_hours = $derived ? $toNum($derived['operatingHours'] ?? 24) : 24.0;
$total_downtime_hours = $derived ? $toNum($derived['totalDowntimeHours'] ?? 0) : 0.0;
$total_downtime_min = $derived ? $toNum($derived['totalDowntimeMin'] ?? 0) : 0.0;

$engineering = $derived['engineering'] ?? ($report['engineering'] ?? []);
$actual_output_rate_kg_h = $toNum($engineering['actualRateKgH'] ?? 0);
$nominal_capacity_kg_h = $toNum($engineering['nominalCapacityKgH'] ?? 0);
$capacity_utilization_pct = $toNum($engineering['capacityUtilizationPct'] ?? 0);

$availability_pct = $derived ? round($toNum($derived['availability'] ?? 0) * 100, 2) : 0;
$performance_pct = $derived ? round($toNum($derived['performance'] ?? 0) * 100, 2) : 0;
$quality_pct = $derived ? round($toNum($derived['quality'] ?? 0) * 100, 2) : 0;
$oee_pct = $derived ? round($toNum($derived['oee'] ?? 0) * 100, 2) : 0;

$raw_json = json_encode($report, JSON_UNESCAPED_UNICODE);

// Hourly Slots
$sourceSlots = ($derived && !empty($derived['slots'])) ? $derived['slots'] : ($report['slots'] ?? []);

$pdo = get_db_connection();

try {
    $pdo->beginTransaction();

    // Check if record exists for this date and line
    $stmtCheck = $pdo->prepare("SELECT id FROM daily_reports WHERE report_date = ? AND line_machine = ? FOR UPDATE");
    $stmtCheck->execute([$report_date, $line_machine]);
    $existing = $stmtCheck->fetch();

    if ($existing) {
        $report_id = (int)$existing['id'];
        $sqlUpdate = "UPDATE daily_reports SET
            client_id = ?, plant_name = ?,
            ref1_od = ?, ref1_wt = ?, ref1_length = ?, ref1_class = ?, ref1_speed = ?, ref1_std_weight = ?, ref1_target_rate = ?,
            ref2_od = ?, ref2_wt = ?, ref2_length = ?, ref2_class = ?, ref2_speed = ?, ref2_std_weight = ?, ref2_target_rate = ?,
            start_counter = ?, end_counter = ?, total_output_pcs = ?, total_bundles = ?, total_scrap_pcs = ?, total_purge_kg = ?,
            haul_off_meter = ?, resin_lot = ?, shift1_lead = ?, shift2_lead = ?, plant_manager = ?,
            operating_hours = ?, total_downtime_hours = ?, total_downtime_min = ?,
            actual_output_rate_kg_h = ?, nominal_capacity_kg_h = ?, capacity_utilization_pct = ?,
            availability_pct = ?, performance_pct = ?, quality_pct = ?, oee_pct = ?,
            raw_json = ?, updated_at = NOW()
            WHERE id = ?";

        $stmtUpdate = $pdo->prepare($sqlUpdate);
        $stmtUpdate->execute([
            $client_id, $plant_name,
            $ref1_od, $ref1_wt, $ref1_length, $ref1_class, $ref1_speed, $ref1_std_weight, $ref1_target_rate,
            $ref2_od, $ref2_wt, $ref2_length, $ref2_class, $ref2_speed, $ref2_std_weight, $ref2_target_rate,
            $start_counter, $end_counter, $total_output_pcs, $total_bundles, $total_scrap_pcs, $total_purge_kg,
            $haul_off_meter, $resin_lot, $shift1_lead, $shift2_lead, $plant_manager,
            $operating_hours, $total_downtime_hours, $total_downtime_min,
            $actual_output_rate_kg_h, $nominal_capacity_kg_h, $capacity_utilization_pct,
            $availability_pct, $performance_pct, $quality_pct, $oee_pct,
            $raw_json,
            $report_id
        ]);

        // Clean out prior hourly rows for atomic replacement
        $stmtDel = $pdo->prepare("DELETE FROM hourly_records WHERE report_id = ?");
        $stmtDel->execute([$report_id]);
    } else {
        $sqlInsert = "INSERT INTO daily_reports (
            client_id, report_date, line_machine, plant_name,
            ref1_od, ref1_wt, ref1_length, ref1_class, ref1_speed, ref1_std_weight, ref1_target_rate,
            ref2_od, ref2_wt, ref2_length, ref2_class, ref2_speed, ref2_std_weight, ref2_target_rate,
            start_counter, end_counter, total_output_pcs, total_bundles, total_scrap_pcs, total_purge_kg,
            haul_off_meter, resin_lot, shift1_lead, shift2_lead, plant_manager,
            operating_hours, total_downtime_hours, total_downtime_min,
            actual_output_rate_kg_h, nominal_capacity_kg_h, capacity_utilization_pct,
            availability_pct, performance_pct, quality_pct, oee_pct,
            raw_json
        ) VALUES (
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?
        )";

        $stmtInsert = $pdo->prepare($sqlInsert);
        $stmtInsert->execute([
            $client_id, $report_date, $line_machine, $plant_name,
            $ref1_od, $ref1_wt, $ref1_length, $ref1_class, $ref1_speed, $ref1_std_weight, $ref1_target_rate,
            $ref2_od, $ref2_wt, $ref2_length, $ref2_class, $ref2_speed, $ref2_std_weight, $ref2_target_rate,
            $start_counter, $end_counter, $total_output_pcs, $total_bundles, $total_scrap_pcs, $total_purge_kg,
            $haul_off_meter, $resin_lot, $shift1_lead, $shift2_lead, $plant_manager,
            $operating_hours, $total_downtime_hours, $total_downtime_min,
            $actual_output_rate_kg_h, $nominal_capacity_kg_h, $capacity_utilization_pct,
            $availability_pct, $performance_pct, $quality_pct, $oee_pct,
            $raw_json
        ]);
        $report_id = (int)$pdo->lastInsertId();
    }

    // Insert 24 hourly slot records
    if (!empty($sourceSlots)) {
        $sqlHourly = "INSERT INTO hourly_records (
            report_id, hour_index, hour_window, shift, start_hour, ref_key,
            downtime_min, downtime_reason, target_pcs, actual_pcs, scrap_pcs, good_pcs,
            bundles, purge_kg, end_counter, notes
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?
        )";
        $stmtH = $pdo->prepare($sqlHourly);

        foreach ($sourceSlots as $s) {
            $h_index = $toInt($s['index'] ?? 0);
            $h_window = (string)($s['window'] ?? '');
            $h_shift = $toInt($s['shift'] ?? ($h_index < 12 ? 1 : 2));
            $h_startHour = $toInt($s['startHour'] ?? ((7 + $h_index) % 24));
            $h_refKey = (string)($s['ref'] ?? '1');
            $h_downtime = $toNum($s['downtime'] ?? 0);
            $h_reason = !empty($s['reason']) ? (string)$s['reason'] : null;
            $h_target = $toNum($s['target'] ?? 0);
            $h_actual = $toNum($s['actual'] ?? 0);
            $h_scrap = $toNum($s['scrap'] ?? 0);
            $h_good = $toNum($s['good'] ?? max(0, $h_actual - $h_scrap));
            $h_bundles = $toInt($s['bundles'] ?? ($s['bundle'] ?? 0));
            $h_purge = $toNum($s['purge'] ?? 0);
            $h_endCounter = $toNum($s['endCounter'] ?? 0);
            $h_notes = !empty($s['notes']) ? (string)$s['notes'] : null;

            $stmtH->execute([
                $report_id, $h_index, $h_window, $h_shift, $h_startHour, $h_refKey,
                $h_downtime, $h_reason, $h_target, $h_actual, $h_scrap, $h_good,
                $h_bundles, $h_purge, $h_endCounter, $h_notes
            ]);
        }
    }

    $pdo->commit();

    json_response([
        'success' => true,
        'report_id' => $report_id,
        'report_date' => $report_date,
        'line_machine' => $line_machine,
        'message' => 'Daily report and 24-hour records successfully synchronized to MySQL database'
    ], 200);

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_response([
        'success' => false,
        'code' => 'SAVE_ERROR',
        'message' => 'Failed to save daily report: ' . $e->getMessage()
    ], 500);
}
