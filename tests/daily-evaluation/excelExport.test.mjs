import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatExcelFilename,
  formatAllMachinesExcelFilename,
  formatSopExcelFilename,
  formatAllMachinesSopExcelFilename,
  sanitizeSheetName,
  buildMachineReportSheet,
  buildAllMachinesSummarySheet,
  exportSingleMachineToExcel,
  exportAllMachinesToExcel,
  buildLegacySopExcelSheet,
  exportSingleMachineSopToExcel,
  exportAllMachinesSopToExcel
} from '../../src/logic/excelExport.js';
import { parseExcelWorkbook, convertLogRowToReport } from '../../src/logic/excelParser.js';
import { buildAll } from '../../src/logic/engine.js';
import { getBenchmarkReport } from '../../src/data/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting Excel Export Unit Tests ---');

// 1. Filename & Sheet Name Formatting
assert.equal(
  formatExcelFilename('2026-09-19', 'L-05', 'KTS 350'),
  'Daily_Report_2026-09-19_L-05_KTS_350.xlsx'
);
assert.equal(
  formatAllMachinesExcelFilename('2026-09-19'),
  'Daily_Reports_2026-09-19_All_Machines.xlsx'
);
assert.equal(sanitizeSheetName('L-01:Test/Sheet?*'), 'L-01TestSheet');
assert.equal(sanitizeSheetName(''), 'Sheet1');
assert.ok(sanitizeSheetName('A_Very_Long_Machine_Name_That_Exceeds_31_Characters').length <= 31);
console.log('Filename and sheet name sanitization: OK');

// 2. Single Machine Sheet Structure Test
const benchmark = getBenchmarkReport();
const derived = buildAll(benchmark.slots, benchmark.refs, benchmark.summary.startCounter);
const ws = buildMachineReportSheet(benchmark, derived);
assert.ok(ws, 'Worksheet should be created');
assert.ok(ws['!cols'] && ws['!cols'].length === 7, 'Should have 7 column widths configured');

const singleResult = exportSingleMachineToExcel(benchmark, derived, { autoSave: false });
assert.equal(singleResult.success, true);
assert.equal(singleResult.workbook.SheetNames.length, 1);
assert.ok(singleResult.filename.endsWith('.xlsx'));
console.log('Single machine Excel worksheet generation: OK');

// 3. Combined All Machines Excel Export with Real Master_Upload.xlsx
const masterPath = path.resolve(__dirname, '../../Master_Upload.xlsx');
if (fs.existsSync(masterPath)) {
  const buf = fs.readFileSync(masterPath);
  const parsed = parseExcelWorkbook(buf);
  const targetDate = '2026-09-07';

  const allResult = exportAllMachinesToExcel(parsed.rows, targetDate, parsed.machineMaster, { autoSave: false });
  assert.equal(allResult.success, true);
  assert.equal(allResult.count, 5, 'Should have 5 operating lines on 2026-09-07');
  assert.equal(allResult.filename, 'Daily_Reports_2026-09-07_All_Machines.xlsx');

  // Verify sheet names in combined workbook
  const sheetNames = allResult.workbook.SheetNames;
  assert.ok(sheetNames.includes('Plant_Summary'), 'Combined workbook must include Plant_Summary sheet');
  assert.equal(sheetNames.length, 6, 'Should have 1 summary sheet + 5 individual machine sheets');
  assert.ok(sheetNames.includes('L-05'), 'Must include L-05 sheet');
  assert.ok(sheetNames.includes('L-06'), 'Must include L-06 sheet');

  // Verify live engineering metrics in Row 4 (C4 and E4) for individual machine sheets
  const l05Sheet = allResult.workbook.Sheets['L-05'];
  assert.ok(l05Sheet, 'L-05 worksheet should exist in workbook');
  assert.ok(l05Sheet['C4'] && !l05Sheet['C4'].v.includes(': 0 kg/h') && !l05Sheet['C4'].v.includes(': 0.0 kg/h'), 'L-05 Cell C4 must have positive actual rate');
  assert.ok(l05Sheet['E4'] && !l05Sheet['E4'].v.includes(': 0%') && !l05Sheet['E4'].v.includes(': 0.0%'), 'L-05 Cell E4 must have positive utilization');

  // Test empty date scenario
  const emptyResult = exportAllMachinesToExcel(parsed.rows, '2099-01-01', parsed.machineMaster, { autoSave: false });
  assert.equal(emptyResult.success, false);
  assert.equal(emptyResult.reason, 'no_records');

  console.log('Combined all machines Excel export: OK');
}

