import assert from 'node:assert/strict';
import {
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
import { generateReport, buildAll, HOUR_WINDOWS, distributeProduction } from '../../src/logic/engine.js';
import { getBenchmarkReport } from '../../src/data/store.js';
import { convertLogRowToReport } from '../../src/logic/excelParser.js';

console.log('--- Starting OEE Reconciler & Direct Nominal OEE Unit Tests ---');

// 1. Direct Nominal Capacity Baseline
// Verify that machines operate directly on nominal capacities without derating
const benchmarkRep = getBenchmarkReport();
assert.ok(benchmarkRep.header.lineId, 'Benchmark report has valid machine line');
const builtReport = buildAll(benchmarkRep.slots, benchmarkRep.refs, 0);
assert.equal(builtReport.engineering.deratingFactor, undefined, 'Engineering should not have deratingFactor');
assert.equal(
  builtReport.performance,
  builtReport.grandTotals.target > 0 ? builtReport.grandTotals.actual / builtReport.grandTotals.target : 0,
  'Performance must directly compare actual output vs standard nominal target'
);
console.log('Direct Nominal Capacity Baseline: OK');

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
  moldChangeMin: 0,
  warmupMin: 0,
  breakdownMin: 0
});
assert.equal(auditPerfect.theoreticalCapacityPcs, 2400, 'Theoretical capacity for 24h at 100 pcs/h is 2400');
assert.equal(auditPerfect.missingHours, 0, 'No missing hours when full output achieved');
assert.equal(auditPerfect.totalAccountedHours, 0, 'No accounted downtime hours');
assert.equal(auditPerfect.unexplainedGapHours, 0, 'Zero unexplained time gap');
assert.equal(auditPerfect.isFullyReconciled, true, 'Perfect run is fully reconciled');

// Shift scenario with declared downtime (no derating factor)
// Target: 100 pcs/h (Theoretical: 2400 pcs)
// Mold change: 120 min (2h)
// Warm-up: 60 min (1h)
// Breakdown: 60 min (1h)
// Total downtime: 4 hours (20 operating hours)
// Total accounted hours = 4.0 downtime hours (400 pieces)
// Expected pieces produced: 2400 - 400 = 2000 pieces
const auditRealistic = calculateReconciliationAudit({
  totalActualPieces: 2000,
  targetRate: 100,
  moldChangeMin: 120,
  warmupMin: 60,
  breakdownMin: 60
});

assert.equal(auditRealistic.theoreticalCapacityPcs, 2400);
assert.equal(auditRealistic.actualPcs, 2000);
assert.equal(auditRealistic.missingHours, 4.0, '2400 - 2000 = 400 pcs = 4.0 missing hours');
assert.equal(auditRealistic.totalDowntimeHours, 4.0, '120 + 60 + 60 min = 4.0 downtime hours');
assert.equal(auditRealistic.operatingHours, 20.0, '24 - 4 = 20 operating hours');
assert.equal(auditRealistic.totalAccountedHours, 4.0, '4.0 downtime = 4.0 hours');
assert.equal(auditRealistic.totalAccountedPieces, 400, '4.0 hours * 100 pcs/h = 400 pieces');
assert.equal(auditRealistic.unexplainedGapHours, 0, 'Unexplained gap should be 0 when perfectly accounted');
assert.equal(auditRealistic.isFullyReconciled, true, 'Run should be marked fully reconciled');

// Scenario with unexplained gap (operator produced only 1700 pieces instead of 2000)
const auditWithGap = calculateReconciliationAudit({
  totalActualPieces: 1700,
  targetRate: 100,
  moldChangeMin: 120,
  warmupMin: 60,
  breakdownMin: 60
});
assert.equal(auditWithGap.missingHours, 7.0, '2400 - 1700 = 700 pcs = 7.0 hours');
assert.equal(auditWithGap.totalAccountedHours, 4.0, 'Still 4.0 hours accounted downtime');
assert.equal(auditWithGap.unexplainedGapHours, 3.0, '7.0 - 4.0 = 3.0 unexplained hours');
assert.equal(auditWithGap.unexplainedGapPieces, 300, '3.0 hours * 100 pcs/h = 300 unexplained pieces');
assert.equal(auditWithGap.isFullyReconciled, false, 'Run has 3.0h unexplained gap, should not be reconciled');
console.log('calculateReconciliationAudit mathematics and variance tracking: OK');

