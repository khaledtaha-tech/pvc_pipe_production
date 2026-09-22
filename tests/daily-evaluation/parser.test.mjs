import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { matchMachine, MACHINES } from '../../src/config/machines.js';
import {
  parseExcelWorkbook,
  parseMachineMaster,
  parseProductSpecs,
  convertLogRowToReport,
  normalizeExcelDate,
  formatExcelDate,
  parseDailyLog
} from '../../src/logic/excelParser.js';
import { generateReport } from '../../src/logic/engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting Excel Parser & Machine Master Tests ---');

// 1. Static Machine Master & Matching Tests
assert.equal(MACHINES.length, 9, 'Should have exactly 9 factory extrusion lines');
assert.equal(matchMachine('KTS-350')?.id, 'L-05');
assert.equal(matchMachine('KABRA-90')?.id, 'L-06');
assert.equal(matchMachine('KTS-350 TDH')?.id, 'L-08');
assert.equal(matchMachine('KTS-170')?.id, 'L-07');
assert.equal(matchMachine('KTS-200')?.id, 'L-04');
assert.equal(matchMachine('KTS 550')?.id, 'L-01');
assert.equal(matchMachine('KTS 250')?.id, 'L-02');
assert.equal(matchMachine('KTS 250 TDH')?.id, 'L-02');
assert.equal(matchMachine('KTS 700')?.id, 'L-03');
assert.equal(matchMachine('Bausano')?.id, 'L-09');
assert.equal(matchMachine('L-06')?.id, 'L-06');
console.log('Static machine master matching: OK');

// 2. Product Specs Extraction Tests
const spec1 = parseProductSpecs('uPVC PIPE 110x5.3 PN-12.5 SASO-ISO 1452-2', 17.3);
assert.equal(spec1.od, '110');
assert.equal(spec1.wt, '5.3');
assert.equal(spec1.cls, 'PN-12.5');
assert.equal(spec1.stdWeight, '17.3');

const spec2 = parseProductSpecs('PVC 4" PIPE SDR 26 ASTMD 2241', 16);
assert.equal(spec2.od, '4"');
assert.equal(spec2.cls, 'SDR 26');
assert.equal(spec2.stdWeight, '16');

const spec3 = parseProductSpecs('uPVC PIPE 75MM PN10X3.6MM SASO-ISO-1452-2', 8.2);
assert.equal(spec3.od, '75');
assert.equal(spec3.wt, '3.6');
assert.equal(spec3.cls, 'PN10');
console.log('Product specs parsing: OK');

// 3. Dynamic Machine Master Parsing from Master_Upload.xlsx
const publicMaster = path.join(__dirname, '../../public/Master_Upload.xlsx');
const rootMaster = path.join(__dirname, '../../Master_Upload.xlsx');
const filePath = fs.existsSync(publicMaster) ? publicMaster : rootMaster;
const fileBuffer = fs.readFileSync(filePath);
const wb = XLSX.read(fileBuffer, { type: 'buffer' });

const dynamicMaster = parseMachineMaster(wb);
assert.equal(dynamicMaster.length, 9, 'Dynamic machine master must have 9 lines');

const expectedCapacities = {
  'L-01': 400,
  'L-02': 200,
  'L-03': 500,
  'L-04': 180,
  'L-05': 290,
  'L-06': 380,
  'L-07': 135,
  'L-08': 300,
  'L-09': 1100
};

for (const m of dynamicMaster) {
  assert.equal(
    m.capacityKgH,
    expectedCapacities[m.id],
    `Machine ${m.id} nominal capacity should be ${expectedCapacities[m.id]} kg/h`
  );
}

// 3b. Verify bilingual row-1 headers, row-3 headers, and fallback inference
const mockBilingualWb = {
  SheetNames: ['Machine_Master'],
  Sheets: {
    Machine_Master: XLSX.utils.aoa_to_sheet([
      ['(Line ID)', '(Machine Name)', 'kg/h (Nominal Capacity)'],
      ['L-01', 'KTS 550', 400],
      ['L-02', 'KTS 250 TDH', 200]
    ])
  }
};
const parsedBilingual = parseMachineMaster(mockBilingualWb);
assert.equal(parsedBilingual.length, 2);
assert.equal(parsedBilingual[0].id, 'L-01');
assert.equal(parsedBilingual[1].name, 'KTS 250 TDH');

