import { matchMachine, MACHINES, sanitizeMachineMaster } from '../config/machines.js';
import { loadPersistedRecords, loadAll } from '../data/store.js';

/**
 * Match a candidate record's machine line against targetLineId.
 * Supports canonical line IDs (L-01..L-08), machine names, sub-run IDs (L-02-run-1), and raw logs.
 */
function isLineMatching(record, targetLineId, master = MACHINES) {
  if (!record || !targetLineId) return false;
  const cleanTarget = String(targetLineId).trim().toUpperCase();
  const mTarget = matchMachine(cleanTarget, master);
  const targetCanonical = mTarget?.id ? mTarget.id.toUpperCase() : cleanTarget;

  const rawCandidates = [
    record.machineId,
    record.lineId,
    record.parentLineId,
    record.baseLineId,
    record.machineRaw,
    record.machineName,
    record.machine,
    record.matchedMachine?.id,
    record.header?.lineId,
    record.header?.machineId
  ].filter(Boolean);

  for (const raw of rawCandidates) {
    const clean = String(raw).trim().toUpperCase();
    if (clean === targetCanonical || clean === cleanTarget) return true;
    if (clean.startsWith(targetCanonical) || targetCanonical.startsWith(clean)) return true;
    const mRec = matchMachine(clean, master);
    if (mRec?.id && mRec.id.toUpperCase() === targetCanonical) return true;
  }

  return false;
}

/**
 * Match a candidate record against targetProductCode.
 * Performs normalization for leading zeros (e.g. "0255" matches "255")
 * and inspects top-level fields, record.items sub-arrays, and record.refs DMR objects.
 */
function isProductCodeMatching(record, targetProductCode) {
  if (!record) return false;
  if (!targetProductCode) return true; // If no product code provided, line match suffices

  const cleanTarget = String(targetProductCode).trim().toUpperCase();
  const normTarget = cleanTarget.replace(/^0+/, '');

  const directCandidates = [
    record.itemCode,
    record.productCode,
    record.code,
    record.engineering?.itemCode,
    record.header?.itemCode,
    record.raw?.itemCode,
    record.raw?.['Item Code']
  ].filter(Boolean);

  for (const c of directCandidates) {
    const clean = String(c).trim().toUpperCase();
    const norm = clean.replace(/^0+/, '');
    if (clean === cleanTarget || norm === normTarget) return true;
  }

  // Check sub-items in multi-item records
  if (Array.isArray(record.items)) {
    for (const it of record.items) {
      if (!it) continue;
      const itCode = String(it.itemCode || it.productCode || it.code || '').trim().toUpperCase();
      if (itCode === cleanTarget || itCode.replace(/^0+/, '') === normTarget) return true;
    }
  }

  // Check multi-run refs in reconciled reports
  if (record.refs && typeof record.refs === 'object') {
    for (const k of Object.keys(record.refs)) {
      const ref = record.refs[k];
      if (!ref) continue;
      const refCode = String(ref.itemCode || ref.productCode || ref.code || '').trim().toUpperCase();
      if (refCode === cleanTarget || refCode.replace(/^0+/, '') === normTarget) return true;
    }
  }

  // Fallback: check product description for embedded item code
  const desc = String(record.productDescription || record.description || record.raw?.description || '').toUpperCase();
  if (desc && desc.includes(cleanTarget)) {
    return true;
  }

  return false;
}

/**
 * Extract achieved real pieces per hour (actualRatePcsH) from a matching record.
 */
