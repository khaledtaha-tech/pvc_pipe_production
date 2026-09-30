import { MACHINES, matchMachine, normalizeMachineKey, PLANT_NAME } from '../config/machines.js';
import {
  STANDARD_DOWNTIME_PRESETS,
  STANDARD_DOWNTIME_REASONS,
  getDowntimePresetById,
  getDowntimePresetByName
} from '../config/downtimeReasons.js';
import { round1, roundToSum, HOUR_WINDOWS, makeRefSpec, emptySlots } from './engine.js';
import { normalizeExcelDate, consolidateDailyMachineRecords, convertLogRowToReport } from './excelParser.js';

export {
  STANDARD_DOWNTIME_PRESETS,
  STANDARD_DOWNTIME_REASONS,
  getDowntimePresetById,
  getDowntimePresetByName
};

/**
 * Standard technical downtime categories for extrusion breakdowns
 */
export const STANDARD_BREAKDOWN_REASONS = [
  'Electrical Breakdown (Drive Inverter Fault / Heating Zone Sensor Error)',
  'Mechanical Breakdown (Haul-Off Track Slipping / Planetary Cutter Jam)',
  'Material / Vacuum Issue (Melt Temperature Fluctuations / Vacuum Sizing Loss)',
  'Cooling System Issue (Water Chiller Stoppage / Spray Nozzle Clog)',
  'Tooling / Die Head Adjustment (Die Gap Centering / Screen Pack Change)'
];

/**
 * Default event parameters
 */
export const DEFAULT_EVENT_CONFIGS = {
  moldChange: {
    label: 'Die / Mold Changeover',
    defaultDurationMin: 120,
    defaultReason: 'Die / Mold Changeover',
    defaultStartSlot: 2 // 08:30 - 09:30
  },
  warmup: {
    label: 'Routine Startup / Calibration',
    defaultDurationMin: 30,
    defaultReason: 'Routine Startup / Calibration',
    defaultStartSlot: 0 // 06:30 - 07:30
  },
  breakdown: {
    label: 'Logged Breakdown',
    defaultDurationMin: 45,
    defaultReason: 'Mechanical Jam / Puller Fix',
    defaultStartSlot: 14 // 20:30 - 21:30
  }
};

/**
 * Append reason with semicolon separator
 */
function appendReason(existing, incoming) {
  const cleanIncoming = (incoming || '').trim();
  const cleanExisting = (existing || '').trim();
  if (!cleanIncoming) return cleanExisting;
  if (!cleanExisting) return cleanIncoming;
  if (cleanExisting.includes(cleanIncoming)) return cleanExisting;
  return `${cleanExisting}; ${cleanIncoming}`;
}

/**
 * Apply a duration-based event starting at a specific slot across 24 slots
 */
export function applyEventToSlots(slots, startSlotIdx, durationMin, reason) {
  let idx = (Number(startSlotIdx) || 0) % 24;
  if (idx < 0) idx += 24;
  let remaining = Math.round(Number(durationMin) || 0);
  let guard = 0;

  while (remaining > 0 && guard < 48) {
    const slot = slots[idx % 24];
    const free = 60 - (Number(slot.downtime) || 0);
    if (free > 0) {
      const take = Math.min(free, remaining);
      slot.downtime = round1((Number(slot.downtime) || 0) + take);
      slot.reason = appendReason(slot.reason, reason);
      remaining = Math.round((remaining - take) * 10) / 10;
    }
    idx += 1;
    guard += 1;
  }
}

/**
 * Calculate reconciliation audit metrics with decoupled downtime and true speed loss
 */