const mockRow3Wb = {
  SheetNames: ['Machine_Master'],
  Sheets: {
    Machine_Master: XLSX.utils.aoa_to_sheet([
      ['Factory Extrusion Lines Master'],
      ['Confidential - For Internal Use Only'],
      ['Line ID', 'Machine Name', 'Nominal Capacity (kg/h)'],
      ['L-01', 'KTS 550', 400],
      ['L-09', 'Bausano', 1100]
    ])
  }
};
const parsedRow3 = parseMachineMaster(mockRow3Wb);
assert.equal(parsedRow3.length, 2);
assert.equal(parsedRow3[0].id, 'L-01');
assert.equal(parsedRow3[1].id, 'L-09');
assert.equal(parsedRow3[1].capacityKgH, 1100);

const mockFallbackWb = {
  SheetNames: ['Machine_Master'],
  Sheets: {
    Machine_Master: XLSX.utils.aoa_to_sheet([
      ['Unrecognized Header A', 'Unrecognized Header B', 'Unrecognized Header C'],
      ['L-01', 'KTS 550', 400]
    ])
  }
};
const parsedFallback = parseMachineMaster(mockFallbackWb);
assert.equal(parsedFallback.length, 1);
assert.equal(parsedFallback[0].id, 'L-01');
assert.equal(parsedFallback[0].name, 'KTS 550');
assert.equal(parsedFallback[0].capacityKgH, 400);

console.log('Dynamic Machine_Master parsing & nominal capacities: OK');

// 4. Full Workbook Parsing Test on Master_Upload.xlsx
const parsed = parseExcelWorkbook(fileBuffer);
assert.equal(parsed.sheetName, 'Daily Production Log');
assert.ok(parsed.rows.length >= 40, `Should have at least 40 consolidated machine records, got ${parsed.rows.length}`);
assert.ok(parsed.rawRows && parsed.rawRows.length >= 50, `Should have at least 50 raw rows, got ${parsed.rawRows?.length}`);
assert.equal(parsed.machineMaster.length, 9, 'Parsed workbook should include 9 machine master records');

// Inspect row 0 (KTS-350, 24 operating hours, 0 scrap)
const r0 = parsed.rows[0];
assert.equal(r0.date, '2026-09-07');
assert.equal(r0.itemCode, '249');
assert.equal(r0.machineId, 'L-05');
assert.equal(r0.nominalCapacityKgH, 290);
assert.equal(r0.productionQty, 392);
assert.equal(r0.totalWeight, 6782);
assert.equal(r0.operatingHours, 24);
assert.equal(r0.downtimeHours, 0);
assert.equal(r0.actualRateKgH, 282.6, 'Actual rate should be 6782 / 24 = 282.6 kg/h');
assert.equal(r0.capacityUtilizationPct, 97.4, 'Utilization should be 282.6 / 290 = 97.4%');

// Inspect row 1 (KABRA-90, 12 operating hours, 12 downtime hours, 40kg scrap)
const r1 = parsed.rows[1];
assert.equal(r1.date, '2026-09-07');
assert.equal(r1.itemCode, '991');
assert.equal(r1.machineId, 'L-06');
assert.equal(r1.nominalCapacityKgH, 380);
assert.equal(r1.productionQty, 140);
assert.equal(r1.unitWeight, 16);
assert.equal(r1.totalWeight, 2240);
assert.equal(r1.scrapKg, 40);
assert.equal(r1.operatingHours, 12);
assert.equal(r1.downtimeHours, 12);
assert.equal(r1.reasonOfStop, 'Die Change & Sizing Setup');
assert.equal(r1.actualRateKgH, 186.7, 'Actual rate should be 2240 / 12 = 186.7 kg/h');
assert.equal(r1.capacityUtilizationPct, 49.1, 'Utilization should be 186.7 / 380 = 49.1%');
console.log('Workbook log rows extraction & engineering metrics: OK');

// 5. Log Row to 24-Hour Follow Sheet Conversion
const report1 = convertLogRowToReport(r1);

assert.equal(report1.header.lineId, 'L-06');
assert.equal(report1.summary.totalOutput, '140');
assert.equal(report1.summary.totalPurgeKg, '40');
// Scrap pipes: 40 / 16 = 2.5 -> Math.round(2.5) = 3
assert.equal(report1.summary.totalScrapPipes, '3');
// Downtime: 12 hours = 720 minutes with extracted reason
assert.equal(report1.downtimeEvents.length, 1);
assert.equal(report1.downtimeEvents[0].durationMin, 720);
assert.equal(report1.downtimeEvents[0].reason, 'Die Change & Sizing Setup');
assert.ok(report1.slots.length === 24, 'Must have 24 hourly slots');

