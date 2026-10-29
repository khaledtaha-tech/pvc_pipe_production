import * as XLSX from 'xlsx';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  saveBaselineRate,
  getBaselineRate,
  getBaselineEntry,
  hasBaselineRate,
  getAllBaselines,
  removeBaselineRate,
  clearAllBaselines,
  makeCatalogKey,
  BASELINE_CATALOG_STORAGE_KEY,
  BASELINE_CATALOG_UPDATED_EVENT,
  getBaselineApiUrl,
  saveBaselineRateToServer,
  removeBaselineRateFromServer,
  syncBaselinesWithServer,
  getFullMachineName,
  lookupRawDescription,
  exportStandardsToWorkbook,
  exportStandardsToExcel
} from '../../src/logic/standardCatalogHelper.js';
import {
  saveBaselineRate as saveBaselineRateUtil,
  getBaselineRate as getBaselineRateUtil,
  getBaselineEntry as getBaselineEntryUtil,
  getFullMachineName as getFullMachineNameUtil,
  lookupRawDescription as lookupRawDescriptionUtil,
  exportStandardsToWorkbook as exportStandardsToWorkbookUtil,
  exportStandardsToExcel as exportStandardsToExcelUtil
} from '../../src/utils/standardCatalogHelper.js';
import {
  buildMorningSopModel,
  buildMultiDayMorningSopModels
} from '../../src/logic/legacySopHelper.js';

console.log('--- Starting Standard Baseline Catalog & Morning SOP Tests ---');

// Mock in-memory localStorage for Node test runner
const memoryStorage = {};
const dispatchedEvents = [];
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, eventInitDict) {
      this.type = type;
      this.detail = eventInitDict?.detail;
    }
  };
}
globalThis.window = {
  localStorage: {
    getItem: (key) => memoryStorage[key] || null,
    setItem: (key, val) => { memoryStorage[key] = String(val); },
    removeItem: (key) => { delete memoryStorage[key]; },
    clear: () => { Object.keys(memoryStorage).forEach(k => delete memoryStorage[k]); }
  },
  dispatchEvent: (event) => {
    dispatchedEvents.push(event);
    return true;
  }
};

// 1. Key generation and normalization
assert.equal(makeCatalogKey('L-02', '255'), 'L-02__255');
assert.equal(makeCatalogKey('L-02 - KTS 170', '255'), 'L-02__255');
assert.equal(makeCatalogKey('L-07 - KTS 250 TDH', '255'), 'L-07__255');
console.log('Test 1 Passed: Key generation and canonical machine mapping verified.');

// 2. Initial state verification
clearAllBaselines();
assert.deepEqual(getAllBaselines(), {});
assert.equal(getBaselineRate('L-02', '255'), null);
assert.equal(hasBaselineRate('L-02', '255'), false);
console.log('Test 2 Passed: Empty catalog returns null.');

// 3. Save and retrieve approved baseline
const savedEntry = saveBaselineRate('L-02', '255', 250, 'Standard approved line pace');
assert.ok(savedEntry);
assert.equal(savedEntry.lineId, 'L-02');
assert.equal(savedEntry.productCode, '255');
assert.equal(savedEntry.baselinePcsH, 250);
assert.equal(savedEntry.notes, 'Standard approved line pace');

assert.equal(hasBaselineRate('L-02', '255'), true);
assert.equal(getBaselineRate('L-02', '255'), 250);
assert.equal(getBaselineRateUtil('L-02', '255'), 250);

const entry = getBaselineEntry('L-02', '255');
assert.equal(entry.baselinePcsH, 250);
assert.equal(entry.lineId, 'L-02');
console.log('Test 3 Passed: Save and retrieve baseline rate verified.');

// 4. Leading zero product code resolution ('0255' matches '255')
assert.equal(getBaselineRate('L-02', '0255'), 250);
assert.equal(getBaselineRate('L-02', '00255'), 250);
console.log('Test 4 Passed: Leading zero normalization verified.');

// 5. Machine model name alias resolution
const savedL06 = saveBaselineRate('L-06 - KTS 700', '259', 170, 'KTS 700 Item 259 standard');
assert.equal(savedL06.lineId, 'L-06');
assert.equal(getBaselineRate('L-06', '259'), 170);
assert.equal(getBaselineRate('L-06 - KTS 700', '259'), 170);
console.log('Test 5 Passed: Machine alias resolution verified.');

