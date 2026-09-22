import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterAnalyticsRecords,
  calculatePlantMetrics,
  calculateDowntimeBreakdown,
  calculateMachineComparison
} from '../../src/logic/analytics.js';
import { parseExcelWorkbook } from '../../src/logic/excelParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting Plant Analytics Unit Tests ---');

// Mock data set
const mockLogs = [
  {
    date: '2026-09-10',
    machineId: 'L-01',
    machineName: 'L-01 - KTS 550',
    nominalCapacityKgH: 400,
    productionQty: 500,
    totalWeight: 10000,
    scrapKg: 200,
    operatingHours: 20,
    downtimeHours: 4,
    reasonOfStop: 'Die Change & Sizing Setup'
  },
  {
    date: '2026-09-10',
    machineId: 'L-02',
    machineName: 'L-02 - KTS 250 TDH',
    nominalCapacityKgH: 200,
    productionQty: 200,
    totalWeight: 4000,
    scrapKg: 100,
    operatingHours: 24,
    downtimeHours: 0,
    reasonOfStop: ''
  },
  {
    date: '2026-09-11',
    machineId: 'L-01',
    machineName: 'L-01 - KTS 550',
    nominalCapacityKgH: 400,
    productionQty: 450,
    totalWeight: 9000,
    scrapKg: 300,
    operatingHours: 18,
    downtimeHours: 6,
    reasonOfStop: 'Heater Band Replacement'
  },
  {
    date: 'Grand Total',
    machineId: '',
    totalWeight: 23000,
    scrapKg: 600,
    operatingHours: 62,
    downtimeHours: 10
  }
];

// 1. Filter tests
const f1 = filterAnalyticsRecords(mockLogs, { fromDate: '2026-09-10', toDate: '2026-09-10' });
assert.equal(f1.length, 2, 'Should have 2 records for 2026-09-10');

const f2 = filterAnalyticsRecords(mockLogs, { lineId: 'L-01' });
assert.equal(f2.length, 2, 'Should have 2 records for Line L-01');

const f3 = filterAnalyticsRecords(mockLogs, { fromDate: '2026-09-11', toDate: '2026-09-11', lineId: 'L-01' });
assert.equal(f3.length, 1);
assert.equal(f3[0].date, '2026-09-11');
console.log('Record filtering logic: OK');

// 2. Metrics calculation tests
const metrics = calculatePlantMetrics(mockLogs.slice(0, 3));
// Total Good Weight: 10000 + 4000 + 9000 = 23,000 kg -> 23.00 MT
assert.equal(metrics.totalGoodWeightKg, 23000);
assert.equal(metrics.totalGoodWeightMT, '23.00');
assert.equal(metrics.totalPcs, 1150);
assert.equal(metrics.totalScrapKg, 600);

// Total Weight with Scrap: 23000 + 600 = 23,600 kg
// Scrap Rate %: (600 / 23600) * 100 = 2.54% -> round1: 2.5%
assert.equal(metrics.scrapRatePct, 2.5);

// Operating Hours: 20 + 24 + 18 = 62.0 h
// Downtime Hours: 4 + 0 + 6 = 10.0 h
// Total Planned: 72.0 h
assert.equal(metrics.operatingHours, 62);
assert.equal(metrics.downtimeHours, 10);
assert.equal(metrics.totalPlannedHours, 72);
assert.equal(metrics.operatingPct, 86.1);
assert.equal(metrics.downtimePct, 13.9);

// Availability: 86.1%
assert.equal(metrics.availabilityPct, 86.1);

// Quality: (23000 / 23600) * 100 = 97.457% -> 97.5%
assert.equal(metrics.qualityPct, 97.5);

// Nominal expected: (20 * 400) + (24 * 200) + (18 * 400) = 8000 + 4800 + 7200 = 20,000 kg
// Performance %: 23000 / 20000 * 100 = 115.0%
assert.equal(metrics.performancePct, 115);

// OEE: 0.861 * 1.15 * 0.975 * 100 = 96.5%
assert.equal(metrics.oeePct, 96.5);
console.log('Plant metrics & OEE formulas: OK');

