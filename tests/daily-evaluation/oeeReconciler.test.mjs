import assert from 'node:assert/strict';
import {
  getDefaultDeratingFactor,
  applyEventToSlots,
  calculateReconciliationAudit,
  reconcileShiftRun,
  STANDARD_BREAKDOWN_REASONS,
  DEFAULT_EVENT_CONFIGS,
  isDateMatch,
  isMachineMatch,
  normalizeProductionRow,
  queryProductionRecords,
  queryProductionRecordsForDate,
  blankReportForMachine,
  autoBindProductionLogToReport
} from '../../src/logic/oeeReconciler.js';
import { generateReport, buildAll, HOUR_WINDOWS } from '../../src/logic/engine.js';
import { getBenchmarkReport } from '../../src/data/store.js';

console.log('--- Starting OEE Reconciler & Derating Unit Tests ---');

// 1. Default Derating Factor Profiles
assert.equal(getDefaultDeratingFactor('L-04'), 85, 'L-04 should have 85% default derating');
assert.equal(getDefaultDeratingFactor('KTS 200'), 85, 'KTS 200 should have 85% default derating');
assert.equal(getDefaultDeratingFactor('L-07'), 85, 'L-07 should have 85% default derating');
assert.equal(getDefaultDeratingFactor('L-09'), 85, 'L-09 should have 85% default derating');
assert.equal(getDefaultDeratingFactor('L-05'), 88, 'L-05 should have 88% default derating');
assert.equal(getDefaultDeratingFactor('L-02'), 90, 'L-02 should have 90% default derating');
assert.equal(getDefaultDeratingFactor('L-08'), 90, 'L-08 should have 90% default derating');
assert.equal(getDefaultDeratingFactor('L-06'), 92, 'L-06 should have 92% default derating');
assert.equal(getDefaultDeratingFactor('L-03'), 92, 'L-03 should have 92% default derating');
assert.equal(getDefaultDeratingFactor('L-01'), 95, 'L-01 should have 95% default derating');
assert.equal(getDefaultDeratingFactor('UNKNOWN_LINE'), 85, 'Unknown line fallback should be 85%');
assert.equal(getDefaultDeratingFactor(null), 85, 'Null machineId fallback should be 85%');

// Dynamic machine master derating calculation
const mockMachineMaster = [
  { id: 'EXT-CUSTOM', name: 'Custom Line', capacityKgH: 360, nominalCapacity: 400 }
];
assert.equal(getDefaultDeratingFactor('EXT-CUSTOM', mockMachineMaster), 90, 'Custom Line with 360/400 should return 90%');
console.log('Default Derating Factor profiles: OK');

// 2. applyEventToSlots Duration & Deduction Logic
const testSlots = HOUR_WINDOWS.map((h) => ({
  index: h.index,
  window: h.label,
  shift: h.shift,
  startHour: h.startHour,
  downtime: 0,
  reason: ''
}));

// Apply 120 min mold change starting at slot 2
applyEventToSlots(testSlots, 2, 120, 'Mold Changeover Setup');
assert.equal(testSlots[2].downtime, 60, 'Slot 2 should have 60 min downtime');
assert.equal(testSlots[3].downtime, 60, 'Slot 3 should have 60 min downtime');
assert.equal(testSlots[4].downtime, 0, 'Slot 4 should remain 0 min downtime');
assert.ok(testSlots[2].reason.includes('Mold Changeover Setup'), 'Slot 2 reason should be set');
assert.ok(testSlots[3].reason.includes('Mold Changeover Setup'), 'Slot 3 reason should be set');

// Apply partial 30 min breakdown starting at slot 3 (already 60 min, should overflow to slot 4)
applyEventToSlots(testSlots, 3, 30, 'Cooling System Issue');
assert.equal(testSlots[3].downtime, 60, 'Slot 3 should remain capped at 60 min');
assert.equal(testSlots[4].downtime, 30, 'Slot 4 should receive 30 min overflow downtime');
assert.ok(testSlots[4].reason.includes('Cooling System Issue'), 'Slot 4 reason should record issue');
console.log('applyEventToSlots deduction and slot spanning: OK');