// 4. Verification of Live Actual Output & Capacity Utilization in Row 4 Cells C4 & E4
const mockKts350Row = {
  id: 'test-kts-350-row',
  date: '2026-09-19',
  machineId: 'L-05',
  machineName: 'KTS 350',
  nominalCapacityKgH: 330,
  itemCode: '991',
  unitWeight: 16,
  totalOutput: 308,
  totalWeight: 4928,
  operatingHours: 24,
  downtimeHours: 0
};
const ktsRep = convertLogRowToReport(mockKts350Row);
const ktsDer = buildAll(ktsRep.slots, ktsRep.refs, ktsRep.summary.startCounter, ktsRep.engineering);

// 4a. With derived state provided
const wsWithDerived = buildMachineReportSheet(ktsRep, ktsDer);
assert.equal(wsWithDerived['A4'].v, 'Nominal Capacity: 330 kg/h');
assert.equal(wsWithDerived['C4'].v, 'Actual Output: 205.3 kg/h');
assert.equal(wsWithDerived['E4'].v, 'Capacity Utilization: 62.2%');

// 4b. Without derived state provided (fallback computation inside export builder)
const wsWithoutDerived = buildMachineReportSheet(ktsRep);
assert.equal(wsWithoutDerived['A4'].v, 'Nominal Capacity: 330 kg/h');
assert.equal(wsWithoutDerived['C4'].v, 'Actual Output: 205.3 kg/h');
assert.equal(wsWithoutDerived['E4'].v, 'Capacity Utilization: 62.2%');

// 4c. Single machine export workbook verification
const singleKtsResult = exportSingleMachineToExcel(ktsRep, ktsDer, { autoSave: false });
const exportedKtsWs = singleKtsResult.workbook.Sheets[singleKtsResult.workbook.SheetNames[0]];
assert.equal(exportedKtsWs['C4'].v, 'Actual Output: 205.3 kg/h');
assert.equal(exportedKtsWs['E4'].v, 'Capacity Utilization: 62.2%');
console.log('Live engineering output & capacity utilization in Excel export: OK');

// 5. Legacy SOP (DOC-Ext.-03) Excel Worksheet & Export Verification
assert.equal(
  formatSopExcelFilename('2026-09-19', 'L-05', 'KTS 350'),
  'SOP_Report_2026-09-19_L-05_KTS_350.xlsx'
);
assert.equal(
  formatSopExcelFilename('2026-09-19', 'L-05'),
  'SOP_Report_2026-09-19_L-05.xlsx'
);
assert.equal(
  formatAllMachinesSopExcelFilename('2026-09-19'),
  'SOP_Reports_2026-09-19_All_Operating_Machines.xlsx'
);

// 5a. SOP Worksheet Structure Test
const sopWs = buildLegacySopExcelSheet(benchmark, derived);
assert.ok(sopWs, 'SOP Worksheet should be created');
assert.ok(sopWs['!cols'] && sopWs['!cols'].length === 9, 'Should have 9 column widths configured');
assert.equal(sopWs['A1'].v, 'DOC-Ext.-03', 'Cell A1 must contain docCode');
assert.equal(sopWs['C1'].v, 'DOCUMENT IN POST', 'Cell C1 must contain document title');
assert.equal(sopWs['G1'].v, 'N° VERSION', 'Cell G1 must contain version label');
assert.equal(sopWs['H1'].v, '3', 'Cell H1 must contain version number');

// 5b. Single Machine SOP Export
const singleSopResult = exportSingleMachineSopToExcel(benchmark, derived, { autoSave: false });
assert.equal(singleSopResult.success, true);
assert.equal(singleSopResult.workbook.SheetNames.length, 1);
assert.ok(singleSopResult.filename.startsWith('SOP_Report_'));
assert.ok(singleSopResult.filename.endsWith('.xlsx'));

// 5c. Combined All Operating Machines SOP Export
if (fs.existsSync(masterPath)) {
  const buf = fs.readFileSync(masterPath);
  const parsed = parseExcelWorkbook(buf);
  const targetDate = '2026-09-07';

  const allSopResult = exportAllMachinesSopToExcel(parsed.rows, targetDate, parsed.machineMaster, { autoSave: false });
  assert.equal(allSopResult.success, true);
  assert.equal(allSopResult.count, 5, 'Should have 5 operating lines for SOP workbook on 2026-09-07');
  assert.equal(allSopResult.filename, 'SOP_Reports_2026-09-07_All_Operating_Machines.xlsx');
  assert.equal(allSopResult.workbook.SheetNames.length, 5, 'Should contain 5 individual SOP sheets');
  assert.ok(allSopResult.workbook.SheetNames.includes('L-05'));
  assert.ok(allSopResult.workbook.SheetNames.includes('L-06'));

  const emptySopResult = exportAllMachinesSopToExcel(parsed.rows, '2099-01-01', parsed.machineMaster, { autoSave: false });
  assert.equal(emptySopResult.success, false);
  assert.equal(emptySopResult.reason, 'no_records');
}
console.log('Legacy SOP (DOC-Ext.-03) Excel sheet generation and batch export: OK');

console.log('All Excel Export unit tests passed successfully!');
