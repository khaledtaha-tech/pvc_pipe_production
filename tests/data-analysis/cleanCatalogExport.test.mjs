import assert from 'assert';
import * as XLSX from 'xlsx';
import { 
  CANONICAL_PIPE_EXTRUDERS,
  canonicalizeMachineName, 
  isUnknownMachine,
  findMasterMachineProfile 
} from '../../src/utils/masterProfiles.js';
import { 
  isValidPipeOrConduitProduct, 
  parseProductSpecs 
} from '../../src/utils/dataCleaner.js';
import { 
  buildUniqueSizingPlanningMatrix, 
  generateUniquePlanningCatalogExcelWorkbook,
  generateConsolidatedExcelWorkbook,
  exportMasterPlanToExcelRows,
  UNIQUE_CATALOG_COLUMNS
} from '../../src/utils/inferenceEngine.js';

console.log('--- Testing Clean Planning Catalog & Canonical Machine Rules ---');

// 1. Test canonical machine mapping
const machineMappings = [
  { inputs: ['KTS 250', 'KTS-250', 'KTS 250 TDH', 'KTS-250 TDH'], expected: 'KTS 250 TDH' },
  { inputs: ['KTS-700', 'KTS700', 'KTS 700'], expected: 'KTS 700' },
  { inputs: ['KTS-200', 'KTS200', 'KTS 200'], expected: 'KTS 200' },
  { inputs: ['KTS-350', 'KTS350', 'KTS 350'], expected: 'KTS 350' },
  { inputs: ['KABRA-90', 'KABRA 90', 'Kabra 90 (K-90)', 'K-90', 'K90'], expected: 'Kabra 90' },
  { inputs: ['KTS-170', 'KTS170', 'KTS 170'], expected: 'KTS 170' },
  { inputs: ['KTS-350 TDH', 'KTS 350TDH', 'KTS-350TDH'], expected: 'KTS 350 TDH' }
];

for (const m of machineMappings) {
  for (const inp of m.inputs) {
    const res = canonicalizeMachineName(inp);
    assert.strictEqual(res, m.expected, `Input "${inp}" should canonicalize to "${m.expected}", got "${res}"`);
  }
}
console.log('PASS: All machine names resolve to 7 canonical plant pipe extruders');

// 2. Test unknown machine handling
assert.strictEqual(canonicalizeMachineName('UNKNOWN-LINE'), 'UNKNOWN-LINE');
assert.strictEqual(canonicalizeMachineName('Unknown'), 'UNKNOWN-LINE');
assert.strictEqual(canonicalizeMachineName(''), 'UNKNOWN-LINE');
assert.strictEqual(canonicalizeMachineName(null), 'UNKNOWN-LINE');
assert.ok(isUnknownMachine('UNKNOWN-LINE'));
assert.ok(isUnknownMachine('Unknown'));
assert.ok(isUnknownMachine(''));
assert.ok(!isUnknownMachine('KTS 350'));
assert.ok(!isUnknownMachine('Kabra 90'));
console.log('PASS: Unknown machines correctly identified');

// 3. Test non-pipe / junk items filtering
const junkItems = [
  'PVC COMPOUND FOR INJECTION ORINGE',
  'PVC COMPOUND FOR INJECTION ORANGE',
  'Unknown Product',
  'Unknown',
  '',
  'ACES ORANGE OUTER JACKET W/SLICON 2 WAY 12/8 MM',
  'BLACK OUTER JACKET 24MM',
  'SILICON TUBE ACCESSORY'
];

for (const item of junkItems) {
  const isValid = isValidPipeOrConduitProduct(item);
  assert.strictEqual(isValid, false, `Item "${item}" should be rejected as non-pipe/junk`);
}

const authenticPipes = [
  'MANARCO PVC-U PIPE 315X15mm PN-12.5 SASO-ISO 1452',
  'BLACK MANARCO ELECTRICAL UPVC PIPE CONDUIT 20X1.6mm',
  'MANARCO ELECTRICAL UPVC CONDUIT MG 20X1.6MM',
  'UPVC PIPE MPF DAMMAM SCH.80 1/2" SCH.80 5.5MTR',
  'PVC PIPE 25MM SASO-ISO 1452-2 PN12.5 1.5MM',
  'PVC PIPE 3/4"SCH40',
  'PVC 1" PIPE SCH40 ASTMD 2241',
  'MANARCO U-PVC PIPE 3" SCH-40 ASTM D-1785 PVC 1120',
  'MANARCO U-PVC PIPE 4" SCH-40 ASTM D-1785 PVC 1120'
];

for (const item of authenticPipes) {
  const isValid = isValidPipeOrConduitProduct(item);
  assert.strictEqual(isValid, true, `Item "${item}" should be accepted as authentic pipe/conduit`);
}
console.log('PASS: Junk products strictly excluded and authentic pipes accepted');

