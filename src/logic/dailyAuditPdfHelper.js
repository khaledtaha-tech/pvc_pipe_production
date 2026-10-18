import { MACHINES, matchMachine } from '../config/machines.js';
import { round1 } from './engine.js';
import { buildMatrixRowsForDate } from './reconciliationMatrixHelper.js';
import { getFullMachineName, getBaselineRate } from './standardCatalogHelper.js';
import { loadReportByDateAndMachine } from '../data/store.js';

/**
 * Format a Date object to YYYY-MM-DD in local time
 * @param {Date} date
 * @returns {string}
 */
export function formatLocalDateISO(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get the previous calendar day (Yesterday) relative to a base date.
 * If no base date is passed, calculates relative to current system date.
 * @param {string} [baseDateStr]
 * @returns {string} YYYY-MM-DD
 */
export function getYesterdayDate(baseDateStr) {
  let d;
  if (baseDateStr && /^\d{4}-\d{2}-\d{2}$/.test(baseDateStr)) {
    const [y, m, day] = baseDateStr.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date();
  }
  if (Number.isNaN(d.getTime())) {
    d = new Date();
  }
  d.setDate(d.getDate() - 1);
  return formatLocalDateISO(d);
}

/**
 * Find the latest available recorded production date from records
 * @param {Array} records
 * @returns {string|null}
 */
export function findLatestRecordedDate(records = []) {
  if (!Array.isArray(records) || records.length === 0) return null;
  const dateSet = new Set();
  records.forEach((r) => {
    const d = r.date || r.Date || r['Production Date'];
    if (d && !String(d).toLowerCase().includes('total') && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      dateSet.add(d);
    }
  });
  if (dateSet.size === 0) return null;
  const sorted = Array.from(dateSet).sort();
  return sorted[sorted.length - 1];
}

/**
 * Format date nicely for executive display (e.g., "Saturday, 17-10-2026")
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string}
 */
export function formatExecutiveAuditDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  if (Number.isNaN(dateObj.getTime())) return dateStr;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[dateObj.getDay()];
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${dayName}, ${dd}-${mm}-${y}`;
}

/**
 * Compile all metrics and machine rows for the single-page daily audit report
 * @param {Object} options
 * @param {string} options.date - Target YYYY-MM-DD
 * @param {Array} options.records - Ingested dataset / persistent records
 * @param {Array} [options.machineMaster=MACHINES] - Master list of machines
 * @param {Function} [options.loadReportFn] - Optional storage lookup
 * @returns {Object} Complete structured audit report data
 */
export function buildDailyAuditReportData({
  date,
  records = [],
  machineMaster = MACHINES,
  loadReportFn = (d, m) => loadReportByDateAndMachine(d, m)
}) {
  const targetDate = date || getYesterdayDate();

  // 1. Build matrix reconciliation rows
  const rawRows = buildMatrixRowsForDate({
    date: targetDate,
    machineMaster,
    combinedDatasets: records,
    loadReportByDateAndMachineFn: loadReportFn
  });

  // 2. Process machine rows with strict integer piece enforcement and formatting
  let totalActualPcs = 0;
  let totalActualKg = 0;
  let totalExpectedPcs = 0;
  let totalExpectedKg = 0;
  let totalScrapKg = 0;
  let totalOperatingHours = 0;
  let totalLostHours = 0;
  let totalUnjustifiedHours = 0;

  const downtimeTotals = {
    moldChange: 0,
    purgeCleaning: 0,
    heaterFailure: 0,
    mechanical: 0,
    materialNoOrder: 0,
    other: 0,
    weekendPlanned: 0
  };

  const lineRows = rawRows.map((r) => {
    const lineId = r.lineIdDisplay || r.lineId;
    const baseLineId = r.baseLineId || r.lineId;
    const fullMachineName = getFullMachineName(baseLineId, machineMaster);
    const pipeSize = r.pipeSize || r.productDescription || '-';
    const productCode = r.productCode || '-';

    // Baseline target resolution: Central Catalog Standard > Row Target Rate > Nominal / Std Wt
    const catalogBaseline = getBaselineRate(baseLineId, productCode);
    const targetRate = catalogBaseline && Number(catalogBaseline) > 0
      ? Math.round(Number(catalogBaseline))
      : Math.round(Number(r.targetRate || r.stdRate) || 0);

    const expectedPcs = targetRate > 0 && catalogBaseline
      ? Math.round(targetRate * 24)
      : Math.round(Number(r.expectedPcs) || 0);
    const expectedKg = r.stdWeight > 0 && catalogBaseline
      ? round1(expectedPcs * r.stdWeight)
      : round1(Number(r.expectedKg) || 0);

    const actualPcs = Math.round(Number(r.actualPcs) || 0);
    const actualKg = round1(Number(r.actualKg) || 0);

    const variancePcs = actualPcs - expectedPcs;
    const varianceKg = round1(actualKg - expectedKg);

    const scrapKg = round1(Number(r.scrapKg) || 0);
    let operatingHours = round1(Number(r.operatingHours) || 0);

    const actualRatePcsH = Math.round(Number(r.actualRatePcsH) || 0);
    const actualRateKgH = round1(Number(r.actualRateKgH) || 0);

    const speedEffPct = round1(Number(r.speedEffPct || r.performancePct) || 0);
    const availPct = round1(Number(r.availPct || r.availabilityPct) || 0);
    const qualityPct = round1(Number(r.qualityPct) || 100.0);
    const oeePct = round1(Number(r.oeePct) || 0);

    const lostHours = round1(Number(r.theoreticalLostHours ?? r.lostHours) || 0);
    const unjustifiedLostHours = round1(Number(r.unjustifiedLostHours) || 0);

    let moldChangeHours = round1(Number(r.moldChangeHours) || 0);
    let purgeCleaningHours = round1(Number(r.purgeCleaningHours) || 0);
    let heaterFailureHours = round1(Number(r.heaterFailureHours) || 0);
    let mechanicalHours = round1(Number(r.mechanicalHours) || 0);
    let materialNoOrderHours = round1(Number(r.materialNoOrderHours) || 0);
    let otherHours = round1(Number(r.otherHours) || 0);
    let isWeekend = Boolean(r.isPlannedWeekendShutdown);

    // Fallback: If matrix row has 0 downtime, extract from raw records if available
    if (
      moldChangeHours === 0 &&
      purgeCleaningHours === 0 &&
      heaterFailureHours === 0 &&
      mechanicalHours === 0 &&
      materialNoOrderHours === 0 &&
      otherHours === 0 &&
      Array.isArray(records)
    ) {
      const lineRecs = records.filter((rec) => {
        const m = matchMachine(rec.machineId || rec.machineRaw || rec.lineId, machineMaster);
        return (m?.id || rec.machineId || rec.lineId) === baseLineId;
      });

      lineRecs.forEach((rec) => {
        if (Number(rec.moldChangeHours) > 0) moldChangeHours = round1(moldChangeHours + Number(rec.moldChangeHours));
        if (Number(rec.purgeCleaningHours) > 0) purgeCleaningHours = round1(purgeCleaningHours + Number(rec.purgeCleaningHours));
        if (Number(rec.heaterFailureHours) > 0) heaterFailureHours = round1(heaterFailureHours + Number(rec.heaterFailureHours));
        if (Number(rec.mechanicalHours) > 0) mechanicalHours = round1(mechanicalHours + Number(rec.mechanicalHours));
        if (Number(rec.materialNoOrderHours) > 0) materialNoOrderHours = round1(materialNoOrderHours + Number(rec.materialNoOrderHours));
        if (Number(rec.otherHours) > 0) otherHours = round1(otherHours + Number(rec.otherHours));

        if (Array.isArray(rec.downtimeEvents)) {
          rec.downtimeEvents.forEach((ev) => {
            const reason = ev.reason ? String(ev.reason).toLowerCase() : '';
            const hrs = Number(ev.hours) || (Number(ev.durationMin) / 60) || 0;
            if (reason.includes('mold') || reason.includes('die')) moldChangeHours = round1(moldChangeHours + hrs);
            else if (reason.includes('purge') || reason.includes('clean')) purgeCleaningHours = round1(purgeCleaningHours + hrs);
            else if (reason.includes('heat') || reason.includes('thermo') || reason.includes('elect')) heaterFailureHours = round1(heaterFailureHours + hrs);
            else if (reason.includes('mech') || reason.includes('puller') || reason.includes('jam')) mechanicalHours = round1(mechanicalHours + hrs);
            else if (reason.includes('order') || reason.includes('material') || reason.includes('resin')) materialNoOrderHours = round1(materialNoOrderHours + hrs);
            else otherHours = round1(otherHours + hrs);
          });
        }
        if (Number(rec.operatingHours) > 0 && rec.operatingHours < 24) {
          operatingHours = round1(Number(rec.operatingHours));
        }
      });
    }

    // Accumulate plant totals
    totalActualPcs += actualPcs;
    totalActualKg += actualKg;
    totalExpectedPcs += expectedPcs;
    totalExpectedKg += expectedKg;
    totalScrapKg += scrapKg;
    totalOperatingHours += operatingHours;
    totalLostHours += lostHours;
    totalUnjustifiedHours += unjustifiedLostHours;

    downtimeTotals.moldChange += moldChangeHours;
    downtimeTotals.purgeCleaning += purgeCleaningHours;
    downtimeTotals.heaterFailure += heaterFailureHours;
    downtimeTotals.mechanical += mechanicalHours;
    downtimeTotals.materialNoOrder += materialNoOrderHours;
    downtimeTotals.other += otherHours;
    if (isWeekend) {
      downtimeTotals.weekendPlanned += otherHours;
    }

    // Determine performance status badge
    let status = 'idle';
    if (actualPcs > 0 || operatingHours > 0) {
      if (variancePcs >= 0) {
        status = 'on-track';
      } else if (Math.abs(variancePcs) / Math.max(1, expectedPcs) <= 0.15) {
        status = 'minor-loss';
      } else {
        status = 'critical-loss';
      }
    }

    return {
      lineId,
      baseLineId: r.baseLineId || r.lineId,
      fullMachineName,
      productCode,
      pipeSize,
      nominalCapacity: r.nominalCapacity,
      stdWeight: r.stdWeight,
      stdRate: targetRate,
      expectedPcs,
      expectedKg,
      actualPcs,
      actualKg,
      variancePcs,
      varianceKg,
      scrapKg,
      operatingHours,
      actualRatePcsH,
      actualRateKgH,
      speedEffPct,
      availPct,
      qualityPct,
      oeePct,
      lostHours,
      unjustifiedLostHours,
      moldChangeHours,
      purgeCleaningHours,
      heaterFailureHours,
      mechanicalHours,
      materialNoOrderHours,
      otherHours,
      isPlannedWeekendShutdown: isWeekend,
      status,
      isOperating: actualPcs > 0 || operatingHours > 0
    };
  });

  // 3. Compute Executive Summary KPIs
  totalActualKg = round1(totalActualKg);
  totalExpectedKg = round1(totalExpectedKg);
  totalScrapKg = round1(totalScrapKg);
  totalOperatingHours = round1(totalOperatingHours);
  totalLostHours = round1(totalLostHours);
  totalUnjustifiedHours = round1(totalUnjustifiedHours);

  const totalMeltKg = round1(totalActualKg + totalScrapKg);
  const scrapRatioPct = totalMeltKg > 0 ? round1((totalScrapKg / totalMeltKg) * 100) : 0;
  const totalVariancePcs = totalActualPcs - totalExpectedPcs;
  const totalVarianceKg = round1(totalActualKg - totalExpectedKg);
  const totalVariancePct = totalExpectedPcs > 0
    ? round1(((totalActualPcs - totalExpectedPcs) / totalExpectedPcs) * 100)
    : 0;

  // Total plant nominal hours = 7 lines * 24.0h = 168.0h
  const activeLines = lineRows.filter((r) => r.isOperating);
  const totalPlantCapacityHours = machineMaster.length * 24.0;
  const plantAvailabilityPct = totalPlantCapacityHours > 0
    ? round1(Math.min(100, (totalOperatingHours / totalPlantCapacityHours) * 100))
    : 0;

  // Operating lines performance average
  const totalOperatingCapacityKg = activeLines.reduce(
    (sum, r) => sum + (Number(r.nominalCapacity || 200) * Number(r.operatingHours || 0)),
    0
  );
  const plantPerformancePct = totalOperatingCapacityKg > 0
    ? round1(Math.min(100, (totalActualKg / totalOperatingCapacityKg) * 100))
    : 0;

  const plantQualityPct = totalMeltKg > 0
    ? round1((totalActualKg / totalMeltKg) * 100)
    : 100.0;

  const plantOeePct = round1((plantAvailabilityPct * plantPerformancePct * plantQualityPct) / 10000);

  // Round downtime category totals
  Object.keys(downtimeTotals).forEach((k) => {
    downtimeTotals[k] = round1(downtimeTotals[k]);
  });
  const totalDowntimeHours = round1(
    downtimeTotals.moldChange +
    downtimeTotals.purgeCleaning +
    downtimeTotals.heaterFailure +
    downtimeTotals.mechanical +
    downtimeTotals.materialNoOrder +
    downtimeTotals.other
  );

  return {
    meta: {
      targetDate,
      targetDateFormatted: formatExecutiveAuditDate(targetDate),
      plantName: 'AL MANAR PIPES FACTORY - EXTRUSION DIVISION',
      title: 'DAILY PRODUCTION & OPERATIONAL AUDIT REPORT',
      shiftCycle: '24-Hour Continuous Extrusion Cycle',
      sopReference: 'DOC-Ext.-03',
      standardVersion: 'Standard Operating Procedure v2.4',
      generatedTimestamp: new Date().toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    },
    kpis: {
      totalActualPcs,
      totalActualKg,
      totalActualMT: (totalActualKg / 1000).toFixed(2),
      totalExpectedPcs,
      totalExpectedKg,
      totalVariancePcs,
      totalVarianceKg,
      totalVariancePct,
      totalScrapKg,
      totalMeltKg,
      scrapRatioPct,
      totalOperatingHours,
      totalLostHours,
      totalUnjustifiedHours,
      totalPlantCapacityHours,
      plantAvailabilityPct,
      plantPerformancePct,
      plantQualityPct,
      plantOeePct,
      activeLineCount: activeLines.length,
      totalLineCount: machineMaster.length
    },
    downtime: {
      categories: [
        { key: 'moldChange', label: 'Die & Mold Change', hours: downtimeTotals.moldChange },
        { key: 'purgeCleaning', label: 'Purging & Cleaning', hours: downtimeTotals.purgeCleaning },
        { key: 'heaterFailure', label: 'Heater & Electrical', hours: downtimeTotals.heaterFailure },
        { key: 'mechanical', label: 'Mechanical & Puller', hours: downtimeTotals.mechanical },
        { key: 'materialNoOrder', label: 'Material & No Order', hours: downtimeTotals.materialNoOrder },
        { key: 'other', label: 'Planned / Other Stop', hours: downtimeTotals.other }
      ],
      totalDowntimeHours,
      weekendPlannedHours: downtimeTotals.weekendPlanned
    },
    rows: lineRows
  };
}

/**
 * Resolves the dynamic density preset and styling scale based on active row count
 * @param {number} rowCount - Count of rendered/displayed machine rows
 * @returns {Object} Preset tokens and CSS classes
 */
export function getAuditDensityPreset(rowCount) {
  const count = Number(rowCount) || 0;
  const mode = count <= 4 ? 'low' : count <= 7 ? 'medium' : 'compact';

  if (mode === 'low') {
    return {
      mode: 'low',
      // Table Rows & Fonts
      cellPaddingClass: 'py-4 px-3.5',
      tableTextClass: 'text-[13.5px]',
      tableHeaderClass: 'text-[12px] py-2.5 px-3.5',
      lineNameClass: 'text-[13.5px]',
      badgeClass: 'text-[11px] px-2 py-0.5',
      subtextClass: 'text-[10.5px]',
      unitClass: 'text-[10px]',
      summaryRowClass: 'text-[13px] py-3 px-3.5',

      // KPI Cards
      kpiCardPaddingClass: 'p-3.5 px-4',
      kpiTitleClass: 'text-[11px]',
      kpiMetricClass: 'text-[22px]',
      kpiSecondaryMetricClass: 'text-[15px]',
      kpiSubtextClass: 'text-[10px]',

      // Downtime Section
      downtimeHeaderClass: 'text-[12.5px]',
      downtimeBadgeClass: 'text-[10px] px-2 py-0.5',
      downtimeSubtextClass: 'text-[10.5px]',
      downtimeCardPaddingClass: 'p-2.5 px-3',
      downtimeLabelClass: 'text-[10.5px]',
      downtimeMetricClass: 'text-[16px]',
      downtimePctClass: 'text-[10px]',
      downtimeBarClass: 'w-16 h-2',

      // Overall Page Header
      headerTitleClass: 'text-[18px]',
      headerPlantClass: 'text-[12px]',
      headerSubClass: 'text-[10px]',
      ampBadgeClass: 'w-9 h-9 text-lg',
      dateBadgeClass: 'px-3.5 py-1 text-sm'
    };
  }

  if (mode === 'medium') {
    return {
      mode: 'medium',
      // Table Rows & Fonts
      cellPaddingClass: 'py-2.5 px-2.5',
      tableTextClass: 'text-[12px]',
      tableHeaderClass: 'text-[10.5px] py-2 px-2.5',
      lineNameClass: 'text-[12px]',
      badgeClass: 'text-[10px] px-2 py-0.5',
      subtextClass: 'text-[9.5px]',
      unitClass: 'text-[9px]',
      summaryRowClass: 'text-[11.5px] py-2 px-2.5',

      // KPI Cards
      kpiCardPaddingClass: 'p-2.5 px-3',
      kpiTitleClass: 'text-[10px]',
      kpiMetricClass: 'text-[18px]',
      kpiSecondaryMetricClass: 'text-[13px]',
      kpiSubtextClass: 'text-[9px]',

      // Downtime Section
      downtimeHeaderClass: 'text-[11px]',
      downtimeBadgeClass: 'text-[9px] px-1.5 py-0.5',
      downtimeSubtextClass: 'text-[9.5px]',
      downtimeCardPaddingClass: 'p-2 px-2.5',
      downtimeLabelClass: 'text-[9px]',
      downtimeMetricClass: 'text-[14px]',
      downtimePctClass: 'text-[9px]',
      downtimeBarClass: 'w-12 h-1.5',

      // Overall Page Header
      headerTitleClass: 'text-[16px]',
      headerPlantClass: 'text-[11px]',
      headerSubClass: 'text-[9.5px]',
      ampBadgeClass: 'w-8 h-8 text-base',
      dateBadgeClass: 'px-3 py-0.5 text-xs'
    };
  }

  // Compact density (8+ rows / All lines)
  return {
    mode: 'compact',
    // Table Rows & Fonts
    cellPaddingClass: 'py-1.5 px-2',
    tableTextClass: 'text-[10.5px]',
    tableHeaderClass: 'text-[9.5px] py-1 px-2',
    lineNameClass: 'text-[10.5px]',
    badgeClass: 'text-[8.5px] px-1.5 py-0.2',
    subtextClass: 'text-[8px]',
    unitClass: 'text-[7.5px]',
    summaryRowClass: 'text-[10px] py-1 px-2',

    // KPI Cards
    kpiCardPaddingClass: 'p-2 px-2',
    kpiTitleClass: 'text-[9px]',
    kpiMetricClass: 'text-[16px]',
    kpiSecondaryMetricClass: 'text-[12px]',
    kpiSubtextClass: 'text-[8px]',

    // Downtime Section
    downtimeHeaderClass: 'text-[10px]',
    downtimeBadgeClass: 'text-[8px] px-1.5 py-0.2',
    downtimeSubtextClass: 'text-[8.5px]',
    downtimeCardPaddingClass: 'p-1.5 px-2',
    downtimeLabelClass: 'text-[8px]',
    downtimeMetricClass: 'text-[12px]',
    downtimePctClass: 'text-[8px]',
    downtimeBarClass: 'w-10 h-1',

    // Overall Page Header
    headerTitleClass: 'text-[15px]',
    headerPlantClass: 'text-[10.5px]',
    headerSubClass: 'text-[9px]',
    ampBadgeClass: 'w-7 h-7 text-sm',
    dateBadgeClass: 'px-2.5 py-0.5 text-xs'
  };
}
