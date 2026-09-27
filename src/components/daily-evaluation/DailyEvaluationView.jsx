import { useMemo, useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import html2pdf from 'html2pdf.js';
import { MACHINES, matchMachine, machineLabel, PLANT_NAME, SOP_REF, DOC_VERSION } from '../../config/machines.js';
import { makeRefSpec, generateReport, buildAll } from '../../logic/engine.js';
import {
  newId,
  saveReport,
  deleteReport,
  loadAll,
  getBenchmarkReport,
  loadPersistedRecords,
  savePersistedRecords,
  clearPersistedRecords,
  loadPersistedActiveReport,
  savePersistedActiveReport,
  loadPersistedMeta
} from '../../data/store.js';
import {
  parseExcelWorkbook,
  convertLogRowToReport,
  consolidateDailyMachineRecords,
  normalizeExcelDate
} from '../../logic/excelParser.js';
import {
  queryProductionRecords,
  queryProductionRecordsForDate,
  normalizeProductionRow,
  isDateMatch,
  isMachineMatch,
  blankReportForMachine,
  autoBindProductionLogToReport,
  reconcileShiftRun
} from '../../logic/oeeReconciler.js';
import PlantAnalytics from './PlantAnalytics.jsx';
import ReportSheet from './ReportSheet.jsx';
import LegacySopSheet from './LegacySopSheet.jsx';
import FitScale from './FitScale.jsx';
import HistoryDrawer from './HistoryDrawer.jsx';
import KpiStrip from './KpiStrip.jsx';
import ExcelUploader from './ExcelUploader.jsx';
import ExportModal from './ExportModal.jsx';
import PrintSopModal from './PrintSopModal.jsx';
import PrintSopChoiceModal from './PrintSopChoiceModal.jsx';
import AutoReconcileModal from './AutoReconcileModal.jsx';
import { buildUniversalBlankSopModel } from '../../logic/legacySopHelper.js';
import JSZip from 'jszip';
import {
  exportSingleMachineToExcel,
  exportAllMachinesToExcel,
  exportSingleMachineSopToExcel,
  exportAllMachinesSopToExcel,
  exportDateRangeToExcel,
  exportDateRangeSopToExcel
} from '../../logic/excelExport.js';
import {
  getOperatingRecordsForDate,
  getOperatingRecordsForDateRange,
  isRecordOperating,
  formatPdfFilename,
  formatZipFilename,
  formatSopPdfFilename,
  formatSopZipFilename,
  formatRangeZipFilename,
  formatRangeSopZipFilename,
  downloadBlob
} from '../../logic/batchZipExport.js';

import {
  saveReportToApi,
  fetchReportFromApi,
  fetchHistoryFromApi,
  deleteReportFromApi
} from '../../logic/apiClient.js';

function todayISO() {
  const d = new Date();
  const off = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return off.toISOString().slice(0, 10);
}

function blankReport() {
  return {
    id: newId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    header: { date: todayISO(), lineId: MACHINES[0].id, lineCustom: '', plantName: PLANT_NAME },
    refs: { 1: makeRefSpec(), 2: makeRefSpec() },
    summary: {
      startCounter: '',
      endCounter: '',
      totalOutput: '',
      haulOffMeter: '',
      resinLot: '',
      totalBundles: '',
      totalScrapPipes: '',
      totalPurgeKg: '',
      shift1Lead: '',
      shift2Lead: '',
      plantManager: ''
    },
    downtimeEvents: [],
    slots: []
  };
}

const DailyEvaluationView = forwardRef(function DailyEvaluationView(
  { onNotify, sharedRecords, sharedTheme, lang = 'en', historicalRawRows = [], rawRows = [] },
  ref
) {
  const isAr = lang === 'ar';
  const [records, setRecords] = useState(() => {
    const persisted = loadPersistedRecords();
    return persisted.status === 'loaded' ? consolidateDailyMachineRecords(persisted.records) : [];
  });
  const [machineMaster, setMachineMaster] = useState(() => {
    const meta = loadPersistedMeta();
    return meta.machineMaster && meta.machineMaster.length > 0 ? meta.machineMaster : MACHINES;
  });
  const [report, setReport] = useState(() => {
    const persisted = loadPersistedRecords();
    if (persisted.status === 'cleared') {
      return blankReport();
    }
    const savedActive = loadPersistedActiveReport();
    if (savedActive) {
      return savedActive;
    }
    if (persisted.status === 'loaded' && persisted.records.length > 0) {
      return convertLogRowToReport(persisted.records[0]);
    }
    return getBenchmarkReport();
  });
  const [tab, setTab] = useState('sheet');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingSop, setIsExportingSop] = useState(false);
  const [isLaserMonochrome, setIsLaserMonochrome] = useState(false);
  const [viewMode, setViewMode] = useState('hourly'); // 'hourly' | 'shift' | 'sop'
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportModalScope, setExportModalScope] = useState('current'); // 'current' | 'all'
  const [exportProgressText, setExportProgressText] = useState('');
  const [batchItem, setBatchItem] = useState(null);
  const sheetRef = useRef(null);
  const sopExportRef = useRef(null);
   const blankSopExportRef = useRef(null);
  const batchSheetRef = useRef(null);
  const batchSopRef = useRef(null);
  const morningPdfExportRef = useRef(null);
  const [isBlankSopPrint, setIsBlankSopPrint] = useState(false);
  const [isPrintChoiceModalOpen, setIsPrintChoiceModalOpen] = useState(false);
  const [isPrintSopModalOpen, setIsPrintSopModalOpen] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [sopBatchPrintModels, setSopBatchPrintModels] = useState([]);
  const [isGeneratingMorningPdf, setIsGeneratingMorningPdf] = useState(false);
  const [showAllLines, setShowAllLines] = useState(false);

  // Reset blank and batch SOP print state after browser print dialog closes
  useEffect(() => {
    const handleAfterPrint = () => {
      setIsBlankSopPrint(false);
      document.body.classList.remove('print-sop-batch');
      const pageStyle = document.getElementById('sop-print-page-style');
      if (pageStyle) {
        pageStyle.remove();
      }
      setSopBatchPrintModels([]);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // Seed demo data ONLY on the very first visit (when storage has no records and is not marked cleared)
  useEffect(() => {
    const persisted = loadPersistedRecords();
    if (persisted.status !== 'empty') {
      return; // Honors cleared state or already loaded records across hard refreshes
    }
    async function loadMasterData() {
      try {
        const resp = await fetch('./Master_Upload.xlsx');
        if (!resp.ok) return;
        const buf = await resp.arrayBuffer();
        const res = parseExcelWorkbook(buf);
        if (res.rows && res.rows.length > 0) {
          setRecords(res.rows);
          if (res.machineMaster && res.machineMaster.length > 0) {
            setMachineMaster(res.machineMaster);
          }
          savePersistedRecords(res.rows, {
            machineMaster: res.machineMaster,
            fileName: 'Master_Upload.xlsx',
            sheetName: res.sheetName || 'Daily Production Log'
          });
          const firstOpRow = res.rows.find(isRecordOperating) || res.rows[0];
          const initialRep = convertLogRowToReport(firstOpRow);
          setReport(initialRep);
          savePersistedActiveReport(initialRep);
        }
      } catch (err) {
        console.error('Auto-load Master_Upload.xlsx error in App:', err);
      }
    }
    loadMasterData();
  }, []);

  // Persist active report to localStorage whenever report state changes
  useEffect(() => {
    if (report && report.id) {
      savePersistedActiveReport(report);
    }
  }, [report]);

  const handleWorkbookParsed = useCallback(({ rows, machineMaster: newMaster, fileName, sheetName, cleared }) => {
    if (cleared) {
      setRecords([]);
      setMachineMaster(MACHINES);
      setReport(blankReport());
      clearPersistedRecords();
      return;
    }
    if (Array.isArray(rows)) {
      const consolidated = consolidateDailyMachineRecords(rows, newMaster || machineMaster);
      setRecords(consolidated);
      savePersistedRecords(consolidated, {
        machineMaster: newMaster || machineMaster,
        fileName: fileName || '',
        sheetName: sheetName || ''
      });
      if (consolidated.length > 0) {
        const firstOpRow = consolidated.find(isRecordOperating) || consolidated[0];
        const firstRep = convertLogRowToReport(firstOpRow);
        setReport(firstRep);
        savePersistedActiveReport(firstRep);
      }
    }
    if (newMaster && newMaster.length > 0) {
      setMachineMaster(newMaster);
    }
  }, [machineMaster]);

  // Initialize with benchmark slots if empty
  useMemo(() => {
    if (!report.slots || report.slots.length === 0) {
      const initData = generateReport(report);
      report.slots = initData.slots;
    }
  }, []);

  const derived = useMemo(() => {
    if (report.slots && report.slots.length > 0) {
      return buildAll(report.slots, report.refs, report.summary.startCounter, report.engineering);
    }
    return null;
  }, [report.slots, report.refs, report.summary.startCounter, report.engineering]);

  const notify = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3000);
  }, []);

  const update = useCallback((fn) => {
    setReport((prev) => ({ ...fn({ ...prev }), updatedAt: Date.now() }));
  }, []);

  const patchHeader = (k, v) => update((r) => { r.header[k] = v; return r; });
  const patchSummary = (k, v) => update((r) => { r.summary[k] = v; return r; });
  const patchRef = (key, k, v) => update((r) => { r.refs[key][k] = v; return r; });
  const patchEvent = (i, k, v) => update((r) => { r.downtimeEvents[i][k] = v; return r; });

  const addEvent = () =>
    update((r) => {
      r.downtimeEvents.push({ key: newId(), startHour: 6, durationMin: 60, reason: '' });
      return r;
    });

  const removeEvent = (i) =>
    update((r) => {
      r.downtimeEvents.splice(i, 1);
      return r;
    });

  const patchSlot = (index, k, v) =>
    update((r) => {
      r.slots = r.slots.map((s, idx) => (idx === index ? { ...s, [k]: v } : s));
      return r;
    });

  const handleGenerate = () => {
    const data = generateReport(report);
    const kept = data.slots.map((s) => ({
      index: s.index,
      window: s.window,
      shift: s.shift,
      startHour: s.startHour,
      ref: s.ref,
      downtime: s.downtime,
      reason: s.reason,
      actual: s.actual,
      scrap: s.scrap,
      purge: s.purge,
      bundles: s.bundle
    }));
    update((r) => { r.slots = kept; return r; });
    setTab('sheet');
    notify('24-hour log generated from summary inputs');
  };

  const handleLoadBenchmark = () => {
    const bench = getBenchmarkReport();
    const data = generateReport(bench);
    bench.slots = data.slots;
    setReport(bench);
    setTab('sheet');
    notify('Loaded benchmark factory dataset from PVC_Pipe_Daily_Follow.xlsx');
  };

  const handleSelectFromUploader = (newReport) => {
    let repToSet = newReport;
    if (repToSet) {
      const totalActual = Number(repToSet.summary?.totalOutput) || 0;
      const slotSum = Array.isArray(repToSet.slots)
        ? repToSet.slots.reduce((sum, s) => sum + (Number(s.actual) || 0), 0)
        : 0;
      if (totalActual > 0 && (slotSum === 0 || !repToSet.slots || repToSet.slots.length !== 24)) {
        const reconciled = reconcileShiftRun(repToSet, {
          totalActualPieces: totalActual
        });
        repToSet = { ...repToSet, slots: reconciled.updatedSlots };
      }
      setReport(repToSet);
      savePersistedActiveReport(repToSet);
    }
    setTab('sheet');
    notify(`Loaded 24-hour report for ${repToSet?.header?.lineId || 'Line'}`);
  };

  const refreshHistoryList = useCallback(async () => {
    const local = loadAll();
    setHistoryItems(local);
    setIsHistoryLoading(true);

    try {
      const res = await fetchHistoryFromApi();
      if (res.success && res.data && Array.isArray(res.data.items)) {
        const remote = res.data.items;
        const localList = [...local];

        for (const rem of remote) {
          const matched = localList.find((l) => {
            if (rem.client_id && l.id === rem.client_id) return true;
            if (
              l.header &&
              l.header.date === rem.report_date &&
              (l.header.lineId === rem.line_machine || l.header.lineCustom === rem.line_machine)
            ) {
              return true;
            }
            return false;
          });

          if (matched) {
            matched.isSynced = true;
            matched.dbId = rem.id;
          } else {
            localList.push({
              id: rem.id,
              isRemote: true,
              dbId: rem.id,
              report_date: rem.report_date,
              line_machine: rem.line_machine,
              updatedAt: rem.timestamp,
              createdAt: rem.timestamp,
              header: {
                date: rem.report_date,
                lineId: rem.line_machine,
                plantName: rem.plant_name
              },
              total_output_pcs: rem.total_output_pcs,
              oee_pct: rem.oee_pct
            });
          }
        }
        setHistoryItems(localList);
      }
    } catch (err) {
      // Keep local list on network error
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  const openHistory = useCallback(() => {
    setHistoryOpen(true);
    refreshHistoryList();
  }, [refreshHistoryList]);

  const handleSave = useCallback(async () => {
    // 1. Immediately persist locally (zero data loss guarantee)
    saveReport(report);

    // 2. Transmit to central Hostinger MySQL database
    try {
      const res = await saveReportToApi(report, derived);
      if (res.success) {
        notify('Report saved to Central MySQL Database & Local History');
      } else if (res.dbConfigRequired) {
        notify('Saved locally (MySQL sync pending: set DB password in api/config.php)');
      } else if (res.offline) {
        notify('Saved locally (Central database offline / unreachable)');
      } else {
        notify(`Saved locally (${res.message || 'Central sync error'})`);
      }
      return res;
    } catch (err) {
      notify('Report saved to local browser history');
      return { success: false, error: err };
    } finally {
      refreshHistoryList();
    }
  }, [report, derived, notify, refreshHistoryList]);

  const handleLoad = async (saved) => {
    if (saved && saved.isRemote && !saved.slots) {
      notify('Fetching complete 24h follow sheet from MySQL database...');
      const res = await fetchReportFromApi({ id: saved.id });
      if (res.success && res.data && res.data.report) {
        setReport(res.data.report);
        setTab('sheet');
        setHistoryOpen(false);
        const lName = res.data.report.header?.lineId || 'Line';
        notify(`Loaded 24h report for ${lName} from MySQL`);
        return;
      } else {
        notify(`Failed to fetch report from database: ${res.message || 'Error'}`);
        return;
      }
    }
    setReport(saved);
    setTab('sheet');
    setHistoryOpen(false);
    notify('Report loaded from history');
  };

  const handleDelete = async (id, isRemote) => {
    deleteReport(id);
    if (isRemote || typeof id === 'number') {
      await deleteReportFromApi(id).catch(() => {});
    }
    refreshHistoryList();
    notify('Report deleted from history');
  };

  const handleReset = () => {
    const blank = blankReport();
    setReport(blank);
    savePersistedActiveReport(blank);
    setTab('analytics');
    notify('Started new blank report');
  };

  const handleExport = async () => {
    if (records.length > 0 && activeLinesForDate.length === 0) {
      notify(`No active operating lines on ${selectedDate} to export.`);
      return;
    }
    setIsExporting(true);
    notify('Rendering single-page A4 PDF export...');

    // Wait for React to apply export styles
    await new Promise((resolve) => setTimeout(resolve, 150));

    const el = sheetRef.current;
    if (!el) {
      setIsExporting(false);
      return;
    }

    const dateStr = report.header.date || 'report';
    const lineStr = (report.header.lineId || 'line').replace(/\s+/g, '_');
    const filename = viewMode === 'shift'
      ? `Daily_Report_${dateStr}_${lineStr}_Shift_Summary.pdf`
      : `Daily_Report_${dateStr}_${lineStr}.pdf`;

    const opt = {
      margin: [4, 4, 4, 4],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2.5,
        useCORS: true,
        letterRendering: true,
        logging: false,
        backgroundColor: '#FFFFFF',
        windowWidth: 1120,
        scrollY: 0,
        scrollX: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
      pagebreak: { mode: ['avoid-all'] }
    };

    try {
      await html2pdf().set(opt).from(el).save();
      notify('Single-page A4 Landscape PDF downloaded successfully');
    } catch (err) {
      notify('PDF generation error - use browser Print dialog');
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSop = async () => {
    if (records.length > 0 && activeLinesForDate.length === 0) {
      notify(`No active operating lines on ${selectedDate} to export.`);
      return;
    }
    if (!report || !derived) {
      notify('No active report available to export SOP.');
      return;
    }
    const el = sopExportRef.current || sheetRef.current;
    if (!el) {
      notify('Unable to access SOP sheet layout.');
      return;
    }

    setIsExportingSop(true);
    notify('Rendering DOC-Ext.-03 SOP PDF (Single Page)...');

    // Wait for React to apply export styles
    await new Promise((resolve) => setTimeout(resolve, 150));

    const dateStr = report.header.date || 'report';
    const lineStr = (report.header.lineId || 'line').replace(/\s+/g, '_');
    const filename = `Daily_Report_${dateStr}_${lineStr}_DOC-Ext-03_SOP.pdf`;

    const opt = {
      margin: [4, 4, 4, 4],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2.5,
        useCORS: true,
        letterRendering: true,
        logging: false,
        backgroundColor: '#FFFFFF',
        windowWidth: 1080,
        scrollY: 0,
        scrollX: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().set(opt).from(el).save();
      notify('DOC-Ext.-03 SOP PDF downloaded successfully (1 of 1)');
    } catch (err) {
      notify('SOP PDF generation error - use browser Print dialog');
      console.error(err);
    } finally {
      setIsExportingSop(false);
    }
  };

  const handlePrintBlankSop = () => {
    setIsBlankSopPrint(true);
    notify('Opening print dialog for Blank SOP Template (DOC-Ext.-03)...');
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleExportBlankSopPdf = async () => {
    const el = blankSopExportRef.current;
    if (!el) {
      notify('Unable to access Blank SOP sheet layout.');
      return;
    }

    setIsExportingSop(true);
    notify('Rendering Blank DOC-Ext.-03 SOP Template PDF...');
    await new Promise((resolve) => setTimeout(resolve, 150));

    const filename = 'Blank_SOP_Follow_Sheet_DOC-Ext-03.pdf';

    const opt = {
      margin: [4, 4, 4, 4],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2.5,
        useCORS: true,
        letterRendering: true,
        logging: false,
        backgroundColor: '#FFFFFF',
        windowWidth: 1080,
        scrollY: 0,
        scrollX: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().set(opt).from(el).save();
      notify('Blank DOC-Ext.-03 SOP Template PDF downloaded successfully');
    } catch (err) {
      notify('PDF generation error - opening browser Print dialog');
      console.error(err);
      handlePrintBlankSop();
    } finally {
      setIsExportingSop(false);
    }
  };

  const handleTriggerMorningSopPrint = (models) => {
    if (!models || models.length === 0) return;
    setSopBatchPrintModels(models);
    document.body.classList.add('print-sop-batch');

    let pageStyle = document.getElementById('sop-print-page-style');
    if (!pageStyle) {
      pageStyle = document.createElement('style');
      pageStyle.id = 'sop-print-page-style';
      document.head.appendChild(pageStyle);
    }
    pageStyle.innerHTML = '@page { size: A4 portrait; margin: 5mm; }';

    setIsPrintChoiceModalOpen(false);
    setIsPrintSopModalOpen(false);
    notify(`Opening print dialog for ${models.length} Morning SOP ${models.length === 1 ? 'Sheet' : 'Sheets'}...`);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const handleTriggerUniversalBlankPrint = () => {
    setIsPrintChoiceModalOpen(false);
    setIsPrintSopModalOpen(false);
    const universalModel = buildUniversalBlankSopModel();
    handleTriggerMorningSopPrint([universalModel]);
  };

  const handleTriggerUniversalBlankPdf = () => {
    setIsPrintChoiceModalOpen(false);
    setIsPrintSopModalOpen(false);
    const universalModel = buildUniversalBlankSopModel();
    handleTriggerMorningSopPdf([universalModel]);
  };

  const handleOpenConfiguredBatchModal = () => {
    setIsPrintChoiceModalOpen(false);
    setIsPrintSopModalOpen(true);
  };

  const handleTriggerMorningSopPdf = async (models) => {
    if (!models || models.length === 0) return;
    setIsGeneratingMorningPdf(true);
    setSopBatchPrintModels(models);
    notify(`Generating Morning SOP PDF for ${models.length} ${models.length === 1 ? 'line' : 'lines'}...`);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const el = morningPdfExportRef.current;
    if (!el) {
      notify('Export staging container not ready.');
      setIsGeneratingMorningPdf(false);
      return;
    }

    const isUniversal = Boolean(models[0]?.isUniversalBlank);
    const targetDate = models[0]?.dateDots ? models[0].dateDots.replace(/\./g, '-') : selectedDate;
    const filename = isUniversal
      ? 'Universal_Blank_SOP_Template_DOC_Ext_03.pdf'
      : models.length === 1
      ? `Morning_SOP_${(models[0].lineCode || 'Line').replace(/[^a-zA-Z0-9_-]/g, '_')}_${targetDate}.pdf`
      : `Morning_SOP_All_Operating_Lines_${targetDate}.pdf`;

    const opt = {
      margin: [5, 5, 5, 5],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2.5,
        useCORS: true,
        letterRendering: true,
        logging: false,
        backgroundColor: '#FFFFFF',
        windowWidth: 1080,
        scrollY: 0,
        scrollX: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().set(opt).from(el).save();
      notify(`Morning SOP PDF downloaded successfully (${filename})`);
      setIsPrintSopModalOpen(false);
    } catch (err) {
      console.error(err);
      notify('PDF generation error - falling back to print dialog');
      handleTriggerMorningSopPrint(models);
    } finally {
      setIsGeneratingMorningPdf(false);
      if (!document.body.classList.contains('print-sop-batch')) {
        setSopBatchPrintModels([]);
      }
    }
  };

  const handleExportExcelSingle = () => {
    if (records.length > 0 && activeLinesForDate.length === 0) {
      notify(`No active operating lines on ${selectedDate} to export.`);
      return;
    }
    if (!report) {
      notify('No active report available to export.');
      return;
    }
    try {
      const res = exportSingleMachineToExcel(report, derived);
      notify(`Exported Excel: ${res.filename}`);
    } catch (err) {
      console.error('Failed to export single machine Excel:', err);
      notify('Failed to export Excel report.');
    }
  };

  const handleExportExcelAll = () => {
    if (!records || records.length === 0) {
      if (report) {
        exportSingleMachineToExcel(report, derived);
        notify('Exported active machine report to Excel.');
        return;
      }
      notify('No production records loaded for batch Excel export.');
      return;
    }
    try {
      const res = exportAllMachinesToExcel(records, selectedDate, machineMaster);
      if (!res.success) {
        if (res.reason === 'no_records') {
          notify(`No active operating machines found for date ${selectedDate}`);
        } else {
          notify('Failed to generate combined Excel workbook.');
        }
        return;
      }
      notify(`Exported Excel workbook: ${res.filename} (${res.count} machines)`);
    } catch (err) {
      console.error('Failed to export all machines Excel:', err);
      notify('Failed to generate combined Excel workbook.');
    }
  };

  const handleExportSopSingleExcel = () => {
    if (records.length > 0 && activeLinesForDate.length === 0) {
      notify(`No active operating lines on ${selectedDate} to export.`);
      return;
    }
    if (!report || !derived) {
      notify('No active report available to export SOP Excel.');
      return;
    }
    try {
      const res = exportSingleMachineSopToExcel(report, derived);
      notify(`Exported SOP Excel: ${res.filename}`);
      setIsExportModalOpen(false);
    } catch (err) {
      console.error('Failed to export single machine SOP Excel:', err);
      notify('Failed to export SOP Excel report.');
    }
  };

  const handleExportSopAllExcel = () => {
    if (!records || records.length === 0) {
      if (report && derived) {
        exportSingleMachineSopToExcel(report, derived);
        notify('Exported active machine SOP report to Excel.');
        setIsExportModalOpen(false);
        return;
      }
      notify('No production records loaded for batch SOP Excel export.');
      return;
    }
    try {
      const res = exportAllMachinesSopToExcel(records, selectedDate, machineMaster);
      if (!res.success) {
        if (res.reason === 'no_records') {
          notify(`No active operating machines found for date ${selectedDate}`);
        } else {
          notify('Failed to generate combined SOP Excel workbook.');
        }
        return;
      }
      notify(`Exported SOP Excel workbook: ${res.filename} (${res.count} machines)`);
      setIsExportModalOpen(false);
    } catch (err) {
      console.error('Failed to export all machines SOP Excel:', err);
      notify('Failed to generate combined SOP Excel workbook.');
    }
  };

  const handleBatchPdfExport = async (template = 'modern') => {
    const targetRows = getOperatingRecordsForDate(records, selectedDate, machineMaster);
    if (targetRows.length === 0) {
      notify(`No active operating lines found for date ${selectedDate}`);
      return;
    }

    setIsExporting(true);
    setExportProgressText(`Preparing ${targetRows.length} machine reports...`);

    const zip = new JSZip();

    try {
      for (let i = 0; i < targetRows.length; i += 1) {
        const row = targetRows[i];
        const rep = convertLogRowToReport(row);
        const der = buildAll(rep.slots, rep.refs, rep.summary?.startCounter, rep.engineering);
        const machineDisplay = row.machineName || row.machineId || `Line_${i + 1}`;

        setBatchItem({ report: rep, derived: der, template });
        setExportProgressText(
          `Rendering ${template === 'sop' ? 'SOP' : 'Modern'} PDF ${i + 1} of ${targetRows.length} (${machineDisplay})...`
        );

        // Allow React to commit the batch element to the DOM
        await new Promise((resolve) => setTimeout(resolve, 150));

        const targetEl = template === 'sop' ? batchSopRef.current : batchSheetRef.current;
        if (!targetEl) {
          throw new Error('Batch rendering container element not found in DOM.');
        }

        const filename = template === 'sop'
          ? formatSopPdfFilename(row.date, row.machineId || 'Line', row.machineRaw || row.machineName || 'Machine')
          : formatPdfFilename(row.date, row.machineId || 'Line', row.machineRaw || row.machineName || 'Machine');

        const opt = {
          margin: [4, 4, 4, 4],
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2.5,
            useCORS: true,
            letterRendering: true,
            logging: false,
            backgroundColor: '#FFFFFF',
            windowWidth: template === 'sop' ? 1080 : 1120,
            scrollY: 0,
            scrollX: 0
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        const pdfBlob = await html2pdf().set(opt).from(targetEl).output('blob');
        zip.file(filename, pdfBlob);
      }

      setExportProgressText('Compressing ZIP archive...');
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const zipFilename = template === 'sop'
        ? formatSopZipFilename(selectedDate)
        : formatZipFilename(selectedDate);

      downloadBlob(zipBlob, zipFilename);
      notify(`Downloaded ZIP archive with ${targetRows.length} ${template === 'sop' ? 'SOP' : 'Modern'} reports`);
      setIsExportModalOpen(false);
    } catch (err) {
      console.error('Batch PDF export failed:', err);
      notify(`Batch export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setBatchItem(null);
      setIsExporting(false);
      setExportProgressText('');
    }
  };

  const handleBatchPdfExportRange = async (template = 'modern', fromDate, toDate) => {
    const targetRows = getOperatingRecordsForDateRange(records, fromDate, toDate);
    if (targetRows.length === 0) {
      notify(`No active operating lines found between ${fromDate} and ${toDate}`);
      return;
    }

    setIsExporting(true);
    setExportProgressText(`Preparing ${targetRows.length} machine reports across date range...`);

    const zip = new JSZip();

    try {
      for (let i = 0; i < targetRows.length; i += 1) {
        const row = targetRows[i];
        const rep = convertLogRowToReport(row);
        const der = buildAll(rep.slots, rep.refs, rep.summary?.startCounter, rep.engineering);
        const machineDisplay = row.machineName || row.machineId || `Line_${i + 1}`;

        setBatchItem({ report: rep, derived: der, template });
        setExportProgressText(
          `Rendering ${template === 'sop' ? 'SOP' : 'Modern'} PDF ${i + 1} of ${targetRows.length} (${row.date} - ${machineDisplay})...`
        );

        // Allow React to commit the batch element to the DOM
        await new Promise((resolve) => setTimeout(resolve, 150));

        const targetEl = template === 'sop' ? batchSopRef.current : batchSheetRef.current;
        if (!targetEl) {
          throw new Error('Batch rendering container element not found in DOM.');
        }

        const filename = template === 'sop'
          ? formatSopPdfFilename(row.date, row.machineId || 'Line', row.machineRaw || row.machineName || 'Machine')
          : formatPdfFilename(row.date, row.machineId || 'Line', row.machineRaw || row.machineName || 'Machine');

        const opt = {
          margin: [4, 4, 4, 4],
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2.5,
            useCORS: true,
            letterRendering: true,
            logging: false,
            backgroundColor: '#FFFFFF',
            windowWidth: template === 'sop' ? 1080 : 1120,
            scrollY: 0,
            scrollX: 0
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        const pdfBlob = await html2pdf().set(opt).from(targetEl).output('blob');
        zip.file(filename, pdfBlob);
      }

      setExportProgressText('Compressing date range ZIP archive...');
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const zipFilename = template === 'sop'
        ? formatRangeSopZipFilename(fromDate, toDate)
        : formatRangeZipFilename(fromDate, toDate);

      downloadBlob(zipBlob, zipFilename);
      notify(`Downloaded ZIP archive with ${targetRows.length} ${template === 'sop' ? 'SOP' : 'Modern'} reports (${fromDate} to ${toDate})`);
      setIsExportModalOpen(false);
    } catch (err) {
      console.error('Batch date range PDF export failed:', err);
      notify(`Batch export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setBatchItem(null);
      setIsExporting(false);
      setExportProgressText('');
    }
  };

  const openExportModal = (scope = 'current') => {
    setExportModalScope(scope);
    setIsExportModalOpen(true);
  };

  const closeExportModal = () => {
    if (!isExporting && !isExportingSop) {
      setIsExportModalOpen(false);
      setExportProgressText('');
    }
  };

  const handleConfirmExport = async ({ template, format, scope, fromDate, toDate }) => {
    if (template === 'blank_sop') {
      setIsExportModalOpen(false);
      setIsPrintSopModalOpen(true);
      return;
    }

    if (scope === 'current') {
      if (format === 'pdf') {
        if (template === 'modern') {
          await handleExport();
          setIsExportModalOpen(false);
        } else {
          await handleExportSop();
          setIsExportModalOpen(false);
        }
      } else if (format === 'excel') {
        if (template === 'modern') {
          handleExportExcelSingle();
          setIsExportModalOpen(false);
        } else {
          handleExportSopSingleExcel();
        }
      }
    } else if (scope === 'range') {
      if (format === 'excel') {
        if (template === 'modern') {
          const res = exportDateRangeToExcel(records, fromDate, toDate, machineMaster);
          if (res.success) {
            notify(`Exported Date Range Excel: ${res.filename} (${res.count} records)`);
            setIsExportModalOpen(false);
          } else {
            notify(`No operating lines found between ${fromDate} and ${toDate}`);
          }
        } else {
          const res = exportDateRangeSopToExcel(records, fromDate, toDate, machineMaster);
          if (res.success) {
            notify(`Exported Date Range SOP Excel: ${res.filename} (${res.count} records)`);
            setIsExportModalOpen(false);
          } else {
            notify(`No operating lines found between ${fromDate} and ${toDate}`);
          }
        }
      } else if (format === 'pdf') {
        await handleBatchPdfExportRange(template, fromDate, toDate);
      }
    } else {
      // scope === 'all'
      if (format === 'excel') {
        if (template === 'modern') {
          handleExportExcelAll();
          setIsExportModalOpen(false);
        } else {
          handleExportSopAllExcel();
        }
      } else if (format === 'pdf') {
        await handleBatchPdfExport(template);
      }
    }
  };


  const lineLabel =
    report.header.lineId === '__CUSTOM__'
      ? report.header.lineCustom || 'Custom Line'
      : machineLabel(report.header.lineId, machineMaster);

  // Combined production datasets from uploaded records, daily log rawRows, and ERP historicalRawRows
  const combinedDatasets = useMemo(() => {
    const list = [];
    if (Array.isArray(records) && records.length > 0) list.push(...records);
    if (Array.isArray(rawRows) && rawRows.length > 0) list.push(...rawRows);
    if (Array.isArray(historicalRawRows) && historicalRawRows.length > 0) list.push(...historicalRawRows);
    return list;
  }, [records, rawRows, historicalRawRows]);

  // Available unique dates from all active and historical datasets
  const availableDates = useMemo(() => {
    const set = new Set();
    combinedDatasets.forEach((r) => {
      const rawDate = r.Date || r.date || r['DATE'];
      if (rawDate && !String(rawDate).toLowerCase().includes('total')) {
        const norm = normalizeExcelDate(rawDate);
        if (norm && /^\d{4}-\d{2}-\d{2}$/.test(norm)) {
          set.add(norm);
        }
      }
    });
    return Array.from(set).sort();
  }, [combinedDatasets]);

  // Ensure current report date is available in selectable list
  const selectableDates = useMemo(() => {
    const set = new Set(availableDates);
    if (report?.header?.date) {
      set.add(report.header.date);
    }
    return Array.from(set).sort();
  }, [availableDates, report?.header?.date]);

  const selectedDate = report?.header?.date || selectableDates[selectableDates.length - 1] || '';

  // Query operating records for currently selected date across combined datasets
  const activeLinesForDate = useMemo(() => {
    if (!selectedDate) return [];

    // Query operating records for this date across combined datasets
    const recordsForDate = queryProductionRecordsForDate({
      dataset: combinedDatasets,
      date: selectedDate,
      machineMaster
    });

    // Consolidate multi-item records for same machine on this date
    const consolidatedForDate = consolidateDailyMachineRecords(recordsForDate, machineMaster);

    const list = [];
    consolidatedForDate.forEach((r) => {
      // Must be actively operating (operatingHours > 0 or productionQty > 0 or totalWeight > 0)
      if (!isRecordOperating(r)) return;

      const matched = matchMachine(r.machineId || r.machineRaw || r.matchedMachine?.id, machineMaster);
      const lid = matched?.id || r.machineId || r.matchedMachine?.id || r.machineRaw;

      const mName =
        matched?.name ||
        r.matchedMachine?.name ||
        (r.machineName ? r.machineName.replace(/^[A-Z0-9-]+\s*-\s*/, '') : r.machineRaw);
      const qty = Number(r.productionQty) || 0;
      const qtyText = qty > 0 ? ` (${qty.toLocaleString()} Pcs)` : '';
      const label = mName ? `${lid} - ${mName}${qtyText}` : `${lid}${qtyText}`;

      list.push({
        lineId: lid,
        label,
        record: r,
        isActive: true,
        productionQty: qty
      });
    });

    list.sort((a, b) => a.lineId.localeCompare(b.lineId));
    return list;
  }, [combinedDatasets, selectedDate, machineMaster]);

  // Registered factory lines that are idle on selected date
  const idleLinesForDate = useMemo(() => {
    const activeLineIds = new Set(activeLinesForDate.map((item) => item.lineId));
    const list = [];

    machineMaster.forEach((m) => {
      if (!activeLineIds.has(m.id)) {
        list.push({
          lineId: m.id,
          label: `${m.id} - ${m.name} (Idle / 0 Pcs)`,
          record: null,
          isActive: false,
          productionQty: 0
        });
      }
    });

    list.sort((a, b) => a.lineId.localeCompare(b.lineId));
    return list;
  }, [activeLinesForDate, machineMaster]);

  const hasOperatingLinesOnDate = activeLinesForDate.length > 0;

  // Lines to display in machine selector (filtered active lines by default, or all factory lines)
  const displayLines = useMemo(() => {
    if (hasOperatingLinesOnDate && !showAllLines) {
      return activeLinesForDate;
    }
    return [...activeLinesForDate, ...idleLinesForDate];
  }, [hasOperatingLinesOnDate, showAllLines, activeLinesForDate, idleLinesForDate]);

  // Canonical machine ID of the active report for robust, unambiguous binding
  const canonicalCurrentLineId = useMemo(() => {
    const rawId = report?.header?.lineId;
    if (!rawId) return 'L-01';
    const matched = matchMachine(rawId, machineMaster);
    return matched?.id || rawId;
  }, [report?.header?.lineId, machineMaster]);

  // Ensure current machine is always in the dropdown options so value binding never breaks
  const displayLinesWithCurrent = useMemo(() => {
    if (!canonicalCurrentLineId) return displayLines;
    const exists = displayLines.some((item) => item.lineId === canonicalCurrentLineId);
    if (exists) return displayLines;

    const matched = matchMachine(canonicalCurrentLineId, machineMaster);
    const mName = matched?.name || canonicalCurrentLineId;
    const fallbackItem = {
      lineId: canonicalCurrentLineId,
      label: `${canonicalCurrentLineId} - ${mName} (Idle / 0 Pcs)`,
      record: null,
      isActive: false,
      productionQty: 0
    };
    return [...displayLines, fallbackItem];
  }, [displayLines, canonicalCurrentLineId, machineMaster]);

  const loadAndBindReportForLineAndDate = useCallback((targetDate, targetLineId) => {
    if (!targetDate || !targetLineId) return;

    const matchedMachineObj = matchMachine(targetLineId, machineMaster);
    const canonicalId = matchedMachineObj?.id || targetLineId;

    // Step a: Find matching record in the ingested production log for targetDate + targetLineId
    let activeRecord = null;

    // 1. Check activeLinesForDate first if targetDate matches selectedDate
    if (targetDate === selectedDate && activeLinesForDate.length > 0) {
      const foundInActive = activeLinesForDate.find(
        (item) => (item.lineId === canonicalId || item.lineId === targetLineId) && item.record
      );
      if (foundInActive) {
        activeRecord = foundInActive.record;
      }
    }

    // 2. Query production records across combined datasets
    if (!activeRecord) {
      const matchedRecords = queryProductionRecords({
        dataset: combinedDatasets,
        date: targetDate,
        machine: canonicalId,
        machineMaster
      });
      if (matchedRecords.length > 0) {
        const consolidated = consolidateDailyMachineRecords(matchedRecords, machineMaster);
        activeRecord = consolidated.find(isRecordOperating) || consolidated[0];
      }
    }

    // 3. Fallback: Direct scan across combinedDatasets
    if (!activeRecord && Array.isArray(combinedDatasets)) {
      const directMatches = combinedDatasets.filter((r) => {
        const rDate = r.Date ?? r.date ?? r['DATE'];
        const rMachine = r.Machine ?? r.machine ?? r.machineRaw ?? r.machineName ?? r.machineId;
        return isDateMatch(rDate, targetDate) && isMachineMatch(rMachine, canonicalId, machineMaster);
      });
      if (directMatches.length > 0) {
        const normalizedList = directMatches.map((m) => normalizeProductionRow(m, machineMaster));
        const consolidated = consolidateDailyMachineRecords(normalizedList, machineMaster);
        activeRecord = consolidated.find(isRecordOperating) || consolidated[0];
      }
    }

    // If no matching operating record found, generate clean blank report for that machine and date
    if (!activeRecord) {
      const blankRep = blankReportForMachine(targetDate, canonicalId, machineMaster);
      setReport(blankRep);
      savePersistedActiveReport(blankRep);
      notify(`Selected ${canonicalId} (${targetDate}): No records found (Blank/Zero State)`);
      return blankRep;
    }

    // Step b: Automatically populate the report header (specs, target output, line speed, nominal capacity)
    let newRep = convertLogRowToReport(activeRecord);

    // Step c: Automatically populate or synthesize active 24-hour slots with imported pieces/run data
    const totalActual = Number(newRep.summary?.totalOutput) || Number(activeRecord.productionQty) || 0;
    const slotSum = Array.isArray(newRep.slots)
      ? newRep.slots.reduce((sum, s) => sum + (Number(s.actual) || 0), 0)
      : 0;

    if (totalActual > 0 && (slotSum === 0 || !newRep.slots || newRep.slots.length !== 24)) {
      const reconciled = reconcileShiftRun(newRep, {
        totalActualPieces: totalActual
      });
      newRep.slots = reconciled.updatedSlots;
    }

    // Step d: Ensure internal cached report for that line/date is updated reactively via setReport and forces clean UI re-render
    newRep = {
      ...newRep,
      id: newId(),
      updatedAt: Date.now()
    };
    setReport(newRep);
    savePersistedActiveReport(newRep);

    notify(`Auto-bound production log for ${canonicalId} (${targetDate}): ${newRep.summary.totalOutput} Pcs`);
    return newRep;
  }, [
    machineMaster,
    selectedDate,
    activeLinesForDate,
    combinedDatasets,
    notify
  ]);

  const handleToolbarDateChange = (newDate) => {
    if (!newDate || newDate === selectedDate) return;

    // Reset showAllLines back to false (default to active only for new date)
    setShowAllLines(false);

    // Query operating records for newDate across combined datasets
    const allForNewDate = queryProductionRecordsForDate({
      dataset: combinedDatasets,
      date: newDate,
      machineMaster
    });

    if (allForNewDate.length > 0) {
      const consolidated = consolidateDailyMachineRecords(allForNewDate, machineMaster);
      const operatingRecords = consolidated.filter(isRecordOperating);
      const candidateRecords = operatingRecords.length > 0 ? operatingRecords : consolidated;

      // Prefer currently selected machine if it also operated on newDate
      const currentLineMatch = candidateRecords.find((r) => {
        const mid = matchMachine(r.machineId || r.machineRaw, machineMaster)?.id;
        return mid === canonicalCurrentLineId;
      });

      const targetRecord = currentLineMatch || candidateRecords[0];
      const targetMachineId = targetRecord.machineId || targetRecord.machineRaw;
      const canonicalTargetId = matchMachine(targetMachineId, machineMaster)?.id || targetMachineId || 'L-01';

      loadAndBindReportForLineAndDate(newDate, canonicalTargetId);
      return;
    }

    // No operating records for any machine on newDate -> Keep current machine or L-01 in blank state
    const targetLineId = canonicalCurrentLineId || 'L-01';
    loadAndBindReportForLineAndDate(newDate, targetLineId);
  };

  const handleToolbarLineChange = (targetLineId) => {
    if (!targetLineId) return;

    if (targetLineId === '__TOGGLE_ALL__' || targetLineId === '__SHOW_ALL__' || targetLineId === '__SHOW_ACTIVE__') {
      setShowAllLines((prev) => !prev);
      return;
    }

    loadAndBindReportForLineAndDate(selectedDate, targetLineId);
  };

  const handleApplyReconciliation = useCallback(({ updatedSlots, totalActualPieces }) => {
    update((r) => {
      r.slots = updatedSlots;
      r.summary = {
        ...r.summary,
        totalOutput: totalActualPieces
      };
      return r;
    });
    notify('Shift run auto-reconciled successfully! 24h slots and OEE recomputed.');
    setIsReconcileModalOpen(false);
  }, [update, notify]);

  useImperativeHandle(ref, () => ({
    handleSave,
    save: handleSave,
    openBlankSopPrint: () => setIsPrintChoiceModalOpen(true),
    openAutoReconcile: () => setIsReconcileModalOpen(true),
    exportSingleExcel: () => handleExportExcelSingle(),
    exportAllExcel: () => handleExportExcelAll(),
    exportDateRange: (from, to) => exportDateRangeToExcel(records, from, to, machineMaster),
    getRecords: () => records,
    getMachineMaster: () => machineMaster,
    getCurrentReport: () => report
  }), [handleSave, handleExportExcelSingle, handleExportExcelAll, records, machineMaster, report]);

  return (
    <div className={`app-root tab-${tab} ${tab === 'analytics' ? 'print-analytics-active' : ''} ${isLaserMonochrome ? 'theme-laser-monochrome' : ''}`}>
      <header className="app-header no-print">
        <div className="app-title">
          <div className="app-brand">PVC Pipe Daily Monitoring Report</div>
          <div className="app-sub">
            {PLANT_NAME} &middot; {SOP_REF} &middot; Version {DOC_VERSION} &middot; Standardized
          </div>
        </div>
        <div className="app-actions">
          <button
            type="button"
            className="btn btn-supervisor-header-quick"
            onClick={() => setIsPrintChoiceModalOpen(true)}
            title={isAr ? "مشرف الإنتاج: طباعة وتوليد شيت الصباح الفارغ لخطوط المصنع (DOC-Ext.-03)" : "Production Supervisor: Generate & Print Morning Blank SOP (DOC-Ext.-03)"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginInlineEnd: 4 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            {isAr ? 'شيت الصباح الفارغ (مشرف الإنتاج)' : 'Morning Blank SOP (Supervisor)'}
          </button>
          <a
            href="./Master_Upload.xlsx"
            download="Master_Upload.xlsx"
            className="btn btn-ghost"
            title="Download Master Consolidated Workbook (Log & Machine Master)"
          >
            Master Upload Excel
          </a>
          <button type="button" className="btn btn-ghost" onClick={openHistory}>
            History
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset}>
            New Report
          </button>
        </div>
      </header>

      <nav className="app-tabs no-print">
        <button
          type="button"
          className={'tab' + (tab === 'uploader' ? ' active' : '')}
          onClick={() => setTab('uploader')}
        >
          Excel Production Log Uploader
        </button>
        <button
          type="button"
          className={'tab' + (tab === 'analytics' ? ' active' : '')}
          onClick={() => setTab('analytics')}
        >
          Plant Analytics
        </button>
        <button
          type="button"
          className={'tab' + (tab === 'sheet' ? ' active' : '')}
          onClick={() => setTab('sheet')}
          disabled={!derived}
        >
          24-Hour Production Sheet {derived ? <span className="tab-badge" /> : null}
        </button>
      </nav>

      {/* Uploader View */}
      <main className="app-main no-print" style={{ display: tab === 'uploader' ? undefined : 'none' }}>
        <ExcelUploader
          records={records}
          machineMaster={machineMaster}
          onWorkbookParsed={handleWorkbookParsed}
          onSelectReport={handleSelectFromUploader}
          onNotify={notify}
        />
      </main>

      {/* Analytics View */}
      <main
        className={`app-main analytics-main ${tab === 'analytics' ? 'print-analytics-active' : 'no-print'}`}
        style={{ display: tab === 'analytics' ? undefined : 'none' }}
      >
        <PlantAnalytics
          records={records}
          machineMaster={machineMaster}
          onSelectReport={handleSelectFromUploader}
          onSwitchTab={setTab}
          onNotify={notify}
          isMonochrome={isLaserMonochrome}
          onToggleMonochrome={setIsLaserMonochrome}
          onExportSop={handleExportSop}
        />
      </main>

      {/* Sheet View */}
      <div className={`sheet-stage ${tab === 'sheet' ? 'sheet-active' : 'no-print'}`} style={{ display: tab === 'sheet' ? undefined : 'none' }}>
        {derived ? (
          <>
            {/* Dedicated Hero Card for Production Supervisor Daily Blank SOP */}
            <div className="supervisor-hero-card no-print">
              <div className="supervisor-hero-info">
                <div className="supervisor-hero-badge">
                  <span className="supervisor-hero-pulse" />
                  {isAr ? 'بوابة مشرف الإنتاج اليومية | Production Supervisor Daily SOP' : 'Production Supervisor Daily SOP'}
                </div>
                <h2 className="supervisor-hero-title">
                  {isAr
                    ? 'طباعة وتوليد شيت الصباح الفارغ لخطوط الإنتاج (DOC-Ext.-03)'
                    : 'Generate & Print Morning Blank SOP (DOC-Ext.-03)'}
                </h2>
                <p className="supervisor-hero-desc">
                  {isAr
                    ? 'إعداد وتجهيز نماذج المتابعة الميدانية ودفاتر تشغيل الورديات اليومية فارغة مع ربط أكواد المنتجات (Product Code) ومواصفات كل ماكينة قبل بدء دورة العمل.'
                    : 'Prepare empty daily shift log sheets with automated Product Code binding and machine nominal specs prior to shift operational start.'}
                </p>
              </div>
              <div className="supervisor-hero-actions">
                <button
                  type="button"
                  className="btn btn-supervisor-hero"
                  onClick={() => setIsPrintChoiceModalOpen(true)}
                  title={isAr ? "فتح وحدة إعداد وتجهيز شيت الصباح الفارغ لجميع خطوط الإنتاج" : "Open Morning Blank SOP Generator & Batch Print Module"}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" style={{ marginInlineEnd: 8 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span>{isAr ? 'طباعة شيت الصباح الفارغ (DOC-Ext.-03)' : 'Print Blank Morning SOP (DOC-Ext.-03)'}</span>
                </button>
              </div>
            </div>

            <div className="sheet-toolbar no-print">
              <div className="sheet-toolbar-left">
                <div className="sheet-selectors-row">
                  <div className="sheet-selector-group">
                    <label htmlFor="sheet-date-select" className="sheet-selector-label">Date:</label>
                    <select
                      id="sheet-date-select"
                      className="sheet-select"
                      value={selectedDate}
                      onChange={(e) => handleToolbarDateChange(e.target.value)}
                      disabled={selectableDates.length === 0}
                    >
                      {selectableDates.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sheet-selector-group machine-selector-group">
                    <label htmlFor="sheet-machine-select" className="sheet-selector-label">Line / Machine:</label>
                    <div className="machine-select-wrapper">
                      <select
                        id="sheet-machine-select"
                        className="sheet-select machine-select"
                        value={canonicalCurrentLineId}
                        onChange={(e) => handleToolbarLineChange(e.target.value)}
                        disabled={displayLinesWithCurrent.length === 0}
                      >
                        {displayLinesWithCurrent.length === 0 ? (
                          <option value="" disabled>No Active Lines (Factory Stop)</option>
                        ) : (
                          displayLinesWithCurrent.map((item) => (
                            <option key={item.lineId} value={item.lineId}>{item.label}</option>
                          ))
                        )}
                        {hasOperatingLinesOnDate && (
                          <option value="__TOGGLE_ALL__">
                            --- {showAllLines ? 'Filter Active Lines Only' : 'Show All Lines (Including Idle)'} ---
                          </option>
                        )}
                      </select>

                      {hasOperatingLinesOnDate && (
                        <button
                          type="button"
                          className={`btn-line-toggle ${showAllLines ? 'active' : ''}`}
                          onClick={() => setShowAllLines((prev) => !prev)}
                          title={showAllLines ? 'Filter to active operating lines only' : 'Show all factory lines including idle'}
                        >
                          {showAllLines ? 'Active Only' : 'Show All'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <span className="kicker-note">
                  Auto-distributed 24-hour log. Hourly cells are editable; subtotals and OEE recompute live.
                </span>
              </div>
              <div className="sheet-toolbar-right">
                <div className="view-mode-selector" title="Select between detailed 24-hour hourly log, 12-hour mobile shift summary, and legacy plant SOP document">
                  <span className="view-mode-label">View Mode:</span>
                  <div className="view-mode-toggle-group">
                    <button
                      type="button"
                      className={`view-mode-btn ${viewMode === 'hourly' ? 'active' : ''}`}
                      onClick={() => setViewMode('hourly')}
                    >
                      24-Hour Hourly (Detailed)
                    </button>
                    <button
                      type="button"
                      className={`view-mode-btn ${viewMode === 'shift' ? 'active' : ''}`}
                      onClick={() => setViewMode('shift')}
                    >
                      12-Hour Shift Summary (Mobile)
                    </button>
                    <button
                      type="button"
                      className={`view-mode-btn ${viewMode === 'sop' ? 'active' : ''}`}
                      onClick={() => setViewMode('sop')}
                    >
                      Legacy SOP (DOC-Ext.-03)
                    </button>
                  </div>
                </div>

                <label
                  className="laser-toggle-label"
                  title="Preview high-contrast grayscale theme optimized for black & white laser printing"
                >
                  <input
                    type="checkbox"
                    checked={isLaserMonochrome}
                    onChange={(e) => setIsLaserMonochrome(e.target.checked)}
                  />
                  <span>Laser B&W Theme</span>
                </label>
                <button
                  type="button"
                  className="btn btn-reconcile"
                  onClick={() => setIsReconcileModalOpen(true)}
                  disabled={activeLinesForDate.length === 0 || !report?.slots || report.slots.length === 0}
                  title="Auto-reconcile 24h run and reverse estimate slot production across operating hours"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                    <path d="M12 20v-6M6 20V10M18 20V4" />
                  </svg>
                  Auto-Reconcile Shift Run
                </button>
                <button type="button" className="btn btn-ghost" onClick={handleSave}>
                  Save to History
                </button>
                <button
                  type="button"
                  className="btn btn-export-current"
                  onClick={() => openExportModal('current')}
                  disabled={activeLinesForDate.length === 0}
                  title="Export active line report in Modern or SOP format (PDF / Excel)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export Current Line
                </button>
                <button
                  type="button"
                  className="btn btn-export-all"
                  onClick={() => openExportModal('all')}
                  disabled={activeLinesForDate.length === 0}
                  title={`Export all operating lines for ${selectedDate} in Modern or SOP format (PDF / Excel)`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                  Export All Lines
                  {activeLinesForDate.length > 0 ? (
                    <span className="export-all-count-badge">{activeLinesForDate.length}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="btn btn-export-range"
                  onClick={() => openExportModal('range')}
                  disabled={records.length === 0}
                  title="Export all operating lines across a date range in Modern or SOP format (PDF / Excel)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Export Date Range
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-print"
                  onClick={() => {
                    notify(isAr ? 'تأكد من اختيار الاتجاه الأفقي (Landscape) وحجم A4 للحصول على أفضل طباعة' : 'Ensure Landscape orientation and A4 size in the print dialog for best fit.');
                    setTimeout(() => window.print(), 150);
                  }}
                  disabled={activeLinesForDate.length === 0}
                  title="Print active production sheet via browser print dialog"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 5 }}>
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print
                </button>
              </div>
            </div>

            {records.length > 0 && activeLinesForDate.length === 0 ? (
              <div className="factory-stop-banner no-print">
                <div className="factory-stop-icon">🏭 🛑</div>
                <div className="factory-stop-title">
                  No Active Lines on {selectedDate}
                </div>
                <div className="factory-stop-text">
                  All extrusion lines were idle or shut down on this date (Factory Stop / Weekend / 0 Operating Hours). No active production log was recorded.
                </div>
                <div className="factory-stop-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setTab('analytics')}
                  >
                    View Plant Analytics
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setTab('uploader')}
                  >
                    Go to Excel Log Uploader
                  </button>
                </div>
              </div>
            ) : (
              <>
                <KpiStrip derived={derived} />

                <FitScale>
                  {isBlankSopPrint ? (
                    <LegacySopSheet
                      ref={sheetRef}
                      isBlank={true}
                      isExporting={true}
                    />
                  ) : viewMode === 'sop' ? (
                    <LegacySopSheet
                      ref={sheetRef}
                      report={report}
                      derived={derived}
                      isExporting={isExporting || isExportingSop}
                    />
                  ) : (
                    <ReportSheet
                      ref={sheetRef}
                      report={report}
                      derived={derived}
                      onPatchSlot={patchSlot}
                      isMonochrome={isLaserMonochrome}
                      isExporting={isExporting}
                      viewMode={viewMode}
                    />
                  )}
                </FitScale>
              </>
            )}
          </>
        ) : (
          <div className="sheet-empty no-print">
            <div className="sheet-empty-title">No 24-hour log generated yet</div>
            <div className="sheet-empty-text">
              Select a production record from the Excel Uploader or Plant Analytics dashboard to generate and inspect its 24-hour follow sheet.
            </div>
            <div style={{ marginTop: '16px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={() => setTab('uploader')}>
                Go to Excel Log Uploader
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setTab('analytics')}>
                Go to Plant Analytics
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dedicated Off-Screen Staging Area for Background DOC-Ext.-03 SOP PDF Export */}
      {derived ? (
        <div
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            width: '1080px',
            height: '100%',
            maxHeight: '205mm',
            overflow: 'hidden',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -1
          }}
        >
          <LegacySopSheet
            ref={sopExportRef}
            report={report}
            derived={derived}
            isExporting={true}
          />
        </div>
      ) : null}

      {/* Dedicated Off-Screen Staging Area for Blank DOC-Ext.-03 SOP Template PDF Export */}
      <div
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '1080px',
          height: '100%',
          maxHeight: '205mm',
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -1
        }}
      >
        <LegacySopSheet
          ref={blankSopExportRef}
          isBlank={true}
          isExporting={true}
        />
      </div>

      {/* Batch Export Staging Area */}
      {batchItem ? (
        <div
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            width: batchItem.template === 'sop' ? '1080px' : '1120px',
            height: '100%',
            maxHeight: '205mm',
            overflow: 'hidden',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -1
          }}
        >
          {batchItem.template === 'sop' ? (
            <LegacySopSheet
              ref={batchSopRef}
              report={batchItem.report}
              derived={batchItem.derived}
              isExporting={true}
            />
          ) : (
            <div ref={batchSheetRef}>
              <ReportSheet
                report={batchItem.report}
                derived={batchItem.derived}
                onPatchSlot={() => {}}
                onPatchRef={() => {}}
                viewMode="hourly"
                isExporting={true}
                isMonochrome={isLaserMonochrome}
              />
            </div>
          )}
        </div>
      ) : null}

      {/* Unified Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={closeExportModal}
        initialScope={exportModalScope}
        selectedDate={selectedDate}
        availableDates={availableDates.length > 0 ? availableDates : selectableDates}
        currentLineLabel={lineLabel}
        activeLinesCount={activeLinesForDate.length}
        isExporting={isExporting || isExportingSop}
        exportProgressText={exportProgressText}
        onConfirmExport={handleConfirmExport}
      />

      {/* Batch Print Container for Morning SOP Sheets (Multi-Page Print) */}
      {sopBatchPrintModels && sopBatchPrintModels.length > 0 ? (
        <div className="sop-batch-container">
          {sopBatchPrintModels.map((m, idx) => (
            <div className="sop-batch-page" key={`print_batch_${m.lineCode || idx}`}>
              <LegacySopSheet model={m} isBlank={true} isExporting={true} />
            </div>
          ))}
        </div>
      ) : null}

      {/* Dedicated Off-Screen Staging Area for Morning SOP PDF Export */}
      {sopBatchPrintModels && sopBatchPrintModels.length > 0 ? (
        <div
          ref={morningPdfExportRef}
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            width: '1080px',
            overflow: 'hidden',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -1
          }}
        >
          {sopBatchPrintModels.map((m, idx) => (
            <div
              key={`morning_pdf_stage_${m.lineCode || idx}`}
              className="sop-batch-page"
              style={{
                pageBreakAfter: idx < sopBatchPrintModels.length - 1 ? 'always' : 'auto',
                breakAfter: idx < sopBatchPrintModels.length - 1 ? 'page' : 'auto',
                marginBottom: '10px'
              }}
            >
              <LegacySopSheet model={m} isBlank={true} isExporting={true} />
            </div>
          ))}
        </div>
      ) : null}

      {/* Morning SOP Print Mode Choice Modal (Option A vs Option B) */}
      <PrintSopChoiceModal
        isOpen={isPrintChoiceModalOpen}
        onClose={() => setIsPrintChoiceModalOpen(false)}
        onSelectUniversalBlankPrint={handleTriggerUniversalBlankPrint}
        onSelectUniversalBlankPdf={handleTriggerUniversalBlankPdf}
        onSelectConfiguredBatch={handleOpenConfiguredBatchModal}
        isGenerating={isGeneratingMorningPdf}
      />

      {/* Option B: Intelligent Morning Blank SOP Generator Modal */}
      <PrintSopModal
        isOpen={isPrintSopModalOpen}
        onClose={() => setIsPrintSopModalOpen(false)}
        records={records}
        selectedDate={selectedDate}
        currentMachineId={report?.header?.lineId || 'L-01'}
        machineMaster={machineMaster}
        onConfirmPrint={handleTriggerMorningSopPrint}
        onConfirmPdf={handleTriggerMorningSopPdf}
        onOpenUniversalBlank={handleTriggerUniversalBlankPrint}
        isGenerating={isGeneratingMorningPdf}
        lang={lang}
      />

      {/* Reverse OEE Auto-Reconciler & Distribution Modal */}
      <AutoReconcileModal
        isOpen={isReconcileModalOpen}
        onClose={() => setIsReconcileModalOpen(false)}
        report={report}
        derived={derived}
        machineMaster={machineMaster}
        dataset={combinedDatasets}
        onApply={handleApplyReconciliation}
      />

      {toast ? <div className="toast no-print">{toast}</div> : null}

      {historyOpen ? (
        <HistoryDrawer
          items={historyItems.length > 0 ? historyItems : loadAll()}
          isLoading={isHistoryLoading}
          currentId={report.id}
          onClose={() => setHistoryOpen(false)}
          onLoad={handleLoad}
          onDelete={handleDelete}
        />
      ) : null}

    </div>
  );
});

export default DailyEvaluationView;