// Engineering metrics attached to report
assert.equal(report1.engineering.nominalCapacityKgH, 380);
assert.equal(report1.engineering.actualRateKgH, 186.7);
assert.equal(report1.engineering.capacityUtilizationPct, 49.1);
assert.equal(report1.engineering.operatingHours, 12);
assert.equal(report1.engineering.totalWeightKg, 2240);

// Actual production sum must equal 140
const sumActual = report1.slots.reduce((a, s) => a + s.actual, 0);
assert.equal(sumActual, 140, 'Actual hourly output sum must equal daily total output (140)');

// Total downtime minutes across slots must equal 720 min (12 hours)
const sumDt = report1.slots.reduce((a, s) => a + s.downtime, 0);
assert.equal(sumDt, 720, 'Downtime minutes across slots must equal 720 min');

// Operating hours must be 12.0
const opSlots = report1.slots.filter((s) => s.downtime === 0);
assert.equal(opSlots.length, 12, 'Must have 12 operating hour slots');
assert.equal(report1.sourceRecordId, r1.id, 'Report should track source record ID');
assert.equal(report1.header.lineCustom, 'Kabra 90', 'Header should store matched machine name');

// Test reactive switching by date and line
const targetRow = parsed.rows.find((r) => r.date === '2026-09-08' && r.machineId === 'L-08');
assert.ok(targetRow, 'Target row for 2026-09-08 and L-08 must exist');
assert.ok(targetRow.items && targetRow.items.length === 2, 'L-08 on 2026-09-08 ran 2 items');
const reportSwitched = convertLogRowToReport(targetRow);
assert.equal(reportSwitched.header.date, '2026-09-08');
assert.equal(reportSwitched.header.lineId, 'L-08');
assert.equal(reportSwitched.header.lineCustom, 'KTS 350 TDH');
assert.equal(reportSwitched.sourceRecordId, targetRow.id);
assert.equal(reportSwitched.slots.length, 24);
assert.ok(reportSwitched.refs['1'].pipeSpec, 'Ref 1 spec must exist for 1st item');
assert.ok(reportSwitched.refs['2'].pipeSpec, 'Ref 2 spec must exist for 2nd item');

console.log('Log row conversion to 24h follow sheet & reactive switching: OK');

// 6. Explicit Transparent OEE Formula Verification with True Benchmark Target
const genReport = generateReport(report1);
assert.equal(genReport.aStr, '50.0%');
assert.equal(genReport.pStr, '49.0%');
assert.equal(genReport.qStr, '97.9%');
assert.equal(genReport.oeeStr, '24.0%');
assert.equal(genReport.formulaStr, 'OEE = A (50.0%) × P (49.0%) × Q (97.9%) = 24.0%');
assert.equal(genReport.engineering.nominalCapacityKgH, 380);
assert.equal(genReport.engineering.actualRateKgH, 186.7);
assert.equal(genReport.engineering.capacityUtilizationPct, 49.1);

// 6b. Verification of KTS-350 with Nominal Capacity and Decimal Actual Distribution
const kts350Row = {
  id: 'test_kts_350',
  date: '2026-09-17',
  machineId: 'L-05',
  nominalCapacityKgH: 330,
  description: 'PVC 4" PIPE SDR 26 ASTMD 2241 (Item 991)',
  unitWeight: 16,
  productionQty: 420,
  totalWeight: 6720,
  operatingHours: 24,
  downtimeHours: 0,
  scrapKg: 0,
  actualRateKgH: 280,
  capacityUtilizationPct: 84.8
};
const ktsReport = convertLogRowToReport(kts350Row);
// Target rate: 330 / 16 = 20.625 -> 20.6 pcs/h
assert.equal(ktsReport.refs['1'].targetRate, 20.6);
assert.equal(ktsReport.refs['1'].cutTime, 174.8);
assert.equal(ktsReport.refs['1'].speed, '2.1');
// 420 pcs evenly distributed across 24 operating hours with 1 decimal place: 17.5 pcs/h
assert.ok(ktsReport.slots.every((s) => s.actual === 17.5));
assert.ok(ktsReport.slots.every((s) => s.target === 20.6));
const ktsGen = generateReport(ktsReport);
assert.equal(ktsGen.grandTotals.actual, 420);
assert.equal(ktsGen.grandTotals.target, 494.4);
assert.equal(ktsGen.pStr, '85.0%');
assert.equal(ktsGen.aStr, '100.0%');

