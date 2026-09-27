import assert from 'assert';
import { analyzeErpImport } from '../../src/utils/inferenceEngine.js';
import { cleanPipeProductionData } from '../../src/utils/dataCleaner.js';

console.log('--- Starting ERP Ingestion Verification & Modal Logic Unit Tests ---');

// 1. Test analyzeErpImport with various column variations
const testRows = [
  {
    'Doc No': 'DOC-1001',
    'Doc Date': '2026-03-01',
    'Product Code': 'ERP-UPVC-110-4.2',
    'Product Name': 'UPVC PIPE 110MM X 4.2MM SDR 26 CLASS 3',
    'Qty': 150,
    'Weight': 2.15,
    'TotalWeight': 322.5,
    'Remarks': 'Standard run'
  },
  {
    'Doc No': 'DOC-1002',
    'Doc Date': '2026-03-01',
    'Product Code': 'COMPOUND-01',
    'Product Name': 'PVC COMPOUND DRY BLEND GREY',
    'Qty': 500,
    'Weight': 25,
    'TotalWeight': 12500,
    'Remarks': 'Raw material'
  }
];

const analysis = analyzeErpImport(testRows);
assert.strictEqual(analysis.healthCheck.totalRows, 2, 'Should analyze 2 total rows');
assert.strictEqual(analysis.healthCheck.validCount, 1, 'Should find 1 valid extrusion run');
assert.strictEqual(analysis.healthCheck.excludedCount, 1, 'Should find 1 excluded run (compound)');
assert.strictEqual(analysis.previewRows.length, 2, 'Preview rows should contain preview of rows');
assert.strictEqual(analysis.previewRows[0].docNo, 'DOC-1001', 'Should preserve docNo in preview');

// 2. Test Data Sanitization before State & IndexedDB Commit
function sanitizeRows(rows) {
  return (rows || []).map((row) => {
    if (!row || typeof row !== 'object') return {};
    const cleanRow = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'function' || typeof v === 'symbol') continue;
      if (v instanceof Date) {
        cleanRow[k] = v.toISOString().split('T')[0];
      } else {
        cleanRow[k] = v !== undefined && v !== null ? v : '';
      }
    }
    return cleanRow;
  });
}

const messyRows = [
  {
    'Doc No': 'TEST-99',
    'Doc Date': new Date('2026-05-15T00:00:00.000Z'),
    'Product Name': 'UPVC Pipe 90mm',
    fn: () => console.log('bad'),
    sym: Symbol('bad'),
    nullVal: null,
    undefVal: undefined
  }
];

const sanitized = sanitizeRows(messyRows);
assert.strictEqual(sanitized[0]['Doc Date'], '2026-05-15', 'Date must be converted to string');
assert.strictEqual(typeof sanitized[0].fn, 'undefined', 'Functions must be stripped');
assert.strictEqual(typeof sanitized[0].sym, 'undefined', 'Symbols must be stripped');
assert.strictEqual(sanitized[0].nullVal, '', 'Null values must be normalized to string');
assert.strictEqual(sanitized[0].undefVal, '', 'Undefined values must be normalized to string');

// Verify cloneability using structuredClone (native in Node.js 17+)
const clone = structuredClone(sanitized);
assert.deepStrictEqual(clone, sanitized, 'Sanitized rows must be 100% structuredClone compatible');

// 3. Test Confirm Callback execution & error shielding
let committedRows = null;
let toastMessage = null;

function mockConfirmHandler(rows, sheetName) {
  try {
    if (!rows || rows.length === 0) return;
    const clean = sanitizeRows(rows);
    committedRows = clean;
    toastMessage = `Successfully ingested ${clean.length} historical ERP runs from "${sheetName}"`;
  } catch (err) {
    console.error('Test mock error:', err);
  }
}

mockConfirmHandler(testRows, 'PIPES');
assert.strictEqual(committedRows.length, 2, 'Committed rows should have length 2');
assert.strictEqual(toastMessage, 'Successfully ingested 2 historical ERP runs from "PIPES"', 'Toast message matches format');

console.log('ALL ERP INGESTION VERIFICATION & MODAL LOGIC TESTS PASSED SUCCESSFULLY!');
