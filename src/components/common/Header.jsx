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
  ShieldCheck,
  Home
} from 'lucide-react';

export default function Header({
  currentModule,
  activeTab,
  lang,
  theme,
  user,
  onOpenAdminModal,
  onNavigateHome,
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
      case 'launchpad':
        return isAr ? '\u063a\u0631\u0641\u0629 \u0627\u0644\u0642\u064a\u0627\u062f\u0629 \u0648\u0627\u0644\u062a\u062d\u0643\u0645' : 'Executive Command Center';
      case 'data-analysis':
        return isAr ? '\u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0648\u0627\u0644\u062a\u062e\u0637\u064a\u0637' : 'Data Intelligence';
      case 'daily-evaluation':
        return isAr ? '\u0633\u062c\u0644 \u0627\u0644\u0648\u0631\u062f\u064a\u0629 \u0648\u0627\u0644\u062a\u0642\u064a\u064a\u0645 \u0627\u0644\u064a\u0648\u0645\u064a' : 'Daily OEE Evaluation';
      case 'data-hub':
        return isAr ? '\u0645\u0631\u0643\u0632 \u062a\u0628\u0627\u062f\u0644 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a' : 'Data Exchange Hub';
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
        return isAr ? '\u062c\u062f\u0648\u0644 \u0627\u0644\u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u0645\u0648\u062d\u062f' : 'Master Extrusion Runs';
      case 'dashboard':
        return isAr ? '\u0644\u0648\u062d\u0629 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062a \u0648\u0627\u0644\u0631\u0633\u0648\u0645' : 'Analytics & Charts';
      case 'audit':
        return isAr ? '\u062c\u062f\u0648\u0644 \u062a\u062f\u0642\u064a\u0642 \u0648\u062a\u0646\u0638\u064a\u0641 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a' : 'Cleaning & Audit Table';
      case 'planning':
        return isAr ? '\u062a\u062e\u0637\u064a\u0637 \u0627\u0644\u062e\u0637\u0648\u0637 \u0648\u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062a' : 'Production Planning';
      case 'verification':
        return isAr ? '\u0645\u0631\u0643\u0632 \u0627\u0644\u0641\u062d\u0635 \u0648\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629' : 'Verification Center';
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
              title={isAr ? '\u062a\u0648\u0633\u064a\u0639 \u0627\u0644\u0642\u0627\u0626\u0645\u0629' : 'Expand Sidebar'}
            >
              {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}

          {/* Breadcrumb Hierarchy */}
          <div className="flex items-center gap-2 text-xs font-semibold overflow-hidden">
            {currentModule !== 'launchpad' && onNavigateHome && (
              <>
                <button
                  type="button"
                  onClick={onNavigateHome}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isLight 
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-emerald-600' 
                      : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-emerald-400'
                  }`}
                  title={isAr ? '\u0627\u0644\u0639\u0648\u062F\u0629 \u0625\u0644\u0649 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629' : 'Return to Executive Command Center'}
                >
                  <Home className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{isAr ? '\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629' : 'Home'}</span>
                </button>
                <span className="text-slate-300 dark:text-slate-600 select-none">/</span>
              </>
            )}

            <span className={`${currentModule === 'launchpad' ? 'brand-gradient-text font-black text-sm' : 'text-slate-400 dark:text-slate-500'} truncate`}>
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
              <span className="hidden sm:inline">{isAr ? '\u0625\u0636\u0627\u0641\u0629 \u0633\u0637\u0631' : 'Add Row'}</span>
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
              title={isAr ? '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646 \u0648\u0627\u0644\u0628\u0627\u0642\u0627\u062a (\u0644\u0648\u062d\u0629 \u0627\u0644\u0645\u0634\u0631\u0641)' : 'User & Tier Management (Admin)'}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">{isAr ? '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646' : 'User Management'}</span>
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
                  <span>{isAr ? '\u062d\u0641\u0638 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a' : 'Save'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
