import React, { useState } from 'react';
import { 
  Factory,
  BookOpen, 
  BarChart3, 
  ClipboardList, 
  Database, 
  Table, 
  ClipboardCheck, 
  Calendar, 
  ShieldCheck, 
  FileSpreadsheet, 
  Sliders, 
  Download, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft, 
  Languages, 
  Sun, 
  Moon, 
  User, 
  LogOut, 
  X,
  PlusCircle,
  Layers,
  Sparkles
} from 'lucide-react';

export default function Sidebar({
  currentModule,
  setCurrentModule,
  activeTab,
  setActiveTab,
  lang,
  setLang,
  theme,
  toggleTheme,
  user,
  onLogout,
  onOpenAdminModal,
  onOpenMachineSettings,
  onOpenBlankSopPrint,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
  recordCount = 0,
  historicalCount = 0,
  masterCount = 0
}) {
  const isAr = lang === 'ar';
  const isLight = theme === 'light';
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);

  // Sub-tabs for Data Intelligence
  const dataSubTabs = [
    { id: 'master', labelEn: 'Master Runs Table', labelAr: 'جدول التشغيل الموحد', icon: Table, count: masterCount },
    { id: 'dashboard', labelEn: 'Analytics & Charts', labelAr: 'لوحة المؤشرات والرسوم', icon: BarChart3 },
    { id: 'audit', labelEn: 'Cleaning & Audit Table', labelAr: 'جدول تدقيق وتنظيف البيانات', icon: ClipboardCheck },
    { id: 'planning', labelEn: 'Production Planning', labelAr: 'تخطيط الخطوط والمقاسات', icon: Calendar },
    { id: 'verification', labelEn: 'Verification Center', labelAr: 'مركز الفحص والمطابقة', icon: ShieldCheck }
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div 
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Main Sidebar Aside */}
      <aside
        className={`fixed top-0 bottom-0 z-50 flex flex-col transition-all duration-300 ease-in-out select-none
          ${isAr ? 'right-0 border-l' : 'left-0 border-r'}
          ${isLight ? 'bg-white border-slate-200/90 shadow-xl' : 'bg-[#0b1322] border-slate-800/80 shadow-2xl'}
          ${isMobileOpen ? 'translate-x-0' : (isAr ? 'translate-x-full lg:translate-x-0' : '-translate-x-full lg:translate-x-0')}
          ${isCollapsed ? 'w-20' : 'w-64'}
        `}
      >
        {/* Brand & Workspace Header */}
        <div className={`h-16 flex items-center px-4 border-b shrink-0 ${
          isLight ? 'border-slate-200/80' : 'border-slate-800/70'
        } ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center brand-gradient text-white shadow-md shadow-emerald-500/25 ring-1 ring-white/20 shrink-0">
              <Factory className="h-5 w-5 text-white" />
            </div>

            {!isCollapsed && (
              <div className="flex flex-col min-w-0 leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black tracking-tight brand-gradient-text truncate">
                    {isAr ? 'منظومة إنتاج المواسير' : 'PVC Extrusion Suite'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${
                    isLight 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-emerald-950/80 text-cyan-300 border-emerald-800/60'
                  }`}>
                    PROD v2.0
                  </span>
                  <span className={`text-[10px] font-medium truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                    SOP-EXT-01
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          {!isCollapsed && (
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className={`hidden lg:flex p-1.5 rounded-lg transition cursor-pointer text-slate-400 hover:text-emerald-500 ${
                isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
              }`}
              title={isAr ? 'تصغير القائمة الجانبية' : 'Collapse Sidebar'}
            >
              {isAr ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          )}

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className={`flex lg:hidden p-1.5 rounded-lg transition cursor-pointer text-slate-400 hover:text-rose-500 ${
              isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Expand Button for Collapsed Mode (Desktop) */}
        {isCollapsed && (
          <div className="hidden lg:flex justify-center py-2 border-b border-slate-200/60 dark:border-slate-800/60">
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className={`p-1.5 rounded-lg transition cursor-pointer text-slate-400 hover:text-emerald-500 ${
                isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
              }`}
              title={isAr ? 'توسيع القائمة الجانبية' : 'Expand Sidebar'}
            >
              {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        )}

        {/* Scrollable Navigation Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4">
          
          {/* Group 1: CORE MODULES */}
          <div className="space-y-1">
            {!isCollapsed && (
              <p className={`text-[10px] font-bold uppercase tracking-wider px-2 mb-2 ${
                isLight ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {isAr ? 'الوحدات الرئيسية' : 'Core Modules'}
              </p>
            )}

            {/* 1. Data Intelligence Module */}
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setCurrentModule('data-analysis');
                  if (isMobileOpen) setIsMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  currentModule === 'data-analysis'
                    ? 'brand-gradient text-white shadow-md shadow-emerald-600/25 ring-1 ring-white/20'
                    : isLight
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={isAr ? 'تحليل البيانات والتخطيط' : 'Data Intelligence & Sizing'}
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                {!isCollapsed && (
                  <span className="flex-1 text-left rtl:text-right truncate">
                    {isAr ? 'تحليل البيانات والتخطيط' : 'Data Intelligence'}
                  </span>
                )}
              </button>

              {/* Sub-tabs under Data Intelligence (Expanded view only) */}
              {!isCollapsed && currentModule === 'data-analysis' && (
                <div className={`mt-1 pl-4 rtl:pl-0 rtl:pr-4 space-y-0.5 border-l-2 rtl:border-l-0 rtl:border-r-2 ml-4 rtl:ml-0 rtl:mr-4 ${
                  isLight ? 'border-slate-200' : 'border-slate-800'
                }`}>
                  {dataSubTabs.map((sub) => {
                    const SubIcon = sub.icon;
                    const isActive = activeTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(sub.id);
                          if (isMobileOpen) setIsMobileOpen(false);
                        }}
                        className={`sidebar-sub-item w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-700/30 ring-1 ring-emerald-500' 
                            : isLight
                              ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                        style={isActive ? { backgroundColor: '#059669', color: '#ffffff' } : {}}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <SubIcon 
                            className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} 
                            style={isActive ? { color: '#ffffff', stroke: '#ffffff' } : {}} 
                          />
                          <span className="truncate" style={isActive ? { color: '#ffffff' } : {}}>
                            {isAr ? sub.labelAr : sub.labelEn}
                          </span>
                        </div>
                        {sub.count > 0 && (
                          <span 
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                              isActive
                                ? 'bg-white/20 text-white font-bold'
                                : isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-400'
                            }`}
                            style={isActive ? { color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.25)' } : {}}
                          >
                            {sub.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Daily OEE Evaluation Module */}
            <button
              type="button"
              onClick={() => {
                setCurrentModule('daily-evaluation');
                if (isMobileOpen) setIsMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentModule === 'daily-evaluation'
                  ? 'brand-gradient text-white shadow-md shadow-emerald-600/25 ring-1 ring-white/20'
                  : isLight
                    ? 'text-slate-700 hover:bg-slate-100'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isAr ? 'سجل الوردية والتقييم اليومي' : 'Daily OEE Evaluation'}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              {!isCollapsed && (
                <div className="flex-1 text-left rtl:text-right truncate">
                  <div className="truncate">{isAr ? 'سجل الوردية و OEE' : 'Daily OEE Evaluation'}</div>
                  <div className={`text-[10px] font-normal truncate ${currentModule === 'daily-evaluation' ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {isAr ? 'متابعة الخطوط والورديات' : '24h Shift Reconciliation'}
                  </div>
                </div>
              )}
            </button>

            {/* 4. Engineering Governance & Sizing Hub */}
            <button
              type="button"
              onClick={() => {
                setCurrentModule('engineering-docs');
                if (isMobileOpen) setIsMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentModule === 'engineering-docs'
                  ? 'brand-gradient text-white shadow-md shadow-emerald-600/25 ring-1 ring-white/20'
                  : isLight
                    ? 'text-slate-700 hover:bg-slate-100'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isAr ? '\u062A\u0648\u062B\u064A\u0642 \u0627\u0644\u062D\u0648\u0643\u0645\u0629 \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629' : 'Engineering Governance Hub'}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              {!isCollapsed && (
                <div className="flex-1 text-left rtl:text-right truncate">
                  <div className="truncate">{isAr ? '\u062A\u0648\u062B\u064A\u0642 \u0627\u0644\u062D\u0648\u0643\u0645\u0629 \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629' : 'Engineering Hub'}</div>
                  <div className={`text-[10px] font-normal truncate ${currentModule === 'engineering-docs' ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {isAr ? '\u062F\u0644\u064A\u0644 \u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062A \u0648\u0627\u0644\u0623\u0648\u0632\u0627\u0646' : 'Governance & Sizing Doc'}
                  </div>
                </div>
              )}
            </button>

            {/* 3. Import / Export Hub Module */}
            <button
              type="button"
              onClick={() => {
                setCurrentModule('data-hub');
                if (isMobileOpen) setIsMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentModule === 'data-hub'
                  ? 'brand-gradient text-white shadow-md shadow-emerald-600/25 ring-1 ring-white/20'
                  : isLight
                    ? 'text-slate-700 hover:bg-slate-100'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isAr ? 'مركز تبادل البيانات' : 'Import / Export Hub'}
            >
              <Database className="w-4 h-4 shrink-0" />
              {!isCollapsed && (
                <div className="flex-1 text-left rtl:text-right truncate">
                  <div className="truncate">{isAr ? 'مركز تبادل البيانات' : 'Data Exchange Hub'}</div>
                  <div className={`text-[10px] font-normal truncate ${currentModule === 'data-hub' ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {isAr ? 'تحميل وتصدير الملفات' : 'File Ingestion & Sync'}
                  </div>
                </div>
              )}
            </button>
          </div>

          {/* Group 2: FACTORY UTILITIES & ACTIONS */}
          <div className="space-y-1 pt-2 border-t border-slate-200/70 dark:border-slate-800/60">
            {!isCollapsed && (
              <p className={`text-[10px] font-bold uppercase tracking-wider px-2 mb-2 ${
                isLight ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {isAr ? 'أدوات المصنع' : 'Factory Utilities'}
              </p>
            )}

            {/* Catalog Harmonizer Lab */}
            <button
              type="button"
              onClick={() => {
                setCurrentModule('catalog-harmonizer');
                if (isMobileOpen) setIsMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentModule === 'catalog-harmonizer'
                  ? 'brand-gradient text-white shadow-md shadow-emerald-600/25 ring-1 ring-white/20'
                  : isLight
                    ? 'text-slate-700 hover:bg-slate-100'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isAr ? '\u0645\u062E\u062A\u0628\u0631 \u062A\u0648\u062D\u064A\u062F \u062F\u0644\u064A\u0644 \u0627\u0644\u0623\u0635\u0646\u0627\u0641' : 'Catalog Harmonizer Lab'}
            >
              <Sliders className="w-4 h-4 text-amber-500 shrink-0" />
              {!isCollapsed && (
                <div className="flex-1 text-left rtl:text-right truncate">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{isAr ? '\u0645\u062E\u062A\u0628\u0631 \u062A\u0648\u062D\u064A\u062F \u0627\u0644\u0623\u0635\u0646\u0627\u0641' : 'Catalog Harmonizer'}</span>
                    <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/30 shrink-0">
                      STAGING
                    </span>
                  </div>
                  <div className={`text-[10px] font-normal truncate ${currentModule === 'catalog-harmonizer' ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {isAr ? '\u062A\u0648\u062D\u064A\u062F \u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0627\u062A' : 'Sandbox Standardization'}
                  </div>
                </div>
              )}
            </button>

            {/* Morning SOP Print Button */}
            {onOpenBlankSopPrint && (
              <button
                type="button"
                onClick={() => {
                  onOpenBlankSopPrint();
                  if (isMobileOpen) setIsMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                  isLight 
                    ? 'text-slate-700 hover:bg-slate-100' 
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title="Print Morning SOP (DOC-Ext.-03)"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                {!isCollapsed && <span className="truncate">{isAr ? 'طباعة نموذج الوردية' : 'Morning SOP Print'}</span>}
              </button>
            )}

            {/* Machine Settings Button */}
            {onOpenMachineSettings && (
              <button
                type="button"
                onClick={() => {
                  onOpenMachineSettings();
                  if (isMobileOpen) setIsMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                  isLight 
                    ? 'text-slate-700 hover:bg-slate-100' 
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title="Machine Capacities & Rules Settings"
              >
                <Sliders className="w-4 h-4 text-teal-500 shrink-0" />
                {!isCollapsed && <span className="truncate">{isAr ? 'إعدادات الماكينات' : 'Machine Settings'}</span>}
              </button>
            )}

            {/* Excel Templates Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                  isLight 
                    ? 'text-slate-700 hover:bg-slate-100' 
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                } ${isCollapsed ? 'justify-center px-0' : 'justify-between'}`}
                title="Download Factory Templates"
              >
                <div className="flex items-center gap-3 truncate">
                  <Download className="w-4 h-4 text-cyan-500 shrink-0" />
                  {!isCollapsed && <span className="truncate">{isAr ? 'نماذج الإكسيل' : 'Excel Templates'}</span>}
                </div>
                {!isCollapsed && (
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isTemplatesOpen ? 'rotate-180' : ''}`} />
                )}
              </button>

              {/* Templates Sub-Menu */}
              {isTemplatesOpen && !isCollapsed && (
                <div className={`mt-1 pl-4 rtl:pl-0 rtl:pr-4 space-y-1 text-[11px] ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                }`}>
                  <a
                    href="./Master_Upload.xlsx"
                    download="Master_Upload.xlsx"
                    className="block px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition truncate"
                  >
                    📄 Master Upload Workbook
                  </a>
                  <a
                    href="./AlManar_2.xlsx"
                    download="AlManar_2.xlsx"
                    className="block px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition truncate"
                  >
                    📊 Historical Log (AlManar)
                  </a>
                  <a
                    href="./PVC_Pipe_Daily_Follow.xlsx"
                    download="PVC_Pipe_Daily_Follow.xlsx"
                    className="block px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition truncate"
                  >
                    📋 24h SOP Follow Sheet
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer: Theme, Language, Profile & Logout */}
        <div className={`p-3 border-t shrink-0 space-y-2 ${
          isLight ? 'border-slate-200/80 bg-slate-50/50' : 'border-slate-800/70 bg-[#070d18]/60'
        }`}>
          {/* Quick System Controls: Language & Theme */}
          <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'justify-between'}`}>
            {/* Language Toggle */}
            <button
              type="button"
              onClick={() => setLang(isAr ? 'en' : 'ar')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                isLight 
                  ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={isAr ? 'Switch to English' : 'التحويل للعربية'}
            >
              <Languages className="w-3.5 h-3.5 text-teal-500" />
              {!isCollapsed && <span>{isAr ? 'English' : 'عربي'}</span>}
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                isLight 
                  ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            >
              {theme === 'light' ? (
                <Moon className="w-3.5 h-3.5 text-teal-600" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              )}
              {!isCollapsed && <span>{theme === 'light' ? 'Dark' : 'Light'}</span>}
            </button>
          </div>

          {/* Admin User Management */}
          {(user?.role === 'super_admin' || user?.role === 'admin' || user?.username === 'admin') && onOpenAdminModal && (
            <button
              type="button"
              onClick={onOpenAdminModal}
              title={isAr ? 'إدارة المستخدمين والباقات' : 'User & Tier Management'}
              className={`flex items-center gap-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                isCollapsed ? 'w-full justify-center p-2' : 'w-full justify-center px-2.5 py-1.5'
              } ${
                isLight
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              {!isCollapsed && <span>{isAr ? 'إدارة المستخدمين والباقات' : 'User & Tier Management'}</span>}
            </button>
          )}

          {/* User Profile Card & Sign Out */}
          {user && (
            <div className={`flex items-center p-2 rounded-xl border ${
              isLight ? 'bg-white border-slate-200/90' : 'bg-slate-900/90 border-slate-800'
            } ${isCollapsed ? 'justify-center p-1' : 'justify-between'}`}>
              
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center brand-gradient text-white text-xs font-bold shrink-0">
                  {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                </div>
                {!isCollapsed && (
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold truncate text-slate-800 dark:text-slate-200">
                      {user.username}
                    </span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        {(user.role === 'super_admin' || user.username === 'admin') ? 'Super Admin' : (user.role || 'operator')}
                      </span>
                      <span className={`text-[8px] font-bold uppercase tracking-wider px-1 py-0.2 rounded ${
                        user.subscription_tier === 'premium'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : user.subscription_tier === 'basic'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {user.subscription_tier || 'free'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {onLogout && !isCollapsed && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
