/**
 * Catalog Harmonizer Engine
 * Isolated Workbench & Standardization Logic for Master Product Name Standardization & Conflict Resolution
 */

import * as XLSX from 'xlsx';
import harmonizerConfig from '../data/harmonizerConfig.json' with { type: 'json' };
import { ASTM_IMPERIAL_OD_MAP, BLACKLISTED_STANDARD_NUMBERS } from '../config/machines.js';
import {
  resolvePipeLinearWeight,
  getAllProducts,
  upsertBatchProducts,
  PRODUCT_CATALOG_STORAGE_KEY,
  PRODUCT_CATALOG_UPDATED_EVENT
} from './productCatalogHelper.js';
import {
  calculateTheoreticalLinearWeight,
  calculateWeightVariance,
  lookupCanonicalSpec,
  diagnoseCatalogItem,
  DEFAULT_PVC_DENSITY_G_CM3
} from './canonicalStandardsEngine.js';

export {
  calculateTheoreticalLinearWeight,
  calculateWeightVariance,
  lookupCanonicalSpec,
  diagnoseCatalogItem,
  DEFAULT_PVC_DENSITY_G_CM3
};

export const HARMONIZER_STORAGE_KEY = 'pvc_catalog_harmonizer_sandbox';
export const ARCHETYPES_STORAGE_KEY = 'pvc_catalog_archetypes';

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

// In-memory fallback for headless/test environments
let inMemoryHarmonizerSandbox = null;
let inMemoryArchetypes = null;

/**
 * Load archetypes patterns from storage or fallback to seed defaults
 * @returns {Array<Object>} Active archetype pattern templates
 */
export function loadArchetypes() {
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(ARCHETYPES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse archetypes storage:', e);
    }
  }
  return inMemoryArchetypes || JSON.parse(JSON.stringify(harmonizerConfig.seedArchetypes || []));
}

/**
 * Persist archetype patterns to localStorage
 * @param {Array<Object>} archetypes
 */
export function saveArchetypes(archetypes) {
  const safe = Array.isArray(archetypes) ? archetypes : [];
  inMemoryArchetypes = safe;
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(ARCHETYPES_STORAGE_KEY, JSON.stringify(safe));
    } catch (e) {
      console.warn('Failed to save archetypes storage:', e);
    }
  }
}

/**
 * Reset archetype patterns to factory default seed list
 * @returns {Array<Object>} Reset seed archetypes
 */
export function resetArchetypes() {
  const seeds = JSON.parse(JSON.stringify(harmonizerConfig.seedArchetypes || []));
  inMemoryArchetypes = seeds;
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(ARCHETYPES_STORAGE_KEY, JSON.stringify(seeds));
    } catch (e) {
      console.warn('Failed to reset archetypes storage:', e);
    }
  }
  return seeds;
}

/**
 * Load isolated harmonizer staging sandbox state
 * @returns {Array<Object>} Staged harmonized items
 */
export function loadHarmonizerSandboxState() {
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(HARMONIZER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse harmonizer sandbox storage:', e);
    }
  }
  return inMemoryHarmonizerSandbox || [];
}

/**
 * Save isolated harmonizer staging sandbox state
 * @param {Array<Object>} items
 */
export function saveHarmonizerSandboxState(items) {
  const safeItems = Array.isArray(items) ? items : [];
  inMemoryHarmonizerSandbox = safeItems;
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(HARMONIZER_STORAGE_KEY, JSON.stringify(safeItems));
    } catch (e) {
      console.warn('Failed to save harmonizer sandbox storage:', e);
    }
  }
}

/**
 * Clear isolated harmonizer staging sandbox
 */
export function clearHarmonizerSandboxState() {
  inMemoryHarmonizerSandbox = [];
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(HARMONIZER_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear harmonizer sandbox storage:', e);
    }
  }
}

/**
 * Decomposes a raw product description into structured canonical components
 * @param {string} rawDesc Messy product description string
 * @param {string|number} [itemCode=''] Item code
 * @param {Object} [existingSpecs={}] Optional hints from existing record
 * @returns {Object} Structured decomposition
 */
