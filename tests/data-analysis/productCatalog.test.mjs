/**
 * Comprehensive Unit Tests for Dynamic Product Catalog Ingestion & Management
 * Verifies:
 * 1. Bootstrapping initial catalog from factory presets
 * 2. On-the-fly item creation (e.g. code 188) and immediate retrieval
 * 3. Case-insensitive lookup and leading zero tolerance
 * 4. Ingestion of "Unique Planning Catalog" Excel worksheet
 * 5. Automatic pending registration of newly observed product codes
 * 6. getAvailableProductsCatalog integration and dynamic updates
 * 7. Server sync payload structure and merge resilience
 */

import assert from 'node:assert';
import * as XLSX from 'xlsx';
import {
  getAllProducts,
  getProductByCode,
  saveProduct,
  upsertBatchProducts,
  autoRegisterPendingProduct,
  parseUniquePlanningCatalogSheet,
  getProductCatalogRegistry,
  syncProductsWithServer,
  PRODUCT_CATALOG_STORAGE_KEY
} from '../../src/logic/productCatalogHelper.js';
import {
  saveBaselineRate,
  getBaselineRate,
  getBaselineEntry,
  hasBaselineRate
} from '../../src/logic/standardCatalogHelper.js';
import { getAvailableProductsCatalog, resolveStdWeightFromSpecs, resolveSuggestedRate } from '../../src/logic/legacySopHelper.js';
import { parseExcelWorkbook } from '../../src/logic/excelParser.js';

console.log('--- Starting Dynamic Product Catalog Unit Tests ---');

// Setup mock in-memory localStorage
const mockStorageMap = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorageMap.get(key) || null,
  setItem: (key, val) => mockStorageMap.set(key, String(val)),
  removeItem: (key) => mockStorageMap.delete(key),
  clear: () => mockStorageMap.clear()
};

// 1. Initial Seeding Test
console.log('Test 1: Initial catalog bootstrap from factory presets');
const initialProducts = getAllProducts();
assert.ok(Array.isArray(initialProducts), 'getAllProducts should return an array');
assert.ok(initialProducts.length >= 20, `Initial products should have at least 20 items, got ${initialProducts.length}`);
const code249 = getProductByCode('249');
assert.ok(code249, 'Factory preset code 249 should exist');
assert.strictEqual(code249.itemCode, '249');
assert.strictEqual(code249.unitWeight, 2.65);

const code188 = getProductByCode('188');
assert.ok(code188, 'Factory preset code 188 should exist in initial seed');
assert.strictEqual(code188.itemCode, '188');
assert.strictEqual(code188.unitWeight, 7.85);
console.log('Test 1 Passed: Initial catalog successfully bootstrapped.');

// 2. On-the-Fly Creation Test (e.g. Item Code 189)
console.log('Test 2: On-the-fly product creation (Item Code 189)');
const newProduct189 = saveProduct({
  itemCode: '189',
  description: 'uPVC PIPE 160MM SDR 26 PN-10 SASO-ISO 1452',
  odMm: '160',
  wallThickness: '4.0mm',
  unitWeight: 3.45,
  pipeLength: 6.0,
  nominalSpeed: 2.5,
  targetPcsH: 25,
  source: 'manual'
}, { syncServer: false });

assert.strictEqual(newProduct189.itemCode, '189');
assert.strictEqual(newProduct189.unitWeight, 3.45);
assert.strictEqual(newProduct189.targetPcsH, 25);

// Immediate lookup by code
const fetched189 = getProductByCode('189');
assert.ok(fetched189, 'Code 189 should be immediately retrievable');
assert.strictEqual(fetched189.description, 'uPVC PIPE 160MM SDR 26 PN-10 SASO-ISO 1452');
assert.strictEqual(fetched189.unitWeight, 3.45);
console.log('Test 2 Passed: Code 189 created and retrieved on-the-fly.');

