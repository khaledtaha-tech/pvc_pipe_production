import { forwardRef, useImperativeHandle, useRef } from 'react';
import { buildSopModel } from '../../logic/legacySopHelper.js';

export const LegacySopSheet = forwardRef(function LegacySopSheet(
  { report, derived, isExporting = false, isBlank = false, standardRate = null, model: propModel = null },
  ref
) {
  const innerRef = useRef(null);
  useImperativeHandle(ref, () => innerRef.current, []);

  const model = propModel || buildSopModel(report, derived, { isBlank: Boolean(isBlank || report?.isBlank), standardRate });
  const isBlankMode = Boolean(isBlank || report?.isBlank || model?.isBlank);
  const isUniversal = Boolean(model?.isUniversalBlank || (!model?.isMorningSop && isBlankMode));

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

          {/* Header Row 4 */}
          <tr>
            <td className="sop-cell sop-empty"></td>
            <td className="sop-cell sop-lbl text-center">
              Line No.
            </td>
            <td
              className="sop-cell sop-val-bold text-center"
              style={{ whiteSpace: 'nowrap', fontSize: '10.5px' }}
            >
              {isUniversal ? <span className="sop-blank-underline" /> : (model.fullMachineName || model.lineId || (isBlankMode ? <span className="sop-blank-underline" /> : ''))}
            </td>
            <td colSpan={3} className="sop-cell sop-prod-pieces">
              PRODUCTION PIECES
            </td>
            <td colSpan={3} className="sop-cell sop-empty"></td>
          </tr>

          {/* Header Row 5 */}
          <tr>
            <td colSpan={3} className="sop-cell sop-empty"></td>
            <td colSpan={3} className="sop-cell sop-item-desc">
              {(isUniversal || isBlankMode || model.isIdle || (!model.displayProduct && !model.productDescription)) ? (
                <div className="sop-blank-product-box">
                  <span className="sop-blank-lbl">Product: </span>
                  <span className="sop-blank-underline long" />
                </div>
              ) : (
                model.displayProduct || (model.itemCode ? `[${model.itemCode}] - ${model.productDescription}` : model.productDescription)
              )}
            </td>
            <td colSpan={3} className="sop-cell sop-empty"></td>
          </tr>

          {/* Header Row 6 */}
          <tr>
            <td colSpan={3} className="sop-cell sop-empty"></td>
            <td className="sop-cell sop-ref-hdr text-center">
              {(isUniversal || isBlankMode || model.isIdle || !model.ref1Spec)
                ? 'Ref 1: ____________'
                : (model.ref1Spec || '1st reference')}
            </td>
            <td colSpan={2} className="sop-cell sop-ref-hdr text-center">
              {(isUniversal || isBlankMode || model.isIdle || !model.ref2Spec)
                ? 'Ref 2: ____________'
                : (model.ref2Spec || '2nd reference')}
            </td>
            <td colSpan={3} className="sop-cell sop-empty"></td>
          </tr>

          {/* Header Row 7 */}
          <tr>
            <td colSpan={3} className="sop-cell sop-empty"></td>
            <td className="sop-cell sop-speed text-center">
              {(isUniversal || isBlankMode || model.isIdle || !model.speed1)
                ? 'Speed: ______ M/Min'
                : `${model.speed1} M/Min`}
            </td>
            <td colSpan={2} className="sop-cell sop-speed text-center">
              {(isUniversal || isBlankMode || model.isIdle || !model.speed2)
                ? 'Speed: ______ M/Min'
                : `${model.speed2} M/Min`}
            </td>
            <td colSpan={3} className="sop-cell sop-empty"></td>
          </tr>

          {/* Table Headers (Row 8) */}
          <tr className="sop-head-row">
            <th className="sop-th">Hour</th>
            <th className="sop-th">
              Standard<br />Production (Pcs)
            </th>
            <th className="sop-th">
              Good<br />Production (Pcs)
            </th>
            <th className="sop-th">Cause</th>
            <th className="sop-th">
              Down Time<br />(Min)
            </th>
            <th className="sop-th">
              Reject Production<br />(KG)
            </th>
            <th colSpan={3} className="sop-th sop-general-th">
              General Data of Production
            </th>
          </tr>

          {/* Shift 1 Hourly Rows (Rows 9 to 20) */}
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

                {/* Right Block for Shift 1 */}
                {i === 0 && (
                  <td colSpan={3} className="sop-side-header">
                    Total Good Production (Pcs)
                  </td>
                )}
                {i === 1 && (
                  <>
                    <td className="sop-side-lbl"></td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
                {i === 2 && (
                  <>
                    <td className="sop-side-lbl">Ref 1:</td>
                    <td className="sop-side-val">
                      {model.s1TotalGoodPcs > 0 ? (Number.isInteger(model.s1TotalGoodPcs) ? model.s1TotalGoodPcs.toLocaleString() : model.s1TotalGoodPcs) : (model.s1TotalGoodM > 0 ? model.s1TotalGoodM.toLocaleString() : '')}
                    </td>
                    <td></td>
                  </>
                )}
                {i === 3 && (
                  <>
                    <td className="sop-side-lbl">Ref 2:</td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
                {i === 4 && (
                  <>
                    <td className="sop-side-lbl"></td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
                {i === 5 && (
                  <td colSpan={3} className="sop-side-header">
                    Total Rejection
                  </td>
                )}
                {i === 6 && (
                  <>
                    <td className="sop-side-lbl"></td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
                {i === 7 && (
                  <>
                    <td className="sop-side-lbl">Ref 1:</td>
                    <td className="sop-side-val">
                      {model.s1TotalScrapKg > 0 ? model.s1TotalScrapKg : ''}
                    </td>
                    <td></td>
                  </>
                )}
                {i === 8 && (
                  <>
                    <td className="sop-side-lbl">Ref 2:</td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
                {i === 9 && (
                  <>
                    <td className="sop-side-lbl">Scrap</td>
                    <td className="sop-side-val">
                      {model.s1TotalScrapKg > 0 ? model.s1TotalScrapKg : ''}
                    </td>
                    <td></td>
                  </>
                )}
                {i >= 10 && (
                  <>
                    <td className="sop-side-lbl"></td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
              </tr>
            );
          })}

          {/* Shift 2 Hourly Rows (Rows 21 to 32) */}
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

                {/* Right Block for Shift 2 */}
                {i === 0 && (
                  <td colSpan={3} className="sop-side-header">
                    Total Good Production (Pcs)
                  </td>
                )}
                {i === 1 && (
                  <>
                    <td className="sop-side-lbl">Ref 1:</td>
                    <td className="sop-side-val">
                      {model.s2TotalGoodPcs > 0 ? (Number.isInteger(model.s2TotalGoodPcs) ? model.s2TotalGoodPcs.toLocaleString() : model.s2TotalGoodPcs) : (model.s2TotalGoodM > 0 ? model.s2TotalGoodM.toLocaleString() : '')}
                    </td>
                    <td></td>
                  </>
                )}
                {i === 2 && (
                  <>
                    <td className="sop-side-lbl">Ref 2:</td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
                {i === 3 && (
                  <>
                    <td className="sop-side-lbl"></td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
                {i === 4 && (
                  <td colSpan={3} className="sop-side-header">
                    Total Rejection
                  </td>
                )}
                {i === 5 && (
                  <>
                    <td className="sop-side-lbl"></td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
                {i === 6 && (
                  <>
                    <td className="sop-side-lbl">Ref 1:</td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
                {i === 7 && (
                  <>
                    <td className="sop-side-lbl">Ref 2:</td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
                {i === 8 && (
                  <>
                    <td className="sop-side-lbl">Scrap</td>
                    <td className="sop-side-val">
                      {model.s2TotalScrapKg > 0 ? model.s2TotalScrapKg : ''}
                    </td>
                    <td></td>
                  </>
                )}
                {i >= 9 && (
                  <>
                    <td className="sop-side-lbl"></td>
                    <td className="sop-side-val"></td>
                    <td></td>
                  </>
                )}
              </tr>
            );
          })}

          {/* Footer Supervisor Signatures (Rows 33-34) */}
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
