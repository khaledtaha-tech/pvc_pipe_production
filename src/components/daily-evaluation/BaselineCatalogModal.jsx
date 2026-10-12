import React, { useState, useEffect, useMemo } from 'react';
import { MACHINES } from '../../config/machines.js';
import {
  getAllBaselines,
  saveBaselineRate,
  removeBaselineRate,
  BASELINE_CATALOG_UPDATED_EVENT
} from '../../logic/standardCatalogHelper.js';

export default function BaselineCatalogModal({
  isOpen,
  onClose,
  machineMaster = []
}) {
  const [catalog, setCatalog] = useState({});
  const [editingRates, setEditingRates] = useState({});
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
    const initialEdits = {};
    Object.keys(data || {}).forEach((key) => {
      if (data[key]) {
        initialEdits[key] = data[key].baselinePcsH;
      }
    });
    setEditingRates(initialEdits);
  };

  useEffect(() => {
    if (!isOpen) return;
    loadCatalogData();
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

  const handleRateInputChange = (key, value) => {
    setEditingRates((prev) => ({
      ...prev,
      [key]: value
    }));
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

  const handleSaveRow = (entry) => {
    const currentVal = editingRates[entry.key];
    const num = Math.round(Number(currentVal));
    if (isNaN(num) || num <= 0) {
      alert('Please enter a valid positive integer rate.');
      return;
    }
    const numDaily = Math.round(num * 24);
    saveBaselineRate(entry.lineId, entry.productCode, num, '', numDaily);
    loadCatalogData();
    setFeedback(`Saved ${entry.lineId} - ${entry.productCode} at ${num} pcs/h (${numDaily} pcs/day)`);
    setTimeout(() => setFeedback(''), 3000);
  };

  const handleDeleteRow = (entry) => {
    if (window.confirm(`Delete baseline standard for ${entry.lineId} - ${entry.productCode}?`)) {
      removeBaselineRate(entry.lineId, entry.productCode);
      loadCatalogData();
      setFeedback(`Removed standard for ${entry.lineId} - ${entry.productCode}`);
      setTimeout(() => setFeedback(''), 3000);
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
    setNewProductCode('');
    setNewRate('');
    setNewDailyTarget('');
    loadCatalogData();
    setFeedback(`Added standard for ${newLineId} - ${cleanCode} (${numRate} pcs/h | ${numDaily} pcs/day)`);
    setTimeout(() => setFeedback(''), 3000);
  };

  return (
    <div className="export-modal-backdrop no-print" onClick={onClose}>
      <div
        className="export-modal-dialog print-sop-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="baseline-catalog-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 940 }}
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
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            aria-label="Close standards catalog"
          >
            &times;
          </button>
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
                  <th style={{ width: '12%' }}>Line ID</th>
                  <th style={{ width: '16%' }}>Product Code</th>
                  <th style={{ width: '20%', textAlign: 'center' }}>Approved Real Rate (Pcs/h)</th>
                  <th style={{ width: '18%', textAlign: 'center' }}>Daily Target (24h)</th>
                  <th style={{ width: '18%', textAlign: 'center' }}>Printed SOP Target (85%)</th>
                  <th style={{ width: '16%', textAlign: 'center' }}>Actions</th>
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
                    const currentEditingVal = editingRates[row.key] !== undefined
                      ? editingRates[row.key]
                      : row.baselinePcsH;
                    const numVal = Number(currentEditingVal);
                    const dailyTargetVal = numVal > 0 ? Math.round(numVal * 24) : '-';
                    const printedTarget = numVal > 0 ? Math.round(numVal / 0.85) : '-';
                    const isChanged = String(currentEditingVal) !== String(row.baselinePcsH);

                    return (
                      <tr key={row.key} className={isChanged ? 'row-modified' : ''}>
                        <td>
                          <span className="standards-catalog-line-badge">
                            {row.lineId}
                          </span>
                        </td>
                        <td>
                          <strong className="standards-catalog-code">{row.productCode}</strong>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            min="1"
                            max="10000"
                            step="1"
                            className={`standards-catalog-rate-input ${isChanged ? 'input-modified' : ''}`}
                            value={currentEditingVal}
                            onChange={(e) => handleRateInputChange(row.key, e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="standards-catalog-daily-pill">
                            {dailyTargetVal !== '-' ? `${dailyTargetVal} pcs` : '-'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="standards-catalog-target-pill">
                            {printedTarget !== '-' ? `${printedTarget} pcs/h` : '-'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="standards-catalog-actions">
                            <button
                              type="button"
                              className={`standards-btn-save ${isChanged ? 'highlight-save' : ''}`}
                              onClick={() => handleSaveRow(row)}
                              title="Save updated rate to standards catalog"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="standards-btn-delete"
                              onClick={() => handleDeleteRow(row)}
                              title="Delete standard rate"
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
        <div className="export-modal-footer">
          <span className="standards-catalog-count-note">
            Total Standards: <strong>{catalogEntries.length}</strong>
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
