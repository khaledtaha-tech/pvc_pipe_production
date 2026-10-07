import assert from 'assert';
import {
  calculateMatrixRowMetrics,
  autoBalanceRowHours,
  buildMatrixRowsForDate,
  reconcileMatrixRow,
  exportMatrixToWorkbook,
  categorizeDowntimeReason,
  applyMatrixRowInput,
  cleanPositiveNumber,
  isDowntimeField
} from '../../src/logic/reconciliationMatrixHelper.js';
import { MACHINES } from '../../src/config/machines.js';

console.log('--- Starting Daily Reconciliation Matrix Unit Tests ---');

// Test 1: Downtime reason categorization
{
  assert.strictEqual(categorizeDowntimeReason('Die / Mold Changeover'), 'moldChangeHours');
  assert.strictEqual(categorizeDowntimeReason('Tooling Adjustment'), 'moldChangeHours');
  assert.strictEqual(categorizeDowntimeReason('Color / Material Purge & Cleaning'), 'purgeCleaningHours');
  assert.strictEqual(categorizeDowntimeReason('Heater / Thermocouple Failure'), 'heaterFailureHours');
  assert.strictEqual(categorizeDowntimeReason('Mechanical Jam / Puller Fix'), 'mechanicalHours');
  assert.strictEqual(categorizeDowntimeReason('Raw Material Shortage / No Resin'), 'materialNoOrderHours');
  assert.strictEqual(categorizeDowntimeReason('No Order (Planned Factory Shutdown)'), 'materialNoOrderHours');
  assert.strictEqual(categorizeDowntimeReason('Power / Chiller Interruption'), 'otherHours');
  console.log('Test 1 Passed: Downtime reasons correctly categorized');
}

// Test 2: Matrix row metrics calculation & 24h balance
{
  const row = {
    lineId: 'L-01',
    lineName: 'Battenfeld-01',
    nominalCapacity: 200,
    targetRate: 50, // 50 pcs/h
    stdWeight: 3.5, // 3.5 kg/pc
    actualPcs: 1000,
    actualKg: 3500,
    operatingHours: 20.0,
    moldChangeHours: 2.0,
    purgeCleaningHours: 0.5,
    heaterFailureHours: 0.0,
    mechanicalHours: 1.5,
    materialNoOrderHours: 0.0,
    otherHours: 0.0
  };

  const metrics = calculateMatrixRowMetrics(row);

  // Expected 24h = 24 * 50 = 1200 pcs
  assert.strictEqual(metrics.expectedPcs, 1200);
  // Expected 24h Kg = 1200 * 3.5 = 4200 kg
  assert.strictEqual(metrics.expectedKg, 4200);
  // Deficit = 1200 - 1000 = 200 pcs
  assert.strictEqual(metrics.deficitPcs, 200);
  // Deficit Kg = 4200 - 3500 = 700 kg
  assert.strictEqual(metrics.deficitKg, 700);
  // Lost hours = 200 / 50 = 4.0 hours
  assert.strictEqual(metrics.lostHours, 4.0);

  // Total accounted hours = 20 + 2 + 0.5 + 1.5 = 24.0 hours
  assert.strictEqual(metrics.totalAccountedHours, 24.0);
  assert.strictEqual(metrics.varianceHours, 0);
  assert.strictEqual(metrics.balanceStatus, 'balanced');
  assert.strictEqual(metrics.balanceLabel, '24.0h Balanced');

  // Availability = (20 / 24) * 100 = 83.3%
  assert.strictEqual(metrics.availabilityPct, 83.3);
  // Target for operating = 20 * 50 = 1000 pcs -> Performance = (1000 / 1000) * 100 = 100%
  assert.strictEqual(metrics.performancePct, 100.0);
  // OEE = 83.3 * 1.0 = 83.3%
  assert.strictEqual(metrics.oeePct, 83.3);

  // Realized Pace / Operating Rate & Speed Efficiency
  // actualRatePcsH = 1000 pcs / 20h = 50.0 pcs/h
  assert.strictEqual(metrics.actualRatePcsH, 50.0);
  // actualRateKgH = 3500 kg / 20h = 175.0 kg/h
  assert.strictEqual(metrics.actualRateKgH, 175.0);
  // speedEfficiencyPct = (175 kg/h / 200 kg/h nominal) * 100 = 87.5%
  assert.strictEqual(metrics.speedEfficiencyPct, 87.5);

  console.log('Test 2 Passed: Row metrics and 24h balanced telemetry verified');
}

