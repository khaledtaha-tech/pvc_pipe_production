import { useState, useEffect, useMemo } from 'react';
import { MACHINES, matchMachine } from '../../config/machines.js';
import {
  formatFullMachineName,
  findPreviousRunForMachine,
  findExactDayRunForMachine,
  getPreviousDay,
  extractMachineSpecsFromRun,
  getAvailableProductsCatalog,
  calculateBenchmarkSpeedForProduct,
  buildMorningSopModel,
  isCompoundingLineOrProduct
} from '../../logic/legacySopHelper.js';

/**
 * Intelligent Morning Blank SOP (DOC-Ext.-03) Print & Export Configuration Modal
 * Features:
 * - Scope selection: Current Line vs. All Operating Lines vs. Previous Day Active Lines
 * - Target Date selection with auto-lookup of previous operational run
 * - Strict Previous Day inheritance for immediate preceding operating lines
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
  onOpenUniversalBlank,
  isGenerating = false,
  lang = 'en'
}) {
  const isAr = lang === 'ar';
  const [scope, setScope] = useState('current'); // 'current' | 'all' | 'previousDay'
  const [targetDate, setTargetDate] = useState(() => selectedDate || new Date().toISOString().slice(0, 10));
  const [linesState, setLinesState] = useState([]);

  // Compute immediate previous calendar day (YYYY-MM-DD)
  const previousDate = useMemo(() => getPreviousDay(targetDate), [targetDate]);

  // Active machine master list
  const activeMaster = useMemo(() => {
    return Array.isArray(machineMaster) && machineMaster.length > 0 ? machineMaster : MACHINES;
  }, [machineMaster]);

  // Count of machines strictly running on immediate previous day
  const prevDayActiveCount = useMemo(() => {
    if (!previousDate) return 0;
    return activeMaster.filter((m) => Boolean(findExactDayRunForMachine(records, m?.id, previousDate))).length;
  }, [activeMaster, records, previousDate]);

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

  // Build line configuration list when modal opens, targetDate changes, scope changes, or records change
  useEffect(() => {
    if (!isOpen) return;

    const list = activeMaster.map((m) => {
      let prevRun = null;
      let isSelected = false;

      if (scope === 'previousDay') {
        // Strict previous day: only look for runs on exact previousDate
        prevRun = findExactDayRunForMachine(records, m?.id, previousDate);
        isSelected = Boolean(prevRun);
      } else if (scope === 'all') {
        // All registered extruder lines
        prevRun = findPreviousRunForMachine(records, m?.id, targetDate);
        isSelected = true;
      } else {
        // Current line only
        prevRun = findPreviousRunForMachine(records, m?.id, targetDate);
        isSelected = m?.id === currentMachineId;
      }

      const specs = extractMachineSpecsFromRun(prevRun, m?.id, activeMaster);
      const isCurrent = m?.id === currentMachineId;
      const hadRun = Boolean(prevRun);
      const isComp = Boolean(
        specs?.isCompounding ||
        isCompoundingLineOrProduct({
          lineId: m?.id,
          fullMachineName: specs?.fullMachineName || m?.name || m?.id,
          itemCode: specs?.itemCode,
          productDescription: specs?.productDescription
        }, activeMaster)
      );
      const nominalCapacity = Number(prevRun?.nominalCapacityKgH) || Number(m?.nominalCapacity) || Number(m?.capacityKgH) || Number(specs?.nominalCapacity) || (isComp ? 400 : 200);
      const unitWeight = isComp ? 25.0 : (Number(specs?.unitWeight) > 0 ? Number(specs.unitWeight) : (hadRun ? 1.0 : ''));
      const calculatedRate = specs?.calculatedRate !== undefined && specs?.calculatedRate !== null
        ? specs.calculatedRate
        : (isComp ? nominalCapacity : '');
      const calculatedRateKgH = specs?.calculatedRateKgH !== undefined && specs?.calculatedRateKgH !== ''
        ? specs.calculatedRateKgH
        : (isComp ? calculatedRate : (unitWeight && calculatedRate ? Math.round(Number(calculatedRate) * Number(unitWeight)) : ''));

      return {
        machineId: m?.id || '',
        machineName: m?.name || '',
        fullMachineName: specs?.fullMachineName || m?.name || m?.id || '',
        isSelected,
        previousRunDate: specs?.previousRunDate || null,
        productDescription: specs?.productDescription || '',
        itemCode: specs?.itemCode || '',
        od: specs?.od || '',
        wt: specs?.wt || '',
        speed: specs?.speed !== undefined && specs?.speed !== null ? specs.speed : '',
        pipeLength: isComp ? 0 : (specs?.pipeLength || 6.0),
        calculatedRate,
        unitWeight,
        nominalCapacity,
        calculatedRateKgH,
        isCompounding: isComp,
        isIdle: Boolean(specs?.isIdle || (!isComp && !hadRun))
      };
    });

    setLinesState(list);
  }, [isOpen, targetDate, activeMaster, records, currentMachineId, scope, previousDate]);

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

        if (!newCode) {
          return {
            ...item,
            itemCode: '',
            productDescription: '',
            unitWeight: item.isCompounding ? 25.0 : '',
            speed: '',
            calculatedRate: item.isCompounding ? (item.nominalCapacity || 400) : '',
            calculatedRateKgH: item.isCompounding ? (item.nominalCapacity || 400) : '',
            isIdle: !item.isCompounding
          };
        }

        const matchedProduct = productCatalog.find(
          (p) => String(p.itemCode).trim().toUpperCase() === String(newCode).trim().toUpperCase()
        );

        const newDesc = matchedProduct?.description || item.productDescription;
        const isComp = Boolean(
          matchedProduct?.isCompounding ||
          isCompoundingLineOrProduct({
            lineId: machineId,
            itemCode: newCode,
            productDescription: newDesc
          }, activeMaster)
        );

        if (isComp) {
          const cap = Number(item.nominalCapacity) || 400;
          return {
            ...item,
            itemCode: newCode,
            productDescription: newDesc,
            unitWeight: 25.0,
            pipeLength: 0,
            speed: '',
            calculatedRate: cap,
            calculatedRateKgH: cap,
            isCompounding: true,
            isIdle: false
          };
        }

        const unitWeight = matchedProduct?.unitWeight || (Number(item.unitWeight) > 0 ? item.unitWeight : 1.0);
        const pipeLen = Number(item.pipeLength) > 0 ? Number(item.pipeLength) : 6.0;

        const benchmark = calculateBenchmarkSpeedForProduct(
          { unitWeight },
          machineId,
          machineMaster,
          pipeLen
        );

        return {
          ...item,
          itemCode: newCode,
          productDescription: newDesc,
          unitWeight,
          pipeLength: pipeLen,
          speed: benchmark.speed,
          calculatedRate: benchmark.calculatedRate,
          calculatedRateKgH: Math.round(benchmark.calculatedRate * unitWeight),
          isCompounding: false,
          isIdle: false
        };
      })
    );
  };

  // Change product description and auto-synchronize item code, benchmark speed & pcs/h
  const handleProductChange = (machineId, newDesc) => {
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;

        if (!newDesc) {
          return {
            ...item,
            itemCode: '',
            productDescription: '',
            unitWeight: item.isCompounding ? 25.0 : '',
            speed: '',
            calculatedRate: item.isCompounding ? (item.nominalCapacity || 400) : '',
            calculatedRateKgH: item.isCompounding ? (item.nominalCapacity || 400) : '',
            isIdle: !item.isCompounding
          };
        }

        const matchedProduct = productCatalog.find(
          (p) => p.description.toUpperCase() === newDesc.toUpperCase()
        );
        const itemCode = matchedProduct?.itemCode || item.itemCode || '';
        const isComp = Boolean(
          matchedProduct?.isCompounding ||
          isCompoundingLineOrProduct({
            lineId: machineId,
            itemCode,
            productDescription: newDesc
          }, activeMaster)
        );

        if (isComp) {
          const cap = Number(item.nominalCapacity) || 400;
          return {
            ...item,
            itemCode,
            productDescription: newDesc,
            unitWeight: 25.0,
            pipeLength: 0,
            speed: '',
            calculatedRate: cap,
            calculatedRateKgH: cap,
            isCompounding: true,
            isIdle: false
          };
        }

        const unitWeight = matchedProduct?.unitWeight || (Number(item.unitWeight) > 0 ? item.unitWeight : 1.0);
        const pipeLen = Number(item.pipeLength) > 0 ? Number(item.pipeLength) : 6.0;

        const benchmark = calculateBenchmarkSpeedForProduct(
          { unitWeight },
          machineId,
          machineMaster,
          pipeLen
        );

        return {
          ...item,
          itemCode,
          productDescription: newDesc,
          unitWeight,
          pipeLength: pipeLen,
          speed: benchmark.speed,
          calculatedRate: benchmark.calculatedRate,
          calculatedRateKgH: Math.round(benchmark.calculatedRate * unitWeight),
          isCompounding: false,
          isIdle: false
        };
      })
    );
  };

  // Update linear speed (m/min) and recalculate standard pcs/h and output rate (kg/h)
  const handleSpeedChange = (machineId, speedVal) => {
    const rawVal = speedVal === '' ? '' : Number(speedVal);
    const num = typeof rawVal === 'number' && !isNaN(rawVal) && rawVal > 0 ? rawVal : '';
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;
        if (num === '') {
          return {
            ...item,
            speed: '',
            calculatedRate: '',
            calculatedRateKgH: '',
            isIdle: !item.productDescription
          };
        }
        const pipeLen = Number(item.pipeLength) > 0 ? Number(item.pipeLength) : 6.0;
        const rate = Math.round((num * 60) / pipeLen);
        const unitWeight = Number(item.unitWeight) > 0 ? Number(item.unitWeight) : 1.0;
        return {
          ...item,
          speed: num,
          calculatedRate: rate,
          calculatedRateKgH: Math.round(rate * unitWeight),
          isIdle: false
        };
      })
    );
  };

  // Update target capacity (kg/h) for compounding lines
  const handleCapacityChange = (machineId, capVal) => {
    const rawVal = capVal === '' ? '' : Number(capVal);
    const num = typeof rawVal === 'number' && !isNaN(rawVal) && rawVal > 0 ? rawVal : '';
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;
        return {
          ...item,
          calculatedRate: num,
          calculatedRateKgH: num,
          isIdle: num === '' && !item.productDescription
        };
      })
    );
  };

  // Update pipe cut length (m) and recalculate standard pcs/h and output rate (kg/h)
  const handlePipeLengthChange = (machineId, lenVal) => {
    const num = Math.max(0.5, Number(lenVal) || 6.0);
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;
        const speedNum = Number(item.speed) || 0;
        const rate = speedNum > 0 ? Math.round((speedNum * 60) / num) : '';
        const unitWeight = Number(item.unitWeight) > 0 ? Number(item.unitWeight) : 1.0;
        return {
          ...item,
          pipeLength: num,
          calculatedRate: rate,
          calculatedRateKgH: rate ? Math.round(rate * unitWeight) : ''
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
        unitWeight: item.unitWeight,
        nominalCapacity: item.nominalCapacity,
        targetRate: item.calculatedRate,
        targetCapacity: item.calculatedRate,
        isCompounding: item.isCompounding,
        isIdle: Boolean(item.isIdle || (!item.isCompounding && !item.speed && !item.productDescription && !item.itemCode)),
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
                Configured Machine Lines (Batch Mode)
              </h3>
            </div>
            <p className="export-modal-subtitle">
              Pre-populate operational specifications, inherit previous runs, and calculate standard pieces per hour.
            </p>
            {onOpenUniversalBlank && (
              <div className="print-sop-switch-banner">
                <span className="switch-hint">Prefer a single blank sheet?</span>
                <button
                  type="button"
                  className="btn-link-action"
                  onClick={onOpenUniversalBlank}
                  disabled={isGenerating}
                >
                  Switch to Option A: Universal Blank (1 Page) &rarr;
                </button>
              </div>
            )}
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
            <span className="export-scope-tab-title">All Lines</span>
            <span className="export-scope-tab-badge">
              {activeMaster.length} Lines
            </span>
          </button>
          <button
            type="button"
            className={`export-scope-tab ${scope === 'previousDay' ? 'active' : ''}`}
            onClick={() => setScope('previousDay')}
            disabled={isGenerating}
          >
            <span className="export-scope-tab-title">Previous Day Active Lines</span>
            <span className="export-scope-tab-badge">
              {prevDayActiveCount} Active ({previousDate || 'N/A'})
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
            <span className="export-target-val">
              {scope === 'previousDay'
                ? `Strict Previous Day (${previousDate || 'N/A'})`
                : 'Latest Logged Operational Run'}
            </span>
          </div>
          {scope !== 'current' ? (
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
              const isLineComp = Boolean(
                line.isCompounding ||
                isCompoundingLineOrProduct({
                  lineId: line.machineId,
                  fullMachineName: line.fullMachineName,
                  itemCode: line.itemCode,
                  productDescription: line.productDescription
                }, activeMaster)
              );

              // Defensive machine lookup with fallback
              const machineSetting = (typeof matchMachine === 'function' && line?.machineId)
                ? (matchMachine(line.machineId, activeMaster) || activeMaster.find((m) => m?.id === line.machineId))
                : (activeMaster.find((m) => m?.id === line?.machineId) || null);

              const nominalKgH = Number(line?.nominalCapacity) || Number(machineSetting?.nominalCapacity) || Number(machineSetting?.capacityKgH) || (isLineComp ? 400 : 200);

              const unitWeight = isLineComp ? 25.0 : (Number(line?.unitWeight) > 0 ? Number(line.unitWeight) : 1.0);
              const speed = Number(line?.speed) || 0;
              const pipeLength = isLineComp ? 0 : (Number(line?.pipeLength) > 0 ? Number(line.pipeLength) : 6.0);
              const pcsPerHour = Number(line?.calculatedRate) > 0
                ? Number(line.calculatedRate)
                : (!isLineComp && speed > 0 && pipeLength > 0 ? Math.round((speed * 60) / pipeLength) : 0);
              const calculatedKgH = isLineComp
                ? (Number(line?.calculatedRate) || nominalKgH)
                : Math.round(pcsPerHour * unitWeight);

              const utilizationPct = nominalKgH > 0 ? Math.round((calculatedKgH / nominalKgH) * 100) : 0;

              return (
                <div
                  key={line.machineId}
                  className={`print-sop-line-card${line.isSelected || scope === 'current' ? ' active' : ' disabled'}`}
                >
                  <div className="print-sop-line-header">
                    <div className="print-sop-line-title-row">
                      {scope !== 'current' && (
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
                          {scope === 'previousDay' ? `Active: ${line.previousRunDate}` : `Inherited: ${line.previousRunDate}`}
                        </span>
                      ) : (
                        <span className="print-sop-badge-default idle">
                          {scope === 'previousDay' ? `Stopped on ${previousDate || 'Previous Day'}` : 'Stopped / No Run'}
                        </span>
                      )}
                      {isLineComp ? (
                        <>
                          <span className="print-sop-badge-rate">
                            {Number(line.calculatedRate || nominalKgH).toLocaleString()} Kg / hr
                          </span>
                          <span className="print-sop-badge-nominal">
                            Bag Packaging: 25 Kg / Bag
                          </span>
                          <span className="print-sop-badge-nominal">
                            Nominal Target: {nominalKgH.toLocaleString()} kg/h
                          </span>
                          <span className="print-sop-badge-util">
                            Utilization: {nominalKgH > 0 ? Math.round((Number(line.calculatedRate || nominalKgH) / nominalKgH) * 100) : 100}%
                          </span>
                        </>
                      ) : (
                        line.calculatedRate ? (
                          <>
                            <span className="print-sop-badge-rate">
                              {Number(line.calculatedRate).toLocaleString()} Pcs / hr
                            </span>
                            <span className="print-sop-badge-kgh">
                              Calculated: {calculatedKgH.toLocaleString()} kg/h
                            </span>
                            <span className="print-sop-badge-nominal">
                              Nominal Target: {nominalKgH.toLocaleString()} kg/h
                            </span>
                            <span className="print-sop-badge-util">
                              Utilization: {utilizationPct}%
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="print-sop-badge-rate idle">
                              Idle / Blank Sheet
                            </span>
                            <span className="print-sop-badge-nominal">
                              Nominal Target: {nominalKgH.toLocaleString()} kg/h
                            </span>
                          </>
                        )
                      )}
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
                          value={line.itemCode || ''}
                          onChange={(e) => handleProductCodeChange(line.machineId, e.target.value)}
                          disabled={isGenerating || (scope !== 'current' && !line.isSelected)}
                        >
                          <option value="">-- No Product (Blank Sheet) --</option>
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
                          value={line.productDescription || ''}
                          onChange={(e) => handleProductChange(line.machineId, e.target.value)}
                          disabled={isGenerating || (scope !== 'current' && !line.isSelected)}
                        >
                          <option value="">-- Manual Pen Entry (Blank) --</option>
                          {/* Ensure currently selected product is represented */}
                          {line.productDescription && !productCatalog.some((p) => p.description === line.productDescription) && (
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

                    {/* Speed & Cut Length Controls OR Compounding Target Controls */}
                    {isLineComp ? (
                      <div className="print-sop-params-row">
                        <div className="print-sop-param">
                          <label className="print-sop-label">Target Capacity (Kg/h):</label>
                          <input
                            type="number"
                            step="10"
                            min="50"
                            max="2000"
                            className="print-sop-input"
                            value={line.calculatedRate !== undefined && line.calculatedRate !== null ? line.calculatedRate : ''}
                            placeholder="Target (Kg/h)"
                            onChange={(e) => handleCapacityChange(line.machineId, e.target.value)}
                            disabled={isGenerating || (scope !== 'current' && !line.isSelected)}
                          />
                        </div>

                        <div className="print-sop-param">
                          <label className="print-sop-label">Packaging Standard:</label>
                          <input
                            type="text"
                            className="print-sop-input"
                            value="25 Kg / Bag"
                            readOnly
                            disabled
                          />
                        </div>

                        <div className="print-sop-param print-sop-calc-summary">
                          {line.calculatedRate ? (
                            <>
                              <div className="print-sop-calc-pcs-box">
                                <span className="print-sop-calc-formula">
                                  Target Rate
                                </span>
                                <span className="print-sop-calc-val">
                                  = <strong>{Number(line.calculatedRate).toLocaleString()}</strong> kg/h
                                </span>
                              </div>
                              <span className="print-sop-calc-divider">|</span>
                              <div className="print-sop-calc-kgh-box">
                                <span className="print-sop-calc-item print-sop-calc-output">
                                  Output: <strong>{Math.round(Number(line.calculatedRate) / 25)} Bags/h</strong>
                                </span>
                                <span className="print-sop-calc-bullet">&bull;</span>
                                <span className="print-sop-calc-item print-sop-calc-nominal">
                                  Nominal Target: <strong>{nominalKgH.toLocaleString()} kg/h</strong>
                                </span>
                                <span className="print-sop-calc-bullet">&bull;</span>
                                <span className="print-sop-calc-item print-sop-calc-util" title="Calculated / Nominal">
                                  Line Type: <strong>Pelletizing / Compounding</strong>
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="print-sop-calc-idle-box">
                              <span className="print-sop-calc-idle">
                                No active capacity set &bull; Blank sheet for floor pen recording
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="print-sop-params-row">
                        <div className="print-sop-param">
                          <label className="print-sop-label">Speed (M/Min):</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            className="print-sop-input"
                            value={line.speed !== undefined && line.speed !== null ? line.speed : ''}
                            placeholder="Manual (Blank)"
                            onChange={(e) => handleSpeedChange(line.machineId, e.target.value)}
                            disabled={isGenerating || (scope !== 'current' && !line.isSelected)}
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
                            disabled={isGenerating || (scope !== 'current' && !line.isSelected)}
                          />
                        </div>

                        <div className="print-sop-param print-sop-calc-summary">
                          {line.calculatedRate ? (
                            <>
                              <div className="print-sop-calc-pcs-box">
                                <span className="print-sop-calc-formula">
                                  ({line.speed} &times; 60) / {line.pipeLength}m
                                </span>
                                <span className="print-sop-calc-val">
                                  = <strong>{line.calculatedRate}</strong> pcs/h
                                </span>
                              </div>
                              <span className="print-sop-calc-divider">|</span>
                              <div className="print-sop-calc-kgh-box">
                                <span className="print-sop-calc-item print-sop-calc-output">
                                  Calculated: <strong>{calculatedKgH.toLocaleString()} kg/h</strong>
                                </span>
                                <span className="print-sop-calc-bullet">&bull;</span>
                                <span className="print-sop-calc-item print-sop-calc-nominal">
                                  Nominal Target: <strong>{nominalKgH.toLocaleString()} kg/h</strong>
                                </span>
                                <span className="print-sop-calc-bullet">&bull;</span>
                                <span className="print-sop-calc-item print-sop-calc-util" title="Calculated / Nominal">
                                  Utilization: <strong>{utilizationPct}%</strong>
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="print-sop-calc-idle-box">
                              <span className="print-sop-calc-idle">
                                No active speed / product set &bull; Blank sheet for floor pen recording
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
              A4 Portrait &bull; 5mm Margin
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
