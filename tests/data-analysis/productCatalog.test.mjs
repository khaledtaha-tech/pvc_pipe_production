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
  PRODUCT_CATALOG_STORAGE_KEY,
  formatSourceOriginLabel,
  getSourceOriginBadgeTheme,
  PROVENANCE_AUDIT_STORAGE_KEY,
  transformProductToProvenanceAuditItem,
  generateProvenanceAuditSnapshot,
  saveProvenanceAuditSnapshot,
  getProvenanceAuditSnapshot,
  formatProvenanceAuditFilename,
  convertProvenanceSnapshotToCsv,
  isValidProductCode,
  extractProductDimensions,
  normalizePipeUnitWeight,
  purgeInvalidCatalogItems
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

// 16. Data Provenance Tracking & Source Attribution Verification
console.log('Test 16: Data provenance tracking & source attribution metadata integrity');

// 16.1 Seed product provenance
const seed249 = getProductByCode('249');
assert.ok(seed249, 'Preset code 249 should exist');
assert.strictEqual(seed249.source_origin, 'preset_seed', 'Preset origin must be preset_seed');
assert.strictEqual(seed249.source_file, 'System Defaults', 'Preset source file must be System Defaults');
assert.strictEqual(seed249.source_sheet, 'Factory Presets', 'Preset source sheet must be Factory Presets');
assert.ok(seed249.last_updated_at, 'last_updated_at must be populated on seed preset');

// 16.2 Ingested planning catalog provenance
const wbProvTest = XLSX.utils.book_new();
const wsProvTest = XLSX.utils.json_to_sheet([
  {
    'Item Code': '350',
    'Product Description & Specs': 'UPVC PIPE 250MM SDR 33 CLASS 2',
    'Pipe OD (mm) & Nominal Size': '250',
    'Wall Thickness / SDR': 'SDR33',
    'Material': 'uPVC',
    'Evaluated Historical Output Rate (Average/Typical kg/hr)': '300 kg/hr',
    'Primary Extruder Recommendation': 'L-06',
    'Primary Target Rate Band (kg/hr)': '280 - 320 kg/hr'
  }
]);
XLSX.utils.book_append_sheet(wbProvTest, wsProvTest, 'Unique Planning Catalog');

const testFileName = 'AlManar_Master_v9.xlsb';
parseUniquePlanningCatalogSheet(wbProvTest, { fileName: testFileName });
const item350 = getProductByCode('350');
assert.ok(item350, 'Item 350 should exist after ingestion');
assert.strictEqual(item350.source_origin, 'planning_catalog', 'Origin must be planning_catalog');
assert.strictEqual(item350.source_file, testFileName, 'Source file must match options.fileName');
assert.strictEqual(item350.source_sheet, 'Unique Planning Catalog', 'Source sheet must match sheetName');
assert.ok(item350.last_updated_at, 'last_updated_at must be set');

// 16.3 Manual override provenance
const manualItem = saveProduct({
  itemCode: '999',
  description: 'EXPERIMENTAL SPECIAL PROFILE 50MM',
  unitWeight: 1.25,
  pipeLength: 6.0,
  source_origin: 'manual_override',
  source_file: 'manual_floor_input',
  source_sheet: 'Shift 1 Calibration'
}, { syncServer: false });

assert.strictEqual(manualItem.source_origin, 'manual_override');
assert.strictEqual(manualItem.source_file, 'manual_floor_input');
assert.strictEqual(manualItem.source_sheet, 'Shift 1 Calibration');
assert.ok(manualItem.last_updated_at);

// 16.4 Daily production log discovery provenance
const dailyDiscovered = autoRegisterPendingProduct('777', 'AUTOMATIC DISCOVERED 75MM', {
  unitWeight: 2.1,
  source_origin: 'daily_log',
  source_file: 'Daily_Production_2026_10_18.xlsx',
  source_sheet: 'Daily Production Log'
});

assert.strictEqual(dailyDiscovered.source_origin, 'daily_log');
assert.strictEqual(dailyDiscovered.source_file, 'Daily_Production_2026_10_18.xlsx');
assert.strictEqual(dailyDiscovered.source_sheet, 'Daily Production Log');

