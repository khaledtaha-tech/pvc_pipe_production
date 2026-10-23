/**
 * Canonical Standards Engine
 * Single Source of Truth for Official Pipe Standards & Pristine Catalog Minting
 */

import canonicalStandardsData from '../data/canonicalStandards.json' with { type: 'json' };

export const DEFAULT_PVC_DENSITY_G_CM3 = 1.43;

/**
 * Returns all registered standard tables
 * @returns {Array<Object>} List of standard configurations
 */
export function getRegisteredStandards() {
  return canonicalStandardsData.standards || [];
}

/**
 * Retrieve standard definition by ID
 * @param {string} standardId ID (e.g. 'ISO_1452', 'DIN_8062', 'ASTM_D1785')
 * @returns {Object|null}
 */
export function getStandardById(standardId = 'ISO_1452') {
  const standards = getRegisteredStandards();
  return standards.find(s => s.id === standardId || s.code === standardId) || null;
}

/**
 * Calculate theoretical linear weight (kg/m) based on pipe geometry and uPVC density
 * Formula: Linear Weight (kg/m) = PI * (OD - WT) * WT * (Density / 1000)
 * 
 * @param {number|string} odMm Outer diameter in mm
 * @param {number|string} wtMm Wall thickness in mm
 * @param {number} [densityGPerCm3=1.43] uPVC density (default 1.43 g/cm3)
 * @returns {number|null} Theoretical weight in kg/m rounded to 3 decimal places
 */
export function calculateTheoreticalLinearWeight(odMm, wtMm, densityGPerCm3 = DEFAULT_PVC_DENSITY_G_CM3) {
  const od = parseFloat(odMm);
  const wt = parseFloat(wtMm);
  const density = parseFloat(densityGPerCm3) || DEFAULT_PVC_DENSITY_G_CM3;

  if (isNaN(od) || isNaN(wt) || od <= 0 || wt <= 0 || wt >= od) {
    return null;
  }

  // Cross-sectional Area in mm2 = PI * (OD - WT) * WT
  // Volume per meter (1000mm) = Area * 1000 mm3 = Area cm3
  // Mass per meter = Area * Density grams = Area * Density / 1000 kg
  const weightKgM = Math.PI * (od - wt) * wt * (density / 1000);
  return Number(weightKgM.toFixed(3));
}

/**
 * Calculates weight variance metrics between factory/recorded weight and theoretical benchmark
 * @param {number|string|null} factoryWeightKgM Recorded factory weight in kg/m
 * @param {number|string|null} theoreticalWeightKgM Benchmark theoretical weight in kg/m
 * @returns {Object} { diffKgM, percentDelta, hasVariance, warningLevel }
 */
export function calculateWeightVariance(factoryWeightKgM, theoreticalWeightKgM) {
  const fW = parseFloat(factoryWeightKgM);
  const tW = parseFloat(theoreticalWeightKgM);

  if (isNaN(fW) || isNaN(tW) || tW <= 0) {
    return {
      factoryWeightKgM: !isNaN(fW) ? Number(fW.toFixed(3)) : null,
      theoreticalWeightKgM: !isNaN(tW) ? Number(tW.toFixed(3)) : null,
      diffKgM: 0,
      percentDelta: 0,
      hasVariance: false,
      warningLevel: 'none',
      statusText: 'No Weight Benchmark Available'
    };
  }

  const diffKgM = Number((fW - tW).toFixed(3));
  const percentDelta = Number((((fW - tW) / tW) * 100).toFixed(1));
  const absDelta = Math.abs(percentDelta);

  let warningLevel = 'none';
  let statusText = 'Normal Factory Tolerance (<= 3%)';

  if (absDelta > 10.0) {
    warningLevel = 'critical'; // > 10% discrepancy indicates incorrect thickness or wrong density
    statusText = `Severe Weight Discrepancy (${percentDelta > 0 ? '+' : ''}${percentDelta}%)`;
  } else if (absDelta > 3.0) {
    warningLevel = 'warning'; // 3-10% commercial variance
    statusText = `Weight Variance (${percentDelta > 0 ? '+' : ''}${percentDelta}%)`;
  }

  return {
    factoryWeightKgM: Number(fW.toFixed(3)),
    theoreticalWeightKgM: Number(tW.toFixed(3)),
    diffKgM,
    percentDelta,
    hasVariance: absDelta > 3.0,
    warningLevel,
    statusText
  };
}