// 3. calculateReconciliationAudit Mathematics
const auditPerfect = calculateReconciliationAudit({
  totalActualPieces: 2400,
  targetRate: 100,
  deratingFactor: 100,
  moldChangeMin: 0,
  warmupMin: 0,
  breakdownMin: 0
});
assert.equal(auditPerfect.theoreticalCapacityPcs, 2400, 'Theoretical capacity for 24h at 100 pcs/h is 2400');
assert.equal(auditPerfect.missingHours, 0, 'No missing hours when full output achieved');
assert.equal(auditPerfect.totalAccountedHours, 0, 'No accounted downtime hours');
assert.equal(auditPerfect.unexplainedGapHours, 0, 'Zero unexplained time gap');
assert.equal(auditPerfect.isFullyReconciled, true, 'Perfect run is fully reconciled');

// Realistic shift scenario with aging and downtime
// Target: 100 pcs/h (Theoretical: 2400 pcs)
// Mold change: 120 min (2h)
// Warm-up: 60 min (1h)
// Breakdown: 60 min (1h)
// Total downtime: 4 hours (20 operating hours)
// Derating factor: 90% -> Lost capacity = 20 * (1 - 0.90) = 2.0 hours (200 pieces)
// Total accounted hours = 4.0 downtime + 2.0 derating = 6.0 hours (600 pieces)
// Expected pieces produced: 2400 - 600 = 1800 pieces
const auditRealistic = calculateReconciliationAudit({
  totalActualPieces: 1800,
  targetRate: 100,
  deratingFactor: 90,
  moldChangeMin: 120,
  warmupMin: 60,
  breakdownMin: 60
});

assert.equal(auditRealistic.theoreticalCapacityPcs, 2400);
assert.equal(auditRealistic.actualPcs, 1800);
assert.equal(auditRealistic.missingHours, 6.0, '2400 - 1800 = 600 pcs = 6.0 missing hours');
assert.equal(auditRealistic.totalDowntimeHours, 4.0, '120 + 60 + 60 min = 4.0 downtime hours');
assert.equal(auditRealistic.operatingHours, 20.0, '24 - 4 = 20 operating hours');
assert.equal(auditRealistic.speedDeratingLossHours, 2.0, '20 * 10% = 2.0 hours speed derating loss');
assert.equal(auditRealistic.speedDeratingLossPieces, 200, '2.0 hours * 100 pcs/h = 200 pieces');
assert.equal(auditRealistic.totalAccountedHours, 6.0, '4.0 downtime + 2.0 derating = 6.0 hours');
assert.equal(auditRealistic.unexplainedGapHours, 0, 'Unexplained gap should be 0 when perfectly accounted');
assert.equal(auditRealistic.isFullyReconciled, true, 'Run should be marked fully reconciled');

// Scenario with unexplained gap (operator produced only 1500 pieces instead of 1800)
const auditWithGap = calculateReconciliationAudit({
  totalActualPieces: 1500,
  targetRate: 100,
  deratingFactor: 90,
  moldChangeMin: 120,
  warmupMin: 60,
  breakdownMin: 60
});
assert.equal(auditWithGap.missingHours, 9.0, '2400 - 1500 = 900 pcs = 9.0 hours');
assert.equal(auditWithGap.totalAccountedHours, 6.0, 'Still 6.0 hours accounted');
assert.equal(auditWithGap.unexplainedGapHours, 3.0, '9.0 - 6.0 = 3.0 unexplained hours');
assert.equal(auditWithGap.unexplainedGapPieces, 300, '3.0 hours * 100 pcs/h = 300 unexplained pieces');
assert.equal(auditWithGap.isFullyReconciled, false, 'Run has 3.0h unexplained gap, should not be reconciled');
console.log('calculateReconciliationAudit mathematics and variance tracking: OK');

