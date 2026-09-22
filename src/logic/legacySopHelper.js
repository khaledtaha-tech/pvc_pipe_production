import { MACHINES, matchMachine } from '../config/machines.js';
export { MACHINES, matchMachine };
import { parseProductSpecs } from './excelParser.js';

/**
 * Helper logic for Legacy Plant SOP (DOC-Ext.-03: PRODUCTION PIECES / Production follow)
 */

export const SOP_SHIFT1_HOURS = ['06:30', '07:30', '08:30', '09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30', '17:30'];
export const SOP_SHIFT2_HOURS = ['18:30', '19:30', '20:30', '21:30', '22:30', '23:30', '00:30', '01:30', '02:30', '03:30', '04:30', '05:30'];

/**
 * Cleanly format full machine name (e.g. "L-07 - KTS 170")
 * Resolves model from lineCustom or dynamically matches against machine master catalog,
 * and sanitizes duplicate line ID prefixes.
 */
export function formatFullMachineName(lineId, lineCustom, machineList = MACHINES) {
  const id = (lineId || '').trim();
  let custom = (lineCustom || '').trim();

  // If custom is identical to id, treat custom as empty so catalog name can be matched
  if (id && custom.toUpperCase() === id.toUpperCase()) {
    custom = '';
  }

  // If custom is empty, try to match by lineId in machine catalog
  if (!custom && id) {
    const matched = matchMachine(id, machineList);
    if (matched && matched.name) {
      custom = matched.name.trim();
    }
  }

  // If still no custom name found, return id
  if (!custom) return id || 'WIND1';

  // Sanitize if custom already starts with id (e.g. "L-07 - KTS 170" or "L-07: KTS 170")
  if (id && custom.toUpperCase().startsWith(id.toUpperCase())) {
    custom = custom.slice(id.length).replace(/^[\s-:–—]+/, '').trim();
  }
  // Sanitize if custom ends with id (e.g. "KTS 170 - L-07")
  if (id && custom.toUpperCase().endsWith(id.toUpperCase())) {
    custom = custom.slice(0, -id.length).replace(/[\s-:–—]+$/, '').trim();
  }

  return custom ? (id ? `${id} - ${custom}` : custom) : id;
}

/**
 * Format date string into template formats:
 * - dots: "17.09.2026"
 * - spaces: "17 9 2026"
 */
export function formatSopDates(dateStr) {
  if (!dateStr) {
    return { dots: '17.09.2026', spaces: '17 9 2026' };
  }
  const str = String(dateStr).trim();
  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    let y, m, d;
    if (parts[0].length === 4) {
      [y, m, d] = parts;
    } else {
      [d, m, y] = parts;
    }
    const day = parseInt(d, 10) || 1;
    const month = parseInt(m, 10) || 1;
    const year = parseInt(y, 10) || 2026;
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    return {
      dots: `${dd}.${mm}.${year}`,
      spaces: `${day} ${month} ${year}`
    };
  }
  return { dots: str, spaces: str };
}

/**
 * Calculate standard production pieces array based on cut length.
 * By default (cumulative = false), returns non-cumulative constant hourly rate per row (e.g. 100, 100, 100...)
 * If cumulative = true, returns cumulative sum (e.g. 100, 200, 300...)
 */
export function calculateStandardProduction(speedMPerMin, count = 12, cumulative = false, pipeLength = 6.0) {
  const speed = Number(speedMPerMin);
  const length = Number(pipeLength) > 0 ? Number(pipeLength) : 6.0;
  // target pcs/h = (speed m/min * 60) / pipe length
  const hourlyRate = (speed > 0 && length > 0) ? Math.round((speed * 60) / length) : 0;
  const out = [];
  for (let i = 1; i <= count; i += 1) {
    out.push(cumulative ? i * hourlyRate : hourlyRate);
  }
  return out;
}

/**
 * Backward compatibility alias for cumulative standard production
 */
export function calculateStandardCumulative(speedMPerMin, count = 12, pipeLength = 6.0) {
  return calculateStandardProduction(speedMPerMin, count, true, pipeLength);
}

