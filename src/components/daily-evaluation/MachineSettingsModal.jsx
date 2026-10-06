import React, { useState, useEffect, useMemo } from 'react';
import {
  getAllMachineCapacities,
  setMachineNominalCapacity,
  resetMachineNominalCapacities
} from '../../logic/machineSettingsConfig.js';

export default function MachineSettingsModal({
  isOpen,
  onClose,
  machineMaster = [],
  onSaved = null,
  onNotify = null
}) {
  const [capacitiesState, setCapacitiesState] = useState({});
  const [feedbackToast, setFeedbackToast] = useState('');
  const [isSavedFeedback, setIsSavedFeedback] = useState(false);

  // Load latest capacities upon modal opening
  const machineList = useMemo(() => {
    return getAllMachineCapacities(machineMaster);
  }, [isOpen, machineMaster]);

  useEffect(() => {
    if (!isOpen) return;
    const initialMap = {};
    machineList.forEach((m) => {
      initialMap[m.id] = m.nominalCapacity;
    });
    setCapacitiesState(initialMap);
    setFeedbackToast('');
    setIsSavedFeedback(false);
  }, [isOpen, machineList]);

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

  if (!isOpen) return null;

  const handleCapacityChange = (lineId, value) => {
    setCapacitiesState((prev) => ({
      ...prev,
      [lineId]: value === '' ? '' : Number(value)
    }));
  };

  const handleResetLine = (lineId, defaultVal) => {
    setCapacitiesState((prev) => ({
      ...prev,
      [lineId]: defaultVal
    }));
    resetMachineNominalCapacities(lineId);
    showNotice(`Reset ${lineId} to default: ${defaultVal} kg/h`);
  };

  const showNotice = (msg) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast((prev) => (prev === msg ? '' : prev));
    }, 4000);
  };

  const handleSaveAll = (e) => {
    if (e) e.preventDefault();
    let updatedCount = 0;

    machineList.forEach((m) => {
      const currentVal = capacitiesState[m.id];
      const defaultVal = m.defaultCapacity;
      if (currentVal !== undefined && currentVal !== '' && Number(currentVal) > 0) {
        const numVal = Math.round(Number(currentVal));
        if (numVal !== defaultVal) {
          setMachineNominalCapacity(m.id, numVal);
          updatedCount += 1;
        } else {
          // If value equals default, remove any redundant override
          resetMachineNominalCapacities(m.id);
        }
      }
    });

    setIsSavedFeedback(true);
    const msg = updatedCount > 0
      ? `Successfully saved nominal capacity rates (${updatedCount} line${updatedCount > 1 ? 's' : ''} customized).`
      : 'Nominal capacities saved. All lines aligned with factory defaults.';
    showNotice(msg);
    if (typeof onNotify === 'function') {
      onNotify(msg);
    }
    if (typeof onSaved === 'function') {
      onSaved(capacitiesState);
    }
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleResetAll = () => {
    if (window.confirm('Restore nominal capacities for all machine lines to factory defaults?')) {
      resetMachineNominalCapacities(null);
      const resetMap = {};
      machineList.forEach((m) => {
        resetMap[m.id] = m.defaultCapacity;
      });
      setCapacitiesState(resetMap);
      const msg = 'All machine nominal rates restored to factory defaults.';
      showNotice(msg);
      if (typeof onNotify === 'function') {
        onNotify(msg);
      }
      if (typeof onSaved === 'function') {
        onSaved(resetMap);
      }
    }
  };

  return (
    <div className="export-modal-backdrop no-print" onClick={onClose}>
      <div
        className="export-modal-dialog print-sop-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="machine-settings-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 860 }}
      >
        <div className="export-modal-header">
          <div className="export-modal-header-left">
            <div className="export-modal-header-icon-wrap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h3 id="machine-settings-modal-title" className="export-modal-title">
                Machine Master Settings &middot; Nominal Capacities (kg/h)
              </h3>
              <p className="export-modal-subtitle">
                Configure and persist nominal output rates per production line. Changes automatically propagate to Batch SOP blanks, utilization %, OEE calculations, and Excel exports.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            aria-label="Close settings dialog"
          >
            &times;
          </button>
        </div>

        {feedbackToast && (
          <div
            style={{
              padding: '10px 16px',
              margin: '12px 20px 0',
              borderRadius: '8px',
              backgroundColor: isSavedFeedback ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              border: `1px solid ${isSavedFeedback ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
              color: isSavedFeedback ? '#10b981' : '#60a5fa',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>{isSavedFeedback ? '✓' : 'ℹ'}</span>
            <span>{feedbackToast}</span>
          </div>
        )}

        <div style={{ padding: '16px 20px', maxHeight: '60vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left', color: '#94a3b8' }}>
                <th style={{ padding: '8px 10px' }}>Line ID</th>
                <th style={{ padding: '8px 10px' }}>Machine Name & Type</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Default Rate</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Configured Rate (kg/h)</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {machineList.map((m) => {
                const currentVal = capacitiesState[m.id];
                const numVal = currentVal !== undefined && currentVal !== '' ? Number(currentVal) : m.nominalCapacity;
                const isModified = numVal !== m.defaultCapacity;

                return (
                  <tr
                    key={m.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      backgroundColor: isModified ? 'rgba(56, 189, 248, 0.04)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: m.isPelletizingLine ? 'rgba(168, 85, 247, 0.15)' : 'rgba(14, 165, 233, 0.15)',
                          color: m.isPelletizingLine ? '#c084fc' : '#38bdf8',
                          fontSize: '12px',
                          border: `1px solid ${m.isPelletizingLine ? 'rgba(168, 85, 247, 0.3)' : 'rgba(14, 165, 233, 0.3)'}`
                        }}
                      >
                        {m.id}
                      </span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{m.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{m.lineType}</div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', color: '#94a3b8' }}>
                      <span>{m.defaultCapacity} kg/h</span>
                      {m.uploadedCapacity != null && (
                        <div style={{ fontSize: '10px', color: '#0ea5e9' }}>(Excel Upload)</div>
                      )}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="number"
                          step="10"
                          min="10"
                          max="5000"
                          value={currentVal !== undefined ? currentVal : m.nominalCapacity}
                          onChange={(e) => handleCapacityChange(m.id, e.target.value)}
                          style={{
                            width: '100px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(15, 23, 42, 0.8)',
                            border: `1px solid ${isModified ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)'}`,
                            color: '#f8fafc',
                            fontWeight: 600,
                            textAlign: 'right',
                            outline: 'none'
                          }}
                          placeholder={String(m.defaultCapacity)}
                        />
                        <span style={{ fontSize: '11px', color: '#64748b' }}>kg/h</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      {isModified ? (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '999px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: '1px solid rgba(16, 185, 129, 0.3)'
                          }}
                        >
                          Custom Override
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '999px',
                            backgroundColor: 'rgba(100, 116, 139, 0.15)',
                            color: '#94a3b8',
                            fontSize: '11px',
                            border: '1px solid rgba(100, 116, 139, 0.25)'
                          }}
                        >
                          Factory Default
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      {isModified && (
                        <button
                          type="button"
                          onClick={() => handleResetLine(m.id, m.defaultCapacity)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            backgroundColor: 'transparent',
                            color: '#f87171',
                            border: '1px solid rgba(248, 113, 113, 0.3)'
                          }}
                          title={`Reset ${m.id} to ${m.defaultCapacity} kg/h`}
                        >
                          Reset
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="export-modal-footer print-sop-footer" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleResetAll}
            style={{ color: '#f87171' }}
            title="Restore all machine lines to factory default nominal capacities"
          >
            Reset All to Defaults
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveAll}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
