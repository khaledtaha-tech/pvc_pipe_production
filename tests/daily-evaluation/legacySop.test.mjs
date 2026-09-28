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
  findExactDayRunForMachine,
  getPreviousDay,
  extractMachineSpecsFromRun,
  getAvailableProductsCatalog,
  calculateBenchmarkSpeedForProduct,
  buildMorningSopModel,
  buildUniversalBlankSopModel,
  resolveProductSpecification,
  isCompoundingLineOrProduct,
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

// 5. Model Building with Benchmark Report (Cumulative Standard Production in Pieces)
const benchmark = getBenchmarkReport();
const derived = buildAll(benchmark.slots, benchmark.refs, benchmark.summary.startCounter);
const model = buildSopModel(benchmark, derived);

assert.equal(model.docCode, 'DOC-Ext.-03');
assert.equal(model.version, '04');
assert.equal(model.plantName, 'AL MANAR PIPES FACTORY');
assert.equal(model.reportTitle, 'PVC PIPE EXTRUSION DAILY MONITORING REPORT');
assert.equal(model.reportSubtitle, 'Production Execution & Quality Follow-Up');
assert.equal(model.fullMachineName, 'L-03 - KTS 700');
assert.equal(model.lineId, 'L-03 - KTS 700');
assert.equal(model.shift1Rows.length, 12);
assert.equal(model.shift2Rows.length, 12);

// Decoupled nominal capacity standard rate in pieces verification:
// Shift 1: L-03 Capacity 500 kg/h / stdWeight 3.2 kg/pc = 156.25 -> 156 pcs/h
// Hour 1: 156, Hour 2: 312, Hour 12: 1872
assert.equal(model.shift1Rows[0].stdPcs, 156);
assert.equal(model.shift1Rows[1].stdPcs, 312);
assert.equal(model.shift1Rows[11].stdPcs, 1872);
assert.equal(model.shift1Rows[0].stdM, 156); // Backward compatibility alias

// Shift 2: L-03 Capacity 500 kg/h / stdWeight 6.4 kg/pc = 78.125 -> 78 pcs/h
// Hour 13: 1872 + 78 = 1950, Hour 24: 1872 + 12 * 78 = 2808
assert.equal(model.shift2Rows[0].stdPcs, 1950);
assert.equal(model.shift2Rows[11].stdPcs, 2808);
assert.equal(model.shift2Rows[0].stdM, 1950);

// Explicit non-cumulative override verification
const flatModel = buildSopModel(benchmark, derived, { cumulative: false });
assert.equal(flatModel.shift1Rows[0].stdPcs, 156);
assert.equal(flatModel.shift1Rows[11].stdPcs, 156);
assert.equal(flatModel.shift2Rows[0].stdPcs, 78);
assert.equal(flatModel.shift2Rows[11].stdPcs, 78);

// Fallback verification when stdWeight is missing: (speed * 60) / pipeLength
const fallbackReport = {
  ...benchmark,
  refs: {
    1: { ...benchmark.refs['1'], stdWeight: 0, speed: 15, pipeLength: 6.0 },
    2: { ...benchmark.refs['2'], stdWeight: 0, speed: 12, pipeLength: 6.0 }
  }
};
assert.equal(computeStandardHourlyPieces(fallbackReport, fallbackReport.refs['1']), 150);
assert.equal(computeStandardHourlyPieces(fallbackReport, fallbackReport.refs['2']), 120);

// Secondary priority verification: explicit targetRate overrides speed fallback
const targetRateReport = {
  ...benchmark,
  refs: {
    1: { ...benchmark.refs['1'], stdWeight: 0, targetRate: 175, speed: 15 }
  }
};
assert.equal(computeStandardHourlyPieces(targetRateReport, targetRateReport.refs['1']), 175);

// Both Actual and Standard are present side-by-side in filled view
assert.ok(model.shift1Rows[0].goodPcs !== undefined);
assert.ok(model.s1TotalGoodPcs >= 0);
assert.equal(model.s1TotalGoodM, model.s1TotalGoodPcs);
console.log('Model generation with decoupled standard pieces rate (Filled View): OK');

