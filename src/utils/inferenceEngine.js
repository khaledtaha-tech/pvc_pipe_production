// Historical Production Inference & Production Planning Engine
import * as XLSX from 'xlsx';
import { 
  MASTER_MACHINE_PROFILES, 
  CANONICAL_PIPE_EXTRUDERS,
  ASTM_IMPERIAL_OD_MAP, 
  parseDiameterToMm, 
  findMasterMachineProfile,
  canonicalizeMachineName,
  isUnknownMachine,
  isMachineEligibleForDiameter
} from './masterProfiles.js';
import { 
  parseProductSpecs, 
  parseNumber, 
  normalizeDate, 
  matchColumns, 
  standardizeMaterial,
  isValidPipeOrConduitProduct
} from './dataCleaner.js';

/**
 * Evaluates candidates and infers primary machine + 2 alternatives for a single run
 */
export function inferMachineForRun(run, masterProfiles = MASTER_MACHINE_PROFILES) {
  const diameterStr = run.diameter || '';
  const diameterMm = run.diameterMm !== undefined && run.diameterMm !== null
    ? run.diameterMm
    : parseDiameterToMm(diameterStr);

  const operatingHours = parseNumber(run.operatingHours, 24) || 24;
  const totalWeight = parseNumber(run.totalWeight, 0);
  const actualRate = operatingHours > 0 ? Math.round((totalWeight / operatingHours) * 10) / 10 : 0;

  // 1. Filter candidates by physical diameter range envelope
  const eligibleCandidates = masterProfiles.filter(profile => {
    // Strictly exclude compounding and pelletizing lines (Bausano and KTS 550) from pipe extrusion candidates
    if (profile.isPelletizingLine || profile.id === 'BAUSANO' || profile.id === 'KTS-550') return false;

    // Strictly enforce calibrated physical machine envelope: [minDiameter <= OD <= maxDiameter]
    if (profile.minDiameter !== null && profile.maxDiameter !== null) {
      if (diameterMm === null || diameterMm === undefined || isNaN(diameterMm)) return false;
      return diameterMm >= profile.minDiameter && diameterMm <= profile.maxDiameter;
    }

    // Broad unconstrained pipe line (none exist in standard plant profile)
    return false;
  });

  // 2. Score candidates by theoretical loading ratio: (Actual kg/hr / Nominal kg/h) * 100
  const scored = eligibleCandidates.map(profile => {
    const nominal = profile.nominalCapacity || 300;
    const loadingRatio = actualRate > 0 ? Math.round((actualRate / nominal) * 1000) / 10 : 0;
    
    // Ideal envelope: typically 65% - 95%
    const isInsideEnvelope = loadingRatio >= 65 && loadingRatio <= 95;
    
    // Sweet spot distance from 80%
    const sweetSpotDistance = Math.abs(loadingRatio - 80);

    // Prefer range-constrained specialized extruders over generic unconstrained lines
    const isSpecialized = profile.minDiameter !== null && profile.maxDiameter !== null;
    const specializationBonus = isSpecialized ? 5 : 0;

    let rankScore = 0;
    if (isInsideEnvelope) {
      rankScore = 100 - sweetSpotDistance + specializationBonus;
    } else if (loadingRatio > 0 && loadingRatio < 65) {
      // Derated load
      rankScore = 50 - (65 - loadingRatio);
    } else if (loadingRatio > 95 && loadingRatio <= 110) {
      // Slightly heavy load
      rankScore = 40 - (loadingRatio - 95);
    } else {
      // Overload or extreme underload
      rankScore = Math.max(0, 20 - Math.abs(loadingRatio - 80) * 0.5);
    }

    const envelopeText = profile.minDiameter !== null 
      ? `${profile.minDiameter} - ${profile.maxDiameter} mm` 
      : 'Broad Envelope';

    return {
      profile,
      machineName: profile.name,
      nominalCapacity: nominal,
      loadingRatio,
      isInsideEnvelope,
      envelopeText,
      rankScore
    };
  });

  // Sort by ranking score descending
  scored.sort((a, b) => b.rankScore - a.rankScore);

  const primary = scored[0] || null;
  const alt1 = scored[1] || null;
  const alt2 = scored[2] || null;

  const targetMin = primary ? Math.round(primary.nominalCapacity * 0.65) : null;
  const targetMax = primary ? Math.round(primary.nominalCapacity * 0.95) : null;
  const targetRateBand = primary ? `${targetMin} - ${targetMax} kg/hr` : '-';

  let inferenceConfidence = 'High Confidence (In-Spec 65-95%)';
  if (!primary || !primary.isInsideEnvelope) {
    if (primary && primary.loadingRatio > 95) {
      inferenceConfidence = 'Derated / Heavy Load Allocation';
    } else if (primary && primary.loadingRatio > 0) {
      inferenceConfidence = 'Low Load / Feasible Envelope';
    } else if (primary) {
      inferenceConfidence = 'Unconstrained Fallback';
    } else {
      inferenceConfidence = 'No Physically Compatible Line';
    }
  }

  const alt1Min = alt1 ? Math.round(alt1.nominalCapacity * 0.65) : null;
  const alt1Max = alt1 ? Math.round(alt1.nominalCapacity * 0.95) : null;
  const alt1RateBand = alt1 ? `${alt1Min} - ${alt1Max} kg/hr` : '-';

  const alt2Min = alt2 ? Math.round(alt2.nominalCapacity * 0.65) : null;
  const alt2Max = alt2 ? Math.round(alt2.nominalCapacity * 0.95) : null;
  const alt2RateBand = alt2 ? `${alt2Min} - ${alt2Max} kg/hr` : '-';

  return {
    diameterMm,
    actualRate,
    primaryMachine: primary ? primary.machineName : '-',
    primaryNominalCapacity: primary ? primary.nominalCapacity : null,
    primaryLoadingRatio: primary ? primary.loadingRatio : null,
    primaryEnvelopeText: primary ? primary.envelopeText : '-',
    alternative1: alt1 ? alt1.machineName : '-',
    alternative1Capacity: alt1 ? alt1.nominalCapacity : null,
    alternative1LoadingRatio: alt1 ? alt1.loadingRatio : null,
    alternative2: alt2 ? alt2.machineName : '-',
    alternative2Capacity: alt2 ? alt2.nominalCapacity : null,
    alternative2LoadingRatio: alt2 ? alt2.loadingRatio : null,
    targetRateBand,
    expectedRateBand1: targetRateBand,
    expectedRateBand2: alt1RateBand,
    expectedRateBand3: alt2RateBand,
    inferenceConfidence,
    eligibleCandidatesCount: scored.length,
    allCandidates: scored
  };
}

