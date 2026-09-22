import * as XLSX from 'xlsx';
import { round1, buildAll } from './engine.js';
import { convertLogRowToReport } from './excelParser.js';
import {
  getOperatingRecordsForDate,
  getOperatingRecordsForDateRange,
  sanitizeFilenamePart
} from './batchZipExport.js';
import { buildSopModel } from './legacySopHelper.js';

/**
 * Format filename for single machine Excel report
 * e.g. Daily_Report_2026-09-19_L-05_KTS_350.xlsx
 */
export function formatExcelFilename(date, lineId, machineName) {
  const d = sanitizeFilenamePart(date, 'Date');
  const l = sanitizeFilenamePart(lineId, 'Line');
  const m = sanitizeFilenamePart(machineName, 'Machine');
  return `Daily_Report_${d}_${l}_${m}.xlsx`;
}

/**
 * Format filename for combined all machines Excel workbook
 * e.g. Daily_Reports_2026-09-19_All_Machines.xlsx
 */
export function formatAllMachinesExcelFilename(date) {
  const d = sanitizeFilenamePart(date, 'Date');
  return `Daily_Reports_${d}_All_Machines.xlsx`;
}

/**
 * Format filename for single machine SOP Excel report
 * e.g. SOP_Report_2026-09-19_L-05_KTS_350.xlsx or SOP_Report_2026-09-19_L-05.xlsx
 */
export function formatSopExcelFilename(date, lineId, machineName) {
  const d = sanitizeFilenamePart(date, 'Date');
  const l = sanitizeFilenamePart(lineId, 'Line');
  const m = machineName ? sanitizeFilenamePart(machineName, '') : '';
  return m ? `SOP_Report_${d}_${l}_${m}.xlsx` : `SOP_Report_${d}_${l}.xlsx`;
}

/**
 * Format filename for combined all machines SOP Excel workbook
 * e.g. SOP_Reports_2026-09-19_All_Operating_Machines.xlsx
 */
export function formatAllMachinesSopExcelFilename(date) {
  const d = sanitizeFilenamePart(date, 'Date');
  return `SOP_Reports_${d}_All_Operating_Machines.xlsx`;
}

/**
 * Sanitize Excel sheet name (max 31 chars, no forbidden characters: \ / ? * : [ ])
 */
export function sanitizeSheetName(name, fallback = 'Sheet1') {
  if (!name) return fallback;
  const cleaned = String(name)
    .replace(/[\\/?*:[\]]/g, '')
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

/**
 * Safe cross-environment workbook saver (Browser Blob trigger or Node fs write)
 */
export function saveWorkbook(wb, filename) {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
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
  } else if (typeof XLSX.writeFile === 'function') {
    XLSX.writeFile(wb, filename);
  }
}

/**
 * Build a formatted worksheet for a single machine's 24-hour report
 */
