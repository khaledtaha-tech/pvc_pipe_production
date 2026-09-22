import { consolidateDailyMachineRecords } from './excelParser.js';

/**
 * Utility functions for Batch ZIP Export of Daily Monitoring Reports
 */

/**
 * Determine if a log row represents an actively operating extrusion machine.
 * Must satisfy: operatingHours > 0 OR actualOutputKg > 0 (or totalWeight > 0 or productionQty > 0).
 * Excludes full 24h shutdown / idle zero-output lines.
 */
export function isRecordOperating(r) {
  if (!r) return false;
  const opHours = Number(r.operatingHours) || 0;
  const prodQty = Number(r.productionQty) || 0;
  const totalWt = Number(r.totalWeight) || Number(r.actualOutputKg) || 0;
  return opHours > 0 || prodQty > 0 || totalWt > 0;
}

/**
 * Filter records for a specific date that represent active operating machines.
 * An active operating machine has operatingHours > 0 or valid production output.
 * Excludes grand total summary rows or invalid entries.
 * Consolidates multi-item records for the same machine into exactly one 24-hour record.
 */
export function getOperatingRecordsForDate(records, targetDate, machineMaster) {
  if (!Array.isArray(records) || !targetDate || targetDate === 'ALL') {
    return [];
  }

  const cleanTarget = String(targetDate).trim();

  const filtered = records.filter((r) => {
    if (!r || !r.date) return false;
    const rDate = String(r.date).trim();
    if (rDate !== cleanTarget) return false;

    // Filter out total summary rows
    if (rDate.toLowerCase().includes('total') || (r.machineRaw && r.machineRaw.toLowerCase().includes('total'))) {
      return false;
    }

    return isRecordOperating(r);
  });

  return consolidateDailyMachineRecords(filtered, machineMaster);
}

/**
 * Sanitize string for clean, safe filenames (removes invalid characters, slashes, spaces)
 */
export function sanitizeFilenamePart(str, fallback = 'Unknown') {
  if (!str) return fallback;
  return String(str)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
}

/**
 * Generate standard PDF filename: Daily_Report_{Date}_{LineID}_{MachineName}.pdf
 */
export function formatPdfFilename(date, lineId, machineName) {
  const d = sanitizeFilenamePart(date, 'Date');
  const l = sanitizeFilenamePart(lineId, 'Line');
  const m = sanitizeFilenamePart(machineName, 'Machine');
  return `Daily_Report_${d}_${l}_${m}.pdf`;
}

/**
 * Generate standard SOP PDF filename: Daily_Report_{Date}_{LineID}_{MachineName}_DOC-Ext-03_SOP.pdf
 */
export function formatSopPdfFilename(date, lineId, machineName) {
  const d = sanitizeFilenamePart(date, 'Date');
  const l = sanitizeFilenamePart(lineId, 'Line');
  const m = sanitizeFilenamePart(machineName, 'Machine');
  return `Daily_Report_${d}_${l}_${m}_DOC-Ext-03_SOP.pdf`;
}

/**
 * Generate standard ZIP filename: Daily_Reports_{Date}_All_Machines.zip
 */
export function formatZipFilename(date) {
  const d = sanitizeFilenamePart(date, 'Date');
  return `Daily_Reports_${d}_All_Machines.zip`;
}

/**
 * Generate standard SOP ZIP filename: SOP_Reports_{Date}_All_Machines.zip
 */
export function formatSopZipFilename(date) {
  const d = sanitizeFilenamePart(date, 'Date');
  return `SOP_Reports_${d}_All_Machines.zip`;
}

/**
 * Filter records within a date range (inclusive) that represent active operating machines.
 */
export function getOperatingRecordsForDateRange(records, fromDate, toDate, machineMaster) {
  if (!Array.isArray(records) || !fromDate || !toDate) {
    return [];
  }

  let [start, end] = [String(fromDate).trim(), String(toDate).trim()];
  if (start > end) {
    [start, end] = [end, start];
  }

  const filtered = records.filter((r) => {
    if (!r || !r.date) return false;
    const rDate = String(r.date).trim();
    if (rDate < start || rDate > end) return false;

    // Filter out total summary rows
    if (rDate.toLowerCase().includes('total') || (r.machineRaw && r.machineRaw.toLowerCase().includes('total'))) {
      return false;
    }

    return isRecordOperating(r);
  });

  return consolidateDailyMachineRecords(filtered, machineMaster).sort((a, b) => {
    const dComp = String(a.date).localeCompare(String(b.date));
    if (dComp !== 0) return dComp;
    return String(a.machineId || '').localeCompare(String(b.machineId || ''));
  });
}

/**
 * Generate date range ZIP filename: Daily_Reports_{From}_to_{To}_All_Machines.zip
 */
export function formatRangeZipFilename(fromDate, toDate) {
  const d1 = sanitizeFilenamePart(fromDate, 'From');
  const d2 = sanitizeFilenamePart(toDate, 'To');
  return `Daily_Reports_${d1}_to_${d2}_All_Machines.zip`;
}

/**
 * Generate date range SOP ZIP filename: SOP_Reports_{From}_to_{To}_All_Machines.zip
 */
export function formatRangeSopZipFilename(fromDate, toDate) {
  const d1 = sanitizeFilenamePart(fromDate, 'From');
  const d2 = sanitizeFilenamePart(toDate, 'To');
  return `SOP_Reports_${d1}_to_${d2}_All_Machines.zip`;
}

/**
 * Trigger browser file download from a Blob
 */
export function downloadBlob(blob, filename) {
  if (typeof window === 'undefined' || !window.URL) return;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