// 16.5 Provenance label and badge theme helpers
assert.strictEqual(formatSourceOriginLabel('planning_catalog'), 'Excel Planning Catalog');
assert.strictEqual(formatSourceOriginLabel('daily_log'), 'Daily Production Log');
assert.strictEqual(formatSourceOriginLabel('manual_override'), 'Manual Floor Override');
assert.strictEqual(formatSourceOriginLabel('preset_seed'), 'System Default Seed');

const catalogTheme = getSourceOriginBadgeTheme('planning_catalog');
assert.strictEqual(catalogTheme.label, 'Excel Planning Catalog');
assert.strictEqual(catalogTheme.tag, 'From Catalog: Unique Planning Catalog');

const overrideTheme = getSourceOriginBadgeTheme('manual_override');
assert.strictEqual(overrideTheme.label, 'Manual Floor Override');
assert.strictEqual(overrideTheme.tag, 'Calibrated Floor Override');

console.log('Test 16 Passed: Data provenance tracking & source attribution metadata integrity verified.');

// 17. One-Click Export & Diagnostic Snapshot Verification
console.log('Test 17: One-click export snapshot and dual sync persistence');

assert.strictEqual(PROVENANCE_AUDIT_STORAGE_KEY, 'pvc_provenance_latest_audit');

// 17.1 Verify item transformation schema
const item188 = getProductByCode('188');
assert.ok(item188, 'Item 188 must exist');
const transformed188 = transformProductToProvenanceAuditItem(item188);

assert.strictEqual(transformed188.item_code, '188');
assert.strictEqual(transformed188.description, 'MANARCO UPVC PIPE 3" SDR26 ASTM');
assert.strictEqual(transformed188.od_mm, 88.9);
assert.strictEqual(transformed188.sdr, 'SDR26');
assert.strictEqual(transformed188.wall_thickness_mm, 3.42);
assert.strictEqual(transformed188.std_weight_kg, 7.85);
assert.strictEqual(transformed188.suggested_pace_pcs_h, 25);
assert.strictEqual(transformed188.source_origin, 'planning_catalog');
assert.strictEqual(transformed188.source_file, 'Unique_Planning_Catalog.xlsx');
assert.strictEqual(transformed188.source_sheet, 'Unique Planning Catalog');
assert.ok(transformed188.last_updated_at, 'last_updated_at must exist');

// Verify preset seed transformation schema
const seedProduct249 = getProductByCode('249');
assert.ok(seedProduct249, 'Seed item 249 must exist');
const transformed249 = transformProductToProvenanceAuditItem(seedProduct249);
assert.strictEqual(transformed249.item_code, '249');
assert.strictEqual(transformed249.source_origin, 'preset_seed');
assert.strictEqual(transformed249.source_file, 'System Defaults');
assert.strictEqual(transformed249.source_sheet, 'Factory Presets');
assert.ok(transformed249.last_updated_at, 'last_updated_at must exist');

// 17.2 Verify full audit snapshot generation and dual persistence
const snapshot = generateProvenanceAuditSnapshot();
assert.ok(Array.isArray(snapshot), 'Snapshot must be an array');
assert.ok(snapshot.length >= 20, 'Snapshot must contain all registered products');
const found188InSnapshot = snapshot.find((x) => x.item_code === '188');
assert.ok(found188InSnapshot, 'Item 188 must be in generated snapshot');

// Verify dual persistence in localStorage
saveProvenanceAuditSnapshot();
const rawStorageAudit = globalThis.localStorage.getItem(PROVENANCE_AUDIT_STORAGE_KEY);
assert.ok(rawStorageAudit, 'Storage key pvc_provenance_latest_audit must exist');
const parsedAudit = JSON.parse(rawStorageAudit);
assert.ok(Array.isArray(parsedAudit), 'Cached audit must be an array');
assert.strictEqual(parsedAudit.length, snapshot.length);

