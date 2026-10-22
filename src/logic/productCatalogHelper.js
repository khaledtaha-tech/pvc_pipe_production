/**
 * Central Product Catalog Registry & Dynamic Ingestion Helper
 * Manages dynamic product definitions, Excel "Unique Planning Catalog" ingestion,
 * on-the-fly product creation, local cache, and central MySQL backend persistence.
 */

import * as XLSX from 'xlsx';
import { SOP_FACTORY_PRESETS, resolveStdWeightFromSpecs } from './legacySopHelper.js';
import { parseDiameterToMm } from '../utils/masterProfiles.js';
import { matchMachine, ASTM_IMPERIAL_OD_MAP, BLACKLISTED_STANDARD_NUMBERS } from '../config/machines.js';
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
 * Standard ASTM Schedule wall thicknesses (mm) keyed by OD mm
 */
export const ASTM_SCHEDULE_WALL_THICKNESS = {
  SCH40: {
    21.3: 2.77, // 1/2"
    26.7: 2.87, // 3/4"
    33.4: 3.38, // 1"
    42.2: 3.56, // 1-1/4"
    48.3: 3.68, // 1-1/2"
    60.3: 3.91, // 2"
    73.0: 5.16, // 2-1/2"
    88.9: 5.49, // 3"
    114.3: 6.02, // 4"
    168.3: 7.11, // 6"
    219.1: 8.18  // 8"
  },
  SCH80: {
    21.3: 3.73,
    26.7: 3.91,
    33.4: 4.55,
    42.2: 4.85,
    48.3: 5.08,
    60.3: 5.54,
    73.0: 7.01,
    88.9: 7.62,
    114.3: 8.56,
    168.3: 10.97,
    219.1: 12.70
  }
};

/**
 * Validates whether an item code and description represent an authentic factory catalog SKU
 * Filters out conversational text, email notes ("Dear Sir..."), summary headers, and phantom single letters ("s").
 * @param {string|number} rawCode
 * @param {string} [desc]
 * @returns {boolean}
 */
export function isValidProductCode(rawCode, desc = '') {
  if (rawCode === undefined || rawCode === null) return false;
  const code = String(rawCode).trim();
  if (!code) return false;

  // Single non-digit letter is invalid (e.g. "s", "x")
  if (/^[a-zA-Z]$/.test(code)) return false;

  // Header or summary labels
  if (/^(?:item\s*code|code|total|grand\s*total|summary|average|remarks|notes?|date|shift|line|machine|product\s*(?:code|description|name)?)$/i.test(code)) {
    return false;
  }

  // Conversational / email phrases
  if (/(?:dear\s*sir|as\s*per|please\s*find|regards|thank|subject|sent\s*from)/i.test(code)) {
    return false;
  }
  if (desc && /(?:dear\s*sir|as\s*per\s*(?:the\s*)?plan|please\s*find)/i.test(desc)) {
    return false;
  }

  // Codes that are long sentences (more than 3 words with text)
  if (code.split(/\s+/).length > 3 && /[a-zA-Z]{3,}/.test(code)) {
    return false;
  }

  // Exceedingly long strings
  if (code.length > 40) return false;

  // Must contain at least one alphanumeric character
  if (!/[a-zA-Z0-9]/.test(code)) return false;

  return true;
}

/**
 * Auto-extracts engineering dimensions (OD mm, Wall Thickness mm, SDR) from specs or description
 * @param {Object|string} productOrOd Product record object or explicit OD string
 * @param {string} [wallThickness] Wall thickness or SDR
 * @param {string} [description] Product specification description
 * @returns {{ od_mm: number|null, wall_thickness_mm: number|null, sdr: string|null }}
 */
