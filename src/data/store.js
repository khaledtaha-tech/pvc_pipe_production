import { makeRefSpec } from '../logic/engine.js';
import { MACHINES, matchMachine, sanitizeMachineMaster } from '../config/machines.js';

export const STORAGE_KEYS = {
  REPORTS: 'pvc_dmr_reports_v1',
  RECORDS: 'pvc_production_records',
  CLEARED: 'pvc_production_cleared',
  ACTIVE_REPORT: 'pvc_active_report',
  MACHINE_MASTER: 'pvc_machine_master',
  UPLOADER_META: 'pvc_uploader_meta'
};

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

export function newId() {
  return 'rep_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/**
 * Sanitizes a report object header against canonical machine definitions.
 * Fixes misaligned Line ID and name combinations (e.g. L-01 - KTS 550 -> L-08 - KTS 550).
 */
export function sanitizeStoredReport(report) {
  if (!report || typeof report !== 'object') return report;
  const updated = { ...report };
  if (updated.header) {
    const custom = (updated.header.lineCustom || '').trim();
    const rawId = (updated.header.lineId || '').trim();
    const matchedCustom = custom ? matchMachine(custom, MACHINES) : null;
    const matchedId = rawId ? matchMachine(rawId, MACHINES) : null;
    const matched = matchedCustom || matchedId;

    if (matched) {
      updated.header = {
        ...updated.header,
        lineId: matched.id,
        lineCustom: matchedCustom ? matched.name : (custom || matched.name)
      };
    }
  }
  return updated;
}

/**
 * Sanitizes a single persisted production record to guarantee canonical Line ID and machine name.
 */
export function sanitizeStoredRecord(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  const rawKey = rec.machineRaw || rec.machineName || rec.machineId || '';
  const matched = matchMachine(rawKey, MACHINES) || matchMachine(rec.machineId, MACHINES);
  if (matched) {
    const machineName = `${matched.id} - ${matched.name}`;
    const nominalCapacityKgH = matched.capacityKgH || rec.nominalCapacityKgH || 0;
    return {
      ...rec,
      machineId: matched.id,
      machineName,
      matchedMachine: matched,
      nominalCapacityKgH
    };
  }
  return rec;
}

/**
 * Sanitizes an array of persisted production records.
 */
export function sanitizeStoredRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.map(sanitizeStoredRecord);
}

/**
 * Migrates and synchronizes all legacy localStorage datasets to official canonical machine definitions.
 */
export function migrateStoredLineMappings() {
  const storage = getStorage();
  if (!storage) return;

  try {
    // 1. Sanitize Machine Master
    const rawMaster = storage.getItem(STORAGE_KEYS.MACHINE_MASTER);
    if (rawMaster) {
      const parsedMaster = JSON.parse(rawMaster);
      if (Array.isArray(parsedMaster)) {
        const sanitized = sanitizeMachineMaster(parsedMaster);
        storage.setItem(STORAGE_KEYS.MACHINE_MASTER, JSON.stringify(sanitized));
      }
    }

    // 2. Sanitize Active Report
    const rawActive = storage.getItem(STORAGE_KEYS.ACTIVE_REPORT);
    if (rawActive) {
      const parsedActive = JSON.parse(rawActive);
      if (parsedActive) {
        const sanitized = sanitizeStoredReport(parsedActive);
        storage.setItem(STORAGE_KEYS.ACTIVE_REPORT, JSON.stringify(sanitized));
      }
    }

    // 3. Sanitize Saved Reports List
    const rawReports = storage.getItem(STORAGE_KEYS.REPORTS);
    if (rawReports) {
      const parsedReports = JSON.parse(rawReports);
      if (Array.isArray(parsedReports)) {
        const sanitized = parsedReports.map(sanitizeStoredReport);
        storage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(sanitized));
      }
    }

    // 4. Sanitize Production Records
    const rawRecords = storage.getItem(STORAGE_KEYS.RECORDS);
    if (rawRecords) {
      const parsedRecords = JSON.parse(rawRecords);
      if (Array.isArray(parsedRecords)) {
        const sanitized = sanitizeStoredRecords(parsedRecords);
        storage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(sanitized));
      }
    }
  } catch (err) {
    console.error('Failed to migrate stored line mappings:', err);
  }
}

// Automatically trigger migration in browser environments
if (typeof window !== 'undefined') {
  migrateStoredLineMappings();
}

export function loadAll() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEYS.REPORTS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(sanitizeStoredReport) : [];
  } catch (err) {
    console.error('Failed to load local history:', err);
    return [];
  }
}

export function saveReport(report) {
  const storage = getStorage();
  if (!storage) return report;
  try {
    const items = loadAll();
    const sanitized = sanitizeStoredReport(report);
    const idx = items.findIndex((r) => r.id === sanitized.id);
    const updated = { ...sanitized, updatedAt: Date.now() };
    if (idx >= 0) {
      items[idx] = updated;
    } else {
      items.unshift(updated);
    }
    storage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(items));
    return updated;
  } catch (err) {
    console.error('Failed to save report:', err);
    return report;
  }
}

