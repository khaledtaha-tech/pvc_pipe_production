import { MACHINES, matchMachine } from '../config/machines.js';
import { round1, makeRefSpec, HOUR_WINDOWS } from './engine.js';
import { consolidateDailyMachineRecords, convertLogRowToReport } from './excelParser.js';
import { queryProductionRecords, queryProductionRecordsForDate, reconcileShiftRun, blankReportForMachine } from './oeeReconciler.js';
import { getMachineNominalCapacity } from './machineSettingsConfig.js';
import { SOP_FACTORY_PRESETS } from './legacySopHelper.js';
import * as XLSX from 'xlsx';

/**
 * Standard plant downtime categories for horizontal reconciliation matrix
 */
export const MATRIX_DOWNTIME_CATEGORIES = [
  { key: 'moldChangeHours', label: 'Die / Mold Change', defaultStartSlot: 2, presetId: 'mold_change', reason: 'Die / Mold Changeover' },
  { key: 'purgeCleaningHours', label: 'Purge & Cleaning', defaultStartSlot: 6, presetId: 'purge_cleaning', reason: 'Color / Material Purge & Cleaning' },
  { key: 'heaterFailureHours', label: 'Heater Failures', defaultStartSlot: 4, presetId: 'heater_failure', reason: 'Heater / Thermocouple Failure' },
  { key: 'mechanicalHours', label: 'Mechanical & Puller', defaultStartSlot: 10, presetId: 'mechanical_jam', reason: 'Mechanical Jam / Puller Fix' },
  { key: 'materialNoOrderHours', label: 'Material & No Order', defaultStartSlot: 0, presetId: 'no_order', reason: 'Raw Material Shortage / No Order' },
  { key: 'otherHours', label: 'Other Stoppages', defaultStartSlot: 14, presetId: 'custom_breakdown', reason: 'Other Operational Stoppages' }
];

/**
 * Categorize a downtime reason text into one of the 6 standard matrix categories
 */
export function categorizeDowntimeReason(reasonText = '') {
  const text = String(reasonText || '').toLowerCase();
  if (text.includes('mold') || text.includes('die change') || text.includes('tooling')) {
    return 'moldChangeHours';
  }
  if (text.includes('purge') || text.includes('clean') || text.includes('burn') || text.includes('color')) {
    return 'purgeCleaningHours';
  }
  if (text.includes('heat') || text.includes('thermo') || text.includes('sensor') || text.includes('electrical')) {
    return 'heaterFailureHours';
  }
  if (text.includes('mech') || text.includes('puller') || text.includes('cutter') || text.includes('jam') || text.includes('haul')) {
    return 'mechanicalHours';
  }
  if (text.includes('order') || text.includes('resin') || text.includes('material') || text.includes('shortage') || text.includes('silo')) {
    return 'materialNoOrderHours';
  }
  return 'otherHours';
}

export const DOWNTIME_FIELD_KEYS = [
  'moldChangeHours',
  'purgeCleaningHours',
  'heaterFailureHours',
  'mechanicalHours',
  'materialNoOrderHours',
  'otherHours'
];

export function isDowntimeField(field) {
  return DOWNTIME_FIELD_KEYS.includes(field);
}

/**
 * Safely parse and round positive numeric value
 */
export function cleanPositiveNumber(val, decimals = 1) {
  if (val === '' || val == null) return 0;
  const num = Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.max(0, Math.round(num * factor) / factor);
}

/**
 * Apply input change to a matrix row with dynamic 24-hour auto-rebalancing
 */
export function applyMatrixRowInput(row, field, rawValue) {
  const isCleared = rawValue === '' || rawValue == null;
  const cleanVal = isCleared ? 0 : cleanPositiveNumber(rawValue, field === 'stdWeight' ? 2 : 1);

  const updated = {
    ...row,
    [field]: isCleared ? '' : cleanVal
  };

  // 1. Dynamic 24-Hour Auto-Rebalance Logic on Downtime Input:
  // When user modifies any of the 6 downtime categories:
  if (isDowntimeField(field)) {
    const moldChange = field === 'moldChangeHours' ? cleanVal : cleanPositiveNumber(row.moldChangeHours);
    const purgeClean = field === 'purgeCleaningHours' ? cleanVal : cleanPositiveNumber(row.purgeCleaningHours);
    const heaterFail = field === 'heaterFailureHours' ? cleanVal : cleanPositiveNumber(row.heaterFailureHours);
    const mechJam = field === 'mechanicalHours' ? cleanVal : cleanPositiveNumber(row.mechanicalHours);
    const matShort = field === 'materialNoOrderHours' ? cleanVal : cleanPositiveNumber(row.materialNoOrderHours);
    const otherStop = field === 'otherHours' ? cleanVal : cleanPositiveNumber(row.otherHours);

    const totalDowntime = round1(moldChange + purgeClean + heaterFail + mechJam + matShort + otherStop);
    if (row.isMultiRun) {
      const prevAccounted = (Number(row.totalAccountedHours) > 0 && Number(row.totalAccountedHours) <= 24)
        ? Number(row.totalAccountedHours)
        : round1((Number(row.operatingHours) || 0) + (Number(row.totalDowntimeHours) || 0));
      const targetBudget = prevAccounted > 0 ? prevAccounted : 24.0;
      updated.operatingHours = Math.max(0, round1(targetBudget - totalDowntime));
    } else {
      // Automatically adjust Operating Hours = Math.max(0, 24 - totalDowntime)
      updated.operatingHours = Math.max(0, round1(24.0 - totalDowntime));
    }
  } else if (field === 'operatingHours') {
    // If the user explicitly edits Operating Hours directly:
    updated.operatingHours = isCleared ? '' : cleanVal;
  }

  // 2. Keep Actual Kg in sync when Actual Pieces or Std Weight change
  if (field === 'actualPcs') {
    const stdWeight = cleanPositiveNumber(row.stdWeight, 2);
    updated.actualKg = round1(cleanVal * stdWeight);
  } else if (field === 'stdWeight') {
    const actualPcs = cleanPositiveNumber(row.actualPcs, 0);
    updated.actualKg = round1(actualPcs * cleanVal);
    // If stdWeight is updated and nominalCapacity exists, dynamically derive stdRate:
    if (cleanVal > 0 && Number(row.nominalCapacity) > 0) {
      updated.targetRate = round1(Number(row.nominalCapacity) / cleanVal);
    }
  }

  return calculateMatrixRowMetrics(updated);
}

/**
 * Calculate mathematical metrics for a single matrix row
 */
