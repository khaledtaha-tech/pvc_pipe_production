import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Search, 
  Filter, 
  Download, 
  Layers, 
  Cpu, 
  ArrowUpDown, 
  Sparkles, 
  Factory, 
  Table, 
  Upload, 
  RotateCcw,
  CheckCircle2,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Database,
  SlidersHorizontal
} from 'lucide-react';
import { 
  MASTER_COLUMNS, 
  ORIGIN_ACTUAL_LOG, 
  ORIGIN_ERP_LOG 
} from '../../utils/inferenceEngine';
import { t } from '../../utils/translations';

export default function MasterExtrusionTable({
  masterRuns = [],
  onExportMasterPlan,
  uniquePlanningMatrix = [],
  onUploadHistoricalFile,
  onLoadHistoricalSample,
  onClearHistoricalData,
  lang = 'en',
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [selectedMachine, setSelectedMachine] = useState('ALL');
  const [selectedDiameter, setSelectedDiameter] = useState('ALL');
  const [selectedMaterial, setSelectedMaterial] = useState('ALL');
  const [sortField, setSortField] = useState(MASTER_COLUMNS.DATE);
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [activeSubView, setActiveSubView] = useState('master'); // 'master' | 'matrix' | 'import'

  // Summary counts
  const stats = useMemo(() => {
    let actualCount = 0;
    let erpCount = 0;
    let totalWeightKg = 0;
    let totalQty = 0;

    masterRuns.forEach(r => {
      if (r[MASTER_COLUMNS.DATA_SOURCE] === ORIGIN_ACTUAL_LOG) {
        actualCount++;
      } else {
        erpCount++;
      }
      totalWeightKg += Number(r[MASTER_COLUMNS.TOTAL_WEIGHT]) || 0;
      totalQty += Number(r[MASTER_COLUMNS.QTY]) || 0;
    });

    return {
      totalRuns: masterRuns.length,
      actualCount,
      erpCount,
      totalWeightKg: Math.round(totalWeightKg),
      totalWeightTons: (totalWeightKg / 1000).toFixed(1),
      totalQty
    };
  }, [masterRuns]);

  // Distinct Filter options
  const filterOptions = useMemo(() => {
    const machineSet = new Set();
    const diameterSet = new Set();
    const materialSet = new Set();

    masterRuns.forEach(r => {
      const mach = r[MASTER_COLUMNS.CURRENT_LINE];
      if (mach && mach !== '-') machineSet.add(mach);

      const prop = r[MASTER_COLUMNS.PRIMARY_PROPOSAL];
      if (prop && prop !== '-') machineSet.add(prop);

      const diam = r[MASTER_COLUMNS.DIAMETER];
      if (diam && diam !== '-') diameterSet.add(diam);

      const mat = r[MASTER_COLUMNS.MATERIAL];
      if (mat && mat !== '-') materialSet.add(mat);
    });

    return {
      machines: ['ALL', ...Array.from(machineSet).sort()],
      diameters: ['ALL', ...Array.from(diameterSet).sort()],
      materials: ['ALL', ...Array.from(materialSet).sort()]
    };
  }, [masterRuns]);

  // Filter & Search Master Runs
  const filteredRuns = useMemo(() => {
    return masterRuns.filter(run => {
      // Source filter
      if (selectedSource !== 'ALL') {
        const isActual = run[MASTER_COLUMNS.DATA_SOURCE] === ORIGIN_ACTUAL_LOG;
        if (selectedSource === 'ACTUAL' && !isActual) return false;
        if (selectedSource === 'ERP' && isActual) return false;
      }

      // Machine filter
      if (selectedMachine !== 'ALL') {
        const matchesMachine = 
          run[MASTER_COLUMNS.CURRENT_LINE] === selectedMachine ||
          run[MASTER_COLUMNS.PRIMARY_PROPOSAL] === selectedMachine;
        if (!matchesMachine) return false;
      }

      // Diameter filter
      if (selectedDiameter !== 'ALL') {
        if (run[MASTER_COLUMNS.DIAMETER] !== selectedDiameter) return false;
      }

      // Material filter
      if (selectedMaterial !== 'ALL') {
        if (run[MASTER_COLUMNS.MATERIAL] !== selectedMaterial) return false;
      }

      // Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const str = [
          run[MASTER_COLUMNS.PRODUCT_DESC],
          run[MASTER_COLUMNS.ITEM_CODE],
          run[MASTER_COLUMNS.DIAMETER],
          run[MASTER_COLUMNS.CURRENT_LINE],
          run[MASTER_COLUMNS.PRIMARY_PROPOSAL],
          run[MASTER_COLUMNS.MATERIAL],
          run[MASTER_COLUMNS.DATE]
        ].join(' ').toLowerCase();

        if (!str.includes(term)) return false;
      }

      return true;
    }).sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? ((valA || 0) - (valB || 0)) : ((valB || 0) - (valA || 0));
    });
  }, [masterRuns, selectedSource, selectedMachine, selectedDiameter, selectedMaterial, searchTerm, sortField, sortAsc]);

  // Pagination calculation
  const totalPages = pageSize === 'ALL' ? 1 : Math.max(1, Math.ceil(filteredRuns.length / Number(pageSize)));
  const currentPage = Math.min(page, totalPages);

  const paginatedRuns = useMemo(() => {
    if (pageSize === 'ALL') return filteredRuns;
    const size = Number(pageSize);
    const start = (currentPage - 1) * size;
    return filteredRuns.slice(start, start + size);
  }, [filteredRuns, currentPage, pageSize]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className={`${isLight ? 'bg-white border border-[#d8d0c2] shadow-sm' : 'bg-slate-900 border border-slate-800 shadow-2xl'} rounded-2xl overflow-hidden space-y-0`}>
      
      {/* Top Banner & Metric Summary */}
      <div className={`p-6 ${isLight ? 'bg-white border-b border-[#e2dad0]' : 'bg-slate-900 border-b border-slate-800'}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          
          {/* Title & View Switcher */}
          <div>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${isLight ? 'bg-teal-50 text-[#0f766e] border border-teal-300' : 'bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-900/30'}`}>
                <Table className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className={`text-lg font-bold tracking-tight ${isLight ? 'text-stone-900' : 'text-white'}`}>
                    {t('tabMasterTable', lang)}
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${isLight ? 'bg-teal-50 text-teal-800 border border-teal-300' : 'bg-cyan-950 text-cyan-400 border border-cyan-800'}`}>
                    {t('columnsUnified', lang)}
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-stone-600' : 'text-slate-400'}`}>
                  {t('masterTableSubtitle', lang)}
                </p>
              </div>
            </div>

            {/* Sub-view switcher tabs */}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => setActiveSubView('master')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeSubView === 'master'
                    ? (isLight ? 'bg-[#d8edea] text-[#004d40] border-2 border-[#0f766e] shadow-xs' : 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40')
                    : (isLight ? 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-300' : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800')
                }`}
              >
                <Table className={`w-3.5 h-3.5 ${isLight && activeSubView === 'master' ? 'text-[#0f766e]' : ''}`} />
                <span>{t('allProductionRuns', lang)} ({masterRuns.length})</span>
              </button>

              <button
                onClick={() => setActiveSubView('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeSubView === 'matrix'
                    ? (isLight ? 'bg-purple-50 text-purple-900 border-2 border-purple-600 shadow-xs' : 'bg-purple-600 text-white shadow-md shadow-purple-900/40')
                    : (isLight ? 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-300' : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800')
                }`}
              >
                <Layers className={`w-3.5 h-3.5 ${isLight && activeSubView === 'matrix' ? 'text-purple-700' : 'text-purple-400'}`} />
                <span>{t('distinctSizingMatrix', lang)} ({uniquePlanningMatrix.length})</span>
              </button>
            </div>
          </div>

          {/* Key Metrics & Single Unified Excel Export Button */}
          <div className="flex flex-wrap items-center gap-3 justify-end">
            
            {/* Quick stats chips */}
            <div className="flex items-center gap-2">
              <div className={`px-3 py-1.5 rounded-xl text-xs ${isLight ? 'bg-stone-50 border border-stone-300' : 'bg-slate-950 border border-slate-800'}`}>
                <span className={isLight ? 'text-stone-500' : 'text-slate-400'}>{t('tableStatsActual', lang)} </span>
                <strong className={`font-mono font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{stats.actualCount}</strong>
              </div>

              <div className={`px-3 py-1.5 rounded-xl text-xs ${isLight ? 'bg-stone-50 border border-stone-300' : 'bg-slate-950 border border-slate-800'}`}>
                <span className={isLight ? 'text-stone-500' : 'text-slate-400'}>{t('tableStatsErp', lang)} </span>
                <strong className={`font-mono font-bold ${isLight ? 'text-purple-700' : 'text-purple-400'}`}>{stats.erpCount}</strong>
              </div>

              <div className={`px-3 py-1.5 rounded-xl text-xs ${isLight ? 'bg-stone-50 border border-stone-300' : 'bg-slate-950 border border-slate-800'}`}>
                <span className={isLight ? 'text-stone-500' : 'text-slate-400'}>{t('tableStatsTotal', lang)} </span>
                <strong className={`font-mono font-bold ${isLight ? 'text-teal-700' : 'text-cyan-300'}`}>{stats.totalRuns}</strong>
              </div>

              <div className={`hidden sm:block px-3 py-1.5 rounded-xl text-xs ${isLight ? 'bg-stone-50 border border-stone-300' : 'bg-slate-950 border border-slate-800'}`}>
                <span className={isLight ? 'text-stone-500' : 'text-slate-400'}>{t('tableStatsTonnage', lang)} </span>
                <strong className={`font-mono font-bold ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{stats.totalWeightTons} t</strong>
              </div>
            </div>

            {/* Primary Action Button: Export Master Extrusion Plan (Excel) */}
            <button
              onClick={onExportMasterPlan}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition transform active:scale-95 cursor-pointer ${
                isLight
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-2 border-emerald-600 shadow-xs'
                  : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-950/50 border border-emerald-500/40'
              }`}
              title="Single-click download of unified master extrusion plan (single sheet, frozen headers, zero duplicates)"
            >
              <Download className={`w-4 h-4 ${isLight ? 'text-emerald-700' : ''}`} />
              <span>{t('exportMasterPlanBtn', lang)}</span>
            </button>

          </div>
        </div>

        {/* Search & Filter Toolbar (visible in master table subview) */}
        {activeSubView === 'master' && (
          <div className={`flex flex-col md:flex-row items-center justify-between gap-3 mt-5 pt-4 border-t ${isLight ? 'border-stone-200' : 'border-slate-800/80'}`}>
            
            {/* Search Box */}
            <div className="relative w-full md:w-80">
              <Search className={`w-4 h-4 absolute left-3 top-2.5 ${isLight ? 'text-stone-400' : 'text-slate-400'}`} />
              <input
                type="text"
                placeholder={t('searchRunsPlaceholder', lang)}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className={`w-full rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 ${
                  isLight
                    ? 'bg-stone-50 border border-stone-300 text-stone-900 placeholder-stone-400 focus:ring-teal-600'
                    : 'bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 focus:ring-cyan-500'
                }`}
              />
            </div>

            {/* Dropdown Filters */}
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
              
              {/* Origin / Data Source filter */}
              <div className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 ${isLight ? 'bg-stone-50 border border-stone-300 text-stone-700' : 'bg-slate-950 border border-slate-700/80 text-slate-400'}`}>
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                <select
                  value={selectedSource}
                  onChange={(e) => {
                    setSelectedSource(e.target.value);
                    setPage(1);
                  }}
                  className={`bg-transparent text-xs focus:outline-none cursor-pointer ${isLight ? 'text-stone-900 font-medium' : 'text-slate-200'}`}
                >
                  <option value="ALL" className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>{t('filterAllSources', lang)} ({stats.totalRuns})</option>
                  <option value="ACTUAL" className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>{t('filterActualSource', lang)} ({stats.actualCount})</option>
                  <option value="ERP" className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>{t('filterErpSource', lang)} ({stats.erpCount})</option>
                </select>
              </div>

              {/* Machine Filter */}
              <div className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 ${isLight ? 'bg-stone-50 border border-stone-300 text-stone-700' : 'bg-slate-950 border border-slate-700/80 text-slate-400'}`}>
                <Cpu className="w-3.5 h-3.5 text-cyan-500" />
                <select
                  value={selectedMachine}
                  onChange={(e) => {
                    setSelectedMachine(e.target.value);
                    setPage(1);
                  }}
                  className={`bg-transparent text-xs focus:outline-none cursor-pointer ${isLight ? 'text-stone-900 font-medium' : 'text-slate-200'}`}
                >
                  {filterOptions.machines.map(m => (
                    <option key={m} value={m} className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>
                      {m === 'ALL' ? t('filterAllMachines', lang) : m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Diameter Filter */}
              <div className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 ${isLight ? 'bg-stone-50 border border-stone-300 text-stone-700' : 'bg-slate-950 border border-slate-700/80 text-slate-400'}`}>
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <select
                  value={selectedDiameter}
                  onChange={(e) => {
                    setSelectedDiameter(e.target.value);
                    setPage(1);
                  }}
                  className={`bg-transparent text-xs focus:outline-none cursor-pointer ${isLight ? 'text-stone-900 font-medium' : 'text-slate-200'}`}
                >
                  {filterOptions.diameters.map(d => (
                    <option key={d} value={d} className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>
                      {d === 'ALL' ? t('filterAllDiameters', lang) : d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Material Filter */}
              <div className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 ${isLight ? 'bg-stone-50 border border-stone-300 text-stone-700' : 'bg-slate-950 border border-slate-700/80 text-slate-400'}`}>
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
                <select
                  value={selectedMaterial}
                  onChange={(e) => {
                    setSelectedMaterial(e.target.value);
                    setPage(1);
                  }}
                  className={`bg-transparent text-xs focus:outline-none cursor-pointer ${isLight ? 'text-stone-900 font-medium' : 'text-slate-200'}`}
                >
                  {filterOptions.materials.map(m => (
                    <option key={m} value={m} className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>
                      {m === 'ALL' ? t('filterAllMaterials', lang) : m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset Filters button */}
              {(selectedSource !== 'ALL' || selectedMachine !== 'ALL' || selectedDiameter !== 'ALL' || selectedMaterial !== 'ALL' || searchTerm) && (
                <button
                  onClick={() => {
                    setSelectedSource('ALL');
                    setSelectedMachine('ALL');
                    setSelectedDiameter('ALL');
                    setSelectedMaterial('ALL');
                    setSearchTerm('');
                    setPage(1);
                  }}
                  className={`p-1.5 rounded-lg transition ${isLight ? 'hover:bg-stone-100 text-stone-500' : 'p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800'}`}
                  title={t('resetFilters', lang)}
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                </button>
              )}

            </div>
          </div>
        )}

      </div>

      {/* VIEW 1: Master Production Runs Table (All 18 Columns, Horizontal Scroll) */}
      {activeSubView === 'master' && (
        <>
          <div className={`overflow-x-auto overflow-y-auto max-h-[72vh] rounded-xl relative shadow-inner ${isLight ? 'border border-stone-300/80 bg-white' : 'border border-slate-800/80'}`}>
            <table className={`w-full text-xs text-left min-w-[1950px] divide-y ${isLight ? 'text-stone-900 divide-stone-200' : 'text-slate-200 divide-slate-800'}`}>
              
              {/* Table Header: Exactly the 18 columns specified */}
              <thead className={`uppercase tracking-wider text-[11px] sticky top-0 z-20 ${isLight ? 'bg-[#ece6db] text-stone-800 font-bold border-b-2 border-stone-300' : 'bg-slate-950/90 text-slate-400 font-semibold'}`}>
                <tr>
                  <th className={`py-3 px-3 w-12 text-center ${isLight ? 'text-stone-500' : 'text-slate-500'}`}>#</th>
                  
                  {/* 1. Date */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort(MASTER_COLUMNS.DATE)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colDate', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 2. Data Source / Origin */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white whitespace-nowrap min-w-[170px]" onClick={() => handleSort(MASTER_COLUMNS.DATA_SOURCE)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colSource', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 3. Item Code */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort(MASTER_COLUMNS.ITEM_CODE)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colItemCode', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 4. Product Description & Specs */}
                  <th className="py-3 px-3 min-w-[260px] cursor-pointer hover:text-white" onClick={() => handleSort(MASTER_COLUMNS.PRODUCT_DESC)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colDescription', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 5. Pipe Diameter (and Metric OD mm) */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white text-teal-300 bg-teal-950/30 border-b-2 border-teal-500 whitespace-nowrap" onClick={() => handleSort(MASTER_COLUMNS.DIAMETER)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colDiameter', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 6. Wall Thickness / SDR */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white text-blue-300 bg-blue-950/30 border-b-2 border-blue-500 whitespace-nowrap" onClick={() => handleSort(MASTER_COLUMNS.THICKNESS)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colThickness', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 7. Material (uPVC, HDPE, etc.) */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort(MASTER_COLUMNS.MATERIAL)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colMaterial', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 8. Production Qty (Pcs / Lengths) */}
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort(MASTER_COLUMNS.QTY)}>
                    <div className="flex items-center justify-end gap-1">
                      <span>{t('colQty', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 9. Total Production Weight (kg) */}
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort(MASTER_COLUMNS.TOTAL_WEIGHT)}>
                    <div className="flex items-center justify-end gap-1">
                      <span>{t('colWeight', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 10. Scrap Weight (kg) */}
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-white whitespace-nowrap text-amber-300" onClick={() => handleSort(MASTER_COLUMNS.SCRAP_WEIGHT)}>
                    <div className="flex items-center justify-end gap-1">
                      <span>{t('colScrap', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 11. Actual Extrusion Rate (kg/hr) */}
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-white text-teal-300 bg-teal-950/30 border-b-2 border-teal-500 whitespace-nowrap" onClick={() => handleSort(MASTER_COLUMNS.ACTUAL_RATE)}>
                    <div className="flex items-center justify-end gap-1">
                      <span>{t('colRate', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 12. Current/Inferred Extruder Line */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort(MASTER_COLUMNS.CURRENT_LINE)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colCurrentLine', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 13. Primary Proposal */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white text-cyan-300 bg-cyan-950/40 border-b-2 border-cyan-500 whitespace-nowrap min-w-[180px]" onClick={() => handleSort(MASTER_COLUMNS.PRIMARY_PROPOSAL)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colPrimaryProposal', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 14. Expected Rate Band 1 */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white text-cyan-200 bg-cyan-950/20 whitespace-nowrap min-w-[190px]" onClick={() => handleSort(MASTER_COLUMNS.EXPECTED_RATE_BAND_1)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colExpectedBand1', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 15. Alternative Proposal 1 */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white text-indigo-300 bg-indigo-950/40 border-b-2 border-indigo-500 whitespace-nowrap min-w-[180px]" onClick={() => handleSort(MASTER_COLUMNS.ALT_PROPOSAL_1)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colAltProposal1', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 16. Expected Rate Band 2 */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white text-indigo-200 bg-indigo-950/20 whitespace-nowrap min-w-[190px]" onClick={() => handleSort(MASTER_COLUMNS.EXPECTED_RATE_BAND_2)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colExpectedBand2', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 17. Alternative Proposal 2 */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white text-slate-300 bg-slate-800/60 border-b-2 border-slate-600 whitespace-nowrap min-w-[180px]" onClick={() => handleSort(MASTER_COLUMNS.ALT_PROPOSAL_2)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colAltProposal2', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                  {/* 18. Expected Rate Band 3 */}
                  <th className="py-3 px-3 cursor-pointer hover:text-white text-slate-400 bg-slate-800/40 whitespace-nowrap min-w-[190px]" onClick={() => handleSort(MASTER_COLUMNS.EXPECTED_RATE_BAND_3)}>
                    <div className="flex items-center gap-1">
                      <span>{t('colExpectedBand3', lang)}</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>

                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-800/70 font-medium">
                {paginatedRuns.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="py-12 text-center text-slate-400 text-sm">
                      {t('noRunsFound', lang)}
                    </td>
                  </tr>
                ) : (
                  paginatedRuns.map((row, idx) => {
                    const isActual = row[MASTER_COLUMNS.DATA_SOURCE] === ORIGIN_ACTUAL_LOG;
                    const rowIdx = pageSize === 'ALL' ? (idx + 1) : ((currentPage - 1) * Number(pageSize) + idx + 1);

                    return (
                      <tr 
                        key={row.id || rowIdx}
                        className={`${isLight ? 'hover:bg-[#f7f4ef] divide-stone-200' : 'hover:bg-slate-800/40'} transition-colors group`}
                      >
                        {/* Index */}
                        <td className={`py-2.5 px-3 text-center font-mono text-[10px] ${isLight ? 'text-stone-400' : 'text-slate-500'}`}>
                          {rowIdx}
                        </td>

                        {/* 1. Date */}
                        <td className={`py-2.5 px-3 font-mono whitespace-nowrap ${isLight ? 'text-stone-700' : 'text-slate-300'}`}>
                          {row[MASTER_COLUMNS.DATE]}
                        </td>

                        {/* 2. Data Source / Origin */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isActual ? (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-xs ${
                              isLight ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60'
                            }`}>
                              <Factory className={`w-3 h-3 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />
                              <span>{row[MASTER_COLUMNS.DATA_SOURCE]}</span>
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-xs ${
                              isLight ? 'bg-purple-50 text-purple-800 border border-purple-300' : 'bg-purple-950/70 text-purple-300 border border-purple-800/60'
                            }`}>
                              <Sparkles className={`w-3 h-3 ${isLight ? 'text-purple-700' : 'text-purple-400'}`} />
                              <span>{row[MASTER_COLUMNS.DATA_SOURCE]}</span>
                            </span>
                          )}
                        </td>

                        {/* 3. Item Code */}
                        <td className={`py-2.5 px-3 font-mono whitespace-nowrap font-semibold ${isLight ? 'text-[#0f766e]' : 'text-cyan-300'}`}>
                          {row[MASTER_COLUMNS.ITEM_CODE]}
                        </td>

                        {/* 4. Product Description & Specs */}
                        <td className={`py-2.5 px-3 max-w-xs font-semibold truncate ${isLight ? 'text-stone-900' : 'text-slate-100'}`} title={row[MASTER_COLUMNS.PRODUCT_DESC]}>
                          {row[MASTER_COLUMNS.PRODUCT_DESC]}
                        </td>

                        {/* 5. Pipe Diameter (and Metric OD mm) */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                            isLight ? 'bg-teal-50 text-teal-900 border border-teal-300' : 'bg-teal-950/70 text-teal-300 border border-teal-800/60'
                          }`}>
                            {row[MASTER_COLUMNS.DIAMETER]}
                          </span>
                        </td>

                        {/* 6. Wall Thickness / SDR */}
                        <td className={`py-2.5 px-3 whitespace-nowrap font-mono ${isLight ? 'text-blue-900 font-semibold' : 'text-blue-300'}`}>
                          {row[MASTER_COLUMNS.THICKNESS]}
                        </td>

                        {/* 7. Material (uPVC, HDPE, etc.) */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isLight ? 'bg-stone-100 text-stone-800 border border-stone-300' : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {row[MASTER_COLUMNS.MATERIAL]}
                          </span>
                        </td>

                        {/* 8. Production Qty */}
                        <td className={`py-2.5 px-3 text-right font-mono whitespace-nowrap ${isLight ? 'text-stone-800' : 'text-slate-300'}`}>
                          {row[MASTER_COLUMNS.QTY] ? row[MASTER_COLUMNS.QTY].toLocaleString() : '-'}
                        </td>

                        {/* 9. Total Production Weight (kg) */}
                        <td className={`py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap ${isLight ? 'text-stone-900 font-bold' : 'text-slate-100'}`}>
                          {row[MASTER_COLUMNS.TOTAL_WEIGHT] ? `${row[MASTER_COLUMNS.TOTAL_WEIGHT].toLocaleString()} kg` : '-'}
                        </td>

                        {/* 10. Scrap Weight (kg) */}
                        <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                          {row[MASTER_COLUMNS.SCRAP_WEIGHT] > 0 ? (
                            <span className={`font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>{row[MASTER_COLUMNS.SCRAP_WEIGHT].toLocaleString()} kg</span>
                          ) : (
                            <span className={isLight ? 'text-stone-400' : 'text-slate-500'}>0</span>
                          )}
                        </td>

                        {/* 11. Actual Extrusion Rate (kg/hr) */}
                        <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                          isLight ? 'text-[#0f766e] bg-teal-50/40' : 'text-teal-300 bg-teal-950/15'
                        }`}>
                          {row[MASTER_COLUMNS.ACTUAL_RATE] > 0 ? `${row[MASTER_COLUMNS.ACTUAL_RATE]} kg/h` : '-'}
                        </td>

                        {/* 12. Current/Inferred Extruder Line */}
                        <td className={`py-2.5 px-3 whitespace-nowrap font-medium ${isLight ? 'text-stone-800' : 'text-slate-200'}`}>
                          {row[MASTER_COLUMNS.CURRENT_LINE]}
                        </td>

                        {/* 13. Primary Proposal */}
                        <td className={`py-2.5 px-3 whitespace-nowrap ${isLight ? 'bg-teal-50/30' : 'bg-cyan-950/20'}`}>
                          <span className={`inline-flex items-center gap-1.5 font-bold ${isLight ? 'text-[#004d40]' : 'text-cyan-300'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isLight ? 'bg-[#0f766e]' : 'bg-cyan-400'}`} />
                            <span>{row[MASTER_COLUMNS.PRIMARY_PROPOSAL]}</span>
                          </span>
                        </td>

                        {/* 14. Expected Rate Band 1 */}
                        <td className={`py-2.5 px-3 whitespace-nowrap font-mono text-[11px] ${
                          isLight ? 'bg-teal-50/20 text-[#0f766e]' : 'bg-cyan-950/10 text-cyan-200'
                        }`}>
                          <span className={`px-2 py-0.5 rounded ${
                            isLight ? 'bg-teal-50 text-[#004d40] border border-teal-200 font-semibold' : 'bg-cyan-950/60 border border-cyan-800/40'
                          }`}>
                            {row[MASTER_COLUMNS.EXPECTED_RATE_BAND_1]}
                          </span>
                        </td>

                        {/* 15. Alternative Proposal 1 */}
                        <td className={`py-2.5 px-3 whitespace-nowrap font-medium ${
                          isLight ? 'bg-purple-50/30 text-purple-900' : 'bg-indigo-950/20 text-indigo-300'
                        }`}>
                          {row[MASTER_COLUMNS.ALT_PROPOSAL_1]}
                        </td>

                        {/* 16. Expected Rate Band 2 */}
                        <td className={`py-2.5 px-3 whitespace-nowrap font-mono text-[11px] ${
                          isLight ? 'bg-purple-50/20 text-purple-800' : 'bg-indigo-950/10 text-indigo-200'
                        }`}>
                          {row[MASTER_COLUMNS.EXPECTED_RATE_BAND_2] !== '-' ? (
                            <span className={`px-2 py-0.5 rounded ${
                              isLight ? 'bg-purple-50 text-purple-900 border border-purple-200 font-semibold' : 'bg-indigo-950/60 border border-indigo-800/40'
                            }`}>
                              {row[MASTER_COLUMNS.EXPECTED_RATE_BAND_2]}
                            </span>
                          ) : '-'}
                        </td>

                        {/* 17. Alternative Proposal 2 */}
                        <td className={`py-2.5 px-3 whitespace-nowrap font-medium ${
                          isLight ? 'bg-stone-50 text-stone-700' : 'bg-slate-800/30 text-slate-300'
                        }`}>
                          {row[MASTER_COLUMNS.ALT_PROPOSAL_2]}
                        </td>

                        {/* 18. Expected Rate Band 3 */}
                        <td className={`py-2.5 px-3 whitespace-nowrap font-mono text-[11px] ${
                          isLight ? 'bg-stone-50/50 text-stone-600' : 'bg-slate-800/20 text-slate-400'
                        }`}>
                          {row[MASTER_COLUMNS.EXPECTED_RATE_BAND_3] !== '-' ? (
                            <span className={`px-2 py-0.5 rounded ${
                              isLight ? 'bg-stone-100 text-stone-700 border border-stone-200' : 'bg-slate-900 border border-slate-700/60'
                            }`}>
                              {row[MASTER_COLUMNS.EXPECTED_RATE_BAND_3]}
                            </span>
                          ) : '-'}
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>

            </table>
          </div>

          {/* Pagination Controls Footer */}
          <div className={`p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 text-xs ${
            isLight ? 'bg-[#fcfbf9] border-[#e2dad0] text-stone-600' : 'bg-slate-950/90 border-slate-800 text-slate-400'
          }`}>
            <div className="flex items-center gap-3">
              <span>
                {t('showingRuns', lang)} <strong className={isLight ? 'text-stone-900 font-bold' : 'text-white'}>
                  {filteredRuns.length === 0 ? 0 : (pageSize === 'ALL' ? 1 : ((currentPage - 1) * Number(pageSize) + 1))}
                </strong> {t('toWord', lang)} <strong className={isLight ? 'text-stone-900 font-bold' : 'text-white'}>
                  {pageSize === 'ALL' ? filteredRuns.length : Math.min(filteredRuns.length, currentPage * Number(pageSize))}
                </strong> {t('ofIndicator', lang)} <strong className={isLight ? 'text-teal-700 font-bold' : 'text-cyan-400 font-bold'}>{filteredRuns.length}</strong> {t('runsCount', lang)}
                {filteredRuns.length !== masterRuns.length && (
                  <span className={isLight ? 'text-stone-500' : 'text-slate-500'}> ({t('filteredFrom', lang)} {masterRuns.length} {t('totalSuffix', lang)})</span>
                )}
              </span>

              {/* Rows per page selector */}
              <div className={`flex items-center gap-1.5 ml-3 pl-3 border-l ${isLight ? 'border-stone-300' : 'border-slate-800'}`}>
                <span>{t('rowsPerPage', lang)}</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value));
                    setPage(1);
                  }}
                  className={`border rounded px-2 py-1 text-xs focus:outline-none ${
                    isLight ? 'bg-white border-stone-300 text-stone-900' : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`}
                >
                  <option value={25} className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>25</option>
                  <option value={50} className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>50</option>
                  <option value={100} className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>100</option>
                  <option value={250} className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>250</option>
                  <option value="ALL" className={isLight ? 'bg-white text-stone-900' : 'bg-slate-900'}>All ({filteredRuns.length})</option>
                </select>
              </div>
            </div>

            {/* Page Buttons */}
            {pageSize !== 'ALL' && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(1)}
                  disabled={currentPage === 1}
                  className={`p-1.5 rounded-lg border disabled:opacity-40 disabled:hover:bg-transparent ${
                    isLight
                      ? 'border-stone-300 hover:bg-stone-100 text-stone-700'
                      : 'border-slate-800 hover:bg-slate-800 text-slate-300'
                  }`}
                  title="First Page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={`p-1.5 rounded-lg border disabled:opacity-40 disabled:hover:bg-transparent ${
                    isLight
                      ? 'border-stone-300 hover:bg-stone-100 text-stone-700'
                      : 'border-slate-800 hover:bg-slate-800 text-slate-300'
                  }`}
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className={`px-3 py-1 font-mono ${isLight ? 'text-stone-700' : 'text-slate-300'}`}>
                  {t('pageIndicator', lang)} <strong className={isLight ? 'text-teal-700 font-bold' : 'text-cyan-400'}>{currentPage}</strong> {t('ofIndicator', lang)} <strong className={isLight ? 'text-stone-900 font-bold' : 'text-slate-200'}>{totalPages}</strong>
                </span>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={`p-1.5 rounded-lg border disabled:opacity-40 disabled:hover:bg-transparent ${
                    isLight
                      ? 'border-stone-300 hover:bg-stone-100 text-stone-700'
                      : 'border-slate-800 hover:bg-slate-800 text-slate-300'
                  }`}
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className={`p-1.5 rounded-lg border disabled:opacity-40 disabled:hover:bg-transparent ${
                    isLight
                      ? 'border-stone-300 hover:bg-stone-100 text-stone-700'
                      : 'border-slate-800 hover:bg-slate-800 text-slate-300'
                  }`}
                  title="Last Page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* VIEW 2: Distinct Pipe Sizing Matrix Sub-view */}
      {activeSubView === 'matrix' && (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Distinct Pipe Sizing Catalog & Machine Allocation Matrix</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Aggregated by unique pipe outer diameter (OD) and specification across all {masterRuns.length} loaded runs
              </p>
            </div>
            <span className="px-3 py-1 rounded-lg bg-purple-950 text-purple-300 border border-purple-800 font-mono text-xs">
              {uniquePlanningMatrix.length} Unique Profiles
            </span>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[72vh] rounded-xl border border-slate-800 relative shadow-inner">
            <table className="w-full text-xs text-slate-200 text-left divide-y divide-slate-800">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[11px] font-semibold sticky top-0 z-20">
                <tr>
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Pipe Description & Standard Spec</th>
                  <th className="py-3 px-3 text-teal-300">OD (mm)</th>
                  <th className="py-3 px-3 text-cyan-300">Primary / Assigned Extruder</th>
                  <th className="py-3 px-3 text-right">Nominal Capacity</th>
                  <th className="py-3 px-3 text-indigo-300">Planning Alternative 1</th>
                  <th className="py-3 px-3 text-slate-300">Planning Alternative 2</th>
                  <th className="py-3 px-3 text-cyan-200">Target Rate Band</th>
                  <th className="py-3 px-3 text-right">Total Evaluated Runs</th>
                  <th className="py-3 px-3 text-right">Avg Observed Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {uniquePlanningMatrix.map((m, idx) => (
                  <tr key={m.id || idx} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 text-slate-500 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-semibold text-white">{m.pipeDescription}</td>
                    <td className="py-2.5 px-3 font-mono text-teal-300">{m.odMm}</td>
                    <td className="py-2.5 px-3 font-bold text-cyan-300">{m.primaryExtruder}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">{m.nominalCapacity}</td>
                    <td className="py-2.5 px-3 text-indigo-300">{m.planningAlternative1}</td>
                    <td className="py-2.5 px-3 text-slate-300">{m.planningAlternative2}</td>
                    <td className="py-2.5 px-3 font-mono text-cyan-200">{m.targetRateBand}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-300">{m.totalRunsObserved}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-300">{m.avgObservedRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
