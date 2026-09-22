import assert from 'assert';
import * as XLSX from 'xlsx';
import { 
  generateConsolidatedExcelWorkbook, 
  buildUniqueSizingPlanningMatrix 
} from '../../src/utils/inferenceEngine.js';

console.log('--- Testing Export Deduplication Logic ---');

// 1. Create 59 actual production rows
const actualRows = [];
for (let i = 1; i <= 59; i++) {
  actualRows.push({
    id: `actual-${i}`,
    rowNumber: i,
    dataSource: 'Actual Production',
    date: '2026-09-07',
    itemCode: `ACT-${100 + i}`,
    product: 'uPVC Pipe 110x5.3 PN-10',
    machine: 'KTS 350',
    material: 'uPVC',
    diameter: '110 mm',
    diameterMm: 110,
    thickness: '5.3 mm',
    lineRateKgPerHour: 220,
    nominalCapacity: 330,
    lineEfficiency: 66.7,
    sizingStatus: 'Optimal',
    totalWeight: 5280,
    qty: 500,
    operatingHours: 24,
    scrap: 20
  });
}

// 2. Create 7,408 inferred historical runs
const inferredRuns = [];
for (let i = 1; i <= 7408; i++) {
  inferredRuns.push({
    id: `erp-${i}`,
    rowNumber: i,
    dataSource: 'Inferred by Model',
    date: '2026-01-10',
    itemCode: '1140-uPVC',
    product: 'uPVC PIPE 160MM SDR-11 NWC',
    machine: 'KTS 350',
    inferredMachine: 'KTS 350',
    material: 'uPVC',
    diameter: '160 mm',
    diameterMm: 160,
    thickness: 'SDR-11',
    lineRateKgPerHour: 268,
    primaryCapacity: 330,
    primaryLoadingRatio: 81.2,
    sizingStatus: 'Inferred (Optimal Sizing & Loading)',
    totalWeight: 6432,
    qty: 960,
    operatingHours: 24,
    scrap: 0
  });
}

console.log('Initial Counts: Actual Rows =', actualRows.length, ', Inferred Runs =', inferredRuns.length);

// TEST CASE 1: Before Merge
// Calling generateConsolidatedExcelWorkbook with unmerged active rows and inferred runs
const wbBeforeMerge = generateConsolidatedExcelWorkbook(actualRows, inferredRuns, []);
const sheet1 = wbBeforeMerge.Sheets['Consolidated Production Log'];
const rowsBeforeMerge = XLSX.utils.sheet_to_json(sheet1);
console.log('Export before merge total rows:', rowsBeforeMerge.length);
assert.strictEqual(rowsBeforeMerge.length, 7467, 'Before merge should have strictly 7,467 rows');

// TEST CASE 2: After Merge
// Simulating clicking "Merge into Production Log" where inferred runs are appended to cleanedRows
const mergedCleanedRows = [
  ...actualRows,
  ...inferredRuns.map(h => ({
    ...h,
    "Data Source / Origin": "Inferred by Model",
    dataSource: "Inferred by Model"
  }))
];
console.log('Merged cleanedRows length:', mergedCleanedRows.length); // 7467

// Calling generateConsolidatedExcelWorkbook with the merged cleanedRows AND inferredRuns
const wbAfterMerge = generateConsolidatedExcelWorkbook(mergedCleanedRows, inferredRuns, []);
const sheet2 = wbAfterMerge.Sheets['Consolidated Production Log'];
const rowsAfterMerge = XLSX.utils.sheet_to_json(sheet2);
console.log('Export after merge total rows:', rowsAfterMerge.length);
assert.strictEqual(rowsAfterMerge.length, 7467, 'After merge should have strictly 7,467 rows without duplicating');

// Count origin types in exported data
const actualCount = rowsAfterMerge.filter(r => r['Data Source / Origin'] === 'Actual Production').length;
const inferredCount = rowsAfterMerge.filter(r => r['Data Source / Origin'] === 'Inferred by Model').length;
console.log('Origin Breakdown: Actual =', actualCount, ', Inferred =', inferredCount);
assert.strictEqual(actualCount, 59, 'Should have exactly 59 actual production rows');
assert.strictEqual(inferredCount, 7408, 'Should have exactly 7,408 inferred historical rows');

// TEST CASE 3: Planning Matrix Deduplication
const matrixBefore = buildUniqueSizingPlanningMatrix(actualRows, inferredRuns);
const matrixAfter = buildUniqueSizingPlanningMatrix(mergedCleanedRows, inferredRuns);
assert.strictEqual(matrixBefore.length, matrixAfter.length, 'Matrix profiles count must match before and after merge');

const hdpeProfileBefore = matrixBefore.find(m => m.odNumeric === 160);
const hdpeProfileAfter = matrixAfter.find(m => m.odNumeric === 160);
console.log('HDPE Profile Observed Runs Before Merge:', hdpeProfileBefore.totalRunsObserved);
console.log('HDPE Profile Observed Runs After Merge:', hdpeProfileAfter.totalRunsObserved);
assert.strictEqual(hdpeProfileAfter.totalRunsObserved, 7408, 'Observed runs for HDPE profile should be exactly 7,408, not doubled');

console.log('ALL DEDUPLICATION TESTS PASSED SUCCESSFULLY!');
