import assert from 'assert';

// Mock in-memory localStorage for Node test runner
const memoryStorage = {};
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, eventInitDict) {
      this.type = type;
      this.detail = eventInitDict?.detail;
    }
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    localStorage: {
      getItem: (key) => memoryStorage[key] || null,
      setItem: (key, val) => { memoryStorage[key] = String(val); },
      removeItem: (key) => { delete memoryStorage[key]; },
      clear: () => { Object.keys(memoryStorage).forEach(k => delete memoryStorage[k]); }
    },
    dispatchEvent: () => true
  };
} else if (!globalThis.window.localStorage) {
  globalThis.window.localStorage = {
    getItem: (key) => memoryStorage[key] || null,
    setItem: (key, val) => { memoryStorage[key] = String(val); },
    removeItem: (key) => { delete memoryStorage[key]; },
    clear: () => { Object.keys(memoryStorage).forEach(k => delete memoryStorage[k]); }
  };
}

import {
  getYesterdayDate,
  findLatestRecordedDate,
  formatExecutiveAuditDate,
  buildDailyAuditReportData,
  getAuditDensityPreset
} from '../../src/logic/dailyAuditPdfHelper.js';
import { MACHINES } from '../../src/config/machines.js';
import { saveBaselineRate, clearAllBaselines } from '../../src/logic/standardCatalogHelper.js';

console.log('--- Starting Daily Audit PDF Helper Unit Tests ---');

// Test 1: getYesterdayDate calculates accurately across month/year boundaries
{
  assert.strictEqual(getYesterdayDate('2026-10-17'), '2026-10-16');
  assert.strictEqual(getYesterdayDate('2026-10-01'), '2026-09-30');
  assert.strictEqual(getYesterdayDate('2026-01-01'), '2025-12-31');
  assert.strictEqual(getYesterdayDate('2024-03-01'), '2024-02-29'); // Leap year check
  const defaultYesterday = getYesterdayDate();
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(defaultYesterday));
  console.log('Test 1 Passed: getYesterdayDate correctly computes previous calendar day.');
}

// Test 2: findLatestRecordedDate extracts the newest valid date
{
  const sampleRecords = [
    { date: '2026-10-12', machineId: 'L-01', actual: 500 },
    { date: '2026-10-15', machineId: 'L-02', actual: 600 },
    { date: '2026-10-10', machineId: 'L-03', actual: 400 },
    { date: 'Total 2026', machineId: 'L-04', actual: 9999 }
  ];
  assert.strictEqual(findLatestRecordedDate(sampleRecords), '2026-10-15');
  assert.strictEqual(findLatestRecordedDate([]), null);
  console.log('Test 2 Passed: findLatestRecordedDate accurately extracts latest date.');
}

// Test 3: formatExecutiveAuditDate formats human-friendly day and date string
{
  const formatted = formatExecutiveAuditDate('2026-10-16');
  assert.strictEqual(formatted, 'Friday, 16-10-2026');
  console.log('Test 3 Passed: formatExecutiveAuditDate renders day name and formatted date.');
}

