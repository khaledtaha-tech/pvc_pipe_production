import { MACHINES } from '../config/machines.js';
import { round1, roundToSum, HOUR_WINDOWS } from './dailyReportEngine.js';

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
    label: 'Mold / Size Change',
    defaultDurationMin: 120,
    defaultReason: 'Mold / Size Changeover Setup',
    defaultStartSlot: 2 // 08:30 - 09:30
  },
  warmup: {
    label: 'Cold Start-up / Heating',
    defaultDurationMin: 90,
    defaultReason: 'Cold Start-up / Barrel Heating & Stabilization',
    defaultStartSlot: 0 // 06:30 - 07:30
  },
  breakdown: {
    label: 'Logged Breakdown',
    defaultDurationMin: 60,
    defaultReason: 'Electrical Breakdown (Drive Inverter Fault / Heating Zone Sensor Error)',
    defaultStartSlot: 14 // 20:30 - 21:30
  }
};

/**
 * Retrieve machine default aging/derating factor (50% - 100%)
 * Older lines (KTS 200, KTS 170, KTS 100) default to 85%
 * Intermediate lines default to 88% - 90%
 * Modern / Heavy lines default to 92% - 95%
 */
export function getDefaultDeratingFactor(machineId, machineMaster = null) {
  if (!machineId) return 85;

  const cleanId = String(machineId).toUpperCase();

  // Known line profiles
  if (cleanId.includes('L-04') || cleanId.includes('KTS 200') || cleanId.includes('KTS-200')) {
    return 85;
  }
  if (cleanId.includes('L-07') || cleanId.includes('KTS 170') || cleanId.includes('KTS-170')) {
    return 85;
  }
  if (cleanId.includes('L-09') || cleanId.includes('KTS 100') || cleanId.includes('KTS-100')) {
    return 85;
  }
  if (cleanId.includes('L-05') || cleanId.includes('KTS 350') || cleanId.includes('KTS-350')) {
    return 88;
  }
  if (cleanId.includes('L-02') || cleanId.includes('KTS 250') || cleanId.includes('KTS-250')) {
    return 90;
  }
  if (cleanId.includes('L-08') || cleanId.includes('350 TDH') || cleanId.includes('350-TDH')) {
    return 90;
  }
  if (cleanId.includes('L-06') || cleanId.includes('KABRA') || cleanId.includes('K-90')) {
    return 92;
  }
  if (cleanId.includes('L-03') || cleanId.includes('KTS 700') || cleanId.includes('KTS-700')) {
    return 92;
  }
  if (cleanId.includes('L-01') || cleanId.includes('KTS 550') || cleanId.includes('KTS-550')) {
    return 95;
  }

  // Lookup in static or dynamic master
  const list = Array.isArray(machineMaster) && machineMaster.length > 0 ? machineMaster : MACHINES;
  const match = list.find((m) => {
    if (m.id && cleanId.includes(m.id.toUpperCase())) return true;
    if (m.name && cleanId.includes(m.name.toUpperCase())) return true;
    if (Array.isArray(m.matchKeys)) {
      return m.matchKeys.some((k) => cleanId.includes(k.toUpperCase()));
    }
    return false;
  });

  if (match) {
    if (match.capacityKgH && match.nominalCapacity && match.nominalCapacity > 0) {
      const ratio = Math.round((match.capacityKgH / match.nominalCapacity) * 100);
      return Math.min(100, Math.max(70, ratio));
    }
  }

  return 85;
}

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
 * Calculate reconciliation audit metrics for Manager/Supervisor oversight
 */
