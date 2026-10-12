import assert from 'node:assert/strict';
import {
  findLatestProductionDate,
  normalizeMachineLine,
  extractLatestDateOperationalLines,
  saveLatestExcelLoggedRun,
  loadLatestExcelLoggedRun,
  clearLatestExcelLoggedRun,
  getNextDay,
  getPreviousDay
} from '../../src/logic/excelLogParser.js';
import { MACHINES } from '../../src/config/machines.js';
import { buildMorningSopModel } from '../../src/logic/legacySopHelper.js';

console.log('--- Starting Excel Daily Production Log Parser & Morning SOP Integration Tests ---');

// Test 1: Date Navigation Helpers
assert.equal(getNextDay('2026-10-10'), '2026-10-11');
assert.equal(getPreviousDay('2026-10-11'), '2026-10-10');
assert.equal(getNextDay('2026-12-31'), '2027-01-01');
assert.equal(getPreviousDay('2026-01-01'), '2025-12-31');
console.log('Test 1 Passed: Date navigation helpers (getNextDay / getPreviousDay) verified.');

// Test 2: findLatestProductionDate across diverse formats and total row exclusion
const testRowsWithDates = [
  { date: '2026-10-08', machine: 'KTS-170' },
  { date: '10/09/2026', machine: 'KTS-200' },
  { date: '2026-10-10', machine: 'KTS-700' },
  { date: 'Total', machine: '' },
  { date: 'Grand Total', machine: '' },
  { date: '2026-10-09', machine: 'KABRA-90' }
];
const latestDate = findLatestProductionDate(testRowsWithDates);
assert.equal(latestDate, '2026-10-10', 'Should detect latest valid calendar date and ignore totals');
console.log('Test 2 Passed: findLatestProductionDate correctly identified latest calendar date.');

// Test 3: Machine Line Normalization
const m1 = normalizeMachineLine('KTS-170', MACHINES);
assert.equal(m1.lineId, 'L-02');
assert.equal(m1.isPelletizingLine, false);

const m2 = normalizeMachineLine('KABRA-90', MACHINES);
assert.equal(m2.lineId, 'L-03');

const m3 = normalizeMachineLine('KTS-250 TDH', MACHINES);
assert.equal(m3.lineId, 'L-07');

const m4 = normalizeMachineLine('KTS-700', MACHINES);
assert.equal(m4.lineId, 'L-06');

const m5 = normalizeMachineLine('KTS-550', MACHINES);
assert.equal(m5.lineId, 'L-08');
assert.equal(m5.isPelletizingLine, true);
console.log('Test 3 Passed: Machine Line Normalization mapped all canonical lines accurately.');

// Test 4: extractLatestDateOperationalLines filters for latest date and extracts Column B Item Code
const mockWorkbookRows = [
  // Older date rows (2026-10-09)
  { date: '2026-10-09', itemCode: '100000000001', description: 'PVC PIPE 50MM', machineRaw: 'KTS-170', operatingHours: 24, productionQty: 300, unitWeight: 1.2 },
  { date: '2026-10-09', itemCode: '100000000002', description: 'PVC PIPE 110MM', machineRaw: 'KTS-200', operatingHours: 24, productionQty: 250, unitWeight: 3.5 },
  // Latest date rows (2026-10-10)
  { date: '2026-10-10', itemCode: '200000000050', description: 'PVC PIPE 110MM CLASS 4', machineRaw: 'KTS-170', operatingHours: 24, productionQty: 280, unitWeight: 5.62 },
  { date: '2026-10-10', itemCode: '200000000090', description: 'PVC PIPE 200MM CLASS 3', machineRaw: 'KABRA-90', operatingHours: 24, productionQty: 180, unitWeight: 12.4 },
  { date: '2026-10-10', itemCode: '200000000315', description: 'PVC PIPE 315MM CLASS 5', machineRaw: 'KTS-700', operatingHours: 18, productionQty: 90, unitWeight: 38.5 },
  // Compounding line on latest date
  { date: '2026-10-10', itemCode: 'COMP-01', description: 'PVC COMPOUND DRY BLEND GREY', machineRaw: 'KTS-550', operatingHours: 24, productionQty: 9600, unitWeight: 25.0 }
];

const extracted = extractLatestDateOperationalLines(mockWorkbookRows, null, MACHINES);
assert.equal(extracted.latestDate, '2026-10-10');
assert.equal(extracted.count, 4);

// Check L-02 (KTS-170)
const l02 = extracted.lineMap['L-02'];
assert.ok(l02, 'L-02 must be extracted');
assert.equal(l02.itemCode, '200000000050', 'Col B item code must be extracted');
assert.equal(l02.description, 'PVC PIPE 110MM CLASS 4');
assert.equal(l02.unitWeight, 5.62);
assert.equal(l02.pipeLength, 6.0);
assert.equal(l02.actualRatePcsH, 11.7); // 280 / 24 = 11.666 -> 11.7
assert.equal(l02.isOperating, true);