// 3. Leading Zero Tolerance & Case-Insensitive Lookup
console.log('Test 3: Leading zero tolerance & case-insensitivity');
const fetched0189 = getProductByCode('0189');
assert.ok(fetched0189, 'Leading zero variant 0189 should resolve to 189');
assert.strictEqual(fetched0189.itemCode, '189');

const fetched0188 = getProductByCode('0188');
assert.ok(fetched0188, 'Leading zero variant 0188 should resolve to 188');
assert.strictEqual(fetched0188.itemCode, '188');

const fetchedLowerComp = getProductByCode('comp-01');
assert.ok(fetchedLowerComp, 'Case-insensitive lookup for comp-01 should succeed');
assert.strictEqual(fetchedLowerComp.itemCode, 'COMP-01');
console.log('Test 3 Passed: Code normalization and leading zero tolerance verified.');

// 4. Automatic Speed & Hourly Pace Derivation
console.log('Test 4: Intercomputation of nominal speed and hourly pace');
const productWithSpeedOnly = saveProduct({
  itemCode: 'SPEED-TEST',
  description: 'Speed to pace test pipe',
  pipeLength: 6.0,
  nominalSpeed: 3.0 // 3 m/min * 60 / 6m = 30 pcs/h
}, { syncServer: false });
assert.strictEqual(productWithSpeedOnly.targetPcsH, 30, 'Nominal speed 3.0 m/min at 6m should derive 30 pcs/h');

const productWithPaceOnly = saveProduct({
  itemCode: 'PACE-TEST',
  description: 'Pace to speed test pipe',
  pipeLength: 6.0,
  targetPcsH: 40 // (40 * 6) / 60 = 4.0 m/min
}, { syncServer: false });
assert.strictEqual(productWithPaceOnly.nominalSpeed, 4.0, 'Hourly pace 40 pcs/h at 6m should derive 4.0 m/min');
console.log('Test 4 Passed: Speed and hourly pace auto-derivation verified.');

// 5. Unique Planning Catalog Sheet Parsing from Excel Workbook
console.log('Test 5: Unique Planning Catalog Excel workbook ingestion');
const wb = XLSX.utils.book_new();
const catalogRows = [
  {
    'Item Code': '350',
    'Product Description & Specs': 'uPVC PIPE 200X9.6MM PN-12.5 SASO-ISO 1452',
    'Pipe OD (mm) & Nominal Size': '200',
    'Wall Thickness / SDR': '9.6mm',
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '245.5 kg/hr',
    'Primary Extruder Recommendation': 'L-06 - KTS 700',
    'Primary Target Rate Band (kg/hr)': '230 - 260 kg/hr',
    'Alternative Extruder 1': 'L-03 - Kabra 90',
    'Alternative Rate Band 1 (kg/hr)': '200 - 230 kg/hr',
    'Alternative Extruder 2': 'L-07 - KTS 250 TDH',
    'Alternative Rate Band 2 (kg/hr)': '180 - 210 kg/hr'
  },
  {
    'Item Code': '351',
    'Product Description & Specs': 'uPVC PIPE 110X4.2MM PN-10 SASO-ISO 1452',
    'Pipe OD (mm) & Nominal Size': '110',
    'Wall Thickness / SDR': '4.2mm',
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '180 kg/hr',
    'Primary Extruder Recommendation': 'L-05 - KTS 200',
    'Primary Target Rate Band (kg/hr)': '170 - 190 kg/hr',
    'Alternative Extruder 1': 'L-04 - KTS 350',
    'Alternative Rate Band 1 (kg/hr)': '',
    'Alternative Extruder 2': '',
    'Alternative Rate Band 2 (kg/hr)': ''
  }
];

const ws = XLSX.utils.json_to_sheet(catalogRows);
XLSX.utils.book_append_sheet(wb, ws, 'Unique Planning Catalog');

const parseResult = parseUniquePlanningCatalogSheet(wb);
assert.strictEqual(parseResult.success, true);
assert.strictEqual(parseResult.count, 2);

