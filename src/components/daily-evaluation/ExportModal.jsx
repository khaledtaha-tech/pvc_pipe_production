import { useState, useEffect } from 'react';

/**
 * Unified Export Modal Component
 * Allows selecting Document Template (Modern vs SOP) and File Format (PDF vs Excel)
 * for either Current Line or All Operating Lines on the active date.
 */
export default function ExportModal({
  isOpen,
  onClose,
  initialScope = 'current',
  selectedDate = '',
  currentLineLabel = '',
  activeLinesCount = 0,
  availableDates = [],
  isExporting = false,
  exportProgressText = '',
  onConfirmExport
}) {
  const [scope, setScope] = useState(initialScope);
  const [template, setTemplate] = useState('modern'); // 'modern' | 'sop'
  const [format, setFormat] = useState('pdf'); // 'pdf' | 'excel'

  // Date range selectors
  const [fromDate, setFromDate] = useState(() => availableDates[0] || selectedDate || '');
  const [toDate, setToDate] = useState(() => availableDates[availableDates.length - 1] || selectedDate || '');

  // Sync scope and dates when initialScope changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setScope(initialScope || 'current');
      if (availableDates && availableDates.length > 0) {
        setFromDate((prev) => prev || availableDates[0]);
        setToDate((prev) => prev || availableDates[availableDates.length - 1]);
      }
    }
  }, [isOpen, initialScope, availableDates]);

  // Handle ESC key to close modal if not exporting
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isExporting) return;
    if (template !== 'blank_sop') {
      if (scope === 'all' && activeLinesCount === 0) return;
      if (scope === 'range' && (!fromDate || !toDate)) return;
    }
    if (typeof onConfirmExport === 'function') {
      onConfirmExport({ template, format, scope, fromDate, toDate });
    }
  };

  const isAllDisabled = activeLinesCount === 0;
  const isRangeDisabled = !availableDates || availableDates.length === 0;

  return (
    <div className="export-modal-backdrop no-print" onClick={!isExporting ? onClose : undefined}>
      <div
        className="export-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="export-modal-header">
          <div>
            <h3 id="export-modal-title" className="export-modal-title">
              Export Production Report
            </h3>
            <p className="export-modal-subtitle">
              Select document template and file format for production reporting.
            </p>
          </div>
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            disabled={isExporting}
            aria-label="Close export dialog"
          >
            &times;
          </button>
        </div>

        {/* Scope Selector Tabs */}
        <div className="export-scope-tabs">
          <button
            type="button"
            className={`export-scope-tab ${scope === 'current' ? 'active' : ''}`}
            onClick={() => setScope('current')}
            disabled={isExporting}
          >
            <span className="export-scope-tab-title">Current Line</span>
            <span className="export-scope-tab-badge">{currentLineLabel || 'Active Machine'}</span>
          </button>
          <button
            type="button"
            className={`export-scope-tab ${scope === 'all' ? 'active' : ''}`}
            onClick={() => setScope('all')}
            disabled={isExporting || isAllDisabled}
            title={isAllDisabled ? 'No active operating lines on this date' : 'Export all operating lines on date'}
          >
            <span className="export-scope-tab-title">All Lines (Single Date)</span>
            <span className="export-scope-tab-badge">
              {isAllDisabled ? '0 Active' : `${activeLinesCount} Machines`}
            </span>
          </button>
          <button
            type="button"
            className={`export-scope-tab ${scope === 'range' ? 'active' : ''}`}
            onClick={() => setScope('range')}
            disabled={isExporting || isRangeDisabled}
            title={isRangeDisabled ? 'No dates available for range export' : 'Export all operating lines across date range'}
          >
            <span className="export-scope-tab-title">Date Range (All Lines)</span>
            <span className="export-scope-tab-badge">
              {availableDates.length > 0 ? `${availableDates.length} Dates` : 'Range'}
            </span>
          </button>
        </div>

        {/* Target Info Bar / Date Picker */}
        {scope === 'range' ? (
          <div className="export-target-info-bar export-range-picker-bar">
            <div className="export-target-item" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="export-target-lbl">From Date:</span>
              <select
                className="sheet-select export-range-select"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                disabled={isExporting}
                style={{ padding: '4px 8px', fontSize: 12 }}
              >
                {availableDates.map((d) => (
                  <option key={`from_${d}`} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="export-target-item" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="export-target-lbl">To Date:</span>
              <select
                className="sheet-select export-range-select"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                disabled={isExporting}
                style={{ padding: '4px 8px', fontSize: 12 }}
              >
                {availableDates.map((d) => (
                  <option key={`to_${d}`} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="export-target-item">
              <span className="export-target-lbl">Scope:</span>
              <span className="export-target-val">All Operating Lines in Window</span>
            </div>
          </div>
        ) : (
          <div className="export-target-info-bar">
            <div className="export-target-item">
              <span className="export-target-lbl">Date:</span>
              <span className="export-target-val">{selectedDate || 'Selected Date'}</span>
            </div>
            <div className="export-target-item">
              <span className="export-target-lbl">Target:</span>
              <span className="export-target-val">
                {scope === 'current'
                  ? currentLineLabel || 'Active Machine'
                  : `All ${activeLinesCount} Operating Extrusion Lines`}
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="export-modal-form">
          {/* Section 1: Document Template */}
          <div className="export-section">
            <label className="export-section-title">1. Choose Document Template</label>
            <div className="export-options-grid">

              {/* Modern Template */}
              <div
                className={`export-option-card ${template === 'modern' ? 'selected' : ''}`}
                onClick={() => !isExporting && setTemplate('modern')}
              >
                <div className="export-option-card-header">
                  <span className="export-option-radio">
                    <input
                      type="radio"
                      name="export_template"
                      value="modern"
                      checked={template === 'modern'}
                      onChange={() => setTemplate('modern')}
                      disabled={isExporting}
                    />
                  </span>
                  <span className="export-option-name">Modern 24-Hour Production Sheet</span>
                  <span className="export-option-badge badge-blue">Executive</span>
                </div>
                <p className="export-option-desc">
                  Detailed 24-hour hourly extrusion log with live OEE breakdown, dynamic capacity utilization, scrap analysis, and subtotals.
                </p>
              </div>

              {/* Legacy SOP Template */}
              <div
                className={`export-option-card ${template === 'sop' ? 'selected' : ''}`}
                onClick={() => !isExporting && setTemplate('sop')}
              >
                <div className="export-option-card-header">
                  <span className="export-option-radio">
                    <input
                      type="radio"
                      name="export_template"
                      value="sop"
                      checked={template === 'sop'}
                      onChange={() => setTemplate('sop')}
                      disabled={isExporting}
                    />
                  </span>
                  <span className="export-option-name">Legacy SOP (DOC-Ext.-03: Production Follow)</span>
                  <span className="export-option-badge badge-teal">Factory SOP</span>
                </div>
                <p className="export-option-desc">
                  Classic plant follow sheet with standard hourly speed meters, quality reject tracking, side production card, and shift supervisor sign-offs.
                </p>
              </div>

              {/* Blank SOP Template (Manual Fill) */}
              <div
                className={`export-option-card ${template === 'blank_sop' ? 'selected' : ''}`}
                onClick={() => !isExporting && setTemplate('blank_sop')}
              >
                <div className="export-option-card-header">
                  <span className="export-option-radio">
                    <input
                      type="radio"
                      name="export_template"
                      value="blank_sop"
                      checked={template === 'blank_sop'}
                      onChange={() => setTemplate('blank_sop')}
                      disabled={isExporting}
                    />
                  </span>
                  <span className="export-option-name">Print Blank SOP Template (Manual Fill)</span>
                  <span className="export-option-badge badge-blue">Photocopier Ready</span>
                </div>
                <p className="export-option-desc">
                  Clean, high-contrast black &amp; white follow sheet (DOC-Ext.-03) with fillable blanks, cleared hourly inputs, and equal hourly standard rates for manual on-floor recording and high-volume photocopier printing.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: File Format */}
          <div className="export-section">
            <label className="export-section-title">2. Choose File Format</label>
            <div className="export-options-grid">
              {/* PDF Format */}
              <div
                className={`export-option-card ${format === 'pdf' ? 'selected' : ''}`}
                onClick={() => !isExporting && setFormat('pdf')}
              >
                <div className="export-option-card-header">
                  <span className="export-option-radio">
                    <input
                      type="radio"
                      name="export_format"
                      value="pdf"
                      checked={format === 'pdf'}
                      onChange={() => setFormat('pdf')}
                      disabled={isExporting}
                    />
                  </span>
                  <span className="export-option-name">PDF Document (.pdf)</span>
                  <span className="export-option-badge badge-red">Print Ready</span>
                </div>
                <p className="export-option-desc">
                  {scope === 'all'
                    ? 'Batch ZIP archive containing individual single-page A4 landscape PDFs with full-color fidelity for each operating line.'
                    : 'High-resolution single-page A4 landscape PDF with full-color fidelity, formatted for executive archiving and color printing.'}
                </p>
              </div>

              {/* Excel Format */}
              <div
                className={`export-option-card ${format === 'excel' ? 'selected' : ''}`}
                onClick={() => !isExporting && setFormat('excel')}
              >
                <div className="export-option-card-header">
                  <span className="export-option-radio">
                    <input
                      type="radio"
                      name="export_format"
                      value="excel"
                      checked={format === 'excel'}
                      onChange={() => setFormat('excel')}
                      disabled={isExporting}
                    />
                  </span>
                  <span className="export-option-name">Excel Spreadsheet (.xlsx)</span>
                  <span className="export-option-badge badge-green">Editable Data</span>
                </div>
                <p className="export-option-desc">
                  {scope === 'all'
                    ? 'Consolidated multi-tab workbook with dedicated tabs for each operating line and automated plant summary calculation.'
                    : 'Structured Microsoft Excel workbook with formulas, formatted columns, and editable hourly data tables.'}
                </p>
              </div>
            </div>
          </div>

          {/* Export Action / Progress Status */}
          {isExporting ? (
            <div className="export-progress-banner">
              <div className="export-spinner" />
              <div className="export-progress-info">
                <div className="export-progress-title">Preparing Your Export...</div>
                <div className="export-progress-text">
                  {exportProgressText || 'Rendering document tables and compiling data...'}
                </div>
              </div>
            </div>
          ) : null}

          {/* Modal Footer */}
          <div className="export-modal-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isExporting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-generate-export"
              disabled={isExporting || (template !== 'blank_sop' && scope === 'all' && isAllDisabled)}
            >
              {isExporting ? (
                <>
                  <span className="btn-spinner" />
                  Generating...
                </>
              ) : template === 'blank_sop' ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Print / Download Blank SOP
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Generate &amp; Download
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
