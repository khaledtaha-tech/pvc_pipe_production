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
  isDowntimeField,
  calculateMultiRunMachineStatus,
  applyCoupledMultiRunInput,
  autoBalanceMultiRunMachine
} from '../../src/logic/reconciliationMatrixHelper.js';
import { MACHINES } from '../../src/config/machines.js';
import { normalizeProductionRow } from '../../src/logic/oeeReconciler.js';

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

// Test 15: Dynamic Multi-Run Extrusion per Machine
{
  const testMachines = [
    { id: 'L-01', name: 'Line 01', nominalCapacity: 150 },
    { id: 'L-02', name: 'Battenfeld-02', nominalCapacity: 200 },
    { id: 'L-03', name: 'Line 03', nominalCapacity: 250 }
  ];

  const testDatasets = [
    // L-01: Single run (95% of plant)
    {
      date: '2026-10-06',
      machineId: 'L-01',
      itemCode: 'PIPE-110',
      description: '110 mm Class 4',
      productionQty: 800,
      unitWeight: 3.0,
      totalWeight: 2400
    },
    // L-02: Multi-run with 2 distinct items on the same date
    // Item 1: Item 255 (609 pcs @ 3.8kg)
    {
      date: '2026-10-06',
      machineId: 'L-02',
      itemCode: '255',
      description: '50X2.4MM Class 4',
      productionQty: 609,
      unitWeight: 3.8,
      totalWeight: 2314.2
    },
    // Item 2: Item 239 (35 pcs @ 7.0kg)
    {
      date: '2026-10-06',
      machineId: 'L-02',
      itemCode: '239',
      description: '90X2.7MM Class 3',
      productionQty: 35,
      unitWeight: 7.0,
      totalWeight: 245.0
    }
    // L-03: Idle (no production records)
  ];

  const matrixRows = buildMatrixRowsForDate({
    date: '2026-10-06',
    machineMaster: testMachines,
    combinedDatasets: testDatasets,
    loadReportByDateAndMachineFn: () => null
  });

  // Verify total row count: 1 (L-01) + 2 (L-02 multi-run) + 1 (L-03 idle) = 4 rows
  assert.strictEqual(matrixRows.length, 4, 'Must output 4 rows total: L-01 (1), L-02 (2 sub-runs), L-03 (1 idle)');

  // Verify L-01 remains clean single row
  const l01Rows = matrixRows.filter((r) => r.baseLineId === 'L-01');
  assert.strictEqual(l01Rows.length, 1);
  assert.strictEqual(l01Rows[0].lineId, 'L-01');
  assert.strictEqual(l01Rows[0].isMultiRun, false);
  assert.strictEqual(l01Rows[0].actualPcs, 800);

  // Verify L-03 remains clean single row
  const l03Rows = matrixRows.filter((r) => r.baseLineId === 'L-03');
  assert.strictEqual(l03Rows.length, 1);
  assert.strictEqual(l03Rows[0].lineId, 'L-03');
  assert.strictEqual(l03Rows[0].isMultiRun, false);
  assert.strictEqual(l03Rows[0].operatingHours, 0.0);
  assert.strictEqual(l03Rows[0].materialNoOrderHours, 24.0);

  // Verify L-02 is split into 2 distinct sub-run rows
  const l02Rows = matrixRows.filter((r) => r.baseLineId === 'L-02');
  assert.strictEqual(l02Rows.length, 2, 'L-02 must be split into exactly 2 sub-run rows');

  const run1 = l02Rows.find((r) => r.runIndex === 1);
  const run2 = l02Rows.find((r) => r.runIndex === 2);
  assert.ok(run1, 'Run 1 must exist');
  assert.ok(run2, 'Run 2 must exist');

  // Verify Run 1 metadata & metrics
  assert.strictEqual(run1.lineId, 'L-02-run-1');
  assert.strictEqual(run1.baseLineId, 'L-02');
  assert.strictEqual(run1.lineIdDisplay, 'L-02 [R1]');
  assert.strictEqual(run1.isMultiRun, true);
  assert.strictEqual(run1.totalRuns, 2);
  assert.strictEqual(run1.productCode, '255');
  assert.strictEqual(run1.stdWeight, 3.8);
  assert.strictEqual(run1.actualPcs, 609);
  assert.strictEqual(run1.actualKg, 2314);
  assert.strictEqual(run1.targetRate, 52.6, 'Run 1 target rate: 200 / 3.8 = 52.6 pcs/h');
  assert.strictEqual(run1.moldChangeHours, 0.0, 'Run 1 has 0 mold change downtime');
  assert.strictEqual(run1.operatingHours, 19.9, 'Run 1 operating hours: proportional allocation = 19.9h');
  assert.strictEqual(run1.actualRatePcsH, 30.6, '609 / 19.9 = 30.6 pcs/h');
  assert.strictEqual(run1.actualRateKgH, 116.3, '2314.2 / 19.9 = 116.3 kg/h');
  assert.strictEqual(run1.speedEfficiencyPct, 58.2, '(116.3 / 200) * 100 = 58.2%');

  // Verify Run 2 metadata & metrics
  assert.strictEqual(run2.lineId, 'L-02-run-2');
  assert.strictEqual(run2.baseLineId, 'L-02');
  assert.strictEqual(run2.lineIdDisplay, 'L-02 [R2]');
  assert.strictEqual(run2.isMultiRun, true);
  assert.strictEqual(run2.totalRuns, 2);
  assert.strictEqual(run2.productCode, '239');
  assert.strictEqual(run2.stdWeight, 7.0);
  assert.strictEqual(run2.actualPcs, 35);
  assert.strictEqual(run2.actualKg, 245.0);
  assert.strictEqual(run2.targetRate, 28.6, 'Run 2 target rate: 200 / 7.0 = 28.6 pcs/h');
  assert.strictEqual(run2.moldChangeHours, 2.0, 'Run 2 must default to 2.0h die/mold changeover downtime');
  assert.strictEqual(run2.operatingHours, 2.1, 'Run 2 operating hours: remaining available op hours = 2.1h');
  assert.strictEqual(run2.actualRatePcsH, 16.7, '35 / 2.1 = 16.7 pcs/h');
  assert.strictEqual(run2.actualRateKgH, 116.7, '245.0 / 2.1 = 116.7 kg/h');
  assert.strictEqual(run2.speedEfficiencyPct, 58.4, '(116.7 / 200) * 100 = 58.4%');

  // Verify machine total hours balance: 19.9 (op1) + 2.1 (op2) + 2.0 (mold change) = 24.0h
  const totalMachineHours = run1.operatingHours + run2.operatingHours + run1.moldChangeHours + run2.moldChangeHours;
  assert.strictEqual(totalMachineHours, 24.0, 'Total machine accounted hours must equal 24.0h');

  // Reconcile Run 1 and Run 2 into persistent report
  const rep1 = reconcileMatrixRow(run1, null, testMachines);
  assert.strictEqual(rep1.header.lineId, 'L-02');
  assert.strictEqual(rep1.refs['1'].targetRate, 52.6);
  assert.strictEqual(rep1.refs['1'].stdWeight, 3.8);

  const rep2 = reconcileMatrixRow(run2, rep1, testMachines);
  assert.strictEqual(rep2.header.lineId, 'L-02');
  assert.strictEqual(rep2.refs['2'].targetRate, 28.6);
  assert.strictEqual(rep2.refs['2'].stdWeight, 7.0);

  // Verify Excel Export contains multi-run display IDs
  const wb = exportMatrixToWorkbook(matrixRows, '2026-10-06');
  const ws = wb.Sheets['Reconciliation_2026-10-06'];
  assert.strictEqual(ws['A3'].v, 'L-02 [R1]');
  assert.strictEqual(ws['A4'].v, 'L-02 [R2]');

  console.log('Test 15 Passed: Dynamic multi-run extrusion splitting and metrics verified');
}