const prod350 = getProductByCode('350');
assert.ok(prod350, 'Item 350 from Unique Planning Catalog should be registered');
assert.strictEqual(prod350.itemCode, '350');
assert.strictEqual(prod350.primaryExtruder, 'L-06 - KTS 700');
assert.ok(prod350.compatibleMachines.includes('L-03 - Kabra 90'));
assert.strictEqual(prod350.historicalRateKgH, 245.5);

const prod351 = getProductByCode('351');
assert.ok(prod351, 'Item 351 from Unique Planning Catalog should be registered');
assert.strictEqual(prod351.primaryExtruder, 'L-05 - KTS 200');
console.log('Test 5 Passed: Unique Planning Catalog parsed and ingested into registry.');

// 6. Resilient Fallback: Auto-Register Pending Product
console.log('Test 6: Auto-register pending unverified product from logs');
const pending = autoRegisterPendingProduct('UNKNOWN-999', 'Special Experimental Conduit 32mm', {
  unitWeight: 0.42,
  pipeLength: 6.0
});
assert.ok(pending, 'autoRegisterPendingProduct should create product entry');
assert.strictEqual(pending.itemCode, 'UNKNOWN-999');
assert.strictEqual(pending.isPending, true);
assert.strictEqual(pending.source, 'auto_discovery');

const fetchedPending = getProductByCode('UNKNOWN-999');
assert.ok(fetchedPending);
assert.strictEqual(fetchedPending.unitWeight, 0.42);

// Re-registering existing should not overwrite verified status
const verified = saveProduct({
  itemCode: 'VERIFIED-01',
  description: 'Verified Heavy Duty Pipe',
  unitWeight: 5.0,
  isPending: false,
  source: 'manual'
}, { syncServer: false });
assert.strictEqual(verified.isPending, false);

autoRegisterPendingProduct('VERIFIED-01', 'Verified Heavy Duty Pipe (Updated)', { unitWeight: 5.0 });
const reFetched = getProductByCode('VERIFIED-01');
assert.strictEqual(reFetched.isPending, false, 'Auto-register should not downgrade verified status to pending');
console.log('Test 6 Passed: Pending auto-registration and non-destructive merge verified.');

// 7. Dynamic getAvailableProductsCatalog Integration
console.log('Test 7: getAvailableProductsCatalog dynamic integration');
const dynamicCatalog = getAvailableProductsCatalog([], []);
const found188InCatalog = dynamicCatalog.find((p) => p.itemCode === '188');
assert.ok(found188InCatalog, 'Item 188 must be present in dynamic catalog');
assert.strictEqual(found188InCatalog.unitWeight, 7.85);

const found189InCatalog = dynamicCatalog.find((p) => p.itemCode === '189');
assert.ok(found189InCatalog, 'On-the-fly created Item 189 must be present in dynamic catalog');
assert.strictEqual(found189InCatalog.unitWeight, 3.45);

const found350InCatalog = dynamicCatalog.find((p) => p.itemCode === '350');
assert.ok(found350InCatalog, 'Excel ingested Item 350 must be present in dynamic catalog');

// Verify resolveStdWeightFromSpecs resolves newly created products
const resolvedWeight188 = resolveStdWeightFromSpecs({ itemCode: '188' }, 6.0);
assert.strictEqual(resolvedWeight188, 7.85, 'resolveStdWeightFromSpecs should dynamically resolve weight for code 188');

const resolvedWeight189 = resolveStdWeightFromSpecs({ itemCode: '189' }, 6.0);
assert.strictEqual(resolvedWeight189, 3.45, 'resolveStdWeightFromSpecs should dynamically resolve weight for code 189');
console.log('Test 7 Passed: getAvailableProductsCatalog and weight resolver dynamically reflect new items.');

// 8. Bidirectional Server Sync Test
console.log('Test 8: Bidirectional server sync simulation');
const mockRemoteData = {
  success: true,
  count: 1,
  products: [
    {
      itemCode: 'REMOTE-888',
      description: 'Central Remote Pipe 90mm PN-16',
      odMm: '90',
      wallThickness: '5.2mm',
      unitWeight: 2.15,
      pipeLength: 6.0,
      nominalSpeed: 3.2,
      targetPcsH: 32,
      isPending: false,
      source: 'central_db',
      updatedAt: '2026-10-18T10:00:00Z'
    }
  ]
};

