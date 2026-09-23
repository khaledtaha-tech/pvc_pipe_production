import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

import Navbar from './components/common/Navbar';
import DataAnalysisView from './components/data-analysis/DataAnalysisView';
import DailyEvaluationView from './components/daily-evaluation/DailyEvaluationView';

import { SAMPLE_PRODUCTION_DATA } from './data/sampleData';
import { SAMPLE_HISTORICAL_ERP_DATA } from './data/sampleHistoricalErpData';
import { cleanPipeProductionData, standardizeMaterial, isValidPipeOrConduitProduct } from './utils/dataCleaner';
import { canonicalizeMachineName, isUnknownMachine } from './config/machines';
import { computeAnalytics } from './utils/analyticsEngine';
import { 
  processHistoricalErpData, 
  buildUniqueSizingPlanningMatrix, 
  generateConsolidatedExcelWorkbook,
  buildUnifiedMasterRuns,
  generateMasterPlanExcelWorkbook,
  generateUniquePlanningCatalogExcelWorkbook
} from './utils/inferenceEngine';
import { 
  loadAppState, 
  saveAppState, 
  clearAppState 
} from './utils/indexedDbStorage';
import { t } from './utils/translations';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/auth/LoginPage';
import AdminUserManagementModal from './components/admin/AdminUserManagementModal';

