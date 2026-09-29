import assert from 'node:assert/strict';
import {
  STORAGE_KEYS,
  loadPersistedRecords,
  savePersistedRecords,
  clearPersistedRecords,
  loadPersistedActiveReport,
  savePersistedActiveReport,
  loadPersistedMeta,
  migrateStoredLineMappings,
  makeReportKey,
  isDateEqual,
  isMachineEqual,
  saveReportByDateAndMachine,
  loadReportByDateAndMachine
} from '../../src/data/store.js';

console.log('--- Starting Storage & Persistence Unit Tests ---');

// In-memory mock localStorage for Node.js environment
const mockStorageMap = new Map();
const mockLocalStorage = {
  getItem: (k) => (mockStorageMap.has(k) ? mockStorageMap.get(k) : null),
  setItem: (k, v) => mockStorageMap.set(k, String(v)),
  removeItem: (k) => mockStorageMap.delete(k),
  clear: () => mockStorageMap.clear(),
  get length() { return mockStorageMap.size; },
  key: (i) => Array.from(mockStorageMap.keys())[i] ?? null
};

globalThis.localStorage = mockLocalStorage;

// Test 1: Empty initial state
mockLocalStorage.clear();
const initial = loadPersistedRecords();
assert.equal(initial.status, 'empty', 'Initial state should be empty');
assert.deepEqual(initial.records, [], 'Initial records should be empty array');
console.log('Initial empty state verification: OK');

// Test 2: Save records and verify loaded status
const mockRows = [
  { date: '2026-09-17', machineId: 'L-01', totalWeight: 5000, productionQty: 250 },
  { date: '2026-09-17', machineId: 'L-02', totalWeight: 4200, productionQty: 210 }
];
const mockMeta = {
  fileName: 'Production_Log_Sept.xlsx',
  sheetName: 'Extrusion Daily',
  machineMaster: [{ id: 'L-01', name: 'KTS 550', capacityKgH: 400 }]
};

savePersistedRecords(mockRows, mockMeta);

const loaded = loadPersistedRecords();
assert.equal(loaded.status, 'loaded', 'Status should be loaded after saving records');
assert.equal(loaded.records.length, 2, 'Should have loaded 2 records');
assert.equal(loaded.records[0].machineId, 'L-01');

const loadedMeta = loadPersistedMeta();
assert.equal(loadedMeta.fileName, 'Production_Log_Sept.xlsx');
assert.equal(loadedMeta.sheetName, 'Extrusion Daily');
assert.equal(loadedMeta.machineMaster?.[0]?.capacityKgH, 400);
console.log('Save and load records & metadata: OK');

// Test 3: Active report persistence
const mockReport = {
  id: 'rep_test_123',
  header: { date: '2026-09-17', lineId: 'L-01' },
  summary: { totalOutput: '5000' }
};
savePersistedActiveReport(mockReport);
const loadedReport = loadPersistedActiveReport();
assert.ok(loadedReport, 'Active report should be found in storage');
assert.equal(loadedReport.id, 'rep_test_123');
assert.equal(loadedReport.header.lineId, 'L-01');
console.log('Active report persistence: OK');

// Test 4: Clear functionality must persist cleared status across hard refreshes
clearPersistedRecords();
const afterClear = loadPersistedRecords();
assert.equal(afterClear.status, 'cleared', 'Status must be explicitly "cleared"');
assert.deepEqual(afterClear.records, [], 'Records must be empty array after clear');

const afterClearReport = loadPersistedActiveReport();
assert.equal(afterClearReport, null, 'Active report must be null after clear');

const afterClearMeta = loadPersistedMeta();
assert.equal(afterClearMeta.fileName, '', 'FileName must be reset after clear');
assert.equal(afterClearMeta.sheetName, '', 'SheetName must be reset after clear');
console.log('True clear functionality & persistent cleared flag: OK');

// Test 5: Re-uploading data unsets cleared flag and restores loaded status
savePersistedRecords(mockRows, { fileName: 'New_Upload.xlsx', sheetName: 'Log' });
const reloaded = loadPersistedRecords();
assert.equal(reloaded.status, 'loaded', 'Status should be loaded after new upload');
assert.equal(reloaded.records.length, 2);
assert.equal(mockLocalStorage.getItem(STORAGE_KEYS.CLEARED), null, 'Cleared flag must be removed');
console.log('Re-uploading and unsetting cleared flag: OK');

// Test 6: migrateStoredLineMappings sanitizes stale L-01 - KTS 550 mappings
mockLocalStorage.setItem(STORAGE_KEYS.MACHINE_MASTER, JSON.stringify([
  { id: 'L-01', name: 'KTS 550', capacityKgH: 400 }
]));
mockLocalStorage.setItem(STORAGE_KEYS.ACTIVE_REPORT, JSON.stringify({
  header: { date: '2026-09-17', lineId: 'L-01', lineCustom: 'KTS 550' }
}));
mockLocalStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify([
  { id: 'rep_old_1', header: { date: '2026-09-17', lineId: 'L-01', lineCustom: 'L-01 - KTS 550' } }
]));
mockLocalStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify([
  { machineId: 'L-01', machineRaw: 'KTS 550', machineName: 'L-01 - KTS 550' }
]));

migrateStoredLineMappings();

const migratedMaster = JSON.parse(mockLocalStorage.getItem(STORAGE_KEYS.MACHINE_MASTER));
const kts550 = migratedMaster.find(m => m.name === 'KTS 550');
assert.equal(kts550.id, 'L-08', 'KTS 550 in machine master must migrate to L-08');

const migratedActive = JSON.parse(mockLocalStorage.getItem(STORAGE_KEYS.ACTIVE_REPORT));
assert.equal(migratedActive.header.lineId, 'L-08', 'Active report with KTS 550 must migrate to L-08');