// Mock fetch
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  if (method === 'GET') {
    return {
      ok: true,
      status: 200,
      json: async () => mockRemoteData
    };
  }
  if (method === 'POST') {
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, count: 1 })
    };
  }
  return { ok: false, status: 404 };
};

const syncRes = await syncProductsWithServer();
assert.strictEqual(syncRes.success, true);
assert.ok(syncRes.mergedCount >= 1);

const fetchedRemote = getProductByCode('REMOTE-888');
assert.ok(fetchedRemote, 'Remote product REMOTE-888 should be synced and stored in local registry');
assert.strictEqual(fetchedRemote.unitWeight, 2.15);

// Restore fetch
globalThis.fetch = originalFetch;
console.log('Test 8 Passed: Server sync and bidirectional merge verified.');

// 9. Conflict Resolution: Excel Master Wins on Technical Specs
console.log('Test 9: Conflict resolution - Excel master wins on technical specs');
// Pre-register product with outdated specs
saveProduct({
  itemCode: 'CR-SPEC-01',
  description: 'Old Legacy Spec Description',
  odMm: '110',
  wallThickness: '3.0mm',
  material: 'PVC',
  unitWeight: 1.20,
  pipeLength: 6.0,
  source: 'manual'
}, { syncServer: false });

const wbSpecs = XLSX.utils.book_new();
const specRows = [
  {
    'Item Code': 'CR-SPEC-01',
    'Product Description & Specs': 'uPVC PIPE 110X4.2MM PN-10 SASO-ISO 1452 (OFFICIAL MASTER)',
    'Pipe OD (mm) & Nominal Size': '110',
    'Wall Thickness / SDR': '4.2mm',
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '185 kg/hr',
    'Primary Extruder Recommendation': 'L-05 - KTS 200'
  }
];
const wsSpecs = XLSX.utils.json_to_sheet(specRows);
XLSX.utils.book_append_sheet(wbSpecs, wsSpecs, 'Unique Planning Catalog');

const specSyncResult = parseUniquePlanningCatalogSheet(wbSpecs);
assert.strictEqual(specSyncResult.success, true);
assert.strictEqual(specSyncResult.refreshedSpecsCount, 1, 'Should record 1 engineering spec refreshed');
assert.strictEqual(specSyncResult.newProductsCount, 0, 'Existing product should not count as new');

const updatedProduct = getProductByCode('CR-SPEC-01');
assert.strictEqual(updatedProduct.description, 'uPVC PIPE 110X4.2MM PN-10 SASO-ISO 1452 (OFFICIAL MASTER)');
assert.strictEqual(updatedProduct.wallThickness, '4.2mm');
assert.strictEqual(updatedProduct.material, 'uPVC');
console.log('Test 9 Passed: Excel master successfully overwrote technical specs.');

// 10. Conflict Resolution: Shop-Floor Manual Baselines Win 100% & Fallback for Uncalibrated Lines
console.log('Test 10: Conflict resolution - shop-floor manual baselines win 100%');
// 1. Manually calibrate L-06 for product CR-BASE-01 on shop floor
saveBaselineRate('L-06', 'CR-BASE-01', 45, 'Calibrated by Head of Production on shop floor');
assert.strictEqual(hasBaselineRate('L-06', 'CR-BASE-01'), true);
assert.strictEqual(getBaselineRate('L-06', 'CR-BASE-01'), 45);

// 2. Incoming Excel sheet provides generic/different rate for L-06 (e.g. ~25 pcs/h) and uncalibrated L-03
const wbBaseline = XLSX.utils.book_new();
const baselineRows = [
  {
    'Item Code': 'CR-BASE-01',
    'Product Description & Specs': 'uPVC PIPE 200X8.0MM PN-10',
    'Pipe OD (mm) & Nominal Size': '200',
    'Wall Thickness / SDR': '8.0mm',
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '200 kg/hr',
    'Primary Extruder Recommendation': 'L-06 - KTS 700',
    'Alternative Extruder 1': 'L-03 - Kabra 90',
    'Alternative Rate Band 1 (kg/hr)': '240 kg/hr'
  }
];
const wsBaseline = XLSX.utils.json_to_sheet(baselineRows);
XLSX.utils.book_append_sheet(wbBaseline, wsBaseline, 'Unique Planning Catalog');

