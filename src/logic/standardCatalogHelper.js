import * as XLSX from 'xlsx';
import { matchMachine, machineLabel, MACHINES } from '../config/machines.js';
import { getLatestHistoricalRunDetails, getLatestHistoricalRealRate } from './historicalLogHelper.js';

export const BASELINE_CATALOG_STORAGE_KEY = 'pvc_baseline_operating_catalog';
export const BASELINE_CATALOG_UPDATED_EVENT = 'pvc_baseline_operating_catalog_updated';

/**
 * Lookup human-readable full machine name (e.g. "L-06 - KTS 700") from line ID or machine name
 * @param {string} lineId
 * @param {Array} [masterList=MACHINES]
 * @returns {string}
 */
export function getFullMachineName(lineId, masterList = MACHINES) {
  if (!lineId) return '';
  const clean = String(lineId).trim().toUpperCase();
  const matched = matchMachine(clean, masterList);
  if (matched && matched.name) {
    return `${matched.id} - ${matched.name}`;
  }
  return machineLabel(clean, masterList) || clean;
}

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
 * Calculate hourly rate from 24h daily target.
 * Always returns a positive whole integer, or 0.
 */
export function calculateHourlyFromDaily(dailyTargetPcs) {
  const daily = Number(dailyTargetPcs);
  if (isNaN(daily) || daily <= 0) return 0;
  return Math.round(daily / 24);
}

/**
 * Calculate 24h daily target from hourly rate.
 * Always returns a positive whole integer, or 0.
 */
export function calculateDailyFromHourly(hourlyRatePcsH) {
  const hourly = Number(hourlyRatePcsH);
  if (isNaN(hourly) || hourly <= 0) return 0;
  return Math.round(hourly * 24);
}

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
 * Retrieve all persistent machine-mold baseline operating rates.
 * Returns an object keyed by `${lineId}__${productCode}`.
 */
export function getAllBaselines() {
  const storage = getStorage();
  if (!storage) {
    return {};
  }
  try {
    const raw = storage.getItem(BASELINE_CATALOG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') {
      Object.keys(parsed).forEach((k) => {
        if (parsed[k] && Number(parsed[k].baselinePcsH) > 0) {
          const rate = Math.round(Number(parsed[k].baselinePcsH));
          parsed[k].baselinePcsH = rate;
          parsed[k].dailyTargetPcs = parsed[k].dailyTargetPcs
            ? Math.round(Number(parsed[k].dailyTargetPcs))
            : Math.round(rate * 24);
        }
      });
    }
    return parsed;
  } catch (err) {
    console.warn('Failed to load baseline operating catalog:', err);
    return {};
  }
}

/**
 * Retrieve the explicit baseline entry for a given line and product code.
 * Checks normalized codes and leading zero variants.
 * Returns { lineId, productCode, baselinePcsH, dailyTargetPcs, approvedDate, notes } or null.
 */
