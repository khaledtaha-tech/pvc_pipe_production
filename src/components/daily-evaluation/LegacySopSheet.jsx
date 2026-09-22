import { forwardRef, useImperativeHandle, useRef } from 'react';
import { buildSopModel } from '../../logic/legacySopHelper.js';

export const LegacySopSheet = forwardRef(function LegacySopSheet(
  { report, derived, isExporting = false, isBlank = false, standardRate = null },
  ref
) {
  const innerRef = useRef(null);
  useImperativeHandle(ref, () => innerRef.current, []);

  const isBlankMode = Boolean(isBlank || report?.isBlank);
  const model = buildSopModel(report, derived, { isBlank: isBlankMode, standardRate });

  return (
    <div
      className={`sop-sheet-container${isExporting ? ' sop-compact-export' : ''}${isBlankMode ? ' sop-blank-template' : ''}`}
      ref={innerRef}
      style={
        isExporting
          ? {
              height: '100%',
              maxHeight: '200mm',
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
          {/* Header Row 1 */}
          <tr>
            <td colSpan={2} className="sop-cell sop-doc-code">
              {model.docCode}
            </td>
            <td colSpan={4} className="sop-cell sop-doc-title">
              DOCUMENT IN POST
            </td>
            <td className="sop-cell sop-lbl text-center">
              N&deg; VERSION
            </td>
            <td colSpan={2} className="sop-cell sop-val-bold text-center">
              {model.version}
            </td>
          </tr>

          {/* Header Row 3 */}
          <tr>
            <td colSpan={2} className="sop-cell sop-brand">
              {model.plantName}
            </td>
            <td colSpan={4} className="sop-cell sop-pfollow">
              Production follow
            </td>
            <td className="sop-cell sop-lbl text-center">
              Date
            </td>
            <td colSpan={2} className="sop-cell sop-val text-center">
              {isBlankMode ? <span className="sop-blank-underline" /> : model.dateSpaces}
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
              {isBlankMode ? <span className="sop-blank-underline" /> : (model.fullMachineName || model.lineId)}
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
              {isBlankMode ? (
                <div className="sop-blank-product-box">
                  <span className="sop-blank-lbl">Product: </span>
                  <span className="sop-blank-underline long" />
                </div>
              ) : (
                model.productDescription
              )}
            </td>
            <td colSpan={3} className="sop-cell sop-empty"></td>
          </tr>

          {/* Header Row 6 */}
          <tr>
            <td colSpan={3} className="sop-cell sop-empty"></td>
            <td className="sop-cell sop-ref-hdr text-center">
              {isBlankMode ? 'Ref 1: ____________' : '1st reference'}
            </td>
            <td colSpan={2} className="sop-cell sop-ref-hdr text-center">
              {isBlankMode ? 'Ref 2: ____________' : '2nd reference'}
            </td>
            <td className="sop-cell sop-lbl text-center">
              DATE
            </td>
            <td colSpan={2} className="sop-cell sop-val text-center">
              {isBlankMode ? <span className="sop-blank-underline" /> : model.dateDots}
            </td>
          </tr>

          {/* Header Row 7 */}
          <tr>
            <td colSpan={3} className="sop-cell sop-empty"></td>
            <td className="sop-cell sop-speed text-center">
              {isBlankMode ? 'Speed: ______ M/Min' : `${model.speed1} M/Min`}
            </td>
            <td colSpan={2} className="sop-cell sop-speed text-center">
              {isBlankMode ? 'Speed: ______ M/Min' : `${model.speed2} M/Min`}
            </td>
            <td colSpan={3} className="sop-cell sop-empty"></td>
          </tr>

          {/* Table Headers (Row 8) */}
          <tr className="sop-head-row">
            <th className="sop-th">Hour</th>
            <th className="sop-th">
              Standard<br />Production (M)
            </th>
            <th className="sop-th">
              Good<br />Production (M)
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
                <td className="sop-cell-std">{r.stdM != null && r.stdM !== '' ? r.stdM.toLocaleString() : ''}</td>
                <td className="sop-cell-good">
                  {r.goodM !== '' ? (typeof r.goodM === 'number' ? r.goodM.toLocaleString() : r.goodM) : ''}
                </td>
                <td className="sop-cell-cause">{r.cause}</td>
                <td className="sop-cell-dt">{r.downtime}</td>
                <td className="sop-cell-reject">{r.rejectKg !== '' ? r.rejectKg : ''}</td>

                {/* Right Block for Shift 1 */}
                {i === 0 && (
                  <td colSpan={3} className="sop-side-header">
                    Total Good Production
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
                      {model.s1TotalGoodM > 0 ? model.s1TotalGoodM.toLocaleString() : ''}
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
                <td className="sop-cell-std">{r.stdM != null && r.stdM !== '' ? r.stdM.toLocaleString() : ''}</td>
                <td className="sop-cell-good">
                  {r.goodM !== '' ? (typeof r.goodM === 'number' ? r.goodM.toLocaleString() : r.goodM) : ''}
                </td>
                <td className="sop-cell-cause">{r.cause}</td>
                <td className="sop-cell-dt">{r.downtime}</td>
                <td className="sop-cell-reject">{r.rejectKg !== '' ? r.rejectKg : ''}</td>

                {/* Right Block for Shift 2 */}
                {i === 0 && (
                  <td colSpan={3} className="sop-side-header">
                    Total Good Production
                  </td>
                )}
                {i === 1 && (
                  <>
                    <td className="sop-side-lbl">Ref 1:</td>
                    <td className="sop-side-val">
                      {model.s2TotalGoodM > 0 ? model.s2TotalGoodM.toLocaleString() : ''}
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