export function parseMessyProductDescription(rawDesc = '', itemCode = '', existingSpecs = {}) {
  const desc = String(rawDesc || '').trim();
  const cleanUpper = desc.toUpperCase();

  // 1. Product Type
  let productType = 'PVC PIPE';
  if (/\b(?:CONDUIT|DUCT|ELECTRICAL)\b/i.test(desc)) {
    productType = 'PVC CONDUIT';
  } else if (/\b(?:COMPOUND|DRYBLEND|REGRIND|CRUSH)\b/i.test(desc)) {
    productType = 'PVC COMPOUND';
  } else if (/\bCPVC\b/i.test(desc)) {
    productType = 'CPVC PIPE';
  } else if (/\bUPVC\b/i.test(desc)) {
    productType = 'UPVC PIPE';
  }

  // 2. OD / Nominal Size & Wall Thickness
  let odMm = existingSpecs.odMm || existingSpecs.od_mm || null;
  let sizeDisplay = '';
  let wallThicknessMm = existingSpecs.wallThicknessMm || existingSpecs.wall_thickness_mm || null;

  // 2a. Imperial Size Check (e.g. 1/2", 3/4", 1", 1-1/4", 1-1/2", 2", 2-1/2", 3", 4", 6", 8", 10", 12", or 4 INCH)
  const inchMatch = desc.match(/(?:^|[\s"'(])(1\/2|3\/4|1-1\/4|1\s*1\/4|1-1\/2|1\s*1\/2|2-1\/2|2\s*1\/2|1|2|3|4|5|6|8|10|12)(?:"|''|\s*inch\b|\s*in\b)/i);
  if (inchMatch) {
    const rawInchFraction = inchMatch[1].replace(/\s+/g, '-').trim();
    const keyWithQuote = rawInchFraction.includes('"') ? rawInchFraction : `${rawInchFraction}"`;
    sizeDisplay = keyWithQuote;
    if (ASTM_IMPERIAL_OD_MAP[keyWithQuote] !== undefined) {
      odMm = ASTM_IMPERIAL_OD_MAP[keyWithQuote];
    } else if (ASTM_IMPERIAL_OD_MAP[rawInchFraction] !== undefined) {
      odMm = ASTM_IMPERIAL_OD_MAP[rawInchFraction];
    }
  }

  // 2b. Metric Dimension 'OD x WT' Pattern (e.g. 110X5.2MM, 75X3.6MM, 160 x 7.7)
  const dimXMatch = desc.match(/(?:^|[\s(])(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/);
  if (dimXMatch) {
    const candOd = parseFloat(dimXMatch[1]);
    const candWt = parseFloat(dimXMatch[2]);
    if (!BLACKLISTED_STANDARD_NUMBERS.includes(String(Math.round(candOd))) && candOd >= 12 && candOd <= 1200) {
      if (!sizeDisplay) {
        odMm = candOd;
        sizeDisplay = `${candOd}`;
      }
      if (candWt > 0.5 && candWt < 50 && (!odMm || candWt < odMm)) {
        wallThicknessMm = Number(candWt.toFixed(2));
      }
    }
  }

  // 2c. Metric OD from MM (e.g. 160MM, 75MM, 110 MM)
  if (!odMm) {
    const mmMatch = desc.match(/(?:^|[\s(])(\d+(?:\.\d+)?)\s*MM\b/i);
    if (mmMatch) {
      const candOd = parseFloat(mmMatch[1]);
      if (!BLACKLISTED_STANDARD_NUMBERS.includes(String(Math.round(candOd))) && candOd >= 12 && candOd <= 1200) {
        odMm = candOd;
        sizeDisplay = `${candOd}`;
      }
    }
  }

  // 2d. Wall Thickness fallback from standalone MM token (e.g. 160MM ... 7.7MM)
  if (wallThicknessMm === null) {
    const allMm = Array.from(desc.matchAll(/(\d+(?:\.\d+)?)\s*MM\b/gi));
    for (const m of allMm) {
      const val = parseFloat(m[1]);
      if (BLACKLISTED_STANDARD_NUMBERS.includes(String(Math.round(val)))) continue;
      if (odMm && Math.abs(val - odMm) < 0.1) continue;
      if (val > 0.5 && val <= 35) {
        wallThicknessMm = Number(val.toFixed(2));
        break;
      }
    }
  }

  // Default display size if metric
  if (!sizeDisplay && odMm) {
    sizeDisplay = `${odMm}`;
  }

  // 3. Pressure Rating / Class / Schedule / SDR
  let ratingClass = '';
  // Check PN Rating
  const pnMatch = desc.match(/\bPN\s*[-:]?\s*(\d+(?:\.\d+)?)\b/i);
  if (pnMatch) {
    ratingClass = `PN${pnMatch[1]}`;
  }

  // Check Schedule
  const schMatch = desc.match(/\bSCH\s*[-:]?\s*(\d+)\b/i);
  if (schMatch) {
    const schStr = `SCH${schMatch[1]}`;
    ratingClass = ratingClass ? `${ratingClass} ${schStr}` : schStr;
  }

  // Check Class
  const classMatch = desc.match(/\b(?:CLASS|CL)\s*[-:]?\s*([0-9A-Za-z]+)\b/i);
  if (classMatch && !ratingClass.includes('CL')) {
    const clStr = `CL${classMatch[1].toUpperCase()}`;
    if (!ratingClass) {
      ratingClass = clStr;
    } else {
      ratingClass = `${ratingClass} ${clStr}`;
    }
  }

  // Check SDR
  const sdrMatch = desc.match(/\bSDR\s*[-:]?\s*(\d+(?:\.\d+)?)\b/i);
  if (sdrMatch && !ratingClass) {
    ratingClass = `SDR${sdrMatch[1]}`;
  }

  // 4. Reference Standard
  let standard = '';
  if (/SASO[- ]?ISO[- ]?1452(?:-2)?/i.test(desc)) {
    standard = 'SASO-ISO 1452-2';
  } else if (/ISO[- ]?1452(?:-2)?/i.test(desc)) {
    standard = 'ISO 1452-2';
  } else if (/DIN[- ]?8062/i.test(desc)) {
    standard = 'DIN 8062';
  } else if (/DIN[- ]?8061/i.test(desc)) {
    standard = 'DIN 8061';
  } else if (/ASTM[- ]?D2665/i.test(desc)) {
    standard = 'ASTM D2665';
  } else if (/ASTM[- ]?D1785/i.test(desc)) {
    standard = 'ASTM D1785';
  } else if (/ASTM[- ]?F441/i.test(desc)) {
    standard = 'ASTM F441';
  } else if (/BS[- ]?3505/i.test(desc)) {
    standard = 'BS 3505';
  } else if (/BS[- ]?3506/i.test(desc)) {
    standard = 'BS 3506';
  } else if (/BS[- ]?4607/i.test(desc)) {
    standard = 'BS 4607';
  } else if (/SASO[- ]?14\/15/i.test(desc)) {
    standard = 'SASO 14/15';
  }

  // If standard not detected, infer ISO 1452-2 for metric PN pipes, ASTM for SCH pipes
  if (!standard) {
    if (ratingClass.startsWith('PN')) {
      standard = 'SASO-ISO 1452-2';
    } else if (ratingClass.includes('SCH')) {
      if (cleanUpper.includes('DWV') || cleanUpper.includes('DRAIN')) {
        standard = 'ASTM D2665';
      } else {
        standard = 'ASTM D1785';
      }
    }
  }

  // 5. Joint / End Type
  let joint = '';
  if (/\b(?:R\/R|RR|RUBBER\s*RING|PUSH[- ]?FIT|GASKET|BELL)\b/i.test(desc)) {
    joint = 'R/R';
  } else if (/\b(?:S\/C|SC|SOLVENT|SOLVENT\s*CEMENT|PLAIN\s*SOCKET)\b/i.test(desc)) {
    joint = 'S/C';
  } else if (/\bPLAIN\b/i.test(desc)) {
    joint = 'PLAIN';
  } else if (/\b(?:P\/E|PE|PLAIN\s*END)\b/i.test(desc)) {
    joint = 'P/E';
  }

  // 6. Color
  let color = '';
  const colorMatch = desc.match(/\b(GREY|GRAY|BLACK|WHITE|ORANGE|BLUE|TERRACOTTA|RED|YELLOW)\b/i);
  if (colorMatch) {
    color = colorMatch[1].toUpperCase();
    if (color === 'GRAY') color = 'GREY';
  }

  // 7. Application (for compound)
  let application = '';
  const appMatch = desc.match(/\b(FOR\s+INJECTION|FOR\s+EXTRUSION|FOR\s+FITTINGS|FOR\s+BOTTLES|FOR\s+PROFILE)\b/i);
  if (appMatch) {
    application = appMatch[1].toUpperCase().replace(/\s+/g, ' ');
  }

  // 8. Grade (for compound)
  let grade = '';
  const gradeMatch = desc.match(/\b(GRADE[- ]?[A-Z0-9]+|K[- ]?67|K[- ]?57|K[- ]?70)\b/i);
  if (gradeMatch) {
    grade = gradeMatch[1].toUpperCase().replace(/\s+/g, '-');
  }

  // 9. Length (default 6.0M if unspecified)
  let lengthM = 6.0;
  const lengthMatch = desc.match(/(?:^|[\s(])(\d+(?:\.\d+)?)\s*M(?:ETER)?\b/i);
  if (lengthMatch) {
    const val = parseFloat(lengthMatch[1]);
    if (val >= 1.0 && val <= 18.0) {
      lengthM = Number(val.toFixed(1));
    }
  }

  return {
    rawDescription: desc,
    itemCode: String(itemCode || '').trim(),
    productType,
    odMm,
    sizeDisplay,
    wallThicknessMm,
    ratingClass,
    standard,
    joint,
    color,
    application,
    grade,
    lengthM
  };
}

/**
 * Builds the canonical standardized name according to strict format template:
 * [Product Type] [OD/Size] x [WT]mm [Rating/Class] [Standard] [Joint] [Length]
 * Example: PVC PIPE 110 x 5.3mm PN10 SASO-ISO 1452-2 R/R 6.0M
 * @param {Object} fields Decomposed structured fields
 * @returns {string} Standardized canonical product name
 */

/**
 * Formats a single token value for an item or sample object
 * @param {Object} item Decomposed fields or product object
 * @param {string} tokenId Token identifier (e.g. PRODUCT_TYPE, OD_SIZE, WT, ...)
 * @returns {string} Formatted token string
 */
export function formatTokenValue(item = {}, tokenId = '') {
  if (!item) return '';

  switch (tokenId) {
    case 'PRODUCT_TYPE':
      return item.productType || 'PVC PIPE';

    case 'OD_SIZE':
      return item.sizeDisplay || (item.odMm ? String(item.odMm) : '');

    case 'WT': {
      if (item.wallThicknessMm !== undefined && item.wallThicknessMm !== null && item.wallThicknessMm !== '') {
        const num = Number(item.wallThicknessMm);
        if (!isNaN(num)) {
          const rawStr = String(item.wallThicknessMm);
          const formatted = !rawStr.includes('.') ? num.toFixed(1) : rawStr;
          return `x ${formatted}mm`;
        }
        return `x ${item.wallThicknessMm}mm`;
      }
      return '';
    }

    case 'RATING_PN_SDR':
      return item.ratingClass || item.sdr || '';

    case 'STANDARD':
      return item.standard || '';

    case 'COLOR':
      return item.color || '';

    case 'JOINT_TYPE':
      return item.joint || '';

    case 'LENGTH':
      return item.lengthM !== undefined && item.lengthM !== null ? `${Number(item.lengthM).toFixed(1)}M` : '6.0M';

    case 'APPLICATION':
      return item.application || '';

    case 'GRADE':
      return item.grade || '';

    default:
      return item[tokenId] ? String(item[tokenId]) : '';
  }
}

/**
 * Synthesizes a standardized description from an item and a token sequence
 * @param {Object} item Decomposed product item or fields
 * @param {Array<string>} tokenSequence Array of token identifiers in custom order
 * @returns {string} Synthesized product description
 */
export function synthesizeDescription(item = {}, tokenSequence = []) {
  if (!Array.isArray(tokenSequence) || tokenSequence.length === 0) {
    return buildCanonicalProductName(item);
  }

  const parts = [];
  tokenSequence.forEach((tokenId) => {
    const val = formatTokenValue(item, tokenId);
    if (val && String(val).trim()) {
      parts.push(String(val).trim());
    }
  });

  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+x\s*$/, '')
    .replace(/^x\s+/, '')
    .trim();
}

/**
 * Determines which archetype best matches a product item
 * @param {Object} item Decomposed product record
 * @param {Array<Object>} [archetypes] List of active archetypes
 * @returns {Object} { archetypeId, archetypeName, matchScore, badgeLabel }
 */
export function detectMatchedArchetype(item = {}, archetypes = null) {
  const activeArchetypes = archetypes || loadArchetypes();
  const rawUpper = String(item.rawDescription || item.description || '').toUpperCase();
  const typeUpper = String(item.productType || '').toUpperCase();
  const sizeStr = String(item.sizeDisplay || item.odMm || '').toUpperCase();
  const ratingUpper = String(item.ratingClass || item.sdr || '').toUpperCase();
  const stdUpper = String(item.standard || '').toUpperCase();

  // 1. PVC Compound (Pattern #5)
  if (typeUpper.includes('COMPOUND') || rawUpper.includes('COMPOUND') || rawUpper.includes('DRYBLEND') || rawUpper.includes('REGRIND')) {
    const p5 = activeArchetypes.find(a => a.id === 'pattern_5_pvc_compound') || activeArchetypes[4] || activeArchetypes[0];
    return {
      archetypeId: p5.id,
      archetypeName: p5.name,
      matchScore: 98,
      badgeLabel: '#5 Compound (98%)'
    };
  }

  // 2. Conduit & Duct (Pattern #4)
  if (typeUpper.includes('CONDUIT') || rawUpper.includes('CONDUIT') || rawUpper.includes('DUCT') || stdUpper.includes('BS 4607') || rawUpper.includes('BS 4607')) {
    const p4 = activeArchetypes.find(a => a.id === 'pattern_4_conduit_duct') || activeArchetypes[3] || activeArchetypes[0];
    return {
      archetypeId: p4.id,
      archetypeName: p4.name,
      matchScore: 96,
      badgeLabel: '#4 Conduit (96%)'
    };
  }

  // 3. ASTM Inch Schedule (Pattern #3)
  if (sizeStr.includes('INCH') || sizeStr.includes('"') || ratingUpper.includes('SCH') || stdUpper.includes('ASTM') || rawUpper.includes('INCH') || rawUpper.includes('SCH40') || rawUpper.includes('SCH80') || rawUpper.includes('ASTM')) {
    const p3 = activeArchetypes.find(a => a.id === 'pattern_3_astm_inch') || activeArchetypes[2] || activeArchetypes[0];
    return {
      archetypeId: p3.id,
      archetypeName: p3.name,
      matchScore: 97,
      badgeLabel: '#3 ASTM Inch (97%)'
    };
  }

  // 4. Metric Sewer / Drainage (Pattern #2)
  if (ratingUpper.includes('SDR41') || ratingUpper.includes('SN4') || ratingUpper.includes('SN8') || stdUpper.includes('EN 1401') || rawUpper.includes('SDR41') || rawUpper.includes('SN4') || rawUpper.includes('SN8') || rawUpper.includes('EN 1401') || rawUpper.includes('SEWER') || rawUpper.includes('DRAIN') || rawUpper.includes('DWV')) {
    const p2 = activeArchetypes.find(a => a.id === 'pattern_2_metric_sewer') || activeArchetypes[1] || activeArchetypes[0];
    return {
      archetypeId: p2.id,
      archetypeName: p2.name,
      matchScore: 95,
      badgeLabel: '#2 Sewer (95%)'
    };
  }

  // 5. Metric Pressure (Pattern #1 Default)
  const p1 = activeArchetypes.find(a => a.id === 'pattern_1_metric_pressure') || activeArchetypes[0];
  return {
    archetypeId: p1.id,
    archetypeName: p1.name,
    matchScore: 96,
    badgeLabel: '#1 Metric Pressure (96%)'
  };
}

/**
 * Applies a specific archetype pattern to a staged item, re-synthesizing description
 * @param {Object} item Staged product item
 * @param {Object} archetype Selected archetype pattern
 * @returns {Object} Updated item
 */
export function applyArchetypeToItem(item, archetype) {
  if (!item || !archetype) return item;
  const newCanonical = synthesizeDescription(item, archetype.tokenSequence);
  return {
    ...item,
    canonicalDescription: newCanonical,
    matchedArchetypeId: archetype.id,
    matchedArchetypeName: archetype.name,
    matchedArchetypeBadge: `${archetype.code || archetype.name.split(':')[0]} (Applied)`,
    matchScore: 100,
    actionTaken: `Applied ${archetype.name}`,
    conflictNotes: `Applied Archetype Template: ${archetype.name}`
  };
}

export function buildCanonicalProductName(fields = {}) {
  const productType = fields.productType || 'PVC PIPE';
  const size = fields.sizeDisplay || (fields.odMm ? `${fields.odMm}` : '');
  let wt = '';
  if (fields.wallThicknessMm !== undefined && fields.wallThicknessMm !== null && fields.wallThicknessMm !== '') {
    const num = Number(fields.wallThicknessMm);
    if (!isNaN(num)) {
      const rawStr = String(fields.wallThicknessMm);
      if (!rawStr.includes('.')) {
        wt = `${num.toFixed(1)}mm`;
      } else {
        wt = `${fields.wallThicknessMm}mm`;
      }
    } else {
      wt = `${fields.wallThicknessMm}mm`;
    }
  }
  const rating = fields.ratingClass || '';
  const standard = fields.standard || '';
  const joint = fields.joint || '';
  const length = fields.lengthM !== undefined && fields.lengthM !== null ? `${Number(fields.lengthM).toFixed(1)}M` : '6.0M';

  const parts = [];
  parts.push(productType);

  if (size && wt) {
    parts.push(`${size} x ${wt}`);
  } else if (size) {
    parts.push(size);
  } else if (wt) {
    parts.push(wt);
  }

  if (rating) parts.push(rating);
  if (standard) parts.push(standard);
  if (joint) parts.push(joint);
  if (length) parts.push(length);

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Checks whether factory dimensions deviate from official reference standards (e.g. 5.2mm vs 5.3mm)
 * @param {number|null} odMm Metric OD in mm
 * @param {string} ratingClass Rating (e.g. PN10, SCH40)
 * @param {number|null} factoryWtMm Factory specified wall thickness in mm
 * @param {string} [standard=''] Reference standard name
 * @param {string} [sizeDisplay=''] Size display (e.g. 4")
 * @returns {Object} Variance evaluation
 */
export function checkSpecificationVariance(odMm, ratingClass, factoryWtMm, standard = '', sizeDisplay = '') {
  if (!factoryWtMm) {
    return {
      hasVariance: false,
      officialWt: null,
      factoryWt: null,
      diffMm: 0,
      standardRef: null,
      status: 'clean',
      note: 'No wall thickness specified'
    };
  }

  const isoTable = harmonizerConfig.referenceStandards.ISO_1452.metricDimensions;
  const astmTable = harmonizerConfig.referenceStandards.ASTM_D1785.schedules;

  let officialWt = null;
  let standardRef = null;

  // 1. Check Metric ISO 1452-2 / DIN 8062
  const canonicalLookup = lookupCanonicalSpec(odMm, ratingClass, 'ISO_1452');
  if (canonicalLookup && canonicalLookup.matched) {
    officialWt = canonicalLookup.nominalWtMm;
    standardRef = `${canonicalLookup.standardCode} (${canonicalLookup.rating})`;
  } else {
    const odKey = odMm ? String(Math.round(odMm)) : null;
    const primaryPn = ratingClass ? (ratingClass.match(/PN\s*(\d+(?:\.\d+)?)/i)?.[0]?.toUpperCase() || null) : null;

    if (odKey && primaryPn && isoTable[odKey] && isoTable[odKey][primaryPn] !== undefined) {
      officialWt = isoTable[odKey][primaryPn];
      standardRef = `SASO-ISO 1452-2 (${primaryPn})`;
    }
  }

  // 2. Check ASTM Schedule (SCH40 / SCH80)
  if (officialWt === null && (ratingClass.includes('SCH40') || ratingClass.includes('SCH80'))) {
    const schKey = ratingClass.includes('SCH80') ? 'SCH80' : 'SCH40';
    const inchKey = sizeDisplay && sizeDisplay.includes('"') ? sizeDisplay : null;
    if (inchKey && astmTable[schKey] && astmTable[schKey][inchKey]) {
      officialWt = astmTable[schKey][inchKey].wtMm;
      standardRef = `ASTM D1785 (${schKey})`;
    }
  }

  if (officialWt === null) {
    return {
      hasVariance: false,
      officialWt: null,
      factoryWt: factoryWtMm,
      diffMm: 0,
      standardRef: standard || 'Unlisted Spec',
      status: 'clean',
      note: 'Dimension within standard tolerance or non-cataloged spec'
    };
  }

  const diff = Number((factoryWtMm - officialWt).toFixed(2));
  const hasVariance = Math.abs(diff) >= 0.05; // 0.05mm tolerance threshold

  if (hasVariance) {
    return {
      hasVariance: true,
      officialWt,
      factoryWt: factoryWtMm,
      diffMm: diff,
      standardRef,
      status: 'variance',
      note: `Factory WT (${factoryWtMm}mm) deviates from official ${standardRef} (${officialWt}mm)`
    };
  }

  return {
    hasVariance: false,
    officialWt,
    factoryWt: factoryWtMm,
    diffMm: 0,
    standardRef,
    status: 'clean',
    note: `100% Standard Compliant with ${standardRef}`
  };
}

/**
 * Detects unrecognized or garbage tokens in a raw product description
 * @param {string} rawDesc Messy raw product description
 * @param {Object} [decomposed={}] Optional decomposed fields
 * @returns {Array<string>} Array of unparsed / garbage token strings
 */
export function detectUnparsedTokens(rawDesc = '', decomposed = {}) {
  if (!rawDesc || typeof rawDesc !== 'string') return [];

  let remaining = String(rawDesc);

  // 1. Mask out multi-part standard patterns
  remaining = remaining.replace(/\bSASO[- ]?ISO[- ]?1452(?:-2)?\b/gi, ' ');
  remaining = remaining.replace(/\bISO[- ]?1452(?:-2)?\b/gi, ' ');
  remaining = remaining.replace(/\bDIN[- ]?806[12]\b/gi, ' ');
  remaining = remaining.replace(/\bASTM[- ]?[DF]\d+\b/gi, ' ');
  remaining = remaining.replace(/\bEN[- ]?1401(?:-1)?\b/gi, ' ');
  remaining = remaining.replace(/\bBS[- ]?\d+\b/gi, ' ');
  remaining = remaining.replace(/\bSASO[- ]?14\/15\b/gi, ' ');

  // 2. Metric dimension OD x WT (e.g. 110X5.2MM, 75X3.6, 25 x 1.9, 110 x 5.3mm)
  remaining = remaining.replace(/\b\d+(?:\.\d+)?\s*[xX*]\s*\d+(?:\.\d+)?(?:\s*MM)?\b/gi, ' ');

  // 3. Inch dimensions (e.g. 1/2", 3/4", 1-1/4", 4 INCH, 4", 4 IN)
  remaining = remaining.replace(/\b\d+(?:-\d+\/\d+|\/\d+)?(?:"|''|\s*INCH\b|\s*IN\b)/gi, ' ');

  // 4. Standalone mm or meter (e.g. 160MM, 110 MM, 7.7MM, 6.0M, 6M, 3.0M, 5.8M)
  remaining = remaining.replace(/\b\d+(?:\.\d+)?\s*MM\b/gi, ' ');
  remaining = remaining.replace(/\b\d+(?:\.\d+)?\s*M(?:ETER)?\b/gi, ' ');

  // 5. Ratings, schedules, SDR, Class (e.g. PN10, PN12.5, SCH40, SCH80, SDR41, CL4, CLASS 4, SN4, SN8)
  remaining = remaining.replace(/\bPN\s*[-:]?\s*\d+(?:\.\d+)?\b/gi, ' ');
  remaining = remaining.replace(/\bSCH\s*[-:]?\s*\d+\b/gi, ' ');
  remaining = remaining.replace(/\bSDR\s*[-:]?\s*\d+(?:\.\d+)?\b/gi, ' ');
  remaining = remaining.replace(/\bSN\s*[-:]?\s*\d+\b/gi, ' ');
  remaining = remaining.replace(/\b(?:CLASS|CL)\s*[-:]?\s*[0-9A-Za-z]+\b/gi, ' ');

  // 6. Compound applications & grades
  remaining = remaining.replace(/\bFOR\s+(?:INJECTION|EXTRUSION|FITTINGS|BOTTLES|PROFILE)\b/gi, ' ');
  remaining = remaining.replace(/\bGRADE[- ]?[A-Z0-9]+\b/gi, ' ');
  remaining = remaining.replace(/\bK[- ]?\d+\b/gi, ' ');

  // 7. Joints
  remaining = remaining.replace(/\b(?:R\/R|S\/C|P\/E|RR|SC|PE|RUBBER\s*RING|PUSH[- ]?FIT|SOLVENT\s*CEMENT|PLAIN\s*(?:END|SOCKET)?|GASKET|BELL)\b/gi, ' ');

  // 8. Colors
  remaining = remaining.replace(/\b(?:GREY|GRAY|BLACK|WHITE|ORANGE|BLUE|RED|YELLOW|TERRACOTTA)\b/gi, ' ');

  // 9. Product Types & Core Categories
  remaining = remaining.replace(/\b(?:PVC|UPVC|CPVC|PIPE|PIPES|CONDUIT|DUCT|ELECTRICAL|COMPOUND|DRYBLEND|REGRIND|CRUSH)\b/gi, ' ');

  // 10. Drainage / common technical specs
  remaining = remaining.replace(/\b(?:DWV|DRAIN|DRAINAGE|SEWER|SOIL|WASTE|VENT|PRESSURE|WATER|SUPPLY)\b/gi, ' ');

  // 11. Normalize common separators and punctuation
  remaining = remaining.replace(/[\s,;:()\[\]/\\*+]+/g, ' ');

  // Split into candidate tokens
  const rawTokens = remaining.trim().split(/\s+/).filter(Boolean);

  const garbage = rawTokens.filter(tok => {
    const clean = tok.replace(/^[#?!\-_]+|[#?!\-_]+$/g, '').trim();
    if (!clean) return true; // purely symbols like ??? or #
    if (!isNaN(Number(clean)) && clean.length > 0) return false;
    if (tok.length === 1 && /^[xX\-+*\/]$/.test(tok)) return false;
    return true;
  });

  return Array.from(new Set(garbage));
}

/**
 * Purges specified unparsed garbage tokens from a raw description string
 * @param {string} rawDesc Original raw description
 * @param {Array<string>} tokens Tokens to remove
 * @returns {string} Cleaned raw description
 */
export function purgeGarbageTokens(rawDesc = '', tokens = []) {
  if (!rawDesc) return '';
  let cleaned = String(rawDesc);
  (tokens || []).forEach(tok => {
    if (!tok) return;
    const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`(?:^|\\s|[.,;:])${escaped}(?:\\s|[.,;:]|$)`, 'gi'), ' ');
    cleaned = cleaned.replace(new RegExp(escaped, 'gi'), ' ');
  });
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Harmonizes a catalog item and returns a staging item with variance diagnostic metrics
 * @param {Object} item Raw catalog item
 * @returns {Object} Staged harmonized item
 */
export function harmonizeCatalogItem(item = {}) {
  const itemCode = String(item.itemCode || item.code || item.item_code || '').trim();
  const rawDesc = String(item.description || item.rawDescription || item.productDescription || '').trim();

  const decomposed = parseMessyProductDescription(rawDesc, itemCode, {
    odMm: item.odMm || item.od_mm,
    wallThicknessMm: item.wallThicknessMm || item.wall_thickness_mm
  });

  const unparsedTokens = detectUnparsedTokens(rawDesc, decomposed);
  const hasAnomaly = unparsedTokens.length > 0 || (!decomposed.odMm && !decomposed.sizeDisplay && decomposed.productType !== 'PVC COMPOUND');

  const varianceCheck = checkSpecificationVariance(
    decomposed.odMm,
    decomposed.ratingClass,
    decomposed.wallThicknessMm,
    decomposed.standard,
    decomposed.sizeDisplay
  );

  const activeArchetypes = loadArchetypes();
  const matchedArch = detectMatchedArchetype(decomposed, activeArchetypes);
  const matchedArchObj = activeArchetypes.find(a => a.id === matchedArch.archetypeId);
  const canonicalDescription = matchedArchObj?.tokenSequence
    ? synthesizeDescription(decomposed, matchedArchObj.tokenSequence)
    : buildCanonicalProductName(decomposed);

  // Theoretical Linear Weight (kg/m) based on uPVC density 1.43 g/cm3
  const theoreticalWeightKgM = calculateTheoreticalLinearWeight(
    decomposed.odMm,
    decomposed.wallThicknessMm,
    DEFAULT_PVC_DENSITY_G_CM3
  );

  // Extract factory recorded weight if provided in source data
  const rawFactoryWeight = item.factoryLinearWeightKgM !== undefined && item.factoryLinearWeightKgM !== null
    ? item.factoryLinearWeightKgM
    : (item.linearWeightKgM !== undefined && item.linearWeightKgM !== null
        ? item.linearWeightKgM
        : (item.linear_weight_kg_m !== undefined && item.linear_weight_kg_m !== null
            ? item.linear_weight_kg_m
            : (item.unitWeight6mKg ? Number((item.unitWeight6mKg / 6.0).toFixed(3)) : null)));

  const factoryLinearWeightKgM = (rawFactoryWeight !== null && !isNaN(Number(rawFactoryWeight)))
    ? Number(Number(rawFactoryWeight).toFixed(3))
    : null;

  const weightVariance = calculateWeightVariance(factoryLinearWeightKgM, theoreticalWeightKgM);

  // Derive final effective pipe linear weight
  const linearWeightKgM = theoreticalWeightKgM || factoryLinearWeightKgM || resolvePipeLinearWeight(
    item.linearWeightKgM || item.linear_weight_kg_m || null,
    decomposed.odMm,
    decomposed.wallThicknessMm,
    decomposed.lengthM
  );

  const unitWeight6mKg = linearWeightKgM ? Number((linearWeightKgM * (decomposed.lengthM || 6.0)).toFixed(3)) : null;

  // Determine 3-tier status:
  // 1. Red (anomaly) if unparsed tokens or missing critical size
  // 2. Amber (variance) if dimension deviates from standard
  // 3. Green (clean) if 100% compliant
  let status = 'clean';
  let conflictNotes = varianceCheck.note;
  if (hasAnomaly) {
    status = 'anomaly';
    conflictNotes = unparsedTokens.length > 0
      ? `Anomaly: Unparsed tokens detected [${unparsedTokens.join(', ')}]`
      : 'Anomaly: Critical dimension / size missing or corrupt';
  } else if (varianceCheck.hasVariance) {
    status = 'variance';
  }

  // Preserve any previously resolved status if item is passed through
  if (['overridden', 'snapped', 'custom', 'approved'].includes(item.status)) {
    status = item.status;
  }

  return {
    id: item.id || `harm_${itemCode}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    itemCode,
    rawDescription: rawDesc,
    productType: decomposed.productType,
    odMm: decomposed.odMm,
    sizeDisplay: decomposed.sizeDisplay,
    wallThicknessMm: decomposed.wallThicknessMm,
    officialStandardWtMm: varianceCheck.officialWt,
    ratingClass: decomposed.ratingClass,
    standard: decomposed.standard,
    joint: decomposed.joint,
    lengthM: decomposed.lengthM,
    linearWeightKgM,
    theoreticalWeightKgM,
    factoryLinearWeightKgM,
    weightVariancePercent: weightVariance.percentDelta,
    hasWeightVariance: weightVariance.hasVariance,
    unitWeight6mKg,
    canonicalDescription,
    matchedArchetypeId: matchedArch.archetypeId,
    matchedArchetypeName: matchedArch.archetypeName,
    matchedArchetypeBadge: matchedArch.badgeLabel,
    matchScore: matchedArch.matchScore,
    hasVariance: varianceCheck.hasVariance,
    varianceDiffMm: varianceCheck.diffMm,
    standardRef: varianceCheck.standardRef,
    conflictNotes,
    unparsedTokens,
    hasAnomaly,
    isApproved: item.isApproved || status === 'approved',
    // Source Provenance
    sourceFile: item.sourceFile || item.source_file || 'AlManar_9.xlsb',
    sourceSheet: item.sourceSheet || item.source_sheet || 'Unique Planning',
    sourceRow: item.sourceRow || item.source_row || (item.rowIndex ? `Row #${item.rowIndex}` : 'Row #1'),
    ingestionType: item.ingestionType || item.ingestion_type || 'PLANNING_CATALOG',
    rawImportData: item.rawImportData || item,
    status,
    actionTaken: item.actionTaken || null,
    timestamp: item.timestamp || new Date().toISOString()
  };
}

/**
 * Applies a human resolution action to a staged variance item
 * @param {Object} item Staged item
 * @param {'keep_factory'|'snap_standard'|'custom_edit'} action Resolution action
 * @param {Object} [customData={}] Custom edits if action === 'custom_edit'
 * @returns {Object} Updated staged item
 */
export function applyResolutionAction(item, action, customData = {}) {
  if (!item) return null;
  const updated = { ...item };

  if (action === 'keep_factory') {
    updated.status = 'overridden';
    updated.actionTaken = 'kept_factory';
    updated.conflictNotes = `Commercial Override: Kept Factory ${item.wallThicknessMm}mm (Official: ${item.officialStandardWtMm || 'N/A'}mm)`;
  } else if (action === 'snap_standard') {
    if (item.officialStandardWtMm) {
      updated.wallThicknessMm = item.officialStandardWtMm;
      updated.canonicalDescription = buildCanonicalProductName({
        productType: updated.productType,
        sizeDisplay: updated.sizeDisplay,
        odMm: updated.odMm,
        wallThicknessMm: updated.officialStandardWtMm,
        ratingClass: updated.ratingClass,
        standard: updated.standard,
        joint: updated.joint,
        lengthM: updated.lengthM
      });
      updated.theoreticalWeightKgM = calculateTheoreticalLinearWeight(updated.odMm, updated.wallThicknessMm);
      updated.linearWeightKgM = updated.theoreticalWeightKgM || resolvePipeLinearWeight(
        null,
        updated.odMm,
        updated.wallThicknessMm,
        updated.lengthM
      );
      updated.unitWeight6mKg = updated.linearWeightKgM ? Number((updated.linearWeightKgM * (updated.lengthM || 6.0)).toFixed(3)) : null;
      updated.hasVariance = false;
      updated.varianceDiffMm = 0;
      updated.status = 'snapped';
      updated.actionTaken = 'snapped_standard';
      updated.conflictNotes = `Snapped to Official Standard (${item.officialStandardWtMm}mm)`;
    }
  } else if (action === 'custom_edit') {
    if (customData.productType !== undefined) updated.productType = customData.productType;
    if (customData.sizeDisplay !== undefined) updated.sizeDisplay = customData.sizeDisplay;
    if (customData.odMm !== undefined) updated.odMm = customData.odMm;
    if (customData.wallThicknessMm !== undefined) updated.wallThicknessMm = Number(customData.wallThicknessMm);
    if (customData.ratingClass !== undefined) updated.ratingClass = customData.ratingClass;
    if (customData.standard !== undefined) updated.standard = customData.standard;
    if (customData.joint !== undefined) updated.joint = customData.joint;
    if (customData.lengthM !== undefined) updated.lengthM = Number(customData.lengthM);

    updated.canonicalDescription = buildCanonicalProductName({
      productType: updated.productType,
      sizeDisplay: updated.sizeDisplay,
      odMm: updated.odMm,
      wallThicknessMm: updated.wallThicknessMm,
      ratingClass: updated.ratingClass,
      standard: updated.standard,
      joint: updated.joint,
      lengthM: updated.lengthM
    });
    updated.linearWeightKgM = resolvePipeLinearWeight(
      null,
      updated.odMm,
      updated.wallThicknessMm,
      updated.lengthM
    );
    updated.unitWeight6mKg = updated.linearWeightKgM ? Number((updated.linearWeightKgM * 6.0).toFixed(3)) : null;
    updated.status = 'custom';
    updated.actionTaken = 'custom_edit';
    updated.conflictNotes = `Custom Manual Override: ${customData.customNotes || 'User Defined'}`;
  }

  updated.timestamp = new Date().toISOString();
  return updated;
}

/**
 * Approves a batch of staged items by IDs
 * @param {Array<Object>} stagedItems Full staged items list
 * @param {Array<string>} itemIds List of item IDs to approve
 * @returns {Array<Object>} Updated staged items list
 */
export function approveBatchItems(stagedItems = [], itemIds = []) {
  const idsSet = new Set(itemIds);
  return stagedItems.map(item => {
    if (idsSet.has(item.id)) {
      return {
        ...item,
        isApproved: true,
        status: item.status === 'anomaly' ? 'clean' : (item.status === 'variance' ? 'overridden' : item.status),
        actionTaken: item.actionTaken || 'batch_approved',
        conflictNotes: item.status === 'variance' && !item.actionTaken
          ? 'Approved in Batch Review (Commercial Override)'
          : (item.conflictNotes || 'Approved in Batch Review'),
        timestamp: new Date().toISOString()
      };
    }
    return item;
  });
}

/**
 * Exports staged harmonized items to a pristine 'Clean Spring' Excel workbook (.xlsx)
 * @param {Array<Object>} stagedItems
 * @returns {Object} SheetJS Workbook
 */
export function exportCleanSpringWorkbook(stagedItems = []) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Clean Master Catalog
  const cleanMasterRows = stagedItems.map((item) => ({
    'Item Code': item.itemCode,
    'Clean Standardized Description': item.canonicalDescription,
    'Matched Archetype Pattern': item.matchedArchetypeName || item.matchedArchetypeBadge || 'Pattern #1',
    'OD (mm)': item.odMm || '',
    'Wall Thickness (mm)': item.wallThicknessMm || '',
    'Pressure / Class / SDR': item.ratingClass || '',
    'Standard': item.standard || '',
    'Joint Type': item.joint || '',
    'Length (m)': item.lengthM || 6.0,
    'Linear Weight (kg/m)': item.linearWeightKgM || '',
    'Unit Weight 6m (kg)': item.unitWeight6mKg || '',
    'Governance Status': item.status,
    'Conflict & Reconciliation Notes': item.conflictNotes || ''
  }));

  const wsClean = XLSX.utils.json_to_sheet(cleanMasterRows);
  wsClean['!cols'] = [
    { wch: 16 }, // Item Code
    { wch: 48 }, // Clean Description
    { wch: 12 }, // OD
    { wch: 18 }, // WT
    { wch: 22 }, // Rating
    { wch: 20 }, // Standard
    { wch: 14 }, // Joint
    { wch: 12 }, // Length
    { wch: 18 }, // Linear Wt
    { wch: 18 }, // Unit Wt
    { wch: 18 }, // Status
    { wch: 44 }  // Notes
  ];
  XLSX.utils.book_append_sheet(wb, wsClean, 'Clean Master Catalog');

  // Sheet 2: Harmonizer Audit Trail
  const auditRows = stagedItems.map((item) => ({
    'Item Code': item.itemCode,
    'Original Raw Description': item.rawDescription,
    'Standardized Canonical Name': item.canonicalDescription,
    'Source File': item.sourceFile || 'AlManar_9.xlsb',
    'Source Sheet': item.sourceSheet || 'Unique Planning',
    'Source Row': item.sourceRow || 'Row #1',
    'Ingestion Type': item.ingestionType || 'PLANNING_CATALOG',
    'Unparsed Tokens': item.unparsedTokens?.join(', ') || 'None',
    'Factory WT (mm)': item.wallThicknessMm,
    'Official Standard WT (mm)': item.officialStandardWtMm || 'N/A',
    'Variance Delta (mm)': item.varianceDiffMm || 0,
    'Action Taken': item.actionTaken || 'None',
    'Status': item.status,
    'Timestamp': item.timestamp
  }));

  const wsAudit = XLSX.utils.json_to_sheet(auditRows);
  wsAudit['!cols'] = [
    { wch: 16 },
    { wch: 46 },
    { wch: 48 },
    { wch: 20 },
    { wch: 20 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 22 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 26 }
  ];
  XLSX.utils.book_append_sheet(wb, wsAudit, 'Harmonizer Audit Trail');

  return wb;
}

/**
 * Promotes harmonized staged items to active master catalog
 * Strictly overwrites/updates active product registry and emits update event
 * @param {Array<Object>} stagedItems
 * @returns {Object} Promotion summary
 */
export function promoteToMasterCatalog(stagedItems = []) {
  if (!Array.isArray(stagedItems) || stagedItems.length === 0) {
    return { success: false, count: 0, message: 'No staged items to promote' };
  }

  const productsToUpsert = stagedItems.map((item) => ({
    code: item.itemCode,
    itemCode: item.itemCode,
    description: item.canonicalDescription,
    productDescription: item.canonicalDescription,
    odMm: item.odMm,
    wallThickness: item.wallThicknessMm ? `${item.wallThicknessMm}mm` : '',
    wallThicknessMm: item.wallThicknessMm,
    sdr: item.ratingClass,
    linearWeightKgM: item.linearWeightKgM,
    unitWeight6mKg: item.unitWeight6mKg,
    source_origin: 'harmonizer',
    source_file: 'Catalog Harmonizer Lab',
    source_sheet: 'Clean Master Catalog',
    provenance_tag: 'Harmonized Master Catalog',
    notes: item.conflictNotes
  }));

  const upsertResult = upsertBatchProducts(productsToUpsert, {
    source: 'Harmonized Master Catalog',
    syncServer: true
  });

  return {
    success: true,
    count: productsToUpsert.length,
    newProductsCount: upsertResult.newProductsCount,
    refreshedSpecsCount: upsertResult.refreshedSpecsCount,
    message: `Successfully promoted ${productsToUpsert.length} harmonized products to Master Catalog`
  };
}

/**
 * Formats a single catalog item analysis into structured Markdown text
 * @param {Object} item Staged catalog item
 * @returns {string} Clean Markdown formatted string
 */
export function formatItemAnalysisMarkdown(item = {}) {
  if (!item) return '';
  const lines = [];

  const code = item.itemCode || 'UNKNOWN';
  lines.push(`### 🔍 Product Analysis: \`${code}\``);
  lines.push(`- **Item Code**: \`${code}\``);

  // Provenance
  const file = item.sourceFile || 'AlManar_9.xlsb';
  const sheet = item.sourceSheet || 'Unique Planning';
  const row = item.sourceRow || 'Row #1';
  const type = item.ingestionType || 'PLANNING_CATALOG';
  lines.push(`- **Source Origin**: \`${file}\` • Sheet: \`${sheet}\` • \`${row}\` (\`${type}\`)`);

  // Descriptions
  lines.push(`- **Original Raw Description**: \`${item.rawDescription || '-'}\``);
  lines.push(`- **Standardized Clean Description**: \`${item.canonicalDescription || '-'}\``);

  // Extracted Tokens
  lines.push(`- **Extracted Engineering Tokens**:`);
  lines.push(`  - Product Type: \`${item.productType || 'PVC PIPE'}\``);
  lines.push(`  - Outer Diameter (OD): \`${item.sizeDisplay || (item.odMm ? `${item.odMm}mm` : '-')}\``);
  lines.push(`  - Wall Thickness (WT): \`${item.wallThicknessMm ? `${item.wallThicknessMm}mm` : '-'}\``);
  lines.push(`  - Rating / SDR: \`${item.ratingClass || '-'}\``);
  lines.push(`  - Reference Standard: \`${item.standard || '-'}\``);
  lines.push(`  - Joint Type: \`${item.joint || '-'}\``);
  const lenStr = item.lengthM !== undefined && item.lengthM !== null ? `${Number(item.lengthM).toFixed(1)}M` : '6.0M';
  lines.push(`  - Length: \`${lenStr}\``);

  // Archetype
  const archName = item.matchedArchetypeName || item.matchedArchetypeBadge || 'Pattern #1: Metric Pressure';
  const score = item.matchScore ? ` (${item.matchScore}% Match)` : '';
  lines.push(`- **Matched Archetype**: ${archName}${score}`);

  // Linear Weight & Benchmark
  const theoWtStr = item.theoreticalWeightKgM ? `${item.theoreticalWeightKgM} kg/m` : '-';
  const factWtStr = item.factoryLinearWeightKgM ? `${item.factoryLinearWeightKgM} kg/m` : '-';
  lines.push(`- **Linear Weight Benchmark (uPVC 1.43 g/cm³)**:`);
  lines.push(`  - Theoretical Nominal Weight: \`${theoWtStr}\``);
  lines.push(`  - Factory / Log Recorded Weight: \`${factWtStr}\``);
  if (item.hasWeightVariance) {
    lines.push(`  - ⚠️ Weight Variance (Δ Weight %): \`${item.weightVariancePercent > 0 ? '+' : ''}${item.weightVariancePercent}%\``);
  } else if (item.theoreticalWeightKgM && item.factoryLinearWeightKgM) {
    lines.push(`  - Weight Variance (Δ Weight %): \`0.0% (Within Tolerance)\``);
  }

  // Governance Status & Diagnostic Flags
  let statusBadge = item.status || 'clean';
  if (item.status === 'anomaly' || item.hasAnomaly) {
    statusBadge = `🔴 Syntax Anomaly / Garbage Tokens`;
  } else if (item.status === 'variance') {
    statusBadge = `🟡 Specification Variance`;
  } else if (item.status === 'clean') {
    statusBadge = `🟢 Standard Matched`;
  } else if (item.status === 'overridden') {
    statusBadge = `🔵 Commercial Override`;
  } else if (item.status === 'snapped') {
    statusBadge = `🟢 Snapped to Official Standard`;
  } else if (item.status === 'approved') {
    statusBadge = `✅ Batch Approved`;
  }
  lines.push(`- **Governance Status**: ${statusBadge}`);

  if (item.hasVariance || item.varianceDiffMm) {
    lines.push(`  - Variance Delta: \`${item.varianceDiffMm > 0 ? '+' : ''}${item.varianceDiffMm}mm\` (Factory: \`${item.wallThicknessMm}mm\` vs Official Standard: \`${item.officialStandardWtMm || 'N/A'}mm\`)`);
  }

  if (item.unparsedTokens && item.unparsedTokens.length > 0) {
    lines.push(`  - Unparsed Tokens: \`[${item.unparsedTokens.map(t => `"${t}"`).join(', ')}]\``);
  }

  if (item.conflictNotes) {
    lines.push(`- **Diagnostic Notes**: ${item.conflictNotes}`);
  }

  return lines.join('\n');
}

/**
 * Formats a batch of staged items into a structured Markdown summary report
 * @param {Array<Object>} batchItems List of items in current batch (up to 10)
 * @param {Object} [meta={}] Metadata (batchIndex, totalBatches, totalQueueCount)
 * @returns {string} Clean Markdown batch summary
 */
export function formatBatchSummaryMarkdown(batchItems = [], meta = {}) {
  if (!Array.isArray(batchItems) || batchItems.length === 0) return 'No items in active batch.';
  const lines = [];

  const batchNum = (meta.batchIndex !== undefined ? meta.batchIndex : 0) + 1;
  const totalBatches = meta.totalBatches || 1;
  const remaining = meta.totalQueueCount !== undefined ? meta.totalQueueCount : batchItems.length;
  const timestamp = meta.timestamp || new Date().toISOString().replace('T', ' ').split('.')[0];

  lines.push(`## 📋 Catalog Harmonizer Lab - Batch #${batchNum} of ${totalBatches} Analysis Summary`);
  lines.push(`- **Batch Index**: Batch ${batchNum} of ${totalBatches}`);
  lines.push(`- **Items in Active Batch**: ${batchItems.length}`);
  lines.push(`- **Items Remaining in Review Queue**: ${remaining}`);
  lines.push(`- **Generated Timestamp**: ${timestamp}`);
  lines.push('');

  // Markdown Summary Table
  lines.push(`| # | Item Code | Source Origin | Raw Description | Standardized Canonical Description | Status | Flags & Diagnostic Notes |`);
  lines.push(`|---|---|---|---|---|---|---|`);

  batchItems.forEach((item, idx) => {
    const num = idx + 1;
    const code = item.itemCode || '-';
    const origin = `${item.sourceFile || 'AlManar_9.xlsb'} (${item.sourceRow || 'Row #1'})`;
    const raw = (item.rawDescription || '-').replace(/\|/g, '\\|');
    const canon = (item.canonicalDescription || '-').replace(/\|/g, '\\|');

    let status = item.status;
    if (item.status === 'anomaly' || item.hasAnomaly) status = '🔴 Anomaly';
    else if (item.status === 'variance') status = '🟡 Variance';
    else if (item.status === 'clean') status = '🟢 Clean';
    else if (item.status === 'overridden') status = '🔵 Override';
    else if (item.status === 'snapped') status = '🟢 Snapped';
    else if (item.status === 'approved') status = '✅ Approved';

    let notes = item.conflictNotes || '-';
    if (item.unparsedTokens && item.unparsedTokens.length > 0) {
      notes = `Unparsed: [${item.unparsedTokens.join(', ')}]`;
    } else if (item.hasVariance && item.varianceDiffMm) {
      notes = `Delta: ${item.varianceDiffMm > 0 ? '+' : ''}${item.varianceDiffMm}mm (Std: ${item.officialStandardWtMm}mm)`;
    }
    if (item.theoreticalWeightKgM) {
      notes += ` | Theo Wt: ${item.theoreticalWeightKgM} kg/m`;
    }
    if (item.hasWeightVariance) {
      notes += ` (Δ Wt: ${item.weightVariancePercent}%)`;
    }
    notes = notes.replace(/\|/g, '\\|');

    lines.push(`| ${num} | \`${code}\` | ${origin} | ${raw} | **${canon}** | ${status} | ${notes} |`);
  });

  lines.push('');
  lines.push(`### 📝 Itemized Technical Specifications:`);
  batchItems.forEach((item, idx) => {
    lines.push(`${idx + 1}. **${item.itemCode || 'UNKNOWN'}**`);
    lines.push(`   - Raw: \`${item.rawDescription || '-'}\``);
    lines.push(`   - Clean: \`${item.canonicalDescription || '-'}\``);
    lines.push(`   - Specs: OD \`${item.sizeDisplay || (item.odMm ? `${item.odMm}mm` : '-')}\` | WT \`${item.wallThicknessMm || '-'}mm\` | Rating \`${item.ratingClass || '-'}\` | Std \`${item.standard || '-'}\` | Joint \`${item.joint || '-'}\` | Length \`${item.lengthM ? `${item.lengthM}M` : '6.0M'}\``);
    lines.push(`   - Benchmark: Theo Linear Wt \`${item.theoreticalWeightKgM ? `${item.theoreticalWeightKgM} kg/m` : '-'}\` | Factory \`${item.factoryLinearWeightKgM ? `${item.factoryLinearWeightKgM} kg/m` : '-'}\`${item.hasWeightVariance ? ` | ⚠️ Δ Weight: \`${item.weightVariancePercent}%\`` : ''}`);
    lines.push(`   - Origin: \`${item.sourceFile || 'AlManar_9.xlsb'}\` • \`${item.sourceSheet || 'Unique Planning'}\` • \`${item.sourceRow || 'Row #1'}\``);
    if (item.unparsedTokens && item.unparsedTokens.length > 0) {
      lines.push(`   - ⚠️ **Unparsed Tokens**: \`[${item.unparsedTokens.join(', ')}]\``);
    }
    if (item.hasVariance) {
      lines.push(`   - ⚠️ **Specification Variance**: Factory \`${item.wallThicknessMm}mm\` vs Standard \`${item.officialStandardWtMm}mm\` (Delta: \`${item.varianceDiffMm}mm\`)`);
    }
  });

  return lines.join('\n');
}

/**
 * Copies text to system clipboard with fallback support
 * @param {string} text Text to copy
 * @returns {Promise<boolean>} True if succeeded
 */
export async function copyToClipboard(text) {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fall through to fallback
    }
  }
  try {
    if (typeof document !== 'undefined') {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    }
  } catch (err) {
    console.error('Clipboard copy failed:', err);
  }
  return false;
}
