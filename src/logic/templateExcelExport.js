import ExcelJS from 'exceljs';
import { KTS_350_TEMPLATE_BASE64 } from './kts350TemplateBase64.js';
import { MACHINES, matchMachine } from '../config/machines.js';
import {
  formatFullMachineName,
  formatSopDates,
  resolveProductSpecification,
  computeStandardHourlyPieces
} from './legacySopHelper.js';
import { getOperatingRecordsForDate, sanitizeFilenamePart } from './batchZipExport.js';
import { convertLogRowToReport } from './excelParser.js';
import { buildAll } from './engine.js';

/**
 * Convert base64 string to Uint8Array buffer cross-platform (Browser and Node.js)
 */
export function base64ToUint8Array(base64) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64');
  }
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Extract 2-digit day number from date string for worksheet tab naming
 * e.g. "2026-09-28" -> "28", "28.09.2026" -> "28"
 */
export function extractDayNumber(dateStr, fallback = '28') {
  if (!dateStr) return fallback;
  const str = String(dateStr).trim();
  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return parts[2];
    }
    // DD.MM.YYYY
    return parts[0];
  }
  return fallback;
}

/**
 * Format filename strictly according to factory SOP specification:
 * OEE_[MachineID]_[YYYY-MM-DD].xlsx
 * e.g. OEE_KTS-350_2026-09-28.xlsx or OEE_L-03_2026-09-28.xlsx
 */
export function formatTemplateOeeFilename(machineId, date) {
  const sanitizedMachine = sanitizeFilenamePart(machineId || 'Machine', 'Machine');
  const d = date ? String(date).trim() : 'YYYY-MM-DD';
  return `OEE_${sanitizedMachine}_${d}.xlsx`;
}

/**
 * Retrieve the base KTS-350 SOP Excel template buffer.
 * Attempts browser fetch('/KTS-350.xlsx'), with immediate fallback to embedded base64 for offline & Node.js.
 */
export async function getTemplateBuffer() {
  // 1. Browser environment: attempt fetch('/KTS-350.xlsx')
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    try {
      const res = await window.fetch('/KTS-350.xlsx');
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        if (arrayBuf && arrayBuf.byteLength > 0) {
          return arrayBuf;
        }
      }
    } catch {
      // Fall through to embedded base64
    }
  }

  // 2. Guaranteed offline/universal fallback (Browser & Node.js)
  return base64ToUint8Array(KTS_350_TEMPLATE_BASE64).buffer;
}

/**
 * Cross-environment workbook saver (Browser Blob trigger or Node.js file write)
 */
export async function saveExcelWorkbook(wb, filename) {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else if (typeof wb.xlsx.writeFile === 'function') {
    await wb.xlsx.writeFile(filename);
  }
}

/**
 * Build a template-driven OEE workbook based on public/KTS-350.xlsx.
 * Strictly preserves merged cells, column widths, row heights, font styles, colors, fills, and formulas.
 */