// 6. Blank SOP Template Model Building (DOC-Ext.-03)
const blankModel = buildBlankSopModel({ standardRate: 20 });
assert.equal(blankModel.docCode, 'DOC-Ext.-03');
assert.equal(blankModel.version, '04');
assert.equal(blankModel.plantName, 'AL MANAR PIPES FACTORY');
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

// Hourly columns cleared for manual recording in blank mode, while stdPcs has progressive cumulative values
blankModel.shift1Rows.forEach((r, idx) => {
  assert.equal(r.stdPcs, 20 * (idx + 1));
  assert.equal(r.goodPcs, '');
  assert.equal(r.goodM, '');
  assert.equal(r.cause, '');
  assert.equal(r.downtime, '');
  assert.equal(r.rejectKg, '');
});
blankModel.shift2Rows.forEach((r, idx) => {
  assert.equal(r.stdPcs, 20 * (idx + 13));
  assert.equal(r.goodPcs, '');
  assert.equal(r.goodM, '');
  assert.equal(r.cause, '');
  assert.equal(r.downtime, '');
  assert.equal(r.rejectKg, '');
});
console.log('Blank SOP Template (DOC-Ext.-03) model generation: OK');

// 7. Pre-filled Calculated Hourly Standard Production in Pieces (Explicit or Blank Fallback)
const blankWithRate = buildBlankSopModel({ standardRate: 100 });
assert.equal(blankWithRate.shift1Rows.length, 12);
assert.equal(blankWithRate.shift2Rows.length, 12);
assert.equal(blankWithRate.shift1Rows[0].stdPcs, 100);
assert.equal(blankWithRate.shift1Rows[11].stdPcs, 1200);
assert.equal(blankWithRate.shift2Rows[0].stdPcs, 1300);
assert.equal(blankWithRate.shift2Rows[11].stdPcs, 2400);

const blankDefault = buildBlankSopModel();
assert.equal(blankDefault.shift1Rows[0].stdPcs, '');
assert.equal(blankDefault.shift1Rows[11].stdPcs, '');
assert.equal(blankDefault.shift2Rows[0].stdPcs, '');
assert.equal(blankDefault.shift2Rows[11].stdPcs, '');
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
assert.equal(morningModel.version, '04');
assert.equal(morningModel.plantName, 'AL MANAR PIPES FACTORY');
assert.equal(morningModel.reportTitle, 'PVC PIPE EXTRUSION DAILY MONITORING REPORT');
assert.equal(morningModel.reportSubtitle, 'Production Execution & Quality Follow-Up');
assert.equal(morningModel.isBlank, true);
assert.equal(morningModel.isMorningSop, true);
assert.equal(morningModel.dateDots, '19.09.2026');
assert.equal(morningModel.dateSpaces, '19 9 2026');
assert.equal(morningModel.productDescription, 'HDPE 20 MM Code 930');
assert.equal(morningModel.speed1, 12.5);
assert.equal(morningModel.speed2, 12.5);
assert.equal(morningModel.hourlyStdRate, 125); // (12.5 * 60) / 6.0 = 125

// Verify hourly rows: stdPcs is progressive cumulative, all others are blank strings
assert.equal(morningModel.shift1Rows.length, 12);
assert.equal(morningModel.shift2Rows.length, 12);
morningModel.shift1Rows.forEach((r, idx) => {
  assert.equal(r.stdPcs, 125 * (idx + 1));
  assert.equal(r.goodPcs, '');
  assert.equal(r.cause, '');
  assert.equal(r.downtime, '');
  assert.equal(r.rejectKg, '');
});
morningModel.shift2Rows.forEach((r, idx) => {
  assert.equal(r.stdPcs, 125 * (idx + 13));
  assert.equal(r.goodPcs, '');
  assert.equal(r.cause, '');
  assert.equal(r.downtime, '');
  assert.equal(r.rejectKg, '');
});

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

