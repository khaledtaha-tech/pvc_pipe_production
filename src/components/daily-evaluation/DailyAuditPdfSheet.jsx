import React, { forwardRef, useMemo } from 'react';

/**
 * Sleek Single-Page A4 Landscape Daily Production & Operational Audit Report Sheet
 * Fits strictly onto exactly 1 single A4 Landscape page (297mm x 210mm) without multi-page spilling.
 */
const DailyAuditPdfSheet = forwardRef(function DailyAuditPdfSheet(
  { data, filterMode = 'all', densityMode = 'clean', className = '' },
  ref
) {
  if (!data) return null;

  const { meta, kpis, downtime, rows } = data;

  const displayedRows = useMemo(() => {
    if (!rows) return [];
    if (filterMode === 'operating') {
      return rows.filter((r) => r.isOperating || Number(r.actualPcs) > 0 || Number(r.operatingHours) > 0);
    }
    return rows;
  }, [rows, filterMode]);

  // Dynamic vertical padding for table rows to maintain visual balance when fewer lines are active
  const cellPaddingClass = displayedRows.length <= 4
    ? (densityMode === 'clean' ? 'py-1 px-2' : 'py-1.5 px-2')
    : displayedRows.length <= 6
    ? (densityMode === 'clean' ? 'py-0.5 px-2' : 'py-1 px-2')
    : 'py-0.5 px-2';

  return (
    <div
      ref={ref}
      className={`daily-audit-pdf-sheet bg-white text-slate-900 ${className}`}
      id="daily-audit-printable-sheet"
      style={{
        maxHeight: '200mm',
        height: '198mm',
        boxSizing: 'border-box',
        overflow: 'hidden',
        pageBreakAfter: 'avoid',
        pageBreakInside: 'avoid'
      }}
    >
      {/* 1. Header Section */}
      <header className="audit-sheet-header border-b-2 border-slate-900 pb-1 mb-1.5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-base tracking-wider shadow-sm flex-shrink-0">
              AMP
            </div>
            <div>
              <h1 className="text-[11px] font-black tracking-wider uppercase text-slate-800 leading-tight">
                {meta.plantName}
              </h1>
              <h2 className="text-[16px] font-extrabold tracking-tight text-blue-900 leading-tight">
                {meta.title}
              </h2>
              <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider">
                Extrusion Operational Reconciliation &bull; 24-Hour Continuous Run
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-block bg-blue-50 border border-blue-200 text-blue-900 px-3 py-0.5 rounded font-bold text-xs">
              {meta.targetDateFormatted}
            </div>
            <div className="text-[9px] text-slate-500 font-mono mt-1">
              Ref: <span className="font-semibold text-slate-700">{meta.sopReference}</span> &bull; {meta.standardVersion}
            </div>
            <div className="text-[8.5px] text-slate-400 font-mono">
              Generated: {meta.generatedTimestamp}
            </div>
          </div>
        </div>
      </header>

      {/* 2. Executive Summary Cards (Top Row - 4 KPI Badges spread across wide canvas) */}
      <section className="audit-kpi-grid grid grid-cols-4 gap-2 mb-1.5">
        {/* KPI 1: Total FG Output */}
        <div className="audit-kpi-card bg-emerald-50/70 border border-emerald-300 rounded-md p-1.5 px-2">
          <div className="text-[8.5px] font-bold text-emerald-800 uppercase tracking-wider">
            Total Finished Goods Output
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[16px] font-black text-emerald-950 font-mono">
              {kpis.totalActualPcs.toLocaleString()}
            </span>
            <span className="text-[9.5px] font-bold text-emerald-700">pcs</span>
            <span className="text-slate-400 text-xs mx-1">&bull;</span>
            <span className="text-[12px] font-bold text-emerald-900 font-mono">
              {kpis.totalActualMT} MT
            </span>
          </div>
          <div className="text-[8px] text-emerald-700 font-medium flex items-center justify-between mt-0.5">
            <span>Target: {kpis.totalExpectedPcs.toLocaleString()} pcs</span>
            <span className={`font-bold ${kpis.totalVariancePcs >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {kpis.totalVariancePcs >= 0 ? '+' : ''}{kpis.totalVariancePct}%
            </span>
          </div>
        </div>

        {/* KPI 2: Lost Time & Downtime */}
        <div className="audit-kpi-card bg-amber-50/70 border border-amber-300 rounded-md p-1.5 px-2">
          <div className="text-[8.5px] font-bold text-amber-800 uppercase tracking-wider">
            Time Accounting &amp; Lost Hours
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[16px] font-black text-amber-950 font-mono">
              {kpis.totalLostHours.toFixed(1)}
            </span>
            <span className="text-[9.5px] font-bold text-amber-700">h lost</span>
            <span className="text-slate-400 text-xs mx-1">&bull;</span>
            <span className="text-[12px] font-bold text-amber-900 font-mono">
              {kpis.totalOperatingHours.toFixed(1)}h run
            </span>
          </div>
          <div className="text-[8px] text-amber-800 font-medium flex items-center justify-between mt-0.5">
            <span>Downtime: {downtime.totalDowntimeHours.toFixed(1)}h</span>
            <span className="font-bold text-rose-700">
              Unjustified: {kpis.totalUnjustifiedHours.toFixed(1)}h
            </span>
          </div>
        </div>

        {/* KPI 3: Overall Plant OEE */}
        <div className="audit-kpi-card bg-indigo-50/70 border border-indigo-300 rounded-md p-1.5 px-2">
          <div className="text-[8.5px] font-bold text-indigo-800 uppercase tracking-wider">
            Overall Plant OEE
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[16px] font-black text-indigo-950 font-mono">
              {kpis.plantOeePct.toFixed(1)}%
            </span>
            <span className="text-[9px] font-semibold text-indigo-700">
              ({kpis.activeLineCount}/{kpis.totalLineCount} lines active)
            </span>
          </div>
          <div className="text-[8px] text-indigo-800 font-mono flex items-center justify-between mt-0.5">
            <span>A: {kpis.plantAvailabilityPct.toFixed(1)}%</span>
            <span>P: {kpis.plantPerformancePct.toFixed(1)}%</span>
            <span>Q: {kpis.plantQualityPct.toFixed(1)}%</span>
          </div>
        </div>

        {/* KPI 4: Scrap Output & Scrap Ratio */}
        <div className="audit-kpi-card bg-rose-50/70 border border-rose-300 rounded-md p-1.5 px-2">
          <div className="text-[8.5px] font-bold text-rose-800 uppercase tracking-wider">
            Scrap Output &amp; Quality Ratio
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[16px] font-black text-rose-950 font-mono">
              {kpis.totalScrapKg.toLocaleString()}
            </span>
            <span className="text-[9.5px] font-bold text-rose-700">kg scrap</span>
            <span className="text-slate-400 text-xs mx-1">&bull;</span>
            <span className="text-[12px] font-black text-rose-900 font-mono">
              {kpis.scrapRatioPct.toFixed(1)}%
            </span>
          </div>
          <div className="text-[8px] text-rose-800 font-medium flex items-center justify-between mt-0.5">
            <span>Total Melt: {kpis.totalMeltKg.toLocaleString()} kg</span>
            <span className="font-bold text-emerald-700">Good: {kpis.totalActualKg.toLocaleString()} kg</span>
          </div>
        </div>
      </section>

      {/* 3. Central Production Reconciliation Table */}
      <section className="audit-table-section mb-1.5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800">
              Machine-by-Machine Production Reconciliation &amp; Operational Standards
            </h3>
            {filterMode === 'operating' && (
              <span className="text-[8px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                Displaying {displayedRows.length} Active Operating {displayedRows.length === 1 ? 'Line' : 'Lines'}
              </span>
            )}
            <span className="text-[8px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
              {densityMode === 'clean' ? 'Executive Clean View' : 'Detailed Audit View'}
            </span>
          </div>
          <span className="text-[8.5px] font-mono text-slate-500">
            24h Theoretical Standard vs Actual Reported Telemetry
          </span>
        </div>

        <table className="audit-table w-full border-collapse text-left text-[9.5px]">
          <thead>
            <tr className="bg-slate-800 text-white font-bold text-[8.5px] uppercase tracking-wider">
              <th className="py-1 px-2 border border-slate-700 w-[18%]">Line &amp; Machine</th>
              <th className="py-1 px-2 border border-slate-700 w-[20%]">Product Code &amp; Mold Specs</th>
              <th className="py-1 px-2 border border-slate-700 text-center w-[11%]">
                {densityMode === 'clean' ? 'Std Target (24h)' : 'Std Pace (24h / Rate)'}
              </th>
              <th className="py-1 px-2 border border-slate-700 text-right w-[11%]">
                {densityMode === 'clean' ? 'Actual FG Output' : 'Actual FG Output (pcs / kg)'}
              </th>
              <th className="py-1 px-2 border border-slate-700 text-right w-[11%]">
                {densityMode === 'clean' ? 'Variance (Pcs)' : 'Variance (&Delta; Deficit)'}
              </th>
              <th className="py-1 px-2 border border-slate-700 text-center w-[14%]">
                {densityMode === 'clean' ? 'Realized Pace' : 'Realized Pace &amp; Eff'}
              </th>
              <th className="py-1 px-2 border border-slate-700 text-center w-[15%]">
                {densityMode === 'clean' ? 'Line OEE' : 'Line OEE &amp; Status'}
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-center text-slate-500 italic font-mono text-[9.5px]">
                  No active operating lines reported on this date.
                </td>
              </tr>
            ) : (
              displayedRows.map((row, idx) => {
                const isEven = idx % 2 === 0;
                const hasRun = row.isOperating;

                return (
                  <tr
                    key={row.lineId}
                    className={`border-b border-slate-200 ${
                      !hasRun
                        ? 'bg-slate-50/60 text-slate-400'
                        : isEven
                        ? 'bg-white'
                        : 'bg-slate-50/80'
                    }`}
                  >
                    {/* Line & Machine (18% - prominent display without truncation) */}
                    <td className={`${cellPaddingClass} border-r border-slate-200 font-semibold text-slate-900`}>
                      <span className="font-bold text-[10px] text-slate-900 whitespace-nowrap font-mono" title={row.fullMachineName}>
                        {row.fullMachineName || row.lineId}
                      </span>
                    </td>

                    {/* Product Code & Mold Specs (20%) */}
                    <td className={`${cellPaddingClass} border-r border-slate-200 text-slate-800`}>
                      <div className="font-bold text-slate-900 truncate max-w-[210px]" title={row.pipeSize}>
                        {row.pipeSize}
                      </div>
                      {densityMode === 'detailed' && row.productCode && row.productCode !== row.pipeSize && row.productCode !== '-' && (
                        <div className="text-[8px] font-mono text-slate-500 truncate max-w-[210px]">
                          Code: {row.productCode}
                        </div>
                      )}
                    </td>

                    {/* Std Pace (24h / Rate) (11%) */}
                    <td className={`${cellPaddingClass} border-r border-slate-200 text-center font-mono`}>
                      {hasRun ? (
                        <div>
                          <div className="font-bold text-slate-800 text-[10px]">
                            {row.expectedPcs.toLocaleString()} <span className="text-[7.5px] text-slate-500 font-sans">pcs</span>
                          </div>
                          {densityMode === 'detailed' && (
                            <div className="text-[8px] text-slate-500">
                              {row.stdRate} pcs/h
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[8.5px]">Idle</span>
                      )}
                    </td>

                    {/* Actual FG Output (11%) */}
                    <td className={`${cellPaddingClass} border-r border-slate-200 text-right font-mono`}>
                      {hasRun ? (
                        <div>
                          <div className="font-bold text-emerald-900 text-[10px]">
                            {row.actualPcs.toLocaleString()} <span className="text-[7.5px] text-emerald-700 font-sans">pcs</span>
                          </div>
                          {densityMode === 'detailed' && (
                            <div className="text-[8px] text-slate-600">
                              {row.actualKg.toLocaleString()} kg
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">0 pcs</span>
                      )}
                    </td>

                    {/* Variance / Deficit (11%) */}
                    <td className={`${cellPaddingClass} border-r border-slate-200 text-right font-mono`}>
                      {hasRun ? (
                        <div>
                          <div
                            className={`font-extrabold text-[10px] ${
                              row.variancePcs >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {row.variancePcs >= 0 ? '+' : ''}
                            {row.variancePcs.toLocaleString()} <span className="text-[7.5px] font-sans">pcs</span>
                          </div>
                          {densityMode === 'detailed' && (
                            <div
                              className={`text-[8px] ${
                                row.varianceKg >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {row.varianceKg >= 0 ? '+' : ''}
                              {row.varianceKg.toLocaleString()} kg
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    {/* Realized Pace & Efficiency (14%) */}
                    <td className={`${cellPaddingClass} border-r border-slate-200 text-center font-mono`}>
                      {hasRun && row.operatingHours > 0 ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <div>
                            <span className="font-bold text-cyan-950 text-[10px]">
                              {row.actualRatePcsH}
                            </span>
                            <span className="text-[7.5px] text-slate-500 font-sans ml-0.5">pcs/h</span>
                          </div>
                          {densityMode === 'detailed' && (
                            <span
                              className={`inline-block px-1.5 py-0.2 rounded text-[8px] font-bold border ${
                                row.speedEffPct >= 85
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : row.speedEffPct >= 70
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-rose-50 text-rose-800 border-rose-300'
                              }`}
                            >
                              {row.speedEffPct.toFixed(1)}% Eff
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">0.0h Run</span>
                      )}
                    </td>

                    {/* Line OEE & Status (15%) */}
                    <td className={`${cellPaddingClass} text-center font-mono`}>
                      {hasRun ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold border ${
                              row.oeePct >= 75
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : row.oeePct >= 60
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-rose-50 text-rose-800 border-rose-300'
                            }`}
                          >
                            {row.oeePct.toFixed(1)}%
                          </span>
                          {densityMode === 'detailed' ? (
                            <span className="text-[8px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 font-sans">
                              Running ({row.operatingHours.toFixed(1)}h)
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[8px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-sans">
                          {densityMode === 'clean' ? 'Idle' : 'Stopped / Idle'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}

            {/* Total Summary Row */}
            <tr className="bg-slate-100 border-t-2 border-slate-800 font-bold text-[9px]">
              <td className="py-1 px-2 text-slate-900 uppercase">
                Plant Totals
              </td>
              <td className="py-1 px-2 text-slate-600 font-mono">
                {kpis.activeLineCount} Active Lines &bull; {kpis.totalOperatingHours.toFixed(1)}h Run
              </td>
              <td className="py-1 px-2 text-center font-mono text-slate-900">
                {kpis.totalExpectedPcs.toLocaleString()} pcs
              </td>
              <td className="py-1 px-2 text-right font-mono text-emerald-950">
                {kpis.totalActualPcs.toLocaleString()} pcs
              </td>
              <td
                className={`py-1 px-2 text-right font-mono ${
                  kpis.totalVariancePcs >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {kpis.totalVariancePcs >= 0 ? '+' : ''}{kpis.totalVariancePcs.toLocaleString()} pcs
              </td>
              <td className="py-1 px-2 text-center font-mono text-cyan-950">
                {kpis.plantPerformancePct.toFixed(1)}% Pace
              </td>
              <td className="py-1 px-2 text-center font-mono text-indigo-950 font-black">
                {kpis.plantOeePct.toFixed(1)}% Plant OEE
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 4. Downtime Allocation & Time Accounting Bar */}
      <section className="audit-downtime-section mb-1.5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800">
              Plant Downtime Allocation &amp; Root Cause Accounting
            </h3>
            <span className="text-[8px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
              6 Audit Categories
            </span>
          </div>
          <div className="text-[8.5px] font-mono text-slate-500 flex items-center gap-2">
            <span>Total Downtime: <strong className="text-slate-800">{downtime.totalDowntimeHours.toFixed(1)}h</strong></span>
            <span>&bull;</span>
            <span>Lost Time: <strong className="text-amber-800">{kpis.totalLostHours.toFixed(1)}h</strong></span>
            <span>&bull;</span>
            <span>Unjustified Gap: <strong className={kpis.totalUnjustifiedHours > 0.05 ? 'text-rose-700 font-bold' : 'text-slate-700'}>{kpis.totalUnjustifiedHours.toFixed(1)}h</strong></span>
          </div>
        </div>

        {/* 6-box compact cause grid */}
        <div className="grid grid-cols-6 gap-2 text-[8.5px]">
          {downtime.categories.map((cat) => {
            const pct = downtime.totalDowntimeHours > 0
              ? Math.round((cat.hours / downtime.totalDowntimeHours) * 100)
              : 0;

            return (
              <div
                key={cat.key}
                className="bg-slate-50/80 border border-slate-200 rounded p-1 px-1.5 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tight truncate max-w-[110px]" title={cat.label}>
                    {cat.label}
                  </span>
                  <span className="text-[8px] font-bold text-slate-500 font-mono">
                    {pct}%
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-[12px] font-black text-slate-900 font-mono">
                    {cat.hours.toFixed(1)}h
                  </span>
                  <div className="w-12 h-1 bg-slate-200 rounded-full overflow-hidden ml-1">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Executive Sign-Off Footer */}
      <footer className="audit-signoff-footer border-t border-slate-300 pt-2 mt-auto">
        <div className="flex justify-between items-center text-xs text-slate-600 font-mono px-1">
          <span>Shift Production Eng: __________________</span>
          <span>Quality Assurance: __________________</span>
          <span>Operations &amp; Plant Mgr: __________________</span>
        </div>

        <div className="flex items-center justify-between text-[7.5px] text-slate-400 font-mono mt-1 pt-0.5 border-t border-slate-100">
          <span>DOC-Ext.-03 &bull; Daily Production &amp; Operational Audit Form &bull; Confidential Internal Report</span>
          <span>Single-Page Executive Landscape Audit Record &bull; Page 1 of 1</span>
        </div>
      </footer>
    </div>
  );
});

export default DailyAuditPdfSheet;