/**
 * Calculate non-cumulative standard hourly rate sequence (e.g. 100, 100, 100...)
 */
export function calculateStandardHourly(speedMPerMin, count = 12, pipeLength = 6.0) {
  return calculateStandardProduction(speedMPerMin, count, false, pipeLength);
}

/**
 * Compute calculated hourly standard production rate in pieces (Pcs) based on line speed and cut length:
 * target pcs/h = (speed m/min * 60) / pipe length
 */
export function computeStandardHourlyPieces(report, ref) {
  const pipeLen = Number(ref?.pipeLength) > 0 ? Number(ref?.pipeLength) : 6.0;
  const explicitSpeed = Number(ref?.speed);
  if (explicitSpeed > 0 && pipeLen > 0) {
    return Math.round((explicitSpeed * 60) / pipeLen);
  }
  const targetRate = Number(ref?.targetRate);
  if (targetRate > 0) {
    return Math.round(targetRate);
  }
  const lineId = report?.header?.lineId;
  const machine = lineId ? matchMachine(lineId) : null;
  const stdWeight = Number(ref?.stdWeight);
  if (machine && machine.capacityKgH > 0 && stdWeight > 0) {
    return Math.round(machine.capacityKgH / stdWeight);
  }
  return 100;
}

/**
 * Backward compatibility alias for computeStandardHourlyPieces
 */
export const computeStandardHourlyMeters = computeStandardHourlyPieces;

/**
 * Build consolidated SOP data model from active report & derived calculations.
 * Supports isBlank option for physical on-floor recording blank sheets,
 * and standard production in pieces based on cut length.
 */