// Test 16: Production Log Parser Shift Summing, Unit Weight Precedence & Zero-Piece Recovery
{
  // 1. Shift summing when Production Qty (FG) is blank
  const shiftOutputRow = {
    'Machine': 'KTS-700',
    'Item Code': '259',
    'Product Description & Specs': '500mm SN8 Corrugated Pipe',
    'Unit Weight (kg)': 50.0,
    'Total Weight (kg)': 2650,
    'Shift A (Pcs)': 30,
    'Shift B (Pcs)': 23
  };
  const parsed1 = normalizeProductionRow(shiftOutputRow);
  assert.strictEqual(parsed1.productionQty, 53, 'Must sum Shift A (30) + Shift B (23) = 53 pcs when FG is omitted');
  assert.strictEqual(parsed1.unitWeight, 50.0, 'Must extract explicit Unit Weight (kg) = 50.0');
  assert.strictEqual(parsed1.totalWeight, 2650, 'Total weight must be 2650 kg');

  // 2. Zero-piece recovery when piece columns are 0 but Total Weight and Unit Weight exist
  const zeroPieceRow = {
    'Machine': 'KTS-700',
    'Item Code': '259',
    'Product Description & Specs': '500mm SN8 Corrugated Pipe',
    'Production Qty (FG)': 0,
    'Unit Weight (kg)': 50.0,
    'Total Weight (kg)': 2650
  };
  const parsed2 = normalizeProductionRow(zeroPieceRow);
  assert.strictEqual(parsed2.productionQty, 53, 'Zero-piece recovery: 2650 / 50 = 53 pcs');
  assert.strictEqual(parsed2.unitWeight, 50.0);
  assert.strictEqual(parsed2.totalWeight, 2650);

  console.log('Test 16 Passed: Shift summing, unit weight precedence & zero-piece recovery verified');
}

