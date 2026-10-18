import React, { useState, useEffect, useMemo } from 'react';
import {
  getAllProducts,
  formatSourceOriginLabel,
  getSourceOriginBadgeTheme,
  PRODUCT_CATALOG_UPDATED_EVENT,
  syncProductsWithServer,
  generateProvenanceAuditSnapshot,
  formatProvenanceAuditFilename,
  convertProvenanceSnapshotToCsv
} from '../../logic/productCatalogHelper.js';
import { downloadBlob } from '../../logic/batchZipExport.js';

export default function ProductProvenanceModal({
  isOpen,
  onClose
}) {
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [originFilter, setOriginFilter] = useState('ALL');
  const [feedback, setFeedback] = useState('');

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

  // Filtered product records
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const origin = p.source_origin || (p.source === 'factory_preset' ? 'preset_seed' : (p.isPending ? 'daily_log' : 'planning_catalog'));
      if (originFilter !== 'ALL' && origin !== originFilter) {
        return false;
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
  }, [products, searchQuery, originFilter]);

  if (!isOpen) return null;

  return (
    <div className="export-modal-backdrop no-print" onClick={onClose}>
      <div
        className="export-modal-dialog print-sop-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-provenance-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1040, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal Header */}
        <div className="export-modal-header" style={{ flexShrink: 0 }}>
          <div className="export-modal-header-left">
            <div className="export-modal-header-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </div>
            <div>
              <h3 id="product-provenance-modal-title" className="export-modal-title">
                Product Provenance &amp; Source Attribution Inspector
              </h3>
              <p className="export-modal-subtitle">
                Complete traceability of product specifications (Std Weight, OD, SDR, Target Pace, and Workbook Origin Files).
              </p>
            </div>
          </div>
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            aria-label="Close inspector"
          >
            &times;
          </button>
        </div>

        {/* Origin Quick Stats Bar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-2.5" style={{ flexShrink: 0 }}>
          <div className="bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total Catalog Items</div>
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{counts.all}</div>
          </div>
          <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 shadow-2xs">
            <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Planning Catalog</div>
            <div className="text-lg font-bold text-emerald-800 dark:text-emerald-200">{counts.planning_catalog}</div>
          </div>
          <div className="bg-amber-50/60 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/50 shadow-2xs">
            <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Manual Overrides</div>
            <div className="text-lg font-bold text-amber-800 dark:text-amber-200">{counts.manual_override}</div>
          </div>
          <div className="bg-purple-50/60 dark:bg-purple-950/30 p-2.5 rounded-lg border border-purple-200 dark:border-purple-800/50 shadow-2xs">
            <div className="text-[11px] font-medium text-purple-700 dark:text-purple-400">Daily Log Discoveries</div>
            <div className="text-lg font-bold text-purple-800 dark:text-purple-200">{counts.daily_log}</div>
          </div>
          <div className="bg-slate-100/70 dark:bg-slate-800/70 p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 shadow-2xs">
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Default Presets</div>
            <div className="text-lg font-bold text-slate-700 dark:text-slate-200">{counts.preset_seed}</div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3" style={{ flexShrink: 0 }}>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                originFilter === 'ALL'
                  ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => setOriginFilter('ALL')}
            >
              All Sources ({counts.all})
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                originFilter === 'planning_catalog'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
              }`}
              onClick={() => setOriginFilter('planning_catalog')}
            >
              Planning Catalog ({counts.planning_catalog})
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                originFilter === 'manual_override'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40'
              }`}
              onClick={() => setOriginFilter('manual_override')}
            >
              Floor Overrides ({counts.manual_override})
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                originFilter === 'daily_log'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/40'
              }`}
              onClick={() => setOriginFilter('daily_log')}
            >
              Daily Logs ({counts.daily_log})
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                originFilter === 'preset_seed'
                  ? 'bg-slate-600 text-white border-slate-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => setOriginFilter('preset_seed')}
            >
              Default Seed ({counts.preset_seed})
            </button>
          </div>

          <div className="relative flex-1 sm:w-64 sm:flex-initial">
            <input
              type="text"
              className="w-full text-xs px-3 py-1.5 pl-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Search code, spec, file..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <svg
              className="absolute left-2.5 top-2 text-slate-400"
              width="14"
              height="14"
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
                className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                onClick={() => setSearchQuery('')}
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Provenance Table Body */}
        <div className="flex-1 overflow-auto p-4 bg-white dark:bg-slate-900">
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
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/75 dark:bg-slate-800/75 text-slate-600 dark:text-slate-300">
                  <th className="py-2.5 px-3 font-semibold w-24">Item Code</th>
                  <th className="py-2.5 px-3 font-semibold min-w-[220px]">Description &amp; Standard Specs</th>
                  <th className="py-2.5 px-3 font-semibold w-28">OD &times; Wall (SDR)</th>
                  <th className="py-2.5 px-3 font-semibold text-right w-24">Std Wt (kg)</th>
                  <th className="py-2.5 px-3 font-semibold text-right w-28">Pace (pcs/h)</th>
                  <th className="py-2.5 px-3 font-semibold min-w-[180px]">Source File &amp; Sheet</th>
                  <th className="py-2.5 px-3 font-semibold w-40 text-center">Origin Type</th>
                  <th className="py-2.5 px-3 font-semibold w-28 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProducts.map((item) => {
                  const origin = item.source_origin || (item.source === 'factory_preset' ? 'preset_seed' : (item.isPending ? 'daily_log' : 'planning_catalog'));
                  const badgeTheme = getSourceOriginBadgeTheme(origin);
                  const uWeight = Number(item.unitWeight || item.stdWeight || 0);
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

                      {/* Std Weight */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-100">
                        {uWeight > 0 ? uWeight.toFixed(2) : '--'}
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
            <span>Showing {filteredProducts.length} of {products.length} registered catalog items</span>
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