const retrievedSnapshot = getProvenanceAuditSnapshot();
assert.strictEqual(retrievedSnapshot.length, snapshot.length);

// 17.3 Verify filename format
const testDate = new Date('2026-10-18T12:30:00Z');
const jsonFilename = formatProvenanceAuditFilename(testDate, 'json');
assert.ok(
  /^Catalog_Provenance_Audit_\d{4}-\d{2}-\d{2}_\d{4}\.json$/.test(jsonFilename),
  `Filename ${jsonFilename} must match Catalog_Provenance_Audit_YYYY-MM-DD_HHmm.json`
);

const csvFilename = formatProvenanceAuditFilename(testDate, 'csv');
assert.ok(
  /^Catalog_Provenance_Audit_\d{4}-\d{2}-\d{2}_\d{4}\.csv$/.test(csvFilename),
  `Filename ${csvFilename} must match Catalog_Provenance_Audit_YYYY-MM-DD_HHmm.csv`
);

// 17.4 Verify CSV conversion
const csvContent = convertProvenanceSnapshotToCsv(snapshot.slice(0, 3));
assert.ok(csvContent.includes('item_code,description,od_mm,sdr'), 'CSV must include standard header row');
assert.ok(csvContent.split('\r\n').length >= 4, 'CSV must have headers and data rows');

console.log('Test 17 Passed: One-click export snapshot and dual sync persistence verified.');

// 18. Garbage Row Filtering & Phantom SKU Rejection
console.log('Test 18: Garbage row filtering & phantom code rejection');
assert.strictEqual(isValidProductCode('s'), false, 'Single letter "s" must be rejected');
assert.strictEqual(isValidProductCode('x'), false, 'Single letter "x" must be rejected');
assert.strictEqual(isValidProductCode('Dear Sir As Per the plan...'), false, 'Email conversational text must be rejected');
assert.strictEqual(isValidProductCode('Item Code'), false, 'Header "Item Code" must be rejected');
assert.strictEqual(isValidProductCode('Total'), false, 'Summary footer "Total" must be rejected');
assert.strictEqual(isValidProductCode('Grand Total'), false, 'Summary footer "Grand Total" must be rejected');
assert.strictEqual(isValidProductCode('-'), false, 'Punctuation "-" must be rejected');
assert.strictEqual(isValidProductCode(''), false, 'Empty code must be rejected');

// Legitimate codes must be accepted
assert.strictEqual(isValidProductCode('188'), true, 'Item 188 must be valid');
assert.strictEqual(isValidProductCode('195'), true, 'Item 195 must be valid');
assert.strictEqual(isValidProductCode('249'), true, 'Item 249 must be valid');
assert.strictEqual(isValidProductCode('247 R'), true, 'Alphanumeric item 247 R must be valid');
assert.strictEqual(isValidProductCode('COMP-01'), true, 'Alphanumeric item COMP-01 must be valid');

// Test autoRegisterPendingProduct rejects phantom "s"
const rejectedS = autoRegisterPendingProduct('s', 'Dear Sir As Per the plan...');
assert.strictEqual(rejectedS, null, 'autoRegisterPendingProduct must return null for invalid code "s"');

// Test purgeInvalidCatalogItems eliminates existing corrupted entries
const dirtyRegistry = { ...getProductCatalogRegistry() };
dirtyRegistry['s'] = {
  itemCode: 's',
  description: 'Dear Sir As Per the plan...',
  unitWeight: 0,
  stdWeight: 0,
  source_origin: 'daily_log'
};
globalThis.localStorage.setItem(PRODUCT_CATALOG_STORAGE_KEY, JSON.stringify(dirtyRegistry));
const purgedCount = purgeInvalidCatalogItems();
assert.ok(purgedCount >= 1, 'purgeInvalidCatalogItems must purge at least 1 invalid item');
const cleanedRegistry = getProductCatalogRegistry();
assert.strictEqual(cleanedRegistry['s'], undefined, 'Phantom item "s" must not exist in cleaned registry');
assert.strictEqual(getProductByCode('s'), null, 'getProductByCode("s") must return null');
console.log('Test 18 Passed: Garbage rows and phantom codes strictly rejected and purged.');

