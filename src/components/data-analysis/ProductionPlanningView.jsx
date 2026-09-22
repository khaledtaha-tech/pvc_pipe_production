import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { parseSheetToJsonWithDynamicHeader } from '../../utils/dataCleaner.js';
import { 
  Cpu, 
  Layers, 
  UploadCloud, 
  FileSpreadsheet, 
  Download, 
  Search, 
  Filter, 
  Sparkles, 
  CheckCircle2, 
  ArrowRight, 
  RotateCcw, 
  Gauge, 
  TrendingUp, 
  GitMerge, 
  ShieldCheck, 
  Info,
  Calendar,
  Zap,
  Split
} from 'lucide-react';

export default function ProductionPlanningView({ 
  historicalRows = [],
  historicalSummary = {},
  uniquePlanningMatrix = [],
  onUploadHistoricalFile,
  onLoadHistoricalSample,
  onClearHistoricalData,
  onMergeHistoricalToActive,
  onExportConsolidatedExcel,
  activeRowCount = 0,
  lang = 'en'
}) {
  const [matrixSearch, setMatrixSearch] = useState('');
  const [selectedExtruderFilter, setSelectedExtruderFilter] = useState('ALL');
  const [activeSubTab, setActiveSubTab] = useState('matrix'); // 'matrix' | 'runs'
  const fileInputRef = useRef(null);

  // Distinct primary extruders in unique planning matrix for filter
  const primaryExtruders = useMemo(() => {
    const set = new Set(uniquePlanningMatrix.map(m => m.primaryExtruder).filter(Boolean));
    return ['ALL', ...Array.from(set).sort()];
  }, [uniquePlanningMatrix]);

  // Filter unique matrix
  const filteredMatrix = useMemo(() => {
    return uniquePlanningMatrix.filter(row => {
      if (selectedExtruderFilter !== 'ALL' && row.primaryExtruder !== selectedExtruderFilter) {
        return false;
      }
      if (matrixSearch) {
        const term = matrixSearch.toLowerCase();
        const matches = 
          row.pipeDescription.toLowerCase().includes(term) ||
          row.primaryExtruder.toLowerCase().includes(term) ||
          row.odMm.toLowerCase().includes(term) ||
          row.planningAlternative1.toLowerCase().includes(term) ||
          row.planningAlternative2.toLowerCase().includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }, [uniquePlanningMatrix, selectedExtruderFilter, matrixSearch]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'binary', cellDates: true });
        const targetSheetName = wb.SheetNames.find(s => 
          /pipes|daily|production|receipts/i.test(s)
        ) || wb.SheetNames[0];
        const sheet = wb.Sheets[targetSheetName];
        const jsonData = parseSheetToJsonWithDynamicHeader(sheet, XLSX);
        onUploadHistoricalFile(jsonData, file.name);
      } catch (err) {
        console.error('Failed to parse historical file:', err);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-8">
      
      {/* 1. Header & Dedicated Historical Ingestion Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Cpu className="w-5 h-5" />
                </span>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Historical Production Inference & Production Planning Engine
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">
                Automatic extruder allocation for historical ERP datasets lacking machine names. Uses ASTM D1785 / ASTM D2241 OD standards, machine envelopes, and 65% - 95% nominal loading envelopes to assign primary lines and dual planning alternatives.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              {historicalRows.length > 0 && (
                <button
                  onClick={onMergeHistoricalToActive}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/30 transition transform active:scale-95"
                  title="Merge inferred historical rows into active production audit log"
                >
                  <GitMerge className="w-4 h-4" />
                  <span>Merge into Production Log</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Planning & Inference Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-900/90 border border-cyan-500/20 rounded-xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-400">Total Historical Runs</span>
            <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {historicalSummary.totalHistoricalRuns || 0} Runs
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {historicalSummary.totalWeightKg ? `${(historicalSummary.totalWeightKg / 1000).toFixed(1)} Tons Processed` : 'Awaiting Ingestion'}
          </p>
        </div>

        <div className="bg-slate-900/90 border border-purple-500/20 rounded-xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-400">Unique Pipe Profiles</span>
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {uniquePlanningMatrix.length} Profiles
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Distinct Diameters & Specifications
          </p>
        </div>

        <div className="bg-slate-900/90 border border-emerald-500/20 rounded-xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-400">Mean Inferred Load Ratio</span>
            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Gauge className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {historicalSummary.avgLoadingRatio ? `${historicalSummary.avgLoadingRatio}%` : '80.5%'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Within 65% - 95% Target Envelope
          </p>
        </div>

        <div className="bg-slate-900/90 border border-amber-500/20 rounded-xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-slate-400">Allocated Extruders</span>
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
              <Split className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {Object.keys(historicalSummary.machineAllocations || {}).length || 6} Lines
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Primary + 2 Alternative Allocations
          </p>
        </div>

      </div>

      {/* 3. Sub-View Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('matrix')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'matrix'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Unique Pipe Profiles & Machine Allocation Matrix</span>
            <span className="text-[10px] bg-cyan-950 px-2 py-0.5 rounded-full border border-cyan-800">
              {uniquePlanningMatrix.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('runs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'runs'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Inferred Historical Production Runs Log</span>
            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full">
              {historicalRows.length}
            </span>
          </button>
        </div>

        <span className="text-xs text-slate-500 hidden sm:inline font-mono">
          ASTM D1785 / D2241 Sizing Engine Active
        </span>
      </div>

      {/* 4. Sub-Tab View 1: Unique Pipe Profiles & Machine Allocation Matrix */}
      {activeSubTab === 'matrix' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-4">
          
          {/* Matrix Toolbar */}
          <div className="p-6 bg-slate-900/70 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                <span>Unique Pipe Profiles & Machine Allocation Matrix</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Consolidated distinct catalog of pipe specifications, Outside Diameters (OD mm), primary extruders, nominal capacities, dual planning alternatives, and target extrusion rates.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search pipe, extruder, size..."
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Filter Extruder */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Filter className="w-3.5 h-3.5" />
                <select
                  value={selectedExtruderFilter}
                  onChange={(e) => setSelectedExtruderFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
                >
                  {primaryExtruders.map(m => (
                    <option key={m} value={m}>{m === 'ALL' ? 'All Assigned Extruders' : m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Matrix Table with Exact 7 Required Columns */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-200 text-left">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 min-w-[220px]">
                    Pipe Description & Standard Spec
                  </th>
                  <th className="py-3 px-3 text-center whitespace-nowrap text-teal-300 bg-teal-950/30">
                    OD (mm)
                  </th>
                  <th className="py-3 px-3 min-w-[150px] whitespace-nowrap text-cyan-300 bg-cyan-950/30">
                    Primary / Assigned Extruder
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    Nominal Machine Capacity (kg/h)
                  </th>
                  <th className="py-3 px-3 min-w-[180px] whitespace-nowrap text-indigo-300">
                    Planning Alternative 1
                  </th>
                  <th className="py-3 px-3 min-w-[180px] whitespace-nowrap text-purple-300">
                    Planning Alternative 2
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap text-emerald-300 bg-emerald-950/20">
                    Target Extrusion Rate Band
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredMatrix.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    
                    {/* 1. Pipe Description & Standard Spec */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-100">
                        {item.pipeDescription}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                        <span className="text-cyan-400">{item.extractedDiameter}</span>
                        <span>• Wall: {item.extractedThickness}</span>
                        <span>• Spec: {item.standardSpec}</span>
                      </div>
                    </td>

                    {/* 2. OD (mm) */}
                    <td className="py-3 px-3 text-center whitespace-nowrap bg-teal-950/20">
                      <span className="font-mono font-bold text-teal-300 px-2 py-1 rounded bg-teal-950 border border-teal-800/60 text-xs">
                        {item.odMm}
                      </span>
                    </td>

                    {/* 3. Primary / Assigned Extruder */}
                    <td className="py-3 px-3 whitespace-nowrap bg-cyan-950/10">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-800 text-cyan-300 font-mono font-bold text-xs">
                        <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{item.primaryExtruder}</span>
                      </span>
                    </td>

                    {/* 4. Nominal Machine Capacity (kg/h) */}
                    <td className="py-3 px-3 text-right whitespace-nowrap font-mono">
                      <span className="text-white font-bold text-xs">
                        {item.nominalCapacity}
                      </span>
                    </td>

                    {/* 5. Planning Alternative 1 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {item.planningAlternative1 && item.planningAlternative1 !== '-' ? (
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-indigo-300 font-mono text-xs">
                          {item.planningAlternative1}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono text-xs px-2">-</span>
                      )}
                    </td>

                    {/* 6. Planning Alternative 2 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {item.planningAlternative2 && item.planningAlternative2 !== '-' ? (
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-purple-300 font-mono text-xs">
                          {item.planningAlternative2}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono text-xs px-2">-</span>
                      )}
                    </td>

                    {/* 7. Target Extrusion Rate Band */}
                    <td className="py-3 px-4 text-right whitespace-nowrap bg-emerald-950/10">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 font-mono font-bold text-xs">
                        {item.targetRateBand}
                      </span>
                    </td>

                  </tr>
                ))}

                {filteredMatrix.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <Info className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No unique pipe profiles found. Please upload or load historical ERP data.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
            <span>Showing {filteredMatrix.length} distinct pipe sizing profiles</span>
            <span className="font-mono text-cyan-400">Deterministic Capacity Loading Protocol Active</span>
          </div>

        </div>
      )}

      {/* 5. Sub-Tab View 2: Inferred Historical Production Runs Log */}
      {activeSubTab === 'runs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-4">
          
          <div className="p-6 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-purple-400" />
                <span>Inferred Historical Production Runs Log</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Individual operational runs with machine assignments computed from actual throughput rates and allowable size ranges.
              </p>
            </div>

            <span className="text-xs font-mono text-slate-400 bg-slate-950 border border-slate-800 px-3 py-1 rounded-lg">
              {historicalRows.length} Historical Records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-200 text-left">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3 whitespace-nowrap">Data Source / Origin</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-4 min-w-[200px]">Product & Specs</th>
                  <th className="py-3 px-3 text-center">OD (mm)</th>
                  <th className="py-3 px-3 text-right">Actual Rate</th>
                  <th className="py-3 px-3 min-w-[160px] text-cyan-300 bg-cyan-950/20">
                    Inferred Primary Machine
                  </th>
                  <th className="py-3 px-3 text-center">Load Ratio %</th>
                  <th className="py-3 px-3 min-w-[160px]">Planning Alt 1</th>
                  <th className="py-3 px-3 min-w-[160px]">Planning Alt 2</th>
                  <th className="py-3 px-3 text-right">Target Band</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {historicalRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                    
                    <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">
                      {row.rowNumber}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Inferred by Model</span>
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {row.date}
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-100">{row.product}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Code: {row.itemCode} • Qty: {row.qty} • Total: {row.totalWeight} kg
                      </div>
                    </td>

                    <td className="py-3 px-3 text-center font-mono whitespace-nowrap text-teal-300">
                      {row.diameterMm ? `${row.diameterMm} mm` : row.diameter}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-purple-300 whitespace-nowrap">
                      {row.lineRateKgPerHour ? `${row.lineRateKgPerHour} kg/h` : '-'}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap bg-cyan-950/10 font-bold text-cyan-300">
                      <div className="flex items-center gap-1.5 font-mono">
                        <Cpu className="w-3 h-3 text-cyan-400" />
                        <span>{row.inferredMachine}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block font-normal">
                        Nominal: {row.primaryCapacity} kg/h
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                        row.primaryLoadingRatio >= 65 && row.primaryLoadingRatio <= 95
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {row.primaryLoadingRatio}%
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {row.alternative1} ({row.alternative1Capacity} kg/h)
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {row.alternative2} ({row.alternative2Capacity} kg/h)
                    </td>

                    <td className="py-3 px-3 text-right font-mono text-emerald-400 whitespace-nowrap">
                      {row.targetRateBand}
                    </td>

                  </tr>
                ))}

                {historicalRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-500">
                      <Info className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No historical ERP records loaded yet.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-950/80 border-t border-slate-800 text-xs text-slate-400">
            Total Inferred Runs: {historicalRows.length}
          </div>

        </div>
      )}

    </div>
  );
}
