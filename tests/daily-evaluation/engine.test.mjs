import assert from 'node:assert/strict';
import { generateReport, buildAll, makeRefSpec, roundToSum } from '../../src/logic/engine.js';
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

console.log('All engine unit tests passed successfully!');