// 19. Auto-Extraction of Engineering Dimensions (OD & Wall Thickness)
console.log('Test 19: Auto-extraction of engineering dimensions');

// Metric OD & Wall Thickness from description e.g. 110x5.3
const dims110 = extractProductDimensions({ description: 'uPVC PIPE 110x5.3 PN-12.5 SASO-ISO 1452-2' });
assert.strictEqual(dims110.od_mm, 110, 'OD must be extracted as 110 mm');
assert.strictEqual(dims110.wall_thickness_mm, 5.3, 'Wall thickness must be extracted as 5.3 mm');

// Secondary MM pattern e.g. 160MM ... 7.7MM
const dims160 = extractProductDimensions({ description: 'uPVC PIPE 160MM SASO-ISO 1452-2 PN12.5 7.7MM R/R' });
assert.strictEqual(dims160.od_mm, 160, 'OD must be extracted as 160 mm');
assert.strictEqual(dims160.wall_thickness_mm, 7.7, 'Wall thickness must be extracted as 7.7 mm');

// Imperial OD with SDR computation e.g. 4" SDR 26 -> OD 114.3mm, Wall 114.3/26 = 4.40mm
const dims4Inch = extractProductDimensions({ description: 'PVC 4" PIPE SDR 26 ASTMD 2241' });
assert.strictEqual(dims4Inch.od_mm, 114.3, '4" OD must be 114.3 mm');
assert.strictEqual(dims4Inch.sdr, 'SDR26', 'SDR must be SDR26');
assert.strictEqual(dims4Inch.wall_thickness_mm, 4.40, 'Wall thickness for 4" SDR 26 must be 4.40 mm');

// Imperial OD with SDR computation e.g. 3" SDR26 -> OD 88.9mm, Wall 88.9/26 = 3.42mm
const dims3Inch = extractProductDimensions({ description: 'MANARCO UPVC PIPE 3" SDR26 ASTM' });
assert.strictEqual(dims3Inch.od_mm, 88.9, '3" OD must be 88.9 mm');
assert.strictEqual(dims3Inch.sdr, 'SDR26', 'SDR must be SDR26');
assert.strictEqual(dims3Inch.wall_thickness_mm, 3.42, 'Wall thickness for 3" SDR 26 must be 3.42 mm');

// ASTM Schedule e.g. 3/4" SCH40 -> OD 26.7mm, Wall 2.87mm
const dimsSch40 = extractProductDimensions({ description: 'PVC PIPE 3/4"SCH40' });
assert.strictEqual(dimsSch40.od_mm, 26.7, '3/4" OD must be 26.7 mm');
assert.strictEqual(dimsSch40.wall_thickness_mm, 2.87, '3/4" SCH40 wall thickness must be 2.87 mm');

// Pattern with PN and explicit MM e.g. 75MM PN10X3.6MM
const dims75 = extractProductDimensions({ description: 'uPVC PIPE 75MM PN10X3.6MM SASO-ISO-1452-2' });
assert.strictEqual(dims75.od_mm, 75, 'OD must be 75 mm');
assert.strictEqual(dims75.wall_thickness_mm, 3.6, 'Wall thickness must be 3.6 mm');

console.log('Test 19 Passed: Engineering dimensions successfully auto-extracted across metric and imperial specs.');

// 20. Metric Weight Unit Normalization
console.log('Test 20: Metric weight unit normalization');

// Item 195 preset verification: 6m full pipe piece weight must be 5.70 kg (not linear 0.95 kg)
const item195 = getProductByCode('195');
assert.ok(item195, 'Item 195 must exist');
assert.strictEqual(item195.unitWeight, 5.70, 'Item 195 unit weight must be normalized to 5.70 kg for 6m pipe');
assert.strictEqual(item195.stdWeight, 5.70, 'Item 195 std weight must be normalized to 5.70 kg for 6m pipe');
const audit195 = transformProductToProvenanceAuditItem(item195);
assert.strictEqual(audit195.std_weight_kg, 5.70, 'Audit item 195 std_weight_kg must be 5.70');
assert.strictEqual(audit195.od_mm, 75, 'Audit item 195 od_mm must be 75');
assert.strictEqual(audit195.wall_thickness_mm, 2.2, 'Audit item 195 wall_thickness_mm must be 2.2');