/**
 * Normalizes PN rating string (e.g. 'pn 10', 'PN-10', 'PN10') to canonical 'PN10'
 * @param {string} rating
 * @returns {string|null}
 */
export function normalizeRatingKey(rating = '') {
  if (!rating) return null;
  const match = String(rating).match(/PN\s*[-:]?\s*(\d+(?:\.\d+)?)/i);
  if (match) return `PN${match[1]}`;
  const schMatch = String(rating).match(/SCH\s*[-:]?\s*(\d+)/i);
  if (schMatch) return `SCH${schMatch[1]}`;
  return String(rating).trim().toUpperCase();
}

/**
 * Looks up official nominal specification in canonical standard table
 * @param {number|string} odMm Metric OD in mm
 * @param {string} ratingClass Pressure rating (e.g. PN6, PN10, PN16, SCH40)
 * @param {string} [standardId='ISO_1452'] Target standard table ID
 * @returns {Object} Lookup result
 */
export function lookupCanonicalSpec(odMm, ratingClass, standardId = 'ISO_1452') {
  const std = getStandardById(standardId);
  if (!std || !Array.isArray(std.tables)) {
    return { matched: false, reason: 'Standard table not found' };
  }

  const targetOd = Math.round(parseFloat(odMm));
  if (isNaN(targetOd)) {
    return { matched: false, reason: 'Invalid OD' };
  }

  const tableEntry = std.tables.find(t => Math.round(t.odMm) === targetOd);
  if (!tableEntry || !tableEntry.ratings) {
    return { matched: false, reason: `OD ${targetOd} not listed in ${std.code}` };
  }

  const normRating = normalizeRatingKey(ratingClass);
  const spec = normRating ? tableEntry.ratings[normRating] : null;

  if (!spec) {
    const availableRatings = Object.keys(tableEntry.ratings).join(', ');
    return {
      matched: false,
      reason: `Rating ${ratingClass} not found for OD ${targetOd} (Available: ${availableRatings})`,
      availableRatings: Object.keys(tableEntry.ratings)
    };
  }

  return {
    matched: true,
    standardId: std.id,
    standardCode: std.code,
    standardName: std.name,
    odMm: targetOd,
    rating: normRating,
    nominalWtMm: spec.nominalWtMm,
    sdr: spec.sdr || `SDR ${Number((targetOd / spec.nominalWtMm).toFixed(1))}`,
    theoreticalLinearWeightKgM: spec.theoreticalLinearWeightKgM,
    unitWeight6mKg: spec.unitWeight6mKg,
    defaultLengthM: std.defaultLengthM || 6.0,
    defaultJoint: std.defaultJoint || 'R/R'
  };
}

/**
 * Synthesizes a clean canonical description for a standard item
 * @param {Object} spec Spec parameters
 * @returns {string}
 */
export function formatCanonicalStandardDescription({
  productType = 'PVC PIPE',
  odMm = 110,
  nominalWtMm = 5.3,
  rating = 'PN10',
  standardCode = 'SASO-ISO 1452-2',
  joint = 'R/R',
  lengthM = 6.0
} = {}) {
  const wtStr = Number(nominalWtMm).toFixed(1).replace(/\.0$/, '');
  const lenStr = Number(lengthM).toFixed(1) + 'M';
  return `${productType} ${odMm} x ${wtStr}mm ${rating} ${standardCode} ${joint} ${lenStr}`.replace(/\s+/g, ' ').trim();
}