export function calculateReconciliationAudit({
  totalActualPieces = 0,
  targetRate = 0,
  totalDowntimeMin = null,
  moldChangeMin = 0,
  warmupMin = 0,
  breakdownMin = 0,
  manualDowntimeMin = 0,
  events = []
}) {
  const rate = Number(targetRate) > 0 ? Number(targetRate) : 0;
  const actualPcs = Math.max(0, Math.round(Number(totalActualPieces) || 0));

  // Compute total downtime minutes
  let calculatedDtMin = 0;
  if (totalDowntimeMin != null) {
    calculatedDtMin = Math.max(0, Number(totalDowntimeMin) || 0);
  } else {
    calculatedDtMin =
      (Number(moldChangeMin) || 0) +
      (Number(warmupMin) || 0) +
      (Number(breakdownMin) || 0) +
      (Number(manualDowntimeMin) || 0);
    if (Array.isArray(events)) {
      calculatedDtMin += events.reduce((sum, e) => sum + (e && e.enabled ? (Number(e.durationMin) || 0) : 0), 0);
    }
  }

  const moldChangeHours = round1((Number(moldChangeMin) || 0) / 60);
  const warmupHours = round1((Number(warmupMin) || 0) / 60);
  const breakdownHours = round1((Number(breakdownMin) || 0) / 60);
  const manualDowntimeHours = round1((Number(manualDowntimeMin) || 0) / 60);

  const totalDowntimeHours = Math.min(24, round1(calculatedDtMin / 60));
  const operatingHours = Math.max(0, round1(24 - totalDowntimeHours));
  const availability = 24 > 0 ? round1((operatingHours / 24) * 1000) / 1000 : 0;
  const availabilityPct = round1(availability * 100);

  const theoreticalCapacityPcs = round1(24 * rate);
  const targetOutputForOperating = round1(operatingHours * rate);
  const actualHourlyRate = operatingHours > 0 ? round1(actualPcs / operatingHours) : 0;

  // True speed efficiency (Performance)
  const performance = targetOutputForOperating > 0 ? round1((actualPcs / targetOutputForOperating) * 1000) / 1000 : 0;
  const performancePct = round1(performance * 100);

  // Stoppage output loss vs Speed loss
  const missingPieces = Math.max(0, round1(theoreticalCapacityPcs - actualPcs));
  const missingHours = rate > 0 ? round1(missingPieces / rate) : 0;

  const downtimePieces = Math.round(totalDowntimeHours * rate);
  const speedLossPieces = Math.max(0, round1(targetOutputForOperating - actualPcs));
  const speedLossHours = rate > 0 ? round1(speedLossPieces / rate) : 0;

  // Backward compatibility with legacy audit contract:
  const actualEquivalentHours = rate > 0 ? round1(actualPcs / rate) : 0;
  const totalAccountedHours = totalDowntimeHours;
  const totalAccountedPieces = downtimePieces;
  const rawGapHours = missingHours - totalAccountedHours;
  const unexplainedGapHours = rawGapHours > 0.05 ? round1(rawGapHours) : 0;
  const unexplainedGapPieces = rate > 0 ? Math.round(unexplainedGapHours * rate) : 0;
  const isFullyReconciled = unexplainedGapHours <= 0.2;

  const overallOee = round1(availability * performance * 1000) / 1000;
  const overallOeePct = round1(overallOee * 100);

  return {
    theoreticalCapacityPcs,
    actualPcs,
    targetRate: rate,
    targetOutputForOperating,
    actualHourlyRate,
    actualEquivalentHours,
    operatingHours,
    totalDowntimeMin: calculatedDtMin,
    totalDowntimeHours,
    availability,
    availabilityPct,
    performance,
    performancePct,
    overallOee,
    overallOeePct,
    missingPieces,
    missingHours,
    downtimePieces,
    speedLossPieces,
    speedLossHours,
    moldChangeMin,
    moldChangeHours,
    warmupMin,
    warmupHours,
    breakdownMin,
    breakdownHours,
    manualDowntimeMin,
    manualDowntimeHours,
    totalAccountedHours,
    totalAccountedPieces,
    unexplainedGapHours,
    unexplainedGapPieces,
    isFullyReconciled
  };
}

/**
 * Reconcile shift run: supports dual-mode downtime entry (presets vs manual), zero-downtime full runs,
 * and true speed-loss proportional output distribution across active slots.
 */