export function getBaselineEntry(lineId, productCode) {
  if (!lineId || !productCode) return null;
  const catalog = getAllBaselines();
  if (!catalog || typeof catalog !== 'object') return null;

  const normalizeEntry = (raw) => {
    if (!raw || Number(raw.baselinePcsH) <= 0) return null;
    const rate = Math.round(Number(raw.baselinePcsH));
    return {
      ...raw,
      baselinePcsH: rate,
      dailyTargetPcs: raw.dailyTargetPcs
        ? Math.round(Number(raw.dailyTargetPcs))
        : Math.round(rate * 24)
    };
  };

  const primaryKey = makeCatalogKey(lineId, productCode);
  if (catalog[primaryKey] && Number(catalog[primaryKey].baselinePcsH) > 0) {
    return normalizeEntry(catalog[primaryKey]);
  }

  // Fallback 1: check with leading zero stripped (e.g. '0255' -> '255')
  const cleanCode = String(productCode).trim().toUpperCase();
  const strippedCode = cleanCode.replace(/^0+/, '');
  if (strippedCode && strippedCode !== cleanCode) {
    const altKey = makeCatalogKey(lineId, strippedCode);
    if (catalog[altKey] && Number(catalog[altKey].baselinePcsH) > 0) {
      return normalizeEntry(catalog[altKey]);
    }
  }

  // Fallback 2: check with leading zero added (e.g. '255' -> '0255')
  if (!cleanCode.startsWith('0')) {
    const altKey2 = makeCatalogKey(lineId, `0${cleanCode}`);
    if (catalog[altKey2] && Number(catalog[altKey2].baselinePcsH) > 0) {
      return normalizeEntry(catalog[altKey2]);
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
        dailyTargetPcs: entry.dailyTargetPcs ? Math.round(Number(entry.dailyTargetPcs)) : Math.round(intRate * 24),
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
        dailyTargetPcs: Math.round(histRate * 24),
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
 * Key structure: { lineId, productCode } -> { baselinePcsH, dailyTargetPcs, approvedDate, notes }
 * Returns saved entry or null on invalid input.
 */
export function saveBaselineRate(lineId, productCode, baselinePcsH, notes = '', dailyTargetPcs = null) {
  if (!lineId || !productCode) return null;
  
  let numRate = Math.round(Number(baselinePcsH));
  let numDaily = dailyTargetPcs != null && !isNaN(Number(dailyTargetPcs)) && Number(dailyTargetPcs) > 0
    ? Math.round(Number(dailyTargetPcs))
    : null;

  // If rate is not valid or 0, but daily target was provided:
  if ((isNaN(numRate) || numRate <= 0) && numDaily && numDaily > 0) {
    numRate = Math.round(numDaily / 24);
  }

  if (isNaN(numRate) || numRate <= 0) return null;

  // If daily target was not provided, derive it from rate
  if (!numDaily || numDaily <= 0) {
    numDaily = Math.round(numRate * 24);
  }

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
    dailyTargetPcs: numDaily,
    approvedDate: new Date().toISOString().slice(0, 10),
    notes: typeof notes === 'string' ? notes.trim() : ''
  };

  catalog[key] = entry;

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(BASELINE_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent(BASELINE_CATALOG_UPDATED_EVENT, { detail: entry })
        );
      }
    } catch (err) {
      console.warn('Failed to save baseline operating catalog entry locally:', err);
    }
  }

  // Asynchronously persist to central MySQL database
  saveBaselineRateToServer(canonicalLine, cleanProd, numRate, entry.notes, numDaily).catch(() => {});

  return entry;
}

/**
 * Get endpoint URL for baseline catalog API
 */
export function getBaselineApiUrl() {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return './api/baseline_catalog.php';
  }
  return '/api/baseline_catalog.php';
}

/**
 * Save baseline rate directly to central MySQL server via POST/PUT
 * @returns {Promise<Object>}
 */
export async function saveBaselineRateToServer(lineId, productCode, baselinePcsH, notes = '', dailyTargetPcs = null, options = {}) {
  const fetchFn = options.fetchFn || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : (typeof fetch === 'function' ? fetch : null));
  if (!fetchFn) {
    return { success: false, offline: true, message: 'Fetch API not available' };
  }

  const cleanLine = String(lineId).trim().toUpperCase();
  const m = matchMachine(cleanLine);
  const canonicalLine = m?.id ? m.id.toUpperCase() : cleanLine;
  const cleanProd = String(productCode).trim().toUpperCase();
  const numRate = Math.round(Number(baselinePcsH));

  if (!canonicalLine || !cleanProd || isNaN(numRate) || numRate <= 0) {
    return { success: false, message: 'Invalid machine, product code, or rate' };
  }

  const numDaily = dailyTargetPcs != null && !isNaN(Number(dailyTargetPcs)) && Number(dailyTargetPcs) > 0
    ? Math.round(Number(dailyTargetPcs))
    : Math.round(numRate * 24);

  const url = options.endpoint || getBaselineApiUrl();

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        lineId: canonicalLine,
        productCode: cleanProd,
        baselinePcsH: numRate,
        dailyTargetPcs: numDaily,
        notes: typeof notes === 'string' ? notes.trim() : ''
      })
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || (json && json.success === false)) {
      return {
        success: false,
        status: res.status,
        message: json?.message || `HTTP ${res.status} saving baseline to server`
      };
    }

    return {
      success: true,
      data: json,
      lineId: canonicalLine,
      productCode: cleanProd,
      baselinePcsH: numRate
    };
  } catch (err) {
    return {
      success: false,
      offline: true,
      message: err?.message || 'Network error saving baseline to server'
    };
  }
}

