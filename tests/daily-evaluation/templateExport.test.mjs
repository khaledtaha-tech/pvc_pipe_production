import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import {
  formatTemplateOeeFilename,
  extractDayNumber,
  normalizeExcelStoppageReason,
  getTemplateBuffer,
  base64ToUint8Array,
  buildTemplateOeeWorkbook,
  exportSingleMachineTemplateExcel,
  exportAllMachinesTemplateExcel
} from '../../src/logic/templateExcelExport.js';
import { KTS_350_TEMPLATE_BASE64 } from '../../src/logic/kts350TemplateBase64.js';
import { parseExcelWorkbook, convertLogRowToReport } from '../../src/logic/excelParser.js';
import { buildAll } from '../../src/logic/engine.js';
import { getBenchmarkReport } from '../../src/data/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting Template-Driven OEE Excel Export Unit Tests ---');

// 1. Filename Formatting Specification
assert.equal(
  formatTemplateOeeFilename('KTS-350', '2026-09-28'),
  'OEE_KTS-350_2026-09-28.xlsx',
  'Must match exact format: OEE_[MachineID]_[YYYY-MM-DD].xlsx'
);
assert.equal(
  formatTemplateOeeFilename('L-03', '2026-09-28'),
  'OEE_L-03_2026-09-28.xlsx'
);
assert.equal(
  formatTemplateOeeFilename('L-03 - KTS 700', '2026-09-28'),
  'OEE_L-03_-_KTS_700_2026-09-28.xlsx'
);
console.log('Filename formatting specification: OK');

// 2. Day Number Extraction for Sheet Tab Naming
assert.equal(extractDayNumber('2026-09-28'), '28');
assert.equal(extractDayNumber('2026-09-07'), '07');
assert.equal(extractDayNumber('28.09.2026'), '28');
assert.equal(extractDayNumber(''), '28');
console.log('Sheet tab day number extraction: OK');

// 3. Base Template Buffer Retrieval & Offline Fallback
const templateBuf = await getTemplateBuffer();
assert.ok(templateBuf, 'Template buffer must be retrieved');
assert.ok(templateBuf.byteLength >= 10000, 'Template buffer size must be at least 10KB');

const b64Bytes = base64ToUint8Array(KTS_350_TEMPLATE_BASE64);
assert.ok(b64Bytes && b64Bytes.length >= 10000, 'Embedded base64 must convert to valid Uint8Array buffer');
console.log('Base template buffer retrieval & offline fallback: OK');

// 4. Workbook Population & Preservation Verification
const mockReport = {
  header: {
    date: '2026-09-28',
    lineId: 'L-03',
    lineCustom: 'KTS 700'
  },
  refs: {
    '1': {
      itemCode: '262 R',
      pipeSpec: 'PVC PIPE 110X8.1MM PN20 MANARCO G RR 6MTR',
      targetRate: 11,
      stdWeight: 26,
      speed: 1.1,
      pipeLength: 6.0
    },
    '2': {
      itemCode: '',
      pipeSpec: '',
      targetRate: 0,
      stdWeight: 26,
      speed: 0
    }
  },
  summary: {
    startCounter: 100,
    shift1Lead: 'Day Supervisor Name',
    shift2Lead: 'Night Supervisor Name'
  },
  engineering: {
    nominalCapacityKgH: 400,
    hourlyTarget: 11
  },
  slots: []
};

// Generate 24 slots with explicit actual counts, downtime, and scrap
for (let i = 0; i < 24; i += 1) {
  mockReport.slots.push({
    hour: `${String(i).padStart(2, '0')}:00`,
    actual: 10,
    downtime: i === 14 ? 30 : 0,
    reason: i === 14 ? 'Die Head Cleaning' : '',
    scrapKg: i === 14 ? 20 : 0,
    ref: '1'
  });
}