export function reconcileShiftRun(report, params = {}) {
  const {
    totalActualPieces = 0,
    zeroDowntime = false,
    mode = 'preset', // 'preset' | 'manual' | 'zero'
    manualDowntime = null, // { enabled: boolean, durationMin: number, reason: string, startSlot: number }
    presets = [], // array of { id, name, durationMin, startSlot, reason, enabled }
    events = {} // backwards compatibility
  } = params;

  // Initialize fresh copies of 24 slots with 0 downtime
  const rawSlots = report?.slots && report.slots.length === 24
    ? report.slots
    : HOUR_WINDOWS.map((h) => ({
        index: h.index,
        window: h.label,
        shift: h.shift,
        startHour: h.startHour,
        ref: '1',
        downtime: 0,
        reason: '',
        actual: 0,
        scrap: 0,
        purge: 0,
        bundles: 0
      }));

  const slots = rawSlots.map((s) => ({
    ...s,
    downtime: 0,
    reason: ''
  }));

  let totalDowntimeMin = 0;
  let moldChangeMin = 0;
  let warmupMin = 0;
  let breakdownMin = 0;
  let manualDowntimeMin = 0;
  const downtimeEvents = [];

  // Case 1: Zero Downtime (full 24h run at speed)
  if (zeroDowntime || mode === 'zero') {
    // Keep slots downtime at 0
    totalDowntimeMin = 0;
  }
  // Case 2: Direct Manual Downtime Entry (Mode B)
  else if (mode === 'manual' && manualDowntime && manualDowntime.enabled) {
    manualDowntimeMin = Math.max(0, Math.round(Number(manualDowntime.durationMin) || 0));
    const reason = manualDowntime.reason || 'Unplanned Downtime (Direct Manual Entry)';
    const start = manualDowntime.startSlot ?? 0;
    applyEventToSlots(slots, start, manualDowntimeMin, reason);
    totalDowntimeMin += manualDowntimeMin;
    if (manualDowntimeMin > 0) {
      downtimeEvents.push({
        key: `ev_manual_${Date.now()}`,
        startHour: (6 + start) % 24,
        durationMin: manualDowntimeMin,
        reason
      });
    }
  }
  // Case 3: Presets Array (Mode A)
  else if (Array.isArray(presets) && presets.length > 0) {
    presets.forEach((p, idx) => {
      const dMin = Math.max(0, Math.round(Number(p?.durationMin ?? p?.defaultDurationMin) || 0));
      if (p && p.enabled && dMin > 0) {
        const reason = p.reason || p.name || 'Equipment Stoppage';
        const start = p.startSlot ?? p.defaultStartSlot ?? 0;
        applyEventToSlots(slots, start, dMin, reason);
        totalDowntimeMin += dMin;
        if (p.id === 'mold_change' || reason.toLowerCase().includes('mold')) {
          moldChangeMin += dMin;
        } else if (p.id === 'startup_calibration' || p.id === 'warmup') {
          warmupMin += dMin;
        } else {
          breakdownMin += dMin;
        }
        downtimeEvents.push({
          key: `ev_preset_${p.id || idx}_${Date.now()}`,
          startHour: (6 + start) % 24,
          durationMin: dMin,
          reason
        });
      }
    });
  }
  // Case 4: Legacy events object (for backwards compatibility)
  else {
    if (events.moldChange?.enabled) {
      moldChangeMin = Math.max(0, Math.round(Number(events.moldChange.durationMin) || 0));
      const reason = events.moldChange.reason || DEFAULT_EVENT_CONFIGS.moldChange.defaultReason;
      const start = events.moldChange.startSlot ?? DEFAULT_EVENT_CONFIGS.moldChange.defaultStartSlot;
      applyEventToSlots(slots, start, moldChangeMin, reason);
      totalDowntimeMin += moldChangeMin;
      downtimeEvents.push({
        key: `ev_mold_${Date.now()}`,
        startHour: (6 + start) % 24,
        durationMin: moldChangeMin,
        reason
      });
    }

    if (events.warmup?.enabled) {
      warmupMin = Math.max(0, Math.round(Number(events.warmup.durationMin) || 0));
      const reason = events.warmup.reason || DEFAULT_EVENT_CONFIGS.warmup.defaultReason;
      const start = events.warmup.startSlot ?? DEFAULT_EVENT_CONFIGS.warmup.defaultStartSlot;
      applyEventToSlots(slots, start, warmupMin, reason);
      totalDowntimeMin += warmupMin;
      downtimeEvents.push({
        key: `ev_warmup_${Date.now()}`,
        startHour: (6 + start) % 24,
        durationMin: warmupMin,
        reason
      });
    }

    if (events.breakdown?.enabled) {
      breakdownMin = Math.max(0, Math.round(Number(events.breakdown.durationMin) || 0));
      const reason = events.breakdown.reason || DEFAULT_EVENT_CONFIGS.breakdown.defaultReason;
      const start = events.breakdown.startSlot ?? DEFAULT_EVENT_CONFIGS.breakdown.defaultStartSlot;
      applyEventToSlots(slots, start, breakdownMin, reason);
      totalDowntimeMin += breakdownMin;
      downtimeEvents.push({
        key: `ev_breakdown_${Date.now()}`,
        startHour: (6 + start) % 24,
        durationMin: breakdownMin,
        reason
      });
    }
  }

  // Calculate remaining operating minutes per slot
  const runningMinutes = slots.map((s) => Math.max(0, 60 - (Number(s.downtime) || 0)));
  const totalRunningMinutes = runningMinutes.reduce((a, b) => a + b, 0);

  const desiredActual = Math.max(0, Math.round(Number(totalActualPieces) || 0));

  // Distribute actual output proportionally across operating minutes
  let actuals = slots.map(() => 0);
  if (totalRunningMinutes > 0 && desiredActual > 0) {
    const rawActuals = slots.map((s, i) => (desiredActual * runningMinutes[i]) / totalRunningMinutes);
    actuals = roundToSum(rawActuals, desiredActual, 0);
  }

  // Target rate for audit calculations
  const ref1 = report?.refs?.['1'] || {};
  let targetRate = Number(ref1.targetRate) || 0;
  if (targetRate <= 0 && Number(ref1.speed) > 0) {
    const len = Number(ref1.pipeLength) || 6.0;
    targetRate = round1((Number(ref1.speed) * 60) / len);
  }
  if (targetRate <= 0 && slots[0]?.rate) {
    targetRate = slots[0].rate;
  }
  if (targetRate <= 0) {
    targetRate = desiredActual > 0 ? round1(desiredActual / 24) : 100;
  }

  // Bind values back to slots and calculate slot targets
  slots.forEach((s, i) => {
    s.actual = actuals[i];
    s.rate = targetRate;
    s.target = round1((targetRate * runningMinutes[i]) / 60);

    if (runningMinutes[i] === 0) {
      s.actual = 0;
      s.scrap = 0;
    } else {
      if (Number(s.scrap) > s.actual) {
        s.scrap = s.actual;
      }
    }
    s.good = Math.max(0, s.actual - (Number(s.scrap) || 0));
  });

  const audit = calculateReconciliationAudit({
    totalActualPieces: desiredActual,
    targetRate,
    totalDowntimeMin,
    moldChangeMin,
    warmupMin,
    breakdownMin,
    manualDowntimeMin
  });

  return {
    updatedSlots: slots,
    totalActualPieces: desiredActual,
    downtimeEvents,
    audit
  };
}

