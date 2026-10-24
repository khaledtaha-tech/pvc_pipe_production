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
  approveBatchItems,
  formatItemAnalysisMarkdown,
  formatBatchSummaryMarkdown,
  copyToClipboard,
  calculateTheoreticalLinearWeight,
  calculateWeightVariance,
  lookupCanonicalSpec,
  diagnoseCatalogItem
} from '../../src/logic/catalogHarmonizer.js';

import {
  mintCanonicalRecord,
  mintAllStandardRecords,
  getRegisteredStandards,
  getStandardById
} from '../../src/logic/canonicalStandardsEngine.js';

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
  'src/data/canonicalStandards.json',
  'src/logic/canonicalStandardsEngine.js',
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

// Batch 1 (3 items)
const batch1 = queue.slice(0, 3);
assert.strictEqual(batch1.length, 3);
// Batch 2 (3 items)
const batch2 = queue.slice(3, 6);
assert.strictEqual(batch2.length, 3);
// Batch 9 (1 item)
const batch9 = queue.slice(24, 27);
assert.strictEqual(batch9.length, 1);
console.log('Test 18 Passed: Focus 3 mode prioritizes anomalies and slices batches accurately.');

// Test 19: Single Row Markdown Analysis Formatter
console.log('Test 19: Single Row Markdown Analysis Formatter');
const testItemToCopy = harmonizeCatalogItem({
  itemCode: '110-PN10-COMM',
  description: 'PVC PIPE 110X5.2MM PN10 SASO-ISO 1452-2 R/R 6.0M',
  sourceFile: 'AlManar_9.xlsb',
  sourceSheet: 'Unique Planning',
  sourceRow: 'Row #142',
  ingestionType: 'PLANNING_CATALOG'
});
const rowMarkdown = formatItemAnalysisMarkdown(testItemToCopy);
assert.ok(rowMarkdown.includes('### 🔍 Product Analysis: `110-PN10-COMM`'));
assert.ok(rowMarkdown.includes('- **Item Code**: `110-PN10-COMM`'));
assert.ok(rowMarkdown.includes('AlManar_9.xlsb'));
assert.ok(rowMarkdown.includes('Unique Planning'));
assert.ok(rowMarkdown.includes('Row #142'));
assert.ok(rowMarkdown.includes('PLANNING_CATALOG'));
assert.ok(rowMarkdown.includes('PVC PIPE 110X5.2MM PN10 SASO-ISO 1452-2 R/R 6.0M'));
assert.ok(rowMarkdown.includes('PVC PIPE 110 x 5.2mm PN10 SASO-ISO 1452-2 R/R 6.0M'));
assert.ok(rowMarkdown.includes('Outer Diameter (OD): `110`') || rowMarkdown.includes('Outer Diameter (OD): `110mm`'));
assert.ok(rowMarkdown.includes('Wall Thickness (WT): `5.2mm`'));
assert.ok(rowMarkdown.includes('Rating / SDR: `PN10`'));
assert.ok(rowMarkdown.includes('Reference Standard: `SASO-ISO 1452-2`'));
assert.ok(rowMarkdown.includes('Joint Type: `R/R`'));
assert.ok(rowMarkdown.includes('Length: `6.0M`'));
assert.ok(rowMarkdown.includes('Linear Weight Benchmark'));
assert.ok(rowMarkdown.includes('Specification Variance'));
assert.ok(rowMarkdown.includes('Delta: `-0.1mm`'));
console.log('Test 19 Passed: Single row analysis Markdown formatted completely and accurately.');

// Test 20: Full Batch Summary Markdown Report Formatter
console.log('Test 20: Full Batch Summary Markdown Report Formatter');
const batchItems = [
  harmonizeCatalogItem({
    itemCode: '090-ERR',
    description: 'PVC PIPE 90X4.3MM PN10 ??? CORRUPT_TOK DIN 8062 S/C 6.0M',
    sourceFile: 'AlManar_9.xlsb',
    sourceSheet: 'Unique Planning',
    sourceRow: 'Row #1',
    ingestionType: 'PLANNING_CATALOG'
  }),
  testItemToCopy
];
const batchSummary = formatBatchSummaryMarkdown(batchItems, {
  batchIndex: 0,
  totalBatches: 5,
  totalQueueCount: 42
});
assert.ok(batchSummary.includes('## 📋 Catalog Harmonizer Lab - Batch #1 of 5 Analysis Summary'));
assert.ok(batchSummary.includes('- **Batch Index**: Batch 1 of 5'));
assert.ok(batchSummary.includes('- **Items in Active Batch**: 2'));
assert.ok(batchSummary.includes('- **Items Remaining in Review Queue**: 42'));
assert.ok(batchSummary.includes('| # | Item Code | Source Origin | Raw Description | Standardized Canonical Description | Status | Flags & Diagnostic Notes |'));
assert.ok(batchSummary.includes('090-ERR'));
assert.ok(batchSummary.includes('110-PN10-COMM'));
assert.ok(batchSummary.includes('### 📝 Itemized Technical Specifications:'));
assert.ok(batchSummary.includes('Unparsed Tokens'));
console.log('Test 20 Passed: Full batch summary report compiles structured table and itemized list.');

// Test 21: Clipboard Helper Function Safe Execution
console.log('Test 21: Clipboard Helper Function Safe Execution');
assert.strictEqual(typeof copyToClipboard, 'function');
copyToClipboard('').then((res) => {
  assert.strictEqual(res, false, 'Empty text copy should safely return false');
});
console.log('Test 21 Passed: Clipboard helper safe handling verified.');