const mockDerived = buildAll(mockReport.slots, mockReport.refs, mockReport.summary.startCounter, mockReport.engineering);
const wb = await buildTemplateOeeWorkbook(mockReport, mockDerived);
const ws = wb.worksheets[0];

// 4a. Sheet Tab Name
assert.equal(ws.name, '28', 'Sheet tab name must be set to day number "28"');

// 4b. Header & Machine Info
assert.equal(ws.getCell('C4').value, 'L-03 - KTS 700', 'Cell C4 must contain full machine name');
assert.equal(
  ws.getCell('D5').value,
  '[262 R] - PVC PIPE 110X8.1MM PN20 MANARCO G RR 6MTR',
  'Cell D5 must contain primary item code & description'
);
assert.equal(ws.getCell('D6').value, '', 'Cell D6 must be empty string when no secondary product');
assert.equal(ws.getCell('I7').value, '28.09.2026', 'Cell I7 must contain date formatted strictly as dd.MM.yyyy');
assert.equal(ws.getCell('E8').value, 11, 'Cell E8 must contain standard piece output rate (PC/Hour)');
assert.equal(ws.getCell('G8').value, 26, 'Cell G8 must contain standard nominal weight (Kg/PC)');

// 4c. Hourly Production & Stoppage Slots (Rows 10 to 33)
// Check Shift 1 cumulative rate in Col B
assert.equal(ws.getCell('B10').value, 11 * 1, 'B10 must be 11 (hour 1 cumulative)');
assert.equal(ws.getCell('B11').value, 11 * 2, 'B11 must be 22 (hour 2 cumulative)');
assert.equal(ws.getCell('B21').value, 11 * 12, 'B21 must be 132 (hour 12 cumulative)');
// Check Shift 2 cumulative rate in Col B
assert.equal(ws.getCell('B22').value, 11 * 13, 'B22 must be 143 (hour 13 cumulative)');
assert.equal(ws.getCell('B33').value, 11 * 24, 'B33 must be 264 (hour 24 cumulative)');

// Check Col C discrete good production
assert.equal(ws.getCell('C10').value, 10, 'C10 must contain discrete actual count 10');
assert.equal(ws.getCell('C24').value, 10, 'C24 must contain discrete actual count 10');

// Check Col D, E, F on stoppage slot (hour 14 -> row 24)
assert.equal(ws.getCell('D24').value, 'Die Head Cleaning', 'D24 must contain stoppage reason');
assert.equal(ws.getCell('E24').value, 30, 'E24 must contain downtime minutes (30)');
assert.equal(ws.getCell('F24').value, 20, 'F24 must contain reject kg (20)');

// Check normal slot without downtime (row 10)
assert.equal(ws.getCell('D10').value, null, 'D10 must be empty for normal slot');
assert.equal(ws.getCell('E10').value, 0, 'E10 must be 0 for zero downtime');
assert.equal(ws.getCell('F10').value, 0, 'F10 must be 0 for zero scrap');

// 4d. Supervisor Names (Row 39)
assert.equal(ws.getCell('B39').value, 'Day Supervisor Name', 'B39 must contain Day Shift Supervisor');
assert.equal(ws.getCell('F39').value, 'Night Supervisor Name', 'F39 must contain Night Shift Supervisor');
assert.equal(ws.getCell('D39').value, null, 'D39 must be cleared (not default Binod)');

// 4e. Preservation of Print Setup
assert.equal(ws.pageSetup.printArea, 'A1:I39', 'Print area must be preserved as A1:I39');
assert.equal(ws.pageSetup.scale, 80, 'Print scale must be preserved as 80%');
assert.equal(ws.pageSetup.orientation, 'portrait', 'Page orientation must be portrait');
assert.equal(ws.pageSetup.horizontalCentered, true, 'Horizontal centering must be true');
assert.equal(ws.pageSetup.verticalCentered, true, 'Vertical centering must be true');

