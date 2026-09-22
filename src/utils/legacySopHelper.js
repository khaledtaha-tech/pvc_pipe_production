import { MACHINES, matchMachine } from '../config/machines.js';

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
 * Calculate standard production meters array.
 * By default (cumulative = false), returns non-cumulative constant hourly rate per row (e.g. 20, 20, 20... or 600, 600...)
 * If cumulative = true, returns cumulative sum (e.g. 600, 1200, 1800...)
 */
export function calculateStandardProduction(speedMPerMin, count = 12, cumulative = false) {
  const speed = Number(speedMPerMin);
  const hourlyRate = speed > 0 ? Math.round(speed * 60) : 0;
  const out = [];
  for (let i = 1; i <= count; i += 1) {
    out.push(cumulative ? i * hourlyRate : hourlyRate);
  }
  return out;
}

/**
 * Backward compatibility alias for cumulative standard production
 */
export function calculateStandardCumulative(speedMPerMin, count = 12) {
  return calculateStandardProduction(speedMPerMin, count, true);
}

/**
 * Calculate non-cumulative standard hourly rate sequence (e.g. 20, 20, 20...)
 */
export function calculateStandardHourly(speedMPerMin, count = 12) {
  return calculateStandardProduction(speedMPerMin, count, false);
}

/**
 * Compute calculated hourly standard production rate in meters based on specs and machine capacity
 */
export function computeStandardHourlyMeters(report, ref) {
  const explicitSpeed = Number(ref?.speed);
  if (explicitSpeed > 0) {
    return Math.round(explicitSpeed * 60);
  }
  const targetRate = Number(ref?.targetRate);
  const pipeLen = Number(ref?.pipeLength) > 0 ? Number(ref?.pipeLength) : 6.0;
  if (targetRate > 0) {
    return Math.round(targetRate * pipeLen);
  }
  const lineId = report?.header?.lineId;
  const machine = lineId ? matchMachine(lineId) : null;
  const stdWeight = Number(ref?.stdWeight);
  if (machine && machine.capacityKgH > 0 && stdWeight > 0) {
    const weightPerMeter = stdWeight / pipeLen;
    if (weightPerMeter > 0) {
      return Math.round(machine.capacityKgH / weightPerMeter);
    }
  }
  return 600;
}

/**
 * Build consolidated SOP data model from active report & derived calculations.
 * Supports isBlank option for physical on-floor recording blank sheets,
 * and non-cumulative constant hourly rate standard production.
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

  // Standard production sequence: pre-fill constant hourly rate across all 24 rows
  const hourlyRate1 = explicitStdRate !== null
    ? explicitStdRate
    : computeStandardHourlyMeters(report, ref1);
  const hourlyRate2 = explicitStdRate !== null
    ? explicitStdRate
    : ((ref2 && (ref2.speed || ref2.targetRate)) ? computeStandardHourlyMeters(report, ref2) : hourlyRate1);

  const stdShift1 = [];
  const stdShift2 = [];
  for (let i = 1; i <= 12; i += 1) {
    stdShift1.push(isCumulative ? i * hourlyRate1 : hourlyRate1);
    stdShift2.push(isCumulative ? i * hourlyRate2 : hourlyRate2);
  }

  const shift1Rows = [];
  let s1GoodMTotal = 0;
  let s1ScrapKgTotal = 0;

  for (let i = 0; i < 12; i += 1) {
    const slot = slots[i] || {};
    const hour = SOP_SHIFT1_HOURS[i];
    const stdM = stdShift1[i];

    if (isBlank) {
      shift1Rows.push({
        hour,
        stdM,
        goodM: '',
        cause: '',
        downtime: '',
        rejectKg: ''
      });
      continue;
    }

    const isFullStop = slot.downtime >= 60;
    const actualPcs = Number(slot.actual) || 0;
    const pipeLen = slot.ref === '2' ? pipeLen2 : pipeLen1;
    const unitWeight = slot.ref === '2' ? unitWeight2 : unitWeight1;
    const goodM = isFullStop ? 0 : Math.round(actualPcs * pipeLen);
    const downtime = Number(slot.downtime) > 0 ? Number(slot.downtime) : 0;
    const cause = (slot.reason || '').trim();
    const scrapPcs = Number(slot.scrap) || 0;
    const rejectKg = scrapPcs > 0 ? Math.round(scrapPcs * unitWeight) : (slot.purge > 0 ? Number(slot.purge) : '');

    s1GoodMTotal += goodM;
    if (typeof rejectKg === 'number') {
      s1ScrapKgTotal += rejectKg;
    }

    shift1Rows.push({
      hour,
      stdM,
      goodM: goodM > 0 ? goodM : (isFullStop ? 0 : (actualPcs > 0 ? goodM : '')),
      cause,
      downtime,
      rejectKg
    });
  }

  const shift2Rows = [];
  let s2GoodMTotal = 0;
  let s2ScrapKgTotal = 0;

  for (let i = 0; i < 12; i += 1) {
    const slot = slots[i + 12] || {};
    const hour = SOP_SHIFT2_HOURS[i];
    const stdM = stdShift2[i];

    if (isBlank) {
      shift2Rows.push({
        hour,
        stdM,
        goodM: '',
        cause: '',
        downtime: '',
        rejectKg: ''
      });
      continue;
    }

    const isFullStop = slot.downtime >= 60;
    const actualPcs = Number(slot.actual) || 0;
    const pipeLen = slot.ref === '2' ? pipeLen2 : pipeLen1;
    const unitWeight = slot.ref === '2' ? unitWeight2 : unitWeight1;
    const goodM = isFullStop ? 0 : Math.round(actualPcs * pipeLen);
    const downtime = Number(slot.downtime) > 0 ? Number(slot.downtime) : 0;
    const cause = (slot.reason || '').trim();
    const scrapPcs = Number(slot.scrap) || 0;
    const rejectKg = scrapPcs > 0 ? Math.round(scrapPcs * unitWeight) : (slot.purge > 0 ? Number(slot.purge) : '');

    s2GoodMTotal += goodM;
    if (typeof rejectKg === 'number') {
      s2ScrapKgTotal += rejectKg;
    }

    shift2Rows.push({
      hour,
      stdM,
      goodM: goodM > 0 ? goodM : (isFullStop ? 0 : (actualPcs > 0 ? goodM : '')),
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
    s1TotalGoodM: isBlank ? '' : s1GoodMTotal,
    s1TotalScrapKg: isBlank ? '' : s1ScrapKgTotal,
    s2TotalGoodM: isBlank ? '' : s2GoodMTotal,
    s2TotalScrapKg: isBlank ? '' : s2ScrapKgTotal,
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