export function deleteReport(id) {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const items = loadAll().filter((r) => r.id !== id);
    storage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(items));
    return items;
  } catch (err) {
    console.error('Failed to delete report:', err);
    return [];
  }
}

export function loadPersistedRecords() {
  const storage = getStorage();
  if (!storage) return { status: 'empty', records: [] };
  try {
    const isCleared = storage.getItem(STORAGE_KEYS.CLEARED);
    if (isCleared === 'true') {
      return { status: 'cleared', records: [] };
    }
    const raw = storage.getItem(STORAGE_KEYS.RECORDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { status: 'loaded', records: sanitizeStoredRecords(parsed) };
      }
    }
    return { status: 'empty', records: [] };
  } catch (err) {
    console.error('Failed to load persisted records:', err);
    return { status: 'empty', records: [] };
  }
}

export function savePersistedRecords(records, meta = {}) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEYS.CLEARED);
    storage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(sanitizeStoredRecords(records || [])));
    if (meta.machineMaster && Array.isArray(meta.machineMaster)) {
      storage.setItem(STORAGE_KEYS.MACHINE_MASTER, JSON.stringify(meta.machineMaster));
    }
    if (meta.fileName || meta.sheetName) {
      storage.setItem(
        STORAGE_KEYS.UPLOADER_META,
        JSON.stringify({
          fileName: meta.fileName || '',
          sheetName: meta.sheetName || ''
        })
      );
    }
  } catch (err) {
    console.error('Failed to save persisted records:', err);
  }
}

export function clearPersistedRecords() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEYS.CLEARED, 'true');
    storage.removeItem(STORAGE_KEYS.RECORDS);
    storage.removeItem(STORAGE_KEYS.MACHINE_MASTER);
    storage.removeItem(STORAGE_KEYS.UPLOADER_META);
    storage.removeItem(STORAGE_KEYS.ACTIVE_REPORT);
    storage.removeItem(STORAGE_KEYS.REPORTS);
  } catch (err) {
    console.error('Failed to clear persisted records:', err);
  }
}

export function loadPersistedActiveReport() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const isCleared = storage.getItem(STORAGE_KEYS.CLEARED);
    if (isCleared === 'true') {
      return null;
    }
    const raw = storage.getItem(STORAGE_KEYS.ACTIVE_REPORT);
    return raw ? sanitizeStoredReport(JSON.parse(raw)) : null;
  } catch (err) {
    console.error('Failed to load active report:', err);
    return null;
  }
}

export function savePersistedActiveReport(report) {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (report) {
      storage.setItem(STORAGE_KEYS.ACTIVE_REPORT, JSON.stringify(sanitizeStoredReport(report)));
    } else {
      storage.removeItem(STORAGE_KEYS.ACTIVE_REPORT);
    }
  } catch (err) {
    console.error('Failed to persist active report:', err);
  }
}

export function loadPersistedMeta() {
  const storage = getStorage();
  if (!storage) return { fileName: '', sheetName: '', machineMaster: null };
  try {
    const raw = storage.getItem(STORAGE_KEYS.UPLOADER_META);
    const meta = raw ? JSON.parse(raw) : { fileName: '', sheetName: '' };
    const masterRaw = storage.getItem(STORAGE_KEYS.MACHINE_MASTER);
    const machineMaster = masterRaw ? JSON.parse(masterRaw) : null;
    return { ...meta, machineMaster };
  } catch (err) {
    return { fileName: '', sheetName: '', machineMaster: null };
  }
}

export function getBenchmarkReport() {
  const ref1 = {
    ...makeRefSpec(),
    od: '110',
    wt: '3.2',
    pipeLength: '6.0',
    cls: 'Class 4 (PN10)',
    speed: '15',
    stdWeight: '3.2'
  };

  const ref2 = {
    ...makeRefSpec(),
    od: '160',
    wt: '4.0',
    pipeLength: '6.0',
    cls: 'Class 4 (PN10)',
    speed: '12',
    stdWeight: '6.4'
  };

  return {
    id: newId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    header: {
      date: '2026-09-16',
      lineId: 'L-06',
      lineCustom: '',
      plantName: 'PVC PIPE EXTRUSION PLANT'
    },
    refs: {
      1: ref1,
      2: ref2
    },
    summary: {
      startCounter: '0',
      endCounter: '3150',
      totalOutput: '3150',
      totalBundles: '21',
      totalScrapPipes: '25',
      totalPurgeKg: '100',
      haulOffMeter: '145200',
      resinLot: 'PVC-DRYBLEND-L26-09',
      shift1Lead: 'Shift 1 Lead / Extrusion Tech',
      shift2Lead: 'Shift 2 Lead / Extrusion Tech',
      plantManager: 'Plant Production Manager'
    },
    downtimeEvents: [
      { key: newId(), startHour: 6, durationMin: 60, reason: 'Die head & sizing sleeve changeover' },
      { key: newId(), startHour: 7, durationMin: 60, reason: 'Barrel & die heating stabilization' },
      { key: newId(), startHour: 8, durationMin: 60, reason: 'Vacuum tank & haul-off calibration / purging' }
    ],
    slots: []
  };
}
