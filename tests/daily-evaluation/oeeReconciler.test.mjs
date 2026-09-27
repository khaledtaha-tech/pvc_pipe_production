import assert from 'node:assert/strict';
import {
  getDefaultDeratingFactor,
  applyEventToSlots,
  calculateReconciliationAudit,
  reconcileShiftRun,
  STANDARD_BREAKDOWN_REASONS,
  DEFAULT_EVENT_CONFIGS
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

console.log('All OEE Reconciler unit tests passed successfully!');