const migratedReports = JSON.parse(mockLocalStorage.getItem(STORAGE_KEYS.REPORTS));
assert.equal(migratedReports[0].header.lineId, 'L-08', 'Stored report with KTS 550 must migrate to L-08');

const migratedRecords = JSON.parse(mockLocalStorage.getItem(STORAGE_KEYS.RECORDS));
assert.equal(migratedRecords[0].machineId, 'L-08', 'Stored records with KTS 550 must migrate to L-08');
assert.equal(migratedRecords[0].machineName, 'L-08 - KTS 550');
console.log('migrateStoredLineMappings sanitizes stale cache to canonical L-08: OK');

// Test 7: Verify clean empty state after clearPersistedRecords prevents phantom 2024 samples
clearPersistedRecords();
const clearedRecordsState = loadPersistedRecords();
assert.equal(clearedRecordsState.status, 'cleared');
assert.deepEqual(clearedRecordsState.records, []);
assert.equal(clearedRecordsState.records.some(r => (r.date || r.Date || '').startsWith('2024-')), false, 'Must not inject 2024 sample dates');
console.log('Zero 2024 sample injection on clear: OK');

// Test 8: Canonical report keys and matching
assert.equal(makeReportKey('2026-09-28', 'L-06'), '2026-09-28_L-06');
assert.equal(makeReportKey('2026-09-28', 'L-06 - KTS 700'), '2026-09-28_L-06');
assert.equal(makeReportKey('2026-09-28', 'KTS 700'), '2026-09-28_L-06');
assert.equal(isDateEqual('2026-09-28', '2026-09-28T00:00:00.000Z'), true);
assert.equal(isMachineEqual('L-06 - KTS 700', 'L-06'), true);
console.log('makeReportKey, isDateEqual, isMachineEqual canonical matching: OK');

// Test 9: Multi-machine switching preserves user downtime and operating hours
const dummySlots = Array.from({ length: 24 }, (_, i) => ({
  slotIndex: i,
  hourLabel: `${String(i).padStart(2, '0')}:00`,
  plannedMinutes: 60,
  downtimeMinutes: 0,
  actualPieces: 10,
  scrapPieces: 0
}));

// Create L-06 report with 2.5h downtime (21.5h operating) and downtime events
const reportL06 = {
  id: 'rep_2026-09-28_L-06',
  header: {
    date: '2026-09-28',
    lineId: 'L-06',
    lineCustom: 'L-06 - KTS 700'
  },
  slots: dummySlots.map((s, idx) => (idx === 3 ? { ...s, downtimeMinutes: 150 } : s)),
  summary: {
    totalPlannedHours: '24.0',
    totalDowntimeHours: '2.5',
    totalOperatingHours: '21.5',
    availabilityPct: '89.6',
    performancePct: '95.0',
    qualityPct: '98.0',
    oeePct: '83.4'
  },
  downtimeEvents: [
    { hourIndex: 3, category: 'Mechanical Breakdown', durationHours: 2.5, reason: 'Gearbox inspection' }
  ],
  isReconciled: true
};

// Create L-05 report with 0.0h downtime (24.0h operating)
const reportL05 = {
  id: 'rep_2026-09-28_L-05',
  header: {
    date: '2026-09-28',
    lineId: 'L-05',
    lineCustom: 'L-05 - KTS 200'
  },
  slots: dummySlots.map(s => ({ ...s })),
  summary: {
    totalPlannedHours: '24.0',
    totalDowntimeHours: '0.0',
    totalOperatingHours: '24.0',
    availabilityPct: '100.0',
    performancePct: '92.0',
    qualityPct: '99.0',
    oeePct: '91.1'
  },
  downtimeEvents: [],
  isReconciled: true
};

// Save both reports independently
saveReportByDateAndMachine(reportL06);
saveReportByDateAndMachine(reportL05);

// Switching verification:
// 1. Switch to L-05
const loadedL05 = loadReportByDateAndMachine('2026-09-28', 'L-05');
assert.ok(loadedL05, 'L-05 report must be loadable');
assert.equal(loadedL05.summary.totalOperatingHours, '24.0');
assert.equal(loadedL05.summary.totalDowntimeHours, '0.0');

// 2. Switch back to L-06 - Verify it retains 2.5h downtime and 21.5h operating hours
const loadedL06 = loadReportByDateAndMachine('2026-09-28', 'L-06');
assert.ok(loadedL06, 'L-06 report must be loadable');
assert.equal(loadedL06.summary.totalOperatingHours, '21.5', 'Operating hours must be 21.5h (NOT 24.0h)');
assert.equal(loadedL06.summary.totalDowntimeHours, '2.5', 'Downtime hours must be 2.5h (NOT 0.0h)');
assert.equal(loadedL06.downtimeEvents.length, 1, 'Downtime events must be preserved');
assert.equal(loadedL06.downtimeEvents[0].durationHours, 2.5);
assert.equal(loadedL06.isReconciled, true);
console.log('Multi-machine switching preserves user downtime and operating hours: OK');

// Test 10: clearPersistedRecords wipes per-machine pvc_rep_* keys
clearPersistedRecords();
const afterClearL06 = loadReportByDateAndMachine('2026-09-28', 'L-06');
assert.equal(afterClearL06, null, 'Per-machine report must be cleaned on clear');
assert.equal(mockLocalStorage.getItem('pvc_rep_2026-09-28_L-06'), null, 'pvc_rep_ key must be removed');
console.log('clearPersistedRecords wipes per-machine direct keys: OK');

console.log('All Storage & Persistence unit tests passed successfully!');
