/**
 * Central Product Catalog Registry & Dynamic Ingestion Helper
 * Manages dynamic product definitions, Excel "Unique Planning Catalog" ingestion,
 * on-the-fly product creation, local cache, and central MySQL backend persistence.
 */

import * as XLSX from 'xlsx';
import { SOP_FACTORY_PRESETS, resolveStdWeightFromSpecs } from './legacySopHelper.js';
import { parseDiameterToMm } from '../utils/masterProfiles.js';
import { matchMachine } from '../config/machines.js';
import {
  hasBaselineRate,
  getBaselineEntry,
  saveBaselineRate,
  makeCatalogKey
} from './standardCatalogHelper.js';

export const PRODUCT_CATALOG_STORAGE_KEY = 'pvc_product_catalog_registry';
export const PRODUCT_CATALOG_UPDATED_EVENT = 'pvc_product_catalog_updated';
export const PROVENANCE_AUDIT_STORAGE_KEY = 'pvc_provenance_latest_audit';

// In-memory fallback for non-browser / test environments
let inMemoryProductRegistry = null;

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
 * Resolve API endpoint URL for central MySQL product catalog persistence
 */
export function getProductsApiUrl() {
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin || '';
    const pathname = window.location.pathname || '';
    const basePath = pathname.substring(0, pathname.lastIndexOf('/') + 1);
    if (origin && !origin.includes('localhost:5173') && !origin.includes('127.0.0.1:5173')) {
      return `${origin}${basePath}api/products_catalog.php`;
    }
  }
  return 'api/products_catalog.php';
}

/**
 * Normalize and sanitize item code key
 * @param {string|number} code
 * @returns {string}
 */
export function normalizeProductCode(code) {
  if (code === undefined || code === null) return '';
  return String(code).trim().toUpperCase();
}

/**
 * Bootstrap default initial product seed catalog from legacy factory presets
 */
function getInitialSeedCatalog() {
  const catalog = {};
  if (Array.isArray(SOP_FACTORY_PRESETS)) {
    SOP_FACTORY_PRESETS.forEach((preset) => {
      const code = normalizeProductCode(preset.itemCode);
      if (!code) return;
      const uWeight = Number(preset.unitWeight || preset.stdWeight) || 0;
      const length = preset.pipeLength !== undefined ? Number(preset.pipeLength) : (preset.isCompounding ? 0 : 6.0);
      const targetPcsH = preset.targetPcsH !== undefined && preset.targetPcsH !== null
        ? Number(preset.targetPcsH)
        : (uWeight > 0 && !preset.isCompounding ? Math.round(200 / uWeight) : null);
      const nowIso = new Date().toISOString();
      catalog[code] = {
        itemCode: String(preset.itemCode).trim(),
        description: preset.description || '',
        odMm: preset.odMm || '',
        wallThickness: preset.wallThickness || '',
        material: preset.isCompounding ? 'PVC Compound' : (preset.material || 'uPVC'),
        unitWeight: uWeight,
        stdWeight: uWeight,
        pipeLength: length,
        nominalSpeed: preset.nominalSpeed || null,
        targetPcsH,
        primaryExtruder: preset.primaryExtruder || (preset.isCompounding ? 'L-08' : ''),
        compatibleMachines: preset.compatibleMachines || '',
        historicalRateKgH: preset.historicalRateKgH || null,
        isCompounding: Boolean(preset.isCompounding),
        isPending: false,
        source: 'factory_preset',
        source_origin: 'preset_seed',
        source_file: 'System Defaults',
        source_sheet: 'Factory Presets',
        last_updated_at: nowIso,
        updatedAt: nowIso
      };
    });
  }

  // Explicitly ensure item 188 is guaranteed in seed catalog
  if (!catalog['188']) {
    const seedIso = new Date().toISOString();
    catalog['188'] = {
      itemCode: '188',
      description: 'MANARCO UPVC PIPE 3" SDR26 ASTM',
      odMm: '88.9',
      wallThickness: 'SDR26',
      material: 'uPVC',
      unitWeight: 7.85,
      stdWeight: 7.85,
      pipeLength: 6.0,
      nominalSpeed: 2.5,
      targetPcsH: 25,
      primaryExtruder: 'L-05',
      compatibleMachines: 'L-05, L-08',
      historicalRateKgH: 200,
      isCompounding: false,
      isPending: false,
      source: 'factory_preset',
      source_origin: 'preset_seed',
      source_file: 'System Defaults',
      source_sheet: 'Factory Presets',
      last_updated_at: seedIso,
      updatedAt: seedIso
    };
  }

  return catalog;
}

/**
 * Retrieve the full central persistent product catalog dictionary
 * Keyed by normalized itemCode (e.g. "188", "249", "COMP-01")
 * @returns {Record<string, Object>}
 */
export function getProductCatalogRegistry() {
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(PRODUCT_CATALOG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          // Fallback backfill: Ensure newly added seed presets (such as 188) are present
          let mergedAny = false;
          const seed = getInitialSeedCatalog();
          for (const [code, val] of Object.entries(seed)) {
            if (!parsed[code]) {
              parsed[code] = val;
              mergedAny = true;
            }
          }
          if (mergedAny) {
            try {
              storage.setItem(PRODUCT_CATALOG_STORAGE_KEY, JSON.stringify(parsed));
              const snapshot = generateProvenanceAuditSnapshot(Object.values(parsed));
              storage.setItem(PROVENANCE_AUDIT_STORAGE_KEY, JSON.stringify(snapshot, null, 2));
            } catch (_) {}
          }
          inMemoryProductRegistry = parsed;
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Failed to parse persistent product catalog registry:', err);
    }
  }

  if (inMemoryProductRegistry && Object.keys(inMemoryProductRegistry).length > 0) {
    return inMemoryProductRegistry;
  }

  // First run: bootstrap from factory seed presets
  const seed = getInitialSeedCatalog();
  inMemoryProductRegistry = seed;
  if (storage) {
    try {
      storage.setItem(PRODUCT_CATALOG_STORAGE_KEY, JSON.stringify(seed));
      const snapshot = generateProvenanceAuditSnapshot(Object.values(seed));
      storage.setItem(PROVENANCE_AUDIT_STORAGE_KEY, JSON.stringify(snapshot, null, 2));
    } catch (_) {}
  }
  return seed;
}

