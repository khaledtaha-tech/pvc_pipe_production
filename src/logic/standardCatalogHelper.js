import { matchMachine, MACHINES } from '../config/machines.js';
import { getLatestHistoricalRunDetails, getLatestHistoricalRealRate } from './historicalLogHelper.js';

export const BASELINE_CATALOG_STORAGE_KEY = 'pvc_baseline_operating_catalog';
export const BASELINE_CATALOG_UPDATED_EVENT = 'pvc_baseline_operating_catalog_updated';

/**
 * Generate a standardized composite catalog key: {lineId}__{productCode}
 */
export function makeCatalogKey(lineId, productCode) {
  if (!lineId || !productCode) return '';
  const cleanLine = String(lineId).trim().toUpperCase();
  const m = matchMachine(cleanLine);
  const canonicalLine = m?.id ? m.id.toUpperCase() : cleanLine;
  const cleanProd = String(productCode).trim().toUpperCase();
  return `${canonicalLine}__${cleanProd}`;
}

/**
 * Retrieve all persistent machine-mold baseline operating rates.
 * Returns an object keyed by `${lineId}__${productCode}`.
 */
export function getAllBaselines() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(BASELINE_CATALOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Failed to load baseline operating catalog:', err);
    return {};
  }
}

/**
 * Retrieve the explicit baseline entry for a given line and product code.
 * Checks normalized codes and leading zero variants.
 * Returns { lineId, productCode, baselinePcsH, approvedDate, notes } or null.
 */
export function getBaselineEntry(lineId, productCode) {
  if (!lineId || !productCode) return null;
  const catalog = getAllBaselines();
  if (!catalog || typeof catalog !== 'object') return null;

  const primaryKey = makeCatalogKey(lineId, productCode);
  if (catalog[primaryKey] && Number(catalog[primaryKey].baselinePcsH) > 0) {
    return { ...catalog[primaryKey] };
  }

  // Fallback 1: check with leading zero stripped (e.g. '0255' -> '255')
  const cleanCode = String(productCode).trim().toUpperCase();
  const strippedCode = cleanCode.replace(/^0+/, '');
  if (strippedCode && strippedCode !== cleanCode) {
    const altKey = makeCatalogKey(lineId, strippedCode);
    if (catalog[altKey] && Number(catalog[altKey].baselinePcsH) > 0) {
      return { ...catalog[altKey] };
    }
  }

  // Fallback 2: check with leading zero added (e.g. '255' -> '0255')
  if (!cleanCode.startsWith('0')) {
    const altKey2 = makeCatalogKey(lineId, `0${cleanCode}`);
    if (catalog[altKey2] && Number(catalog[altKey2].baselinePcsH) > 0) {
      return { ...catalog[altKey2] };
    }
  }

  return null;
}

/**
 * Retrieve approved integer baseline rate (pcs/h) for machine-mold combination.
 * If not yet established in the catalog, falls back to historical lookup.
 * Returns integer number, or null if neither baseline nor historical rate exists.
 */
export function getBaselineRate(lineId, productCode, records = null, options = {}) {
  const entry = getBaselineEntry(lineId, productCode);
  if (entry && Number(entry.baselinePcsH) > 0) {
    const intRate = Math.round(Number(entry.baselinePcsH));
    if (options.detailed || options.includeDetails) {
      return {
        ...entry,
        baselinePcsH: intRate,
        rate: intRate,
        source: 'baseline',
        isBaseline: true
      };
    }
    return intRate;
  }

  // Fallback to historical log lookup if not in baseline catalog
  const histDetails = getLatestHistoricalRunDetails(lineId, productCode, records, options);
  if (histDetails && Number(histDetails.rate) > 0) {
    const histRate = Math.round(Number(histDetails.rate));
    if (options.detailed || options.includeDetails) {
      return {
        lineId: String(lineId).trim().toUpperCase(),
        productCode: String(productCode).trim().toUpperCase(),
        baselinePcsH: histRate,
        rate: histRate,
        approvedDate: histDetails.date || null,
        notes: 'Derived from historical log record',
        source: 'historical',
        isBaseline: false
      };
    }
    return histRate;
  }

  return null;
}

/**
 * Save or update approved operational baseline rate for a specific machine-mold combination.
 * Key structure: { lineId, productCode } -> { baselinePcsH, approvedDate, notes }
 * Returns saved entry or null on invalid input.
 */
export function saveBaselineRate(lineId, productCode, baselinePcsH, notes = '') {
  if (!lineId || !productCode) return null;
  const numRate = Math.round(Number(baselinePcsH));
  if (isNaN(numRate) || numRate <= 0) return null;

  const cleanLine = String(lineId).trim().toUpperCase();
  const m = matchMachine(cleanLine);
  const canonicalLine = m?.id ? m.id.toUpperCase() : cleanLine;
  const cleanProd = String(productCode).trim().toUpperCase();

  const key = makeCatalogKey(canonicalLine, cleanProd);
  if (!key) return null;

  const catalog = getAllBaselines();
  const entry = {
    lineId: canonicalLine,
    productCode: cleanProd,
    baselinePcsH: numRate,
    approvedDate: new Date().toISOString().slice(0, 10),
    notes: typeof notes === 'string' ? notes.trim() : ''
  };

  catalog[key] = entry;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(BASELINE_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
      window.dispatchEvent(
        new CustomEvent(BASELINE_CATALOG_UPDATED_EVENT, { detail: entry })
      );
    } catch (err) {
      console.warn('Failed to save baseline operating catalog entry:', err);
    }
  }

  return entry;
}

/**
 * Remove a specific machine-mold baseline from the catalog.
 */
export function removeBaselineRate(lineId, productCode) {
  const key = makeCatalogKey(lineId, productCode);
  if (!key) return false;
  const catalog = getAllBaselines();
  if (catalog[key]) {
    delete catalog[key];
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(BASELINE_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
        window.dispatchEvent(
          new CustomEvent(BASELINE_CATALOG_UPDATED_EVENT, { detail: { lineId, productCode, deleted: true } })
        );
      } catch (err) {}
    }
    return true;
  }
  return false;
}

/**
 * Clear all machine-mold baselines from localStorage.
 */
export function clearAllBaselines() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(BASELINE_CATALOG_STORAGE_KEY);
      window.dispatchEvent(
        new CustomEvent(BASELINE_CATALOG_UPDATED_EVENT, { detail: { cleared: true } })
      );
    } catch (err) {}
  }
}

/**
 * Check if a machine-mold combination has an explicit approved baseline.
 */
export function hasBaselineRate(lineId, productCode) {
  const entry = getBaselineEntry(lineId, productCode);
  return Boolean(entry && Number(entry.baselinePcsH) > 0);
}
