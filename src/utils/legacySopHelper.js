import { MACHINES, matchMachine, sanitizeMachineMaster } from '../config/machines.js';
export { MACHINES, matchMachine, sanitizeMachineMaster };
import { parseProductSpecs } from './dailyExcelParser.js';

/**
 * Helper logic for Legacy Plant SOP (DOC-Ext.-03: PRODUCTION PIECES / Production follow)
 */

export const SOP_SHIFT1_HOURS = ['06:30', '07:30', '08:30', '09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30', '17:30'];
export const SOP_SHIFT2_HOURS = ['18:30', '19:30', '20:30', '21:30', '22:30', '23:30', '00:30', '01:30', '02:30', '03:30', '04:30', '05:30'];

/**
 * Cleanly format full machine name (e.g. "L-08 - KTS 550")
 * Resolves model from lineCustom or dynamically matches against machine master catalog,
 * and enforces official canonical line ID by machine model.
 */
export function formatFullMachineName(lineId, lineCustom, machineList = MACHINES) {
  const rawId = (lineId || '').trim();
  let custom = (lineCustom || '').trim();

  // If custom is identical to id, treat custom as empty so catalog name can be matched
  if (rawId && custom.toUpperCase() === rawId.toUpperCase()) {
    custom = '';
  }

  // 1. IMMUTABLE CANONICAL RESOLUTION: Check if custom or rawId specifies a machine model
  const matched = matchMachine(custom || rawId, machineList) || matchMachine(rawId, machineList);
  if (matched && matched.name) {
    // Model strictly dictates canonical Line ID and name
    return `${matched.id} - ${matched.name}`;
  }

  // 2. If no match and no custom, return rawId or fallback
  if (!custom) return rawId || 'WIND1';

  // 3. Sanitize if custom already starts with rawId
  if (rawId && custom.toUpperCase().startsWith(rawId.toUpperCase())) {
    custom = custom.slice(rawId.length).replace(/^[\s-:–—]+/, '').trim();
  }
  // Sanitize if custom ends with rawId
  if (rawId && custom.toUpperCase().endsWith(rawId.toUpperCase())) {
    custom = custom.slice(0, -rawId.length).replace(/[\s-:–—]+$/, '').trim();
  }

  return custom ? (rawId ? `${rawId} - ${custom}` : custom) : rawId;
}

/**
 * Safely resolves the product specification string across diverse field aliases:
 * itemDescription, description, productDescription, productSpec, spec, itemName, ref1Spec, pipeSpec.
 */
export function resolveProductSpecification(target, fallback = '') {
  if (!target) return fallback;
  if (typeof target === 'string') return target.trim();
  const raw =
    target.itemDescription ||
    target.description ||
    target.productDescription ||
    target.productSpec ||
    target.spec ||
    target.itemName ||
    target.ref1Spec ||
    target.pipeSpec ||
    fallback;
  return typeof raw === 'string' ? raw.trim() : String(raw || '').trim();
}

/**
 * Detect whether a machine profile, line configuration, or product is compounding / pelletizing.
 * Targets: Line L-08, KTS 550, or descriptions containing COMPOUND, PELLETIZING, DRY BLEND, PELLETS.
 */
