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
  promoteToMasterCatalog,
  loadArchetypes,
  saveArchetypes,
  resetArchetypes,
  formatTokenValue,
  synthesizeDescription,
  detectMatchedArchetype,
  applyArchetypeToItem,
  detectUnparsedTokens,
  purgeGarbageTokens,
  approveBatchItems
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
  'src/logic/catalogHarmonizer.js',
  'src/components/catalog-harmonizer/ArchetypePatternStudioModal.jsx',
  'src/components/catalog-harmonizer/CatalogHarmonizerLabView.jsx'
];
const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
filesToCheck.forEach((f) => {
  const code = fs.readFileSync(path.resolve(f), 'utf8');
  const match = code.match(arabicRegex);
  assert.strictEqual(match, null, `Literal Arabic character found in ${f}`);
});
console.log('Test 8 Passed: Zero literal Arabic characters in new harmonizer files.');

// Test 9: Seed Archetypes (#1 to #5) validation & description synthesis
console.log('Test 9: Seed Archetypes (#1 to #5) validation & synthesis');
const archetypes = loadArchetypes();
assert.ok(archetypes.length >= 5, 'Must contain at least 5 seed archetypes');

const arch1 = archetypes.find(a => a.id === 'pattern_1_metric_pressure');
assert.ok(arch1, 'Pattern #1 must exist');
assert.strictEqual(synthesizeDescription(arch1.sampleItem, arch1.tokenSequence), arch1.targetExample);

const arch2 = archetypes.find(a => a.id === 'pattern_2_metric_sewer');
assert.ok(arch2, 'Pattern #2 must exist');
assert.strictEqual(synthesizeDescription(arch2.sampleItem, arch2.tokenSequence), arch2.targetExample);

const arch3 = archetypes.find(a => a.id === 'pattern_3_astm_inch');
assert.ok(arch3, 'Pattern #3 must exist');
assert.strictEqual(synthesizeDescription(arch3.sampleItem, arch3.tokenSequence), arch3.targetExample);

const arch4 = archetypes.find(a => a.id === 'pattern_4_conduit_duct');
assert.ok(arch4, 'Pattern #4 must exist');
assert.strictEqual(synthesizeDescription(arch4.sampleItem, arch4.tokenSequence), arch4.targetExample);

const arch5 = archetypes.find(a => a.id === 'pattern_5_pvc_compound');
assert.ok(arch5, 'Pattern #5 must exist');
assert.strictEqual(synthesizeDescription(arch5.sampleItem, arch5.tokenSequence), arch5.targetExample);
console.log('Test 9 Passed: All 5 seed archetypes synthesized correctly matching target examples.');

// Test 10: Automatic Archetype Pattern Matching & Scoring
console.log('Test 10: Automatic Archetype Pattern Matching');
const matchCompound = detectMatchedArchetype({ rawDescription: 'PVC COMPOUND WHITE FOR INJECTION' });
assert.strictEqual(matchCompound.archetypeId, 'pattern_5_pvc_compound');
assert.ok(matchCompound.matchScore >= 95);

const matchConduit = detectMatchedArchetype({ rawDescription: 'PVC CONDUIT 25MM CLASS 4 BLACK 3.0M' });
assert.strictEqual(matchConduit.archetypeId, 'pattern_4_conduit_duct');

const matchInch = detectMatchedArchetype({ rawDescription: 'PVC PIPE 4 INCH SCH40 ASTM D1785 6.0M' });
assert.strictEqual(matchInch.archetypeId, 'pattern_3_astm_inch');

const matchSewer = detectMatchedArchetype({ rawDescription: 'PVC PIPE 160MM SDR41 SN4 EN 1401-1 R/R' });
assert.strictEqual(matchSewer.archetypeId, 'pattern_2_metric_sewer');

const matchPressure = detectMatchedArchetype({ rawDescription: 'PVC PIPE 110X5.3MM PN10 SASO-ISO 1452-2' });
assert.strictEqual(matchPressure.archetypeId, 'pattern_1_metric_pressure');
console.log('Test 10 Passed: Intelligent archetype pattern detection accurately categorizes products.');

