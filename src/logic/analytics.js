import { round1 } from './engine.js';
import { MACHINES } from '../config/machines.js';
import { consolidateDailyMachineRecords } from './excelParser.js';

/**
 * Filter records by date range and extrusion line
 */
export function filterAnalyticsRecords(records, { fromDate, toDate, lineId, machineMaster } = {}) {
  if (!Array.isArray(records) || records.length === 0) return [];

  const consolidated = consolidateDailyMachineRecords(records, machineMaster);

  return consolidated.filter((r) => {
    if (!r.date || String(r.date).toLowerCase().includes('total')) return false;

    // Date range filter
    if (fromDate && r.date < fromDate) return false;
    if (toDate && r.date > toDate) return false;

    // Line filter
    if (lineId && lineId !== 'ALL' && r.machineId !== lineId) return false;

    return true;
  });
}

/**
 * Calculate aggregated executive KPIs for a set of production records
 */
export function calculatePlantMetrics(filteredRecords, machineMaster) {
  if (!filteredRecords || filteredRecords.length === 0) {
    return {
      recordCount: 0,
      totalGoodWeightKg: 0,
      totalGoodWeightMT: '0.00',
      totalPcs: 0,
      totalScrapKg: 0,
      totalWeightWithScrapKg: 0,
      scrapRatePct: 0,
      operatingHours: 0,
      downtimeHours: 0,
      totalPlannedHours: 0,
      operatingPct: 0,
      downtimePct: 0,
      availabilityPct: 0,
      performancePct: 0,
      qualityPct: 0,
      oeePct: 0,
      avgActualRateKgH: 0,
      capacityUtilizationPct: 0
    };
  }

  const consolidatedRecords = consolidateDailyMachineRecords(filteredRecords, machineMaster);

  let totalGoodWeightKg = 0;
  let totalPcs = 0;
  let totalScrapKg = 0;
  let operatingHours = 0;
  let downtimeHours = 0;
  let expectedNominalWeightKg = 0;

  for (const r of consolidatedRecords) {
    const wt = Number(r.totalWeight) || 0;
    const pcs = Number(r.productionQty) || 0;
    const scrap = Number(r.scrapKg) || 0;
    const opH = Number(r.operatingHours) || 0;
    const dtH = Number(r.downtimeHours) || 0;
    const nominal = Number(r.nominalCapacityKgH) || 0;

    totalGoodWeightKg += wt;
    totalPcs += pcs;
    totalScrapKg += scrap;
    operatingHours += opH;
    downtimeHours += dtH;
    expectedNominalWeightKg += opH * nominal;
  }

  totalGoodWeightKg = Math.round(totalGoodWeightKg);
  totalScrapKg = Math.round(totalScrapKg);
  operatingHours = round1(operatingHours);
  downtimeHours = round1(downtimeHours);
  const totalPlannedHours = round1(operatingHours + downtimeHours);

  // Good Weight in Metric Tons (MT)
  const totalGoodWeightMT = (totalGoodWeightKg / 1000).toFixed(2);

  // Scrap Rate: Scrap / (Good Weight + Scrap) * 100
  const totalWeightWithScrapKg = totalGoodWeightKg + totalScrapKg;
  const scrapRatePct =
    totalWeightWithScrapKg > 0
      ? round1((totalScrapKg / totalWeightWithScrapKg) * 100)
      : 0;

  // Operating vs Downtime percentages
  const operatingPct =
    totalPlannedHours > 0
      ? round1((operatingHours / totalPlannedHours) * 100)
      : 0;
  const downtimePct =
    totalPlannedHours > 0
      ? round1((downtimeHours / totalPlannedHours) * 100)
      : 0;

  // OEE Components:
  // 1. Availability (A) = Operating Hours / Planned Hours
  const availabilityPct = operatingPct;

  // 2. Quality (Q) = Good Weight / (Good Weight + Scrap)
  const qualityPct =
    totalWeightWithScrapKg > 0
      ? round1((totalGoodWeightKg / totalWeightWithScrapKg) * 100)
      : 100;

  // 3. Performance (P) = Actual Output / Expected Nominal Output
  const performancePct =
    expectedNominalWeightKg > 0
      ? round1((totalGoodWeightKg / expectedNominalWeightKg) * 100)
      : 100;

  // Overall OEE = (A * P * Q) / 10000
  const oeePct = round1(
    ((availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100)) * 100
  );

  // Plant Average Actual kg/h
  const avgActualRateKgH =
    operatingHours > 0 ? round1(totalGoodWeightKg / operatingHours) : 0;

  // Average Capacity Utilization (Same as Performance against Nominal)
  const capacityUtilizationPct = performancePct;

  return {
    recordCount: filteredRecords.length,
    totalGoodWeightKg,
    totalGoodWeightMT,
    totalPcs,
    totalScrapKg,
    totalWeightWithScrapKg,
    scrapRatePct,
    operatingHours,
    downtimeHours,
    totalPlannedHours,
    operatingPct,
    downtimePct,
    availabilityPct,
    performancePct,
    qualityPct,
    oeePct,
    avgActualRateKgH,
    capacityUtilizationPct
  };
}