function AppContent() {
  const { isAuthenticated, user, logout } = useAuth();
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [currentModule, setCurrentModule] = useState('data-analysis'); // 'data-analysis' | 'daily-evaluation'
  const [activeTab, setActiveTab] = useState('master'); // 'master' | 'dashboard' | 'audit' | 'planning' | 'verification'
  const [lang, setLang] = useState('en');
  const [rawRows, setRawRows] = useState(SAMPLE_PRODUCTION_DATA);
  const [historicalRawRows, setHistoricalRawRows] = useState(SAMPLE_HISTORICAL_ERP_DATA);
  const [currentSheetName, setCurrentSheetName] = useState('Daily Production Log');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Global save and toast feedback state
  const dailyEvalRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);
  const [globalToast, setGlobalToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setGlobalToast({ message, type });
    setTimeout(() => {
      setGlobalToast(prev => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const handleGlobalSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (currentModule === 'daily-evaluation') {
        if (dailyEvalRef.current?.save) {
          const res = await dailyEvalRef.current.save();
          if (res && res.success) {
            showToast('Saved to Database and Local Storage', 'success');
          } else if (res && res.message) {
            showToast(`Saved locally: ${res.message}`, 'info');
          } else {
            showToast('Saved to Database and Local Storage', 'success');
          }
        } else {
          showToast('Daily evaluation module not ready', 'error');
        }
      } else {
        // data-analysis module: force flush active datasets directly into IndexedDB
        await saveAppState({
          rawRows,
          historicalRawRows,
          currentSheetName
        });
        showToast('All changes saved successfully', 'success');
      }
    } catch (err) {
      console.error('Save error:', err);
      showToast('Error saving data: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Theme state with localStorage persistence
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('pipe_data_theme') || 'dark';
  });

  // Hydrate application state from IndexedDB on initial mount
  useEffect(() => {
    let isMounted = true;
    async function hydrate() {
      try {
        const saved = await loadAppState();
        if (isMounted) {
          if (saved && saved.isInitialized) {
            setRawRows(saved.rawRows || []);
            setHistoricalRawRows(saved.historicalRawRows || []);
            if (saved.currentSheetName) {
              setCurrentSheetName(saved.currentSheetName);
            }
          } else {
            await saveAppState({
              rawRows: SAMPLE_PRODUCTION_DATA,
              historicalRawRows: SAMPLE_HISTORICAL_ERP_DATA,
              currentSheetName: 'Daily Production Log'
            });
          }
          setIsHydrated(true);
        }
      } catch (err) {
        console.warn('Hydration error:', err);
        if (isMounted) setIsHydrated(true);
      }
    }
    hydrate();
    return () => { isMounted = false; };
  }, []);

  // Persist state changes to IndexedDB
  useEffect(() => {
    if (!isHydrated) return;
    const timer = setTimeout(() => {
      saveAppState({
        rawRows,
        historicalRawRows,
        currentSheetName
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [rawRows, historicalRawRows, currentSheetName, isHydrated]);

  // Sync RTL / LTR based on language
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Sync Theme with root class
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('pipe_data_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'));
  };

  const handleConfirmClearAll = async () => {
    setRawRows([]);
    setHistoricalRawRows([]);
    await clearAppState();
    setIsClearDialogOpen(false);
    setActiveTab('master');
  };

  // Clean data and evaluate sizing compatibility
  const { cleanedRows, auditReport } = useMemo(() => {
    return cleanPipeProductionData(rawRows);
  }, [rawRows]);

  // Compute sizing and throughput matrix analytics
  const analytics = useMemo(() => {
    return computeAnalytics(cleanedRows);
  }, [cleanedRows]);

  // Process historical ERP data
  const { inferredRows: historicalInferredRows } = useMemo(() => {
    return processHistoricalErpData(historicalRawRows);
  }, [historicalRawRows]);

  // Build the unique pipe profiles and machine allocation matrix
  const uniquePlanningMatrix = useMemo(() => {
    return buildUniqueSizingPlanningMatrix(cleanedRows, historicalInferredRows);
  }, [cleanedRows, historicalInferredRows]);

  // Compute unified master extrusion and planning runs
  const unifiedMasterRuns = useMemo(() => {
    return buildUnifiedMasterRuns(cleanedRows, historicalInferredRows);
  }, [cleanedRows, historicalInferredRows]);

  // Export Unified Master Extrusion Plan
  const handleExportMasterPlanExcel = () => {
    const wb = generateMasterPlanExcelWorkbook(unifiedMasterRuns);
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Master_Extrusion_Plan_${dateStr}.xlsx`);
  };

  // Export Unique Planning Catalog
  const handleExportUniqueCatalog = () => {
    const wb = generateUniquePlanningCatalogExcelWorkbook(uniquePlanningMatrix);
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Unique_Planning_Catalog_${dateStr}.xlsx`);
  };

  // Export Unified Consolidated Master Excel workbook
  const handleExportConsolidatedExcel = () => {
    const wb = generateConsolidatedExcelWorkbook(cleanedRows, historicalInferredRows, uniquePlanningMatrix);
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Consolidated_Extrusion_Master_Plan_${dateStr}.xlsx`);
  };

  // Add manual row
  const handleAddManualRow = (newRow) => {
    setRawRows(prev => [newRow, ...prev]);
  };

  // Export clean Excel log
  const handleExportCleanExcel = () => {
    if (cleanedRows.length === 0) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(cleanedRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Cleaned Production Log');
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Cleaned_Production_Log_${dateStr}.xlsx`);
  };

  if (!isAuthenticated) {
    return (
      <LoginPage
        lang={lang}
        setLang={setLang}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    );
  }

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-[#f2eee7] text-stone-900' : 'bg-slate-950 text-slate-100'}`}>
      {/* Unified Suite Navbar */}
      <Navbar
        user={user}
        onLogout={logout}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        onGlobalSave={handleGlobalSave}
        isSaving={isSaving}
        currentModule={currentModule}
        setCurrentModule={setCurrentModule}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
        setLang={setLang}
        theme={theme}
        toggleTheme={toggleTheme}
        recordCount={rawRows.length}
        historicalCount={historicalRawRows.length}
        masterCount={unifiedMasterRuns.length}
        auditReport={auditReport}
        onOpenManualEntry={() => setIsManualModalOpen(true)}
        onExportClean={handleExportCleanExcel}
        onExportMasterPlan={handleExportMasterPlanExcel}
        onOpenMasterTable={() => setActiveTab('master')}
        onOpenPlanning={() => setActiveTab('planning')}
        onOpenVerification={() => setActiveTab('verification')}
      />

      {/* Main Container: Expanded to utilize lateral widescreen space */}
      <main className="w-full max-w-[1920px] mx-auto px-2 sm:px-4 lg:px-6 py-4">
        {currentModule === 'data-analysis' ? (
          <DataAnalysisView
            lang={lang}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            theme={theme}
            rawRows={rawRows}
            setRawRows={setRawRows}
            historicalRawRows={historicalRawRows}
            setHistoricalRawRows={setHistoricalRawRows}
            currentSheetName={currentSheetName}
            setCurrentSheetName={setCurrentSheetName}
            cleanedRows={cleanedRows}
            auditReport={auditReport}
            analytics={analytics}
            planningMatrix={uniquePlanningMatrix}
            masterRuns={unifiedMasterRuns}
            isManualModalOpen={isManualModalOpen}
            setIsManualModalOpen={setIsManualModalOpen}
            isClearDialogOpen={isClearDialogOpen}
            setIsClearDialogOpen={setIsClearDialogOpen}
            handleClearAllData={handleConfirmClearAll}
            handleSaveManualRow={handleAddManualRow}
            handleExportCleanLog={handleExportCleanExcel}
            handleExportConsolidated={handleExportConsolidatedExcel}
            handleExportMasterPlan={handleExportMasterPlanExcel}
            handleExportUniqueCatalog={handleExportUniqueCatalog}
          />
        ) : (
          <div className="daily-eval-root w-full rounded-xl overflow-hidden shadow-2xl border border-slate-800">
            <DailyEvaluationView ref={dailyEvalRef} sharedTheme={theme} lang={lang} />
          </div>
        )}
      </main>

      {/* Admin User Management Modal */}
      {isAdminModalOpen && (
        <AdminUserManagementModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          currentUser={user}
          theme={theme}
        />
      )}

      {/* Non-blocking Global Toast Feedback */}
      {globalToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md pointer-events-auto">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border ${
            globalToast.type === 'error'
              ? 'bg-rose-900/95 text-rose-100 border-rose-700/80 backdrop-blur-md'
              : globalToast.type === 'info'
              ? 'bg-sky-900/95 text-sky-100 border-sky-700/80 backdrop-blur-md'
              : 'bg-emerald-900/95 text-emerald-100 border-emerald-700/80 backdrop-blur-md'
          }`}>
            {globalToast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-300 shrink-0" />
            ) : globalToast.type === 'info' ? (
              <Info className="w-5 h-5 text-sky-300 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            )}
            <p className="text-xs font-semibold">{globalToast.message}</p>
            <button
              type="button"
              onClick={() => setGlobalToast(null)}
              className="ml-auto p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