const baselineSyncResult = parseUniquePlanningCatalogSheet(wbBaseline);
assert.strictEqual(baselineSyncResult.success, true);
assert.strictEqual(baselineSyncResult.protectedBaselinesCount, 1, 'Manual baseline on L-06 must be protected');

// Verify manual baseline on L-06 remains 45 pcs/h (100% protected, not overwritten by Excel)
const postSyncBaseline = getBaselineEntry('L-06', 'CR-BASE-01');
assert.strictEqual(postSyncBaseline.baselinePcsH, 45, 'Manual shop-floor baseline must remain exactly 45 pcs/h');
assert.strictEqual(postSyncBaseline.notes, 'Calibrated by Head of Production on shop floor');

// Verify uncalibrated line L-03 was initialized from Excel nominal values
const postSyncL03 = getBaselineEntry('L-03', 'CR-BASE-01');
assert.ok(postSyncL03, 'Uncalibrated line L-03 must be initialized');
assert.ok(postSyncL03.baselinePcsH > 0, 'Uncalibrated line L-03 must have positive rate');
assert.ok(postSyncL03.notes.includes('Initialized from Excel'), 'Uncalibrated line must note Excel initialization');
console.log('Test 10 Passed: Manual shop-floor baseline protected 100% and uncalibrated line initialized.');

// 11. Sync Audit Feedback Format & Silent Fallback on Zero-Delta Sync
console.log('Test 11: Sync audit feedback toast message and silent fallback on zero-delta');
// Ingestion with 1 new product, 1 refreshed spec, 1 protected baseline
saveProduct({
  itemCode: 'AUDIT-SPEC-OLD',
  description: 'Outdated Spec',
  odMm: '75',
  wallThickness: '2.0mm',
  material: 'uPVC',
  unitWeight: 0.9
}, { syncServer: false });
saveProduct({
  itemCode: 'AUDIT-BASE-01',
  description: 'Baseline Protected Product',
  odMm: '90',
  wallThickness: '3.5mm',
  material: 'uPVC',
  unitWeight: 1.15
}, { syncServer: false });
saveBaselineRate('L-06', 'AUDIT-BASE-01', 50, 'Shop floor override');

const wbAudit = XLSX.utils.book_new();
const auditRows = [
  {
    'Item Code': 'AUDIT-NEW-01', // New product
    'Product Description & Specs': 'Brand New Catalog Product',
    'Pipe OD (mm) & Nominal Size': '63',
    'Wall Thickness / SDR': '3.0mm',
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '150 kg/hr',
    'Primary Extruder Recommendation': 'L-05'
  },
  {
    'Item Code': 'AUDIT-SPEC-OLD', // Refreshed spec
    'Product Description & Specs': 'Refreshed Official Spec',
    'Pipe OD (mm) & Nominal Size': '75',
    'Wall Thickness / SDR': '2.5mm', // changed from 2.0mm
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '160 kg/hr',
    'Primary Extruder Recommendation': ''
  },
  {
    'Item Code': 'AUDIT-BASE-01', // Protected baseline
    'Product Description & Specs': 'Baseline Protected Product',
    'Pipe OD (mm) & Nominal Size': '90',
    'Wall Thickness / SDR': '3.5mm',
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '140 kg/hr',
    'Primary Extruder Recommendation': 'L-06'
  }
];
const wsAudit = XLSX.utils.json_to_sheet(auditRows);
XLSX.utils.book_append_sheet(wbAudit, wsAudit, 'Unique Planning Catalog');