// Test 17: Matrix Initialization Defaults Operating Hours to 24h for Any Machine with Output (L-07, L-08, etc.) and Immediately Computes Realized Pace
{
  const activePlantDataset = [
    // L-07: Reported pipe extrusion output without explicit operating hours
    {
      date: '2026-10-07',
      machineId: 'L-07',
      itemCode: 'PIPE-50',
      description: '50 mm Class 4',
      productionQty: 1200,
      unitWeight: 1.5,
      totalWeight: 1800
    },
    // L-08: Reported compounding output (e.g. from AlManar_2 with 12h in raw row)
    {
      date: '2026-10-07',
      machineId: 'L-08',
      itemCode: 'COMP-PVC',
      description: 'PVC Compound Pellets',
      productionQty: 3000,
      unitWeight: 1.0,
      totalWeight: 3000,
      operatingHours: 12.0 // Raw row has 12h, but must default to 24.0h in initial matrix load
    }
  ];

  const rows = buildMatrixRowsForDate({
    date: '2026-10-07',
    machineMaster: MACHINES,
    combinedDatasets: activePlantDataset,
    loadReportByDateAndMachineFn: () => null
  });

  // 1. Line L-07 validation
  const l07 = rows.find((r) => r.lineId === 'L-07');
  assert.ok(l07, 'L-07 must exist in matrix rows');
  assert.strictEqual(l07.actualPcs, 1200);
  assert.strictEqual(l07.actualKg, 1800);
  assert.strictEqual(l07.operatingHours, 24.0, 'L-07 must default to 24.0h operating hours on initial load');
  assert.strictEqual(l07.totalDowntimeHours, 0.0, 'L-07 must default to 0.0h downtime on initial load');
  assert.strictEqual(l07.totalAccountedHours, 24.0);
  assert.strictEqual(l07.balanceStatus, 'balanced');
  assert.strictEqual(l07.balanceLabel, '24.0h Balanced');
  assert.strictEqual(l07.actualRatePcsH, 50.0, '1200 / 24 = 50.0 pcs/h realized pace');
  assert.strictEqual(l07.actualRateKgH, 75.0, '1800 / 24 = 75.0 kg/h realized pace');
  assert.strictEqual(l07.speedEfficiencyPct, 37.5, '(75.0 / 200) * 100 = 37.5%');

  // 2. Line L-08 validation
  const l08 = rows.find((r) => r.lineId === 'L-08');
  assert.ok(l08, 'L-08 must exist in matrix rows');
  assert.strictEqual(l08.actualPcs, 3000);
  assert.strictEqual(l08.actualKg, 3000);
  assert.strictEqual(l08.operatingHours, 24.0, 'L-08 must default to 24.0h operating hours on initial load');
  assert.strictEqual(l08.totalDowntimeHours, 0.0, 'L-08 must default to 0.0h downtime on initial load');
  assert.strictEqual(l08.totalAccountedHours, 24.0);
  assert.strictEqual(l08.balanceStatus, 'balanced');
  assert.strictEqual(l08.balanceLabel, '24.0h Balanced');
  assert.strictEqual(l08.actualRatePcsH, 125.0, '3000 / 24 = 125.0 pcs/h realized pace');
  assert.strictEqual(l08.actualRateKgH, 125.0, '3000 / 24 = 125.0 kg/h realized pace');
  assert.strictEqual(l08.speedEfficiencyPct, 31.3, '(125.0 / 400) * 100 = 31.3%');

  // 3. True idle line validation (L-01 had 0 pcs and 0 kg)
  const l01 = rows.find((r) => r.lineId === 'L-01');
  assert.ok(l01, 'L-01 must exist in matrix rows');
  assert.strictEqual(l01.actualPcs, 0);
  assert.strictEqual(l01.actualKg, 0);
  assert.strictEqual(l01.operatingHours, 0.0, 'True idle machine must have 0 operating hours');
  assert.strictEqual(l01.materialNoOrderHours, 24.0, 'True idle machine must have Material/No Order = 24.0h');
  assert.strictEqual(l01.totalAccountedHours, 24.0);
  assert.strictEqual(l01.balanceStatus, 'balanced');
  assert.strictEqual(l01.actualRatePcsH, 0.0);
  assert.strictEqual(l01.actualRateKgH, 0.0);
  assert.strictEqual(l01.speedEfficiencyPct, 0.0);

  console.log('Test 17 Passed: Matrix initialization 24h operating default & non-zero realized pace verified');
}