export function buildSopModel(report, derived, options = {}) {
  const isBlank = Boolean(options.isBlank || report?.isBlank);
  const isCumulative = Boolean(options.cumulative);
  const explicitStdRate = options.standardRate !== undefined && options.standardRate !== null && options.standardRate !== ''
    ? Number(options.standardRate)
    : null;

  const header = isBlank ? {} : (report?.header || {});
  const summary = isBlank ? {} : (report?.summary || {});
  const refs = isBlank ? {} : (report?.refs || {});
  const ref1 = refs['1'] || {};
  const ref2 = refs['2'] || {};
  const slots = (isBlank || !derived?.slots || derived.slots.length !== 24)
    ? (isBlank ? [] : (report?.slots || []))
    : derived.slots;

  const dates = isBlank ? { dots: '', spaces: '' } : formatSopDates(header.date);

  const speed1 = Number(ref1.speed) > 0 ? Number(ref1.speed) : (isBlank ? '' : 10);
  const speed2 = Number(ref2.speed) > 0 ? Number(ref2.speed) : (isBlank ? '' : speed1);
  const pipeLen1 = Number(ref1.pipeLength) > 0 ? Number(ref1.pipeLength) : 6.0;
  const unitWeight1 = Number(ref1.stdWeight) > 0 ? Number(ref1.stdWeight) : 1.0;
  const pipeLen2 = Number(ref2.pipeLength) > 0 ? Number(ref2.pipeLength) : pipeLen1;
  const unitWeight2 = Number(ref2.stdWeight) > 0 ? Number(ref2.stdWeight) : unitWeight1;

  // Standard production sequence in pieces: pre-fill constant hourly rate across all 24 rows
  const hourlyRate1 = explicitStdRate !== null
    ? explicitStdRate
    : computeStandardHourlyPieces(report, ref1);
  const hourlyRate2 = explicitStdRate !== null
    ? explicitStdRate
    : ((ref2 && (ref2.speed || ref2.targetRate)) ? computeStandardHourlyPieces(report, ref2) : hourlyRate1);

  const stdShift1 = [];
  const stdShift2 = [];
  for (let i = 1; i <= 12; i += 1) {
    stdShift1.push(isCumulative ? i * hourlyRate1 : hourlyRate1);
    stdShift2.push(isCumulative ? i * hourlyRate2 : hourlyRate2);
  }

  const shift1Rows = [];
  let s1GoodPcsTotal = 0;
  let s1ScrapKgTotal = 0;

  for (let i = 0; i < 12; i += 1) {
    const slot = slots[i] || {};
    const hour = SOP_SHIFT1_HOURS[i];
    const stdPcs = stdShift1[i];

    if (isBlank) {
      shift1Rows.push({
        hour,
        stdPcs,
        stdM: stdPcs,
        goodPcs: '',
        goodM: '',
        cause: '',
        downtime: '',
        rejectKg: ''
      });
      continue;
    }

    const isFullStop = slot.downtime >= 60;
    const actualPcs = Number(slot.actual) || 0;
    const unitWeight = slot.ref === '2' ? unitWeight2 : unitWeight1;
    const goodPcs = isFullStop ? 0 : (actualPcs > 0 ? actualPcs : (slot.actual === 0 ? 0 : ''));
    const downtime = Number(slot.downtime) > 0 ? Number(slot.downtime) : 0;
    const cause = (slot.reason || '').trim();
    const scrapPcs = Number(slot.scrap) || 0;
    const rejectKg = scrapPcs > 0 ? Math.round(scrapPcs * unitWeight) : (slot.purge > 0 ? Number(slot.purge) : '');

    if (typeof goodPcs === 'number') {
      s1GoodPcsTotal += goodPcs;
    }
    if (typeof rejectKg === 'number') {
      s1ScrapKgTotal += rejectKg;
    }

    shift1Rows.push({
      hour,
      stdPcs,
      stdM: stdPcs,
      goodPcs: goodPcs > 0 ? goodPcs : (isFullStop ? 0 : (actualPcs > 0 ? goodPcs : '')),
      goodM: goodPcs > 0 ? goodPcs : (isFullStop ? 0 : (actualPcs > 0 ? goodPcs : '')),
      cause,
      downtime,
      rejectKg
    });
  }

  const shift2Rows = [];
  let s2GoodPcsTotal = 0;
  let s2ScrapKgTotal = 0;

  for (let i = 0; i < 12; i += 1) {
    const slot = slots[i + 12] || {};
    const hour = SOP_SHIFT2_HOURS[i];
    const stdPcs = stdShift2[i];

    if (isBlank) {
      shift2Rows.push({
        hour,
        stdPcs,
        stdM: stdPcs,
        goodPcs: '',
        goodM: '',
        cause: '',
        downtime: '',
        rejectKg: ''
      });
      continue;
    }

    const isFullStop = slot.downtime >= 60;
    const actualPcs = Number(slot.actual) || 0;
    const unitWeight = slot.ref === '2' ? unitWeight2 : unitWeight1;
    const goodPcs = isFullStop ? 0 : (actualPcs > 0 ? actualPcs : (slot.actual === 0 ? 0 : ''));
    const downtime = Number(slot.downtime) > 0 ? Number(slot.downtime) : 0;
    const cause = (slot.reason || '').trim();
    const scrapPcs = Number(slot.scrap) || 0;
    const rejectKg = scrapPcs > 0 ? Math.round(scrapPcs * unitWeight) : (slot.purge > 0 ? Number(slot.purge) : '');

    if (typeof goodPcs === 'number') {
      s2GoodPcsTotal += goodPcs;
    }
    if (typeof rejectKg === 'number') {
      s2ScrapKgTotal += rejectKg;
    }

    shift2Rows.push({
      hour,
      stdPcs,
      stdM: stdPcs,
      goodPcs: goodPcs > 0 ? goodPcs : (isFullStop ? 0 : (actualPcs > 0 ? goodPcs : '')),
      goodM: goodPcs > 0 ? goodPcs : (isFullStop ? 0 : (actualPcs > 0 ? goodPcs : '')),
      cause,
      downtime,
      rejectKg
    });
  }

  const fullMachineName = isBlank
    ? ''
    : formatFullMachineName(header.lineId, header.lineCustom);

  let productDescription = isBlank ? '' : (ref1.pipeSpec || 'HDPE 20 MM Code 930');
  if (!isBlank && ref2.pipeSpec && ref2.pipeSpec !== ref1.pipeSpec) {
    productDescription = `${ref1.pipeSpec} / ${ref2.pipeSpec}`;
  }

  const s1TotalGoodPcs = isBlank ? '' : (Number.isInteger(s1GoodPcsTotal) ? s1GoodPcsTotal : Math.round(s1GoodPcsTotal * 10) / 10);
  const s1TotalScrapKg = isBlank ? '' : s1ScrapKgTotal;
  const s2TotalGoodPcs = isBlank ? '' : (Number.isInteger(s2GoodPcsTotal) ? s2GoodPcsTotal : Math.round(s2GoodPcsTotal * 10) / 10);
  const s2TotalScrapKg = isBlank ? '' : s2ScrapKgTotal;

  return {
    docCode: 'DOC-Ext.-03',
    version: '3',
    creationDate: '18-01-18',
    plantName: (report?.header?.plantName || 'AL Manar'),
    dateDots: dates.dots,
    dateSpaces: dates.spaces,
    lineId: isBlank ? '' : fullMachineName,
    lineCode: isBlank ? '' : (header.lineId || 'WIND1'),
    lineCustom: isBlank ? '' : (header.lineCustom || ''),
    fullMachineName,
    productDescription,
    speed1: isBlank ? '' : speed1,
    speed2: isBlank ? '' : speed2,
    shift1Rows,
    shift2Rows,
    s1TotalGoodPcs,
    s1TotalGoodM: s1TotalGoodPcs,
    s1TotalScrapKg,
    s2TotalGoodPcs,
    s2TotalGoodM: s2TotalGoodPcs,
    s2TotalScrapKg,
    shift1Lead: isBlank ? '' : (summary.shift1Lead || ''),
    shift2Lead: isBlank ? '' : (summary.shift2Lead || ''),
    isBlank
  };
}

