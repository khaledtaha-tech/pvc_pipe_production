import React from 'react';
import { 
  Factory, 
  FileSpreadsheet, 
  Download, 
  PlusCircle, 
  RotateCcw, 
  Languages, 
  AlertTriangle, 
  ShieldCheck, 
  Cpu, 
  Table,
  BarChart3,
  ClipboardList,
  Calendar,
  Sun, 
  Moon,
  ChevronDown
} from 'lucide-react';

export default function Navbar({ 
  currentModule,
  setCurrentModule,
  activeTab,
  setActiveTab,
  lang, 
  setLang, 
  theme = 'dark',
  toggleTheme,
  recordCount,
  historicalCount = 0,
  masterCount = 0,
  auditReport,
  onOpenDataHub,
  onOpenManualEntry,
  onExportClean,
  onExportMasterPlan,
  onOpenMasterTable,
  onOpenPlanning,
  onOpenVerification
}) {
  const isAr = lang === 'ar';

  return (
    <header className={`sticky top-0 z-50 backdrop-blur-md transition-colors no-print ${
      theme === 'light' 
        ? 'bg-[#ece6db]/95 border-b border-[#d8d0c2] text-stone-900 shadow-xs' 
        : 'bg-slate-900/90 border-b border-slate-800 text-white shadow-xl'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Tier: Brand, Global Module Switcher, System Actions */}
        <div className="flex items-center justify-between h-16 border-b border-slate-800/40">
          
          {/* Brand & Suite Identity */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              theme === 'light' 
                ? 'bg-[#0f766e] text-white shadow-sm ring-1 ring-teal-500/30' 
                : 'bg-gradient-to-tr from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30'
            }`}>
              <Factory className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-base sm:text-lg font-bold tracking-tight ${
                  theme === 'light' 
                    ? 'text-stone-900' 
                    : 'bg-gradient-to-r from-white via-slate-200 to-cyan-300 bg-clip-text text-transparent'
                }`}>
                  {isAr ? 'منظومة إنتاج وتحليل مواسير البلاستيك' : 'PVC Pipe Production Suite'}
                </h1>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  theme === 'light' 
                    ? 'bg-teal-50 text-teal-800 border border-teal-300' 
                    : 'bg-cyan-950 text-cyan-400 border border-cyan-800/60'
                }`}>
                  PROD v2.0
                </span>
              </div>
              <p className={`text-[11px] hidden sm:block ${theme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                {isAr 
                  ? 'منصة موحدة لتنظيف البيانات، تخطيط الخطوط، ومتابعة الوردية وسجل OEE'
                  : 'Unified Intelligence, Planning, SOP-EXT-PVC-01 Compliance & OEE Logging'}
              </p>
            </div>
          </div>

          {/* Module Switcher Tabs */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button
              onClick={() => setCurrentModule('data-analysis')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                currentModule === 'data-analysis'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{isAr ? 'تحليل البيانات والتخطيط' : 'Data Intelligence'}</span>
            </button>
            <button
              onClick={() => setCurrentModule('daily-evaluation')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                currentModule === 'daily-evaluation'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>{isAr ? 'سجل الوردية والتقييم اليومي' : 'Daily OEE Evaluation'}</span>
            </button>
          </div>

          {/* Global Controls (Theme, Language, Templates) */}
          <div className="flex items-center gap-2">
            {/* Download Templates Menu */}
            <div className="relative group">
              <button
                className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  theme === 'light' 
                    ? 'bg-white text-stone-700 border border-stone-300 shadow-xs hover:bg-stone-50' 
                    : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                }`}
                title="Download Factory Excel Templates"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isAr ? 'القوالب' : 'Templates'}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              <div className="absolute right-0 rtl:left-0 rtl:right-auto mt-1 w-52 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-1.5 hidden group-hover:block z-50">
                <a
                  href="./Master_Upload.xlsx"
                  download="Master_Upload.xlsx"
                  className="block px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-md transition"
                >
                  📄 Master Upload Workbook
                </a>
                <a
                  href="./AlManar_2.xlsx"
                  download="AlManar_2.xlsx"
                  className="block px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-md transition"
                >
                  📊 Factory Historical Log (AlManar)
                </a>
                <a
                  href="./PVC_Pipe_Daily_Follow.xlsx"
                  download="PVC_Pipe_Daily_Follow.xlsx"
                  className="block px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-md transition"
                >
                  📋 24-Hour Follow Sheet SOP
                </a>
              </div>
            </div>

            {/* Language Toggle */}
            <button
              onClick={() => setLang(isAr ? 'en' : 'ar')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                theme === 'light' 
                  ? 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50' 
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
              }`}
              title={isAr ? 'Switch to English' : 'التحويل للعربية'}
            >
              <Languages className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">{isAr ? 'English' : 'عربي'}</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                theme === 'light' 
                  ? 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50' 
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
              }`}
              title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-indigo-500" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
            </button>
          </div>
        </div>

        {/* Lower Tier: Sub-navigation & Module Actions */}
        {currentModule === 'data-analysis' && (
          <div className="flex items-center justify-between py-2 text-xs overflow-x-auto">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab('master')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  activeTab === 'master'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                {isAr ? 'جدول التشغيل الموحد' : 'Master Extrusion Runs'}
              </button>
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                {isAr ? 'لوحة المؤشرات والرسوم' : 'Analytics & Charts'}
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                {isAr ? 'جدول تدقيق وتنظيف البيانات' : 'Cleaning & Audit Table'}
              </button>
              <button
                onClick={() => setActiveTab('planning')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                  activeTab === 'planning'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                {isAr ? 'تخطيط الخطوط وكتالوج المقاسات' : 'Production Planning'}
              </button>
              <button
                onClick={() => setActiveTab('verification')}
                className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                  activeTab === 'verification'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{isAr ? 'مركز الفحص والمطابقة' : 'Verification Center'}</span>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenManualEntry}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md font-semibold cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isAr ? 'إضافة سطر' : 'Add Row'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
