export const HOUR_WINDOWS = (() => {
  const out = [];
  for (let i = 0; i < 24; i += 1) {
    const start = (6 + i) % 24;
    const end = (7 + i) % 24;
    out.push({
      index: i,
      shift: i < 12 ? 1 : 2,
      startHour: start,
      label: `${String(start).padStart(2, '0')}:30 - ${String(end).padStart(2, '0')}:30`
    });
  }
  return out;
})();

export const round1 = (n) => Math.round(n * 10) / 10;

export function makeRefSpec() {
  return {
    od: '',
    wt: '',
    pipeLength: '',
    pipeSpec: '',
    cls: '',
    speed: '',
    stdWeight: '',
    cutTime: null,
    targetRate: null
  };
}

export function buildRefDerived(ref) {
  const speed = Number(ref.speed);
  const length = Number(ref.pipeLength) || 6.0;
  let cutTime = ref.cutTime != null && ref.cutTime !== '' ? round1(Number(ref.cutTime)) : null;
  let targetRate = ref.targetRate != null && ref.targetRate !== '' ? round1(Number(ref.targetRate)) : null;

  if ((targetRate == null || isNaN(targetRate) || targetRate <= 0) && speed > 0 && length > 0) {
    cutTime = round1((length / speed) * 60);
    targetRate = cutTime > 0 ? round1(3600 / cutTime) : null;
  } else if (targetRate > 0 && (cutTime == null || isNaN(cutTime) || cutTime <= 0) && length > 0) {
    cutTime = round1(3600 / targetRate);
  }
  const parts = [];
  if (ref.od) parts.push(`${ref.od}mm`);
  if (ref.wt) parts.push(`${ref.wt}mm`);
  if (ref.pipeLength) parts.push(`${ref.pipeLength}m`);
  const pipeSpec = parts.join(' x ') || `${ref.od || ''}mm x ${ref.wt || ''}mm x ${ref.pipeLength || ''}m`;
  return {
    ...ref,
    cutTime,
    targetRate,
    pipeSpec: pipeSpec.trim() === 'mm x mm x m' ? '' : pipeSpec
  };
}