/**
 * Dedicated builder for clean blank SOP follow sheet model
 */
export function buildBlankSopModel(options = {}) {
  return buildSopModel(null, null, { ...options, isBlank: true });
}

/**
 * Find the most recent operational production run for a machine on or prior to targetDate.
 */
export function findPreviousRunForMachine(records, lineId, targetDate = '') {
  if (!Array.isArray(records) || records.length === 0 || !lineId) {
    return null;
  }
  const cleanId = String(lineId).trim().toUpperCase();
  const target = targetDate ? String(targetDate).trim() : '';

  // 1. Filter records matching this machine
  const machineRecords = records.filter((r) => {
    if (!r) return false;
    const rId = (r.machineId || r.matchedMachine?.id || r.machineRaw || '').trim().toUpperCase();
    return rId === cleanId;
  });

  if (machineRecords.length === 0) {
    return null;
  }

  // 2. Filter for operational records (operatingHours > 0 or productionQty > 0 or actualRateKgH > 0)
  const opRecords = machineRecords.filter((r) => {
    const opHours = Number(r.operatingHours) || 0;
    const qty = Number(r.productionQty) || 0;
    const rate = Number(r.actualRateKgH) || 0;
    return opHours > 0 || qty > 0 || rate > 0;
  });

  const pool = opRecords.length > 0 ? opRecords : machineRecords;

  // 3. If targetDate provided, look for records strictly before targetDate (< targetDate),
  // then fallback to <= targetDate, then fallback to any available
  let candidates = target ? pool.filter((r) => r.date && r.date < target) : [];
  if (candidates.length === 0 && target) {
    candidates = pool.filter((r) => r.date && r.date <= target);
  }
  if (candidates.length === 0) {
    candidates = [...pool];
  }

  // 4. Sort descending by date
  candidates.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  return candidates[0] || null;
}

/**
 * Extract operational pipe specs, speed, and cut length from a run record or fall back to machine master defaults.
 */
