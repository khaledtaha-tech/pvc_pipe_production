import assert from 'assert';
import * as XLSX from 'xlsx';
import { 
  buildUnifiedMasterRuns, 
  generateMasterPlanExcelWorkbook, 
  exportMasterPlanToExcelRows,
  MASTER_COLUMNS,
  ORIGIN_ACTUAL_LOG,
  ORIGIN_ERP_LOG
} from '../../src/utils/inferenceEngine.js';

console.log('--- Testing Unified Master Extrusion & Planning Table Logic ---');

// 1. Create simulated actual production rows (59 rows)
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
    totalWeight: 5280,
    qty: 500,
    operatingHours: 24,
    scrap: 20
  });
}

// 2. Create simulated historical ERP inferred runs (7,408 rows)
const inferredRuns = [];
for (let i = 1; i <= 7408; i++) {
  inferredRuns.push({
    id: `erp-${i}`,
    rowNumber: i,
    dataSource: 'Inferred by Model',
    date: '2026-01-10',
    itemCode: `1140-${i}`,
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
    alternative1: 'Kabra 90 (K-90)',
    alternative1Capacity: 380,
    alternative2: 'KTS 700',
    alternative2Capacity: 500,
    targetRateBand: '215 - 314 kg/hr',
    expectedRateBand1: '215 - 314 kg/hr',
    expectedRateBand2: '247 - 361 kg/hr',
    expectedRateBand3: '325 - 475 kg/hr',
    totalWeight: 6432,
    qty: 960,
    operatingHours: 24,
    scrap: 0
  });
}

// TEST 1: Strict deduplication before and after merge
const masterRunsBefore = buildUnifiedMasterRuns(actualRows, inferredRuns);
console.log('Master runs before merge count:', masterRunsBefore.length);
assert.strictEqual(masterRunsBefore.length, 7467, 'Must have strictly 7,467 runs before merge');

// Simulate merging inferred runs into actual cleanedRows
const mergedCleanedRows = [
  ...actualRows,
  ...inferredRuns.map(h => ({
    ...h,
    "Data Source / Origin": "Inferred by Model",
    dataSource: "Inferred by Model"
  }))
];
const masterRunsAfter = buildUnifiedMasterRuns(mergedCleanedRows, inferredRuns);
console.log('Master runs after merge count:', masterRunsAfter.length);
assert.strictEqual(masterRunsAfter.length, 7467, 'Must strictly maintain 7,467 runs after merge without duplicate concatenation');

// TEST 2: Data Source / Origin breakdown
const actualCount = masterRunsAfter.filter(r => r[MASTER_COLUMNS.DATA_SOURCE] === ORIGIN_ACTUAL_LOG).length;
const erpCount = masterRunsAfter.filter(r => r[MASTER_COLUMNS.DATA_SOURCE] === ORIGIN_ERP_LOG).length;
console.log('Origin breakdown: Actual =', actualCount, ', ERP =', erpCount);
assert.strictEqual(actualCount, 59, 'Must have exactly 59 Actual Log rows');
assert.strictEqual(erpCount, 7408, 'Must have exactly 7,408 ERP Log rows');

// TEST 3: Column Count and Exact 18 Column Names
const expectedColumns = [
  'Date',
  'Data Source / Origin',
  'Item Code',
  'Product Description & Specs',
  'Pipe Diameter (and Metric OD mm)',
  'Wall Thickness / SDR',
  'Material (uPVC, HDPE, etc.)',
  'Production Qty (Pcs / Lengths)',
  'Total Production Weight (kg)',
  'Scrap Weight (kg)',
  'Actual Extrusion Rate (kg/hr)',
  'Current/Inferred Extruder Line',
  'Primary Proposal (\u0627\u0644\u0645\u0642\u062a\u0631\u062d \u0627\u0644\u0623\u0648\u0644)',
  'Expected Rate Band 1 (\u0627\u0644\u0645\u0639\u062f\u0644 \u0627\u0644\u0645\u062a\u0648\u0642\u0639 1 - kg/hr)',
  'Alternative Proposal 1 (\u0627\u0644\u0645\u0642\u062a\u0631\u062d \u0627\u0644\u062b\u0627\u0646\u064a)',
  'Expected Rate Band 2 (\u0627\u0644\u0645\u0639\u062f\u0644 \u0627\u0644\u0645\u062a\u0648\u0642\u0639 2 - kg/hr)',
  'Alternative Proposal 2 (\u0627\u0644\u0645\u0642\u062a\u0631\u062d \u0627\u0644\u062b\u0627\u0644\u062b)',
  'Expected Rate Band 3 (\u0627\u0644\u0645\u0639\u062f\u0644 \u0627\u0644\u0645\u062a\u0648\u0642\u0639 3 - kg/hr)'
];

const excelRows = exportMasterPlanToExcelRows(masterRunsAfter);
const generatedColumns = Object.keys(excelRows[0]);
assert.strictEqual(generatedColumns.length, 18, 'Must have exactly 18 columns');
for (let i = 0; i < 18; i++) {
  assert.strictEqual(generatedColumns[i], expectedColumns[i], `Column ${i + 1} mismatch: ${generatedColumns[i]} vs ${expectedColumns[i]}`);
}
console.log('PASS: All 18 columns match exact specification in sequence');

// TEST 4: Single Sheet Excel Export with Frozen Header and Column Widths
const wb = generateMasterPlanExcelWorkbook(masterRunsAfter);
assert.strictEqual(wb.SheetNames.length, 1, 'Must contain strictly ONE single sheet');
assert.strictEqual(wb.SheetNames[0], 'Master Extrusion Plan', 'Sheet name must be "Master Extrusion Plan"');

const ws = wb.Sheets['Master Extrusion Plan'];
assert.ok(ws['!freeze'], 'Sheet must have frozen header configured');
assert.strictEqual(ws['!freeze'].ySplit, 1, 'Frozen header must split at row 1');
assert.ok(ws['!cols'] && ws['!cols'].length === 18, 'Sheet must configure widths for all 18 columns');

const parsedExportedRows = XLSX.utils.sheet_to_json(ws);
assert.strictEqual(parsedExportedRows.length, 7467, 'Total exported rows must strictly equal total loaded runs (7,467)');
console.log('PASS: Single sheet workbook verified with frozen headers, column widths, and 7,467 rows');

console.log('ALL MASTER TABLE TESTS PASSED SUCCESSFULLY!');
