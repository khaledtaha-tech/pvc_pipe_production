import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Download, 
  Layers, 
  Cpu, 
  Factory, 
  Sparkles, 
  CheckCircle2, 
  Filter, 
  TrendingUp,
  Table
} from 'lucide-react';
import { t } from '../../utils/translations.js';

export default function UniquePlanningCatalogView({
  uniqueMatrix = [],
  onExportUniqueCatalog,
  lang = 'en',
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExtruder, setSelectedExtruder] = useState('ALL');
  const [selectedMaterial, setSelectedMaterial] = useState('ALL');

  // Distinct Extruders & Materials for filtering
  const filterOptions = useMemo(() => {
    const extruders = new Set();
    const materials = new Set();

    uniqueMatrix.forEach(item => {
      if (item.primaryExtruder && item.primaryExtruder !== '-') {
        extruders.add(item.primaryExtruder);
      }
      if (item.material && item.material !== '-') {
        materials.add(item.material);
      }
    });

    return {
      extruders: ['ALL', ...Array.from(extruders).sort()],
      materials: ['ALL', ...Array.from(materials).sort()]
    };
  }, [uniqueMatrix]);

  // Total runs represented across all unique items
  const stats = useMemo(() => {
    let totalRuns = 0;
    uniqueMatrix.forEach(m => {
      totalRuns += Number(m.totalRunsObserved) || 0;
    });
    return {
      uniqueItemsCount: uniqueMatrix.length,
      totalRuns
    };
  }, [uniqueMatrix]);

  // Filter matrix
  const filteredCatalog = useMemo(() => {
    return uniqueMatrix.filter(row => {
      if (selectedExtruder !== 'ALL' && row.primaryExtruder !== selectedExtruder) {
        return false;
      }
      if (selectedMaterial !== 'ALL' && row.material !== selectedMaterial) {
        return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = 
          (row.itemCode && row.itemCode.toLowerCase().includes(term)) ||
          (row.pipeDescription && row.pipeDescription.toLowerCase().includes(term)) ||
          (row.odMm && row.odMm.toLowerCase().includes(term)) ||
          (row.primaryExtruder && row.primaryExtruder.toLowerCase().includes(term)) ||
          (row.alternativeExtruder1 && row.alternativeExtruder1.toLowerCase().includes(term));
        if (!matches) return false;
      }
      return true;
    });
  }, [uniqueMatrix, selectedExtruder, selectedMaterial, searchTerm]);

  return (
    <div className="app-card rounded-2xl overflow-hidden transition-all">
      
      {/* Top Header & Summary */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl brand-gradient flex items-center justify-center text-white shadow-md shadow-emerald-500/20 flex-shrink-0">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  {t('catalogHeading', lang)}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                  {t('catalogBadge', lang)}
                </span>
              </div>
              <p className="text-xs mt-0.5 text-slate-500 dark:text-slate-400">
                {t('catalogSubheading', lang)}
              </p>
            </div>
          </div>

          {/* Quick Metrics & Single Export Button */}
          <div className="flex flex-wrap items-center gap-3 self-end lg:self-auto">
            <div className="px-3 py-1.5 rounded-xl text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xs">
              <span className="text-slate-500 dark:text-slate-400">
                {lang === 'ar' ? 'الأصناف الفريدة: ' : 'Unique Items: '}
              </span>
              <strong className="font-bold text-emerald-600 dark:text-cyan-400">
                {stats.uniqueItemsCount}
              </strong>
            </div>

            <div className="px-3 py-1.5 rounded-xl text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xs">
              <span className="text-slate-500 dark:text-slate-400">
                {lang === 'ar' ? 'إجمالي التشغيلات: ' : 'Represented Runs: '}
              </span>
              <strong className="font-bold text-teal-600 dark:text-teal-400">
                {stats.totalRuns.toLocaleString()}
              </strong>
            </div>

            <button
              onClick={onExportUniqueCatalog}
              disabled={uniqueMatrix.length === 0}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition transform active:scale-95 cursor-pointer shadow-md ${
                uniqueMatrix.length === 0
                  ? 'opacity-50 cursor-not-allowed bg-slate-200 dark:bg-slate-800 text-slate-400'
                  : 'brand-gradient hover:brightness-110 text-white shadow-emerald-500/25'
              }`}
              title="Download clean 12-column engineering catalog with 1 row per unique item"
            >
              <Download className="w-4 h-4 text-white" />
              <span>{t('exportUniqueCatalogBtn', lang)}</span>
            </button>
          </div>

        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={t('catalogSearchPlaceholder', lang)}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-xs"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
            {/* Extruder Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {lang === 'ar' ? 'خط البثق:' : 'Line:'}
              </span>
              <select
                value={selectedExtruder}
                onChange={(e) => setSelectedExtruder(e.target.value)}
                className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition shadow-xs"
              >
                <option value="ALL">{t('catalogFilterExtruder', lang)}</option>
                {filterOptions.extruders.filter(e => e !== 'ALL').map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>

            {/* Material Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {lang === 'ar' ? 'الخامة:' : 'Material:'}
              </span>
              <select
                value={selectedMaterial}
                onChange={(e) => setSelectedMaterial(e.target.value)}
                className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition shadow-xs"
              >
                <option value="ALL">{t('catalogFilterMaterial', lang)}</option>
                {filterOptions.materials.filter(m => m !== 'ALL').map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

      </div>

      {/* 12-Column Sizing & Planning Catalog Table */}
      <div className="overflow-x-auto overflow-y-auto max-h-[72vh] relative">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-20 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
            <tr>
              <th className="py-3.5 px-3 text-center w-12">#</th>
              <th className="py-3.5 px-3 min-w-[110px]">{t('catalogColItemCode', lang)}</th>
              <th className="py-3.5 px-4 min-w-[260px]">{t('catalogColDescription', lang)}</th>
              <th className="py-3.5 px-3 min-w-[150px]">{t('catalogColOdNominal', lang)}</th>
              <th className="py-3.5 px-3 min-w-[130px]">{t('catalogColThickness', lang)}</th>
              <th className="py-3.5 px-3 min-w-[90px]">{t('catalogColMaterial', lang)}</th>
              <th className="py-3.5 px-3 min-w-[150px] text-right">{t('catalogColRate', lang)}</th>
              <th className="py-3.5 px-3 min-w-[170px] text-teal-600 dark:text-teal-400">{t('catalogColPrimaryExtruder', lang)}</th>
              <th className="py-3.5 px-3 min-w-[150px]">{t('catalogColPrimaryBand', lang)}</th>
              <th className="py-3.5 px-3 min-w-[150px] text-teal-600 dark:text-teal-400">{t('catalogColAlt1', lang)}</th>
              <th className="py-3.5 px-3 min-w-[140px]">{t('catalogColAlt1Band', lang)}</th>
              <th className="py-3.5 px-3 min-w-[150px] text-slate-500 dark:text-slate-400">{t('catalogColAlt2', lang)}</th>
              <th className="py-3.5 px-3 min-w-[140px]">{t('catalogColAlt2Band', lang)}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 font-medium">
            {filteredCatalog.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-12 text-center text-slate-400 dark:text-slate-500">
                  {lang === 'ar' ? 'لا توجد أصناف مطابقة لمعايير البحث' : 'No catalog items matching your filters.'}
                </td>
              </tr>
            ) : (
              filteredCatalog.map((row, idx) => (
                <tr 
                  key={row.id || idx}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-2.5 px-3 text-center text-slate-400 dark:text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                  
                  {/* 1. Item Code */}
                  <td className="py-2.5 px-3 font-mono font-bold">
                    <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60">
                      {row.itemCode || '-'}
                    </span>
                  </td>

                  {/* 2. Product Description */}
                  <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                    <div className="truncate max-w-sm" title={row.pipeDescription}>
                      {row.pipeDescription}
                    </div>
                  </td>

                  {/* 3. Pipe OD & Nominal */}
                  <td className="py-2.5 px-3 font-mono font-bold text-teal-700 dark:text-teal-400">
                    {row.pipeOdAndNominal || row.odMm || '-'}
                  </td>

                  {/* 4. Wall Thickness / SDR */}
                  <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                    {row.extractedThickness || '-'}
                  </td>

                  {/* 5. Material */}
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      row.material === 'HDPE'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                        : 'bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800'
                    }`}>
                      {row.material || 'uPVC'}
                    </span>
                  </td>

                  {/* 6. Historical Output Rate */}
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    {row.evaluatedHistoricalRate || row.avgObservedRate || '-'}
                  </td>

                  {/* 7. Primary Extruder */}
                  <td className="py-2.5 px-3 font-bold text-teal-700 dark:text-teal-300">
                    {row.primaryExtruder || '-'}
                  </td>

                  {/* 8. Primary Target Rate Band */}
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    {row.primaryTargetRateBand || row.targetRateBand || '-'}
                  </td>

                  {/* 9. Alternative Extruder 1 */}
                  <td className="py-2.5 px-3 font-semibold text-teal-700 dark:text-teal-400">
                    {row.alternativeExtruder1 || '-'}
                  </td>

                  {/* 10. Alternative Rate Band 1 */}
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {row.alternativeRateBand1 || '-'}
                  </td>

                  {/* 11. Alternative Extruder 2 */}
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                    {row.alternativeExtruder2 || '-'}
                  </td>

                  {/* 12. Alternative Rate Band 2 */}
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {row.alternativeRateBand2 || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