// Test 4: buildDailyAuditReportData builds full executive structure with strict whole integer pieces
{
  clearAllBaselines();
  saveBaselineRate('L-01', 'P-110-3.2', 50);
  saveBaselineRate('L-06', 'P-200-4.9', 25);

  const mockRecords = [
    {
      date: '2026-10-16',
      machineId: 'L-01',
      itemCode: 'P-110-3.2',
      description: '110mm x 3.2mm Class 4 PVC Pipe',
      productionQty: 1000,
      totalWeight: 3200,
      unitWeight: 3.2,
      targetRate: 50,
      operatingHours: 20.0,
      scrapKg: 50,
      downtimeHours: 4.0,
      downtimeEvents: [
        { reason: 'Die / Mold Changeover', hours: 2.0 },
        { reason: 'Mechanical Jam / Puller Fix', hours: 2.0 }
      ]
    },
    {
      date: '2026-10-16',
      machineId: 'L-06',
      itemCode: 'P-200-4.9',
      description: '200mm x 4.9mm Class 3 PVC Pipe',
      productionQty: 480,
      totalWeight: 4800,
      unitWeight: 10.0,
      targetRate: 25,
      operatingHours: 24.0,
      scrapKg: 100,
      downtimeHours: 0.0,
      downtimeEvents: []
    }
  ];

  const auditData = buildDailyAuditReportData({
    date: '2026-10-16',
    records: mockRecords,
    machineMaster: MACHINES
  });

  // Check metadata
  assert.strictEqual(auditData.meta.targetDate, '2026-10-16');
  assert.strictEqual(auditData.meta.plantName, 'AL MANAR PIPES FACTORY - EXTRUSION DIVISION');
  assert.strictEqual(auditData.meta.title, 'DAILY PRODUCTION & OPERATIONAL AUDIT REPORT');
  assert.strictEqual(auditData.meta.sopReference, 'DOC-Ext.-03');

  // Check KPIs: strictly whole integer pieces
  assert.strictEqual(Number.isInteger(auditData.kpis.totalActualPcs), true);
  assert.strictEqual(auditData.kpis.totalActualPcs, 1480); // 1000 + 480
  assert.strictEqual(Number.isInteger(auditData.kpis.totalExpectedPcs), true);
  assert.strictEqual(Number.isInteger(auditData.kpis.totalVariancePcs), true);

  // Check Weights & Scrap
  assert.strictEqual(auditData.kpis.totalActualKg, 8000); // 3200 + 4800
  assert.strictEqual(auditData.kpis.totalActualMT, '8.00');
  assert.strictEqual(auditData.kpis.totalScrapKg, 150); // 50 + 100
  assert.strictEqual(auditData.kpis.totalMeltKg, 8150);
  assert.strictEqual(auditData.kpis.scrapRatioPct, 1.8); // 150 / 8150 = 1.84% -> 1.8%

  // Check Rows Count matches canonical machineMaster
  assert.strictEqual(auditData.rows.length, MACHINES.length);

  // Check Machine Names
  const l01 = auditData.rows.find((r) => r.lineId === 'L-01');
  assert.ok(l01);
  assert.strictEqual(l01.actualPcs, 1000);
  assert.strictEqual(l01.expectedPcs, 1200); // 24 * 50
  assert.strictEqual(l01.variancePcs, -200);
  assert.strictEqual(l01.isOperating, true);
  assert.ok(l01.fullMachineName.includes('L-01'));

  const l06 = auditData.rows.find((r) => r.lineId === 'L-06');
  assert.ok(l06);
  assert.strictEqual(l06.actualPcs, 480);
  assert.strictEqual(l06.expectedPcs, 600); // 24 * 25
  assert.strictEqual(l06.isOperating, true);
  assert.ok(l06.fullMachineName.includes('L-06'));

  // Check downtime category aggregation
  assert.strictEqual(auditData.downtime.categories.length, 6);
  const moldDowntime = auditData.downtime.categories.find((c) => c.key === 'moldChange');
  assert.strictEqual(moldDowntime.hours, 2.0);
  const mechDowntime = auditData.downtime.categories.find((c) => c.key === 'mechanical');
  assert.strictEqual(mechDowntime.hours, 2.0);

  console.log('Test 4 Passed: buildDailyAuditReportData outputs correct executive KPIs and rows.');
}

// Test 5: Filter mode (All Lines vs Operating Lines Only) accurately partitions rows
{
  const mockRecords = [
    {
      date: '2026-10-16',
      machineId: 'L-01',
      itemCode: 'P-110-3.2',
      productionQty: 1000,
      totalWeight: 3200,
      operatingHours: 20.0
    },
    {
      date: '2026-10-16',
      machineId: 'L-06',
      itemCode: 'P-200-4.9',
      productionQty: 480,
      totalWeight: 4800,
      operatingHours: 24.0
    }
  ];

  const auditData = buildDailyAuditReportData({
    date: '2026-10-16',
    records: mockRecords,
    machineMaster: MACHINES
  });

  const allRows = auditData.rows;
  assert.strictEqual(allRows.length, MACHINES.length);

  const operatingRows = allRows.filter(
    (r) => r.isOperating || Number(r.actualPcs) > 0 || Number(r.operatingHours) > 0
  );
  assert.strictEqual(operatingRows.length, 2);
  assert.strictEqual(auditData.kpis.activeLineCount, 2);
  assert.deepStrictEqual(operatingRows.map(r => r.lineId).sort(), ['L-01', 'L-06']);

  // Verify idle lines are completely filtered out in operating mode
  const idleRows = allRows.filter(
    (r) => !(r.isOperating || Number(r.actualPcs) > 0 || Number(r.operatingHours) > 0)
  );
  assert.strictEqual(idleRows.length, MACHINES.length - 2);
  assert.ok(idleRows.every(r => r.actualPcs === 0 && r.operatingHours === 0));

  console.log('Test 5 Passed: All Lines vs Operating Only filtering accurately isolates active lines.');
}

