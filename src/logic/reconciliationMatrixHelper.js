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

/**
 * Calculate mathematical metrics for a single matrix row
 */
export function calculateMatrixRowMetrics(row) {
  const targetRate = Math.max(0, Number(row.targetRate) || 0);
  const stdWeight = Math.max(0, Number(row.stdWeight) || 0);
  const nominalCap = Math.max(0, Number(row.nominalCapacity) || 0);
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
    operatingHours,
    moldChangeHours,
    purgeCleaningHours,
    heaterFailureHours,
    mechanicalHours,
    materialNoOrderHours,
    otherHours,
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
  const consolidatedForDate = consolidateDailyMachineRecords(recordsForDate, machineMaster);

  // Map of lineId -> consolidated record
  const recordMap = new Map();
  consolidatedForDate.forEach((r) => {
    const matched = matchMachine(r.machineId || r.machineRaw, machineMaster);
    const lid = matched?.id || r.machineId || r.machineRaw;
    if (lid) recordMap.set(lid, r);
  });

  return machineMaster.map((machine) => {
    const lineId = machine.id;
    const lineName = machine.name || lineId;
    const nominalCapacity = getMachineNominalCapacity(lineId, machineMaster);

    // 1. Check if a saved report exists in storage
    const savedRep = typeof loadReportByDateAndMachineFn === 'function'
      ? loadReportByDateAndMachineFn(date, lineId)
      : null;

    // 2. Ingested production record
    const record = recordMap.get(lineId) || null;

    // Product specs
    const ref1 = savedRep?.refs?.['1'] || {};
    const productCode = savedRep?.header?.itemCode || record?.productCode || '';
    const productDescription = ref1.productDescription || record?.productName || '';
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

    // Standard rate
    let targetRate = Number(ref1.targetRate) || 0;
    if (targetRate <= 0 && savedRep?.slots?.[0]?.rate > 0) {
      targetRate = Number(savedRep.slots[0].rate);
    }
    if (targetRate <= 0 && record) {
      if (Number(record.standardRate) > 0) {
        targetRate = Number(record.standardRate);
      } else if (Number(record.raw?.standardRate) > 0) {
        targetRate = Number(record.raw.standardRate);
      } else if (Number(record.raw?.targetRate) > 0) {
        targetRate = Number(record.raw.targetRate);
      } else if (Number(record.speed) > 0 && pipeLength > 0) {
        targetRate = round1((Number(record.speed) * 60) / pipeLength);
      } else if (Number(record.raw?.speed) > 0 && pipeLength > 0) {
        targetRate = round1((Number(record.raw.speed) * 60) / pipeLength);
      }
    }
    if (targetRate <= 0) {
      targetRate = 100;
    }

    // Production output
    const actualPcs = savedRep?.summary?.totalOutput != null && savedRep.summary.totalOutput !== ''
      ? Math.round(Number(savedRep.summary.totalOutput) || 0)
      : (record ? Math.round(Number(record.productionQty) || 0) : 0);

    const actualKg = Number(savedRep?.engineering?.totalWeightKg) ||
      (record ? Number(record.totalWeight) || 0 : 0) ||
      round1(actualPcs * stdWeight);

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

      // Categorize downtime events from saved report
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

      // If slots had downtime but no explicit events list, derive from slots
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
    } else if (record) {
      // Ingested record without prior saved report
      if (record.operatingHours != null && Number(record.operatingHours) >= 0) {
        operatingHours = round1(Number(record.operatingHours));
      } else {
        const theoretical = 24 * targetRate;
        const deficit = Math.max(0, theoretical - actualPcs);
        const lost = targetRate > 0 ? round1(deficit / targetRate) : 0;
        operatingHours = actualPcs > 0 ? Math.max(0, round1(24 - lost)) : 0;
      }

      // If operatingHours < 24, allocate remainder to other or no order
      const remainingDowntime = Math.max(0, round1(24.0 - operatingHours));
      if (remainingDowntime > 0) {
        if (actualPcs === 0) {
          materialNoOrderHours = remainingDowntime;
        } else {
          otherHours = remainingDowntime;
        }
      }
    } else {
      // Idle line on this date (Full 24h No Order)
      operatingHours = 0.0;
      materialNoOrderHours = 24.0;
    }

    const isOperating = actualPcs > 0 || (record != null && (Number(record.operatingHours) > 0 || Number(record.productionQty) > 0));

    const rawRow = {
      lineId,
      lineName,
      nominalCapacity,
      productCode,
      productDescription,
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

    return calculateMatrixRowMetrics(rawRow);
  });
}

/**
 * Reconcile a single matrix row and update 24-hour slots and engineering parameters
 */
export function reconcileMatrixRow(row, baseReport = null, machineMaster = MACHINES) {
  const metrics = calculateMatrixRowMetrics(row);
  const targetDate = metrics.date || baseReport?.header?.date;

  // Initialize report if not supplied
  let rep = baseReport;
  if (!rep || !Array.isArray(rep.slots) || rep.slots.length !== 24) {
    rep = blankReportForMachine(targetDate, metrics.lineId, machineMaster);
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
  rep.refs['1'] = rep.refs['1'] || makeRefSpec();
  rep.refs['1'].targetRate = metrics.targetRate;
  rep.refs['1'].stdWeight = metrics.stdWeight;
  if (metrics.productCode) rep.header.itemCode = metrics.productCode;
  if (metrics.productDescription) rep.refs['1'].productDescription = metrics.productDescription;
  if (metrics.pipeLength > 0) rep.refs['1'].pipeLength = metrics.pipeLength;

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
  const nominalCap = metrics.nominalCapacity > 0 ? metrics.nominalCapacity : getMachineNominalCapacity(metrics.lineId, machineMaster);
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
    'Nominal Cap (kg/h)',
    'Product Code',
    'Product Description',
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
    r.lineId,
    r.lineName,
    r.nominalCapacity,
    r.productCode || '-',
    r.productDescription || '-',
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
    { wch: 18 }, // Nominal Cap
    { wch: 16 }, // Product Code
    { wch: 25 }, // Description
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