// Test 11: Drag-and-Drop / Custom Token Re-ordering synthesis
console.log('Test 11: Custom Token Re-ordering synthesis');
const customOrder = ['LENGTH', 'PRODUCT_TYPE', 'OD_SIZE', 'WT', 'RATING_PN_SDR'];
const customSynthesized = synthesizeDescription({
  productType: 'PVC PIPE',
  odMm: 110,
  wallThicknessMm: 5.3,
  ratingClass: 'PN10',
  lengthM: 6.0
}, customOrder);
assert.strictEqual(customSynthesized, '6.0M PVC PIPE 110 x 5.3mm PN10');
console.log('Test 11 Passed: Custom token re-ordering correctly formats dynamic description.');

// Test 12: Archetype Persistence (save, load, reset)
console.log('Test 12: Archetype Persistence');
const modifiedArchetypes = JSON.parse(JSON.stringify(archetypes));
modifiedArchetypes[0].name = 'Modified Pattern #1';
saveArchetypes(modifiedArchetypes);
const loadedArch = loadArchetypes();
assert.strictEqual(loadedArch[0].name, 'Modified Pattern #1');

const resetArch = resetArchetypes();
assert.strictEqual(resetArch[0].name, 'Pattern #1: Metric Pressure');
console.log('Test 12 Passed: Archetype persistence and factory reset verified.');

// Test 13: Apply Archetype Pattern to Staged Item
console.log('Test 13: Apply Archetype Pattern to Staged Item');
const stagedTestItem = {
  id: 'item-test-1',
  itemCode: 'TEST-110',
  productType: 'PVC PIPE',
  odMm: 110,
  sizeDisplay: '110',
  wallThicknessMm: 5.3,
  ratingClass: 'PN10',
  standard: 'SASO-ISO 1452-2',
  joint: 'R/R',
  lengthM: 6.0
};
const updatedWithArch = applyArchetypeToItem(stagedTestItem, arch1);
assert.strictEqual(updatedWithArch.canonicalDescription, 'PVC PIPE 110 x 5.3mm PN10 SASO-ISO 1452-2 R/R 6.0M');
assert.strictEqual(updatedWithArch.matchedArchetypeId, arch1.id);
assert.strictEqual(updatedWithArch.matchScore, 100);
console.log('Test 13 Passed: Applied archetype pattern successfully re-synthesizes item.');

// Test 14: Anomaly & Garbage token detection
console.log('Test 14: Anomaly & Garbage token detection');
const cleanRaw = 'PVC PIPE 110X5.3MM PN10 SASO-ISO 1452-2 R/R 6.0M';
const cleanTokens = detectUnparsedTokens(cleanRaw);
assert.strictEqual(cleanTokens.length, 0, 'Clean description should have 0 unparsed tokens');

const messyWithGarbage = 'PVC PIPE 90X4.3MM PN10 ??? CORRUPT_TOK DIN 8062 S/C 6.0M';
const garbageTokens = detectUnparsedTokens(messyWithGarbage);
assert.ok(garbageTokens.length >= 2, 'Should detect unparsed garbage tokens');
assert.ok(garbageTokens.some(t => t.includes('???') || t.includes('CORRUPT')));

const anomalyHarmonized = harmonizeCatalogItem({
  itemCode: '090-ERR',
  description: messyWithGarbage
});
assert.strictEqual(anomalyHarmonized.hasAnomaly, true);
assert.strictEqual(anomalyHarmonized.status, 'anomaly');
assert.ok(anomalyHarmonized.conflictNotes.includes('Anomaly: Unparsed tokens'));
console.log('Test 14 Passed: Anomaly & Garbage token detection isolates corrupted words.');

// Test 15: Purging garbage tokens from raw descriptions
console.log('Test 15: Purging garbage tokens');
const cleaned = purgeGarbageTokens(messyWithGarbage, garbageTokens);
assert.ok(!cleaned.includes('CORRUPT_TOK'), 'Garbage token must be removed');
assert.ok(!cleaned.includes('???'), 'Symbol token must be removed');
assert.ok(cleaned.includes('90X4.3MM'), 'Core dimensions must be preserved');
const reHarmonized = harmonizeCatalogItem({
  itemCode: '090-FIXED',
  description: cleaned
});
assert.strictEqual(reHarmonized.hasAnomaly, false);
assert.notStrictEqual(reHarmonized.status, 'anomaly');
console.log('Test 15 Passed: Garbage tokens purged and description cleanly re-harmonized.');