export function calculateReconciliationAudit({
  totalActualPieces = 0,
  targetRate = 0,
  deratingFactor = 100,
  moldChangeMin = 0,
  warmupMin = 0,
  breakdownMin = 0
}) {
  const rate = Number(targetRate) > 0 ? Number(targetRate) : 0;
  const actualPcs = Math.max(0, Math.round(Number(totalActualPieces) || 0));
  const factor = Number(deratingFactor) > 0 && Number(deratingFactor) <= 100 ? Number(deratingFactor) : 100;

  const theoreticalCapacityPcs = round1(24 * rate);
  const actualEquivalentHours = rate > 0 ? round1(actualPcs / rate) : 0;
  const missingHours = Math.max(0, round1(24 - actualEquivalentHours));
  const missingPieces = Math.max(0, round1(theoreticalCapacityPcs - actualPcs));

  const moldChangeHours = round1(moldChangeMin / 60);
  const warmupHours = round1(warmupMin / 60);
  const breakdownHours = round1(breakdownMin / 60);

  const totalDowntimeMin = moldChangeMin + warmupMin + breakdownMin;
  const totalDowntimeHours = round1(totalDowntimeMin / 60);
  const operatingHours = Math.max(0, round1(24 - totalDowntimeHours));

  // Speed derating capacity loss in equivalent operating hours and pieces
  const speedDeratingLossHours = round1(operatingHours * (1 - (factor / 100)));
  const speedDeratingLossPieces = Math.round(speedDeratingLossHours * rate);

  // Total Accounted = Declared Downtime + Speed Derating
  const totalAccountedHours = round1(totalDowntimeHours + speedDeratingLossHours);
  const totalAccountedPieces = Math.round((totalDowntimeHours * rate) + speedDeratingLossPieces);

  // Unexplained Time Gap
  const rawGapHours = missingHours - totalAccountedHours;
  const unexplainedGapHours = rawGapHours > 0.05 ? round1(rawGapHours) : 0;
  const unexplainedGapPieces = rate > 0 ? Math.round(unexplainedGapHours * rate) : 0;
  const isFullyReconciled = unexplainedGapHours <= 0.2;

  return {
    theoreticalCapacityPcs,
    actualPcs,
    targetRate: rate,
    deratingFactor: factor,
    actualEquivalentHours,
    missingHours,
    missingPieces,
    moldChangeMin,
    moldChangeHours,
    warmupMin,
    warmupHours,
    breakdownMin,
    breakdownHours,
    totalDowntimeMin,
    totalDowntimeHours,
    operatingHours,
    speedDeratingLossHours,
    speedDeratingLossPieces,
    totalAccountedHours,
    totalAccountedPieces,
    unexplainedGapHours,
    unexplainedGapPieces,
    isFullyReconciled
  };
}

/**
 * Reconcile shift run: apply declared downtime windows, reverse-distribute actual pieces
 * across remaining operating hours, and update engineering derating factor.
 */
export function reconcileShiftRun(report, params = {}) {
  const {
    totalActualPieces = 0,
    deratingFactor = 85,
    events = {}
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

  // Collect declared event durations
  let moldChangeMin = 0;
  let warmupMin = 0;
  let breakdownMin = 0;

  if (events.moldChange?.enabled) {
    moldChangeMin = Math.max(0, Math.round(Number(events.moldChange.durationMin) || 0));
    const reason = events.moldChange.reason || DEFAULT_EVENT_CONFIGS.moldChange.defaultReason;
    const start = events.moldChange.startSlot ?? DEFAULT_EVENT_CONFIGS.moldChange.defaultStartSlot;
    applyEventToSlots(slots, start, moldChangeMin, reason);
  }

  if (events.warmup?.enabled) {
    warmupMin = Math.max(0, Math.round(Number(events.warmup.durationMin) || 0));
    const reason = events.warmup.reason || DEFAULT_EVENT_CONFIGS.warmup.defaultReason;
    const start = events.warmup.startSlot ?? DEFAULT_EVENT_CONFIGS.warmup.defaultStartSlot;
    applyEventToSlots(slots, start, warmupMin, reason);
  }

  if (events.breakdown?.enabled) {
    breakdownMin = Math.max(0, Math.round(Number(events.breakdown.durationMin) || 0));
    const reason = events.breakdown.reason || DEFAULT_EVENT_CONFIGS.breakdown.defaultReason;
    const start = events.breakdown.startSlot ?? DEFAULT_EVENT_CONFIGS.breakdown.defaultStartSlot;
    applyEventToSlots(slots, start, breakdownMin, reason);
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

  // Bind values back to slots
  slots.forEach((s, i) => {
    s.actual = actuals[i];
    if (runningMinutes[i] === 0) {
      s.actual = 0;
      s.scrap = 0;
    } else {
      // Ensure scrap does not exceed actual
      if (Number(s.scrap) > s.actual) {
        s.scrap = s.actual;
      }
    }
    s.good = Math.max(0, s.actual - (Number(s.scrap) || 0));
  });

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

  const audit = calculateReconciliationAudit({
    totalActualPieces: desiredActual,
    targetRate,
    deratingFactor,
    moldChangeMin,
    warmupMin,
    breakdownMin
  });

  return {
    updatedSlots: slots,
    totalActualPieces: desiredActual,
    deratingFactor: audit.deratingFactor,
    audit
  };
}
