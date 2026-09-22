// Manufacturing Analytics & KPI Aggregation Engine
import { findMasterMachineProfile, parseDiameterToMm } from './masterProfiles.js';

export function computeAnalytics(cleanedRows) {
  if (!cleanedRows || cleanedRows.length === 0) {
    return {
      kpis: {
        totalWeightKg: 0,
        totalWeightTons: 0,
        totalPieces: 0,
        totalScrapKg: 0,
        overallScrapPercentage: 0,
        totalOperatingHours: 0,
        totalDowntimeHours: 0,
        machineUtilizationRate: 0,
        avgLineRateKgPerHour: 0,
        activeMachinesCount: 0,
        recordsCount: 0,
        dateRange: { start: '', end: '' }
      },
      byMachine: [],
      byDate: [],
      byMaterial: [],
      bySize: [],
      byDowntimeReason: [],
      topProducts: []
    };
  }

  // Basic Accumulators
  let totalWeightKg = 0;
  let totalPieces = 0;
  let totalScrapKg = 0;
  let totalOperatingHours = 0;
  let totalDowntimeHours = 0;

  const machineMap = {};
  const dateMap = {};
  const materialMap = {};
  const sizeMap = {};
  const downtimeMap = {};
  const productMap = {};

  const datesList = [];

  cleanedRows.forEach(row => {
    totalWeightKg += row.totalWeight;
    totalPieces += row.qty;
    totalScrapKg += row.scrap;
    totalOperatingHours += row.operatingHours;
    totalDowntimeHours += row.downtimeHours;

    if (row.date) datesList.push(row.date);

    // Machine grouping
    if (!machineMap[row.machine]) {
      machineMap[row.machine] = {
        machine: row.machine,
        totalWeightKg: 0,
        totalPieces: 0,
        totalScrapKg: 0,
        operatingHours: 0,
        downtimeHours: 0,
        recordsCount: 0
      };
    }
    const m = machineMap[row.machine];
    m.totalWeightKg += row.totalWeight;
    m.totalPieces += row.qty;
    m.totalScrapKg += row.scrap;
    m.operatingHours += row.operatingHours;
    m.downtimeHours += row.downtimeHours;
    m.recordsCount++;

    // Date grouping
    const dateKey = row.date || 'Unknown';
    if (!dateMap[dateKey]) {
      dateMap[dateKey] = {
        date: dateKey,
        totalWeightKg: 0,
        totalWeightTons: 0,
        totalPieces: 0,
        totalScrapKg: 0,
        operatingHours: 0,
        downtimeHours: 0
      };
    }
    const d = dateMap[dateKey];
    d.totalWeightKg += row.totalWeight;
    d.totalPieces += row.qty;
    d.totalScrapKg += row.scrap;
    d.operatingHours += row.operatingHours;
    d.downtimeHours += row.downtimeHours;

    // Material grouping
    const matKey = row.material || 'Other';
    materialMap[matKey] = (materialMap[matKey] || 0) + row.totalWeight;

    // Size grouping
    const sizeKey = row.size || 'Other';
    sizeMap[sizeKey] = (sizeMap[sizeKey] || 0) + row.totalWeight;

    // Downtime Reason grouping
    if (row.downtimeHours > 0 || row.reasonOfStop) {
      const reasonKey = row.reasonOfStop ? row.reasonOfStop.trim() : 'غير محدد (Unspecified)';
      if (!downtimeMap[reasonKey]) {
        downtimeMap[reasonKey] = { reason: reasonKey, hours: 0, count: 0 };
      }
      downtimeMap[reasonKey].hours += row.downtimeHours;
      downtimeMap[reasonKey].count++;
    }

    // Product grouping
    const prodKey = row.product;
    if (!productMap[prodKey]) {
      productMap[prodKey] = {
        product: prodKey,
        totalWeightKg: 0,
        totalPieces: 0,
        unitWeight: row.unitWeight,
        scrapKg: 0,
        machine: row.machine
      };
    }
    productMap[prodKey].totalWeightKg += row.totalWeight;
    productMap[prodKey].totalPieces += row.qty;
    productMap[prodKey].scrapKg += row.scrap;
  });

  // Sort dates
  datesList.sort();
  const startDate = datesList[0] || '';
  const endDate = datesList[datesList.length - 1] || '';

  // Overall KPIs
  const totalRawWeight = totalWeightKg + totalScrapKg;
  const overallScrapPercentage = totalRawWeight > 0 ? (totalScrapKg / totalRawWeight) * 100 : 0;
  const totalAvailableHours = (totalOperatingHours + totalDowntimeHours) || 1;
  const machineUtilizationRate = (totalOperatingHours / totalAvailableHours) * 100;
  const avgLineRateKgPerHour = totalOperatingHours > 0 ? (totalWeightKg / totalOperatingHours) : 0;

  // Format Machine Aggregations
  const byMachine = Object.values(machineMap).map(m => {
    const rawWeight = m.totalWeightKg + m.totalScrapKg;
    const scrapPct = rawWeight > 0 ? (m.totalScrapKg / rawWeight) * 100 : 0;
    const rate = m.operatingHours > 0 ? (m.totalWeightKg / m.operatingHours) : 0;
    const utilRate = (m.operatingHours + m.downtimeHours) > 0 
      ? (m.operatingHours / (m.operatingHours + m.downtimeHours)) * 100 
      : 100;

    return {
      machine: m.machine,
      totalWeightKg: Math.round(m.totalWeightKg * 10) / 10,
      totalWeightTons: Math.round((m.totalWeightKg / 1000) * 100) / 100,
      totalPieces: m.totalPieces,
      totalScrapKg: Math.round(m.totalScrapKg * 10) / 10,
      scrapPercentage: Math.round(scrapPct * 10) / 10,
      operatingHours: m.operatingHours,
      downtimeHours: m.downtimeHours,
      lineRateKgPerHour: Math.round(rate * 10) / 10,
      utilizationRate: Math.round(utilRate * 10) / 10
    };
  }).sort((a, b) => b.totalWeightKg - a.totalWeightKg);

  // Format Daily Trend
  const byDate = Object.values(dateMap).map(d => ({
    date: d.date,
    totalWeightKg: Math.round(d.totalWeightKg),
    totalWeightTons: Math.round((d.totalWeightKg / 1000) * 100) / 100,
    totalPieces: d.totalPieces,
    totalScrapKg: Math.round(d.totalScrapKg),
    operatingHours: d.operatingHours,
    downtimeHours: d.downtimeHours
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Format Materials
  const byMaterial = Object.entries(materialMap).map(([material, weight]) => ({
    name: material,
    value: Math.round(weight),
    percentage: Math.round((weight / (totalWeightKg || 1)) * 1000) / 10
  })).sort((a, b) => b.value - a.value);

  // Format Sizes
  const bySize = Object.entries(sizeMap).map(([size, weight]) => ({
    name: size,
    value: Math.round(weight),
    percentage: Math.round((weight / (totalWeightKg || 1)) * 1000) / 10
  })).sort((a, b) => b.value - a.value);

  // Format Downtime Pareto
  const byDowntimeReason = Object.values(downtimeMap).map(d => ({
    reason: d.reason,
    hours: Math.round(d.hours * 10) / 10,
    count: d.count,
    percentage: totalDowntimeHours > 0 ? Math.round((d.hours / totalDowntimeHours) * 1000) / 10 : 0
  })).sort((a, b) => b.hours - a.hours);

  // Top Products
  const topProducts = Object.values(productMap).map(p => ({
    product: p.product,
    totalWeightKg: Math.round(p.totalWeightKg),
    totalWeightTons: Math.round((p.totalWeightKg / 1000) * 100) / 100,
    totalPieces: p.totalPieces,
    scrapKg: Math.round(p.scrapKg),
    unitWeight: p.unitWeight,
    machine: p.machine
  })).sort((a, b) => b.totalWeightKg - a.totalWeightKg);

  // Engineering Extrusion Sizing & Machine Rate Matrix
  // Exclude pelletizing/compounding lines (like KTS 550) from pipe sizing analytics
  const distinctMachines = Object.keys(machineMap)
    .filter(mach => {
      const profile = findMasterMachineProfile(mach);
      return !profile || !profile.isPelletizingLine;
    })
    .sort();

  const validDiametersSet = new Set();
  cleanedRows.forEach(r => {
    const profile = findMasterMachineProfile(r.machine);
    if (profile && profile.isPelletizingLine) return; // Exclude pelletizing lines
    if (r.diameter && r.diameter !== '-' && r.diameter !== 'Unknown') {
      validDiametersSet.add(r.diameter);
    }
  });
  const distinctDiameters = Array.from(validDiametersSet);

  // Cross-Aggregation: Machine x Diameter
  const mdAgg = {};
  cleanedRows.forEach(r => {
    if (!r.diameter || r.diameter === '-' || r.diameter === 'Unknown') return;
    const profile = findMasterMachineProfile(r.machine);
    if (profile && profile.isPelletizingLine) return; // Exclude pelletizing lines from pipe sizing matrix
    const key = `${r.machine}___${r.diameter}`;
    if (!mdAgg[key]) {
      mdAgg[key] = {
        machine: r.machine,
        diameter: r.diameter,
        totalWeight: 0,
        operatingHours: 0,
        runsCount: 0,
        maxRate: 0
      };
    }
    mdAgg[key].totalWeight += r.totalWeight;
    mdAgg[key].operatingHours += r.operatingHours;
    mdAgg[key].runsCount += 1;
    if (r.lineRateKgPerHour > mdAgg[key].maxRate) {
      mdAgg[key].maxRate = r.lineRateKgPerHour;
    }
  });

  // Build Machine vs Diameter Matrix with Master Nominal Capacity & Utilization
  const machineDiameterMatrix = distinctDiameters.map(diam => {
    const diameterMm = parseDiameterToMm(diam);
    const rowObj = { diameter: diam, diameterMm, bestMachine: '', bestRate: 0, machineEntries: [] };

    distinctMachines.forEach(mach => {
      const key = `${mach}___${diam}`;
      const entry = mdAgg[key];
      const profile = findMasterMachineProfile(mach);
      const nominalCapacity = profile ? profile.nominalCapacity : null;
      const isWithinRange = profile && profile.minDiameter !== null && diameterMm !== null
        ? (diameterMm >= profile.minDiameter && diameterMm <= profile.maxDiameter)
        : true;

      if (entry && entry.operatingHours > 0) {
        const avgRate = Math.round((entry.totalWeight / entry.operatingHours) * 10) / 10;
        const utilPct = nominalCapacity > 0 ? Math.round((avgRate / nominalCapacity) * 1000) / 10 : null;

        rowObj[mach] = avgRate;
        rowObj[`${mach}_util`] = utilPct;
        rowObj[`${mach}_withinRange`] = isWithinRange;
        rowObj[`${mach}_nominal`] = nominalCapacity;

        rowObj.machineEntries.push({ 
          machine: mach, 
          rate: avgRate, 
          runs: entry.runsCount,
          utilPct,
          isWithinRange,
          nominalCapacity
        });

        if (avgRate > rowObj.bestRate) {
          rowObj.bestRate = avgRate;
          rowObj.bestMachine = mach;
        }
      } else {
        rowObj[mach] = 0;
        rowObj[`${mach}_util`] = 0;
        rowObj[`${mach}_withinRange`] = isWithinRange;
        rowObj[`${mach}_nominal`] = nominalCapacity;
      }
    });
    return rowObj;
  }).sort((a, b) => b.bestRate - a.bestRate);

  // Cross-Machine Variance Detection (Same Diameter on Multiple Lines)
  const crossMachineVariance = [];
  distinctDiameters.forEach(diam => {
    const entries = [];
    distinctMachines.forEach(mach => {
      const key = `${mach}___${diam}`;
      const item = mdAgg[key];
      if (item && item.operatingHours > 0) {
        const rate = Math.round((item.totalWeight / item.operatingHours) * 10) / 10;
        const profile = findMasterMachineProfile(mach);
        const nominalCap = profile ? profile.nominalCapacity : null;
        const utilPct = nominalCap > 0 ? Math.round((rate / nominalCap) * 1000) / 10 : null;
        entries.push({ 
          machine: mach, 
          rate, 
          runs: item.runsCount, 
          totalWeight: item.totalWeight,
          nominalCap,
          utilPct
        });
      }
    });

    if (entries.length >= 2) {
      entries.sort((a, b) => b.rate - a.rate);
      const best = entries[0];
      const worst = entries[entries.length - 1];
      const diffKg = Math.round((best.rate - worst.rate) * 10) / 10;
      const spreadPct = worst.rate > 0 ? Math.round(((best.rate - worst.rate) / worst.rate) * 100) : 0;

      crossMachineVariance.push({
        diameter: diam,
        bestMachine: best.machine,
        bestRate: best.rate,
        bestUtilPct: best.utilPct,
        worstMachine: worst.machine,
        worstRate: worst.rate,
        worstUtilPct: worst.utilPct,
        diffKg,
        spreadPct,
        entries: entries.map(e => ({
          ...e,
          gapPct: best.rate > 0 ? Math.round(((best.rate - e.rate) / best.rate) * 100) : 0
        }))
      });
    }
  });
  crossMachineVariance.sort((a, b) => b.spreadPct - a.spreadPct);

  // Optimal Operating Ranges per Extrusion Line with Master Specifications
  let plantPeakRate = 0;
  let plantPeakMachine = '';
  let plantPeakDiameter = '';

  const optimalLineRanges = distinctMachines.map(mach => {
    const machRows = cleanedRows.filter(r => r.machine === mach && r.lineRateKgPerHour > 0);
    const rates = machRows.map(r => r.lineRateKgPerHour);
    const minRate = rates.length > 0 ? Math.min(...rates) : 0;
    const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
    const totalMachWeight = machRows.reduce((acc, r) => acc + r.totalWeight, 0);
    const totalMachHours = machRows.reduce((acc, r) => acc + r.operatingHours, 0);
    const avgRate = totalMachHours > 0 ? Math.round((totalMachWeight / totalMachHours) * 10) / 10 : 0;

    const profile = findMasterMachineProfile(mach);
    const nominalCapacity = profile ? profile.nominalCapacity : null;
    const nominalRangeText = profile && profile.minDiameter !== null 
      ? `${profile.minDiameter} - ${profile.maxDiameter} mm` 
      : 'Broad / Unconstrained';
    const avgUtilPct = nominalCapacity > 0 && avgRate > 0 
      ? Math.round((avgRate / nominalCapacity) * 1000) / 10 
      : null;

    // Track plant peak
    if (maxRate > plantPeakRate) {
      plantPeakRate = maxRate;
      plantPeakMachine = mach;
      const peakRow = machRows.find(r => r.lineRateKgPerHour === maxRate);
      plantPeakDiameter = peakRow ? peakRow.diameter : '';
    }

    // Top diameter profiles for this line (>= 80% of its peak)
    const optimalDiameters = [];
    distinctDiameters.forEach(diam => {
      const key = `${mach}___${diam}`;
      const entry = mdAgg[key];
      if (entry && entry.operatingHours > 0) {
        const rate = entry.totalWeight / entry.operatingHours;
        if (maxRate > 0 && rate >= 0.80 * maxRate) {
          optimalDiameters.push({ diameter: diam, rate: Math.round(rate * 10) / 10 });
        }
      }
    });
    optimalDiameters.sort((a, b) => b.rate - a.rate);

    return {
      machine: mach,
      profileName: profile ? profile.name : mach,
      nominalCapacity,
      nominalRangeText,
      minDiameter: profile ? profile.minDiameter : null,
      maxDiameter: profile ? profile.maxDiameter : null,
      avgUtilPct,
      minRate: Math.round(minRate * 10) / 10,
      maxRate: Math.round(maxRate * 10) / 10,
      avgRate,
      operatingBand: `${Math.round(minRate)} - ${Math.round(maxRate)} kg/hr`,
      optimalDiameters: optimalDiameters.map(d => d.diameter),
      optimalProfiles: optimalDiameters,
      totalRuns: machRows.length,
      totalWeightTons: Math.round((totalMachWeight / 1000) * 10) / 10
    };
  }).sort((a, b) => b.avgRate - a.avgRate);

  // Sizing Capability Rate & Master Utilization Metrics
  const optimalLoadingCount = cleanedRows.filter(r => r.sizingStatus === 'Optimal Sizing & Loading').length;
  const rangeViolationsCount = cleanedRows.filter(r => r.sizingStatus === 'Range Violation').length;
  const optimalSizingRate = cleanedRows.length > 0 ? Math.round((optimalLoadingCount / cleanedRows.length) * 100) : 0;

  const validEfficiencies = cleanedRows.filter(r => r.lineEfficiency !== null && r.lineEfficiency > 0).map(r => r.lineEfficiency);
  const avgCapacityUtilization = validEfficiencies.length > 0
    ? Math.round((validEfficiencies.reduce((a, b) => a + b, 0) / validEfficiencies.length) * 10) / 10
    : 0;

  return {
    kpis: {
      totalWeightKg: Math.round(totalWeightKg),
      totalWeightTons: Math.round((totalWeightKg / 1000) * 100) / 100,
      totalPieces,
      totalScrapKg: Math.round(totalScrapKg),
      overallScrapPercentage: Math.round(overallScrapPercentage * 100) / 100,
      totalOperatingHours,
      totalDowntimeHours,
      machineUtilizationRate: Math.round(machineUtilizationRate * 10) / 10,
      avgLineRateKgPerHour: Math.round(avgLineRateKgPerHour * 10) / 10,
      activeMachinesCount: Object.keys(machineMap).length,
      recordsCount: cleanedRows.length,
      dateRange: { start: startDate, end: endDate },
      // Master Sizing & Capacity KPIs
      totalLines: distinctMachines.length,
      totalDiameters: distinctDiameters.length,
      plantPeakRate: Math.round(plantPeakRate * 10) / 10,
      plantPeakMachine,
      plantPeakDiameter,
      plantAvgRate: Math.round(avgLineRateKgPerHour * 10) / 10,
      optimalSizingRate,
      rangeViolationsCount,
      optimalLoadingCount,
      avgCapacityUtilization,
      varianceConflictsCount: crossMachineVariance.filter(v => v.spreadPct > 15).length
    },
    byMachine,
    byDate,
    byMaterial,
    bySize,
    byDowntimeReason,
    topProducts,
    // Engineering Modules
    distinctMachines,
    distinctDiameters,
    machineDiameterMatrix,
    crossMachineVariance,
    optimalLineRanges
  };
}

