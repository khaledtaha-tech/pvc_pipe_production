import React from 'react';
import { 
  Gauge, 
  Layers, 
  Cpu, 
  TrendingUp, 
  CheckCircle2, 
  AlertOctagon 
} from 'lucide-react';
import { t } from '../../utils/translations.js';

export default function KpiCards({ kpis = {}, lang = 'en' }) {
  const isAr = lang === 'ar';

  const formatNumber = (num, decimals = 0) => {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  const cards = [
    {
      title: t('kpiLinesTitle', lang),
      value: isAr 
        ? `${kpis.totalLines || kpis.activeMachinesCount || 0} \u062e\u0637\u0648\u0637 \u0625\u0646\u062a\u0627\u062c` 
        : `${kpis.totalLines || kpis.activeMachinesCount || 0} Lines`,
      subValue: t('kpiLinesSub', lang),
      icon: Cpu,
      color: 'from-teal-500 to-emerald-600',
      textColor: 'text-teal-400',
      borderColor: 'border-teal-500/20'
    },
    {
      title: t('kpiDiametersTitle', lang),
      value: isAr 
        ? `${kpis.totalDiameters || 0} \u0627\u0644\u0623\u0642\u0637\u0627\u0631 \u0627\u0644\u0645\u0639\u0627\u0644\u062c\u0629` 
        : `${kpis.totalDiameters || 0} Diameters`,
      subValue: t('kpiDiametersSub', lang),
      icon: Layers,
      color: 'from-blue-500 to-indigo-600',
      textColor: 'text-blue-400',
      borderColor: 'border-blue-500/20'
    },
    {
      title: t('kpiPeakRateTitle', lang),
      value: isAr 
        ? `${formatNumber(kpis.plantPeakRate, 1)} \u0643\u062c\u0645/\u0633\u0627\u0639\u0629` 
        : `${formatNumber(kpis.plantPeakRate, 1)} kg/hr`,
      subValue: kpis.plantPeakMachine ? `${kpis.plantPeakMachine} (${kpis.plantPeakDiameter})` : t('kpiPeakRateSub', lang),
      icon: TrendingUp,
      color: 'from-cyan-500 to-blue-600',
      textColor: 'text-cyan-400',
      borderColor: 'border-cyan-500/20'
    },
    {
      title: t('kpiUtilizationTitle', lang),
      value: `${formatNumber(kpis.avgCapacityUtilization, 1)}%`,
      subValue: t('kpiUtilizationSub', lang),
      icon: Gauge,
      color: (kpis.avgCapacityUtilization || 0) >= 70 ? 'from-purple-500 to-indigo-600' : 'from-amber-500 to-orange-600',
      textColor: (kpis.avgCapacityUtilization || 0) >= 70 ? 'text-purple-400' : 'text-amber-400',
      borderColor: (kpis.avgCapacityUtilization || 0) >= 70 ? 'border-purple-500/20' : 'border-amber-500/20'
    },
    {
      title: t('kpiOptimalTitle', lang),
      value: `${formatNumber(kpis.optimalSizingRate, 0)}%`,
      subValue: isAr 
        ? `${kpis.optimalLoadingCount || 0} \u062a\u0634\u063a\u064a\u0644\u0627\u062a \u0645\u0637\u0627\u0628\u0642\u0629 \u0648\u0628\u062a\u062d\u0645\u064a\u0644 \u0645\u062b\u0627\u0644\u064a` 
        : `${kpis.optimalLoadingCount || 0} Runs in Spec & High Load`,
      icon: CheckCircle2,
      color: (kpis.optimalSizingRate || 0) >= 70 ? 'from-emerald-500 to-teal-600' : 'from-amber-500 to-rose-600',
      textColor: (kpis.optimalSizingRate || 0) >= 70 ? 'text-emerald-400' : 'text-amber-400',
      borderColor: (kpis.optimalSizingRate || 0) >= 70 ? 'border-emerald-500/20' : 'border-amber-500/20'
    },
    {
      title: t('kpiViolationsTitle', lang),
      value: isAr 
        ? `${kpis.rangeViolationsCount || 0} \u0645\u062e\u0627\u0644\u0641\u0627\u062a \u0627\u0644\u0646\u0637\u0627\u0642` 
        : `${kpis.rangeViolationsCount || 0} Violations`,
      subValue: (kpis.rangeViolationsCount || 0) > 0 ? t('kpiViolationsNonZeroSub', lang) : t('kpiViolationsZeroSub', lang),
      icon: AlertOctagon,
      color: (kpis.rangeViolationsCount || 0) > 0 ? 'from-rose-500 to-red-600' : 'from-emerald-600 to-teal-700',
      textColor: (kpis.rangeViolationsCount || 0) > 0 ? 'text-rose-400' : 'text-emerald-400',
      borderColor: (kpis.rangeViolationsCount || 0) > 0 ? 'border-rose-500/30' : 'border-emerald-500/20'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`bg-slate-900/90 border ${card.borderColor} rounded-xl p-4 shadow-lg hover:shadow-cyan-500/5 transition-all duration-200 relative overflow-hidden`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-slate-400 truncate" title={card.title}>
                {card.title}
              </span>
              <div className={`p-2 rounded-lg bg-gradient-to-br ${card.color} text-white shadow-sm`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xl font-black tracking-tight text-white font-mono">
                {card.value}
              </div>
              <p className="text-[11px] text-slate-400 truncate font-medium" title={card.subValue}>
                {card.subValue}
              </p>
            </div>

            <div className="absolute -bottom-1 -right-1 w-12 h-12 bg-white/5 rounded-full blur-xl pointer-events-none" />
          </div>
        );
      })}
    </div>
  );
}