// 4f. Preservation of Cell Merges
assert.ok(ws.model.merges.length >= 10, 'Must preserve all template merged cell regions');

// 4g. Preservation of Native Formulas
assert.ok(ws.getCell('H12').formula, 'Cell H12 must retain native formula');
assert.ok(ws.getCell('G14').formula, 'Cell G14 must retain native formula');
assert.ok(ws.getCell('H16').formula, 'Cell H16 must retain native formula');
assert.ok(ws.getCell('G20').formula, 'Cell G20 must retain native formula');
assert.ok(ws.getCell('H20').formula, 'Cell H20 must retain native formula');
assert.ok(ws.getCell('I20').formula, 'Cell I20 must retain native formula');
assert.ok(ws.getCell('H21').formula, 'Cell H21 must retain native formula');
assert.ok(ws.getCell('H23').formula, 'Cell H23 must retain native formula');
assert.ok(ws.getCell('G25').formula, 'Cell G25 must retain native formula');
assert.ok(ws.getCell('H37').formula, 'Cell H37 must retain native formula');

// 4h. Preservation of Background Fills and Fonts
assert.equal(ws.getCell('G36').fill?.fgColor?.argb, 'FF92D050', 'Cell G36 must have green fill FF92D050');
assert.equal(ws.getCell('H37').fill?.fgColor?.argb, 'FF00B0F0', 'Cell H37 must have cyan fill FF00B0F0');
assert.equal(ws.getCell('C4').font?.name, 'Times New Roman', 'Cell C4 must preserve Times New Roman font');
console.log('Workbook population, formatting, formulas, and print setup preservation: OK');

// 5. Single Machine Template Export
const singleResult = await exportSingleMachineTemplateExcel(mockReport, mockDerived, { autoSave: false });
assert.equal(singleResult.success, true);
assert.equal(singleResult.filename, 'OEE_L-03_2026-09-28.xlsx');
assert.ok(singleResult.workbook);
console.log('Single machine template Excel export: OK');

// 6. Batch Export All Operating Machines on Date
const masterPath = path.resolve(__dirname, '../../Master_Upload.xlsx');
if (fs.existsSync(masterPath)) {
  const buf = fs.readFileSync(masterPath);
  const parsed = parseExcelWorkbook(buf);
  const targetDate = '2026-09-07';

  const batchResult = await exportAllMachinesTemplateExcel(parsed.rows, targetDate, parsed.machineMaster, { autoSave: false });
  assert.equal(batchResult.success, true);
  assert.equal(batchResult.count, 5, 'Should export 5 active machines on 2026-09-07');
  assert.equal(batchResult.results.length, 5);
  assert.equal(batchResult.filenames.length, 5);

  // Each file must strictly match OEE_[MachineID]_[YYYY-MM-DD].xlsx
  for (const fn of batchResult.filenames) {
    assert.ok(fn.startsWith('OEE_'), `Filename ${fn} must start with OEE_`);
    assert.ok(fn.endsWith('_2026-09-07.xlsx'), `Filename ${fn} must end with _2026-09-07.xlsx`);
  }

  // Verify sheet tab name in each individual workbook is '07'
  for (const res of batchResult.results) {
    assert.equal(res.workbook.worksheets[0].name, '07', 'Sheet name must be day number "07"');
  }

  // Test empty date scenario
  const emptyBatch = await exportAllMachinesTemplateExcel(parsed.rows, '2099-01-01', parsed.machineMaster, { autoSave: false });
  assert.equal(emptyBatch.success, false);
  assert.equal(emptyBatch.reason, 'no_records');
  assert.equal(emptyBatch.count, 0);

  console.log('Batch export all operating machines (individual workbooks): OK');
}