/**
 * Remove baseline rate directly from central MySQL server via DELETE
 * @returns {Promise<Object>}
 */
export async function removeBaselineRateFromServer(lineId, productCode, options = {}) {
  const fetchFn = options.fetchFn || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : (typeof fetch === 'function' ? fetch : null));
  if (!fetchFn) {
    return { success: false, offline: true, message: 'Fetch API not available' };
  }

  const cleanLine = String(lineId).trim().toUpperCase();
  const m = matchMachine(cleanLine);
  const canonicalLine = m?.id ? m.id.toUpperCase() : cleanLine;
  const cleanProd = String(productCode).trim().toUpperCase();

  const baseUrl = options.endpoint || getBaselineApiUrl();
  const url = `${baseUrl}?line_id=${encodeURIComponent(canonicalLine)}&product_code=${encodeURIComponent(cleanProd)}`;

  try {
    const res = await fetchFn(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || (json && json.success === false)) {
      return {
        success: false,
        status: res.status,
        message: json?.message || `HTTP ${res.status} deleting baseline from server`
      };
    }

    return {
      success: true,
      deleted: true,
      lineId: canonicalLine,
      productCode: cleanProd
    };
  } catch (err) {
    return {
      success: false,
      offline: true,
      message: err?.message || 'Network error deleting baseline from server'
    };
  }
}

/**
 * Synchronize baseline standards from central MySQL server.
 * Merges remote standards into local catalog cache and dispatches updated event.
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, count?: number, catalog?: Object, error?: string, offline?: boolean }>}
 */