// normalizePipeUnitWeight function tests
// 1. Pipe OD >= 75mm with suspiciously low weight (< 1.5 kg) is multiplied by 6.0m
const normLowWeight = normalizePipeUnitWeight(0.95, 75, 6.0, false);
assert.strictEqual(normLowWeight, 5.70, '0.95 kg/m for 75mm pipe must normalize to 5.70 kg');

// 2. Already normalized pipe weight (e.g. item 249 at 2.65 kg) is NOT altered
const normStandardWeight = normalizePipeUnitWeight(2.65, 110, 6.0, false);
assert.strictEqual(normStandardWeight, 2.65, 'Standard weight 2.65 kg must not be altered');

// 3. Small diameter conduit (e.g. 20mm with 0.55 kg) is NOT altered
const normConduitWeight = normalizePipeUnitWeight(0.55, 20, 6.0, false);
assert.strictEqual(normConduitWeight, 0.55, 'Conduit weight 0.55 kg must not be altered');

// 4. Compounding (e.g. 25.0 kg) is NOT altered
const normCompound = normalizePipeUnitWeight(25.0, null, 0, true);
assert.strictEqual(normCompound, 25.0, 'Compounding 25 kg must not be altered');

console.log('Test 20 Passed: Metric weights normalized to full 6m piece weights accurately.');

// 21. Provenance Metadata Tagging Fix for Daily Production Logs
console.log('Test 21: Provenance metadata tagging fix for daily logs');

// Ingest a dynamic pending item simulating daily shift log
const dynamicDailyProd = autoRegisterPendingProduct('199', 'uPVC PIPE 90MM PN10X4.3MM SASO-ISO-1452-2', {
  source_origin: 'daily_log',
  source_file: 'AlManar_Daily_Log_Shift1.xlsb',
  source_sheet: 'Daily Shift Log'
});
assert.ok(dynamicDailyProd, 'Dynamic product 199 must be created');
assert.strictEqual(dynamicDailyProd.source_origin, 'daily_log');
assert.strictEqual(dynamicDailyProd.source_file, 'AlManar_Daily_Log_Shift1.xlsb');
assert.strictEqual(dynamicDailyProd.source_sheet, 'Daily Shift Log');

// Verify audit snapshot transformation never reports "Unique Planning Catalog" for daily logs
const audit199 = transformProductToProvenanceAuditItem(dynamicDailyProd);
assert.strictEqual(audit199.source_origin, 'daily_log');
assert.strictEqual(audit199.source_file, 'AlManar_Daily_Log_Shift1.xlsb');
assert.strictEqual(audit199.source_sheet, 'Daily Shift Log');
assert.notStrictEqual(audit199.source_file, 'Unique Planning Catalog', 'source_file must never be Unique Planning Catalog for daily_log');

// Verify fallback behavior when source_file was unassigned or mistakenly defaulted to Unique Planning Catalog
const testLogFallback = transformProductToProvenanceAuditItem({
  itemCode: '201',
  description: 'uPVC PIPE 63x3.0 PN-10',
  source_origin: 'daily_log',
  source_file: 'Unique Planning Catalog', // erroneous legacy setting
  source_sheet: 'Unique Planning Catalog'
});
assert.strictEqual(testLogFallback.source_origin, 'daily_log');
assert.strictEqual(testLogFallback.source_file, 'Daily Production Log', 'Erronous fallback must be corrected to Daily Production Log');
assert.strictEqual(testLogFallback.source_sheet, 'Daily Shift Log', 'Erronous fallback must be corrected to Daily Shift Log');

console.log('Test 21 Passed: Daily log provenance tagging strictly enforced.');

console.log('--- ALL DYNAMIC PRODUCT CATALOG TESTS PASSED SUCCESSFULLY! (21/21) ---');




