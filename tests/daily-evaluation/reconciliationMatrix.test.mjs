import assert from 'assert';
import {
  calculateMatrixRowMetrics,
  autoBalanceRowHours,
  buildMatrixRowsForDate,
  reconcileMatrixRow,
  exportMatrixToWorkbook,
  categorizeDowntimeReason
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
  assert.strictEqual(l01.targetRate, 40);
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
  assert.strictEqual(sheet['A2'].v, 'L-01');
  assert.strictEqual(sheet['A3'].v, 'L-02');

  console.log('Test 8 Passed: Matrix Excel workbook generated successfully');
}

console.log('--- ALL DAILY RECONCILIATION MATRIX UNIT TESTS PASSED (8/8) ---');