// Test 3: Imbalanced hours detection (under and over)
{
  const underRow = calculateMatrixRowMetrics({
    targetRate: 50,
    actualPcs: 800,
    operatingHours: 16.0,
    moldChangeHours: 2.0 // total 18h accounted -> 6h remaining
  });
  assert.strictEqual(underRow.balanceStatus, 'under');
  assert.strictEqual(underRow.totalAccountedHours, 18.0);
  assert.strictEqual(underRow.varianceHours, 6.0);
  assert.strictEqual(underRow.balanceLabel, '6h Remaining');

  const overRow = calculateMatrixRowMetrics({
    targetRate: 50,
    actualPcs: 1200,
    operatingHours: 22.0,
    moldChangeHours: 4.0 // total 26h accounted -> 2h exceeded
  });
  assert.strictEqual(overRow.balanceStatus, 'over');
  assert.strictEqual(overRow.totalAccountedHours, 26.0);
  assert.strictEqual(overRow.varianceHours, -2.0);
  assert.strictEqual(overRow.balanceLabel, '+2h Exceeded');

  console.log('Test 3 Passed: Under and over balance detection verified');
}

// Test 4: Auto-balance helper
{
  const underRow = {
    targetRate: 50,
    operatingHours: 18.0,
    moldChangeHours: 2.0, // total 20h
    purgeCleaningHours: 0,
    heaterFailureHours: 0,
    mechanicalHours: 0,
    materialNoOrderHours: 0,
    otherHours: 0
  };

  // Adjust operating hours mode: op becomes 24 - 2 = 22h
  const balancedOp = autoBalanceRowHours(underRow, 'adjust_op');
  assert.strictEqual(balancedOp.operatingHours, 22.0);
  assert.strictEqual(balancedOp.totalAccountedHours, 24.0);
  assert.strictEqual(balancedOp.balanceStatus, 'balanced');

  // Adjust other stoppages mode: other becomes 24 - (18 + 2) = 4h
  const balancedOther = autoBalanceRowHours(underRow, 'adjust_other');
  assert.strictEqual(balancedOther.operatingHours, 18.0);
  assert.strictEqual(balancedOther.otherHours, 4.0);
  assert.strictEqual(balancedOther.totalAccountedHours, 24.0);
  assert.strictEqual(balancedOther.balanceStatus, 'balanced');

  console.log('Test 4 Passed: Auto-balance adjustments verified');
}

// Test 5: Build matrix rows from mock datasets and saved reports
{
  const mockDataset = [
    {
      date: '2026-03-15',
      machineId: 'L-01',
      productCode: '110-C4',
      productName: '110 mm Class 4',
      cutLength: 6.0,
      weightPerPiece: 3.8,
      standardRate: 40,
      productionQty: 800,
      totalWeight: 3040,
      operatingHours: 20.0
    }
  ];

  const rows = buildMatrixRowsForDate({
    date: '2026-03-15',
    machineMaster: MACHINES,
    combinedDatasets: mockDataset,
    loadReportByDateAndMachineFn: () => null
  });

  assert.strictEqual(rows.length, MACHINES.length);
  const l01 = rows.find((r) => r.lineId === 'L-01');
  assert.ok(l01);
  assert.strictEqual(l01.actualPcs, 800);
  assert.strictEqual(l01.actualKg, 3040);
  assert.strictEqual(l01.stdWeight, 3.8);
  assert.strictEqual(l01.targetRate, 78.9, 'Target rate must be dynamically derived from machine engineering: 300 kg/h / 3.8 kg/pc = 78.9 pcs/h');
  assert.strictEqual(l01.pipeSize, '110 mm Class 4', 'Running pipe size must be extracted from productName/description');
  assert.strictEqual(l01.isOperating, true);

  // Machines with no production default to full day idle / No Order
  const idle = rows.find((r) => r.lineId === 'L-07');
  assert.ok(idle);
  assert.strictEqual(idle.actualPcs, 0);
  assert.strictEqual(idle.operatingHours, 0);
  assert.strictEqual(idle.materialNoOrderHours, 24.0);
  assert.strictEqual(idle.totalAccountedHours, 24.0);
  assert.strictEqual(idle.balanceStatus, 'balanced');

  console.log('Test 5 Passed: Matrix rows construction from dataset and defaults verified');
}

