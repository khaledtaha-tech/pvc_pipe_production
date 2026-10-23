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
  ChevronRight,
  Target,
  CheckSquare,
  Layers,
  ChevronLeft,
  Trash2,
  FileText,
  CheckCheck,
  Copy,
  ClipboardCopy,
  ClipboardCheck
} from 'lucide-react';

import harmonizerConfig from '../../data/harmonizerConfig.json' with { type: 'json' };
import {
  HARMONIZER_STORAGE_KEY,
  harmonizeCatalogItem,
  applyResolutionAction,
  exportCleanSpringWorkbook,
  loadHarmonizerSandboxState,
  saveHarmonizerSandboxState,
  clearHarmonizerSandboxState,
  promoteToMasterCatalog,
  loadArchetypes,
  applyArchetypeToItem,
  synthesizeDescription,
  detectUnparsedTokens,
  purgeGarbageTokens,
  approveBatchItems,
  formatItemAnalysisMarkdown,
  formatBatchSummaryMarkdown,
  copyToClipboard
} from '../../logic/catalogHarmonizer.js';

import ArchetypePatternStudioModal from './ArchetypePatternStudioModal.jsx';

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
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'anomaly' | 'variance' | 'clean' | 'resolved'
  const [searchQuery, setSearchQuery] = useState('');

  // Focus 10 Review Queue Mode state
  const [isFocus10Mode, setIsFocus10Mode] = useState(false);
  const [focusBatchIndex, setFocusBatchIndex] = useState(0);

  // Clipboard copy state for visual feedback
  const [copiedItemId, setCopiedItemId] = useState(null);
  const [isBatchCopied, setIsBatchCopied] = useState(false);
  const [isRawCopied, setIsRawCopied] = useState(false);

  // Raw Context modal/popover state
  const [activeContextItem, setActiveContextItem] = useState(null);

  // Inline editing of raw description to fix/purge garbage tokens
  const [inlineEditingItemId, setInlineEditingItemId] = useState(null);
  const [inlineEditText, setInlineEditText] = useState('');

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

  // Archetype Pattern Studio modal state
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [activeArchetypesList, setActiveArchetypesList] = useState(() => loadArchetypes());

  // Reload archetypes when studio opens or changes
  const refreshArchetypes = () => {
    setActiveArchetypesList(loadArchetypes());
  };

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

  // Compute metrics with 3-tier traffic light & approval counts
  const metrics = useMemo(() => {
    const total = stagedItems.length;
    const anomalies = stagedItems.filter(i => i.status === 'anomaly' || i.hasAnomaly).length;
    const variances = stagedItems.filter(i => i.status === 'variance').length;
    const clean = stagedItems.filter(i => i.status === 'clean' && !i.hasAnomaly).length;
    const resolved = stagedItems.filter(i => ['overridden', 'snapped', 'custom', 'approved'].includes(i.status) || i.isApproved).length;
    const approved = stagedItems.filter(i => i.isApproved).length;
    return { total, anomalies, variances, clean, resolved, approved };
  }, [stagedItems]);

  // Focus 10 mode queue: prioritizes unapproved items with anomalies or variances first
  const focusQueue = useMemo(() => {
    const unapproved = stagedItems.filter(i => !i.isApproved);
    return unapproved.slice().sort((a, b) => {
      const scoreA = (a.status === 'anomaly' || a.hasAnomaly) ? 2 : (a.status === 'variance' ? 1 : 0);
      const scoreB = (b.status === 'anomaly' || b.hasAnomaly) ? 2 : (b.status === 'variance' ? 1 : 0);
      return scoreB - scoreA;
    });
  }, [stagedItems]);

  const totalBatches = Math.max(1, Math.ceil(focusQueue.length / 10));

  // Current batch slice of 10 items for Focus 10 mode
  const currentBatchItems = useMemo(() => {
    if (!isFocus10Mode) return [];
    const start = focusBatchIndex * 10;
    return focusQueue.slice(start, start + 10);
  }, [isFocus10Mode, focusBatchIndex, focusQueue]);

  // Filtered & searched items (switches to active batch if in Focus 10 mode)
  const filteredItems = useMemo(() => {
    if (isFocus10Mode) {
      return currentBatchItems;
    }
    return stagedItems.filter((item) => {
      // Filter status
      if (filterMode === 'anomaly' && item.status !== 'anomaly' && !item.hasAnomaly) return false;
      if (filterMode === 'variance' && item.status !== 'variance') return false;
      if (filterMode === 'clean' && item.status !== 'clean') return false;
      if (filterMode === 'resolved' && !['overridden', 'snapped', 'custom', 'approved'].includes(item.status) && !item.isApproved) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const codeMatch = (item.itemCode || '').toLowerCase().includes(q);
        const rawMatch = (item.rawDescription || '').toLowerCase().includes(q);
        const canonMatch = (item.canonicalDescription || '').toLowerCase().includes(q);
        const notesMatch = (item.conflictNotes || '').toLowerCase().includes(q);
        const fileMatch = (item.sourceFile || '').toLowerCase().includes(q);
        return codeMatch || rawMatch || canonMatch || notesMatch || fileMatch;
      }
      return true;
    });
  }, [isFocus10Mode, currentBatchItems, stagedItems, filterMode, searchQuery]);

  // Ingestion: Load Active Planning Catalog with provenance
  const handleLoadActivePlanningCatalog = () => {
    try {
      const activeProducts = getAllProducts();
      if (!activeProducts || activeProducts.length === 0) {
        onNotify('No products found in active catalog', 'info');
        return;
      }
      const harmonized = activeProducts.map((p, idx) => harmonizeCatalogItem({
        itemCode: p.itemCode || p.code,
        description: p.productDescription || p.description,
        odMm: p.odMm,
        wallThicknessMm: p.wallThicknessMm,
        sourceFile: 'Active_Catalog.json',
        sourceSheet: 'Planning Matrix',
        sourceRow: `Row #${idx + 1}`,
        ingestionType: 'ERP_CACHE',
        rawImportData: p
      }));
      setStagedItems(harmonized);
      onNotify(`Loaded ${harmonized.length} products from Active Planning Catalog`, 'success');
    } catch (e) {
      console.error(e);
      onNotify('Error loading active planning catalog: ' + e.message, 'error');
    }
  };

  // Ingestion: Load Al-Manar Sample Fixtures with provenance
  const handleLoadSampleFixtures = () => {
    try {
      const fixtures = harmonizerConfig.sampleAlManarFixtures || [];
      const harmonized = fixtures.map((f, idx) => harmonizeCatalogItem({
        itemCode: f.itemCode,
        description: f.rawDescription,
        sourceFile: f.sourceFile || 'AlManar_9.xlsb',
        sourceSheet: f.sourceSheet || 'Unique Planning',
        sourceRow: f.sourceRow || `Row #${idx + 1}`,
        ingestionType: f.ingestionType || 'PLANNING_CATALOG',
        rawImportData: f
      }));
      setStagedItems(harmonized);
      onNotify(`Loaded ${harmonized.length} representative Al-Manar test fixtures`, 'success');
    } catch (e) {
      console.error(e);
      onNotify('Error loading fixtures: ' + e.message, 'error');
    }
  };

  // Ingestion: Upload Workbook (.xlsb / .xlsx) with provenance
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
        for (let rIdx = 0; rIdx < jsonRows.length; rIdx++) {
          const row = jsonRows[rIdx];
          const code = String(row['Item Code'] || row['itemCode'] || row['Code'] || row['Product Code'] || '').trim();
          const desc = String(row['Product Description & Specs'] || row['Description'] || row['Pipe Description'] || row['description'] || '').trim();
          if (code && desc) {
            items.push(harmonizeCatalogItem({
              itemCode: code,
              description: desc,
              odMm: parseFloat(row['Pipe OD (mm) & Nominal Size'] || row['OD (mm)']) || null,
              wallThicknessMm: parseFloat(row['Wall Thickness / SDR'] || row['Wall Thickness']) || null,
              sourceFile: file.name,
              sourceSheet: sheetName,
              sourceRow: `Row #${rIdx + 2}`,
              ingestionType: /daily/i.test(sheetName) ? 'DAILY_LOG' : 'PLANNING_CATALOG',
              rawImportData: row
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

  // Focus 10: Toggle Mode
  const handleToggleFocus10Mode = () => {
    setIsFocus10Mode(prev => {
      const next = !prev;
      if (next) {
        setFocusBatchIndex(0);
        onNotify(
          isAr
            ? '\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0648\u0636\u0639 \u0627\u0644\u062A\u0631\u0643\u064A\u0632: \u0641\u062D\u0635 10 \u0623\u0635\u0646\u0627\u0641'
            : 'Activated Focus 10 Mode: Review queue in batches of 10',
          'info'
        );
      }
      return next;
    });
  };

  // Focus 10: Approve Current Batch & Fetch Next 10
  const handleApproveCurrentBatch = () => {
    if (currentBatchItems.length === 0) return;
    const idsToApprove = currentBatchItems.map(i => i.id);
    const updated = approveBatchItems(stagedItems, idsToApprove);
    setStagedItems(updated);

    const remainingCount = Math.max(0, focusQueue.length - currentBatchItems.length);
    onNotify(
      isAr
        ? `\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F ${idsToApprove.length} \u0635\u0646\u0641 \u0628\u0646\u062C\u0627\u062D (${remainingCount} \u0645\u062A\u0628\u0642\u064A)`
        : `Approved batch of ${idsToApprove.length} items successfully (${remainingCount} remaining in queue)`,
      'success'
    );

    const nextTotalBatches = Math.ceil(remainingCount / 10);
    if (focusBatchIndex >= nextTotalBatches) {
      setFocusBatchIndex(Math.max(0, nextTotalBatches - 1));
    }
  };

  // Purge unparsed garbage tokens on the spot
  const handlePurgeGarbage = (item, e) => {
    e.stopPropagation();
    const cleanedDesc = purgeGarbageTokens(item.rawDescription, item.unparsedTokens);
    const updated = harmonizeCatalogItem({
      ...item,
      description: cleanedDesc,
      rawDescription: cleanedDesc
    });
    setStagedItems(prev => prev.map(i => i.id === item.id ? updated : i));
    if (selectedItem?.id === item.id) setSelectedItem(updated);
    onNotify(
      isAr
        ? `\u062A\u0645 \u062A\u0646\u0642\u064A\u0629 \u0627\u0644\u0631\u0645\u0648\u0632 \u063A\u064A\u0631 \u0627\u0644\u0645\u0639\u0631\u0648\u0641\u0629 \u0644\u0644\u0635\u0646\u0641 ${item.itemCode}`
        : `Purged garbage tokens for ${item.itemCode}`,
      'success'
    );
  };

  // Inline edit save
  const handleSaveInlineEdit = (item, e) => {
    e.stopPropagation();
    if (!inlineEditText.trim()) return;
    const updated = harmonizeCatalogItem({
      ...item,
      description: inlineEditText.trim(),
      rawDescription: inlineEditText.trim()
    });
    setStagedItems(prev => prev.map(i => i.id === item.id ? updated : i));
    if (selectedItem?.id === item.id) setSelectedItem(updated);
    setInlineEditingItemId(null);
    setInlineEditText('');
    onNotify(
      isAr
        ? `\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0648\u062A\u0648\u062D\u064A\u062F \u0627\u0644\u0635\u0646\u0641 ${item.itemCode}`
        : `Updated & re-harmonized description for ${item.itemCode}`,
      'success'
    );
  };

  // Copy single row analysis to clipboard (Markdown)
  const handleCopyRowAnalysis = async (item, e) => {
    if (e) e.stopPropagation();
    if (!item) return;
    const md = formatItemAnalysisMarkdown(item);
    const ok = await copyToClipboard(md);
    if (ok) {
      setCopiedItemId(item.id);
      setTimeout(() => setCopiedItemId(null), 2000);
      onNotify(
        isAr
          ? `\u062A\u0645 \u0646\u0633\u062E \u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0635\u0646\u0641 ${item.itemCode} \u0625\u0644\u0649 \u0627\u0644\u062D\u0627\u0641\u0638\u0629`
          : `Copied analysis for ${item.itemCode} to clipboard`,
        'success'
      );
    } else {
      onNotify('Failed to copy to clipboard', 'error');
    }
  };

  // Copy active batch analysis summary to clipboard (Markdown)
  const handleCopyBatchSummary = async (e) => {
    if (e) e.stopPropagation();
    if (currentBatchItems.length === 0) {
      onNotify('No items in active batch to copy', 'info');
      return;
    }
    const md = formatBatchSummaryMarkdown(currentBatchItems, {
      batchIndex: focusBatchIndex,
      totalBatches,
      totalQueueCount: focusQueue.length
    });
    const ok = await copyToClipboard(md);
    if (ok) {
      setIsBatchCopied(true);
      setTimeout(() => setIsBatchCopied(false), 2000);
      onNotify(
        isAr
          ? `\u062A\u0645 \u0646\u0633\u062E \u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u062F\u0641\u0639\u0629 (${currentBatchItems.length} \u0635\u0646\u0641) \u0625\u0644\u0649 \u0627\u0644\u062D\u0627\u0641\u0638\u0629`
          : `Copied Batch #${focusBatchIndex + 1} summary (${currentBatchItems.length} items) to clipboard`,
        'success'
      );
    } else {
      onNotify('Failed to copy to clipboard', 'error');
    }
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

  // Archetype Pattern Studio application handler
  const handleApplyArchetypeToSandbox = (archetype, mode = 'matching') => {
    let count = 0;
    setStagedItems(prev => {
      return prev.map(item => {
        const matches = mode === 'all' || item.matchedArchetypeId === archetype.id;
        if (matches) {
          count++;
          return applyArchetypeToItem(item, archetype);
        }
        return item;
      });
    });
    refreshArchetypes();
    onNotify(`Applied ${archetype.name} to ${count} staged items in sandbox`, 'success');
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
              onClick={() => {
                refreshArchetypes();
                setIsStudioOpen(true);
              }}
              className={`h-9 inline-flex items-center gap-2 text-xs font-bold px-3.5 rounded-xl border transition cursor-pointer shadow-xs ${
                isLight 
                  ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-300' 
                  : 'bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border-cyan-700/60'
              }`}
              title="Open Archetype Pattern Studio to visually configure naming rules"
            >
              <Sparkles className="w-4 h-4 text-cyan-500" />
              <span>{isAr ? '\u0627\u0633\u062A\u062F\u064A\u0648 \u0627\u0644\u0623\u0646\u0645\u0627\u0637 (Studio)' : 'Archetype Studio'}</span>
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
              onClick={handleToggleFocus10Mode}
              className={`h-9 inline-flex items-center gap-2 text-xs font-bold px-3.5 rounded-xl border transition cursor-pointer shadow-xs ${
                isFocus10Mode
                  ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 shadow-rose-600/30 ring-2 ring-rose-500/40'
                  : isLight 
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300' 
                  : 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-700/60'
              }`}
              title="Focus 10 Mode: Review unapproved items in bite-sized batches of 10"
            >
              <Target className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              <span>{isAr ? '\u0641\u062D\u0635 10 \u0623\u0635\u0646\u0627\u0641 (Review Queue)' : '🎯 Inspect Next 10'}</span>
              {focusQueue.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-500 text-white font-black leading-none">
                  {focusQueue.length}
                </span>
              )}
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

      {/* Metric KPI Summary Cards (3-Tier Traffic Light + Resolved) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
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
            <span>{isAr ? '\u0634\u0630\u0648\u0630 / \u0631\u0645\u0648\u0632 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629' : 'Syntax Anomalies'}</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-500">{metrics.anomalies}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Garbage tokens flagged</div>
        </div>

        <div className={`p-4 rounded-xl border ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0f172a] border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
            <span>{isAr ? '\u062A\u0645 \u0627\u0644\u062A\u0648\u062D\u064A\u062F \u0648\u0627\u0644\u062D\u0633\u0645' : 'Harmonized / Resolved'}</span>
            <ShieldCheck className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-black text-teal-500">{metrics.resolved}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Approved or snapped</div>
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
              onClick={() => setFilterMode('anomaly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                filterMode === 'anomaly'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : isLight ? 'text-rose-700 bg-rose-50 hover:bg-rose-100' : 'text-rose-400 bg-rose-950/40 hover:bg-rose-900/40'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              <span>Anomalies ({metrics.anomalies})</span>
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

        {/* Focus 10 Mode Stepper Banner */}
        {isFocus10Mode && (
          <div className={`p-4 border-b transition-all ${
            isLight
              ? 'bg-rose-50/80 border-rose-200 text-rose-950'
              : 'bg-rose-950/30 border-rose-900/60 text-rose-100'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold shadow-sm shadow-rose-600/30 shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-xs uppercase tracking-wide text-rose-600 dark:text-rose-400">
                      {isAr ? '\u0648\u0636\u0639 \u0627\u0644\u062A\u0631\u0643\u064A\u0632 10 \u0623\u0635\u0646\u0627\u0641 (Focus 10 Mode)' : 'Focus 10 Review Mode'}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30">
                      {isAr
                        ? `\u062F\u0641\u0639\u0629 ${focusBatchIndex + 1} \u0645\u0646 ${totalBatches}`
                        : `Batch ${focusBatchIndex + 1} of ${totalBatches}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {focusQueue.length === 0
                      ? (isAr ? '\u0627\u0643\u062A\u0645\u0644 \u0641\u062D\u0635 \u0648\u0627\u0639\u062A\u0645\u0627\u062F \u062C\u0645\u064A\u0639 \u0627\u0644\u0623\u0635\u0646\u0627\u0641!' : 'All queued items in sandbox have been reviewed and approved!')
                      : (isAr
                        ? `${focusQueue.length} \u0635\u0646\u0641 \u0645\u062A\u0628\u0642\u064A \u0641\u064A \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0641\u062D\u0635 \u2022 \u064A\u062A\u0645 \u0639\u0631\u0636 10 \u0623\u0635\u0646\u0627\u0641 \u062A\u062F\u0631\u064A\u062C\u064A\u0627\u064B \u0644\u062A\u0641\u0627\u062F\u064A \u0627\u0644\u062A\u0634\u062A\u062A`
                        : `${focusQueue.length} items remaining in queue • Prioritizing anomalies & variances in bite-sized batches`)}
                  </p>
                </div>
              </div>

              {/* Stepper Navigation & Batch Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 border border-slate-300 dark:border-slate-700 rounded-lg p-0.5 bg-slate-100 dark:bg-slate-900">
                  <button
                    type="button"
                    disabled={focusBatchIndex === 0}
                    onClick={() => setFocusBatchIndex(prev => Math.max(0, prev - 1))}
                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Previous Batch"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-xs px-2 font-bold">
                    {focusBatchIndex + 1} / {totalBatches}
                  </span>
                  <button
                    type="button"
                    disabled={focusBatchIndex >= totalBatches - 1}
                    onClick={() => setFocusBatchIndex(prev => Math.min(totalBatches - 1, prev + 1))}
                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Next Batch"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {currentBatchItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyBatchSummary}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                      isBatchCopied
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/25'
                        : isLight
                        ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
                    }`}
                    title="Copy active 10-item batch analysis summary to clipboard as Markdown"
                  >
                    {isBatchCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>{isAr ? '\u062A\u0645 \u0646\u0633\u062E \u0627\u0644\u062F\u0641\u0639\u0629!' : 'Copied Batch!'}</span>
                      </>
                    ) : (
                      <>
                        <ClipboardCopy className="w-3.5 h-3.5 text-cyan-500" />
                        <span>{isAr ? '\u0646\u0633\u062E \u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u062F\u0641\u0639\u0629' : 'Copy Batch Summary'}</span>
                      </>
                    )}
                  </button>
                )}

                {currentBatchItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleApproveCurrentBatch}
                    className="h-8 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-600/30"
                    title="Approve all items in this 10-item batch and fetch the next batch"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>{isAr ? '\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062F\u0641\u0639\u0629 \u0648\u062C\u0644\u0628 \u0627\u0644\u062A\u0627\u0644\u064A\u0629' : 'Approve Batch & Fetch Next 10'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsFocus10Mode(false)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    isLight ? 'border-slate-300 hover:bg-slate-200 text-slate-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                  }`}
                  title="Exit Focus Mode and view all items"
                >
                  <span>{isAr ? '\u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062A\u0631\u0643\u064A\u0632' : 'Exit Focus'}</span>
                </button>
              </div>
            </div>

            {/* Stepper Progress Bar */}
            <div className="mt-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{
                  width: `${metrics.total > 0 ? Math.round(((metrics.total - focusQueue.length) / metrics.total) * 100) : 0}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Diagnostic Table */}
        <div className="overflow-x-auto max-h-[640px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className={`sticky top-0 z-10 border-b ${
              isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
            }`}>
              <tr>
                <th className="py-3 px-3.5 font-bold w-24">Item Code</th>
                <th className="py-3 px-3 font-bold w-36">Source Origin</th>
                <th className="py-3 px-3.5 font-bold min-w-[220px]">Original Raw Description</th>
                <th className="py-3 px-3.5 font-bold min-w-[260px]">Standardized Clean Description</th>
                <th className="py-3 px-2 font-bold text-center w-16">OD</th>
                <th className="py-3 px-2 font-bold text-center w-20">WT (mm)</th>
                <th className="py-3 px-2.5 font-bold text-center w-24">Rating / SDR</th>
                <th className="py-3 px-2.5 font-bold text-center w-28">Standard</th>
                <th className="py-3 px-2 font-bold text-center w-16">Joint</th>
                <th className="py-3 px-2 font-bold text-center w-16">Length</th>
                <th className="py-3 px-3 font-bold text-center min-w-[130px]">Matched Archetype</th>
                <th className="py-3 px-3 font-bold text-center w-40">Governance Status</th>
                <th className="py-3 px-3.5 font-bold text-center w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    {isFocus10Mode && focusQueue.length === 0 ? (
                      <div className="space-y-2">
                        <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 animate-bounce" />
                        <p className="font-bold text-sm text-emerald-500">
                          {isAr ? '\u0627\u0643\u062A\u0645\u0644 \u0641\u062D\u0635 \u0648\u0627\u0639\u062A\u0645\u0627\u062F \u062C\u0645\u064A\u0639 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0641\u064A \u0628\u064A\u0626\u0629 \u0627\u0644\u062A\u062C\u0627\u0631\u0628!' : 'All staged items in sandbox have been reviewed and approved!'}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {isAr ? '\u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0622\u0646 \u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0648\u062D\u062F \u0623\u0648 \u0627\u0639\u062A\u0645\u0627\u062F\u0647 \u0643\u062F\u0644\u064A\u0644 \u0631\u0626\u064A\u0633\u064A.' : 'You can now export the Clean Spring catalog or promote to Master Catalog.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsFocus10Mode(false)}
                          className="mt-2 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                        >
                          {isAr ? '\u0639\u0631\u0636 \u062C\u0645\u064A\u0639 \u0627\u0644\u0623\u0635\u0646\u0627\u0641' : 'View All Staged Items'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <Sliders className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="font-semibold">No staged products found in sandbox.</p>
                        <p className="text-[11px] mt-1 text-slate-500">
                          Click <strong>"Load Active Catalog"</strong>, <strong>"Upload Workbook"</strong>, or <strong>"Load Test Fixtures"</strong> above to begin.
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isVariance = item.status === 'variance';
                  const isAnomaly = item.status === 'anomaly' || item.hasAnomaly;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => {
                        setSelectedItem(item);
                        setIsDrawerOpen(true);
                      }}
                      className={`transition-colors cursor-pointer ${
                        isAnomaly
                          ? isLight
                            ? 'bg-rose-50/70 hover:bg-rose-100/70'
                            : 'bg-rose-950/20 hover:bg-rose-900/30'
                          : isVariance
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

                      {/* Source Origin Column */}
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            item.ingestionType === 'DAILY_LOG'
                              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                              : item.ingestionType === 'ERP_CACHE'
                              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                              : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                          }`}>
                            {item.ingestionType || 'PLANNING_CATALOG'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveContextItem(item);
                            }}
                            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition cursor-pointer"
                            title="View Raw Source Record Context"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[130px] mt-0.5" title={item.sourceFile}>
                          {item.sourceFile || 'AlManar_9.xlsb'}
                        </div>
                        <div className="text-[9px] text-slate-500 truncate max-w-[130px]">
                          {item.sourceSheet || 'Unique Planning'} • {item.sourceRow || 'Row #1'}
                        </div>
                      </td>

                      {/* Original Raw Description Column with Anomaly Highlighting & Inline Editing */}
                      <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 font-mono text-[11px] group">
                        {inlineEditingItemId === item.id ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={inlineEditText}
                              onChange={(e) => setInlineEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveInlineEdit(item, e);
                                if (e.key === 'Escape') {
                                  setInlineEditingItemId(null);
                                  setInlineEditText('');
                                }
                              }}
                              autoFocus
                              className={`h-7 px-2 text-xs rounded border w-full font-mono ${
                                isLight ? 'bg-white border-cyan-500 text-slate-900' : 'bg-slate-900 border-cyan-500 text-slate-100'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={(e) => handleSaveInlineEdit(item, e)}
                              className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                              title="Save Clean Description"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInlineEditingItemId(null);
                                setInlineEditText('');
                              }}
                              className="p-1 rounded bg-slate-600 hover:bg-slate-700 text-white cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="break-all">{item.rawDescription}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInlineEditingItemId(item.id);
                                  setInlineEditText(item.rawDescription);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-cyan-400 transition cursor-pointer shrink-0"
                                title="Edit Raw Description"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </div>

                            {item.unparsedTokens && item.unparsedTokens.length > 0 && (
                              <div className="mt-1 flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-500 border border-rose-500/30">
                                  <AlertTriangle className="w-3 h-3 text-rose-500" />
                                  <span>Unparsed: "{item.unparsedTokens.join(', ')}"</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handlePurgeGarbage(item, e)}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1 cursor-pointer"
                                  title="Purge unparsed garbage tokens"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                  <span>{isAr ? '\u062A\u0646\u0642\u064A\u0629' : 'Purge'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
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
                      <td className="py-2.5 px-3 text-center whitespace-nowrap font-mono text-[11px]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                          {item.matchedArchetypeBadge || item.matchedArchetypeName || '#1 Metric'}
                        </span>
                      </td>

                      {/* 3-Tier Traffic Light Governance Status */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {isAnomaly && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                            title={item.conflictNotes}
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            <span>Anomaly / Garbage</span>
                          </span>
                        )}
                        {!isAnomaly && item.isApproved && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            <CheckSquare className="w-3 h-3" />
                            <span>Batch Approved</span>
                          </span>
                        )}
                        {!isAnomaly && !item.isApproved && item.status === 'variance' && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            title={item.conflictNotes}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>Spec Variance (Std: {item.officialStandardWtMm}mm)</span>
                          </span>
                        )}
                        {!isAnomaly && !item.isApproved && item.status === 'clean' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Standard Matched</span>
                          </span>
                        )}
                        {!isAnomaly && !item.isApproved && item.status === 'overridden' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                            <Check className="w-3 h-3" />
                            <span>Commercial Override</span>
                          </span>
                        )}
                        {!isAnomaly && !item.isApproved && item.status === 'snapped' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30">
                            <Check className="w-3 h-3" />
                            <span>Snapped to Standard</span>
                          </span>
                        )}
                        {!isAnomaly && !item.isApproved && item.status === 'custom' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                            <Edit3 className="w-3 h-3" />
                            <span>Custom Edit</span>
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                        {isAnomaly ? (
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {item.unparsedTokens?.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => handlePurgeGarbage(item, e)}
                                className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[10px] cursor-pointer shadow-xs flex items-center gap-1"
                                title="Purge Garbage Tokens"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Purge</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedItem(item);
                                setIsDrawerOpen(true);
                              }}
                              className={`px-2 py-1 rounded text-[10px] font-semibold border transition cursor-pointer ${
                                isLight ? 'hover:bg-slate-200 border-slate-300' : 'hover:bg-slate-700 border-slate-700'
                              }`}
                            >
                              Fix / Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleCopyRowAnalysis(item, e)}
                              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center shrink-0 ${
                                copiedItemId === item.id
                                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                                  : isLight
                                  ? 'bg-white hover:bg-slate-100 text-slate-500 hover:text-cyan-600 border-slate-300'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 border-slate-700'
                              }`}
                              title={copiedItemId === item.id ? 'Copied to clipboard!' : 'Copy item analysis to clipboard as Markdown'}
                            >
                              {copiedItemId === item.id ? (
                                <Check className="w-3.5 h-3.5 text-white" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : isVariance ? (
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
                            <button
                              type="button"
                              onClick={(e) => handleCopyRowAnalysis(item, e)}
                              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center shrink-0 ${
                                copiedItemId === item.id
                                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                                  : isLight
                                  ? 'bg-white hover:bg-slate-100 text-slate-500 hover:text-cyan-600 border-slate-300'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 border-slate-700'
                              }`}
                              title={copiedItemId === item.id ? 'Copied to clipboard!' : 'Copy item analysis to clipboard as Markdown'}
                            >
                              {copiedItemId === item.id ? (
                                <Check className="w-3.5 h-3.5 text-white" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
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
                            <button
                              type="button"
                              onClick={(e) => handleCopyRowAnalysis(item, e)}
                              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center shrink-0 ${
                                copiedItemId === item.id
                                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                                  : isLight
                                  ? 'bg-white hover:bg-slate-100 text-slate-500 hover:text-cyan-600 border-slate-300'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 border-slate-700'
                              }`}
                              title={copiedItemId === item.id ? 'Copied to clipboard!' : 'Copy item analysis to clipboard as Markdown'}
                            >
                              {copiedItemId === item.id ? (
                                <Check className="w-3.5 h-3.5 text-white" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleCopyRowAnalysis(selectedItem, e)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                    copiedItemId === selectedItem.id
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20'
                      : isLight
                      ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title="Copy Markdown analysis to clipboard"
                >
                  {copiedItemId === selectedItem.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>{isAr ? '\u062A\u0645 \u0627\u0644\u0646\u0633\u062E!' : 'Copied!'}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-cyan-500" />
                      <span>{isAr ? '\u0646\u0633\u062E \u0627\u0644\u062A\u062D\u0644\u064A\u0644' : 'Copy Analysis'}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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

              {/* Anomaly & Unparsed Tokens Warning Card */}
              {selectedItem.unparsedTokens && selectedItem.unparsedTokens.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      <span>{isAr ? '\u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u0631\u0645\u0648\u0632 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629 (Anomaly)' : 'Unparsed Garbage Tokens Detected'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handlePurgeGarbage(selectedItem, e)}
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-xs"
                      title="Purge unparsed garbage tokens"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isAr ? '\u062A\u0646\u0642\u064A\u0629 \u0627\u0644\u0631\u0645\u0648\u0632' : 'Purge Garbage'}</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedItem.unparsedTokens.map((tok, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-rose-500/20 text-rose-400 border border-rose-500/40">
                        "{tok}"
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    {isAr ? '\u0647\u0630\u0647 \u0627\u0644\u0643\u0644\u0645\u0627\u062A \u0644\u0645 \u064A\u062A\u0639\u0631\u0641 \u0639\u0644\u064A\u0647\u0627 \u0645\u062D\u0631\u0643 \u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629. \u064A\u0645\u0643\u0646\u0643 \u062D\u0630\u0641\u0647\u0627 \u0628\u0636\u063A\u0637\u0629 \u0632\u0631.' : 'These words or symbols are unrecognized and can be purged automatically.'}
                  </p>
                </div>
              )}

              {/* Source Provenance Card in Drawer */}
              <div className={`p-4 rounded-xl border ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {isAr ? '\u0645\u0635\u062F\u0631 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0648\u0627\u0644\u062A\u062A\u0628\u0639 (Source Provenance)' : 'Source Origin & Provenance'}
                  </div>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    selectedItem.ingestionType === 'DAILY_LOG'
                      ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                      : selectedItem.ingestionType === 'ERP_CACHE'
                      ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                      : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  }`}>
                    {selectedItem.ingestionType || 'PLANNING_CATALOG'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                  <div>
                    <div className="text-[10px] text-slate-400">File</div>
                    <div className="truncate font-semibold text-slate-300" title={selectedItem.sourceFile}>
                      {selectedItem.sourceFile || 'AlManar_9.xlsb'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Sheet</div>
                    <div className="truncate font-semibold text-slate-300">
                      {selectedItem.sourceSheet || 'Unique Planning'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Row</div>
                    <div className="truncate font-semibold text-slate-300">
                      {selectedItem.sourceRow || 'Row #1'}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setActiveContextItem(selectedItem)}
                    className="text-[10px] font-bold text-cyan-500 hover:text-cyan-400 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Info className="w-3 h-3" />
                    <span>{isAr ? '\u0639\u0631\u0636 \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u062E\u0627\u0645 \u0627\u0644\u0623\u0635\u0644\u064A' : 'View Raw Source JSON'}</span>
                  </button>
                </div>
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

              {/* Archetype Pattern Alignment */}
              <div className="p-3.5 rounded-xl border space-y-2 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <span>Archetype Pattern Alignment</span>
                  <span className="text-cyan-500 font-mono text-[10px]">
                    {selectedItem.matchedArchetypeBadge || selectedItem.matchedArchetypeName || 'Pattern #1'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {activeArchetypesList.map((arch) => {
                    const isCurrent = selectedItem.matchedArchetypeId === arch.id;
                    return (
                      <button
                        key={arch.id}
                        type="button"
                        onClick={() => {
                          const updated = applyArchetypeToItem(selectedItem, arch);
                          setStagedItems(prev => prev.map(i => i.id === updated.id ? updated : i));
                          setSelectedItem(updated);
                          onNotify(`Applied ${arch.name} to ${selectedItem.itemCode}`, 'success');
                        }}
                        className={`p-2 rounded-xl border text-left rtl:text-right transition cursor-pointer text-xs ${
                          isCurrent
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 font-bold'
                            : isLight ? 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700' : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="font-bold truncate text-[11px]">{arch.name}</div>
                        <div className="text-[10px] text-slate-400 truncate font-mono">{arch.code || 'ARCH'}</div>
                      </button>
                    );
                  })}
                </div>
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

      {/* Archetype Pattern Studio Modal */}
      <ArchetypePatternStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        stagedItems={stagedItems}
        onApplyArchetypeToSandbox={handleApplyArchetypeToSandbox}
        theme={theme}
        lang={lang}
        onNotify={onNotify}
      />

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
      {/* Raw Source Record Context Modal */}
      {activeContextItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setActiveContextItem(null)}
          />
          <div className={`relative w-full max-w-lg rounded-2xl shadow-2xl p-5 border z-10 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f172a] border-slate-800 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/60 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-500" />
                <div>
                  <h3 className="text-sm font-black">
                    {isAr ? '\u0633\u064A\u0627\u0642 \u0648\u0645\u0635\u062F\u0631 \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u062E\u0627\u0645' : 'Raw Source Provenance & Context'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {activeContextItem.itemCode} • {activeContextItem.sourceFile}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveContextItem(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-[11px] p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div>
                  <span className="text-slate-400 text-[10px]">Ingestion Type:</span>
                  <div className="font-mono font-bold text-cyan-400">{activeContextItem.ingestionType || 'PLANNING_CATALOG'}</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">Row Position:</span>
                  <div className="font-mono font-bold text-slate-200">{activeContextItem.sourceRow || 'Row #1'}</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">Source Sheet:</span>
                  <div className="font-mono text-slate-200 truncate">{activeContextItem.sourceSheet || 'Unique Planning'}</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">Source Workbook:</span>
                  <div className="font-mono text-slate-200 truncate">{activeContextItem.sourceFile || 'AlManar_9.xlsb'}</div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Raw Imported Record Data (As Ingested)
                </label>
                <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] overflow-auto max-h-60 text-emerald-400">
                  {JSON.stringify(activeContextItem.rawImportData || activeContextItem, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700/60">
              <button
                type="button"
                onClick={async () => {
                  const jsonStr = JSON.stringify(activeContextItem.rawImportData || activeContextItem, null, 2);
                  const ok = await copyToClipboard(jsonStr);
                  if (ok) {
                    setIsRawCopied(true);
                    setTimeout(() => setIsRawCopied(false), 2000);
                    onNotify(
                      isAr
                        ? '\u062A\u0645 \u0646\u0633\u062E \u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u062E\u0627\u0645 (JSON) \u0625\u0644\u0649 \u0627\u0644\u062D\u0627\u0641\u0638\u0629'
                        : 'Copied raw record JSON to clipboard',
                      'success'
                    );
                  } else {
                    onNotify('Failed to copy to clipboard', 'error');
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                  isRawCopied
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/25'
                    : 'bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border-cyan-500/40'
                }`}
              >
                {isRawCopied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isRawCopied ? (isAr ? '\u062A\u0645 \u0627\u0644\u0646\u0633\u062E!' : 'Copied!') : (isAr ? '\u0646\u0633\u062E \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A (JSON)' : 'Copy Raw JSON')}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveContextItem(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