// 14. Output Rate (kg/h), Nominal Capacity & Capacity Utilization Logic (DOC-Ext.-03)
assert.equal(extracted.nominalCapacity, 400); // L-01 KTS 550 nominal capacity
assert.equal(extracted.calculatedRateKgH, Math.round(extracted.calculatedRate * extracted.unitWeight));

const sopModelKgh = buildMorningSopModel({
  lineId: 'L-01',
  itemCode: '249',
  productDescription: 'uPVC PIPE 110x5.3 PN-12.5 SASO-ISO 1452-2',
  date: '2026-09-20',
  speed: 15.0,
  pipeLength: 6.0,
  unitWeight: 2.65,
  nominalCapacity: 400
});

// Hourly Std Rate: (15 * 60) / 6.0 = 150 pcs/h
assert.equal(sopModelKgh.hourlyStdRate, 150);
// Calculated Output Rate (kg/h): 150 pcs/h * 2.65 kg/pc = 398 kg/h
assert.equal(sopModelKgh.calculatedRateKgH, 398);
assert.equal(sopModelKgh.nominalCapacity, 400);
// Utilization: Math.round((398 / 400) * 100) = 100%
assert.equal(sopModelKgh.utilizationPct, 100);

// Live recomputation test: speed change
const speedChangedModel = buildMorningSopModel({
  lineId: 'L-01',
  itemCode: '249',
  productDescription: 'uPVC PIPE 110x5.3 PN-12.5 SASO-ISO 1452-2',
  date: '2026-09-20',
  speed: 12.0,
  pipeLength: 6.0,
  unitWeight: 2.65,
  nominalCapacity: 400
});
// (12 * 60) / 6.0 = 120 pcs/h -> 120 * 2.65 = 318 kg/h -> 318 / 400 = 80%
assert.equal(speedChangedModel.hourlyStdRate, 120);
assert.equal(speedChangedModel.calculatedRateKgH, 318);
assert.equal(speedChangedModel.utilizationPct, 80);

// Live recomputation test: cut length change
const lengthChangedModel = buildMorningSopModel({
  lineId: 'L-01',
  itemCode: '249',
  productDescription: 'uPVC PIPE 110x5.3 PN-12.5 SASO-ISO 1452-2',
  date: '2026-09-20',
  speed: 15.0,
  pipeLength: 5.0,
  unitWeight: 2.65,
  nominalCapacity: 400
});
// (15 * 60) / 5.0 = 180 pcs/h -> 180 * 2.65 = 477 kg/h -> 477 / 400 = 119%
assert.equal(lengthChangedModel.hourlyStdRate, 180);
assert.equal(lengthChangedModel.calculatedRateKgH, 477);
assert.equal(lengthChangedModel.utilizationPct, 119);

// Live recomputation test: product spec change (unitWeight change)
const specChangedModel = buildMorningSopModel({
  lineId: 'L-01',
  itemCode: '930',
  productDescription: 'HDPE 20 MM Code 930',
  date: '2026-09-20',
  speed: 10.0,
  pipeLength: 6.0,
  unitWeight: 0.15,
  nominalCapacity: 400
});
// (10 * 60) / 6.0 = 100 pcs/h -> 100 * 0.15 = 15 kg/h -> 15 / 400 = 4%
assert.equal(specChangedModel.hourlyStdRate, 100);
assert.equal(specChangedModel.calculatedRateKgH, 15);
assert.equal(specChangedModel.utilizationPct, 4);
console.log('Output rate (kg/h), nominal capacity, and live utilization recomputation: OK');