// Test 18: Line L-06 (KTS-700) Item 259 Weight, Piece Ingestion, and Source Audit Verification
{
  const testMaster = [
    { id: 'L-06', name: 'KTS 700', capacityKgH: 500, nominalCapacity: 500 }
  ];

  // 1. Ingested record with explicit Unit Weight 50.0kg and 53 pcs
  const l06Record = {
    date: '2026-10-06',
    machineId: 'L-06',
    machineRaw: 'KTS-700',
    itemCode: '259',
    description: 'PVC PIPE 160X11.8MM PN20',
    productionQty: 53,
    unitWeight: 50.0,
    totalWeight: 2650.0
  };

  const rows = buildMatrixRowsForDate({
    date: '2026-10-06',
    machineMaster: testMaster,
    combinedDatasets: [l06Record],
    loadReportByDateAndMachineFn: () => null
  });

  assert.strictEqual(rows.length, 1);
  const l06 = rows[0];

  assert.strictEqual(l06.lineId, 'L-06');
  assert.strictEqual(l06.productCode, '259');
  assert.strictEqual(l06.stdWeight, 50.0, 'Std weight must strictly be 50.0kg, NEVER 5.6kg fallback');
  assert.strictEqual(l06.actualPcs, 53, 'Actual output must strictly be 53 pcs, NEVER 473 pcs');
  assert.strictEqual(l06.actualKg, 2650.0, 'Actual kg must be 2650 kg');
  assert.strictEqual(l06.nominalCapacity, 500);

  // Engineering pace and balance derivations:
  assert.strictEqual(l06.targetRate, 10.0, 'Std rate: 500 / 50.0 = 10.0 pcs/h');
  assert.strictEqual(l06.expectedPcs, 240.0, 'Expected output: 24h * 10.0 pcs/h = 240 pcs');
  assert.strictEqual(l06.expectedKg, 12000.0, 'Expected weight: 240 * 50.0 = 12,000 kg');
  assert.strictEqual(l06.deficitPcs, 187.0, 'Deficit pcs: 240 - 53 = 187 pcs');
  assert.strictEqual(l06.deficitKg, 9350.0, 'Deficit kg: 12000 - 2650 = 9350 kg');
  assert.strictEqual(l06.operatingHours, 24.0, 'Operating hours must default to 24.0h');
  assert.strictEqual(l06.totalAccountedHours, 24.0);
  assert.strictEqual(l06.balanceStatus, 'balanced');

  // Realized rate & Speed efficiency:
  assert.strictEqual(l06.actualRatePcsH, 2.2, '53 / 24.0 = 2.2 pcs/h');
  assert.strictEqual(l06.actualRateKgH, 110.4, '2650 / 24.0 = 110.4 kg/h');
  assert.strictEqual(l06.speedEfficiencyPct, 22.1, '(110.4 / 500) * 100 = 22.1%');

  // Data audit metadata:
  assert.ok(l06.sourceAudit, 'Row must include sourceAudit metadata');
  assert.strictEqual(l06.sourceAudit.stdWeight, 50.0);
  assert.strictEqual(l06.sourceAudit.actualPcs, 53);
  assert.strictEqual(l06.sourceAudit.actualKg, 2650.0);
  assert.strictEqual(l06.sourceAudit.nominalCapacity, 500);

  // 2. Catalog fallback test: when unitWeight is omitted (0), itemCode 259 must resolve 50.0kg from catalog
  const zeroWeightRecord = {
    date: '2026-10-06',
    machineId: 'L-06',
    itemCode: '259',
    description: 'PVC PIPE 160X11.8MM PN20',
    productionQty: 53,
    unitWeight: 0,
    totalWeight: 2650.0
  };

  const rows2 = buildMatrixRowsForDate({
    date: '2026-10-06',
    machineMaster: testMaster,
    combinedDatasets: [zeroWeightRecord],
    loadReportByDateAndMachineFn: () => null
  });

  const l06Fallback = rows2[0];
  assert.strictEqual(l06Fallback.stdWeight, 50.0, 'Catalog preset lookup must resolve 50.0kg for Item 259');
  assert.strictEqual(l06Fallback.actualPcs, 53);

  console.log('Test 18 Passed: Line L-06 (KTS-700) Item 259 weight, piece ingestion, and source audit verified');
}

