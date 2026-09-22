import assert from 'node:assert/strict';
import {
  formatSopDates,
  calculateStandardCumulative,
  calculateStandardProduction,
  calculateStandardHourly,
  buildSopModel,
  buildBlankSopModel,
  formatFullMachineName,
  computeStandardHourlyPieces,
  computeStandardHourlyMeters,
  extractEmbeddedItemCode,
  findPreviousRunForMachine,
  extractMachineSpecsFromRun,
  getAvailableProductsCatalog,
  calculateBenchmarkSpeedForProduct,
  buildMorningSopModel,
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

// 2. Standard Cumulative and Non-Cumulative Production Sequences in Pieces (Pcs) based on Cut Length
// target pcs/h = (speed m/min * 60) / pipe length
const std10 = calculateStandardCumulative(10, 12, 6.0);
assert.equal(std10.length, 12);
assert.equal(std10[0], 100);
assert.equal(std10[1], 200);
assert.equal(std10[5], 600);
assert.equal(std10[11], 1200);

// Non-cumulative equal hourly rate (e.g. 100, 100, 100... pcs/h)
const stdHourly = calculateStandardHourly(10, 12, 6.0);
assert.equal(stdHourly.length, 12);
assert.equal(stdHourly[0], 100);
assert.equal(stdHourly[1], 100);
assert.equal(stdHourly[11], 100);

// Custom pipe length: 10 m/min speed with 12.0m pipe length -> 50 pcs/h
const stdCustomLength = calculateStandardHourly(10, 12, 12.0);
assert.equal(stdCustomLength.length, 12);
assert.equal(stdCustomLength[0], 50);
assert.equal(stdCustomLength[11], 50);

const stdRate20 = calculateStandardProduction(20 * 6 / 60, 12, false, 6.0);
assert.equal(stdRate20.length, 12);
assert.equal(stdRate20[0], 20);
assert.equal(stdRate20[5], 20);
assert.equal(stdRate20[11], 20);
console.log('Standard cumulative & non-cumulative pieces rate calculations: OK');

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

// 5. Model Building with Benchmark Report (Non-cumulative Standard Production in Pieces)
const benchmark = getBenchmarkReport();
const derived = buildAll(benchmark.slots, benchmark.refs, benchmark.summary.startCounter);
const model = buildSopModel(benchmark, derived);

assert.equal(model.docCode, 'DOC-Ext.-03');
assert.equal(model.version, '3');
assert.equal(model.fullMachineName, 'L-03 - KTS 700');
assert.equal(model.lineId, 'L-03 - KTS 700');
assert.equal(model.shift1Rows.length, 12);
assert.equal(model.shift2Rows.length, 12);

// Non-cumulative constant hourly rate in pieces verification:
// Shift 1: Speed 15 m/min, pipeLength 6.0m -> (15 * 60) / 6.0 = 150 pcs/h
assert.equal(model.shift1Rows[0].stdPcs, 150);
assert.equal(model.shift1Rows[1].stdPcs, 150);
assert.equal(model.shift1Rows[11].stdPcs, 150);
assert.equal(model.shift1Rows[0].stdM, 150); // Backward compatibility alias

// Shift 2: Speed 12 m/min, pipeLength 6.0m -> (12 * 60) / 6.0 = 120 pcs/h
assert.equal(model.shift2Rows[0].stdPcs, 120);
assert.equal(model.shift2Rows[11].stdPcs, 120);
assert.equal(model.shift2Rows[0].stdM, 120);

// Both Actual and Standard are present side-by-side in filled view
assert.ok(model.shift1Rows[0].goodPcs !== undefined);
assert.ok(model.s1TotalGoodPcs >= 0);
assert.equal(model.s1TotalGoodM, model.s1TotalGoodPcs);
console.log('Model generation with standard pieces rate (Filled View): OK');

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
assert.equal(blankModel.s1TotalGoodPcs, '');
assert.equal(blankModel.s1TotalGoodM, '');
assert.equal(blankModel.s1TotalScrapKg, '');
assert.equal(blankModel.s2TotalGoodPcs, '');
assert.equal(blankModel.s2TotalGoodM, '');
assert.equal(blankModel.s2TotalScrapKg, '');

// Hourly columns cleared for manual recording in blank mode, while stdPcs is preserved
for (const r of blankModel.shift1Rows) {
  assert.equal(r.stdPcs, 20);
  assert.equal(r.goodPcs, '');
  assert.equal(r.goodM, '');
  assert.equal(r.cause, '');
  assert.equal(r.downtime, '');
  assert.equal(r.rejectKg, '');
}
for (const r of blankModel.shift2Rows) {
  assert.equal(r.stdPcs, 20);
  assert.equal(r.goodPcs, '');
  assert.equal(r.goodM, '');
  assert.equal(r.cause, '');
  assert.equal(r.downtime, '');
  assert.equal(r.rejectKg, '');
}
console.log('Blank SOP Template (DOC-Ext.-03) model generation: OK');

// 7. Pre-filled Calculated Hourly Standard Production in Pieces (Default 100 pcs/h)
const blankDefault = buildBlankSopModel();
assert.equal(blankDefault.shift1Rows.length, 12);
assert.equal(blankDefault.shift2Rows.length, 12);
assert.equal(blankDefault.shift1Rows[0].stdPcs, 100);
assert.equal(blankDefault.shift1Rows[11].stdPcs, 100);
assert.equal(blankDefault.shift2Rows[0].stdPcs, 100);
assert.equal(blankDefault.shift2Rows[11].stdPcs, 100);
console.log('Pre-filled standard production rate in pieces (stdPcs): OK');

// 8. Previous Operational Run Auto-Inheritance (findPreviousRunForMachine)
const dummyRecords = [
  {
    date: '2026-09-17',
    machineId: 'L-01',
    description: 'PVC Pipe 110x5.3mm Class 4',
    operatingHours: 24,
    productionQty: 600,
    unitWeight: 2.65,
    actualRateKgH: 220
  },
  {
    date: '2026-09-18',
    machineId: 'L-01',
    description: 'HDPE 20 MM Code 930',
    operatingHours: 20,
    productionQty: 1200,
    unitWeight: 0.15,
    actualRateKgH: 240
  },
  {
    date: '2026-09-19',
    machineId: 'L-01',
    description: 'HDPE 20 MM Code 930',
    operatingHours: 0, // Shutdown / Inactive
    productionQty: 0,
    unitWeight: 0.15,
    actualRateKgH: 0
  }
];

// Target date: 2026-09-19 -> immediately preceding operational run is 2026-09-18
const prevRun = findPreviousRunForMachine(dummyRecords, 'L-01', '2026-09-19');
assert.ok(prevRun);
assert.equal(prevRun.date, '2026-09-18');
assert.equal(prevRun.description, 'HDPE 20 MM Code 930');
console.log('Previous operational run auto-inheritance: OK');

// 9. Machine Specs Extraction & Target Pieces/h Calculation
const extracted = extractMachineSpecsFromRun(prevRun, 'L-01');
assert.equal(extracted.machineId, 'L-01');
assert.equal(extracted.productDescription, 'HDPE 20 MM Code 930');
assert.equal(extracted.pipeLength, 6.0);
assert.ok(extracted.speed > 0);
assert.equal(extracted.calculatedRate, Math.round((extracted.speed * 60) / extracted.pipeLength));
assert.equal(extracted.previousRunDate, '2026-09-18');
console.log('Machine specs extraction and target rate formula: OK');

// 10. Product Changeover Benchmark Recalculation
const newBench = calculateBenchmarkSpeedForProduct(
  { unitWeight: 2.65 },
  'L-01',
  undefined,
  6.0
);
assert.ok(newBench.speed > 0);
assert.equal(newBench.calculatedRate, Math.round((newBench.speed * 60) / 6.0));
console.log('Product changeover benchmark recalculation: OK');

// 11. Product Catalog Collection
const catalog = getAvailableProductsCatalog(dummyRecords);
assert.ok(catalog.length >= 10);
assert.ok(catalog.some((p) => p.description === 'HDPE 20 MM Code 930'));
assert.ok(catalog.some((p) => p.description === 'PVC Pipe 110x5.3mm Class 4'));
console.log('Product catalog collection: OK');

// 12. Intelligent Morning Blank SOP Model Generation
const morningModel = buildMorningSopModel({
  lineId: 'L-01',
  date: '2026-09-19',
  productDescription: 'HDPE 20 MM Code 930',
  speed: 12.5,
  pipeLength: 6.0
});

assert.equal(morningModel.docCode, 'DOC-Ext.-03');
assert.equal(morningModel.version, '3');
assert.equal(morningModel.isBlank, true);
assert.equal(morningModel.isMorningSop, true);
assert.equal(morningModel.dateDots, '19.09.2026');
assert.equal(morningModel.dateSpaces, '19 9 2026');
assert.equal(morningModel.productDescription, 'HDPE 20 MM Code 930');
assert.equal(morningModel.speed1, 12.5);
assert.equal(morningModel.speed2, 12.5);
assert.equal(morningModel.hourlyStdRate, 125); // (12.5 * 60) / 6.0 = 125

// Verify hourly rows: stdPcs is populated, all others are blank strings
assert.equal(morningModel.shift1Rows.length, 12);
assert.equal(morningModel.shift2Rows.length, 12);
for (const r of morningModel.shift1Rows) {
  assert.equal(r.stdPcs, 125);
  assert.equal(r.goodPcs, '');
  assert.equal(r.cause, '');
  assert.equal(r.downtime, '');
  assert.equal(r.rejectKg, '');
}
for (const r of morningModel.shift2Rows) {
  assert.equal(r.stdPcs, 125);
  assert.equal(r.goodPcs, '');
  assert.equal(r.cause, '');
  assert.equal(r.downtime, '');
  assert.equal(r.rejectKg, '');
}

// Verify summary cards are blank for on-floor recording
assert.equal(morningModel.s1TotalGoodPcs, '');
assert.equal(morningModel.s1TotalScrapKg, '');
assert.equal(morningModel.s2TotalGoodPcs, '');
assert.equal(morningModel.s2TotalScrapKg, '');
console.log('Intelligent Morning Blank SOP model generation: OK');

// 13. Product Code Integrity & Dual Auto-Resolution
assert.equal(extractEmbeddedItemCode('HDPE 20 MM Code 930'), '930');
assert.equal(extractEmbeddedItemCode('PVC PIPE Item: 249'), '249');
assert.equal(extractEmbeddedItemCode('PVC Pipe 110x5.3mm'), '');

// Explicit Product Code in Morning SOP Model
const codeBoundModel = buildMorningSopModel({
  lineId: 'L-01',
  itemCode: '249',
  productDescription: 'uPVC PIPE 110x5.3 PN-12.5 SASO-ISO 1452-2',
  date: '2026-09-20',
  speed: 15.0,
  pipeLength: 6.0
});

assert.equal(codeBoundModel.itemCode, '249');
assert.equal(codeBoundModel.productDescription, 'uPVC PIPE 110x5.3 PN-12.5 SASO-ISO 1452-2');
assert.equal(codeBoundModel.displayProduct, '[249] - uPVC PIPE 110x5.3 PN-12.5 SASO-ISO 1452-2');
assert.equal(codeBoundModel.lineId, 'L-01 - KTS 550');
assert.equal(codeBoundModel.hourlyStdRate, 150); // (15 * 60) / 6.0 = 150
assert.equal(codeBoundModel.shift1Rows[0].stdPcs, 150);
console.log('Product Code binding & [Code] - [Description] header formatting: OK');

console.log('All Legacy SOP Helper unit tests passed successfully!');