export async function syncBaselinesWithServer(options = {}) {
  const storage = getStorage();
  if (!storage) {
    return { success: false, offline: true, message: 'No localStorage environment available' };
  }

  const fetchFn = options.fetchFn || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : (typeof fetch === 'function' ? fetch : null));
  if (!fetchFn) {
    return { success: false, offline: true, message: 'Fetch API not available' };
  }

  const url = options.endpoint || getBaselineApiUrl();

  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response || !response.ok) {
      return {
        success: false,
        status: response?.status,
        message: `HTTP ${response?.status || 'Error'} from baseline API`
      };
    }

    const json = await response.json().catch(() => null);
    if (!json || json.success === false) {
      return {
        success: false,
        message: json?.message || 'Invalid API response format'
      };
    }

    const remoteCatalog = json.catalog || {};
    const remoteData = Array.isArray(json.data) ? json.data : (Array.isArray(json.items) ? json.items : []);

    const localCatalog = getAllBaselines();
    const merged = { ...localCatalog };
    let mergedCount = 0;

    // 1. Process array data if provided
    if (remoteData.length > 0) {
      remoteData.forEach((item) => {
        const rawLine = String(item.line_id || item.lineId || '').trim().toUpperCase();
        const m = matchMachine(rawLine);
        const lineId = m?.id ? m.id.toUpperCase() : rawLine;
        const productCode = String(item.product_code || item.productCode || '').trim().toUpperCase();
        const rate = Math.round(Number(item.baseline_pcs_h || item.baselinePcsH || item.rate || 0));

        if (lineId && productCode && rate > 0) {
          const key = makeCatalogKey(lineId, productCode);
          if (key) {
            merged[key] = {
              lineId,
              productCode,
              baselinePcsH: rate,
              dailyTargetPcs: Math.round(rate * 24),
              approvedDate: item.approved_date ? String(item.approved_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
              notes: item.notes ? String(item.notes).trim() : ''
            };
            mergedCount++;
          }
        }
      });
    }

    // 2. Process dictionary items if provided
    if (remoteCatalog && typeof remoteCatalog === 'object') {
      Object.keys(remoteCatalog).forEach((k) => {
        const item = remoteCatalog[k];
        if (item && Number(item.baselinePcsH || item.baseline_pcs_h) > 0) {
          const rawLine = String(item.lineId || item.line_id || '').trim().toUpperCase();
          const m = matchMachine(rawLine);
          const lineId = m?.id ? m.id.toUpperCase() : rawLine;
          const productCode = String(item.productCode || item.product_code || '').trim().toUpperCase();
          const rate = Math.round(Number(item.baselinePcsH || item.baseline_pcs_h));
          const key = makeCatalogKey(lineId, productCode) || k;
          merged[key] = {
            lineId,
            productCode,
            baselinePcsH: rate,
            dailyTargetPcs: Math.round(rate * 24),
            approvedDate: item.approvedDate ? String(item.approvedDate).slice(0, 10) : (item.approved_date ? String(item.approved_date).slice(0, 10) : new Date().toISOString().slice(0, 10)),
            notes: item.notes ? String(item.notes).trim() : ''
          };
          mergedCount++;
        }
      });
    }

    window.localStorage.setItem(BASELINE_CATALOG_STORAGE_KEY, JSON.stringify(merged));
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(BASELINE_CATALOG_UPDATED_EVENT, {
          detail: { synced: true, count: mergedCount, catalog: merged }
        })
      );
    }

    return {
      success: true,
      count: mergedCount,
      catalog: merged
    };
  } catch (err) {
    return {
      success: false,
      offline: true,
      message: err?.message || 'Network error syncing baselines from server'
    };
  }
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
    const storage = getStorage();
    if (storage) {
      try {
        storage.setItem(BASELINE_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(
            new CustomEvent(BASELINE_CATALOG_UPDATED_EVENT, { detail: { lineId, productCode, deleted: true } })
          );
        }
      } catch (err) {}
    }

    // Asynchronously remove from central MySQL database
    removeBaselineRateFromServer(lineId, productCode).catch(() => {});

    return true;
  }
  return false;
}

/**
 * Clear all machine-mold baselines from localStorage.
 */
export function clearAllBaselines(options = {}) {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(BASELINE_CATALOG_STORAGE_KEY);
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent(BASELINE_CATALOG_UPDATED_EVENT, { detail: { cleared: true } })
        );
      }
    } catch (err) {}
  }

  if (options.syncServer) {
    const fetchFn = typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : (typeof fetch === 'function' ? fetch : null);
    if (fetchFn) {
      fetchFn(`${getBaselineApiUrl()}?clear=all`, { method: 'DELETE' }).catch(() => {});
    }
  }
}

/**
 * Check if a machine-mold combination has an explicit approved baseline.
 */
export function hasBaselineRate(lineId, productCode) {
  const entry = getBaselineEntry(lineId, productCode);
  return Boolean(entry && Number(entry.baselinePcsH) > 0);
}

/**
 * Export machine-mold standards baselines to an Excel workbook (.xlsx).
 * Sheet name: "Machine_Mold_Standards"
 * Columns:
 * 1. Machine Line (machineLine or lineId)
 * 2. Product Code (productCode)
 * 3. Approved Real Rate (Pcs/h) (approvedRealRate)
 * 4. Daily Target (24h) (dailyTarget24h)
 * 5. Printed SOP Target (85%) (printedSopTarget)
 * 6. Updated / Created Timestamp (if available in schema)
 *
 * @param {Array|Object} [entries=null] - Array or map of standard baseline entries. If omitted, loads getAllBaselines().
 * @param {Array} [lineOptions=MACHINES] - Machine definitions list for full machine name resolution.
 * @returns {object} XLSX Workbook
 */
