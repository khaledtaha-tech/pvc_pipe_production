import React from 'react';
import { 
  BarChart3, 
  Table, 
  ShieldCheck,
  Cpu,
  AlertTriangle,
  RotateCcw,
  X
} from 'lucide-react';

import DataHub from '../common/DataHub';
import KpiCards from './KpiCards';
import AnalyticsCharts from './AnalyticsCharts';
import CleaningAuditTable from './CleaningAuditTable';
import ManualEntryModal from './ManualEntryModal';
import VerificationCenter from './VerificationCenter';
import ProductionPlanningView from './ProductionPlanningView';
import MasterExtrusionTable from './MasterExtrusionTable';
import UniquePlanningCatalogView from './UniquePlanningCatalogView';
import ErrorBoundary from '../common/ErrorBoundary';

import { t } from '../../utils/translations';

export default function DataAnalysisView({
  lang,
  activeTab,
  setActiveTab,
  theme,
  rawRows,
  setRawRows,
  historicalRawRows,
  setHistoricalRawRows,
  currentSheetName,
  setCurrentSheetName,
  cleanedRows,
  auditReport,
  analytics,
  planningMatrix,
  masterRuns,
  isManualModalOpen,
  setIsManualModalOpen,
  isClearDialogOpen,
  setIsClearDialogOpen,
  handleClearAllData,
  handleSaveManualRow,
  handleExportCleanLog,
  handleExportConsolidated,
  handleExportMasterPlan,
  handleExportUniqueCatalog
}) {
  const isAr = lang === 'ar';

  return (
    <div className="space-y-6">
      {/* File Ingestion & DataHub */}
      <DataHub
        lang={lang}
        theme={theme}
        onDataLoaded={(rows, name) => {
          setRawRows(rows);
          setCurrentSheetName(name);
        }}
        onHistoricalDataLoaded={(rows) => {
          setHistoricalRawRows(rows);
        }}
        onClearData={() => setIsClearDialogOpen(true)}
        recordCount={rawRows.length}
        historicalCount={historicalRawRows.length}
        currentSheetName={currentSheetName}
      />

      {/* Main Module Content */}
      <div className="transition-all duration-300">
        {activeTab === 'master' && (
          <ErrorBoundary>
            <MasterExtrusionTable
              masterRuns={masterRuns}
              theme={theme}
              lang={lang}
              onExport={handleExportMasterPlan}
              onAddManualRow={() => setIsManualModalOpen(true)}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <ErrorBoundary>
              <KpiCards analytics={analytics} lang={lang} theme={theme} />
            </ErrorBoundary>
            <ErrorBoundary>
              <AnalyticsCharts analytics={analytics} lang={lang} theme={theme} />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 'audit' && (
          <ErrorBoundary>
            <CleaningAuditTable
              cleanedRows={cleanedRows}
              auditReport={auditReport}
              lang={lang}
              theme={theme}
              onExport={handleExportCleanLog}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'planning' && (
          <div className="space-y-8">
            <ErrorBoundary>
              <ProductionPlanningView
                planningMatrix={planningMatrix}
                theme={theme}
                lang={lang}
                onExport={handleExportConsolidated}
              />
            </ErrorBoundary>

            <ErrorBoundary>
              <UniquePlanningCatalogView
                planningMatrix={planningMatrix}
                theme={theme}
                lang={lang}
                onExport={handleExportUniqueCatalog}
              />
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 'verification' && (
          <ErrorBoundary>
            <VerificationCenter
              productionData={cleanedRows}
              auditReport={auditReport}
              theme={theme}
              lang={lang}
            />
          </ErrorBoundary>
        )}
      </div>

      {/* Manual Entry Modal */}
      {isManualModalOpen && (
        <ManualEntryModal
          isOpen={isManualModalOpen}
          onClose={() => setIsManualModalOpen(false)}
          onSave={handleSaveManualRow}
          lang={lang}
          theme={theme}
        />
      )}

      {/* Clear Confirmation Dialog */}
      {isClearDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`w-full max-w-md p-6 rounded-2xl shadow-2xl border ${
            theme === 'light' ? 'bg-white border-stone-200 text-stone-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center gap-3 text-rose-500 mb-4">
              <div className="p-3 bg-rose-500/10 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  {isAr ? 'مسح جميع البيانات المخزنة؟' : 'Clear All Stored Data?'}
                </h3>
                <p className="text-xs text-slate-400">
                  {isAr ? 'هذا الإجراء سيقوم بحذف كافة السجلات اليومية والبيانات التاريخية' : 'This will remove all current and historical records from browser storage.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setIsClearDialogOpen(false)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg border transition ${
                  theme === 'light' ? 'border-stone-300 hover:bg-stone-100 text-stone-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleClearAllData}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition"
              >
                {isAr ? 'نعم، مسح البيانات' : 'Yes, Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