// 4. reconcileShiftRun 24-Hour Grid Distribution & Exact Integer Preservation
const benchmarkReport = getBenchmarkReport();
const reconcileResult = reconcileShiftRun(benchmarkReport, {
  totalActualPieces: 2150,
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

assert.ok(reconcileResult.audit, 'Audit payload must be included in result');
console.log('reconcileShiftRun distribution and exact integer preservation: OK');

// 5. Integration with buildAll: Direct Nominal Comparison without Derating
const nominalReport = buildAll(updatedSlots, benchmarkReport.refs, 0);

// Standard slot-level targets and grand totals remain nominal
for (let i = 0; i < 24; i++) {
  assert.ok(nominalReport.slots[i].target >= 0, `Slot ${i} target must be valid`);
}
assert.ok(nominalReport.grandTotals.target > 0, 'Grand total target must be positive');

// Performance must strictly evaluate actual vs nominal target
const expectedPerf = nominalReport.grandTotals.actual / nominalReport.grandTotals.target;
assert.equal(nominalReport.performance, expectedPerf, 'Performance must strictly equal actual / target');
assert.equal(nominalReport.engineering.deratingFactor, undefined, 'Engineering must not define deratingFactor');
assert.ok(nominalReport.pStr.includes('%'), 'Performance string must format correctly');
console.log('Integration with buildAll & direct nominal target calculation: OK');

// 6. Date & Machine Matching Precision
assert.equal(isDateMatch('2026-09-26', '2026-09-26'), true, 'Exact ISO dates should match');
assert.equal(isDateMatch('26/09/2026', '2026-09-26'), true, 'DD/MM/YYYY should match ISO date');
assert.equal(isDateMatch('2026-09-26', '2026-09-27'), false, 'Different dates must not match');

// Machine matching
assert.equal(isMachineMatch('L-06', 'L-06 - KTS 700'), true, 'Line ID L-06 should match L-06 - KTS 700');
assert.equal(isMachineMatch('KTS 700', 'L-06'), true, 'KTS 700 should match L-06');
assert.equal(isMachineMatch('KTS-700', 'L-06'), true, 'KTS-700 should match L-06');
assert.equal(isMachineMatch('KTS 350 TDH', 'L-01'), true, 'KTS 350 TDH should match L-01');
assert.equal(isMachineMatch('KTS 350 TDH', 'L-04'), false, 'KTS 350 TDH must NOT match standard L-04');
assert.equal(isMachineMatch('L-01', 'L-02'), false, 'Different machines must not match');
console.log('Date & Machine Matching: OK');

// 7. Row Normalization across ERP and Daily Log Formats
const erpSampleRow = {
  'Date': '2026-09-26',
  'Item Code': '1140',
  'Product Description & Specs': 'UPVC PIPE 110x5.3 PN-12.5 SASO-ISO',
  'Machine': 'L-06 - KTS 700',
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
assert.equal(normalized.machineId, 'L-06', 'Machine ID should resolve to L-06');
assert.equal(normalized.productionQty, 4800, 'Production Qty should parse to 4800');
assert.equal(normalized.unitWeight, 17.3, 'Unit weight should parse to 17.3');
assert.equal(normalized.totalWeight, 83040, 'Total weight should parse to 83040');
assert.equal(normalized.nominalCapacityKgH, 500, 'L-06 nominal capacity should be 500 kg/h');
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
    'Machine': 'L-06 - KTS 700',
    'Production Qty (FG)': 3200,
    'Unit Weight (kg)': 1.20,
    'Total Weight (kg)': 3840,
    'Operating Hours': 24
  }
];

// Query for date 2026-09-26 and line L-06 - KTS 700
const matchedL06 = queryProductionRecords({
  dataset: testErpDataset,
  date: '2026-09-26',
  machine: 'L-06 - KTS 700'
});

assert.equal(matchedL06.length, 1, 'Should find exactly 1 matching record for L-06 on 2026-09-26');
assert.equal(matchedL06[0].productionQty, 4800, 'Should match 4800 production pieces');
assert.equal(matchedL06[0].itemCode, '1140', 'Should match item 1140');

// Query with line ID shorthand 'L-06'
const matchedByShortId = queryProductionRecords({
  dataset: testErpDataset,
  date: '2026-09-26',
  machine: 'L-06'
});
assert.equal(matchedByShortId.length, 1, 'Should match using short line ID L-06');
assert.equal(matchedByShortId[0].productionQty, 4800);

// Multi-item run on same date and machine: aggregation test
const multiItemDataset = [
  {
    'Date': '2026-09-26',
    'Item Code': '1140',
    'Product Description & Specs': 'UPVC PIPE 110x5.3 PN-12.5',
    'Machine': 'L-06 - KTS 700',
    'Production Qty (FG)': 2500,
    'Unit Weight (kg)': 17.30,
    'Operating Hours': 14
  },
  {
    'Date': '2026-09-26',
    'Item Code': '1141',
    'Product Description & Specs': 'UPVC PIPE 160x7.7 PN-12.5',
    'Machine': 'L-06 - KTS 700',
    'Production Qty (FG)': 1500,
    'Unit Weight (kg)': 35.00,
    'Operating Hours': 10
  }
];

const matchedMulti = queryProductionRecords({
  dataset: multiItemDataset,
  date: '2026-09-26',
  machine: 'L-06 - KTS 700'
});
assert.equal(matchedMulti.length, 2, 'Should find both items for L-06 on 2026-09-26');
const totalMultiQty = matchedMulti.reduce((sum, r) => sum + r.productionQty, 0);
assert.equal(totalMultiQty, 4000, 'Aggregated finished goods quantity should be 2500 + 1500 = 4000');
console.log('Production Records Query & Aggregation: OK');

// 9. Auto-Binding to Report Header & Blank/Zero Fallback
const boundSingle = autoBindProductionLogToReport({
  dataset: testErpDataset,
  date: '2026-09-26',
  machine: 'L-06 - KTS 700'
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
  machine: 'L-06 - KTS 700'
});
assert.equal(boundMulti.hasMatch, true);
assert.equal(boundMulti.totalActualPieces, 4000, 'Multi-item aggregated output should be 4000');
assert.equal(boundMulti.report.refs['1'].itemCode, '1140');
assert.equal(boundMulti.report.refs['2'].itemCode, '1141');

// Blank/Zero Fallback for line with no records on that date
const boundBlank = autoBindProductionLogToReport({
  dataset: testErpDataset,
  date: '2026-09-26',
  machine: 'L-02 - KTS 170'
});
assert.equal(boundBlank.hasMatch, false, 'No records for L-02 on 2026-09-26');
assert.equal(boundBlank.totalActualPieces, 0, 'Blank state should have 0 actual pieces');
assert.equal(boundBlank.report.summary.totalOutput, '0', 'Blank state summary should have 0 output');
assert.equal(boundBlank.report.header.lineId, 'L-02', 'Header should be set to requested line');
assert.equal(boundBlank.report.header.date, '2026-09-26', 'Header date should be set to requested date');
assert.equal(boundBlank.report.slots[0].actual, 0, 'Blank slots should have 0 actual output');
console.log('Auto-Binding to Report Header & Blank/Zero Fallback: OK');

// 10. Active Machines Date Filtering & Machine Dropdown Selection Binding
const sampleFactoryDataset = [
  {
    date: '2026-09-26',
    machine: 'L-06 - KTS 700',
    itemCode: '1140',
    productionQty: 2500,
    operatingHours: 20
  },
  {
    date: '2026-09-26',
    machine: 'L-04 - KTS 350',
    itemCode: '1150',
    productionQty: 1800,
    operatingHours: 18
  },
  {
    date: '2026-09-26',
    machine: 'L-05 - KTS 200',
    itemCode: '1160',
    productionQty: 0,
    operatingHours: 0
  },
  {
    date: '2026-09-27',
    machine: 'L-07 - KTS 250 TDH',
    itemCode: '1120',
    productionQty: 3200,
    operatingHours: 24
  }
];

// Test date filtering for 2026-09-26
const recordsFor26 = queryProductionRecordsForDate({
  dataset: sampleFactoryDataset,
  date: '2026-09-26'
});
// Filter active operating lines (productionQty > 0 or operatingHours > 0)
const operatingLines26 = recordsFor26.filter((r) => Number(r.productionQty) > 0 || Number(r.operatingHours) > 0);
assert.equal(operatingLines26.length, 2, 'Should find exactly 2 operating lines on 2026-09-26 (L-06 and L-04)');
assert.ok(operatingLines26.some((r) => r.machineId === 'L-06'), 'L-06 must be in active operating lines');
assert.ok(operatingLines26.some((r) => r.machineId === 'L-04'), 'L-04 must be in active operating lines');
assert.ok(!operatingLines26.some((r) => r.machineId === 'L-05'), 'Idle line L-05 must be excluded from active list');

// Test auto-selection of first active machine on date change
const firstActive26 = operatingLines26[0];
assert.equal(firstActive26.machineId, 'L-06', 'First active machine on 2026-09-26 should be L-06');

const recordsFor27 = queryProductionRecordsForDate({
  dataset: sampleFactoryDataset,
  date: '2026-09-27'
});
const operatingLines27 = recordsFor27.filter((r) => Number(r.productionQty) > 0 || Number(r.operatingHours) > 0);
assert.equal(operatingLines27.length, 1, 'Should find exactly 1 operating line on 2026-09-27');
assert.equal(operatingLines27[0].machineId, 'L-07', 'First active machine on 2026-09-27 should be L-07');

// Test exact machine selection binding by ID (not array index)
const selectedL04 = queryProductionRecords({
  dataset: sampleFactoryDataset,
  date: '2026-09-26',
  machine: 'L-04'
});
assert.equal(selectedL04.length, 1, 'Selecting L-04 by exact ID should return exactly 1 record');
assert.equal(selectedL04[0].machineId, 'L-04', 'Selected record machineId must match requested ID L-04');

// Test idle line selection produces blank report with exact requested lineId
const idleL05Blank = blankReportForMachine('2026-09-26', 'L-05');
assert.equal(idleL05Blank.header.lineId, 'L-05', 'Blank report header lineId must strictly match requested L-05');
assert.equal(idleL05Blank.summary.totalOutput, '0', 'Blank report totalOutput must be 0');
console.log('Active Machines Date Filtering & Machine Dropdown Selection Binding: OK');

// 11. State Synchronization & Reactive 24h Slot Synthesis when Operating Hours is 0 or Missing
// Case A: Record with flexible ERP field name and 0 operating hours / 24h downtime trap
const rawErpStagnantRow = {
  Date: '2026-09-26',
  'Item Code': '1140',
  'Product Description & Specs': 'UPVC PIPE 110x5.3 PN-12.5 SASO-ISO',
  Machine: 'L-06 - KTS 700',
  'Production Qty (FG)': 195,
  'Unit Weight (kg)': 17.30,
  'Total Weight (kg)': 3373.5,
  'Scrap / Rejection (kg)': 10,
  'Operating Hours': 0,
  downtimeHours: 24
};

const reportFromErp = convertLogRowToReport(rawErpStagnantRow);
assert.equal(reportFromErp.summary.totalOutput, '195', 'Summary total output must be extracted as 195 pieces');
assert.ok(reportFromErp.engineering.operatingHours > 0, 'Operating hours must not be zero when positive output is produced');
assert.ok(reportFromErp.downtimeEvents.length === 0 || reportFromErp.downtimeEvents[0].durationMin < 1440, 'Downtime must not block full 24h');

const sumSlotActuals = reportFromErp.slots.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
assert.equal(Math.round(sumSlotActuals), 195, 'Slots must hold distributed 195 actual pieces');

const derivedErp = buildAll(reportFromErp.slots, reportFromErp.refs, 0, reportFromErp.engineering);
assert.ok(derivedErp.operatingHours > 0, 'Derived operating hours must be greater than 0');
assert.ok(derivedErp.availability > 0, 'Derived availability must be greater than 0');
assert.ok(derivedErp.oee > 0, 'Derived OEE must be greater than 0%');
assert.equal(Math.round(derivedErp.grandTotals.actual), 195, 'Grand total actual pieces must equal 195');

// Case B: Defensive fallback in distributeProduction when all slots have 100% downtime
const fullyBlockedSlots = HOUR_WINDOWS.map((h) => ({
  index: h.index,
  window: h.label,
  shift: h.shift,
  startHour: h.startHour,
  ref: '1',
  downtime: 60,
  reason: 'Breakdown',
  actual: 0
}));
const liberated = distributeProduction(fullyBlockedSlots, {
  totalOutput: '250',
  totalScrapPipes: '5',
  totalPurgeKg: '10',
  totalBundles: '8'
});
const liberatedActualSum = liberated.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
assert.equal(Math.round(liberatedActualSum), 250, 'distributeProduction must liberate operating time and distribute 250 pcs');

// Case C: autoBindProductionLogToReport with raw ERP row yields positive slot pieces and live OEE
const autoBoundResult = autoBindProductionLogToReport({
  dataset: [rawErpStagnantRow],
  date: '2026-09-26',
  machine: 'L-06'
});
assert.equal(autoBoundResult.hasMatch, true, 'autoBindProductionLogToReport must find match');
assert.equal(autoBoundResult.totalActualPieces, 195, 'Total actual pieces must equal 195');
const autoBoundSlotSum = autoBoundResult.report.slots.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
assert.equal(Math.round(autoBoundSlotSum), 195, 'autoBound slots must have 195 actual pieces');
const autoBoundDerived = buildAll(autoBoundResult.report.slots, autoBoundResult.report.refs, 0, autoBoundResult.report.engineering);
assert.ok(autoBoundDerived.oee > 0, 'Live OEE must be greater than 0%');
assert.ok(autoBoundDerived.operatingHours > 0, 'Live operating hours must be greater than 0.0h');
console.log('State Synchronization & Reactive 24h Slot Synthesis: OK');

// 12. Dual-Mode Downtime Entry & True Speed-Loss Decoupling Tests
// Case A: Mode A - Standard Presets
const presetRun = reconcileShiftRun(benchmarkRep, {
  totalActualPieces: 1540,
  mode: 'preset',
  presets: [
    { id: 'mold_change', name: 'Die / Mold Changeover', durationMin: 120, startSlot: 2, enabled: true },
    { id: 'heater_failure', name: 'Heater / Thermocouple Failure', durationMin: 45, startSlot: 6, enabled: false } // Disabled, should not apply
  ]
});
assert.equal(presetRun.audit.totalDowntimeMin, 120, 'Preset mode must apply exactly 120 min for enabled preset');
assert.equal(presetRun.audit.totalDowntimeHours, 2.0, 'Preset mode must report 2.0h downtime');
assert.equal(presetRun.audit.operatingHours, 22.0, 'Operating hours must be 22.0h');
assert.equal(presetRun.updatedSlots[2].downtime, 60, 'Slot 2 downtime must be 60 min');
assert.equal(presetRun.updatedSlots[3].downtime, 60, 'Slot 3 downtime must be 60 min');
assert.equal(presetRun.updatedSlots[6].downtime, 0, 'Disabled preset must not apply downtime to slot 6');
const presetSlotSum = presetRun.updatedSlots.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
assert.equal(Math.round(presetSlotSum), 1540, 'Total actual pieces must sum to 1540 across operating slots');

// Case B: Mode B - Direct Manual Entry
const manualRun = reconcileShiftRun(benchmarkRep, {
  totalActualPieces: 1800,
  mode: 'manual',
  manualDowntime: {
    enabled: true,
    durationMin: 90,
    reason: 'Emergency Chiller Fix',
    startSlot: 8
  }
});
assert.equal(manualRun.audit.totalDowntimeMin, 90, 'Manual mode must apply 90 min');
assert.equal(manualRun.audit.totalDowntimeHours, 1.5, 'Manual mode must report 1.5h downtime');
assert.equal(manualRun.audit.operatingHours, 22.5, 'Manual mode must report 22.5h operating time');
assert.equal(manualRun.updatedSlots[8].downtime, 60, 'Slot 8 must receive 60 min');
assert.equal(manualRun.updatedSlots[9].downtime, 30, 'Slot 9 must receive 30 min');
assert.ok(manualRun.updatedSlots[8].reason.includes('Emergency Chiller Fix'), 'Slot reason must record manual description');

// Case C: Mode C - Zero Downtime Continuous 24h Full Run
const zeroDtAudit = calculateReconciliationAudit({
  totalActualPieces: 1680,
  targetRate: 100,
  totalDowntimeMin: 0
});
assert.equal(zeroDtAudit.operatingHours, 24.0, 'Zero downtime must have 24.0 operating hours');
assert.equal(zeroDtAudit.availability, 1.0, 'Availability must be 100% (1.0)');
assert.equal(zeroDtAudit.availabilityPct, 100.0, 'Availability % must be 100.0%');
assert.equal(zeroDtAudit.targetOutputForOperating, 2400, 'Target for 24h at 100 pcs/h must be 2400 pcs');
assert.equal(zeroDtAudit.actualHourlyRate, 70.0, 'Actual hourly rate must be 70.0 Pcs/h');
assert.equal(zeroDtAudit.performance, 0.7, 'Performance must be 70% (0.7)');
assert.equal(zeroDtAudit.performancePct, 70.0, 'Performance % must be 70.0%');
assert.equal(zeroDtAudit.downtimePieces, 0, 'Downtime loss must be 0 pcs');
assert.equal(zeroDtAudit.speedLossPieces, 720, 'Speed loss must be 720 pcs');
assert.equal(zeroDtAudit.overallOee, 0.7, 'Overall OEE must be 70% (0.7)');

const zeroDtRun = reconcileShiftRun(benchmarkRep, {
  totalActualPieces: 1680,
  mode: 'zero',
  zeroDowntime: true
});
assert.equal(zeroDtRun.audit.totalDowntimeMin, 0, 'Zero mode must enforce 0 downtime minutes');
assert.equal(zeroDtRun.audit.operatingHours, 24.0, 'Zero mode must enforce 24.0 operating hours');
const zeroSlotSum = zeroDtRun.updatedSlots.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
assert.equal(Math.round(zeroSlotSum), 1680, 'Actual pieces must sum to 1680 across all 24 slots');
const zeroDerived = buildAll(zeroDtRun.updatedSlots, benchmarkRep.refs, 0);
assert.equal(zeroDerived.availability, 1.0, 'buildAll availability must be 1.0 (100%)');
assert.ok(Math.abs(zeroDerived.performance - (1680 / zeroDerived.grandTotals.target)) < 0.01, 'Performance must reflect reduced speed');
console.log('Dual-Mode Downtime Entry & True Speed-Loss Decoupling: OK');

console.log('All OEE Reconciler unit tests passed successfully!');