// Test 6: Reconcile matrix row into 24-hour slots and engineering state
{
  const rowToReconcile = {
    lineId: 'L-02',
    lineName: 'Battenfeld-02',
    nominalCapacity: 200,
    targetRate: 60,
    stdWeight: 2.5,
    actualPcs: 1200,
    actualKg: 3000,
    operatingHours: 20.0,
    moldChangeHours: 2.0,
    purgeCleaningHours: 1.0,
    heaterFailureHours: 0.0,
    mechanicalHours: 1.0,
    materialNoOrderHours: 0.0,
    otherHours: 0.0
  };

  const reconciledRep = reconcileMatrixRow(rowToReconcile, null, MACHINES);

  assert.strictEqual(reconciledRep.isReconciled, true);
  assert.strictEqual(reconciledRep.slots.length, 24);
  assert.strictEqual(reconciledRep.summary.totalOutput, '1200');
  assert.strictEqual(reconciledRep.engineering.operatingHours, 20.0);
  assert.strictEqual(reconciledRep.engineering.totalWeightKg, 3000);
  assert.strictEqual(reconciledRep.refs['1'].targetRate, 60);
  assert.strictEqual(reconciledRep.refs['1'].stdWeight, 2.5);

  // Total downtime in slots should be 4 hours (240 minutes)
  const slotDtSum = reconciledRep.slots.reduce((sum, s) => sum + (Number(s.downtime) || 0), 0);
  assert.strictEqual(slotDtSum, 240);

  // Total actual pieces distributed across slots should equal 1200
  const slotActualSum = reconciledRep.slots.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
  assert.strictEqual(slotActualSum, 1200);

  console.log('Test 6 Passed: Row reconciliation generated 24 slots with exact outputs');
}

// Test 7: Full 24h Stoppage ("No Order" 1440 min) reconciliation
{
  const fullStopRow = {
    lineId: 'L-03',
    lineName: 'Battenfeld-03',
    nominalCapacity: 200,
    targetRate: 50,
    stdWeight: 3.0,
    actualPcs: 0,
    actualKg: 0,
    operatingHours: 0.0,
    moldChangeHours: 0.0,
    purgeCleaningHours: 0.0,
    heaterFailureHours: 0.0,
    mechanicalHours: 0.0,
    materialNoOrderHours: 24.0,
    otherHours: 0.0
  };

  const reconciledRep = reconcileMatrixRow(fullStopRow, null, MACHINES);

  assert.strictEqual(reconciledRep.isReconciled, true);
  assert.strictEqual(reconciledRep.slots.length, 24);
  assert.strictEqual(reconciledRep.engineering.operatingHours, 0);

  // All 24 slots must have 60 min downtime each (1440 min total)
  const all60 = reconciledRep.slots.every((s) => Number(s.downtime) === 60);
  assert.strictEqual(all60, true);
  const totalActual = reconciledRep.slots.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
  assert.strictEqual(totalActual, 0);

  console.log('Test 7 Passed: Full 24h shutdown correctly populated 24 slots with 60m downtime');
}

// Test 8: Export Matrix to Excel Workbook
{
  const sampleRows = [
    calculateMatrixRowMetrics({
      lineId: 'L-01',
      lineName: 'Battenfeld-01',
      nominalCapacity: 200,
      targetRate: 50,
      stdWeight: 3.5,
      actualPcs: 1000,
      actualKg: 3500,
      operatingHours: 20.0,
      moldChangeHours: 2.0,
      mechanicalHours: 2.0
    }),
    calculateMatrixRowMetrics({
      lineId: 'L-02',
      lineName: 'Battenfeld-02',
      nominalCapacity: 200,
      targetRate: 60,
      stdWeight: 2.5,
      actualPcs: 0,
      operatingHours: 0.0,
      materialNoOrderHours: 24.0
    })
  ];

  const wb = exportMatrixToWorkbook(sampleRows, '2026-03-15');
  assert.ok(wb.SheetNames.includes('Reconciliation_2026-03-15'));
  const sheet = wb.Sheets['Reconciliation_2026-03-15'];
  assert.ok(sheet);
  assert.strictEqual(sheet['A1'].v, 'Line ID');
  assert.strictEqual(sheet['B1'].v, 'Machine Name');
  assert.strictEqual(sheet['C1'].v, 'Pipe Size & Specs');
  assert.strictEqual(sheet['D1'].v, 'Nominal Cap (kg/h)');
  assert.strictEqual(sheet['A2'].v, 'L-01');
  assert.strictEqual(sheet['A3'].v, 'L-02');

  console.log('Test 8 Passed: Matrix Excel workbook generated successfully');
}