// 7. Custom Standard Rate & Weight Override Verification (In-Place & Modal)
// Test 7a: Explicit options.standardRate and options.stdWeight override
const customWb = await buildTemplateOeeWorkbook(mockReport, mockDerived, {
  standardRate: 15,
  stdWeight: 28.5
});
const customWs = customWb.worksheets[0];
assert.equal(customWs.getCell('E8').value, 15, 'Cell E8 must strictly reflect options.standardRate (15)');
assert.equal(customWs.getCell('G8').value, 28.5, 'Cell G8 must strictly reflect options.stdWeight (28.5)');
assert.equal(customWs.getCell('B10').value, 15, 'B10 must be 15 (1 * 15)');
assert.equal(customWs.getCell('B11').value, 30, 'B11 must be 30 (2 * 15)');
assert.equal(customWs.getCell('B21').value, 180, 'B21 must be 180 (12 * 15)');
assert.equal(customWs.getCell('B33').value, 360, 'B33 must be 360 (24 * 15)');

// Test 7b: In-place edited report.refs['1'].targetRate propagation when options.standardRate is omitted
const inPlaceEditedReport = {
  ...mockReport,
  refs: {
    ...mockReport.refs,
    '1': {
      ...mockReport.refs['1'],
      targetRate: 18,
      stdWeight: 31.2
    }
  }
};
const inPlaceWb = await buildTemplateOeeWorkbook(inPlaceEditedReport, mockDerived);
const inPlaceWs = inPlaceWb.worksheets[0];
assert.equal(inPlaceWs.getCell('E8').value, 18, 'Cell E8 must reflect in-place edited report.refs[1].targetRate (18)');
assert.equal(inPlaceWs.getCell('G8').value, 31.2, 'Cell G8 must reflect in-place edited report.refs[1].stdWeight (31.2)');
assert.equal(inPlaceWs.getCell('B10').value, 18, 'B10 must be 18 (1 * 18)');
assert.equal(inPlaceWs.getCell('B33').value, 432, 'B33 must be 432 (24 * 18)');

const optWeightWb = await buildTemplateOeeWorkbook(mockReport, mockDerived, { unitWeight: 3.79 });
assert.equal(optWeightWb.worksheets[0].getCell('G8').value, 3.79, 'Cell G8 must reflect options.unitWeight (3.79)');

console.log('Custom standard rate & weight override (E8, G8, Col B): OK');

// 8. Stoppage Reason Normalization for Formula Matching
assert.equal(normalizeExcelStoppageReason('no order'), 'No Order');
assert.equal(normalizeExcelStoppageReason('No Order (Full Day)'), 'No Order');
assert.equal(normalizeExcelStoppageReason('no_order'), 'No Order');
assert.equal(normalizeExcelStoppageReason('plan complete'), 'Plan Complete');
assert.equal(normalizeExcelStoppageReason('Plan Complete (Shift End)'), 'Plan Complete');
assert.equal(normalizeExcelStoppageReason('Raw Material Shortage / No Resin'), 'Raw Material Shortage / No Resin');
assert.equal(normalizeExcelStoppageReason(''), null);
assert.equal(normalizeExcelStoppageReason(null), null);
console.log('Stoppage reason normalization for formula matching: OK');

// 9. Full Day "No Order" 1440 min SOP Template Export & Formula Result Verification
const noOrderReport = {
  header: {
    date: '2026-09-28',
    lineId: 'L-04',
    lineCustom: 'KTS 350'
  },
  refs: {
    '1': {
      itemCode: '262 R',
      pipeSpec: 'PVC PIPE 110X8.1MM PN20 MANARCO G RR 6MTR',
      targetRate: 15,
      stdWeight: 26,
      speed: 1.5,
      pipeLength: 6.0
    }
  },
  summary: {
    startCounter: 0,
    shift1Lead: 'Day Lead',
    shift2Lead: 'Night Lead'
  },
  engineering: {
    nominalCapacityKgH: 400,
    hourlyTarget: 15
  },
  slots: []
};

