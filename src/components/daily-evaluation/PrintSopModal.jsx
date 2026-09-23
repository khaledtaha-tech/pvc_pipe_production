import { useState, useEffect, useMemo } from 'react';
import { MACHINES } from '../../config/machines.js';
import {
  formatFullMachineName,
  findPreviousRunForMachine,
  extractMachineSpecsFromRun,
  getAvailableProductsCatalog,
  calculateBenchmarkSpeedForProduct,
  buildMorningSopModel
} from '../../logic/legacySopHelper.js';

/**
 * Intelligent Morning Blank SOP (DOC-Ext.-03) Print & Export Configuration Modal
 * Features:
 * - Scope selection: Current Line vs. All Operating Lines
 * - Target Date selection with auto-lookup of previous operational run
 * - Auto-inheritance of Line No, Product Specs, Speed, Cut Length & Benchmark Pcs/h
 * - Manual product override dropdown with instant speed/hourly pieces recalculation
 * - Batch print and multi-page PDF generation triggers
 */
export default function PrintSopModal({
  isOpen,
  onClose,
  records = [],
  selectedDate = '',
  currentMachineId = 'L-01',
  machineMaster = MACHINES,
  onConfirmPrint,
  onConfirmPdf,
  isGenerating = false,
  lang = 'en'
}) {
  const isAr = lang === 'ar';
  const [scope, setScope] = useState('current'); // 'current' | 'all'
  const [targetDate, setTargetDate] = useState(() => selectedDate || new Date().toISOString().slice(0, 10));
  const [linesState, setLinesState] = useState([]);

  // Catalog of distinct products from history and factory standards
  const productCatalog = useMemo(() => {
    return getAvailableProductsCatalog(records, machineMaster);
  }, [records, machineMaster]);

  // Distinct unique list of product codes for dropdown
  const distinctCodes = useMemo(() => {
    const set = new Set();
    productCatalog.forEach((p) => {
      if (p.itemCode) set.add(p.itemCode);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [productCatalog]);

  // Synchronize target date when modal opens or selectedDate changes
  useEffect(() => {
    if (isOpen) {
      if (selectedDate) {
        setTargetDate(selectedDate);
      }
    }
  }, [isOpen, selectedDate]);

  // Build line configuration list when modal opens, targetDate changes, or records change
  useEffect(() => {
    if (!isOpen) return;

    const list = machineMaster.map((m) => {
      const prevRun = findPreviousRunForMachine(records, m.id, targetDate);
      const specs = extractMachineSpecsFromRun(prevRun, m.id, machineMaster);
      const isCurrent = m.id === currentMachineId;
      const hadRun = Boolean(prevRun);

      return {
        machineId: m.id,
        machineName: m.name,
        fullMachineName: specs.fullMachineName,
        isSelected: scope === 'current' ? isCurrent : (hadRun || isCurrent),
        previousRunDate: specs.previousRunDate,
        productDescription: specs.productDescription,
        itemCode: specs.itemCode || '',
        od: specs.od || '',
        wt: specs.wt || '',
        speed: specs.speed,
        pipeLength: specs.pipeLength,
        calculatedRate: specs.calculatedRate,
        unitWeight: specs.unitWeight
      };
    });

    setLinesState(list);
  }, [isOpen, targetDate, machineMaster, records, currentMachineId, scope]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isGenerating, onClose]);

  if (!isOpen) return null;

  // Toggle selection for a machine in batch mode
  const handleToggleSelect = (machineId) => {
    setLinesState((prev) =>
      prev.map((item) =>
        item.machineId === machineId ? { ...item, isSelected: !item.isSelected } : item
      )
    );
  };

  // Toggle select all lines
  const handleSelectAll = (select) => {
    setLinesState((prev) =>
      prev.map((item) => ({ ...item, isSelected: select }))
    );
  };

  // Change product code and auto-resolve description, benchmark speed & standard pcs/h
  const handleProductCodeChange = (machineId, newCode) => {
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;

        const matchedProduct = productCatalog.find(
          (p) => String(p.itemCode).trim().toUpperCase() === String(newCode).trim().toUpperCase()
        );

        const newDesc = matchedProduct?.description || item.productDescription;
        const unitWeight = matchedProduct?.unitWeight || item.unitWeight || 1.0;

        const benchmark = calculateBenchmarkSpeedForProduct(
          { unitWeight },
          machineId,
          machineMaster,
          item.pipeLength
        );

        return {
          ...item,
          itemCode: newCode,
          productDescription: newDesc,
          unitWeight,
          speed: benchmark.speed,
          calculatedRate: benchmark.calculatedRate
        };
      })
    );
  };

  // Change product description and auto-synchronize item code, benchmark speed & pcs/h
  const handleProductChange = (machineId, newDesc) => {
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;

        const matchedProduct = productCatalog.find(
          (p) => p.description.toUpperCase() === newDesc.toUpperCase()
        );
        const itemCode = matchedProduct?.itemCode || item.itemCode || '';
        const unitWeight = matchedProduct?.unitWeight || item.unitWeight || 1.0;

        const benchmark = calculateBenchmarkSpeedForProduct(
          { unitWeight },
          machineId,
          machineMaster,
          item.pipeLength
        );

        return {
          ...item,
          itemCode,
          productDescription: newDesc,
          unitWeight,
          speed: benchmark.speed,
          calculatedRate: benchmark.calculatedRate
        };
      })
    );
  };

  // Update linear speed (m/min) and recalculate standard pcs/h
  const handleSpeedChange = (machineId, speedVal) => {
    const num = Math.max(0.1, Number(speedVal) || 0.1);
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;
        const rate = Math.round((num * 60) / item.pipeLength);
        return {
          ...item,
          speed: num,
          calculatedRate: rate
        };
      })
    );
  };

  // Update pipe cut length (m) and recalculate standard pcs/h
  const handlePipeLengthChange = (machineId, lenVal) => {
    const num = Math.max(0.5, Number(lenVal) || 6.0);
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;
        const rate = Math.round((item.speed * 60) / num);
        return {
          ...item,
          pipeLength: num,
          calculatedRate: rate
        };
      })
    );
  };

  // Compile active models for print or PDF export
  const compileModels = () => {
    const targets = scope === 'current'
      ? linesState.filter((l) => l.machineId === currentMachineId)
      : linesState.filter((l) => l.isSelected);

    return targets.map((item) =>
      buildMorningSopModel({
        lineId: item.machineId,
        fullMachineName: item.fullMachineName,
        date: targetDate,
        itemCode: item.itemCode,
        productDescription: item.productDescription,
        speed: item.speed,
        pipeLength: item.pipeLength,
        machineMaster
      })
    );
  };

  const handlePrint = () => {
    const models = compileModels();
    if (models.length === 0) return;
    if (typeof onConfirmPrint === 'function') {
      onConfirmPrint(models);
    }
  };

  const handlePdf = () => {
    const models = compileModels();
    if (models.length === 0) return;
    if (typeof onConfirmPdf === 'function') {
      onConfirmPdf(models);
    }
  };

  const activeLines = scope === 'current'
    ? linesState.filter((l) => l.machineId === currentMachineId)
    : linesState.filter((l) => l.isSelected);

  const selectedCount = activeLines.length;

  return (
    <div className="export-modal-backdrop no-print" onClick={!isGenerating ? onClose : undefined}>
      <div
        className="export-modal-dialog print-sop-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-sop-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="export-modal-header">
          <div>
            <div className="print-sop-title-wrap">
              <span className="print-sop-badge-sop">DOC-Ext.-03</span>
              <h3 id="print-sop-modal-title" className="export-modal-title">
                Morning Blank SOP Generator
              </h3>
            </div>
            <p className="export-modal-subtitle">
              Pre-populate operational specifications, inherit previous runs, and calculate standard pieces per hour.
            </p>
          </div>
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            disabled={isGenerating}
            aria-label="Close morning SOP dialog"
          >
            &times;
          </button>
        </div>

        {/* Scope Tabs & Date Controls */}
        <div className="export-scope-tabs">
          <button
            type="button"
            className={`export-scope-tab ${scope === 'current' ? 'active' : ''}`}
            onClick={() => setScope('current')}
            disabled={isGenerating}
          >
            <span className="export-scope-tab-title">Current Line</span>
            <span className="export-scope-tab-badge">{currentMachineId}</span>
          </button>
          <button
            type="button"
            className={`export-scope-tab ${scope === 'all' ? 'active' : ''}`}
            onClick={() => setScope('all')}
            disabled={isGenerating}
          >
            <span className="export-scope-tab-title">All Operating Lines</span>
            <span className="export-scope-tab-badge">
              {selectedCount} Selected
            </span>
          </button>
        </div>

        {/* Target Date Bar */}
        <div className="export-target-info-bar print-sop-date-bar">
          <div className="export-target-item print-sop-date-item">
            <span className="export-target-lbl">Target Production Date:</span>
            <input
              type="date"
              className="sheet-select print-sop-date-input"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              disabled={isGenerating}
            />
          </div>
          <div className="export-target-item">
            <span className="export-target-lbl">Inheritance Source:</span>
            <span className="export-target-val">Latest Logged Operational Run</span>
          </div>
          {scope === 'all' ? (
            <div className="print-sop-batch-actions">
              <button
                type="button"
                className="btn-link-action"
                onClick={() => handleSelectAll(true)}
                disabled={isGenerating}
              >
                Select All
              </button>
              <span className="sep">|</span>
              <button
                type="button"
                className="btn-link-action"
                onClick={() => handleSelectAll(false)}
                disabled={isGenerating}
              >
                Deselect All
              </button>
            </div>
          ) : null}
        </div>

        {/* Machine Specifications List */}
        <div className="print-sop-list-container">
          {linesState
            .filter((l) => (scope === 'current' ? l.machineId === currentMachineId : true))
            .map((line) => {
              return (
                <div
                  key={line.machineId}
                  className={`print-sop-line-card${line.isSelected || scope === 'current' ? ' active' : ' disabled'}`}
                >
                  <div className="print-sop-line-header">
                    <div className="print-sop-line-title-row">
                      {scope === 'all' && (
                        <input
                          type="checkbox"
                          className="print-sop-checkbox"
                          checked={line.isSelected}
                          onChange={() => handleToggleSelect(line.machineId)}
                          disabled={isGenerating}
                        />
                      )}
                      <span className="print-sop-line-name">{line.fullMachineName}</span>
                    </div>

                    <div className="print-sop-badges">
                      {line.previousRunDate ? (
                        <span className="print-sop-badge-run">
                          Inherited: {line.previousRunDate}
                        </span>
                      ) : (
                        <span className="print-sop-badge-default">
                          Default Preset
                        </span>
                      )}
                      <span className="print-sop-badge-rate">
                        {line.calculatedRate.toLocaleString()} Pcs / hr
                      </span>
                    </div>
                  </div>

                  <div className="print-sop-line-body">
                    {/* Dual Product Selection: Product Code & Product Description */}
                    <div className="print-sop-products-row">
                      {/* 1. Product Code Dropdown */}
                      <div className="print-sop-form-group print-sop-code-group">
                        <label className="print-sop-label">
                          {isAr ? 'كود المنتج (Product Code):' : 'Product Code:'}
                        </label>
                        <select
                          className="print-sop-select print-sop-code-select"
                          value={line.itemCode}
                          onChange={(e) => handleProductCodeChange(line.machineId, e.target.value)}
                          disabled={isGenerating || (scope === 'all' && !line.isSelected)}
                        >
                          {line.itemCode && !distinctCodes.some((c) => c === line.itemCode) && (
                            <option value={line.itemCode}>
                              {line.itemCode} (Current)
                            </option>
                          )}
                          {distinctCodes.map((code) => {
                            const p = productCatalog.find((x) => x.itemCode === code);
                            return (
                              <option key={code} value={code}>
                                {code} {p?.description ? `— ${p.description.slice(0, 26)}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* 2. Product Specification Dropdown */}
                      <div className="print-sop-form-group print-sop-desc-group">
                        <label className="print-sop-label">
                          Product Specification (Mold / Size):
                        </label>
                        <select
                          className="print-sop-select"
                          value={line.productDescription}
                          onChange={(e) => handleProductChange(line.machineId, e.target.value)}
                          disabled={isGenerating || (scope === 'all' && !line.isSelected)}
                        >
                          {/* Ensure currently selected product is represented */}
                          {!productCatalog.some((p) => p.description === line.productDescription) && (
                            <option value={line.productDescription}>
                              {line.itemCode ? `[${line.itemCode}] ` : ''}{line.productDescription} (Recorded)
                            </option>
                          )}
                          {productCatalog.map((prod) => (
                            <option key={`${prod.itemCode}_${prod.description}`} value={prod.description}>
                              {prod.itemCode ? `[${prod.itemCode}] ` : ''}{prod.description}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Speed & Cut Length Controls */}
                    <div className="print-sop-params-row">
                      <div className="print-sop-param">
                        <label className="print-sop-label">Speed (M/Min):</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="100"
                          className="print-sop-input"
                          value={line.speed}
                          onChange={(e) => handleSpeedChange(line.machineId, e.target.value)}
                          disabled={isGenerating || (scope === 'all' && !line.isSelected)}
                        />
                      </div>

                      <div className="print-sop-param">
                        <label className="print-sop-label">Cut Length (M):</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="30"
                          className="print-sop-input"
                          value={line.pipeLength}
                          onChange={(e) => handlePipeLengthChange(line.machineId, e.target.value)}
                          disabled={isGenerating || (scope === 'all' && !line.isSelected)}
                        />
                      </div>

                      <div className="print-sop-param print-sop-calc-summary">
                        <span className="print-sop-calc-formula">
                          ({line.speed} &times; 60) / {line.pipeLength}m
                        </span>
                        <span className="print-sop-calc-val">
                          = <strong>{line.calculatedRate}</strong> pcs/h
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer Actions */}
        <div className="export-modal-footer print-sop-footer">
          <div className="print-sop-summary-text" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>
              Target: <strong>{selectedCount}</strong> {selectedCount === 1 ? 'Sheet' : 'Sheets'} ({targetDate})
            </span>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.25)', fontWeight: 600 }}>
              {isAr ? '📐 A4 أفقي (Landscape)' : '📐 A4 Landscape'}
            </span>
          </div>

          <div className="export-footer-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isGenerating}
            >
              Cancel
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sop-pdf"
              onClick={handlePdf}
              disabled={isGenerating || selectedCount === 0}
              title="Download single or multi-page PDF"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="12" y2="18" />
                <line x1="15" y1="15" x2="12" y2="18" />
              </svg>
              Download PDF
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sop-print"
              onClick={handlePrint}
              disabled={isGenerating || selectedCount === 0}
              title="Print via system dialog with automatic page breaks"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print SOP {selectedCount > 1 ? `(${selectedCount} Sheets)` : 'Sheet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