// Check L-03 (KABRA-90)
const l03 = extracted.lineMap['L-03'];
assert.ok(l03);
assert.equal(l03.itemCode, '200000000090');
assert.equal(l03.unitWeight, 12.4);

// Check L-08 (Compounding)
const l08 = extracted.lineMap['L-08'];
assert.ok(l08);
assert.equal(l08.isCompounding, true);
assert.equal(l08.unitWeight, 25.0);
assert.equal(l08.pipeLength, 0);

console.log('Test 4 Passed: Operational lines and Column B item codes extracted for latest date.');

// Test 5: Storage Caching & In-Memory Retrieval
clearLatestExcelLoggedRun();
assert.equal(loadLatestExcelLoggedRun(), null);

saveLatestExcelLoggedRun({
  latestDate: '2026-10-10',
  lines: extracted.lines,
  lineMap: extracted.lineMap
});

const cached = loadLatestExcelLoggedRun();
assert.ok(cached);
assert.equal(cached.latestDate, '2026-10-10');
assert.equal(cached.lines.length, 4);
assert.equal(cached.lineMap['L-02'].itemCode, '200000000050');
console.log('Test 5 Passed: Storage caching and fallback retrieval verified.');

// Test 6: Option B Morning Blank SOP Pre-population Logic
// Simulate building linesState in PrintSopModal using activeMaster and cached latest run
const activeMaster = MACHINES;
const shiftTargetDate = getNextDay(cached.latestDate); // '2026-10-11'
const shiftPreviousDate = getPreviousDay(shiftTargetDate); // '2026-10-10'

const linesState = activeMaster.map((m) => {
  const lineId = m.id;
  const excelLine = cached.lineMap[lineId];
  const hasExcelRun = Boolean(excelLine && excelLine.isOperating);

  return {
    machineId: lineId,
    fullMachineName: excelLine?.fullMachineName || m.name,
    isSelected: hasExcelRun, // Pre-checked if active on latest date, unchecked if stopped!
    hadRunOnLatest: hasExcelRun,
    itemCode: excelLine?.itemCode || '',
    productDescription: excelLine?.description || '',
    pipeLength: excelLine?.isCompounding ? 0 : 6.0,
    unitWeight: excelLine?.unitWeight || '',
    calculatedRate: excelLine?.actualRatePcsH || 100,
    isCompounding: Boolean(excelLine?.isCompounding)
  };
});

// Verify active lines (L-02, L-03, L-06, L-08) are pre-checked
const selectedLines = linesState.filter((l) => l.isSelected);
assert.equal(selectedLines.length, 4, '4 active lines must be pre-checked');
assert.ok(selectedLines.some((l) => l.machineId === 'L-02'));
assert.ok(selectedLines.some((l) => l.machineId === 'L-03'));
assert.ok(selectedLines.some((l) => l.machineId === 'L-06'));
assert.ok(selectedLines.some((l) => l.machineId === 'L-08'));

// Verify inactive lines (e.g. L-01, L-04, L-05, L-07) are unchecked
const unselectedLines = linesState.filter((l) => !l.isSelected);
assert.ok(unselectedLines.some((l) => l.machineId === 'L-01'));
assert.ok(unselectedLines.some((l) => l.machineId === 'L-07'));
console.log('Test 6 Passed: Active lines pre-checked and idle lines unchecked in Option B batch mode.');

// Test 7: 85% Efficiency Benchmark for Printed Morning Blank SOP
// Real expected pace is 85 pcs/h -> printed sheet cumulative target increments by Math.round(85 / 0.85) = 100 pcs/h
const sopModel = buildMorningSopModel({
  lineId: 'L-02',
  date: shiftTargetDate,
  itemCode: '200000000050',
  productDescription: 'PVC PIPE 110MM CLASS 4',
  unitWeight: 5.62,
  pipeLength: 6.0,
  targetPcsH: 85, // Real expected pace
  cumulative: true
});

assert.equal(sopModel.shift1Rows.length, 12);
assert.equal(sopModel.shift2Rows.length, 12);

// Standard hourly target inflated to 85% benchmark: 85 / 0.85 = 100
assert.equal(sopModel.shift1Rows[0].stdPcs, 100, 'Hour 1 cumulative standard piece target must be 100');
assert.equal(sopModel.shift1Rows[1].stdPcs, 200, 'Hour 2 cumulative standard piece target must be 200');
assert.equal(sopModel.shift1Rows[2].stdPcs, 300, 'Hour 3 cumulative standard piece target must be 300');
assert.equal(sopModel.shift1Rows[11].stdPcs, 1200, 'Hour 12 cumulative standard piece target must be 1200');

assert.equal(sopModel.shift2Rows[0].stdPcs, 1300, 'Hour 13 cumulative standard piece target must be 1300');
assert.equal(sopModel.shift2Rows[11].stdPcs, 2400, 'Hour 24 cumulative standard piece target must be 2400');
console.log('Test 7 Passed: 85% target inflation benchmark correctly applied to printed cumulative target.');

console.log('--- ALL EXCEL LOG PARSER & MORNING SOP UNIT TESTS PASSED (7/7) ---');