export function calculateMatrixRowMetrics(row) {
  const stdWeight = Math.max(0, Number(row.stdWeight) || 0);
  const nominalCap = Math.max(0, Number(row.nominalCapacity) || 0);
  let targetRate = Math.max(0, Number(row.targetRate ?? row.stdRate) || 0);
  if (targetRate <= 0 && nominalCap > 0 && stdWeight > 0) {
    targetRate = round1(nominalCap / stdWeight);
  }
  const actualPcs = Math.max(0, Math.round(Number(row.actualPcs) || 0));
  
  // Actual weight (kg)
  const actualKg = Number(row.actualKg) > 0
    ? round1(Number(row.actualKg))
    : round1(actualPcs * stdWeight);

  // Theoretical 24-hour baseline
  const expectedPcs = round1(24 * targetRate);
  const expectedKg = stdWeight > 0
    ? round1(expectedPcs * stdWeight)
    : (nominalCap > 0 ? round1(nominalCap * 24) : 0);

  // Deficit and lost output
  const deficitPcs = Math.max(0, round1(expectedPcs - actualPcs));
  const deficitKg = Math.max(0, round1(expectedKg - actualKg));
  const theoreticalLostHours = targetRate > 0 ? round1(deficitPcs / targetRate) : 0;
  const lostHours = theoreticalLostHours;

  // 24-hour time allocation hours
  let operatingHours = Math.max(0, round1(Number(row.operatingHours) || 0));
  const moldChangeHours = Math.max(0, round1(Number(row.moldChangeHours) || 0));
  const purgeCleaningHours = Math.max(0, round1(Number(row.purgeCleaningHours) || 0));
  const heaterFailureHours = Math.max(0, round1(Number(row.heaterFailureHours) || 0));
  const mechanicalHours = Math.max(0, round1(Number(row.mechanicalHours) || 0));
  const materialNoOrderHours = Math.max(0, round1(Number(row.materialNoOrderHours) || 0));
  const otherHours = Math.max(0, round1(Number(row.otherHours) || 0));

  const totalDowntimeHours = round1(
    moldChangeHours +
    purgeCleaningHours +
    heaterFailureHours +
    mechanicalHours +
    materialNoOrderHours +
    otherHours
  );

  const justifiedDowntimeHours = totalDowntimeHours;
  const unjustifiedLostHours = round1(Math.max(0, theoreticalLostHours - totalDowntimeHours));

  const isMulti = Boolean(row.isMultiRun || row.totalRuns > 1);
  if (!isMulti && (actualPcs > 0 || actualKg > 0) && (row.operatingHours == null || row.operatingHours === '' || (operatingHours === 0 && row.isOperating !== false && totalDowntimeHours < 24 && row.isExplicitlyZero !== true))) {
    operatingHours = Math.max(0, round1(24.0 - totalDowntimeHours));
  }

  const totalAccountedHours = round1(operatingHours + totalDowntimeHours);
  const varianceHours = round1(24.0 - totalAccountedHours);

  // Balance status
  let balanceStatus = 'balanced'; // 'balanced' | 'under' | 'over'
  let balanceLabel = '24.0h Balanced';
  if (Math.abs(varianceHours) <= 0.05) {
    balanceStatus = 'balanced';
    balanceLabel = '24.0h Balanced';
  } else if (varianceHours > 0.05) {
    balanceStatus = 'under';
    balanceLabel = `${varianceHours}h Remaining`;
  } else {
    balanceStatus = 'over';
    balanceLabel = `+${round1(Math.abs(varianceHours))}h Exceeded`;
  }

  // Scrap & Quality Formulation (Industrial Plastics OEE)
  const scrapKg = cleanPositiveNumber(row.scrapKg, 1);
  const totalMeltProcessedKg = round1(actualKg + scrapKg);
  const totalProcessedKg = totalMeltProcessedKg;
  const qualityPct = totalMeltProcessedKg > 0
    ? round1((actualKg / totalMeltProcessedKg) * 100)
    : 100.0;

  // OEE Telemetry
  const availabilityPct = round1((operatingHours / 24.0) * 100);
  const targetOutputForOperating = round1(operatingHours * targetRate);
  const performancePct = targetOutputForOperating > 0
    ? round1(Math.min(100, (actualPcs / targetOutputForOperating) * 100))
    : (operatingHours === 0 && actualPcs === 0 ? 0 : 0);
  const oeePct = round1((availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100) * 100);

  // Realized Pace / Actual Operating Rate
  let actualRatePcsH = (operatingHours > 0 && actualPcs > 0)
    ? round1(actualPcs / operatingHours)
    : 0;

  let actualRateKgH = (operatingHours > 0 && actualKg > 0)
    ? round1(actualKg / operatingHours)
    : (stdWeight > 0 ? round1(actualRatePcsH * stdWeight) : 0);

  if (actualRatePcsH <= 0 && actualRateKgH > 0 && stdWeight > 0) {
    actualRatePcsH = round1(actualRateKgH / stdWeight);
  }
  if (actualRateKgH <= 0 && actualRatePcsH > 0 && stdWeight > 0) {
    actualRateKgH = round1(actualRatePcsH * stdWeight);
  }

  const speedEfficiencyPct = nominalCap > 0
    ? round1((actualRateKgH / nominalCap) * 100)
    : (targetRate > 0 ? round1((actualRatePcsH / targetRate) * 100) : 0);

  return {
    ...row,
    targetRate,
    stdWeight,
    nominalCapacity: nominalCap,
    actualPcs,
    actualKg,
    scrapKg: row.scrapKg === '' ? '' : scrapKg,
    totalMeltProcessedKg,
    totalProcessedKg,
    qualityPct,
    expectedPcs,
    expectedKg,
    deficitPcs,
    deficitKg,
    theoreticalLostHours,
    lostHours,
    justifiedDowntimeHours,
    unjustifiedLostHours,
    actualRatePcsH,
    actualRateKgH,
    speedEfficiencyPct,
    operatingHours: row.operatingHours === '' ? '' : operatingHours,
    moldChangeHours: row.moldChangeHours === '' ? '' : moldChangeHours,
    purgeCleaningHours: row.purgeCleaningHours === '' ? '' : purgeCleaningHours,
    heaterFailureHours: row.heaterFailureHours === '' ? '' : heaterFailureHours,
    mechanicalHours: row.mechanicalHours === '' ? '' : mechanicalHours,
    materialNoOrderHours: row.materialNoOrderHours === '' ? '' : materialNoOrderHours,
    otherHours: row.otherHours === '' ? '' : otherHours,
    totalDowntimeHours,
    totalAccountedHours,
    varianceHours,
    balanceStatus,
    balanceLabel,
    availabilityPct,
    performancePct,
    oeePct
  };
}

/**
 * Auto-balance row hours to reach exactly 24.0 hours
 * Mode: 'adjust_op' (sets operating hours = 24 - downtimes)
 *       'adjust_other' (assigns deficit to Other Stoppages)
 */
export function autoBalanceRowHours(row, mode = 'adjust_op') {
  const current = calculateMatrixRowMetrics(row);
  if (current.balanceStatus === 'balanced') return current;

  if (mode === 'adjust_op') {
    const newOp = Math.max(0, round1(24.0 - current.totalDowntimeHours));
    return calculateMatrixRowMetrics({
      ...current,
      operatingHours: newOp
    });
  }

  if (mode === 'adjust_other') {
    const otherDowntimes = round1(
      current.moldChangeHours +
      current.purgeCleaningHours +
      current.heaterFailureHours +
      current.mechanicalHours +
      current.materialNoOrderHours
    );
    const newOther = Math.max(0, round1(24.0 - (current.operatingHours + otherDowntimes)));
    return calculateMatrixRowMetrics({
      ...current,
      otherHours: newOther
    });
  }

  return current;
}

/**
 * Calculate coupled 24-hour status for a machine that runs multiple items/runs
 */
