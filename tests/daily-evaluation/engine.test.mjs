import assert from 'node:assert/strict';
import { generateReport, buildAll, buildRefDerived, makeRefSpec, roundToSum } from '../../src/logic/engine.js';
import { getBenchmarkReport } from '../../src/data/store.js';

console.log('--- Starting Engine Unit Tests ---');

// 1. Benchmark Data Test against PVC_Pipe_Daily_Follow.xlsx
const benchmarkReport = getBenchmarkReport();
const data = generateReport(benchmarkReport);

// Ref 1 cut time & target rate
assert.equal(data.slots[0].rate, 150, 'Ref 1 rate should be 150 pcs/h');
assert.equal(data.slots[0].target, 0, 'Slot 0 (07:00-08:00) target should be 0 due to 60 min downtime');

// First 3 hours (07:00 - 10:00) must be 100% downtime
for (let i = 0; i < 3; i++) {
  assert.equal(data.slots[i].downtime, 60, `Slot ${i} downtime should be 60 min`);
  assert.equal(data.slots[i].actual, 0, `Slot ${i} actual output should be 0`);
  assert.equal(data.slots[i].target, 0, `Slot ${i} target output should be 0`);
}

// Remaining 21 hours must be 150 actual and 150 target
for (let i = 3; i < 24; i++) {
  assert.equal(data.slots[i].downtime, 0, `Slot ${i} should have 0 downtime`);
  assert.equal(data.slots[i].actual, 150, `Slot ${i} should have 150 actual output`);
  assert.equal(data.slots[i].target, 150, `Slot ${i} should have 150 target output`);
}

// Grand totals verification
assert.equal(data.grandTotals.actual, 3150, 'Grand total actual should be 3150');
assert.equal(data.grandTotals.scrap, 25, 'Grand total scrap should be 25');
assert.equal(data.grandTotals.good, 3125, 'Grand total good should be 3125');
assert.equal(data.grandTotals.bundles, 21, 'Grand total bundles should be 21');
assert.equal(Math.round(data.grandTotals.purge), 100, 'Grand total purge should be 100');

// Shift 1 & Shift 2 subtotals verification
assert.equal(data.shift1Totals.actual, 1350, 'Shift 1 subtotal actual should be 1350');
assert.equal(data.shift2Totals.actual, 1800, 'Shift 2 subtotal actual should be 1800');
assert.equal(data.shift1Totals.endCounter, 1350, 'Shift 1 end counter should be 1350');
assert.equal(data.shift2Totals.endCounter, 3150, 'Shift 2 end counter should be 3150');

// OEE Metrics verification (exact match with Excel formulas)
assert.equal(Math.round(data.totalDowntimeMin), 180, 'Total downtime min should be 180');
assert.equal(data.totalDowntimeHours, 3.0, 'Total downtime hours should be 3.0');
assert.equal(data.operatingHours, 21.0, 'Operating hours should be 21.0');
assert.equal(Math.round(data.availability * 1000) / 1000, 0.875, 'Availability rate should be 87.5%');
assert.equal(Math.round(data.performance * 1000) / 1000, 1.0, 'Performance rate should be 100.0%');
assert.equal(Math.round(data.quality * 10000) / 10000, 0.9921, 'Quality rate should be 99.21%');
assert.equal(Math.round(data.oee * 10000) / 10000, 0.8681, 'Overall OEE should be 86.81%');

// Explicit transparent OEE formula strings
assert.equal(data.aStr, '87.5%');
assert.equal(data.pStr, '100.0%');
assert.equal(data.qStr, '99.2%');
assert.equal(data.oeeStr, '86.8%');
assert.equal(data.formulaStr, 'OEE = A (87.5%) × P (100.0%) × Q (99.2%) = 86.8%');

// 2. Largest remainder algorithm test (sum preservation with fractions)
const distributed = roundToSum([33.333, 33.333, 33.334], 100);
assert.equal(distributed.reduce((a, b) => a + b, 0), 100, 'roundToSum should preserve exact target sum');

// 3. Interactive live re-calculation test
const editedSlots = data.slots.map((s) => (s.startHour === 17 ? { ...s, actual: 120, scrap: 5 } : s));
const recomputed = buildAll(editedSlots, benchmarkReport.refs, 0);
assert.equal(recomputed.grandTotals.actual, 3120, 'Edited grand total actual should reflect change');
assert.equal(recomputed.grandTotals.scrap, 29, 'Scrap should increase by 4');
assert.equal(recomputed.grandTotals.good, 3091, 'Good pipes should equal actual - scrap');

// 4. 12-Hour Shift Summary aggregation parity
const s1 = data.shift1Totals;
const s2 = data.shift2Totals;
const grand = data.grandTotals;

assert.equal(s1.actual + s2.actual, grand.actual, 'Shift 1 + Shift 2 actual must equal 24h grand total');
assert.equal(s1.target + s2.target, grand.target, 'Shift 1 + Shift 2 target must equal 24h grand total');
assert.equal(s1.downtime + s2.downtime, grand.downtime, 'Shift 1 + Shift 2 downtime must equal 24h grand total');
assert.equal(s1.scrap + s2.scrap, grand.scrap, 'Shift 1 + Shift 2 scrap must equal 24h grand total');
assert.equal(Math.round(s1.purge + s2.purge), Math.round(grand.purge), 'Shift 1 + Shift 2 purge must equal 24h grand total');

