import React from 'react';
import { 
  Menu, 
  Save, 
  Loader2, 
  PlusCircle, 
  Database, 
  BarChart3, 
  ClipboardList, 
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  HardDrive,
  ShieldCheck
} from 'lucide-react';

export default function Header({
  currentModule,
  activeTab,
  lang,
  theme,
  user,
  onOpenAdminModal,
  isCollapsed,
  setIsCollapsed,
  setIsMobileOpen,
  onGlobalSave,
  isSaving,
  onOpenManualEntry,
  recordCount = 0,
  historicalCount = 0,
  currentSheetName = ''
}) {
  const isAr = lang === 'ar';
  const isLight = theme === 'light';

  // Compute active module title
  const getModuleTitle = () => {
    switch (currentModule) {
      case 'data-analysis':
        return isAr ? 'تحليل البيانات والتخطيط' : 'Data Intelligence';
      case 'daily-evaluation':
        return isAr ? 'سجل الوردية والتقييم اليومي' : 'Daily OEE Evaluation';
      case 'data-hub':
        return isAr ? 'مركز تبادل البيانات' : 'Data Exchange Hub';
      case 'catalog-harmonizer':
        return isAr ? '\u0645\u062E\u062A\u0628\u0631 \u062A\u0648\u062D\u064A\u062F \u062F\u0644\u064A\u0644 \u0627\u0644\u0623\u0635\u0646\u0627\u0641' : 'Catalog Harmonizer Lab';
      case 'engineering-docs':
        return isAr ? '\u062A\u0648\u062B\u064A\u0642 \u0627\u0644\u062D\u0648\u0643\u0645\u0629 \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629' : 'Engineering Documentation Hub';
      default:
        return 'PVC Suite';
    }
  };

  // Compute active tab title
  const getTabTitle = () => {
    if (currentModule !== 'data-analysis') return null;
    switch (activeTab) {
      case 'master':
        return isAr ? 'جدول التشغيل الموحد' : 'Master Extrusion Runs';
      case 'dashboard':
        return isAr ? 'لوحة المؤشرات والرسوم' : 'Analytics & Charts';
      case 'audit':
        return isAr ? 'جدول تدقيق وتنظيف البيانات' : 'Cleaning & Audit Table';
      case 'planning':
        return isAr ? 'تخطيط الخطوط والمقاسات' : 'Production Planning';
      case 'verification':
        return isAr ? 'مركز الفحص والمطابقة' : 'Verification Center';
      default:
        return null;
    }
  };

  const moduleTitle = getModuleTitle();
  const tabTitle = getTabTitle();

  return (
    <header className={`sticky top-0 z-30 h-14 backdrop-blur-xl border-b transition-colors select-none no-print ${
      isLight 
        ? 'bg-white/95 border-slate-200/90 text-slate-900 shadow-2xs' 
        : 'bg-[#0b1322]/95 border-slate-800/80 text-white shadow-md'
    }`}>
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        
        {/* Left: Mobile Menu + Breadcrumbs + Status */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className={`p-1.5 rounded-lg lg:hidden transition cursor-pointer text-slate-500 hover:text-emerald-500 ${
              isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
            }`}
            title="Open Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop Toggle Button when sidebar is collapsed */}
          {isCollapsed && (
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className={`hidden lg:flex p-1.5 rounded-lg transition cursor-pointer text-slate-400 hover:text-emerald-500 ${
                isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
              }`}
              title={isAr ? 'توسيع القائمة' : 'Expand Sidebar'}
            >
              {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}

          {/* Breadcrumb Hierarchy */}
          <div className="flex items-center gap-2 text-xs font-semibold overflow-hidden">
            <span className="text-slate-400 dark:text-slate-500 truncate">
              {moduleTitle}
            </span>

            {tabTitle && (
              <>
                <span className="text-slate-300 dark:text-slate-600 select-none">/</span>
                <span className="brand-gradient-text font-bold truncate">
                  {tabTitle}
                </span>
              </>
            )}
          </div>

          {/* Active Data Source Badge */}
          {currentSheetName && (
            <div className={`hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium border truncate ${
              isLight 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
            }`}>
              <HardDrive className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="truncate">{currentSheetName}</span>
            </div>
          )}
        </div>

        {/* Right: Contextual & Global Actions */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Add Row (only visible when in Master Extrusion Runs) */}
          {currentModule === 'data-analysis' && activeTab === 'master' && onOpenManualEntry && (
            <button
              type="button"
              onClick={onOpenManualEntry}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200/90 text-slate-800 border border-slate-200' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
              title="Add Manual Record Row"
            >
              <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">{isAr ? 'إضافة سطر' : 'Add Row'}</span>
            </button>
          )}

          {/* Admin User Management Button */}
          {(user?.role === 'super_admin' || user?.role === 'admin' || user?.username === 'admin') && onOpenAdminModal && (
            <button
              type="button"
              onClick={onOpenAdminModal}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border shadow-xs ${
                isLight
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-slate-800 text-amber-300 border-amber-500/40 hover:bg-slate-700'
              }`}
              title={isAr ? 'إدارة المستخدمين والباقات (لوحة المشرف)' : 'User & Tier Management (Admin)'}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">{isAr ? 'إدارة المستخدمين' : 'User Management'}</span>
            </button>
          )}

          {/* Global Save Button */}
          {onGlobalSave && (
            <button
              type="button"
              onClick={onGlobalSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide brand-gradient hover:opacity-95 text-white shadow-md shadow-emerald-600/20 ring-1 ring-white/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transform active:scale-95"
              title="Save All Changes (Local & Remote Sync)"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 text-white" />
                  <span>{isAr ? 'حفظ التغييرات' : 'Save'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