// Test 9: Live Reactive 24h Auto-Rebalance on Downtime Input (4h Purge & Cleaning scenario)
{
  const initialRow = {
    lineId: 'L-01',
    lineName: 'Battenfeld-01',
    nominalCapacity: 200,
    targetRate: 50,
    stdWeight: 3.5,
    actualPcs: 1000,
    actualKg: 3500,
    operatingHours: 24.0,
    moldChangeHours: 0.0,
    purgeCleaningHours: 0.0,
    heaterFailureHours: 0.0,
    mechanicalHours: 0.0,
    materialNoOrderHours: 0.0,
    otherHours: 0.0
  };

  // User enters 4h in Purge & Cleaning
  const step1 = applyMatrixRowInput(initialRow, 'purgeCleaningHours', 4);
  assert.strictEqual(step1.purgeCleaningHours, 4.0);
  assert.strictEqual(step1.operatingHours, 20.0, 'Operating hours must automatically balance down to 20.0h');
  assert.strictEqual(step1.totalDowntimeHours, 4.0);
  assert.strictEqual(step1.totalAccountedHours, 24.0, 'Total accounted hours must remain pinned to 24.0h');
  assert.strictEqual(step1.balanceStatus, 'balanced');
  assert.strictEqual(step1.balanceLabel, '24.0h Balanced');
  assert.strictEqual(step1.availabilityPct, 83.3, 'Availability must rebalance to 83.3% (20h / 24h)');
  assert.strictEqual(step1.performancePct, 100.0, 'Performance must be 100.0% (1000 / (20 * 50))');
  assert.strictEqual(step1.oeePct, 83.3, 'OEE must rebalance to 83.3%');

  // User adds another 2h in Mold Change
  const step2 = applyMatrixRowInput(step1, 'moldChangeHours', 2);
  assert.strictEqual(step2.moldChangeHours, 2.0);
  assert.strictEqual(step2.purgeCleaningHours, 4.0);
  assert.strictEqual(step2.operatingHours, 18.0, 'Operating hours must automatically balance down to 18.0h');
  assert.strictEqual(step2.totalDowntimeHours, 6.0);
  assert.strictEqual(step2.totalAccountedHours, 24.0);
  assert.strictEqual(step2.balanceStatus, 'balanced');
  assert.strictEqual(step2.availabilityPct, 75.0, 'Availability must rebalance to 75.0% (18h / 24h)');
  assert.strictEqual(step2.performancePct, 100.0, 'Performance must be capped at 100.0%');
  assert.strictEqual(step2.oeePct, 75.0);

  // User clears Mold Change input (backspaces to '')
  const step3 = applyMatrixRowInput(step2, 'moldChangeHours', '');
  assert.strictEqual(step3.moldChangeHours, '', 'Empty string must be preserved while typing');
  assert.strictEqual(step3.operatingHours, 20.0, 'Operating hours must balance back up to 20.0h');
  assert.strictEqual(step3.totalDowntimeHours, 4.0);
  assert.strictEqual(step3.totalAccountedHours, 24.0);
  assert.strictEqual(step3.availabilityPct, 83.3);

  console.log('Test 9 Passed: Dynamic 24h auto-rebalance on downtime input verified');
}

// Test 10: Manual Operating Hours Decoupling & Sparkle Auto-Balance Recovery
{
  const balancedRow = {
    lineId: 'L-01',
    targetRate: 50,
    actualPcs: 1000,
    operatingHours: 20.0,
    purgeCleaningHours: 4.0
  };

  // User directly edits Operating Hours to 16.0h (decoupling from 24h balance)
  const decoupledRow = applyMatrixRowInput(balancedRow, 'operatingHours', 16.0);
  assert.strictEqual(decoupledRow.operatingHours, 16.0, 'Direct manual edit must be respected');
  assert.strictEqual(decoupledRow.purgeCleaningHours, 4.0);
  assert.strictEqual(decoupledRow.totalAccountedHours, 20.0);
  assert.strictEqual(decoupledRow.varianceHours, 4.0);
  assert.strictEqual(decoupledRow.balanceStatus, 'under');
  assert.strictEqual(decoupledRow.balanceLabel, '4h Remaining');
  assert.strictEqual(decoupledRow.availabilityPct, 66.7, 'Availability must recalculate: 16h / 24h = 66.7%');

  // User clicks sparkle Auto-Balance button
  const restored = autoBalanceRowHours(decoupledRow, 'adjust_op');
  assert.strictEqual(restored.operatingHours, 20.0, 'Auto-balance must re-align Operating Hours to 24 - 4 = 20h');
  assert.strictEqual(restored.totalAccountedHours, 24.0);
  assert.strictEqual(restored.balanceStatus, 'balanced');
  assert.strictEqual(restored.availabilityPct, 83.3);

  console.log('Test 10 Passed: Manual operating hours decoupling & sparkle recovery verified');
}