// Test 19: Scrap (kg) Ingestion, Quality Rate (Q), and 3-Factor Industrial Plastics OEE
{
  // 1. Row Metrics calculation with scrap
  const rowWithScrap = calculateMatrixRowMetrics({
    lineId: 'L-01',
    lineName: 'Battenfeld-01',
    nominalCapacity: 200,
    targetRate: 50,
    stdWeight: 3.6,
    actualPcs: 1000,
    actualKg: 3600.0,
    scrapKg: 400.0,
    operatingHours: 20.0
  });

  assert.strictEqual(rowWithScrap.actualKg, 3600.0, 'Good output must be 3600.0 kg');
  assert.strictEqual(rowWithScrap.scrapKg, 400.0, 'Scrap output must be 400.0 kg');
  assert.strictEqual(rowWithScrap.totalMeltProcessedKg, 4000.0, 'Total melt processed: 3600 + 400 = 4000.0 kg');
  assert.strictEqual(rowWithScrap.totalProcessedKg, 4000.0, 'totalProcessedKg alias must match total melt');
  assert.strictEqual(rowWithScrap.qualityPct, 90.0, 'Quality %: (3600 / 4000) * 100 = 90.0%');
  assert.strictEqual(rowWithScrap.availabilityPct, 83.3, 'Availability %: (20 / 24) * 100 = 83.3%');
  assert.strictEqual(rowWithScrap.performancePct, 100.0, 'Performance %: (1000 / 1000) * 100 = 100.0%');
  // OEE = 0.833 * 1.00 * 0.90 * 100 = 74.97 -> 75.0%
  assert.strictEqual(rowWithScrap.oeePct, 75.0, '3-factor OEE must be 75.0% (A * P * Q)');

  // 2. Reactive scrap input update via applyMatrixRowInput
  const updatedScrap = applyMatrixRowInput(rowWithScrap, 'scrapKg', 900.0);
  assert.strictEqual(updatedScrap.scrapKg, 900.0);
  assert.strictEqual(updatedScrap.totalMeltProcessedKg, 4500.0, 'Total melt: 3600 + 900 = 4500.0 kg');
  assert.strictEqual(updatedScrap.qualityPct, 80.0, 'Quality %: (3600 / 4500) * 100 = 80.0%');
  // OEE = 0.833 * 1.00 * 0.80 * 100 = 66.64 -> 66.6%
  assert.strictEqual(updatedScrap.oeePct, 66.6, 'OEE must reactively drop to 66.6%');

  // Clear scrap back to 0
  const zeroScrap = applyMatrixRowInput(updatedScrap, 'scrapKg', 0);
  assert.strictEqual(zeroScrap.scrapKg, 0);
  assert.strictEqual(zeroScrap.totalMeltProcessedKg, 3600.0);
  assert.strictEqual(zeroScrap.qualityPct, 100.0, 'Quality must return to 100.0% when scrap is 0');
  assert.strictEqual(zeroScrap.oeePct, 83.3, 'OEE must return to 83.3%');

  // 3. Fallback when total melt is 0 (idle machine)
  const idleRow = calculateMatrixRowMetrics({
    lineId: 'L-02',
    lineName: 'Battenfeld-02',
    nominalCapacity: 200,
    targetRate: 50,
    actualPcs: 0,
    actualKg: 0,
    scrapKg: 0,
    operatingHours: 0
  });
  assert.strictEqual(idleRow.qualityPct, 100.0, 'Idle line with 0 melt must default to 100.0% quality');
  assert.strictEqual(idleRow.oeePct, 0.0);

  // 4. Ingestion via buildMatrixRowsForDate with scrap
  const testMaster = [
    { id: 'L-01', name: 'Battenfeld-01', capacityKgH: 200, nominalCapacity: 200 }
  ];

  const recordWithScrap = {
    date: '2026-10-06',
    machineId: 'L-01',
    itemCode: '250',
    description: 'PVC Pipe 32x2.0',
    productionQty: 500,
    unitWeight: 2.0,
    totalWeight: 1000.0,
    scrapKg: 100.0
  };

  const matrixRows = buildMatrixRowsForDate({
    date: '2026-10-06',
    machineMaster: testMaster,
    combinedDatasets: [recordWithScrap],
    loadReportByDateAndMachineFn: () => null
  });

  const parsedRow = matrixRows.find((r) => r.lineId === 'L-01');
  assert.ok(parsedRow, 'L-01 must be constructed');
  assert.strictEqual(parsedRow.scrapKg, 100.0, 'Scrap must be ingested as 100.0 kg');
  assert.strictEqual(parsedRow.actualKg, 1000.0);
  assert.strictEqual(parsedRow.totalMeltProcessedKg, 1100.0, 'Total melt: 1000 + 100 = 1100.0 kg');
  // Quality %: (1000 / 1100) * 100 = 90.9%
  assert.strictEqual(parsedRow.qualityPct, 90.9);

  console.log('Test 19 Passed: Scrap (kg) ingestion, Quality (Q), and 3-Factor OEE verified');
}

