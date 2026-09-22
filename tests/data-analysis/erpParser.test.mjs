import assert from 'assert';
import * as XLSX from 'xlsx';
import { parseSheetToJsonWithDynamicHeader, parseProductSpecs, matchColumns } from '../../src/utils/dataCleaner.js';
import { processHistoricalErpData } from '../../src/utils/inferenceEngine.js';

console.log('--- 1. Testing Dimension Extraction for HDPE ---');
const hdpeRes1 = parseProductSpecs('160MM SDR-11');
assert.strictEqual(hdpeRes1.diameter, '160 mm', 'Should extract 160 mm diameter');
assert.strictEqual(hdpeRes1.thickness, 'SDR-11', 'Should extract SDR-11 thickness');
assert.strictEqual(hdpeRes1.material, 'HDPE', 'Should detect HDPE material for SDR-11');

const hdpeRes2 = parseProductSpecs('HDPE PIPE\n160MM SDR-11\nNWC');
assert.strictEqual(hdpeRes2.diameter, '160 mm', 'Should extract 160 mm diameter from multiline');
assert.strictEqual(hdpeRes2.thickness, 'SDR-11', 'Should extract SDR-11 thickness from multiline');
assert.strictEqual(hdpeRes2.material, 'HDPE', 'Should detect HDPE material');
assert.strictEqual(hdpeRes2.standard, 'SDR 11', 'Should detect SDR 11 standard');
console.log('PASS: Dimension extraction for HDPE');

console.log('--- 2. Testing Dynamic Header Row Detection (SheetJS) ---');
// Simulate workbook where Row 1 is a logo/merged banner and Row 2 is column headers
const wb = XLSX.utils.book_new();
const aoa = [
  ['', '', '', 'Al-Manar Factory Banner/Logo', '', '', ''],
  ['Doc No', 'Doc Date', 'Product Code', 'Product Name', 'Qty', 'Weight', 'TotalWeight', 'Remarks'],
  ['RFP-26-01-236', '10/01/2026', 1140, 'HDPE PIPE\n160MM SDR-11\nNWC', 60.00, 6.70, 402.00, ''],
  ['RFP-26-01-612', '24/01/2026', 1140, 'HDPE PIPE\n160MM SDR-11\nNWC', 960.00, 6.70, 6432.00, ''],
  ['RFP-26-01-613', '24/01/2026', 1140, 'HDPE PIPE\n160MM SDR-11\nNWC', 1332.00, 6.70, 8924.40, '']
];
const ws = XLSX.utils.aoa_to_sheet(aoa);
XLSX.utils.book_append_sheet(wb, ws, 'PIPES');

const parsedRows = parseSheetToJsonWithDynamicHeader(ws, XLSX);
assert.strictEqual(parsedRows.length, 3, 'Should parse exactly 3 data rows');
assert.strictEqual(parsedRows[0]['Product Code'], 1140, 'Should map Product Code header');
assert.strictEqual(parsedRows[0]['TotalWeight'], 402.00, 'Should map TotalWeight header');
assert.strictEqual(parsedRows[0]['Weight'], 6.70, 'Should map unit Weight header');
console.log('PASS: Dynamic header row detection');

console.log('--- 3. Testing Flexible Column Aliasing & Historical Inference ---');
const colMapping = matchColumns(parsedRows[0]);
assert.ok(colMapping.date, 'Should match date column');
assert.ok(colMapping.itemCode, 'Should match itemCode column');
assert.ok(colMapping.product, 'Should match product column');
assert.ok(colMapping.qty, 'Should match qty column');
assert.ok(colMapping.unitWeight, 'Should match unitWeight column');
assert.ok(colMapping.totalWeight, 'Should match totalWeight column');
assert.strictEqual(colMapping.totalWeight, 'TotalWeight', 'Should map TotalWeight accurately');
assert.strictEqual(colMapping.unitWeight, 'Weight', 'Should map Weight as unit weight');

const erpResult = processHistoricalErpData(parsedRows);
assert.strictEqual(erpResult.inferredRows.length, 3, 'Should infer 3 rows');
const row0 = erpResult.inferredRows[0];
assert.strictEqual(row0.itemCode, '1140', 'Should extract item code 1140');
assert.strictEqual(row0.totalWeight, 402, 'Total weight must not be zero');
assert.strictEqual(row0.diameter, '160 mm', 'Diameter must be 160 mm');
assert.strictEqual(row0.thickness, 'SDR-11', 'Thickness must be SDR-11');
assert.strictEqual(row0.material, 'HDPE', 'Material must be HDPE');
assert.ok(row0.operatingHours > 0, 'Operating hours must be rational (> 0)');
assert.ok(row0.lineRateKgPerHour > 0, 'Line rate must be positive');
assert.ok(['KTS 350', 'Kabra 90', 'Kabra 90 (K-90)', 'KTS 700'].includes(row0.inferredMachine), 'Should allocate eligible extruder');

const row1 = erpResult.inferredRows[1];
assert.strictEqual(row1.totalWeight, 6432, 'Total weight for row 1 must be 6432');
assert.strictEqual(row1.inferredMachine, 'KTS 350', 'Row 1 should allocate to optimal line KTS 350');
assert.ok(row1.primaryLoadingRatio >= 65 && row1.primaryLoadingRatio <= 95, 'Loading ratio should be optimal inside 65-95%');

console.log('PASS: Historical ERP processing and machine allocation');
console.log('ALL TESTS PASSED SUCCESSFULLY!');
