import * as XLSX from 'xlsx';
import { MACHINES, matchMachine, PLANT_NAME } from '../config/machines.js';
import {
  makeRefSpec,
  generateReport,
  round1,
  emptySlots,
  applyDowntimeEvents,
  distributeProduction,
  buildAll,
  roundToSum
} from './engine.js';
import { newId } from '../data/store.js';

/**
 * Format and normalize Excel date (Date object, serial number, or date string) into YYYY-MM-DD
 */
export function normalizeExcelDate(val) {
  if (val == null || val === '') return '';

  // 1. JavaScript Date instance
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return '';
    const localY = val.getFullYear();
    const localM = String(val.getMonth() + 1).padStart(2, '0');
    const localD = String(val.getDate()).padStart(2, '0');
    const localStr = `${localY}-${localM}-${localD}`;

    const roundedUtcDays = Math.round(val.getTime() / 86400000);
    const utcDate = new Date(roundedUtcDays * 86400000);
    const utcY = utcDate.getUTCFullYear();
    const utcM = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
    const utcD = String(utcDate.getUTCDate()).padStart(2, '0');
    const utcStr = `${utcY}-${utcM}-${utcD}`;

    // Handle historical timezone or local midnight skew (e.g. 20:59:08Z in Cairo/UTC+3)
    if (val.getHours() >= 21 || val.getUTCHours() >= 20) {
      return utcStr;
    }
    return localStr || utcStr;
  }

  // 2. Numeric Excel serial (e.g. 46282 or string "46282")
  if (typeof val === 'number' || (typeof val === 'string' && /^\d{5}(?:\.\d+)?$/.test(val.trim()))) {
    const num = Number(val);
    if (num > 20000 && num < 80000) {
      const ssf = XLSX.SSF || Reflect.get(XLSX, 'default')?.SSF;
      const dateObj = ssf?.parse_date_code ? ssf.parse_date_code(num) : null;
      if (dateObj && dateObj.y && dateObj.m && dateObj.d) {
        const y = dateObj.y;
        const m = String(dateObj.m).padStart(2, '0');
        const d = String(dateObj.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      // Mathematical fallback from Excel epoch (1899-12-30)
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      return d.toISOString().slice(0, 10);
    }
  }

  const s = String(val).trim();
  if (!s) return '';
  if (/total/i.test(s)) return s;

  // 3. String: YYYY-MM-DD or YYYY/MM/DD
  const yFirst = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (yFirst) {
    const y = yFirst[1];
    const m = yFirst[2].padStart(2, '0');
    const d = yFirst[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 4. String: DD/MM/YYYY or MM/DD/YYYY
  const dFirst = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dFirst) {
    let p1 = Number(dFirst[1]);
    let p2 = Number(dFirst[2]);
    const y = dFirst[3];
    let day = p1;
    let month = p2;
    if (p2 > 12) {
      day = p2;
      month = p1;
    }
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 5. Fallback Date parsing
  const parsedD = new Date(s);
  if (!Number.isNaN(parsedD.getTime())) {
    const roundedUtcDays = Math.round(parsedD.getTime() / 86400000);
    const utcDate = new Date(roundedUtcDays * 86400000);
    const y = utcDate.getUTCFullYear();
    const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(utcDate.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return s;
}

export const formatExcelDate = normalizeExcelDate;

/**
 * Parses pipe dimensions (OD, Wall Thickness, Class) from freeform factory description
 */
export function parseProductSpecs(description, unitWeight) {
  const spec = makeRefSpec();
  spec.pipeLength = '6.0';
  spec.stdWeight = unitWeight != null && unitWeight !== '' ? String(unitWeight) : '';

  if (!description) {
    spec.pipeSpec = 'PVC Pipe 6.0m';
    return spec;
  }

  const desc = String(description).trim();
  spec.pipeSpec = desc;

  // 1. Check for inch OD pattern: 4", 3/4", 3", 1", 6", 2"
  const inchMatch = desc.match(/(\d+(?:\/\d+)?)"/);
  if (inchMatch) {
    spec.od = `${inchMatch[1]}"`;
  }

  // 2. Check for metric dimension pair like "110x5.3" or "50x2.4"
  const pairMatch = desc.match(/(\d{2,3})\s*[xX]\s*(\d+(?:\.\d+)?)/);
  const isPnPair = desc.match(/PN\s*(\d{2,3})\s*[xX]/i);

  if (pairMatch && !isPnPair) {
    spec.od = pairMatch[1];
    spec.wt = pairMatch[2];
  } else {
    // 3. Check for explicit OD like "75MM", "160MM", "32MM", "25MM", "50MM", "110MM"
    const mmMatches = [...desc.matchAll(/(\d+(?:\.\d+)?)\s*MM\b/gi)].map((m) => m[1]);
    if (mmMatches.length > 0) {
      const odCandidate = mmMatches.find((v) => Number(v) >= 20);
      if (odCandidate) {
        spec.od = odCandidate;
      }
      const wtCandidate = mmMatches.find((v) => v !== odCandidate && Number(v) > 0 && Number(v) < 20);
      if (wtCandidate) {
        spec.wt = wtCandidate;
      }
    }
  }

  // 4. Check for explicit WT pattern like "X3.6MM" or "x 3.6mm"
  if (!spec.wt) {
    const xwtMatch = desc.match(/[xX]\s*(\d+(?:\.\d+)?)\s*(?:mm)?/i);
    if (xwtMatch && Number(xwtMatch[1]) < 25) {
      spec.wt = xwtMatch[1];
    }
  }

  // 5. Class / Pressure Rating pattern
  const pnMatch = desc.match(/(PN[\s-]?\d+(?:\.\d+)?)/i);
  const sdrMatch = desc.match(/(SDR[\s-]?\d+(?:\.\d+)?)/i);
  const schMatch = desc.match(/(SCH[\s-]?\d+)/i);
  const classMatch = desc.match(/(Class[\s-]?\d+)/i);

  if (pnMatch) spec.cls = pnMatch[1].toUpperCase().replace(/\s+/g, '-');
  else if (sdrMatch) spec.cls = sdrMatch[1].toUpperCase();
  else if (schMatch) spec.cls = schMatch[1].toUpperCase();
  else if (classMatch) spec.cls = classMatch[1];
  else spec.cls = 'Standard';

  return spec;
}

/**
 * Dynamically parse Machine_Master worksheet if present in workbook
 */
export function parseMachineMaster(wb) {
  if (!wb || !wb.SheetNames) return MACHINES;
  const sheetName = wb.SheetNames.find((name) => /machine.*master/i.test(name));
  if (!sheetName) return MACHINES;

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows || rows.length < 2) return MACHINES;

  let headerRowIdx = -1;
  let idIdx = -1;
  let nameIdx = -1;
  let capIdx = -1;

  // Scan first 5 rows to flexibly detect header row location (Row 1, Row 3, etc.)
  const scanLimit = Math.min(5, rows.length);
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;

    const rowId = row.findIndex((c) => /Line\s*ID/i.test(String(c)));
    const rowName = row.findIndex((c) => /Machine\s*Name/i.test(String(c)));
    const rowCap = row.findIndex((c) => /Nominal|Capacity|kg\/h/i.test(String(c)));

    if (rowId !== -1 || (rowName !== -1 && rowCap !== -1)) {
      headerRowIdx = r;
      idIdx = rowId;
      nameIdx = rowName;
      capIdx = rowCap;
      break;
    }
  }

  // Fallback: If header matching fails, safely infer columns by index (Col 0 = Line ID, Col 1 = Machine Name, Col 2 = Nominal Capacity)
  if (headerRowIdx === -1) {
    headerRowIdx = 0;
    idIdx = 0;
    nameIdx = 1;
    capIdx = 2;
  } else {
    if (idIdx === -1) idIdx = 0;
    if (nameIdx === -1) nameIdx = 1;
    if (capIdx === -1) capIdx = 2;
  }

  const master = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c === '' || c == null)) continue;

    // 1. Line ID: extract clean L-0X pattern, or clean text
    const rawId = r[idIdx] != null ? String(r[idIdx]).trim() : '';
    const idMatch = rawId.match(/L\s*-\s*\d{1,2}/i);
    const id = idMatch
      ? idMatch[0].toUpperCase().replace(/\s+/g, '')
      : rawId || `L-${String(master.length + 1).padStart(2, '0')}`;

    // Skip potential repeated header or empty row
    if (/Line\s*ID/i.test(id)) continue;

    // 2. Machine Name: sanitize bilingual text, removing Arabic characters
    let rawName = r[nameIdx] != null ? String(r[nameIdx]).trim() : '';
    rawName = rawName
      .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
      .trim();
    rawName = rawName.replace(/^[\s(\[-]+|[\s)\]-]+$/g, '').trim();
    const name = rawName || id;

    // 3. Nominal Capacity kg/h: numeric parsing
    const rawCap = r[capIdx];
    let cap = 0;
    if (typeof rawCap === 'number') {
      cap = rawCap;
    } else if (rawCap) {
      const numMatch = String(rawCap).match(/\d+(?:\.\d+)?/);
      cap = numMatch ? Number(numMatch[0]) : 0;
    }

    master.push({
      id,
      name,
      capacityKgH: cap,
      detail: cap > 0 ? `${cap} kg/h` : ''
    });
  }

  return master.length > 0 ? master : MACHINES;
}

/**
 * Parses Daily Production Log rows from an Excel workbook
 */
export function parseDailyLog(wb, dynamicMaster = MACHINES) {
  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('Workbook contains no readable sheets.');
  }

  // Locate target production log sheet (Daily Production Log, Pipe Production, Prod Log, etc.)
  const targetSheetName =
    wb.SheetNames.find((name) => /daily.*prod/i.test(name)) ||
    wb.SheetNames.find((name) => /pipe.*prod/i.test(name)) ||
    wb.SheetNames.find((name) => /prod.*log/i.test(name)) ||
    wb.SheetNames.find((name) => /production/i.test(name)) ||
    wb.SheetNames.find((name) => !/machine.*master/i.test(name)) ||
    wb.SheetNames[0];

  if (!targetSheetName) {
    throw new Error('Workbook contains no readable production sheets.');
  }

  const sheet = wb.Sheets[targetSheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (!rawRows || rawRows.length < 2) {
    return { sheetName: targetSheetName, machineMaster: dynamicMaster, rows: [] };
  }

  // Find header row by detecting keywords: Date, Item, Machine, Qty
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const rowStr = rawRows[i].map((c) => String(c).toLowerCase()).join(' ');
    if (rowStr.includes('date') && (rowStr.includes('machine') || rowStr.includes('qty') || rowStr.includes('item'))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    headerIndex = 0;
  }

  const headers = rawRows[headerIndex].map((h) => String(h).trim());

  const colIdx = {
    date: headers.findIndex((h) => /^date/i.test(h)),
    itemCode: headers.findIndex((h) => /item\s*code|^code/i.test(h)),
    desc: headers.findIndex((h) => /desc|product|spec/i.test(h)),
    machine: headers.findIndex((h) => /machine|line|extruder/i.test(h)),
    qty: headers.findIndex((h) => /prod.*qty|quantity|^qty|fg/i.test(h)),
    unitWeight: headers.findIndex((h) => /unit\s*w/i.test(h)),
    totalWeight: headers.findIndex((h) => /total\s*w/i.test(h)),
    scrapKg: headers.findIndex((h) => /scrap|reject/i.test(h)),
    opHours: headers.findIndex((h) => /operat.*hour|run.*hour|^hours/i.test(h)),
    reasonOfStop: headers.findIndex((h) => /reason.*stop|stop.*reason|downtime.*reason|^reason/i.test(h))
  };

  const parsed = [];

  for (let r = headerIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every((c) => c === '' || c == null)) continue;

    const rawDate = colIdx.date >= 0 ? row[colIdx.date] : '';
    const dateRawStr = String(rawDate).trim();
    // Skip summary or grand total rows
    if (/total/i.test(dateRawStr)) continue;

    const date = normalizeExcelDate(rawDate);
    // Skip summary rows if normalized date string contains total
    if (/total/i.test(date)) continue;

    const itemCode = colIdx.itemCode >= 0 ? String(row[colIdx.itemCode]).trim() : '';
    const description = colIdx.desc >= 0 ? String(row[colIdx.desc]).trim() : '';
    const machineRaw = colIdx.machine >= 0 ? String(row[colIdx.machine]).trim() : '';
    const qty = colIdx.qty >= 0 ? Number(row[colIdx.qty]) || 0 : 0;
    const unitWeight = colIdx.unitWeight >= 0 ? Number(row[colIdx.unitWeight]) || 0 : 0;
    const totalWeight = colIdx.totalWeight >= 0 ? Number(row[colIdx.totalWeight]) || 0 : 0;
    const scrapKg = colIdx.scrapKg >= 0 ? Number(row[colIdx.scrapKg]) || 0 : 0;
    const opHoursRaw = colIdx.opHours >= 0 ? Number(row[colIdx.opHours]) : 24;
    const operatingHours = Math.min(24, Math.max(0, Number.isNaN(opHoursRaw) ? 24 : opHoursRaw));
    const downtimeHours = Math.max(0, 24 - operatingHours);

    // Extract Reason of Stop (Column J)
    let reasonOfStop = colIdx.reasonOfStop >= 0 ? String(row[colIdx.reasonOfStop] || '').trim() : '';
    // If not in matched column, check 10th column (index 9) if present
    if (!reasonOfStop && row[9] && typeof row[9] === 'string') {
      reasonOfStop = String(row[9]).trim();
    }

    // Default stoppage reason if none provided but downtime occurred
    if (!reasonOfStop && downtimeHours > 0) {
      reasonOfStop = downtimeHours >= 6
        ? 'Die Change & Sizing Setup'
        : 'Maintenance & Heater Stabilization';
    }

    // Skip completely empty rows
    if (!description && !itemCode && qty === 0) continue;

    const matchedMachine = matchMachine(machineRaw, dynamicMaster);
    const machineId = matchedMachine ? matchedMachine.id : machineRaw || 'L-01';
    const machineName = matchedMachine ? `${matchedMachine.id} - ${matchedMachine.name}` : machineRaw;
    const nominalCapacityKgH = matchedMachine?.capacityKgH || 0;

    // Engineering KPIs: Actual Output Rate (kg/h) & Capacity Utilization %
    const actualRateKgH = operatingHours > 0 ? round1(totalWeight / operatingHours) : 0;
    const capacityUtilizationPct = nominalCapacityKgH > 0 ? round1((actualRateKgH / nominalCapacityKgH) * 100) : 0;

    parsed.push({
      id: `log_${r}_${itemCode || 'row'}`,
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
      downtimeHours: round1(downtimeHours),
      reasonOfStop,
      actualRateKgH,
      capacityUtilizationPct
    });
  }

  // Consolidate multi-item records for the same machine on the same date into single 24-hour machine records
  const consolidated = consolidateDailyMachineRecords(parsed, dynamicMaster);

  return {
    sheetName: targetSheetName,
    machineMaster: dynamicMaster,
    rawRows: parsed,
    rows: consolidated
  };
}