export function emptySlots() {
  return HOUR_WINDOWS.map((h) => ({
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
}

function appendReason(existing, incoming) {
  const cleanIncoming = (incoming || '').trim();
  const cleanExisting = (existing || '').trim();
  if (!cleanIncoming) return cleanExisting;
  if (!cleanExisting) return cleanIncoming;
  if (cleanExisting.includes(cleanIncoming)) return cleanExisting;
  return `${cleanExisting}; ${cleanIncoming}`;
}

export function applyDowntimeEvents(slots, events) {
  const next = slots.map((s) => ({ ...s, downtime: 0, reason: '' }));
  const list = (events || []).filter((e) => e && e.durationMin > 0);
  for (const ev of list) {
    let idx = (((Number(ev.startHour) % 24) + 24) % 24 - 6 + 72) % 24;
    let remaining = Math.round(Number(ev.durationMin) || 0);
    let guard = 0;
    while (remaining > 0 && guard < 48) {
      const slot = next[idx % 24];
      const free = 60 - slot.downtime;
      if (free > 0) {
        const take = Math.min(free, remaining);
        slot.downtime = round1(slot.downtime + take);
        slot.reason = appendReason(slot.reason, ev.reason);
        remaining = Math.round((remaining - take) * 10) / 10;
      }
      idx += 1;
      guard += 1;
    }
  }
  return next;
}

export function roundToSum(values, target, precision = 0) {
  const mult = 10 ** precision;
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const desired = Math.round(Number(target) * mult);
  const scaled = values.map((v) => (v / total) * desired);
  const floors = scaled.map((v) => Math.floor(v));
  let diff = desired - floors.reduce((a, b) => a + b, 0);
  const order = scaled
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (diff > 0 && k < order.length) {
    floors[order[k].i] += 1;
    diff -= 1;
    k += 1;
  }
  return floors.map((v) => v / mult);
}

export function distributeProduction(slots, summary) {
  const totalOutput = Math.max(0, round1(Number(summary.totalOutput) || 0));
  const totalScrap = Math.max(0, Math.round(Number(summary.totalScrapPipes) || 0));
  const totalPurge = Math.max(0, Number(summary.totalPurgeKg) || 0);
  const totalBundles = Math.max(0, Math.round(Number(summary.totalBundles) || 0));

  const running = slots.map((s) => Math.max(0, Math.min(60, 60 - (Number(s.downtime) || 0))));
  const totalRun = running.reduce((a, b) => a + b, 0);

  const actualRaw = totalRun > 0 ? slots.map((s, i) => (totalOutput * running[i]) / totalRun) : slots.map(() => 0);
  const actuals = roundToSum(actualRaw, totalOutput, 1);

  let scrapRaw;
  if (totalOutput > 0) scrapRaw = slots.map((s, i) => (totalScrap * actuals[i]) / totalOutput);
  else scrapRaw = totalRun > 0 ? slots.map((s, i) => (totalScrap * running[i]) / totalRun) : slots.map(() => 0);
  const scraps = roundToSum(scrapRaw, totalScrap);

  let purgeRaw;
  const downtimeTot = slots.reduce((a, s) => a + Math.max(0, s.downtime), 0);
  if (downtimeTot > 0) purgeRaw = slots.map((s) => (totalPurge * Math.max(0, s.downtime)) / downtimeTot);
  else purgeRaw = slots.map((_, i) => (i === 0 ? totalPurge : 0));
  const purges = roundToSum(purgeRaw, totalPurge, 1);

  let bundleRaw;
  if (totalOutput > 0) bundleRaw = slots.map((s, i) => (totalBundles * actuals[i]) / totalOutput);
  else bundleRaw = totalRun > 0 ? slots.map((s, i) => (totalBundles * running[i]) / totalRun) : slots.map(() => 0);
  const bundles = roundToSum(bundleRaw, totalBundles);

  return slots.map((s, i) => ({
    ...s,
    actual: actuals[i],
    scrap: scraps[i],
    purge: purges[i],
    bundles: bundles[i]
  }));
}

export function refRate(refs, refKey) {
  const r = refs && refs[refKey] ? buildRefDerived(refs[refKey]) : null;
  return r && r.targetRate ? r.targetRate : 0;
}

export function deriveSlots(slots, refs, startCounter) {
  const start = Math.max(0, round1(Number(startCounter) || 0));
  let runningCounter = start;
  const derived = slots.map((s) => {
    const rate = refRate(refs, s.ref);
    const runMin = Math.max(0, Math.min(60, 60 - (Number(s.downtime) || 0)));
    const target = round1((rate * runMin) / 60);
    const actual = Math.max(0, round1(Number(s.actual) || 0));
    const scrap = Math.max(0, round1(Number(s.scrap) || 0));
    const good = Math.max(0, round1(actual - scrap));
    runningCounter = round1(runningCounter + actual);
    return {
      ...s,
      downtime: Number(s.downtime) || 0,
      actual,
      scrap,
      good,
      target,
      bundle: Math.max(0, Math.round(Number(s.bundles) || 0)),
      endCounter: runningCounter,
      rate
    };
  });
  return derived;
}

function blockTotals(rows) {
  const sum = (fn) => round1(rows.reduce((a, r) => a + fn(r), 0));
  return {
    endCounter: rows.length ? rows[rows.length - 1].endCounter : 0,
    actual: sum((r) => r.actual),
    target: sum((r) => r.target),
    downtime: sum((r) => r.downtime),
    bundles: rows.reduce((a, r) => a + r.bundle, 0),
    scrap: sum((r) => r.scrap),
    purge: round1(rows.reduce((a, r) => a + r.purge, 0)),
    good: sum((r) => r.good)
  };
}

export function buildAll(slots, refs, startCounter, engineering = {}) {
  const derived = deriveSlots(slots, refs, startCounter);
  const shift1 = derived.filter((r) => r.shift === 1);
  const shift2 = derived.filter((r) => r.shift === 2);
  const t1 = blockTotals(shift1);
  const t2 = blockTotals(shift2);
  const grand = blockTotals(derived);

  const totalDowntimeHours = round1(grand.downtime / 60);
  const operatingHours = round1(24 - totalDowntimeHours);
  const availability = operatingHours / 24;
  const performance = grand.target > 0 ? grand.actual / grand.target : 0;
  const quality = grand.actual > 0 ? grand.good / grand.actual : 0;
  const oee = availability * performance * quality;

  // Explicit transparent formula formatting
  const aStr = (availability * 100).toFixed(1) + '%';
  const pStr = (performance * 100).toFixed(1) + '%';
  const qStr = (quality * 100).toFixed(1) + '%';
  const oeeStr = (oee * 100).toFixed(1) + '%';
  const formulaStr = `OEE = A (${aStr}) × P (${pStr}) × Q (${qStr}) = ${oeeStr}`;

  // Engineering KPIs: Actual Output Rate (kg/h) vs Nominal Capacity (kg/h)
  const ref1Weight = Number(refs?.['1']?.stdWeight) || 0;
  const totalWeightKg = engineering.totalWeightKg || Math.round(grand.actual * ref1Weight);
  const actualRateKgH =
    engineering.actualRateKgH || (operatingHours > 0 ? round1(totalWeightKg / operatingHours) : 0);
  const nominalCapacityKgH = engineering.nominalCapacityKgH || 0;
  const capacityUtilizationPct =
    engineering.capacityUtilizationPct ||
    (nominalCapacityKgH > 0 ? round1((actualRateKgH / nominalCapacityKgH) * 100) : 0);

  return {
    slots: derived,
    shift1,
    shift2,
    shift1Totals: t1,
    shift2Totals: t2,
    grandTotals: grand,
    totalDowntimeMin: grand.downtime,
    totalDowntimeHours,
    operatingHours,
    availability,
    performance,
    quality,
    oee,
    formulaStr,
    aStr,
    pStr,
    qStr,
    oeeStr,
    engineering: {
      totalWeightKg,
      actualRateKgH,
      nominalCapacityKgH,
      capacityUtilizationPct
    }
  };
}

export function generateReport(report) {
  const summary = report.summary || {};
  const events = report.downtimeEvents || [];
  const withDowntime = applyDowntimeEvents(emptySlots(), events);
  const withProduction = distributeProduction(withDowntime, summary);
  return buildAll(withProduction, report.refs || {}, summary.startCounter || 0, report.engineering || {});
}