export function extractMachineSpecsFromRun(record, lineId, machineMaster = MACHINES) {
  const cleanId = String(lineId || '').trim();
  const machine = matchMachine(cleanId, machineMaster) || { id: cleanId, name: cleanId, capacityKgH: 250 };
  const fullMachineName = formatFullMachineName(cleanId, '', machineMaster);

  if (record) {
    const item = (Array.isArray(record.items) && record.items.length > 0) ? record.items[0] : record;
    const desc = (item.description || item.itemCode || 'HDPE 20 MM Code 930').trim();
    const unitWeight = Number(item.unitWeight) > 0 ? Number(item.unitWeight) : (Number(record.unitWeight) || 1.0);
    const specs = parseProductSpecs(desc, unitWeight);
    const pipeLength = Number(specs.pipeLength) > 0 ? Number(specs.pipeLength) : 6.0;

    const nominalCap = Number(record.nominalCapacityKgH) || Number(machine.capacityKgH) || 200;
    let targetRate = 0;
    if (nominalCap > 0 && unitWeight > 0) {
      targetRate = Math.round(nominalCap / unitWeight);
    } else if (Number(item.productionQty) > 0 && Number(item.operatingHours) > 0) {
      targetRate = Math.round(Number(item.productionQty) / Number(item.operatingHours));
    } else {
      targetRate = 100;
    }

    const cutTime = targetRate > 0 ? 3600 / targetRate : 30;
    const speed = cutTime > 0 ? Math.round(((pipeLength / cutTime) * 60) * 10) / 10 : 10;
    const calculatedRate = Math.round((speed * 60) / pipeLength);

    return {
      machineId: cleanId,
      fullMachineName,
      productDescription: desc,
      itemCode: item.itemCode || '',
      od: specs.od || '',
      wt: specs.wt || '',
      pipeLength,
      speed: Math.max(0.1, speed),
      unitWeight,
      targetRate: calculatedRate,
      calculatedRate,
      previousRunDate: record.date || null
    };
  }

  // Fallback defaults when no previous record exists
  const defaultDesc = 'HDPE 20 MM Code 930';
  const defaultLen = 6.0;
  const defaultSpeed = 10.0;
  const defaultRate = Math.round((defaultSpeed * 60) / defaultLen);

  return {
    machineId: cleanId,
    fullMachineName,
    productDescription: defaultDesc,
    itemCode: '',
    od: '20',
    wt: '',
    pipeLength: defaultLen,
    speed: defaultSpeed,
    unitWeight: 1.0,
    targetRate: defaultRate,
    calculatedRate: defaultRate,
    previousRunDate: null
  };
}

/**
 * Collect distinct available products from historical records and factory presets
 */