// Unique downtime reasons extraction for shifts
const s1Reasons = Array.from(new Set(data.slots.filter((s) => s.shift === 1 && s.reason).map((s) => s.reason)));
assert.ok(s1Reasons.length > 0, 'Shift 1 should have extracted downtime reasons');
const s2Reasons = Array.from(new Set(data.slots.filter((s) => s.shift === 2 && s.reason).map((s) => s.reason)));
assert.equal(s2Reasons.length, 0, 'Shift 2 has no downtime in benchmark data');

console.log('12-Hour Shift Summary aggregation parity: OK');

// 5. True Actual Output Rate & Capacity Utilization % calculation
// Scenario: Machine L-05 with Nominal: 200 kg/h, Operating: 24.0h, Total Output: 3,360 kg
const slotsL05 = Array.from({ length: 24 }, (_, i) => ({
  index: i,
  window: `${String(i).padStart(2, '0')}:00`,
  shift: i < 12 ? 1 : 2,
  startHour: i,
  ref: '1',
  downtime: 0,
  reason: '',
  actual: 50, // 50 pcs/hour * 24 = 1200 pcs
  scrap: 0,
  purge: 0,
  bundles: 0
}));

const refsL05 = {
  1: {
    ...makeRefSpec(),
    stdWeight: '2.8' // 1200 * 2.8 = 3,360 kg
  }
};

const engL05 = {
  nominalCapacityKgH: 200,
  totalWeightKg: 3360,
  // Deliberately simulate stale actualRateKgH = 50 pcs/h to verify override
  actualRateKgH: 50
};

const derivedL05 = buildAll(slotsL05, refsL05, 0, engL05);
assert.equal(derivedL05.operatingHours, 24.0);
assert.equal(derivedL05.engineering.totalWeightKg, 3360);
assert.equal(derivedL05.engineering.actualRateKgH, 140, 'Actual output rate must strictly evaluate to 140 kg/h (3360 / 24.0)');
assert.equal(derivedL05.engineering.capacityUtilizationPct, 70.0, 'Capacity utilization must strictly evaluate to 70.0% (140 / 200)');
console.log('True Actual Output Rate (140 kg/h) & Capacity Utilization (70%): OK');

// Scenario with downtime: 21.5h operating, 3010 kg total output, 200 kg/h nominal
const slotsL05WithDt = slotsL05.map((s, idx) => (idx === 0 ? { ...s, downtime: 150 } : s)); // 2.5h downtime => 21.5h operating
const engL05WithDt = {
  nominalCapacityKgH: 200,
  totalWeightKg: 3010
};
const derivedL05WithDt = buildAll(slotsL05WithDt, refsL05, 0, engL05WithDt);
assert.equal(derivedL05WithDt.operatingHours, 21.5);
assert.equal(derivedL05WithDt.engineering.actualRateKgH, 140, '3010 kg / 21.5h must evaluate to 140 kg/h');
assert.equal(derivedL05WithDt.engineering.capacityUtilizationPct, 70.0);
console.log('Actual Output Rate with downtime: OK');

// 6. Direct In-Place Editing of Standard Output Rate & Weight
// Modifying targetRate updates cutTime, hourly slot targets, and Performance / OEE
const baseRef = {
  ...makeRefSpec(),
  pipeLength: '6',
  speed: '1.2',
  stdWeight: '20',
  targetRate: '12' // 12 pcs/hour
};
const derivedRef = buildRefDerived(baseRef);
assert.equal(derivedRef.cutTime, 300, '3600 / 12 = 300s cut time');

// Simulate user editing targetRate in-place to 15 pcs/h
const editedRef = {
  ...baseRef,
  targetRate: '15'
};
const rederivedRef = buildRefDerived(editedRef);
assert.equal(rederivedRef.cutTime, 240, '3600 / 15 = 240s cut time');

// Check 24-hour slots target derivation when rate is updated
const slots24 = Array.from({ length: 24 }, (_, i) => ({
  index: i,
  window: `${String(i).padStart(2, '0')}:00`,
  shift: i < 12 ? 1 : 2,
  startHour: i,
  ref: '1',
  downtime: 0,
  actual: 12,
  scrap: 0
}));

// At 12 pcs/h target, 12 actual is 100% performance
const derived12 = buildAll(slots24, { 1: baseRef }, 0);
assert.equal(derived12.grandTotals.target, 288, '24 * 12 = 288 target pieces');
assert.equal(derived12.pStr, '100.0%', 'Performance should be 100% when actual matches target');

// At 15 pcs/h target, 12 actual is 80% performance (288 / 360)
const derived15 = buildAll(slots24, { 1: editedRef }, 0);
assert.equal(derived15.grandTotals.target, 360, '24 * 15 = 360 target pieces');
assert.equal(derived15.pStr, '80.0%', 'Performance should immediately recalculate to 80.0% (288 / 360)');
assert.equal(derived15.oeeStr, '80.0%', 'Overall OEE should reflect the updated target rate');
console.log('In-place standard rate editing & instant OEE recalculation: OK');

console.log('All engine unit tests passed successfully!');