// 4. reconcileShiftRun 24-Hour Grid Distribution & Exact Integer Preservation
const benchmarkReport = getBenchmarkReport();
const reconcileResult = reconcileShiftRun(benchmarkReport, {
  totalActualPieces: 2150,
  deratingFactor: 88,
  events: {
    moldChange: { enabled: true, durationMin: 120, startSlot: 2 },
    warmup: { enabled: true, durationMin: 90, startSlot: 0 },
    breakdown: {
      enabled: true,
      durationMin: 60,
      startSlot: 15,
      reason: 'Mechanical Breakdown (Haul-Off Track Slipping / Planetary Cutter Jam)'
    }
  }
});

const updatedSlots = reconcileResult.updatedSlots;
assert.equal(updatedSlots.length, 24, 'Must return exactly 24 slots');

// Exact sum preservation: total pieces across 24 slots must equal requested 2150
const sumActuals = updatedSlots.reduce((acc, s) => acc + (s.actual || 0), 0);
assert.equal(sumActuals, 2150, 'Sum of distributed actual pieces must exactly equal 2150');

// Slots with 100% downtime must have 0 actual output
assert.equal(updatedSlots[0].downtime, 60, 'Slot 0 warmup has 60 min downtime');
assert.equal(updatedSlots[0].actual, 0, 'Slot 0 actual output must be 0');
assert.equal(updatedSlots[2].downtime, 60, 'Slot 2 mold change has 60 min downtime');
assert.equal(updatedSlots[2].actual, 0, 'Slot 2 actual output must be 0');
assert.equal(updatedSlots[3].downtime, 60, 'Slot 3 mold change has 60 min downtime');
assert.equal(updatedSlots[3].actual, 0, 'Slot 3 actual output must be 0');

// Slot 1 has 30 min warmup overflow (90 - 60)
assert.equal(updatedSlots[1].downtime, 30, 'Slot 1 has 30 min partial warmup downtime');
assert.ok(updatedSlots[1].actual > 0, 'Slot 1 running for 30 min must have positive output');

// Derating factor preserved in result
assert.equal(reconcileResult.deratingFactor, 88, 'Result must retain derating factor');
assert.ok(reconcileResult.audit, 'Audit payload must be included in result');
console.log('reconcileShiftRun distribution and exact integer preservation: OK');

// 5. Integration with buildAll: Derating Factor and Target Baseline Integrity
// Baseline calculation without derating (factor = 100)
const baselineReport = buildAll(updatedSlots, benchmarkReport.refs, 0, { deratingFactor: 100 });
// Derated calculation with aging factor (factor = 85)
const deratedReport = buildAll(updatedSlots, benchmarkReport.refs, 0, { deratingFactor: 85 });

// Standard slot-level targets MUST remain uncorrupted
for (let i = 0; i < 24; i++) {
  assert.equal(
    deratedReport.slots[i].target,
    baselineReport.slots[i].target,
    `Slot ${i} standard target must remain uncorrupted by derating factor`
  );
}

// Grand total standard target must remain unchanged
assert.equal(
  deratedReport.grandTotals.target,
  baselineReport.grandTotals.target,
  'Grand total standard target must remain identical'
);

// Derated effective target is reduced, so Performance metric must increase
assert.ok(
  deratedReport.performance > baselineReport.performance,
  'Performance rate should be higher when evaluated against derated capacity'
);
assert.equal(deratedReport.engineering.deratingFactor, 85, 'Engineering config must retain derating factor');
assert.ok(
  deratedReport.pStr.includes('%'),
  'Performance string must format correctly'
);
console.log('Integration with buildAll & target baseline integrity: OK');

// 6. Date & Machine Matching Precision
assert.equal(isDateMatch('2026-09-26', '2026-09-26'), true, 'Exact ISO dates should match');
assert.equal(isDateMatch('26/09/2026', '2026-09-26'), true, 'DD/MM/YYYY should match ISO date');
assert.equal(isDateMatch('2026-09-26', '2026-09-27'), false, 'Different dates must not match');