// 6. Detailed baseline metadata lookup
const detailed = getBaselineRate('L-06', '259', null, { detailed: true });
assert.equal(detailed.baselinePcsH, 170);
assert.equal(detailed.source, 'baseline');
assert.equal(detailed.isBaseline, true);
console.log('Test 6 Passed: Detailed baseline metadata verified.');

// 7. Fallback to historical logs when not in catalog
const mockRecords = [
  {
    lineId: 'L-05',
    itemCode: '999',
    actualRatePcsH: 140,
    date: '2026-09-25'
  }
];
assert.equal(getBaselineRate('L-05', '999', mockRecords), 140);
const histDetailed = getBaselineRate('L-05', '999', mockRecords, { detailed: true });
assert.equal(histDetailed.baselinePcsH, 140);
assert.equal(histDetailed.source, 'historical');
assert.equal(histDetailed.isBaseline, false);
console.log('Test 7 Passed: Historical log fallback verified.');

// 8. Delete and Clear
assert.equal(removeBaselineRate('L-02', '255'), true);
assert.equal(hasBaselineRate('L-02', '255'), false);
clearAllBaselines();
assert.deepEqual(getAllBaselines(), {});
console.log('Test 8 Passed: Remove and clear catalog verified.');

// Re-seed baseline for buildMorningSopModel tests
saveBaselineRate('L-06', '259', 170); // 170 pcs/h

// 9. buildMorningSopModel auto-inherits baseline and applies 85% target inflation
const sopWithBaseline = buildMorningSopModel({
  lineId: 'L-06',
  itemCode: '259',
  productDescription: 'PVC 200 MM CLASS 3',
  pipeLength: 6.0,
  date: '2026-09-28'
});

assert.equal(sopWithBaseline.inputRealRate, 170);
// 170 / 0.85 = 200 pcs/h
assert.equal(sopWithBaseline.stepTarget, 200);
assert.equal(sopWithBaseline.hourlyStdRate, 200);
assert.equal(sopWithBaseline.printedHourlyTarget, 200);

// Verify Shift 1 slots (1 to 12)
assert.equal(sopWithBaseline.shift1Rows.length, 12);
sopWithBaseline.shift1Rows.forEach((slot, idx) => {
  const expected = 200 * (idx + 1);
  assert.equal(slot.stdPcs, expected, `Shift 1 Slot ${idx + 1} should be ${expected}`);
  assert.equal(slot.stdM, expected);
  assert.equal(Number.isInteger(slot.stdPcs), true);
});

// Verify Shift 2 slots (13 to 24)
assert.equal(sopWithBaseline.shift2Rows.length, 12);
sopWithBaseline.shift2Rows.forEach((slot, idx) => {
  const expected = 200 * (idx + 13);
  assert.equal(slot.stdPcs, expected, `Shift 2 Slot ${idx + 1} should be ${expected}`);
  assert.equal(slot.stdM, expected);
  assert.equal(Number.isInteger(slot.stdPcs), true);
});
console.log('Test 9 Passed: buildMorningSopModel auto-inherits baseline and populates all 24 slots with 85% scaling.');

// 10. Multi-Day Generation Alignment across consecutive dates
const multiDayModels = buildMultiDayMorningSopModels(
  [{
    lineId: 'L-06',
    itemCode: '259',
    productDescription: 'PVC 200 MM CLASS 3',
    pipeLength: 6.0,
    targetPcsH: 170
  }],
  '2026-09-28',
  3 // 3 consecutive days
);

assert.equal(multiDayModels.length, 3);
assert.equal(multiDayModels[0].targetDate, '2026-09-28');
assert.equal(multiDayModels[1].targetDate, '2026-09-29');
assert.equal(multiDayModels[2].targetDate, '2026-09-30');

// All 3 days must have identical baseline rate, step target, and cumulative column values
multiDayModels.forEach((m, dayIdx) => {
  assert.equal(m.inputRealRate, 170, `Day ${dayIdx + 1} must preserve real rate 170`);
  assert.equal(m.stepTarget, 200, `Day ${dayIdx + 1} must have stepTarget 200`);
  assert.equal(m.shift1Rows[0].stdPcs, 200, `Day ${dayIdx + 1} Shift 1 Hour 1 must be 200`);
  assert.equal(m.shift1Rows[11].stdPcs, 2400, `Day ${dayIdx + 1} Shift 1 Hour 12 must be 2400`);
  assert.equal(m.shift2Rows[0].stdPcs, 2600, `Day ${dayIdx + 1} Shift 2 Hour 13 must be 2600`);
  assert.equal(m.shift2Rows[11].stdPcs, 4800, `Day ${dayIdx + 1} Shift 2 Hour 24 must be 4800`);
});
console.log('Test 10 Passed: Multi-day batch prints preserve exact identical baseline rates and cumulative slots.');