export function calculateMultiRunMachineStatus(rows = [], parentLineId = '') {
  if (!parentLineId) return null;

  const siblingRuns = rows.filter(
    (r) =>
      (r.parentLineId === parentLineId || r.baseLineId === parentLineId || r.lineId === parentLineId) &&
      (r.isMultiRun || r.totalRuns > 1)
  );

  if (siblingRuns.length === 0) {
    const singleRow = rows.find((r) => r.lineId === parentLineId || r.baseLineId === parentLineId);
    if (!singleRow) return null;
    return {
      parentLineId,
      lineName: singleRow.lineName || parentLineId,
      runCount: 1,
      totalMachineAccountedHours: Number(singleRow.totalAccountedHours) || 0,
      machineVarianceHours: Number(singleRow.varianceHours) || 0,
      machineBalanceStatus: singleRow.balanceStatus || 'balanced',
      machineBalanceLabel: singleRow.balanceLabel || '24.0h Balanced',
      isCoupledBalanced: Math.abs(Number(singleRow.varianceHours) || 0) <= 0.05
    };
  }

  const lineName = siblingRuns[0].lineName
    ? siblingRuns[0].lineName.replace(/\s*\[Run\s*\d+.*\]/, '')
    : parentLineId;
  const totalMachineAccountedHours = round1(
    siblingRuns.reduce((sum, r) => sum + (Number(r.totalAccountedHours) || 0), 0)
  );
  const machineVarianceHours = round1(24.0 - totalMachineAccountedHours);

  let machineBalanceStatus = 'balanced';
  let machineBalanceLabel = '24.0h Balanced';
  if (Math.abs(machineVarianceHours) <= 0.05) {
    machineBalanceStatus = 'balanced';
    machineBalanceLabel = '24.0h Balanced';
  } else if (machineVarianceHours > 0.05) {
    machineBalanceStatus = 'under';
    machineBalanceLabel = `${machineVarianceHours}h Remaining`;
  } else {
    machineBalanceStatus = 'over';
    machineBalanceLabel = `+${round1(Math.abs(machineVarianceHours))}h Exceeded`;
  }

  return {
    parentLineId,
    lineName,
    runCount: siblingRuns.length,
    totalMachineAccountedHours,
    machineVarianceHours,
    machineBalanceStatus,
    machineBalanceLabel,
    isCoupledBalanced: machineBalanceStatus === 'balanced'
  };
}

/**
 * Apply input change to rows with dynamic multi-run coupled 24-hour machine balancing
 */
export function applyCoupledMultiRunInput(rows = [], lineId = '', field = '', rawValue = '') {
  const targetIndex = rows.findIndex((r) => r.lineId === lineId);
  if (targetIndex === -1) return rows;

  const targetRow = rows[targetIndex];

  // If this is NOT a multi-run row, standard single-row update applies
  if (!targetRow.isMultiRun && !(targetRow.totalRuns > 1)) {
    const updated = applyMatrixRowInput(targetRow, field, rawValue);
    const newRows = [...rows];
    newRows[targetIndex] = updated;
    return newRows;
  }

  // It IS a multi-run row
  const parentLineId = targetRow.parentLineId || targetRow.baseLineId;
  const isTimeField = isDowntimeField(field) || field === 'operatingHours';

  // If not modifying a time field (e.g. stdWeight, targetRate, actualPcs, scrapKg):
  if (!isTimeField) {
    const updated = applyMatrixRowInput(targetRow, field, rawValue);
    const newRows = [...rows];
    newRows[targetIndex] = updated;
    return newRows;
  }

  // Modifying a time field on a multi-run row
  const isCleared = rawValue === '' || rawValue == null;
  const cleanVal = isCleared ? 0 : cleanPositiveNumber(rawValue, 1);

  // Find all sibling runs for this parent line
  const siblingIndices = [];
  rows.forEach((r, idx) => {
    if (
      (r.parentLineId === parentLineId || r.baseLineId === parentLineId) &&
      (r.isMultiRun || r.totalRuns > 1)
    ) {
      siblingIndices.push(idx);
    }
  });

  const updatedTarget = {
    ...targetRow,
    [field]: isCleared ? '' : cleanVal
  };

  const otherIndices = siblingIndices.filter((idx) => idx !== targetIndex);

  if (field === 'operatingHours') {
    updatedTarget.operatingHours = isCleared ? '' : cleanVal;
  } else if (isDowntimeField(field)) {
    // When modifying downtime on target row:
    const moldChange = field === 'moldChangeHours' ? cleanVal : cleanPositiveNumber(targetRow.moldChangeHours);
    const purgeClean = field === 'purgeCleaningHours' ? cleanVal : cleanPositiveNumber(targetRow.purgeCleaningHours);
    const heaterFail = field === 'heaterFailureHours' ? cleanVal : cleanPositiveNumber(targetRow.heaterFailureHours);
    const mechJam = field === 'mechanicalHours' ? cleanVal : cleanPositiveNumber(targetRow.mechanicalHours);
    const matShort = field === 'materialNoOrderHours' ? cleanVal : cleanPositiveNumber(targetRow.materialNoOrderHours);
    const otherStop = field === 'otherHours' ? cleanVal : cleanPositiveNumber(targetRow.otherHours);
    const targetDowntime = round1(moldChange + purgeClean + heaterFail + mechJam + matShort + otherStop);

    // Sum accounted hours of OTHER sibling runs:
    const otherAccountedSum = otherIndices.reduce(
      (sum, idx) => sum + (Number(rows[idx].totalAccountedHours) || 0),
      0
    );

    // Available operating hours budget for target row within 24h envelope:
    const availableForTarget = Math.max(0, round1(24.0 - otherAccountedSum));
    updatedTarget.operatingHours = Math.max(0, round1(availableForTarget - targetDowntime));
  }

  const calculatedTarget = calculateMatrixRowMetrics(updatedTarget);
  const newRows = [...rows];
  newRows[targetIndex] = calculatedTarget;

  // Rebalance sibling run(s) within shared 24.0h envelope:
  if (otherIndices.length === 1) {
    const otherIndex = otherIndices[0];
    const otherRow = rows[otherIndex];

    const targetAccounted = Number(calculatedTarget.totalAccountedHours) || 0;
    const remainingForOther = Math.max(0, round1(24.0 - targetAccounted));
    const otherDowntime = Number(otherRow.totalDowntimeHours) || 0;
    const newOtherOpHours = Math.max(0, round1(remainingForOther - otherDowntime));

    newRows[otherIndex] = calculateMatrixRowMetrics({
      ...otherRow,
      operatingHours: newOtherOpHours
    });
  } else if (otherIndices.length > 1) {
    // For machines with >2 runs: adjust the last run
    const targetAccounted = Number(calculatedTarget.totalAccountedHours) || 0;
    let intermediateAccounted = 0;
    for (let i = 0; i < otherIndices.length - 1; i++) {
      intermediateAccounted += Number(rows[otherIndices[i]].totalAccountedHours) || 0;
    }
    const lastOtherIndex = otherIndices[otherIndices.length - 1];
    const lastOtherRow = rows[lastOtherIndex];
    const remainingForLast = Math.max(0, round1(24.0 - (targetAccounted + intermediateAccounted)));
    const lastDowntime = Number(lastOtherRow.totalDowntimeHours) || 0;
    const newLastOpHours = Math.max(0, round1(remainingForLast - lastDowntime));

    newRows[lastOtherIndex] = calculateMatrixRowMetrics({
      ...lastOtherRow,
      operatingHours: newLastOpHours
    });
  }

  return newRows;
}

/**
 * Auto-balance a multi-run machine across its runs to exactly 24.0 hours
 */