/**
 * Retrieve all registered products as an array sorted by itemCode then description
 * @returns {Array<Object>}
 */
export function getAllProducts() {
  const registry = getProductCatalogRegistry();
  const list = Object.values(registry);
  return list.sort((a, b) => {
    const codeA = String(a.itemCode || '');
    const codeB = String(b.itemCode || '');
    if (codeA && codeB) {
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    }
    return String(a.description || '').localeCompare(String(b.description || ''));
  });
}

/**
 * Lookup a product by its item code (case-insensitive, with leading zero tolerance)
 * @param {string|number} itemCode
 * @returns {Object|null}
 */
export function getProductByCode(itemCode) {
  if (!itemCode) return null;
  const registry = getProductCatalogRegistry();
  const clean = normalizeProductCode(itemCode);
  if (registry[clean]) {
    return registry[clean];
  }

  // Fallback 1: check with leading zeros stripped (e.g. '0188' -> '188')
  const stripped = clean.replace(/^0+/, '');
  if (stripped && registry[stripped]) {
    return registry[stripped];
  }

  // Fallback 2: case-insensitive scan across values
  const match = Object.values(registry).find(
    (p) => normalizeProductCode(p.itemCode) === clean || normalizeProductCode(p.itemCode) === stripped
  );
  return match || null;
}

/**
 * Dispatch catalog updated event to notify React components across windows
 */
function dispatchCatalogUpdatedEvent(detail = {}) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent(PRODUCT_CATALOG_UPDATED_EVENT, { detail })
      );
    } catch (_) {}
  }
}

/**
 * Save product catalog dictionary to storage and cache
 */
function persistProductRegistry(registry, detail = {}) {
  inMemoryProductRegistry = registry;
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(PRODUCT_CATALOG_STORAGE_KEY, JSON.stringify(registry));
      // Dual Sync Persistence: compile and persist latest full diagnostic snapshot
      const snapshot = generateProvenanceAuditSnapshot(Object.values(registry));
      storage.setItem(PROVENANCE_AUDIT_STORAGE_KEY, JSON.stringify(snapshot, null, 2));
    } catch (err) {
      console.warn('Failed to save product catalog to storage:', err);
    }
  }
  dispatchCatalogUpdatedEvent(detail);
}

/**
 * Save / Upsert a single product definition on-the-fly
 * @param {Object} productData
 * @param {Object} [options]
 * @returns {Object} Saved product object
 */
export function saveProduct(productData, options = { syncServer: true }) {
  if (!productData) throw new Error('Product data is required');
  const rawCode = String(productData.itemCode || productData.productCode || productData.code || '').trim();
  if (!rawCode) throw new Error('Item code is required');

  const normalizedCode = normalizeProductCode(rawCode);
  const desc = String(productData.description || productData.productDescription || productData.spec || '').trim();

  let uWeight = Number(productData.unitWeight || productData.stdWeight);
  if (isNaN(uWeight) || uWeight <= 0) {
    uWeight = resolveStdWeightFromSpecs({ itemCode: rawCode, description: desc }, 6.0) || 0;
  }

  const pipeLength = productData.pipeLength !== undefined && productData.pipeLength !== null && productData.pipeLength !== ''
    ? Number(productData.pipeLength)
    : 6.0;

  let targetPcsH = productData.targetPcsH !== undefined && productData.targetPcsH !== null && productData.targetPcsH !== ''
    ? Math.round(Number(productData.targetPcsH))
    : null;

  let nominalSpeed = productData.nominalSpeed !== undefined && productData.nominalSpeed !== null && productData.nominalSpeed !== ''
    ? Number(productData.nominalSpeed)
    : null;

  // Intercompute nominalSpeed and targetPcsH if only one was provided
  if ((targetPcsH === null || targetPcsH <= 0) && nominalSpeed > 0 && pipeLength > 0) {
    targetPcsH = Math.round((nominalSpeed * 60) / pipeLength);
  } else if ((nominalSpeed === null || nominalSpeed <= 0) && targetPcsH > 0 && pipeLength > 0) {
    nominalSpeed = Math.round(((targetPcsH * pipeLength) / 60) * 10) / 10;
  }

  const existing = getProductByCode(rawCode);

  const nowIso = new Date().toISOString();
  const sourceOrigin = productData.source_origin ||
    (Boolean(productData.isPending) ? 'daily_log' : (existing?.source_origin || 'manual_override'));

  const product = {
    ...(existing || {}),
    itemCode: rawCode,
    description: desc || existing?.description || `Product Code ${rawCode}`,
    odMm: productData.odMm || existing?.odMm || '',
    wallThickness: productData.wallThickness || existing?.wallThickness || '',
    material: productData.material || existing?.material || 'uPVC',
    unitWeight: uWeight > 0 ? uWeight : (existing?.unitWeight || 0),
    stdWeight: uWeight > 0 ? uWeight : (existing?.stdWeight || 0),
    pipeLength: pipeLength > 0 ? pipeLength : 6.0,
    nominalSpeed: nominalSpeed || existing?.nominalSpeed || null,
    targetPcsH: targetPcsH || existing?.targetPcsH || null,
    primaryExtruder: productData.primaryExtruder || existing?.primaryExtruder || '',
    compatibleMachines: productData.compatibleMachines || existing?.compatibleMachines || '',
    historicalRateKgH: productData.historicalRateKgH || existing?.historicalRateKgH || null,
    isCompounding: Boolean(productData.isCompounding ?? existing?.isCompounding),
    isPending: Boolean(productData.isPending ?? false),
    source: productData.source || existing?.source || (sourceOrigin === 'manual_override' ? 'manual' : 'auto_discovery'),
    source_origin: sourceOrigin,
    source_file: productData.source_file || existing?.source_file || (sourceOrigin === 'manual_override' ? 'manual_input' : 'Daily Production Log'),
    source_sheet: productData.source_sheet || existing?.source_sheet || (sourceOrigin === 'manual_override' ? 'Floor Override' : 'Production Log'),
    last_updated_at: productData.last_updated_at || nowIso,
    updatedAt: nowIso
  };

  const registry = { ...getProductCatalogRegistry(), [normalizedCode]: product };
  persistProductRegistry(registry, { action: 'save', itemCode: rawCode, product });

  if (options.syncServer) {
    saveProductToServer(product).catch(() => {});
  }

  return product;
}