const auditResult = parseUniquePlanningCatalogSheet(wbAudit);
assert.strictEqual(auditResult.newProductsCount, 1);
assert.strictEqual(auditResult.refreshedSpecsCount, 1);
assert.strictEqual(auditResult.protectedBaselinesCount, 1);
const expectedMessage = 'Catalog Sync Complete: 1 new products added, 1 engineering specs refreshed, 1 shop-floor baselines protected.';
assert.strictEqual(auditResult.auditMessage, expectedMessage);

// Test silent fallback when workbook has no changes or conflicts
const wbNoChanges = XLSX.utils.book_new();
const wsNoChanges = XLSX.utils.json_to_sheet([
  {
    'Item Code': 'AUDIT-SPEC-OLD',
    'Product Description & Specs': 'Refreshed Official Spec',
    'Pipe OD (mm) & Nominal Size': '75',
    'Wall Thickness / SDR': '2.5mm',
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '160 kg/hr',
    'Primary Extruder Recommendation': ''
  }
]);
XLSX.utils.book_append_sheet(wbNoChanges, wsNoChanges, 'Unique Planning Catalog');
const noChangeResult = parseUniquePlanningCatalogSheet(wbNoChanges);
assert.strictEqual(noChangeResult.newProductsCount, 0);
assert.strictEqual(noChangeResult.refreshedSpecsCount, 0);
assert.strictEqual(noChangeResult.protectedBaselinesCount, 0);
assert.strictEqual(noChangeResult.auditMessage, null, 'Zero delta sync must return null auditMessage for silent fallback');
console.log('Test 11 Passed: Sync audit feedback format and silent fallback verified.');

// 12. Historical Log & Finalized Report Immutability
console.log('Test 12: Historical production log and report archive immutability');
// Mock existing historical logs in storage
const testHistoricalLog = {
  id: 'HIST-2026-09-08-L06',
  date: '2026-09-08',
  lineId: 'L-06',
  itemCode: 'CR-SPEC-01',
  productionQty: 450,
  operatingHours: 24,
  totalWeight: 810,
  scrapKg: 12
};
mockStorageMap.set('pvc_saved_report_2026-09-08_L-06', JSON.stringify(testHistoricalLog));

// Ingest workbook with different catalog data
const wbHistTest = XLSX.utils.book_new();
const wsHistTest = XLSX.utils.json_to_sheet([
  {
    'Item Code': 'CR-SPEC-01',
    'Product Description & Specs': 'Engineering Spec Change Version 2',
    'Pipe OD (mm) & Nominal Size': '110',
    'Wall Thickness / SDR': '5.0mm',
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '210 kg/hr',
    'Primary Extruder Recommendation': 'L-06'
  }
]);
XLSX.utils.book_append_sheet(wbHistTest, wsHistTest, 'Unique Planning Catalog');
parseUniquePlanningCatalogSheet(wbHistTest);

// Verify historical log in storage remains 100% identical and untouched
const preservedLogRaw = mockStorageMap.get('pvc_saved_report_2026-09-08_L-06');
assert.ok(preservedLogRaw, 'Historical log archive must exist');
const preservedLog = JSON.parse(preservedLogRaw);
assert.strictEqual(preservedLog.productionQty, 450, 'Historical production qty must be immutable');
assert.strictEqual(preservedLog.totalWeight, 810, 'Historical total weight must be immutable');
assert.strictEqual(preservedLog.scrapKg, 12, 'Historical scrap must be immutable');
assert.strictEqual(preservedLog.operatingHours, 24, 'Historical operating hours must be immutable');
console.log('Test 12 Passed: Historical logs and archives remain 100% untouched and immutable.');

// 13. Fallback Seed Registration of Item 188
console.log('Test 13: Fallback seed registration of item 188');
const p188 = getProductByCode('188');
assert.ok(p188, 'Item 188 must be present in default seed catalog');
assert.strictEqual(p188.itemCode, '188');
assert.strictEqual(p188.description, 'MANARCO UPVC PIPE 3" SDR26 ASTM');
assert.strictEqual(p188.unitWeight, 7.85);
assert.strictEqual(p188.stdWeight, 7.85);
assert.strictEqual(p188.pipeLength, 6.0);
assert.strictEqual(p188.targetPcsH, 25);
assert.strictEqual(p188.primaryExtruder, 'L-05');
assert.strictEqual(p188.material, 'uPVC');
console.log('Test 13 Passed: Item 188 fallback seed registration verified.');

