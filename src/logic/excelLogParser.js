import { MACHINES, matchMachine, normalizeLineId, sanitizeMachineMaster } from '../config/machines.js';
import { normalizeExcelDate } from './excelParser.js';
import { resolveStdWeightFromSpecs } from './legacySopHelper.js';
import { autoRegisterPendingProduct, isValidProductCode } from './productCatalogHelper.js';

export const LATEST_RUN_STORAGE_KEYS = {
  LATEST_EXCEL_LOGGED_RUN: 'latestExcelLoggedRun',
  LATEST_PARSED_DATE_LINES: 'latestParsedDateLines'
};

// In-memory fallback for non-browser / test environments
let inMemoryLatestLoggedRun = null;

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

/**
 * Normalizes machine name to canonical line ID and profile details.
 * E.g. "KTS-170" -> "L-02", "KABRA-90" -> "L-03", "KTS-250 TDH" -> "L-07", "KTS-700" -> "L-06"
 */
export function normalizeMachineLine(machineRaw, machineMaster = MACHINES) {
  const master = sanitizeMachineMaster(machineMaster);
  const clean = String(machineRaw || '').trim();
  if (!clean) return null;

  const matched = matchMachine(clean, master);
  if (matched) {
    return {
      lineId: matched.id,
      lineName: matched.name,
      fullMachineName: `${matched.id} - ${matched.name}`,
      nominalCapacityKgH: matched.capacityKgH || matched.nominalCapacity || 250,
      isPelletizingLine: Boolean(matched.isPelletizingLine),
      matchedMachine: matched
    };
  }

  const canonId = normalizeLineId(clean);
  return {
    lineId: canonId || clean,
    lineName: clean,
    fullMachineName: canonId ? `${canonId} - ${clean}` : clean,
    nominalCapacityKgH: 250,
    isPelletizingLine: false,
    matchedMachine: null
  };
}

/**
 * Scan rows to find the latest valid calendar date (YYYY-MM-DD).
 * Excludes summary / total rows.
 */
export function findLatestProductionDate(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const validDates = new Set();
  for (const r of rows) {
    if (!r) continue;
    const raw = typeof r === 'object' ? (r.date || r.Date || r[0] || '') : '';
    const rawStr = String(raw).trim();
    if (!rawStr || /total/i.test(rawStr)) continue;

    const norm = normalizeExcelDate(raw);
    if (norm && !/total/i.test(norm) && /^\d{4}-\d{2}-\d{2}$/.test(norm)) {
      validDates.add(norm);
    }
  }

  if (validDates.size === 0) return null;
  const sorted = Array.from(validDates).sort((a, b) => b.localeCompare(a));
  return sorted[0];
}

/**
 * Compute previous day date string (YYYY-MM-DD)
 */
