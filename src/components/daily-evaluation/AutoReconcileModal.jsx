import { useState, useEffect, useMemo } from 'react';
import { HOUR_WINDOWS } from '../../logic/engine.js';
import {
  getDefaultDeratingFactor,
  STANDARD_BREAKDOWN_REASONS,
  DEFAULT_EVENT_CONFIGS,
  calculateReconciliationAudit,
  reconcileShiftRun
} from '../../logic/oeeReconciler.js';

/**
 * AutoReconcileModal Component
 * Implements Reverse OEE Auto-Reconciler & Distribution Engine
 * with Manager Internal Supervisor Audit Card.
 */
export default function AutoReconcileModal({
  isOpen,
  onClose,
  report,
  derived,
  machineMaster,
  onApply
}) {
  const lineId = report?.header?.lineId || '';
  const lineName = report?.header?.lineCustom || lineId || 'Extruder Line';
  const reportDate = report?.header?.date || '';

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

  // Initial values derived from active report
  const initialActual = useMemo(() => {
    return Number(derived?.grandTotals?.actual) || Number(report?.summary?.totalOutput) || 0;
  }, [derived, report]);

  const initialDerating = useMemo(() => {
    return Number(report?.engineering?.deratingFactor) || getDefaultDeratingFactor(lineId, machineMaster);
  }, [report, lineId, machineMaster]);

  // State
  const [totalActualPieces, setTotalActualPieces] = useState(initialActual);
  const [deratingFactor, setDeratingFactor] = useState(initialDerating);

  // Shift Events State
  const [moldChange, setMoldChange] = useState({
    enabled: false,
    startSlot: DEFAULT_EVENT_CONFIGS.moldChange.defaultStartSlot,
    durationMin: DEFAULT_EVENT_CONFIGS.moldChange.defaultDurationMin,
    reason: DEFAULT_EVENT_CONFIGS.moldChange.defaultReason
  });

  const [warmup, setWarmup] = useState({
    enabled: false,
    startSlot: DEFAULT_EVENT_CONFIGS.warmup.defaultStartSlot,
    durationMin: DEFAULT_EVENT_CONFIGS.warmup.defaultDurationMin,
    reason: DEFAULT_EVENT_CONFIGS.warmup.defaultReason
  });

  const [breakdown, setBreakdown] = useState({
    enabled: false,
    startSlot: DEFAULT_EVENT_CONFIGS.breakdown.defaultStartSlot,
    durationMin: DEFAULT_EVENT_CONFIGS.breakdown.defaultDurationMin,
    reason: STANDARD_BREAKDOWN_REASONS[0],
    isCustomReason: false,
    customReasonText: ''
  });

  // Re-sync states when modal opens
  useEffect(() => {
    if (isOpen) {
      setTotalActualPieces(initialActual);
      setDeratingFactor(initialDerating);
    }
  }, [isOpen, initialActual, initialDerating]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Live Audit Telemetry
  const audit = useMemo(() => {
    const moldMin = moldChange.enabled ? Number(moldChange.durationMin) || 0 : 0;
    const warmMin = warmup.enabled ? Number(warmup.durationMin) || 0 : 0;
    const breakMin = breakdown.enabled ? Number(breakdown.durationMin) || 0 : 0;

    return calculateReconciliationAudit({
      totalActualPieces,
      targetRate,
      deratingFactor,
      moldChangeMin: moldMin,
      warmupMin: warmMin,
      breakdownMin: breakMin
    });
  }, [totalActualPieces, targetRate, deratingFactor, moldChange, warmup, breakdown]);

  if (!isOpen) return null;

  const handleApply = (e) => {
    e.preventDefault();

    const activeBreakdownReason = breakdown.isCustomReason && breakdown.customReasonText.trim()
      ? breakdown.customReasonText.trim()
      : breakdown.reason;

    const reconciled = reconcileShiftRun(report, {
      totalActualPieces: Number(totalActualPieces) || 0,
      deratingFactor: Number(deratingFactor) || 100,
      events: {
        moldChange: {
          enabled: moldChange.enabled,
          startSlot: moldChange.startSlot,
          durationMin: moldChange.durationMin,
          reason: moldChange.reason
        },
        warmup: {
          enabled: warmup.enabled,
          startSlot: warmup.startSlot,
          durationMin: warmup.durationMin,
          reason: warmup.reason
        },
        breakdown: {
          enabled: breakdown.enabled,
          startSlot: breakdown.startSlot,
          durationMin: breakdown.durationMin,
          reason: activeBreakdownReason
        }
      }
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
          {/* Section 1: Output and Machine Derating */}
          <div className="reconcile-section">
            <h4 className="export-section-title">
              1. 24h Actual Finished Goods &amp; Machine Aging Factor
            </h4>

            <div className="reconcile-grid-2">
              <div className="reconcile-field-group">
                <label htmlFor="reconcile-actual-pcs" className="reconcile-field-label">
                  Total Actual Produced Pieces (FG):
                </label>
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
                  Equivalent to <b>{audit.actualEquivalentHours.toFixed(1)} hours</b> at 100% standard capacity.
                </div>
              </div>

              <div className="reconcile-field-group">
                <div className="reconcile-label-with-badge">
                  <label htmlFor="reconcile-derating-factor" className="reconcile-field-label">
                    Machine Aging / Speed Derating:
                  </label>
                  <span className="reconcile-derating-badge">
                    {deratingFactor}% Speed Factor
                  </span>
                </div>
                <div className="reconcile-slider-row">
                  <input
                    id="reconcile-derating-factor"
                    type="range"
                    min="60"
                    max="100"
                    step="1"
                    className="reconcile-range-slider"
                    value={deratingFactor}
                    onChange={(e) => setDeratingFactor(parseInt(e.target.value, 10))}
                  />
                  <div className="reconcile-quick-buttons">
                    <button
                      type="button"
                      className={`reconcile-quick-btn ${deratingFactor === 85 ? 'active' : ''}`}
                      onClick={() => setDeratingFactor(85)}
                      title="Default for older extruder lines (KTS 200, KTS 170)"
                    >
                      85% (Older)
                    </button>
                    <button
                      type="button"
                      className={`reconcile-quick-btn ${deratingFactor === 90 ? 'active' : ''}`}
                      onClick={() => setDeratingFactor(90)}
                      title="Standard line baseline"
                    >
                      90% (Standard)
                    </button>
                    <button
                      type="button"
                      className={`reconcile-quick-btn ${deratingFactor === 100 ? 'active' : ''}`}
                      onClick={() => setDeratingFactor(100)}
                      title="100% nominal speed"
                    >
                      100% (Nominal)
                    </button>
                  </div>
                </div>
                <div className="reconcile-field-hint">
                  Adjusts Performance (P = Act/Tgt) without modifying standard SOP baseline.
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Shift Operating Events & Stoppages */}
          <div className="reconcile-section">
            <h4 className="export-section-title">
              2. Shift Operating Events &amp; Declared Downtime Windows
            </h4>

            <div className="reconcile-events-container">
              {/* Event 1: Mold / Size Change */}
              <div className={`reconcile-event-card ${moldChange.enabled ? 'active' : ''}`}>
                <div className="reconcile-event-header">
                  <label className="reconcile-checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={moldChange.enabled}
                      onChange={(e) => setMoldChange((prev) => ({ ...prev, enabled: e.target.checked }))}
                    />
                    <span className="reconcile-event-name">Mold / Size Changeover</span>
                  </label>
                  <span className="reconcile-event-badge">Setup &amp; Die Change</span>
                </div>

                {moldChange.enabled && (
                  <div className="reconcile-event-body">
                    <div className="reconcile-event-field">
                      <label className="reconcile-sub-label">Starting Hour Slot:</label>
                      <select
                        className="reconcile-select"
                        value={moldChange.startSlot}
                        onChange={(e) => setMoldChange((prev) => ({ ...prev, startSlot: parseInt(e.target.value, 10) }))}
                      >
                        {HOUR_WINDOWS.map((hw) => (
                          <option key={hw.index} value={hw.index}>
                            Hour {hw.index + 1} ({hw.label})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="reconcile-event-field">
                      <label className="reconcile-sub-label">Estimated Setup Duration:</label>
                      <div className="reconcile-input-wrap small">
                        <input
                          type="number"
                          min="15"
                          max="480"
                          step="15"
                          className="reconcile-text-input"
                          value={moldChange.durationMin}
                          onChange={(e) => setMoldChange((prev) => ({ ...prev, durationMin: parseInt(e.target.value, 10) || 0 }))}
                        />
                        <span className="reconcile-input-unit">Min ({(moldChange.durationMin / 60).toFixed(1)}h)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Event 2: Cold Start-up / Heating */}
              <div className={`reconcile-event-card ${warmup.enabled ? 'active' : ''}`}>
                <div className="reconcile-event-header">
                  <label className="reconcile-checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={warmup.enabled}
                      onChange={(e) => setWarmup((prev) => ({ ...prev, enabled: e.target.checked }))}
                    />
                    <span className="reconcile-event-name">Cold Start-up / Heating</span>
                  </label>
                  <span className="reconcile-event-badge">Thermal Warm-Up</span>
                </div>

                {warmup.enabled && (
                  <div className="reconcile-event-body">
                    <div className="reconcile-event-field">
                      <label className="reconcile-sub-label">Starting Hour Slot:</label>
                      <select
                        className="reconcile-select"
                        value={warmup.startSlot}
                        onChange={(e) => setWarmup((prev) => ({ ...prev, startSlot: parseInt(e.target.value, 10) }))}
                      >
                        {HOUR_WINDOWS.map((hw) => (
                          <option key={hw.index} value={hw.index}>
                            Hour {hw.index + 1} ({hw.label})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="reconcile-event-field">
                      <label className="reconcile-sub-label">Warm-Up Duration:</label>
                      <div className="reconcile-input-wrap small">
                        <input
                          type="number"
                          min="15"
                          max="240"
                          step="15"
                          className="reconcile-text-input"
                          value={warmup.durationMin}
                          onChange={(e) => setWarmup((prev) => ({ ...prev, durationMin: parseInt(e.target.value, 10) || 0 }))}
                        />
                        <span className="reconcile-input-unit">Min ({(warmup.durationMin / 60).toFixed(1)}h)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Event 3: Logged Breakdown */}
              <div className={`reconcile-event-card ${breakdown.enabled ? 'active' : ''}`}>
                <div className="reconcile-event-header">
                  <label className="reconcile-checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={breakdown.enabled}
                      onChange={(e) => setBreakdown((prev) => ({ ...prev, enabled: e.target.checked }))}
                    />
                    <span className="reconcile-event-name">Logged Breakdown / Technical Stoppage</span>
                  </label>
                  <span className="reconcile-event-badge alert">Machine Failure</span>
                </div>

                {breakdown.enabled && (
                  <div className="reconcile-event-body">
                    <div className="reconcile-event-field">
                      <label className="reconcile-sub-label">Starting Hour Slot:</label>
                      <select
                        className="reconcile-select"
                        value={breakdown.startSlot}
                        onChange={(e) => setBreakdown((prev) => ({ ...prev, startSlot: parseInt(e.target.value, 10) }))}
                      >
                        {HOUR_WINDOWS.map((hw) => (
                          <option key={hw.index} value={hw.index}>
                            Hour {hw.index + 1} ({hw.label})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="reconcile-event-field">
                      <label className="reconcile-sub-label">Breakdown Duration:</label>
                      <div className="reconcile-input-wrap small">
                        <input
                          type="number"
                          min="15"
                          max="720"
                          step="15"
                          className="reconcile-text-input"
                          value={breakdown.durationMin}
                          onChange={(e) => setBreakdown((prev) => ({ ...prev, durationMin: parseInt(e.target.value, 10) || 0 }))}
                        />
                        <span className="reconcile-input-unit">Min ({(breakdown.durationMin / 60).toFixed(1)}h)</span>
                      </div>
                    </div>

                    <div className="reconcile-event-field full-width">
                      <label className="reconcile-sub-label">Technical Reason Category:</label>
                      <select
                        className="reconcile-select"
                        value={breakdown.isCustomReason ? '__custom__' : breakdown.reason}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setBreakdown((prev) => ({ ...prev, isCustomReason: true }));
                          } else {
                            setBreakdown((prev) => ({
                              ...prev,
                              isCustomReason: false,
                              reason: e.target.value
                            }));
                          }
                        }}
                      >
                        {STANDARD_BREAKDOWN_REASONS.map((r, idx) => (
                          <option key={idx} value={r}>{r}</option>
                        ))}
                        <option value="__custom__">Custom Technical Reason...</option>
                      </select>
                      {breakdown.isCustomReason && (
                        <input
                          type="text"
                          className="reconcile-text-input custom-reason-input"
                          placeholder="Type custom technical breakdown reason..."
                          value={breakdown.customReasonText}
                          onChange={(e) => setBreakdown((prev) => ({ ...prev, customReasonText: e.target.value }))}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Internal Supervisor Audit Reconciliation Card (Manager View Only) */}
          <div className="reconcile-audit-card">
            <div className="reconcile-audit-header">
              <div className="reconcile-audit-title-wrap">
                <span className="reconcile-audit-title">Internal Supervisor Audit Reconciliation</span>
                <span className="reconcile-audit-tag">Manager View Only</span>
              </div>
              <span className="reconcile-audit-kicker">Theoretical 24h Capacity: <b>{audit.theoreticalCapacityPcs.toLocaleString()} Pcs</b></span>
            </div>

            <div className="reconcile-audit-grid">
              <div className="reconcile-audit-col">
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Actual Produced Output:</span>
                  <span className="reconcile-metric-val">{audit.actualPcs.toLocaleString()} Pcs ({audit.actualEquivalentHours.toFixed(1)}h)</span>
                </div>
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Total Missing Output:</span>
                  <span className="reconcile-metric-val text-amber-300">{audit.missingPieces.toLocaleString()} Pcs ({audit.missingHours.toFixed(1)}h)</span>
                </div>
              </div>

              <div className="reconcile-audit-col border-left">
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Declared Stoppages (Downtime):</span>
                  <span className="reconcile-metric-val">{audit.totalDowntimeHours.toFixed(1)}h ({audit.totalDowntimeMin} min)</span>
                </div>
                <div className="reconcile-audit-metric">
                  <span className="reconcile-metric-lbl">Speed Aging Derating Loss ({audit.deratingFactor}%):</span>
                  <span className="reconcile-metric-val">{audit.speedDeratingLossHours.toFixed(1)}h (~{audit.speedDeratingLossPieces} Pcs)</span>
                </div>
                <div className="reconcile-audit-metric font-semibold text-emerald-300">
                  <span className="reconcile-metric-lbl">Total Accounted Variance:</span>
                  <span className="reconcile-metric-val">{audit.totalAccountedHours.toFixed(1)}h</span>
                </div>
              </div>
            </div>

            {/* Unexplained Time Gap Alert Banner */}
            {audit.unexplainedGapHours > 0.1 ? (
              <div className="reconcile-alert-box alert-warning">
                <div className="reconcile-alert-icon">⚠️</div>
                <div className="reconcile-alert-content">
                  <div className="reconcile-alert-title">
                    Unexplained Time Gap: <b>{audit.unexplainedGapHours.toFixed(1)} Hours</b> (~{audit.unexplainedGapPieces.toLocaleString()} Pcs)
                  </div>
                  <div className="reconcile-alert-desc">
                    Missing output exceeds declared setup, breakdowns, and machine aging derating. Minor unlogged micro-stoppages, slower haul-off pacing, or operator speed derating require internal supervisor review.
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
                    All cycle variance is cleanly accounted for by declared setup events, breakdowns, and the machine aging derating factor.
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
