import assert from 'assert';
import fs from 'fs';
import path from 'path';

import {
  parseMessyProductDescription,
  buildCanonicalProductName,
  checkSpecificationVariance,
  harmonizeCatalogItem,
  applyResolutionAction,
  exportCleanSpringWorkbook,
  loadHarmonizerSandboxState,
  saveHarmonizerSandboxState,
  clearHarmonizerSandboxState,
  promoteToMasterCatalog
} from '../../src/logic/catalogHarmonizer.js';

import { getAllProducts, getProductByCode } from '../../src/logic/productCatalogHelper.js';

console.log('--- Starting Catalog Harmonizer Lab Unit Tests ---');

// Test 1: Decomposing messy Al-Manar strings into structured fields
console.log('Test 1: Decomposing messy strings into structured fields');
const case1 = parseMessyProductDescription('PVC PIPE 75X3.6MM PN10 CL4 DIN 8062 S/C 6.0M', '075-PN10');
assert.strictEqual(case1.productType, 'PVC PIPE');
assert.strictEqual(case1.odMm, 75);
assert.strictEqual(case1.wallThicknessMm, 3.6);
assert.strictEqual(case1.ratingClass, 'PN10 CL4');
assert.strictEqual(case1.standard, 'DIN 8062');
assert.strictEqual(case1.joint, 'S/C');
assert.strictEqual(case1.lengthM, 6.0);

const case2 = parseMessyProductDescription('PVC PIPE 4 INCH X 6.0MM SCH40 DWV ASTM D2665 P/E', '004-SCH40');
assert.strictEqual(case2.productType, 'PVC PIPE');
assert.strictEqual(case2.sizeDisplay, '4"');
assert.strictEqual(case2.odMm, 114.3);
assert.strictEqual(case2.wallThicknessMm, 6.0);
assert.ok(case2.ratingClass.includes('SCH40'));
assert.strictEqual(case2.standard, 'ASTM D2665');
assert.strictEqual(case2.joint, 'P/E');

const case3 = parseMessyProductDescription('PVC PIPE 160MM SASO-ISO 1452-2 PN12.5 7.7MM R/R', '160-PN125');
assert.strictEqual(case3.productType, 'PVC PIPE');
assert.strictEqual(case3.odMm, 160);
assert.strictEqual(case3.wallThicknessMm, 7.7);
assert.strictEqual(case3.ratingClass, 'PN12.5');
assert.strictEqual(case3.standard, 'SASO-ISO 1452-2');
assert.strictEqual(case3.joint, 'R/R');
console.log('Test 1 Passed: Decomposed strings successfully.');

// Test 2: Standardized canonical name generation template
console.log('Test 2: Standardized canonical name generation template');
const canonical1 = buildCanonicalProductName({
  productType: 'PVC PIPE',
  sizeDisplay: '110',
  wallThicknessMm: 5.3,
  ratingClass: 'PN10',
  standard: 'SASO-ISO 1452-2',
  joint: 'R/R',
  lengthM: 6.0
});
assert.strictEqual(canonical1, 'PVC PIPE 110 x 5.3mm PN10 SASO-ISO 1452-2 R/R 6.0M');

const canonical2 = buildCanonicalProductName({
  productType: 'PVC PIPE',
  sizeDisplay: '4"',
  wallThicknessMm: 6.0,
  ratingClass: 'SCH40',
  standard: 'ASTM D2665',
  joint: 'P/E',
  lengthM: 6.0
});
assert.strictEqual(canonical2, 'PVC PIPE 4" x 6.0mm SCH40 ASTM D2665 P/E 6.0M');
console.log('Test 2 Passed: Canonical name generated exactly matching template.');

// Test 3: Detecting 5.2mm vs 5.3mm specification variance for OD 110 PN10
console.log('Test 3: Detecting 5.2mm vs 5.3mm specification variance for OD 110 PN10');
const varianceItem = harmonizeCatalogItem({
  itemCode: '110-PN10-COMM',
  description: 'PVC PIPE 110X5.2MM PN10 SASO-ISO 1452-2 R/R'
});
assert.strictEqual(varianceItem.hasVariance, true);
assert.strictEqual(varianceItem.status, 'variance');
assert.strictEqual(varianceItem.wallThicknessMm, 5.2);
assert.strictEqual(varianceItem.officialStandardWtMm, 5.3);
assert.strictEqual(varianceItem.varianceDiffMm, -0.1);
assert.ok(varianceItem.conflictNotes.includes('deviates from official'));
console.log('Test 3 Passed: 5.2mm vs 5.3mm variance flagged accurately.');

