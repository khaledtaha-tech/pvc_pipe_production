import { MACHINES, matchMachine } from '../config/machines.js';
import { round1, makeRefSpec, HOUR_WINDOWS } from './engine.js';
import { consolidateDailyMachineRecords, convertLogRowToReport } from './excelParser.js';
import { queryProductionRecords, queryProductionRecordsForDate, reconcileShiftRun, blankReportForMachine } from './oeeReconciler.js';
import { getMachineNominalCapacity } from './machineSettingsConfig.js';
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
    // Automatically adjust Operating Hours = Math.max(0, 24 - totalDowntime)
    updated.operatingHours = Math.max(0, round1(24.0 - totalDowntime));
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
  const lostHours = targetRate > 0 ? round1(deficitPcs / targetRate) : 0;

  // 24-hour time allocation hours
  const operatingHours = Math.max(0, round1(Number(row.operatingHours) || 0));
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

  // OEE Telemetry
  const availabilityPct = round1((operatingHours / 24.0) * 100);
  const targetOutputForOperating = round1(operatingHours * targetRate);
  const performancePct = targetOutputForOperating > 0
    ? round1(Math.min(100, (actualPcs / targetOutputForOperating) * 100))
    : (operatingHours === 0 && actualPcs === 0 ? 0 : 0);
  const oeePct = round1((availabilityPct / 100) * (performancePct / 100) * 100);

  // Realized Pace / Actual Operating Rate
  const actualRatePcsH = (operatingHours > 0 && actualPcs > 0)
    ? round1(actualPcs / operatingHours)
    : 0;

  const actualRateKgH = (operatingHours > 0 && actualKg > 0)
    ? round1(actualKg / operatingHours)
    : round1(actualRatePcsH * stdWeight);

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
    expectedPcs,
    expectedKg,
    deficitPcs,
    deficitKg,
    lostHours,
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

        return {
          itemCode,
          description,
          pipeSize,
          pipeLength,
          actualPcs: productionQty,
          actualKg: totalWeight,
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

        let stdWeight = run.unitWeight > 0 ? run.unitWeight : 0;
        if (stdWeight <= 0 && run.actualPcs > 0 && run.actualKg > 0) {
          stdWeight = round1(run.actualKg / run.actualPcs, 2);
        }
        let targetRate = (nominalCapacity > 0 && stdWeight > 0) ? round1(nominalCapacity / stdWeight) : 0;

        const pipeSizeDisplay = run.description || run.pipeSize || run.itemCode || `Run ${runIndex}`;
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
          operatingHours: runOpHours,
          moldChangeHours,
          purgeCleaningHours: 0,
          heaterFailureHours: 0,
          mechanicalHours: 0,
          materialNoOrderHours: 0,
          otherHours: 0,
          isOperating: run.actualPcs > 0 || runOpHours > 0,
          isSaved: Boolean(savedRep?.isReconciled),
          isReconciled: Boolean(savedRep?.isReconciled)
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
          operatingHours: opHours,
          moldChangeHours,
          purgeCleaningHours: 0,
          heaterFailureHours: 0,
          mechanicalHours: 0,
          materialNoOrderHours: 0,
          otherHours: 0,
          isOperating: true,
          isSaved: Boolean(savedRep.isReconciled),
          isReconciled: Boolean(savedRep.isReconciled)
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

    // Unit weight
    let stdWeight = Number(ref1.stdWeight) || 0;
    if (stdWeight <= 0 && record) {
      if (Number(record.unitWeight) > 0) {
        stdWeight = Number(record.unitWeight);
      } else if (Number(record.weightPerPiece) > 0) {
        stdWeight = Number(record.weightPerPiece);
      } else if (Number(record.weightPerMeter) > 0 && pipeLength > 0) {
        stdWeight = round1(Number(record.weightPerMeter) * pipeLength);
      } else if (Number(record.raw?.weightPerPiece) > 0) {
        stdWeight = Number(record.raw.weightPerPiece);
      } else if (Number(record.raw?.unitWeight) > 0) {
        stdWeight = Number(record.raw.unitWeight);
      }
    }

    // Production output
    let actualPcs = savedRep?.summary?.totalOutput != null && savedRep.summary.totalOutput !== ''
      ? Math.round(Number(savedRep.summary.totalOutput) || 0)
      : (record ? Math.round(Number(record.productionQty ?? record.totalOutput ?? record.actual) || 0) : 0);

    let actualKg = Number(savedRep?.engineering?.totalWeightKg) ||
      (record ? Number(record.totalWeight ?? record.weightKg) || 0 : 0) ||
      (stdWeight > 0 ? round1(actualPcs * stdWeight) : 0);

    if (actualPcs <= 0 && actualKg > 0 && stdWeight > 0) {
      actualPcs = Math.round(actualKg / stdWeight);
    }
    if (stdWeight <= 0 && actualPcs > 0 && actualKg > 0) {
      stdWeight = round1(actualKg / actualPcs, 2);
    }
    if (actualKg <= 0 && actualPcs > 0 && stdWeight > 0) {
      actualKg = round1(actualPcs * stdWeight);
    }

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

    // Initial operating and downtime hours
    let operatingHours = 24.0;
    let moldChangeHours = 0;
    let purgeCleaningHours = 0;
    let heaterFailureHours = 0;
    let mechanicalHours = 0;
    let materialNoOrderHours = 0;
    let otherHours = 0;

    if (savedRep && Array.isArray(savedRep.slots) && savedRep.slots.length === 24) {
      // Restore from saved report
      operatingHours = savedRep.engineering?.operatingHours != null
        ? round1(Number(savedRep.engineering.operatingHours))
        : round1(savedRep.slots.filter((s) => (Number(s.downtime) || 0) < 60).length);

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

      if (actualPcs > 0 && operatingHours <= 0) {
        operatingHours = Math.max(0, round1(24.0 - totalDt));
      } else if (totalDt > 0 && operatingHours + totalDt > 24.05) {
        operatingHours = Math.max(0, round1(24.0 - totalDt));
      }
    } else if (record) {
      const recOp = record.operatingHours != null ? Number(record.operatingHours) : null;
      const recDt = record.downtimeHours != null ? Number(record.downtimeHours) : null;

      if (recOp != null && recOp > 0) {
        operatingHours = round1(recOp);
      } else if (recDt != null && recDt > 0) {
        operatingHours = Math.max(0, round1(24.0 - recDt));
        otherHours = round1(recDt);
      } else if (actualPcs > 0) {
        operatingHours = 24.0;
      } else {
        operatingHours = 0.0;
        materialNoOrderHours = 24.0;
      }

      const remainingDowntime = Math.max(0, round1(24.0 - operatingHours));
      if (remainingDowntime > 0 && (moldChangeHours + purgeCleaningHours + heaterFailureHours + mechanicalHours + materialNoOrderHours + otherHours) === 0) {
        if (actualPcs === 0) {
          materialNoOrderHours = remainingDowntime;
        } else {
          otherHours = remainingDowntime;
        }
      }

      const totalDt = round1(
        moldChangeHours +
        purgeCleaningHours +
        heaterFailureHours +
        mechanicalHours +
        materialNoOrderHours +
        otherHours
      );
      if (totalDt > 0 && operatingHours + totalDt > 24.05) {
        operatingHours = Math.max(0, round1(24.0 - totalDt));
      }
    } else {
      operatingHours = 0.0;
      materialNoOrderHours = 24.0;
    }

    const isOperating = actualPcs > 0 || (record != null && (Number(record.operatingHours) > 0 || Number(record.productionQty) > 0));
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
      operatingHours,
      moldChangeHours,
      purgeCleaningHours,
      heaterFailureHours,
      mechanicalHours,
      materialNoOrderHours,
      otherHours,
      isOperating,
      isSaved: Boolean(savedRep?.isReconciled),
      isReconciled: Boolean(savedRep?.isReconciled)
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
