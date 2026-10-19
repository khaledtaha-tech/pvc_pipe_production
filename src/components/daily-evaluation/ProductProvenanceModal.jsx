import React, { useState, useEffect, useMemo } from 'react';
import {
  getAllProducts,
  formatSourceOriginLabel,
  getSourceOriginBadgeTheme,
  PRODUCT_CATALOG_UPDATED_EVENT,
  syncProductsWithServer,
  generateProvenanceAuditSnapshot,
  formatProvenanceAuditFilename,
  convertProvenanceSnapshotToCsv,
  compareProductCodes,
  scoreProductSearchRelevance,
  resolvePipeLinearWeight,
  extractPipeLength,
  extractProductDimensions
} from '../../logic/productCatalogHelper.js';
import { downloadBlob } from '../../logic/batchZipExport.js';

export default function ProductProvenanceModal({
  isOpen,
  onClose
}) {
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [originFilter, setOriginFilter] = useState('ALL');
  const [codeFilterType, setCodeFilterType] = useState('ALL'); // 'ALL' | 'NUMERIC' | 'SUFFIX' | 'COMPOUND'
  const [sortDirection, setSortDirection] = useState('none'); // 'none' | 'asc' | 'desc'
  const [feedback, setFeedback] = useState('');

  const handleToggleSortDirection = () => {
    setSortDirection((prev) => {
      if (prev === 'none') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'none';
    });
  };

  const loadProducts = () => {
    const all = getAllProducts();
    setProducts(all || []);
  };

  const handleExportJson = () => {
    try {
      const snapshot = generateProvenanceAuditSnapshot(products);
      const jsonContent = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const filename = formatProvenanceAuditFilename(new Date(), 'json');
      downloadBlob(blob, filename);
      setFeedback(`Exported ${snapshot.length} items to ${filename}`);
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.warn('Failed to export provenance audit JSON:', err);
      alert('Failed to export provenance audit JSON.');
    }
  };

  const handleExportCsv = () => {
    try {
      const snapshot = generateProvenanceAuditSnapshot(products);
      const csvContent = convertProvenanceSnapshotToCsv(snapshot);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const filename = formatProvenanceAuditFilename(new Date(), 'csv');
      downloadBlob(blob, filename);
      setFeedback(`Exported ${snapshot.length} items to ${filename}`);
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.warn('Failed to export provenance audit CSV:', err);
      alert('Failed to export provenance audit CSV.');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadProducts();
    syncProductsWithServer().catch(() => {});

    const handleUpdate = () => loadProducts();
    if (typeof window !== 'undefined') {
      window.addEventListener(PRODUCT_CATALOG_UPDATED_EVENT, handleUpdate);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(PRODUCT_CATALOG_UPDATED_EVENT, handleUpdate);
      }
    };
  }, [isOpen]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Summary counts for filter tabs
  const counts = useMemo(() => {
    const res = {
      all: products.length,
      planning_catalog: 0,
      manual_override: 0,
      daily_log: 0,
      preset_seed: 0
    };
    products.forEach((p) => {
      const origin = p.source_origin || (p.source === 'factory_preset' ? 'preset_seed' : (p.isPending ? 'daily_log' : 'planning_catalog'));
      if (res[origin] !== undefined) {
        res[origin]++;
      } else {
        res.preset_seed++;
      }
    });
    return res;
  }, [products]);

  // Filtered and sorted product records
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cFilter = codeFilter.trim().toLowerCase();

    // 1. Filter items
    const matches = products.filter((p) => {
      const origin = p.source_origin || (p.source === 'factory_preset' ? 'preset_seed' : (p.isPending ? 'daily_log' : 'planning_catalog'));
      if (originFilter !== 'ALL' && origin !== originFilter) {
        return false;
      }

      // Dedicated Inline Item Code Filter (case-insensitive substring match)
      if (cFilter) {
        const itemCodeStr = String(p.itemCode || p.code || p.item_code || '').trim().toLowerCase();
        if (!itemCodeStr.includes(cFilter)) {
          return false;
        }
      }

      // Quick Code Type Filter
      if (codeFilterType !== 'ALL') {
        const code = String(p.itemCode || '').trim();
        const isComp = Boolean(p.isCompounding || /^COMP|^PEL|^BLEND/i.test(code));
        const isNumeric = /^\d+(?:\.\d+)?$/.test(code);
        const hasSuffix = /\d+.*[a-zA-Z]|[a-zA-Z].*\d+/.test(code) && !isComp;

        if (codeFilterType === 'NUMERIC' && !isNumeric) return false;
        if (codeFilterType === 'SUFFIX' && !hasSuffix) return false;
        if (codeFilterType === 'COMPOUND' && !isComp) return false;
      }

      if (!q) return true;

      const code = String(p.itemCode || '').toLowerCase();
      const desc = String(p.description || '').toLowerCase();
      const od = String(p.odMm || '').toLowerCase();
      const wt = String(p.wallThickness || '').toLowerCase();
      const file = String(p.source_file || '').toLowerCase();
      const sheet = String(p.source_sheet || '').toLowerCase();

      return (
        code.includes(q) ||
        desc.includes(q) ||
        od.includes(q) ||
        wt.includes(q) ||
        file.includes(q) ||
        sheet.includes(q)
      );
    });

    // 2. Sort items
    if (sortDirection !== 'none') {
      return matches.slice().sort((a, b) => compareProductCodes(a, b, sortDirection));
    }

    if (q) {
      // Prioritize exact / prefix match on itemCode when searching
      return matches.slice().sort((a, b) => {
        const scoreA = scoreProductSearchRelevance(a, q);
        const scoreB = scoreProductSearchRelevance(b, q);
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        return compareProductCodes(a, b, 'asc');
      });
    }

    // Default: natural ascending sort
    return matches.slice().sort((a, b) => compareProductCodes(a, b, 'asc'));
  }, [products, searchQuery, codeFilter, originFilter, codeFilterType, sortDirection]);

  if (!isOpen) return null;

  return (
    <div className="export-modal-backdrop no-print" onClick={onClose}>
      <div
        className="export-modal-dialog print-sop-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-provenance-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1440, width: '96vw', height: '94vh', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal Header */}
        <div className="export-modal-header py-2.5 px-5" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="flex items-center gap-3">
            <div className="export-modal-header-icon-wrap" style={{ background: '#ecfdf5', color: '#059669', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="product-provenance-modal-title" className="text-sm font-bold text-slate-800 dark:text-slate-100 m-0">
                  Product Provenance &amp; Source Attribution Inspector
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {counts.all} Products Registered
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 m-0">
                Traceability of specifications (Std Weight, OD, SDR, Target Pace, and Workbook Origin Files).
              </p>
            </div>
          </div>
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            aria-label="Close inspector"
            style={{ padding: 4 }}
          >
            &times;
          </button>
        </div>

        {/* Unified High-Density Filter & Search Toolbar */}
        <div className="px-5 py-2 bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5" style={{ flexShrink: 0 }}>
          {/* Interactive Source Filter Pills with Built-in Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                originFilter === 'ALL'
                  ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => setOriginFilter('ALL')}
              title="Show all registered catalog items"
            >
              <span>All Sources</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${originFilter === 'ALL' ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>
                {counts.all}
              </span>
            </button>

            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                originFilter === 'planning_catalog'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
              }`}
              onClick={() => setOriginFilter('planning_catalog')}
              title="Filter items from Unique Planning Catalog workbook"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Planning Catalog</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${originFilter === 'planning_catalog' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'}`}>
                {counts.planning_catalog}
              </span>
            </button>

            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                originFilter === 'manual_override'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40'
              }`}
              onClick={() => setOriginFilter('manual_override')}
              title="Filter items with calibrated floor overrides"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>Floor Overrides</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${originFilter === 'manual_override' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'}`}>
                {counts.manual_override}
              </span>
            </button>

            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                originFilter === 'daily_log'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/40'
              }`}
              onClick={() => setOriginFilter('daily_log')}
              title="Filter items dynamically discovered in daily production logs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <span>Daily Logs</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${originFilter === 'daily_log' ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200'}`}>
                {counts.daily_log}
              </span>
            </button>

            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                originFilter === 'preset_seed'
                  ? 'bg-slate-600 text-white border-slate-600 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => setOriginFilter('preset_seed')}
              title="Filter factory default presets"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>Default Seed</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${originFilter === 'preset_seed' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>
                {counts.preset_seed}
              </span>
            </button>
          </div>

          {/* Quick Filter and Search Controls */}
          <div className="flex items-center gap-2">
            {/* Quick Code Type Dropdown */}
            <select
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
              value={codeFilterType}
              onChange={(e) => setCodeFilterType(e.target.value)}
              title="Filter by item code category"
              aria-label="Filter by item code category"
            >
              <option value="ALL">All Code Types</option>
              <option value="NUMERIC">Numeric Only (12, 188...)</option>
              <option value="SUFFIX">Suffix Codes (247 R...)</option>
              <option value="COMPOUND">Compounds / Pellets</option>
            </select>

            {/* Search Input Box */}
            <div className="relative w-52 sm:w-64">
              <input
                type="text"
                className="w-full text-xs px-2.5 py-1 pl-7 pr-6 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Search code, spec, file..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg
                className="absolute left-2 top-1.5 text-slate-400"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  className="absolute right-2 top-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer font-bold leading-none"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Provenance Table Body - Maximized Screen Real Estate */}
        <div className="flex-1 overflow-auto px-5 py-2 bg-white dark:bg-slate-900" style={{ minHeight: 0 }}>
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <svg className="mx-auto mb-3" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <div className="text-sm font-medium">No matching products found</div>
              <div className="text-xs mt-1">Try adjusting your search query or origin filter.</div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-700 shadow-2xs">
                <tr>
                  <th
                    className={`py-2 px-3 font-semibold min-w-[130px] w-36 select-none transition-colors group align-top bg-slate-100 dark:bg-slate-800 ${
                      sortDirection !== 'none'
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'hover:bg-slate-200/70 dark:hover:bg-slate-700/70 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div
                      className="flex items-center justify-between gap-1 cursor-pointer py-0.5 hover:text-emerald-700 dark:hover:text-emerald-400"
                      onClick={handleToggleSortDirection}
                      title={`Sort by Item Code (${
                        sortDirection === 'asc'
                          ? 'Sorted Ascending - click to sort Descending'
                          : sortDirection === 'desc'
                          ? 'Sorted Descending - click to reset'
                          : 'Click to sort Ascending'
                      })`}
                    >
                      <span className="font-semibold text-xs">Item Code</span>
                      <span
                        className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold transition-all ${
                          sortDirection !== 'none'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-slate-400 group-hover:text-emerald-600'
                        }`}
                      >
                        {sortDirection === 'asc' ? '▲' : sortDirection === 'desc' ? '▼' : '↕'}
                      </span>
                    </div>

                    {/* Inline Column Input Filter */}
                    <div className="relative mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        className="w-full text-[11px] px-2 py-1 pr-5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-normal font-mono"
                        placeholder="Filter code..."
                        value={codeFilter}
                        onChange={(e) => setCodeFilter(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        title="Filter by specific item code or sub-code"
                        aria-label="Filter by item code"
                      />
                      {codeFilter && (
                        <button
                          type="button"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer font-bold leading-none p-0.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCodeFilter('');
                          }}
                          title="Clear code filter"
                          aria-label="Clear code filter"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </th>
                  <th className="py-2.5 px-3 font-semibold min-w-[200px] align-top bg-slate-100 dark:bg-slate-800">Description &amp; Standard Specs</th>
                  <th className="py-2.5 px-3 font-semibold w-24 align-top bg-slate-100 dark:bg-slate-800">OD &times; Wall (SDR)</th>
                  <th className="py-2.5 px-3 font-semibold text-center w-16 align-top bg-slate-100 dark:bg-slate-800">Length (m)</th>
                  <th className="py-2.5 px-3 font-semibold text-right w-24 align-top bg-slate-100 dark:bg-slate-800">Linear Wt (kg/m)</th>
                  <th className="py-2.5 px-3 font-semibold text-right w-24 align-top bg-slate-100 dark:bg-slate-800">Std Wt (kg/pc)</th>
                  <th className="py-2.5 px-3 font-semibold text-right w-24 align-top bg-slate-100 dark:bg-slate-800">Pace (pcs/h)</th>
                  <th className="py-2.5 px-3 font-semibold min-w-[160px] align-top bg-slate-100 dark:bg-slate-800">Source File &amp; Sheet</th>
                  <th className="py-2.5 px-3 font-semibold w-36 text-center align-top bg-slate-100 dark:bg-slate-800">Origin Type</th>
                  <th className="py-2.5 px-3 font-semibold w-24 text-right align-top bg-slate-100 dark:bg-slate-800">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProducts.map((item) => {
                  const origin = item.source_origin || (item.source === 'factory_preset' ? 'preset_seed' : (item.isPending ? 'daily_log' : 'planning_catalog'));
                  const badgeTheme = getSourceOriginBadgeTheme(origin);
                  const dims = extractProductDimensions(item);
                  const pipeLen = item.isCompounding ? 0 : (Number(item.pipe_length_m || item.pipeLength) > 0 ? Number(item.pipe_length_m || item.pipeLength) : extractPipeLength(item.description, 6.0));
                  const rawWeight = Number(item.unitWeight || item.stdWeight || item.piece_weight_kg || 0);
                  const linearWeight = (item.linear_weight_kg_m !== undefined && item.linear_weight_kg_m !== null && Number(item.linear_weight_kg_m) > 0)
                    ? Number(item.linear_weight_kg_m)
                    : resolvePipeLinearWeight(rawWeight, dims.od_mm, dims.wall_thickness_mm, pipeLen, item.isCompounding);
                  const pieceWeight = item.isCompounding
                    ? rawWeight
                    : ((item.piece_weight_kg !== undefined && item.piece_weight_kg !== null && Number(item.piece_weight_kg) > 0)
                        ? Number(item.piece_weight_kg)
                        : (rawWeight > 0 ? rawWeight : Number((linearWeight * (pipeLen > 0 ? pipeLen : 6.0)).toFixed(2))));
                  const pace = item.targetPcsH ? Number(item.targetPcsH) : null;
                  const formattedDate = item.last_updated_at || item.updatedAt
                    ? new Date(item.last_updated_at || item.updatedAt).toLocaleDateString()
                    : 'Preset';

                  return (
                    <tr
                      key={item.itemCode}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {/* Item Code */}
                      <td className="py-2.5 px-3 font-bold font-mono text-slate-800 dark:text-slate-100">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          {item.itemCode}
                        </span>
                      </td>

                      {/* Description & Spec */}
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-200">
                        <div className="font-medium">{item.description}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">
                          Material: {item.material || 'uPVC'} {item.primaryExtruder ? `| Primary: ${item.primaryExtruder}` : ''}
                        </div>
                      </td>

                      {/* OD x Wall (SDR) */}
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-mono">
                        <div>{item.odMm ? `${item.odMm} mm` : '--'}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">{item.wallThickness || '--'}</div>
                      </td>

                      {/* Length (m) */}
                      <td className="py-2.5 px-3 text-center font-mono text-slate-700 dark:text-slate-300">
                        {item.isCompounding ? '--' : `${pipeLen}m`}
                      </td>

                      {/* Linear Weight (kg/m) */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {linearWeight > 0 ? linearWeight.toFixed(3) : '--'}
                      </td>

                      {/* Std Piece Weight (kg/pc) */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-100">
                        {pieceWeight > 0 ? pieceWeight.toFixed(2) : '--'}
                      </td>

                      {/* Pace */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {pace ? (
                          <>
                            <div className="font-semibold text-emerald-600 dark:text-emerald-400">{pace} pcs/h</div>
                            <div className="text-[10px] text-slate-400">{Math.round(pace * 24)} / day</div>
                          </>
                        ) : (
                          <span className="text-slate-400">--</span>
                        )}
                      </td>

                      {/* Source File & Sheet */}
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        <div className="font-medium truncate max-w-[200px]" title={item.source_file || 'System Defaults'}>
                          {item.source_file || 'System Defaults'}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[200px]" title={item.source_sheet || 'Factory Presets'}>
                          Tab: {item.source_sheet || 'Factory Presets'}
                        </div>
                      </td>

                      {/* Origin Badge */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10.5px] font-semibold border ${badgeTheme.classes}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badgeTheme.dotClass}`} />
                          <span>{badgeTheme.label}</span>
                        </span>
                      </td>

                      {/* Updated Date */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400 dark:text-slate-500 text-[11px]">
                        {formattedDate}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3" style={{ flexShrink: 0 }}>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>
              Showing {filteredProducts.length} of {products.length} registered catalog items
              {sortDirection !== 'none' && (
                <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  (Sorted {sortDirection === 'asc' ? 'Ascending ▲' : 'Descending ▼'})
                </span>
              )}
              {codeFilter && (
                <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  (Code: &quot;{codeFilter}&quot;)
                </span>
              )}
              {codeFilterType !== 'ALL' && (
                <span className="ml-1 text-slate-600 dark:text-slate-300 font-medium">
                  [{codeFilterType}]
                </span>
              )}
            </span>
            {feedback && (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>{feedback}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Export JSON Button */}
            <button
              type="button"
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer inline-flex items-center gap-1.5"
              onClick={handleExportJson}
              title="Download structured JSON snapshot of all catalog items and provenance metadata"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export Provenance Audit (JSON)</span>
            </button>

            {/* Export CSV Button */}
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
              onClick={handleExportCsv}
              title="Download CSV table of catalog specifications and provenance"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span>Export (CSV)</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
              onClick={onClose}
            >
              Close Inspector
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