/**
 * Group and rank downtime / stoppage causes (Pareto breakdown)
 */
export function calculateDowntimeBreakdown(filteredRecords, machineMaster) {
  if (!filteredRecords || filteredRecords.length === 0) return [];

  const consolidatedRecords = consolidateDailyMachineRecords(filteredRecords, machineMaster);
  const reasonMap = new Map();
  let totalDowntimeMinutes = 0;

  for (const r of consolidatedRecords) {
    const dtH = Number(r.downtimeHours) || 0;
    if (dtH <= 0) continue;

    const dtMin = Math.round(dtH * 60);
    totalDowntimeMinutes += dtMin;

    const rawReason = String(r.reasonOfStop || '').trim();
    const reason =
      rawReason ||
      (dtH >= 6 ? 'Die Change & Sizing Setup' : 'Maintenance & Heater Stabilization');

    if (!reasonMap.has(reason)) {
      reasonMap.set(reason, {
        reason,
        totalMinutes: 0,
        occurrences: 0,
        linesAffected: new Set(),
        datesAffected: new Set()
      });
    }

    const item = reasonMap.get(reason);
    item.totalMinutes += dtMin;
    item.occurrences += 1;
    if (r.machineId) item.linesAffected.add(r.machineId);
    if (r.date) item.datesAffected.add(r.date);
  }

  const breakdown = [];
  for (const item of reasonMap.values()) {
    const totalHours = round1(item.totalMinutes / 60);
    const pctOfTotal =
      totalDowntimeMinutes > 0
        ? round1((item.totalMinutes / totalDowntimeMinutes) * 100)
        : 0;

    breakdown.push({
      reason: item.reason,
      totalMinutes: item.totalMinutes,
      totalHours,
      occurrences: item.occurrences,
      linesCount: item.linesAffected.size,
      datesCount: item.datesAffected.size,
      pctOfTotal
    });
  }

  // Sort descending by total downtime minutes
  breakdown.sort((a, b) => b.totalMinutes - a.totalMinutes);

  return breakdown;
}

/**
 * Generate machine-by-machine performance comparison matrix
 */
export function calculateMachineComparison(filteredRecords, machineMaster = MACHINES) {
  const masterList = Array.isArray(machineMaster) && machineMaster.length > 0 ? machineMaster : MACHINES;
  const consolidatedRecords = consolidateDailyMachineRecords(filteredRecords, masterList);
  const groups = new Map();

  // Initialize all machines in master
  for (const m of masterList) {
    groups.set(m.id, {
      machineId: m.id,
      machineName: m.name,
      nominalCapacityKgH: m.capacityKgH || 0,
      records: []
    });
  }

  // Group filtered records by machine
  for (const r of consolidatedRecords) {
    const id = r.machineId || 'L-01';
    if (!groups.has(id)) {
      groups.set(id, {
        machineId: id,
        machineName: r.machineName || id,
        nominalCapacityKgH: r.nominalCapacityKgH || 0,
        records: []
      });
    }
    groups.get(id).records.push(r);
  }

  const matrix = [];

  for (const g of groups.values()) {
    const metrics = calculatePlantMetrics(g.records);
    const latestRecord = g.records.length > 0 ? g.records[g.records.length - 1] : null;

    // Status evaluation:
    // - Top Performer: OEE >= 75% and good production
    // - Attention: Downtime > 25% OR Utilization < 65% OR Scrap Rate > 2.5%
    // - Optimal: Standard steady operational state
    // - Inactive: 0 operating hours
    let status = 'Optimal';
    let statusType = 'normal';

    if (metrics.operatingHours === 0) {
      status = 'Idle / Inactive';
      statusType = 'muted';
    } else if (metrics.scrapRatePct >= 2.5) {
      status = 'High Scrap Rate';
      statusType = 'warning';
    } else if (metrics.downtimePct >= 25) {
      status = 'High Downtime';
      statusType = 'danger';
    } else if (metrics.capacityUtilizationPct < 65) {
      status = 'Low Output Rate';
      statusType = 'warning';
    } else if (metrics.oeePct >= 75 && metrics.totalGoodWeightKg > 0) {
      status = 'Top Performer';
      statusType = 'success';
    }

    matrix.push({
      machineId: g.machineId,
      machineName: g.machineName,
      nominalCapacityKgH: g.nominalCapacityKgH,
      runDaysCount: g.records.length,
      latestRecord,
      ...metrics,
      status,
      statusType
    });
  }

  // Sort by machine ID (L-01, L-02, ...)
  matrix.sort((a, b) => a.machineId.localeCompare(b.machineId, undefined, { numeric: true }));

  return matrix;
}