// Test 11: Reactive Std Weight, Actual Pcs, and Rate Recalculations
{
  const base = {
    targetRate: 40,
    stdWeight: 3.0,
    actualPcs: 800,
    actualKg: 2400,
    operatingHours: 20.0
  };

  // Change Std Weight to 4.5
  const withNewWeight = applyMatrixRowInput(base, 'stdWeight', 4.5);
  assert.strictEqual(withNewWeight.stdWeight, 4.5);
  assert.strictEqual(withNewWeight.actualKg, 3600.0, 'Actual Kg must update: 800 * 4.5 = 3600');
  assert.strictEqual(withNewWeight.expectedKg, 4320.0, 'Expected Kg must update: (24 * 40) * 4.5 = 4320');

  // Change Actual Pcs to 1000
  const withNewPcs = applyMatrixRowInput(withNewWeight, 'actualPcs', 1000);
  assert.strictEqual(withNewPcs.actualPcs, 1000);
  assert.strictEqual(withNewPcs.actualKg, 4500.0, 'Actual Kg must update: 1000 * 4.5 = 4500');

  // Negative / NaN input sanitization
  const cleanNeg = cleanPositiveNumber(-10);
  assert.strictEqual(cleanNeg, 0);
  const cleanNaN = cleanPositiveNumber('not-a-number');
  assert.strictEqual(cleanNaN, 0);
  const cleanNull = cleanPositiveNumber(null);
  assert.strictEqual(cleanNull, 0);

  console.log('Test 11 Passed: Reactive weight, pieces, rate calculations & sanitizers verified');
}

// Test 12: Initial Load Auto-Balance Normalization for Legacy / Overscheduled Reports
{
  const overscheduledReport = {
    header: { date: '2026-03-20', itemCode: 'PIPE-110' },
    engineering: { operatingHours: 24.0, totalWeightKg: 1000 },
    slots: Array(24).fill({ actual: 50, downtime: 0, reason: '' }),
    downtimeEvents: [
      { reason: 'Color / Material Purge & Cleaning', durationMin: 240 } // 4 hours
    ]
  };

  const rows = buildMatrixRowsForDate({
    date: '2026-03-20',
    machineMaster: [{ id: 'L-01', name: 'Line 01', nominalCapacity: 200 }],
    combinedDatasets: [],
    loadReportByDateAndMachineFn: () => overscheduledReport
  });

  assert.strictEqual(rows.length, 1);
  const l01 = rows[0];
  assert.strictEqual(l01.purgeCleaningHours, 4.0);
  assert.strictEqual(l01.operatingHours, 20.0, 'Legacy report with 24h op + 4h downtime must be normalized to 20.0h');
  assert.strictEqual(l01.totalAccountedHours, 24.0);
  assert.strictEqual(l01.balanceStatus, 'balanced');

  console.log('Test 12 Passed: Initial load normalization for overscheduled reports verified');
}

