import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, Clock, Wrench, AlertTriangle, Zap, Check, RotateCcw } from 'lucide-react';
import { HOUR_WINDOWS } from '../../logic/engine.js';
import {
  STANDARD_DOWNTIME_PRESETS,
  calculateReconciliationAudit,
  reconcileShiftRun,
  queryProductionRecords
} from '../../logic/oeeReconciler.js';

/**
 * AutoReconcileModal Component
 * Implements Reverse OEE Auto-Reconciler & Distribution Engine
 * with Dual-Mode Downtime Entry (Standard Presets vs Direct Manual vs Zero Downtime)
 * and True Speed-Loss Decoupling.
 */
export default function AutoReconcileModal({
  isOpen,
  onClose,
  report,
  derived,
  machineMaster,
  dataset = [],
  onApply
}) {
  const lineId = report?.header?.lineId || '';
  const lineName = report?.header?.lineCustom || lineId || 'Extruder Line';
  const reportDate = report?.header?.date || '';

  // Automatic Actual Output Lookup from loaded daily production dataset
  const autoMatchedRecords = useMemo(() => {
    if (!dataset || dataset.length === 0 || !reportDate || !lineId) return [];
    return queryProductionRecords({
      dataset,
      date: reportDate,
      machine: lineId,
      machineMaster
    });
  }, [dataset, reportDate, lineId, machineMaster]);

  const autoMatchedQty = useMemo(() => {
    if (autoMatchedRecords.length === 0) return null;
    return autoMatchedRecords.reduce((sum, r) => sum + (Number(r.productionQty) || 0), 0);
  }, [autoMatchedRecords]);

  // Nominal standard rate (Pcs/h) from derived or ref
  const targetRate = useMemo(() => {
    const fromSlot = derived?.slots?.[0]?.rate;
    if (fromSlot > 0) return fromSlot;
    const ref1 = report?.refs?.['1'] || {};
    if (Number(ref1.targetRate) > 0) return Number(ref1.targetRate);
    if (Number(ref1.speed) > 0) {
      const len = Number(ref1.pipeLength) || 6.0;
      return Math.round(((Number(ref1.speed) * 60) / len) * 10) / 10;
    }
    return 100;
  }, [derived, report]);

  // Initial values derived from auto-matched daily log or active report
  const initialActual = useMemo(() => {
    if (autoMatchedQty != null && autoMatchedQty > 0) {
      return autoMatchedQty;
    }
    return Number(derived?.grandTotals?.actual) || Number(report?.summary?.totalOutput) || 0;
  }, [autoMatchedQty, derived, report]);

  // Production Output State
  const [totalActualPieces, setTotalActualPieces] = useState(initialActual);

  // Downtime Entry Mode: 'preset' (Mode A) | 'manual' (Mode B) | 'zero' (Continuous 24h)
  const [downtimeMode, setDowntimeMode] = useState('preset');

  // Mode A: Standard Downtime Presets Catalog State
  const [presetsState, setPresetsState] = useState(() =>
    STANDARD_DOWNTIME_PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      durationMin: p.defaultDurationMin,
      startSlot: p.defaultStartSlot,
      enabled: false,
      reason: p.name,
      isCustom: p.id === 'custom_breakdown'
    }))
  );

  // Mode B: Direct Manual Entry State
  const [manualDowntime, setManualDowntime] = useState({
    durationMin: 60,
    startSlot: 0,
    reason: 'Unplanned Equipment Stoppage'
  });

  // Re-sync states when modal opens
  useEffect(() => {
    if (isOpen) {
      setTotalActualPieces(initialActual);
    }
  }, [isOpen, initialActual]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Toggle or update a preset in Mode A
  const handleTogglePreset = (id) => {
    setPresetsState((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  const handleUpdatePreset = (id, field, value) => {
    setPresetsState((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  // Live Audit Telemetry calculation
  const audit = useMemo(() => {
    let dtMin = 0;
    let moldMin = 0;
    let warmMin = 0;
    let breakMin = 0;
    let manualMin = 0;

    if (downtimeMode === 'zero') {
      dtMin = 0;
    } else if (downtimeMode === 'manual') {
      manualMin = Math.max(0, Number(manualDowntime.durationMin) || 0);
      dtMin = manualMin;
    } else {
      presetsState.forEach((p) => {
        if (p.enabled) {
          const min = Math.max(0, Number(p.durationMin) || 0);
          dtMin += min;
          if (p.id === 'mold_change' || p.name.toLowerCase().includes('mold')) {
            moldMin += min;
          } else if (p.id === 'startup_calibration' || p.id === 'warmup') {
            warmMin += min;
          } else {
            breakMin += min;
          }
        }
      });
    }

    return calculateReconciliationAudit({
      totalActualPieces,
      targetRate,
      totalDowntimeMin: dtMin,
      moldChangeMin: moldMin,
      warmupMin: warmMin,
      breakdownMin: breakMin,
      manualDowntimeMin: manualMin
    });
  }, [totalActualPieces, targetRate, downtimeMode, presetsState, manualDowntime]);

  if (!isOpen) return null;

  const handleApply = (e) => {
    e.preventDefault();

    const activePresets = presetsState.filter((p) => p.enabled);

    const reconciled = reconcileShiftRun(report, {
      totalActualPieces: Number(totalActualPieces) || 0,
      mode: downtimeMode,
      zeroDowntime: downtimeMode === 'zero',
      manualDowntime: {
        enabled: downtimeMode === 'manual',
        durationMin: Number(manualDowntime.durationMin) || 0,
        reason: manualDowntime.reason || 'Unplanned Equipment Stoppage',
        startSlot: Number(manualDowntime.startSlot) || 0
      },
      presets: activePresets
    });

    if (typeof onApply === 'function') {
      onApply(reconciled);
    }
  };

  return (
    <div className="export-modal-backdrop no-print" onClick={onClose}>
      <div
        className="export-modal-dialog reconcile-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reconcile-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="export-modal-header">
          <div>
            <h3 id="reconcile-modal-title" className="export-modal-title">
              Auto-Reconcile Shift Run &amp; OEE Distribution
            </h3>
            <p className="export-modal-subtitle">
              Machine: <b>{lineName}</b> &middot; Date: <b>{reportDate}</b> &middot; Standard Baseline: <b>{targetRate} Pcs/h</b>
            </p>
          </div>
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleApply} className="export-modal-form reconcile-modal-form">
          {/* Section 1: Output */}
          <div className="reconcile-section">
            <h4 className="export-section-title">
              1. 24h Actual Finished Goods Output
            </h4>

            <div className="reconcile-field-group">
              <div className="reconcile-label-with-badge">
                <label htmlFor="reconcile-actual-pcs" className="reconcile-field-label">
                  Total Actual Produced Pieces (FG):
                </label>
                {autoMatchedQty != null && (
                  <span className="reconcile-auto-match-badge" title="Automatically pre-populated from ingested daily production log">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Auto-Bound: {autoMatchedQty.toLocaleString()} Pcs</span>
                  </span>
                )}
              </div>
              <div className="reconcile-input-wrap">
                <input
                  id="reconcile-actual-pcs"
                  type="number"
                  min="0"
                  step="1"
                  className="reconcile-text-input"
                  value={totalActualPieces}
                  onChange={(e) => setTotalActualPieces(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
                <span className="reconcile-input-unit">Pcs</span>
              </div>
              <div className="reconcile-field-hint">
                {autoMatchedRecords.length > 0 && autoMatchedRecords[0]?.description ? (
                  <span className="text-emerald-400 font-medium">
                    Matched: {autoMatchedRecords[0].itemCode ? `[${autoMatchedRecords[0].itemCode}] ` : ''}{autoMatchedRecords[0].description} &middot;{' '}
                  </span>
                ) : null}
                Equivalent to <b>{audit.actualEquivalentHours.toFixed(1)} hours</b> at 100% standard capacity ({targetRate} Pcs/h).
              </div>
            </div>
          </div>

          {/* Section 2: Shift Operating Events & Stoppages (Dual-Mode Entry) */}
          <div className="reconcile-section">
            <div className="reconcile-label-with-badge">
              <h4 className="export-section-title" style={{ margin: 0 }}>
                2. Shift Downtime Entry &amp; Operating Stoppages
              </h4>
              <span className="reconcile-field-hint">
                Operating Time: <b>{audit.operatingHours.toFixed(1)}h</b> &middot; Downtime: <b>{audit.totalDowntimeHours.toFixed(1)}h</b>
              </span>
            </div>

            {/* Mode Selector Tabs */}
            <div className="reconcile-tabs-row">
              <button
                type="button"
                className={`reconcile-tab-btn ${downtimeMode === 'preset' ? 'active' : ''}`}
                onClick={() => setDowntimeMode('preset')}
              >
                <Wrench className="w-3.5 h-3.5" />
                Standard Presets (Mode A)
              </button>
              <button
                type="button"
                className={`reconcile-tab-btn ${downtimeMode === 'manual' ? 'active' : ''}`}
                onClick={() => setDowntimeMode('manual')}
              >
                <Clock className="w-3.5 h-3.5" />
                Direct Manual Entry (Mode B)
              </button>
              <button
                type="button"
                className={`reconcile-tab-btn ${downtimeMode === 'zero' ? 'active-zero' : ''}`}
                onClick={() => setDowntimeMode('zero')}
                title="Continuous 24-hour run with 0 downtime. All production deficit is evaluated as reduced speed."
              >
                <Zap className="w-3.5 h-3.5" />
                Zero Downtime (24h Full Run)
              </button>
            </div>

            {/* Sub-Panel: Zero Downtime Continuous Run */}
            {downtimeMode === 'zero' && (
              <div className="reconcile-mode-banner zero-mode">
                <div className="font-bold flex items-center gap-1.5 mb-1 text-emerald-800">
                  <Check className="w-4 h-4 text-emerald-600" />
                  Continuous 24-Hour Operation (0 Minutes Downtime)
                </div>
                <div>
                  Availability is locked at <b>100.0%</b> (24.0 operating hours). Any production deficit ({audit.speedLossPieces.toLocaleString()} Pcs)
                  is evaluated strictly as <b>Speed Loss (Performance: {audit.performancePct.toFixed(1)}%)</b> running at{' '}
                  <b>{audit.actualHourlyRate.toFixed(1)} Pcs/h</b> vs standard <b>{targetRate} Pcs/h</b>.
                </div>
              </div>
            )}

            {/* Sub-Panel: Direct Manual Entry (Mode B) */}
            {downtimeMode === 'manual' && (
              <div className="reconcile-event-card active">
                <div className="reconcile-event-header">
                  <span className="reconcile-checkbox-wrap">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    <span className="reconcile-event-name">Direct Manual Stoppage Declaration</span>
                  </span>
                  <span className="reconcile-event-badge alert">Direct Entry</span>
                </div>
                <div className="reconcile-event-body">
                  <div className="reconcile-event-field full-width">
                    <label className="reconcile-sub-label">Stoppage Reason / Description:</label>
                    <input
                      type="text"
                      className="reconcile-text-input"
                      placeholder="e.g., Unplanned Power Loss, Puller Jam, Water Chiller Failure..."
                      value={manualDowntime.reason}
                      onChange={(e) => setManualDowntime((prev) => ({ ...prev, reason: e.target.value }))}
                    />
                  </div>
                  <div className="reconcile-event-field">
                    <label className="reconcile-sub-label">Starting Hour Slot:</label>
                    <select
                      className="reconcile-select"
                      value={manualDowntime.startSlot}
                      onChange={(e) => setManualDowntime((prev) => ({ ...prev, startSlot: parseInt(e.target.value, 10) }))}
                    >
                      {HOUR_WINDOWS.map((hw) => (
                        <option key={hw.index} value={hw.index}>
                          Hour {hw.index + 1} ({hw.label})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="reconcile-event-field">
                    <label className="reconcile-sub-label">Total Downtime Duration:</label>
                    <div className="reconcile-input-wrap small">
                      <input
                        type="number"
                        min="5"
                        max="1440"
                        step="15"
                        className="reconcile-text-input"
                        value={manualDowntime.durationMin}
                        onChange={(e) =>
                          setManualDowntime((prev) => ({
                            ...prev,
                            durationMin: Math.max(0, parseInt(e.target.value, 10) || 0)
                          }))
                        }
                      />
                      <span className="reconcile-input-unit">
                        Min ({((Number(manualDowntime.durationMin) || 0) / 60).toFixed(1)}h)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-Panel: Mode A - Standard Presets Catalog */}
            {downtimeMode === 'preset' && (
              <div className="reconcile-presets-grid">
                {presetsState.map((preset) => {
                  const isChecked = preset.enabled;
                  return (
                    <div
                      key={preset.id}
                      className={`reconcile-event-card ${isChecked ? 'active' : ''}`}
                    >
                      <div className="reconcile-event-header">
                        <label className="reconcile-checkbox-wrap">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleTogglePreset(preset.id)}
                          />
                          <span className="reconcile-event-name">{preset.name}</span>
                        </label>
                        <span className={`reconcile-event-badge ${preset.category === 'Electrical' || preset.category === 'Mechanical' ? 'alert' : ''}`}>
                          {preset.category}
                        </span>
                      </div>

                      {isChecked && (
                        <div className="reconcile-event-body" style={{ marginTop: 6, paddingTop: 6 }}>
                          <div className="reconcile-event-field">
                            <label className="reconcile-sub-label">Start Hour:</label>
                            <select
                              className="reconcile-select"
                              value={preset.startSlot}
                              onChange={(e) =>
                                handleUpdatePreset(preset.id, 'startSlot', parseInt(e.target.value, 10))
                              }
                            >
                              {HOUR_WINDOWS.map((hw) => (
                                <option key={hw.index} value={hw.index}>
                                  Hour {hw.index + 1} ({hw.label})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="reconcile-event-field">
                            <label className="reconcile-sub-label">Duration:</label>
                            <div className="reconcile-input-wrap small">
                              <input
                                type="number"
                                min="0"
                                max="1440"
                                step="15"
                                className="reconcile-text-input"
                                value={preset.durationMin}
                                onChange={(e) =>
                                  handleUpdatePreset(
                                    preset.id,
                                    'durationMin',
                                    Math.max(0, parseInt(e.target.value, 10) || 0)
                                  )
                                }
                              />
                              <span className="reconcile-input-unit">
                                Min ({((Number(preset.durationMin) || 0) / 60).toFixed(1)}h)
                              </span>
                            </div>
                          </div>

                          {preset.isCustom && (
                            <div className="reconcile-event-field full-width">
                              <label className="reconcile-sub-label">Custom Reason Description:</label>
                              <input
                                type="text"
                                className="reconcile-text-input"
                                placeholder="Specify custom breakdown reason..."
                                value={preset.reason}
                                onChange={(e) => handleUpdatePreset(preset.id, 'reason', e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Internal Supervisor Audit Reconciliation Card (Manager View Only) */}
          <div className="reconcile-audit-card">
            <div className="reconcile-audit-header">
              <div className="reconcile-audit-title-wrap">
                <span className="reconcile-audit-title">Internal Supervisor Audit Reconciliation</span>
                <span className="reconcile-audit-tag">Manager View Only</span>
              </div>
              <span className="reconcile-audit-kicker">
                Theoretical 24h Capacity: <b>{audit.theoreticalCapacityPcs.toLocaleString()} Pcs</b> ({targetRate} Pcs/h)
              </span>
            </div>

            <div className="reconcile-audit-grid">
              {/* Column 1: Operating Time & Production Rate */}
              <div className="reconcile-audit-col">
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Actual Produced Output:</span>
                  <span className="reconcile-metric-val font-bold text-white">
                    {audit.actualPcs.toLocaleString()} Pcs
                  </span>
                </div>
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Operating Time (Availability):</span>
                  <span className="reconcile-metric-val font-semibold text-emerald-300">
                    {audit.operatingHours.toFixed(1)}h ({audit.availabilityPct.toFixed(1)}%)
                  </span>
                </div>
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Standard Target for Operating Time:</span>
                  <span className="reconcile-metric-val">
                    {audit.targetOutputForOperating.toLocaleString()} Pcs
                  </span>
                </div>
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Actual Produced Hourly Rate:</span>
                  <span className="reconcile-metric-val font-bold text-cyan-300">
                    {audit.actualHourlyRate.toFixed(1)} Pcs/h (vs {audit.targetRate} Nominal)
                  </span>
                </div>
              </div>

              {/* Column 2: Decoupled Loss Breakdown */}
              <div className="reconcile-audit-col border-left">
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Declared Stoppage Loss (Downtime):</span>
                  <span className="reconcile-metric-val text-amber-300">
                    {audit.downtimePieces.toLocaleString()} Pcs ({audit.totalDowntimeHours.toFixed(1)}h)
                  </span>
                </div>
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Operational Speed Loss (Reduced Rate):</span>
                  <span className="reconcile-metric-val text-blue-300">
                    {audit.speedLossPieces.toLocaleString()} Pcs ({audit.speedLossHours.toFixed(1)}h)
                  </span>
                </div>
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Performance Rate Efficiency:</span>
                  <span className="reconcile-metric-val font-bold text-blue-300">
                    {audit.performancePct.toFixed(1)}%
                  </span>
                </div>
                <div className="reconcile-audit-metric font-semibold text-emerald-300 border-top pt-1 mt-0.5">
                  <span className="reconcile-metric-lbl font-bold text-white">Overall Calculated OEE:</span>
                  <span className="reconcile-metric-val font-extrabold text-emerald-400">
                    {audit.overallOeePct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Alert & Verification Banners */}
            {audit.totalDowntimeHours === 0 && audit.speedLossPieces > 0 ? (
              <div className="reconcile-alert-box alert-success">
                <div className="reconcile-alert-icon">⚡</div>
                <div className="reconcile-alert-content">
                  <div className="reconcile-alert-title">
                    100.0% Availability &middot; True Speed-Loss Operation
                  </div>
                  <div className="reconcile-alert-desc">
                    Machine ran continuously for 24.0 hours with 0 downtime. Output shortfall of {audit.speedLossPieces.toLocaleString()} Pcs is 100% accounted for by reduced haul-off pacing ({audit.actualHourlyRate.toFixed(1)} Pcs/h vs {audit.targetRate} nominal rate).
                  </div>
                </div>
              </div>
            ) : audit.unexplainedGapHours > 0.1 ? (
              <div className="reconcile-alert-box alert-warning">
                <div className="reconcile-alert-icon">⚠️</div>
                <div className="reconcile-alert-content">
                  <div className="reconcile-alert-title">
                    Unexplained Time Gap: <b>{audit.unexplainedGapHours.toFixed(1)} Hours</b> (~{audit.unexplainedGapPieces.toLocaleString()} Pcs)
                  </div>
                  <div className="reconcile-alert-desc">
                    Missing output exceeds declared setup and breakdown events. Minor unlogged micro-stoppages or slower haul-off pacing require internal supervisor review.
                  </div>
                </div>
              </div>
            ) : (
              <div className="reconcile-alert-box alert-success">
                <div className="reconcile-alert-icon">✅</div>
                <div className="reconcile-alert-content">
                  <div className="reconcile-alert-title">
                    100% Fully Reconciled Shift Run
                  </div>
                  <div className="reconcile-alert-desc">
                    All cycle variance is cleanly accounted for by declared setup events, stoppages, and operating speed.
                  </div>
                </div>
              </div>
            )}

            <div className="reconcile-audit-disclaimer">
              * Internal Supervisor Audit Telemetry: Variance analysis is retained for shop-floor management and does not print onto formal SOP exports (DOC-Ext.-03).
            </div>
          </div>

          {/* Footer */}
          <div className="export-modal-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-generate-export"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Apply Smart Reconciliation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