/**
 * Test whether two dates match across string formats, Date objects, or numeric serials
 */
export function isDateMatch(dateA, dateB) {
  if (!dateA || !dateB) return false;
  const normA = normalizeExcelDate(dateA);
  const normB = normalizeExcelDate(dateB);
  if (normA && normB && normA === normB) return true;
  return String(dateA).trim() === String(dateB).trim();
}

/**
 * Robust machine line matching between records and target selection
 */
export function isMachineMatch(machineA, machineB, dynamicList = MACHINES) {
  if (!machineA || !machineB) return false;
  const mA = typeof machineA === 'object' && machineA !== null
    ? (machineA.id || machineA.machineId || machineA.name || machineA.machineRaw)
    : String(machineA);
  const mB = typeof machineB === 'object' && machineB !== null
    ? (machineB.id || machineB.machineId || machineB.name || machineB.machineRaw)
    : String(machineB);

  const matchedA = matchMachine(mA, dynamicList);
  const matchedB = matchMachine(mB, dynamicList);

  if (matchedA && matchedB && matchedA.id === matchedB.id) {
    return true;
  }

  const normA = normalizeMachineKey(mA);
  const normB = normalizeMachineKey(mB);
  if (normA && normB && (normA === normB || normA.includes(normB) || normB.includes(normA))) {
    return true;
  }

  return false;
}

/**
 * Standardize any raw production record (ERP historical row, daily log row, or parsed record)
 */