export function buildMachineReportSheet(report, derived) {
  const header = report.header || {};
  const refs = report.refs || {};
  const ref1 = refs['1'] || {};
  const ref2 = refs['2'] || {};
  const summary = report.summary || {};
  const der = derived || buildAll(report.slots || [], refs, summary.startCounter, report.engineering || {});
  const s1 = der.shift1Totals || {};
  const s2 = der.shift2Totals || {};
  const totals = der.grandTotals || {};

  const eng = der?.engineering || report.engineering || {};
  const nominalCapacity = Number(eng.nominalCapacityKgH || report.engineering?.nominalCapacityKgH || 0);

  let actualKgPerHour = Number(
    derived?.actualKgPerHour != null && Number(derived.actualKgPerHour) > 0
      ? derived.actualKgPerHour
      : derived?.engineering?.actualRateKgH != null && Number(derived.engineering.actualRateKgH) > 0
        ? derived.engineering.actualRateKgH
        : eng.actualRateKgH != null && Number(eng.actualRateKgH) > 0
          ? eng.actualRateKgH
          : report.engineering?.actualRateKgH || 0
  );

  if ((!actualKgPerHour || actualKgPerHour <= 0) && der?.operatingHours > 0) {
    const totalWeightKg = Number(eng.totalWeightKg || der?.engineering?.totalWeightKg || report.engineering?.totalWeightKg || 0)
      || Math.round((totals.actual || 0) * (Number(ref1.stdWeight) || 0));
    if (totalWeightKg > 0) {
      actualKgPerHour = round1(totalWeightKg / der.operatingHours);
    }
  }

  let capacityUtilization = Number(
    derived?.capacityUtilization != null && Number(derived.capacityUtilization) > 0
      ? derived.capacityUtilization
      : derived?.engineering?.capacityUtilizationPct != null && Number(derived.engineering.capacityUtilizationPct) > 0
        ? derived.engineering.capacityUtilizationPct
        : eng.capacityUtilizationPct != null && Number(eng.capacityUtilizationPct) > 0
          ? eng.capacityUtilizationPct
          : report.engineering?.capacityUtilizationPct || 0
  );

  if ((!capacityUtilization || capacityUtilization <= 0) && nominalCapacity > 0 && actualKgPerHour > 0) {
    capacityUtilization = round1((actualKgPerHour / nominalCapacity) * 100);
  }

  const aoa = [
    // 1. Plant & Document Header
    ['PVC PIPE EXTRUSION PLANT', '', '', '', '', '', ''],
    [`DAILY MONITORING REPORT (24 HRS) - ${header.lineId || ''} ${header.lineCustom || ''}`.trim(), '', '', '', '', '', ''],
    [
      `Date: ${header.date || ''}`,
      '',
      `Line: ${header.lineId || ''} - ${header.lineCustom || ''}`,
      '',
      `Plant: ${header.plantName || 'PVC PIPE EXTRUSION PLANT'}`,
      '',
      'Doc: Version 04 | Status: Standardized'
    ],
    // 2. Engineering Benchmark Strip
    [
      `Nominal Capacity: ${nominalCapacity} kg/h`,
      '',
      `Actual Output: ${actualKgPerHour.toFixed(1)} kg/h`,
      '',
      `Capacity Utilization: ${capacityUtilization.toFixed(1)}%`,
      '',
      `Operating Hours: ${der.operatingHours || 0} h`
    ],
    // 3. Product & Reference Specs
    [
      'Reference 1 Spec:',
      ref1.pipeSpec || 'PVC Pipe',
      `Class / PN: ${ref1.cls || '-'}`,
      `Speed: ${ref1.speed || '-'} m/min`,
      `Cut Time: ${ref1.cutTime || '-'} s`,
      `Target Rate: ${ref1.targetRate || '-'} pcs/h`,
      `Std Weight: ${ref1.stdWeight || '-'} kg`
    ],
    ...(ref2.pipeSpec
      ? [
          [
            'Reference 2 Spec:',
            ref2.pipeSpec || 'PVC Pipe',
            `Class / PN: ${ref2.cls || '-'}`,
            `Speed: ${ref2.speed || '-'} m/min`,
            `Cut Time: ${ref2.cutTime || '-'} s`,
            `Target Rate: ${ref2.targetRate || '-'} pcs/h`,
            `Std Weight: ${ref2.stdWeight || '-'} kg`
          ]
        ]
      : []),
    [], // Blank separator
    // 4. Production Table Headers (7 columns)
    [
      'Shift',
      'Hour Window',
      'Actual Output (Pcs)',
      'Target Output (Pcs)',
      'Downtime (min)',
      'PVC Extrusion Breakdown / Downtime Reason',
      'Scrap Pipes (Pcs)'
    ]
  ];

  // 5. Shift 1 Slots (0..11)
  (der.slots || []).filter((s) => s.shift === 1).forEach((s) => {
    aoa.push([
      `Shift ${s.shift}`,
      s.window,
      s.actual,
      s.target,
      s.downtime,
      s.reason || '',
      s.scrap
    ]);
  });

  // 6. Subtotal Shift 1
  aoa.push([
    'SUBTOTAL SHIFT 1 (06:30 - 18:30)',
    '',
    s1.actual ?? 0,
    s1.target ?? 0,
    s1.downtime ?? 0,
    '',
    s1.scrap ?? 0
  ]);

  // 7. Shift 2 Slots (12..23)
  (der.slots || []).filter((s) => s.shift === 2).forEach((s) => {
    aoa.push([
      `Shift ${s.shift}`,
      s.window,
      s.actual,
      s.target,
      s.downtime,
      s.reason || '',
      s.scrap
    ]);
  });

  // 8. Subtotal Shift 2
  aoa.push([
    'SUBTOTAL SHIFT 2 (18:30 - 06:30)',
    '',
    s2.actual ?? 0,
    s2.target ?? 0,
    s2.downtime ?? 0,
    '',
    s2.scrap ?? 0
  ]);

  // 9. Grand Total (24 Hours)
  aoa.push([
    'GRAND TOTAL (24 HOURS)',
    '',
    totals.actual ?? 0,
    totals.target ?? 0,
    totals.downtime ?? 0,
    '',
    totals.scrap ?? 0
  ]);

  aoa.push([]); // Blank separator

  // 10. OEE & Performance Summary
  aoa.push(['DAILY OEE & PERFORMANCE SUMMARY', '', '', '', '', '', '']);
  aoa.push([
    'Operating Hours (h)',
    'Total Downtime (h)',
    'Availability Rate % (A)',
    'Performance Rate % (P)',
    'Quality Rate % (Q)',
    'Overall OEE % (A × P × Q)',
    ''
  ]);
  aoa.push([
    der.operatingHours != null ? Number(der.operatingHours.toFixed(1)) : 0,
    der.totalDowntimeHours != null ? Number(der.totalDowntimeHours.toFixed(1)) : 0,
    der.aStr || '',
    der.pStr || '',
    der.qStr || '',
    der.oeeStr || '',
    ''
  ]);
  aoa.push([
    `Formula: ${der.formulaStr || ''}`,
    '',
    '',
    '',
    '',
    '',
    ''
  ]);

  aoa.push([]); // Blank separator

  // 11. Sign-off Block
  aoa.push([
    `Shift 1 Lead: ${summary.shift1Lead || ''}`,
    '',
    `Shift 2 Lead: ${summary.shift2Lead || ''}`,
    '',
    `Plant Production Manager: ${summary.plantManager || ''}`,
    '',
    ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Formatting column widths (7 columns)
  ws['!cols'] = [
    { wch: 18 }, // Shift / Labels
    { wch: 22 }, // Window / Values
    { wch: 22 }, // Actual Output
    { wch: 22 }, // Target Output
    { wch: 16 }, // Downtime
    { wch: 50 }, // Reason
    { wch: 20 }  // Scrap
  ];

  return ws;
}

/**
 * Build consolidated multi-machine summary sheet
 */
export function buildAllMachinesSummarySheet(targetRows, selectedDate) {
  const aoa = [
    ['PVC PIPE EXTRUSION PLANT - DAILY MULTI-MACHINE PRODUCTION SUMMARY', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    [`Production Date: ${selectedDate}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    [],
    [
      'Line ID',
      'Machine Name',
      'Item Code',
      'Product Description',
      'Nominal Cap (kg/h)',
      'Actual Rate (kg/h)',
      'Capacity Utilization',
      'Operating Hours (h)',
      'Downtime (h)',
      'Target Output (Pcs)',
      'Actual Output (Pcs)',
      'Scrap Pipes (Pcs)',
      'Purge Scrap (kg)',
      'Availability %',
      'Performance %',
      'Quality %',
      'Overall OEE %'
    ]
  ];

  let sumOpHours = 0;
  let sumDtHours = 0;
  let sumTarget = 0;
  let sumActual = 0;
  let sumScrap = 0;
  let sumPurge = 0;
  let sumWeight = 0;

  targetRows.forEach((row) => {
    const rep = convertLogRowToReport(row);
    const der = buildAll(rep.slots, rep.refs, rep.summary?.startCounter, rep.engineering);
    const eng = der.engineering || rep.engineering || {};
    const totals = der.grandTotals || {};

    const opH = der.operatingHours || 0;
    const dtH = der.totalDowntimeHours || 0;
    const act = totals.actual || 0;
    const tgt = totals.target || 0;
    const scr = totals.scrap || 0;
    const prg = totals.purge || 0;

    sumOpHours += opH;
    sumDtHours += dtH;
    sumTarget += tgt;
    sumActual += act;
    sumScrap += scr;
    sumPurge += prg;
    sumWeight += Number(row.totalWeight) || (act * (Number(row.unitWeight) || 0));

    const nomCap = Number(eng.nominalCapacityKgH || 0);
    const actRate = Number(eng.actualRateKgH || 0);
    const capUtil = Number(eng.capacityUtilizationPct || 0);

    aoa.push([
      rep.header?.lineId || row.machineId || '',
      rep.header?.lineCustom || row.machineName || '',
      row.itemCode || '',
      row.description || '',
      nomCap,
      actRate,
      `${capUtil.toFixed(1)}%`,
      opH,
      dtH,
      tgt,
      act,
      scr,
      prg,
      der.aStr || '',
      der.pStr || '',
      der.qStr || '',
      der.oeeStr || ''
    ]);
  });

  // Calculate Plant Overall Metrics
  const lineCount = targetRows.length;
  const plantAvailability = lineCount > 0 ? ((sumOpHours / (lineCount * 24)) * 100).toFixed(1) + '%' : '0.0%';
  const plantPerformance = sumTarget > 0 ? ((sumActual / sumTarget) * 100).toFixed(1) + '%' : '0.0%';
  const plantQuality = sumActual > 0 ? (((sumActual - sumScrap) / sumActual) * 100).toFixed(1) + '%' : '0.0%';
  const plantOeeVal = (sumTarget > 0 && lineCount > 0 && sumActual > 0)
    ? (((sumOpHours / (lineCount * 24)) * (sumActual / sumTarget) * ((sumActual - sumScrap) / sumActual)) * 100).toFixed(1) + '%'
    : '0.0%';

  aoa.push([]);
  aoa.push([
    'PLANT TOTALS & AVERAGES',
    `${lineCount} Active Lines`,
    '',
    '',
    '',
    sumOpHours > 0 ? Math.round(sumWeight / sumOpHours) : 0,
    '',
    round1(sumOpHours),
    round1(sumDtHours),
    round1(sumTarget),
    round1(sumActual),
    round1(sumScrap),
    round1(sumPurge),
    plantAvailability,
    plantPerformance,
    plantQuality,
    plantOeeVal
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 12 }, // Line ID
    { wch: 18 }, // Machine Name
    { wch: 12 }, // Item Code
    { wch: 36 }, // Product Description
    { wch: 18 }, // Nominal Cap
    { wch: 18 }, // Actual Rate
    { wch: 20 }, // Capacity Utilization
    { wch: 18 }, // Operating Hours
    { wch: 16 }, // Downtime
    { wch: 18 }, // Target Output
    { wch: 18 }, // Actual Output
    { wch: 16 }, // Scrap
    { wch: 16 }, // Purge
    { wch: 15 }, // Availability
    { wch: 15 }, // Performance
    { wch: 15 }, // Quality
    { wch: 16 }  // Overall OEE
  ];

  return ws;
}

/**
 * Export single machine report to Excel (.xlsx)
 */
export function exportSingleMachineToExcel(report, derived, options = {}) {
  const { autoSave = true } = options;
  if (!report) {
    throw new Error('Report object is required for single machine export.');
  }

  const wb = XLSX.utils.book_new();
  const ws = buildMachineReportSheet(report, derived);
  const sheetName = sanitizeSheetName(report.header?.lineId || 'Report');
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const filename = formatExcelFilename(
    report.header?.date,
    report.header?.lineId,
    report.header?.lineCustom
  );

  if (autoSave) {
    saveWorkbook(wb, filename);
  }

  return { success: true, workbook: wb, filename };
}

/**
 * Export all operating machines on target date to a combined Excel workbook (.xlsx)
 */
export function exportAllMachinesToExcel(records, selectedDate, machineMaster, options = {}) {
  const { autoSave = true } = options;
  const targetRows = getOperatingRecordsForDate(records, selectedDate);
  if (targetRows.length === 0) {
    return { success: false, reason: 'no_records', count: 0 };
  }

  const wb = XLSX.utils.book_new();

  // 1. Add Consolidated Plant Summary Sheet
  const summaryWs = buildAllMachinesSummarySheet(targetRows, selectedDate);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Plant_Summary');

  // 2. Add Individual 24-Hour Sheets for Each Operating Line
  const usedSheetNames = new Set(['plant_summary']);
  targetRows.forEach((row, idx) => {
    const rep = convertLogRowToReport(row);
    const der = buildAll(rep.slots, rep.refs, rep.summary?.startCounter, rep.engineering);
    const ws = buildMachineReportSheet(rep, der);

    const baseName = sanitizeSheetName(rep.header?.lineId || `Line_${idx + 1}`);
    let candidateName = baseName;
    let counter = 2;
    while (usedSheetNames.has(candidateName.toLowerCase())) {
      candidateName = sanitizeSheetName(`${baseName}_${counter}`);
      counter += 1;
    }
    usedSheetNames.add(candidateName.toLowerCase());

    XLSX.utils.book_append_sheet(wb, ws, candidateName);
  });

  const filename = formatAllMachinesExcelFilename(selectedDate);

  if (autoSave) {
    saveWorkbook(wb, filename);
  }

  return { success: true, workbook: wb, filename, count: targetRows.length };
}

/**
 * Build a formatted worksheet for Legacy Plant SOP (DOC-Ext.-03: PRODUCTION PIECES / Production follow)
 */
export function buildLegacySopExcelSheet(report, derived, options = {}) {
  const model = buildSopModel(report, derived, options);

  const aoa = [
    // Row 1 (index 0): Doc Header
    [
      model.docCode,
      '',
      'DOCUMENT IN POST',
      '',
      '',
      '',
      'N° VERSION',
      model.version,
      ''
    ],
    // Row 2 (index 1): Brand & Title & Date
    [
      model.plantName,
      '',
      'Production follow',
      '',
      '',
      '',
      'Date',
      model.dateSpaces,
      ''
    ],
    // Row 3 (index 2): Line No. & Title
    [
      '',
      'Line No.',
      model.fullMachineName || model.lineId,
      'PRODUCTION PIECES',
      '',
      '',
      '', '', ''
    ],
    // Row 4 (index 3): Item Description
    [
      '', '', '',
      model.productDescription,
      '', '', '', '', ''
    ],
    // Row 5 (index 4): Reference specs & Date
    [
      '', '', '',
      '1st reference',
      '2nd reference',
      '',
      'DATE',
      model.dateDots,
      ''
    ],
    // Row 6 (index 5): Reference Speed Values
    [
      '', '', '',
      `${model.speed1} M/Min`,
      `${model.speed2} M/Min`,
      '', '', '', ''
    ],
    // Row 7 (index 6): Table Column Headers
    [
      'Hour',
      'Standard Prod. (Pcs)',
      'Good Prod. (Pcs)',
      'Cause of Stop / Remarks',
      'Stop Time (Min)',
      'Reject Production (KG)',
      'General Data of Production',
      '',
      ''
    ]
  ];

  const shift1StartRow = aoa.length;

  // Shift 1 Rows (09:00 - 20:00, 12 hours)
  model.shift1Rows.forEach((r, i) => {
    let sideLbl = '';
    let sideVal = '';
    let sideExtra = '';

    if (i === 0) {
      sideLbl = 'Total Good Production (Pcs)';
    } else if (i === 2) {
      sideLbl = 'Ref 1:';
      sideVal = model.s1TotalGoodPcs > 0 ? model.s1TotalGoodPcs : (model.s1TotalGoodM > 0 ? model.s1TotalGoodM : '');
    } else if (i === 3) {
      sideLbl = 'Ref 2:';
    } else if (i === 5) {
      sideLbl = 'Total Rejection';
    } else if (i === 7) {
      sideLbl = 'Ref 1:';
      sideVal = model.s1TotalScrapKg > 0 ? model.s1TotalScrapKg : '';
    } else if (i === 8) {
      sideLbl = 'Ref 2:';
    } else if (i === 9) {
      sideLbl = 'Scrap:';
      sideVal = model.s1TotalScrapKg > 0 ? model.s1TotalScrapKg : '';
    }

    aoa.push([
      r.hour,
      r.stdPcs !== undefined ? r.stdPcs : r.stdM,
      r.goodPcs !== '' && r.goodPcs !== undefined ? r.goodPcs : (r.goodM !== '' ? r.goodM : ''),
      r.cause || '',
      r.downtime !== '' && r.downtime !== undefined ? r.downtime : 0,
      r.rejectKg !== '' ? r.rejectKg : '',
      sideLbl,
      sideVal,
      sideExtra
    ]);
  });

  const s1Downtime = model.shift1Rows.reduce((acc, r) => acc + (Number(r.downtime) || 0), 0);
  const s1StdTotal = model.shift1Rows.reduce((acc, r) => acc + (Number(r.stdPcs !== undefined ? r.stdPcs : r.stdM) || 0), 0);

  // Shift 1 Subtotal Row
  aoa.push([
    'Shift 1 Subtotal',
    s1StdTotal || model.shift1Rows[11]?.stdPcs || model.shift1Rows[11]?.stdM || '',
    model.s1TotalGoodPcs !== '' && model.s1TotalGoodPcs !== undefined ? model.s1TotalGoodPcs : model.s1TotalGoodM,
    '',
    s1Downtime,
    model.s1TotalScrapKg,
    '', '', ''
  ]);

  const shift2StartRow = aoa.length;

  // Shift 2 Data Rows (Row 23 to 34 in sheet)
  model.shift2Rows.forEach((r, idx) => {
    let sideLbl = '';
    let sideVal = '';
    let sideExtra = '';

    if (idx === 0) {
      sideLbl = 'Total Good Production (Pcs)';
    } else if (idx === 1) {
      sideLbl = 'Ref 1:';
      sideVal = model.s2TotalGoodPcs > 0 ? model.s2TotalGoodPcs : (model.s2TotalGoodM > 0 ? model.s2TotalGoodM : '');
    } else if (idx === 2) {
      sideLbl = 'Ref 2:';
    } else if (idx === 4) {
      sideLbl = 'Total Rejection';
    } else if (idx === 6) {
      sideLbl = 'Ref 1:';
    } else if (idx === 7) {
      sideLbl = 'Ref 2:';
    } else if (idx === 8) {
      sideLbl = 'Scrap:';
      sideVal = model.s2TotalScrapKg > 0 ? model.s2TotalScrapKg : '';
    }

    aoa.push([
      r.hour,
      r.stdPcs !== undefined ? r.stdPcs : r.stdM,
      r.goodPcs !== '' && r.goodPcs !== undefined ? r.goodPcs : (r.goodM !== '' ? r.goodM : ''),
      r.cause || '',
      r.downtime !== '' && r.downtime !== undefined ? r.downtime : 0,
      r.rejectKg !== '' ? r.rejectKg : '',
      sideLbl,
      sideVal,
      sideExtra
    ]);
  });

  const s2Downtime = model.shift2Rows.reduce((acc, r) => acc + (Number(r.downtime) || 0), 0);
  const s2StdTotal = model.shift2Rows.reduce((acc, r) => acc + (Number(r.stdPcs !== undefined ? r.stdPcs : r.stdM) || 0), 0);

  // Shift 2 Subtotal Row
  aoa.push([
    'Shift 2 Subtotal',
    s2StdTotal || model.shift2Rows[11]?.stdPcs || model.shift2Rows[11]?.stdM || '',
    model.s2TotalGoodPcs !== '' && model.s2TotalGoodPcs !== undefined ? model.s2TotalGoodPcs : model.s2TotalGoodM,
    '',
    s2Downtime,
    model.s2TotalScrapKg,
    '', '', ''
  ]);

  // Grand Total (24 Hours)
  aoa.push([
    'GRAND TOTAL (24 HOURS)',
    s1StdTotal + s2StdTotal,
    ((model.s1TotalGoodPcs !== '' && model.s1TotalGoodPcs !== undefined) || (model.s2TotalGoodPcs !== '' && model.s2TotalGoodPcs !== undefined))
      ? (Number(model.s1TotalGoodPcs || model.s1TotalGoodM) || 0) + (Number(model.s2TotalGoodPcs || model.s2TotalGoodM) || 0)
      : '',
    '',
    s1Downtime + s2Downtime,
    model.s1TotalScrapKg + model.s2TotalScrapKg,
    '', '', ''
  ]);

  aoa.push([]); // Blank row before signatures

  const sigTitleRow = aoa.length;
  aoa.push([
    'Day Shift Supervisor', '', '', '',
    'Night Shift Supervisor', '', '', '', ''
  ]);

  const sigValRow = aoa.length;
  aoa.push([
    model.shift1Lead ? `Lead: ${model.shift1Lead}` : '______________________',
    '', '', '',
    model.shift2Lead ? `Lead: ${model.shift2Lead}` : '______________________',
    '', '', '', ''
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Configure column widths
  ws['!cols'] = [
    { wch: 8 },  // Hour
    { wch: 18 }, // Standard Prod. (Pcs)
    { wch: 18 }, // Good Prod. (Pcs)
    { wch: 28 }, // Cause of Stop / Remarks
    { wch: 16 }, // Stop Time (Min)
    { wch: 20 }, // Reject Production (KG)
    { wch: 16 }, // Side Card Label
    { wch: 16 }, // Side Card Value
    { wch: 10 }  // Side Card Extra
  ];

  // Configure cell merges
  ws['!merges'] = [
    // Header Row 1: DOC-Ext.-03 (A1:B1), DOCUMENT IN POST (C1:F1), Version (H1:I1)
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 0, c: 5 } },
    { s: { r: 0, c: 7 }, e: { r: 0, c: 8 } },
    // Header Row 2: Date of Creation (H2:I2)
    { s: { r: 1, c: 7 }, e: { r: 1, c: 8 } },
    // Header Row 3: Plant Name (A3:B3), Title (C3:F3), Date (H3:I3)
    { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
    { s: { r: 2, c: 2 }, e: { r: 2, c: 5 } },
    { s: { r: 2, c: 7 }, e: { r: 2, c: 8 } },
    // Header Row 4: PRODUCTION PIECES (D4:F4)
    { s: { r: 3, c: 3 }, e: { r: 3, c: 5 } },
    // Header Row 5: Product Description (D5:F5)
    { s: { r: 4, c: 3 }, e: { r: 4, c: 5 } },
    // Header Row 6: 2nd Ref (E6:F6), Date (H6:I6)
    { s: { r: 5, c: 4 }, e: { r: 5, c: 5 } },
    { s: { r: 5, c: 7 }, e: { r: 5, c: 8 } },
    // Header Row 7: Speed 2 (E7:F7)
    { s: { r: 6, c: 4 }, e: { r: 6, c: 5 } },
    // Header Row 8: General Data Header (G8:I8)
    { s: { r: 7, c: 6 }, e: { r: 7, c: 8 } },
    // Shift 1 Side Block Header Merges
    { s: { r: shift1StartRow, c: 6 }, e: { r: shift1StartRow, c: 8 } },
    { s: { r: shift1StartRow + 5, c: 6 }, e: { r: shift1StartRow + 5, c: 8 } },
    // Shift 2 Side Block Header Merges
    { s: { r: shift2StartRow, c: 6 }, e: { r: shift2StartRow, c: 8 } },
    { s: { r: shift2StartRow + 4, c: 6 }, e: { r: shift2StartRow + 4, c: 8 } },
    // Supervisor Signatures
    { s: { r: sigTitleRow, c: 0 }, e: { r: sigTitleRow, c: 3 } },
    { s: { r: sigTitleRow, c: 4 }, e: { r: sigTitleRow, c: 8 } },
    { s: { r: sigValRow, c: 0 }, e: { r: sigValRow, c: 3 } },
    { s: { r: sigValRow, c: 4 }, e: { r: sigValRow, c: 8 } }
  ];

  return ws;
}

/**
 * Export single machine Legacy SOP (DOC-Ext.-03) report to Excel (.xlsx)
 */
export function exportSingleMachineSopToExcel(report, derived, options = {}) {
  const { autoSave = true } = options;
  if (!report) {
    throw new Error('Report object is required for single machine SOP export.');
  }

  const wb = XLSX.utils.book_new();
  const ws = buildLegacySopExcelSheet(report, derived, options);
  const sheetName = sanitizeSheetName(report.header?.lineId || 'SOP_Report');
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const filename = formatSopExcelFilename(
    report.header?.date,
    report.header?.lineId,
    report.header?.lineCustom
  );

  if (autoSave) {
    saveWorkbook(wb, filename);
  }

  return { success: true, workbook: wb, filename };
}

/**
 * Export all operating machines on target date to a combined Legacy SOP Excel workbook (.xlsx)
 */
export function exportAllMachinesSopToExcel(records, selectedDate, machineMaster, options = {}) {
  const { autoSave = true } = options;
  const targetRows = getOperatingRecordsForDate(records, selectedDate);
  if (targetRows.length === 0) {
    return { success: false, reason: 'no_records', count: 0 };
  }

  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set();

  targetRows.forEach((row, idx) => {
    const rep = convertLogRowToReport(row);
    const der = buildAll(rep.slots, rep.refs, rep.summary?.startCounter, rep.engineering);
    const ws = buildLegacySopExcelSheet(rep, der);

    const baseName = sanitizeSheetName(rep.header?.lineId || `Line_${idx + 1}`);
    let candidateName = baseName;
    let counter = 2;
    while (usedSheetNames.has(candidateName.toLowerCase())) {
      candidateName = sanitizeSheetName(`${baseName}_${counter}`);
      counter += 1;
    }
    usedSheetNames.add(candidateName.toLowerCase());

    XLSX.utils.book_append_sheet(wb, ws, candidateName);
  });

  const filename = formatAllMachinesSopExcelFilename(selectedDate);

  if (autoSave) {
    saveWorkbook(wb, filename);
  }

  return { success: true, workbook: wb, filename, count: targetRows.length };
}

/**
 * Format filename for combined date range Excel workbook
 * e.g. Daily_Reports_2026-09-07_to_2026-09-17_All_Machines.xlsx
 */
export function formatRangeExcelFilename(fromDate, toDate) {
  const d1 = sanitizeFilenamePart(fromDate, 'From');
  const d2 = sanitizeFilenamePart(toDate, 'To');
  return `Daily_Reports_${d1}_to_${d2}_All_Machines.xlsx`;
}

/**
 * Format filename for combined date range SOP Excel workbook
 * e.g. SOP_Reports_2026-09-07_to_2026-09-17_All_Machines.xlsx
 */
export function formatRangeSopExcelFilename(fromDate, toDate) {
  const d1 = sanitizeFilenamePart(fromDate, 'From');
  const d2 = sanitizeFilenamePart(toDate, 'To');
  return `SOP_Reports_${d1}_to_${d2}_All_Machines.xlsx`;
}

/**
 * Export all operating machines in a date range to a combined Excel workbook (.xlsx)
 */
export function exportDateRangeToExcel(records, fromDate, toDate, machineMaster, options = {}) {
  const { autoSave = true } = options;
  const targetRows = getOperatingRecordsForDateRange(records, fromDate, toDate);
  if (targetRows.length === 0) {
    return { success: false, reason: 'no_records', count: 0 };
  }

  const wb = XLSX.utils.book_new();

  // 1. Add Consolidated Plant Summary Sheet for the Range
  const rangeLabel = `${fromDate} to ${toDate}`;
  const summaryWs = buildAllMachinesSummarySheet(targetRows, rangeLabel);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Plant_Summary');

  // 2. Add Individual 24-Hour Sheets for Each Operating Line and Date
  const usedSheetNames = new Set(['plant_summary']);
  targetRows.forEach((row, idx) => {
    const rep = convertLogRowToReport(row);
    const der = buildAll(rep.slots, rep.refs, rep.summary?.startCounter, rep.engineering);
    const ws = buildMachineReportSheet(rep, der);

    const shortDate = String(row.date || '').slice(5);
    const lineId = rep.header?.lineId || `L${idx + 1}`;
    const baseName = sanitizeSheetName(shortDate ? `${shortDate}_${lineId}` : lineId);
    let candidateName = baseName;
    let counter = 2;
    while (usedSheetNames.has(candidateName.toLowerCase())) {
      candidateName = sanitizeSheetName(`${baseName}_${counter}`);
      counter += 1;
    }
    usedSheetNames.add(candidateName.toLowerCase());

    XLSX.utils.book_append_sheet(wb, ws, candidateName);
  });

  const filename = formatRangeExcelFilename(fromDate, toDate);

  if (autoSave) {
    saveWorkbook(wb, filename);
  }

  return { success: true, workbook: wb, filename, count: targetRows.length };
}

/**
 * Export all operating machines in a date range to a combined Legacy SOP Excel workbook (.xlsx)
 */
export function exportDateRangeSopToExcel(records, fromDate, toDate, machineMaster, options = {}) {
  const { autoSave = true } = options;
  const targetRows = getOperatingRecordsForDateRange(records, fromDate, toDate);
  if (targetRows.length === 0) {
    return { success: false, reason: 'no_records', count: 0 };
  }

  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set();

  targetRows.forEach((row, idx) => {
    const rep = convertLogRowToReport(row);
    const der = buildAll(rep.slots, rep.refs, rep.summary?.startCounter, rep.engineering);
    const ws = buildLegacySopExcelSheet(rep, der);

    const shortDate = String(row.date || '').slice(5);
    const lineId = rep.header?.lineId || `L${idx + 1}`;
    const baseName = sanitizeSheetName(shortDate ? `${shortDate}_${lineId}` : lineId);
    let candidateName = baseName;
    let counter = 2;
    while (usedSheetNames.has(candidateName.toLowerCase())) {
      candidateName = sanitizeSheetName(`${baseName}_${counter}`);
      counter += 1;
    }
    usedSheetNames.add(candidateName.toLowerCase());

    XLSX.utils.book_append_sheet(wb, ws, candidateName);
  });

  const filename = formatRangeSopExcelFilename(fromDate, toDate);

  if (autoSave) {
    saveWorkbook(wb, filename);
  }

  return { success: true, workbook: wb, filename, count: targetRows.length };
}