/**
 * Consolidates multi-item production records for the same machine on the same date into
 * a single 24-hour machine record.
 * Handles cases where a machine changed pipe sizes/orders during the day (e.g. 10h item 1 + 14h item 2).
 */
export function consolidateDailyMachineRecords(rows, dynamicMaster = MACHINES) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const groups = new Map();
  const groupOrder = [];

  for (const row of rows) {
    if (!row) continue;
    const date = row.date || '';
    const machineId = row.machineId || (row.matchedMachine ? row.matchedMachine.id : row.machineRaw) || 'L-01';
    const key = `${date}__${machineId}`;

    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }
    groups.get(key).push(row);
  }

  const consolidated = [];

  for (const key of groupOrder) {
    const group = groups.get(key);
    if (group.length === 1) {
      const single = { ...group[0], items: group[0].items || [group[0]] };
      consolidated.push(single);
      continue;
    }

    const first = group[0];
    const totalQty = group.reduce((sum, r) => sum + (Number(r.productionQty) || 0), 0);
    const totalWeight = Math.round(group.reduce((sum, r) => sum + (Number(r.totalWeight) || 0), 0));
    const totalScrap = round1(group.reduce((sum, r) => sum + (Number(r.scrapKg) || 0), 0));
    const totalOpHours = round1(
      Math.min(24, group.reduce((sum, r) => sum + (Number(r.operatingHours) || 0), 0))
    );
    const downtimeHours = round1(Math.max(0, 24 - totalOpHours));

    const itemCodes = group
      .map((r) => r.itemCode)
      .filter(Boolean)
      .join(' / ');
    const descriptions = group
      .map((r) => r.description)
      .filter(Boolean)
      .join(' / ');

    const explicitReasons = group
      .map((r) => r.reasonOfStop)
      .filter((r) => r && !r.toLowerCase().includes('maintenance & heater stabilization'));
    let reasonOfStop = '';
    if (explicitReasons.length > 0) {
      reasonOfStop = Array.from(new Set(explicitReasons)).join('; ');
    } else if (downtimeHours > 0) {
      reasonOfStop = 'Die Change & Sizing Setup';
    }

    const matchedMachine = first.matchedMachine || matchMachine(first.machineId, dynamicMaster);
    const nominalCapacityKgH = first.nominalCapacityKgH || matchedMachine?.capacityKgH || 0;
    const actualRateKgH = totalOpHours > 0 ? round1(totalWeight / totalOpHours) : 0;
    const capacityUtilizationPct =
      nominalCapacityKgH > 0 ? round1((actualRateKgH / nominalCapacityKgH) * 100) : 0;

    const unitWeight = totalQty > 0 ? round1(totalWeight / totalQty) : (first.unitWeight || 0);

    consolidated.push({
      ...first,
      id: `consolidated_${first.date}_${first.machineId}`,
      itemCode: itemCodes,
      description: descriptions,
      productionQty: totalQty,
      unitWeight,
      totalWeight,
      scrapKg: totalScrap,
      operatingHours: totalOpHours,
      downtimeHours,
      reasonOfStop,
      actualRateKgH,
      capacityUtilizationPct,
      items: group
    });
  }

  return consolidated;
}