export function normalizeProductionRow(raw, dynamicMaster = MACHINES) {
  if (!raw) return null;

  const rawDate = raw.Date ?? raw.date ?? raw['DATE'] ?? '';
  const date = normalizeExcelDate(rawDate);
  const itemCode = String(raw['Item Code'] ?? raw.itemCode ?? raw.item_code ?? raw['Item'] ?? raw['item'] ?? '').trim();
  const description = String(raw['Product Description & Specs'] ?? raw.description ?? raw.desc ?? raw['Product'] ?? raw['Description'] ?? '').trim();
  const machineRaw = String(raw.Machine ?? raw.machine ?? raw.machineRaw ?? raw.machineName ?? raw.machineId ?? '').trim();

  const qty = Number(raw['Production Qty (FG)'] ?? raw.productionQty ?? raw.qty ?? raw.production_qty ?? raw['Production Qty'] ?? raw.ProductionQty ?? 0) || 0;
  const unitWeight = Number(raw['Unit Weight (kg)'] ?? raw.unitWeight ?? raw.unit_weight ?? raw['Unit Weight'] ?? raw.UnitWeight ?? 0) || 0;
  const totalWeight = Number(raw['Total Weight (kg)'] ?? raw.totalWeight ?? raw.total_weight ?? raw['Total Weight'] ?? (qty * unitWeight)) || 0;
  const scrapKg = Number(raw['Scrap / Rejection (kg)'] ?? raw.scrapKg ?? raw.scrap_rejection ?? raw['Scrap (kg)'] ?? raw['Scrap'] ?? 0) || 0;
  const rawOpH = raw['Operating Hours'] ?? raw.operatingHours ?? raw.operating_hours ?? raw['OperatingHours'];
  const operatingHours = rawOpH != null && rawOpH !== '' && !Number.isNaN(Number(rawOpH)) ? Number(rawOpH) : 24;
  const reasonOfStop = String(raw['Reason of Stop'] ?? raw.reasonOfStop ?? raw.reason_of_stop ?? raw['ReasonOfStop'] ?? '').trim();

  const matchedMachine = matchMachine(machineRaw, dynamicMaster);
  const machineId = matchedMachine ? matchedMachine.id : (machineRaw || 'L-01');
  const machineName = matchedMachine ? `${matchedMachine.id} - ${matchedMachine.name}` : machineRaw;
  const nominalCapacityKgH = matchedMachine?.capacityKgH || matchedMachine?.nominalCapacity || 0;

  const actualRateKgH = operatingHours > 0 ? round1(totalWeight / operatingHours) : 0;
  const capacityUtilizationPct = nominalCapacityKgH > 0 ? round1((actualRateKgH / nominalCapacityKgH) * 100) : 0;

  return {
    id: raw.id || `log_${date}_${machineId}_${itemCode || 'row'}`,
    date,
    itemCode,
    description,
    machineRaw,
    machineId,
    machineName,
    matchedMachine,
    nominalCapacityKgH,
    productionQty: qty,
    unitWeight: round1(unitWeight),
    totalWeight: Math.round(totalWeight),
    scrapKg: round1(scrapKg),
    operatingHours: round1(operatingHours),
    downtimeHours: round1(Math.max(0, 24 - operatingHours)),
    reasonOfStop,
    actualRateKgH,
    capacityUtilizationPct,
    raw
  };
}

/**
 * Query matching production records for a specific line/machine and date from any dataset
 */
export function queryProductionRecords({
  dataset = [],
  date,
  machine,
  machineMaster = MACHINES
}) {
  if (!date || !machine || !Array.isArray(dataset) || dataset.length === 0) {
    return [];
  }

  const results = [];
  const seenSignatures = new Set();

  for (const item of dataset) {
    if (!item) continue;
    const row = normalizeProductionRow(item, machineMaster);
    if (!row || !row.date) continue;

    if (isDateMatch(row.date, date) && isMachineMatch(row.machineId || row.machineRaw, machine, machineMaster)) {
      const sig = `${row.date}__${normalizeMachineKey(row.machineId)}__${row.itemCode}__${row.productionQty}`;
      if (!seenSignatures.has(sig)) {
        seenSignatures.add(sig);
        results.push(row);
      }
    }
  }

  return results;
}