export function isCompoundingLineOrProduct(target, machineMaster = MACHINES) {
  if (!target) return false;

  if (target.isCompounding !== undefined && target.isCompounding !== null) {
    return Boolean(target.isCompounding);
  }

  const productText = [
    target.itemCode,
    target.productCode,
    target.productDescription,
    target.itemDescription,
    target.description,
    target.productSpec,
    target.spec,
    target.itemName,
    target.displayProduct,
    target.ref1Spec,
    target.pipeSpec
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  // 1. If product explicitly specifies compounding or pelletizing
  if (
    productText.includes('COMPOUND') ||
    productText.includes('PELLETIZING') ||
    productText.includes('DRY BLEND') ||
    productText.includes('PELLETS') ||
    productText.includes('PELLET') ||
    target.itemCode === 'COMP-01' ||
    target.itemCode === 'COMP-02' ||
    target.itemCode === 'PEL-01'
  ) {
    return true;
  }

  // 2. If product or config explicitly specifies an extruded pipe product
  if (
    productText.includes('PIPE') ||
    productText.includes('HDPE') ||
    productText.includes('UPVC') ||
    productText.includes('PVC-U') ||
    productText.includes('CORRUGATED') ||
    productText.includes('PCS/H') ||
    productText.includes('PCS') ||
    /\b\d+\s*X\s*[\d.]+/i.test(productText) ||
    /\b\d+\s*MM\b/i.test(productText) ||
    (Number(target.pipeLength) > 0 && Number(target.speed) > 0)
  ) {
    return false;
  }

  // 3. Fall back to machine profile / line type
  if (target.isPelletizingLine || target.isPelletizing) {
    return true;
  }

  const lineId = String(target.lineId || target.lineCode || target.machineId || '').trim().toUpperCase();
  if (lineId === 'L-08' || lineId === 'LINE-8' || lineId === 'LINE 8' || lineId === 'KTS-550' || lineId === 'KTS 550') {
    return true;
  }

  const machineName = String(target.fullMachineName || target.machineName || target.lineCustom || '').trim().toUpperCase();
  if (
    machineName.includes('KTS 550') ||
    machineName.includes('KTS-550') ||
    machineName.includes('PELLETIZING') ||
    machineName.includes('COMPOUND')
  ) {
    return true;
  }

  const matched = matchMachine(lineId || machineName, machineMaster);
  if (
    matched &&
    (matched.isPelletizingLine ||
      matched.lineType === 'Pelletizing Line' ||
      matched.id === 'L-08' ||
      String(matched.name).toUpperCase().includes('KTS 550'))
  ) {
    return true;
  }

  return false;
}

/**
 * Format date string into template formats:
 * - dots: "17.09.2026"
 * - spaces: "17 9 2026"
 */
export function formatSopDates(dateStr) {
  if (!dateStr) {
    return { dots: '17.09.2026', spaces: '17 9 2026', iso: '2026-09-17' };
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
      spaces: `${day} ${month} ${year}`,
      iso: `${year}-${mm}-${dd}`
    };
  }
  return { dots: str, spaces: str, iso: str };
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
  const lineId = report?.header?.lineId;
  const machine = lineId ? matchMachine(lineId) : null;
  const capacityKgH = Number(report?.engineering?.nominalCapacityKgH || machine?.capacityKgH || machine?.nominalCapacity || 0);
  const stdWeight = Number(ref?.stdWeight || ref?.unitWeight || 0);

  // 1. Primary: Explicit target rate (user in-place override or active specification)
  const targetRate = Number(ref?.targetRate);
  if (targetRate > 0) {
    return Math.round(targetRate);
  }

  // 2. Secondary: Extrusion throughput benchmark from Nominal Capacity (Kg/h) / Unit Weight (Kg/pc)
  if (capacityKgH > 0 && stdWeight > 0) {
    return Math.round(capacityKgH / stdWeight);
  }

  // 3. Fallback only: Linear speed and cut length when unit weight is absent
  const explicitSpeed = Number(ref?.speed);
  const pipeLen = Number(ref?.pipeLength) > 0 ? Number(ref?.pipeLength) : 6.0;
  if (explicitSpeed > 0 && pipeLen > 0) {
    return Math.round((explicitSpeed * 60) / pipeLen);
  }

  return 0;
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
  const machineMaster = options?.machineMaster || MACHINES;
  const isBlank = Boolean(options.isBlank || report?.isBlank);
  const isCumulative = options.cumulative !== undefined
    ? Boolean(options.cumulative)
    : (options.isCumulative !== undefined ? Boolean(options.isCumulative) : true);
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

  const dates = isBlank ? { dots: '', spaces: '', iso: '' } : formatSopDates(header.date);

  const speed1 = Number(ref1.speed) > 0 ? Number(ref1.speed) : '';
  const speed2 = Number(ref2.speed) > 0 ? Number(ref2.speed) : (isBlank ? '' : speed1);
  const pipeLen1 = Number(ref1.pipeLength) > 0 ? Number(ref1.pipeLength) : 6.0;
  const unitWeight1 = Number(ref1.stdWeight) > 0 ? Number(ref1.stdWeight) : '';
  const pipeLen2 = Number(ref2.pipeLength) > 0 ? Number(ref2.pipeLength) : pipeLen1;
  const unitWeight2 = Number(ref2.stdWeight) > 0 ? Number(ref2.stdWeight) : unitWeight1;

  // Standard production sequence in pieces: progressive cumulative values across all 24 slots
  const hourlyRate1 = explicitStdRate !== null
    ? explicitStdRate
    : computeStandardHourlyPieces(report, ref1);
  const hourlyRate2 = explicitStdRate !== null
    ? explicitStdRate
    : ((ref2 && (ref2.speed || ref2.targetRate)) ? computeStandardHourlyPieces(report, ref2) : hourlyRate1);

  const stdShift1 = [];
  const stdShift2 = [];
  for (let i = 1; i <= 12; i += 1) {
    const val = hourlyRate1 > 0 ? (isCumulative ? i * hourlyRate1 : hourlyRate1) : '';
    stdShift1.push(val);
  }
  for (let i = 13; i <= 24; i += 1) {
    const rate1 = hourlyRate1 > 0 ? hourlyRate1 : 0;
    const rate2 = hourlyRate2 > 0 ? hourlyRate2 : rate1;
    const val = (rate1 > 0 || rate2 > 0)
      ? (isCumulative ? (12 * rate1 + (i - 12) * rate2) : rate2)
      : '';
    stdShift2.push(val);
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

  const itemCode1 = ref1.itemCode || '';
  const itemCode2 = ref2.itemCode || '';
  const combinedItemCodes = [itemCode1, itemCode2].filter(Boolean).join(' / ');

  let productDescription = isBlank ? '' : (ref1.pipeSpec || '');
  if (!isBlank && ref2.pipeSpec && ref2.pipeSpec !== ref1.pipeSpec) {
    productDescription = ref1.pipeSpec ? `${ref1.pipeSpec} / ${ref2.pipeSpec}` : (ref2.pipeSpec || '');
  }

  const displayProduct = combinedItemCodes
    ? (productDescription ? `[${combinedItemCodes}] — ${productDescription}` : `[${combinedItemCodes}]`)
    : productDescription;

  const s1TotalGoodPcs = isBlank ? '' : (Number.isInteger(s1GoodPcsTotal) ? s1GoodPcsTotal : Math.round(s1GoodPcsTotal * 10) / 10);
  const s1TotalScrapKg = isBlank ? '' : s1ScrapKgTotal;
  const s2TotalGoodPcs = isBlank ? '' : (Number.isInteger(s2GoodPcsTotal) ? s2GoodPcsTotal : Math.round(s2GoodPcsTotal * 10) / 10);
  const s2TotalScrapKg = isBlank ? '' : s2ScrapKgTotal;

  const unitWeight = Number(unitWeight1) > 0 ? Number(unitWeight1) : (Number(unitWeight2) > 0 ? Number(unitWeight2) : '');
  const pipeLength = Number(pipeLen1) > 0 ? Number(pipeLen1) : (Number(pipeLen2) > 0 ? Number(pipeLen2) : 6.0);
  const speed = speed1 || speed2 || '';
  const nominalCapacityKgH = isBlank
    ? ''
    : (Number(derived?.engineering?.nominalCapacityKgH) ||
       Number(report?.engineering?.nominalCapacityKgH) ||
       Number(matchMachine(header.lineId, machineMaster)?.capacityKgH) ||
       '');

  let s1DowntimeTotal = 0;
  for (let i = 0; i < 12; i += 1) {
    const slot = slots[i] || {};
    const dt = Number(slot.downtime) > 0 ? Number(slot.downtime) : 0;
    s1DowntimeTotal += dt;
  }

  let s2DowntimeTotal = 0;
  for (let i = 0; i < 12; i += 1) {
    const slot = slots[i + 12] || {};
    const dt = Number(slot.downtime) > 0 ? Number(slot.downtime) : 0;
    s2DowntimeTotal += dt;
  }

  const s1TotalWeightKg = (!isBlank && s1GoodPcsTotal > 0 && unitWeight > 0)
    ? Math.round(s1GoodPcsTotal * unitWeight)
    : '';
  const s2TotalWeightKg = (!isBlank && s2GoodPcsTotal > 0 && unitWeight > 0)
    ? Math.round(s2GoodPcsTotal * unitWeight)
    : '';

  const s1ScrapPct = (!isBlank && s1ScrapKgTotal > 0 && s1TotalWeightKg > 0)
    ? ((s1ScrapKgTotal / (s1TotalWeightKg + s1ScrapKgTotal)) * 100).toFixed(1) + '%'
    : (!isBlank && s1ScrapKgTotal > 0 ? '100%' : (!isBlank && s1GoodPcsTotal > 0 ? '0.0%' : ''));

  const s2ScrapPct = (!isBlank && s2ScrapKgTotal > 0 && s2TotalWeightKg > 0)
    ? ((s2ScrapKgTotal / (s2TotalWeightKg + s2ScrapKgTotal)) * 100).toFixed(1) + '%'
    : (!isBlank && s2ScrapKgTotal > 0 ? '100%' : (!isBlank && s2GoodPcsTotal > 0 ? '0.0%' : ''));

  const s1TargetTotal = hourlyRate1 > 0 ? hourlyRate1 * 12 : 0;
  const s2TargetTotal = hourlyRate2 > 0 ? hourlyRate2 * 12 : s1TargetTotal;

  const s1Efficiency = (!isBlank && s1GoodPcsTotal > 0 && s1TargetTotal > 0)
    ? Math.min(100, Math.round((s1GoodPcsTotal / s1TargetTotal) * 100)) + '%'
    : (!isBlank && (720 - s1DowntimeTotal) > 0 && s1GoodPcsTotal > 0 ? Math.round(((720 - s1DowntimeTotal) / 720) * 100) + '%' : '');

  const s2Efficiency = (!isBlank && s2GoodPcsTotal > 0 && s2TargetTotal > 0)
    ? Math.min(100, Math.round((s2GoodPcsTotal / s2TargetTotal) * 100)) + '%'
    : (!isBlank && (720 - s2DowntimeTotal) > 0 && s2GoodPcsTotal > 0 ? Math.round(((720 - s2DowntimeTotal) / 720) * 100) + '%' : '');

  const isCompounding = isCompoundingLineOrProduct({
    lineId: header.lineId,
    fullMachineName,
    lineCustom: header.lineCustom,
    productDescription,
    itemCode: combinedItemCodes
  }, machineMaster);

  return {
    docCode: 'DOC-Ext.-03',
    version: '04',
    creationDate: '18-01-18',
    plantName: options?.plantName || 'AL MANAR PIPES FACTORY',
    reportTitle: isCompounding ? 'PVC COMPOUND / PELLETIZING DAILY MONITORING REPORT' : 'PVC PIPE EXTRUSION DAILY MONITORING REPORT',
    reportSubtitle: isCompounding ? 'Compounding Execution & Quality Follow-Up' : 'Production Execution & Quality Follow-Up',
    dateIso: dates.iso || '',
    targetDate: dates.iso || '',
    dateDots: dates.dots,
    dateSpaces: dates.spaces,
    lineId: isBlank ? '' : fullMachineName,
    lineCode: isBlank ? '' : (header.lineId || 'WIND1'),
    lineCustom: isBlank ? '' : (header.lineCustom || ''),
    fullMachineName,
    itemCode: combinedItemCodes,
    productDescription,
    itemDescription: productDescription,
    description: productDescription,
    productSpec: productDescription,
    spec: productDescription,
    itemName: productDescription,
    displayProduct,
    ref1Spec: ref1.pipeSpec || '',
    ref2Spec: ref2.pipeSpec || '',
    speed1: isBlank ? '' : speed1,
    speed2: isBlank ? '' : speed2,
    speed: isBlank ? '' : speed,
    pipeLength,
    unitWeight,
    nominalCapacityKgH,
    nominalCapacity: nominalCapacityKgH,
    targetCapacity: isCompounding ? (Number(derived?.engineering?.nominalCapacityKgH) || 400) : nominalCapacityKgH,
    bagPackaging: '25 Kg / Bag',
    isCompounding,
    isPelletizingLine: isCompounding,
    shift1Rows,
    shift2Rows,
    s1TotalGoodPcs,
    s1TotalGoodM: s1TotalGoodPcs,
    s1TotalWeightKg,
    s1TotalScrapKg,
    s1ScrapPct,
    s1DowntimeMin: isBlank ? '' : s1DowntimeTotal,
    s1Efficiency,
    s2TotalGoodPcs,
    s2TotalGoodM: s2TotalGoodPcs,
    s2TotalWeightKg,
    s2TotalScrapKg,
    s2ScrapPct,
    s2DowntimeMin: isBlank ? '' : s2DowntimeTotal,
    s2Efficiency,
    shift1Lead: isBlank ? '' : (summary.shift1Lead || ''),
    shift2Lead: isBlank ? '' : (summary.shift2Lead || ''),
    isBlank,
    isCumulative
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
 * Calculate previous calendar date string (YYYY-MM-DD) from a given date string.
 * Uses UTC date calculations to avoid timezone shifts across midnight boundaries.
 */
export function getPreviousDay(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const formatted = formatSopDates(dateStr);
  const iso = formatted.iso;
  if (!iso || typeof iso !== 'string') return '';
  const match = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // 0-based month
  const day = parseInt(match[3], 10);
  const d = new Date(Date.UTC(year, month, day - 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

/**
 * Find operational production run for a specific machine strictly on exactDate (YYYY-MM-DD).
 * Returns null if the machine was idle, stopped, or had zero production logs on that exact date.
 */
export function findExactDayRunForMachine(records, lineId, exactDate) {
  if (!Array.isArray(records) || records.length === 0 || !lineId || !exactDate) {
    return null;
  }
  const cleanId = String(lineId).trim().toUpperCase();
  const targetFormatted = formatSopDates(exactDate);
  const targetIso = targetFormatted.iso || String(exactDate).trim();

  // 1. Filter records matching this machine and date
  const dayRecords = records.filter((r) => {
    if (!r || !r.date) return false;
    const rIso = formatSopDates(r.date).iso || String(r.date).trim();
    if (rIso !== targetIso) return false;
    const rId = (r.machineId || r.matchedMachine?.id || r.machineRaw || '').trim().toUpperCase();
    return rId === cleanId;
  });

  if (dayRecords.length === 0) {
    return null;
  }

  // 2. Filter for operational records (strictly active production)
  const opRecords = dayRecords.filter((r) => {
    const opHours = Number(r.operatingHours) || 0;
    const qty = Number(r.productionQty) || 0;
    const rate = Number(r.actualRateKgH) || 0;
    const weight = Number(r.productionWeightKg) || Number(r.totalWeightKg) || 0;
    return opHours > 0 || qty > 0 || rate > 0 || weight > 0;
  });

  if (opRecords.length === 0) {
    return null;
  }

  // If multiple operational records on the same day, prefer the one with highest production quantity
  opRecords.sort((a, b) => (Number(b.productionQty) || 0) - (Number(a.productionQty) || 0));

  return opRecords[0];
}

/**
 * Extract embedded item code from product description string if available.
 * E.g., 'HDPE 20 MM Code 930' -> '930'
 */
export function extractEmbeddedItemCode(description) {
  if (!description || typeof description !== 'string') return '';
  const match = description.match(/(?:code\s*[:#-]?\s*|\bitem\s*[:#-]?\s*)([A-Za-z0-9_-]+)/i);
  return match ? match[1].trim() : '';
}

/**
 * Extract operational pipe specs, speed, and cut length from a run record or fall back to machine master defaults.
 */
export function extractMachineSpecsFromRun(record, lineId, machineMaster = MACHINES) {
  const master = sanitizeMachineMaster(machineMaster);
  const cleanId = String(lineId || '').trim();
  const machineHint = record?.machineRaw || record?.machineName || record?.machine || cleanId;
  const machine = matchMachine(machineHint, master) || matchMachine(cleanId, master) || { id: cleanId, name: cleanId, capacityKgH: 250 };
  const finalLineId = machine.id || cleanId;
  const fullMachineName = formatFullMachineName(finalLineId, machine.name, master);
  const isLineCompounding = isCompoundingLineOrProduct({ lineId: finalLineId, fullMachineName }, master);
  const nominalCap = Number(record?.nominalCapacityKgH) || Number(machine?.nominalCapacity) || Number(machine?.capacityKgH) || (isLineCompounding ? 400 : 200);

  if (record) {
    const item = (Array.isArray(record.items) && record.items.length > 0) ? record.items[0] : record;
    const defaultDesc = isLineCompounding ? 'PVC COMPOUND DRY BLEND GREY (25KG)' : 'HDPE 20 MM Code 930';
    const desc = resolveProductSpecification(item, resolveProductSpecification(record, defaultDesc));
    const rawCode = (item.itemCode || record.itemCode || '').trim();
    const itemCode = rawCode || extractEmbeddedItemCode(desc) || (isLineCompounding ? 'COMP-01' : '');
    const isCompounding = isCompoundingLineOrProduct({
      lineId: finalLineId,
      fullMachineName,
      productDescription: desc,
      itemCode
    }, master);

    const unitWeight = Number(item.unitWeight) > 0 ? Number(item.unitWeight) : (Number(record.unitWeight) || (isCompounding ? 25.0 : 1.0));
    const specs = parseProductSpecs(desc, unitWeight);
    const pipeLength = isCompounding ? 0 : (Number(specs.pipeLength) > 0 ? Number(specs.pipeLength) : 6.0);

    if (isCompounding) {
      const targetRate = nominalCap > 0 ? nominalCap : 400;
      return {
        machineId: finalLineId,
        fullMachineName,
        productDescription: desc,
        itemDescription: desc,
        description: desc,
        productSpec: desc,
        spec: desc,
        itemName: desc,
        itemCode,
        od: '',
        wt: '',
        pipeLength: 0,
        speed: '',
        unitWeight: 25.0,
        nominalCapacity: nominalCap,
        targetRate,
        calculatedRate: targetRate,
        calculatedRateKgH: targetRate,
        isCompounding: true,
        previousRunDate: record.date || null
      };
    }

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
    const calculatedRateKgH = Math.round(calculatedRate * unitWeight);

    return {
      machineId: finalLineId,
      fullMachineName,
      productDescription: desc,
      itemDescription: desc,
      description: desc,
      productSpec: desc,
      spec: desc,
      itemName: desc,
      itemCode,
      od: specs.od || '',
      wt: specs.wt || '',
      pipeLength,
      speed: Math.max(0.1, speed),
      unitWeight,
      nominalCapacity: nominalCap,
      targetRate: calculatedRate,
      calculatedRate,
      calculatedRateKgH,
      isCompounding: false,
      previousRunDate: record.date || null
    };
  }

  // Idle / unassigned machine line with no active or inherited production run
  if (isLineCompounding) {
    const targetRate = nominalCap > 0 ? nominalCap : 400;
    return {
      machineId: finalLineId,
      fullMachineName,
      productDescription: 'PVC COMPOUND DRY BLEND GREY (25KG)',
      itemDescription: 'PVC COMPOUND DRY BLEND GREY (25KG)',
      description: 'PVC COMPOUND DRY BLEND GREY (25KG)',
      productSpec: 'PVC COMPOUND DRY BLEND GREY (25KG)',
      spec: 'PVC COMPOUND DRY BLEND GREY (25KG)',
      itemName: 'PVC COMPOUND DRY BLEND GREY (25KG)',
      itemCode: 'COMP-01',
      od: '',
      wt: '',
      pipeLength: 0,
      speed: '',
      unitWeight: 25.0,
      nominalCapacity: nominalCap,
      targetRate,
      calculatedRate: targetRate,
      calculatedRateKgH: targetRate,
      isCompounding: true,
      previousRunDate: null,
      isIdle: false
    };
  }

  return {
    machineId: finalLineId,
    fullMachineName,
    productDescription: '',
    itemDescription: '',
    description: '',
    productSpec: '',
    spec: '',
    itemName: '',
    itemCode: '',
    od: '',
    wt: '',
    pipeLength: 6.0,
    speed: '',
    unitWeight: '',
    nominalCapacity: nominalCap,
    targetRate: '',
    calculatedRate: '',
    calculatedRateKgH: '',
    isCompounding: false,
    previousRunDate: null,
    isIdle: true
  };
}

/**
 * Collect distinct available products from historical records and factory presets.
 * Returns catalog items containing: { itemCode, description, unitWeight, pipeLength, label }.
 */
export function getAvailableProductsCatalog(records = [], machineMaster = MACHINES) {
  const map = new Map();

  // 1. Factory Standard Presets with official item codes
  const factoryPresets = [
    { itemCode: 'COMP-01', description: 'PVC COMPOUND DRY BLEND GREY (25KG)', unitWeight: 25.0, pipeLength: 0, isCompounding: true },
    { itemCode: 'COMP-02', description: 'PVC COMPOUND RIGID WHITE (25KG)', unitWeight: 25.0, pipeLength: 0, isCompounding: true },
    { itemCode: 'PEL-01', description: 'PVC PELLETIZING COMPOUND BLACK (25KG)', unitWeight: 25.0, pipeLength: 0, isCompounding: true },
    { itemCode: '930', description: 'HDPE 20 MM Code 930', unitWeight: 0.15, pipeLength: 6.0 },
    { itemCode: '249', description: 'uPVC PIPE 110x5.3 PN-12.5 SASO-ISO 1452-2', unitWeight: 2.65, pipeLength: 6.0 },
    { itemCode: '247 R', description: 'uPVC PIPE 160MM SASO-ISO 1452-2 PN12.5 7.7MM R/R', unitWeight: 5.60, pipeLength: 6.0 },
    { itemCode: '255', description: 'uPVC PIPE 50x2.4 PN-10 SASO-ISO 1452-2', unitWeight: 0.58, pipeLength: 6.0 },
    { itemCode: '253', description: 'uPVC PIPE 75MM PN10X3.6MM SASO-ISO-1452-2', unitWeight: 1.25, pipeLength: 6.0 },
    { itemCode: '246', description: 'MANARCO PVC-U PIPE 200X9.6mm PN-12.5 SASO-ISO-1452-2 W/P', unitWeight: 8.75, pipeLength: 6.0 },
    { itemCode: '258', description: 'PVC PIPE 25MM SASO-ISO 1452-2 PN12.5 1.5MM', unitWeight: 0.25, pipeLength: 6.0 },
    { itemCode: '257', description: 'PVC PIPE 32MM SASO-ISO 1452-2 PN10 1.6MM', unitWeight: 0.35, pipeLength: 6.0 },
    { itemCode: '991', description: 'PVC 4" PIPE SDR 26 ASTMD 2241', unitWeight: 2.10, pipeLength: 6.0 },
    { itemCode: '198', description: 'PVC PIPE 3/4"SCH40', unitWeight: 0.35, pipeLength: 6.0 },
    { itemCode: '1291', description: 'MANARCO PVC PIPE 3" SCH 40 ASTMD 1785', unitWeight: 1.85, pipeLength: 6.0 },
    { itemCode: '195', description: 'uPVC PIPE 75MM 2.2MM GRAY PN-6 EN 1452', unitWeight: 0.95, pipeLength: 6.0 },
    { itemCode: '197', description: 'PVC 1" PIPE SCH40 ASTMD 2241', unitWeight: 0.50, pipeLength: 6.0 },
    { itemCode: '230', description: 'PVC PIPE 160MM EN1452 PN7.5 4.7MM GRAY R/R', unitWeight: 3.80, pipeLength: 6.0 },
    { itemCode: '500', description: 'BLACK MANARCO ELECTRICAL UPVC PIPE CONDUIT 20X1.6mm', unitWeight: 0.55, pipeLength: 6.0 },
    { itemCode: '549', description: 'MANARCO ELECTRICAL UPVC PIPE CONDUIT 25X1.9mm', unitWeight: 0.65, pipeLength: 6.0 }
  ];

  for (const preset of factoryPresets) {
    const key = preset.description.toUpperCase();
    map.set(key, {
      ...preset,
      label: preset.itemCode ? `[${preset.itemCode}] ${preset.description}` : preset.description
    });
  }

  // 2. Discover products from uploaded historical records
  if (Array.isArray(records)) {
    for (const r of records) {
      if (!r) continue;
      const rows = Array.isArray(r.items) && r.items.length > 0 ? r.items : [r];
      for (const item of rows) {
        const desc = (item.description || '').trim();
        if (!desc) continue;
        const rawCode = item.itemCode ? String(item.itemCode).trim() : '';
        const itemCode = rawCode || extractEmbeddedItemCode(desc) || '';
        const key = desc.toUpperCase();

        if (!map.has(key)) {
          const unitWeight = Number(item.unitWeight) > 0 ? Number(item.unitWeight) : 1.0;
          map.set(key, {
            itemCode,
            description: desc,
            unitWeight,
            pipeLength: 6.0,
            label: itemCode ? `[${itemCode}] ${desc}` : desc
          });
        } else if (itemCode && !map.get(key).itemCode) {
          // Augment existing preset with discovered code if missing
          const existing = map.get(key);
          existing.itemCode = itemCode;
          existing.label = `[${itemCode}] ${existing.description}`;
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    // Sort by item code if available, else by description
    if (a.itemCode && b.itemCode) {
      return a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true });
    }
    return a.description.localeCompare(b.description);
  });
}

/**
 * Calculate benchmark linear speed (m/min) and hourly production rate (pcs/h) for a product on a machine.
 */
export function calculateBenchmarkSpeedForProduct(product, machineId, machineMaster = MACHINES, pipeLength = 6.0) {
  const machine = matchMachine(machineId, machineMaster) || { capacityKgH: 250 };
  const nominalCap = Number(machine?.capacityKgH) > 0 ? Number(machine.capacityKgH) : 250;
  const len = Number(pipeLength) > 0 ? Number(pipeLength) : 6.0;

  let unitWeight = 1.0;
  if (typeof product === 'object' && product !== null) {
    if (Number(product.unitWeight) > 0) {
      unitWeight = Number(product.unitWeight);
    }
  }

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
 * Pre-populates: Header Line No, Item Code & Product Description, Speed, Date.
 * Pre-fills: Standard Production (Pcs) across all 24 slots.
 * Clears: Good pieces, causes, downtime, reject kg, and summary cards for on-floor recording.
 */
export function buildMorningSopModel(config = {}) {
  const rawLineId = (config.lineId || config.lineCode || '').trim();
  const rawLineCustom = (config.lineCustom || config.fullMachineName || '').trim();
  const machineMaster = config.machineMaster ? sanitizeMachineMaster(config.machineMaster) : MACHINES;

  const desc = resolveProductSpecification(config);
  const rawItemCode = (config.itemCode || config.productCode || '').trim();
  const itemCode = rawItemCode || extractEmbeddedItemCode(desc) || '';

  const isExplicitCompounding = Boolean(
    config.isCompounding ||
    (config.productSpec && /COMPOUND|PELLET/i.test(config.productSpec)) ||
    (config.productDescription && /COMPOUND|PELLET/i.test(config.productDescription)) ||
    (desc && /COMPOUND|PELLET/i.test(desc)) ||
    itemCode === 'COMP-01' ||
    itemCode === 'COMP-02' ||
    itemCode === 'PEL-01'
  );

  const machineHint = rawLineCustom || (isExplicitCompounding ? 'KTS 550' : rawLineId);
  const matchedMachine = matchMachine(machineHint, machineMaster) || matchMachine(rawLineId, machineMaster) || (isExplicitCompounding ? MACHINES.find(m => m.id === 'L-08') : MACHINES.find(m => m.id === 'L-01'));

  const lineId = matchedMachine ? matchedMachine.id : (rawLineId || (isExplicitCompounding ? 'L-08' : 'L-01'));
  const lineCustom = matchedMachine ? matchedMachine.name : rawLineCustom;
  const fullMachineName = formatFullMachineName(lineId, lineCustom, machineMaster);
  const targetDate = config.date || config.targetDate || '';
  const dates = formatSopDates(targetDate);

  const displayProduct = itemCode
    ? (desc ? (desc.toUpperCase().includes(itemCode.toUpperCase()) ? desc : `[${itemCode}] - ${desc}`) : `[${itemCode}]`)
    : desc;

  const isCompounding = isExplicitCompounding || isCompoundingLineOrProduct({
    ...config,
    lineId,
    fullMachineName,
    itemCode,
    productDescription: desc
  }, machineMaster);

  const rawSpeed = config.speed !== undefined && config.speed !== null && config.speed !== ''
    ? Number(config.speed)
    : NaN;
  const speed = !isNaN(rawSpeed) && rawSpeed > 0 ? rawSpeed : '';
  const pipeLength = isCompounding ? 0 : (Number(config.pipeLength) > 0 ? Number(config.pipeLength) : 6.0);
  const rawUnitWeight = config.unitWeight !== undefined && config.unitWeight !== null && config.unitWeight !== ''
    ? Number(config.unitWeight)
    : NaN;
  const unitWeight = !isNaN(rawUnitWeight) && rawUnitWeight > 0 ? rawUnitWeight : (isCompounding ? 25.0 : '');

  const isIdle = Boolean(
    config.isIdle ||
    (isCompounding
      ? (!desc && !itemCode && !config.targetRate && !config.targetCapacity)
      : (!speed && !desc && !itemCode))
  );

  const nominalCapacity = Number(config.nominalCapacity) || Number(config.capacityKgH) || (isCompounding ? 400 : 200);

  let hourlyStdRate = '';
  if (config.targetRate !== undefined && config.targetRate !== null && config.targetRate !== '' && Number(config.targetRate) > 0) {
    hourlyStdRate = Number(config.targetRate);
  } else if (isCompounding) {
    hourlyStdRate = Number(config.targetCapacity) || nominalCapacity || 400;
  } else if (speed && pipeLength) {
    hourlyStdRate = Math.round((speed * 60) / pipeLength);
  } else if (nominalCapacity > 0 && Number(unitWeight) > 0) {
    hourlyStdRate = Math.round(nominalCapacity / Number(unitWeight));
  } else if (config.targetCapacity) {
    hourlyStdRate = Number(config.targetCapacity);
  }

  const calculatedRateKgH = isCompounding
    ? hourlyStdRate
    : (config.calculatedRateKgH !== undefined && config.calculatedRateKgH !== null && config.calculatedRateKgH !== ''
        ? Number(config.calculatedRateKgH)
        : ((hourlyStdRate && unitWeight) ? Math.round(hourlyStdRate * unitWeight) : ''));

  const utilizationPct = (calculatedRateKgH && nominalCapacity > 0)
    ? Math.round((calculatedRateKgH / nominalCapacity) * 100)
    : 0;

  const isCumulative = config.cumulative !== undefined
    ? Boolean(config.cumulative)
    : (config.isCumulative !== undefined ? Boolean(config.isCumulative) : true);

  const shift1Rows = SOP_SHIFT1_HOURS.map((hour, idx) => {
    const slotNum = idx + 1; // 1 to 12
    const target = (!isIdle && hourlyStdRate > 0)
      ? (isCumulative ? hourlyStdRate * slotNum : hourlyStdRate)
      : '';
    return {
      hour,
      stdPcs: target,
      stdM: target,
      goodPcs: '',
      goodM: '',
      cause: '',
      downtime: '',
      rejectKg: ''
    };
  });

  const shift2Rows = SOP_SHIFT2_HOURS.map((hour, idx) => {
    const slotNum = idx + 13; // 13 to 24
    const target = (!isIdle && hourlyStdRate > 0)
      ? (isCumulative ? hourlyStdRate * slotNum : hourlyStdRate)
      : '';
    return {
      hour,
      stdPcs: target,
      stdM: target,
      goodPcs: '',
      goodM: '',
      cause: '',
      downtime: '',
      rejectKg: ''
    };
  });

  return {
    docCode: 'DOC-Ext.-03',
    version: '04',
    creationDate: '18-01-18',
    plantName: config.plantName || 'AL MANAR PIPES FACTORY',
    reportTitle: isCompounding ? 'PVC COMPOUND / PELLETIZING DAILY MONITORING REPORT' : 'PVC PIPE EXTRUSION DAILY MONITORING REPORT',
    reportSubtitle: isCompounding ? 'Compounding Execution & Quality Follow-Up' : 'Production Execution & Quality Follow-Up',
    dateIso: dates.iso || '',
    targetDate: dates.iso || '',
    dateDots: dates.dots,
    dateSpaces: dates.spaces,
    lineId: fullMachineName || lineId,
    lineCode: lineId,
    lineCustom,
    fullMachineName: fullMachineName || lineId,
    itemCode,
    productDescription: desc,
    itemDescription: desc,
    description: desc,
    productSpec: desc,
    spec: desc,
    itemName: desc,
    displayProduct,
    ref1Spec: desc,
    ref2Spec: '',
    speed1: speed,
    speed2: speed,
    speed: speed,
    pipeLength,
    unitWeight,
    nominalCapacityKgH: nominalCapacity,
    nominalCapacity,
    targetCapacity: isCompounding ? hourlyStdRate : nominalCapacity,
    bagPackaging: config.bagPackaging || '25 Kg / Bag',
    hourlyStdRate,
    calculatedRateKgH,
    utilizationPct,
    isCumulative,
    isIdle,
    isCompounding,
    isPelletizingLine: isCompounding,
    shift1Rows,
    shift2Rows,
    s1TotalGoodPcs: '',
    s1TotalGoodM: '',
    s1TotalWeightKg: '',
    s1TotalScrapKg: '',
    s1ScrapPct: '',
    s1DowntimeMin: '',
    s1Efficiency: '',
    s2TotalGoodPcs: '',
    s2TotalGoodM: '',
    s2TotalWeightKg: '',
    s2TotalScrapKg: '',
    s2ScrapPct: '',
    s2DowntimeMin: '',
    s2Efficiency: '',
    shift1Lead: config.shift1Lead || '',
    shift2Lead: config.shift2Lead || '',
    isBlank: true,
    isMorningSop: true
  };
}

/**
 * Build a universal clean blank SOP (DOC-Ext.-03) follow sheet model.
 * Generates exactly 1 clean page with all operational values left blank/empty
 * with writing lines for manual pen entry by supervisors.
 */
export function buildUniversalBlankSopModel(config = {}) {
  const shift1Rows = SOP_SHIFT1_HOURS.map((hour) => ({
    hour,
    stdPcs: '',
    stdM: '',
    goodPcs: '',
    goodM: '',
    cause: '',
    downtime: '',
    rejectKg: ''
  }));

  const shift2Rows = SOP_SHIFT2_HOURS.map((hour) => ({
    hour,
    stdPcs: '',
    stdM: '',
    goodPcs: '',
    goodM: '',
    cause: '',
    downtime: '',
    rejectKg: ''
  }));

  return {
    docCode: 'DOC-Ext.-03',
    version: '04',
    creationDate: '18-01-18',
    plantName: config.plantName || 'AL MANAR PIPES FACTORY',
    reportTitle: 'PVC PIPE EXTRUSION DAILY MONITORING REPORT',
    reportSubtitle: 'Production Execution & Quality Follow-Up',
    dateIso: '',
    targetDate: '',
    dateDots: '',
    dateSpaces: '',
    lineId: '',
    lineCode: 'BLANK',
    fullMachineName: '',
    itemCode: '',
    productDescription: '',
    displayProduct: '',
    ref1Spec: '',
    ref2Spec: '',
    speed1: '',
    speed2: '',
    speed: '',
    pipeLength: 6.0,
    unitWeight: '',
    hourlyStdRate: '',
    shift1Rows,
    shift2Rows,
    s1TotalGoodPcs: '',
    s1TotalGoodM: '',
    s1TotalWeightKg: '',
    s1TotalScrapKg: '',
    s1ScrapPct: '',
    s1DowntimeMin: '',
    s1Efficiency: '',
    s2TotalGoodPcs: '',
    s2TotalGoodM: '',
    s2TotalWeightKg: '',
    s2TotalScrapKg: '',
    s2ScrapPct: '',
    s2DowntimeMin: '',
    s2Efficiency: '',
    shift1Lead: '',
    shift2Lead: '',
    isBlank: true,
    isMorningSop: false,
    isUniversalBlank: true
  };
}