/**
 * Mints a pristine canonical catalog item directly from official standard table
 * @param {Object} params Parameters
 * @returns {Object} Staged canonical item ready for sandbox
 */
export function mintCanonicalRecord({
  standardId = 'ISO_1452',
  odMm = 110,
  rating = 'PN10',
  joint = null,
  lengthM = null,
  itemCode = null,
  productType = 'PVC PIPE'
} = {}) {
  const std = getStandardById(standardId);
  if (!std) {
    throw new Error(`Standard '${standardId}' is not registered`);
  }

  const specLookup = lookupCanonicalSpec(odMm, rating, standardId);
  if (!specLookup.matched) {
    throw new Error(`Cannot mint spec: ${specLookup.reason}`);
  }

  const finalJoint = joint || specLookup.defaultJoint;
  const finalLengthM = lengthM ? Number(lengthM) : specLookup.defaultLengthM;
  const finalCode = itemCode || `PIP-ISO-${odMm}-${specLookup.rating}`;

  const canonicalDescription = formatCanonicalStandardDescription({
    productType,
    odMm: specLookup.odMm,
    nominalWtMm: specLookup.nominalWtMm,
    rating: specLookup.rating,
    standardCode: std.code,
    joint: finalJoint,
    lengthM: finalLengthM
  });

  const unitWeight = Number((specLookup.theoreticalLinearWeightKgM * finalLengthM).toFixed(3));

  return {
    id: `mint_${std.id}_${odMm}_${specLookup.rating}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    itemCode: finalCode,
    rawDescription: `[CANONICAL STANDARD MINT] ${canonicalDescription}`,
    productType,
    odMm: specLookup.odMm,
    sizeDisplay: `${specLookup.odMm}`,
    wallThicknessMm: specLookup.nominalWtMm,
    officialStandardWtMm: specLookup.nominalWtMm,
    ratingClass: specLookup.rating,
    standard: std.code,
    joint: finalJoint,
    lengthM: finalLengthM,
    linearWeightKgM: specLookup.theoreticalLinearWeightKgM,
    theoreticalWeightKgM: specLookup.theoreticalLinearWeightKgM,
    factoryLinearWeightKgM: null,
    weightVariancePercent: 0,
    hasWeightVariance: false,
    unitWeight6mKg: unitWeight,
    canonicalDescription,
    matchedArchetypeId: 'pattern_1_metric_pressure',
    matchedArchetypeName: 'Pattern #1: Metric Pressure (Default)',
    matchedArchetypeBadge: 'Pristine Standard',
    matchScore: 100,
    hasVariance: false,
    varianceDiffMm: 0,
    standardRef: std.name,
    conflictNotes: `Pristine Canonical Record minted directly from ${std.name} (${std.code})`,
    unparsedTokens: [],
    hasAnomaly: false,
    isApproved: true,
    sourceFile: 'Canonical Standards Registry',
    sourceSheet: std.code,
    sourceRow: `OD ${specLookup.odMm} ${specLookup.rating}`,
    ingestionType: 'CANONICAL_MINT',
    rawImportData: { standardId: std.id, odMm, rating: specLookup.rating, ...specLookup },
    status: 'clean',
    actionTaken: 'canonical_mint',
    timestamp: new Date().toISOString()
  };
}

/**
 * Mints an entire matrix of standard records (e.g. all ratings for OD 63 to 200mm)
 * @param {string} [standardId='ISO_1452']
 * @param {Object} [options={}] Optional overrides (joint, lengthM)
 * @returns {Array<Object>} List of minted canonical items
 */
export function mintAllStandardRecords(standardId = 'ISO_1452', options = {}) {
  const std = getStandardById(standardId);
  if (!std || !Array.isArray(std.tables)) return [];

  const mintedList = [];
  std.tables.forEach(tableEntry => {
    const od = tableEntry.odMm;
    const ratings = Object.keys(tableEntry.ratings || {});
    ratings.forEach(pn => {
      try {
        const item = mintCanonicalRecord({
          standardId: std.id,
          odMm: od,
          rating: pn,
          joint: options.joint,
          lengthM: options.lengthM,
          productType: options.productType || 'PVC PIPE'
        });
        mintedList.push(item);
      } catch (err) {
        console.warn(`Failed to mint ${od} ${pn}:`, err);
      }
    });
  });

  return mintedList;
}

/**
 * Evaluates and returns deep engineering diagnostic advice for a staged item
 * @param {Object} item Staged catalog item
 * @returns {Object} Diagnostic assessment
 */
export function diagnoseCatalogItem(item = {}) {
  if (!item) return { isReady: false, advice: 'No item provided' };

  const od = item.odMm;
  const rating = item.ratingClass;
  const factoryWt = item.wallThicknessMm;
  const factoryWeight = item.factoryLinearWeightKgM || item.linearWeightKgM;

  const stdLookup = od && rating ? lookupCanonicalSpec(od, rating, 'ISO_1452') : { matched: false };
  const theoWeight = calculateTheoreticalLinearWeight(od, factoryWt);
  const weightVar = calculateWeightVariance(factoryWeight, theoWeight);

  const advicePoints = [];
  let recommendation = 'Standard Compliant';
  let badgeColor = 'emerald';

  // 1. Check Unparsed Tokens / Anomaly
  if (item.unparsedTokens && item.unparsedTokens.length > 0) {
    advicePoints.push(`Contains ${item.unparsedTokens.length} unparsed garbage token(s): [${item.unparsedTokens.join(', ')}]. Recommended action: Purge tokens to restore syntax.`);
    recommendation = 'Purge Garbage Tokens';
    badgeColor = 'rose';
  }

  // 2. Check Standard Compliance & Variance
  if (stdLookup.matched) {
    const diff = Number((factoryWt - stdLookup.nominalWtMm).toFixed(2));
    if (Math.abs(diff) >= 0.05) {
      advicePoints.push(`Factory Wall Thickness (${factoryWt}mm) deviates from official ${stdLookup.standardCode} nominal standard (${stdLookup.nominalWtMm}mm) by ${diff > 0 ? '+' : ''}${diff}mm.`);
      advicePoints.push(`Recommendation: Use 'Snap to Standard' for public tenders / SASO conformity, or 'Keep Factory' if representing a verified commercial tolerance.`);
      if (recommendation !== 'Purge Garbage Tokens') {
        recommendation = 'Resolve Specification Variance';
        badgeColor = 'amber';
      }
    } else {
      advicePoints.push(`Dimensions (OD ${od}mm, WT ${factoryWt}mm, ${rating}) are 100% compliant with ${stdLookup.standardCode}.`);
    }
  } else {
    advicePoints.push(`No exact metric match in ISO 1452-2 standard table for OD ${od || 'N/A'}mm / Rating ${rating || 'N/A'}. Verify against ASTM or custom line profiles.`);
  }

  // 3. Check Physical Linear Weight Benchmark
  if (theoWeight) {
    advicePoints.push(`Theoretical Linear Weight benchmark: ${theoWeight} kg/m (uPVC density 1.43 g/cm3).`);
    if (weightVar.hasVariance) {
      advicePoints.push(`Recorded weight (${weightVar.factoryWeightKgM} kg/m) deviates from theoretical (${theoWeight} kg/m) by ${weightVar.percentDelta}%. Check wall thickness calibration.`);
    }
  }

  return {
    isStandardMatched: stdLookup.matched,
    standardSpec: stdLookup.matched ? stdLookup : null,
    theoreticalLinearWeightKgM: theoWeight,
    weightVariance: weightVar,
    advicePoints,
    recommendation,
    badgeColor
  };
}
