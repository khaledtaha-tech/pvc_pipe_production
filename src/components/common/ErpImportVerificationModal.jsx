import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Layers,
  Cpu,
  X,
  Check,
  FileText,
  HelpCircle,
  HardDrive
} from 'lucide-react';
import { parseSheetToJsonWithDynamicHeader } from '../../utils/dataCleaner.js';
import { analyzeErpImport } from '../../utils/inferenceEngine.js';

export default function ErpImportVerificationModal({
  isOpen,
  onClose,
  onConfirm,
  file,
  wb,
  initialSheetName = 'PIPES',
  lang = 'en',
  theme = 'dark'
}) {
  if (!isOpen) return null;

  const isLight = theme === 'light';
  const sheetNames = wb?.SheetNames || [];

  // Determine initial selected sheet (defensive prioritizing PIPES)
  const defaultSheet = useMemo(() => {
    if (initialSheetName && sheetNames.includes(initialSheetName)) {
      return initialSheetName;
    }
    const pipesSheet = sheetNames.find((s) => /^pipes$/i.test(s.trim())) || sheetNames.find((s) => /pipes/i.test(s));
    if (pipesSheet) return pipesSheet;
    const erpSheet = sheetNames.find((s) => /erp|daily|receipts|history|log/i.test(s));
    if (erpSheet) return erpSheet;
    return sheetNames[0] || 'Sheet1';
  }, [sheetNames, initialSheetName]);

  const [selectedSheet, setSelectedSheet] = useState(defaultSheet);

  useEffect(() => {
    if (defaultSheet) {
      setSelectedSheet(defaultSheet);
    }
  }, [defaultSheet]);

  // Extract raw rows from the active sheet with defensive dynamic parser and fallback
  const rawRows = useMemo(() => {
    if (!wb || !selectedSheet || !wb.Sheets[selectedSheet]) return [];
    try {
      const ws = wb.Sheets[selectedSheet];
      const parsed = parseSheetToJsonWithDynamicHeader(ws, XLSX);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      const fallback = XLSX.utils.sheet_to_json(ws, { defval: '' });
      return Array.isArray(fallback) ? fallback : [];
    } catch (err) {
      console.error('Error parsing sheet in verification modal:', err);
      return [];
    }
  }, [wb, selectedSheet]);

  // Run comprehensive ERP import analysis
  const analysis = useMemo(() => {
    return analyzeErpImport(rawRows);
  }, [rawRows]);

  const { columnMappings, healthCheck, previewRows } = analysis;

  const handleConfirm = () => {
    try {
      if (!onConfirm) {
        console.warn('ErpImportVerificationModal: No onConfirm callback provided.');
        if (onClose) onClose();
        return;
      }

      if (!rawRows || rawRows.length === 0) {
        console.warn('ErpImportVerificationModal: No rows found to ingest.');
        return;
      }

      // Defensive sanitization: ensure clean, serializable plain objects
      const sanitizedRows = rawRows.map((row) => {
        if (!row || typeof row !== 'object') return {};
        const cleanRow = {};
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === 'function' || typeof v === 'symbol') continue;
          if (v instanceof Date) {
            cleanRow[k] = v.toISOString().split('T')[0];
          } else {
            cleanRow[k] = v !== undefined && v !== null ? v : '';
          }
        }
        return cleanRow;
      });

      onConfirm(sanitizedRows, selectedSheet);
    } catch (err) {
      console.error('Error in ErpImportVerificationModal handleConfirm:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div
        className={`w-full max-w-5xl rounded-2xl border shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] ${
          isLight
            ? 'bg-white border-[#dfd7ca] text-stone-900 shadow-stone-400/30'
            : 'bg-slate-900 border-slate-700 text-slate-100 shadow-cyan-950/50'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight ? 'bg-stone-50 border-[#dfd7ca]' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl flex items-center justify-center ${
                isLight
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-900/40'
              }`}
            >
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">ERP Ingestion Verification & Mapping Inspector</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wide uppercase ${
                    isLight ? 'bg-teal-100 text-teal-800' : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  }`}
                >
                  Pre-Ingestion
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-stone-500' : 'text-slate-400'}`}>
                Verify automated column bindings, health checks, and extrusion allocations before loading.
              </p>
            </div>
          </div>

          {/* File & Sheet Indicators */}
          <div className="flex items-center gap-3">
            {sheetNames.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-semibold ${isLight ? 'text-stone-600' : 'text-slate-400'}`}>
                  Sheet:
                </span>
                <select
                  value={selectedSheet}
                  onChange={(e) => setSelectedSheet(e.target.value)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer ${
                    isLight
                      ? 'bg-white border-stone-300 text-stone-800 hover:border-teal-600'
                      : 'bg-slate-800 border-slate-700 text-slate-100 hover:border-cyan-500'
                  }`}
                >
                  {sheetNames.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLight
                  ? 'text-stone-400 hover:text-stone-700 hover:bg-stone-200/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1 text-xs">
          {/* File Meta Summary */}
          <div
            className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
              isLight ? 'bg-stone-50 border-stone-200 text-stone-700' : 'bg-slate-950/60 border-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-500" />
              <span className="font-semibold text-white/90">Source File:</span>
              <span className="font-mono text-cyan-400">{file?.name || 'Historical_ERP_Dataset.xlsx'}</span>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-slate-400">Target Sheet: </span>
                <span className="font-bold text-amber-400 font-mono">[{selectedSheet}]</span>
              </div>
              <div>
                <span className="text-slate-400">Raw Rows Scanned: </span>
                <span className="font-bold text-white font-mono">{healthCheck.totalRows}</span>
              </div>
            </div>
          </div>

          {/* Section 1: Parsing Health Check Badges */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                1. Parsing Health Check & Verification
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Total Rows */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  isLight ? 'bg-white border-stone-200' : 'bg-slate-950/80 border-slate-800'
                }`}
              >
                <div>
                  <p className="text-[11px] text-slate-400">Total Rows Found</p>
                  <p className="text-lg font-black font-mono text-white mt-0.5">{healthCheck.totalRows}</p>
                </div>
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Layers className="w-5 h-5" />
                </div>
              </div>

              {/* Valid Extrusion Runs */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  isLight ? 'bg-emerald-50/50 border-emerald-200' : 'bg-emerald-950/20 border-emerald-800/60'
                }`}
              >
                <div>
                  <p className="text-[11px] text-emerald-400 font-semibold">Valid Extrusion Runs</p>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <p className="text-lg font-black font-mono text-emerald-300">{healthCheck.validCount}</p>
                    <span className="text-[11px] text-emerald-400/80">
                      ({healthCheck.totalRows > 0 ? ((healthCheck.validCount / healthCheck.totalRows) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>

              {/* Excluded / Unknown Rows */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  healthCheck.excludedCount > 0
                    ? isLight
                      ? 'bg-amber-50/50 border-amber-200'
                      : 'bg-amber-950/20 border-amber-800/60'
                    : isLight
                    ? 'bg-stone-50 border-stone-200'
                    : 'bg-slate-950/40 border-slate-800'
                }`}
              >
                <div>
                  <p className={`text-[11px] font-semibold ${healthCheck.excludedCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    Excluded / Non-Pipe
                  </p>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <p
                      className={`text-lg font-black font-mono ${
                        healthCheck.excludedCount > 0 ? 'text-amber-300' : 'text-slate-400'
                      }`}
                    >
                      {healthCheck.excludedCount}
                    </p>
                    <span className="text-[11px] text-slate-500">
                      ({healthCheck.totalRows > 0 ? ((healthCheck.excludedCount / healthCheck.totalRows) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                </div>
                <div
                  className={`p-2 rounded-lg ${
                    healthCheck.excludedCount > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Excluded Details breakdown if any */}
            {healthCheck.excludedDetails.length > 0 && (
              <div
                className={`mt-2.5 p-3 rounded-xl border text-[11px] ${
                  isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                }`}
              >
                <span className="font-bold flex items-center gap-1.5 mb-1 text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5" /> Filtered Out From Extrusion Planning:
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                  {healthCheck.excludedDetails.map((item, i) => (
                    <li key={i}>
                      <span className="font-semibold text-white/90">{item.reason}:</span> {item.count} run(s)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Section 2: Column Mapping Summary */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  2. Column Mapping Summary
                </h4>
              </div>
              <span className="text-[11px] text-slate-500">
                {columnMappings.filter((m) => m.isMapped).length} of {columnMappings.length} columns mapped
              </span>
            </div>

            <div
              className={`rounded-xl border overflow-hidden ${
                isLight ? 'bg-white border-stone-200' : 'bg-slate-950/80 border-slate-800'
              }`}
            >
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-[11px] uppercase font-bold ${isLight ? 'bg-stone-100 text-stone-600 border-stone-200' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>
                      <th className="py-2 px-3">Excel Header Found</th>
                      <th className="py-2 px-3 text-center">Direction</th>
                      <th className="py-2 px-3">Mapped System Field</th>
                      <th className="py-2 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-inherit">
                    {columnMappings.map((col, idx) => (
                      <tr key={idx} className="hover:bg-cyan-500/5 transition">
                        <td className="py-2 px-3 font-mono font-bold text-white/90">
                          {col.excelHeader}
                        </td>
                        <td className="py-2 px-3 text-center text-slate-500">
                          <ArrowRight className="w-3.5 h-3.5 mx-auto" />
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold ${
                              col.isMapped
                                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {col.systemField}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {col.isMapped ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                              <Check className="w-3.5 h-3.5" /> Mapped
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono">
                              Auxiliary
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 3: First 3 Parsed Preview Rows */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  3. First 3 Parsed Preview Rows (with Inferred Machine Lines)
                </h4>
              </div>
              <span className="text-[11px] text-slate-500">
                Sample preview with physical sizing & loading ratios
              </span>
            </div>

            <div
              className={`rounded-xl border overflow-hidden ${
                isLight ? 'bg-white border-stone-200' : 'bg-slate-950/80 border-slate-800'
              }`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-[11px] uppercase font-bold ${isLight ? 'bg-stone-100 text-stone-600 border-stone-200' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Doc No</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Item Code</th>
                      <th className="py-2.5 px-3 min-w-[180px]">Product Description</th>
                      <th className="py-2.5 px-3">OD (mm)</th>
                      <th className="py-2.5 px-3">Wall / SDR</th>
                      <th className="py-2.5 px-3">Unit Wt</th>
                      <th className="py-2.5 px-3">Total Wt</th>
                      <th className="py-2.5 px-3 min-w-[160px]">Primary Inferred Line</th>
                      <th className="py-2.5 px-3">Alternatives</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-inherit">
                    {previewRows.map((row) => (
                      <tr key={row.rowNumber} className="hover:bg-cyan-500/5 transition">
                        <td className="py-2.5 px-3 font-mono text-slate-500">{row.rowNumber}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{row.docNo}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{row.date}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{row.itemCode}</td>
                        <td className="py-2.5 px-3 font-semibold text-white/95 max-w-xs truncate" title={row.product}>
                          {row.product}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono font-bold border border-blue-500/30">
                            {row.diameterMm}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{row.thickness}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{row.unitWeight}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-200">{row.totalWeight}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 text-[11px]">
                              {row.primaryMachine}
                            </span>
                            <span className="text-[10px] text-emerald-400 font-mono">({row.primaryLoading})</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                          {row.alt1Machine !== '-' ? `${row.alt1Machine}, ${row.alt2Machine}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          className={`px-5 py-4 border-t flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 ${
            isLight ? 'bg-stone-50 border-stone-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              isLight
                ? 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100 hover:text-stone-900'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <X className="w-4 h-4" />
            <span>Cancel / Upload Different File</span>
          </button>

          <button
            type="button"
            data-testid="confirm-erp-ingest-btn"
            onClick={handleConfirm}
            disabled={!rawRows || rawRows.length === 0}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.98] ${
              rawRows && rawRows.length > 0
                ? isLight
                  ? 'bg-teal-700 hover:bg-teal-600 text-white shadow-teal-900/20'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/50'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed shadow-none'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirm & Ingest Data into Intelligence Engine</span>
          </button>
        </div>
      </div>
    </div>
  );
}