// Test 20: Reactive Unjustified Lost Time Calculation & Downtime Offsetting
{
  // Machine with theoretical deficit of 14.1 hours:
  // nominalCapacity 200, stdWeight 4.0 -> targetRate = 50.0 pcs/h
  // expectedPcs = 24 * 50 = 1200 pcs
  // actualPcs = 495 pcs -> deficit = 705 pcs -> theoreticalLostHours = round1(705 / 50) = 14.1h
  const initialRow = {
    lineId: 'L-01',
    lineName: 'Battenfeld-01',
    nominalCapacity: 200,
    targetRate: 50.0,
    stdWeight: 4.0,
    actualPcs: 495,
    actualKg: 1980,
    operatingHours: 24.0,
    moldChangeHours: 0,
    purgeCleaningHours: 0,
    heaterFailureHours: 0,
    mechanicalHours: 0,
    materialNoOrderHours: 0,
    otherHours: 0
  };

  const m1 = calculateMatrixRowMetrics(initialRow);
  assert.strictEqual(m1.theoreticalLostHours, 14.1);
  assert.strictEqual(m1.lostHours, 14.1);
  assert.strictEqual(m1.justifiedDowntimeHours, 0.0);
  assert.strictEqual(m1.unjustifiedLostHours, 14.1, 'Initial state: all 14.1h deficit is unjustified');

  // Operator enters 12.0h in Material / No Order
  const r2 = applyMatrixRowInput(initialRow, 'materialNoOrderHours', 12.0);
  assert.strictEqual(r2.materialNoOrderHours, 12.0);
  assert.strictEqual(r2.totalDowntimeHours, 12.0);
  assert.strictEqual(r2.justifiedDowntimeHours, 12.0);
  assert.strictEqual(r2.theoreticalLostHours, 14.1);
  // Unjustified lost hours dynamically deducted: 14.1 - 12.0 = 2.1h
  assert.strictEqual(r2.unjustifiedLostHours, 2.1, '14.1h theoretical deficit - 12.0h justified downtime = 2.1h unjustified');
  assert.strictEqual(r2.operatingHours, 12.0, 'Operating hours auto-rebalanced to 12.0h');
  assert.strictEqual(r2.totalAccountedHours, 24.0);

  // Operator enters additional 2.1h in Mechanical Jam
  const r3 = applyMatrixRowInput(r2, 'mechanicalHours', 2.1);
  assert.strictEqual(r3.mechanicalHours, 2.1);
  assert.strictEqual(r3.totalDowntimeHours, 14.1);
  assert.strictEqual(r3.justifiedDowntimeHours, 14.1);
  // Unjustified lost hours reaches exactly 0.0h (Fully Justified)
  assert.strictEqual(r3.unjustifiedLostHours, 0.0, '14.1h deficit - 14.1h downtime = 0.0h (Fully Justified)');
  assert.strictEqual(r3.operatingHours, 9.9, 'Operating hours auto-rebalanced to 24 - 14.1 = 9.9h');
  assert.strictEqual(r3.totalAccountedHours, 24.0);

  // Operator enters downtime exceeding theoretical deficit (e.g. 18.0h total)
  const r4 = applyMatrixRowInput(r3, 'materialNoOrderHours', 15.9);
  assert.strictEqual(r4.totalDowntimeHours, 18.0);
  assert.strictEqual(r4.unjustifiedLostHours, 0.0, 'Unjustified lost hours must never be negative');

  console.log('Test 20 Passed: Reactive unjustified lost hours calculation and downtime offsetting verified');
}

