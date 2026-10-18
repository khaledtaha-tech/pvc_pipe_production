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
import { getAvailableProductsCatalog, resolveStdWeightFromSpecs } from '../../src/logic/legacySopHelper.js';
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
console.log('Test 1 Passed: Initial catalog successfully bootstrapped.');

// 2. On-the-Fly Creation Test (e.g. Item Code 188)
console.log('Test 2: On-the-fly product creation (Item Code 188)');
const newProduct188 = saveProduct({
  itemCode: '188',
  description: 'uPVC PIPE 160MM SDR 26 PN-10 SASO-ISO 1452',
  odMm: '160',
  wallThickness: '4.0mm',
  unitWeight: 3.45,
  pipeLength: 6.0,
  nominalSpeed: 2.5,
  targetPcsH: 25,
  source: 'manual'
}, { syncServer: false });

assert.strictEqual(newProduct188.itemCode, '188');
assert.strictEqual(newProduct188.unitWeight, 3.45);
assert.strictEqual(newProduct188.targetPcsH, 25);

// Immediate lookup by code
const fetched188 = getProductByCode('188');
assert.ok(fetched188, 'Code 188 should be immediately retrievable');
assert.strictEqual(fetched188.description, 'uPVC PIPE 160MM SDR 26 PN-10 SASO-ISO 1452');
assert.strictEqual(fetched188.unitWeight, 3.45);
console.log('Test 2 Passed: Code 188 created and retrieved on-the-fly.');

// 3. Leading Zero Tolerance & Case-Insensitive Lookup
console.log('Test 3: Leading zero tolerance & case-insensitivity');
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
assert.strictEqual(found188InCatalog.unitWeight, 3.45);

const found350InCatalog = dynamicCatalog.find((p) => p.itemCode === '350');
assert.ok(found350InCatalog, 'Excel ingested Item 350 must be present in dynamic catalog');

// Verify resolveStdWeightFromSpecs resolves newly created products
const resolvedWeight188 = resolveStdWeightFromSpecs({ itemCode: '188' }, 6.0);
assert.strictEqual(resolvedWeight188, 3.45, 'resolveStdWeightFromSpecs should dynamically resolve weight for code 188');
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

console.log('--- ALL DYNAMIC PRODUCT CATALOG TESTS PASSED SUCCESSFULLY! (8/8) ---');
