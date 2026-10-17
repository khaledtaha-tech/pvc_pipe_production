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
  ChevronDown,
  User,
  LogOut,
  Save,
  Loader2,
  Database,
  Sliders
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
  user = null,
  onLogout,
  onOpenAdminModal,
  onGlobalSave,
  isSaving = false,
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
  onOpenVerification,
  onOpenBlankSopPrint,
  onOpenMachineSettings,
  onOpenReconciliationMatrix
}) {
  const isAr = lang === 'ar';
  const isLight = theme === 'light';

  return (
    <header className={`sticky top-0 z-50 backdrop-blur-xl transition-all duration-200 no-print ${
      isLight 
        ? 'bg-white/95 border-b border-slate-200/90 text-slate-900 shadow-sm' 
        : 'bg-[#0f172a]/95 border-b border-slate-800/80 text-white shadow-2xl'
    }`}>
      <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-4 lg:px-6">
        {/* Top Tier: Brand, Global Module Switcher, System Actions */}
        <div className="flex items-center justify-between h-16 border-b border-slate-200/70 dark:border-slate-800/60">
          
          {/* Brand & Suite Identity */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center brand-gradient text-white shadow-md shadow-emerald-500/25 ring-1 ring-white/20 shrink-0">
              <Factory className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight brand-gradient-text">
                  {isAr ? 'منظومة إنتاج وتحليل مواسير البلاستيك' : 'PVC Pipe Production Suite'}
                </h1>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isLight 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-emerald-950/80 text-cyan-300 border-emerald-800/60 shadow-xs'
                }`}>
                  PROD v2.0
                </span>
              </div>
              <p className={`text-[11px] font-medium hidden sm:block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {isAr 
                  ? 'منصة موحدة لتنظيف البيانات، تخطيط الخطوط، ومتابعة الوردية وسجل OEE'
                  : 'Unified Intelligence, Planning, SOP-EXT-PVC-01 Compliance & OEE Logging'}
              </p>
            </div>
          </div>

          {/* Module Switcher Tabs: Modern Segmented Control */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border backdrop-blur-md ${
            isLight ? 'bg-slate-100/90 border-slate-200 shadow-inner' : 'bg-slate-800/80 border-slate-700/60 shadow-inner'
          }`}>
            <button
              type="button"
              onClick={() => setCurrentModule('data-analysis')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentModule === 'data-analysis'
                  ? 'brand-gradient text-white shadow-md shadow-emerald-600/30 ring-1 ring-white/25'
                  : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{isAr ? 'تحليل البيانات والتخطيط' : 'Data Intelligence'}</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentModule('daily-evaluation')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentModule === 'daily-evaluation'
                  ? 'brand-gradient text-white shadow-md shadow-emerald-600/30 ring-1 ring-white/25'
                  : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>{isAr ? 'سجل الوردية والتقييم اليومي' : 'Daily OEE Evaluation'}</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentModule('data-hub')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentModule === 'data-hub'
                  ? 'brand-gradient text-white shadow-md shadow-emerald-600/30 ring-1 ring-white/25'
                  : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Import / Export Hub</span>
            </button>
          </div>

          {/* Global Controls (Save, Theme, Language, Templates) */}
          <div className="flex items-center gap-2">
            {/* Global Save Action */}
            {onGlobalSave && (
              <button
                type="button"
                onClick={onGlobalSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/20 ring-1 ring-emerald-400/30 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transform active:scale-95"
                title="Save All Changes (Local & Remote)"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-white" />
                    <span>Save</span>
                  </>
                )}
              </button>
            )}

            {/* Download Templates Menu */}
            <div className="relative group">
              <button
                className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer shadow-xs ${
                  isLight 
                    ? 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200' 
                    : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700/80'
                }`}
                title="Download Factory Excel Templates"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>{isAr ? 'القوالب' : 'Templates'}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              <div className="absolute right-0 rtl:left-0 rtl:right-auto mt-1 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 hidden group-hover:block z-50">
                <a
                  href="./Master_Upload.xlsx"
                  download="Master_Upload.xlsx"
                  className="block px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg transition"
                >
                  📄 Master Upload Workbook
                </a>
                <a
                  href="./AlManar_2.xlsx"
                  download="AlManar_2.xlsx"
                  className="block px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg transition"
                >
                  📊 Factory Historical Log (AlManar)
                </a>
                <a
                  href="./PVC_Pipe_Daily_Follow.xlsx"
                  download="PVC_Pipe_Daily_Follow.xlsx"
                  className="block px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg transition"
                >
                  📋 24-Hour Follow Sheet SOP
                </a>
              </div>
            </div>

            {/* Machine Settings Action */}
            {onOpenMachineSettings && currentModule !== 'daily-evaluation' && (
              <button
                type="button"
                onClick={onOpenMachineSettings}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer shadow-xs ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700/80'
                }`}
                title="Configure Machine Capacities (kg/h)"
              >
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden md:inline">Machine Settings</span>
              </button>
            )}

            {/* Language Toggle */}
            <button
              onClick={() => setLang(isAr ? 'en' : 'ar')}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-xs ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200' 
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700/80'
              }`}
              title={isAr ? 'Switch to English' : 'التحويل للعربية'}
            >
              <Languages className="w-4 h-4 text-cyan-500" />
              <span className="hidden sm:inline font-mono">{isAr ? 'English' : 'عربي'}</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-1.5 rounded-lg transition cursor-pointer shadow-xs ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200' 
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700/80'
              }`}
              title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-teal-500" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
            </button>

            {/* Admin User Management Button */}
            {user?.role === 'admin' && onOpenAdminModal && (
              <button
                type="button"
                onClick={onOpenAdminModal}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  isLight
                    ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 shadow-xs'
                    : 'bg-slate-800 text-amber-300 border border-slate-700 hover:bg-slate-700 shadow-sm'
                }`}
                title="User Management (Admin)"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">User Management</span>
              </button>
            )}

            {/* User Profile & Logout */}
            {user && (
              <div className="flex items-center gap-2 pl-2 rtl:pl-0 rtl:pr-2 border-l rtl:border-l-0 rtl:border-r border-slate-200 dark:border-slate-800">
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                    isLight
                      ? 'bg-slate-50 text-slate-800 border-slate-200 shadow-xs'
                      : 'bg-slate-800/90 text-slate-200 border-slate-700'
                  }`}
                  title={`Logged in as ${user.username} (${user.role || 'operator'})`}
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold max-w-[100px] truncate">{user.username}</span>
                  <span
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${
                      user.role === 'admin'
                        ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {user.role || 'op'}
                  </span>
                </div>

                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className={`p-1.5 rounded-lg transition cursor-pointer text-slate-400 hover:text-rose-500 ${
                      isLight
                        ? 'hover:bg-rose-50 border border-slate-200'
                        : 'hover:bg-rose-950/40 border border-slate-800'
                    }`}
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lower Tier: Sub-navigation & Module Actions */}
        {currentModule === 'data-analysis' && (
          <div className="flex items-center justify-between py-2 text-xs overflow-x-auto">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('master')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeTab === 'master'
                    ? 'brand-gradient text-white shadow-sm ring-1 ring-white/20'
                    : isLight
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-700/60'
                }`}
              >
                <span>{isAr ? 'جدول التشغيل الموحد' : 'Master Extrusion Runs'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'brand-gradient text-white shadow-sm ring-1 ring-white/20'
                    : isLight
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-700/60'
                }`}
              >
                <span>{isAr ? 'لوحة المؤشرات والرسوم' : 'Analytics & Charts'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeTab === 'audit'
                    ? 'brand-gradient text-white shadow-sm ring-1 ring-white/20'
                    : isLight
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-700/60'
                }`}
              >
                <span>{isAr ? 'جدول تدقيق وتنظيف البيانات' : 'Cleaning & Audit Table'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('planning')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  activeTab === 'planning'
                    ? 'brand-gradient text-white shadow-sm ring-1 ring-white/20'
                    : isLight
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-700/60'
                }`}
              >
                <span>{isAr ? 'تخطيط الخطوط وكتالوج المقاسات' : 'Production Planning'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('verification')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'verification'
                    ? 'brand-gradient text-white shadow-sm ring-1 ring-white/20'
                    : isLight
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                      : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-700/60'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{isAr ? 'مركز الفحص والمطابقة' : 'Verification Center'}</span>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenManualEntry}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs ${
                  isLight 
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isAr ? 'إضافة سطر' : 'Add Row'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Lower Tier: Daily Evaluation Center Banner & Navigation */}
        {currentModule === 'daily-evaluation' && (
          <div className="flex items-center justify-between py-2 text-xs overflow-x-auto">
            <div className="flex items-center gap-2">
              <span className="brand-gradient-text font-black flex items-center gap-1.5 text-sm">
                <ClipboardList className="w-4 h-4 text-emerald-500" />
                <span>Daily OEE Evaluation</span>
              </span>
              <span className={`text-[11px] font-medium hidden sm:inline ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                | 24h Extrusion Monitoring, Shift Run Reconciliation &amp; OEE Auditing (SOP-EXT-PVC-01)
              </span>
            </div>
          </div>
        )}

        {/* Lower Tier: Data Hub Center Banner & Quick Print */}
        {currentModule === 'data-hub' && (
          <div className="flex items-center justify-between py-2 text-xs overflow-x-auto">
            <div className="flex items-center gap-2">
              <span className="brand-gradient-text font-black flex items-center gap-1.5 text-sm">
                <Database className="w-4 h-4 text-cyan-500" />
                <span>Data Hub &amp; File Operations</span>
              </span>
              <span className={`text-[11px] font-medium hidden sm:inline ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                | Standard Excel Templates, Shift SOP Printing, Multi-Line Exports &amp; Backup
              </span>
            </div>

            {onOpenBlankSopPrint && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenBlankSopPrint}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold cursor-pointer text-xs transition shadow-xs ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Morning SOP (DOC-Ext.-03)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