// 11. Whole Integer Preservation (Zero Decimal Artifacts)
const oddRateSop = buildMorningSopModel({
  lineId: 'L-02',
  targetPcsH: 42.5, // 42.5 -> rounds to 43 -> 43 / 0.85 = 50.588 -> 51
  pipeLength: 6.0,
  date: '2026-10-01'
});
assert.equal(Number.isInteger(oddRateSop.inputRealRate), true);
assert.equal(Number.isInteger(oddRateSop.stepTarget), true);
assert.equal(oddRateSop.stepTarget, 51);
oddRateSop.shift1Rows.forEach((slot) => {
  assert.equal(Number.isInteger(slot.stdPcs), true);
});
oddRateSop.shift2Rows.forEach((slot) => {
  assert.equal(Number.isInteger(slot.stdPcs), true);
});
console.log('Test 11 Passed: Whole integer preservation and zero decimal artifacts verified.');

// 12. Asynchronous Server Persist (saveBaselineRateToServer)
let mockPostPayload = null;
const mockSaveFetch = async (url, options) => {
  mockPostPayload = {
    url,
    method: options.method,
    headers: options.headers,
    body: JSON.parse(options.body)
  };
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      message: 'Baseline standard saved successfully'
    })
  };
};

const saveServerResult = await saveBaselineRateToServer(
  'L-03',
  '315',
  60,
  'KTS 350 Item 315 standard pace',
  null,
  { fetchFn: mockSaveFetch }
);

assert.equal(saveServerResult.success, true);
assert.equal(saveServerResult.lineId, 'L-03');
assert.equal(saveServerResult.productCode, '315');
assert.equal(saveServerResult.baselinePcsH, 60);
assert.ok(mockPostPayload);
assert.equal(mockPostPayload.method, 'POST');
assert.equal(mockPostPayload.body.lineId, 'L-03');
assert.equal(mockPostPayload.body.productCode, '315');
assert.equal(mockPostPayload.body.baselinePcsH, 60);
assert.equal(mockPostPayload.body.dailyTargetPcs, 1440);
assert.equal(mockPostPayload.body.notes, 'KTS 350 Item 315 standard pace');
console.log('Test 12 Passed: saveBaselineRateToServer payload schema and success handling verified.');

// 13. Server Persist Error & Offline Resilience
const failingSaveFetch = async () => {
  throw new Error('Connection refused / offline network');
};

const offlineSaveResult = await saveBaselineRateToServer(
  'L-03',
  '315',
  60,
  '',
  null,
  { fetchFn: failingSaveFetch }
);

assert.equal(offlineSaveResult.success, false);
assert.equal(offlineSaveResult.offline, true);
console.log('Test 13 Passed: saveBaselineRateToServer offline error resilience verified.');

// 14. Server Delete (removeBaselineRateFromServer)
let mockDeleteUrl = null;
const mockDeleteFetch = async (url, options) => {
  mockDeleteUrl = { url, method: options.method };
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, deleted: true })
  };
};

const removeServerResult = await removeBaselineRateFromServer('L-03', '315', { fetchFn: mockDeleteFetch });
assert.equal(removeServerResult.success, true);
assert.equal(removeServerResult.deleted, true);
assert.ok(mockDeleteUrl);
assert.equal(mockDeleteUrl.method, 'DELETE');
assert.ok(mockDeleteUrl.url.includes('line_id=L-03'));
assert.ok(mockDeleteUrl.url.includes('product_code=315'));
console.log('Test 14 Passed: removeBaselineRateFromServer URL parameters and DELETE dispatch verified.');

// 15. Server Synchronization (syncBaselinesWithServer)
// Seed local storage with a pre-existing standard
clearAllBaselines();
saveBaselineRate('L-01', '110', 100, 'Local standard');

const mockRemoteData = {
  success: true,
  data: [
    {
      line_id: 'L-04',
      product_code: '200',
      baseline_pcs_h: 120,
      notes: 'Central Kabra 90 baseline'
    },
    {
      line_id: 'L-06',
      product_code: '259',
      baseline_pcs_h: 180,
      notes: 'Central KTS 700 baseline'
    }
  ]
};

