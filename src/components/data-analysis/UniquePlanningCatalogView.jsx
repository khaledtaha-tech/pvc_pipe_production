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
    <div className={`rounded-2xl overflow-hidden border transition-all ${
      isLight ? 'bg-white border-[#dfd7ca] shadow-sm' : 'bg-slate-900 border-slate-800 shadow-2xl'
    }`}>
      
      {/* Top Header & Summary */}
      <div className={`p-6 border-b ${isLight ? 'bg-white border-[#e2dad0]' : 'bg-slate-900 border-slate-800'}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-xl flex items-center justify-center ${
              isLight 
                ? 'bg-purple-50 text-purple-700 border border-purple-200' 
                : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/30'
            }`}>
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-base sm:text-lg font-bold tracking-tight ${isLight ? 'text-stone-900' : 'text-white'}`}>
                  {t('catalogHeading', lang)}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  isLight ? 'bg-purple-50 text-purple-800 border border-purple-300' : 'bg-purple-950 text-purple-300 border border-purple-800'
                }`}>
                  {t('catalogBadge', lang)}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-stone-600' : 'text-slate-400'}`}>
                {t('catalogSubheading', lang)}
              </p>
            </div>
          </div>

          {/* Quick Metrics & Single Export Button */}
          <div className="flex flex-wrap items-center gap-3 self-end lg:self-auto">
            <div className={`px-3 py-1.5 rounded-xl text-xs font-mono ${
              isLight ? 'bg-stone-50 border border-stone-300 text-stone-700' : 'bg-slate-950 border border-slate-800 text-slate-300'
            }`}>
              <span className={isLight ? 'text-stone-500' : 'text-slate-400'}>
                {lang === 'ar' ? '\u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u0641\u0631\u064a\u062f\u0629: ' : 'Unique Items: '}
              </span>
              <strong className={`font-bold ${isLight ? 'text-purple-700' : 'text-purple-400'}`}>
                {stats.uniqueItemsCount}
              </strong>
            </div>

            <div className={`px-3 py-1.5 rounded-xl text-xs font-mono ${
              isLight ? 'bg-stone-50 border border-stone-300 text-stone-700' : 'bg-slate-950 border border-slate-800 text-slate-300'
            }`}>
              <span className={isLight ? 'text-stone-500' : 'text-slate-400'}>
                {lang === 'ar' ? '\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u062a\u0634\u063a\u064a\u0644\u0627\u062a: ' : 'Represented Runs: '}
              </span>
              <strong className={`font-bold ${isLight ? 'text-teal-700' : 'text-cyan-400'}`}>
                {stats.totalRuns.toLocaleString()}
              </strong>
            </div>

            <button
              onClick={onExportUniqueCatalog}
              disabled={uniqueMatrix.length === 0}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition transform active:scale-95 cursor-pointer shadow-sm ${
                uniqueMatrix.length === 0
                  ? 'opacity-50 cursor-not-allowed bg-stone-300 text-stone-600'
                  : isLight
                    ? 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-2 border-purple-600'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-950/40 border border-purple-500/40'
              }`}
              title="Download clean 12-column engineering catalog with 1 row per unique item"
            >
              <Download className={`w-4 h-4 ${isLight ? 'text-purple-700' : ''}`} />
              <span>{t('exportUniqueCatalogBtn', lang)}</span>
            </button>
          </div>

        </div>

        {/* Search & Filter Controls */}
        <div className={`flex flex-col md:flex-row items-center justify-between gap-3 mt-5 pt-4 border-t ${
          isLight ? 'border-stone-200' : 'border-slate-800/80'
        }`}>
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className={`w-4 h-4 absolute left-3 top-2.5 ${isLight ? 'text-stone-400' : 'text-slate-400'}`} />
            <input
              type="text"
              placeholder={t('catalogSearchPlaceholder', lang)}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 ${
                isLight
                  ? 'bg-stone-50 border border-stone-300 text-stone-800 focus:ring-[#0f766e] focus:bg-white placeholder-stone-400'
                  : 'bg-slate-950 border border-slate-700 text-slate-100 focus:ring-purple-500 focus:border-purple-500 placeholder-slate-500'
              }`}
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
            {/* Extruder Filter */}
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] ${isLight ? 'text-stone-500' : 'text-slate-400'}`}>
                {lang === 'ar' ? '\u062e\u0637 \u0627\u0644\u0628\u062b\u0642:' : 'Line:'}
              </span>
              <select
                value={selectedExtruder}
                onChange={(e) => setSelectedExtruder(e.target.value)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border focus:outline-none ${
                  isLight
                    ? 'bg-white border-stone-300 text-stone-800 focus:ring-1 focus:ring-purple-500'
                    : 'bg-slate-950 border-slate-700 text-slate-200 focus:ring-1 focus:ring-purple-500'
                }`}
              >
                <option value="ALL">{t('catalogFilterExtruder', lang)}</option>
                {filterOptions.extruders.filter(e => e !== 'ALL').map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>

            {/* Material Filter */}
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] ${isLight ? 'text-stone-500' : 'text-slate-400'}`}>
                {lang === 'ar' ? '\u0627\u0644\u062e\u0627\u0645\u0629:' : 'Material:'}
              </span>
              <select
                value={selectedMaterial}
                onChange={(e) => setSelectedMaterial(e.target.value)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border focus:outline-none ${
                  isLight
                    ? 'bg-white border-stone-300 text-stone-800 focus:ring-1 focus:ring-purple-500'
                    : 'bg-slate-950 border-slate-700 text-slate-200 focus:ring-1 focus:ring-purple-500'
                }`}
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
        <table className="w-full text-left text-xs border-collapse divide-y divide-inherit">
          <thead className={`sticky top-0 z-20 uppercase tracking-wider text-[11px] font-bold border-b ${
            isLight
              ? 'bg-[#f7f5f0] text-stone-700 border-[#dfd7ca]'
              : 'bg-slate-950 text-slate-300 border-slate-800'
          }`}>
            <tr>
              <th className="py-3.5 px-3 text-center w-12">#</th>
              <th className="py-3.5 px-3 min-w-[110px]">{t('catalogColItemCode', lang)}</th>
              <th className="py-3.5 px-4 min-w-[260px]">{t('catalogColDescription', lang)}</th>
              <th className="py-3.5 px-3 min-w-[150px]">{t('catalogColOdNominal', lang)}</th>
              <th className="py-3.5 px-3 min-w-[130px]">{t('catalogColThickness', lang)}</th>
              <th className="py-3.5 px-3 min-w-[90px]">{t('catalogColMaterial', lang)}</th>
              <th className="py-3.5 px-3 min-w-[150px] text-right">{t('catalogColRate', lang)}</th>
              <th className="py-3.5 px-3 min-w-[170px] text-teal-600">{t('catalogColPrimaryExtruder', lang)}</th>
              <th className="py-3.5 px-3 min-w-[150px]">{t('catalogColPrimaryBand', lang)}</th>
              <th className="py-3.5 px-3 min-w-[150px] text-indigo-600">{t('catalogColAlt1', lang)}</th>
              <th className="py-3.5 px-3 min-w-[140px]">{t('catalogColAlt1Band', lang)}</th>
              <th className="py-3.5 px-3 min-w-[150px] text-slate-500">{t('catalogColAlt2', lang)}</th>
              <th className="py-3.5 px-3 min-w-[140px]">{t('catalogColAlt2Band', lang)}</th>
            </tr>
          </thead>

          <tbody className={`divide-y font-medium ${
            isLight ? 'divide-stone-200 bg-white text-stone-800' : 'divide-slate-800/80 bg-slate-900/60 text-slate-200'
          }`}>
            {filteredCatalog.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-12 text-center text-stone-400">
                  {lang === 'ar' ? '\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0635\u0646\u0627\u0641 \u0645\u0637\u0627\u0628\u0642\u0629 \u0644\u0645\u0639\u0627\u064a\u064a\u0631 \u0627\u0644\u0628\u062d\u062b' : 'No catalog items matching your filters.'}
                </td>
              </tr>
            ) : (
              filteredCatalog.map((row, idx) => (
                <tr 
                  key={row.id || idx}
                  className={`transition-colors ${
                    isLight ? 'hover:bg-stone-50' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <td className="py-2.5 px-3 text-center text-stone-400 font-mono text-[11px]">{idx + 1}</td>
                  
                  {/* 1. Item Code */}
                  <td className="py-2.5 px-3 font-mono font-bold text-stone-700">
                    <span className={`px-2 py-0.5 rounded text-[11px] ${
                      isLight ? 'bg-stone-100 text-stone-800' : 'bg-slate-800 text-slate-200'
                    }`}>
                      {row.itemCode || '-'}
                    </span>
                  </td>

                  {/* 2. Product Description */}
                  <td className="py-2.5 px-4 font-semibold text-stone-900">
                    <div className="truncate max-w-sm" title={row.pipeDescription}>
                      {row.pipeDescription}
                    </div>
                  </td>

                  {/* 3. Pipe OD & Nominal */}
                  <td className="py-2.5 px-3 font-mono font-bold text-teal-700">
                    {row.pipeOdAndNominal || row.odMm || '-'}
                  </td>

                  {/* 4. Wall Thickness / SDR */}
                  <td className="py-2.5 px-3 font-mono">
                    {row.extractedThickness || '-'}
                  </td>

                  {/* 5. Material */}
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      row.material === 'HDPE'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-teal-50 text-teal-800 border border-teal-300'
                    }`}>
                      {row.material || 'uPVC'}
                    </span>
                  </td>

                  {/* 6. Historical Output Rate */}
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                    {row.evaluatedHistoricalRate || row.avgObservedRate || '-'}
                  </td>

                  {/* 7. Primary Extruder */}
                  <td className="py-2.5 px-3 font-bold text-teal-800">
                    {row.primaryExtruder || '-'}
                  </td>

                  {/* 8. Primary Target Rate Band */}
                  <td className="py-2.5 px-3 font-mono text-[11px] text-stone-600">
                    {row.primaryTargetRateBand || row.targetRateBand || '-'}
                  </td>

                  {/* 9. Alternative Extruder 1 */}
                  <td className="py-2.5 px-3 font-semibold text-indigo-700">
                    {row.alternativeExtruder1 || '-'}
                  </td>

                  {/* 10. Alternative Rate Band 1 */}
                  <td className="py-2.5 px-3 font-mono text-[11px] text-stone-500">
                    {row.alternativeRateBand1 || '-'}
                  </td>

                  {/* 11. Alternative Extruder 2 */}
                  <td className="py-2.5 px-3 text-stone-500">
                    {row.alternativeExtruder2 || '-'}
                  </td>

                  {/* 12. Alternative Rate Band 2 */}
                  <td className="py-2.5 px-3 font-mono text-[11px] text-stone-500">
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