// Test 6: Full machine names are resolved prominently across all canonical lines
{
  const auditData = buildDailyAuditReportData({
    date: '2026-10-16',
    records: [],
    machineMaster: MACHINES
  });

  MACHINES.forEach((machine) => {
    const row = auditData.rows.find((r) => r.lineId === machine.id);
    assert.ok(row, `Row for ${machine.id} must exist`);
    assert.ok(
      row.fullMachineName.includes(machine.id),
      `Row fullMachineName must include line ID ${machine.id}`
    );
    assert.ok(
      row.fullMachineName.includes(machine.name),
      `Row fullMachineName must include machine name ${machine.name}`
    );
  });

  console.log('Test 6 Passed: Full machine names (e.g. L-06 - KTS 700) verified for prominent rendering.');
}

// Test 7: Dynamic density scale presets adapt based on active row count
{
  // 1 to 4 rows: Low density preset
  const lowPreset1 = getAuditDensityPreset(1);
  const lowPreset4 = getAuditDensityPreset(4);
  assert.strictEqual(lowPreset1.mode, 'low');
  assert.strictEqual(lowPreset4.mode, 'low');
  assert.ok(lowPreset4.cellPaddingClass.includes('py-3'));
  assert.strictEqual(lowPreset4.tableTextClass, 'text-[13px]');
  assert.ok(lowPreset4.tableHeaderClass.includes('text-[12px]'));
  assert.strictEqual(lowPreset4.kpiCardPaddingClass, 'p-3');
  assert.strictEqual(lowPreset4.kpiMetricClass, 'text-[20px]');
  assert.strictEqual(lowPreset4.downtimeMetricClass, 'text-[15px]');

  // 5 to 7 rows: Medium density preset
  const medPreset5 = getAuditDensityPreset(5);
  const medPreset7 = getAuditDensityPreset(7);
  assert.strictEqual(medPreset5.mode, 'medium');
  assert.strictEqual(medPreset7.mode, 'medium');
  assert.ok(medPreset5.cellPaddingClass.includes('py-2'));
  assert.strictEqual(medPreset5.tableTextClass, 'text-[11.5px]');
  assert.ok(medPreset5.tableHeaderClass.includes('text-[10px]'));
  assert.ok(medPreset5.kpiCardPaddingClass.includes('p-2'));
  assert.strictEqual(medPreset5.kpiMetricClass, 'text-[17px]');

  // 8+ rows: Compact density preset
  const compactPreset8 = getAuditDensityPreset(8);
  const compactPresetAll = getAuditDensityPreset(15);
  assert.strictEqual(compactPreset8.mode, 'compact');
  assert.strictEqual(compactPresetAll.mode, 'compact');
  assert.ok(compactPreset8.cellPaddingClass.includes('py-1'));
  assert.strictEqual(compactPreset8.tableTextClass, 'text-[10.5px]');
  assert.ok(compactPreset8.tableHeaderClass.includes('text-[9px]'));
  assert.ok(compactPreset8.kpiCardPaddingClass.includes('p-1.5'));
  assert.strictEqual(compactPreset8.kpiMetricClass, 'text-[15px]');

  console.log('Test 7 Passed: Dynamic density scale presets adapt accurately across row counts.');
}

console.log('--- ALL DAILY AUDIT PDF HELPER UNIT TESTS PASSED SUCCESSFULLY! ---');