export function autoBalanceMultiRunMachine(rows = [], parentLineId = '') {
  const siblingIndices = [];
  rows.forEach((r, idx) => {
    if (
      (r.parentLineId === parentLineId || r.baseLineId === parentLineId) &&
      (r.isMultiRun || r.totalRuns > 1)
    ) {
      siblingIndices.push(idx);
    }
  });
  if (siblingIndices.length === 0) return rows;

  const newRows = [...rows];
  let accountedBeforeLast = 0;
  for (let i = 0; i < siblingIndices.length - 1; i++) {
    accountedBeforeLast += Number(newRows[siblingIndices[i]].totalAccountedHours) || 0;
  }
  const lastIndex = siblingIndices[siblingIndices.length - 1];
  const lastRow = newRows[lastIndex];
  const remainingForLast = Math.max(0, round1(24.0 - accountedBeforeLast));
  const lastDowntime = Number(lastRow.totalDowntimeHours) || 0;
  const newLastOp = Math.max(0, round1(remainingForLast - lastDowntime));

  newRows[lastIndex] = calculateMatrixRowMetrics({
    ...lastRow,
    operatingHours: newLastOp
  });
  return newRows;
}

/**
 * Build consolidated matrix rows for all machines on a target date
 */
export function buildMatrixRowsForDate({
  date,
  machineMaster = MACHINES,
  combinedDatasets = [],
  loadReportByDateAndMachineFn = null
}) {
  if (!date) return [];

  // Query production records for this date across all lines
  const recordsForDate = queryProductionRecordsForDate({
    dataset: combinedDatasets,
    date,
    machineMaster
  });

  return machineMaster.flatMap((machine) => {
    const lineId = machine.id;
    const lineName = machine.name || lineId;
    const nominalCapacity = getMachineNominalCapacity(lineId, machineMaster);

    // 1. Check if a saved report exists in storage
    const savedRep = typeof loadReportByDateAndMachineFn === 'function'
      ? loadReportByDateAndMachineFn(date, lineId)
      : null;

    // 2. Find matching records for this machine from ingested dataset
    const machineRecords = recordsForDate.filter((r) => {
      const matched = matchMachine(r.machineId || r.machineRaw, machineMaster);
      const lid = matched?.id || r.machineId || r.machineRaw;
      return lid === machine.id;
    });

    // Unpack any nested items array if record was pre-consolidated
    const allMachineItems = [];
    machineRecords.forEach((r) => {
      if (Array.isArray(r.items) && r.items.length > 1) {
        allMachineItems.push(...r.items);
      } else {
        allMachineItems.push(r);
      }
    });

    // Group by distinct item code / description
    const runsMap = new Map();
    allMachineItems.forEach((item) => {
      const code = String(
        item.itemCode ||
        item['Item Code'] ||
        item.productCode ||
        item.code ||
        ''
      ).trim();

      const desc = String(
        item.description ||
        item['Product Description & Specs'] ||
        item.productDescription ||
        item.productName ||
        item.pipeSize ||
        item.size ||
        ''
      ).trim();

      const groupKey = code || desc || 'default';
      if (!runsMap.has(groupKey)) {
        runsMap.set(groupKey, []);
      }
      runsMap.get(groupKey).push(item);
    });

    // Case 1: Multi-run detected from dataset (>1 distinct item runs)
    if (runsMap.size > 1) {
      const distinctRuns = Array.from(runsMap.entries()).map(([key, groupItems]) => {
        const first = groupItems[0];
        const itemCode = first.itemCode || first['Item Code'] || first.productCode || first.code || '';
        const description = first.description || first['Product Description & Specs'] || first.productDescription || first.productName || '';
        const pipeSize = first.pipeSize || first.size || first.dimension || description || '';
        const pipeLength = Number(first.cutLength || first.pipeLength || 6.0) || 6.0;

        let productionQty = groupItems.reduce((sum, it) => sum + (Number(it.productionQty ?? it.totalOutput ?? it.actual) || 0), 0);
        let totalWeight = groupItems.reduce((sum, it) => sum + (Number(it.totalWeight ?? it.weightKg) || 0), 0);

        let unitWeight = 0;
        for (const it of groupItems) {
          if (Number(it.unitWeight) > 0) {
            unitWeight = Number(it.unitWeight);
            break;
          }
          if (Number(it.weightPerPiece) > 0) {
            unitWeight = Number(it.weightPerPiece);
            break;
          }
          if (Number(it.raw?.weightPerPiece) > 0) {
            unitWeight = Number(it.raw.weightPerPiece);
            break;
          }
          if (Number(it.raw?.unitWeight) > 0) {
            unitWeight = Number(it.raw.unitWeight);
            break;
          }
        }
        if (unitWeight <= 0 && productionQty > 0 && totalWeight > 0) {
          unitWeight = round1(totalWeight / productionQty, 2);
        }
        if (totalWeight <= 0 && productionQty > 0 && unitWeight > 0) {
          totalWeight = round1(productionQty * unitWeight);
        }
        if (productionQty <= 0 && totalWeight > 0 && unitWeight > 0) {
          productionQty = Math.round(totalWeight / unitWeight);
        }

        const hasExplicitOp = groupItems.some((it) => {
          const rawObj = it.raw || it;
          return rawObj['Operating Hours'] != null || rawObj.operating_hours != null || (rawObj.operatingHours != null && rawObj.operatingHours < 24);
        });

        let explicitOpHours = null;
        if (hasExplicitOp) {
          explicitOpHours = groupItems.reduce((sum, it) => {
            const rawObj = it.raw || it;
            const val = rawObj['Operating Hours'] ?? rawObj.operating_hours ?? rawObj.operatingHours;
            return sum + (val != null ? Number(val) || 0 : 0);
          }, 0);
        }

        const scrapKg = groupItems.reduce((sum, it) => {
          const rawObj = it.raw || it;
          const val = rawObj.scrapKg ?? rawObj['Scrap (kg)'] ?? rawObj.scrap;
          return sum + (val != null && !isNaN(Number(val)) ? Number(val) : 0);
        }, 0);

        return {
          itemCode,
          description,
          pipeSize,
          pipeLength,
          actualPcs: productionQty,
          actualKg: totalWeight,
          scrapKg: round1(scrapKg),
          unitWeight,
          explicitOpHours: explicitOpHours != null && explicitOpHours > 0 ? explicitOpHours : null
        };
      });

      const totalMachineKg = distinctRuns.reduce((sum, r) => sum + r.actualKg, 0);
      const totalRuns = distinctRuns.length;
      const totalMoldChangeHours = (totalRuns - 1) * 2.0;
      const availableOpHours = Math.max(0, round1(24.0 - totalMoldChangeHours));

      let allocatedOpHoursSoFar = 0;
      return distinctRuns.map((run, idx) => {
        const runIndex = idx + 1;
        const isLast = runIndex === totalRuns;

        let runOpHours = 0;
        if (run.explicitOpHours != null && run.explicitOpHours > 0) {
          runOpHours = round1(run.explicitOpHours);
        } else if (isLast) {
          runOpHours = Math.max(0, round1(availableOpHours - allocatedOpHoursSoFar));
        } else if (totalMachineKg > 0) {
          runOpHours = round1((run.actualKg / totalMachineKg) * availableOpHours);
        } else {
          runOpHours = round1(availableOpHours / totalRuns);
        }
        allocatedOpHoursSoFar = round1(allocatedOpHoursSoFar + runOpHours);

        const moldChangeHours = runIndex === 1 ? 0 : 2.0;

        if ((run.actualPcs > 0 || run.actualKg > 0) && runOpHours <= 0) {
          runOpHours = Math.max(0, round1(24.0 - moldChangeHours));
        }

        let stdWeight = run.unitWeight > 0 ? run.unitWeight : 0;
        let unitWeightSource = run.unitWeight > 0 ? 'Daily Production Log (Unit Weight)' : '';
        if (stdWeight <= 0 && run.actualPcs > 0 && run.actualKg > 0) {
          stdWeight = round1(run.actualKg / run.actualPcs, 2);
          unitWeightSource = 'Derived from Actual Kg / Actual Pcs';
        }
        if (stdWeight <= 0 && run.itemCode) {
          const catMatch = SOP_FACTORY_PRESETS.find((p) => p.itemCode && p.itemCode.toUpperCase() === String(run.itemCode).trim().toUpperCase());
          if (catMatch && catMatch.unitWeight > 0) {
            stdWeight = catMatch.unitWeight;
            unitWeightSource = `Catalog Preset [Item ${run.itemCode}]`;
          }
        }
        let targetRate = (nominalCapacity > 0 && stdWeight > 0) ? round1(nominalCapacity / stdWeight) : 0;

        const pipeSizeDisplay = run.description || run.pipeSize || run.itemCode || `Run ${runIndex}`;
        const sourceAudit = {
          sheet: 'Daily Production Log',
          unitWeightSource: unitWeightSource || 'Default / Derived',
          qtySource: 'Production Qty (FG)',
          stdWeight,
          actualPcs: run.actualPcs,
          actualKg: run.actualKg,
          scrapKg: run.scrapKg || 0,
          nominalCapacity,
          summary: `Run ${runIndex}: ${run.actualPcs} pcs @ ${stdWeight} kg/pc (${run.actualKg} kg, ${round1(run.scrapKg || 0)} kg scrap) | Unit Wt: ${unitWeightSource || 'N/A'}`
        };
        const rawRow = {
          lineId: `${machine.id}-run-${runIndex}`,
          baseLineId: machine.id,
          parentLineId: machine.id,
          runId: `${machine.id}-R${runIndex}`,
          runIndex,
          totalRuns,
          isMultiRun: true,
          lineIdDisplay: `${machine.id} [R${runIndex}]`,
          lineName: `${machine.name} [Run ${runIndex}: ${run.itemCode || runIndex}]`,
          nominalCapacity,
          productCode: run.itemCode,
          productDescription: run.description || pipeSizeDisplay,
          pipeSize: pipeSizeDisplay,
          pipeLength: run.pipeLength,
          stdWeight,
          targetRate,
          actualPcs: run.actualPcs,
          actualKg: run.actualKg,
          scrapKg: run.scrapKg || 0,
          operatingHours: runOpHours,
          moldChangeHours,
          purgeCleaningHours: 0,
          heaterFailureHours: 0,
          mechanicalHours: 0,
          materialNoOrderHours: 0,
          otherHours: 0,
          isOperating: run.actualPcs > 0 || runOpHours > 0,
          isSaved: Boolean(savedRep?.isReconciled),
          isReconciled: Boolean(savedRep?.isReconciled),
          sourceAudit
        };
        return calculateMatrixRowMetrics(rawRow);
      });
    }

    // Case 2: Multi-run detected from saved report refs (when no records in dataset, but savedRep has refs['2'])
    if (runsMap.size === 0 && savedRep?.refs?.['2'] && (Number(savedRep.refs['2'].stdWeight) > 0 || Number(savedRep.refs['2'].targetRate) > 0 || savedRep.refs['2'].productDescription)) {
      const ref1 = savedRep.refs['1'] || {};
      const ref2 = savedRep.refs['2'] || {};
      const runs = [
        {
          itemCode: ref1.itemCode || savedRep.header?.itemCode || '',
          description: ref1.productDescription || '',
          pipeSize: ref1.productDescription || '',
          pipeLength: Number(ref1.pipeLength) || 6.0,
          stdWeight: Number(ref1.stdWeight) || 0,
          targetRate: Number(ref1.targetRate) || 0,
          runIndex: 1
        },
        {
          itemCode: ref2.itemCode || '',
          description: ref2.productDescription || '',
          pipeSize: ref2.productDescription || '',
          pipeLength: Number(ref2.pipeLength) || 6.0,
          stdWeight: Number(ref2.stdWeight) || 0,
          targetRate: Number(ref2.targetRate) || 0,
          runIndex: 2
        }
      ];

      return runs.map((run) => {
        const moldChangeHours = run.runIndex === 1 ? 0 : 2.0;
        const opHours = run.runIndex === 1 ? 20.0 : 2.0;
        let targetRate = run.targetRate;
        if (targetRate <= 0 && nominalCapacity > 0 && run.stdWeight > 0) {
          targetRate = round1(nominalCapacity / run.stdWeight);
        }
        const sourceAudit = {
          sheet: 'Saved Report',
          unitWeightSource: 'Saved Report Reference',
          qtySource: 'Saved Report',
          stdWeight: run.stdWeight,
          actualPcs: 0,
          actualKg: 0,
          scrapKg: 0,
          nominalCapacity,
          summary: `Saved Ref [Run ${run.runIndex}]: Std Wt ${run.stdWeight} kg/pc`
        };
        const rawRow = {
          lineId: `${machine.id}-run-${run.runIndex}`,
          baseLineId: machine.id,
          runIndex: run.runIndex,
          totalRuns: 2,
          isMultiRun: true,
          lineIdDisplay: `${machine.id} [R${run.runIndex}]`,
          lineName: `${machine.name} [Run ${run.runIndex}: ${run.itemCode || run.runIndex}]`,
          nominalCapacity,
          productCode: run.itemCode,
          productDescription: run.description || run.pipeSize,
          pipeSize: run.pipeSize || run.description,
          pipeLength: run.pipeLength,
          stdWeight: run.stdWeight,
          targetRate,
          actualPcs: 0,
          actualKg: 0,
          scrapKg: 0,
          operatingHours: opHours,
          moldChangeHours,
          purgeCleaningHours: 0,
          heaterFailureHours: 0,
          mechanicalHours: 0,
          materialNoOrderHours: 0,
          otherHours: 0,
          isOperating: true,
          isSaved: Boolean(savedRep.isReconciled),
          isReconciled: Boolean(savedRep.isReconciled),
          sourceAudit
        };
        return calculateMatrixRowMetrics(rawRow);
      });
    }

    // Case 3: Clean Single Row (Single-item lines = 95% of the plant, or idle machine)
    const record = allMachineItems.length > 0 ? allMachineItems[0] : null;

    // Product specs & Pipe Size
    const ref1 = savedRep?.refs?.['1'] || {};
    const productCode = savedRep?.header?.itemCode ||
      record?.productCode ||
      record?.itemCode ||
      record?.['Item Code'] ||
      record?.code ||
      '';

    let productDescription = ref1.productDescription ||
      record?.productDescription ||
      record?.description ||
      record?.productName ||
      record?.['Product Description & Specs'] ||
      record?.desc ||
      record?.specDescription ||
      record?.size ||
      '';

    const pipeSize = record?.pipeSize ||
      record?.size ||
      record?.dimension ||
      record?.raw?.size ||
      '';

    if (!productDescription && pipeSize) {
      productDescription = pipeSize;
    }

    const pipeLength = Number(ref1.pipeLength) || Number(record?.cutLength) || 6.0;

    // Strict Precedence Hierarchy for Unit Weight:
    // 1. Explicit user override from reconciled saved report
    // 2. Parsed row Unit Weight (kg) (50.00 kg from Daily Production Log)
    // 3. Weight per piece from record
    // 4. Raw record unit weight / weight per piece
    // 5. Saved report ref1.stdWeight (if unreconciled)
    // 6. Weight per meter * pipeLength
    // 7. Division fallback: totalWeight / productionQty
    // 8. Catalog lookup by Item Code (only if row unit weight is 0)
    let stdWeight = 0;
    let unitWeightSource = '';

    if (savedRep?.isReconciled && Number(ref1.stdWeight) > 0) {
      stdWeight = Number(ref1.stdWeight);
      unitWeightSource = 'Reconciled Report Override';
    } else if (record && Number(record.unitWeight) > 0) {
      stdWeight = Number(record.unitWeight);
      unitWeightSource = 'Daily Production Log (Unit Weight)';
    } else if (record && Number(record.weightPerPiece) > 0) {
      stdWeight = Number(record.weightPerPiece);
      unitWeightSource = 'Record Weight Per Piece';
    } else if (record && Number(record.raw?.unitWeight) > 0) {
      stdWeight = Number(record.raw.unitWeight);
      unitWeightSource = 'Raw Record Unit Weight';
    } else if (record && Number(record.raw?.weightPerPiece) > 0) {
      stdWeight = Number(record.raw.weightPerPiece);
      unitWeightSource = 'Raw Record Weight Per Piece';
    } else if (Number(ref1.stdWeight) > 0) {
      stdWeight = Number(ref1.stdWeight);
      unitWeightSource = 'Saved Report Reference';
    } else if (record && Number(record.weightPerMeter) > 0 && pipeLength > 0) {
      stdWeight = round1(Number(record.weightPerMeter) * pipeLength);
      unitWeightSource = 'Weight Per Meter Calculation';
    } else if (record && Number(record.totalWeight) > 0 && Number(record.productionQty) > 0) {
      stdWeight = round1(Number(record.totalWeight) / Number(record.productionQty), 2);
      unitWeightSource = 'Total Weight / Production Qty';
    } else if (productCode) {
      const catMatch = SOP_FACTORY_PRESETS.find((p) => p.itemCode && p.itemCode.toUpperCase() === String(productCode).trim().toUpperCase());
      if (catMatch && catMatch.unitWeight > 0) {
        stdWeight = catMatch.unitWeight;
        unitWeightSource = `Catalog Preset [Item ${productCode}]`;
      }
    }

    // Production output:
    // Precedence: Reconciled Report > Production Qty (FG) > Shift A + Shift B > Saved Slots Output > Zero-piece recovery
    let actualPcs = 0;
    let qtySource = '';

    if (savedRep?.isReconciled && savedRep?.summary?.totalOutput != null && savedRep.summary.totalOutput !== '') {
      actualPcs = Math.round(Number(savedRep.summary.totalOutput) || 0);
      qtySource = 'Reconciled Report';
    } else if (record) {
      const fgQty = Number(record.productionQty ?? record['Production Qty (FG)'] ?? record.totalOutput ?? record.actual);
      if (!isNaN(fgQty) && fgQty > 0) {
        actualPcs = Math.round(fgQty);
        qtySource = 'Production Qty (FG)';
      } else {
        const shiftA = Number(record['Shift A (Pcs)'] ?? record['Shift A'] ?? record.shiftA ?? 0) || 0;
        const shiftB = Number(record['Shift B (Pcs)'] ?? record['Shift B'] ?? record.shiftB ?? 0) || 0;
        if (shiftA > 0 || shiftB > 0) {
          actualPcs = shiftA + shiftB;
          qtySource = 'Shift A + Shift B';
        }
      }
    } else if (savedRep?.summary?.totalOutput != null && savedRep.summary.totalOutput !== '') {
      actualPcs = Math.round(Number(savedRep.summary.totalOutput) || 0);
      qtySource = 'Saved Summary Output';
    } else if (Array.isArray(savedRep?.slots) && savedRep.slots.length > 0) {
      const slotSum = savedRep.slots.reduce((sum, s) => sum + (Number(s.actual) || 0), 0);
      if (slotSum > 0) {
        actualPcs = Math.round(slotSum);
        qtySource = 'Saved Slots Output';
      }
    }

    let actualKg = 0;
    if (savedRep?.isReconciled && Number(savedRep?.engineering?.totalWeightKg) > 0) {
      actualKg = Number(savedRep.engineering.totalWeightKg);
    } else if (record && Number(record.totalWeight ?? record.weightKg) > 0) {
      actualKg = Number(record.totalWeight ?? record.weightKg);
    } else if (Number(savedRep?.engineering?.totalWeightKg) > 0) {
      actualKg = Number(savedRep.engineering.totalWeightKg);
    } else if (stdWeight > 0 && actualPcs > 0) {
      actualKg = round1(actualPcs * stdWeight);
    }

    // Zero-piece recovery
    if (actualPcs <= 0 && actualKg > 0 && stdWeight > 0) {
      actualPcs = Math.round(actualKg / stdWeight);
      qtySource = 'Recovered from Total Weight / Std Weight';
    }
    if (stdWeight <= 0 && actualPcs > 0 && actualKg > 0) {
      stdWeight = round1(actualKg / actualPcs, 2);
      unitWeightSource = 'Derived from Actual Kg / Actual Pcs';
    }
    if (actualKg <= 0 && actualPcs > 0 && stdWeight > 0) {
      actualKg = round1(actualPcs * stdWeight);
    }
    if (actualPcs <= 0 && actualKg > 0) {
      actualPcs = actualKg;
      if (stdWeight <= 0) stdWeight = 1.0;
    }

    const hasProduction = actualPcs > 0 || actualKg > 0;

    // Standard rate
    let targetRate = 0;
    if (nominalCapacity > 0 && stdWeight > 0) {
      targetRate = round1(nominalCapacity / stdWeight);
    } else if (Number(ref1.targetRate) > 0) {
      targetRate = Number(ref1.targetRate);
    } else if (savedRep?.slots?.[0]?.rate > 0) {
      targetRate = Number(savedRep.slots[0].rate);
    } else if (Number(record?.standardRate) > 0) {
      targetRate = Number(record.standardRate);
    } else if (Number(record?.raw?.standardRate) > 0) {
      targetRate = Number(record.raw.standardRate);
    } else if (Number(record?.raw?.targetRate) > 0) {
      targetRate = Number(record.raw.targetRate);
    } else if (Number(record?.speed) > 0 && pipeLength > 0) {
      targetRate = round1((Number(record.speed) * 60) / pipeLength);
    } else if (Number(record?.raw?.speed) > 0 && pipeLength > 0) {
      targetRate = round1((Number(record.raw.speed) * 60) / pipeLength);
    }

    let scrapKg = 0;
    if (savedRep?.isReconciled && savedRep?.engineering?.scrapKg != null) {
      scrapKg = Math.max(0, cleanPositiveNumber(savedRep.engineering.scrapKg, 1));
    } else if (record && (record.scrapKg != null || record['Scrap (kg)'] != null || record.scrap != null)) {
      scrapKg = Math.max(0, cleanPositiveNumber(record.scrapKg ?? record['Scrap (kg)'] ?? record.scrap, 1));
    } else if (record?.raw && (record.raw.scrapKg != null || record.raw['Scrap (kg)'] != null || record.raw.scrap != null)) {
      scrapKg = Math.max(0, cleanPositiveNumber(record.raw.scrapKg ?? record.raw['Scrap (kg)'] ?? record.raw.scrap, 1));
    } else if (savedRep?.engineering?.scrapKg != null) {
      scrapKg = Math.max(0, cleanPositiveNumber(savedRep.engineering.scrapKg, 1));
    }

    const sourceAudit = {
      sheet: record?.sheetName || 'Daily Production Log',
      unitWeightSource: unitWeightSource || 'Default',
      qtySource: qtySource || 'Default',
      stdWeight,
      actualPcs,
      actualKg,
      scrapKg,
      nominalCapacity,
      summary: `Logged: ${actualPcs} pcs @ ${stdWeight} kg/pc (${actualKg} kg, ${scrapKg} kg scrap) | Unit Wt: ${unitWeightSource || 'N/A'}`
    };

    // Initial operating and downtime hours
    let operatingHours = 24.0;
    let moldChangeHours = 0;
    let purgeCleaningHours = 0;
    let heaterFailureHours = 0;
    let mechanicalHours = 0;
    let materialNoOrderHours = 0;
    let otherHours = 0;

    const hasSavedReport = Boolean(savedRep && Array.isArray(savedRep.slots) && savedRep.slots.length === 24);
    const hasExplicitSavedBreakdown = Boolean(
      hasSavedReport &&
      (savedRep.isReconciled || (Array.isArray(savedRep.downtimeEvents) && savedRep.downtimeEvents.length > 0))
    );

    if (hasExplicitSavedBreakdown) {
      // Restore from saved report
      const events = Array.isArray(savedRep.downtimeEvents) ? savedRep.downtimeEvents : [];
      events.forEach((ev) => {
        const cat = categorizeDowntimeReason(ev.reason);
        const hrs = round1((Number(ev.durationMin) || 0) / 60);
        if (cat === 'moldChangeHours') moldChangeHours = round1(moldChangeHours + hrs);
        else if (cat === 'purgeCleaningHours') purgeCleaningHours = round1(purgeCleaningHours + hrs);
        else if (cat === 'heaterFailureHours') heaterFailureHours = round1(heaterFailureHours + hrs);
        else if (cat === 'mechanicalHours') mechanicalHours = round1(mechanicalHours + hrs);
        else if (cat === 'materialNoOrderHours') materialNoOrderHours = round1(materialNoOrderHours + hrs);
        else otherHours = round1(otherHours + hrs);
      });

      if (events.length === 0) {
        savedRep.slots.forEach((s) => {
          const dt = Number(s.downtime) || 0;
          if (dt > 0) {
            const cat = categorizeDowntimeReason(s.reason);
            const hrs = round1(dt / 60);
            if (cat === 'moldChangeHours') moldChangeHours = round1(moldChangeHours + hrs);
            else if (cat === 'purgeCleaningHours') purgeCleaningHours = round1(purgeCleaningHours + hrs);
            else if (cat === 'heaterFailureHours') heaterFailureHours = round1(heaterFailureHours + hrs);
            else if (cat === 'mechanicalHours') mechanicalHours = round1(mechanicalHours + hrs);
            else if (cat === 'materialNoOrderHours') materialNoOrderHours = round1(materialNoOrderHours + hrs);
            else otherHours = round1(otherHours + hrs);
          }
        });
      }

      const totalDt = round1(
        moldChangeHours +
        purgeCleaningHours +
        heaterFailureHours +
        mechanicalHours +
        materialNoOrderHours +
        otherHours
      );

      if (hasProduction) {
        const savedOpHours = savedRep.engineering?.operatingHours != null
          ? round1(Number(savedRep.engineering.operatingHours))
          : round1(savedRep.slots.filter((s) => (Number(s.downtime) || 0) < 60).length);

        if (savedOpHours > 0 && totalDt + savedOpHours <= 24.05) {
          operatingHours = savedOpHours;
        } else {
          operatingHours = Math.max(0, round1(24.0 - totalDt));
        }

        if (operatingHours <= 0) {
          operatingHours = Math.max(0, round1(24.0 - totalDt));
        }
      } else {
        operatingHours = 0.0;
        if (totalDt === 0) {
          materialNoOrderHours = 24.0;
        }
      }
    } else {
      if (hasProduction) {
        // Every machine that reported actual production (actualPcs > 0 or actualKg > 0)
        // MUST default to operatingHours = 24.0h and 0.0h downtime on initial matrix load
        operatingHours = 24.0;
        moldChangeHours = 0;
        purgeCleaningHours = 0;
        heaterFailureHours = 0;
        mechanicalHours = 0;
        materialNoOrderHours = 0;
        otherHours = 0;
      } else {
        // Only true idle machines (0 pieces and 0 kg produced) should have
        // operatingHours = 0 and Material/No Order = 24h
        operatingHours = 0.0;
        moldChangeHours = 0;
        purgeCleaningHours = 0;
        heaterFailureHours = 0;
        mechanicalHours = 0;
        materialNoOrderHours = 24.0;
        otherHours = 0;
      }
    }

    const isOperating = hasProduction || (record != null && (Number(record.operatingHours) > 0 || Number(record.productionQty) > 0 || Number(record.totalWeight) > 0));
    const pipeSizeDisplay = productDescription || pipeSize || productCode || (isOperating ? 'Standard Extrusion Run' : 'Idle / No Order');

    const rawRow = {
      lineId,
      baseLineId: lineId,
      runIndex: 1,
      totalRuns: 1,
      isMultiRun: false,
      lineIdDisplay: lineId,
      lineName,
      nominalCapacity,
      productCode,
      productDescription: productDescription || pipeSizeDisplay,
      pipeSize: pipeSizeDisplay,
      pipeLength,
      stdWeight,
      targetRate,
      actualPcs,
      actualKg,
      scrapKg,
      operatingHours,
      moldChangeHours,
      purgeCleaningHours,
      heaterFailureHours,
      mechanicalHours,
      materialNoOrderHours,
      otherHours,
      isOperating,
      isSaved: Boolean(savedRep?.isReconciled),
      isReconciled: Boolean(savedRep?.isReconciled),
      sourceAudit
    };

    return [calculateMatrixRowMetrics(rawRow)];
  });
}