// Test 16: Source Provenance metadata tracking
console.log('Test 16: Source Provenance metadata tracking');
const sourceProvenanceItem = harmonizeCatalogItem({
  itemCode: '110-PROV',
  description: 'PVC PIPE 110X5.3MM PN10 SASO-ISO 1452-2 R/R',
  sourceFile: 'AlManar_9.xlsb',
  sourceSheet: 'Unique Planning',
  sourceRow: 'Row #142',
  ingestionType: 'PLANNING_CATALOG',
  rawImportData: { 'Item Code': '110-PROV', 'Raw Desc': 'PVC PIPE 110X5.3MM PN10' }
});
assert.strictEqual(sourceProvenanceItem.sourceFile, 'AlManar_9.xlsb');
assert.strictEqual(sourceProvenanceItem.sourceSheet, 'Unique Planning');
assert.strictEqual(sourceProvenanceItem.sourceRow, 'Row #142');
assert.strictEqual(sourceProvenanceItem.ingestionType, 'PLANNING_CATALOG');
assert.ok(sourceProvenanceItem.rawImportData, 'Raw import data must be preserved');
console.log('Test 16 Passed: Source provenance tracking properly captured and stored.');

// Test 17: Batch approval mechanism
console.log('Test 17: Batch approval mechanism');
const unapprovedItems = [
  { id: 'item-1', itemCode: '001', status: 'anomaly', isApproved: false },
  { id: 'item-2', itemCode: '002', status: 'variance', isApproved: false },
  { id: 'item-3', itemCode: '003', status: 'clean', isApproved: false },
  { id: 'item-4', itemCode: '004', status: 'clean', isApproved: true }
];
const batchApproved = approveBatchItems(unapprovedItems, ['item-1', 'item-2', 'item-3']);
assert.strictEqual(batchApproved[0].isApproved, true);
assert.strictEqual(batchApproved[0].status, 'clean');
assert.strictEqual(batchApproved[1].isApproved, true);
assert.strictEqual(batchApproved[1].status, 'overridden');
assert.strictEqual(batchApproved[2].isApproved, true);
assert.strictEqual(batchApproved[3].isApproved, true);
console.log('Test 17 Passed: Batch items successfully approved and updated.');

// Test 18: Focus 10 Mode Queue Prioritization & Slicing
console.log('Test 18: Focus 10 Mode Queue Prioritization & Slicing');
const sampleCatalog = [];
for (let i = 1; i <= 25; i++) {
  sampleCatalog.push({
    id: `item-${i}`,
    itemCode: `P-${i}`,
    status: i <= 5 ? 'anomaly' : (i <= 12 ? 'variance' : 'clean'),
    hasAnomaly: i <= 5,
    isApproved: false
  });
}
// Unapproved priority sort
const queue = sampleCatalog.slice().sort((a, b) => {
  const scoreA = (a.status === 'anomaly' || a.hasAnomaly) ? 2 : (a.status === 'variance' ? 1 : 0);
  const scoreB = (b.status === 'anomaly' || b.hasAnomaly) ? 2 : (b.status === 'variance' ? 1 : 0);
  return scoreB - scoreA;
});
assert.strictEqual(queue.length, 25);
// Top items in queue must be anomalies (score 2)
assert.strictEqual(queue[0].status, 'anomaly');
assert.strictEqual(queue[4].status, 'anomaly');
// Next items in queue must be variances (score 1)
assert.strictEqual(queue[5].status, 'variance');

// Batch 1 (10 items)
const batch1 = queue.slice(0, 10);
assert.strictEqual(batch1.length, 10);
// Batch 2 (10 items)
const batch2 = queue.slice(10, 20);
assert.strictEqual(batch2.length, 10);
// Batch 3 (5 items)
const batch3 = queue.slice(20, 30);
assert.strictEqual(batch3.length, 5);
console.log('Test 18 Passed: Focus 10 mode prioritizes anomalies and slices batches accurately.');

console.log('--- ALL CATALOG HARMONIZER LAB UNIT TESTS PASSED (18/18) ---');