// Machine matching
assert.equal(isMachineMatch('L-03', 'L-03 - KTS 700'), true, 'Line ID L-03 should match L-03 - KTS 700');
assert.equal(isMachineMatch('KTS 700', 'L-03'), true, 'KTS 700 should match L-03');
assert.equal(isMachineMatch('KTS-700', 'L-03'), true, 'KTS-700 should match L-03');
assert.equal(isMachineMatch('KTS 350 TDH', 'L-08'), true, 'KTS 350 TDH should match L-08');
assert.equal(isMachineMatch('KTS 350 TDH', 'L-05'), false, 'KTS 350 TDH must NOT match standard L-05');
assert.equal(isMachineMatch('L-01', 'L-02'), false, 'Different machines must not match');
console.log('Date & Machine Matching: OK');

// 7. Row Normalization across ERP and Daily Log Formats
const erpSampleRow = {
  'Date': '2026-09-26',
  'Item Code': '1140',
  'Product Description & Specs': 'UPVC PIPE 110x5.3 PN-12.5 SASO-ISO',
  'Machine': 'L-03 - KTS 700',
  'Production Qty (FG)': 4800,
  'Unit Weight (kg)': 17.30,
  'Total Weight (kg)': 83040,
  'Scrap / Rejection (kg)': 50,
  'Operating Hours': 24,
  'Reason of Stop': ''
};

const normalized = normalizeProductionRow(erpSampleRow);
assert.equal(normalized.date, '2026-09-26', 'Normalized date should match 2026-09-26');
assert.equal(normalized.itemCode, '1140', 'Item code should be normalized');
assert.equal(normalized.machineId, 'L-03', 'Machine ID should resolve to L-03');
assert.equal(normalized.productionQty, 4800, 'Production Qty should parse to 4800');
assert.equal(normalized.unitWeight, 17.3, 'Unit weight should parse to 17.3');
assert.equal(normalized.totalWeight, 83040, 'Total weight should parse to 83040');
assert.equal(normalized.nominalCapacityKgH, 500, 'L-03 nominal capacity should be 500 kg/h');
assert.ok(normalized.actualRateKgH > 0, 'Actual rate should be positive');
console.log('Row Normalization: OK');

// 8. Automatic Actual Output Lookup & Finished Goods Aggregation
const testErpDataset = [
  erpSampleRow,
  {
    'Date': '2026-09-26',
    'Item Code': '249',
    'Product Description & Specs': 'uPVC PIPE 110x5.3 PN-12.5',
    'Machine': 'KTS-350',
    'Production Qty (FG)': 392,
    'Unit Weight (kg)': 17.30,
    'Total Weight (kg)': 6782,
    'Operating Hours': 24
  },
  {
    'Date': '2026-09-27',
    'Item Code': '1141',
    'Product Description & Specs': 'PVC PRESSURE PIPE 3/4 SCH 40',
    'Machine': 'L-03 - KTS 700',
    'Production Qty (FG)': 3200,
    'Unit Weight (kg)': 1.20,
    'Total Weight (kg)': 3840,
    'Operating Hours': 24
  }
];

// Query for date 2026-09-26 and line L-03 - KTS 700
const matchedL03 = queryProductionRecords({
  dataset: testErpDataset,
  date: '2026-09-26',
  machine: 'L-03 - KTS 700'
});

assert.equal(matchedL03.length, 1, 'Should find exactly 1 matching record for L-03 on 2026-09-26');
assert.equal(matchedL03[0].productionQty, 4800, 'Should match 4800 production pieces');
assert.equal(matchedL03[0].itemCode, '1140', 'Should match item 1140');

// Query with line ID shorthand 'L-03'
const matchedByShortId = queryProductionRecords({
  dataset: testErpDataset,
  date: '2026-09-26',
  machine: 'L-03'
});
assert.equal(matchedByShortId.length, 1, 'Should match using short line ID L-03');
assert.equal(matchedByShortId[0].productionQty, 4800);