// Test 21: Multi-Run Coupled 24h Machine Balancing Across Sibling Runs
{
  const testMachines = [
    { id: 'L-02', name: 'KTS 170', capacityKgH: 150, nominalCapacity: 150 }
  ];

  const testDatasets = [
    {
      date: '2026-10-06',
      machineId: 'L-02',
      itemCode: '255',
      description: 'PVC PIPE 50X2.4MM',
      productionQty: 609,
      unitWeight: 3.8,
      totalWeight: 2314.2
    },
    {
      date: '2026-10-06',
      machineId: 'L-02',
      itemCode: '239',
      description: 'PVC PIPE 75X3.6MM',
      productionQty: 35,
      unitWeight: 7.0,
      totalWeight: 245.0
    }
  ];

  let rows = buildMatrixRowsForDate({
    date: '2026-10-06',
    machineMaster: testMachines,
    combinedDatasets: testDatasets,
    loadReportByDateAndMachineFn: () => null
  });

  assert.strictEqual(rows.length, 2, 'L-02 must be split into Run 1 and Run 2');
  const run1 = rows.find((r) => r.runIndex === 1);
  const run2 = rows.find((r) => r.runIndex === 2);
  assert.ok(run1 && run2, 'Both runs must exist');

  // Verify initial coupled machine status
  const initialStatus = calculateMultiRunMachineStatus(rows, 'L-02');
  assert.strictEqual(initialStatus.parentLineId, 'L-02');
  assert.strictEqual(initialStatus.runCount, 2);
  assert.strictEqual(initialStatus.totalMachineAccountedHours, 24.0, 'Total machine accounted hours must equal 24.0h');
  assert.strictEqual(initialStatus.machineBalanceStatus, 'balanced');
  assert.strictEqual(initialStatus.machineBalanceLabel, '24.0h Balanced');
  assert.strictEqual(initialStatus.isCoupledBalanced, true);

  // 1. Operator modifies Run 1 operatingHours to 16.0h
  rows = applyCoupledMultiRunInput(rows, run1.lineId, 'operatingHours', 16.0);
  const updatedRun1 = rows.find((r) => r.runIndex === 1);
  const updatedRun2 = rows.find((r) => r.runIndex === 2);
  assert.strictEqual(updatedRun1.operatingHours, 16.0);
  assert.strictEqual(updatedRun1.totalAccountedHours, 16.0);
  // Run 2 has 2.0h moldChange, remaining budget = 24.0 - 16.0 = 8.0h -> Run 2 op = 8.0 - 2.0 = 6.0h
  assert.strictEqual(updatedRun2.operatingHours, 6.0, 'Run 2 operating hours must adapt to 6.0h');
  assert.strictEqual(updatedRun2.totalAccountedHours, 8.0, 'Run 2 total accounted: 6.0 op + 2.0 moldChange = 8.0h');

  const status1 = calculateMultiRunMachineStatus(rows, 'L-02');
  assert.strictEqual(status1.totalMachineAccountedHours, 24.0, 'Total machine accounted: 16.0 + 8.0 = 24.0h');
  assert.strictEqual(status1.machineBalanceStatus, 'balanced');

  // 2. Operator enters 3.0h downtime on Run 1 (materialNoOrderHours = 3.0h)
  rows = applyCoupledMultiRunInput(rows, run1.lineId, 'materialNoOrderHours', 3.0);
  const updatedRun1b = rows.find((r) => r.runIndex === 1);
  const updatedRun2b = rows.find((r) => r.runIndex === 2);
  // Run 1 budget was 16.0h, so operatingHours becomes 16.0 - 3.0 = 13.0h
  assert.strictEqual(updatedRun1b.materialNoOrderHours, 3.0);
  assert.strictEqual(updatedRun1b.operatingHours, 13.0);
  assert.strictEqual(updatedRun1b.totalAccountedHours, 16.0);
  assert.strictEqual(updatedRun2b.totalAccountedHours, 8.0);

  const status2 = calculateMultiRunMachineStatus(rows, 'L-02');
  assert.strictEqual(status2.totalMachineAccountedHours, 24.0);
  assert.strictEqual(status2.machineBalanceStatus, 'balanced');

  // 3. Operator enters 2.0h mechanical downtime on Run 2
  rows = applyCoupledMultiRunInput(rows, run2.lineId, 'mechanicalHours', 2.0);
  const updatedRun2c = rows.find((r) => r.runIndex === 2);
  // Run 2 total downtime is now 2.0 mold + 2.0 mech = 4.0h
  // Available budget for Run 2 is 24.0 - 16.0 (Run 1) = 8.0h
  // Run 2 operatingHours adapts to 8.0 - 4.0 = 4.0h
  assert.strictEqual(updatedRun2c.mechanicalHours, 2.0);
  assert.strictEqual(updatedRun2c.totalDowntimeHours, 4.0);
  assert.strictEqual(updatedRun2c.operatingHours, 4.0);
  assert.strictEqual(updatedRun2c.totalAccountedHours, 8.0);

  const status3 = calculateMultiRunMachineStatus(rows, 'L-02');
  assert.strictEqual(status3.totalMachineAccountedHours, 24.0);
  assert.strictEqual(status3.machineBalanceStatus, 'balanced');

  // 4. Test under-allocated machine status detection
  const targetRun2Idx = rows.findIndex((r) => r.runIndex === 2);
  rows[targetRun2Idx] = calculateMatrixRowMetrics({ ...rows[targetRun2Idx], operatingHours: 1.0 });
  const statusUnder = calculateMultiRunMachineStatus(rows, 'L-02');
  assert.strictEqual(statusUnder.totalMachineAccountedHours, 21.0, '16.0 + (1.0 + 4.0) = 21.0h accounted');
  assert.strictEqual(statusUnder.machineBalanceStatus, 'under');
  assert.strictEqual(statusUnder.machineVarianceHours, 3.0);
  assert.strictEqual(statusUnder.machineBalanceLabel, '3h Remaining');

  // 5. Restore machine balance using autoBalanceMultiRunMachine
  rows = autoBalanceMultiRunMachine(rows, 'L-02');
  const restoredStatus = calculateMultiRunMachineStatus(rows, 'L-02');
  assert.strictEqual(restoredStatus.totalMachineAccountedHours, 24.0);
  assert.strictEqual(restoredStatus.machineBalanceStatus, 'balanced');
  assert.strictEqual(restoredStatus.machineBalanceLabel, '24.0h Balanced');

  // 6. Test over-allocated machine status detection
  rows[0] = calculateMatrixRowMetrics({ ...rows[0], operatingHours: 20.0, materialNoOrderHours: 3.0 });
  rows[1] = calculateMatrixRowMetrics({ ...rows[1], operatingHours: 5.0, mechanicalHours: 2.0, moldChangeHours: 2.0 });
  const statusOver = calculateMultiRunMachineStatus(rows, 'L-02');
  assert.strictEqual(statusOver.totalMachineAccountedHours, 32.0, '23.0 + 9.0 = 32.0h');
  assert.strictEqual(statusOver.machineBalanceStatus, 'over');
  assert.strictEqual(statusOver.machineVarianceHours, -8.0);
  assert.strictEqual(statusOver.machineBalanceLabel, '+8h Exceeded');

  console.log('Test 21 Passed: Multi-run coupled 24h machine balancing across sibling runs verified');
}

console.log('--- ALL DAILY RECONCILIATION MATRIX UNIT TESTS PASSED (21/21) ---');