/**
 * Reconcile a single matrix row and update 24-hour slots and engineering parameters
 */
export function reconcileMatrixRow(row, baseReport = null, machineMaster = MACHINES) {
  const metrics = calculateMatrixRowMetrics(row);
  const targetDate = metrics.date || baseReport?.header?.date;
  const targetLineId = row.baseLineId || row.lineId || metrics.lineId;

  // Initialize report if not supplied
  let rep = baseReport;
  if (!rep || !Array.isArray(rep.slots) || rep.slots.length !== 24) {
    rep = blankReportForMachine(targetDate, targetLineId, machineMaster);
  }

  // Construct active presets based on allocated category hours
  const presets = [];

  if (metrics.moldChangeHours > 0) {
    presets.push({
      id: 'mold_change',
      name: 'Die / Mold Changeover',
      durationMin: Math.round(metrics.moldChangeHours * 60),
      startSlot: 2,
      reason: 'Die / Mold Changeover',
      enabled: true
    });
  }

  if (metrics.purgeCleaningHours > 0) {
    presets.push({
      id: 'purge_cleaning',
      name: 'Color / Material Purge & Cleaning',
      durationMin: Math.round(metrics.purgeCleaningHours * 60),
      startSlot: 6,
      reason: 'Color / Material Purge & Cleaning',
      enabled: true
    });
  }

  if (metrics.heaterFailureHours > 0) {
    presets.push({
      id: 'heater_failure',
      name: 'Heater / Thermocouple Failure',
      durationMin: Math.round(metrics.heaterFailureHours * 60),
      startSlot: 4,
      reason: 'Heater / Thermocouple Failure',
      enabled: true
    });
  }

  if (metrics.mechanicalHours > 0) {
    presets.push({
      id: 'mechanical_jam',
      name: 'Mechanical Jam / Puller Fix',
      durationMin: Math.round(metrics.mechanicalHours * 60),
      startSlot: 10,
      reason: 'Mechanical Jam / Puller Fix',
      enabled: true
    });
  }

  if (metrics.materialNoOrderHours > 0) {
    const isFullDay = metrics.materialNoOrderHours >= 23.95;
    presets.push({
      id: isFullDay ? 'no_order' : 'material_shortage',
      name: isFullDay ? 'No Order' : 'Raw Material Shortage / No Resin',
      durationMin: Math.round(metrics.materialNoOrderHours * 60),
      startSlot: 0,
      reason: isFullDay ? 'No Order' : 'Raw Material Shortage / No Order',
      enabled: true
    });
  }

  if (metrics.otherHours > 0) {
    presets.push({
      id: 'custom_breakdown',
      name: 'Other Operational Stoppages',
      durationMin: Math.round(metrics.otherHours * 60),
      startSlot: 14,
      reason: 'Other Operational Stoppages',
      enabled: true
    });
  }

  // Prepare ref specs in report
  rep.refs = rep.refs || {};
  const refKey = row.isMultiRun && row.runIndex ? String(row.runIndex) : '1';
  rep.refs[refKey] = rep.refs[refKey] || makeRefSpec();
  rep.refs[refKey].targetRate = metrics.targetRate;
  rep.refs[refKey].stdWeight = metrics.stdWeight;
  if (metrics.productCode) {
    if (refKey === '1') rep.header.itemCode = metrics.productCode;
    rep.refs[refKey].itemCode = metrics.productCode;
  }
  if (metrics.productDescription) {
    rep.refs[refKey].productDescription = metrics.productDescription;
  }
  if (metrics.pipeLength > 0) {
    rep.refs[refKey].pipeLength = metrics.pipeLength;
  }

  rep.header.lineId = targetLineId;
  rep.header.machineId = targetLineId;
  if (row.runId) rep.header.runId = row.runId;
  if (row.baseLineId || row.parentLineId) rep.header.parentLineId = row.baseLineId || row.parentLineId;
  if (row.runIndex) rep.header.runIndex = row.runIndex;
  if (row.isMultiRun) rep.header.isMultiRun = true;

  const totalDowntimeMin = presets.reduce((sum, p) => sum + p.durationMin, 0);

  // Execute reverse OEE reconciliation
  const reconciled = reconcileShiftRun(rep, {
    totalActualPieces: metrics.actualPcs,
    zeroDowntime: totalDowntimeMin === 0 && metrics.operatingHours >= 23.9,
    mode: 'preset',
    presets
  });

  const opHours = metrics.operatingHours;
  const totalWeightKg = metrics.actualKg > 0 ? metrics.actualKg : round1(metrics.actualPcs * metrics.stdWeight);
  const actualRateKgH = opHours > 0 && totalWeightKg > 0 ? round1(totalWeightKg / opHours) : 0;
  const nominalCap = metrics.nominalCapacity > 0 ? metrics.nominalCapacity : getMachineNominalCapacity(targetLineId, machineMaster);
  const capacityUtilizationPct = nominalCap > 0 ? round1((actualRateKgH / nominalCap) * 100) : 0;
  const actualRatePcsH = opHours > 0 ? round1(metrics.actualPcs / opHours) : 0;

  return {
    ...rep,
    isReconciled: true,
    updatedAt: Date.now(),
    slots: reconciled.updatedSlots,
    downtimeEvents: reconciled.downtimeEvents,
    summary: {
      ...rep.summary,
      totalOutput: String(metrics.actualPcs)
    },
    engineering: {
      ...rep.engineering,
      operatingHours: opHours,
      totalWeightKg,
      scrapKg: metrics.scrapKg || 0,
      totalMeltProcessedKg: metrics.totalMeltProcessedKg || totalWeightKg,
      qualityPct: metrics.qualityPct != null ? metrics.qualityPct : 100.0,
      actualRateKgH,
      capacityUtilizationPct,
      actualRatePcsH,
      nominalCapacityKgH: nominalCap
    }
  };
}