// 15. Cumulative Progressive Target Formula across all 24 slots (DOC-Ext.-03)
// Formula: Cumulative Target = Hourly Standard Target * i (i from 1 to 24)
// (e.g. if hourly standard is 400 pcs/hr: Hour 1 = 400, Hour 2 = 800, Hour 3 = 1200, ..., Hour 24 = 9600)
const sopCumulative400 = buildMorningSopModel({
  lineId: 'L-01',
  itemCode: '400',
  productDescription: 'Standard 400 pcs/h Target Test',
  date: '2026-09-27',
  speed: 40.0,
  pipeLength: 6.0, // (40 * 60) / 6.0 = 400 pcs/h
  unitWeight: 1.0,
  nominalCapacity: 500
});

assert.equal(sopCumulative400.hourlyStdRate, 400);
assert.equal(sopCumulative400.isCumulative, true);
assert.equal(sopCumulative400.shift1Rows.length, 12);
assert.equal(sopCumulative400.shift2Rows.length, 12);

// Shift 1: slots 1 to 12
for (let i = 1; i <= 12; i++) {
  assert.equal(sopCumulative400.shift1Rows[i - 1].stdPcs, 400 * i, `Slot ${i} must equal ${400 * i}`);
}
assert.equal(sopCumulative400.shift1Rows[0].stdPcs, 400);
assert.equal(sopCumulative400.shift1Rows[1].stdPcs, 800);
assert.equal(sopCumulative400.shift1Rows[2].stdPcs, 1200);
assert.equal(sopCumulative400.shift1Rows[11].stdPcs, 4800);

// Shift 2: slots 13 to 24
for (let i = 13; i <= 24; i++) {
  assert.equal(sopCumulative400.shift2Rows[i - 13].stdPcs, 400 * i, `Slot ${i} must equal ${400 * i}`);
}
assert.equal(sopCumulative400.shift2Rows[0].stdPcs, 5200);
assert.equal(sopCumulative400.shift2Rows[11].stdPcs, 9600);
console.log('Cumulative progressive target formula across hours 1 to 24: OK');
 
// 16. Idle Line Handling & Blank Pen Entry Fallbacks (DOC-Ext.-03)
const idleSpecs = extractMachineSpecsFromRun(null, 'L-04');
assert.equal(idleSpecs.machineId, 'L-04');
assert.equal(idleSpecs.isIdle, true);
assert.equal(idleSpecs.productDescription, '');
assert.equal(idleSpecs.itemCode, '');
assert.equal(idleSpecs.speed, '');
assert.equal(idleSpecs.calculatedRate, '');
assert.equal(idleSpecs.calculatedRateKgH, '');

const idleMorningModel = buildMorningSopModel({
  lineId: 'L-04',
  date: '2026-09-20',
  isIdle: true
});
assert.equal(idleMorningModel.version, '04');
assert.equal(idleMorningModel.isIdle, true);
assert.equal(idleMorningModel.productDescription, '');
assert.equal(idleMorningModel.speed1, '');
assert.equal(idleMorningModel.speed2, '');
assert.equal(idleMorningModel.shift1Rows.length, 12);
assert.equal(idleMorningModel.shift2Rows.length, 12);
idleMorningModel.shift1Rows.forEach((r) => {
  assert.equal(r.stdPcs, '', 'Idle shift 1 row must be empty string');
});
idleMorningModel.shift2Rows.forEach((r) => {
  assert.equal(r.stdPcs, '', 'Idle shift 2 row must be empty string');
});
console.log('Idle/stopped machine line blank handling: OK');

// 17. Immediate Previous Day Operating Lines Logic (getPreviousDay & findExactDayRunForMachine)
// A. Date calculation tests
assert.equal(getPreviousDay('2026-09-08'), '2026-09-07');
assert.equal(getPreviousDay('2026-09-01'), '2026-08-31'); // Month boundary
assert.equal(getPreviousDay('2026-01-01'), '2025-12-31'); // Year boundary
assert.equal(getPreviousDay('2024-03-01'), '2024-02-29'); // Leap year
assert.equal(getPreviousDay('2023-03-01'), '2023-02-28'); // Non-leap year
assert.equal(getPreviousDay(''), '');
assert.equal(getPreviousDay(null), '');