/**
 * Parses an uploaded Excel file (.xlsx / .xls) and extracts Daily Production Log rows
 */
export function parseExcelWorkbook(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: 'array', cellDates: true });

  // 1. Parse dynamic Machine Master from workbook (or fallback to defaults)
  const machineMaster = parseMachineMaster(wb);

  // 2. Parse daily log rows using matched sheet and dynamic master
  return parseDailyLog(wb, machineMaster);
}

/**
 * Converts a selected parsed log row into a full 24-hour report model.
 * Seamlessly handles single-item and multi-item machines (Reference 1 & Reference 2).
 */
export function convertLogRowToReport(row, options = {}) {
  const isMulti = Array.isArray(row.items) && row.items.length > 1;
  const item1 = isMulti ? row.items[0] : row;
  const item2 = isMulti ? row.items[1] : null;

  const specs1 = parseProductSpecs(item1.description, item1.unitWeight);
  specs1.itemCode = item1.itemCode || '';

  const specs2 = item2 ? parseProductSpecs(item2.description, item2.unitWeight) : makeRefSpec();
  if (item2) specs2.itemCode = item2.itemCode || '';

  const matched = row.matchedMachine || matchMachine(row.machineId) || MACHINES[0];
  const nominalCap = Number(row.nominalCapacityKgH || matched.capacityKgH || 0);

  // 1. Compute benchmark target pcs/h for Item 1
  const unitWeight1 = Number(item1.unitWeight) || 0;
  let targetRate1;
  if (nominalCap > 0 && unitWeight1 > 0) {
    targetRate1 = round1(nominalCap / unitWeight1);
  } else if (Number(item1.productionQty) > 0 && Number(item1.operatingHours) > 0) {
    targetRate1 = round1(Number(item1.productionQty) / Number(item1.operatingHours));
  } else {
    targetRate1 = 120;
  }
  const pipeLength1 = Number(specs1.pipeLength) || 6.0;
  const cutTime1 = targetRate1 > 0 ? round1(3600 / targetRate1) : 30;
  const speed1 = cutTime1 > 0 ? round1((pipeLength1 / cutTime1) * 60) : round1((pipeLength1 * targetRate1) / 60);

  specs1.speed = String(speed1);
  specs1.cutTime = cutTime1;
  specs1.targetRate = targetRate1;

  // 2. Compute benchmark target pcs/h for Item 2 (if present)
  if (item2) {
    const unitWeight2 = Number(item2.unitWeight) || 0;
    let targetRate2;
    if (nominalCap > 0 && unitWeight2 > 0) {
      targetRate2 = round1(nominalCap / unitWeight2);
    } else if (Number(item2.productionQty) > 0 && Number(item2.operatingHours) > 0) {
      targetRate2 = round1(Number(item2.productionQty) / Number(item2.operatingHours));
    } else {
      targetRate2 = 120;
    }
    const pipeLength2 = Number(specs2.pipeLength) || 6.0;
    const cutTime2 = targetRate2 > 0 ? round1(3600 / targetRate2) : 30;
    const speed2 = cutTime2 > 0 ? round1((pipeLength2 / cutTime2) * 60) : round1((pipeLength2 * targetRate2) / 60);

    specs2.speed = String(speed2);
    specs2.cutTime = cutTime2;
    specs2.targetRate = targetRate2;
  }

  // 3. Scrap calculations
  const scrapPipes1 = unitWeight1 > 0 ? Math.round(Number(item1.scrapKg || 0) / unitWeight1) : 0;
  const scrapPipes2 =
    item2 && Number(item2.unitWeight) > 0 ? Math.round(Number(item2.scrapKg || 0) / Number(item2.unitWeight)) : 0;
  const totalScrapPipes = isMulti
    ? scrapPipes1 + scrapPipes2
    : unitWeight1 > 0
    ? Math.round(Number(row.scrapKg || 0) / unitWeight1)
    : 0;

  const targetOutput = Number(row.productionQty) || 0;
  const bundles = Math.max(0, Math.round(targetOutput / 30));

  const startCounter = options.startCounter != null ? Number(options.startCounter) : 0;
  const endCounter = startCounter + targetOutput;

  // 4. Downtime and Operating Hours
  const opH1 = Number(item1.operatingHours) || 0;
  const opH2 = item2 ? Number(item2.operatingHours) || 0 : 0;
  const totalOpHours = isMulti
    ? Math.min(24, Math.max(0, round1(opH1 + opH2)))
    : Number(row.operatingHours) > 0
    ? Number(row.operatingHours)
    : 24;
  const downtimeHours = isMulti
    ? round1(Math.max(0, 24 - totalOpHours))
    : Number(row.downtimeHours || 0);

  const downtimeEvents = [];
  if (downtimeHours > 0) {
    const durationMin = Math.round(downtimeHours * 60);
    const startHour = isMulti ? (6 + Math.round(opH1)) % 24 : 6;
    downtimeEvents.push({
      key: newId(),
      startHour,
      durationMin,
      reason: row.reasonOfStop || (isMulti ? 'Die Change & Sizing Setup' : 'Maintenance & Setup')
    });
  }

  // 5. Build Slots
  let slots;
  if (isMulti) {
    const rawSlots = applyDowntimeEvents(emptySlots(), downtimeEvents);

    let opH1Slots = Math.round(opH1);
    let dtSlots = Math.round(downtimeHours);
    let opH2Slots = 24 - opH1Slots - dtSlots;
    if (opH2Slots < 1 && opH2 > 0) {
      opH2Slots = 1;
      if (dtSlots > 0) dtSlots--;
      else if (opH1Slots > 1) opH1Slots--;
    }

    rawSlots.forEach((s, idx) => {
      if (idx < opH1Slots) {
        s.ref = '1';
      } else if (idx < opH1Slots + dtSlots) {
        s.ref = '1';
        s.downtime = 60;
        s.reason = s.reason || row.reasonOfStop || 'Die Change & Sizing Setup';
        s.actual = 0;
        s.scrap = 0;
      } else {
        s.ref = '2';
      }
    });

    // Distribute Item 1 actual production & scrap to Item 1 slots
    const s1Run = rawSlots.filter((s) => s.ref === '1' && s.downtime < 60);
    const q1 = Number(item1.productionQty) || 0;
    if (s1Run.length > 0) {
      const runMins1 = s1Run.map((s) => 60 - s.downtime);
      const totalRun1 = runMins1.reduce((a, b) => a + b, 0);
      const raw1 = totalRun1 > 0 ? runMins1.map((m) => (q1 * m) / totalRun1) : s1Run.map(() => 0);
      const acts1 = roundToSum(raw1, q1, 1);
      s1Run.forEach((s, i) => {
        s.actual = acts1[i];
      });

      const scRaw1 = s1Run.map((s) => (q1 > 0 ? (scrapPipes1 * s.actual) / q1 : 0));
      const sc1 = roundToSum(scRaw1, scrapPipes1);
      s1Run.forEach((s, i) => {
        s.scrap = sc1[i];
      });
    }

    // Distribute Item 2 actual production & scrap to Item 2 slots
    const s2Run = rawSlots.filter((s) => s.ref === '2' && s.downtime < 60);
    const q2 = Number(item2.productionQty) || 0;
    if (s2Run.length > 0) {
      const runMins2 = s2Run.map((s) => 60 - s.downtime);
      const totalRun2 = runMins2.reduce((a, b) => a + b, 0);
      const raw2 = totalRun2 > 0 ? runMins2.map((m) => (q2 * m) / totalRun2) : s2Run.map(() => 0);
      const acts2 = roundToSum(raw2, q2, 1);
      s2Run.forEach((s, i) => {
        s.actual = acts2[i];
      });

      const scRaw2 = s2Run.map((s) => (q2 > 0 ? (scrapPipes2 * s.actual) / q2 : 0));
      const sc2 = roundToSum(scRaw2, scrapPipes2);
      s2Run.forEach((s, i) => {
        s.scrap = sc2[i];
      });
    }

    slots = rawSlots;
  } else {
    // Single item flow
    const withDowntime = applyDowntimeEvents(emptySlots(), downtimeEvents);
    slots = distributeProduction(withDowntime, {
      totalOutput: String(targetOutput),
      totalScrapPipes: String(totalScrapPipes),
      totalPurgeKg: String(row.scrapKg || 0),
      totalBundles: String(bundles)
    });
  }

  const report = {
    id: newId(),
    sourceRecordId: row.id || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    header: {
      date: row.date || new Date().toISOString().slice(0, 10),
      lineId: matched.id,
      lineCustom: matched.name || (row.machineRaw !== matched.id ? row.machineRaw : ''),
      plantName: PLANT_NAME
    },
    refs: {
      1: specs1,
      2: specs2
    },
    summary: {
      startCounter: String(startCounter),
      endCounter: String(endCounter),
      totalOutput: String(targetOutput),
      totalBundles: String(bundles),
      totalScrapPipes: String(totalScrapPipes),
      totalPurgeKg: String(row.scrapKg || 0),
      haulOffMeter: String(Math.round(targetOutput * 6.0)),
      resinLot: `PVC-BATCH-${(row.date || '').replace(/-/g, '').slice(2)}`,
      shift1Lead: options.shift1Lead || 'Shift 1 Lead / Extrusion Tech',
      shift2Lead: options.shift2Lead || 'Shift 2 Lead / Extrusion Tech',
      plantManager: options.plantManager || 'Plant Production Manager'
    },
    downtimeEvents,
    slots,
    engineering: {
      nominalCapacityKgH: row.nominalCapacityKgH || matched.capacityKgH || 0,
      actualRateKgH: row.actualRateKgH || 0,
      capacityUtilizationPct: row.capacityUtilizationPct || 0,
      operatingHours: totalOpHours,
      totalWeightKg: row.totalWeight || 0
    }
  };

  // Run distribution engine / calculations
  const generated = buildAll(report.slots, report.refs, startCounter, report.engineering);
  report.slots = generated.slots;
  report.engineering = {
    ...report.engineering,
    ...generated.engineering,
    nominalCapacityKgH: report.engineering.nominalCapacityKgH || generated.engineering?.nominalCapacityKgH || 0,
    actualRateKgH: report.engineering.actualRateKgH || generated.engineering?.actualRateKgH || 0,
    capacityUtilizationPct: report.engineering.capacityUtilizationPct || generated.engineering?.capacityUtilizationPct || 0
  };

  return report;
}
