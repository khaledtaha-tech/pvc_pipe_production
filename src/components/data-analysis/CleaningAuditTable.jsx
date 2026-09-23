import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  AlertOctagon,
  Sparkles, 
  ArrowUpDown,
  Gauge,
  Layers,
  Cpu,
  Info,
  Activity
} from 'lucide-react';

export default function CleaningAuditTable({ cleanedRows = [], auditReport = {}, onExportClean, lang = 'en', theme = 'dark' }) {
  const isAr = lang === 'ar';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('ALL');
  const [selectedDiameter, setSelectedDiameter] = useState('ALL');
  const [selectedSizingStatus, setSelectedSizingStatus] = useState('ALL');
  const [selectedDataSource, setSelectedDataSource] = useState('ALL');
  const [sortField, setSortField] = useState('rowNumber');
  const [sortAsc, setSortAsc] = useState(true);

  // Distinct machine list for filter
  const machines = useMemo(() => {
    const set = new Set(cleanedRows.map(r => r.machine));
    return ['ALL', ...Array.from(set).sort()];
  }, [cleanedRows]);

  // Distinct diameter list for filter
  const diameters = useMemo(() => {
    const set = new Set(cleanedRows.map(r => r.diameter).filter(d => d && d !== '-'));
    return ['ALL', ...Array.from(set).sort()];
  }, [cleanedRows]);

  // Sizing status counts
  const statusCounts = useMemo(() => {
    const counts = { optimal: 0, suboptimal: 0, violation: 0, pelletizing: 0 };
    cleanedRows.forEach(r => {
      if (r.isPelletizing || r.sizingStatus === 'Pelletizing Line (Exempt)') counts.pelletizing++;
      else if (r.sizingStatus === 'Optimal Sizing & Loading') counts.optimal++;
      else if (r.sizingStatus === 'Range Violation') counts.violation++;
      else if (r.sizingStatus === 'Suboptimal / Derated') counts.suboptimal++;
    });
    return counts;
  }, [cleanedRows]);

  // Filter & Search rows
  const filteredRows = useMemo(() => {
    return cleanedRows.filter(row => {
      // Data Source filter
      if (selectedDataSource !== 'ALL') {
        const isHistorical = row.dataSource === 'Inferred by Model' || row.dataSource === 'ERP Historical (Inferred)';
        if (selectedDataSource === 'INFERRED' && !isHistorical) return false;
        if (selectedDataSource === 'ACTUAL' && isHistorical) return false;
      }

      // Machine filter
      if (selectedMachine !== 'ALL' && row.machine !== selectedMachine) return false;

      // Diameter filter
      if (selectedDiameter !== 'ALL' && row.diameter !== selectedDiameter) return false;

      // Sizing status filter
      if (selectedSizingStatus !== 'ALL' && row.sizingStatus !== selectedSizingStatus) return false;

      // Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = 
          (row.product && row.product.toLowerCase().includes(term)) ||
          String(row.itemCode).toLowerCase().includes(term) ||
          (row.machine && row.machine.toLowerCase().includes(term)) ||
          (row.diameter && row.diameter.toLowerCase().includes(term)) ||
          (row.thickness && row.thickness.toLowerCase().includes(term)) ||
          (row.sizingStatus && row.sizingStatus.toLowerCase().includes(term));
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? (valA - valB) : (valB - valA);
    });
  }, [cleanedRows, selectedMachine, selectedDiameter, selectedSizingStatus, searchTerm, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getSizingBadgeStyle = (status) => {
    switch (status) {
      case 'Optimal Sizing & Loading':
      case 'Optimal Sizing':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Suboptimal / Derated':
      case 'Suboptimal Rate':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Range Violation':
        return 'bg-rose-500/25 text-rose-300 border-rose-500/50 animate-pulse';
      case 'Pelletizing Line (Exempt)':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      
      {/* Header Banner */}
      <div className="p-6 bg-slate-900/60 border-b border-slate-800">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-base text-white">
                Extrusion Line Sizing & Throughput Rate Capability Table
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Evaluated against Master Machine Envelopes (allowable diameter ranges and nominal extrusion capacities)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-semibold">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{statusCounts.optimal} Optimal</span>
            </div>

            {statusCounts.violation > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs font-semibold">
                <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                <span>{statusCounts.violation} Range Violations</span>
              </div>
            )}

            {statusCounts.pelletizing > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-950/60 border border-purple-800/80 text-purple-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>{statusCounts.pelletizing} Pelletizing (Exempt)</span>
              </div>
            )}

            <button
              onClick={onExportClean}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-900/30 transition transform active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Export Sizing Analysis (Excel)</span>
            </button>
          </div>
        </div>

        {/* Search and Filters Toolbar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-800/80">
          
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search product, machine, diameter, code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Machine, Diameter, Sizing Status Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            
            {/* Machine Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Cpu className="w-3.5 h-3.5" />
              <select
                value={selectedMachine}
                onChange={(e) => setSelectedMachine(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                {machines.map(m => (
                  <option key={m} value={m}>{m === 'ALL' ? 'All Extruders' : m}</option>
                ))}
              </select>
            </div>

            {/* Diameter Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Layers className="w-3.5 h-3.5" />
              <select
                value={selectedDiameter}
                onChange={(e) => setSelectedDiameter(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                {diameters.map(d => (
                  <option key={d} value={d}>{d === 'ALL' ? 'All Diameters' : d}</option>
                ))}
              </select>
            </div>

            {/* Sizing Status Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Filter className="w-3.5 h-3.5" />
              <select
                value={selectedSizingStatus}
                onChange={(e) => setSelectedSizingStatus(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">All Compatibility Statuses</option>
                <option value="Optimal Sizing & Loading">Optimal Sizing & Loading</option>
                <option value="Suboptimal / Derated">Suboptimal / Derated</option>
                <option value="Range Violation">Range Violations Only</option>
                <option value="Pelletizing Line (Exempt)">Pelletizing Line (Exempt)</option>
              </select>
            </div>

            {/* Data Source Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <select
                value={selectedDataSource}
                onChange={(e) => setSelectedDataSource(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">{isAr ? 'جميع مصادر البيانات (All Sources)' : 'All Data Sources'}</option>
                <option value="ACTUAL">{isAr ? 'إنتاج حقيقي (Actual Production)' : 'Actual Production'}</option>
                <option value="INFERRED">{isAr ? 'مستنتج بالحسابات (Inferred)' : 'Inferred by Model'}</option>
              </select>
            </div>

          </div>

        </div>
      </div>

      {/* Focused Engineering Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-slate-200 text-left">
          <thead className="bg-slate-950/90 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-3 cursor-pointer hover:text-white" onClick={() => handleSort('rowNumber')}>
                <div className="flex items-center gap-1">
                  <span>#</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-3 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('dataSource')}>
                <div className="flex items-center gap-1">
                  <span>Data Source / Origin</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-3 cursor-pointer hover:text-white" onClick={() => handleSort('machine')}>
                <div className="flex items-center gap-1">
                  <span>Machine / Extruder</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-3 min-w-[200px] cursor-pointer hover:text-white" onClick={() => handleSort('product')}>
                <div className="flex items-center gap-1">
                  <span>Product Description & Specs</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-3 cursor-pointer hover:text-white text-teal-300 bg-teal-950/40 border-b-2 border-teal-500" onClick={() => handleSort('diameter')}>
                <div className="flex items-center gap-1">
                  <span>Extracted Diameter</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-3 cursor-pointer hover:text-white text-blue-300 bg-blue-950/40 border-b-2 border-blue-500" onClick={() => handleSort('thickness')}>
                <div className="flex items-center gap-1">
                  <span>Thickness</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('nominalCapacity')}>
                <div className="flex items-center justify-end gap-1">
                  <span>Nominal Cap</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:text-white text-purple-300 bg-purple-950/30 border-b-2 border-purple-500" onClick={() => handleSort('lineRateKgPerHour')}>
                <div className="flex items-center justify-end gap-1">
                  <span>Output (kg/hr)</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('lineEfficiency')}>
                <div className="flex items-center justify-end gap-1">
                  <span>Efficiency %</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-3 min-w-[220px] cursor-pointer hover:text-white" onClick={() => handleSort('sizingStatus')}>
                <div className="flex items-center gap-1">
                  <span>Status / Sizing Feasibility</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {filteredRows.map((row) => {
              const isViolation = row.sizingStatus === 'Range Violation';

              return (
                <tr 
                  key={row.id}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    isViolation ? 'bg-rose-950/20' : ''
                  }`}
                >
                  {/* Row index */}
                  <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">
                    {row.rowNumber}
                  </td>

                  {/* Data Source / Origin */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    {row.dataSource === 'Inferred by Model' || row.dataSource === 'ERP Historical (Inferred)' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Inferred by Model</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                        <CheckCircle className="w-2.5 h-2.5" />
                        <span>Actual Production</span>
                      </span>
                    )}
                  </td>

                  {/* Machine */}
                  <td className="py-3 px-3 font-bold text-slate-100 whitespace-nowrap">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700 text-cyan-300 font-mono text-xs">
                          <Cpu className="w-3 h-3 text-cyan-400" />
                          {row.machine}
                        </span>
                        {(row.isPelletizing || row.machine === 'KTS 550' || row.machine === 'KTS-550' || row.machine === 'BAUSANO' || row.profileName === 'Bausano') && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-900/60 text-purple-300 border border-purple-700/60" title={isAr ? "ماكينة تحبيب (Pelletizing Line) - استثناء من تقييم أقطار المواسير" : "Pelletizing Line - Exempt from pipe diameter sizing evaluations"}>
                            {isAr ? 'ماكينة تحبيب (Pelletizing Line)' : 'Pelletizing Line'}
                          </span>
                        )}
                      </div>
                      {row.nominalRangeText && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          Range: {row.nominalRangeText}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Product Description */}
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-200">
                      {row.product}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                      <span>Code: {row.itemCode}</span>
                      {row.material && <span>• {row.material}</span>}
                      {row.standard && row.standard !== 'N/A' && <span>• {row.standard}</span>}
                    </div>
                  </td>

                  {/* Extracted Diameter */}
                  <td className="py-3 px-3 whitespace-nowrap bg-teal-950/20">
                    <div className="space-y-0.5">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-teal-300 px-2 py-0.5 rounded-lg bg-teal-950/80 border border-teal-800/80 text-xs">
                        <Layers className="w-3 h-3" />
                        {row.diameter}
                      </span>
                      {row.diameterMm !== null && (
                        <div className="text-[10px] text-teal-400 font-mono">
                          OD: {row.diameterMm} mm
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Extracted Thickness */}
                  <td className="py-3 px-3 whitespace-nowrap bg-blue-950/20">
                    <span className="inline-flex items-center font-mono font-bold text-blue-300 px-2 py-0.5 rounded-lg bg-blue-950/80 border border-blue-800/80 text-xs">
                      {row.thickness}
                    </span>
                  </td>

                  {/* Nominal Capacity (kg/h) */}
                  <td className="py-3 px-3 text-right whitespace-nowrap font-mono text-slate-300">
                    {row.nominalCapacity ? (
                      <div>
                        <span className="font-bold">{row.nominalCapacity}</span>
                        <span className="text-[10px] text-slate-500 ml-1">kg/h</span>
                      </div>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>

                  {/* Extrusion Output Rate (kg/hr) */}
                  <td className="py-3 px-3 text-right whitespace-nowrap bg-purple-950/10">
                    <span className="font-mono font-black text-sm text-purple-300">
                      {row.lineRateKgPerHour > 0 ? `${row.lineRateKgPerHour.toFixed(1)}` : '-'}
                    </span>
                    {row.lineRateKgPerHour > 0 && (
                      <span className="text-[10px] text-slate-400 font-mono ml-1">kg/h</span>
                    )}
                  </td>

                  {/* Line Efficiency % */}
                  <td className="py-3 px-3 text-right whitespace-nowrap font-mono">
                    {row.lineEfficiency !== null ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        row.lineEfficiency >= 70
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : (row.lineEfficiency >= 50 ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300')
                      }`}>
                        {row.lineEfficiency.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>

                  {/* Status / Sizing Feasibility */}
                  <td className="py-3 px-3">
                    <div className="space-y-1">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getSizingBadgeStyle(row.sizingStatus)}`}>
                        {isViolation && <AlertOctagon className="w-3 h-3 text-rose-400" />}
                        {row.sizingStatus === 'Optimal Sizing & Loading' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                        {row.sizingStatus === 'Suboptimal / Derated' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                        <span>{row.sizingStatus}</span>
                      </span>
                      <p className="text-[10px] text-slate-400 font-normal">
                        {row.sizingNote}
                      </p>
                    </div>
                  </td>

                </tr>
              );
            })}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-500">
                  <Info className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No production runs match the selected machine, data source, or sizing filter.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer Summary */}
      <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
        <span>Showing {filteredRows.length} of {cleanedRows.length} calibrated sizing records</span>
        <span className="font-mono text-cyan-400">Master Sizing Protocol Active</span>
      </div>

    </div>
  );
}