// B. Strict Previous Day Machine Run Lookup
const multiDayRecords = [
  {
    date: '2026-09-06',
    machineId: 'L-01',
    description: 'Day 6 Product',
    operatingHours: 20,
    productionQty: 1000
  },
  {
    date: '2026-09-07',
    machineId: 'L-01',
    description: 'uPVC PIPE 110x5.3 PN-12.5 SASO-ISO 1452-2',
    itemCode: '249',
    operatingHours: 22,
    productionQty: 850,
    unitWeight: 2.65,
    actualRateKgH: 210
  },
  {
    date: '2026-09-07',
    machineId: 'L-02',
    description: 'Idle Line Test',
    operatingHours: 0,
    productionQty: 0,
    actualRateKgH: 0
  }
];

// Target date: 2026-09-08 -> Previous date: 2026-09-07
const prevDateTarget = getPreviousDay('2026-09-08');
assert.equal(prevDateTarget, '2026-09-07');

// L-01 was active on 2026-09-07 -> must return operational record
const exactRunL1 = findExactDayRunForMachine(multiDayRecords, 'L-01', prevDateTarget);
assert.ok(exactRunL1, 'Active line on previous day must return record');
assert.equal(exactRunL1.itemCode, '249');
assert.equal(exactRunL1.productionQty, 850);

// L-02 was stopped (0 hours, 0 qty) on 2026-09-07 -> must return null
const exactRunL2 = findExactDayRunForMachine(multiDayRecords, 'L-02', prevDateTarget);
assert.equal(exactRunL2, null, 'Idle/stopped machine on previous day must return null');

// L-03 had no records on 2026-09-07 -> must return null (strict, no older fallback)
const exactRunL3 = findExactDayRunForMachine(multiDayRecords, 'L-03', prevDateTarget);
assert.equal(exactRunL3, null, 'Machine with no record on previous day must return null');

// Specifications extraction from exact previous day run vs null
const specsL1 = extractMachineSpecsFromRun(exactRunL1, 'L-01');
assert.equal(specsL1.itemCode, '249');
assert.equal(specsL1.isIdle, undefined);
assert.ok(specsL1.speed > 0);
assert.ok(specsL1.calculatedRate > 0);

const specsL2 = extractMachineSpecsFromRun(exactRunL2, 'L-02');
assert.equal(specsL2.isIdle, true);
assert.equal(specsL2.itemCode, '');
assert.equal(specsL2.productDescription, '');
assert.equal(specsL2.speed, '');
assert.equal(specsL2.calculatedRate, '');

console.log('Immediate Previous Day operational filter & strict inheritance: OK');

// 18. Shift Summary Metrics & Operational Field Bindings (DOC-Ext.-03)
assert.ok(model.pipeLength > 0, 'pipeLength should be bound');
assert.ok(model.unitWeight > 0, 'unitWeight should be bound');
assert.ok(model.speed !== '', 'speed should be bound');
assert.ok(typeof model.s1TotalWeightKg === 'number' || model.s1TotalWeightKg === '', 's1TotalWeightKg should be valid');
assert.ok(typeof model.s1ScrapPct === 'string', 's1ScrapPct should be a string');
assert.ok(typeof model.s1DowntimeMin === 'number', 's1DowntimeMin should be a number');
assert.ok(typeof model.s1Efficiency === 'string', 's1Efficiency should be a string');
assert.ok(typeof model.s2TotalWeightKg === 'number' || model.s2TotalWeightKg === '', 's2TotalWeightKg should be valid');
assert.ok(typeof model.s2ScrapPct === 'string', 's2ScrapPct should be a string');
assert.ok(typeof model.s2DowntimeMin === 'number', 's2DowntimeMin should be a number');
assert.ok(typeof model.s2Efficiency === 'string', 's2Efficiency should be a string');

// Em-dash product display verification
const renderedDisplay = (codeBoundModel.displayProduct || '').replace(/\s+-\s+/, ' — ');
assert.ok(renderedDisplay.includes('—'), 'Product display should support em-dash separation');

