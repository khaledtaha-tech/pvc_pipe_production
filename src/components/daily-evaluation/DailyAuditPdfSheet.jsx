import React, { forwardRef, useMemo } from 'react';
import { getAuditDensityPreset } from '../../logic/dailyAuditPdfHelper.js';

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

  const scale = useMemo(() => {
    return getAuditDensityPreset(displayedRows.length);
  }, [displayedRows.length]);

  return (
    <div
      ref={ref}
      className={`daily-audit-pdf-sheet flex flex-col justify-between h-[194mm] max-h-[194mm] box-border overflow-hidden bg-white text-slate-900 ${className}`}
      id="daily-audit-printable-sheet"
      style={{
        maxHeight: '194mm',
        height: '194mm',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        pageBreakAfter: 'avoid',
        pageBreakInside: 'avoid'
      }}
    >
      {/* 1. Top Section: Header & Executive Summary KPI Cards */}
      <div className="audit-top-group flex-shrink-0 w-full">
        {/* Header Section */}
        <header className="audit-sheet-header border-b-2 border-slate-900 pb-1 mb-1.5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className={`${scale.ampBadgeClass} rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold tracking-wider shadow-sm flex-shrink-0`}>
                AMP
              </div>
              <div>
                <h1 className={`${scale.headerPlantClass} font-black tracking-wider uppercase text-slate-800 leading-tight`}>
                  {meta.plantName}
                </h1>
                <h2 className={`${scale.headerTitleClass} font-extrabold tracking-tight text-blue-900 leading-tight`}>
                  {meta.title}
                </h2>
                <div className={`${scale.headerSubClass} font-semibold text-slate-500 uppercase tracking-wider`}>
                  Extrusion Operational Reconciliation &bull; 24-Hour Continuous Run
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className={`inline-block bg-blue-50 border border-blue-200 text-blue-900 ${scale.dateBadgeClass} rounded font-bold`}>
                {meta.targetDateFormatted}
              </div>
              <div className={`${scale.headerSubClass} text-slate-500 font-mono mt-0.5`}>
                Ref: <span className="font-semibold text-slate-700">{meta.sopReference}</span> &bull; {meta.standardVersion}
              </div>
              <div className="text-[8px] text-slate-400 font-mono">
                Generated: {meta.generatedTimestamp}
              </div>
            </div>
          </div>
        </header>

        {/* Executive Summary Cards (Top Row - 4 KPI Badges spread across wide canvas) */}
        <section className="audit-kpi-grid grid grid-cols-4 gap-2">
          {/* KPI 1: Total FG Output */}
          <div className={`audit-kpi-card bg-emerald-50/70 border border-emerald-300 rounded-md ${scale.kpiCardPaddingClass}`}>
            <div className={`${scale.kpiTitleClass} font-bold text-emerald-800 uppercase tracking-wider`}>
              Total Finished Goods Output
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`${scale.kpiMetricClass} font-black text-emerald-950 font-mono`}>
                {kpis.totalActualPcs.toLocaleString()}
              </span>
              <span className={`${scale.unitClass} font-bold text-emerald-700`}>pcs</span>
              <span className="text-slate-400 text-xs mx-1">&bull;</span>
              <span className={`${scale.kpiSecondaryMetricClass} font-bold text-emerald-900 font-mono`}>
                {kpis.totalActualMT} MT
              </span>
            </div>
            <div className={`${scale.kpiSubtextClass} text-emerald-700 font-medium flex items-center justify-between mt-0.5`}>
              <span>Target: {kpis.totalExpectedPcs.toLocaleString()} pcs</span>
              <span className={`font-bold ${kpis.totalVariancePcs >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {kpis.totalVariancePcs >= 0 ? '+' : ''}{kpis.totalVariancePct}%
              </span>
            </div>
          </div>

          {/* KPI 2: Lost Time & Downtime */}
          <div className={`audit-kpi-card bg-amber-50/70 border border-amber-300 rounded-md ${scale.kpiCardPaddingClass}`}>
            <div className={`${scale.kpiTitleClass} font-bold text-amber-800 uppercase tracking-wider`}>
              Time Accounting &amp; Lost Hours
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`${scale.kpiMetricClass} font-black text-amber-950 font-mono`}>
                {kpis.totalLostHours.toFixed(1)}
              </span>
              <span className={`${scale.unitClass} font-bold text-amber-700`}>h lost</span>
              <span className="text-slate-400 text-xs mx-1">&bull;</span>
              <span className={`${scale.kpiSecondaryMetricClass} font-bold text-amber-900 font-mono`}>
                {kpis.totalOperatingHours.toFixed(1)}h run
              </span>
            </div>
            <div className={`${scale.kpiSubtextClass} text-amber-800 font-medium flex items-center justify-between mt-0.5`}>
              <span>Downtime: {downtime.totalDowntimeHours.toFixed(1)}h</span>
              <span className="font-bold text-rose-700">
                Unjustified: {kpis.totalUnjustifiedHours.toFixed(1)}h
              </span>
            </div>
          </div>

          {/* KPI 3: Overall Plant OEE */}
          <div className={`audit-kpi-card bg-indigo-50/70 border border-indigo-300 rounded-md ${scale.kpiCardPaddingClass}`}>
            <div className={`${scale.kpiTitleClass} font-bold text-indigo-800 uppercase tracking-wider`}>
              Overall Plant OEE
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`${scale.kpiMetricClass} font-black text-indigo-950 font-mono`}>
                {kpis.plantOeePct.toFixed(1)}%
              </span>
              <span className={`${scale.unitClass} font-semibold text-indigo-700 ml-1`}>
                ({kpis.activeLineCount}/{kpis.totalLineCount} lines active)
              </span>
            </div>
            <div className={`${scale.kpiSubtextClass} text-indigo-800 font-mono flex items-center justify-between mt-0.5`}>
              <span>A: {kpis.plantAvailabilityPct.toFixed(1)}%</span>
              <span>P: {kpis.plantPerformancePct.toFixed(1)}%</span>
              <span>Q: {kpis.plantQualityPct.toFixed(1)}%</span>
            </div>
          </div>

          {/* KPI 4: Scrap Output & Scrap Ratio */}
          <div className={`audit-kpi-card bg-rose-50/70 border border-rose-300 rounded-md ${scale.kpiCardPaddingClass}`}>
            <div className={`${scale.kpiTitleClass} font-bold text-rose-800 uppercase tracking-wider`}>
              Scrap Output &amp; Quality Ratio
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`${scale.kpiMetricClass} font-black text-rose-950 font-mono`}>
                {kpis.totalScrapKg.toLocaleString()}
              </span>
              <span className={`${scale.unitClass} font-bold text-rose-700`}>kg scrap</span>
              <span className="text-slate-400 text-xs mx-1">&bull;</span>
              <span className={`${scale.kpiSecondaryMetricClass} font-black text-rose-900 font-mono`}>
                {kpis.scrapRatioPct.toFixed(1)}%
              </span>
            </div>
            <div className={`${scale.kpiSubtextClass} text-rose-800 font-medium flex items-center justify-between mt-0.5`}>
              <span>Total Melt: {kpis.totalMeltKg.toLocaleString()} kg</span>
              <span className="font-bold text-emerald-700">Good: {kpis.totalActualKg.toLocaleString()} kg</span>
            </div>
          </div>
        </section>
      </div>

      {/* 2. Central Section: Production Reconciliation Table */}
      <section className="audit-table-section flex-shrink-0 w-full my-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className={`${scale.downtimeHeaderClass} font-extrabold uppercase tracking-wider text-slate-800`}>
              Machine-by-Machine Production Reconciliation &amp; Operational Standards
            </h3>
            {filterMode === 'operating' && (
              <span className={`${scale.downtimeBadgeClass} font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded`}>
                Displaying {displayedRows.length} Active Operating {displayedRows.length === 1 ? 'Line' : 'Lines'}
              </span>
            )}
            <span className={`${scale.downtimeBadgeClass} font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded`}>
              {densityMode === 'clean' ? 'Executive Clean View' : 'Detailed Audit View'}
            </span>
          </div>
          <span className={`${scale.subtextClass} font-mono text-slate-500`}>
            24h Theoretical Standard vs Actual Reported Telemetry
          </span>
        </div>

        <table className={`audit-table w-full border-collapse text-left ${scale.tableTextClass}`}>
          <thead>
            <tr className="bg-slate-800 text-white font-bold uppercase tracking-wider">
              <th className={`${scale.tableHeaderClass} border border-slate-700 w-[18%]`}>Line &amp; Machine</th>
              <th className={`${scale.tableHeaderClass} border border-slate-700 w-[20%]`}>Product Code &amp; Mold Specs</th>
              <th className={`${scale.tableHeaderClass} border border-slate-700 text-center w-[11%]`}>
                {densityMode === 'clean' ? 'Std Target (24h)' : 'Std Pace (24h / Rate)'}
              </th>
              <th className={`${scale.tableHeaderClass} border border-slate-700 text-right w-[11%]`}>
                {densityMode === 'clean' ? 'Actual FG Output' : 'Actual FG Output (pcs / kg)'}
              </th>
              <th className={`${scale.tableHeaderClass} border border-slate-700 text-right w-[11%]`}>
                {densityMode === 'clean' ? 'Variance (Pcs)' : 'Variance (&Delta; Deficit)'}
              </th>
              <th className={`${scale.tableHeaderClass} border border-slate-700 text-center w-[14%]`}>
                {densityMode === 'clean' ? 'Realized Pace' : 'Realized Pace &amp; Eff'}
              </th>
              <th className={`${scale.tableHeaderClass} border border-slate-700 text-center w-[15%]`}>
                {densityMode === 'clean' ? 'Line OEE' : 'Line OEE &amp; Status'}
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500 italic font-mono text-[11px]">
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
                    {/* Line & Machine (18% - prominent display without clipping) */}
                    <td className={`${scale.cellPaddingClass} border-r border-slate-200 font-semibold text-slate-900`}>
                      <div className={`font-bold ${scale.lineNameClass} text-slate-900 font-mono leading-tight break-words`} title={row.fullMachineName}>
                        {row.fullMachineName || row.lineId}
                      </div>
                    </td>

                    {/* Product Code & Mold Specs (20% - wrap cleanly without clipping) */}
                    <td className={`${scale.cellPaddingClass} border-r border-slate-200 text-slate-800`}>
                      <div className="font-bold text-slate-900 leading-tight break-words" title={row.pipeSize}>
                        {row.pipeSize}
                      </div>
                      {densityMode === 'detailed' && row.productCode && row.productCode !== row.pipeSize && row.productCode !== '-' && (
                        <div className={`${scale.subtextClass} font-mono text-slate-500 leading-tight break-words mt-0.5`}>
                          Code: {row.productCode}
                        </div>
                      )}
                    </td>

                    {/* Std Pace (24h / Rate) (11%) */}
                    <td className={`${scale.cellPaddingClass} border-r border-slate-200 text-center font-mono`}>
                      {hasRun ? (
                        <div>
                          <div className={`font-bold text-slate-800 ${scale.tableTextClass}`}>
                            {row.expectedPcs.toLocaleString()} <span className={`${scale.unitClass} text-slate-500 font-sans`}>pcs</span>
                          </div>
                          {densityMode === 'detailed' && (
                            <div className={`${scale.subtextClass} text-slate-500 mt-0.5`}>
                              {row.stdRate} pcs/h
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className={`text-slate-400 italic ${scale.subtextClass}`}>Idle</span>
                      )}
                    </td>

                    {/* Actual FG Output (11%) */}
                    <td className={`${scale.cellPaddingClass} border-r border-slate-200 text-right font-mono`}>
                      {hasRun ? (
                        <div>
                          <div className={`font-bold text-emerald-900 ${scale.tableTextClass}`}>
                            {row.actualPcs.toLocaleString()} <span className={`${scale.unitClass} text-emerald-700 font-sans`}>pcs</span>
                          </div>
                          {densityMode === 'detailed' && (
                            <div className={`${scale.subtextClass} text-slate-600 mt-0.5`}>
                              {row.actualKg.toLocaleString()} kg
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">0 pcs</span>
                      )}
                    </td>

                    {/* Variance / Deficit (11%) */}
                    <td className={`${scale.cellPaddingClass} border-r border-slate-200 text-right font-mono`}>
                      {hasRun ? (
                        <div>
                          <div
                            className={`font-extrabold ${scale.tableTextClass} ${
                              row.variancePcs >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {row.variancePcs >= 0 ? '+' : ''}
                            {row.variancePcs.toLocaleString()} <span className={`${scale.unitClass} font-sans`}>pcs</span>
                          </div>
                          {densityMode === 'detailed' && (
                            <div
                              className={`${scale.subtextClass} mt-0.5 ${
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
                    <td className={`${scale.cellPaddingClass} border-r border-slate-200 text-center font-mono`}>
                      {hasRun && row.operatingHours > 0 ? (
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <div>
                            <span className={`font-bold text-cyan-950 ${scale.tableTextClass}`}>
                              {row.actualRatePcsH}
                            </span>
                            <span className={`${scale.unitClass} text-slate-500 font-sans ml-0.5`}>pcs/h</span>
                          </div>
                          {densityMode === 'detailed' && (
                            <span
                              className={`inline-block font-bold border ${scale.badgeClass} rounded ${
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
                    <td className={`${scale.cellPaddingClass} text-center font-mono`}>
                      {hasRun ? (
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-block font-bold border ${scale.badgeClass} rounded ${
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
                            <span className={`${scale.badgeClass} font-semibold text-emerald-700 bg-emerald-50 rounded border border-emerald-200 font-sans`}>
                              Running ({row.operatingHours.toFixed(1)}h)
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className={`${scale.badgeClass} font-semibold text-slate-400 bg-slate-100 rounded border border-slate-200 font-sans`}>
                          {densityMode === 'clean' ? 'Idle' : 'Stopped / Idle'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}

            {/* Total Summary Row */}
            <tr className={`bg-slate-100 border-t-2 border-slate-800 font-bold ${scale.summaryRowClass}`}>
              <td className={`${scale.cellPaddingClass} text-slate-900 uppercase`}>
                Plant Totals
              </td>
              <td className={`${scale.cellPaddingClass} text-slate-600 font-mono`}>
                {kpis.activeLineCount} Active Lines &bull; {kpis.totalOperatingHours.toFixed(1)}h Run
              </td>
              <td className={`${scale.cellPaddingClass} text-center font-mono text-slate-900`}>
                {kpis.totalExpectedPcs.toLocaleString()} pcs
              </td>
              <td className={`${scale.cellPaddingClass} text-right font-mono text-emerald-950`}>
                {kpis.totalActualPcs.toLocaleString()} pcs
              </td>
              <td
                className={`${scale.cellPaddingClass} text-right font-mono ${
                  kpis.totalVariancePcs >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {kpis.totalVariancePcs >= 0 ? '+' : ''}{kpis.totalVariancePcs.toLocaleString()} pcs
              </td>
              <td className={`${scale.cellPaddingClass} text-center font-mono text-cyan-950`}>
                {kpis.plantPerformancePct.toFixed(1)}% Pace
              </td>
              <td className={`${scale.cellPaddingClass} text-center font-mono text-indigo-950 font-black`}>
                {kpis.plantOeePct.toFixed(1)}% Plant OEE
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 3. Bottom Section: Downtime Allocation & Root Cause Accounting */}
      <section className="audit-downtime-section flex-shrink-0 w-full pt-1 border-t border-slate-200">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className={`${scale.downtimeHeaderClass} font-extrabold uppercase tracking-wider text-slate-800`}>
              Plant Downtime Allocation &amp; Root Cause Accounting
            </h3>
            <span className={`${scale.downtimeBadgeClass} font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded`}>
              6 Audit Categories
            </span>
          </div>
          <div className={`${scale.downtimeSubtextClass} font-mono text-slate-500 flex items-center gap-2`}>
            <span>Total Downtime: <strong className="text-slate-800">{downtime.totalDowntimeHours.toFixed(1)}h</strong></span>
            <span>&bull;</span>
            <span>Lost Time: <strong className="text-amber-800">{kpis.totalLostHours.toFixed(1)}h</strong></span>
            <span>&bull;</span>
            <span>Unjustified Gap: <strong className={kpis.totalUnjustifiedHours > 0.05 ? 'text-rose-700 font-bold' : 'text-slate-700'}>{kpis.totalUnjustifiedHours.toFixed(1)}h</strong></span>
          </div>
        </div>

        {/* 6-box compact cause grid */}
        <div className="grid grid-cols-6 gap-2">
          {downtime.categories.map((cat) => {
            const pct = downtime.totalDowntimeHours > 0
              ? Math.round((cat.hours / downtime.totalDowntimeHours) * 100)
              : 0;

            return (
              <div
                key={cat.key}
                className={`bg-slate-50/80 border border-slate-200 rounded ${scale.downtimeCardPaddingClass} flex flex-col justify-between`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={`${scale.downtimeLabelClass} font-bold text-slate-600 uppercase tracking-tight leading-tight line-clamp-2 break-words`}
                    title={cat.label}
                  >
                    {cat.label}
                  </span>
                  <span className={`${scale.downtimePctClass} font-bold text-slate-500 font-mono flex-shrink-0`}>
                    {pct}%
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className={`${scale.downtimeMetricClass} font-black text-slate-900 font-mono`}>
                    {cat.hours.toFixed(1)}h
                  </span>
                  <div className={`${scale.downtimeBarClass} bg-slate-200 rounded-full overflow-hidden ml-1 flex-shrink-0`}>
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
    </div>
  );
});

export default DailyAuditPdfSheet;
