import React, { useState, useEffect } from 'react';
import { saveProduct } from '../../logic/productCatalogHelper.js';

export default function RegisterProductModal({
  isOpen,
  onClose,
  targetLineId = '',
  initialCode = '',
  initialDesc = '',
  onSaveProduct
}) {
  const [itemCode, setItemCode] = useState('');
  const [description, setDescription] = useState('');
  const [odMm, setOdMm] = useState('');
  const [wallThickness, setWallThickness] = useState('');
  const [material, setMaterial] = useState('uPVC');
  const [unitWeight, setUnitWeight] = useState('');
  const [pipeLength, setPipeLength] = useState('6.0');
  const [nominalSpeed, setNominalSpeed] = useState('');
  const [targetPcsH, setTargetPcsH] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setItemCode(initialCode || '');
      setDescription(initialDesc || '');
      setOdMm('');
      setWallThickness('');
      setMaterial('uPVC');
      setUnitWeight('');
      setPipeLength('6.0');
      setNominalSpeed('');
      setTargetPcsH('');
      setErrorMsg('');
      setIsSaving(false);
    }
  }, [isOpen, initialCode, initialDesc]);

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

  // Intercompute nominalSpeed and targetPcsH when changed
  const handleSpeedChange = (val) => {
    setNominalSpeed(val);
    const speedNum = Number(val);
    const lenNum = Number(pipeLength) || 6.0;
    if (!isNaN(speedNum) && speedNum > 0 && lenNum > 0) {
      setTargetPcsH(String(Math.round((speedNum * 60) / lenNum)));
    }
  };

  const handlePcsHChange = (val) => {
    setTargetPcsH(val);
    const pcsNum = Number(val);
    const lenNum = Number(pipeLength) || 6.0;
    if (!isNaN(pcsNum) && pcsNum > 0 && lenNum > 0) {
      setNominalSpeed(String(Math.round(((pcsNum * lenNum) / 60) * 10) / 10));
    }
  };

  const handlePipeLengthChange = (val) => {
    setPipeLength(val);
    const lenNum = Number(val) || 6.0;
    const speedNum = Number(nominalSpeed);
    if (!isNaN(speedNum) && speedNum > 0 && lenNum > 0) {
      setTargetPcsH(String(Math.round((speedNum * 60) / lenNum)));
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMsg('');

    const cleanCode = itemCode.trim();
    const cleanDesc = description.trim();

    if (!cleanCode) {
      setErrorMsg('Product Code / Mold ID is required.');
      return;
    }
    if (!cleanDesc) {
      setErrorMsg('Product Description & Specs are required.');
      return;
    }

    const uWeightNum = Number(unitWeight);
    const lengthNum = Number(pipeLength) || 6.0;
    const speedNum = nominalSpeed ? Number(nominalSpeed) : null;
    const targetPcsHNum = targetPcsH ? Math.round(Number(targetPcsH)) : null;

    setIsSaving(true);
    try {
      const saved = saveProduct({
        itemCode: cleanCode,
        description: cleanDesc,
        odMm: odMm.trim() || null,
        wallThickness: wallThickness.trim() || null,
        material: material.trim() || 'uPVC',
        unitWeight: !isNaN(uWeightNum) && uWeightNum > 0 ? uWeightNum : 0,
        stdWeight: !isNaN(uWeightNum) && uWeightNum > 0 ? uWeightNum : 0,
        pipeLength: lengthNum,
        nominalSpeed: speedNum,
        targetPcsH: targetPcsHNum,
        source: 'manual'
      }, { syncServer: true });

      if (onSaveProduct) {
        onSaveProduct(saved, targetLineId);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to register product');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="export-modal-backdrop" style={{ zIndex: 10000 }}>
      <div
        className="export-modal-dialog print-sop-modal-dialog"
        style={{ maxWidth: '640px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="export-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 className="export-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <span style={{ color: '#10b981' }}>+</span> Register New Product Code / Mold
            </h3>
            <p className="export-modal-subtitle" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
              Add a new specification to the persistent product catalog{targetLineId ? ` and assign to ${targetLineId}` : ''}.
            </p>
          </div>
          <button
            type="button"
            className="export-modal-close"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}
          >
            &times;
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {errorMsg && (
            <div style={{
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              color: '#f87171',
              fontSize: '13px'
            }}>
              {errorMsg}
            </div>
          )}

          {/* Row 1: Item Code & Material */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Product Code / Mold ID <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="print-sop-input"
                placeholder="e.g. 188, 249, 930"
                value={itemCode}
                onChange={(e) => setItemCode(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Material
              </label>
              <select
                className="print-sop-select"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              >
                <option value="uPVC">uPVC (Unplasticized PVC)</option>
                <option value="PVC">PVC</option>
                <option value="HDPE">HDPE</option>
                <option value="PVC Compound">PVC Compound (Dry Blend)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Description & Specs */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Product Description & Specs <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              className="print-sop-input"
              placeholder="e.g. uPVC PIPE 160MM SASO-ISO 1452-2 PN10 4.0MM"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Row 3: Dimensions (OD & Wall Thickness) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Pipe OD (mm) / Nominal Size
              </label>
              <input
                type="text"
                className="print-sop-input"
                placeholder="e.g. 160 or 4&quot;"
                value={odMm}
                onChange={(e) => setOdMm(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Wall Thickness / SDR
              </label>
              <input
                type="text"
                className="print-sop-input"
                placeholder="e.g. 4.0mm or SDR 26"
                value={wallThickness}
                onChange={(e) => setWallThickness(e.target.value)}
              />
            </div>
          </div>

          {/* Row 4: Weights & Lengths */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Std Unit Weight (kg/pc)
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                className="print-sop-input"
                placeholder="e.g. 3.450"
                value={unitWeight}
                onChange={(e) => setUnitWeight(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Standard Cut Length (m)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="print-sop-input"
                value={pipeLength}
                onChange={(e) => handlePipeLengthChange(e.target.value)}
              />
            </div>
          </div>

          {/* Row 5: Operational Pace (Speed or Pcs/h) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Nominal Speed (m/min)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="print-sop-input"
                placeholder="e.g. 2.5"
                value={nominalSpeed}
                onChange={(e) => handleSpeedChange(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Hourly Target Pace (Pcs/h)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                className="print-sop-input"
                placeholder="e.g. 25"
                value={targetPcsH}
                onChange={(e) => handlePcsHChange(e.target.value)}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              className="toolbar-btn toolbar-btn-outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="toolbar-btn toolbar-btn-primary"
              disabled={isSaving}
              style={{ minWidth: '140px' }}
            >
              {isSaving ? 'Saving...' : (targetLineId ? `Save & Assign to ${targetLineId}` : 'Save to Catalog')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