export function extractProductDimensions(productOrOd, wallThickness = '', description = '') {
  let odRaw = '';
  let wtRaw = '';
  let desc = '';

  if (productOrOd && typeof productOrOd === 'object') {
    odRaw = String(productOrOd.odMm ?? productOrOd.od_mm ?? productOrOd.od ?? '').trim();
    wtRaw = String(productOrOd.wallThickness ?? productOrOd.wall_thickness_mm ?? productOrOd.wall_thickness ?? '').trim();
    desc = String(productOrOd.description ?? productOrOd.productDescription ?? productOrOd.spec ?? '').trim();
  } else {
    odRaw = String(productOrOd ?? '').trim();
    wtRaw = String(wallThickness ?? '').trim();
    desc = String(description ?? '').trim();
  }

  let od_mm = null;

  // 1. Explicit numeric or string OD
  if (odRaw && odRaw !== '-' && odRaw !== 'null' && odRaw !== 'undefined') {
    const parsedOd = parseDiameterToMm(odRaw);
    if (parsedOd && parsedOd > 0) {
      od_mm = Number(parsedOd.toFixed(2));
    } else {
      const numMatch = odRaw.match(/^(\d+(?:\.\d+)?)/);
      if (numMatch) {
        const val = parseFloat(numMatch[1]);
        if (!BLACKLISTED_STANDARD_NUMBERS.includes(String(Math.round(val))) && val >= 10 && val <= 1200) {
          od_mm = Number(val.toFixed(2));
        }
      }
    }
  }

  // 2. Extract OD from description if still null
  if (od_mm === null && desc) {
    // 2a. Match Imperial OD in description (e.g. 1/2", 3/4", 1", 1-1/4", 1-1/2", 2", 2-1/2", 3", 4", 5", 6", 8", 10", 12")
    const inchMatch = desc.match(/(?:^|[\s"'(])(1\/2|3\/4|1-1\/4|1\s*1\/4|1-1\/2|1\s*1\/2|2-1\/2|2\s*1\/2|1|2|3|4|5|6|8|10|12)(?:"|''|\s*inch|\s*in\b)/i);
    if (inchMatch) {
      const rawInch = inchMatch[1].trim();
      const lookupKey = rawInch + '"';
      if (ASTM_IMPERIAL_OD_MAP[lookupKey] !== undefined) {
        od_mm = ASTM_IMPERIAL_OD_MAP[lookupKey];
      } else if (ASTM_IMPERIAL_OD_MAP[rawInch] !== undefined) {
        od_mm = ASTM_IMPERIAL_OD_MAP[rawInch];
      }
    }

    // 2b. Match Metric OD in description (e.g. 110x5.3, 200X9.6, 50x2.4, 20X1.6, 25X1.9)
    if (od_mm === null) {
      const dimXMatch = desc.match(/(?:^|[\s(])(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
      if (dimXMatch) {
        const val = parseFloat(dimXMatch[1]);
        if (!BLACKLISTED_STANDARD_NUMBERS.includes(String(Math.round(val))) && val >= 10 && val <= 1200) {
          od_mm = Number(val.toFixed(2));
        }
      }
    }

    // 2c. Match Metric MM in description (e.g. 160MM, 75MM, 50 MM, 32MM, 25MM, 20 MM)
    if (od_mm === null) {
      const mmMatch = desc.match(/(?:^|[\s(])(\d+(?:\.\d+)?)\s*MM\b/i);
      if (mmMatch) {
        const val = parseFloat(mmMatch[1]);
        if (!BLACKLISTED_STANDARD_NUMBERS.includes(String(Math.round(val))) && val >= 10 && val <= 1200) {
          od_mm = Number(val.toFixed(2));
        }
      }
    }
  }

  // 3. Extract SDR
  let sdr = null;
  const sdrMatch = wtRaw.match(/SDR\s*[-:]?\s*(\d+(?:\.\d+)?)/i) ||
                   desc.match(/SDR\s*[-:]?\s*(\d+(?:\.\d+)?)/i);
  if (sdrMatch) {
    sdr = `SDR${sdrMatch[1]}`;
  } else if (/^SDR/i.test(wtRaw)) {
    sdr = wtRaw.toUpperCase().replace(/\s+/g, '');
  }

  // 4. Extract Wall Thickness in mm
  let wall_thickness_mm = null;

  // 4a. Explicit wall thickness in wtRaw (e.g. "2.2mm", "4.0mm", "2.2")
  const mmMatch = wtRaw.match(/^(\d+(?:\.\d+)?)\s*(?:mm)?$/i);
  if (mmMatch && !/sdr/i.test(wtRaw)) {
    wall_thickness_mm = Number(parseFloat(mmMatch[1]).toFixed(2));
  }

  // 4b. Wall thickness from metric description pattern (e.g. 110x5.3 or 200X9.6 or 75MM PN10X3.6MM)
  if (wall_thickness_mm === null && desc) {
    const xPattern = desc.match(/(?:^|[\s(])(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
    if (xPattern) {
      const candidateWt = parseFloat(xPattern[2]);
      const candidateOd = parseFloat(xPattern[1]);
      if (candidateWt > 0 && candidateWt < 50 && (!od_mm || candidateWt < od_mm || candidateOd === od_mm)) {
        wall_thickness_mm = Number(candidateWt.toFixed(2));
      }
    }
  }

  // 4c. Secondary MM pattern in description (e.g. 160MM ... 7.7MM, or 75MM 2.2MM)
  if (wall_thickness_mm === null && desc) {
    const allMmMatches = Array.from(desc.matchAll(/(\d+(?:\.\d+)?)\s*MM\b/gi));
    for (const m of allMmMatches) {
      const val = parseFloat(m[1]);
      if (BLACKLISTED_STANDARD_NUMBERS.includes(String(Math.round(val)))) continue;
      if (od_mm && Math.abs(val - od_mm) < 0.1) continue;
      if (val > 0.5 && val <= 35) {
        wall_thickness_mm = Number(val.toFixed(2));
        break;
      }
    }
  }

  // 4d. Compute wall thickness from SDR if od_mm and sdr are known
  if (wall_thickness_mm === null && od_mm && sdrMatch) {
    const sdrVal = parseFloat(sdrMatch[1]);
    if (sdrVal > 0) {
      wall_thickness_mm = Number((od_mm / sdrVal).toFixed(2));
    }
  }

  // 4e. Compute wall thickness from ASTM Schedule (e.g. SCH40, SCH80)
  if (wall_thickness_mm === null && od_mm && desc) {
    if (/\bSCH\s*[-:]?\s*40\b/i.test(desc)) {
      const sch40Val = ASTM_SCHEDULE_WALL_THICKNESS.SCH40[od_mm];
      if (sch40Val) {
        wall_thickness_mm = sch40Val;
      }
    } else if (/\bSCH\s*[-:]?\s*80\b/i.test(desc)) {
      const sch80Val = ASTM_SCHEDULE_WALL_THICKNESS.SCH80[od_mm];
      if (sch80Val) {
        wall_thickness_mm = sch80Val;
      }
    }
  }

  return {
    od_mm: od_mm !== null ? Number(od_mm.toFixed(2)) : null,
    wall_thickness_mm: wall_thickness_mm !== null ? Number(wall_thickness_mm.toFixed(2)) : null,
    sdr: sdr || (wtRaw && !wall_thickness_mm ? wtRaw : null)
  };
}

/**
 * Extracts pipe length in meters dynamically from description.
 * Regex: (\d+(?:\.\d+)?)\s*(?:MTR|M\b|m\b) (e.g. "2.9MTR" -> 2.9, "5.8MTR" -> 5.8). Defaults to 6.0.
 * @param {string} desc
 * @param {number} [defaultLength=6.0]
 * @returns {number}
 */
export function extractPipeLength(desc, defaultLength = 6.0) {
  if (!desc || typeof desc !== 'string') return defaultLength;
  const match = desc.match(/(?:^|[\s,;_\-/])(\d+(?:\.\d+)?)\s*(?:MTR|mtr|METER|meter|METERS|meters|M|m)(?![a-zA-Z])/);
  if (match) {
    const val = parseFloat(match[1]);
    if (val >= 0.5 && val <= 18.0) {
      return val;
    }
  }
  return defaultLength;
}

/**
 * Intelligent dual-mode weight classifier & resolver.
 * Standardizes pipe weight to canonical Linear Weight per Meter (linear_weight_kg_m).
 * Detects whether incoming weights are per-meter or per-piece:
 * Theoretical uPVC weight: W_theo = 0.0045 * (odMm - wallThicknessMm) * wallThicknessMm
 * @param {number|string} rawWeight
 * @param {number|string|null} [odMm]
 * @param {number|string|null} [wallThicknessMm]
 * @param {number} [pipeLengthM=6.0]
 * @param {boolean} [isCompounding=false]
 * @returns {number} Canonical linear weight in kg/m (precision 3 decimals)
 */
export function resolvePipeLinearWeight(rawWeight, odMm = null, wallThicknessMm = null, pipeLengthM = 6.0, isCompounding = false) {
  const w = Number(rawWeight);
  if (isNaN(w) || w <= 0) return 0;
  if (isCompounding) return Number(w.toFixed(3));

  const len = Number(pipeLengthM) > 0 ? Number(pipeLengthM) : 6.0;

  let od = null;
  if (odMm !== null && odMm !== undefined && odMm !== '') {
    const parsedOd = parseFloat(String(odMm).replace(/[^\d.]/g, ''));
    if (!isNaN(parsedOd) && parsedOd > 0) od = parsedOd;
  }

  let wt = null;
  if (wallThicknessMm !== null && wallThicknessMm !== undefined && wallThicknessMm !== '') {
    const sdrMatch = String(wallThicknessMm).match(/SDR\s*[-:]?\s*(\d+(?:\.\d+)?)/i);
    if (sdrMatch && od > 0) {
      const sdrVal = parseFloat(sdrMatch[1]);
      if (sdrVal > 0) wt = od / sdrVal;
    } else {
      const parsedWt = parseFloat(String(wallThicknessMm).replace(/[^\d.]/g, ''));
      if (!isNaN(parsedWt) && parsedWt > 0) wt = parsedWt;
    }
  }

  let wTheo = null;
  if (od > 0 && wt > 0 && od > wt) {
    wTheo = 0.0045 * (od - wt) * wt;
  }

  let linearWeight = w;

  if (wTheo !== null && wTheo > 0) {
    const minMeter = 0.6 * wTheo;
    const maxMeter = 1.4 * wTheo;
    const pieceTheo = wTheo * len;

    if (w >= minMeter && w <= maxMeter) {
      linearWeight = w;
    } else if (w >= 1.8 * wTheo || (od >= 50 && w > 2.0 * wTheo) || Math.abs(w - pieceTheo) < Math.abs(w - wTheo)) {
      linearWeight = w / len;
    } else if (Math.abs((w / len) - wTheo) < Math.abs(w - wTheo)) {
      linearWeight = w / len;
    } else {
      linearWeight = w;
    }
  } else {
    // Fallback if dimensions missing
    if (od && od >= 75) {
      if (w < 4.0) {
        linearWeight = w;
      } else {
        linearWeight = w / len;
      }
    } else {
      if (w > 4.0) {
        linearWeight = w / len;
      } else {
        linearWeight = w;
      }
    }
  }

  return Number(linearWeight.toFixed(3));
}

/**
 * Normalizes pipe unit weight: converts kg/m linear weight to full piece weight (kg/pipe)
 * For standard 6m pipes where weight is suspiciously low for its OD (weight < 1.5 kg for OD >= 75mm),
 * multiplies by pipe length (default 6.0m).
 * @param {number} weight
 * @param {number|null} [odMm]
 * @param {number} [pipeLength=6.0]
 * @param {boolean} [isCompounding=false]
 * @returns {number}
 */
export function normalizePipeUnitWeight(weight, odMm = null, pipeLength = 6.0, isCompounding = false) {
  const w = Number(weight);
  if (isNaN(w) || w <= 0) return 0;
  if (isCompounding) return Number(w.toFixed(2));

  const len = Number(pipeLength) > 0 ? Number(pipeLength) : 6.0;
  const od = Number(odMm);

  // If OD >= 75mm and weight < 1.5 kg for a standard pipe (len >= 5.0m),
  // this is definitely a linear weight per meter (kg/m), not full pipe piece weight.
  if (od >= 75 && w < 1.5 && len >= 5.0) {
    return Number((w * len).toFixed(2));
  }

  return Number(w.toFixed(2));
}

/**
 * Purge invalid catalog items (phantom entries, single letters like "s", conversational text)
 * from localStorage registry and in-memory cache.
 * @returns {number} Number of purged records
 */
export function purgeInvalidCatalogItems() {
  const storage = getStorage();
  let purgedCount = 0;
  let target = {};

  if (storage) {
    try {
      const raw = storage.getItem(PRODUCT_CATALOG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          target = parsed;
        }
      }
    } catch (_) {}
  }
  if (Object.keys(target).length === 0 && inMemoryProductRegistry) {
    target = { ...inMemoryProductRegistry };
  }

  const cleanedRegistry = {};
  for (const [key, item] of Object.entries(target)) {
    const code = item?.itemCode || key;
    const desc = item?.description || '';
    if (isValidProductCode(code, desc)) {
      cleanedRegistry[key] = item;
    } else {
      purgedCount++;
    }
  }

  if (purgedCount > 0) {
    inMemoryProductRegistry = cleanedRegistry;
    if (storage) {
      try {
        storage.setItem(PRODUCT_CATALOG_STORAGE_KEY, JSON.stringify(cleanedRegistry));
        const snapshot = generateProvenanceAuditSnapshot(Object.values(cleanedRegistry));
        storage.setItem(PROVENANCE_AUDIT_STORAGE_KEY, JSON.stringify(snapshot, null, 2));
      } catch (_) {}
    }
  }
  return purgedCount;
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
      if (!code || !isValidProductCode(code, preset.description)) return;

      const dims = extractProductDimensions(preset);
      const odMmStr = preset.odMm || (dims.od_mm ? String(dims.od_mm) : '');
      const wtStr = preset.wallThickness || (dims.wall_thickness_mm ? `${dims.wall_thickness_mm}mm` : (dims.sdr || ''));

      const desc = preset.description || '';
      const rawWeight = Number(preset.unitWeight || preset.stdWeight) || 0;
      const length = preset.isCompounding ? 0 : (preset.pipeLength !== undefined ? Number(preset.pipeLength) : extractPipeLength(desc, 6.0));
      const linearWeight = resolvePipeLinearWeight(rawWeight, dims.od_mm, dims.wall_thickness_mm, length, preset.isCompounding);
      const pieceWeight = preset.isCompounding ? rawWeight : Number((linearWeight * (length > 0 ? length : 6.0)).toFixed(2));
      const uWeight = normalizePipeUnitWeight(rawWeight, dims.od_mm, length, preset.isCompounding);
      const finalPieceWeight = uWeight > 0 ? uWeight : pieceWeight;

      const targetPcsH = preset.targetPcsH !== undefined && preset.targetPcsH !== null
        ? Number(preset.targetPcsH)
        : (finalPieceWeight > 0 && !preset.isCompounding ? Math.round(200 / finalPieceWeight) : null);
      const nowIso = new Date().toISOString();
      catalog[code] = {
        itemCode: String(preset.itemCode).trim(),
        description: desc,
        odMm: odMmStr,
        wallThickness: wtStr,
        material: preset.isCompounding ? 'PVC Compound' : (preset.material || 'uPVC'),
        linear_weight_kg_m: linearWeight,
        pipe_length_m: length,
        piece_weight_kg: finalPieceWeight,
        std_weight_kg: finalPieceWeight,
        unitWeight: finalPieceWeight,
        stdWeight: finalPieceWeight,
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
      linear_weight_kg_m: 1.308,
      pipe_length_m: 6.0,
      piece_weight_kg: 7.85,
      std_weight_kg: 7.85,
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
          // Sanitize registry: immediately purge any invalid codes (e.g. phantom item "s")
          let cleanedAny = false;
          for (const [code, val] of Object.entries(parsed)) {
            if (!isValidProductCode(code, val?.description)) {
              delete parsed[code];
              cleanedAny = true;
            }
          }

          // Fallback backfill: Ensure newly added seed presets (such as 188, 195) are present or refreshed
          let mergedAny = false;
          const seed = getInitialSeedCatalog();
          for (const [code, val] of Object.entries(seed)) {
            if (!parsed[code]) {
              parsed[code] = val;
              mergedAny = true;
            } else if (parsed[code].source_origin === 'preset_seed' || parsed[code].source === 'factory_preset') {
              let specUpdated = false;
              if (!parsed[code].odMm && val.odMm) {
                parsed[code].odMm = val.odMm;
                specUpdated = true;
              }
              if (!parsed[code].wallThickness && val.wallThickness) {
                parsed[code].wallThickness = val.wallThickness;
                specUpdated = true;
              }
              if (code === '195' && Number(parsed[code].unitWeight) < 2) {
                parsed[code].unitWeight = val.unitWeight;
                parsed[code].stdWeight = val.stdWeight;
                parsed[code].odMm = val.odMm;
                parsed[code].wallThickness = val.wallThickness;
                specUpdated = true;
              }
              if (specUpdated) mergedAny = true;
            }
          }
          if (cleanedAny || mergedAny) {
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
    let cleanedAnyMem = false;
    for (const [code, val] of Object.entries(inMemoryProductRegistry)) {
      if (!isValidProductCode(code, val?.description)) {
        delete inMemoryProductRegistry[code];
        cleanedAnyMem = true;
      }
    }
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
  const desc = String(productData.description || productData.productDescription || productData.spec || '').trim();
  if (!rawCode || !isValidProductCode(rawCode, desc)) throw new Error(`Invalid item code: ${rawCode}`);

  const normalizedCode = normalizeProductCode(rawCode);
  const existing = getProductByCode(rawCode);
  const effectiveDesc = desc || existing?.description || `Product Code ${rawCode}`;

  const pipeLength = productData.pipeLength !== undefined && productData.pipeLength !== null && productData.pipeLength !== ''
    ? Number(productData.pipeLength)
    : (productData.pipe_length_m !== undefined && productData.pipe_length_m !== null && productData.pipe_length_m !== ''
        ? Number(productData.pipe_length_m)
        : extractPipeLength(effectiveDesc, 6.0));

  const isCompounding = Boolean(productData.isCompounding ?? existing?.isCompounding);
  const dims = extractProductDimensions({ odMm: productData.odMm || existing?.odMm, wallThickness: productData.wallThickness || existing?.wallThickness, description: effectiveDesc });

  let rawWeight = Number(productData.unitWeight || productData.stdWeight || productData.piece_weight_kg || productData.std_weight_kg);
  if (isNaN(rawWeight) || rawWeight <= 0) {
    rawWeight = resolveStdWeightFromSpecs({ itemCode: rawCode, description: effectiveDesc }, pipeLength) || (existing?.unitWeight || 0);
  }

  const linearWeight = (productData.linear_weight_kg_m !== undefined && productData.linear_weight_kg_m !== null && Number(productData.linear_weight_kg_m) > 0)
    ? Number(Number(productData.linear_weight_kg_m).toFixed(3))
    : resolvePipeLinearWeight(rawWeight, dims.od_mm, dims.wall_thickness_mm, pipeLength, isCompounding);

  const pieceWeight = isCompounding
    ? Number((rawWeight || linearWeight).toFixed(2))
    : Number((linearWeight * (pipeLength > 0 ? pipeLength : 6.0)).toFixed(2));

  let uWeight = normalizePipeUnitWeight(rawWeight, dims.od_mm, pipeLength, isCompounding);
  if (uWeight <= 0) uWeight = pieceWeight;

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

  const nowIso = new Date().toISOString();
  const sourceOrigin = productData.source_origin ||
    (Boolean(productData.isPending) ? 'daily_log' : (existing?.source_origin || 'manual_override'));

  const finalOdMm = productData.odMm || existing?.odMm || (dims.od_mm ? String(dims.od_mm) : '');
  const finalWallThickness = productData.wallThickness || existing?.wallThickness || (dims.wall_thickness_mm ? `${dims.wall_thickness_mm}mm` : (dims.sdr || ''));

  let sourceFile = productData.source_file || existing?.source_file;
  let sourceSheet = productData.source_sheet || existing?.source_sheet;

  if (sourceOrigin === 'daily_log') {
    if (!sourceFile || sourceFile === 'Unique Planning Catalog' || sourceFile === 'System Defaults') {
      sourceFile = 'Daily Production Log';
    }
    if (!sourceSheet || sourceSheet === 'Unique Planning Catalog' || sourceSheet === 'Planning Catalog' || sourceSheet === 'Factory Presets') {
      sourceSheet = 'Daily Shift Log';
    }
  } else if (sourceOrigin === 'preset_seed') {
    sourceFile = sourceFile || 'System Defaults';
    sourceSheet = sourceSheet || 'Factory Presets';
  } else if (sourceOrigin === 'manual_override') {
    sourceFile = sourceFile || 'manual_input';
    sourceSheet = sourceSheet || 'Floor Override';
  } else {
    sourceFile = sourceFile || 'Unique Planning Catalog';
    sourceSheet = sourceSheet || 'Planning Catalog';
  }

  const product = {
    ...(existing || {}),
    itemCode: rawCode,
    description: effectiveDesc,
    odMm: finalOdMm,
    wallThickness: finalWallThickness,
    material: productData.material || existing?.material || 'uPVC',
    linear_weight_kg_m: linearWeight,
    pipe_length_m: isCompounding ? 0 : pipeLength,
    piece_weight_kg: pieceWeight,
    std_weight_kg: pieceWeight,
    unitWeight: uWeight > 0 ? uWeight : (existing?.unitWeight || pieceWeight),
    stdWeight: pieceWeight,
    pipeLength: isCompounding ? 0 : (pipeLength > 0 ? pipeLength : 6.0),
    nominalSpeed: nominalSpeed || existing?.nominalSpeed || null,
    targetPcsH: targetPcsH || existing?.targetPcsH || null,
    primaryExtruder: productData.primaryExtruder || existing?.primaryExtruder || '',
    compatibleMachines: productData.compatibleMachines || existing?.compatibleMachines || '',
    historicalRateKgH: productData.historicalRateKgH || existing?.historicalRateKgH || null,
    isCompounding,
    isPending: Boolean(productData.isPending ?? false),
    source: productData.source || existing?.source || (sourceOrigin === 'manual_override' ? 'manual' : 'auto_discovery'),
    source_origin: sourceOrigin,
    source_file: sourceFile,
    source_sheet: sourceSheet,
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
    const desc = String(item.description || item.productDescription || item.spec || '').trim();
    if (!rawCode || !isValidProductCode(rawCode, desc)) continue;

    const normCode = normalizeProductCode(rawCode);
    const existing = registry[normCode];
    const effectiveDesc = desc || existing?.description || `Product Code ${rawCode}`;

    const pipeLength = Number(item.pipeLength || item.pipe_length_m || existing?.pipeLength || existing?.pipe_length_m) > 0
      ? Number(item.pipeLength || item.pipe_length_m || existing?.pipeLength || existing?.pipe_length_m)
      : extractPipeLength(effectiveDesc, 6.0);

    const isCompounding = Boolean(item.isCompounding ?? existing?.isCompounding);
    const dims = extractProductDimensions({ odMm: item.odMm || existing?.odMm, wallThickness: item.wallThickness || existing?.wallThickness, description: effectiveDesc });

    let rawWeight = Number(item.unitWeight || item.stdWeight || item.piece_weight_kg || item.std_weight_kg || existing?.unitWeight);
    if (isNaN(rawWeight) || rawWeight <= 0) {
      rawWeight = resolveStdWeightFromSpecs({ itemCode: rawCode, description: effectiveDesc }, pipeLength) || 0;
    }

    const linearWeight = (item.linear_weight_kg_m !== undefined && item.linear_weight_kg_m !== null && Number(item.linear_weight_kg_m) > 0)
      ? Number(Number(item.linear_weight_kg_m).toFixed(3))
      : resolvePipeLinearWeight(rawWeight, dims.od_mm, dims.wall_thickness_mm, pipeLength, isCompounding);

    const pieceWeight = isCompounding
      ? Number((rawWeight || linearWeight).toFixed(2))
      : Number((linearWeight * (pipeLength > 0 ? pipeLength : 6.0)).toFixed(2));

    let uWeight = normalizePipeUnitWeight(rawWeight, dims.od_mm, pipeLength, isCompounding);
    if (uWeight <= 0) uWeight = pieceWeight;

    let targetPcsH = item.targetPcsH != null ? Math.round(Number(item.targetPcsH)) : (existing?.targetPcsH || null);
    if (targetPcsH > 0 && pieceWeight > 1.5 && !isCompounding && pipeLength > 1) {
      const nom = 200;
      if (targetPcsH > 60 && (dims.od_mm >= 75 || dims.od_mm == null)) {
        const properPace = Math.round(nom / pieceWeight);
        if (Math.abs(targetPcsH - Math.round(nom / linearWeight)) < Math.abs(targetPcsH - properPace)) {
          targetPcsH = properPace;
        } else if (targetPcsH * pieceWeight > 2.5 * nom) {
          targetPcsH = properPace;
        }
      }
    }
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
    const finalOdMm = item.odMm || existing?.odMm || (dims.od_mm ? String(dims.od_mm) : '');
    const finalWallThickness = item.wallThickness || existing?.wallThickness || (dims.wall_thickness_mm ? `${dims.wall_thickness_mm}mm` : (dims.sdr || ''));

    if (!existing) {
      newProductsCount++;
    } else {
      const specsDiffer = areTechnicalSpecsDifferent(existing, {
        odMm: finalOdMm,
        wallThickness: finalWallThickness,
        material: item.material,
        unitWeight: uWeight,
        description: effectiveDesc
      });
      if (specsDiffer) {
        refreshedSpecsCount++;
      }
    }

    const merged = {
      ...(existing || {}),
      itemCode: rawCode,
      description: effectiveDesc,
      odMm: finalOdMm,
      wallThickness: finalWallThickness,
      material: item.material || existing?.material || 'uPVC',
      linear_weight_kg_m: linearWeight,
      pipe_length_m: isCompounding ? 0 : pipeLength,
      piece_weight_kg: pieceWeight,
      std_weight_kg: pieceWeight,
      unitWeight: uWeight > 0 ? uWeight : pieceWeight,
      stdWeight: pieceWeight,
      pipeLength: isCompounding ? 0 : pipeLength,
      nominalSpeed,
      targetPcsH,
      primaryExtruder: item.primaryExtruder || existing?.primaryExtruder || '',
      compatibleMachines: item.compatibleMachines || existing?.compatibleMachines || '',
      historicalRateKgH: item.historicalRateKgH != null ? Number(item.historicalRateKgH) : (existing?.historicalRateKgH || null),
      isCompounding,
      // If previously verified (isPending === false), keep verified status
      isPending: existing ? Boolean(existing.isPending && (item.isPending ?? true)) : Boolean(item.isPending ?? false),
      source: existing?.source === 'manual' ? 'manual' : (item.source || options.source || 'excel'),
      source_origin: item.source_origin || options.source_origin || (existing?.source_origin || 'planning_catalog'),
      source_file: item.source_file || options.source_file || existing?.source_file || 'Excel Workbook',
      source_sheet: item.source_sheet || options.source_sheet || existing?.source_sheet || 'Unique Planning Catalog',
      provenance_tag: item.provenance_tag || options.provenance_tag || existing?.provenance_tag || (options.source === 'Harmonized Master Catalog' ? 'Harmonized Master Catalog' : null),
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
  const desc = String(description || '').trim();
  if (!clean || !isValidProductCode(clean, desc)) return null;

  const existing = getProductByCode(itemCode);
  if (existing) {
    // If existing has no description, augment it
    if (!existing.description && desc) {
      return saveProduct({
        ...existing,
        description: desc
      }, { syncServer: true });
    }
    return existing;
  }

  const dims = extractProductDimensions({ odMm: specs.odMm, wallThickness: specs.wallThickness, description: desc });
  const pipeLen = Number(specs.pipeLength || specs.pipe_length_m) > 0 ? Number(specs.pipeLength || specs.pipe_length_m) : extractPipeLength(desc, 6.0);
  const isComp = Boolean(specs.isCompounding);
  const rawWeight = Number(specs.unitWeight || specs.stdWeight || specs.piece_weight_kg) || resolveStdWeightFromSpecs({ itemCode, description: desc }, pipeLen) || 0;
  const linearWeight = (specs.linear_weight_kg_m !== undefined && specs.linear_weight_kg_m !== null && Number(specs.linear_weight_kg_m) > 0)
    ? Number(Number(specs.linear_weight_kg_m).toFixed(3))
    : resolvePipeLinearWeight(rawWeight, dims.od_mm, dims.wall_thickness_mm, pipeLen, isComp);
  const pieceWeight = isComp ? rawWeight : Number((linearWeight * pipeLen).toFixed(2));
  const resolvedWeight = normalizePipeUnitWeight(rawWeight, dims.od_mm, pipeLen, isComp) || pieceWeight;
  const nowIso = new Date().toISOString();

  const sourceOrigin = specs.source_origin || 'daily_log';
  let sourceFile = specs.source_file;
  let sourceSheet = specs.source_sheet;

  if (sourceOrigin === 'daily_log') {
    if (!sourceFile || sourceFile === 'Unique Planning Catalog' || sourceFile === 'System Defaults') {
      sourceFile = 'Daily Production Log';
    }
    if (!sourceSheet || sourceSheet === 'Unique Planning Catalog' || sourceSheet === 'Planning Catalog' || sourceSheet === 'Factory Presets') {
      sourceSheet = 'Daily Shift Log';
    }
  }

  return saveProduct({
    itemCode: String(itemCode).trim(),
    description: desc || `Product Code ${itemCode}`,
    odMm: specs.odMm || (dims.od_mm ? String(dims.od_mm) : ''),
    wallThickness: specs.wallThickness || (dims.wall_thickness_mm ? `${dims.wall_thickness_mm}mm` : (dims.sdr || '')),
    linear_weight_kg_m: linearWeight,
    pipe_length_m: isComp ? 0 : pipeLen,
    piece_weight_kg: resolvedWeight,
    std_weight_kg: resolvedWeight,
    unitWeight: resolvedWeight,
    stdWeight: resolvedWeight,
    pipeLength: isComp ? 0 : pipeLen,
    isPending: true,
    source: 'auto_discovery',
    source_origin: sourceOrigin,
    source_file: sourceFile || 'Daily Production Log',
    source_sheet: sourceSheet || 'Daily Shift Log',
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

    const desc = String(
      row['Product Description & Specs'] ??
      row['Pipe Description & Standard Spec'] ??
      row['Description'] ??
      row['description'] ??
      row['B'] ??
      row[1] ??
      ''
    ).trim();

    if (!rawCode || !isValidProductCode(rawCode, desc)) {
      continue;
    }

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

    const dims = extractProductDimensions({ odMm: rawOd, wallThickness: rawWt, description: desc });
    const odMmNum = dims.od_mm || parseDiameterToMm(rawOd) || (rawOd.match(/\d+(?:\.\d+)?/) ? Number(rawOd.match(/\d+(?:\.\d+)?/)[0]) : null);
    const pipeLength = extractPipeLength(desc, 6.0);

    let resolvedWeight = Number(
      row['Unit Weight (kg)'] ??
      row['Unit Weight'] ??
      row['Std Weight'] ??
      row['Weight (kg)'] ??
      row['Unit Wt'] ??
      0
    );
    if (isNaN(resolvedWeight) || resolvedWeight <= 0) {
      resolvedWeight = resolveStdWeightFromSpecs({ itemCode: rawCode, description: desc }, pipeLength) || 0;
    }
    if (resolvedWeight <= 0 && odMmNum > 0) {
      const sdrMatch = rawWt.match(/SDR\s*[-:]?\s*(\d+(?:\.\d+)?)/i);
      let wtNum = dims.wall_thickness_mm || 0;
      if (!wtNum) {
        if (sdrMatch) {
          const sdrVal = Number(sdrMatch[1]);
          if (sdrVal > 0) {
            wtNum = Math.round((odMmNum / sdrVal) * 100) / 100;
          }
        } else {
          const wtMatch = rawWt.match(/\d+(?:\.\d+)?/);
          wtNum = wtMatch ? Number(wtMatch[0]) : 0;
        }
      }
      if (wtNum > 0 && wtNum < odMmNum) {
        resolvedWeight = Math.round(Math.PI * (odMmNum - wtNum) * wtNum * pipeLength * 0.00142 * 100) / 100;
      }
    }

    const linearWeight = resolvePipeLinearWeight(resolvedWeight, odMmNum || dims.od_mm, dims.wall_thickness_mm, pipeLength, false);
    const pieceWeight = Number((linearWeight * pipeLength).toFixed(2));
    resolvedWeight = normalizePipeUnitWeight(resolvedWeight, odMmNum || dims.od_mm, pipeLength, false);
    if (resolvedWeight <= 0) resolvedWeight = pieceWeight;

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

    const effectivePieceWeight = pieceWeight > 0 ? pieceWeight : resolvedWeight;
    let targetPcsH = null;
    if (rawDirectPcsH > 0) {
      targetPcsH = Math.round(rawDirectPcsH);
      // Guard against unrealistic speeds (e.g. 151 pcs/h for 110mm pipe when target was divided by linear weight)
      if (effectivePieceWeight > 1.5 && (odMmNum >= 75 || dims.od_mm >= 75) && pipeLength > 1 && targetPcsH > 60) {
        const refKgH = histRateKgH || targetKgH || 200;
        const properPace = Math.round(refKgH / effectivePieceWeight);
        if (Math.abs(targetPcsH - Math.round(refKgH / linearWeight)) < Math.abs(targetPcsH - properPace)) {
          targetPcsH = properPace;
        } else if (targetPcsH * effectivePieceWeight > 2.5 * refKgH) {
          targetPcsH = properPace;
        }
      }
    } else if (histRateKgH && effectivePieceWeight > 0) {
      targetPcsH = Math.round(histRateKgH / effectivePieceWeight);
    } else if (targetKgH && effectivePieceWeight > 0) {
      targetPcsH = Math.round(targetKgH / effectivePieceWeight);
    }

    const altLines = [];
    const alt1Line = resolveCanonicalLineId(rawAltMach1);
    if (alt1Line) {
      const alt1Match = rawAltRate1.match(/\d+(?:\.\d+)?/g);
      let alt1RateKgH = null;
      if (alt1Match && alt1Match.length > 0) {
        const nums = alt1Match.map(Number);
        alt1RateKgH = nums.reduce((a, b) => a + b, 0) / nums.length;
      }
      const alt1PcsH = (alt1RateKgH && effectivePieceWeight > 0)
        ? Math.round(alt1RateKgH / effectivePieceWeight)
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
      const alt2PcsH = (alt2RateKgH && effectivePieceWeight > 0)
        ? Math.round(alt2RateKgH / effectivePieceWeight)
        : (targetPcsH || null);
      altLines.push({ lineId: alt2Line, rate: alt2PcsH });
    }

    const nowIso = new Date().toISOString();
    const odValStr = odMmNum ? String(odMmNum) : (rawOd || (dims.od_mm ? String(dims.od_mm) : ''));
    const wtValStr = rawWt || (dims.wall_thickness_mm ? `${dims.wall_thickness_mm}mm` : (dims.sdr || ''));

    ingestedItems.push({
      itemCode: rawCode,
      description: desc || `uPVC Pipe ${rawOd} ${rawWt}`.trim(),
      odMm: odValStr,
      wallThickness: wtValStr,
      material: rawMat || 'uPVC',
      linear_weight_kg_m: linearWeight,
      pipe_length_m: pipeLength,
      piece_weight_kg: resolvedWeight,
      std_weight_kg: resolvedWeight,
      unitWeight: resolvedWeight,
      stdWeight: resolvedWeight,
      pipeLength: pipeLength,
      historicalRateKgH: histRateKgH,
      primaryExtruder: rawPrimaryMach && rawPrimaryMach !== '-' ? rawPrimaryMach : '',
      compatibleMachines,
      targetPcsH,
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
  if (!isValidProductCode(rawCode, desc)) return null;

  // Extract engineering dimensions (OD, Wall Thickness, SDR)
  const dims = extractProductDimensions(item);
  const od_mm = dims.od_mm;
  const sdr = dims.sdr;
  const wall_thickness_mm = dims.wall_thickness_mm;

  // Std weight in kg (normalized) and canonical linear weight
  const pipe_length_m = item.isCompounding
    ? 0
    : (Number(item.pipe_length_m || item.pipeLength) > 0 ? Number(item.pipe_length_m || item.pipeLength) : extractPipeLength(desc, 6.0));
  const rawWeight = Number(item.unitWeight || item.stdWeight || item.piece_weight_kg || 0);
  const linear_weight_kg_m = (item.linear_weight_kg_m !== undefined && item.linear_weight_kg_m !== null && Number(item.linear_weight_kg_m) > 0)
    ? Number(Number(item.linear_weight_kg_m).toFixed(3))
    : resolvePipeLinearWeight(rawWeight, od_mm, wall_thickness_mm, pipe_length_m, item.isCompounding);

  const piece_weight_kg = item.isCompounding
    ? (rawWeight > 0 ? Number(rawWeight.toFixed(2)) : Number(linear_weight_kg_m.toFixed(2)))
    : (item.piece_weight_kg !== undefined && item.piece_weight_kg !== null && Number(item.piece_weight_kg) > 0
        ? Number(Number(item.piece_weight_kg).toFixed(2))
        : Number((linear_weight_kg_m * (pipe_length_m > 0 ? pipe_length_m : 6.0)).toFixed(2)));
  const std_weight_kg = piece_weight_kg;

  // Suggested pace in pcs/h
  const suggested_pace_pcs_h = (item.targetPcsH !== undefined && item.targetPcsH !== null && Number(item.targetPcsH) > 0)
    ? Math.round(Number(item.targetPcsH))
    : null;

  const source_origin = item.source_origin || (item.source === 'factory_preset' ? 'preset_seed' : (item.isPending ? 'daily_log' : 'planning_catalog'));

  let source_file = item.source_file;
  let source_sheet = item.source_sheet;

  if (source_origin === 'daily_log') {
    if (!source_file || source_file === 'Unique Planning Catalog' || source_file === 'System Defaults') {
      source_file = 'Daily Production Log';
    }
    if (!source_sheet || source_sheet === 'Unique Planning Catalog' || source_sheet === 'Planning Catalog' || source_sheet === 'Factory Presets') {
      source_sheet = 'Daily Shift Log';
    }
  } else if (source_origin === 'preset_seed') {
    source_file = source_file || 'System Defaults';
    source_sheet = source_sheet || 'Factory Presets';
  } else if (source_origin === 'manual_override') {
    source_file = source_file || 'manual_input';
    source_sheet = source_sheet || 'Floor Override';
  } else {
    source_file = source_file || 'Unique Planning Catalog';
    source_sheet = source_sheet || 'Planning Catalog';
  }

  return {
    item_code: rawCode,
    description: desc,
    od_mm,
    sdr,
    wall_thickness_mm,
    linear_weight_kg_m,
    pipe_length_m,
    piece_weight_kg,
    std_weight_kg,
    suggested_pace_pcs_h,
    source_origin,
    source_file,
    source_sheet,
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
    'linear_weight_kg_m',
    'pipe_length_m',
    'piece_weight_kg',
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

/**
 * Natural / alphanumeric collation comparator for item codes
 * Handles numeric values in natural order (e.g. 12 < 12.68 < 188 < 190 < 195)
 * and keeps alphanumeric suffixes grouped logically (e.g. 247 < 247 R < 248)
 * @param {string|Object} a First product code or product object
 * @param {string|Object} b Second product code or product object
 * @param {'asc'|'desc'} [direction='asc'] Sort direction
 * @returns {number}
 */
export function compareProductCodes(a, b, direction = 'asc') {
  const codeA = String(typeof a === 'object' && a !== null ? (a.itemCode ?? a.item_code ?? a.code ?? '') : (a ?? '')).trim();
  const codeB = String(typeof b === 'object' && b !== null ? (b.itemCode ?? b.item_code ?? b.code ?? '') : (b ?? '')).trim();

  // Natural numeric collation with base sensitivity
  const cmp = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
  if (cmp !== 0) {
    return direction === 'desc' ? -cmp : cmp;
  }

  // Tie-breaker by description if objects are provided
  const descA = String(typeof a === 'object' && a !== null ? (a.description ?? '') : '').trim();
  const descB = String(typeof b === 'object' && b !== null ? (b.description ?? '') : '').trim();
  const descCmp = descA.localeCompare(descB);
  return direction === 'desc' ? -descCmp : descCmp;
}

/**
 * Score relevance of a product item against a search query
 * Gives high priority to exact or prefix matches on itemCode
 * @param {Object} item
 * @param {string} query
 * @returns {number} Relevance score (higher is more relevant)
 */
export function scoreProductSearchRelevance(item, query) {
  if (!item || !query) return 0;
  const q = String(query).trim().toLowerCase();
  if (!q) return 0;

  const code = String(item.itemCode || item.item_code || item.code || '').trim().toLowerCase();
  const desc = String(item.description || '').trim().toLowerCase();
  const od = String(item.odMm || item.od_mm || '').trim().toLowerCase();
  const wt = String(item.wallThickness || item.wall_thickness_mm || item.sdr || '').trim().toLowerCase();
  const file = String(item.source_file || '').trim().toLowerCase();
  const sheet = String(item.source_sheet || '').trim().toLowerCase();

  // 1. Exact match on itemCode
  if (code === q) return 100;

  // 2. ItemCode starts with query
  if (code.startsWith(q)) return 80;

  // 3. ItemCode contains query as substring or word
  if (code.includes(q)) return 60;

  // 4. Description starts with query
  if (desc.startsWith(q)) return 40;

  // 5. Description contains query
  if (desc.includes(q)) return 30;

  // 6. OD or wall thickness match
  if (od.includes(q) || wt.includes(q)) return 20;

  // 7. Source file or sheet match
  if (file.includes(q) || sheet.includes(q)) return 10;

  return 0;
}

/**
 * Classify product code into one of standard categories:
 * - 'NUMERIC': purely numeric or decimal code (e.g. 12, 188, 195, 12.68)
 * - 'SUFFIX': numeric with suffix or modifier (e.g. 247 R, 188-A, 249B)
 * - 'COMPOUND': compounding recipe or pellet code (e.g. COMP-01, PEL-01, or isCompounding=true)
 * - 'OTHER': other alphanumeric codes
 * @param {Object|string} item
 * @returns {string} Category string
 */
export function classifyProductCodeType(item) {
  const code = String(typeof item === 'object' && item !== null ? (item.itemCode ?? item.item_code ?? item.code ?? '') : (item ?? '')).trim();
  const isComp = Boolean((typeof item === 'object' && item !== null && item.isCompounding) || /^COMP|^PEL|^BLEND/i.test(code));
  if (isComp) return 'COMPOUND';

  if (/^\d+(?:\.\d+)?$/.test(code)) return 'NUMERIC';
  if (/\d+.*[a-zA-Z]|[a-zA-Z].*\d+/.test(code)) return 'SUFFIX';

  return 'OTHER';
}



