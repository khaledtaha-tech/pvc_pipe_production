import React, { useState, useEffect, useMemo } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { MACHINES } from '../../config/machines.js';
import {
  getAllBaselines,
  saveBaselineRate,
  removeBaselineRate,
  syncBaselinesWithServer,
  saveBaselineRateToServer,
  removeBaselineRateFromServer,
  getFullMachineName,
  exportStandardsToExcel,
  BASELINE_CATALOG_UPDATED_EVENT
} from '../../logic/standardCatalogHelper.js';

export default function BaselineCatalogModal({
  isOpen,
  onClose,
  machineMaster = [],
  lang = 'en'
}) {
  const isAr = lang === 'ar';
  const [catalog, setCatalog] = useState({});
  const [editingHourly, setEditingHourly] = useState({});
  const [editingDaily, setEditingDaily] = useState({});
  const [savedRowKeys, setSavedRowKeys] = useState({});
  const [newLineId, setNewLineId] = useState('L-01');
  const [newProductCode, setNewProductCode] = useState('');
  const [newRate, setNewRate] = useState('');
  const [newDailyTarget, setNewDailyTarget] = useState('');
  const [feedback, setFeedback] = useState('');

  const lineOptions = useMemo(() => {
    return Array.isArray(machineMaster) && machineMaster.length > 0
      ? machineMaster
      : MACHINES;
  }, [machineMaster]);

  const loadCatalogData = () => {
    const data = getAllBaselines();
    setCatalog(data || {});
    const initialHourly = {};
    const initialDaily = {};
    Object.keys(data || {}).forEach((key) => {
      const entry = data[key];
      if (entry) {
        const hRate = Math.round(Number(entry.baselinePcsH) || 0);
        const dTarget = entry.dailyTargetPcs != null && Number(entry.dailyTargetPcs) > 0
          ? Math.round(Number(entry.dailyTargetPcs))
          : Math.round(hRate * 24);
        initialHourly[key] = hRate > 0 ? String(hRate) : '';
        initialDaily[key] = dTarget > 0 ? String(dTarget) : '';
      }
    });
    setEditingHourly(initialHourly);
    setEditingDaily(initialDaily);
  };

  useEffect(() => {
    if (!isOpen) return;
    loadCatalogData();
    // Fetch and merge fresh standards from central MySQL database
    syncBaselinesWithServer().catch(() => {});

    const handleCatalogUpdate = () => loadCatalogData();
    if (typeof window !== 'undefined') {
      window.addEventListener(BASELINE_CATALOG_UPDATED_EVENT, handleCatalogUpdate);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(BASELINE_CATALOG_UPDATED_EVENT, handleCatalogUpdate);
      }
    };
  }, [isOpen]);

  // Handle ESC key to close modal
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

  if (!isOpen) return null;

  const catalogEntries = Object.entries(catalog).map(([key, val]) => ({
    key,
    ...val
  }));

  // Sort by Line ID then Product Code
  catalogEntries.sort((a, b) => {
    const lineCmp = String(a.lineId || '').localeCompare(String(b.lineId || ''));
    if (lineCmp !== 0) return lineCmp;
    return String(a.productCode || '').localeCompare(String(b.productCode || ''));
  });

  const handleRowHourlyChange = (key, value) => {
    setEditingHourly((prev) => ({ ...prev, [key]: value }));
    if (value === '' || value === null) {
      setEditingDaily((prev) => ({ ...prev, [key]: '' }));
      return;
    }
    const num = Math.round(Number(value));
    if (!isNaN(num) && num > 0) {
      setEditingDaily((prev) => ({ ...prev, [key]: String(Math.round(num * 24)) }));
    } else {
      setEditingDaily((prev) => ({ ...prev, [key]: '' }));
    }
  };

  const handleRowDailyChange = (key, value) => {
    setEditingDaily((prev) => ({ ...prev, [key]: value }));
    if (value === '' || value === null) {
      setEditingHourly((prev) => ({ ...prev, [key]: '' }));
      return;
    }
    const num = Math.round(Number(value));
    if (!isNaN(num) && num > 0) {
      setEditingHourly((prev) => ({ ...prev, [key]: String(Math.round(num / 24)) }));
    } else {
      setEditingHourly((prev) => ({ ...prev, [key]: '' }));
    }
  };

  const handleHourlyRateChange = (e) => {
    const val = e.target.value;
    setNewRate(val);
    if (val === '' || val === null) {
      setNewDailyTarget('');
      return;
    }
    const num = Math.round(Number(val));
    if (!isNaN(num) && num > 0) {
      setNewDailyTarget(String(Math.round(num * 24)));
    } else {
      setNewDailyTarget('');
    }
  };

  const handleDailyTargetChange = (e) => {
    const val = e.target.value;
    setNewDailyTarget(val);
    if (val === '' || val === null) {
      setNewRate('');
      return;
    }
    const num = Math.round(Number(val));
    if (!isNaN(num) && num > 0) {
      setNewRate(String(Math.round(num / 24)));
    } else {
      setNewRate('');
    }
  };

  const handleSaveRow = async (entry) => {
    const currentHourlyVal = editingHourly[entry.key];
    const currentDailyVal = editingDaily[entry.key];
    let numHourly = Math.round(Number(currentHourlyVal));
    let numDaily = Math.round(Number(currentDailyVal));

    if ((isNaN(numHourly) || numHourly <= 0) && (!isNaN(numDaily) && numDaily > 0)) {
      numHourly = Math.round(numDaily / 24);
    }
    if ((isNaN(numDaily) || numDaily <= 0) && (!isNaN(numHourly) && numHourly > 0)) {
      numDaily = Math.round(numHourly * 24);
    }

    if (isNaN(numHourly) || numHourly <= 0) {
      alert('Please enter a valid positive integer rate.');
      return;
    }

    // Persist synchronously to localStorage and asynchronously to MySQL API
    saveBaselineRate(entry.lineId, entry.productCode, numHourly, entry.notes || '', numDaily);
    saveBaselineRateToServer(entry.lineId, entry.productCode, numHourly, entry.notes || '', numDaily).catch(() => {});
    loadCatalogData();

    // Trigger brief visual feedback on row
    setSavedRowKeys((prev) => ({ ...prev, [entry.key]: true }));
    setTimeout(() => {
      setSavedRowKeys((prev) => {
        const next = { ...prev };
        delete next[entry.key];
        return next;
      });
    }, 2500);

    const fullMachine = getFullMachineName(entry.lineId, lineOptions);
    setFeedback(`Saved ${fullMachine} - ${entry.productCode} at ${numHourly} pcs/h (${numDaily} pcs/day)`);
    setTimeout(() => setFeedback(''), 3500);
  };

  const handleDeleteRow = (entry) => {
    const fullMachine = getFullMachineName(entry.lineId, lineOptions);
    if (window.confirm(`Delete baseline standard for ${fullMachine} - ${entry.productCode}?`)) {
      removeBaselineRate(entry.lineId, entry.productCode);
      removeBaselineRateFromServer(entry.lineId, entry.productCode).catch(() => {});
      loadCatalogData();
      setFeedback(`Removed standard for ${fullMachine} - ${entry.productCode}`);
      setTimeout(() => setFeedback(''), 3000);
    }
  };

  const handleExportXlsx = () => {
    if (catalogEntries.length === 0) {
      alert(isAr ? '\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0639\u0627\u064A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0644\u0644\u062A\u0635\u062F\u064A\u0631' : 'No baseline standards available to export.');
      return;
    }
    try {
      const entriesToExport = catalogEntries.map((row) => {
        const currentHourlyVal = editingHourly[row.key] !== undefined
          ? editingHourly[row.key]
          : String(row.baselinePcsH || '');
        const currentDailyVal = editingDaily[row.key] !== undefined
          ? editingDaily[row.key]
          : String(
              row.dailyTargetPcs != null && Number(row.dailyTargetPcs) > 0
                ? row.dailyTargetPcs
                : (row.baselinePcsH ? Math.round(Number(row.baselinePcsH) * 24) : '')
            );

        const rate = Math.round(Number(currentHourlyVal) || Number(row.baselinePcsH) || 0);
        const daily = Math.round(
          Number(currentDailyVal) ||
          (row.dailyTargetPcs ? Number(row.dailyTargetPcs) : (rate > 0 ? rate * 24 : 0))
        );
        const printed = rate > 0 ? Math.round(rate / 0.85) : 0;
        const fullMachineName = getFullMachineName(row.lineId, lineOptions);

        return {
          machineLine: fullMachineName,
          lineId: row.lineId,
          productCode: row.productCode,
          approvedRealRate: rate,
          dailyTarget24h: daily,
          printedSopTarget: printed,
          timestamp: row.approvedDate || row.updatedAt || row.createdAt || ''
        };
      });

      const { filename } = exportStandardsToExcel(entriesToExport, lineOptions);
      setFeedback(
        isAr
          ? `\u062A\u0645 \u062A\u0635\u062F\u064A\u0631 ${entriesToExport.length} \u0645\u0639\u064A\u0627\u0631 \u0625\u0644\u0649 ${filename}`
          : `Exported ${entriesToExport.length} standards to ${filename}`
      );
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.error('Failed to export standards catalog to Excel:', err);
      alert('Error exporting standards catalog: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleAddNew = (e) => {
    e.preventDefault();
    const cleanCode = String(newProductCode).trim().toUpperCase();
    let numRate = Math.round(Number(newRate));
    let numDaily = Math.round(Number(newDailyTarget));

    if ((isNaN(numRate) || numRate <= 0) && (!isNaN(numDaily) && numDaily > 0)) {
      numRate = Math.round(numDaily / 24);
    }
    if ((isNaN(numDaily) || numDaily <= 0) && (!isNaN(numRate) && numRate > 0)) {
      numDaily = Math.round(numRate * 24);
    }

    if (!newLineId || !cleanCode) {
      alert('Please select a machine line and enter a product code.');
      return;
    }
    if (isNaN(numRate) || numRate <= 0) {
      alert('Please enter a valid positive integer rate or daily target.');
      return;
    }

    saveBaselineRate(newLineId, cleanCode, numRate, '', numDaily);
    saveBaselineRateToServer(newLineId, cleanCode, numRate, '', numDaily).catch(() => {});
    setNewProductCode('');
    setNewRate('');
    setNewDailyTarget('');
    loadCatalogData();
    const fullMachine = getFullMachineName(newLineId, lineOptions);
    setFeedback(`Added standard for ${fullMachine} - ${cleanCode} (${numRate} pcs/h | ${numDaily} pcs/day)`);
  };

  return (
    <div className="export-modal-backdrop no-print" onClick={onClose}>
      <div
        className="export-modal-dialog print-sop-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="baseline-catalog-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1400, width: '96vw', height: '94vh', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal Header */}
        <div className="export-modal-header">
          <div className="export-modal-header-left">
            <div className="export-modal-header-icon-wrap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M6 6h10" />
                <path d="M6 10h10" />
              </svg>
            </div>
            <div>
              <h3 id="baseline-catalog-modal-title" className="export-modal-title">
                Machine-Mold Standards Catalog
              </h3>
              <p className="export-modal-subtitle">
                Approved operational standards (pcs/h) per line and product mold. These baseline rates automatically seed Morning Blank SOP targets (DOC-Ext.-03) and 85% efficiency increments.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="standards-catalog-header-export-btn"
              onClick={handleExportXlsx}
              disabled={catalogEntries.length === 0}
              title={isAr ? '\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0645\u0639\u0627\u064A\u064A\u0631 (.xlsx)' : 'Export Standards (.xlsx)'}
            >
              <FileSpreadsheet size={15} />
              <span>{isAr ? '\u062A\u0635\u062F\u064A\u0631 (.xlsx)' : 'Export (.xlsx)'}</span>
            </button>
            <button
              type="button"
              className="export-modal-close-btn"
              onClick={onClose}
              aria-label="Close standards catalog"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className="standards-catalog-feedback">
            <span className="standards-catalog-feedback-dot" />
            <span>{feedback}</span>
          </div>
        )}

        <div className="standards-catalog-body">
          {/* Add New Standard Card / Row */}
          <form className="standards-catalog-add-form" onSubmit={handleAddNew}>
            <div className="standards-catalog-add-title">Add New Standard Baseline</div>
            <div className="standards-catalog-add-grid">
              <div className="standards-catalog-field">
                <label className="standards-catalog-label">Line ID:</label>
                <select
                  className="standards-catalog-select"
                  value={newLineId}
                  onChange={(e) => setNewLineId(e.target.value)}
                >
                  {lineOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} - {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="standards-catalog-field">
                <label className="standards-catalog-label">Product Code:</label>
                <input
                  type="text"
                  className="standards-catalog-input"
                  placeholder="e.g. 259, 255"
                  value={newProductCode}
                  onChange={(e) => setNewProductCode(e.target.value)}
                />
              </div>

              <div className="standards-catalog-field">
                <label className="standards-catalog-label">Daily Target (24h):</label>
                <input
                  type="number"
                  min="1"
                  max="500000"
                  step="1"
                  className="standards-catalog-input"
                  placeholder="e.g. 500"
                  value={newDailyTarget}
                  onChange={handleDailyTargetChange}
                />
              </div>

              <div className="standards-catalog-field">
                <label className="standards-catalog-label">Approved Rate (Pcs/h):</label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  className="standards-catalog-input"
                  placeholder="e.g. 21"
                  value={newRate}
                  onChange={handleHourlyRateChange}
                />
              </div>

              <div className="standards-catalog-field standards-catalog-preview-field">
                <label className="standards-catalog-label">Printed Target (85%):</label>
                <div className="standards-catalog-preview-val">
                  {Number(newRate) > 0 ? `${Math.round(Number(newRate) / 0.85)} pcs/h` : '-'}
                </div>
              </div>

              <div className="standards-catalog-add-action">
                <button type="submit" className="standards-catalog-add-btn">
                  Add Standard
                </button>
              </div>
            </div>
          </form>

          {/* Standards Table */}
          <div className="standards-catalog-table-wrap">
            <table className="standards-catalog-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Machine Line</th>
                  <th style={{ width: '13%' }}>Product Code</th>
                  <th style={{ width: '19%', textAlign: 'center' }}>Approved Real Rate (Pcs/h)</th>
                  <th style={{ width: '19%', textAlign: 'center' }}>Daily Target (24h)</th>
                  <th style={{ width: '14%', textAlign: 'center' }}>Printed SOP Target (85%)</th>
                  <th style={{ width: '13%', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {catalogEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="standards-catalog-empty">
                      No baseline standards saved yet. Add a standard using the form above or bookmark one from the Morning Blank SOP dialog.
                    </td>
                  </tr>
                ) : (
                  catalogEntries.map((row) => {
                    const fullMachineName = getFullMachineName(row.lineId, lineOptions);

                    const origHourly = String(row.baselinePcsH || '');
                    const origDaily = String(
                      row.dailyTargetPcs != null && Number(row.dailyTargetPcs) > 0
                        ? row.dailyTargetPcs
                        : (row.baselinePcsH ? Math.round(Number(row.baselinePcsH) * 24) : '')
                    );

                    const currentHourlyVal = editingHourly[row.key] !== undefined
                      ? editingHourly[row.key]
                      : origHourly;
                    const currentDailyVal = editingDaily[row.key] !== undefined
                      ? editingDaily[row.key]
                      : origDaily;

                    const numHourly = Number(currentHourlyVal);
                    const printedTargetVal = numHourly > 0 ? `${Math.round(numHourly / 0.85)} pcs/h` : '-';

                    const isChanged = (currentHourlyVal !== '' && currentHourlyVal !== origHourly) ||
                                      (currentDailyVal !== '' && currentDailyVal !== origDaily);
                    const isRowSaved = Boolean(savedRowKeys[row.key]);

                    return (
                      <tr key={row.key} className={isChanged ? 'row-modified' : ''}>
                        <td>
                          <span
                            className="standards-catalog-line-badge font-medium text-xs text-slate-800 dark:text-slate-200 inline-block whitespace-nowrap shadow-xs"
                            title={`Machine Line: ${fullMachineName}`}
                          >
                            {fullMachineName}
                          </span>
                        </td>
                        <td>
                          <strong className="standards-catalog-code">{row.productCode}</strong>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="inline-flex items-center justify-center gap-1">
                            <input
                              type="number"
                              min="1"
                              max="10000"
                              step="1"
                              className={`standards-catalog-rate-input ${isChanged ? 'input-modified' : ''}`}
                              style={{ width: '80px' }}
                              value={currentHourlyVal}
                              onChange={(e) => handleRowHourlyChange(row.key, e.target.value)}
                              title="Approved real hourly rate (pieces per hour)"
                            />
                            <span className="text-xs text-slate-400 font-medium">pcs/h</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="inline-flex items-center justify-center gap-1">
                            <input
                              type="number"
                              min="1"
                              max="500000"
                              step="1"
                              className={`standards-catalog-rate-input ${isChanged ? 'input-modified' : ''}`}
                              style={{ width: '85px' }}
                              value={currentDailyVal}
                              onChange={(e) => handleRowDailyChange(row.key, e.target.value)}
                              title="Daily 24-hour target (pieces)"
                            />
                            <span className="text-xs text-slate-400 font-medium">pcs</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="standards-catalog-target-pill">
                            {printedTargetVal}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="standards-catalog-actions">
                            <button
                              type="button"
                              className={`standards-btn-save ${isChanged ? 'highlight-save' : ''} ${isRowSaved ? 'saved-feedback' : ''}`}
                              onClick={() => handleSaveRow(row)}
                              title={isChanged ? 'Save unsaved changes to catalog' : 'Save standard rate'}
                            >
                              {isRowSaved ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  Saved
                                </span>
                              ) : isChanged ? (
                                <span>Save *</span>
                              ) : (
                                <span>Save</span>
                              )}
                            </button>
                            <button
                              type="button"
                              className="standards-btn-delete"
                              onClick={() => handleDeleteRow(row)}
                              title={`Delete standard for ${fullMachineName} - ${row.productCode}`}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="export-modal-footer standards-catalog-footer">
          <div className="standards-catalog-footer-left">
            <span className="standards-catalog-count-note">
              Total Standards: <strong>{catalogEntries.length}</strong>
            </span>
          </div>
          <div className="standards-catalog-footer-actions">
            <button
              type="button"
              className="standards-catalog-export-btn"
              onClick={handleExportXlsx}
              disabled={catalogEntries.length === 0}
              title={isAr ? '\u062A\u0635\u062F\u064A\u0631 \u062F\u0644\u064A\u0644 \u0627\u0644\u0645\u0639\u0627\u064A\u064A\u0631 \u0625\u0644\u0649 \u0645\u0644\u0641 \u0625\u0643\u0633\u0644 (.xlsx)' : 'Export Standards (.xlsx)'}
            >
              <FileSpreadsheet size={16} className="standards-catalog-export-icon" />
              <span>{isAr ? '\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0645\u0639\u0627\u064A\u064A\u0631 (.xlsx)' : 'Export Standards (.xlsx)'}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              {isAr ? '\u0625\u063A\u0644\u0627\u0642' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