// 3. Downtime Breakdown (Pareto)
const dtList = calculateDowntimeBreakdown(mockLogs.slice(0, 3));
assert.equal(dtList.length, 2);
// 1st reason: Heater Band Replacement (6h = 360 min)
assert.equal(dtList[0].reason, 'Heater Band Replacement');
assert.equal(dtList[0].totalHours, 6);
assert.equal(dtList[0].pctOfTotal, 60);

// 2nd reason: Die Change & Sizing Setup (4h = 240 min)
assert.equal(dtList[1].reason, 'Die Change & Sizing Setup');
assert.equal(dtList[1].totalHours, 4);
assert.equal(dtList[1].pctOfTotal, 40);
console.log('Downtime Pareto cause ranking: OK');

// 4. Machine comparison matrix
const matrix = calculateMachineComparison(mockLogs.slice(0, 3));
assert.ok(matrix.length >= 2);
const m1 = matrix.find((m) => m.machineId === 'L-01');
assert.equal(m1.runDaysCount, 2);
assert.equal(m1.totalGoodWeightKg, 19000);
assert.equal(m1.operatingHours, 38);
assert.equal(m1.downtimeHours, 10);
console.log('Machine comparison matrix generation: OK');

// 5. Real dataset verification on Master_Upload.xlsx
const masterPath = path.resolve(__dirname, '../../Master_Upload.xlsx');
if (fs.existsSync(masterPath)) {
  const buf = fs.readFileSync(masterPath);
  const parsed = parseExcelWorkbook(buf);
  const realMetrics = calculatePlantMetrics(parsed.rows);
  assert.ok(realMetrics.totalGoodWeightKg > 100000, 'Real good weight should exceed 100 MT');
  assert.ok(realMetrics.oeePct > 0 && realMetrics.oeePct <= 100, 'OEE must be between 0% and 100%');
  assert.ok(realMetrics.scrapRatePct >= 0 && realMetrics.scrapRatePct <= 10, 'Scrap rate reasonable');

  const realDt = calculateDowntimeBreakdown(parsed.rows);
  assert.ok(realDt.length > 0, 'Should have categorized downtime reasons');
  assert.ok(realDt[0].totalHours >= realDt[realDt.length - 1].totalHours, 'Must be sorted descending');

  const realMatrix = calculateMachineComparison(parsed.rows, parsed.machineMaster);
  assert.equal(realMatrix.length, 9, 'Should have 9 lines in comparison matrix');
  console.log('Real Master_Upload.xlsx analytics verification: OK');

  // Test multi-item consolidation metrics (same machine on same date with two size orders: 10h + 14h)
  const multiItemMock = [
    {
      date: '2026-09-20',
      machineId: 'L-05',
      machineName: 'L-05 - KTS 350',
      nominalCapacityKgH: 290,
      productionQty: 154,
      totalWeight: 2664,
      scrapKg: 15,
      operatingHours: 10,
      downtimeHours: 14,
      reasonOfStop: 'Die Change & Sizing Setup'
    },
    {
      date: '2026-09-20',
      machineId: 'L-05',
      machineName: 'L-05 - KTS 350',
      nominalCapacityKgH: 290,
      productionQty: 175,
      totalWeight: 2625,
      scrapKg: 20,
      operatingHours: 14,
      downtimeHours: 10,
      reasonOfStop: ''
    }
  ];
  const multiMetrics = calculatePlantMetrics(multiItemMock);
  assert.equal(multiMetrics.operatingHours, 24, 'Total operating hours must be 10 + 14 = 24.0h');
  assert.equal(multiMetrics.downtimeHours, 0, 'False downtime must be eliminated (0.0h)');
  assert.equal(multiMetrics.totalPlannedHours, 24, 'Planned hours must be exactly 24h per day, not 48h');
  assert.equal(multiMetrics.availabilityPct, 100, 'Availability must be 100% for full day run');
  console.log('Multi-item machine metrics consolidation in analytics: OK (24h planned, 0h false downtime)');
}

console.log('All Plant Analytics unit tests passed successfully!');