// 4. Test 315X15mm crossMatch parsing
const spec315 = parseProductSpecs('MANARCO PVC-U PIPE 315X15mm PN-12.5 SASO-ISO 1452');
assert.strictEqual(spec315.diameter, '315 mm', '315X15mm should extract 315 mm diameter');
assert.strictEqual(spec315.thickness, '15 mm', '315X15mm should extract 15 mm thickness');
console.log('PASS: 315X15mm correctly parsed');

// 5. Test Unique Planning Catalog and Excel export exclusion
const mixedRows = [
  {
    id: 'row-1',
    product: 'PVC COMPOUND FOR INJECTION ORINGE',
    machine: 'KTS 250',
    material: 'uPVC',
    diameter: '-',
    operatingHours: 24,
    totalWeight: 5000
  },
  {
    id: 'row-2',
    product: 'Unknown Product',
    machine: 'KTS 350',
    material: 'uPVC',
    diameter: '-',
    operatingHours: 24,
    totalWeight: 5000
  },
  {
    id: 'row-3',
    product: 'ACES ORANGE OUTER JACKET W/SLICON 2 WAY 12/8 MM',
    machine: 'KTS 170',
    material: 'uPVC',
    diameter: '8 mm',
    operatingHours: 24,
    totalWeight: 5000
  },
  {
    id: 'row-4',
    product: 'MANARCO PVC-U PIPE 315X15mm PN-12.5 SASO-ISO 1452',
    machine: 'KTS-700',
    material: 'uPVC',
    diameter: '315 mm',
    operatingHours: 24,
    totalWeight: 8000
  },
  {
    id: 'row-5',
    product: 'UPVC PIPE MPF DAMMAM SCH.80 1/2" SCH.80 5.5MTR',
    machine: 'KTS 250',
    material: 'uPVC',
    diameter: '1/2"',
    operatingHours: 24,
    totalWeight: 3000
  },
  {
    id: 'row-6',
    product: 'PVC PIPE 3/4"SCH40',
    machine: 'UNKNOWN-LINE', // Row with UNKNOWN-LINE
    material: 'uPVC',
    diameter: '3/4"',
    operatingHours: 24,
    totalWeight: 3500
  }
];

const catalog = buildUniqueSizingPlanningMatrix(mixedRows, []);
console.log('Catalog entries count:', catalog.length);
// Rows 1, 2, 3 must be excluded because of non-pipe junk
// Rows 4, 5, 6:
// Row 4 has KTS-700 -> canonicalized to KTS 700
// Row 5 has KTS 250 -> canonicalized to KTS 250 TDH
// Row 6 has UNKNOWN-LINE -> model infers canonical pipe extruder (e.g. KTS 250 TDH or KTS 170)
for (const entry of catalog) {
  assert.ok(isValidPipeOrConduitProduct(entry.pipeDescription), `Catalog item "${entry.pipeDescription}" must be valid pipe`);
  assert.ok(!entry.pipeDescription.includes('COMPOUND'), 'No COMPOUND allowed in catalog');
  assert.ok(!entry.pipeDescription.includes('JACKET'), 'No JACKET allowed in catalog');
  assert.notStrictEqual(entry.primaryExtruder, 'UNKNOWN-LINE', 'No UNKNOWN-LINE allowed in catalog');
  assert.ok(CANONICAL_PIPE_EXTRUDERS.includes(entry.primaryExtruder), `Extruder "${entry.primaryExtruder}" must be canonical`);
}

// 6. Test exported Excel workbook
const wb = generateUniquePlanningCatalogExcelWorkbook(catalog);
const sheet = wb.Sheets['Unique Planning Catalog'];
const excelRows = XLSX.utils.sheet_to_json(sheet);
console.log('Excel export rows count:', excelRows.length);

for (const r of excelRows) {
  const desc = r[UNIQUE_CATALOG_COLUMNS.PRODUCT_DESC];
  const mach = r[UNIQUE_CATALOG_COLUMNS.PRIMARY_EXTRUDER];
  assert.ok(isValidPipeOrConduitProduct(desc), `Exported item "${desc}" must be valid pipe`);
  assert.notStrictEqual(mach, 'UNKNOWN-LINE', 'Exported machine cannot be UNKNOWN-LINE');
  assert.ok(CANONICAL_PIPE_EXTRUDERS.includes(mach), `Exported machine "${mach}" must be canonical`);
}

