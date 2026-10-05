import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  buildSopModel,
  resolveProductSpecification,
  isCompoundingLineOrProduct,
  formatFullMachineName
} from '../../logic/legacySopHelper.js';

export const LegacySopSheet = forwardRef(function LegacySopSheet(
  { report, derived, isExporting = false, isBlank = false, standardRate = null, model: propModel = null },
  ref
) {
  const innerRef = useRef(null);
  useImperativeHandle(ref, () => innerRef.current, []);

  const model = propModel || buildSopModel(report, derived, { isBlank: Boolean(isBlank || report?.isBlank), standardRate });
  const isBlankMode = Boolean(isBlank || report?.isBlank || model?.isBlank);
  const isUniversal = Boolean(model?.isUniversalBlank || (!model?.isMorningSop && isBlank && !report && !propModel));

  const isCompounding = Boolean(
    model?.isCompounding ||
    model?.isPelletizingLine ||
    isCompoundingLineOrProduct(model)
  );

  const rawProductSpec = resolveProductSpecification(model);
  const hasProduct = Boolean(!isUniversal && !model?.isIdle && (rawProductSpec || model?.displayProduct || model?.itemCode));
  const productDisplay = hasProduct
    ? (model?.itemCode && rawProductSpec && !rawProductSpec.toUpperCase().includes(model.itemCode.toUpperCase())
        ? `[${model.itemCode}] - ${rawProductSpec}`
        : (rawProductSpec || model?.displayProduct || `[${model?.itemCode}]`))
  : '';

  const hasLine = Boolean(!isUniversal && (model?.fullMachineName || model?.lineId));
  const rawLine = model?.fullMachineName || model?.lineId || '';
  const canonicalLine = formatFullMachineName(model?.lineId, rawLine);
  const lineDisplay = hasLine
    ? (canonicalLine || rawLine)
    : (isUniversal ? '________________' : (canonicalLine || '________________'));

  const speedVal = (!isUniversal && !model?.isIdle && (model?.speed || model?.speed1))
    ? Number(model?.speed || model?.speed1)
    : null;
  const speedDisplay = speedVal ? `${speedVal} M/Min` : '______ M/Min';

  const capacityVal = (!isUniversal && !model?.isIdle && (model?.nominalCapacityKgH || model?.targetCapacity || model?.nominalCapacity || model?.capacityKgH))
    ? Number(model?.nominalCapacityKgH || model?.targetCapacity || model?.nominalCapacity || model?.capacityKgH)
    : null;
  const capacityDisplay = capacityVal ? `${capacityVal} Kg/h` : '______ Kg/h';

  const weightVal = (!isUniversal && !model?.isIdle && (model?.unitWeight || model?.unitWeight1 || model?.stdWeight))
    ? Number(model?.unitWeight || model?.unitWeight1 || model?.stdWeight)
    : null;
  const weightDisplay = weightVal ? `${weightVal.toFixed(2)} Kg/Pc` : '______ Kg/Pc';

  const renderMetric = (val, placeholder = '________') => {
    if (isUniversal || isBlankMode || val === '' || val === null || val === undefined) {
      return placeholder;
    }
    return typeof val === 'number'
      ? (Number.isInteger(val) ? val.toLocaleString() : val.toFixed(1))
      : String(val);
  };

  return (
    <div
      className={`sop-sheet-container${isExporting ? ' sop-compact-export' : ''}${isBlankMode ? ' sop-blank-template' : ''}`}
      ref={innerRef}
      style={
        isExporting
          ? {
              height: '100%',
              overflow: 'hidden',
              pageBreakInside: 'avoid',
              pageBreakBefore: 'avoid',
              pageBreakAfter: 'avoid',
              breakInside: 'avoid',
              breakBefore: 'avoid',
              breakAfter: 'avoid'
            }
          : undefined
      }
    >
      <table className="sop-sheet-table">
        <colgroup>
          <col style={{ width: '6.5%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '17.5%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '7%' }} />
        </colgroup>

        <tbody>
          {/* Professional Industrial Header Row */}
          <tr className="sop-header-primary-row">
            <td colSpan={2} className="sop-cell sop-header-company">
              <div className="sop-company-title">
                {model.plantName || 'AL MANAR PIPES FACTORY'}
              </div>
            </td>
            <td colSpan={4} className="sop-cell sop-header-center">
              <div className="sop-doc-main-title">
                {model.reportTitle || 'PVC PIPE EXTRUSION DAILY MONITORING REPORT'}
              </div>
              <div className="sop-doc-subtitle">
                {model.reportSubtitle || 'Production Execution & Quality Follow-Up'}
              </div>
            </td>
            <td colSpan={3} className="sop-cell sop-header-meta">
              <div className="sop-meta-row">
                <span className="sop-meta-lbl">Doc Code:</span>
                <span className="sop-meta-val">{model.docCode || 'DOC-Ext.-03'}</span>
              </div>
              <div className="sop-meta-row">
                <span className="sop-meta-lbl">Revision:</span>
                <span className="sop-meta-val">{model.version || '04'}</span>
              </div>
              <div className="sop-meta-row">
                <span className="sop-meta-lbl">Date:</span>
                <span className="sop-meta-val">
                  {model.dateIso || model.targetDate || (isUniversal || isBlankMode ? <span className="sop-blank-underline short" /> : (model.dateDots || ''))}
                </span>
              </div>
            </td>
          </tr>

          {/* Full-Width Product Header Row */}
          <tr className="sop-product-header-row">
            <td colSpan={9} className="sop-cell sop-product-header-cell">
              <div className="sop-product-line-wrap">
                <span className="sop-product-title-lbl">Product Specification:</span>
                {hasProduct ? (
                  <span className="sop-product-spec-val">{productDisplay}</span>
                ) : (
                  <span className="sop-product-dotted-line"></span>
                )}
              </div>
            </td>
          </tr>

          {/* Clean Single-Row Operational Sub-Header */}
          <tr className="sop-op-subheader-row">
            <td colSpan={9} className="sop-cell sop-op-subheader-cell">
              <div className="sop-op-subgrid">
                <div className="sop-op-col">
                  <span className="sop-op-lbl">Line No:</span>{' '}
                  <span className="sop-op-val">{lineDisplay}</span>
                </div>
                {isCompounding ? (
                  <>
                    <div className="sop-op-col">
                      <span className="sop-op-lbl">Target Capacity:</span>{' '}
                      <span className="sop-op-val">{model?.targetCapacity ? `${model.targetCapacity} Kg/h` : (model?.hourlyStdRate ? `${model.hourlyStdRate} Kg/h` : '400 Kg/h')}</span>
                    </div>
                    <div className="sop-op-col">
                      <span className="sop-op-lbl">Bag Packaging:</span>{' '}
                      <span className="sop-op-val">{model?.bagPackaging || '25 Kg / Bag'}</span>
                    </div>
                    <div className="sop-op-col">
                      <span className="sop-op-lbl">Line Type:</span>{' '}
                      <span className="sop-op-val">Pelletizing / Compounding</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sop-op-col">
                      <span className="sop-op-lbl">Standard Speed:</span>{' '}
                      <span className="sop-op-val">{speedDisplay}</span>
                    </div>
                    <div className="sop-op-col">
                      <span className="sop-op-lbl">Nominal Capacity:</span>{' '}
                      <span className="sop-op-val">{capacityDisplay}</span>
                    </div>
                    <div className="sop-op-col">
                      <span className="sop-op-lbl">Nominal Weight:</span>{' '}
                      <span className="sop-op-val">{weightDisplay}</span>
                    </div>
                  </>
                )}
              </div>
            </td>
          </tr>

          {/* Table Headers */}
          <tr className="sop-head-row">
            <th className="sop-th">Hour</th>
            <th className="sop-th">
              Standard<br />Production {isCompounding ? '(Kg)' : '(Pcs)'}
            </th>
            <th className="sop-th">
              Good<br />Production {isCompounding ? '(Kg)' : '(Pcs)'}
            </th>
            <th className="sop-th">Cause</th>
            <th className="sop-th">
              Down Time<br />(Min)
            </th>
            <th className="sop-th">
              Reject Production<br />(KG)
            </th>
            <th colSpan={3} className="sop-th sop-general-th">
              Shift Summary &amp; Metrics
            </th>
          </tr>

          {/* Shift 1 Hourly Rows (Rows 0 to 11) */}
          {model.shift1Rows.map((r, i) => {
            const isLast = i === 11;
            return (
              <tr key={`s1_${r.hour}`} className={`sop-row${isLast ? ' sop-shift-divider' : ''}`}>
                <td className="sop-cell-hour">{r.hour}</td>
                <td className="sop-cell-std">{isUniversal ? '' : (r.stdPcs !== undefined && r.stdPcs !== '' ? (typeof r.stdPcs === 'number' ? r.stdPcs.toLocaleString() : r.stdPcs) : (r.stdM != null && r.stdM !== '' ? r.stdM.toLocaleString() : ''))}</td>
                <td className="sop-cell-good">
                  {r.goodPcs !== '' && r.goodPcs !== undefined ? (typeof r.goodPcs === 'number' ? (Number.isInteger(r.goodPcs) ? r.goodPcs.toLocaleString() : r.goodPcs.toFixed(1)) : r.goodPcs) : (r.goodM !== '' && r.goodM !== undefined ? (typeof r.goodM === 'number' ? (Number.isInteger(r.goodM) ? r.goodM.toLocaleString() : r.goodM.toFixed(1)) : r.goodM) : '')}
                </td>
                <td className="sop-cell-cause">{r.cause}</td>
                <td className="sop-cell-dt">{r.downtime}</td>
                <td className="sop-cell-reject">{r.rejectKg !== '' ? r.rejectKg : ''}</td>

                {/* Right Shift Summary Card for Shift 1 */}
                {i === 0 && (
                  <td colSpan={3} className="sop-side-header">
                    Shift 1 Summary &amp; Metrics
                  </td>
                )}
                {i === 1 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Total Good {isCompounding ? '(Kg)' : '(Pcs)'}:</span>
                      <span className="sop-summary-val">{renderMetric(model.s1TotalGoodPcs, '________')}</span>
                    </div>
                  </td>
                )}
                {i === 2 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Total Weight (Kg):</span>
                      <span className="sop-summary-val">{renderMetric(model.s1TotalWeightKg, '________')}</span>
                    </div>
                  </td>
                )}
                {i === 3 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Total Reject (Kg):</span>
                      <span className="sop-summary-val">{renderMetric(model.s1TotalScrapKg, '________')}</span>
                    </div>
                  </td>
                )}
                {i === 4 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Scrap Allowance (%):</span>
                      <span className="sop-summary-val">{renderMetric(model.s1ScrapPct, '________%')}</span>
                    </div>
                  </td>
                )}
                {i === 5 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Total Down Time (Min):</span>
                      <span className="sop-summary-val">{renderMetric(model.s1DowntimeMin, '________')}</span>
                    </div>
                  </td>
                )}
                {i === 6 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Operational Efficiency:</span>
                      <span className="sop-summary-val">{renderMetric(model.s1Efficiency, '________%')}</span>
                    </div>
                  </td>
                )}
                {i === 7 && (
                  <td colSpan={3} rowSpan={5} className="sop-summary-notes-cell">
                    <div className="sop-notes-container">
                      <div className="sop-notes-header">Shift Supervisor Remarks &amp; Handover Notes:</div>
                      <div className="sop-notes-lines">
                        <div className="sop-notes-line"></div>
                        <div className="sop-notes-line"></div>
                        <div className="sop-notes-line"></div>
                        <div className="sop-notes-line"></div>
                      </div>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}

          {/* Shift 2 Hourly Rows (Rows 0 to 11) */}
          {model.shift2Rows.map((r, i) => {
            const isLast = i === 11;
            return (
              <tr key={`s2_${r.hour}`} className={`sop-row${isLast ? ' sop-shift-divider' : ''}`}>
                <td className="sop-cell-hour">{r.hour}</td>
                <td className="sop-cell-std">{isUniversal ? '' : (r.stdPcs !== undefined && r.stdPcs !== '' ? (typeof r.stdPcs === 'number' ? r.stdPcs.toLocaleString() : r.stdPcs) : (r.stdM != null && r.stdM !== '' ? r.stdM.toLocaleString() : ''))}</td>
                <td className="sop-cell-good">
                  {r.goodPcs !== '' && r.goodPcs !== undefined ? (typeof r.goodPcs === 'number' ? (Number.isInteger(r.goodPcs) ? r.goodPcs.toLocaleString() : r.goodPcs.toFixed(1)) : r.goodPcs) : (r.goodM !== '' && r.goodM !== undefined ? (typeof r.goodM === 'number' ? (Number.isInteger(r.goodM) ? r.goodM.toLocaleString() : r.goodM.toFixed(1)) : r.goodM) : '')}
                </td>
                <td className="sop-cell-cause">{r.cause}</td>
                <td className="sop-cell-dt">{r.downtime}</td>
                <td className="sop-cell-reject">{r.rejectKg !== '' ? r.rejectKg : ''}</td>

                {/* Right Shift Summary Card for Shift 2 */}
                {i === 0 && (
                  <td colSpan={3} className="sop-side-header">
                    Shift 2 Summary &amp; Metrics
                  </td>
                )}
                {i === 1 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Total Good {isCompounding ? '(Kg)' : '(Pcs)'}:</span>
                      <span className="sop-summary-val">{renderMetric(model.s2TotalGoodPcs, '________')}</span>
                    </div>
                  </td>
                )}
                {i === 2 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Total Weight (Kg):</span>
                      <span className="sop-summary-val">{renderMetric(model.s2TotalWeightKg, '________')}</span>
                    </div>
                  </td>
                )}
                {i === 3 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Total Reject (Kg):</span>
                      <span className="sop-summary-val">{renderMetric(model.s2TotalScrapKg, '________')}</span>
                    </div>
                  </td>
                )}
                {i === 4 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Scrap Allowance (%):</span>
                      <span className="sop-summary-val">{renderMetric(model.s2ScrapPct, '________%')}</span>
                    </div>
                  </td>
                )}
                {i === 5 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Total Down Time (Min):</span>
                      <span className="sop-summary-val">{renderMetric(model.s2DowntimeMin, '________')}</span>
                    </div>
                  </td>
                )}
                {i === 6 && (
                  <td colSpan={3} className="sop-summary-item">
                    <div className="sop-summary-item-wrap">
                      <span className="sop-summary-lbl">Operational Efficiency:</span>
                      <span className="sop-summary-val">{renderMetric(model.s2Efficiency, '________%')}</span>
                    </div>
                  </td>
                )}
                {i === 7 && (
                  <td colSpan={3} rowSpan={5} className="sop-summary-notes-cell">
                    <div className="sop-notes-container">
                      <div className="sop-notes-header">Shift Supervisor Remarks &amp; Handover Notes:</div>
                      <div className="sop-notes-lines">
                        <div className="sop-notes-line"></div>
                        <div className="sop-notes-line"></div>
                        <div className="sop-notes-line"></div>
                        <div className="sop-notes-line"></div>
                      </div>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}

          {/* Footer Supervisor Signatures */}
          <tr>
            <td colSpan={4} className="sop-sig-title">
              Day Shift Supervisor
            </td>
            <td colSpan={5} className="sop-sig-title">
              Night Shift Supervisor
            </td>
          </tr>
          <tr>
            <td colSpan={4} className="sop-sig-box">
              <span className="sop-sig-name">
                {model.shift1Lead ? `Lead: ${model.shift1Lead}` : 'Lead: ______________________'}
              </span>
              <div className="sop-sig-line"></div>
            </td>
            <td colSpan={5} className="sop-sig-box">
              <span className="sop-sig-name">
                {model.shift2Lead ? `Lead: ${model.shift2Lead}` : 'Lead: ______________________'}
              </span>
              <div className="sop-sig-line"></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});

export default LegacySopSheet;