// Test 13: Dedicated Actual Operating Rate (Pcs/h & kg/h) and Speed Efficiency (%) tests
{
  // 1. Throttled/slow run: 600 pcs in 20 operating hours, stdWeight 3.0 kg/pc, nominalCapacity 200 kg/h
  const throttledRow = calculateMatrixRowMetrics({
    operatingHours: 20.0,
    actualPcs: 600,
    stdWeight: 3.0,
    nominalCapacity: 200
  });
  // actualRatePcsH = 600 / 20 = 30.0 pcs/h
  assert.strictEqual(throttledRow.actualRatePcsH, 30.0);
  // actualRateKgH = (600 * 3.0) / 20 = 1800 / 20 = 90.0 kg/h
  assert.strictEqual(throttledRow.actualRateKgH, 90.0);
  // speedEfficiencyPct = (90 / 200) * 100 = 45.0%
  assert.strictEqual(throttledRow.speedEfficiencyPct, 45.0);

  // 2. High-speed run: 1000 pcs in 10 operating hours, stdWeight 2.0 kg/pc, nominalCapacity 180 kg/h
  const highSpeedRow = calculateMatrixRowMetrics({
    operatingHours: 10.0,
    actualPcs: 1000,
    stdWeight: 2.0,
    nominalCapacity: 180
  });
  // actualRatePcsH = 1000 / 10 = 100.0 pcs/h
  assert.strictEqual(highSpeedRow.actualRatePcsH, 100.0);
  // actualRateKgH = 2000 / 10 = 200.0 kg/h
  assert.strictEqual(highSpeedRow.actualRateKgH, 200.0);
  // speedEfficiencyPct = (200 / 180) * 100 = 111.1%
  assert.strictEqual(highSpeedRow.speedEfficiencyPct, 111.1);

  // 3. Zero operating hours / idle line: must safely return 0 without NaN or throwing
  const idleRow = calculateMatrixRowMetrics({
    operatingHours: 0.0,
    actualPcs: 0,
    stdWeight: 3.0,
    nominalCapacity: 200
  });
  assert.strictEqual(idleRow.actualRatePcsH, 0);
  assert.strictEqual(idleRow.actualRateKgH, 0);
  assert.strictEqual(idleRow.speedEfficiencyPct, 0);

  // 4. Excel workbook contains Actual Rate columns directly after Operating Hours
  const sampleWb = exportMatrixToWorkbook([throttledRow], '2026-03-25');
  const sheet = sampleWb.Sheets['Reconciliation_2026-03-25'];
  assert.strictEqual(sheet['O1'].v, 'Operating Hours (h)');
  assert.strictEqual(sheet['P1'].v, 'Actual Rate (Pcs/h)');
  assert.strictEqual(sheet['Q1'].v, 'Actual Rate (kg/h)');
  assert.strictEqual(sheet['R1'].v, 'Speed Efficiency (%)');
  assert.strictEqual(sheet['P2'].v, 30.0);
  assert.strictEqual(sheet['Q2'].v, 90.0);
  assert.strictEqual(sheet['R2'].v, 45.0);

  console.log('Test 13 Passed: Actual operating rates and speed efficiency verified');
}

// Test 14: Engineering Std Rate Derivation (eliminate 100 pcs/h anomaly) and Ingested Operating Hours Default
{
  // 1. Dynamic derivation when stdWeight is edited
  const initialRow = {
    nominalCapacity: 250,
    stdWeight: 5.0,
    actualPcs: 1000
  };
  const derived = calculateMatrixRowMetrics(initialRow);
  assert.strictEqual(derived.targetRate, 50.0, 'Std Rate must be nominal 250 / 5.0 = 50.0 pcs/h');
  assert.strictEqual(derived.expectedPcs, 1200, 'Expected 24h must be 24 * 50 = 1200 pcs (NOT 2400 pcs)');

  // 2. Editing stdWeight re-derives targetRate dynamically
  const updatedWeight = applyMatrixRowInput(derived, 'stdWeight', 2.5);
  assert.strictEqual(updatedWeight.stdWeight, 2.5);
  assert.strictEqual(updatedWeight.targetRate, 100.0, 'Std Rate must dynamically update to 250 / 2.5 = 100.0 pcs/h');
  assert.strictEqual(updatedWeight.expectedPcs, 2400);

  // 3. Operating hours defaults to 24h when output is produced and no prior report exists
  const activeRecordDataset = [
    {
      date: '2026-03-22',
      machineId: 'L-02',
      itemCode: 'PIPE-63',
      description: '63 mm Class 3 SDR 21',
      productionQty: 1500,
      unitWeight: 1.2
    }
  ];
  const activeRows = buildMatrixRowsForDate({
    date: '2026-03-22',
    machineMaster: [{ id: 'L-02', name: 'Battenfeld-02', nominalCapacity: 200 }],
    combinedDatasets: activeRecordDataset,
    loadReportByDateAndMachineFn: () => null
  });
  const l02 = activeRows.find((r) => r.lineId === 'L-02');
  assert.ok(l02);
  assert.strictEqual(l02.operatingHours, 24.0, 'Operating hours must default to 24.0h for line with output when no downtime is specified');
  assert.strictEqual(l02.totalAccountedHours, 24.0);
  assert.strictEqual(l02.balanceStatus, 'balanced');
  assert.strictEqual(l02.pipeSize, '63 mm Class 3 SDR 21', 'Running pipe size must match description');

  console.log('Test 14 Passed: Engineering rate derivation and active line defaults verified');
}

console.log('--- ALL DAILY RECONCILIATION MATRIX UNIT TESTS PASSED (14/14) ---');