console.log('Transparent OEE formula & metrics generation: OK');

// 7. Date Normalization & Serial Parsing Tests
assert.equal(normalizeExcelDate('2026-09-17'), '2026-09-17');
assert.equal(normalizeExcelDate('2026/09/17'), '2026-09-17');
assert.equal(normalizeExcelDate('17/09/2026'), '2026-09-17');
assert.equal(normalizeExcelDate('17/9/2026'), '2026-09-17');
assert.equal(normalizeExcelDate(46282), '2026-09-17');
assert.equal(normalizeExcelDate('46282'), '2026-09-17');
assert.equal(normalizeExcelDate(new Date(2026, 8, 17)), '2026-09-17');
assert.equal(normalizeExcelDate(new Date('2026-09-16T20:59:08.000Z')), '2026-09-17');
assert.equal(normalizeExcelDate(new Date('2026-09-17T00:00:00.000Z')), '2026-09-17');
assert.equal(normalizeExcelDate('Grand Total'), 'Grand Total');
assert.equal(formatExcelDate(46282), '2026-09-17');
console.log('Date normalization & serial parsing: OK');

// 8. Pipe Production Sheet Alias & AlManar_2 Workbook Tests
const mockPipeWb = {
  SheetNames: ['Machine_Master', 'Pipe Production'],
  Sheets: {
    Machine_Master: XLSX.utils.aoa_to_sheet([
      ['Line ID', 'Machine Name', 'Nominal Capacity (kg/h)'],
      ['L-05', 'KTS 350', 290]
    ]),
    'Pipe Production': XLSX.utils.aoa_to_sheet([
      ['Date', 'Item Code', 'Product Description & Specs', 'Machine', 'Production Qty (FG)', 'Unit Weight (kg)', 'Total Weight (kg)', 'Scrap / Rejection (kg)', 'Operating Hours', 'Reason of Stop'],
      ['2026-09-16', '249', 'PVC Pipe 110x5.3', 'KTS-350', 200, 17, 3400, 0, 24, ''],
      [46282, '991', 'PVC 4" PIPE SDR 26 ASTMD 2241', 'KTS-350', 420, 16, 6720, 10, 24, ''],
      ['Grand Total', '', '', '', 620, '', 10120, 10, 48, '']
    ])
  }
};
const parsedPipe = parseDailyLog(mockPipeWb);
assert.equal(parsedPipe.sheetName, 'Pipe Production');
assert.equal(parsedPipe.rows.length, 2, 'Should exclude Grand Total row');
assert.equal(parsedPipe.rows[0].date, '2026-09-16');
assert.equal(parsedPipe.rows[1].date, '2026-09-17');
assert.equal(parsedPipe.rows[1].productionQty, 420);
assert.equal(parsedPipe.rows[1].machineId, 'L-05');

const alManarPath = path.resolve(__dirname, '../public/AlManar_2.xlsx');
if (fs.existsSync(alManarPath)) {
  const alManarBuf = fs.readFileSync(alManarPath);
  const alManarParsed = parseExcelWorkbook(alManarBuf);
  assert.equal(alManarParsed.sheetName, 'Pipe Production');
  assert.equal(alManarParsed.rawRows.length, 53, 'AlManar_2 should have 53 raw production rows');
  assert.equal(alManarParsed.rows.length, 47, 'AlManar_2 should have 47 consolidated daily machine rows');
  const alManarDates = [...new Set(alManarParsed.rows.map((r) => r.date))];
  assert.ok(alManarDates.includes('2026-09-17'), 'AlManar_2 must include date 2026-09-17');
  assert.ok(!alManarDates.includes('Grand Total'), 'AlManar_2 must exclude Grand Total');
  const sep17Rows = alManarParsed.rows.filter((r) => r.date === '2026-09-17');
  assert.equal(sep17Rows.length, 3, 'Must have exactly 3 rows for 2026-09-17');
  console.log('AlManar_2.xlsx real workbook parsing (including 2026-09-17): OK');
}

console.log('All Excel parser, machine master, and OEE formula tests passed successfully!');