/**
 * Processes and enriches raw historical ERP dataset
 */
export function processHistoricalErpData(rawHistoricalRows, masterProfiles = MASTER_MACHINE_PROFILES) {
  if (!rawHistoricalRows || !Array.isArray(rawHistoricalRows) || rawHistoricalRows.length === 0) {
    return {
      inferredRows: [],
      summary: {
        totalHistoricalRuns: 0,
        totalWeightKg: 0,
        uniqueProfilesCount: 0,
        avgLoadingRatio: 0,
        machineAllocations: {},
        dateRange: { start: '', end: '' }
      }
    };
  }

  let totalWeightAcc = 0;
  let totalLoadingAcc = 0;
  let validLoadingCount = 0;
  const dates = [];
  const machineCounts = {};
  const uniqueProfilesSet = new Set();

  const sampleRow = rawHistoricalRows.find(r => r && typeof r === 'object' && Object.keys(r).length > 0) || rawHistoricalRows[0] || {};
  const colMap = matchColumns(sampleRow);

  const inferredRows = rawHistoricalRows.map((raw, idx) => {
    const getVal = (field, fallbacks = []) => {
      if (colMap[field] && raw[colMap[field]] !== undefined && raw[colMap[field]] !== '') {
        return raw[colMap[field]];
      }
      for (const fb of fallbacks) {
        if (raw[fb] !== undefined && raw[fb] !== '') return raw[fb];
      }
      return '';
    };

    const rawDesc = getVal('product', [
      'Product Name', 'productName', 'Product Description & Specs', 'product', 
      'Description', 'Item Description', 'Item Name',
      '\u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641', '\u0628\u064a\u0627\u0646 \u0648\u0645\u0648\u0627\u0635\u0641\u0627\u062a \u0627\u0644\u0645\u0627\u0633\u0648\u0631\u0629', '\u0627\u0644\u0635\u0646\u0641'
    ]);
    const desc = String(rawDesc || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Standard Pipe';
    const specs = parseProductSpecs(desc);

    const rawDate = getVal('date', ['Doc Date', 'DocDate', 'Date', 'date', 'Doc Date ']);
    const date = normalizeDate(rawDate);
    if (date) dates.push(date);

    const rawQty = getVal('qty', ['Qty', 'qty', 'Quantity', 'Production Qty (FG)']);
    const qty = parseNumber(rawQty, 0);

    const rawUnitWeight = getVal('unitWeight', ['Weight', 'weight', 'Unit Weight (kg)', 'unitWeight', 'Unit Weight']);
    const unitWeight = parseNumber(rawUnitWeight, 0);

    const rawTotalWeight = getVal('totalWeight', ['TotalWeight', 'Total Weight', 'Total Weight (kg)', 'totalWeight', 'total_weight']);
    let totalWeight = parseNumber(rawTotalWeight, 0);
    if (totalWeight === 0 && qty > 0 && unitWeight > 0) {
      totalWeight = Math.round(qty * unitWeight * 100) / 100;
    }

    const scrap = parseNumber(getVal('scrap', ['Scrap / Rejection (kg)', 'scrap']), 0);
    
    // Rational hours fallback: standard full shift / daily log representation
    const rawHours = getVal('hours', ['Operating Hours', 'operatingHours', 'Hours', 'hours']);
    let operatingHours = parseNumber(rawHours, null);
    if (operatingHours === null || operatingHours <= 0) {
      operatingHours = 24;
    }

    const rawCode = getVal('itemCode', [
      'Product Code', 'Item Code', 'itemCode', 'ProductCode', 'code', 'Code',
      '\u0643\u0648\u062f \u0627\u0644\u0635\u0646\u0641', '\u0643\u0648\u062f'
    ]);
    const itemCode = (rawCode !== undefined && rawCode !== null && String(rawCode).trim() !== '' && String(rawCode).trim() !== '-')
      ? String(rawCode).replace(/^ERP-/i, '').trim()
      : String(1000 + idx + 1);
    const reasonOfStop = String(getVal('reason', ['Reason of Stop', 'reasonOfStop', 'Remarks', 'remarks'])).trim();

    const diameter = specs.diameter !== '-' ? specs.diameter : (raw['Diameter'] || '-');
    const thickness = specs.thickness !== '-' ? specs.thickness : (raw['Thickness'] || '-');
    const diameterMm = parseDiameterToMm(diameter);
    const rawMaterial = raw['Material'] || raw['material'] || specs.material;
    const material = standardizeMaterial(rawMaterial, desc);

    // Perform machine inference
    const inference = inferMachineForRun({
      product: desc,
      diameter,
      diameterMm,
      totalWeight,
      operatingHours
    }, masterProfiles);

    totalWeightAcc += totalWeight;
    if (inference.primaryLoadingRatio !== null && inference.primaryLoadingRatio > 0) {
      totalLoadingAcc += inference.primaryLoadingRatio;
      validLoadingCount++;
    }

    const machineKey = inference.primaryMachine;
    machineCounts[machineKey] = (machineCounts[machineKey] || 0) + 1;

    const profileKey = `${diameterMm || diameter}___${desc}`;
    uniqueProfilesSet.add(profileKey);

    return {
      id: `erp-${idx + 1}`,
      rowNumber: idx + 1,
      date,
      itemCode,
      product: desc,
      material,
      standard: specs.standard,
      diameter,
      diameterMm,
      thickness,
      qty,
      unitWeight,
      totalWeight,
      scrap,
      operatingHours,
      downtimeHours: 0,
      reasonOfStop,
      lineRateKgPerHour: inference.actualRate,
      // Inferred machine planning attributes
      machine: inference.primaryMachine,
      inferredMachine: inference.primaryMachine,
      primaryCapacity: inference.primaryNominalCapacity,
      primaryLoadingRatio: inference.primaryLoadingRatio,
      primaryEnvelopeText: inference.primaryEnvelopeText,
      alternative1: inference.alternative1,
      alternative1Capacity: inference.alternative1Capacity,
      alternative1LoadingRatio: inference.alternative1LoadingRatio,
      alternative2: inference.alternative2,
      alternative2Capacity: inference.alternative2Capacity,
      alternative2LoadingRatio: inference.alternative2LoadingRatio,
      targetRateBand: inference.targetRateBand,
      expectedRateBand1: inference.targetRateBand,
      expectedRateBand2: inference.expectedRateBand2,
      expectedRateBand3: inference.expectedRateBand3,
      inferenceConfidence: inference.inferenceConfidence,
      sizingStatus: inference.primaryLoadingRatio >= 65 && inference.primaryLoadingRatio <= 95
        ? 'Inferred (Optimal Sizing & Loading)'
        : (inference.primaryLoadingRatio > 95 ? 'Inferred (High Load Fit)' : 'Inferred (Derated Fit)'),
      sizingNote: `Inferred on ${inference.primaryMachine} (${inference.primaryNominalCapacity} kg/h) at ${inference.primaryLoadingRatio || 0}% theoretical loading`,
      dataSource: 'Inferred by Model'
    };
  });

  dates.sort();
  const startDate = dates[0] || '';
  const endDate = dates[dates.length - 1] || '';

  const avgLoadingRatio = validLoadingCount > 0 
    ? Math.round((totalLoadingAcc / validLoadingCount) * 10) / 10 
    : 0;

  return {
    inferredRows,
    summary: {
      totalHistoricalRuns: inferredRows.length,
      totalWeightKg: Math.round(totalWeightAcc),
      uniqueProfilesCount: uniqueProfilesSet.size,
      avgLoadingRatio,
      machineAllocations: machineCounts,
      dateRange: { start: startDate, end: endDate }
    }
  };
}

/**
 * Builds the Unique Sizing & Planning Matrix Table (distinct list of items / diameters)
 * Required columns:
 * 1. Pipe Description & Standard Spec
 * 2. OD (mm)
 * 3. Primary / Assigned Extruder
 * 4. Nominal Machine Capacity (kg/h)
 * 5. Planning Alternative 1
 * 6. Planning Alternative 2
 * 7. Target Extrusion Rate Band
 */
export function buildUniqueSizingPlanningMatrix(activeCleanedRows = [], inferredHistoricalRows = [], masterProfiles = MASTER_MACHINE_PROFILES) {
  // Deduplicate: avoid double-counting if historical runs were already merged into activeCleanedRows
  const actualProductionRows = activeCleanedRows.filter(r => 
    r.dataSource !== 'Inferred by Model' && 
    r.dataSource !== 'ERP Historical (Inferred)' &&
    r['Data Source / Origin'] !== 'Inferred by Model'
  );

  const historicalRuns = (inferredHistoricalRows && inferredHistoricalRows.length > 0)
    ? inferredHistoricalRows
    : activeCleanedRows.filter(r => 
        r.dataSource === 'Inferred by Model' || 
        r.dataSource === 'ERP Historical (Inferred)' ||
        r['Data Source / Origin'] === 'Inferred by Model'
      );

  const combinedRows = [...actualProductionRows, ...historicalRuns];
  if (combinedRows.length === 0) return [];

  // Strictly filter out HDPE, PPR, CPVC and non-pipe/junk items from the Unique Planning Catalog
  const isExcludedMaterial = (mat, desc) => {
    const std = standardizeMaterial(mat, desc);
    return std === 'HDPE' || std === 'PPR' || std === 'CPVC';
  };

  const pipeRows = combinedRows.filter(row => {
    if (isExcludedMaterial(row.material, row.product)) return false;
    const desc = row.product || row['Product Description & Specs'] || row['Product Name'] || '';
    if (!isValidPipeOrConduitProduct(desc, row.diameter, row.diameterMm)) return false;
    return true;
  });
  if (pipeRows.length === 0) return [];

  const profileMap = new Map();

  pipeRows.forEach(row => {
    const rawDesc = row.product || row['Product Description & Specs'] || row['Product Name'] || '';
    const desc = String(rawDesc || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    let diamStr = row.diameter || row['Diameter'] || row['Extracted Diameter'] || '-';
    let thickStr = row.thickness || row['Thickness'] || row['Extracted Thickness'] || row['Wall Thickness / SDR'] || '-';
    let materialStr = row.material || row['Material'] || '';

    // If diameter, thickness, or material is missing/unspecified, extract from desc
    if ((diamStr === '-' || !diamStr) || (thickStr === '-' || !thickStr) || !materialStr) {
      const parsed = parseProductSpecs(desc);
      if (diamStr === '-' || !diamStr) diamStr = parsed.diameter;
      if (thickStr === '-' || !thickStr) thickStr = parsed.thickness;
      if (!materialStr) materialStr = parsed.material;
    }

    const diamMm = row.diameterMm !== undefined && row.diameterMm !== null
      ? row.diameterMm
      : parseDiameterToMm(diamStr);

    const rawCode = row.itemCode || row['Item Code'] || row['Product Code'] || '';
    const itemCode = (rawCode && String(rawCode).trim() !== '' && String(rawCode).trim() !== '-')
      ? String(rawCode).replace(/^ERP-/i, '').trim()
      : '';

    const cleanDesc = desc || (diamStr !== '-' ? `${materialStr || 'uPVC'} Pipe ${diamStr}` : 'Standard Pipe');

    // Grouping key: itemCode + clean description when available, or OD + clean description
    const normKey = itemCode 
      ? `CODE_${itemCode}___${cleanDesc.toUpperCase()}`
      : `${diamMm || diamStr}___${cleanDesc.toUpperCase()}`;

    if (!profileMap.has(normKey)) {
      // Find inference recommendation for this unique profile
      const refRun = {
        diameter: diamStr,
        diameterMm: diamMm,
        product: cleanDesc,
        totalWeight: row.totalWeight || (row.lineRateKgPerHour ? row.lineRateKgPerHour * 24 : 6000),
        operatingHours: row.operatingHours || 24
      };
      const inference = inferMachineForRun(refRun, masterProfiles);

      // Verify assigned machine: must be a valid pipe extruder, NEVER a pelletizing line (Bausano or KTS 550)
      const isPelletizing = (machName) => {
        const p = findMasterMachineProfile(machName);
        return p && (p.isPelletizingLine || p.id === 'BAUSANO' || p.id === 'KTS-550');
      };

      const canonRowMach = canonicalizeMachineName(row.machine);
      const hasVerifiedPipeExtruder = row.dataSource !== 'Inferred by Model' && 
                                      row.dataSource !== 'ERP Historical (Inferred)' && 
                                      canonRowMach && 
                                      canonRowMach !== 'UNKNOWN-LINE' &&
                                      CANONICAL_PIPE_EXTRUDERS.includes(canonRowMach) &&
                                      !isPelletizing(canonRowMach);

      const assignedMachine = hasVerifiedPipeExtruder ? canonRowMach : inference.primaryMachine;
      if (isUnknownMachine(assignedMachine) || !CANONICAL_PIPE_EXTRUDERS.includes(assignedMachine)) {
        return; // Drop any item that resolves to UNKNOWN-LINE or Unknown
      }

      const profileMatch = findMasterMachineProfile(assignedMachine);
      const nominalCap = profileMatch ? profileMatch.nominalCapacity : inference.primaryNominalCapacity;

      // Select alternative extruders strictly from eligible candidates excluding assignedMachine:
      const remainingEligible = (inference.allCandidates || []).filter(c => 
        c.machineName !== assignedMachine && 
        isMachineEligibleForDiameter(c.machineName, diamMm)
      );

      const alt1Candidate = remainingEligible[0] || null;
      const alt2Candidate = remainingEligible[1] || null;

      const alt1Extruder = alt1Candidate ? alt1Candidate.machineName : '-';
      const alt1Band = alt1Candidate
        ? `${Math.round(alt1Candidate.nominalCapacity * 0.65)} - ${Math.round(alt1Candidate.nominalCapacity * 0.95)} kg/hr`
        : '-';
      const alt1Text = alt1Candidate ? `${alt1Candidate.machineName} (${alt1Candidate.nominalCapacity} kg/h)` : '-';

      const alt2Extruder = alt2Candidate ? alt2Candidate.machineName : '-';
      const alt2Band = alt2Candidate
        ? `${Math.round(alt2Candidate.nominalCapacity * 0.65)} - ${Math.round(alt2Candidate.nominalCapacity * 0.95)} kg/hr`
        : '-';
      const alt2Text = alt2Candidate ? `${alt2Candidate.machineName} (${alt2Candidate.nominalCapacity} kg/h)` : '-';

      const pipeOdAndNominal = diamMm !== null 
        ? `${diamMm} mm (${diamStr})` 
        : (diamStr !== '-' ? diamStr : '-');

      profileMap.set(normKey, {
        id: `profile-${profileMap.size + 1}`,
        itemCode: itemCode || '-',
        pipeDescription: cleanDesc,
        pipeOdAndNominal,
        standardSpec: row.standard && row.standard !== 'N/A' ? row.standard : (thickStr !== '-' ? thickStr : 'Standard'),
        odMm: diamMm !== null ? `${diamMm} mm` : diamStr,
        odNumeric: diamMm || 0,
        extractedDiameter: diamStr,
        extractedThickness: thickStr || row.thickness || '-',
        material: 'uPVC',
        primaryExtruder: assignedMachine,
        nominalCapacity: nominalCap ? `${nominalCap} kg/h` : 'Uncalibrated',
        nominalCapacityNum: nominalCap || 0,
        primaryTargetRateBand: inference.targetRateBand,
        targetRateBand: inference.targetRateBand,
        alternativeExtruder1: alt1Extruder,
        alternativeRateBand1: alt1Band,
        planningAlternative1: alt1Text,
        alternativeExtruder2: alt2Extruder,
        alternativeRateBand2: alt2Band,
        planningAlternative2: alt2Text,
        totalRunsObserved: 0,
        activeRunsCount: 0,
        historicalRunsCount: 0,
        ratesAccumulator: 0,
        totalWeightAccumulator: 0,
        totalHoursAccumulator: 0
      });
    }

    const item = profileMap.get(normKey);
    if (!item) return;

    item.totalRunsObserved += 1;
    if (row.dataSource === 'Inferred by Model' || row.dataSource === 'ERP Historical (Inferred)') {
      item.historicalRunsCount += 1;
    } else {
      item.activeRunsCount += 1;
    }
    if (row.lineRateKgPerHour && row.lineRateKgPerHour > 0) {
      item.ratesAccumulator += row.lineRateKgPerHour;
    }
    if (row.totalWeight && row.totalWeight > 0) {
      item.totalWeightAccumulator += row.totalWeight;
    }
    if (row.operatingHours && row.operatingHours > 0) {
      item.totalHoursAccumulator += row.operatingHours;
    }
  });

  const matrix = Array.from(profileMap.values()).map(item => {
    let evaluatedRateNum = 0;
    if (item.totalRunsObserved > 0 && item.ratesAccumulator > 0) {
      evaluatedRateNum = Math.round((item.ratesAccumulator / item.totalRunsObserved) * 10) / 10;
    } else if (item.totalWeightAccumulator > 0 && item.totalHoursAccumulator > 0) {
      evaluatedRateNum = Math.round((item.totalWeightAccumulator / item.totalHoursAccumulator) * 10) / 10;
    } else if (item.nominalCapacityNum > 0) {
      evaluatedRateNum = Math.round(item.nominalCapacityNum * 0.8);
    }

    const evaluatedHistoricalRate = evaluatedRateNum > 0 ? `${evaluatedRateNum} kg/hr` : '-';

    return {
      ...item,
      evaluatedHistoricalRate,
      avgObservedRate: evaluatedHistoricalRate
    };
  });

  // Strictly filter out any profiles that resolve to unknown extruder or non-pipe product
  const validMatrix = matrix.filter(item => 
    !isUnknownMachine(item.primaryExtruder) && 
    CANONICAL_PIPE_EXTRUDERS.includes(item.primaryExtruder) &&
    isValidPipeOrConduitProduct(item.pipeDescription)
  );

  // Sort by OD mm ascending
  validMatrix.sort((a, b) => a.odNumeric - b.odNumeric);

  return validMatrix;
}

/**
 * Generates the multi-sheet Consolidated Clean Master Excel workbook
 */
export function generateConsolidatedExcelWorkbook(activeCleanedRows = [], inferredHistoricalRows = [], uniqueMatrix = [], masterProfiles = MASTER_MACHINE_PROFILES) {
  const wb = XLSX.utils.book_new();

  const isExcludedMaterial = (mat, desc) => {
    const std = standardizeMaterial(mat, desc);
    return std === 'HDPE' || std === 'PPR' || std === 'CPVC';
  };

  // Deduplicate: ensure actual production rows and inferred historical rows are not concatenated redundantly
  const actualProductionRows = activeCleanedRows.filter(r => 
    r.dataSource !== 'Inferred by Model' && 
    r.dataSource !== 'ERP Historical (Inferred)' &&
    r['Data Source / Origin'] !== 'Inferred by Model'
  );

  const historicalRuns = (inferredHistoricalRows && inferredHistoricalRows.length > 0)
    ? inferredHistoricalRows
    : activeCleanedRows.filter(r => 
        r.dataSource === 'Inferred by Model' || 
        r.dataSource === 'ERP Historical (Inferred)' ||
        r['Data Source / Origin'] === 'Inferred by Model'
      );

  const filteredActive = actualProductionRows.filter(r => {
    if (isExcludedMaterial(r.material, r.product)) return false;
    if (!isValidPipeOrConduitProduct(r.product, r.diameter, r.diameterMm)) return false;
    const mach = canonicalizeMachineName(r.machine);
    if (isUnknownMachine(mach)) return false;
    return true;
  });

  const filteredHistorical = historicalRuns.filter(r => {
    if (isExcludedMaterial(r.material, r.product)) return false;
    if (!isValidPipeOrConduitProduct(r.product, r.diameter, r.diameterMm)) return false;
    const mach = canonicalizeMachineName(r.inferredMachine || r.machine);
    if (isUnknownMachine(mach)) return false;
    return true;
  });

  const filteredUniqueMatrix = uniqueMatrix.filter(m => {
    if (isExcludedMaterial(m.material, m.pipeDescription)) return false;
    if (!isValidPipeOrConduitProduct(m.pipeDescription)) return false;
    const mach = canonicalizeMachineName(m.primaryExtruder);
    if (isUnknownMachine(mach)) return false;
    return true;
  });

  // 1. Consolidated Production Log Sheet (strictly Actual Rows + Inferred Rows, zero duplicates, strictly uPVC)
  const consolidatedRows = [
    ...filteredActive.map(r => ({
      "Data Source / Origin": r.dataSource || "Actual Production",
      "Date": r.date,
      "Item Code": r.itemCode,
      "Machine": canonicalizeMachineName(r.machine),
      "Product Description & Specs": r.product,
      "Material": standardizeMaterial(r.material, r.product),
      "Extracted Diameter": r.diameter,
      "Metric OD (mm)": r.diameterMm || '-',
      "Extracted Thickness": r.thickness,
      "Actual Extrusion Rate (kg/hr)": r.lineRateKgPerHour,
      "Nominal Capacity (kg/h)": r.nominalCapacity || '-',
      "Capacity Loading %": r.lineEfficiency !== null && r.lineEfficiency !== undefined ? `${r.lineEfficiency}%` : '-',
      "Sizing Feasibility Status": r.sizingStatus,
      "Total Weight (kg)": r.totalWeight,
      "Production Qty": r.qty,
      "Operating Hours": r.operatingHours,
      "Scrap (kg)": r.scrap
    })),
    ...filteredHistorical.map(r => ({
      "Data Source / Origin": "Inferred by Model",
      "Date": r.date,
      "Item Code": r.itemCode,
      "Machine": canonicalizeMachineName(r.inferredMachine || r.machine),
      "Product Description & Specs": r.product,
      "Material": standardizeMaterial(r.material, r.product),
      "Extracted Diameter": r.diameter,
      "Metric OD (mm)": r.diameterMm || '-',
      "Extracted Thickness": r.thickness,
      "Actual Extrusion Rate (kg/hr)": r.lineRateKgPerHour,
      "Nominal Capacity (kg/h)": r.primaryCapacity || r.nominalCapacity || '-',
      "Capacity Loading %": r.primaryLoadingRatio !== null && r.primaryLoadingRatio !== undefined 
        ? `${r.primaryLoadingRatio}%` 
        : (r.lineEfficiency !== null && r.lineEfficiency !== undefined ? `${r.lineEfficiency}%` : '-'),
      "Sizing Feasibility Status": r.sizingStatus,
      "Total Weight (kg)": r.totalWeight,
      "Production Qty": r.qty,
      "Operating Hours": r.operatingHours,
      "Scrap (kg)": r.scrap
    }))
  ];

  const ws1 = XLSX.utils.json_to_sheet(consolidatedRows);
  XLSX.utils.book_append_sheet(wb, ws1, "Consolidated Production Log");

  // 2. Unique Sizing Planning Matrix Sheet
  const matrixData = filteredUniqueMatrix.map(m => ({
    "Pipe Description & Standard Spec": m.pipeDescription,
    "OD (mm)": m.odMm,
    "Primary / Assigned Extruder": canonicalizeMachineName(m.primaryExtruder),
    "Nominal Machine Capacity (kg/h)": m.nominalCapacity,
    "Planning Alternative 1": m.planningAlternative1,
    "Planning Alternative 2": m.planningAlternative2,
    "Target Extrusion Rate Band": m.targetRateBand,
    "Total Evaluated Runs": m.totalRunsObserved,
    "Average Extrusion Rate": m.avgObservedRate
  }));

  const ws2 = XLSX.utils.json_to_sheet(matrixData);
  XLSX.utils.book_append_sheet(wb, ws2, "Unique Sizing Planning Matrix");

  // 3. Machine Allocation & Capability Reference Sheet (Pipe Extrusion Lines only)
  const extruderRefData = masterProfiles
    .filter(p => !p.isPelletizingLine && p.id !== 'BAUSANO' && p.id !== 'KTS-550')
    .map(p => ({
      "Extruder Line": p.name,
      "ID": p.id,
      "Allowable Diameter Envelope": p.minDiameter !== null ? `${p.minDiameter} - ${p.maxDiameter} mm` : 'Broad / Unconstrained',
      "Min Diameter (mm)": p.minDiameter || 'None',
      "Max Diameter (mm)": p.maxDiameter || 'None',
      "Nominal Capacity (kg/h)": p.nominalCapacity,
      "Optimal Operating Envelope (65% - 95%)": `${Math.round(p.nominalCapacity * 0.65)} - ${Math.round(p.nominalCapacity * 0.95)} kg/h`
    }));

  const ws3 = XLSX.utils.json_to_sheet(extruderRefData);
  XLSX.utils.book_append_sheet(wb, ws3, "Extruder Capability Reference");

  return wb;
}

export const MASTER_COLUMNS = {
  DATE: 'Date',
  DATA_SOURCE: 'Data Source / Origin',
  ITEM_CODE: 'Item Code',
  PRODUCT_DESC: 'Product Description & Specs',
  DIAMETER: 'Pipe Diameter (and Metric OD mm)',
  THICKNESS: 'Wall Thickness / SDR',
  MATERIAL: 'Material (uPVC, HDPE, etc.)',
  QTY: 'Production Qty (Pcs / Lengths)',
  TOTAL_WEIGHT: 'Total Production Weight (kg)',
  SCRAP_WEIGHT: 'Scrap Weight (kg)',
  ACTUAL_RATE: 'Actual Extrusion Rate (kg/hr)',
  CURRENT_LINE: 'Current/Inferred Extruder Line',
  PRIMARY_PROPOSAL: 'Primary Proposal (\u0627\u0644\u0645\u0642\u062a\u0631\u062d \u0627\u0644\u0623\u0648\u0644)',
  EXPECTED_RATE_BAND_1: 'Expected Rate Band 1 (\u0627\u0644\u0645\u0639\u062f\u0644 \u0627\u0644\u0645\u062a\u0648\u0642\u0639 1 - kg/hr)',
  ALT_PROPOSAL_1: 'Alternative Proposal 1 (\u0627\u0644\u0645\u0642\u062a\u0631\u062d \u0627\u0644\u062b\u0627\u0646\u064a)',
  EXPECTED_RATE_BAND_2: 'Expected Rate Band 2 (\u0627\u0644\u0645\u0639\u062f\u0644 \u0627\u0644\u0645\u062a\u0648\u0642\u0639 2 - kg/hr)',
  ALT_PROPOSAL_2: 'Alternative Proposal 2 (\u0627\u0644\u0645\u0642\u062a\u0631\u062d \u0627\u0644\u062b\u0627\u0644\u062b)',
  EXPECTED_RATE_BAND_3: 'Expected Rate Band 3 (\u0627\u0644\u0645\u0639\u062f\u0644 \u0627\u0644\u0645\u062a\u0648\u0642\u0639 3 - kg/hr)'
};

export const ORIGIN_ACTUAL_LOG = 'Actual Log (\u062a\u0633\u062c\u064a\u0644 \u062e\u0637 \u0627\u0644\u0625\u0646\u062a\u0627\u062c)';
export const ORIGIN_ERP_LOG = 'ERP Log (\u0633\u062c\u0644 ERP)';

export function formatDiameterWithMetricOd(diameter, diameterMm) {
  if (!diameter && (diameterMm === undefined || diameterMm === null)) return '-';
  const dStr = String(diameter || '').trim();
  if (diameterMm !== undefined && diameterMm !== null && diameterMm > 0) {
    if (!dStr || dStr === '-') return `${diameterMm} mm`;
    if (dStr.includes('"') || !dStr.includes(String(diameterMm))) {
      return `${dStr} (${diameterMm} mm)`;
    }
    return dStr.includes('mm') ? dStr : `${dStr} mm`;
  }
  return dStr || '-';
}

/**
 * Builds the unified master extrusion and planning runs containing all loaded runs
 * (strictly actual production + historical ERP runs without duplicates).
 */
export function buildUnifiedMasterRuns(activeCleanedRows = [], inferredHistoricalRows = [], masterProfiles = MASTER_MACHINE_PROFILES) {
  // Deduplicate: avoid double-counting if historical runs were merged into activeCleanedRows
  const actualProductionRows = (activeCleanedRows || []).filter(r => 
    r.dataSource !== 'Inferred by Model' && 
    r.dataSource !== 'ERP Historical (Inferred)' &&
    r['Data Source / Origin'] !== 'Inferred by Model' &&
    r['Data Source / Origin'] !== 'ERP Historical (Inferred)' &&
    r['Data Source / Origin'] !== ORIGIN_ERP_LOG
  );

  const historicalRuns = (inferredHistoricalRows && inferredHistoricalRows.length > 0)
    ? inferredHistoricalRows
    : (activeCleanedRows || []).filter(r => 
        r.dataSource === 'Inferred by Model' || 
        r.dataSource === 'ERP Historical (Inferred)' ||
        r['Data Source / Origin'] === 'Inferred by Model' ||
        r['Data Source / Origin'] === 'ERP Historical (Inferred)' ||
        r['Data Source / Origin'] === ORIGIN_ERP_LOG
      );

  // Cache inferences to optimize performance
  const inferenceCache = new Map();
  const getInference = (product, diameter, diameterMm, totalWeight, operatingHours) => {
    const key = `${diameterMm || diameter}___${product}`;
    if (inferenceCache.has(key)) return inferenceCache.get(key);
    const res = inferMachineForRun({
      product,
      diameter,
      diameterMm,
      totalWeight,
      operatingHours
    }, masterProfiles);
    inferenceCache.set(key, res);
    return res;
  };

  const mapRun = (row, isActual, index) => {
    const rawDesc = row.product || row['Product Description & Specs'] || row['Product Name'] || '';
    const desc = String(rawDesc || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    const diam = row.diameter || row['Diameter'] || row['Extracted Diameter'] || '-';
    const diamMm = row.diameterMm !== undefined && row.diameterMm !== null
      ? row.diameterMm
      : parseDiameterToMm(diam);
    const thickness = row.thickness || row['Thickness'] || row['Extracted Thickness'] || row['Wall Thickness / SDR'] || '-';
    const material = row.material || row['Material'] || 'uPVC';
    const qty = parseNumber(row.qty !== undefined ? row.qty : row['Production Qty (FG)'], 0);
    const totalWeight = parseNumber(row.totalWeight !== undefined ? row.totalWeight : row['Total Weight (kg)'], 0);
    const scrap = parseNumber(row.scrap !== undefined ? row.scrap : row['Scrap / Rejection (kg)'], 0);
    const operatingHours = parseNumber(row.operatingHours !== undefined ? row.operatingHours : row['Operating Hours'], 24) || 24;

    const actualRate = row.lineRateKgPerHour !== undefined && row.lineRateKgPerHour !== null && row.lineRateKgPerHour > 0
      ? Number(row.lineRateKgPerHour)
      : (operatingHours > 0 && totalWeight > 0 ? Math.round((totalWeight / operatingHours) * 10) / 10 : 0);

    let primaryProposal = row.inferredMachine;
    let rateBand1 = row.targetRateBand || row.expectedRateBand1;
    let alt1 = row.alternative1;
    let alt1Cap = row.alternative1Capacity;
    let rateBand2 = row.expectedRateBand2;
    let alt2 = row.alternative2;
    let alt2Cap = row.alternative2Capacity;
    let rateBand3 = row.expectedRateBand3;

    if (!primaryProposal || primaryProposal === '-' || !alt1 || !alt2 || !rateBand2 || !rateBand3) {
      const inf = getInference(desc, diam, diamMm, totalWeight, operatingHours);
      if (!primaryProposal || primaryProposal === '-') primaryProposal = inf.primaryMachine;
      if (!rateBand1 || rateBand1 === '-') rateBand1 = inf.targetRateBand;
      if (!alt1 || alt1 === '-') {
        alt1 = inf.alternative1;
        alt1Cap = inf.alternative1Capacity;
      }
      if (!rateBand2 || rateBand2 === '-') rateBand2 = inf.expectedRateBand2;
      if (!alt2 || alt2 === '-') {
        alt2 = inf.alternative2;
        alt2Cap = inf.alternative2Capacity;
      }
      if (!rateBand3 || rateBand3 === '-') rateBand3 = inf.expectedRateBand3;
    }

    // STRICT DIAMETER ENVELOPE VERIFICATION:
    // Ensure primary proposal and alternatives physically support diamMm
    if (primaryProposal && primaryProposal !== '-' && !isMachineEligibleForDiameter(primaryProposal, diamMm)) {
      primaryProposal = '-';
      rateBand1 = '-';
    }
    if (alt1 && alt1 !== '-' && !isMachineEligibleForDiameter(alt1, diamMm)) {
      alt1 = '-';
      alt1Cap = null;
      rateBand2 = '-';
    }
    if (alt2 && alt2 !== '-' && !isMachineEligibleForDiameter(alt2, diamMm)) {
      alt2 = '-';
      alt2Cap = null;
      rateBand3 = '-';
    }

    const currentLine = isActual 
      ? (row.machine || row['Machine'] || primaryProposal || '-')
      : (row.inferredMachine || row.machine || primaryProposal || '-');

    return {
      id: row.id || `${isActual ? 'actual' : 'erp'}-${index + 1}`,
      [MASTER_COLUMNS.DATE]: row.date || row['Date'] || row['Doc Date'] || '-',
      [MASTER_COLUMNS.DATA_SOURCE]: isActual ? ORIGIN_ACTUAL_LOG : ORIGIN_ERP_LOG,
      [MASTER_COLUMNS.ITEM_CODE]: String(row.itemCode || row['Item Code'] || row['Product Code'] || '-').replace(/^ERP-/i, '').trim(),
      [MASTER_COLUMNS.PRODUCT_DESC]: desc,
      [MASTER_COLUMNS.DIAMETER]: formatDiameterWithMetricOd(diam, diamMm),
      [MASTER_COLUMNS.THICKNESS]: thickness,
      [MASTER_COLUMNS.MATERIAL]: material,
      [MASTER_COLUMNS.QTY]: qty,
      [MASTER_COLUMNS.TOTAL_WEIGHT]: totalWeight,
      [MASTER_COLUMNS.SCRAP_WEIGHT]: scrap,
      [MASTER_COLUMNS.ACTUAL_RATE]: actualRate,
      [MASTER_COLUMNS.CURRENT_LINE]: currentLine,
      [MASTER_COLUMNS.PRIMARY_PROPOSAL]: primaryProposal || '-',
      [MASTER_COLUMNS.EXPECTED_RATE_BAND_1]: rateBand1 || '-',
      [MASTER_COLUMNS.ALT_PROPOSAL_1]: alt1 || '-',
      [MASTER_COLUMNS.EXPECTED_RATE_BAND_2]: alt1 && alt1 !== '-' ? (rateBand2 || (alt1Cap ? `${Math.round(alt1Cap * 0.65)} - ${Math.round(alt1Cap * 0.95)} kg/hr` : '-')) : '-',
      [MASTER_COLUMNS.ALT_PROPOSAL_2]: alt2 || '-',
      [MASTER_COLUMNS.EXPECTED_RATE_BAND_3]: alt2 && alt2 !== '-' ? (rateBand3 || (alt2Cap ? `${Math.round(alt2Cap * 0.65)} - ${Math.round(alt2Cap * 0.95)} kg/hr` : '-')) : '-',

      // Internal properties for UI filtering and styling
      _raw: {
        isActual,
        diameterMm: diamMm,
        diameterRaw: diam,
        thicknessRaw: thickness,
        currentLine,
        material,
        sizingStatus: row.sizingStatus || 'Optimal'
      }
    };
  };

  const actualUnified = actualProductionRows.map((r, idx) => mapRun(r, true, idx));
  const historicalUnified = historicalRuns.map((r, idx) => mapRun(r, false, actualProductionRows.length + idx));

  return [...actualUnified, ...historicalUnified];
}

/**
 * Strips internal metadata for pristine Excel export matching the 18 columns
 */
export function exportMasterPlanToExcelRows(masterRuns) {
  const columnKeys = Object.values(MASTER_COLUMNS);
  const isExcludedMaterial = (mat, desc) => {
    const std = standardizeMaterial(mat, desc);
    return std === 'HDPE' || std === 'PPR' || std === 'CPVC';
  };

  const filteredRuns = masterRuns.filter(r => {
    const mat = r[MASTER_COLUMNS.MATERIAL] || r._raw?.material;
    const desc = r[MASTER_COLUMNS.PRODUCT_DESC];
    const currLine = r[MASTER_COLUMNS.CURRENT_LINE];
    const propLine = r[MASTER_COLUMNS.PRIMARY_PROPOSAL];

    if (isExcludedMaterial(mat, desc)) return false;
    if (!isValidPipeOrConduitProduct(desc)) return false;
    if (isUnknownMachine(currLine) && isUnknownMachine(propLine)) return false;
    return true;
  });

  return filteredRuns.map(r => {
    const row = {};
    columnKeys.forEach(colName => {
      if (colName === MASTER_COLUMNS.MATERIAL) {
        row[colName] = 'uPVC';
      } else if (colName === MASTER_COLUMNS.CURRENT_LINE) {
        const cMach = canonicalizeMachineName(r[colName]);
        row[colName] = cMach !== 'UNKNOWN-LINE' ? cMach : (r[MASTER_COLUMNS.PRIMARY_PROPOSAL] || '-');
      } else if (colName === MASTER_COLUMNS.PRIMARY_PROPOSAL) {
        const pMach = canonicalizeMachineName(r[colName]);
        row[colName] = pMach !== 'UNKNOWN-LINE' ? pMach : (r[colName] || '-');
      } else {
        row[colName] = r[colName] !== undefined ? r[colName] : '';
      }
    });
    return row;
  });
}

/**
 * Generates the single well-formatted Master Extrusion Plan Excel workbook
 * with frozen header row and custom column widths. Strictly no duplicate rows.
 */
export function generateMasterPlanExcelWorkbook(masterRuns) {
  const wb = XLSX.utils.book_new();
  const cleanRows = exportMasterPlanToExcelRows(masterRuns);
  const ws = XLSX.utils.json_to_sheet(cleanRows);

  // Freeze the first row (header)
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  // Set proper column widths
  ws['!cols'] = [
    { wch: 14 }, // Date
    { wch: 32 }, // Data Source / Origin
    { wch: 16 }, // Item Code
    { wch: 42 }, // Product Description & Specs
    { wch: 26 }, // Pipe Diameter (and Metric OD mm)
    { wch: 20 }, // Wall Thickness / SDR
    { wch: 18 }, // Material (uPVC, HDPE, etc.)
    { wch: 20 }, // Production Qty (Pcs / Lengths)
    { wch: 22 }, // Total Production Weight (kg)
    { wch: 16 }, // Scrap Weight (kg)
    { wch: 22 }, // Actual Extrusion Rate (kg/hr)
    { wch: 26 }, // Current/Inferred Extruder Line
    { wch: 26 }, // Primary Proposal (المقترح الأول)
    { wch: 28 }, // Expected Rate Band 1 (المعدل المتوقع 1 - kg/hr)
    { wch: 26 }, // Alternative Proposal 1 (المقترح الثاني)
    { wch: 28 }, // Expected Rate Band 2 (المعدل المتوقع 2 - kg/hr)
    { wch: 26 }, // Alternative Proposal 2 (المقترح الثالث)
    { wch: 28 }  // Expected Rate Band 3 (المعدل المتوقع 3 - kg/hr)
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Master Extrusion Plan");
  return wb;
}

export const UNIQUE_CATALOG_COLUMNS = {
  ITEM_CODE: 'Item Code',
  PRODUCT_DESC: 'Product Description & Specs',
  OD_NOMINAL: 'Pipe OD (mm) & Nominal Size',
  THICKNESS_SDR: 'Wall Thickness / SDR',
  MATERIAL: 'Material',
  HISTORICAL_RATE: 'Evaluated Historical Output Rate (Average/Typical kg/hr)',
  PRIMARY_EXTRUDER: 'Primary Extruder Recommendation',
  PRIMARY_RATE_BAND: 'Primary Target Rate Band (kg/hr)',
  ALT_EXTRUDER_1: 'Alternative Extruder 1',
  ALT_RATE_BAND_1: 'Alternative Rate Band 1 (kg/hr)',
  ALT_EXTRUDER_2: 'Alternative Extruder 2',
  ALT_RATE_BAND_2: 'Alternative Rate Band 2 (kg/hr)'
};

/**
 * Generates the dedicated Unique Sizing & Planning Catalog Excel workbook.
 * Exactly one row per distinct Item Code / Pipe Specification.
 */
export function generateUniquePlanningCatalogExcelWorkbook(uniqueMatrix = []) {
  const wb = XLSX.utils.book_new();

  const isExcludedMaterial = (mat, desc) => {
    const std = standardizeMaterial(mat, desc);
    return std === 'HDPE' || std === 'PPR' || std === 'CPVC';
  };

  const filteredMatrix = uniqueMatrix.filter(m => {
    if (isExcludedMaterial(m.material, m.pipeDescription)) return false;
    if (!isValidPipeOrConduitProduct(m.pipeDescription, m.odMm, m.extractedDiameter)) return false;
    const mach = canonicalizeMachineName(m.primaryExtruder);
    if (isUnknownMachine(mach)) return false;
    return true;
  });

  const data = filteredMatrix.map(m => {
    const canonPrimary = canonicalizeMachineName(m.primaryExtruder);
    return {
      [UNIQUE_CATALOG_COLUMNS.ITEM_CODE]: m.itemCode || '-',
      [UNIQUE_CATALOG_COLUMNS.PRODUCT_DESC]: m.pipeDescription || '-',
      [UNIQUE_CATALOG_COLUMNS.OD_NOMINAL]: m.pipeOdAndNominal || m.odMm || '-',
      [UNIQUE_CATALOG_COLUMNS.THICKNESS_SDR]: m.extractedThickness || '-',
      [UNIQUE_CATALOG_COLUMNS.MATERIAL]: 'uPVC',
      [UNIQUE_CATALOG_COLUMNS.HISTORICAL_RATE]: m.evaluatedHistoricalRate || m.avgObservedRate || '-',
      [UNIQUE_CATALOG_COLUMNS.PRIMARY_EXTRUDER]: canonPrimary !== 'UNKNOWN-LINE' ? canonPrimary : (m.primaryExtruder || '-'),
      [UNIQUE_CATALOG_COLUMNS.PRIMARY_RATE_BAND]: m.primaryTargetRateBand || m.targetRateBand || '-',
      [UNIQUE_CATALOG_COLUMNS.ALT_EXTRUDER_1]: m.alternativeExtruder1 || '-',
      [UNIQUE_CATALOG_COLUMNS.ALT_RATE_BAND_1]: m.alternativeRateBand1 || '-',
      [UNIQUE_CATALOG_COLUMNS.ALT_EXTRUDER_2]: m.alternativeExtruder2 || '-',
      [UNIQUE_CATALOG_COLUMNS.ALT_RATE_BAND_2]: m.alternativeRateBand2 || '-'
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);

  // Freeze top row (header)
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  // Set column widths
  ws['!cols'] = [
    { wch: 14 }, // Item Code
    { wch: 46 }, // Product Description & Specs
    { wch: 26 }, // Pipe OD (mm) & Nominal Size
    { wch: 20 }, // Wall Thickness / SDR
    { wch: 16 }, // Material
    { wch: 32 }, // Evaluated Historical Output Rate
    { wch: 30 }, // Primary Extruder Recommendation
    { wch: 26 }, // Primary Target Rate Band
    { wch: 26 }, // Alternative Extruder 1
    { wch: 26 }, // Alternative Rate Band 1
    { wch: 26 }, // Alternative Extruder 2
    { wch: 26 }  // Alternative Rate Band 2
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Unique Planning Catalog");
  return wb;
}