// Test 4: "Keep Factory Dimension (Commercial Override)" Action
console.log('Test 4: Keep Factory Dimension (Commercial Override) action');
const keptItem = applyResolutionAction(varianceItem, 'keep_factory');
assert.strictEqual(keptItem.status, 'overridden');
assert.strictEqual(keptItem.actionTaken, 'kept_factory');
assert.strictEqual(keptItem.wallThicknessMm, 5.2);
assert.ok(keptItem.conflictNotes.includes('Commercial Override'));
assert.strictEqual(keptItem.canonicalDescription, 'PVC PIPE 110 x 5.2mm PN10 SASO-ISO 1452-2 R/R 6.0M');
console.log('Test 4 Passed: Factory dimension preserved with commercial override tag.');

// Test 5: "Snap to Official Standard" Action
console.log('Test 5: Snap to Official Standard action');
const snappedItem = applyResolutionAction(varianceItem, 'snap_standard');
assert.strictEqual(snappedItem.status, 'snapped');
assert.strictEqual(snappedItem.actionTaken, 'snapped_standard');
assert.strictEqual(snappedItem.wallThicknessMm, 5.3);
assert.strictEqual(snappedItem.canonicalDescription, 'PVC PIPE 110 x 5.3mm PN10 SASO-ISO 1452-2 R/R 6.0M');
assert.ok(snappedItem.conflictNotes.includes('Snapped to Official Standard'));
console.log('Test 5 Passed: Dimension snapped to 5.3mm and canonical name regenerated.');

// Test 6: Clean Spring Excel Workbook Export Structure
console.log('Test 6: Clean Spring Excel Workbook structure');
const wb = exportCleanSpringWorkbook([keptItem, snappedItem]);
assert.ok(wb.SheetNames.includes('Clean Master Catalog'), 'Must contain Clean Master Catalog sheet');
assert.ok(wb.SheetNames.includes('Harmonizer Audit Trail'), 'Must contain Harmonizer Audit Trail sheet');
const cleanSheet = wb.Sheets['Clean Master Catalog'];
assert.ok(cleanSheet['A1'], 'Header row must exist');
console.log('Test 6 Passed: Clean Spring workbook structure verified.');

// Test 7: Isolated Sandbox Persistence vs Master Catalog Promotion
console.log('Test 7: Isolated sandbox persistence vs master catalog promotion');
clearHarmonizerSandboxState();
assert.strictEqual(loadHarmonizerSandboxState().length, 0);

saveHarmonizerSandboxState([keptItem, snappedItem]);
const loaded = loadHarmonizerSandboxState();
assert.strictEqual(loaded.length, 2);

// Promotion
const promoResult = promoteToMasterCatalog([snappedItem]);
assert.strictEqual(promoResult.success, true);
assert.strictEqual(promoResult.count, 1);

const promoted = getProductByCode('110-PN10-COMM');
assert.ok(promoted, 'Promoted product must exist in active master registry');
assert.strictEqual(promoted.description, 'PVC PIPE 110 x 5.3mm PN10 SASO-ISO 1452-2 R/R 6.0M');
assert.strictEqual(promoted.provenance_tag, 'Harmonized Master Catalog');
console.log('Test 7 Passed: Staging sandbox isolated and promotion verified.');

// Test 8: Zero Literal Arabic Characters Check
console.log('Test 8: Zero literal Arabic characters check');
const filesToCheck = [
  'src/data/harmonizerConfig.json',
  'src/logic/catalogHarmonizer.js'
];
const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
filesToCheck.forEach((f) => {
  const code = fs.readFileSync(path.resolve(f), 'utf8');
  const match = code.match(arabicRegex);
  assert.strictEqual(match, null, `Literal Arabic character found in ${f}`);
});
console.log('Test 8 Passed: Zero literal Arabic characters in new harmonizer files.');

console.log('--- ALL CATALOG HARMONIZER LAB UNIT TESTS PASSED (8/8) ---');
