import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Save,
  Download,
  Sliders,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Layers,
  ArrowRight,
  Filter
} from 'lucide-react';
import { MACHINES } from '../../config/machines.js';
import {
  saveReportByDateAndMachine,
  loadReportByDateAndMachine,
  savePersistedActiveReport
} from '../../data/store.js';
import {
  buildMatrixRowsForDate,
  calculateMatrixRowMetrics,
  applyMatrixRowInput,
  autoBalanceRowHours,
  reconcileMatrixRow,
  exportMatrixToWorkbook,
  MATRIX_DOWNTIME_CATEGORIES,
  calculateMultiRunMachineStatus,
  applyCoupledMultiRunInput,
  autoBalanceMultiRunMachine,
  syncMultiRunRowStatuses,
  round1
} from '../../logic/reconciliationMatrixHelper.js';
import { getMachineNominalCapacity } from '../../logic/machineSettingsConfig.js';
import RateEstimatorPopover from './RateEstimatorPopover.jsx';
import * as XLSX from 'xlsx';

export default function DailyReconciliationMatrixView({
  records = [],
  combinedDatasets = [],
  machineMaster = MACHINES,
  selectedDate: initialSelectedDate,
  onDateChange,
  onSelectMachineAndOpenSheet,
  onReportSaved,
  onNotify,
  availableDates = []
}) {
  const [selectedDate, setSelectedDate] = useState(() => {
    if (initialSelectedDate && !initialSelectedDate.startsWith('2024-')) {
      return initialSelectedDate;
    }
    const d = new Date();
    const off = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return off.toISOString().slice(0, 10);
  });

  // Sync selectedDate with prop updates
  useEffect(() => {
    if (initialSelectedDate && initialSelectedDate !== selectedDate) {
      setSelectedDate(initialSelectedDate);
    }
  }, [initialSelectedDate]);

  // Filter state: show operating lines only vs all machines
  const [showOperatingOnly, setShowOperatingOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Rows state for the selected date
  const [rows, setRows] = useState([]);
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Initialize or re-fetch rows when selectedDate or datasets change
  useEffect(() => {
    if (!selectedDate) return;
    const initialRows = buildMatrixRowsForDate({
      date: selectedDate,
      machineMaster,
      combinedDatasets,
      loadReportByDateAndMachineFn: (d, m) => loadReportByDateAndMachine(d, m)
    });
    setRows(initialRows);
  }, [selectedDate, machineMaster, combinedDatasets]);

  // Handle date navigation (<, >, Today)
  const handleDateChangeInternal = (newDate) => {
    if (!newDate) return;
    setSelectedDate(newDate);
    if (typeof onDateChange === 'function') {
      onDateChange(newDate);
    }
  };

  const handlePrevDay = () => {
    const cur = new Date(selectedDate);
    if (Number.isNaN(cur.getTime())) return;
    cur.setDate(cur.getDate() - 1);
    const dStr = cur.toISOString().slice(0, 10);
    handleDateChangeInternal(dStr);
  };

  const handleNextDay = () => {
    const cur = new Date(selectedDate);
    if (Number.isNaN(cur.getTime())) return;
    cur.setDate(cur.getDate() + 1);
    const dStr = cur.toISOString().slice(0, 10);
    handleDateChangeInternal(dStr);
  };

  const handleToday = () => {
    const d = new Date();
    const off = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    const dStr = off.toISOString().slice(0, 10);
    handleDateChangeInternal(dStr);
  };

  // Update a single field in a row and dynamically recompute all row metrics with reactive rebalancing
  const handleCellChange = (lineId, field, rawValue) => {
    setRows((prev) => applyCoupledMultiRunInput(prev, lineId, field, rawValue));
  };

  // On blur, normalize empty string to 0
  const handleCellBlur = (lineId, field) => {
    setRows((prev) => {
      const target = prev.find((r) => r.lineId === lineId);
      if (!target) return prev;
      if (target[field] === '' || target[field] == null) {
        return applyCoupledMultiRunInput(prev, lineId, field, 0);
      }
      return prev;
    });
  };

  // Auto-balance a single row to 24h
  const handleAutoBalanceRow = (lineId, mode = 'adjust_op') => {
    const row = rows.find((r) => r.lineId === lineId);
    if (row && (row.isMultiRun || row.totalRuns > 1) && (row.parentLineId || row.baseLineId)) {
      const pId = row.parentLineId || row.baseLineId;
      setRows((prev) => autoBalanceMultiRunMachine(prev, pId));
      if (onNotify) {
        onNotify(`Auto-balanced Machine ${pId} across all runs to 24.0 hours.`);
      }
    } else {
      setRows((prev) =>
        prev.map((r) => {
          if (r.lineId !== lineId) return r;
          return autoBalanceRowHours(r, mode);
        })
      );
      if (onNotify) {
        onNotify(`Auto-balanced Line ${lineId} to 24.0 hours.`);
      }
    }
  };

  // Auto-balance all rows that have remaining unaccounted hours
  const handleAutoBalanceAll = () => {
    let balancedCount = 0;
    setRows((prev) => {
      let current = [...prev];
      const processedParents = new Set();
      current.forEach((r) => {
        if ((r.isMultiRun || r.totalRuns > 1) && (r.parentLineId || r.baseLineId)) {
          const pId = r.parentLineId || r.baseLineId;
          if (!processedParents.has(pId)) {
            processedParents.add(pId);
            const status = calculateMultiRunMachineStatus(current, pId);
            if (status && status.machineBalanceStatus !== 'balanced') {
              balancedCount += 1;
              current = autoBalanceMultiRunMachine(current, pId);
            }
          }
        }
      });
      current = current.map((r) => {
        if (!r.isMultiRun && !(r.totalRuns > 1) && r.balanceStatus !== 'balanced') {
          balancedCount += 1;
          return autoBalanceRowHours(r, 'adjust_op');
        }
        return r;
      });
      return current;
    });
    if (onNotify) {
      onNotify(`Auto-balanced ${balancedCount} line(s) to 24.0 hours.`);
    }
  };

  // Reconcile and save an individual line
  const handleReconcileAndSaveRow = useCallback(
    (lineId) => {
      const row = rows.find((r) => r.lineId === lineId);
      if (!row) return;

      const targetLineId = (row.isMultiRun && (row.runId || row.lineId)) ? (row.runId || row.lineId) : (row.baseLineId || row.lineId);
      const baseReport = loadReportByDateAndMachine(selectedDate, targetLineId);
      const reconciledRep = reconcileMatrixRow(row, baseReport, machineMaster);

      // Persist report in storage
      saveReportByDateAndMachine(reconciledRep);
      savePersistedActiveReport(reconciledRep);

      // Mark row as saved/reconciled in state
      setRows((prev) =>
        prev.map((r) => (r.lineId === lineId ? { ...r, isSaved: true, isReconciled: true } : r))
      );

      if (typeof onReportSaved === 'function') {
        onReportSaved(reconciledRep);
      }

      if (onNotify) {
        onNotify(`Line ${row.lineIdDisplay || lineId} (${row.lineName}) reconciled & saved successfully!`);
      }
    },
    [rows, selectedDate, machineMaster, onReportSaved, onNotify]
  );

  // Reconcile and save all lines across the plant for this date
  const handleReconcileAndSaveAll = useCallback(async () => {
    if (rows.length === 0) return;
    setIsSavingAll(true);

    try {
      let savedCount = 0;
      let lastReconciled = null;

      rows.forEach((row) => {
        const targetLineId = (row.isMultiRun && (row.runId || row.lineId)) ? (row.runId || row.lineId) : (row.baseLineId || row.lineId);
        const baseReport = loadReportByDateAndMachine(selectedDate, targetLineId);
        const reconciledRep = reconcileMatrixRow(row, baseReport, machineMaster);
        saveReportByDateAndMachine(reconciledRep);
        savedCount += 1;
        lastReconciled = reconciledRep;
      });

      if (lastReconciled) {
        savePersistedActiveReport(lastReconciled);
        if (typeof onReportSaved === 'function') {
          onReportSaved(lastReconciled);
        }
      }

      setRows((prev) =>
        prev.map((r) => ({ ...r, isSaved: true, isReconciled: true }))
      );

      if (onNotify) {
        onNotify(`Successfully reconciled and saved all ${savedCount} lines for ${selectedDate}!`);
      }
    } catch (err) {
      console.error('Error during batch reconciliation:', err);
      if (onNotify) {
        onNotify(`Error saving all lines: ${err.message}`, 'error');
      }
    } finally {
      setIsSavingAll(false);
    }
  }, [rows, selectedDate, machineMaster, onReportSaved, onNotify]);

  // Export Reconciliation Matrix to Excel
  const handleExportExcel = () => {
    if (rows.length === 0) {
      if (onNotify) onNotify('No rows to export.');
      return;
    }
    const wb = exportMatrixToWorkbook(rows, selectedDate);
    XLSX.writeFile(wb, `Daily_Reconciliation_Matrix_${selectedDate}.xlsx`);
    if (onNotify) onNotify(`Exported Daily Reconciliation Matrix for ${selectedDate}`);
  };

  // Filtered rows for display
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const isRowOperating = Number(r.actualPcs) > 0 || Number(r.operatingHours) > 0;
      if (showOperatingOnly && !isRowOperating) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const lineMatch = r.lineId.toLowerCase().includes(query) ||
          (r.baseLineId && r.baseLineId.toLowerCase().includes(query)) ||
          (r.lineIdDisplay && r.lineIdDisplay.toLowerCase().includes(query));
        const nameMatch = r.lineName.toLowerCase().includes(query);
        const codeMatch = (r.productCode || '').toLowerCase().includes(query);
        const sizeMatch = (r.pipeSize || '').toLowerCase().includes(query) || (r.productDescription || '').toLowerCase().includes(query);
        if (!lineMatch && !nameMatch && !codeMatch && !sizeMatch) return false;
      }
      return true;
    });
  }, [rows, showOperatingOnly, searchQuery]);

  // Aggregate KPI metrics across the plant
  const plantSummary = useMemo(() => {
    const totalExpectedKg = rows.reduce((s, r) => s + (Number(r.expectedKg) || 0), 0);
    const totalExpectedPcs = rows.reduce((s, r) => s + (Number(r.expectedPcs) || 0), 0);
    const totalActualKg = rows.reduce((s, r) => s + (Number(r.actualKg) || 0), 0);
    const totalActualPcs = rows.reduce((s, r) => s + (Number(r.actualPcs) || 0), 0);
    const totalScrapKg = rows.reduce((s, r) => s + (Number(r.scrapKg) || 0), 0);
    const totalLostHours = rows.reduce((s, r) => s + (Number(r.lostHours) || 0), 0);
    const totalUnjustifiedLostHours = rows.reduce((s, r) => s + (Number(r.unjustifiedLostHours) || 0), 0);
    const balancedCount = rows.filter((r) => r.balanceStatus === 'balanced').length;
    const operatingCount = rows.filter((r) => Number(r.actualPcs) > 0 || Number(r.operatingHours) > 0).length;

    const opHoursSum = rows.reduce((s, r) => s + (Number(r.operatingHours) || 0), 0);
    const maxCapacityHours = rows.length * 24;
    const avgAvailability = maxCapacityHours > 0 ? (opHoursSum / maxCapacityHours) * 100 : 0;

    // Operating rows average OEE
    const operatingRows = rows.filter((r) => Number(r.actualPcs) > 0 || Number(r.operatingHours) > 0);
    const avgOee = operatingRows.length > 0
      ? operatingRows.reduce((s, r) => s + (Number(r.oeePct) || 0), 0) / operatingRows.length
      : 0;
    const avgPerformance = operatingRows.length > 0
      ? operatingRows.reduce((s, r) => s + (Number(r.performancePct) || 0), 0) / operatingRows.length
      : 0;
    const avgQuality = operatingRows.length > 0
      ? operatingRows.reduce((s, r) => s + (Number(r.qualityPct) || 100), 0) / operatingRows.length
      : 100;

    return {
      totalExpectedKg,
      totalExpectedPcs,
      totalActualKg,
      totalActualPcs,
      totalScrapKg,
      totalLostHours,
      totalUnjustifiedLostHours,
      balancedCount,
      operatingCount,
      avgAvailability,
      avgPerformance,
      avgQuality,
      avgOee
    };
  }, [rows]);

  return (
    <div className="w-full flex flex-col gap-4 py-2">
      {/* Top Banner & Control Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Left: Title & Purpose */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">
                Daily Production &amp; Lost Hours Reconciliation Matrix
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                All Lines 24h
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Consolidated operational view: Lost output calculation, lost hours conversion, and inline 24h downtime allocation.
            </p>
          </div>
        </div>

        {/* Center: Date Selector Strip */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-1.5 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={handlePrevDay}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer"
            title="Previous Day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 px-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChangeInternal(e.target.value)}
              className="bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer border-none"
            />
          </div>

          <button
            type="button"
            onClick={handleNextDay}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer"
            title="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleToday}
            className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition cursor-pointer shadow-sm ml-1"
          >
            Today
          </button>
        </div>

        {/* Right: Master Batch Actions */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={handleAutoBalanceAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition cursor-pointer shadow-sm"
            title="Automatically balance all lines with remaining unaccounted hours to 24.0h"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
            <span>Auto-Balance All to 24h</span>
          </button>

          <button
            type="button"
            onClick={handleReconcileAndSaveAll}
            disabled={isSavingAll}
            className="btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium tracking-wide bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-sm border border-transparent cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
            title="Calculate distribution, apply 24h slots, and save reports for all lines"
          >
            <Save className="w-3.5 h-3.5 text-white" style={{ stroke: '#ffffff', color: '#ffffff' }} />
            <span style={{ color: '#ffffff', fontWeight: 600 }}>{isSavingAll ? 'Saving All...' : 'Reconcile & Save All Lines'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition cursor-pointer shadow-sm"
            title="Download Matrix as formatted Excel spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export Matrix</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Theoretical Expected</span>
          <div className="text-sm font-bold text-slate-100 mt-1">
            {plantSummary.totalExpectedKg.toLocaleString()} <span className="text-xs font-normal text-slate-400">kg</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {plantSummary.totalExpectedPcs.toLocaleString()} pcs (24h)
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Reported Actual (FG)</span>
          <div className="text-sm font-bold text-emerald-400 mt-1">
            {plantSummary.totalActualKg.toLocaleString()} <span className="text-xs font-normal text-slate-400">kg</span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>{plantSummary.totalActualPcs.toLocaleString()} pcs</span>
            {plantSummary.totalScrapKg > 0 && (
              <span className="text-amber-400 font-semibold">{plantSummary.totalScrapKg.toLocaleString()} kg scrap</span>
            )}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Lost Production Time</span>
          <div className="text-sm font-bold text-rose-400 mt-1">
            {plantSummary.totalLostHours.toFixed(1)} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {plantSummary.totalUnjustifiedLostHours > 0
              ? `${plantSummary.totalUnjustifiedLostHours.toFixed(1)}h unjustified`
              : 'All lost time justified'}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">24h Balanced Lines</span>
          <div className="text-sm font-bold text-slate-100 mt-1">
            <span className={plantSummary.balancedCount === rows.length ? 'text-emerald-400' : 'text-amber-400'}>
              {plantSummary.balancedCount}
            </span>
            <span className="text-slate-400"> / {rows.length}</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {rows.length - plantSummary.balancedCount > 0
              ? `${rows.length - plantSummary.balancedCount} line(s) need balancing`
              : '100% 24h Accounted'}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Plant Availability</span>
          <div className="text-sm font-bold text-cyan-400 mt-1">
            {plantSummary.avgAvailability.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400">
            {plantSummary.operatingCount} active / {rows.length} lines
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Average Line OEE</span>
          <div className="text-sm font-bold text-indigo-400 mt-1">
            {plantSummary.avgOee.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400">
            Perf: {plantSummary.avgPerformance.toFixed(1)}% | Qual: {plantSummary.avgQuality.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Filter and Search Sub-bar */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Show:</span>
          </div>
          <button
            type="button"
            onClick={() => setShowOperatingOnly((prev) => !prev)}
            className={`px-3 py-1 text-xs rounded-lg transition cursor-pointer shadow-xs ${
              showOperatingOnly
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/50 font-medium'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60 font-medium'
            }`}
          >
            {showOperatingOnly ? 'Operating Only' : 'All Plant Machines (Including Idle)'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search line or product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48 sm:w-64"
          />
        </div>
      </div>

      {/* Wide Horizontal Scrollable Table with Sticky Headers & Viewport Scroll */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto overflow-y-auto max-h-[72vh] relative">
          <table className="w-full border-collapse text-left text-xs whitespace-nowrap min-w-[2000px]">
            {/* Top Multi-Header Row */}
            <thead className="sticky top-0 z-20 shadow-md bg-slate-900 border-b border-slate-800">
              <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <th colSpan={3} className="px-3 py-2 border-r border-slate-800 text-slate-300 bg-slate-950">
                  Machine &amp; Running Job Info
                </th>
                <th colSpan={3} className="px-3 py-2 border-r border-slate-800 text-blue-300 bg-blue-950/30">
                  Job Engineering Specs
                </th>
                <th colSpan={5} className="px-3 py-2 border-r border-slate-800 text-emerald-300 bg-emerald-950/20">
                  Production Balance (Theoretical vs Actual)
                </th>
                <th colSpan={8} className="px-3 py-2 border-r border-slate-800 text-amber-300 bg-amber-950/20">
                  24-Hour Time Allocation &amp; Realized Pace
                </th>
                <th colSpan={6} className="px-3 py-2 border-r border-slate-800 text-indigo-300 bg-indigo-950/20">
                  <div className="flex items-center justify-between">
                    <span>Audit &amp; Telemetry</span>
                    <span className="text-[9px] font-mono text-indigo-300/80 lowercase tracking-normal bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60">
                      Avail &times; Perf &times; Qual = OEE
                    </span>
                  </div>
                </th>
                <th className="px-3 py-2 text-center text-slate-300 bg-slate-950">
                  Actions
                </th>
              </tr>

              {/* Specific Column Names */}
              <tr className="bg-slate-900 text-slate-300 font-semibold border-b border-slate-800 text-[11px]">
                {/* Machine & Running Job Info */}
                <th className="px-3 py-2.5">Line ID</th>
                <th className="px-3 py-2.5">Machine Name</th>
                <th className="px-3 py-2.5 border-r border-slate-800" title="Running Pipe Size, Diameter, Wall Thickness &amp; Specs">
                  Running Pipe Size &amp; Specs
                </th>

                {/* Job Engineering Specs */}
                <th className="px-3 py-2.5" title="Configured Nominal Extrusion Capacity">
                  Nominal Cap (kg/h)
                </th>
                <th className="px-3 py-2.5" title="Pipe Unit Weight in kg">
                  Std Wt (kg/pc)
                </th>
                <th className="px-3 py-2.5 border-r border-slate-800" title="Standard Piece Rate per hour">
                  Std Rate (Pcs/h)
                </th>

                {/* Production Balance */}
                <th className="px-3 py-2.5" title="24-Hour Theoretical Capacity">
                  Expected (24h)
                </th>
                <th className="px-3 py-2.5" title="Reported Finished Goods Output">
                  Actual Output
                </th>
                <th className="px-2.5 py-2.5 text-amber-400 font-bold" title="Reported Scrap Output in kg">
                  Scrap (kg)
                </th>
                <th className="px-3 py-2.5 text-rose-300" title="Expected Output - Actual Output">
                  Deficit (Loss)
                </th>
                <th className="px-3 py-2.5 text-rose-400 font-bold border-r border-slate-800" title="Direct conversion: Deficit Pcs / Std Rate">
                  Lost Time (h)
                </th>

                {/* 24-Hour Time Allocation (Editable inputs & Realized Pace) */}
                <th className="px-2.5 py-2.5 text-emerald-400 font-bold bg-emerald-950/10">Operating (h)</th>
                <th className="px-2.5 py-2.5 text-center text-cyan-400 font-bold bg-cyan-950/20" title="Actual realized pace during reported operating hours: Pcs/h, kg/h &amp; Speed Efficiency %">
                  Actual Realized Rate
                </th>
                <th className="px-2.5 py-2.5">Die/Mold (h)</th>
                <th className="px-2.5 py-2.5">Purge/Clean (h)</th>
                <th className="px-2.5 py-2.5">Heater Fail (h)</th>
                <th className="px-2.5 py-2.5">Mech/Puller (h)</th>
                <th className="px-2.5 py-2.5">Material/No Order (h)</th>
                <th className="px-2.5 py-2.5 border-r border-slate-800">Other Stop (h)</th>

                {/* Audit & OEE (3-Factor Triad) */}
                <th className="px-3 py-2.5 text-center font-bold">Total (h)</th>
                <th className="px-3 py-2.5 text-center">24h Status</th>
                <th className="px-2 py-2.5 text-center text-slate-300" title="Availability Rate (A): Operating Hours / 24.0h">
                  Avail (%)
                </th>
                <th className="px-2 py-2.5 text-center text-cyan-300" title="Performance / Speed Efficiency (P): Actual Pace / Nominal Capacity">
                  <div className="flex items-center justify-center gap-0.5">
                    <span className="text-[10px] text-slate-500 font-bold select-none">&times;</span>
                    <span>Perf (%)</span>
                  </div>
                </th>
                <th className="px-2 py-2.5 text-center text-amber-300" title="Quality Rate (Q): Good Output (kg) / Total Melt (kg)">
                  <div className="flex items-center justify-center gap-0.5">
                    <span className="text-[10px] text-slate-500 font-bold select-none">&times;</span>
                    <span>Qual (%)</span>
                  </div>
                </th>
                <th className="px-2.5 py-2.5 text-center border-r border-slate-800 text-indigo-300 font-bold" title="Overall OEE: Availability &times; Performance &times; Quality = OEE">
                  <div className="flex items-center justify-center gap-0.5">
                    <span className="text-[10px] text-slate-500 font-bold select-none">=</span>
                    <span>OEE (%)</span>
                  </div>
                </th>

                {/* Actions */}
                <th className="px-3 py-2.5 text-center">Reconcile / Save</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-800/60">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={26} className="text-center py-8 text-slate-400">
                    No machine lines match the active filter for {selectedDate}.
                  </td>
                </tr>
              ) : (
                filteredRows.flatMap((row, idx) => {
                  const isRowOperating = Number(row.actualPcs) > 0 || Number(row.operatingHours) > 0;
                  const parentLineId = row.baseLineId || row.parentLineId || row.lineId;
                  const isMultiRun = Boolean(row.isMultiRun || row.totalRuns > 1 || row.parentLineId);
                  const machineStatus = isMultiRun && parentLineId
                    ? calculateMultiRunMachineStatus(rows, parentLineId)
                    : null;
                  const isActualMultiRun = machineStatus && (machineStatus.runCount > 1 || row.isMultiRun || row.totalRuns > 1);
                  const isFirstRun = isActualMultiRun && (
                    idx === 0 ||
                    (filteredRows[idx - 1].baseLineId || filteredRows[idx - 1].parentLineId || filteredRows[idx - 1].lineId) !== parentLineId
                  );

                  const elements = [];
                  if (isFirstRun && machineStatus) {
                    elements.push(
                      <tr
                        key={`header-${parentLineId}`}
                        className="bg-slate-950 border-t-2 border-b border-blue-500/50"
                      >
                        <td colSpan={26} className="px-3 py-2 bg-gradient-to-r from-blue-950/80 via-slate-900 to-slate-950">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-blue-600 text-white shadow-xs">
                                {parentLineId}
                              </span>
                              <span className="font-semibold text-slate-200 text-xs">
                                {row.lineName.replace(/\s*\[Run\s*\d+.*\]/, '')}
                              </span>
                              <span className="text-blue-400 text-xs font-medium">
                                &bull; Multi-Run Extrusion ({machineStatus.runCount} Runs Coupled)
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5 text-xs font-mono">
                                <span className="text-slate-300 font-semibold">
                                  {parentLineId} Total Machine Accounted:
                                </span>
                                <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                  {machineStatus.totalMachineAccountedHours.toFixed(1)}h / 24.0h
                                </span>
                              </div>
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                  machineStatus.machineBalanceStatus === 'balanced'
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                    : machineStatus.machineBalanceStatus === 'under'
                                    ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                    : 'bg-rose-950/80 text-rose-300 border-rose-800'
                                }`}
                              >
                                {machineStatus.machineBalanceStatus === 'balanced' ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                ) : (
                                  <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                )}
                                <span>[{machineStatus.machineBalanceStatus === 'balanced' ? 'Balanced' : machineStatus.machineBalanceLabel}]</span>
                              </span>
                              {machineStatus.machineBalanceStatus !== 'balanced' && (
                                <button
                                  type="button"
                                  onClick={() => handleAutoBalanceRow(row.lineId, 'adjust_op')}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition cursor-pointer"
                                  title="Auto-balance multi-run machine across runs to exactly 24.0h"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  <span>Balance Machine to 24h</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const availPct = Number(row.availPct ?? row.availabilityPct) || 0;
                  const speedEffPct = Number(row.speedEffPct ?? row.speedEfficiencyPct ?? row.performancePct) || 0;
                  const qualityPct = row.qualityPct != null ? Number(row.qualityPct) : 100.0;
                  const oeePct = Number(row.oeePct) || 0;

                  elements.push(
                    <tr
                      key={row.lineId}
                      className={`transition hover:bg-slate-800/40 ${
                        row.isMultiRun ? 'border-l-2 border-l-blue-500 bg-blue-950/10' : ''
                      } ${!isRowOperating ? 'opacity-70 bg-slate-950/40' : ''}`}
                    >
                      {/* 1. Line ID */}
                      <td className="px-3 py-2 font-bold text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded border text-xs font-mono ${
                              row.isMultiRun
                                ? 'bg-blue-950 border-blue-500/60 text-blue-300 font-bold'
                                : 'bg-slate-800 border-slate-700 text-slate-100'
                            }`}
                          >
                            {row.lineIdDisplay || row.lineId}
                          </span>
                          {row.isMultiRun && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold"
                              title={`Run ${row.runIndex} of ${row.totalRuns} on ${row.baseLineId}`}
                            >
                              R{row.runIndex}
                            </span>
                          )}
                        </div>
                      </td>

                    {/* 2. Machine Name */}
                    <td className="px-3 py-2 text-slate-300 font-medium">
                      {row.lineName}
                    </td>

                    {/* 3. Running Pipe Size & Specs (Directly After Machine Name) */}
                    <td className="px-3 py-2 border-r border-slate-800 text-slate-200">
                      <div className="font-semibold text-cyan-300 max-w-[220px] truncate" title={row.pipeSize || row.productDescription || '-'}>
                        {row.pipeSize || row.productDescription || (row.isOperating ? 'Standard Extrusion Run' : 'Idle / No Order')}
                      </div>
                      {row.productCode && row.productCode !== row.pipeSize && (
                        <div className="text-[10px] text-slate-400 font-mono max-w-[220px] truncate" title={row.productCode}>
                          {row.productCode}
                        </div>
                      )}
                    </td>

                    {/* 4. Nominal Capacity */}
                    <td className="px-3 py-2 text-slate-300 font-mono">
                      {row.nominalCapacity} <span className="text-[10px] text-slate-500">kg/h</span>
                    </td>

                    {/* 5. Std Weight (kg/pc) - Editable input */}
                    <td className="px-2.5 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.stdWeight ?? ''}
                        title={row.sourceAudit ? row.sourceAudit.summary : 'Standard pipe unit weight in kg'}
                        onChange={(e) => handleCellChange(row.lineId, 'stdWeight', e.target.value)}
                        onBlur={() => handleCellBlur(row.lineId, 'stdWeight')}
                        className="w-16 px-1.5 py-1 text-xs bg-slate-950 border border-slate-800 focus:border-blue-500 rounded text-slate-200 font-mono text-right"
                      />
                    </td>

                    {/* 6. Std Rate (Pcs/h) - Editable input & Dynamic Estimator */}
                    <td className="px-2.5 py-2 border-r border-slate-800">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={row.targetRate ?? row.stdRate ?? ''}
                          onChange={(e) => handleCellChange(row.lineId, 'targetRate', e.target.value)}
                          onBlur={() => handleCellBlur(row.lineId, 'targetRate')}
                          className="w-16 px-1.5 py-1 text-xs bg-slate-950 border border-slate-800 focus:border-blue-500 rounded text-cyan-300 font-mono font-bold text-right"
                        />
                        <RateEstimatorPopover
                          lineId={row.baseLineId || row.lineId}
                          lineName={row.lineName}
                          nominalCap={row.nominalCapacity}
                          stdWeight={row.stdWeight}
                          pipeLength={row.pipeLength}
                          currentRate={row.targetRate}
                          onApplyRate={(newRate) => {
                            handleCellChange(row.lineId, 'targetRate', newRate);
                            handleCellBlur(row.lineId, 'targetRate');
                          }}
                        />
                      </div>
                    </td>

                    {/* 7. Expected 24h Output */}
                    <td className="px-3 py-2 text-slate-300 font-mono">
                      <div>{row.expectedPcs.toLocaleString()} <span className="text-[10px] text-slate-500">pcs</span></div>
                      <div className="text-[10px] text-slate-400">{row.expectedKg.toLocaleString()} kg</div>
                    </td>

                    {/* 8. Actual Reported Output */}
                    <td className="px-3 py-2 font-mono">
                      <div className="font-bold text-emerald-400">
                        {row.actualPcs.toLocaleString()} <span className="text-[10px] text-emerald-600">pcs</span>
                      </div>
                      <div className="text-[10px] text-slate-400">{row.actualKg.toLocaleString()} kg</div>
                    </td>

                    {/* 8.5 Scrap (kg) - Editable input */}
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={row.scrapKg ?? ''}
                        title={`Scrap Output: ${row.scrapKg || 0} kg | Total Melt: ${(row.totalMeltProcessedKg || (row.actualKg + (Number(row.scrapKg) || 0))).toLocaleString()} kg`}
                        onChange={(e) => handleCellChange(row.lineId, 'scrapKg', e.target.value)}
                        onBlur={() => handleCellBlur(row.lineId, 'scrapKg')}
                        className="w-16 px-1.5 py-1 text-xs bg-slate-950 border border-amber-900/60 focus:border-amber-500 rounded text-amber-300 font-mono font-bold text-right"
                      />
                    </td>

                    {/* 9. Deficit Loss Output */}
                    <td className="px-3 py-2 font-mono">
                      <div className="text-rose-400 font-semibold">
                        -{row.deficitPcs.toLocaleString()} <span className="text-[10px] text-rose-600">pcs</span>
                      </div>
                      <div className="text-[10px] text-slate-400">-{row.deficitKg.toLocaleString()} kg</div>
                    </td>

                    {/* 10. Lost Time (h) */}
                    <td className="px-3 py-2 font-mono border-r border-slate-800">
                      <div
                        className="flex items-center"
                        title={`Theoretical Deficit: ${(row.theoreticalLostHours ?? row.lostHours ?? 0).toFixed(1)}h | Justified Downtime: ${(row.justifiedDowntimeHours ?? row.totalDowntimeHours ?? 0).toFixed(1)}h | Unjustified Lost Time: ${(row.unjustifiedLostHours ?? 0).toFixed(1)}h${row.isPlannedWeekendShutdown && row.otherHours > 0 ? ` | Planned Shutdown: Weekend / No Overtime (${row.otherHours}h)` : ''}`}
                      >
                        {(row.unjustifiedLostHours ?? 0) === 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                            0.0h (Justified)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800">
                            +{(row.unjustifiedLostHours ?? 0).toFixed(1)}h to Justify
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 11. Operating Hours Input */}
                    <td className="px-2 py-1.5 bg-emerald-950/10">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="24"
                        value={row.operatingHours ?? ''}
                        onChange={(e) => handleCellChange(row.lineId, 'operatingHours', e.target.value)}
                        onBlur={() => handleCellBlur(row.lineId, 'operatingHours')}
                        className="w-16 px-1.5 py-1 text-xs bg-slate-950 border border-emerald-800/80 focus:border-emerald-500 rounded text-emerald-300 font-mono font-bold text-right"
                      />
                    </td>

                    {/* 11.5 Actual Realized Rate (Pcs/h, kg/h & Speed Efficiency %) */}
                    <td className="px-2.5 py-1.5 font-mono text-center bg-cyan-950/10">
                      {row.operatingHours > 0 && row.actualPcs > 0 ? (
                        <div>
                          <div className="font-bold text-cyan-300 text-xs leading-tight">
                            {row.actualRatePcsH.toLocaleString()} <span className="text-[10px] text-cyan-500 font-normal">pcs/h</span>
                          </div>
                          <div className="text-[10px] text-slate-300 leading-tight mt-0.5">
                            {row.actualRateKgH.toLocaleString()} <span className="text-slate-500">kg/h</span>
                          </div>
                          <div className="mt-0.5">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                speedEffPct >= 90
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                  : speedEffPct >= 75
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                  : 'bg-rose-950/80 text-rose-300 border-rose-800'
                              }`}
                              title={
                                row.targetRate > 0
                                  ? `Speed Efficiency: ${speedEffPct.toFixed(1)}% against Std Rate (${row.targetRate} pcs/h)`
                                  : `Speed Efficiency: ${speedEffPct.toFixed(1)}% against Nominal Capacity (${row.nominalCapKgH || row.nominalCapacity} kg/h)`
                              }
                            >
                              {speedEffPct.toFixed(1)}% Eff
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-600 text-center text-[10px] py-0.5">
                          <div>0.0 <span className="text-[9px] text-slate-700">pcs/h</span></div>
                          <div>0.0 <span className="text-[9px] text-slate-700">kg/h</span></div>
                        </div>
                      )}
                    </td>

                    {/* 12. Die / Mold Changeover Input */}
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="24"
                        value={row.moldChangeHours ?? ''}
                        onChange={(e) => handleCellChange(row.lineId, 'moldChangeHours', e.target.value)}
                        onBlur={() => handleCellBlur(row.lineId, 'moldChangeHours')}
                        className="w-14 px-1.5 py-1 text-xs bg-slate-950 border border-slate-800 focus:border-blue-500 rounded text-slate-200 font-mono text-right"
                      />
                    </td>

                    {/* 13. Purge & Cleaning Input */}
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="24"
                        value={row.purgeCleaningHours ?? ''}
                        onChange={(e) => handleCellChange(row.lineId, 'purgeCleaningHours', e.target.value)}
                        onBlur={() => handleCellBlur(row.lineId, 'purgeCleaningHours')}
                        className="w-14 px-1.5 py-1 text-xs bg-slate-950 border border-slate-800 focus:border-blue-500 rounded text-slate-200 font-mono text-right"
                      />
                    </td>

                    {/* 14. Heater Failure Input */}
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="24"
                        value={row.heaterFailureHours ?? ''}
                        onChange={(e) => handleCellChange(row.lineId, 'heaterFailureHours', e.target.value)}
                        onBlur={() => handleCellBlur(row.lineId, 'heaterFailureHours')}
                        className="w-14 px-1.5 py-1 text-xs bg-slate-950 border border-slate-800 focus:border-blue-500 rounded text-slate-200 font-mono text-right"
                      />
                    </td>

                    {/* 15. Mechanical / Puller Input */}
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="24"
                        value={row.mechanicalHours ?? ''}
                        onChange={(e) => handleCellChange(row.lineId, 'mechanicalHours', e.target.value)}
                        onBlur={() => handleCellBlur(row.lineId, 'mechanicalHours')}
                        className="w-14 px-1.5 py-1 text-xs bg-slate-950 border border-slate-800 focus:border-blue-500 rounded text-slate-200 font-mono text-right"
                      />
                    </td>

                    {/* 16. Material / No Order Input */}
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="24"
                        value={row.materialNoOrderHours ?? ''}
                        onChange={(e) => handleCellChange(row.lineId, 'materialNoOrderHours', e.target.value)}
                        onBlur={() => handleCellBlur(row.lineId, 'materialNoOrderHours')}
                        className="w-14 px-1.5 py-1 text-xs bg-slate-950 border border-slate-800 focus:border-blue-500 rounded text-slate-200 font-mono text-right"
                      />
                    </td>

                    {/* 17. Other Stoppages Input */}
                    <td
                      className="px-2 py-1.5 border-r border-slate-800"
                      title={row.isPlannedWeekendShutdown && row.otherHours > 0 ? `Planned Shutdown: Weekend / No Overtime (${row.otherHours}h)` : 'Other Operational Stoppages'}
                    >
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="24"
                        value={row.otherHours ?? ''}
                        onChange={(e) => handleCellChange(row.lineId, 'otherHours', e.target.value)}
                        onBlur={() => handleCellBlur(row.lineId, 'otherHours')}
                        className="w-14 px-1.5 py-1 text-xs bg-slate-950 border border-slate-800 focus:border-blue-500 rounded text-slate-200 font-mono text-right"
                      />
                      <select
                        value={row.otherStopReason || (row.isPlannedWeekendShutdown ? 'planned_weekend' : 'other_operational')}
                        onChange={(e) => handleCellChange(row.lineId, 'otherStopReason', e.target.value)}
                        className="mt-1 w-full text-[9px] bg-slate-900 border border-slate-800 text-slate-300 rounded px-1 py-0.5 focus:border-blue-500 cursor-pointer block"
                        title="Downtime justification reason for Other Stop"
                      >
                        <option value="other_operational">Other Operational</option>
                        <option value="planned_weekend">Planned Weekend / No Overtime</option>
                        <option value="planned_maintenance">Planned Maintenance</option>
                      </select>
                      {row.isPlannedWeekendShutdown && row.otherHours > 0 && (
                        <div className="mt-0.5">
                          <span
                            className="inline-block px-1 py-0.5 rounded text-[8px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800 whitespace-nowrap"
                            title={`Planned Shutdown: Weekend / No Overtime (${row.otherHours}h)`}
                          >
                            Weekend Shutdown
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 18. Total Accounted Hours */}
                    <td className="px-3 py-2 text-center font-mono font-bold">
                      <span
                        title={`Downtime breakdown: Die/Mold ${(row.moldChangeHours || 0)}h, Purge ${(row.purgeCleaningHours || 0)}h, Heater ${(row.heaterFailureHours || 0)}h, Mech ${(row.mechanicalHours || 0)}h, Material/No Order ${(row.materialNoOrderHours || 0)}h, Other ${(row.otherHours || 0)}h${row.isPlannedWeekendShutdown && row.otherHours > 0 ? ` [Planned Shutdown: Weekend / No Overtime (${row.otherHours}h)]` : ''}`}
                        className={
                          (isActualMultiRun && machineStatus && (machineStatus.machineBalanceStatus === 'balanced' || machineStatus.isCoupledBalanced)) || row.balanceStatus === 'balanced'
                            ? 'text-emerald-400'
                            : (isActualMultiRun && machineStatus ? (machineStatus.totalMachineAccountedHours < 24.0 ? 'text-amber-400' : 'text-rose-400') : (row.balanceStatus === 'under' ? 'text-amber-400' : 'text-rose-400'))
                        }
                      >
                        {row.totalAccountedHours.toFixed(1)}h
                      </span>
                    </td>

                    {/* 19. 24h Balance Badge */}
                    <td className="px-3 py-2 text-center">
                      {isActualMultiRun && machineStatus ? (
                        (() => {
                          const totalMachineHours = Number(machineStatus.totalMachineHours ?? machineStatus.totalMachineAccountedHours) || 0;
                          const isJointBalanced = machineStatus.isCoupledBalanced ||
                            machineStatus.machineBalanceStatus === 'balanced' ||
                            machineStatus.status === 'balanced' ||
                            Math.abs(totalMachineHours - 24.0) <= 0.05;
                          const rowHoursDisplay = (Number(row.totalAccountedHours ?? row.totalHours) || 0).toFixed(1);
                          const machineIdDisplay = parentLineId || row.lineId;

                          if (isJointBalanced) {
                            return (
                              <div className="flex flex-col items-center justify-center gap-0.5">
                                <span
                                  className="text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1"
                                  title={`Joint Line ${machineIdDisplay} Balanced (Run: ${rowHoursDisplay}h / Line: 24.0h)`}
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                  <span>24.0h Balanced</span>
                                </span>
                                <div
                                  className="text-[9px] text-emerald-400/80 font-mono"
                                  title={`Joint Line ${machineIdDisplay} Balanced (Run: ${rowHoursDisplay}h / Line: 24.0h)`}
                                >
                                  Joint Line {machineIdDisplay} Balanced (Run: {rowHoursDisplay}h / Line: 24.0h)
                                </div>
                              </div>
                            );
                          }

                          // Machine NOT balanced
                          const isUnder = totalMachineHours < 24.0;
                          const diffHours = round1(Math.abs(24.0 - totalMachineHours));
                          const machineBadgeText = isUnder
                            ? `${diffHours}h Machine Remaining`
                            : `+${diffHours}h Machine Exceeded`;

                          return (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <div className="flex items-center gap-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                                    isUnder
                                      ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                                      : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                                  }`}
                                  title={`Joint Line ${machineIdDisplay} ${machineBadgeText} (Run: ${rowHoursDisplay}h / Machine Total: ${totalMachineHours.toFixed(1)}h)`}
                                >
                                  {isUnder ? (
                                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                                  ) : (
                                    <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                  )}
                                  <span>{machineBadgeText}</span>
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleAutoBalanceRow(row.lineId, 'adjust_op')}
                                  className="p-1 text-amber-400 hover:text-amber-200 hover:bg-slate-800 rounded transition cursor-pointer"
                                  title={`Auto-balance machine ${machineIdDisplay} across all runs to 24.0h`}
                                >
                                  <Sparkles className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="text-[9px] text-blue-400 font-mono">
                                Machine: {totalMachineHours.toFixed(1)}h/24h [{machineStatus.machineBalanceStatus}]
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1">
                          <div className="flex items-center gap-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                row.balanceStatus === 'balanced'
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                  : row.balanceStatus === 'under'
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                  : 'bg-rose-950/80 text-rose-300 border-rose-800'
                              }`}
                            >
                              {row.balanceStatus === 'balanced' ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              ) : (
                                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                              )}
                              <span>{row.balanceLabel}</span>
                            </span>

                            {row.balanceStatus !== 'balanced' && (
                              <button
                                type="button"
                                onClick={() => handleAutoBalanceRow(row.lineId, 'adjust_op')}
                                className="p-1 text-amber-400 hover:text-amber-200 hover:bg-slate-800 rounded transition cursor-pointer"
                                title="Auto-balance operating hours to make total 24.0h"
                              >
                                <Sparkles className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 20. Availability (%) */}
                    <td className="px-2.5 py-2 text-center font-mono text-slate-300">
                      {availPct.toFixed(1)}%
                    </td>

                    {/* 20.3 Performance / Speed Efficiency (%) */}
                    <td
                      className={`px-2.5 py-2 text-center font-mono font-medium ${
                        speedEffPct >= 85
                          ? 'text-emerald-400'
                          : speedEffPct >= 70
                            ? 'text-amber-400'
                            : 'text-rose-400'
                      }`}
                      title={
                        row.targetRate > 0
                          ? `Performance: ${speedEffPct.toFixed(1)}% (Actual Pace: ${row.actualRatePcsH || 0} pcs/h / Std Rate: ${row.targetRate} pcs/h)`
                          : `Performance: ${speedEffPct.toFixed(1)}% (Actual Pace: ${row.actualRateKgH || 0} kg/h / Nom: ${row.nominalCapKgH || 0} kg/h)`
                      }
                    >
                      {speedEffPct.toFixed(1)}%
                    </td>

                    {/* 20.7 Quality (%) */}
                    <td
                      className="px-2.5 py-2 text-center font-mono text-amber-300"
                      title={`Quality: ${qualityPct.toFixed(1)}% (${row.actualKg} kg good / ${row.totalMeltProcessedKg || row.actualKg} kg total melt)`}
                    >
                      {qualityPct.toFixed(1)}%
                    </td>

                    {/* 21. OEE (%) */}
                    <td
                      className="px-2.5 py-2 text-center font-mono font-bold border-r border-slate-800 text-indigo-300"
                      title={`${availPct.toFixed(1)}% (Avail) × ${speedEffPct.toFixed(1)}% (Perf) × ${qualityPct.toFixed(1)}% (Qual) = ${oeePct.toFixed(1)}% (OEE)`}
                    >
                      {oeePct.toFixed(1)}%
                    </td>

                    {/* 22. Row Actions */}
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleReconcileAndSaveRow(row.lineId)}
                          className="btn-primary flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-xs border border-transparent transition cursor-pointer"
                          style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                          title="Reconcile 24h slots and save report for this machine"
                        >
                          <Save className="w-3 h-3 text-white" style={{ stroke: '#ffffff', color: '#ffffff' }} />
                          <span style={{ color: '#ffffff', fontWeight: 600 }}>Save</span>
                        </button>

                        {onSelectMachineAndOpenSheet && (
                          <button
                            type="button"
                            onClick={() => onSelectMachineAndOpenSheet(row.baseLineId || row.lineId, selectedDate)}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition cursor-pointer"
                            title="Open 24-hour production follow sheet for this machine"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );

                  return elements;
                })
            )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