export function getPreviousDay(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const d = new Date(Date.UTC(year, month, day - 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

/**
 * Compute next day date string (YYYY-MM-DD)
 */
export function getNextDay(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const d = new Date(Date.UTC(year, month, day + 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

/**
 * Extract operating lines and assigned products for the latest date in the daily production log.
 * Handles both parsed row objects and raw 2D array rows (from SheetJS).
 */
export function extractLatestDateOperationalLines(rowsOrParsed, targetDate = null, machineMaster = MACHINES) {
  if (!Array.isArray(rowsOrParsed) || rowsOrParsed.length === 0) {
    return { latestDate: null, lines: [], lineMap: {}, count: 0 };
  }

  const master = sanitizeMachineMaster(machineMaster);

  // 1. Determine target date: explicit or latest date present in data
  const dateIso = targetDate ? normalizeExcelDate(targetDate) : findLatestProductionDate(rowsOrParsed);
  if (!dateIso) {
    return { latestDate: null, lines: [], lineMap: {}, count: 0 };
  }

  // 2. Filter rows strictly for the target date
  const dateRows = rowsOrParsed.filter((r) => {
    if (!r) return false;
    const rDate = typeof r === 'object' ? (r.date || r.Date || r[0] || '') : '';
    const norm = normalizeExcelDate(rDate);
    return norm === dateIso;
  });

  if (dateRows.length === 0) {
    return { latestDate: dateIso, lines: [], lineMap: {}, count: 0 };
  }

  const lineMap = {};

  for (const row of dateRows) {
    // Read properties from object or column indices (Col A: Date, Col B: Item Code, Col C: Desc, Col D: Machine)
    const isArrayRow = Array.isArray(row);
    const rawMachine = isArrayRow ? (row[3] || row[4]) : (row.machineRaw || row.machine || row.machineName || row.machineId || row[3]);
    const rawItemCode = isArrayRow ? row[1] : (row.itemCode || row.productCode || row.code || row[1]);
    const rawDesc = isArrayRow ? row[2] : (row.description || row.productDescription || row.spec || row[2]);

    const machineInfo = normalizeMachineLine(rawMachine, master);
    if (!machineInfo || !machineInfo.lineId) continue;

    const lineId = machineInfo.lineId;
    const cleanItemCode = rawItemCode !== undefined && rawItemCode !== null ? String(rawItemCode).trim() : '';
    const cleanDesc = rawDesc !== undefined && rawDesc !== null ? String(rawDesc).trim() : '';

    const opHours = Number(isArrayRow ? row[10] : (row.operatingHours ?? row.opHours ?? row.hours ?? 24)) || 24;
    const prodQty = Number(isArrayRow ? row[6] : (row.productionQty ?? row.qty ?? row.fgQty ?? 0)) || 0;
    const totalWt = Number(isArrayRow ? row[8] : (row.totalWeight ?? row.totalWeightKg ?? row.weightKg ?? 0)) || 0;
    const unitWt = Number(isArrayRow ? row[7] : (row.unitWeight ?? row.stdWeight ?? 0)) || 0;
    const scrapKg = Number(isArrayRow ? row[12] : (row.scrapKg ?? 0)) || 0;

    const resolvedWeight = unitWt > 0
      ? unitWt
      : resolveStdWeightFromSpecs({ itemCode: cleanItemCode, description: cleanDesc }, 6.0);

    // Auto-register discovered product into central catalog
    if (cleanItemCode && isValidProductCode(cleanItemCode, cleanDesc)) {
      try {
        autoRegisterPendingProduct(cleanItemCode, cleanDesc, {
          unitWeight: resolvedWeight,
          stdWeight: resolvedWeight,
          pipeLength: machineInfo.isPelletizingLine ? 0 : 6.0
        });
      } catch (_) {}
    }

    const actualRatePcsH = opHours > 0 && prodQty > 0
      ? Math.round((prodQty / opHours) * 10) / 10
      : (Number(row.actualRatePcsH) || 0);

    const lineData = {
      lineId,
      lineName: machineInfo.lineName,
      fullMachineName: machineInfo.fullMachineName,
      nominalCapacityKgH: machineInfo.nominalCapacityKgH,
      isCompounding: machineInfo.isPelletizingLine,
      date: dateIso,
      itemCode: cleanItemCode,
      description: cleanDesc,
      productDescription: cleanDesc,
      unitWeight: resolvedWeight,
      stdWeight: resolvedWeight,
      pipeLength: machineInfo.isPelletizingLine ? 0 : 6.0,
      operatingHours: opHours,
      productionQty: prodQty,
      totalWeightKg: totalWt,
      scrapKg,
      actualRatePcsH,
      targetPcsH: actualRatePcsH > 0 ? actualRatePcsH : (machineInfo.nominalCapacityKgH > 0 && resolvedWeight > 0 ? Math.round(machineInfo.nominalCapacityKgH / resolvedWeight) : 100),
      isOperating: opHours > 0 || prodQty > 0 || totalWt > 0,
      rowData: row
    };

    // If machine already present for this date, pick the one with greater production quantity or operating hours
    if (lineMap[lineId]) {
      const existing = lineMap[lineId];
      if (prodQty > (existing.productionQty || 0) || opHours > (existing.operatingHours || 0)) {
        lineMap[lineId] = lineData;
      }
    } else {
      lineMap[lineId] = lineData;
    }
  }

  const lines = Object.values(lineMap).sort((a, b) => a.lineId.localeCompare(b.lineId));

  return {
    latestDate: dateIso,
    lines,
    lineMap,
    count: lines.length
  };
}

/**
 * Cache latest Excel logged operational state to localStorage (and in-memory fallback)
 */
export function saveLatestExcelLoggedRun(data) {
  if (!data) return;
  inMemoryLatestLoggedRun = data;

  const store = getStorage();
  if (!store) return;

  try {
    const raw = JSON.stringify(data);
    store.setItem(LATEST_RUN_STORAGE_KEYS.LATEST_EXCEL_LOGGED_RUN, raw);
    store.setItem(LATEST_RUN_STORAGE_KEYS.LATEST_PARSED_DATE_LINES, raw);
  } catch (err) {
    console.warn('Failed to save latestExcelLoggedRun in localStorage:', err);
  }
}

/**
 * Load latest Excel logged operational state from localStorage (or in-memory fallback)
 */
export function loadLatestExcelLoggedRun() {
  const store = getStorage();
  if (store) {
    try {
      const raw = store.getItem(LATEST_RUN_STORAGE_KEYS.LATEST_EXCEL_LOGGED_RUN) || store.getItem(LATEST_RUN_STORAGE_KEYS.LATEST_PARSED_DATE_LINES);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Failed to parse latestExcelLoggedRun from localStorage:', err);
    }
  }
  return inMemoryLatestLoggedRun;
}

/**
 * Clear cached latest Excel run
 */
export function clearLatestExcelLoggedRun() {
  inMemoryLatestLoggedRun = null;
  const store = getStorage();
  if (store) {
    try {
      store.removeItem(LATEST_RUN_STORAGE_KEYS.LATEST_EXCEL_LOGGED_RUN);
      store.removeItem(LATEST_RUN_STORAGE_KEYS.LATEST_PARSED_DATE_LINES);
    } catch (_) {}
  }
}
