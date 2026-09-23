import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  Printer,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Database,
  Cpu,
  Layers,
  HardDrive,
  FileText,
  Calendar,
  Filter,
  Calculator,
  ArrowRight,
  HelpCircle,
  Sliders,
  Share2,
  FolderDown,
  Gauge
} from 'lucide-react';
import { parseSheetToJsonWithDynamicHeader } from '../../utils/dataCleaner.js';
import {
  generateDailyProductionLogTemplate,
  generateErpImportTemplate,
  generateCalculationGuideWorkbook
} from '../../utils/templateGenerator.js';
import { SAMPLE_PRODUCTION_DATA } from '../../data/sampleData.js';
import { SAMPLE_HISTORICAL_ERP_DATA } from '../../data/sampleHistoricalErpData.js';
import { MASTER_MACHINE_PROFILES, MACHINES } from '../../config/machines.js';
import {
  exportDateRangeToExcel,
  exportAllMachinesToExcel,
  exportSingleMachineToExcel
} from '../../logic/excelExport.js';
import {
  loadPersistedRecords,
  savePersistedRecords,
  clearPersistedRecords
} from '../../data/store.js';

export default function DataExchangeCenter({
  lang = 'en',
  theme = 'dark',
  rawRows = [],
  setRawRows,
  historicalRawRows = [],
  setHistoricalRawRows,
  currentSheetName = 'Daily Production Log',
  setCurrentSheetName,
  cleanedRows = [],
  masterRuns = [],
  uniquePlanningMatrix = [],
  analytics = null,
  dailyEvalRef = null,
  onOpenBlankSopPrint,
  onExportMasterPlan,
  onExportUniqueCatalog,
  onExportCleanLog,
  onClearAllData,
  onNotify
}) {
  const isLight = theme === 'light';
  const notify = (msg) => {
    if (onNotify) onNotify(msg);
  };

  // --- Upload State: Daily Production Log ---
  const [dailyDragging, setDailyDragging] = useState(false);
  const [dailyFileName, setDailyFileName] = useState('');
  const [dailySheetNames, setDailySheetNames] = useState([]);
  const [selectedDailySheet, setSelectedDailySheet] = useState(currentSheetName);
  const [dailyWbRef, setDailyWbRef] = useState(null);
  const [dailyError, setDailyError] = useState('');
  const dailyFileInputRef = useRef(null);

  // --- Upload State: Historical ERP Log ---
  const [erpDragging, setErpDragging] = useState(false);
  const [erpFileName, setErpFileName] = useState('');
  const [erpError, setErpError] = useState('');
  const erpFileInputRef = useRef(null);

  // --- Print & Export Controls State ---
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedPrintDate, setSelectedPrintDate] = useState(todayStr);
  const [selectedMachineLine, setSelectedMachineLine] = useState('ALL');
  const [rangeStartDate, setRangeStartDate] = useState(todayStr);
  const [rangeEndDate, setRangeEndDate] = useState(todayStr);

  // --- Interactive Calculation Sandbox State ---
  const [calcSpeed, setCalcSpeed] = useState(2.4); // m/min
  const [calcLength, setCalcLength] = useState(6.0); // meters
  const [calcOd, setCalcOd] = useState(110); // mm
  const [calcWt, setCalcWt] = useState(4.2); // mm
  const [calcHours, setCalcHours] = useState(12); // hours

  // Live Calculation Output
  const calcOutput = useMemo(() => {
    const speed = Number(calcSpeed) || 0;
    const length = Number(calcLength) || 6.0;
    const od = Number(calcOd) || 0;
    const wt = Number(calcWt) || 0;
    const hours = Number(calcHours) || 0;

    const cutTimeSec = speed > 0 && length > 0 ? (length / speed) * 60 : 0;
    const targetPcsPerHour = cutTimeSec > 0 ? 3600 / cutTimeSec : 0;
    const shiftStandardPcs = targetPcsPerHour * hours;

    // Rigid PVC Density ~ 1.43 g/cm3
    const density = 1.43;
    const meanDiameter = od > wt ? od - wt : 0;
    const theoreticalWeightPerMeter = meanDiameter > 0 && wt > 0
      ? (Math.PI * meanDiameter * wt * density) / 1000
      : 0;
    const theoreticalWeightPerPipe = theoreticalWeightPerMeter * length;
    const massRateKgPerHour = targetPcsPerHour * theoreticalWeightPerPipe;
    const shiftTotalWeightKg = massRateKgPerHour * hours;

    // Recommend candidate machine based on OD
    const candidate = MASTER_MACHINE_PROFILES.find(
      (m) => !m.isPelletizingLine && m.minDiameter <= od && od <= m.maxDiameter
    );

    const loadingRatio = candidate && candidate.nominalCapacity > 0
      ? (massRateKgPerHour / candidate.nominalCapacity) * 100
      : 0;

    return {
      cutTimeSec: cutTimeSec.toFixed(1),
      targetPcsPerHour: Math.round(targetPcsPerHour),
      shiftStandardPcs: Math.round(shiftStandardPcs),
      weightPerMeter: theoreticalWeightPerMeter.toFixed(3),
      weightPerPipe: theoreticalWeightPerPipe.toFixed(3),
      massRateKgPerHour: massRateKgPerHour.toFixed(1),
      shiftTotalWeightKg: Math.round(shiftTotalWeightKg),
      recommendedMachine: candidate ? candidate.name : 'Custom / Unassigned',
      nominalCapacity: candidate ? candidate.nominalCapacity : 300,
      loadingRatio: loadingRatio.toFixed(1),
      loadingStatus:
        loadingRatio >= 65 && loadingRatio <= 95
          ? 'Optimal Sizing (65% - 95%)'
          : loadingRatio > 95
          ? 'High Load / Over nominal'
          : 'Derated / Under-loaded'
    };
  }, [calcSpeed, calcLength, calcOd, calcWt, calcHours]);

  // --- Handlers: Upload Daily Production Log ---
  const handleDailyFile = async (file) => {
    if (!file) return;
    setDailyError('');
    setDailyFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { cellDates: true, cellNF: false, cellText: false });
      setDailyWbRef(wb);
      setDailySheetNames(wb.SheetNames);

      const targetSheet =
        wb.SheetNames.find((s) => /daily|production|follow|sop|log/i.test(s)) ||
        wb.SheetNames[0];

      setSelectedDailySheet(targetSheet);
      extractDailySheet(wb, targetSheet, file.name);
    } catch (err) {
      console.error(err);
      setDailyError('Failed to parse production log workbook.');
      notify('Failed to parse production log file.');
    }
  };

  const extractDailySheet = (wb, sheetName, fileName = dailyFileName) => {
    try {
      const ws = wb.Sheets[sheetName];
      const jsonData = parseSheetToJsonWithDynamicHeader(ws, XLSX);
      if (!jsonData || jsonData.length === 0) {
        setDailyError(`Sheet "${sheetName}" contains no readable data rows.`);
        return;
      }
      setRawRows(jsonData);
      if (setCurrentSheetName) setCurrentSheetName(sheetName);
      notify(`Loaded ${jsonData.length} production rows from "${sheetName}"`);
    } catch (err) {
      console.error(err);
      setDailyError('Failed to extract rows from sheet.');
    }
  };

  const handleDailySheetChange = (e) => {
    const s = e.target.value;
    setSelectedDailySheet(s);
    if (dailyWbRef) extractDailySheet(dailyWbRef, s);
  };

  // --- Handlers: Upload Historical ERP Data ---
  const handleErpFile = async (file) => {
    if (!file) return;
    setErpError('');
    setErpFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { cellDates: true, cellNF: false, cellText: false });
      const targetSheet =
        wb.SheetNames.find((s) => /erp|pipes|daily|receipts|history|log/i.test(s)) ||
        wb.SheetNames[0];

      const ws = wb.Sheets[targetSheet];
      const jsonData = parseSheetToJsonWithDynamicHeader(ws, XLSX);
      if (!jsonData || jsonData.length === 0) {
        setErpError('ERP file contains no recognizable data rows.');
        return;
      }
      setHistoricalRawRows(jsonData);
      notify(`Loaded ${jsonData.length} historical ERP runs from "${targetSheet}"`);
    } catch (err) {
      console.error(err);
      setErpError('Failed to parse historical ERP file.');
      notify('Error parsing ERP workbook.');
    }
  };

  // --- Sample Ingestion Actions ---
  const handleLoadDailySample = () => {
    setRawRows(SAMPLE_PRODUCTION_DATA);
    setDailyFileName('Screenshot_Sample_59_Runs.xlsx');
    if (setCurrentSheetName) setCurrentSheetName('Daily Production Log');
    notify('Loaded benchmark factory production sample (59 active runs)');
  };

  const handleLoadErpSample = () => {
    setHistoricalRawRows(SAMPLE_HISTORICAL_ERP_DATA);
    setErpFileName('Historical_ERP_Sample_15_Runs.xlsx');
    notify('Loaded 15 historical ERP runs for machine inference');
  };

  // --- Template Downloads ---
  const handleDownloadDailyTemplate = () => {
    const wb = generateDailyProductionLogTemplate();
    XLSX.writeFile(wb, 'Daily_Production_Log_Template.xlsx');
    notify('Downloaded Daily Production Log Excel Template');
  };

  const handleDownloadErpTemplate = () => {
    const wb = generateErpImportTemplate();
    XLSX.writeFile(wb, 'ERP_Import_Formatting_Template.xlsx');
    notify('Downloaded ERP Formatting Template');
  };

  const handleDownloadCalcGuide = () => {
    const wb = generateCalculationGuideWorkbook();
    XLSX.writeFile(wb, 'PVC_Engineering_Formulas_Guide.xlsx');
    notify('Downloaded Engineering Formulas Guide');
  };

  // --- Shift SOP & Inspection Printing Actions ---
  const handleTriggerBlankSopPrint = () => {
    if (onOpenBlankSopPrint) {
      onOpenBlankSopPrint();
    } else if (dailyEvalRef?.current?.openBlankSopPrint) {
      dailyEvalRef.current.openBlankSopPrint();
    } else {
      notify('Opening Morning SOP print generator...');
      window.print();
    }
  };

  const handleQuickPrintOperationalSummary = () => {
    notify('Opening operational print dialog...');
    window.print();
  };

  // --- Data Exports & Backups ---
  const handleExportCurrentLine = () => {
    if (dailyEvalRef?.current?.exportSingleExcel) {
      dailyEvalRef.current.exportSingleExcel();
    } else {
      // Fallback: export cleaned log of active rows
      if (onExportCleanLog) onExportCleanLog();
    }
  };

  const handleExportAllLines = () => {
    if (dailyEvalRef?.current?.exportAllExcel) {
      dailyEvalRef.current.exportAllExcel();
    } else {
      if (onExportMasterPlan) onExportMasterPlan();
    }
  };

  const handleExportDateRange = () => {
    if (dailyEvalRef?.current?.exportDateRange) {
      const res = dailyEvalRef.current.exportDateRange(rangeStartDate, rangeEndDate);
      if (res && res.success) {
        notify(`Exported Date Range: ${rangeStartDate} to ${rangeEndDate} (${res.count} records)`);
      } else {
        notify(`No operating machine records found between ${rangeStartDate} and ${rangeEndDate}`);
      }
    } else {
      const persisted = loadPersistedRecords();
      const records = persisted.status === 'loaded' ? persisted.records : rawRows;
      const res = exportDateRangeToExcel(records, rangeStartDate, rangeEndDate, MACHINES);
      if (res && res.success) {
        notify(`Exported Date Range: ${res.filename} (${res.count} records)`);
      } else {
        notify(`No operating records found between ${rangeStartDate} and ${rangeEndDate}`);
      }
    }
  };

  const handleExportFullSystemBackup = () => {
    const backupData = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      rawRowsCount: rawRows.length,
      historicalRowsCount: historicalRawRows.length,
      masterRunsCount: masterRuns.length,
      uniqueCatalogCount: uniquePlanningMatrix.length,
      rawRows,
      historicalRawRows,
      masterRuns,
      uniquePlanningMatrix
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PVC_Suite_Complete_System_Backup_${todayStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Exported complete JSON system backup');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Hub Identity */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          isLight
            ? 'bg-gradient-to-r from-teal-50 via-white to-cyan-50 border-teal-200/80 text-stone-900 shadow-sm'
            : 'bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border-slate-800 text-white shadow-xl'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 rounded-2xl flex items-center justify-center ${
                isLight
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-700/20'
                  : 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/40'
              }`}
            >
              <Database className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight">Import / Export Hub</h1>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                    isLight
                      ? 'bg-teal-100 text-teal-800 border border-teal-300'
                      : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  }`}
                >
                  Central Operations
                </span>
              </div>
              <p className={`text-xs mt-1 ${isLight ? 'text-stone-600' : 'text-slate-400'}`}>
                Unified control center for Excel ingestion, standardized template downloads, shift SOP printing, and multi-format data backups.
              </p>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="flex items-center gap-3">
            <div
              className={`px-3 py-2 rounded-xl border text-center ${
                isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-slate-950/80 border-slate-800 text-slate-200'
              }`}
            >
              <div className="text-[10px] font-semibold text-slate-400 uppercase">Active Runs</div>
              <div className="text-sm font-bold font-mono text-cyan-500">{rawRows.length}</div>
            </div>
            <div
              className={`px-3 py-2 rounded-xl border text-center ${
                isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-slate-950/80 border-slate-800 text-slate-200'
              }`}
            >
              <div className="text-[10px] font-semibold text-slate-400 uppercase">ERP History</div>
              <div className="text-sm font-bold font-mono text-purple-400">{historicalRawRows.length}</div>
            </div>
            <div
              className={`px-3 py-2 rounded-xl border text-center ${
                isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-slate-950/80 border-slate-800 text-slate-200'
              }`}
            >
              <div className="text-[10px] font-semibold text-slate-400 uppercase">Master Plans</div>
              <div className="text-sm font-bold font-mono text-emerald-500">{masterRuns.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main 4-Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* =========================================================
            SECTION 1: INGESTION & UPLOADS (INPUT DATA)
            ========================================================= */}
        <div
          className={`p-6 rounded-2xl border transition-all flex flex-col justify-between ${
            isLight ? 'bg-white border-[#dfd7ca] shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${isLight ? 'bg-teal-50 text-teal-700' : 'bg-cyan-500/10 text-cyan-400'}`}>
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Section 1: Ingestion & Uploads</h2>
                  <span className="text-[11px] text-slate-400">Import shop-floor logs & legacy ERP sheets</span>
                </div>
              </div>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-800/40">
                Input Data
              </span>
            </div>

            {/* Upload Action 1: Daily Production Log */}
            <div className="mb-4">
              <label className="block text-xs font-bold mb-1">
                Upload Daily Production Log (.xlsx, .xls, .csv)
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDailyDragging(true);
                }}
                onDragLeave={() => setDailyDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDailyDragging(false);
                  if (e.dataTransfer.files?.[0]) handleDailyFile(e.dataTransfer.files[0]);
                }}
                onClick={() => dailyFileInputRef.current?.click()}
                className={`p-4 rounded-xl border-2 border-dashed text-center cursor-pointer transition ${
                  dailyDragging
                    ? 'border-cyan-500 bg-cyan-950/30'
                    : isLight
                    ? 'border-stone-300 hover:border-teal-600 bg-stone-50/60'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/50'
                }`}
              >
                <input
                  ref={dailyFileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleDailyFile(e.target.files[0]);
                  }}
                />
                <FileSpreadsheet className={`w-6 h-6 mx-auto mb-1.5 ${isLight ? 'text-teal-600' : 'text-cyan-400'}`} />
                <span className="text-xs font-semibold block">Click to browse or drop file here</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Actual shop-floor logs containing recorded machine lines and hourly runs.
                </span>
              </div>

              {dailyFileName && (
                <div
                  className={`mt-2 p-2.5 rounded-lg text-xs flex items-center justify-between ${
                    isLight ? 'bg-stone-100 text-stone-800' : 'bg-slate-950 text-slate-200 border border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-medium truncate">{dailyFileName}</span>
                  </div>
                  {dailySheetNames.length > 1 && (
                    <select
                      value={selectedDailySheet}
                      onChange={handleDailySheetChange}
                      className={`text-[11px] rounded px-2 py-0.5 border ${
                        isLight ? 'bg-white border-stone-300' : 'bg-slate-900 border-slate-700'
                      }`}
                    >
                      {dailySheetNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {dailyError && <p className="text-xs text-rose-500 mt-1">{dailyError}</p>}
            </div>

            {/* Upload Action 2: Historical ERP Log */}
            <div className="mb-4">
              <label className="block text-xs font-bold mb-1">
                Upload Historical ERP Log (.xlsx, .xls, .csv)
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setErpDragging(true);
                }}
                onDragLeave={() => setErpDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setErpDragging(false);
                  if (e.dataTransfer.files?.[0]) handleErpFile(e.dataTransfer.files[0]);
                }}
                onClick={() => erpFileInputRef.current?.click()}
                className={`p-4 rounded-xl border-2 border-dashed text-center cursor-pointer transition ${
                  erpDragging
                    ? 'border-purple-500 bg-purple-950/30'
                    : isLight
                    ? 'border-stone-300 hover:border-purple-600 bg-stone-50/60'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/50'
                }`}
              >
                <input
                  ref={erpFileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleErpFile(e.target.files[0]);
                  }}
                />
                <Cpu className={`w-6 h-6 mx-auto mb-1.5 ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />
                <span className="text-xs font-semibold block">Click to browse or drop ERP file</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Raw ERP production logs without extruder lines for automatic inference.
                </span>
              </div>

              {erpFileName && (
                <div
                  className={`mt-2 p-2.5 rounded-lg text-xs flex items-center justify-between ${
                    isLight ? 'bg-stone-100 text-stone-800' : 'bg-slate-950 text-slate-200 border border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                    <span className="font-medium truncate">{erpFileName}</span>
                  </div>
                  <span className="text-[11px] font-mono text-purple-400 font-bold">
                    {historicalRawRows.length} runs
                  </span>
                </div>
              )}
              {erpError && <p className="text-xs text-rose-500 mt-1">{erpError}</p>}
            </div>
          </div>

          {/* Sample Loaders Strip */}
          <div className="pt-3 border-t border-inherit flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadDailySample}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isLight
                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Load Screenshot Sample (59 Runs)</span>
              </button>
              <button
                type="button"
                onClick={handleLoadErpSample}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isLight
                    ? 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300'
                    : 'bg-purple-950/60 hover:bg-purple-900 text-purple-200 border border-purple-800'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <span>Load 15-Run ERP Sample</span>
              </button>
            </div>
            {onClearAllData && (
              <button
                type="button"
                onClick={onClearAllData}
                className="text-xs text-rose-500 hover:text-rose-400 font-medium cursor-pointer p-1"
                title="Reset active datasets"
              >
                Clear Data
              </button>
            )}
          </div>
        </div>

        {/* =========================================================
            SECTION 2: TEMPLATES & BLANK FORMS (DOWNLOADS)
            ========================================================= */}
        <div
          className={`p-6 rounded-2xl border transition-all flex flex-col justify-between ${
            isLight ? 'bg-white border-[#dfd7ca] shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/10 text-emerald-400'}`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Section 2: Templates & Blank Forms</h2>
                  <span className="text-[11px] text-slate-400">Pre-formatted sheets & standardized data entry</span>
                </div>
              </div>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40">
                Downloads
              </span>
            </div>

            <div className="space-y-4">
              {/* Template 1: Daily Production Log */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isLight ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div>
                  <h3 className="text-xs font-bold text-stone-900 dark:text-slate-100">
                    Download Daily Production Log Template (Excel)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Empty standardized Excel sheet ready for shop-floor data entry.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadDailyTemplate}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .xlsx</span>
                </button>
              </div>

              {/* Template 2: ERP Formatting Template */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isLight ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div>
                  <h3 className="text-xs font-bold text-stone-900 dark:text-slate-100">
                    Download ERP Formatting Template (Excel)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Formatted template for preparing legacy/ERP data imports.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadErpTemplate}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .xlsx</span>
                </button>
              </div>

              {/* Template 3: Engineering Calculation Reference Guide */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isLight ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div>
                  <h3 className="text-xs font-bold text-stone-900 dark:text-slate-100">
                    Download Engineering Calculation Guide (Excel)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Formulas, pipe weight formulas, and standard piece-rate reference matrix.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCalcGuide}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm transition cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .xlsx</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-inherit flex items-center justify-between text-[11px] text-slate-400">
            <span>Includes 2 pre-filled sample rows and field definitions</span>
            <span className="font-mono">Office Open XML (.xlsx)</span>
          </div>
        </div>

        {/* =========================================================
            SECTION 3: SHIFT SOP & INSPECTION PRINTING
            ========================================================= */}
        <div
          className={`p-6 rounded-2xl border transition-all flex flex-col justify-between ${
            isLight ? 'bg-white border-[#dfd7ca] shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${isLight ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/10 text-blue-400'}`}>
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Section 3: Shift SOP & Inspection Printing</h2>
                  <span className="text-[11px] text-slate-400">Physical shop-floor documentation & follow-up</span>
                </div>
              </div>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-800/40">
                A4 Portrait
              </span>
            </div>

            {/* Morning SOP Print Button Card */}
            <div
              className={`p-4 rounded-xl border mb-4 ${
                isLight ? 'bg-blue-50/50 border-blue-200' : 'bg-blue-950/20 border-blue-900/40'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-600 text-white font-mono">
                      DOC-Ext.-03
                    </span>
                    <h3 className="text-xs font-bold text-stone-900 dark:text-slate-100">
                      Print Blank Morning SOP (DOC-Ext.-03)
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Generates single generic blank sheet or pre-populated machine runs for shift supervisors.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleTriggerBlankSopPrint}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-950/30 transition cursor-pointer shrink-0"
                >
                  <Printer className="w-4 h-4" />
                  <span>Open Print Dialog</span>
                </button>
              </div>

              {/* Inline Options & Hints */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-blue-200/40 dark:border-blue-900/40 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Option A: Universal Blank (1 Clean Page)</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Option B: Configured Multi-Line Batch</span>
                </div>
              </div>
            </div>

            {/* Operational Line Selector & Quick Print */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Target Operational Date:
                  </label>
                  <input
                    type="date"
                    value={selectedPrintDate}
                    onChange={(e) => setSelectedPrintDate(e.target.value)}
                    className={`w-full rounded-lg px-3 py-1.5 text-xs font-mono border ${
                      isLight ? 'bg-white border-stone-300 text-stone-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Select Machine Line:
                  </label>
                  <select
                    value={selectedMachineLine}
                    onChange={(e) => setSelectedMachineLine(e.target.value)}
                    className={`w-full rounded-lg px-3 py-1.5 text-xs border ${
                      isLight ? 'bg-white border-stone-300 text-stone-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <option value="ALL">All Operating Lines (Batch)</option>
                    {MACHINES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id} ({m.minDiameter}-{m.maxDiameter}mm)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleQuickPrintOperationalSummary}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isLight
                      ? 'bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5 text-blue-400" />
                  <span>Quick Print / PDF Export</span>
                </button>
                <span className="text-[11px] text-slate-400">
                  Uses standard browser print layout with 5mm margins.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-inherit flex items-center justify-between text-[11px] text-slate-400">
            <span>DOC-Ext.-03 Standard compliant</span>
            <span>Optimized for photocopying</span>
          </div>
        </div>

        {/* =========================================================
            SECTION 4: DATA EXPORTS & BACKUPS
            ========================================================= */}
        <div
          className={`p-6 rounded-2xl border transition-all flex flex-col justify-between ${
            isLight ? 'bg-white border-[#dfd7ca] shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-inherit mb-4">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${isLight ? 'bg-amber-50 text-amber-700' : 'bg-amber-500/10 text-amber-400'}`}>
                  <FolderDown className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Section 4: Data Exports & Backups</h2>
                  <span className="text-[11px] text-slate-400">Excel extracts, historical ranges & system dumps</span>
                </div>
              </div>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/40">
                Exports
              </span>
            </div>

            <div className="space-y-3">
              {/* Export Button 1: Current Line */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-inherit">
                <div>
                  <div className="text-xs font-bold">Export Current Line (Excel)</div>
                  <div className="text-[11px] text-slate-400">
                    Download the active machine line 24-hour log as an Excel sheet.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportCurrentLine}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer transition shrink-0"
                >
                  Export .xlsx
                </button>
              </div>

              {/* Export Button 2: All Lines */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-inherit">
                <div>
                  <div className="text-xs font-bold">Export All Lines (Excel)</div>
                  <div className="text-[11px] text-slate-400">
                    Consolidated multi-line daily production workbook.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportAllLines}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer transition shrink-0"
                >
                  Export All
                </button>
              </div>

              {/* Export Button 3: Date Range */}
              <div className="p-3 rounded-lg border border-inherit space-y-2">
                <div>
                  <div className="text-xs font-bold">Export Date Range</div>
                  <div className="text-[11px] text-slate-400">
                    Filter by start and end date to export historical logged runs.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={rangeStartDate}
                    onChange={(e) => setRangeStartDate(e.target.value)}
                    className={`rounded px-2.5 py-1 text-xs font-mono border ${
                      isLight ? 'bg-white border-stone-300' : 'bg-slate-950 border-slate-800'
                    }`}
                  />
                  <span className="text-xs text-slate-400">&rarr;</span>
                  <input
                    type="date"
                    value={rangeEndDate}
                    onChange={(e) => setRangeEndDate(e.target.value)}
                    className={`rounded px-2.5 py-1 text-xs font-mono border ${
                      isLight ? 'bg-white border-stone-300' : 'bg-slate-950 border-slate-800'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleExportDateRange}
                    className="ml-auto px-3 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer transition"
                  >
                    Filter & Export
                  </button>
                </div>
              </div>

              {/* Export Button 4: Master Extrusion Plan */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-inherit">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">Export Master Extrusion Plan (Excel)</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      18 cols
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Full consolidated production logs and machine allocation proposals.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onExportMasterPlan}
                  disabled={masterRuns.length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white cursor-pointer transition shrink-0"
                >
                  Export Plan
                </button>
              </div>

              {/* Export Button 5: Unique Planning Catalog */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-inherit">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">Export Unique Planning Catalog</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-400 border border-purple-800">
                      1 row/OD
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    1 row per unique pipe outer diameter (OD) and spec matrix.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onExportUniqueCatalog}
                  disabled={uniquePlanningMatrix.length === 0 && masterRuns.length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white cursor-pointer transition shrink-0"
                >
                  Export Catalog
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-inherit flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={handleExportFullSystemBackup}
              className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Full System Snapshot (JSON)</span>
            </button>
            <span className="text-slate-400">Zero data loss guarantee</span>
          </div>
        </div>
      </div>

      {/* =========================================================
          SECTION 5: CODE ANALYSIS & CALCULATION INSPECTOR
          ========================================================= */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-[#dfd7ca] shadow-sm' : 'bg-slate-900 border-slate-800 shadow-xl'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-inherit mb-5">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isLight ? 'bg-teal-50 text-teal-700' : 'bg-cyan-500/10 text-cyan-400'}`}>
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold">Code Analysis & Production Calculation Inspector</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Mathematical Rules Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Exact derivation formulas for extruder speed (m/min), cutting cycle time, standard pieces per hour, and theoretical pipe weight.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadCalcGuide}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm transition cursor-pointer self-start md:self-auto"
          >
            <Download className="w-4 h-4" />
            <span>Export Calculation Spec (.xlsx)</span>
          </button>
        </div>

        {/* 2-Column Inspector: Formula Cards vs Interactive Test Sandbox */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column A: Formula Reference Cards */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Core Extrusion Mathematical Formulas
            </h3>

            {/* Formula Card 1: Speed to Pieces/Hr */}
            <div
              className={`p-3.5 rounded-xl border ${
                isLight ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/70 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold text-cyan-400 mb-1">
                <span>1. Speed (m/min) to Target Output Rate</span>
                <span className="font-mono text-[10px] text-slate-400">Linear Saw Pitch</span>
              </div>
              <div className="font-mono text-xs bg-black/40 p-2 rounded text-emerald-400 mb-1.5">
                Target Pcs/Hr = (Extruder Speed [m/min] × 60) / Cut Length [m]
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Derives expected hourly finished pieces from planetary saw cutting pitch. Cutting time per pipe is calculated as:{' '}
                <code className="text-cyan-300">Cut Time (sec) = (Cut Length / Speed) × 60</code>.
              </p>
            </div>

            {/* Formula Card 2: Theoretical Weight per Meter */}
            <div
              className={`p-3.5 rounded-xl border ${
                isLight ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/70 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold text-purple-400 mb-1">
                <span>2. Theoretical Pipe Weight per Meter (kg/m)</span>
                <span className="font-mono text-[10px] text-slate-400">DIN 8062 / ISO 1452</span>
              </div>
              <div className="font-mono text-xs bg-black/40 p-2 rounded text-purple-300 mb-1.5">
                Wt (kg/m) = π × (OD - Wall Thickness) × Wall Thickness × 1.43 / 1000
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Rigid PVC density constant is calibrated at <strong className="text-slate-200">1.43 g/cm³</strong>. Total piece weight is obtained by multiplying Wt (kg/m) by finished Cut Length.
              </p>
            </div>

            {/* Formula Card 3: Machine Loading & Sizing Envelope */}
            <div
              className={`p-3.5 rounded-xl border ${
                isLight ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/70 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold text-amber-400 mb-1">
                <span>3. Extruder Allocation & Loading Ratio</span>
                <span className="font-mono text-[10px] text-slate-400">Optimal: 65% - 95%</span>
              </div>
              <div className="font-mono text-xs bg-black/40 p-2 rounded text-amber-300 mb-1.5">
                Loading Ratio (%) = (Actual Extrusion Rate [kg/hr] / Machine Nominal Capacity [kg/hr]) × 100
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Matches physical tooling die/vacuum calibration (<code className="text-slate-200">Min OD ≤ Pipe OD ≤ Max OD</code>). Lines running between 65% and 95% load are marked optimal.
              </p>
            </div>
          </div>

          {/* Column B: Live Calculation Sandbox */}
          <div
            className={`p-4 rounded-xl border flex flex-col justify-between ${
              isLight ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/90 border-slate-800'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Live Calculation Sandbox
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Real-time simulator</span>
              </div>

              {/* Parameter Inputs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    Speed (m/min):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={calcSpeed}
                    onChange={(e) => setCalcSpeed(e.target.value)}
                    className={`w-full rounded px-2 py-1 text-xs font-mono font-bold border ${
                      isLight ? 'bg-white border-stone-300' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    Cut Length (m):
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={calcLength}
                    onChange={(e) => setCalcLength(e.target.value)}
                    className={`w-full rounded px-2 py-1 text-xs font-mono font-bold border ${
                      isLight ? 'bg-white border-stone-300' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    Outer Diam (mm):
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="16"
                    value={calcOd}
                    onChange={(e) => setCalcOd(e.target.value)}
                    className={`w-full rounded px-2 py-1 text-xs font-mono font-bold border ${
                      isLight ? 'bg-white border-stone-300' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    Thickness (mm):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={calcWt}
                    onChange={(e) => setCalcWt(e.target.value)}
                    className={`w-full rounded px-2 py-1 text-xs font-mono font-bold border ${
                      isLight ? 'bg-white border-stone-300' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              {/* Calculated Outputs Cards */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div
                  className={`p-3 rounded-xl border text-center ${
                    isLight ? 'bg-white border-stone-200' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Cutting Saw Cycle</div>
                  <div className="text-lg font-black font-mono text-cyan-400 my-0.5">
                    {calcOutput.cutTimeSec}s
                  </div>
                  <div className="text-[10px] text-slate-400">per piece cut</div>
                </div>

                <div
                  className={`p-3 rounded-xl border text-center ${
                    isLight ? 'bg-white border-stone-200' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Target Pieces Rate</div>
                  <div className="text-lg font-black font-mono text-emerald-400 my-0.5">
                    {calcOutput.targetPcsPerHour} pcs/h
                  </div>
                  <div className="text-[10px] text-slate-400">({calcOutput.shiftStandardPcs} pcs / 12h)</div>
                </div>

                <div
                  className={`p-3 rounded-xl border text-center ${
                    isLight ? 'bg-white border-stone-200' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Theoretical Weight</div>
                  <div className="text-lg font-black font-mono text-purple-400 my-0.5">
                    {calcOutput.weightPerPipe} kg
                  </div>
                  <div className="text-[10px] text-slate-400">({calcOutput.weightPerMeter} kg/m)</div>
                </div>

                <div
                  className={`p-3 rounded-xl border text-center ${
                    isLight ? 'bg-white border-stone-200' : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Mass Output Throughput</div>
                  <div className="text-lg font-black font-mono text-amber-400 my-0.5">
                    {calcOutput.massRateKgPerHour} kg/h
                  </div>
                  <div className="text-[10px] text-slate-400">({calcOutput.shiftTotalWeightKg} kg / 12h)</div>
                </div>
              </div>

              {/* Machine Allocation Recommendation */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  isLight ? 'bg-white border-teal-200' : 'bg-slate-900 border-cyan-900/60'
                }`}
              >
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Recommended Extruder
                  </div>
                  <div className="text-xs font-bold text-cyan-300">
                    {calcOutput.recommendedMachine} ({calcOutput.nominalCapacity} kg/h)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold font-mono text-emerald-400">
                    {calcOutput.loadingRatio}% Load
                  </div>
                  <div className="text-[10px] text-slate-400">{calcOutput.loadingStatus}</div>
                </div>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-inherit flex items-center justify-between text-[11px] text-slate-400">
              <span>Standard rigid PVC formula: π × (OD - WT) × WT × 1.43 / 1000</span>
              <span className="font-mono text-cyan-400">Verified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
