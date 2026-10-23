import React, { useMemo } from 'react';
import {
  Sliders,
  BookOpen,
  ShieldCheck,
  ClipboardList,
  FileSpreadsheet,
  Factory,
  Database,
  BarChart3,
  ArrowRight,
  LayoutGrid,
  HardDrive,
  Calendar,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Layers,
  Activity,
  Compass
} from 'lucide-react';

import launchpadConfig from '../../data/launchpadConfig.json' with { type: 'json' };
import { loadHarmonizerSandboxState } from '../../logic/catalogHarmonizer.js';

export default function HomeLaunchpadView({
  theme = 'dark',
  lang = 'en',
  masterCount = 0,
  planningMatrix = [],
  cleanedRows = [],
  rawRows = [],
  historicalRawRows = [],
  onNavigate = () => {},
  onOpenBlankSopPrint = () => {},
  onOpenMachineSettings = () => {},
  onNotify = () => {}
}) {
  const isAr = lang === 'ar';
  const isLight = theme === 'light';

  // Harmonizer sandbox summary
  const harmonizerSummary = useMemo(() => {
    try {
      const staged = loadHarmonizerSandboxState();
      const variances = staged.filter(item => item.hasVariance || item.status === 'variance').length;
      return {
        count: staged.length,
        variances
      };
    } catch {
      return { count: 0, variances: 0 };
    }
  }, []);

  // Format today's operational date
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }, [isAr]);

  // Icon Resolver
  const getIcon = (iconName) => {
    switch (iconName) {
      case 'Sliders':
        return Sliders;
      case 'BookOpen':
        return BookOpen;
      case 'ShieldCheck':
        return ShieldCheck;
      case 'ClipboardList':
        return ClipboardList;
      case 'FileSpreadsheet':
        return FileSpreadsheet;
      case 'Factory':
        return Factory;
      case 'Database':
        return Database;
      case 'BarChart3':
        return BarChart3;
      default:
        return LayoutGrid;
    }
  };

  // Badge Color Resolver
  const getBadgeClass = (badgeColor) => {
    switch (badgeColor) {
      case 'amber':
        return 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30';
      case 'cyan':
        return 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30';
      case 'emerald':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case 'blue':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'purple':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
      case 'teal':
        return 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30';
      case 'indigo':
        return 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30';
      default:
        return 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30';
    }
  };

  // Action dispatcher
  const handleCardClick = (card) => {
    if (card.triggerAction === 'open_blank_sop') {
      onOpenBlankSopPrint();
      return;
    }
    if (card.triggerAction === 'open_machine_settings') {
      onOpenMachineSettings();
      return;
    }
    if (card.targetModule) {
      onNavigate(card.targetModule, card.targetTab || null);
    }
  };

  return (
    <div className={`space-y-6 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
      
      {/* 1. Executive Top Hero Banner */}
      <div className={`p-6 rounded-2xl border transition-all ${
        isLight
          ? 'bg-white border-slate-200/90 shadow-sm'
          : 'bg-[#0f172a]/90 border-slate-800 shadow-xl'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="h-14 w-14 rounded-2xl brand-gradient flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 ring-2 ring-white/10 shrink-0">
              <Compass className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                  {isAr ? launchpadConfig.title.ar : launchpadConfig.title.en}
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>SYSTEM ONLINE</span>
                </span>
              </div>
              <p className={`text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {isAr ? launchpadConfig.subtitle.ar : launchpadConfig.subtitle.en}
              </p>
            </div>
          </div>

          {/* Quick Jump Action Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('daily-evaluation')}
              className="h-9 inline-flex items-center gap-2 text-xs font-bold px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer shadow-md shadow-emerald-600/25"
            >
              <ClipboardList className="w-4 h-4" />
              <span>{isAr ? '\u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u064A\u0648\u0645\u064A OEE' : 'Daily OEE'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('catalog-harmonizer')}
              className={`h-9 inline-flex items-center gap-2 text-xs font-bold px-3.5 rounded-xl border transition cursor-pointer shadow-xs ${
                isLight
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-700/60'
              }`}
            >
              <Sliders className="w-4 h-4 text-amber-500" />
              <span>{isAr ? '\u0645\u062E\u062A\u0628\u0631 \u0627\u0644\u062A\u0648\u062D\u064A\u062F' : 'Harmonizer Lab'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('data-hub')}
              className={`h-9 inline-flex items-center gap-2 text-xs font-semibold px-3.5 rounded-xl border transition cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Database className="w-4 h-4 text-cyan-500" />
              <span>{isAr ? '\u062A\u0628\u0627\u062F\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A' : 'Data Hub'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Quick Metric Summary Banner (4 KPI Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Active Master Catalog Items */}
        <div 
          onClick={() => onNavigate('data-analysis', 'master')}
          className={`p-4 rounded-xl border transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0f172a] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>{isAr ? launchpadConfig.quickMetrics.masterItems.labelAr : launchpadConfig.quickMetrics.masterItems.labelEn}</span>
            <Database className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {masterCount || planningMatrix.length || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
            <span>{isAr ? launchpadConfig.quickMetrics.masterItems.subtextAr : launchpadConfig.quickMetrics.masterItems.subtextEn}</span>
            <ArrowRight className="w-3 h-3 text-emerald-500" />
          </div>
        </div>

        {/* KPI 2: Central Database Connection Status */}
        <div 
          onClick={() => onNavigate('data-hub')}
          className={`p-4 rounded-xl border transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0f172a] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>{isAr ? launchpadConfig.quickMetrics.databaseStatus.labelAr : launchpadConfig.quickMetrics.databaseStatus.labelEn}</span>
            <HardDrive className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-cyan-500">
              {launchpadConfig.quickMetrics.databaseStatus.value}
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              LIVE
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
            <span>{isAr ? launchpadConfig.quickMetrics.databaseStatus.subtextAr : launchpadConfig.quickMetrics.databaseStatus.subtextEn}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          </div>
        </div>

        {/* KPI 3: Harmonizer Sandbox Items & Variance */}
        <div 
          onClick={() => onNavigate('catalog-harmonizer')}
          className={`p-4 rounded-xl border transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0f172a] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>{isAr ? launchpadConfig.quickMetrics.harmonizer.labelAr : launchpadConfig.quickMetrics.harmonizer.labelEn}</span>
            <Sliders className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-amber-500">
              {harmonizerSummary.count}
            </span>
            {harmonizerSummary.variances > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {harmonizerSummary.variances} {isAr ? '\u062A\u0639\u0627\u0631\u0636' : 'variances'}
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
            <span>{isAr ? launchpadConfig.quickMetrics.harmonizer.subtextAr : launchpadConfig.quickMetrics.harmonizer.subtextEn}</span>
            <ArrowRight className="w-3 h-3 text-amber-500" />
          </div>
        </div>

        {/* KPI 4: Current Operational Shift Date */}
        <div 
          onClick={() => onNavigate('daily-evaluation')}
          className={`p-4 rounded-xl border transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0f172a] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>{isAr ? launchpadConfig.quickMetrics.currentDate.labelAr : launchpadConfig.quickMetrics.currentDate.labelEn}</span>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-slate-100">
            {todayStr}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
            <span>{isAr ? launchpadConfig.quickMetrics.currentDate.subtextAr : launchpadConfig.quickMetrics.currentDate.subtextEn}</span>
            <span className="font-mono text-emerald-400 font-bold">L-08</span>
          </div>
        </div>
      </div>

      {/* 3. Three Strategic Operational Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {launchpadConfig.pillars.map((pillar) => {
          return (
            <div
              key={pillar.id}
              className={`rounded-2xl border flex flex-col overflow-hidden transition-all ${
                isLight ? 'bg-white border-slate-200/90 shadow-sm' : 'bg-[#0f172a]/90 border-slate-800 shadow-xl'
              }`}
            >
              {/* Pillar Header Bar */}
              <div className={`p-4 border-b flex items-center justify-between ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
              }`}>
                <div>
                  <h2 className="text-sm font-black tracking-tight text-slate-900 dark:text-slate-100">
                    {isAr ? pillar.titleAr : pillar.titleEn}
                  </h2>
                </div>
                <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  pillar.accentColor === 'emerald'
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                    : pillar.accentColor === 'blue'
                    ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
                    : 'bg-purple-500/15 text-purple-500 border-purple-500/30'
                }`}>
                  {pillar.badge}
                </span>
              </div>

              {/* Pillar Cards List */}
              <div className="p-4 flex-1 flex flex-col gap-3.5">
                {pillar.cards.map((card) => {
                  const CardIcon = getIcon(card.icon);
                  return (
                    <div
                      key={card.id}
                      onClick={() => handleCardClick(card)}
                      className={`group p-4 rounded-xl border transition-all cursor-pointer hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between ${
                        isLight
                          ? 'bg-slate-50/70 hover:bg-white border-slate-200 hover:border-emerald-500'
                          : 'bg-slate-950/60 hover:bg-slate-900 border-slate-800/80 hover:border-emerald-500/80'
                      }`}
                    >
                      <div>
                        {/* Card Top Title & Badge */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors shrink-0">
                              <CardIcon className="w-4 h-4" />
                            </div>
                            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-500 transition-colors">
                              {isAr ? card.titleAr : card.titleEn}
                            </h3>
                          </div>

                          {card.badge && (
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border shrink-0 ${getBadgeClass(card.badgeColor)}`}>
                              {card.badge}
                            </span>
                          )}
                        </div>

                        {/* Card Description */}
                        <p className={`text-[11px] leading-relaxed mb-3 line-clamp-2 ${
                          isLight ? 'text-slate-500' : 'text-slate-400'
                        }`}>
                          {isAr ? card.descAr : card.descEn}
                        </p>
                      </div>

                      {/* Card Action Link */}
                      <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between text-[11px] font-bold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform">
                        <span>{isAr ? card.actionAr : card.actionEn}</span>
                        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
