import React, { forwardRef } from 'react';

/**
 * Sleek Single-Page A4 Portrait Daily Production & Operational Audit Report Sheet
 * Fits strictly onto exactly 1 single A4 Portrait page without multi-page spilling.
 */
const DailyAuditPdfSheet = forwardRef(function DailyAuditPdfSheet(
  { data, className = '' },
  ref
) {
  if (!data) return null;

  const { meta, kpis, downtime, rows } = data;

  return (
    <div
      ref={ref}
      className={`daily-audit-pdf-sheet bg-white text-slate-900 ${className}`}
      id="daily-audit-printable-sheet"
    >
      {/* 1. Header Section */}
      <header className="audit-sheet-header border-b-2 border-slate-900 pb-2 mb-2.5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-lg tracking-wider shadow-sm flex-shrink-0">
              AMP
            </div>
            <div>
              <h1 className="text-[13px] font-black tracking-wider uppercase text-slate-800 leading-tight">
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
            <div className="inline-block bg-blue-50 border border-blue-200 text-blue-900 px-2.5 py-0.5 rounded font-bold text-xs">
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

      {/* 2. Executive Summary Cards (Top Row - 4 KPI Badges) */}
      <section className="audit-kpi-grid grid grid-cols-4 gap-2 mb-2.5">
        {/* KPI 1: Total FG Output */}
        <div className="audit-kpi-card bg-emerald-50/70 border border-emerald-300 rounded-md p-2">
          <div className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider">
            Total Finished Goods Output
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[16px] font-black text-emerald-950 font-mono">
              {kpis.totalActualPcs.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-emerald-700">pcs</span>
            <span className="text-slate-400 text-xs mx-0.5">&bull;</span>
            <span className="text-[13px] font-bold text-emerald-900 font-mono">
              {kpis.totalActualMT} MT
            </span>
          </div>
          <div className="text-[8.5px] text-emerald-700 font-medium flex items-center justify-between mt-0.5">
            <span>Target: {kpis.totalExpectedPcs.toLocaleString()} pcs</span>
            <span className={`font-bold ${kpis.totalVariancePcs >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {kpis.totalVariancePcs >= 0 ? '+' : ''}{kpis.totalVariancePct}%
            </span>
          </div>
        </div>

        {/* KPI 2: Lost Time & Downtime */}
        <div className="audit-kpi-card bg-amber-50/70 border border-amber-300 rounded-md p-2">
          <div className="text-[9px] font-bold text-amber-800 uppercase tracking-wider">
            Time Accounting &amp; Lost Hours
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[16px] font-black text-amber-950 font-mono">
              {kpis.totalLostHours.toFixed(1)}
            </span>
            <span className="text-[10px] font-bold text-amber-700">h lost</span>
            <span className="text-slate-400 text-xs mx-0.5">&bull;</span>
            <span className="text-[12px] font-bold text-amber-900 font-mono">
              {kpis.totalOperatingHours.toFixed(1)}h run
            </span>
          </div>
          <div className="text-[8.5px] text-amber-800 font-medium flex items-center justify-between mt-0.5">
            <span>Downtime: {downtime.totalDowntimeHours.toFixed(1)}h</span>
            <span className="font-bold text-rose-700">
              Unjustified: {kpis.totalUnjustifiedHours.toFixed(1)}h
            </span>
          </div>
        </div>

        {/* KPI 3: Overall Plant OEE */}
        <div className="audit-kpi-card bg-indigo-50/70 border border-indigo-300 rounded-md p-2">
          <div className="text-[9px] font-bold text-indigo-800 uppercase tracking-wider">
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
          <div className="text-[8.5px] text-indigo-800 font-mono flex items-center justify-between mt-0.5">
            <span>A: {kpis.plantAvailabilityPct.toFixed(1)}%</span>
            <span>P: {kpis.plantPerformancePct.toFixed(1)}%</span>
            <span>Q: {kpis.plantQualityPct.toFixed(1)}%</span>
          </div>
        </div>

        {/* KPI 4: Scrap Output & Scrap Ratio */}
        <div className="audit-kpi-card bg-rose-50/70 border border-rose-300 rounded-md p-2">
          <div className="text-[9px] font-bold text-rose-800 uppercase tracking-wider">
            Scrap Output &amp; Quality Ratio
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[16px] font-black text-rose-950 font-mono">
              {kpis.totalScrapKg.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-rose-700">kg scrap</span>
            <span className="text-slate-400 text-xs mx-0.5">&bull;</span>
            <span className="text-[13px] font-black text-rose-900 font-mono">
              {kpis.scrapRatioPct.toFixed(1)}%
            </span>
          </div>
          <div className="text-[8.5px] text-rose-800 font-medium flex items-center justify-between mt-0.5">
            <span>Total Melt: {kpis.totalMeltKg.toLocaleString()} kg</span>
            <span className="font-bold text-emerald-700">Good: {kpis.totalActualKg.toLocaleString()} kg</span>
          </div>
        </div>
      </section>

      {/* 3. Central Production Reconciliation Table */}
      <section className="audit-table-section mb-2.5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800">
            Machine-by-Machine Production Reconciliation &amp; Operational Standards
          </h3>
          <span className="text-[8.5px] font-mono text-slate-500">
            24h Theoretical Standard vs Actual Reported Telemetry
          </span>
        </div>

        <table className="audit-table w-full border-collapse text-left text-[9.5px]">
          <thead>
            <tr className="bg-slate-800 text-white font-bold text-[8.5px] uppercase tracking-wider">
              <th className="py-1 px-1.5 border border-slate-700 w-[14%]">Line &amp; Machine</th>
              <th className="py-1 px-1.5 border border-slate-700 w-[23%]">Product Code &amp; Mold Specs</th>
              <th className="py-1 px-1.5 border border-slate-700 text-center w-[13%]">Std Pace (24h / Rate)</th>
              <th className="py-1 px-1.5 border border-slate-700 text-right w-[15%]">Actual FG Output</th>
              <th className="py-1 px-1.5 border border-slate-700 text-right w-[13%]">Variance (&Delta; Deficit)</th>
              <th className="py-1 px-1.5 border border-slate-700 text-center w-[12%]">Realized Pace</th>
              <th className="py-1 px-1.5 border border-slate-700 text-center w-[10%]">Line OEE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
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
                  {/* Line & Machine */}
                  <td className="py-1 px-1.5 border-r border-slate-200 font-semibold text-slate-900">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[9px] bg-slate-200 text-slate-800 px-1 py-0.2 rounded font-bold">
                        {row.lineId}
                      </span>
                      <span className="truncate max-w-[110px]" title={row.fullMachineName}>
                        {row.fullMachineName.replace(/^L-\d+\s*-\s*/, '')}
                      </span>
                    </div>
                  </td>

                  {/* Product Code & Mold Specs */}
                  <td className="py-1 px-1.5 border-r border-slate-200 text-slate-800">
                    <div className="font-bold text-slate-900 truncate max-w-[190px]" title={row.pipeSize}>
                      {row.pipeSize}
                    </div>
                    {row.productCode && row.productCode !== row.pipeSize && row.productCode !== '-' && (
                      <div className="text-[8px] font-mono text-slate-500 truncate max-w-[190px]">
                        {row.productCode}
                      </div>
                    )}
                  </td>

                  {/* Std Pace (24h / Rate) */}
                  <td className="py-1 px-1.5 border-r border-slate-200 text-center font-mono">
                    {hasRun ? (
                      <div>
                        <div className="font-bold text-slate-800">
                          {row.expectedPcs.toLocaleString()} <span className="text-[7.5px] text-slate-500">pcs</span>
                        </div>
                        <div className="text-[8px] text-slate-500">
                          {row.stdRate} pcs/h
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[8.5px]">Idle / No Order</span>
                    )}
                  </td>

                  {/* Actual FG Output */}
                  <td className="py-1 px-1.5 border-r border-slate-200 text-right font-mono">
                    {hasRun ? (
                      <div>
                        <div className="font-bold text-emerald-900">
                          {row.actualPcs.toLocaleString()} <span className="text-[7.5px] text-emerald-700">pcs</span>
                        </div>
                        <div className="text-[8px] text-slate-600">
                          {row.actualKg.toLocaleString()} kg
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">0 pcs</span>
                    )}
                  </td>

                  {/* Variance / Deficit */}
                  <td className="py-1 px-1.5 border-r border-slate-200 text-right font-mono">
                    {hasRun ? (
                      <div>
                        <div
                          className={`font-extrabold ${
                            row.variancePcs >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {row.variancePcs >= 0 ? '+' : ''}
                          {row.variancePcs.toLocaleString()} <span className="text-[7.5px]">pcs</span>
                        </div>
                        <div
                          className={`text-[8px] ${
                            row.varianceKg >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {row.varianceKg >= 0 ? '+' : ''}
                          {row.varianceKg.toLocaleString()} kg
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  {/* Realized Pace vs Std */}
                  <td className="py-1 px-1.5 border-r border-slate-200 text-center font-mono">
                    {hasRun && row.operatingHours > 0 ? (
                      <div>
                        <div className="font-bold text-cyan-950">
                          {row.actualRatePcsH} <span className="text-[7.5px] text-slate-500">pcs/h</span>
                        </div>
                        <div
                          className={`text-[8px] font-bold ${
                            row.speedEffPct >= 85
                              ? 'text-emerald-700'
                              : row.speedEffPct >= 70
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {row.speedEffPct.toFixed(1)}% Eff
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">0.0h</span>
                    )}
                  </td>

                  {/* Line OEE */}
                  <td className="py-1 px-1.5 text-center font-mono font-bold">
                    {hasRun ? (
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[8.5px] border ${
                          row.oeePct >= 75
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : row.oeePct >= 60
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300'
                        }`}
                      >
                        {row.oeePct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-300 font-normal">0.0%</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Total Summary Row */}
            <tr className="bg-slate-100 border-t-2 border-slate-800 font-bold text-[9px]">
              <td className="py-1 px-1.5 text-slate-900 uppercase">
                Plant Totals ({kpis.activeLineCount} Active)
              </td>
              <td className="py-1 px-1.5 text-slate-600 font-mono">
                {kpis.totalPlantCapacityHours.toFixed(0)}h Capacity &bull; {kpis.totalOperatingHours.toFixed(1)}h Run
              </td>
              <td className="py-1 px-1.5 text-center font-mono text-slate-900">
                {kpis.totalExpectedPcs.toLocaleString()} pcs
              </td>
              <td className="py-1 px-1.5 text-right font-mono text-emerald-950">
                {kpis.totalActualPcs.toLocaleString()} pcs
              </td>
              <td
                className={`py-1 px-1.5 text-right font-mono ${
                  kpis.totalVariancePcs >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {kpis.totalVariancePcs >= 0 ? '+' : ''}{kpis.totalVariancePcs.toLocaleString()} pcs
              </td>
              <td className="py-1 px-1.5 text-center font-mono text-cyan-950">
                {kpis.plantPerformancePct.toFixed(1)}% Pace
              </td>
              <td className="py-1 px-1.5 text-center font-mono text-indigo-950 font-black">
                {kpis.plantOeePct.toFixed(1)}% OEE
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 4. Downtime Allocation & Time Accounting Bar */}
      <section className="audit-downtime-section mb-2.5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800">
            Plant Downtime Allocation &amp; Root Cause Accounting
          </h3>
          <span className="text-[8.5px] font-mono text-slate-500">
            Total Accounted Downtime: <strong className="text-slate-800">{downtime.totalDowntimeHours.toFixed(1)} Hours</strong>
          </span>
        </div>

        {/* 6-box compact cause grid */}
        <div className="grid grid-cols-6 gap-1.5 text-[8.5px]">
          {downtime.categories.map((cat) => {
            const pct = downtime.totalDowntimeHours > 0
              ? Math.round((cat.hours / downtime.totalDowntimeHours) * 100)
              : 0;

            return (
              <div
                key={cat.key}
                className="bg-slate-50 border border-slate-200 rounded p-1.5 flex flex-col justify-between"
              >
                <div className="text-[8px] font-bold text-slate-600 uppercase tracking-tight truncate" title={cat.label}>
                  {cat.label}
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-[12px] font-black text-slate-900 font-mono">
                    {cat.hours.toFixed(1)}h
                  </span>
                  <span className="text-[8px] font-semibold text-slate-500">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Executive Sign-Off Footer */}
      <footer className="audit-signoff-footer border-t border-slate-300 pt-2 mt-auto">
        <div className="grid grid-cols-3 gap-3">
          {/* Signoff 1: Shift Production Engineer */}
          <div className="border border-slate-300 rounded p-1.5 bg-slate-50/50">
            <div className="text-[8.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Shift Production Engineer
            </div>
            <div className="text-[8px] text-slate-500 space-y-1 font-mono">
              <div>Name: <span className="border-b border-dotted border-slate-400 inline-block w-28">&nbsp;</span></div>
              <div>Signature: <span className="border-b border-dotted border-slate-400 inline-block w-24">&nbsp;</span></div>
              <div>Date: <span className="border-b border-dotted border-slate-400 inline-block w-28">&nbsp;</span></div>
            </div>
          </div>

          {/* Signoff 2: Quality Control Auditor */}
          <div className="border border-slate-300 rounded p-1.5 bg-slate-50/50">
            <div className="text-[8.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Quality Assurance Auditor
            </div>
            <div className="text-[8px] text-slate-500 space-y-1 font-mono">
              <div>Name: <span className="border-b border-dotted border-slate-400 inline-block w-28">&nbsp;</span></div>
              <div>Signature: <span className="border-b border-dotted border-slate-400 inline-block w-24">&nbsp;</span></div>
              <div>Date: <span className="border-b border-dotted border-slate-400 inline-block w-28">&nbsp;</span></div>
            </div>
          </div>

          {/* Signoff 3: Production & Plant Manager */}
          <div className="border border-slate-300 rounded p-1.5 bg-slate-50/50">
            <div className="text-[8.5px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Operations &amp; Plant Manager
            </div>
            <div className="text-[8px] text-slate-500 space-y-1 font-mono">
              <div>Name: <span className="border-b border-dotted border-slate-400 inline-block w-28">&nbsp;</span></div>
              <div>Signature: <span className="border-b border-dotted border-slate-400 inline-block w-24">&nbsp;</span></div>
              <div>Date: <span className="border-b border-dotted border-slate-400 inline-block w-28">&nbsp;</span></div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-[7.5px] text-slate-400 font-mono mt-1.5">
          <span>DOC-Ext.-03 &bull; Daily Production &amp; Operational Audit Form &bull; Confidential Internal Report</span>
          <span>Single-Page Official Audit Record &bull; Page 1 of 1</span>
        </div>
      </footer>
    </div>
  );
});

export default DailyAuditPdfSheet;