// All 24 slots with 60 min downtime and 'No Order'
for (let i = 0; i < 24; i += 1) {
  noOrderReport.slots.push({
    hour: `${String(i).padStart(2, '0')}:00`,
    actual: 0,
    downtime: 60,
    reason: 'No Order',
    scrapKg: 0,
    ref: '1'
  });
}

const noOrderDerived = buildAll(noOrderReport.slots, noOrderReport.refs, 0, noOrderReport.engineering);
const noOrderWb = await buildTemplateOeeWorkbook(noOrderReport, noOrderDerived);
const noOrderWs = noOrderWb.worksheets[0];

// Verify rows 10 to 33 in Col D are exactly 'No Order' and Col E is 60
for (let r = 10; r <= 33; r += 1) {
  assert.equal(noOrderWs.getCell(`D${r}`).value, 'No Order', `Row ${r} Col D must be 'No Order'`);
  assert.equal(noOrderWs.getCell(`E${r}`).value, 60, `Row ${r} Col E must be 60 min`);
  assert.equal(noOrderWs.getCell(`C${r}`).value, 0, `Row ${r} Col C actual must be 0`);
}

// Verify Availability and OEE results are 'N/A' matching Excel formula IF(..., <=0, "N/A", ...)
assert.equal(noOrderWs.getCell('H20').value?.result, 'N/A', 'Shift 1 Availability H20 must be N/A');
assert.equal(noOrderWs.getCell('H21').value?.result, 'N/A', 'Shift 1 OEE H21 must be N/A');
assert.equal(noOrderWs.getCell('H31').value?.result, 'N/A', 'Shift 2 Availability H31 must be N/A');
assert.equal(noOrderWs.getCell('H32').value?.result, 'N/A', 'Shift 2 OEE H32 must be N/A');
assert.equal(noOrderWs.getCell('H36').value?.result, 'N/A', 'Grand Availability H36 must be N/A');
assert.equal(noOrderWs.getCell('H37').value?.result, 'N/A', 'Grand OEE H37 must be N/A');
console.log('Full Day "No Order" (1440 min) SOP Template export & formula matching: OK');

// 10. Partial Shift "Plan Complete" Deduction Verification
const planCompleteReport = {
  ...noOrderReport,
  slots: []
};
for (let i = 0; i < 24; i += 1) {
  const isPlanComplete = (i === 10 || i === 11);
  planCompleteReport.slots.push({
    hour: `${String(i).padStart(2, '0')}:00`,
    actual: isPlanComplete ? 0 : 15,
    downtime: isPlanComplete ? 60 : 0,
    reason: isPlanComplete ? 'Plan Complete' : '',
    scrapKg: 0,
    ref: '1'
  });
}

const planCompleteDerived = buildAll(planCompleteReport.slots, planCompleteReport.refs, 0, planCompleteReport.engineering);
const planCompleteWb = await buildTemplateOeeWorkbook(planCompleteReport, planCompleteDerived);
const planCompleteWs = planCompleteWb.worksheets[0];

assert.equal(planCompleteWs.getCell('D20').value, 'Plan Complete', 'Row 20 Col D must be Plan Complete');
assert.equal(planCompleteWs.getCell('D21').value, 'Plan Complete', 'Row 21 Col D must be Plan Complete');
assert.equal(planCompleteWs.getCell('E20').value, 60);
assert.equal(planCompleteWs.getCell('E21').value, 60);

// Shift 1 has 120 min downtime of 'Plan Complete'.
// Planned available time = 12*60 - 120 = 600 min.
// Operating time = 12*60 - 120 = 600 min.
// Availability = 600 / 600 = 1.0 (100% Availability!)
assert.equal(planCompleteWs.getCell('H20').value?.result, 1.0, 'Shift 1 Availability must be 1.0 (100%) when downtime is Plan Complete');
console.log('Partial Shift "Plan Complete" planned loss deduction: OK');

console.log('All Template-Driven OEE Excel Export unit tests passed successfully!');
