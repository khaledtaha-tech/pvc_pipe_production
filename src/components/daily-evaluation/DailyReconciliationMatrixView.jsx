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
  MATRIX_DOWNTIME_CATEGORIES
} from '../../logic/reconciliationMatrixHelper.js';
import { getMachineNominalCapacity } from '../../logic/machineSettingsConfig.js';
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
    setRows((prev) =>
      prev.map((r) => {
        if (r.lineId !== lineId) return r;
        return applyMatrixRowInput(r, field, rawValue);
      })
    );
  };

  // On blur, normalize empty string to 0
  const handleCellBlur = (lineId, field) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.lineId !== lineId) return r;
        if (r[field] === '' || r[field] == null) {
          return applyMatrixRowInput(r, field, 0);
        }
        return r;
      })
    );
  };

  // Auto-balance a single row to 24h
  const handleAutoBalanceRow = (lineId, mode = 'adjust_op') => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.lineId !== lineId) return r;
        return autoBalanceRowHours(r, mode);
      })
    );
    if (onNotify) {
      onNotify(`Auto-balanced Line ${lineId} to 24.0 hours.`);
    }
  };

  // Auto-balance all rows that have remaining unaccounted hours
  const handleAutoBalanceAll = () => {
    let balancedCount = 0;
    setRows((prev) =>
      prev.map((r) => {
        if (r.balanceStatus !== 'balanced') {
          balancedCount += 1;
          return autoBalanceRowHours(r, 'adjust_op');
        }
        return r;
      })
    );
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
    const totalLostHours = rows.reduce((s, r) => s + (Number(r.lostHours) || 0), 0);
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

    return {
      totalExpectedKg,
      totalExpectedPcs,
      totalActualKg,
      totalActualPcs,
      totalLostHours,
      balancedCount,
      operatingCount,
      avgAvailability,
      avgPerformance,
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
            <Calendar className="w-4 h-4 text-cyan-400" />
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
            className="px-2 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition cursor-pointer ml-1"
          >
            Today
          </button>
        </div>

        {/* Right: Master Batch Actions */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={handleAutoBalanceAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-800/80 rounded-lg transition cursor-pointer"
            title="Automatically balance all lines with remaining unaccounted hours to 24.0h"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Auto-Balance All to 24h</span>
          </button>

          <button
            type="button"
            onClick={handleReconcileAndSaveAll}
            disabled={isSavingAll}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition shadow-md cursor-pointer disabled:opacity-50"
            title="Calculate distribution, apply 24h slots, and save reports for all lines"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingAll ? 'Saving All...' : 'Reconcile & Save All Lines'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition cursor-pointer"
            title="Download Matrix as formatted Excel spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
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
          <div className="text-[11px] text-slate-400">
            {plantSummary.totalActualPcs.toLocaleString()} pcs produced
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Lost Production Time</span>
          <div className="text-sm font-bold text-rose-400 mt-1">
            {plantSummary.totalLostHours.toFixed(1)} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Across {rows.length} plant lines
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
            Perf: {plantSummary.avgPerformance.toFixed(1)}%
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
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
              showOperatingOnly
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:text-white'
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
          <table className="w-full border-collapse text-left text-xs whitespace-nowrap min-w-[1950px]">
            {/* Top Multi-Header Row */}
            <thead className="sticky top-0 z-20 shadow-md bg-slate-900 border-b border-slate-800">
              <tr className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                <th colSpan={3} className="px-3 py-2 border-r border-slate-800 text-slate-300 bg-slate-950">
                  Machine &amp; Running Job Info
                </th>
                <th colSpan={3} className="px-3 py-2 border-r border-slate-800 text-blue-300 bg-blue-950/30">
                  Job Engineering Specs
                </th>
                <th colSpan={4} className="px-3 py-2 border-r border-slate-800 text-emerald-300 bg-emerald-950/20">
                  Production Balance (Theoretical vs Actual)
                </th>
                <th colSpan={8} className="px-3 py-2 border-r border-slate-800 text-amber-300 bg-amber-950/20">
                  24-Hour Time Allocation &amp; Realized Pace
                </th>
                <th colSpan={4} className="px-3 py-2 border-r border-slate-800 text-indigo-300 bg-indigo-950/20">
                  Audit &amp; Telemetry
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

                {/* Audit & OEE */}
                <th className="px-3 py-2.5 text-center font-bold">Total (h)</th>
                <th className="px-3 py-2.5 text-center">24h Status</th>
                <th className="px-2.5 py-2.5 text-center">Avail (%)</th>
                <th className="px-2.5 py-2.5 text-center border-r border-slate-800">OEE (%)</th>

                {/* Actions */}
                <th className="px-3 py-2.5 text-center">Reconcile / Save</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-800/60">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={23} className="text-center py-8 text-slate-400">
                    No machine lines match the active filter for {selectedDate}.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isRowOperating = Number(row.actualPcs) > 0 || Number(row.operatingHours) > 0;
                  return (
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

                    {/* 6. Std Rate (Pcs/h) - Editable input */}
                    <td className="px-2.5 py-2 border-r border-slate-800">
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={row.targetRate ?? ''}
                        onChange={(e) => handleCellChange(row.lineId, 'targetRate', e.target.value)}
                        onBlur={() => handleCellBlur(row.lineId, 'targetRate')}
                        className="w-16 px-1.5 py-1 text-xs bg-slate-950 border border-slate-800 focus:border-blue-500 rounded text-cyan-300 font-mono font-bold text-right"
                      />
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

                    {/* 9. Deficit Loss Output */}
                    <td className="px-3 py-2 font-mono">
                      <div className="text-rose-400 font-semibold">
                        -{row.deficitPcs.toLocaleString()} <span className="text-[10px] text-rose-600">pcs</span>
                      </div>
                      <div className="text-[10px] text-slate-400">-{row.deficitKg.toLocaleString()} kg</div>
                    </td>

                    {/* 10. Lost Hours (hrs) */}
                    <td className="px-3 py-2 font-mono font-bold text-rose-400 border-r border-slate-800">
                      {row.lostHours > 0 ? `${row.lostHours.toFixed(1)}h` : '0.0h'}
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
                                row.speedEfficiencyPct >= 90
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                  : row.speedEfficiencyPct >= 75
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                  : 'bg-rose-950/80 text-rose-300 border-rose-800'
                              }`}
                              title={`Speed Efficiency: ${row.speedEfficiencyPct}% against Nominal Capacity (${row.nominalCapacity} kg/h)`}
                            >
                              {row.speedEfficiencyPct.toFixed(1)}% Eff
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
                    <td className="px-2 py-1.5 border-r border-slate-800">
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
                    </td>

                    {/* 18. Total Accounted Hours */}
                    <td className="px-3 py-2 text-center font-mono font-bold">
                      <span
                        className={
                          row.balanceStatus === 'balanced'
                            ? 'text-emerald-400'
                            : row.balanceStatus === 'under'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }
                      >
                        {row.totalAccountedHours.toFixed(1)}h
                      </span>
                    </td>

                    {/* 19. 24h Balance Badge */}
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
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
                    </td>

                    {/* 20. Availability (%) */}
                    <td className="px-2.5 py-2 text-center font-mono text-slate-300">
                      {row.availabilityPct.toFixed(1)}%
                    </td>

                    {/* 21. OEE (%) */}
                    <td className="px-2.5 py-2 text-center font-mono font-bold border-r border-slate-800 text-indigo-300">
                      {row.oeePct.toFixed(1)}%
                    </td>

                    {/* 22. Row Actions */}
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleReconcileAndSaveRow(row.lineId)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white rounded transition cursor-pointer"
                          title="Reconcile 24h slots and save report for this machine"
                        >
                          <Save className="w-3 h-3" />
                          <span>Save</span>
                        </button>

                        {onSelectMachineAndOpenSheet && (
                          <button
                            type="button"
                            onClick={() => onSelectMachineAndOpenSheet(row.baseLineId || row.lineId, selectedDate)}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer"
                            title="Open 24-hour production follow sheet for this machine"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