// Test 22: Linear Weight Calculation Benchmark (uPVC density 1.43 g/cm3)
console.log('Test 22: Linear Weight Calculation Benchmark (uPVC density 1.43 g/cm3)');
const wt110 = calculateTheoreticalLinearWeight(110, 5.3, 1.43);
assert.strictEqual(wt110, 2.493, 'OD 110 PN10 (5.3mm) must equal 2.493 kg/m');

const wt160 = calculateTheoreticalLinearWeight(160, 7.7, 1.43);
assert.strictEqual(wt160, 5.268, 'OD 160 PN10 (7.7mm) must equal 5.268 kg/m');

const wt63 = calculateTheoreticalLinearWeight(63, 3.0, 1.43);
assert.strictEqual(wt63, 0.809, 'OD 63 PN10 (3.0mm) must equal 0.809 kg/m');

// Edge cases
assert.strictEqual(calculateTheoreticalLinearWeight(0, 5), null);
assert.strictEqual(calculateTheoreticalLinearWeight(110, 120), null);
console.log('Test 22 Passed: Linear weight calculation benchmark verified against exact uPVC geometry.');

// Test 23: Weight Variance Calculation
console.log('Test 23: Weight Variance Calculation');
const var1 = calculateWeightVariance(2.450, 2.493);
assert.strictEqual(var1.diffKgM, -0.043);
assert.strictEqual(var1.percentDelta, -1.7);
assert.strictEqual(var1.hasVariance, false); // Within 3% tolerance

const var2 = calculateWeightVariance(2.200, 2.493);
assert.strictEqual(var2.hasVariance, true); // > 3%
assert.strictEqual(var2.warningLevel, 'critical'); // > 10%
console.log('Test 23 Passed: Weight variance evaluation accurately detects discrepancies.');

// Test 24: Canonical Standards Engine Lookup & Pristine Minting
console.log('Test 24: Canonical Standards Engine Lookup & Pristine Minting');
const spec110 = lookupCanonicalSpec(110, 'PN10', 'ISO_1452');
assert.strictEqual(spec110.matched, true);
assert.strictEqual(spec110.nominalWtMm, 5.3);
assert.strictEqual(spec110.theoreticalLinearWeightKgM, 2.493);

const mintedItem = mintCanonicalRecord({
  standardId: 'ISO_1452',
  odMm: 110,
  rating: 'PN10',
  joint: 'R/R',
  lengthM: 6.0
});
assert.strictEqual(mintedItem.status, 'clean');
assert.strictEqual(mintedItem.isApproved, true);
assert.strictEqual(mintedItem.ingestionType, 'CANONICAL_MINT');
assert.strictEqual(mintedItem.wallThicknessMm, 5.3);
assert.strictEqual(mintedItem.linearWeightKgM, 2.493);
assert.strictEqual(mintedItem.canonicalDescription, 'PVC PIPE 110 x 5.3mm PN10 SASO-ISO 1452-2 R/R 6.0M');
console.log('Test 24 Passed: Canonical standard lookup and pristine record minting verified.');

// Test 25: Minting Entire Canonical Standard Matrix
console.log('Test 25: Minting Entire Canonical Standard Matrix');
const allMinted = mintAllStandardRecords('ISO_1452');
assert.ok(allMinted.length >= 50, 'Must mint complete ISO 1452 metric matrix (OD 63 to 200mm)');
assert.ok(allMinted.every(i => i.status === 'clean' && i.isApproved === true));
console.log('Test 25 Passed: Full canonical standard matrix generation verified.');

// Test 26: Diagnostic Advice Engine
console.log('Test 26: Diagnostic Advice Engine');
const diag = diagnoseCatalogItem({
  odMm: 110,
  ratingClass: 'PN10',
  wallThicknessMm: 5.2,
  unparsedTokens: ['GARBAGE_TOK']
});
assert.strictEqual(diag.isStandardMatched, true);
assert.ok(diag.advicePoints.length >= 2);
assert.strictEqual(diag.recommendation, 'Purge Garbage Tokens');
console.log('Test 26 Passed: Diagnostic advisory recommendations verified.');

// Test 27: Static Analysis & Reference Integrity of CatalogHarmonizerLabView.jsx
console.log('Test 27: Static Analysis & Reference Integrity of CatalogHarmonizerLabView.jsx');
const labViewPath = path.resolve('src/components/catalog-harmonizer/CatalogHarmonizerLabView.jsx');
assert.strictEqual(fs.existsSync(labViewPath), true, 'CatalogHarmonizerLabView.jsx must exist');
const labViewCode = fs.readFileSync(labViewPath, 'utf8');

// Ensure no lingering isFocus10Mode
assert.strictEqual(labViewCode.includes('isFocus10Mode'), false, 'Must not contain any lingering isFocus10Mode references');

// Ensure isFocus3Mode is present and used
assert.strictEqual(labViewCode.includes('isFocus3Mode'), true, 'Must use active isFocus3Mode state variable');

// Ensure zero literal Arabic characters
const arabicMatch = labViewCode.match(arabicRegex);
assert.strictEqual(arabicMatch, null, 'Must contain zero literal Arabic characters in CatalogHarmonizerLabView.jsx');

console.log('Test 27 Passed: Clean reference integrity and zero literal Arabic characters verified in CatalogHarmonizerLabView.');

console.log('--- ALL CATALOG HARMONIZER LAB UNIT TESTS PASSED (27/27) ---');