/**
 * Generate formatted Excel Workbook from Matrix rows
 */
export function exportMatrixToWorkbook(rows = [], date = '') {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Line ID',
    'Machine Name',
    'Pipe Size & Specs',
    'Nominal Cap (kg/h)',
    'Product Code',
    'Std Weight (kg/pc)',
    'Std Rate (Pcs/h)',
    'Expected 24h (Pcs)',
    'Expected 24h (Kg)',
    'Actual Output (Pcs)',
    'Actual Output (Kg)',
    'Deficit Output (Pcs)',
    'Deficit Output (Kg)',
    'Lost Hours (h)',
    'Operating Hours (h)',
    'Actual Rate (Pcs/h)',
    'Actual Rate (kg/h)',
    'Speed Efficiency (%)',
    'Die/Mold Change (h)',
    'Purge & Cleaning (h)',
    'Heater Failures (h)',
    'Mechanical Jam (h)',
    'Material/No Order (h)',
    'Other Stoppages (h)',
    'Total Accounted (h)',
    'Balance Status',
    'Availability (%)',
    'Performance (%)',
    'OEE (%)'
  ];

  const dataRows = rows.map((r) => [
    r.lineIdDisplay || r.lineId,
    r.lineName,
    r.pipeSize || r.productDescription || '-',
    r.nominalCapacity,
    r.productCode || '-',
    r.stdWeight,
    r.targetRate,
    r.expectedPcs,
    r.expectedKg,
    r.actualPcs,
    r.actualKg,
    r.deficitPcs,
    r.deficitKg,
    r.lostHours,
    r.operatingHours,
    r.actualRatePcsH,
    r.actualRateKgH,
    r.speedEfficiencyPct,
    r.moldChangeHours,
    r.purgeCleaningHours,
    r.heaterFailureHours,
    r.mechanicalHours,
    r.materialNoOrderHours,
    r.otherHours,
    r.totalAccountedHours,
    r.balanceLabel,
    r.availabilityPct,
    r.performancePct,
    r.oeePct
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

  // Set column widths
  ws['!cols'] = [
    { wch: 10 }, // Line ID
    { wch: 18 }, // Machine Name
    { wch: 28 }, // Pipe Size & Specs
    { wch: 18 }, // Nominal Cap
    { wch: 16 }, // Product Code
    { wch: 16 }, // Std Weight
    { wch: 15 }, // Std Rate
    { wch: 16 }, // Expected Pcs
    { wch: 16 }, // Expected Kg
    { wch: 16 }, // Actual Pcs
    { wch: 16 }, // Actual Kg
    { wch: 16 }, // Deficit Pcs
    { wch: 16 }, // Deficit Kg
    { wch: 14 }, // Lost Hours
    { wch: 16 }, // Operating Hours
    { wch: 18 }, // Actual Rate Pcs/h
    { wch: 18 }, // Actual Rate kg/h
    { wch: 18 }, // Speed Efficiency %
    { wch: 16 }, // Die/Mold
    { wch: 16 }, // Purge
    { wch: 16 }, // Heater
    { wch: 16 }, // Mech
    { wch: 18 }, // Material/No Order
    { wch: 16 }, // Other
    { wch: 16 }, // Total Accounted
    { wch: 16 }, // Balance Status
    { wch: 14 }, // Availability
    { wch: 14 }, // Performance
    { wch: 12 }  // OEE
  ];

  XLSX.utils.book_append_sheet(wb, ws, `Reconciliation_${date || 'Daily'}`);
  return wb;
}