// Multi-item run on same date and machine: aggregation test
const multiItemDataset = [
  {
    'Date': '2026-09-26',
    'Item Code': '1140',
    'Product Description & Specs': 'UPVC PIPE 110x5.3 PN-12.5',
    'Machine': 'L-03 - KTS 700',
    'Production Qty (FG)': 2500,
    'Unit Weight (kg)': 17.30,
    'Operating Hours': 14
  },
  {
    'Date': '2026-09-26',
    'Item Code': '1141',
    'Product Description & Specs': 'UPVC PIPE 160x7.7 PN-12.5',
    'Machine': 'L-03 - KTS 700',
    'Production Qty (FG)': 1500,
    'Unit Weight (kg)': 35.00,
    'Operating Hours': 10
  }
];

const matchedMulti = queryProductionRecords({
  dataset: multiItemDataset,
  date: '2026-09-26',
  machine: 'L-03 - KTS 700'
});
assert.equal(matchedMulti.length, 2, 'Should find both items for L-03 on 2026-09-26');
const totalMultiQty = matchedMulti.reduce((sum, r) => sum + r.productionQty, 0);
assert.equal(totalMultiQty, 4000, 'Aggregated finished goods quantity should be 2500 + 1500 = 4000');
console.log('Production Records Query & Aggregation: OK');

// 9. Auto-Binding to Report Header & Blank/Zero Fallback
const boundSingle = autoBindProductionLogToReport({
  dataset: testErpDataset,
  date: '2026-09-26',
  machine: 'L-03 - KTS 700'
});

assert.equal(boundSingle.hasMatch, true, 'Should find matching record');
assert.equal(boundSingle.totalActualPieces, 4800, 'Total actual pieces should be auto-bound to 4800');
assert.equal(boundSingle.report.summary.totalOutput, '4800', 'Summary totalOutput should be 4800');
assert.equal(boundSingle.report.refs['1'].itemCode, '1140', 'Ref 1 item code should be bound to 1140');
assert.ok(boundSingle.report.refs['1'].pipeSpec.includes('110x5.3'), 'Ref 1 pipeSpec should contain pipe spec');
assert.equal(boundSingle.report.refs['1'].od, '110', 'Ref 1 OD should be 110');
assert.equal(boundSingle.report.refs['1'].wt, '5.3', 'Ref 1 WT should be 5.3');
assert.equal(boundSingle.report.refs['1'].cls, 'PN-12.5', 'Ref 1 Class should be PN-12.5');
assert.equal(boundSingle.report.refs['1'].stdWeight, '17.3', 'Ref 1 stdWeight should be bound');
assert.ok(Number(boundSingle.report.refs['1'].targetRate) > 0, 'Target rate should be calculated');
assert.ok(boundSingle.report.slots.length === 24, '24 hour slots should be built');

// Multi-item binding verification
const boundMulti = autoBindProductionLogToReport({
  dataset: multiItemDataset,
  date: '2026-09-26',
  machine: 'L-03 - KTS 700'
});
assert.equal(boundMulti.hasMatch, true);
assert.equal(boundMulti.totalActualPieces, 4000, 'Multi-item aggregated output should be 4000');
assert.equal(boundMulti.report.refs['1'].itemCode, '1140');
assert.equal(boundMulti.report.refs['2'].itemCode, '1141');

// Blank/Zero Fallback for line with no records on that date
const boundBlank = autoBindProductionLogToReport({
  dataset: testErpDataset,
  date: '2026-09-26',
  machine: 'L-07 - KTS 170'
});
assert.equal(boundBlank.hasMatch, false, 'No records for L-07 on 2026-09-26');
assert.equal(boundBlank.totalActualPieces, 0, 'Blank state should have 0 actual pieces');
assert.equal(boundBlank.report.summary.totalOutput, '0', 'Blank state summary should have 0 output');
assert.equal(boundBlank.report.header.lineId, 'L-07', 'Header should be set to requested line');
assert.equal(boundBlank.report.header.date, '2026-09-26', 'Header date should be set to requested date');
assert.equal(boundBlank.report.slots[0].actual, 0, 'Blank slots should have 0 actual output');
console.log('Auto-Binding to Report Header & Blank/Zero Fallback: OK');

console.log('All OEE Reconciler unit tests passed successfully!');

