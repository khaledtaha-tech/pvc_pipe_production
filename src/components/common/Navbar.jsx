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

  return (
    <header className={`sticky top-0 z-50 backdrop-blur-md transition-colors no-print ${
      theme === 'light' 
        ? 'bg-[#ece6db]/95 border-b border-[#d8d0c2] text-stone-900 shadow-xs' 
        : 'bg-slate-900/90 border-b border-slate-800 text-white shadow-xl'
    }`}>
      <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-4 lg:px-6">
        {/* Top Tier: Brand, Global Module Switcher, System Actions */}
        <div className="flex items-center justify-between h-16 border-b border-slate-800/40">
          
          {/* Brand & Suite Identity */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              theme === 'light' 
                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/30' 
                : 'bg-blue-600 text-white shadow-md ring-1 ring-blue-400/30'
            }`}>
              <Factory className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-base sm:text-lg font-bold tracking-tight ${
                  theme === 'light' 
                    ? 'text-stone-900' 
                    : 'bg-gradient-to-r from-white via-slate-200 to-slate-100 bg-clip-text text-transparent'
                }`}>
                  {isAr ? 'منظومة إنتاج وتحليل مواسير البلاستيك' : 'PVC Pipe Production Suite'}
                </h1>
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  theme === 'light' 
                    ? 'bg-slate-100 text-slate-700 border border-slate-300' 
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
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
          <div className={`flex items-center gap-1 p-1 rounded-xl border ${theme === 'light' ? 'bg-slate-100/90 border-slate-300' : 'bg-slate-800/80 border-slate-700/60'}`}>
            <button
              onClick={() => setCurrentModule('data-analysis')}
              className={`top-nav-tab flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                currentModule === 'data-analysis'
                  ? 'top-nav-tab-active bg-blue-600 text-white shadow-sm'
                  : `top-nav-tab-inactive ${theme === 'light' ? 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`
              }`}
              style={currentModule === 'data-analysis' ? { backgroundColor: '#2563eb', color: '#ffffff' } : {}}
            >
              <BarChart3 className={`w-3.5 h-3.5 ${currentModule === 'data-analysis' ? 'text-white' : theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`} style={currentModule === 'data-analysis' ? { stroke: '#ffffff', color: '#ffffff' } : {}} />
              <span style={currentModule === 'data-analysis' ? { color: '#ffffff' } : {}}>{isAr ? '\u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0648\u0627\u0644\u062a\u062e\u0637\u064a\u0637' : 'Data Intelligence'}</span>
            </button>
            <button
              onClick={() => setCurrentModule('daily-evaluation')}
              className={`top-nav-tab flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                currentModule === 'daily-evaluation'
                  ? 'top-nav-tab-active bg-blue-600 text-white shadow-sm'
                  : `top-nav-tab-inactive ${theme === 'light' ? 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`
              }`}
              style={currentModule === 'daily-evaluation' ? { backgroundColor: '#2563eb', color: '#ffffff' } : {}}
            >
              <ClipboardList className={`w-3.5 h-3.5 ${currentModule === 'daily-evaluation' ? 'text-white' : theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`} style={currentModule === 'daily-evaluation' ? { stroke: '#ffffff', color: '#ffffff' } : {}} />
              <span style={currentModule === 'daily-evaluation' ? { color: '#ffffff' } : {}}>{isAr ? '\u0633\u062c\u0644 \u0627\u0644\u0648\u0631\u062f\u064a\u0629 \u0648\u0627\u0644\u062a\u0642\u064a\u064a\u0645 \u0627\u0644\u064a\u0648\u0645\u064a' : 'Daily OEE Evaluation'}</span>
            </button>
            <button
              onClick={() => setCurrentModule('data-hub')}
              className={`top-nav-tab flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                currentModule === 'data-hub'
                  ? 'top-nav-tab-active bg-blue-600 text-white shadow-sm'
                  : `top-nav-tab-inactive ${theme === 'light' ? 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`
              }`}
              style={currentModule === 'data-hub' ? { backgroundColor: '#2563eb', color: '#ffffff' } : {}}
            >
              <Database className={`w-3.5 h-3.5 ${currentModule === 'data-hub' ? 'text-white' : theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`} style={currentModule === 'data-hub' ? { stroke: '#ffffff', color: '#ffffff' } : {}} />
              <span style={currentModule === 'data-hub' ? { color: '#ffffff' } : {}}>Import / Export Hub</span>
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
                className="btn-primary flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium tracking-wide bg-blue-600 hover:bg-blue-700 text-white shadow-sm border border-transparent transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                title="Save All Changes (Local & Remote)"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" style={{ stroke: '#ffffff', color: '#ffffff' }} />
                    <span style={{ color: '#ffffff' }}>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-white" style={{ stroke: '#ffffff', color: '#ffffff' }} />
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>Save</span>
                  </>
                )}
              </button>
            )}

            {/* Download Templates Menu */}
            <div className="relative group">
              <button
                className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer shadow-sm ${
                  theme === 'light' 
                    ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50' 
                    : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                }`}
                title="Download Factory Excel Templates"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
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

            {/* Machine Settings Action */}
            {onOpenMachineSettings && (
              <button
                type="button"
                onClick={onOpenMachineSettings}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer shadow-sm ${
                  theme === 'light'
                    ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
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
              className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer ${
                theme === 'light' 
                  ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50' 
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
              }`}
              title={isAr ? 'Switch to English' : 'التحويل للعربية'}
            >
              <Languages className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline">{isAr ? 'English' : 'عربي'}</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                theme === 'light' 
                  ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50' 
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
              }`}
              title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-slate-600" />
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
                  theme === 'light'
                    ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 shadow-xs'
                    : 'bg-slate-800 text-amber-300 border border-slate-700 hover:bg-slate-700 shadow-sm'
                }`}
                title="User Management (Admin)"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">User Management</span>
              </button>
            )}

            {/* User Profile & Logout */}
            {user && (
              <div className="flex items-center gap-2 pl-2 rtl:pl-0 rtl:pr-2 border-l rtl:border-l-0 rtl:border-r border-slate-700/60">
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                    theme === 'light'
                      ? 'bg-white text-slate-800 border-slate-300 shadow-xs'
                      : 'bg-slate-800/90 text-slate-200 border-slate-700'
                  }`}
                  title={`Logged in as ${user.username} (${user.role || 'operator'})`}
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold max-w-[100px] truncate">{user.username}</span>
                  <span
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${
                      user.role === 'admin'
                        ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {user.role || 'op'}
                  </span>
                </div>

                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className={`p-1.5 rounded-lg transition cursor-pointer text-slate-400 hover:text-rose-400 ${
                      theme === 'light'
                        ? 'hover:bg-rose-50 border border-stone-300'
                        : 'hover:bg-rose-950/40 border border-slate-700'
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
                onClick={() => setActiveTab('master')}
                className={`sub-tab px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'master'
                    ? 'sub-tab-active bg-blue-600 text-white shadow-sm'
                    : theme === 'light'
                      ? 'sub-tab-inactive bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                      : 'sub-tab-inactive text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                style={activeTab === 'master' ? { backgroundColor: '#2563eb', color: '#ffffff' } : {}}
              >
                <span style={activeTab === 'master' ? { color: '#ffffff' } : {}}>
                  {isAr ? '\u062c\u062f\u0648\u0644 \u0627\u0644\u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u0645\u0648\u062d\u062f' : 'Master Extrusion Runs'}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`sub-tab px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'sub-tab-active bg-blue-600 text-white shadow-sm'
                    : theme === 'light'
                      ? 'sub-tab-inactive bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                      : 'sub-tab-inactive text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                style={activeTab === 'dashboard' ? { backgroundColor: '#2563eb', color: '#ffffff' } : {}}
              >
                <span style={activeTab === 'dashboard' ? { color: '#ffffff' } : {}}>
                  {isAr ? '\u0644\u0648\u062d\u0629 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062a \u0648\u0627\u0644\u0631\u0633\u0648\u0645' : 'Analytics & Charts'}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`sub-tab px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'audit'
                    ? 'sub-tab-active bg-blue-600 text-white shadow-sm'
                    : theme === 'light'
                      ? 'sub-tab-inactive bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                      : 'sub-tab-inactive text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                style={activeTab === 'audit' ? { backgroundColor: '#2563eb', color: '#ffffff' } : {}}
              >
                <span style={activeTab === 'audit' ? { color: '#ffffff' } : {}}>
                  {isAr ? '\u062c\u062f\u0648\u0644 \u062a\u062f\u0642\u064a\u0642 \u0648\u062a\u0646\u0638\u064a\u0641 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a' : 'Cleaning & Audit Table'}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('planning')}
                className={`sub-tab px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'planning'
                    ? 'sub-tab-active bg-blue-600 text-white shadow-sm'
                    : theme === 'light'
                      ? 'sub-tab-inactive bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                      : 'sub-tab-inactive text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                style={activeTab === 'planning' ? { backgroundColor: '#2563eb', color: '#ffffff' } : {}}
              >
                <span style={activeTab === 'planning' ? { color: '#ffffff' } : {}}>
                  {isAr ? '\u062a\u062e\u0637\u064a\u0637 \u0627\u0644\u062e\u0637\u0648\u0637 \u0648\u0643\u062a\u0627\u0644\u0648\u062c \u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062a' : 'Production Planning'}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('verification')}
                className={`sub-tab px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
                  activeTab === 'verification'
                    ? 'sub-tab-active bg-blue-600 text-white shadow-sm'
                    : theme === 'light'
                      ? 'sub-tab-inactive bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                      : 'sub-tab-inactive text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                style={activeTab === 'verification' ? { backgroundColor: '#2563eb', color: '#ffffff' } : {}}
              >
                <ShieldCheck className={`w-3.5 h-3.5 ${activeTab === 'verification' ? 'text-white' : ''}`} style={activeTab === 'verification' ? { stroke: '#ffffff', color: '#ffffff' } : {}} />
                <span style={activeTab === 'verification' ? { color: '#ffffff' } : {}}>{isAr ? '\u0645\u0631\u0643\u0632 \u0627\u0644\u0641\u062d\u0635 \u0648\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629' : 'Verification Center'}</span>
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenManualEntry}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium cursor-pointer shadow-sm transition"
              >
                <PlusCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>{isAr ? 'إضافة سطر' : 'Add Row'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Lower Tier: Daily Evaluation Center Banner & Navigation */}
        {currentModule === 'daily-evaluation' && (
          <div className="flex items-center justify-between py-2 text-xs overflow-x-auto">
            <div className="flex items-center gap-2">
              <span className="text-blue-400 font-bold flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Daily OEE Evaluation</span>
              </span>
              <span className="text-slate-400 text-[11px] hidden sm:inline">
                | 24h Extrusion Monitoring, Shift Run Reconciliation &amp; OEE Auditing
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onOpenReconciliationMatrix && (
                <button
                  type="button"
                  onClick={onOpenReconciliationMatrix}
                  className="btn-primary flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium cursor-pointer text-xs transition shadow-sm border border-transparent"
                  style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                  title="Open Master Daily Production &amp; Lost Hours Reconciliation Matrix (All Lines Overview)"
                >
                  <Table className="w-3.5 h-3.5 text-white" style={{ stroke: '#ffffff', color: '#ffffff' }} />
                  <span style={{ color: '#ffffff', fontWeight: 600 }}>Reconciliation Matrix (All Lines)</span>
                </button>
              )}

              {onOpenBlankSopPrint && (
                <button
                  type="button"
                  onClick={onOpenBlankSopPrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium cursor-pointer text-xs transition shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                  <span>Morning SOP (DOC-Ext.-03)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Lower Tier: Data Hub Center Banner & Quick Print */}
        {currentModule === 'data-hub' && (
          <div className="flex items-center justify-between py-2 text-xs overflow-x-auto">
            <div className="flex items-center gap-2">
              <span className="text-slate-200 font-bold flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-slate-400" />
                <span>Data Hub &amp; File Operations</span>
              </span>
              <span className="text-slate-400 text-[11px] hidden sm:inline">
                | Standard Excel Templates, Shift SOP Printing, Multi-Line Exports &amp; Backup
              </span>
            </div>

            {onOpenBlankSopPrint && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenBlankSopPrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium cursor-pointer text-xs transition shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
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