export async function buildTemplateOeeWorkbook(report, derived, options = {}) {
  const { machineMaster = MACHINES } = options;
  const templateBuf = await getTemplateBuffer();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuf);

  const ws = wb.worksheets[0];
  if (!ws) {
    throw new Error('Template workbook contains no worksheets.');
  }

  const header = report?.header || {};
  const refs = report?.refs || {};
  const ref1 = refs['1'] || {};
  const ref2 = refs['2'] || {};
  const summary = report?.summary || {};
  const der = derived || buildAll(report?.slots || [], refs, summary?.startCounter, report?.engineering || {});

  // 1. Set Active Worksheet Tab Name to the day number
  const targetDateStr = header.date || options.date || '';
  const dayNumber = extractDayNumber(targetDateStr, '28');
  ws.name = String(dayNumber);

  // 2. Machine Line Code/Name (Cell C4)
  const fullMachineName = options.machineName ||
    (header.lineId && header.lineCustom
      ? (header.lineCustom.includes(header.lineId) ? header.lineCustom : `${header.lineId} - ${header.lineCustom}`)
      : (formatFullMachineName(header.lineId, header.lineCustom, machineMaster) || header.lineId || 'Line'));
  ws.getCell('C4').value = fullMachineName;

  // 3. Item Code & Description (Cells D5 and D6)
  const itemCode1 = ref1.itemCode || '';
  const desc1 = resolveProductSpecification(ref1, '');
  const primaryDesc = itemCode1 ? (desc1 ? `[${itemCode1}] - ${desc1}` : `[${itemCode1}]`) : desc1;
  ws.getCell('D5').value = primaryDesc || options.displayProduct || '';

  const itemCode2 = ref2.itemCode || '';
  const desc2 = resolveProductSpecification(ref2, '');
  const secondaryDesc = (itemCode2 || desc2)
    ? (itemCode2 ? (desc2 ? `[${itemCode2}] - ${desc2}` : `[${itemCode2}]`) : desc2)
    : '';
  ws.getCell('D6').value = secondaryDesc || '';

  // 4. Production Date (Cell I7 formatted strictly as text dd.MM.yyyy)
  const formattedDates = formatSopDates(targetDateStr);
  ws.getCell('I7').value = formattedDates.dots || '28.09.2026';

  // 5. Standard Piece Rate (Cell E8) & Nominal Weight (Cell G8)
  const hourlyRate1 = options.standardRate != null
    ? Number(options.standardRate)
    : (Number(ref1.targetRate) ||
       Number(report?.refs?.['1']?.targetRate) ||
       Number(report?.engineering?.hourlyTarget) ||
       Number(ref1.hourlyTarget) ||
       computeStandardHourlyPieces(report, ref1) ||
       11);
  const hourlyRate2 = options.standardRate != null
    ? Number(options.standardRate)
    : (Number(ref2.targetRate) ||
       Number(report?.refs?.['2']?.targetRate) ||
       Number(ref2.hourlyTarget) ||
       ((ref2 && (ref2.speed || ref2.targetRate || ref2.pipeSpec)) ? computeStandardHourlyPieces(report, ref2) : hourlyRate1));

  const stdUnitWeight = options.stdWeight != null
    ? Number(options.stdWeight)
    : (Number(ref1.stdWeight || report?.refs?.['1']?.stdWeight) || 26);
  const stdUnitWeight2 = options.stdWeight != null
    ? Number(options.stdWeight)
    : (Number(ref2.stdWeight || report?.refs?.['2']?.stdWeight) || stdUnitWeight);

  ws.getCell('E8').value = Number(hourlyRate1) || 11;
  ws.getCell('G8').value = Number(stdUnitWeight) || 26;

  // 6. Supervisor Names (B39 Day Shift, F39 Night Shift, clear template D39)
  const s1Supervisor = options.shift1Lead || summary.shift1Lead || '';
  const s2Supervisor = options.shift2Lead || summary.shift2Lead || '';
  ws.getCell('B39').value = s1Supervisor;
  ws.getCell('F39').value = s2Supervisor;
  ws.getCell('D39').value = null;

  // 7. Hourly Production & Stoppage Slots (Rows 10 to 33)
  const slots = report?.slots || [];
  let s1GoodTotal = 0;
  let s1DowntimeMin = 0;
  let s1ScrapKgTotal = 0;
  let s1PlanLossMin = 0;

  // Shift 1: Hours 09:00 - 20:00 (Rows 10 to 21)
  for (let i = 0; i < 12; i += 1) {
    const r = 10 + i;
    const slot = slots[i] || {};
    const stdCumulative = (i + 1) * hourlyRate1;
    const actualPcs = slot.actual != null ? Number(slot.actual) : (slot.goodPcs != null ? Number(slot.goodPcs) : 0);
    const dtMin = slot.downtime != null && Number(slot.downtime) > 0 ? Number(slot.downtime) : 0;
    const reasonText = slot.reason || slot.cause || '';
    const unitWt = slot.ref === '2' ? stdUnitWeight2 : stdUnitWeight;
    const scrapKg = slot.scrapKg != null && Number(slot.scrapKg) >= 0
      ? Number(slot.scrapKg)
      : (slot.scrap != null ? Math.round(Number(slot.scrap) * unitWt) : 0);

    ws.getCell(`B${r}`).value = stdCumulative;
    ws.getCell(`C${r}`).value = actualPcs;
    ws.getCell(`D${r}`).value = reasonText || null;
    ws.getCell(`E${r}`).value = dtMin > 0 ? dtMin : 0;
    ws.getCell(`F${r}`).value = scrapKg;

    s1GoodTotal += actualPcs;
    s1DowntimeMin += dtMin;
    s1ScrapKgTotal += scrapKg;

    const lowerReason = String(reasonText).toLowerCase();
    if (lowerReason.includes('no order') || lowerReason.includes('plan complete')) {
      s1PlanLossMin += dtMin;
    }
  }

  let s2GoodTotal = 0;
  let s2DowntimeMin = 0;
  let s2ScrapKgTotal = 0;
  let s2PlanLossMin = 0;

  // Shift 2: Hours 21:00 - 08:00 (Rows 22 to 33)
  for (let i = 0; i < 12; i += 1) {
    const r = 22 + i;
    const slot = slots[i + 12] || {};
    const stdCumulative = (12 * hourlyRate1) + ((i + 1) * hourlyRate2);
    const actualPcs = slot.actual != null ? Number(slot.actual) : (slot.goodPcs != null ? Number(slot.goodPcs) : 0);
    const dtMin = slot.downtime != null && Number(slot.downtime) > 0 ? Number(slot.downtime) : 0;
    const reasonText = slot.reason || slot.cause || '';
    const unitWt = slot.ref === '2' ? stdUnitWeight2 : stdUnitWeight;
    const scrapKg = slot.scrapKg != null && Number(slot.scrapKg) >= 0
      ? Number(slot.scrapKg)
      : (slot.scrap != null ? Math.round(Number(slot.scrap) * unitWt) : 0);

    ws.getCell(`B${r}`).value = stdCumulative;
    ws.getCell(`C${r}`).value = actualPcs;
    ws.getCell(`D${r}`).value = reasonText || null;
    ws.getCell(`E${r}`).value = dtMin > 0 ? dtMin : 0;
    ws.getCell(`F${r}`).value = scrapKg;

    s2GoodTotal += actualPcs;
    s2DowntimeMin += dtMin;
    s2ScrapKgTotal += scrapKg;

    const lowerReason = String(reasonText).toLowerCase();
    if (lowerReason.includes('no order') || lowerReason.includes('plan complete')) {
      s2PlanLossMin += dtMin;
    }
  }

  // 8. Update Formula Result Cache (Preserving Live Formulas)
  const s1DowntimeHours = s1DowntimeMin / 60;
  const s1ScrapPieces = stdUnitWeight > 0 ? s1ScrapKgTotal / stdUnitWeight : 0;
  const s1OperatingHours = Math.max(0, 12 - s1DowntimeHours);
  const s1TargetAdj = (hourlyRate1 * 12) - ((hourlyRate1 * 12) * s1DowntimeHours / 12);

  let s1Perf = 'N/A';
  if (hourlyRate1 > 0 && stdUnitWeight > 0 && s1OperatingHours > 0) {
    s1Perf = (s1GoodTotal + s1ScrapPieces) / (hourlyRate1 * s1OperatingHours);
  }

  let s1Avail = 'N/A';
  const s1PlannedAvailableMin = 12 * 60 - s1PlanLossMin;
  if (s1PlannedAvailableMin > 0) {
    s1Avail = Math.max(0, (12 * 60 - s1DowntimeMin) / s1PlannedAvailableMin);
  }

  let s1Qual = 'N/A';
  if (stdUnitWeight > 0 && s1Avail !== 'N/A') {
    if (s1GoodTotal + s1ScrapPieces > 0) {
      s1Qual = s1GoodTotal / (s1GoodTotal + s1ScrapPieces);
    }
  }

  let s1OEE = 'N/A';
  if (s1Avail !== 'N/A' && s1Perf !== 'N/A' && s1Qual !== 'N/A') {
    s1OEE = s1Avail * s1Perf * s1Qual;
  }

  const s2DowntimeHours = s2DowntimeMin / 60;
  const s2ScrapPieces = stdUnitWeight > 0 ? s2ScrapKgTotal / stdUnitWeight : 0;
  const s2OperatingHours = Math.max(0, 12 - s2DowntimeHours);

  let s2Perf = 'N/A';
  if (hourlyRate2 > 0 && stdUnitWeight > 0 && s2OperatingHours > 0) {
    s2Perf = (s2GoodTotal + s2ScrapPieces) / (hourlyRate2 * s2OperatingHours);
  }

  let s2Avail = 'N/A';
  const s2PlannedAvailableMin = 12 * 60 - s2PlanLossMin;
  if (s2PlannedAvailableMin > 0) {
    s2Avail = Math.max(0, (12 * 60 - s2DowntimeMin) / s2PlannedAvailableMin);
  }

  let s2Qual = 'N/A';
  if (stdUnitWeight > 0 && s2Avail !== 'N/A') {
    if (s2GoodTotal + s2ScrapPieces > 0) {
      s2Qual = s2GoodTotal / (s2GoodTotal + s2ScrapPieces);
    }
  }

  let s2OEE = 'N/A';
  if (s2Avail !== 'N/A' && s2Perf !== 'N/A' && s2Qual !== 'N/A') {
    s2OEE = s2Avail * s2Perf * s2Qual;
  }

  const grandDowntimeHours = s1DowntimeHours + s2DowntimeHours;
  const grandGoodPcs = s1GoodTotal + s2GoodTotal;
  const grandScrapPieces = s1ScrapPieces + s2ScrapPieces;
  const grandOperatingHours = Math.max(0, 24 - grandDowntimeHours);

  let grandPerf = 'N/A';
  const avgHourlyRate = (hourlyRate1 + hourlyRate2) / 2;
  if (avgHourlyRate > 0 && stdUnitWeight > 0 && grandOperatingHours > 0) {
    grandPerf = (grandGoodPcs + grandScrapPieces) / (avgHourlyRate * grandOperatingHours);
  }

  let grandAvail = 'N/A';
  const grandPlanLossMin = s1PlanLossMin + s2PlanLossMin;
  const grandPlannedAvailableMin = 24 * 60 - grandPlanLossMin;
  if (grandPlannedAvailableMin > 0) {
    grandAvail = Math.max(0, (24 * 60 - (s1DowntimeMin + s2DowntimeMin)) / grandPlannedAvailableMin);
  }

  let grandQual = 'N/A';
  if (stdUnitWeight > 0 && grandAvail !== 'N/A') {
    if (grandGoodPcs + grandScrapPieces > 0) {
      grandQual = grandGoodPcs / (grandGoodPcs + grandScrapPieces);
    }
  }

  let grandOEE = 'N/A';
  if (grandAvail !== 'N/A' && grandPerf !== 'N/A' && grandQual !== 'N/A') {
    grandOEE = grandAvail * grandPerf * grandQual;
  }

  const setFormulaResult = (cellRef, computedResult) => {
    const cell = ws.getCell(cellRef);
    if (cell.formula) {
      cell.value = { formula: cell.formula, result: computedResult };
    }
  };

  setFormulaResult('H12', s1GoodTotal);
  setFormulaResult('G14', s1DowntimeHours);
  setFormulaResult('H16', s1ScrapKgTotal);
  setFormulaResult('I16', s1TargetAdj);
  setFormulaResult('H18', s1ScrapPieces);
  setFormulaResult('G20', s1Perf);
  setFormulaResult('H20', s1Avail);
  setFormulaResult('I20', s1Qual);
  setFormulaResult('H21', s1OEE);

  setFormulaResult('H23', s2GoodTotal);
  setFormulaResult('G25', s2DowntimeHours);
  setFormulaResult('H28', s2ScrapKgTotal);
  setFormulaResult('H30', s2ScrapPieces);
  setFormulaResult('G31', s2Perf);
  setFormulaResult('H31', s2Avail);
  setFormulaResult('I31', s2Qual);
  setFormulaResult('H32', s2OEE);

  setFormulaResult('G35', grandDowntimeHours);
  setFormulaResult('H35', grandGoodPcs);
  setFormulaResult('I35', grandScrapPieces);
  setFormulaResult('G36', grandPerf);
  setFormulaResult('H36', grandAvail);
  setFormulaResult('I36', grandQual);
  setFormulaResult('H37', grandOEE);

  return wb;
}