// 14. Dynamic SOP Dropdown Formatting & Nominal Specs Auto-Population
console.log('Test 14: Dynamic SOP dropdown option formatting & spec auto-population for item 188');
const availableCatalog = getAvailableProductsCatalog([]);
const foundInCatalog = availableCatalog.find((x) => x.itemCode === '188');
assert.ok(foundInCatalog, 'Item 188 must be present in getAvailableProductsCatalog');
assert.strictEqual(foundInCatalog.description, 'MANARCO UPVC PIPE 3" SDR26 ASTM');

// Verify dropdown label formatting strictly without truncation
const dropdownLabel = `${foundInCatalog.itemCode}${foundInCatalog.description ? ` — ${foundInCatalog.description}` : ''}`;
assert.strictEqual(dropdownLabel, '188 — MANARCO UPVC PIPE 3" SDR26 ASTM');

// Verify auto-population of nominal specs when 188 is selected
const resolvedLength = foundInCatalog.pipeLength !== undefined ? Number(foundInCatalog.pipeLength) : 6.0;
assert.strictEqual(resolvedLength, 6.0, 'Length must resolve to 6.0m');

const resolvedStdWeight = Number(foundInCatalog.unitWeight || foundInCatalog.stdWeight);
assert.strictEqual(resolvedStdWeight, 7.85, 'Standard weight must resolve to 7.85 kg');

const suggestedPace = resolveSuggestedRate('L-05', '188', {
  matchedProduct: foundInCatalog,
  pipeLength: resolvedLength,
  unitWeight: resolvedStdWeight,
  nominalCapacity: 200
});
assert.strictEqual(suggestedPace, 25, 'Suggested pace must resolve to 25 pcs/h');
console.log('Test 14 Passed: SOP dropdown formatting and spec auto-population verified.');

// 15. Dynamic Workbook Ingestion of "Unique Planning Catalog" with SDR26 Wall Thickness
console.log('Test 15: Ingestion of Unique Planning Catalog worksheet with SDR26 wall thickness');
const wbSdrTest = XLSX.utils.book_new();
const wsSdrTest = XLSX.utils.json_to_sheet([
  {
    'Item Code': '188',
    'Product Description & Specs': 'MANARCO UPVC PIPE 3" SDR26 ASTM',
    'Pipe OD (mm) & Nominal Size': '88.9 mm (3")',
    'Wall Thickness / SDR': 'SDR26',
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '200 kg/hr',
    'Primary Extruder Recommendation': 'L-05',
    'Primary Target Rate Band (kg/hr)': '200 - 240 kg/hr'
  }
]);
XLSX.utils.book_append_sheet(wbSdrTest, wsSdrTest, 'Unique Planning Catalog');

const sdrIngestResult = parseUniquePlanningCatalogSheet(wbSdrTest);
assert.strictEqual(sdrIngestResult.success, true);
assert.strictEqual(sdrIngestResult.sheetFound, true);

const ingested188 = getProductByCode('188');
assert.ok(ingested188, 'Ingested 188 must exist in registry');
assert.strictEqual(ingested188.odMm, '88.9');
assert.strictEqual(ingested188.wallThickness, 'SDR26');
// Theoretical weight for 88.9mm OD x SDR26 (3.42mm wall) x 6m is 7.82-7.85 kg
assert.ok(ingested188.unitWeight >= 7.8 && ingested188.unitWeight <= 7.9, `Unit weight ${ingested188.unitWeight} should be ~7.85 kg`);
console.log('Test 15 Passed: Unique Planning Catalog ingestion with SDR26 verified.');

console.log('--- ALL DYNAMIC PRODUCT CATALOG TESTS PASSED SUCCESSFULLY! (15/15) ---');


