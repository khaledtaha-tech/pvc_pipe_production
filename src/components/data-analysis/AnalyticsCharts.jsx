import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { 
  BarChart3, 
  Cpu, 
  Scale, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon,
  TrendingUp, 
  Layers, 
  Gauge
} from 'lucide-react';

const MACHINE_PALETTE = [
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1'  // indigo
];

export default function AnalyticsCharts({ analytics = {} }) {
  const { 
    distinctMachines = [], 
    distinctDiameters = [], 
    machineDiameterMatrix = [], 
    crossMachineVariance = [], 
    optimalLineRanges = [] 
  } = analytics || {};

  const [selectedDiameterFilter, setSelectedDiameterFilter] = useState('ALL');

  // Filter matrix for chart
  const filteredMatrix = machineDiameterMatrix.filter(row => {
    if (selectedDiameterFilter !== 'ALL' && row.diameter !== selectedDiameterFilter) {
      return false;
    }
    return true;
  });

  // Assign distinct colors per machine
  const machineColorMap = {};
  distinctMachines.forEach((mach, idx) => {
    machineColorMap[mach] = MACHINE_PALETTE[idx % MACHINE_PALETTE.length];
  });

  const MatrixTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dataRow = payload[0]?.payload;
      return (
        <div className="bg-slate-900/95 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-2 backdrop-blur-md">
          <p className="font-bold text-cyan-300 border-b border-slate-800 pb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Diameter: {label}</span>
            </span>
            {dataRow?.diameterMm && (
              <span className="text-[10px] text-slate-400 font-mono">OD: {dataRow.diameterMm} mm</span>
            )}
          </p>
          {payload.filter(item => Number(item.value) > 0).map((item, idx) => {
            const mach = item.dataKey;
            const util = dataRow ? dataRow[`${mach}_util`] : null;
            const isWithinRange = dataRow ? dataRow[`${mach}_withinRange`] : true;

            return (
              <div key={idx} className="space-y-0.5 border-b border-slate-800/40 pb-1 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5" style={{ color: item.color }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-semibold">{item.name}:</span>
                  </span>
                  <span className="font-mono font-bold text-white">
                    {Number(item.value).toFixed(1)} kg/h
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono pl-3.5">
                  <span className="text-slate-400">
                    {util !== null ? `Capacity Utilization: ${util}%` : 'Uncalibrated Capacity'}
                  </span>
                  {!isWithinRange && (
                    <span className="text-rose-400 font-bold bg-rose-950/60 px-1 rounded">
                      Out of Allowable Range
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">

      {/* 1. Machine vs Diameter Matrix (Rate & Utilization Comparison by Size) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-base text-slate-100">
                Machine vs Diameter Throughput & Utilization Matrix
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Comparative actual extrusion rates (kg/hr) and master capacity loading efficiency % across lines
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Filter Size:</span>
            <select
              value={selectedDiameterFilter}
              onChange={(e) => setSelectedDiameterFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Diameters ({distinctDiameters.length})</option>
              {distinctDiameters.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Grouped Bar Chart */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={filteredMatrix} 
              margin={{ top: 20, right: 20, left: 0, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis 
                dataKey="diameter" 
                stroke="#64748b" 
                fontSize={12} 
                tickLine={false} 
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={11} 
                tickLine={false} 
                unit=" kg/h" 
              />
              <Tooltip content={<MatrixTooltip />} />
              <Legend 
                verticalAlign="top" 
                align="right" 
                wrapperStyle={{ paddingBottom: '15px', fontSize: '12px' }} 
              />
              {distinctMachines.map((mach) => (
                <Bar 
                  key={mach}
                  dataKey={mach} 
                  name={mach} 
                  fill={machineColorMap[mach]} 
                  radius={[4, 4, 0, 0]} 
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Dense Heatmap / Sizing Table Matrix with Master Utilization % */}
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-xs text-slate-300 text-left">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Extruder Line</th>
                <th className="py-2.5 px-2 text-center text-slate-400">Allowable Envelope</th>
                <th className="py-2.5 px-2 text-center text-slate-400">Nominal Cap</th>
                {distinctDiameters.map(d => (
                  <th key={d} className="py-2.5 px-3 text-center whitespace-nowrap">
                    {d}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right">Line Peak Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {distinctMachines.map(mach => {
                const lineInfo = optimalLineRanges.find(l => l.machine === mach);
                return (
                  <tr key={mach} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-sans font-bold text-slate-100 flex items-center gap-2 whitespace-nowrap">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: machineColorMap[mach] }} />
                      <span>{mach}</span>
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-400 text-[10px]">
                      {lineInfo?.nominalRangeText || 'Unconstrained'}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-300 font-bold text-[10px]">
                      {lineInfo?.nominalCapacity ? `${lineInfo.nominalCapacity} kg/h` : '-'}
                    </td>
                    {distinctDiameters.map(diam => {
                      const row = machineDiameterMatrix.find(r => r.diameter === diam);
                      const rate = row ? row[mach] : 0;
                      const util = row ? row[`${mach}_util`] : null;
                      const isWithinRange = row ? row[`${mach}_withinRange`] : true;
                      const isBest = row && row.bestMachine === mach && rate > 0;

                      if (!rate || rate === 0) {
                        return (
                          <td key={diam} className="py-2.5 px-3 text-center text-slate-600">
                            -
                          </td>
                        );
                      }

                      return (
                        <td key={diam} className="py-2.5 px-3 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span 
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                !isWithinRange 
                                  ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40' 
                                  : (isBest 
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' 
                                      : 'bg-slate-800 text-slate-300')
                              }`}
                            >
                              {rate.toFixed(1)}
                              {isBest && isWithinRange && <span className="ml-1 text-[9px] text-emerald-400">★</span>}
                            </span>
                            <span className={`text-[9px] mt-0.5 ${
                              !isWithinRange 
                                ? 'text-rose-400 font-bold' 
                                : (util && util >= 70 ? 'text-emerald-400' : 'text-slate-400')
                            }`}>
                              {!isWithinRange ? 'Out of Range' : (util !== null ? `${util}% util` : '')}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-right font-bold text-cyan-400 whitespace-nowrap">
                      {lineInfo ? `${lineInfo.maxRate} kg/hr` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Cross-Machine Variance & Disparity Analyzer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-base text-slate-100">
                Cross-Line Sizing Disparity & Efficiency Gap Detection
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Performance analysis when the same pipe diameter is assigned to different extruders
            </p>
          </div>

          <span className="text-xs px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg font-mono">
            {crossMachineVariance.length} Multiline Diameters Identified
          </span>
        </div>

        {crossMachineVariance.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {crossMachineVariance.map((item, idx) => (
              <div 
                key={idx} 
                className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-cyan-300 font-mono bg-cyan-950/60 border border-cyan-800 px-2.5 py-0.5 rounded-lg">
                    {item.diameter}
                  </span>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    item.spreadPct > 20 
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    +{item.spreadPct}% Rate Spread
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between bg-emerald-950/20 border border-emerald-500/20 p-2 rounded-lg">
                    <div>
                      <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Recommended Line</span>
                      <span className="font-bold text-white text-xs">{item.bestMachine}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-emerald-300 text-sm">{item.bestRate} kg/h</span>
                      {item.bestUtilPct !== null && (
                        <span className="text-[10px] text-emerald-400 font-mono block">{item.bestUtilPct}% util</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-2 rounded-lg">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Penalized Line</span>
                      <span className="font-bold text-slate-300 text-xs">{item.worstMachine}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-slate-400 text-xs block">{item.worstRate} kg/h</span>
                      <span className="text-[10px] text-rose-400 font-mono">-{item.diffKg} kg/h penalty</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Routing Recommendation:</span>
                  <span className="font-semibold text-slate-200">Prefer {item.bestMachine}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
            Every diameter in the uploaded batch was produced on a dedicated extruder without cross-line duplicate assignments.
          </div>
        )}
      </div>

      {/* 3. Optimal Operating Ranges & Calibrated Specifications per Extruder */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-purple-400" />
              <h3 className="font-bold text-base text-slate-100">
                Master Allowable Envelopes & Extruder Operating Bands
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Calibrated master profiles with allowable diameter ranges, nominal capacities, and average load efficiency
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {optimalLineRanges.map((line, idx) => (
            <div 
              key={idx}
              className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3.5 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: machineColorMap[line.machine] }} />
                  <div>
                    <h4 className="font-bold text-sm text-white">{line.machine}</h4>
                    {line.profileName && line.profileName !== line.machine && (
                      <span className="text-[10px] text-slate-400 block">{line.profileName}</span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                  {line.totalRuns} runs
                </span>
              </div>

              {/* Master Machine Specs */}
              <div className="bg-slate-900 border border-slate-800/80 p-2.5 rounded-lg space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Allowable Envelope:</span>
                  <span className="font-mono font-bold text-cyan-300 text-[11px]">{line.nominalRangeText}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">Nominal Capacity:</span>
                  <span className="font-mono font-bold text-white text-[11px]">
                    {line.nominalCapacity ? `${line.nominalCapacity} kg/h` : 'Uncalibrated'}
                  </span>
                </div>
                {line.avgUtilPct !== null && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <span className="text-slate-400 text-[11px]">Avg Load Efficiency:</span>
                    <span className={`font-mono font-bold text-[11px] ${
                      line.avgUtilPct >= 70 ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {line.avgUtilPct}%
                    </span>
                  </div>
                )}
              </div>

              {/* Operating Band Gauge */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Observed Output Range</span>
                  <span className="font-mono text-cyan-300 font-bold">{line.operatingBand}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.max(20, (line.avgRate / (line.nominalCapacity || 350)) * 100))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>Min: {line.minRate}</span>
                  <span className="text-slate-300 font-bold">Avg: {line.avgRate} kg/h</span>
                  <span>Peak: {line.maxRate}</span>
                </div>
              </div>

              {/* Optimal Diameters Sweet Spot */}
              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 block">
                  Top Performing Sizing Profiles:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {line.optimalProfiles && line.optimalProfiles.length > 0 ? (
                    line.optimalProfiles.map((p, pIdx) => (
                      <span 
                        key={pIdx}
                        className="text-[10px] font-mono bg-slate-900 border border-slate-700 text-cyan-300 px-2 py-0.5 rounded flex items-center gap-1"
                      >
                        <span>{p.diameter}</span>
                        <span className="text-slate-500 font-bold">({p.rate} kg/h)</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-500">Unspecified Profile</span>
                  )}
                </div>
              </div>

            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
