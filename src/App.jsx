import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';

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

export default function App() {
  const [currentModule, setCurrentModule] = useState('data-analysis'); // 'data-analysis' | 'daily-evaluation'
  const [activeTab, setActiveTab] = useState('master'); // 'master' | 'dashboard' | 'audit' | 'planning' | 'verification'
  const [lang, setLang] = useState('en');
  const [rawRows, setRawRows] = useState(SAMPLE_PRODUCTION_DATA);
  const [historicalRawRows, setHistoricalRawRows] = useState(SAMPLE_HISTORICAL_ERP_DATA);
  const [currentSheetName, setCurrentSheetName] = useState('Daily Production Log');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

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

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-[#f2eee7] text-stone-900' : 'bg-slate-950 text-slate-100'}`}>
      {/* Unified Suite Navbar */}
      <Navbar
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

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
          <div className="daily-eval-root rounded-xl overflow-hidden shadow-2xl border border-slate-800">
            <DailyEvaluationView sharedTheme={theme} />
          </div>
        )}
      </main>
    </div>
  );
}