export function exportStandardsToWorkbook(entries = null, lineOptions = MACHINES) {
  let list = [];
  if (Array.isArray(entries)) {
    list = entries;
  } else if (entries && typeof entries === 'object') {
    list = Object.entries(entries).map(([key, val]) => ({ key, ...val }));
  } else {
    const baselines = getAllBaselines();
    list = Object.entries(baselines || {}).map(([key, val]) => ({ key, ...val }));
  }

  // Sort by Line ID then Product Code
  const sorted = [...list].sort((a, b) => {
    const lineA = String(a.lineId || a.machineLine || '').trim().toUpperCase();
    const lineB = String(b.lineId || b.machineLine || '').trim().toUpperCase();
    const lineCmp = lineA.localeCompare(lineB);
    if (lineCmp !== 0) return lineCmp;
    return String(a.productCode || '').localeCompare(String(b.productCode || ''));
  });

  const rows = sorted.map((item) => {
    const rawRate = item.approvedRealRate != null
      ? item.approvedRealRate
      : (item.baselinePcsH != null ? item.baselinePcsH : (item.rate || 0));
    const rate = Math.round(Number(rawRate) || 0);

    const rawDaily = item.dailyTarget24h != null
      ? item.dailyTarget24h
      : (item.dailyTargetPcs != null && Number(item.dailyTargetPcs) > 0 ? item.dailyTargetPcs : (rate > 0 ? rate * 24 : 0));
    const daily = Math.round(Number(rawDaily) || 0);

    const rawPrinted = item.printedSopTarget != null
      ? item.printedSopTarget
      : (rate > 0 ? Math.round(rate / 0.85) : 0);
    const printed = Math.round(Number(rawPrinted) || 0);

    const machineName = item.machineLine || getFullMachineName(item.lineId, lineOptions) || item.lineId || '';
    const timestamp = String(
      item.timestamp ||
      item.updatedAt ||
      item.updated_at ||
      item.approvedDate ||
      item.approved_date ||
      item.createdAt ||
      item.created_at ||
      ''
    ).trim();

    return {
      'Machine Line': machineName,
      'Product Code': String(item.productCode || '').trim(),
      'Approved Real Rate (Pcs/h)': rate,
      'Daily Target (24h)': daily,
      'Printed SOP Target (85%)': printed,
      'Updated / Created Timestamp': timestamp
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0
      ? rows
      : [
          {
            'Machine Line': '',
            'Product Code': '',
            'Approved Real Rate (Pcs/h)': '',
            'Daily Target (24h)': '',
            'Printed SOP Target (85%)': '',
            'Updated / Created Timestamp': ''
          }
        ]
  );

  // Auto-adjusted column widths
  const headers = [
    'Machine Line',
    'Product Code',
    'Approved Real Rate (Pcs/h)',
    'Daily Target (24h)',
    'Printed SOP Target (85%)',
    'Updated / Created Timestamp'
  ];

  ws['!cols'] = headers.map((colKey) => {
    let maxLen = colKey.length;
    for (const r of rows) {
      const valStr = String(r[colKey] != null ? r[colKey] : '');
      if (valStr.length > maxLen) {
        maxLen = valStr.length;
      }
    }
    return { wch: Math.max(maxLen + 4, 16) };
  });

  XLSX.utils.book_append_sheet(wb, ws, 'Machine_Mold_Standards');
  return wb;
}

/**
 * Trigger client-side Excel download of Machine-Mold Standards Catalog (.xlsx).
 * Default filename: Machine_Mold_Standards_Catalog_YYYY-MM-DD.xlsx
 *
 * @param {Array|Object} [entries=null]
 * @param {Array} [lineOptions=MACHINES]
 * @param {string} [customFilename=null]
 * @returns {{ wb: object, filename: string }}
 */
export function exportStandardsToExcel(entries = null, lineOptions = MACHINES, customFilename = null) {
  const wb = exportStandardsToWorkbook(entries, lineOptions);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = customFilename || `Machine_Mold_Standards_Catalog_${dateStr}.xlsx`;

  if (typeof XLSX.writeFile === 'function') {
    XLSX.writeFile(wb, filename);
  }
  return { wb, filename };
}
