import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isRecordOperating,
  getOperatingRecordsForDate,
  getOperatingRecordsForDateRange,
  sanitizeFilenamePart,
  formatPdfFilename,
  formatZipFilename,
  formatRangeZipFilename,
  formatRangeSopZipFilename
} from '../../src/logic/batchZipExport.js';
import { parseExcelWorkbook, convertLogRowToReport } from '../../src/logic/excelParser.js';
import { buildAll } from '../../src/logic/engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting Batch Export Unit Tests ---');

// 1. Filename sanitization
assert.equal(sanitizeFilenamePart('KTS 350 TDH'), 'KTS_350_TDH');
assert.equal(sanitizeFilenamePart('L-01/Test:Special?'), 'L-01TestSpecial');
assert.equal(sanitizeFilenamePart('', 'Fallback'), 'Fallback');
console.log('Filename sanitization: OK');

// 2. PDF & ZIP filename formatting
assert.equal(
  formatPdfFilename('2026-09-07', 'L-05', 'KTS 350'),
  'Daily_Report_2026-09-07_L-05_KTS_350.pdf'
);
assert.equal(
  formatZipFilename('2026-09-07'),
  'Daily_Reports_2026-09-07_All_Machines.zip'
);
assert.equal(
  formatRangeZipFilename('2026-09-07', '2026-09-08'),
  'Daily_Reports_2026-09-07_to_2026-09-08_All_Machines.zip'
);
assert.equal(
  formatRangeSopZipFilename('2026-09-07', '2026-09-08'),
  'SOP_Reports_2026-09-07_to_2026-09-08_All_Machines.zip'
);
console.log('Filename formatting: OK');

// 3. Filtering operating records for a target date
assert.equal(isRecordOperating({ operatingHours: 24, productionQty: 500, totalWeight: 1000 }), true);
assert.equal(isRecordOperating({ operatingHours: 0, productionQty: 0, totalWeight: 0, downtimeHours: 24 }), false);
assert.equal(isRecordOperating({ operatingHours: 0, actualOutputKg: 500 }), true);
assert.equal(isRecordOperating({ operatingHours: 0, productionQty: 25 }), true);
assert.equal(isRecordOperating(null), false);
console.log('isRecordOperating classification: OK');

const mockRecords = [
  { date: '2026-09-07', machineId: 'L-01', operatingHours: 24, productionQty: 500, totalWeight: 1000 },
  { date: '2026-09-07', machineId: 'L-02', operatingHours: 0, productionQty: 0, totalWeight: 0 },
  { date: '2026-09-07', machineId: 'L-03', operatingHours: 12, productionQty: 300, totalWeight: 600 },
  { date: '2026-09-08', machineId: 'L-01', operatingHours: 24, productionQty: 500, totalWeight: 1000 },
  { date: '2026-09-12', machineId: 'L-01', operatingHours: 0, productionQty: 0, totalWeight: 0, downtimeHours: 24 },
  { date: '2026-09-12', machineId: 'L-02', operatingHours: 0, productionQty: 0, totalWeight: 0, downtimeHours: 24 },
  { date: 'Grand Total', machineId: '', operatingHours: 36, productionQty: 800, totalWeight: 1600 }
];

const op07 = getOperatingRecordsForDate(mockRecords, '2026-09-07');
assert.equal(op07.length, 2);
assert.equal(op07[0].machineId, 'L-01');
assert.equal(op07[1].machineId, 'L-03');

const opShutdown = getOperatingRecordsForDate(mockRecords, '2026-09-12');
assert.equal(opShutdown.length, 0, 'Factory shutdown date must return 0 active operating machines');

const opAll = getOperatingRecordsForDate(mockRecords, 'ALL');
assert.equal(opAll.length, 0, 'ALL should return empty list to enforce picking a specific date');

const opEmpty = getOperatingRecordsForDate(mockRecords, '2026-09-99');
assert.equal(opEmpty.length, 0);

const opRange = getOperatingRecordsForDateRange(mockRecords, '2026-09-07', '2026-09-08');
assert.equal(opRange.length, 3, 'Range 07 to 08 must return 3 operating lines');
const opRangeReversed = getOperatingRecordsForDateRange(mockRecords, '2026-09-08', '2026-09-07');
assert.equal(opRangeReversed.length, 3, 'Reversed range must auto-swap and return 3 operating lines');
const opRangeShutdown = getOperatingRecordsForDateRange(mockRecords, '2026-09-12', '2026-09-12');
assert.equal(opRangeShutdown.length, 0, 'Shutdown date range must return 0 lines');
console.log('Mock records date and range filtering: OK');

// 4. Test real Master_Upload.xlsx records
const publicMaster = path.resolve(__dirname, '../../public/Master_Upload.xlsx');
const rootMaster = path.resolve(__dirname, '../../Master_Upload.xlsx');
const masterPath = fs.existsSync(publicMaster) ? publicMaster : rootMaster;
if (fs.existsSync(masterPath)) {
  const buf = fs.readFileSync(masterPath);
  const parsed = parseExcelWorkbook(buf);
  assert.ok(parsed.rows.length > 0, 'Must have parsed rows');

  // Test date 2026-09-07
  const realOp07 = getOperatingRecordsForDate(parsed.rows, '2026-09-07');
  assert.ok(realOp07.length >= 4, `Expected at least 4 operating lines on 2026-09-07, found ${realOp07.length}`);

  // Test report conversion and derivation for each operating line
  for (const row of realOp07) {
    const report = convertLogRowToReport(row);
    assert.ok(report.header.date, 'Report date must exist');
    assert.ok(report.header.lineId, 'Line ID must exist');

    const derived = buildAll(
      report.slots,
      report.refs,
      report.summary?.startCounter,
      report.engineering
    );
    assert.equal(derived.slots.length, 24, 'Derived report must have exactly 24 hourly slots');
    assert.ok(derived.grandTotals.actual >= 0, 'Grand total actual output must be non-negative');
    assert.ok(derived.oee >= 0 && Number.isFinite(derived.oee), 'OEE must be a valid non-negative number');

    const pdfName = formatPdfFilename(
      row.date,
      row.machineId || 'Line',
      row.machineRaw || row.machineName || 'Machine'
    );
    assert.ok(pdfName.endsWith('.pdf'), 'Must generate a valid .pdf filename');
  }
  console.log(`Master_Upload.xlsx real records filtering & derivation: OK (${realOp07.length} lines on 2026-09-07)`);

  // Test multi-item machine date 2026-09-08 (where L-08 ran 2 items: 716 and 717)
  const realOp08 = getOperatingRecordsForDate(parsed.rows, '2026-09-08');
  assert.equal(realOp08.length, 5, 'Must have exactly 5 operating machines on 2026-09-08 (not 6 duplicate sheets)');
  const l08Row = realOp08.find((r) => r.machineId === 'L-08');
  assert.ok(l08Row, 'L-08 must be included on 2026-09-08');
  assert.ok(l08Row.items && l08Row.items.length === 2, 'L-08 must have 2 consolidated items');
  const l08Report = convertLogRowToReport(l08Row);
  assert.ok(l08Report.refs['1'].pipeSpec, 'L-08 report must have Ref 1');
  assert.ok(l08Report.refs['2'].pipeSpec, 'L-08 report must have Ref 2');
  assert.equal(l08Report.slots.length, 24, 'L-08 report must have 24 hourly slots');
  console.log('Multi-item machine consolidation in batch export: OK (5 lines on 2026-09-08)');
}

console.log('All batch export unit tests passed successfully!');
