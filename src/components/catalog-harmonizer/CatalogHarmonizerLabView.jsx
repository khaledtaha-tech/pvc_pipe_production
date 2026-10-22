import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  Download,
  RotateCcw,
  Edit3,
  Sliders,
  Search,
  Filter,
  ShieldCheck,
  X,
  ExternalLink,
  Check,
  Database,
  ArrowRight,
  Info,
  ChevronRight
} from 'lucide-react';

import harmonizerConfig from '../../data/harmonizerConfig.json' with { type: 'json' };
import {
  harmonizeCatalogItem,
  applyResolutionAction,
  exportCleanSpringWorkbook,
  loadHarmonizerSandboxState,
  saveHarmonizerSandboxState,
  clearHarmonizerSandboxState,
  promoteToMasterCatalog
} from '../../logic/catalogHarmonizer.js';

import { getAllProducts } from '../../logic/productCatalogHelper.js';

export default function CatalogHarmonizerLabView({
  theme = 'dark',
  lang = 'en',
  onNotify = () => {},
  planningMatrix = []
}) {
  const isAr = lang === 'ar';
  const isLight = theme === 'light';
  const fileInputRef = useRef(null);

  // Staging items state
  const [stagedItems, setStagedItems] = useState(() => {
    return loadHarmonizerSandboxState();
  });

  // Filter & search state
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'variance' | 'clean' | 'resolved'
  const [searchQuery, setSearchQuery] = useState('');

  // Selected item for drawer
  const [selectedItem, setSelectedItem] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Custom edit state inside drawer
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customFields, setCustomFields] = useState({
    productType: '',
    sizeDisplay: '',
    odMm: '',
    wallThicknessMm: '',
    ratingClass: '',
    standard: '',
    joint: '',
    lengthM: 6.0,
    customNotes: ''
  });

  // Promotion confirmation modal
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Auto-persist staged items to isolated sandbox storage
  useEffect(() => {
    saveHarmonizerSandboxState(stagedItems);
  }, [stagedItems]);

  // Sync drawer custom fields when an item is selected
  useEffect(() => {
    if (selectedItem) {
      setCustomFields({
        productType: selectedItem.productType || 'PVC PIPE',
        sizeDisplay: selectedItem.sizeDisplay || (selectedItem.odMm ? `${selectedItem.odMm}` : ''),
        odMm: selectedItem.odMm || '',
        wallThicknessMm: selectedItem.wallThicknessMm || '',
        ratingClass: selectedItem.ratingClass || '',
        standard: selectedItem.standard || '',
        joint: selectedItem.joint || '',
        lengthM: selectedItem.lengthM || 6.0,
        customNotes: ''
      });
      setIsCustomMode(false);
    }
  }, [selectedItem]);

  // Compute metrics
  const metrics = useMemo(() => {
    const total = stagedItems.length;
    const variances = stagedItems.filter(i => i.status === 'variance').length;
    const clean = stagedItems.filter(i => i.status === 'clean').length;
    const resolved = stagedItems.filter(i => ['overridden', 'snapped', 'custom'].includes(i.status)).length;
    return { total, variances, clean, resolved };
  }, [stagedItems]);

  // Filtered & searched items
  const filteredItems = useMemo(() => {
    return stagedItems.filter((item) => {
      // Filter status
      if (filterMode === 'variance' && item.status !== 'variance') return false;
      if (filterMode === 'clean' && item.status !== 'clean') return false;
      if (filterMode === 'resolved' && !['overridden', 'snapped', 'custom'].includes(item.status)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const codeMatch = (item.itemCode || '').toLowerCase().includes(q);
        const rawMatch = (item.rawDescription || '').toLowerCase().includes(q);
        const canonMatch = (item.canonicalDescription || '').toLowerCase().includes(q);
        const notesMatch = (item.conflictNotes || '').toLowerCase().includes(q);
        return codeMatch || rawMatch || canonMatch || notesMatch;
      }
      return true;
    });
  }, [stagedItems, filterMode, searchQuery]);

  // Ingestion: Load Active Planning Catalog
  const handleLoadActivePlanningCatalog = () => {
    try {
      const activeProducts = getAllProducts();
      if (!activeProducts || activeProducts.length === 0) {
        onNotify('No products found in active catalog', 'info');
        return;
      }
      const harmonized = activeProducts.map((p) => harmonizeCatalogItem({
        itemCode: p.itemCode || p.code,
        description: p.productDescription || p.description,
        odMm: p.odMm,
        wallThicknessMm: p.wallThicknessMm
      }));
      setStagedItems(harmonized);
      onNotify(`Loaded ${harmonized.length} products from Active Planning Catalog`, 'success');
    } catch (e) {
      console.error(e);
      onNotify('Error loading active planning catalog: ' + e.message, 'error');
    }
  };

  // Ingestion: Load Al-Manar Sample Fixtures
  const handleLoadSampleFixtures = () => {
    try {
      const fixtures = harmonizerConfig.sampleAlManarFixtures || [];
      const harmonized = fixtures.map((f) => harmonizeCatalogItem({
        itemCode: f.itemCode,
        description: f.rawDescription
      }));
      setStagedItems(harmonized);
      onNotify(`Loaded ${harmonized.length} representative Al-Manar test fixtures`, 'success');
    } catch (e) {
      console.error(e);
      onNotify('Error loading fixtures: ' + e.message, 'error');
    }
  };

  // Ingestion: Upload Workbook (.xlsb / .xlsx)
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        
        // Find suitable sheet
        const sheetName = wb.SheetNames.find(n => 
          /unique.*planning/i.test(n) || 
          /planning.*catalog/i.test(n) || 
          /almanar/i.test(n) || 
          /catalog/i.test(n)
        ) || wb.SheetNames[0];

        const sheet = wb.Sheets[sheetName];
        if (!sheet) {
          onNotify('No valid worksheet found in workbook', 'error');
          return;
        }

        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (jsonRows.length === 0) {
          onNotify('Worksheet is empty', 'info');
          return;
        }

        const items = [];
        for (const row of jsonRows) {
          const code = String(row['Item Code'] || row['itemCode'] || row['Code'] || row['Product Code'] || '').trim();
          const desc = String(row['Product Description & Specs'] || row['Description'] || row['Pipe Description'] || row['description'] || '').trim();
          if (code && desc) {
            items.push(harmonizeCatalogItem({
              itemCode: code,
              description: desc,
              odMm: parseFloat(row['Pipe OD (mm) & Nominal Size'] || row['OD (mm)']) || null,
              wallThicknessMm: parseFloat(row['Wall Thickness / SDR'] || row['Wall Thickness']) || null
            }));
          }
        }

        if (items.length === 0) {
          onNotify('No recognizable product rows found. Check column headers.', 'info');
          return;
        }

        setStagedItems(items);
        onNotify(`Successfully imported and harmonized ${items.length} items from ${file.name}`, 'success');
      } catch (err) {
        console.error(err);
        onNotify('Workbook parsing failed: ' + err.message, 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Export: Clean Spring Excel Workbook
  const handleExportCleanSpring = () => {
    if (stagedItems.length === 0) {
      onNotify('No items to export', 'info');
      return;
    }
    try {
      const wb = exportCleanSpringWorkbook(stagedItems);
      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Clean_Master_Catalog_${dateStr}.xlsx`);
      onNotify('Clean Spring Master Catalog exported successfully', 'success');
    } catch (e) {
      console.error(e);
      onNotify('Export error: ' + e.message, 'error');
    }
  };

  // Human Resolution Action Handler
  const handleAction = (item, action, customData = {}) => {
    const updated = applyResolutionAction(item, action, customData);
    setStagedItems(prev => prev.map(i => (i.id === item.id ? updated : i)));
    if (selectedItem?.id === item.id) {
      setSelectedItem(updated);
    }
    const actionLabel = action === 'keep_factory'
      ? 'Kept factory dimension (Commercial Override)'
      : action === 'snap_standard'
      ? `Snapped to official standard (${updated.wallThicknessMm}mm)`
      : 'Applied custom edits';
    onNotify(`Item ${item.itemCode}: ${actionLabel}`, 'success');
  };

  // Quick Action from row
  const handleQuickSnap = (item, e) => {
    e.stopPropagation();
    handleAction(item, 'snap_standard');
  };

  const handleQuickKeep = (item, e) => {
    e.stopPropagation();
    handleAction(item, 'keep_factory');
  };

  // Promotion Handler
  const handleConfirmPromotion = () => {
    setIsProcessing(true);
    try {
      const result = promoteToMasterCatalog(stagedItems);
      if (result.success) {
        onNotify(result.message, 'success');
        setIsPromoteModalOpen(false);
      } else {
        onNotify(result.message, 'error');
      }
    } catch (err) {
      console.error(err);
      onNotify('Promotion failed: ' + err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`space-y-6 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
      {/* Top Banner & Header */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isLight
          ? 'bg-white border-slate-200/90 shadow-sm'
          : 'bg-[#0f172a]/90 border-slate-800 shadow-xl'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl brand-gradient flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <Sliders className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black tracking-tight">
                    {isAr ? '\u0645\u062E\u062A\u0628\u0631 \u062A\u0648\u062D\u064A\u062F \u062F\u0644\u064A\u0644 \u0627\u0644\u0623\u0635\u0646\u0627\u0641' : 'Catalog Harmonizer Lab'}
                  </h1>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30">
                    STAGING SANDBOX
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isAr
                    ? '\u0628\u064A\u0626\u0629 \u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0639\u0632\u0648\u0644\u0629 \u0644\u062A\u0646\u0638\u064A\u0641 \u0648\u062A\u0648\u062D\u064A\u062F \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0648\u062D\u0644 \u062A\u0639\u0627\u0631\u0636\u0627\u062A \u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0627\u062A'
                    : 'Isolated Staging Sandbox for Al-Manar Planning Catalog Standardization & Commercial Variance Governance'}
                </p>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsb,.xlsx,.xls,.csv"
              className="hidden"
            />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`h-9 inline-flex items-center gap-2 text-xs font-semibold px-3.5 rounded-xl border transition cursor-pointer ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Upload raw AlManar_9.xlsb or .xlsx"
            >
              <Upload className="w-4 h-4 text-cyan-500" />
              <span>{isAr ? '\u0631\u0641\u0639 \u0645\u0644\u0641 \u0625\u0643\u0633\u0644 (XLSB/XLSX)' : 'Upload Workbook'}</span>
            </button>

            <button
              type="button"
              onClick={handleLoadActivePlanningCatalog}
              className={`h-9 inline-flex items-center gap-2 text-xs font-semibold px-3.5 rounded-xl border transition cursor-pointer ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Ingest currently cached Unique Planning Catalog"
            >
              <Database className="w-4 h-4 text-emerald-500" />
              <span>{isAr ? '\u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062F\u0644\u064A\u0644 \u0627\u0644\u062D\u0627\u0644\u064A' : 'Load Active Catalog'}</span>
            </button>

            <button
              type="button"
              onClick={handleLoadSampleFixtures}
              className={`h-9 inline-flex items-center gap-2 text-xs font-semibold px-3.5 rounded-xl border transition cursor-pointer ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Load representative Al-Manar messy cases (5.2 vs 5.3mm, ASTM DWV, etc.)"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>{isAr ? '\u062D\u0627\u0644\u0627\u062A \u062A\u062C\u0631\u064A\u0628\u064A\u0629 (Demo)' : 'Load Test Fixtures'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCleanSpring}
              disabled={stagedItems.length === 0}
              className="h-9 inline-flex items-center gap-2 text-xs font-semibold px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title="Export Clean Spring Master Excel Workbook with Audit Trail"
            >
              <Download className="w-4 h-4" />
              <span>{isAr ? '\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u062F\u0644\u064A\u0644 \u0627\u0644\u0645\u0648\u062D\u062F (.xlsx)' : 'Export Clean Spring (.xlsx)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPromoteModalOpen(true)}
              disabled={stagedItems.length === 0}
              className="h-9 inline-flex items-center gap-2 text-xs font-bold px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-600/25"
              title="Promote validated clean dataset to live master catalog"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isAr ? '\u0627\u0639\u062A\u0645\u0627\u062F \u0643\u062F\u0644\u064A\u0644 \u0631\u0626\u064A\u0633\u064A' : 'Promote to Master Catalog'}</span>
            </button>

            {stagedItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Clear staging sandbox items?')) {
                    clearHarmonizerSandboxState();
                    setStagedItems([]);
                    onNotify('Staging sandbox cleared', 'info');
                  }
                }}
                className={`h-9 p-2 rounded-xl border transition cursor-pointer text-slate-400 hover:text-rose-500 ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
                }`}
                title="Clear Sandbox"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Isolation Guarantee Pill */}
        <div className={`mt-4 pt-3 border-t flex items-center justify-between gap-3 text-[11px] ${
          isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
        }`}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>
              <strong>100% Isolated State:</strong> Imports, adjustments, and variance experiments here are strictly contained within this sandbox and will never mutate active production logs or OEE databases until explicitly promoted.
            </span>
          </div>
          <span className="font-mono text-[10px] opacity-75">Storage: {HARMONIZER_STORAGE_KEY}</span>
        </div>
      </div>

      {/* Metric KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-4 rounded-xl border ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0f172a] border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>{isAr ? '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0623\u0635\u0646\u0627\u0641' : 'Total Staged Items'}</span>
            <Database className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-black">{metrics.total}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Ingested in sandbox</div>
        </div>

        <div className={`p-4 rounded-xl border ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0f172a] border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>{isAr ? '\u0645\u0637\u0627\u0628\u0642 \u0644\u0644\u0645\u0648\u0627\u0635\u0641\u0627\u062A (100%)' : 'Standard Compliant'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-500">{metrics.clean}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Exact standard match</div>
        </div>

        <div className={`p-4 rounded-xl border ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0f172a] border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>{isAr ? '\u062A\u0639\u0627\u0631\u0636 \u0645\u0648\u0627\u0635\u0641\u0627\u062A (5.2 vs 5.3)' : 'Specification Variances'}</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-500">{metrics.variances}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Commercial overrides flagged</div>
        </div>

        <div className={`p-4 rounded-xl border ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0f172a] border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>{isAr ? '\u062A\u0645 \u0627\u0644\u062A\u0648\u062D\u064A\u062F \u0648\u0627\u0644\u062D\u0633\u0645' : 'Harmonized / Resolved'}</span>
            <ShieldCheck className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-black text-teal-500">{metrics.resolved}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Snapped or accepted</div>
        </div>
      </div>

      {/* Filter, Search & Table View */}
      <div className={`rounded-2xl border overflow-hidden ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f172a] border-slate-800 shadow-xl'
      }`}>
        {/* Controls Toolbar */}
        <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 ${
          isLight ? 'border-slate-200 bg-slate-50/50' : 'border-slate-800 bg-slate-900/50'
        }`}>
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-xs'
                  : isLight ? 'text-slate-600 hover:bg-slate-200' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              All Items ({metrics.total})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('variance')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                filterMode === 'variance'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : isLight ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-amber-400 bg-amber-950/40 hover:bg-amber-900/40'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Needs Review / Variance ({metrics.variances})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('clean')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                filterMode === 'clean'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : isLight ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/40'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>100% Compliant ({metrics.clean})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('resolved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                filterMode === 'resolved'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : isLight ? 'text-teal-700 bg-teal-50 hover:bg-teal-100' : 'text-teal-400 bg-teal-950/40 hover:bg-teal-900/40'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Resolved ({metrics.resolved})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, raw or clean spec..."
              className={`w-full h-9 pl-9 pr-8 text-xs rounded-xl border transition ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-emerald-400'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Diagnostic Table */}
        <div className="overflow-x-auto max-h-[640px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className={`sticky top-0 z-10 border-b ${
              isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
            }`}>
              <tr>
                <th className="py-3 px-3.5 font-bold w-24">Item Code</th>
                <th className="py-3 px-3.5 font-bold min-w-[220px]">Original Raw Description</th>
                <th className="py-3 px-3.5 font-bold min-w-[280px]">Standardized Clean Description</th>
                <th className="py-3 px-2 font-bold text-center w-16">OD</th>
                <th className="py-3 px-2 font-bold text-center w-20">WT (mm)</th>
                <th className="py-3 px-2.5 font-bold text-center w-24">Rating / SDR</th>
                <th className="py-3 px-2.5 font-bold text-center w-28">Standard</th>
                <th className="py-3 px-2 font-bold text-center w-16">Joint</th>
                <th className="py-3 px-2 font-bold text-center w-16">Length</th>
                <th className="py-3 px-3 font-bold text-center w-44">Governance Status</th>
                <th className="py-3 px-3.5 font-bold text-center w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <Sliders className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold">No staged products found in sandbox.</p>
                    <p className="text-[11px] mt-1 text-slate-500">
                      Click <strong>"Load Active Catalog"</strong>, <strong>"Upload Workbook"</strong>, or <strong>"Load Test Fixtures"</strong> above to begin.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isVariance = item.status === 'variance';
                  return (
                    <tr
                      key={item.id}
                      onClick={() => {
                        setSelectedItem(item);
                        setIsDrawerOpen(true);
                      }}
                      className={`transition-colors cursor-pointer ${
                        isVariance
                          ? isLight
                            ? 'bg-amber-50/60 hover:bg-amber-100/60'
                            : 'bg-amber-950/15 hover:bg-amber-900/25'
                          : isLight
                          ? 'hover:bg-slate-50'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {item.itemCode || '-'}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        {item.rawDescription}
                      </td>
                      <td className="py-2.5 px-3.5 font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                        {item.canonicalDescription}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-medium">
                        {item.sizeDisplay || (item.odMm ? `${item.odMm}mm` : '-')}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono">
                        <span className={`px-1.5 py-0.5 rounded font-bold ${
                          isVariance
                            ? 'bg-amber-500/20 text-amber-500 dark:text-amber-400 font-black'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}>
                          {item.wallThicknessMm ? `${item.wallThicknessMm}mm` : '-'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-[11px]">
                        {item.ratingClass || '-'}
                      </td>
                      <td className="py-2.5 px-2.5 text-center text-[11px] text-slate-500 dark:text-slate-400">
                        {item.standard || '-'}
                      </td>
                      <td className="py-2.5 px-2 text-center font-semibold text-[11px]">
                        {item.joint || '-'}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-[11px]">
                        {item.lengthM ? `${item.lengthM}M` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {item.status === 'variance' && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            title={item.conflictNotes}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>Spec Variance (Std: {item.officialStandardWtMm}mm)</span>
                          </span>
                        )}
                        {item.status === 'clean' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Standard Matched</span>
                          </span>
                        )}
                        {item.status === 'overridden' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                            <Check className="w-3 h-3" />
                            <span>Commercial Override</span>
                          </span>
                        )}
                        {item.status === 'snapped' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30">
                            <Check className="w-3 h-3" />
                            <span>Snapped to Standard</span>
                          </span>
                        )}
                        {item.status === 'custom' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                            <Edit3 className="w-3 h-3" />
                            <span>Custom Edit</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                        {isVariance ? (
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => handleQuickSnap(item, e)}
                              className="px-2 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold text-[10px] cursor-pointer shadow-xs"
                              title={`Snap to Official Standard (${item.officialStandardWtMm}mm)`}
                            >
                              Snap {item.officialStandardWtMm}mm
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleQuickKeep(item, e)}
                              className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[10px] cursor-pointer shadow-xs"
                              title="Keep Factory Dimension as Commercial Override"
                            >
                              Keep {item.wallThicknessMm}mm
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItem(item);
                              setIsDrawerOpen(true);
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium border transition cursor-pointer ${
                              isLight ? 'hover:bg-slate-200 border-slate-300' : 'hover:bg-slate-700 border-slate-700'
                            }`}
                          >
                            Details / Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side Drawer / Reconciliation Modal */}
      {isDrawerOpen && selectedItem && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" 
            onClick={() => setIsDrawerOpen(false)}
          />

          <div className={`relative w-full max-w-xl h-full shadow-2xl flex flex-col z-10 transition-transform ${
            isLight ? 'bg-white text-slate-900' : 'bg-[#0b1322] text-slate-100'
          }`}>
            {/* Drawer Header */}
            <div className={`p-4 border-b flex items-center justify-between ${
              isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/80'
            }`}>
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-black">
                  Specification Reconciliation & Governance
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Item Code & Original Raw Input */}
              <div className={`p-4 rounded-xl border ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Product Code & Raw Input String
                </div>
                <div className="flex items-center gap-2 font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                  <span>{selectedItem.itemCode}</span>
                </div>
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">
                  "{selectedItem.rawDescription}"
                </p>
              </div>

              {/* Standardized Canonical Output */}
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Strict Canonical Name (Target Template)</span>
                </div>
                <p className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-300">
                  {selectedItem.canonicalDescription}
                </p>
              </div>

              {/* Conflict / Variance Matrix Card */}
              <div className={`p-4 rounded-xl border ${
                selectedItem.hasVariance
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    {selectedItem.hasVariance ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span className="text-amber-500">Specification Variance Detected</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-emerald-500">100% Standard Compliant</span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    Status: {selectedItem.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 text-center border-y border-slate-200/60 dark:border-slate-800/60 my-2 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">Factory Spec</div>
                    <div className="font-mono font-bold text-sm text-amber-500">
                      {selectedItem.wallThicknessMm} mm
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Official Standard</div>
                    <div className="font-mono font-bold text-sm text-emerald-500">
                      {selectedItem.officialStandardWtMm ? `${selectedItem.officialStandardWtMm} mm` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Variance Delta</div>
                    <div className="font-mono font-bold text-sm text-slate-700 dark:text-slate-300">
                      {selectedItem.varianceDiffMm ? `${selectedItem.varianceDiffMm > 0 ? '+' : ''}${selectedItem.varianceDiffMm} mm` : '0 mm'}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  {selectedItem.conflictNotes}
                </p>
              </div>

              {/* Three-Button Decision Workbench */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Reconciliation Action Decision
                </div>

                {/* Button A: Commercial Override */}
                <button
                  type="button"
                  onClick={() => handleAction(selectedItem, 'keep_factory')}
                  className="w-full p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-left rtl:text-right transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      Option A: Keep Factory Dimension (Commercial Override)
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                      Keep {selectedItem.wallThicknessMm}mm
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Preserves the factory shop-floor wall thickness ({selectedItem.wallThicknessMm}mm) while strictly formatting the product description into the canonical template.
                  </p>
                </button>

                {/* Button B: Snap to Standard */}
                <button
                  type="button"
                  disabled={!selectedItem.officialStandardWtMm}
                  onClick={() => handleAction(selectedItem, 'snap_standard')}
                  className="w-full p-3.5 rounded-xl border border-teal-500/40 bg-teal-500/10 hover:bg-teal-500/20 text-left rtl:text-right transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                      Option B: Snap to Official Standard
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/20 text-teal-400">
                      Snap to {selectedItem.officialStandardWtMm || 'N/A'}mm
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Updates the dimension to true official standard thickness ({selectedItem.officialStandardWtMm || '5.3'}mm) and re-computes linear weight automatically.
                  </p>
                </button>

                {/* Button C: Custom Edit */}
                <button
                  type="button"
                  onClick={() => setIsCustomMode(!isCustomMode)}
                  className={`w-full p-3 rounded-xl border text-left rtl:text-right transition cursor-pointer ${
                    isCustomMode
                      ? 'border-sky-500 bg-sky-500/10'
                      : isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-600 dark:text-sky-400">
                      Option C: Custom Edit & Field Override
                    </span>
                    <Edit3 className="w-4 h-4 text-sky-500" />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Manually adjust any engineering field (OD, WT, Standard, Joint, Length).
                  </p>
                </button>
              </div>

              {/* Inline Custom Editor Form */}
              {isCustomMode && (
                <div className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-slate-700'
                }`}>
                  <div className="text-xs font-bold text-sky-400">Manual Field-by-Field Adjustment</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Product Type</label>
                      <input
                        type="text"
                        value={customFields.productType}
                        onChange={(e) => setCustomFields({ ...customFields, productType: e.target.value })}
                        className="w-full h-8 px-2.5 rounded-lg border bg-transparent font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Size Display</label>
                      <input
                        type="text"
                        value={customFields.sizeDisplay}
                        onChange={(e) => setCustomFields({ ...customFields, sizeDisplay: e.target.value })}
                        className="w-full h-8 px-2.5 rounded-lg border bg-transparent font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">OD (mm)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={customFields.odMm}
                        onChange={(e) => setCustomFields({ ...customFields, odMm: parseFloat(e.target.value) || '' })}
                        className="w-full h-8 px-2.5 rounded-lg border bg-transparent font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Wall Thickness (mm)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={customFields.wallThicknessMm}
                        onChange={(e) => setCustomFields({ ...customFields, wallThicknessMm: parseFloat(e.target.value) || '' })}
                        className="w-full h-8 px-2.5 rounded-lg border bg-transparent font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Rating / Class / SDR</label>
                      <input
                        type="text"
                        value={customFields.ratingClass}
                        onChange={(e) => setCustomFields({ ...customFields, ratingClass: e.target.value })}
                        className="w-full h-8 px-2.5 rounded-lg border bg-transparent font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Standard / Spec</label>
                      <input
                        type="text"
                        value={customFields.standard}
                        onChange={(e) => setCustomFields({ ...customFields, standard: e.target.value })}
                        className="w-full h-8 px-2.5 rounded-lg border bg-transparent font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Joint Type</label>
                      <input
                        type="text"
                        value={customFields.joint}
                        onChange={(e) => setCustomFields({ ...customFields, joint: e.target.value })}
                        className="w-full h-8 px-2.5 rounded-lg border bg-transparent font-mono"
                        placeholder="R/R, S/C, P/E"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Pipe Length (m)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={customFields.lengthM}
                        onChange={(e) => setCustomFields({ ...customFields, lengthM: parseFloat(e.target.value) || 6.0 })}
                        className="w-full h-8 px-2.5 rounded-lg border bg-transparent font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Resolution Notes</label>
                    <input
                      type="text"
                      value={customFields.customNotes}
                      onChange={(e) => setCustomFields({ ...customFields, customNotes: e.target.value })}
                      placeholder="e.g. Approved custom engineering dimension"
                      className="w-full h-8 px-2.5 rounded-lg border bg-transparent text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAction(selectedItem, 'custom_edit', customFields)}
                    className="w-full h-9 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs transition cursor-pointer"
                  >
                    Save & Harmonize Custom Fields
                  </button>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className={`p-4 border-t flex items-center justify-between ${
              isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
            }`}>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                }`}
              >
                Close Drawer
              </button>
              <div className="text-[11px] text-slate-400 font-mono">
                {selectedItem.id}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Promote to Master Catalog Confirmation Modal */}
      {isPromoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => !isProcessing && setIsPromoteModalOpen(false)}
          />
          <div className={`relative w-full max-w-lg rounded-2xl shadow-2xl p-6 border z-10 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f172a] border-slate-800 text-slate-100'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black">Promote to Live Master Catalog?</h3>
                <p className="text-xs text-slate-400">Governance & Master Registry Authorization</p>
              </div>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-400">
              <p>
                You are about to promote <strong className="text-emerald-500">{stagedItems.length} harmonized products</strong> from this isolated staging lab directly into the live application Master Product Catalog.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-500 dark:text-slate-400 text-[11px]">
                <li>Standardized clean descriptions will become available in Daily SOPs, OEE logs, and dropdowns.</li>
                <li>All entries will be stamped with origin provenance: <strong className="text-slate-300">Harmonized Master Catalog</strong>.</li>
                <li>Historical logs and already submitted shift reports remain 100% immutable and untouched.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setIsPromoteModalOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmPromotion}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer shadow-md shadow-emerald-600/30 flex items-center gap-2"
              >
                {isProcessing ? 'Promoting...' : 'Authorize & Promote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