// 7. Test Strict Physical Diameter Envelope Enforcement on Alternatives
const envelopeTestRows = [
  {
    id: 'env-200',
    product: 'UPVC PRESSURE PIPE 200 MM CLASS 4',
    machine: 'KABRA-90',
    material: 'uPVC',
    diameter: '200 mm',
    operatingHours: 24,
    totalWeight: 6000
  },
  {
    id: 'env-315',
    product: 'MANARCO PVC-U PIPE 315X15mm PN-12.5',
    machine: 'KTS-700',
    material: 'uPVC',
    diameter: '315 mm',
    operatingHours: 24,
    totalWeight: 9000
  },
  {
    id: 'env-50',
    product: 'UPVC CONDUIT PIPE 50 MM DIN 8062',
    machine: 'KTS-200',
    material: 'uPVC',
    diameter: '50 mm',
    operatingHours: 24,
    totalWeight: 3500
  }
];

const envelopeMatrix = buildUniqueSizingPlanningMatrix(envelopeTestRows, []);
const row200 = envelopeMatrix.find(r => r.odNumeric === 200);
const row315 = envelopeMatrix.find(r => r.odNumeric === 315);
const row50 = envelopeMatrix.find(r => r.odNumeric === 50);

assert.ok(row200, '200 mm row must exist in matrix');
console.log('200 mm pipe evaluation:');
console.log('  Primary:', row200.primaryExtruder);
console.log('  Alternative 1:', row200.planningAlternative1);
console.log('  Alternative 2:', row200.planningAlternative2);

// Only Kabra 90 (110-200) and KTS 700 (110-400) can physically extrude 200 mm!
// Alt 2 MUST STRICTLY BE '-' (empty/none), NEVER KTS 170 or KTS 200!
assert.ok(
  row200.primaryExtruder === 'Kabra 90' || row200.primaryExtruder === 'KTS 700',
  `200 mm Primary Extruder must be Kabra 90 or KTS 700, got ${row200.primaryExtruder}`
);
assert.ok(
  row200.alternativeExtruder1 === 'KTS 700' || row200.alternativeExtruder1 === 'Kabra 90',
  `200 mm Alternative 1 must be KTS 700 or Kabra 90, got ${row200.alternativeExtruder1}`
);
assert.strictEqual(
  row200.alternativeExtruder2,
  '-',
  `200 mm Alternative 2 MUST strictly be "-", got ${row200.alternativeExtruder2}`
);
assert.strictEqual(
  row200.planningAlternative2,
  '-',
  `200 mm Planning Alternative 2 text MUST strictly be "-", got ${row200.planningAlternative2}`
);
assert.strictEqual(
  row200.alternativeRateBand2,
  '-',
  `200 mm Alternative Rate Band 2 MUST strictly be "-", got ${row200.alternativeRateBand2}`
);
console.log('PASS: 200 mm pipe correctly has Alternative 2 as "-" (no invalid KTS 170 / KTS 200 fallback)');

assert.ok(row315, '315 mm row must exist in matrix');
console.log('315 mm pipe evaluation:');
console.log('  Primary:', row315.primaryExtruder);
console.log('  Alternative 1:', row315.planningAlternative1);
console.log('  Alternative 2:', row315.planningAlternative2);

// Only KTS 700 (110-400) can physically extrude 315 mm!
// Both Alt 1 and Alt 2 MUST STRICTLY BE '-'!
assert.strictEqual(row315.primaryExtruder, 'KTS 700');
assert.strictEqual(row315.alternativeExtruder1, '-');
assert.strictEqual(row315.alternativeExtruder2, '-');
assert.strictEqual(row315.planningAlternative1, '-');
assert.strictEqual(row315.planningAlternative2, '-');
assert.strictEqual(row315.alternativeRateBand1, '-');
assert.strictEqual(row315.alternativeRateBand2, '-');
console.log('PASS: 315 mm pipe correctly has both Alternative 1 and Alternative 2 as "-"');

assert.ok(row50, '50 mm row must exist in matrix');
console.log('50 mm pipe evaluation:');
console.log('  Primary:', row50.primaryExtruder);
console.log('  Alternative 1:', row50.planningAlternative1);
console.log('  Alternative 2:', row50.planningAlternative2);
// For 50 mm, machines like KTS 700 (110-400), Kabra 90 (110-200), KTS 350 (75-160) must NEVER appear!
const disallowedFor50 = ['KTS 700', 'Kabra 90', 'KTS 350'];
assert.ok(!disallowedFor50.includes(row50.primaryExtruder));
assert.ok(!disallowedFor50.includes(row50.alternativeExtruder1));
assert.ok(!disallowedFor50.includes(row50.alternativeExtruder2));
console.log('PASS: 50 mm pipe strictly excludes out-of-range heavy lines (KTS 700, Kabra 90, KTS 350)');

console.log('ALL CLEAN PLANNING CATALOG & CANONICAL MACHINE TESTS PASSED SUCCESSFULLY!');