function extractAchievedRate(record, targetProductCode) {
  if (!record) return null;
  const cleanTarget = targetProductCode ? String(targetProductCode).trim().toUpperCase() : '';
  const normTarget = cleanTarget.replace(/^0+/, '');

  // 1. Check matching sub-item in record.items
  if (cleanTarget && Array.isArray(record.items)) {
    const matchedItem = record.items.find((it) => {
      if (!it) return false;
      const code = String(it.itemCode || it.productCode || it.code || '').trim().toUpperCase();
      return code === cleanTarget || code.replace(/^0+/, '') === normTarget;
    });
    if (matchedItem) {
      if (Number(matchedItem.actualRatePcsH) > 0) {
        return Math.round(Number(matchedItem.actualRatePcsH) * 10) / 10;
      }
      const pcs = Number(matchedItem.actualPcs ?? matchedItem.productionQty ?? matchedItem.qty) || 0;
      const hrs = Number(matchedItem.operatingHours ?? matchedItem.hours) || 0;
      if (pcs > 0 && hrs > 0) {
        return Math.round((pcs / hrs) * 10) / 10;
      }
    }
  }

  // 2. Check matching ref in record.refs
  if (cleanTarget && record.refs && typeof record.refs === 'object') {
    for (const k of Object.keys(record.refs)) {
      const ref = record.refs[k];
      if (!ref) continue;
      const code = String(ref.itemCode || ref.productCode || ref.code || '').trim().toUpperCase();
      if (code === cleanTarget || code.replace(/^0+/, '') === normTarget) {
        if (Number(ref.actualRatePcsH) > 0) {
          return Math.round(Number(ref.actualRatePcsH) * 10) / 10;
        }
        const pcs = Number(ref.actualPcs ?? ref.pieces ?? ref.qty) || 0;
        const hrs = Number(ref.operatingHours ?? ref.hours) || 0;
        if (pcs > 0 && hrs > 0) {
          return Math.round((pcs / hrs) * 10) / 10;
        }
      }
    }
  }

  // 3. Direct actualRatePcsH or engineering rate
  if (Number(record.actualRatePcsH) > 0) {
    return Math.round(Number(record.actualRatePcsH) * 10) / 10;
  }
  if (Number(record.engineering?.actualRatePcsH) > 0) {
    return Math.round(Number(record.engineering.actualRatePcsH) * 10) / 10;
  }
  if (Number(record.realRatePcsH) > 0) {
    return Math.round(Number(record.realRatePcsH) * 10) / 10;
  }

  // 4. Calculate directly from actualPcs / operatingHours
  const pcs = Number(
    record.actualPcs ??
    record.productionQty ??
    record.productionPieces ??
    record.goodPcs ??
    record.engineering?.actualPcs ??
    record.engineering?.goodPcs
  ) || 0;

  const hrs = Number(
    record.operatingHours ??
    record.engineering?.operatingHours ??
    record.actualHours ??
    record.opHours
  ) || 0;

  if (pcs > 0 && hrs > 0) {
    return Math.round((pcs / hrs) * 10) / 10;
  }

  // 5. Fallback: actualKg / (unitWeight * operatingHours)
  const kg = Number(record.actualKg ?? record.totalWeightKg ?? record.productionWeightKg ?? record.engineering?.totalWeightKg) || 0;
  const unitWeight = Number(record.unitWeight ?? record.stdWeight ?? record.engineering?.unitWeight) || 0;
  if (kg > 0 && unitWeight > 0 && hrs > 0) {
    const derivedPcs = kg / unitWeight;
    return Math.round((derivedPcs / hrs) * 10) / 10;
  }

  return null;
}

/**
 * Extract canonical date string (YYYY-MM-DD) from record
 */
function extractRecordDate(record) {
  if (!record) return '';
  const raw = record.date || record.header?.date || record.raw?.date || record.raw?.Date || '';
  if (!raw) return '';
  const str = String(raw).trim();
  const m = str.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/);
  if (m) {
    const parts = m[0].split(/[-/.]/);
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  return str.slice(0, 10);
}

/**
 * Search stored logs and reports for the most recent run with matching lineId and productCode.
 * Returns detailed run object: { rate, date, record } or null if not found.
 */
export function getLatestHistoricalRunDetails(lineId, productCode, records = null, options = {}) {
  const master = options.machineMaster ? sanitizeMachineMaster(options.machineMaster) : MACHINES;
  const allCandidates = [];

  // 1. Gather records passed in arguments
  if (Array.isArray(records) && records.length > 0) {
    allCandidates.push(...records);
  }

  // 2. Supplement with persistent storage if available
  if (!options.skipStore) {
    try {
      const persisted = loadPersistedRecords();
      if (Array.isArray(persisted) && persisted.length > 0) {
        allCandidates.push(...persisted);
      }
    } catch (_) {}

    try {
      const reports = loadAll();
      if (Array.isArray(reports) && reports.length > 0) {
        allCandidates.push(...reports);
      }
    } catch (_) {}
  }

  if (allCandidates.length === 0) {
    return null;
  }

  const matches = [];
  for (const rec of allCandidates) {
    if (!rec) continue;
    if (isLineMatching(rec, lineId, master) && isProductCodeMatching(rec, productCode)) {
      const rate = extractAchievedRate(rec, productCode);
      if (rate !== null && rate > 0) {
        matches.push({
          rate,
          date: extractRecordDate(rec),
          record: rec
        });
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // Sort descending by date to prioritize the most recent historical run
  matches.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  return matches[0];
}

/**
 * Search stored logs and reports for the most recent run with matching lineId and productCode.
 * Extracts the achieved actualRatePcsH (or calculates actualPcs / operatingHours).
 * Returns the numerical rate, or null if no previous record exists.
 */
export function getLatestHistoricalRealRate(lineId, productCode, records = null, options = {}) {
  const details = getLatestHistoricalRunDetails(lineId, productCode, records, options);
  if (!details) return null;
  if (options.detailed || options.includeDetails) {
    return details;
  }
  return details.rate;
}