const mockSyncFetch = async (url, options) => {
  return {
    ok: true,
    status: 200,
    json: async () => mockRemoteData
  };
};

dispatchedEvents.length = 0;
const syncResult = await syncBaselinesWithServer({ fetchFn: mockSyncFetch });

assert.equal(syncResult.success, true);
assert.equal(syncResult.count, 2);

// Check that pre-existing local entries are retained
assert.equal(getBaselineRate('L-01', '110'), 100);

// Check that remote entries were merged into local storage cache
assert.equal(getBaselineRate('L-04', '200'), 120);
assert.equal(getBaselineRate('L-06', '259'), 180);

// Verify event dispatch
assert.ok(dispatchedEvents.some((ev) => ev.type === BASELINE_CATALOG_UPDATED_EVENT));
console.log('Test 15 Passed: syncBaselinesWithServer merges remote database records into local cache and dispatches update event.');

// 16. Server Sync Offline & Error Resilience
const failingSyncFetch = async () => {
  throw new Error('Host unreachable');
};

const offlineSyncResult = await syncBaselinesWithServer({ fetchFn: failingSyncFetch });
assert.equal(offlineSyncResult.success, false);
assert.equal(offlineSyncResult.offline, true);

// Verify local catalog remains intact and uncorrupted
assert.equal(getBaselineRate('L-01', '110'), 100);
assert.equal(getBaselineRate('L-04', '200'), 120);
assert.equal(getBaselineRate('L-06', '259'), 180);
console.log('Test 16 Passed: syncBaselinesWithServer protects local storage during offline/network failure.');

// 17. Full Machine Name Resolution (getFullMachineName)
assert.equal(getFullMachineName('L-01'), 'L-01 - KTS 350 TDH');
assert.equal(getFullMachineName('L-02'), 'L-02 - KTS 170');
assert.equal(getFullMachineName('L-03'), 'L-03 - Kabra 90');
assert.equal(getFullMachineName('L-04'), 'L-04 - KTS 350');
assert.equal(getFullMachineName('L-05'), 'L-05 - KTS 200');
assert.equal(getFullMachineName('L-06'), 'L-06 - KTS 700');
assert.equal(getFullMachineName('L-07'), 'L-07 - KTS 250 TDH');
assert.equal(getFullMachineName('L-08'), 'L-08 - KTS 550');
assert.equal(getFullMachineName('L-06 - KTS 700'), 'L-06 - KTS 700');
assert.equal(getFullMachineNameUtil('L-05'), 'L-05 - KTS 200');
console.log('Test 17 Passed: getFullMachineName canonical registry lookup verified.');


// 18. lookupRawDescription resolution across catalog, planning matrix, and fallbacks
const mockMatrix = [
  { itemCode: 'CUSTOM-99', pipeDescription: 'PVC CONDUIT 20MM CLASS 4 BS 4607' },
  { itemCode: '0259', pipeDescription: 'PVC PIPE 200MM PN10 SASO-ISO 1452-2' }
];

// Lookup from preset seed catalog
const raw255 = lookupRawDescription('255');
assert.equal(raw255, 'uPVC PIPE 50x2.4 PN-10 SASO-ISO 1452-2');

// Lookup with leading zeros
const raw0255 = lookupRawDescription('0255');
assert.equal(raw0255, 'uPVC PIPE 50x2.4 PN-10 SASO-ISO 1452-2');

// Lookup from custom planningMatrix
const rawCustom = lookupRawDescription('CUSTOM-99', mockMatrix);
assert.equal(rawCustom, 'PVC CONDUIT 20MM CLASS 4 BS 4607');

// Fallback for non-existent code
const rawMissing = lookupRawDescription('UNKNOWN-SKU-9999');
assert.equal(rawMissing, '-');
console.log('Test 18 Passed: lookupRawDescription cross-references active catalog, planning matrix, and graceful fallback.');

// 19. Export Standards to Excel Workbook (.xlsx) structure, Raw Description column & auto widths
const testEntries = [
  {
    lineId: 'L-02',
    productCode: '255',
    baselinePcsH: 250,
    dailyTargetPcs: 6000,
    approvedDate: '2026-10-25'
  },
  {
    lineId: 'L-06',
    productCode: 'CUSTOM-99',
    rawDescription: 'PVC CONDUIT 20MM CLASS 4 BS 4607',
    baselinePcsH: 170,
    dailyTargetPcs: 4080,
    approvedDate: '2026-10-26'
  }
];