/**
 * Resolve canonical machine line ID (e.g. "L-06") from label or string
 * @param {string} rawLine
 * @returns {string|null}
 */
export function resolveCanonicalLineId(rawLine) {
  if (!rawLine || rawLine === '-' || /unknown/i.test(rawLine)) return null;
  const clean = String(rawLine).trim();
  const matched = matchMachine(clean);
  if (matched?.id) return matched.id.toUpperCase();
  const m = clean.toUpperCase().match(/L[-_ ]?0?(\d+)/i);
  if (m) {
    const num = parseInt(m[1], 10);
    return `L-${String(num).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Compare technical specifications between existing catalog record and incoming Excel master
 * Returns true if any engineering spec (OD, wall thickness, material, unit weight, description) differs.
 */
export function areTechnicalSpecsDifferent(existing, incoming) {
  if (!existing || !incoming) return false;

  // 1. Pipe OD
  const existingOd = String(existing.odMm || '').trim();
  const incomingOd = String(incoming.odMm || '').trim();
  if (incomingOd && existingOd !== incomingOd) return true;

  // 2. Wall Thickness / SDR
  const existingWt = String(existing.wallThickness || '').trim();
  const incomingWt = String(incoming.wallThickness || '').trim();
  if (incomingWt && existingWt !== incomingWt) return true;

  // 3. Material
  const existingMat = String(existing.material || '').trim().toLowerCase();
  const incomingMat = String(incoming.material || '').trim().toLowerCase();
  if (incomingMat && existingMat !== incomingMat) return true;

  // 4. Unit Weight / Std Weight
  const existingWeight = Number(existing.unitWeight || existing.stdWeight || 0);
  const incomingWeight = Number(incoming.unitWeight || incoming.stdWeight || 0);
  if (incomingWeight > 0 && existingWeight > 0 && Math.abs(existingWeight - incomingWeight) > 0.001) {
    return true;
  }
  if (incomingWeight > 0 && (!existingWeight || existingWeight <= 0)) {
    return true;
  }

  // 5. Description
  const existingDesc = String(existing.description || '').trim();
  const incomingDesc = String(incoming.description || '').trim();
  if (incomingDesc && existingDesc !== incomingDesc) return true;

  return false;
}

/**
 * Upsert a batch of product records into the registry
 * Enforces strict Conflict Resolution:
 * - Technical Specs (Pipe OD, SDR, Wall Thickness, Unit Weight, Material): EXCEL MASTER WINS.
 * - Machine Operational Baselines: MANUAL OVERRIDE WINS (shop-floor calibrations protected 100%).
 * - Uncalibrated Lines: Initialized from Excel nominal values.
 * @param {Array<Object>} items
 * @param {Object} [options]
 * @returns {Object} { count, newProductsCount, refreshedSpecsCount, protectedBaselinesCount, auditMessage }
 */
export function upsertBatchProducts(items = [], options = { syncServer: true, source: 'excel' }) {
  if (!Array.isArray(items) || items.length === 0) {
    const emptyResult = {
      count: 0,
      newProductsCount: 0,
      refreshedSpecsCount: 0,
      protectedBaselinesCount: 0,
      auditMessage: null,
      valueOf() { return 0; }
    };
    return emptyResult;
  }

  const registry = { ...getProductCatalogRegistry() };
  let changeCount = 0;
  let newProductsCount = 0;
  let refreshedSpecsCount = 0;
  let protectedBaselinesCount = 0;
  const updatedItems = [];
  const checkedBaselineKeys = new Set();

  for (const item of items) {
    if (!item) continue;
    const rawCode = String(item.itemCode || item.productCode || item.code || '').trim();
    if (!rawCode) continue;

    const normCode = normalizeProductCode(rawCode);
    const existing = registry[normCode];

    const desc = String(item.description || item.productDescription || item.spec || existing?.description || '').trim();
    let uWeight = Number(item.unitWeight || item.stdWeight || existing?.unitWeight);
    if (isNaN(uWeight) || uWeight <= 0) {
      uWeight = resolveStdWeightFromSpecs({ itemCode: rawCode, description: desc }, 6.0) || 0;
    }

    const pipeLength = Number(item.pipeLength || existing?.pipeLength) > 0
      ? Number(item.pipeLength || existing?.pipeLength)
      : 6.0;

    let targetPcsH = item.targetPcsH != null ? Math.round(Number(item.targetPcsH)) : (existing?.targetPcsH || null);
    let nominalSpeed = item.nominalSpeed != null ? Number(item.nominalSpeed) : (existing?.nominalSpeed || null);

    // Identify candidate machine lines
    const candidateLines = [];
    const primaryCanonical = resolveCanonicalLineId(item.primaryExtruder || existing?.primaryExtruder);
    if (primaryCanonical) {
      candidateLines.push({ lineId: primaryCanonical, rate: targetPcsH });
    }

    if (Array.isArray(item.alternativeLines)) {
      item.alternativeLines.forEach((alt) => {
        const canonical = resolveCanonicalLineId(alt.lineId);
        if (canonical && !candidateLines.some((c) => c.lineId === canonical)) {
          candidateLines.push({ lineId: canonical, rate: alt.rate || targetPcsH });
        }
      });
    }

    // 1. Machine Operational Baselines: Conflict Resolution
    // MANUAL OVERRIDE WINS: If an approved baseline exists, PRESERVE IT 100%.
    // Fallback for Uncalibrated Lines: If no baseline exists, initialize from Excel nominal values.
    if (options.source === 'excel' || options.source === 'excel_catalog' || options.protectBaselines) {
      for (const cand of candidateLines) {
        const baselineKey = makeCatalogKey(cand.lineId, rawCode);
        if (!baselineKey || checkedBaselineKeys.has(baselineKey)) continue;
        checkedBaselineKeys.add(baselineKey);

        if (hasBaselineRate(cand.lineId, rawCode)) {
          // Manual baseline override preserved 100%
          protectedBaselinesCount++;
        } else if (cand.rate && cand.rate > 0) {
          // Uncalibrated line fallback: initialize from Excel
          saveBaselineRate(cand.lineId, rawCode, cand.rate, 'Initialized from Excel Unique Planning Catalog');
        }
      }
    }

    // If primary line has an approved manual baseline, preserve it on the product record too
    if (primaryCanonical && hasBaselineRate(primaryCanonical, rawCode)) {
      const entry = getBaselineEntry(primaryCanonical, rawCode);
      if (entry && entry.baselinePcsH > 0) {
        targetPcsH = entry.baselinePcsH;
      }
    }

    if ((targetPcsH === null || targetPcsH <= 0) && nominalSpeed > 0 && pipeLength > 0) {
      targetPcsH = Math.round((nominalSpeed * 60) / pipeLength);
    } else if (targetPcsH > 0 && pipeLength > 0) {
      nominalSpeed = Math.round(((targetPcsH * pipeLength) / 60) * 10) / 10;
    }

    // 2. Technical Specs Conflict Resolution: EXCEL MASTER WINS
    if (!existing) {
      newProductsCount++;
    } else {
      const specsDiffer = areTechnicalSpecsDifferent(existing, {
        odMm: item.odMm,
        wallThickness: item.wallThickness,
        material: item.material,
        unitWeight: uWeight,
        description: desc
      });
      if (specsDiffer) {
        refreshedSpecsCount++;
      }
    }

    const merged = {
      ...(existing || {}),
      itemCode: rawCode,
      description: desc || `Product Code ${rawCode}`,
      odMm: item.odMm || existing?.odMm || '',
      wallThickness: item.wallThickness || existing?.wallThickness || '',
      material: item.material || existing?.material || 'uPVC',
      unitWeight: uWeight > 0 ? uWeight : 0,
      stdWeight: uWeight > 0 ? uWeight : 0,
      pipeLength,
      nominalSpeed,
      targetPcsH,
      primaryExtruder: item.primaryExtruder || existing?.primaryExtruder || '',
      compatibleMachines: item.compatibleMachines || existing?.compatibleMachines || '',
      historicalRateKgH: item.historicalRateKgH != null ? Number(item.historicalRateKgH) : (existing?.historicalRateKgH || null),
      isCompounding: Boolean(item.isCompounding ?? existing?.isCompounding),
      // If previously verified (isPending === false), keep verified status
      isPending: existing ? Boolean(existing.isPending && (item.isPending ?? true)) : Boolean(item.isPending ?? false),
      source: existing?.source === 'manual' ? 'manual' : (item.source || options.source || 'excel'),
      source_origin: item.source_origin || options.source_origin || (existing?.source_origin || 'planning_catalog'),
      source_file: item.source_file || options.source_file || existing?.source_file || 'Excel Workbook',
      source_sheet: item.source_sheet || options.source_sheet || existing?.source_sheet || 'Unique Planning Catalog',
      last_updated_at: item.last_updated_at || options.last_updated_at || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    registry[normCode] = merged;
    updatedItems.push(merged);
    changeCount++;
  }

  if (changeCount > 0) {
    persistProductRegistry(registry, { action: 'batch_upsert', count: changeCount });
    if (options.syncServer && updatedItems.length > 0) {
      saveBatchProductsToServer(updatedItems).catch(() => {});
    }
  }

  const auditMessage = (newProductsCount > 0 || refreshedSpecsCount > 0 || protectedBaselinesCount > 0)
    ? `Catalog Sync Complete: ${newProductsCount} new products added, ${refreshedSpecsCount} engineering specs refreshed, ${protectedBaselinesCount} shop-floor baselines protected.`
    : null;

  const result = {
    count: changeCount,
    newProductsCount,
    refreshedSpecsCount,
    protectedBaselinesCount,
    auditMessage,
    valueOf() { return changeCount; }
  };

  return result;
}

/**
 * Resilient fallback: Automatically register an unrecognized product code appearing in logs
 * as a "Pending / Unverified" catalog entry.
 * @param {string|number} itemCode
 * @param {string} [description]
 * @param {Object} [specs]
 * @returns {Object|null}
 */
export function autoRegisterPendingProduct(itemCode, description = '', specs = {}) {
  const clean = normalizeProductCode(itemCode);
  if (!clean) return null;

  const existing = getProductByCode(itemCode);
  if (existing) {
    // If existing has no description, augment it
    if (!existing.description && description) {
      return saveProduct({
        ...existing,
        description: description.trim()
      }, { syncServer: true });
    }
    return existing;
  }

  const desc = String(description || '').trim() || `Product Code ${itemCode}`;
  const resolvedWeight = Number(specs.unitWeight || specs.stdWeight) || resolveStdWeightFromSpecs({ itemCode, description: desc }, 6.0) || 0;
  const nowIso = new Date().toISOString();

  return saveProduct({
    itemCode: String(itemCode).trim(),
    description: desc,
    unitWeight: resolvedWeight,
    stdWeight: resolvedWeight,
    pipeLength: Number(specs.pipeLength) > 0 ? Number(specs.pipeLength) : 6.0,
    isPending: true,
    source: 'auto_discovery',
    source_origin: specs.source_origin || 'daily_log',
    source_file: specs.source_file || 'Daily Production Log',
    source_sheet: specs.source_sheet || 'Production Log',
    last_updated_at: specs.last_updated_at || nowIso,
    ...specs
  }, { syncServer: true });
}

/**
 * Parse and ingest the dedicated "Unique Planning Catalog" worksheet from an Excel workbook
 * @param {Object} wb SheetJS workbook instance
 * @param {Object} [options] Ingestion options (e.g. { fileName: '...' })
 * @returns {Object} { success: boolean, count: number, sheetFound: boolean }
 */
export function parseUniquePlanningCatalogSheet(wb, options = {}) {
  if (!wb || !wb.SheetNames || !Array.isArray(wb.SheetNames)) {
    return {
      success: false,
      count: 0,
      sheetFound: false,
      newProductsCount: 0,
      refreshedSpecsCount: 0,
      protectedBaselinesCount: 0,
      auditMessage: null
    };
  }

  const sheetName = wb.SheetNames.find((name) =>
    /unique.*planning.*catalog/i.test(name) ||
    /unique.*catalog/i.test(name) ||
    /planning.*catalog/i.test(name) ||
    /product.*catalog/i.test(name)
  );

  if (!sheetName) {
    return {
      success: false,
      count: 0,
      sheetFound: false,
      newProductsCount: 0,
      refreshedSpecsCount: 0,
      protectedBaselinesCount: 0,
      auditMessage: null
    };
  }

  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return {
      success: false,
      count: 0,
      sheetFound: false,
      newProductsCount: 0,
      refreshedSpecsCount: 0,
      protectedBaselinesCount: 0,
      auditMessage: null
    };
  }

  // Import XLSX dynamically or use global/passed tools
  const rawRows = Array.isArray(sheet) ? sheet : [];
  let tableRows = [];

  if (sheet['!ref']) {
    // Convert sheet to JSON array
    try {
      const XLSX = (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : null;
      if (XLSX && XLSX.utils) {
        tableRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        // Fallback row-by-row reader if XLSX global not on window
        tableRows = parseSheetCellsDirectly(sheet);
      }
    } catch (_) {
      tableRows = parseSheetCellsDirectly(sheet);
    }
  }

  if (tableRows.length === 0) {
    return {
      success: true,
      count: 0,
      sheetFound: true,
      newProductsCount: 0,
      refreshedSpecsCount: 0,
      protectedBaselinesCount: 0,
      auditMessage: null
    };
  }

  const fileName = options.fileName || wb._fileName || wb.fileName || 'Unique_Planning_Catalog.xlsx';
  const ingestedItems = [];

  for (const row of tableRows) {
    if (!row || typeof row !== 'object') continue;

    // Detect columns flexibly by headers or positional fallback
    const rawCode = String(
      row['Item Code'] ??
      row['itemCode'] ??
      row['Code'] ??
      row['Product Code'] ??
      row['A'] ??
      row[0] ??
      ''
    ).trim();

    if (!rawCode || /item\s*code/i.test(rawCode) || /total/i.test(rawCode)) {
      continue;
    }

    const desc = String(
      row['Product Description & Specs'] ??
      row['Pipe Description & Standard Spec'] ??
      row['Description'] ??
      row['description'] ??
      row['B'] ??
      row[1] ??
      ''
    ).trim();

    const rawOd = String(
      row['Pipe OD (mm) & Nominal Size'] ??
      row['OD (mm)'] ??
      row['Diameter'] ??
      row['C'] ??
      row[2] ??
      ''
    ).trim();

    const rawWt = String(
      row['Wall Thickness / SDR'] ??
      row['Thickness'] ??
      row['Wall Thickness'] ??
      row['D'] ??
      row[3] ??
      ''
    ).trim();

    const rawMat = String(
      row['Material'] ??
      row['material'] ??
      row['E'] ??
      row[4] ??
      'uPVC'
    ).trim();

    const rawHistRate = String(
      row['Evaluated Historical Output Rate (Average/Typical kg/hr)'] ??
      row['Average Extrusion Rate'] ??
      row['Historical kg/h'] ??
      row['F'] ??
      row[5] ??
      ''
    ).trim();

    const rawPrimaryMach = String(
      row['Primary Extruder Recommendation'] ??
      row['Primary / Assigned Extruder'] ??
      row['Primary Extruder'] ??
      row['G'] ??
      row[6] ??
      ''
    ).trim();

    const rawTargetRateBand = String(
      row['Primary Target Rate Band (kg/hr)'] ??
      row['Target Extrusion Rate Band'] ??
      row['H'] ??
      row[7] ??
      ''
    ).trim();

    const rawAltMach1 = String(
      row['Alternative Extruder 1'] ??
      row['Planning Alternative 1'] ??
      row['I'] ??
      row[8] ??
      ''
    ).trim();

    const rawAltRate1 = String(
      row['Alternative Rate Band 1 (kg/hr)'] ??
      row['Alternative Rate Band 1'] ??
      row['Planning Alternative 1 Rate Band'] ??
      row['J'] ??
      row[9] ??
      ''
    ).trim();

    const rawAltMach2 = String(
      row['Alternative Extruder 2'] ??
      row['Planning Alternative 2'] ??
      row['K'] ??
      row[10] ??
      ''
    ).trim();

    const rawAltRate2 = String(
      row['Alternative Rate Band 2 (kg/hr)'] ??
      row['Alternative Rate Band 2'] ??
      row['Planning Alternative 2 Rate Band'] ??
      row['L'] ??
      row[11] ??
      ''
    ).trim();

    const histRateMatch = rawHistRate.match(/\d+(?:\.\d+)?/);
    const histRateKgH = histRateMatch ? Number(histRateMatch[0]) : null;

    const compatList = [rawPrimaryMach, rawAltMach1, rawAltMach2]
      .filter((m) => m && m !== '-' && !/unknown/i.test(m));
    const compatibleMachines = Array.from(new Set(compatList)).join(', ');

    const odMmNum = parseDiameterToMm(rawOd) || (rawOd.match(/\d+(?:\.\d+)?/) ? Number(rawOd.match(/\d+(?:\.\d+)?/)[0]) : null);

    let resolvedWeight = Number(
      row['Unit Weight (kg)'] ??
      row['Unit Weight'] ??
      row['Std Weight'] ??
      row['Weight (kg)'] ??
      row['Unit Wt'] ??
      0
    );
    if (isNaN(resolvedWeight) || resolvedWeight <= 0) {
      resolvedWeight = resolveStdWeightFromSpecs({ itemCode: rawCode, description: desc }, 6.0) || 0;
    }
    if (resolvedWeight <= 0 && odMmNum > 0) {
      const sdrMatch = rawWt.match(/SDR\s*[-:]?\s*(\d+(?:\.\d+)?)/i);
      let wtNum = 0;
      if (sdrMatch) {
        const sdrVal = Number(sdrMatch[1]);
        if (sdrVal > 0) {
          wtNum = Math.round((odMmNum / sdrVal) * 100) / 100;
        }
      } else {
        const wtMatch = rawWt.match(/\d+(?:\.\d+)?/);
        wtNum = wtMatch ? Number(wtMatch[0]) : 0;
      }
      if (wtNum > 0 && wtNum < odMmNum) {
        resolvedWeight = Math.round(Math.PI * (odMmNum - wtNum) * wtNum * 6.0 * 0.00142 * 100) / 100;
      }
    }

    const rawDirectPcsH = Number(
      row['Target Pace (pcs/hr)'] ??
      row['Target Rate (Pcs/h)'] ??
      row['Target (Pcs/h)'] ??
      row['Target Pcs/h'] ??
      0
    );

    let targetKgH = null;
    const targetMatch = rawTargetRateBand.match(/\d+(?:\.\d+)?/g);
    if (targetMatch && targetMatch.length > 0) {
      const nums = targetMatch.map(Number);
      targetKgH = nums.reduce((a, b) => a + b, 0) / nums.length;
    } else if (histRateKgH && histRateKgH > 0) {
      targetKgH = histRateKgH;
    }

    const targetPcsH = (rawDirectPcsH > 0)
      ? Math.round(rawDirectPcsH)
      : ((targetKgH && resolvedWeight > 0) ? Math.round(targetKgH / resolvedWeight) : ((histRateKgH && resolvedWeight > 0) ? Math.round(histRateKgH / resolvedWeight) : null));

    const altLines = [];
    const alt1Line = resolveCanonicalLineId(rawAltMach1);
    if (alt1Line) {
      const alt1Match = rawAltRate1.match(/\d+(?:\.\d+)?/g);
      let alt1RateKgH = null;
      if (alt1Match && alt1Match.length > 0) {
        const nums = alt1Match.map(Number);
        alt1RateKgH = nums.reduce((a, b) => a + b, 0) / nums.length;
      }
      const alt1PcsH = (alt1RateKgH && resolvedWeight > 0)
        ? Math.round(alt1RateKgH / resolvedWeight)
        : (targetPcsH || null);
      altLines.push({ lineId: alt1Line, rate: alt1PcsH });
    }

    const alt2Line = resolveCanonicalLineId(rawAltMach2);
    if (alt2Line) {
      const alt2Match = rawAltRate2.match(/\d+(?:\.\d+)?/g);
      let alt2RateKgH = null;
      if (alt2Match && alt2Match.length > 0) {
        const nums = alt2Match.map(Number);
        alt2RateKgH = nums.reduce((a, b) => a + b, 0) / nums.length;
      }
      const alt2PcsH = (alt2RateKgH && resolvedWeight > 0)
        ? Math.round(alt2RateKgH / resolvedWeight)
        : (targetPcsH || null);
      altLines.push({ lineId: alt2Line, rate: alt2PcsH });
    }

    const nowIso = new Date().toISOString();
    ingestedItems.push({
      itemCode: rawCode,
      description: desc || `uPVC Pipe ${rawOd} ${rawWt}`.trim(),
      odMm: odMmNum ? String(odMmNum) : rawOd,
      wallThickness: rawWt,
      material: rawMat || 'uPVC',
      unitWeight: resolvedWeight,
      stdWeight: resolvedWeight,
      pipeLength: 6.0,
      historicalRateKgH: histRateKgH,
      primaryExtruder: rawPrimaryMach && rawPrimaryMach !== '-' ? rawPrimaryMach : '',
      compatibleMachines,
      targetPcsH: (histRateKgH && resolvedWeight > 0) ? Math.round(histRateKgH / resolvedWeight) : null,
      alternativeLines: altLines,
      isPending: false,
      source: 'excel_catalog',
      source_origin: 'planning_catalog',
      source_file: fileName,
      source_sheet: sheetName,
      last_updated_at: nowIso
    });
  }

  const batchResult = upsertBatchProducts(ingestedItems, {
    syncServer: true,
    source: 'excel_catalog',
    source_origin: 'planning_catalog',
    source_file: fileName,
    source_sheet: sheetName,
    protectBaselines: true,
    ...options
  });

  return {
    success: true,
    sheetFound: true,
    count: batchResult.count,
    newProductsCount: batchResult.newProductsCount,
    refreshedSpecsCount: batchResult.refreshedSpecsCount,
    protectedBaselinesCount: batchResult.protectedBaselinesCount,
    auditMessage: batchResult.auditMessage,
    items: ingestedItems
  };
}

/**
 * Direct cell extractor if XLSX utility json_to_sheet is unavailable
 */
function parseSheetCellsDirectly(sheet) {
  const rows = [];
  const range = sheet['!ref'];
  if (!range) return rows;

  const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
  if (!match) return rows;

  const startCol = colToNum(match[1]);
  const startRow = parseInt(match[2], 10);
  const endCol = colToNum(match[3]);
  const endRow = parseInt(match[4], 10);

  // Extract header row
  const headers = [];
  for (let c = startCol; c <= endCol; c++) {
    const cellKey = numToCol(c) + startRow;
    const cell = sheet[cellKey];
    headers.push(cell ? String(cell.v || cell.w || '').trim() : `Col_${c}`);
  }

  // Extract data rows
  for (let r = startRow + 1; r <= endRow; r++) {
    const rowObj = {};
    let hasData = false;
    for (let c = startCol; c <= endCol; c++) {
      const cellKey = numToCol(c) + r;
      const cell = sheet[cellKey];
      const val = cell ? (cell.v !== undefined ? cell.v : cell.w) : '';
      const headerName = headers[c - startCol];
      rowObj[headerName] = val;
      if (val !== '' && val !== undefined && val !== null) {
        hasData = true;
      }
    }
    if (hasData) {
      rows.push(rowObj);
    }
  }

  return rows;
}

function colToNum(col) {
  let num = 0;
  for (let i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64);
  }
  return num;
}

function numToCol(num) {
  let col = '';
  while (num > 0) {
    const rem = (num - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    num = Math.floor((num - 1) / 26);
  }
  return col;
}

/**
 * Save single product to central MySQL database
 */
export async function saveProductToServer(product) {
  const fetchFn = typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : (typeof fetch === 'function' ? fetch : null);

  if (!fetchFn) return { success: false, offline: true };

  try {
    const res = await fetchFn(getProductsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    if (!res.ok) {
      return { success: false, status: res.status };
    }
    const data = await res.json().catch(() => null);
    return data || { success: true };
  } catch (err) {
    return { success: false, offline: true, error: err?.message };
  }
}

/**
 * Save batch products to central MySQL database
 */
export async function saveBatchProductsToServer(items = []) {
  if (!Array.isArray(items) || items.length === 0) return { success: true, count: 0 };

  const fetchFn = typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : (typeof fetch === 'function' ? fetch : null);

  if (!fetchFn) return { success: false, offline: true };

  try {
    const res = await fetchFn(getProductsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) {
      return { success: false, status: res.status };
    }
    const data = await res.json().catch(() => null);
    return data || { success: true };
  } catch (err) {
    return { success: false, offline: true, error: err?.message };
  }
}

/**
 * Sync products with central MySQL database (bidirectional merge)
 */
export async function syncProductsWithServer() {
  const fetchFn = typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : (typeof fetch === 'function' ? fetch : null);

  if (!fetchFn) return { success: false, offline: true };

  try {
    const res = await fetchFn(getProductsApiUrl(), { method: 'GET' });
    if (!res.ok) {
      return { success: false, status: res.status };
    }

    const data = await res.json().catch(() => null);
    if (!data || !data.success) {
      return { success: false, message: data?.message || 'Failed to fetch catalog' };
    }

    const remoteItems = Array.isArray(data.products)
      ? data.products
      : (data.catalog ? Object.values(data.catalog) : []);

    const localRegistry = { ...getProductCatalogRegistry() };
    let mergedCount = 0;

    // 1. Ingest remote products into local registry
    for (const remote of remoteItems) {
      if (!remote || !remote.itemCode) continue;
      const code = normalizeProductCode(remote.itemCode);
      const existing = localRegistry[code];

      // Merge: preserve local if local was edited more recently
      if (!existing) {
        localRegistry[code] = remote;
        mergedCount++;
      } else if (remote.updatedAt && (!existing.updatedAt || remote.updatedAt > existing.updatedAt)) {
        localRegistry[code] = { ...existing, ...remote };
        mergedCount++;
      }
    }

    persistProductRegistry(localRegistry, { action: 'server_sync', count: mergedCount });

    // 2. Push any local products missing from server
    const remoteCodeSet = new Set(remoteItems.map((p) => normalizeProductCode(p.itemCode)));
    const missingOnServer = Object.values(localRegistry).filter(
      (p) => p && p.itemCode && !remoteCodeSet.has(normalizeProductCode(p.itemCode))
    );

    if (missingOnServer.length > 0) {
      saveBatchProductsToServer(missingOnServer).catch(() => {});
    }

    return {
      success: true,
      mergedCount,
      totalCount: Object.keys(localRegistry).length
    };
  } catch (err) {
    return { success: false, offline: true, error: err?.message };
  }
}

/**
 * Format human-readable provenance label for product origin
 * @param {string} origin ('planning_catalog' | 'daily_log' | 'manual_override' | 'preset_seed')
 * @returns {string} Human-readable source description
 */
export function formatSourceOriginLabel(origin) {
  switch (origin) {
    case 'planning_catalog':
      return 'Excel Planning Catalog';
    case 'daily_log':
      return 'Daily Production Log';
    case 'manual_override':
      return 'Manual Floor Override';
    case 'preset_seed':
      return 'System Default Seed';
    default:
      return 'System Standard';
  }
}

/**
 * Get color theme / CSS classes for provenance badge
 * @param {string} origin
 * @returns {Object} { label: string, classes: string, dotClass: string }
 */
export function getSourceOriginBadgeTheme(origin) {
  const label = formatSourceOriginLabel(origin);
  switch (origin) {
    case 'planning_catalog':
      return {
        label,
        tag: 'From Catalog: Unique Planning Catalog',
        classes: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
        dotClass: 'bg-emerald-500',
        textColor: '#047857'
      };
    case 'manual_override':
      return {
        label,
        tag: 'Calibrated Floor Override',
        classes: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
        dotClass: 'bg-amber-500',
        textColor: '#b45309'
      };
    case 'daily_log':
      return {
        label,
        tag: 'From Log: Daily Production Log',
        classes: 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800',
        dotClass: 'bg-purple-500',
        textColor: '#6d28d9'
      };
    case 'preset_seed':
    default:
      return {
        label,
        tag: 'System Default Seed',
        classes: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        dotClass: 'bg-slate-500',
        textColor: '#475569'
      };
  }
}

/**
 * Transform a product record into the standard Provenance Audit snapshot schema
 * @param {Object} item
 * @returns {Object|null}
 */
export function transformProductToProvenanceAuditItem(item) {
  if (!item) return null;
  const rawCode = String(item.itemCode || item.code || '').trim();
  const desc = String(item.description || '').trim();

  // Parse OD in mm
  let od_mm = null;
  if (item.odMm !== undefined && item.odMm !== null && item.odMm !== '') {
    const m = String(item.odMm).match(/\d+(?:\.\d+)?/);
    if (m) {
      od_mm = Number(parseFloat(m[0]).toFixed(2));
    }
  }

  // SDR extraction
  let sdr = null;
  const wtRaw = String(item.wallThickness || '').trim();
  const sdrMatch = wtRaw.match(/SDR\s*[-:]?\s*(\d+(?:\.\d+)?)/i) ||
                   desc.match(/SDR\s*[-:]?\s*(\d+(?:\.\d+)?)/i);
  if (sdrMatch) {
    sdr = `SDR${sdrMatch[1]}`;
  } else if (/^SDR/i.test(wtRaw)) {
    sdr = wtRaw.toUpperCase();
  }

  // Wall thickness in mm
  let wall_thickness_mm = null;
  const mmMatch = wtRaw.match(/^(\d+(?:\.\d+)?)\s*(?:mm)?$/i);
  if (mmMatch && !/sdr/i.test(wtRaw)) {
    wall_thickness_mm = Number(parseFloat(mmMatch[1]).toFixed(2));
  } else if (od_mm && sdrMatch) {
    const sdrVal = parseFloat(sdrMatch[1]);
    if (sdrVal > 0) {
      wall_thickness_mm = Number((od_mm / sdrVal).toFixed(2));
    }
  }

  // Std weight in kg
  const uWeight = Number(item.unitWeight || item.stdWeight || 0);
  const std_weight_kg = uWeight > 0 ? Number(uWeight.toFixed(2)) : 0;

  // Suggested pace in pcs/h
  const suggested_pace_pcs_h = (item.targetPcsH !== undefined && item.targetPcsH !== null && Number(item.targetPcsH) > 0)
    ? Math.round(Number(item.targetPcsH))
    : null;

  const source_origin = item.source_origin || (item.source === 'factory_preset' ? 'preset_seed' : (item.isPending ? 'daily_log' : 'planning_catalog'));

  return {
    item_code: rawCode,
    description: desc,
    od_mm,
    sdr: sdr || (wtRaw && !wall_thickness_mm ? wtRaw : null),
    wall_thickness_mm,
    std_weight_kg,
    suggested_pace_pcs_h,
    source_origin,
    source_file: item.source_file || (source_origin === 'preset_seed' ? 'System Defaults' : (source_origin === 'manual_override' ? 'manual_input' : 'Unique Planning Catalog')),
    source_sheet: item.source_sheet || (source_origin === 'preset_seed' ? 'Factory Presets' : (source_origin === 'manual_override' ? 'Floor Override' : 'Planning Catalog')),
    last_updated_at: item.last_updated_at || item.updatedAt || new Date().toISOString()
  };
}

/**
 * Generate complete structured array of catalog provenance audit items
 * @param {Array<Object>|null} items
 * @returns {Array<Object>}
 */
export function generateProvenanceAuditSnapshot(items = null) {
  const sourceList = Array.isArray(items) && items.length > 0
    ? items
    : getAllProducts();

  return sourceList
    .map(transformProductToProvenanceAuditItem)
    .filter(Boolean)
    .sort((a, b) => {
      const codeA = String(a.item_code || '');
      const codeB = String(b.item_code || '');
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    });
}

/**
 * Persist current full catalog snapshot into localStorage for zero-lag instant exports
 * @param {Array<Object>|null} items
 * @returns {Array<Object>} The generated snapshot
 */
export function saveProvenanceAuditSnapshot(items = null) {
  const snapshot = generateProvenanceAuditSnapshot(items);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(PROVENANCE_AUDIT_STORAGE_KEY, JSON.stringify(snapshot, null, 2));
    } catch (err) {
      console.warn('Failed to persist provenance audit snapshot:', err);
    }
  }
  return snapshot;
}

/**
 * Retrieve cached provenance audit snapshot from localStorage or generate on-the-fly
 * @returns {Array<Object>}
 */
export function getProvenanceAuditSnapshot() {
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(PROVENANCE_AUDIT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}
  }
  return generateProvenanceAuditSnapshot();
}

/**
 * Format audit export filename: Catalog_Provenance_Audit_[YYYY-MM-DD_HHmm].json
 * @param {Date} [date]
 * @param {string} [ext]
 * @returns {string}
 */
export function formatProvenanceAuditFilename(date = new Date(), ext = 'json') {
  const d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `Catalog_Provenance_Audit_${y}-${m}-${day}_${hh}${mm}.${ext}`;
}

/**
 * Convert provenance audit snapshot to CSV format
 * @param {Array<Object>} snapshot
 * @returns {string}
 */
export function convertProvenanceSnapshotToCsv(snapshot = []) {
  const headers = [
    'item_code',
    'description',
    'od_mm',
    'sdr',
    'wall_thickness_mm',
    'std_weight_kg',
    'suggested_pace_pcs_h',
    'source_origin',
    'source_file',
    'source_sheet',
    'last_updated_at'
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = [headers.join(',')];
  for (const item of snapshot) {
    if (!item) continue;
    const row = headers.map((h) => escapeCsv(item[h]));
    rows.push(row.join(','));
  }

  return rows.join('\r\n');
}


