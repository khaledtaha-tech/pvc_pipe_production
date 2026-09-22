import assert from 'node:assert/strict';
import {
  formatSopDates,
  calculateStandardCumulative,
  calculateStandardProduction,
  calculateStandardHourly,
  buildSopModel,
  buildBlankSopModel,
  formatFullMachineName,
  computeStandardHourlyMeters,
  SOP_SHIFT1_HOURS,
  SOP_SHIFT2_HOURS
} from '../../src/logic/legacySopHelper.js';
import { getBenchmarkReport } from '../../src/data/store.js';
import { buildAll } from '../../src/logic/engine.js';

console.log('--- Starting Legacy SOP Helper Unit Tests ---');

// 1. Date Formatting
const d1 = formatSopDates('2026-09-17');
assert.equal(d1.dots, '17.09.2026');
assert.equal(d1.spaces, '17 9 2026');

const d2 = formatSopDates('17/09/2026');
assert.equal(d2.dots, '17.09.2026');
assert.equal(d2.spaces, '17 9 2026');
console.log('Date formatting for SOP: OK');

// 2. Standard Cumulative and Non-Cumulative Production Sequences
const std10 = calculateStandardCumulative(10, 12);
assert.equal(std10.length, 12);
assert.equal(std10[0], 600);
assert.equal(std10[1], 1200);
assert.equal(std10[5], 3600);
assert.equal(std10[11], 7200);

// Non-cumulative equal hourly rate (e.g., 20, 20, 20... or 600, 600, 600...)
const stdHourly = calculateStandardHourly(10, 12);
assert.equal(stdHourly.length, 12);
assert.equal(stdHourly[0], 600);
assert.equal(stdHourly[1], 600);
assert.equal(stdHourly[11], 600);

const stdRate20 = calculateStandardProduction(20 / 60, 12, false);
assert.equal(stdRate20.length, 12);
assert.equal(stdRate20[0], 20);
assert.equal(stdRate20[5], 20);
assert.equal(stdRate20[11], 20);
console.log('Standard cumulative & non-cumulative rate calculations: OK');

// 3. Shift Hours Sequence (06:30 24h Cycle)
assert.equal(SOP_SHIFT1_HOURS.length, 12);
assert.equal(SOP_SHIFT1_HOURS[0], '06:30');
assert.equal(SOP_SHIFT1_HOURS[11], '17:30');

assert.equal(SOP_SHIFT2_HOURS.length, 12);
assert.equal(SOP_SHIFT2_HOURS[0], '18:30');
assert.equal(SOP_SHIFT2_HOURS[11], '05:30');
console.log('Shift hour sequences (06:30 start): OK');

// 4. Full Machine Name Formatting
assert.equal(formatFullMachineName('L-07', 'KTS 170'), 'L-07 - KTS 170');
assert.equal(formatFullMachineName('L-07', 'L-07 - KTS 170'), 'L-07 - KTS 170');
assert.equal(formatFullMachineName('L-07', ''), 'L-07 - KTS 170');
assert.equal(formatFullMachineName('L-05', ''), 'L-05 - KTS 350');
assert.equal(formatFullMachineName('L-03', ''), 'L-03 - KTS 700');
assert.equal(formatFullMachineName('WIND1', ''), 'WIND1');
assert.equal(formatFullMachineName('L-08', 'KTS 350 TDH'), 'L-08 - KTS 350 TDH');
console.log('Full machine name formatting & catalog lookup: OK');

// 5. Model Building with Benchmark Report (Non-cumulative Standard Production)
const benchmark = getBenchmarkReport();
const derived = buildAll(benchmark.slots, benchmark.refs, benchmark.summary.startCounter);
const model = buildSopModel(benchmark, derived);

assert.equal(model.docCode, 'DOC-Ext.-03');
assert.equal(model.version, '3');
assert.equal(model.fullMachineName, 'L-03 - KTS 700');
assert.equal(model.lineId, 'L-03 - KTS 700');
assert.equal(model.shift1Rows.length, 12);
assert.equal(model.shift2Rows.length, 12);

// Non-cumulative constant hourly rate verification
assert.equal(model.shift1Rows[0].stdM, model.shift1Rows[1].stdM);
assert.equal(model.shift1Rows[0].stdM, model.shift1Rows[11].stdM);
assert.ok(model.s1TotalGoodM >= 0);
console.log('Model generation with non-cumulative standard rate: OK');

// 6. Blank SOP Template Model Building (DOC-Ext.-03)
const blankModel = buildBlankSopModel({ standardRate: 20 });
assert.equal(blankModel.docCode, 'DOC-Ext.-03');
assert.equal(blankModel.version, '3');
assert.equal(blankModel.isBlank, true);
assert.equal(blankModel.fullMachineName, '');
assert.equal(blankModel.productDescription, '');
assert.equal(blankModel.dateDots, '');
assert.equal(blankModel.dateSpaces, '');
assert.equal(blankModel.shift1Lead, '');
assert.equal(blankModel.shift2Lead, '');
assert.equal(blankModel.s1TotalGoodM, '');
assert.equal(blankModel.s1TotalScrapKg, '');
assert.equal(blankModel.s2TotalGoodM, '');
assert.equal(blankModel.s2TotalScrapKg, '');

// Hourly columns cleared for manual recording
for (const r of blankModel.shift1Rows) {
  assert.equal(r.stdM, 20);
  assert.equal(r.goodM, '');
  assert.equal(r.cause, '');
  assert.equal(r.downtime, '');
  assert.equal(r.rejectKg, '');
}
for (const r of blankModel.shift2Rows) {
  assert.equal(r.stdM, 20);
  assert.equal(r.goodM, '');
  assert.equal(r.cause, '');
  assert.equal(r.downtime, '');
  assert.equal(r.rejectKg, '');
}
console.log('Blank SOP Template (DOC-Ext.-03) model generation: OK');

// 7. Pre-filled Calculated Hourly Standard Production (Non-blank stdM)
const blankDefault = buildBlankSopModel();
assert.equal(blankDefault.shift1Rows.length, 12);
assert.equal(blankDefault.shift2Rows.length, 12);
assert.equal(blankDefault.shift1Rows[0].stdM, 600);
assert.equal(blankDefault.shift1Rows[11].stdM, 600);
assert.equal(blankDefault.shift2Rows[0].stdM, 600);
assert.equal(blankDefault.shift2Rows[11].stdM, 600);

// Benchmark model pre-filled hourly standard rate (speed 15 m/min -> 900 m/h, speed 12 m/min -> 720 m/h)
assert.equal(model.shift1Rows[0].stdM, 900);
assert.equal(model.shift1Rows[11].stdM, 900);
assert.equal(model.shift2Rows[0].stdM, 720);
assert.equal(model.shift2Rows[11].stdM, 720);
console.log('Pre-filled standard production rate (stdM): OK');

console.log('All Legacy SOP Helper unit tests passed successfully!');