/**
 * Export single machine daily production & OEE report using KTS-350 SOP template (.xlsx)
 */
export async function exportSingleMachineTemplateExcel(report, derived, options = {}) {
  const { autoSave = true } = options;
  if (!report) {
    throw new Error('Report object is required for single machine template Excel export.');
  }

  const wb = await buildTemplateOeeWorkbook(report, derived, options);
  const filename = formatTemplateOeeFilename(
    report.header?.lineId || report.header?.lineCustom,
    report.header?.date
  );

  if (autoSave) {
    await saveExcelWorkbook(wb, filename);
  }

  return { success: true, workbook: wb, filename };
}

/**
 * Export all operating machines on target date as individual template-driven Excel workbooks (.xlsx).
 * Downloads an individual workbook for each active machine: OEE_[MachineID]_[YYYY-MM-DD].xlsx
 */
export async function exportAllMachinesTemplateExcel(records, selectedDate, machineMaster = MACHINES, options = {}) {
  const { autoSave = true, onProgress } = options;
  const targetRows = getOperatingRecordsForDate(records, selectedDate, machineMaster);
  if (targetRows.length === 0) {
    return { success: false, reason: 'no_records', count: 0 };
  }

  const results = [];
  for (let i = 0; i < targetRows.length; i += 1) {
    const row = targetRows[i];
    const rep = convertLogRowToReport(row);
    const der = buildAll(rep.slots, rep.refs, rep.summary?.startCounter, rep.engineering);
    const machineId = row.machineId || rep.header?.lineId || `Line_${i + 1}`;

    if (typeof onProgress === 'function') {
      onProgress(i + 1, targetRows.length, machineId);
    }

    const res = await exportSingleMachineTemplateExcel(rep, der, {
      ...options,
      autoSave,
      machineMaster
    });
    results.push(res);

    // Stagger downloads in browser to prevent browser popup blockers
    if (autoSave && typeof window !== 'undefined' && i < targetRows.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return {
    success: true,
    count: targetRows.length,
    results,
    filenames: results.map((r) => r.filename)
  };
}
