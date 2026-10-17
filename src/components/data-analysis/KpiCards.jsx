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

export default function KpiCards({ kpis = {}, analytics = {}, lang = 'en', theme = 'dark' }) {
  const isAr = lang === 'ar';
  const isLight = theme === 'light';
  const effectiveKpis = Object.keys(kpis).length > 0 ? kpis : analytics;

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
        ? `${effectiveKpis.totalLines || effectiveKpis.activeMachinesCount || 0} خطوط إنتاج` 
        : `${effectiveKpis.totalLines || effectiveKpis.activeMachinesCount || 0} Lines`,
      subValue: t('kpiLinesSub', lang),
      icon: Cpu,
      gradient: 'from-emerald-600 to-cyan-500',
      badgeBg: 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-cyan-400 border-emerald-500/20'
    },
    {
      title: t('kpiDiametersTitle', lang),
      value: isAr 
        ? `${effectiveKpis.totalDiameters || 0} الأقطار المعالجة` 
        : `${effectiveKpis.totalDiameters || 0} Diameters`,
      subValue: t('kpiDiametersSub', lang),
      icon: Layers,
      gradient: 'from-indigo-600 to-purple-600',
      badgeBg: 'bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
    },
    {
      title: t('kpiPeakRateTitle', lang),
      value: isAr 
        ? `${formatNumber(effectiveKpis.plantPeakRate, 1)} كجم/ساعة` 
        : `${formatNumber(effectiveKpis.plantPeakRate, 1)} kg/hr`,
      subValue: effectiveKpis.plantPeakMachine ? `${effectiveKpis.plantPeakMachine} (${effectiveKpis.plantPeakDiameter})` : t('kpiPeakRateSub', lang),
      icon: TrendingUp,
      gradient: 'from-cyan-600 to-teal-500',
      badgeBg: 'bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
    },
    {
      title: t('kpiUtilizationTitle', lang),
      value: `${formatNumber(effectiveKpis.avgCapacityUtilization, 1)}%`,
      subValue: t('kpiUtilizationSub', lang),
      icon: Gauge,
      gradient: (effectiveKpis.avgCapacityUtilization || 0) >= 70 ? 'from-purple-600 to-indigo-600' : 'from-amber-500 to-orange-500',
      badgeBg: (effectiveKpis.avgCapacityUtilization || 0) >= 70 
        ? 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/20' 
        : 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/20'
    },
    {
      title: t('kpiOptimalTitle', lang),
      value: `${formatNumber(effectiveKpis.optimalSizingRate, 0)}%`,
      subValue: isAr 
        ? `${effectiveKpis.optimalLoadingCount || 0} تشغيلات مطابقة وبتحميل مثالي` 
        : `${effectiveKpis.optimalLoadingCount || 0} Runs in Spec & High Load`,
      icon: CheckCircle2,
      gradient: (effectiveKpis.optimalSizingRate || 0) >= 70 ? 'from-emerald-600 to-teal-500' : 'from-amber-500 to-rose-500',
      badgeBg: (effectiveKpis.optimalSizingRate || 0) >= 70 
        ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
        : 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/20'
    },
    {
      title: t('kpiViolationsTitle', lang),
      value: isAr 
        ? `${effectiveKpis.rangeViolationsCount || 0} مخالفات النطاق` 
        : `${effectiveKpis.rangeViolationsCount || 0} Violations`,
      subValue: (effectiveKpis.rangeViolationsCount || 0) > 0 ? t('kpiViolationsNonZeroSub', lang) : t('kpiViolationsZeroSub', lang),
      icon: AlertOctagon,
      gradient: (effectiveKpis.rangeViolationsCount || 0) > 0 ? 'from-rose-600 to-red-600' : 'from-emerald-600 to-teal-600',
      badgeBg: (effectiveKpis.rangeViolationsCount || 0) > 0 
        ? 'bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/20' 
        : 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`rounded-2xl p-4 transition-all duration-200 relative overflow-hidden group border ${
              isLight
                ? 'bg-white border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300'
                : 'bg-slate-900/90 border-slate-800/80 shadow-lg hover:shadow-cyan-500/5 hover:border-slate-700'
            }`}
          >
            {/* Top Micro Gradient Accent Line */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.gradient}`} />

            <div className="flex items-center justify-between mb-2.5">
              <span className={`text-[11px] font-bold tracking-wide uppercase truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`} title={card.title}>
                {card.title}
              </span>
              <div className={`p-2 rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-sm ring-1 ring-white/20 group-hover:scale-105 transition-transform`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="space-y-1">
              <div className={`text-xl font-black tracking-tight font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {card.value}
              </div>
              <p className={`text-[11px] font-medium truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`} title={card.subValue}>
                {card.subValue}
              </p>
            </div>

            {/* Subtle background glow */}
            <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
          </div>
        );
      })}
    </div>
  );
}