/**
 * Query all production records operating on a specific date across any dataset
 */
export function queryProductionRecordsForDate({
  dataset = [],
  date,
  machineMaster = MACHINES
}) {
  if (!date || !Array.isArray(dataset) || dataset.length === 0) {
    return [];
  }

  const results = [];
  const seenSignatures = new Set();

  for (const item of dataset) {
    if (!item) continue;
    const row = normalizeProductionRow(item, machineMaster);
    if (!row || !row.date) continue;

    if (isDateMatch(row.date, date)) {
      const sig = `${row.date}__${normalizeMachineKey(row.machineId)}__${row.itemCode}__${row.productionQty}`;
      if (!seenSignatures.has(sig)) {
        seenSignatures.add(sig);
        results.push(row);
      }
    }
  }

  return results;
}

/**
 * Creates standard blank/zero report for a given machine and date
 */
export function blankReportForMachine(date, machineId, machineMaster = MACHINES) {
  const matched = matchMachine(machineId, machineMaster) || MACHINES[0];
  const mid = matched.id || machineId || 'L-01';
  const mName = matched.name || mid;
  const nominalCap = matched.capacityKgH || matched.nominalCapacity || 0;

  return {
    id: `rep_blank_${Date.now()}_${mid}`,
    sourceRecordId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    header: {
      date: normalizeExcelDate(date) || (typeof date === 'string' ? date : '2026-09-01'),
      lineId: mid,
      lineCustom: mName,
      plantName: PLANT_NAME,
      itemCode: ''
    },
    refs: {
      1: makeRefSpec(),
      2: makeRefSpec()
    },
    summary: {
      startCounter: '0',
      endCounter: '0',
      totalOutput: '0',
      haulOffMeter: '0',
      resinLot: '',
      totalBundles: '0',
      totalScrapPipes: '0',
      totalPurgeKg: '0',
      shift1Lead: 'Shift 1 Lead / Extrusion Tech',
      shift2Lead: 'Shift 2 Lead / Extrusion Tech',
      plantManager: 'Plant Production Manager'
    },
    downtimeEvents: [],
    slots: HOUR_WINDOWS.map((h) => ({
      index: h.index,
      window: h.label,
      shift: h.shift,
      startHour: h.startHour,
      ref: '1',
      rate: nominalCap > 0 ? Math.round(nominalCap / 2) : 100,
      actual: 0,
      target: 0,
      scrap: 0,
      purge: 0,
      bundles: 0,
      downtime: 0,
      reason: ''
    })),
    engineering: {
      nominalCapacityKgH: nominalCap,
      actualRateKgH: 0,
      capacityUtilizationPct: 0,
      operatingHours: 0,
      totalWeightKg: 0
    }
  };
}

/**
 * Automatically bind production log record(s) to a report model
 */
export function autoBindProductionLogToReport({
  dataset = [],
  date,
  machine,
  machineMaster = MACHINES,
  currentReport = null
}) {
  const matchedRows = queryProductionRecords({
    dataset,
    date,
    machine,
    machineMaster
  });

  if (matchedRows.length === 0) {
    return {
      hasMatch: false,
      report: blankReportForMachine(date, machine, machineMaster),
      matchedRows: [],
      totalActualPieces: 0
    };
  }

  // Consolidate matched rows (handles single and multi-item runs on same day)
  const consolidated = consolidateDailyMachineRecords(matchedRows, machineMaster);
  const primaryRow = consolidated[0] || matchedRows[0];
  const report = convertLogRowToReport(primaryRow);

  const totalActualPieces = Number(report.summary.totalOutput) || primaryRow.productionQty || 0;

  // Ensure active 24h slots are synthesized if totalActualPieces > 0 but slots have 0 output
  const slotSum = Array.isArray(report.slots)
    ? report.slots.reduce((sum, s) => sum + (Number(s.actual) || 0), 0)
    : 0;
  if (totalActualPieces > 0 && slotSum === 0) {
    const reconciled = reconcileShiftRun(report, {
      totalActualPieces
    });
    report.slots = reconciled.updatedSlots;
  }

  return {
    hasMatch: true,
    report,
    matchedRows,
    totalActualPieces
  };
}