const wb = exportStandardsToWorkbook(testEntries, undefined, mockMatrix);
assert.ok(wb.SheetNames.includes('Machine_Mold_Standards'), 'Sheet name must be Machine_Mold_Standards');
const ws = wb.Sheets['Machine_Mold_Standards'];
const sheetRows = XLSX.utils.sheet_to_json(ws);
assert.equal(sheetRows.length, 2, 'Must contain 2 exported standard rows');

// Verify column headers and field contents
const firstRow = sheetRows[0];
assert.ok('Machine Line' in firstRow, 'Column Machine Line must exist');
assert.ok('Product Code' in firstRow, 'Column Product Code must exist');
assert.ok('Raw Description' in firstRow, 'Column Raw Description must exist');
assert.ok('Approved Real Rate (Pcs/h)' in firstRow, 'Column Approved Real Rate (Pcs/h) must exist');
assert.ok('Daily Target (24h)' in firstRow, 'Column Daily Target (24h) must exist');
assert.ok('Printed SOP Target (85%)' in firstRow, 'Column Printed SOP Target (85%) must exist');
assert.ok('Updated / Created Timestamp' in firstRow, 'Column Updated / Created Timestamp must exist');

assert.equal(firstRow['Machine Line'], 'L-02 - KTS 170');
assert.equal(firstRow['Product Code'], '255');
assert.equal(firstRow['Raw Description'], 'uPVC PIPE 50x2.4 PN-10 SASO-ISO 1452-2');
assert.equal(firstRow['Approved Real Rate (Pcs/h)'], 250);
assert.equal(firstRow['Daily Target (24h)'], 6000);
assert.equal(firstRow['Printed SOP Target (85%)'], 294); // Math.round(250 / 0.85)
assert.equal(firstRow['Updated / Created Timestamp'], '2026-10-25');

const secondRow = sheetRows[1];
assert.equal(secondRow['Product Code'], 'CUSTOM-99');
assert.equal(secondRow['Raw Description'], 'PVC CONDUIT 20MM CLASS 4 BS 4607');

// Verify auto-adjusted column widths (!cols)
assert.ok(Array.isArray(ws['!cols']), 'Column width settings !cols must be defined');
assert.equal(ws['!cols'].length, 7, 'Must define width for all 7 columns including Raw Description');
ws['!cols'].forEach(col => {
  assert.ok(col.wch >= 14, 'Column width should be at least 14 characters');
});
console.log('Test 19 Passed: exportStandardsToWorkbook generates clean Machine_Mold_Standards sheet with Raw Description & 7 columns.');

// 20. Export Standards to Excel (.xlsx) filename pattern & fallback
const exportResult = exportStandardsToExcel(testEntries, undefined, null, mockMatrix);
assert.ok(exportResult.wb, 'Must return workbook object');
const todayDateStr = new Date().toISOString().slice(0, 10);
assert.equal(
  exportResult.filename,
  `Machine_Mold_Standards_Catalog_${todayDateStr}.xlsx`,
  'Default filename must match Machine_Mold_Standards_Catalog_YYYY-MM-DD.xlsx'
);
if (fs.existsSync(exportResult.filename)) {
  fs.unlinkSync(exportResult.filename);
}

// Empty entries handling
const emptyWb = exportStandardsToWorkbook([]);
assert.ok(emptyWb.SheetNames.includes('Machine_Mold_Standards'));
const emptyWs = emptyWb.Sheets['Machine_Mold_Standards'];
assert.ok(emptyWs, 'Empty sheet must exist');
console.log('Test 20 Passed: exportStandardsToExcel generates default filename pattern and handles empty lists safely.');

// 21. Zero literal Arabic characters check in updated standards files
const filesToCheck = [
  'src/logic/standardCatalogHelper.js',
  'src/components/daily-evaluation/BaselineCatalogModal.jsx',
  'src/components/daily-evaluation/DailyEvaluationView.jsx',
  'src/App.jsx',
  'src/styles/dailyEvaluation.css'
];
const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
for (const relPath of filesToCheck) {
  const code = fs.readFileSync(relPath, 'utf8');
  assert.equal(
    arabicRegex.test(code),
    false,
    `File ${relPath} must contain ZERO literal Arabic characters (use \\u06xx unicode escapes only)`
  );
}
console.log('Test 21 Passed: Zero literal Arabic characters verified across all modified standards files.');

console.log('--- ALL STANDARD BASELINE CATALOG & SOP TESTS PASSED (21/21) ---');