// Test blank template fallback behavior
const universalBlankModel = buildUniversalBlankSopModel();
assert.equal(universalBlankModel.s1TotalWeightKg, '');
assert.equal(universalBlankModel.s1ScrapPct, '');
assert.equal(universalBlankModel.s1DowntimeMin, '');
assert.equal(universalBlankModel.s1Efficiency, '');
assert.equal(universalBlankModel.s2TotalWeightKg, '');
assert.equal(universalBlankModel.s2ScrapPct, '');
assert.equal(universalBlankModel.s2DowntimeMin, '');
assert.equal(universalBlankModel.s2Efficiency, '');
assert.equal(universalBlankModel.speed, '');

console.log('Shift Summary metrics & operational fields: OK');

// 19. Product Specification Resolution across Aliases
assert.equal(resolveProductSpecification({ itemDescription: 'PIPE 110mm' }), 'PIPE 110mm');
assert.equal(resolveProductSpecification({ description: 'PIPE 160mm' }), 'PIPE 160mm');
assert.equal(resolveProductSpecification({ productDescription: 'PIPE 200mm' }), 'PIPE 200mm');
assert.equal(resolveProductSpecification({ productSpec: 'PIPE 250mm' }), 'PIPE 250mm');
assert.equal(resolveProductSpecification({ spec: 'PIPE 315mm' }), 'PIPE 315mm');
assert.equal(resolveProductSpecification({ itemName: 'PIPE 400mm' }), 'PIPE 400mm');
assert.equal(resolveProductSpecification({ ref1Spec: 'PIPE 500mm' }), 'PIPE 500mm');
assert.equal(resolveProductSpecification({ pipeSpec: 'PIPE 630mm' }), 'PIPE 630mm');
assert.equal(resolveProductSpecification({}, 'FALLBACK'), 'FALLBACK');
console.log('Product specification alias resolution: OK');

// 20. Compounding Line & Product Detection
assert.equal(isCompoundingLineOrProduct({ lineId: 'L-01' }), true);
assert.equal(isCompoundingLineOrProduct({ fullMachineName: 'L-01 - KTS 550' }), true);
assert.equal(isCompoundingLineOrProduct({ itemCode: 'COMP-01' }), true);
assert.equal(isCompoundingLineOrProduct({ description: 'PVC COMPOUND DRY BLEND' }), true);
assert.equal(isCompoundingLineOrProduct({ description: 'PELLETIZING COMPOUND BLACK' }), true);
assert.equal(isCompoundingLineOrProduct({ lineId: 'L-03', description: 'uPVC PIPE 110x5.3 PN-12.5' }), false);
console.log('Compounding line & product detection: OK');

// 21. Compounding Morning SOP Sheet Model
const compoundMorningModel = buildMorningSopModel({
  lineId: 'L-01',
  itemCode: 'COMP-01',
  productSpec: 'PVC COMPOUND DRY BLEND GREY (25KG)',
  date: '2026-09-28'
});
assert.equal(compoundMorningModel.isCompounding, true);
assert.equal(compoundMorningModel.reportTitle, 'PVC COMPOUND / PELLETIZING DAILY MONITORING REPORT');
assert.equal(compoundMorningModel.reportSubtitle, 'Compounding Execution & Quality Follow-Up');
assert.equal(compoundMorningModel.targetCapacity, 400);
assert.equal(compoundMorningModel.bagPackaging, '25 Kg / Bag');
assert.equal(compoundMorningModel.hourlyStdRate, 400);
assert.equal(compoundMorningModel.pipeLength, 0);
assert.equal(compoundMorningModel.speed, '');
assert.ok(!compoundMorningModel.productDescription.includes('---'), 'Should not render placeholder dashes');
assert.equal(compoundMorningModel.productDescription, 'PVC COMPOUND DRY BLEND GREY (25KG)');
console.log('Compounding Morning SOP Sheet Model: OK');

console.log('All Legacy SOP Helper unit tests passed successfully!');


