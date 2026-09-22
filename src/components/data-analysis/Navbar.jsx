import React from 'react';
import { 
  Factory, 
  FileSpreadsheet, 
  Download, 
  PlusCircle, 
  RotateCcw, 
  Github, 
  Languages, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Cpu, 
  Table,
  Sun, 
  Moon 
} from 'lucide-react';

export default function Navbar({ 
  lang, 
  setLang, 
  onLoadSample, 
  onExportClean, 
  onExportConsolidated,
  onExportMasterPlan,
  onOpenManualEntry,
  onOpenVerification,
  onOpenPlanning,
  onOpenMasterTable,
  activeTab,
  onClearAll,
  theme = 'dark',
  toggleTheme,
  recordCount,
  historicalCount = 0,
  masterCount = 0,
  auditReport
}) {
  const isAr = lang === 'ar';

  return (
    <header className={`sticky top-0 z-50 backdrop-blur-md transition-colors ${theme === 'light' ? 'bg-[#ece6db]/95 border-b border-[#d8d0c2] text-stone-900 shadow-xs' : 'bg-slate-900/90 border-b border-slate-800 text-white shadow-xl'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo & Title */}
          <div className="flex items-center space-x-4 rtl:space-x-reverse">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${theme === 'light' ? 'bg-[#0f766e] text-white shadow-sm ring-1 ring-teal-500/30' : 'bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30'}`}>
              <Factory className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-xl font-bold tracking-tight ${theme === 'light' ? 'text-stone-900' : 'bg-gradient-to-r from-white via-slate-200 to-cyan-300 bg-clip-text text-transparent'}`}>
                  {isAr ? '\u0645\u0646\u0635\u0629 \u062a\u0646\u0638\u064a\u0641 \u0648\u062a\u062d\u0644\u064a\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u0648\u0627\u0633\u064a\u0631' : 'Pipe Production Data Cleaner & Analytics'}
                </h1>
                <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full ${theme === 'light' ? 'bg-teal-50 text-teal-800 border border-teal-300' : 'bg-cyan-950 text-cyan-400 border border-cyan-800/60'}`}>
                  {isAr ? 'v1.0 \u0628\u062b\u0642' : 'v1.0 Extrusion'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${theme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                {isAr 
                  ? '\u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a\u060c \u062a\u0635\u062d\u064a\u062d \u0627\u0644\u062a\u0648\u0627\u0631\u064a\u062e\u060c \u062a\u062d\u0644\u064a\u0644 \u062e\u0637\u0648\u0637 \u0627\u0644\u0625\u0646\u062a\u0627\u062c \u0648\u062d\u0633\u0627\u0628 \u0627\u0644\u0647\u0627\u0644\u0643 \u0648\u0627\u0644\u062a\u0648\u0642\u0641\u0627\u062a'
                  : 'Automated Excel Cleaning, Extrusion Line Audit, Scrap & Downtime KPIs'}
              </p>
            </div>
          </div>

          {/* Quick Stats & Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {masterCount > 0 && (
              <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${theme === 'light' ? 'bg-stone-50 border border-stone-300 text-stone-700' : 'bg-slate-800/80 border border-slate-700 text-slate-300'}`}>
                <span className="inline-flex h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                <span>
                  {isAr ? `${masterCount} \u0633\u062c\u0644 \u0645\u062a\u0648\u0641\u0631` : `${masterCount} Total Runs`}
                </span>
                {auditReport && auditReport.warningsCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${theme === 'light' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-amber-500/20 text-amber-300'}`}>
                    <AlertTriangle className="w-3 h-3" />
                    {auditReport.warningsCount} {isAr ? '\u062a\u0646\u0628\u064a\u0647\u0627\u062a' : 'Alerts'}
                  </span>
                )}
              </div>
            )}

            {/* Manual Entry Button */}
            <button
              onClick={onOpenManualEntry}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 shadow-xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <PlusCircle className={`w-4 h-4 ${theme === 'light' ? 'text-emerald-700' : 'text-emerald-400'}`} />
              <span>{isAr ? '\u0625\u062f\u062e\u0627\u0644 \u064a\u062f\u0648\u064a' : 'Add Row'}</span>
            </button>

            {/* Master Table Toggle Button */}
            <button
              onClick={onOpenMasterTable}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                activeTab === 'master'
                  ? (theme === 'light'
                      ? 'bg-teal-50 text-teal-900 border-2 border-teal-600 font-bold shadow-xs'
                      : 'bg-cyan-600 text-white border-cyan-500 shadow-md')
                  : (theme === 'light'
                      ? 'bg-white hover:bg-stone-100 text-stone-800 border-stone-300 shadow-xs'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700')
              }`}
              title={isAr ? '\u0633\u062c\u0644 \u0627\u0644\u0625\u0646\u062a\u0627\u062c \u0648\u0627\u0644\u062a\u062e\u0637\u064a\u0637 \u0627\u0644\u0645\u0648\u062d\u062f' : 'Unified Master Extrusion & Planning Table'}
            >
              <Table className={`w-4 h-4 ${theme === 'light' ? 'text-teal-700' : 'text-cyan-400'}`} />
              <span className="hidden sm:inline">{isAr ? '\u0633\u062c\u0644 \u0627\u0644\u0625\u0646\u062a\u0627\u062c' : 'Master Table'}</span>
              {masterCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  theme === 'light'
                    ? 'bg-teal-100 text-teal-800 border border-teal-300'
                    : 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
                }`}>
                  {masterCount}
                </span>
              )}
            </button>

            {/* Verification Center Toggle Button */}
            <button
              onClick={onOpenVerification}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                activeTab === 'verification'
                  ? (theme === 'light'
                      ? 'bg-teal-50 text-teal-900 border-2 border-teal-600 font-bold shadow-xs'
                      : 'bg-cyan-600 text-white border-cyan-500 shadow-md')
                  : (theme === 'light'
                      ? 'bg-white hover:bg-stone-100 text-stone-800 border-stone-300 shadow-xs'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700')
              }`}
              title={isAr ? '\u0645\u0631\u0643\u0632 \u0627\u0644\u062a\u062d\u0642\u0642 \u0627\u0644\u0630\u0643\u064a \u0644\u0644\u0642\u062f\u0631\u0627\u062a' : 'Verification Center'}
            >
              <ShieldCheck className={`w-4 h-4 ${theme === 'light' ? 'text-teal-700' : 'text-cyan-400'}`} />
              <span className="hidden sm:inline">{isAr ? '\u0645\u0631\u0643\u0632 \u0627\u0644\u062a\u062d\u0642\u0642' : 'Verify'}</span>
            </button>

            {/* Clear All Data Button */}
            <button
              onClick={onClearAll}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition shadow-xs active:scale-95 cursor-pointer ${
                theme === 'light'
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300'
                  : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80'
              }`}
              title={isAr ? '\u0645\u0633\u062d \u062c\u0645\u064a\u0639 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u0631\u0641\u0648\u0639\u0629 \u0648\u0627\u0644\u0639\u0648\u062f\u0629 \u0644\u0635\u0641\u062d\u0629 \u0641\u0627\u0631\u063a\u0629' : 'Clear all datasets and reset to blank state'}
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
              <span className="hidden sm:inline">{isAr ? '\u0645\u0633\u062d \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a' : 'Clear All Data'}</span>
            </button>

            {/* Light / Dark Dual Segmented Toggle (matches Blown Film Pro reference) */}
            <div className={`flex items-center p-0.5 rounded-lg text-xs ${theme === 'light' ? 'bg-[#ded6c9] border border-[#d8d0c2]' : 'bg-slate-800/80 border border-slate-700'}`}>
              <button
                onClick={() => theme !== 'light' && toggleTheme()}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white text-stone-900 border border-stone-300 font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={isAr ? '\u062b\u064a\u0645 \u0641\u0627\u062a\u062d' : 'Light Mode'}
              >
                <Sun className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden sm:inline">{isAr ? '\u062b\u064a\u0645 \u0641\u0627\u062a\u062d' : 'Light'}</span>
              </button>

              <button
                onClick={() => theme !== 'dark' && toggleTheme()}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-slate-900 text-cyan-300 border border-slate-700 font-bold shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
                title={isAr ? '\u062b\u064a\u0645 \u062f\u0627\u0643\u0646' : 'Dark Mode'}
              >
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">{isAr ? '\u062b\u064a\u0645 \u062f\u0627\u0643\u0646' : 'Dark'}</span>
              </button>
            </div>

            {/* Language Dual Segmented Toggle (matches Blown Film Pro reference) */}
            <div className={`flex items-center p-0.5 rounded-lg text-xs ${theme === 'light' ? 'bg-[#ded6c9] border border-[#d8d0c2]' : 'bg-slate-800/80 border border-slate-700'}`}>
              <button
                onClick={() => lang !== 'en' && setLang('en')}
                className={`px-2.5 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                  lang === 'en'
                    ? (theme === 'light' ? 'bg-[#0f766e] text-white shadow-xs font-bold' : 'bg-cyan-600 text-white shadow-xs font-bold')
                    : (theme === 'light' ? 'text-stone-700 hover:text-stone-900' : 'text-slate-400 hover:text-slate-200')
                }`}
              >
                English
              </button>
              <button
                onClick={() => lang !== 'ar' && setLang('ar')}
                className={`px-2.5 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                  lang === 'ar'
                    ? (theme === 'light' ? 'bg-[#0f766e] text-white shadow-xs font-bold' : 'bg-cyan-600 text-white shadow-xs font-bold')
                    : (theme === 'light' ? 'text-stone-700 hover:text-stone-900' : 'text-slate-400 hover:text-slate-200')
                }`}
              >
                {'\u0627\u0644\u0639\u0631\u0628\u064a\u0629'}
              </button>
            </div>

            {/* GitHub Repo link */}
            <a
              href="https://github.com/khaledtaha-tech/Pipe_Data_Analysis"
              target="_blank"
              rel="noreferrer"
              className={`p-2 rounded-lg transition ${theme === 'light' ? 'bg-white hover:bg-stone-100 text-stone-700 hover:text-stone-900 border border-stone-300 shadow-xs' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700'}`}
              title="GitHub Repo: Pipe_Data_Analysis"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>

        </div>
      </div>
    </header>
  );
}