export function getAvailableProductsCatalog(records = [], machineMaster = MACHINES) {
  const map = new Map();

  // 1. Factory Standard Presets
  const factoryPresets = [
    { description: 'HDPE 20 MM Code 930', unitWeight: 0.15, pipeLength: 6.0 },
    { description: 'PVC Pipe 110x5.3mm Class 4', unitWeight: 2.65, pipeLength: 6.0 },
    { description: 'PVC Pipe 160x7.7mm Class 4', unitWeight: 5.60, pipeLength: 6.0 },
    { description: 'PVC Pipe 50x2.4mm Class 4', unitWeight: 0.58, pipeLength: 6.0 },
    { description: 'PVC Pipe 75x3.6mm Class 4', unitWeight: 1.25, pipeLength: 6.0 },
    { description: 'PVC Pipe 200x9.6mm Class 4', unitWeight: 8.75, pipeLength: 6.0 },
    { description: 'PVC Pipe 250x11.9mm Class 4', unitWeight: 13.65, pipeLength: 6.0 },
    { description: 'PVC Pipe 315x15.0mm Class 4', unitWeight: 21.60, pipeLength: 6.0 },
    { description: 'HDPE 32 MM PN 16', unitWeight: 0.35, pipeLength: 6.0 },
    { description: 'HDPE 63 MM PN 10', unitWeight: 0.95, pipeLength: 6.0 }
  ];

  for (const preset of factoryPresets) {
    const key = preset.description.toUpperCase();
    map.set(key, { ...preset });
  }

  // 2. Discover products from uploaded historical records
  if (Array.isArray(records)) {
    for (const r of records) {
      if (!r) continue;
      const rows = Array.isArray(r.items) && r.items.length > 0 ? r.items : [r];
      for (const item of rows) {
        const desc = (item.description || '').trim();
        if (!desc) continue;
        const key = desc.toUpperCase();
        if (!map.has(key)) {
          const unitWeight = Number(item.unitWeight) > 0 ? Number(item.unitWeight) : 1.0;
          map.set(key, {
            description: desc,
            itemCode: item.itemCode || '',
            unitWeight,
            pipeLength: 6.0
          });
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.description.localeCompare(b.description));
}

/**
 * Calculate benchmark linear speed (m/min) and hourly production rate (pcs/h) for a product on a machine.
 */
export function calculateBenchmarkSpeedForProduct(product, machineId, machineMaster = MACHINES, pipeLength = 6.0) {
  const machine = matchMachine(machineId, machineMaster) || { capacityKgH: 250 };
  const nominalCap = Number(machine?.capacityKgH) > 0 ? Number(machine.capacityKgH) : 250;
  const len = Number(pipeLength) > 0 ? Number(pipeLength) : 6.0;

  const unitWeight = typeof product === 'object' && Number(product?.unitWeight) > 0
    ? Number(product.unitWeight)
    : 1.0;

  const targetPcsH = nominalCap > 0 && unitWeight > 0 ? Math.round(nominalCap / unitWeight) : 100;
  const cutTime = targetPcsH > 0 ? 3600 / targetPcsH : 30;
  const speed = cutTime > 0 ? Math.round(((len / cutTime) * 60) * 10) / 10 : 10.0;
  const calculatedRate = Math.round((speed * 60) / len);

  return {
    speed: Math.max(0.1, speed),
    pipeLength: len,
    targetRate: calculatedRate,
    calculatedRate
  };
}

/**
 * Build an intelligent morning blank SOP (DOC-Ext.-03) follow sheet model.
 * Pre-populates: Header Line No, Product Description, Speed, Date.
 * Pre-fills: Standard Production (Pcs) across all 24 slots.
 * Clears: Good pieces, causes, downtime, reject kg, and summary cards for on-floor recording.
 */
export function buildMorningSopModel(config = {}) {
  const lineId = (config.lineId || config.lineCode || 'L-01').trim();
  const lineCustom = (config.lineCustom || '').trim();
  const machineMaster = config.machineMaster || MACHINES;
  const fullMachineName = config.fullMachineName || formatFullMachineName(lineId, lineCustom, machineMaster);
  const targetDate = config.date || config.targetDate || '';
  const dates = formatSopDates(targetDate);

  const speed = Number(config.speed) > 0 ? Number(config.speed) : 10;
  const pipeLength = Number(config.pipeLength) > 0 ? Number(config.pipeLength) : 6.0;
  const hourlyStdRate = Math.round((speed * 60) / pipeLength);

  const shift1Rows = SOP_SHIFT1_HOURS.map((hour) => ({
    hour,
    stdPcs: hourlyStdRate,
    stdM: hourlyStdRate,
    goodPcs: '',
    goodM: '',
    cause: '',
    downtime: '',
    rejectKg: ''
  }));

  const shift2Rows = SOP_SHIFT2_HOURS.map((hour) => ({
    hour,
    stdPcs: hourlyStdRate,
    stdM: hourlyStdRate,
    goodPcs: '',
    goodM: '',
    cause: '',
    downtime: '',
    rejectKg: ''
  }));

  return {
    docCode: 'DOC-Ext.-03',
    version: '3',
    creationDate: '18-01-18',
    plantName: config.plantName || 'AL Manar',
    dateDots: dates.dots,
    dateSpaces: dates.spaces,
    lineId: fullMachineName || lineId,
    lineCode: lineId,
    lineCustom,
    fullMachineName,
    productDescription: config.productDescription || '',
    speed1: speed,
    speed2: speed,
    pipeLength,
    hourlyStdRate,
    shift1Rows,
    shift2Rows,
    s1TotalGoodPcs: '',
    s1TotalGoodM: '',
    s1TotalScrapKg: '',
    s2TotalGoodPcs: '',
    s2TotalGoodM: '',
    s2TotalScrapKg: '',
    shift1Lead: config.shift1Lead || '',
    shift2Lead: config.shift2Lead || '',
    isBlank: true,
    isMorningSop: true
  };
}
