import { forwardRef, useImperativeHandle, useRef } from 'react';
import { SHIFT1_SPAN, SHIFT2_SPAN, DOC_STATUS } from '../../config/machines.js';
import { buildRefDerived } from '../../logic/engine.js';

export const SHEET_WIDTH = 1100;

const num = (v, d = null) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  if (d !== null && d !== undefined) {
    return n.toFixed(d);
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

function Cell({ c, span = 1, className = '', children }) {
  return (
    <div className={`tcell c-${c} ${className}`} style={span !== 1 ? { gridColumn: `span ${span}` } : undefined}>
      {children}
    </div>
  );
}

function EditableNum({ value, onChange, step = 1 }) {
  return (
    <input
      type="number"
      className="cellinput"
      value={value === '' ? '' : value}
      step={step}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const ReportSheet = forwardRef(function ReportSheet(
  { report, derived, onPatchSlot, isMonochrome = false, isExporting = false, viewMode = 'hourly' },
  ref
) {
  const innerRef = useRef(null);
  useImperativeHandle(ref, () => innerRef.current, []);

  const header = report.header;
  const summary = report.summary;
  const ref1 = buildRefDerived(report.refs['1'] || {});
  const ref2 = buildRefDerived(report.refs['2'] || {});

  const totals = derived.grandTotals;
  const s1 = derived.shift1Totals;
  const s2 = derived.shift2Totals;
  const eng = derived.engineering || {};

  const s1ReasonsList = Array.from(
    new Set(
      (derived.slots || [])
        .filter((s) => s.shift === 1 && s.reason && s.reason.trim())
        .map((s) => s.reason.trim())
    )
  );
  const s1Reasons = s1ReasonsList.length > 0 ? s1ReasonsList.join(' • ') : 'Normal Continuous Extrusion';

  const s2ReasonsList = Array.from(
    new Set(
      (derived.slots || [])
        .filter((s) => s.shift === 2 && s.reason && s.reason.trim())
        .map((s) => s.reason.trim())
    )
  );
  const s2Reasons = s2ReasonsList.length > 0 ? s2ReasonsList.join(' • ') : 'Normal Continuous Extrusion';

  return (
    <div
      className={`dmr-sheet${isMonochrome ? ' monochrome-print' : ''}${isExporting ? ' pdf-compact-export' : ''}${viewMode === 'shift' ? ' view-shift-summary' : ''}`}
      ref={innerRef}
      style={
        isExporting
          ? {
              height: '198mm',
              maxHeight: '198mm',
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
      {/* 1. Header Block */}
      <div className="sec-head">
        <div className="tcell plant-cell">
          <div className="plant-line">{header.plantName || 'PVC PIPE EXTRUSION PLANT'}</div>
          <div className="plant-sub">Standard SOP: SOP-EXT-PVC-01</div>
        </div>
        <div className="tcell title-cell">
          <div className="sheet-title">PVC PIPE EXTRUSION DAILY MONITORING REPORT (24 HRS)</div>
          <div className="sheet-subtitle">LINE SPEED, PRODUCTION, QUALITY &amp; DOWNTIME LOG</div>
        </div>
        <div className="tcell doc-cell">
          <div className="doc-line">Doc: Version 04 | Status: {DOC_STATUS}</div>
        </div>
      </div>

      {/* 2. Date & Line Bar */}
      <div className="sec-date">
        <div className="tcell tcell-soft">
          <span className="labeltext">Date:</span> <span className="value-strong">{header.date || '_____________'}</span>
        </div>
        <div className="tcell tcell-soft text-center">
          {eng.nominalCapacityKgH ? (
            <span className="capacity-strip">
              Nominal Capacity: <b>{eng.nominalCapacityKgH} kg/h</b> &middot; Actual Output: <b>{eng.actualRateKgH} kg/h</b> &middot; Utilization: <b>{eng.capacityUtilizationPct}%</b>
            </span>
          ) : null}
        </div>
        <div className="tcell tcell-soft text-right">
          <span className="labeltext">Line:</span>{' '}
          <span className="value-strong">
            {(() => {
              const id = (header.lineId || '').trim();
              let custom = (header.lineCustom || '').trim();
              if (!custom) return id;
              if (id && custom.toUpperCase().startsWith(id.toUpperCase())) {
                custom = custom.slice(id.length).replace(/^[\s-:–—]+/, '');
              }
              return custom ? (id ? `${id} - ${custom}` : custom) : id;
            })()}
          </span>
        </div>
      </div>

      {/* 3. Product & Line Reference Parameters */}
      <div className="refs-header">
        {[
          'Item Reference',
          'Pipe Specification (OD x WT x Length)',
          'Standard Class / PN',
          'Line Speed (m/min)',
          'Cycle / Cut Time (s)',
          'Target Output (Pcs/h)',
          'Std Weight (kg/pipe)',
          'Shift Supervisors & Extrusion Techs'
        ].map((t, i) => (
          <div className="tcell refh" key={i}>
            {t}
          </div>
        ))}
      </div>

      {[
        { key: 1, label: 'Reference 1', spec: ref1 },
        { key: 2, label: 'Reference 2', spec: ref2 }
      ].map(({ key, label, spec }) => (
        <div className="ref-row" key={key}>
          <div className="tcell reflabel">{label}</div>
          <div className="tcell refval">{spec.pipeSpec}</div>
          <div className="tcell refval">{spec.cls || ''}</div>
          <div className="tcell refnum">{num(spec.speed)}</div>
          <div className="tcell refnum">{num(spec.cutTime, 1)}</div>
          <div className="tcell refnum refnum-hl">{num(spec.targetRate)}</div>
          <div className="tcell refnum">{num(spec.stdWeight, 2)}</div>
          <div className="tcell refval">{key === 1 ? summary.shift1Lead : summary.shift2Lead}</div>
        </div>
      ))}

      {/* 4. Counters Row */}
      <div className="counters-row">
        <div className="tcell counter-item">
          <span className="labeltext">Initial Pipe Counter:</span>{' '}
          <span className="value-strong">{num(summary.startCounter)}</span>
        </div>
        <div className="tcell counter-item">
          <span className="labeltext">Extruder Resin Lot / Batch:</span>{' '}
          <span className="value-strong">{summary.resinLot || ''}</span>
        </div>
        <div className="tcell counter-item">
          <span className="labeltext">Initial Haul-off Meter:</span>{' '}
          <span className="value-strong">{num(summary.haulOffMeter)}</span>
        </div>
      </div>

      {/* 5. Production Grid Headers (7 Columns - Purge Scrap Removed) */}
      <div className="table-head-row">
        {[
          { c: 'A', text: 'Shift' },
          { c: 'B', text: viewMode === 'shift' ? 'Shift Window (12 Hours)' : 'Hour Window' },
          { c: 'C', text: 'Actual Output (Pcs)' },
          { c: 'D', text: 'Target Output (Pcs)' },
          { c: 'E', text: 'Downtime (min)' },
          { c: 'F', text: 'PVC Extrusion Breakdown / Downtime Reason' },
          { c: 'G', text: 'Scrap Pipes (Pcs)' }
        ].map((h) => (
          <Cell c={h.c} key={h.c} className="th">
            {h.text}
          </Cell>
        ))}
      </div>

      {viewMode === 'shift' ? (
        <>
          {/* Shift 1 Consolidated Row */}
          <div className="trow shift-summary-row shift1-summary" key="shift1">
            <Cell c="A" className="shiftcell">Shift 1 (Day)</Cell>
            <Cell c="B" className="windowcell">{SHIFT1_SPAN} (12h)</Cell>
            <Cell c="C" className="numcell summary-val">{num(s1.actual)}</Cell>
            <Cell c="D" className="numcell target summary-val">{num(s1.target)}</Cell>
            <Cell c="E" className={`numcell summary-val${s1.downtime > 0 ? ' dt-highlight' : ''}`}>{num(s1.downtime)}</Cell>
            <Cell c="F" className="reasoncell summary-reason">{s1Reasons}</Cell>
            <Cell c="G" className="numcell summary-val">{num(s1.scrap)}</Cell>
          </div>

          {/* Shift 2 Consolidated Row */}
          <div className="trow shift-summary-row shift2-summary shift2" key="shift2">
            <Cell c="A" className="shiftcell">Shift 2 (Night)</Cell>
            <Cell c="B" className="windowcell">{SHIFT2_SPAN} (12h)</Cell>
            <Cell c="C" className="numcell summary-val">{num(s2.actual)}</Cell>
            <Cell c="D" className="numcell target summary-val">{num(s2.target)}</Cell>
            <Cell c="E" className={`numcell summary-val${s2.downtime > 0 ? ' dt-highlight' : ''}`}>{num(s2.downtime)}</Cell>
            <Cell c="F" className="reasoncell summary-reason">{s2Reasons}</Cell>
            <Cell c="G" className="numcell summary-val">{num(s2.scrap)}</Cell>
          </div>

          {/* Grand Total (24 Hours) */}
          <div className="trow grand shift-summary-grand" key="grand-total">
            <Cell c="A" span={2} className="totallabel">
              GRAND TOTAL (24 HOURS)
            </Cell>
            <Cell c="C" className="numcell">{num(totals.actual)}</Cell>
            <Cell c="D" className="numcell">{num(totals.target)}</Cell>
            <Cell c="E" className="numcell">{num(totals.downtime)}</Cell>
            <Cell c="F" className="reasoncell summary-note">
              {derived.totalDowntimeHours > 0
                ? `Total Downtime: ${derived.totalDowntimeHours} h • Operating: ${derived.operatingHours} h`
                : 'Full Continuous Operation (24.0 h)'}
            </Cell>
            <Cell c="G" className="numcell">{num(totals.scrap)}</Cell>
          </div>
        </>
      ) : (
        <>
          {/* 6. Hourly Rows (24 Hours) */}
          {derived.slots.map((s, i) => {
            const fullDt = s.downtime >= 60 ? ' full-dt' : '';
            const isZebra = i % 2 === 1 ? ' zebra' : '';
            return (
              <div className={'trow' + (s.shift === 2 ? ' shift2' : '') + isZebra} key={i} data-idx={i}>
                <Cell c="A" className={'shiftcell' + fullDt}>{'Shift ' + s.shift}</Cell>
                <Cell c="B" className={'windowcell' + fullDt}>{s.window}</Cell>
                <Cell c="C" className={'numcell' + fullDt}>{num(s.actual)}</Cell>
                <Cell c="D" className={'numcell target' + fullDt}>{num(s.target)}</Cell>
                <Cell c="E" className={fullDt}>
                  {isExporting ? (
                    s.downtime > 0 ? num(s.downtime) : ''
                  ) : (
                    <EditableNum value={s.downtime} d={0} onChange={(v) => onPatchSlot(i, 'downtime', v)} />
                  )}
                </Cell>
                <Cell c="F" className={'reasoncell' + fullDt}>
                  {isExporting ? (
                    s.reason || ''
                  ) : (
                    <input
                      type="text"
                      className="cellinput text"
                      value={s.reason}
                      placeholder=""
                      onChange={(e) => onPatchSlot(i, 'reason', e.target.value)}
                    />
                  )}
                </Cell>
                <Cell c="G" className={fullDt}>
                  {isExporting ? (
                    s.scrap > 0 ? num(s.scrap) : ''
                  ) : (
                    <EditableNum value={s.scrap} d={0} onChange={(v) => onPatchSlot(i, 'scrap', v)} />
                  )}
                </Cell>
              </div>
            );
          })}

          {/* 7. Subtotals & Grand Total Rows */}
          {[
            { label: 'SUBTOTAL SHIFT 1 (' + SHIFT1_SPAN + ')', t: s1, tone: 'subtotal' },
            { label: 'SUBTOTAL SHIFT 2 (' + SHIFT2_SPAN + ')', t: s2, tone: 'subtotal' },
            { label: 'GRAND TOTAL (24 HOURS)', t: totals, tone: 'grand' }
          ].map((row) => (
            <div className={'trow ' + row.tone} key={row.label}>
              <Cell c="A" span={2} className="totallabel">
                {row.label}
              </Cell>
              <Cell c="C" className="numcell">{num(row.t.actual)}</Cell>
              <Cell c="D" className="numcell">{num(row.t.target)}</Cell>
              <Cell c="E" className="numcell">{num(row.t.downtime)}</Cell>
              <Cell c="F" className="reasoncell" />
              <Cell c="G" className="numcell">{num(row.t.scrap)}</Cell>
            </div>
          ))}
        </>
      )}

      {/* 8. Daily OEE & Performance Summary Block */}
      <div className="oee-labels">
        {[
          'Operating Hours (h)',
          'Total Downtime (h)',
          'Availability Rate % (A)',
          'Performance Rate % (P)',
          'Quality Rate % (Q)',
          'Overall OEE % (A × P × Q)'
        ].map((t, i) => (
          <div className="tcell oee-label" key={i}>
            {t}
          </div>
        ))}
      </div>
      <div className="oee-values">
        {[
          derived.operatingHours.toFixed(1),
          derived.totalDowntimeHours.toFixed(1),
          derived.aStr,
          derived.pStr,
          derived.qStr,
          derived.oeeStr
        ].map((v, i) => (
          <div className="tcell oee-value" key={i}>
            {i === 5 ? <b className="oee-final">{v}</b> : v}
          </div>
        ))}
      </div>

      {/* 8b. Explicit OEE Formula Strip */}
      <div className="oee-formula-row">
        <div className="tcell oee-formula-cell">
          <span className="formula-kicker">ENGINEERING OEE FORMULA:</span>{' '}
          <span className="formula-math">
            OEE = Availability ({derived.aStr}) &times; Performance ({derived.pStr}) &times; Quality ({derived.qStr}) ={' '}
            <b className="formula-final">{derived.oeeStr}</b>
          </span>
          {eng.nominalCapacityKgH ? (
            <span className="capacity-math">
              &middot; Capacity Benchmark: <b>{eng.nominalCapacityKgH} kg/h</b> &middot; Actual Output: <b>{eng.actualRateKgH} kg/h</b> (<b>{eng.capacityUtilizationPct}%</b> utilization)
            </span>
          ) : null}
        </div>
      </div>

      {/* 9. Sign-off Block */}
      <div
        className="sign-row"
        style={{
          pageBreakBefore: 'avoid',
          pageBreakInside: 'avoid',
          breakBefore: 'avoid',
          breakInside: 'avoid'
        }}
      >
        <div className="tcell sign-item">
          <span className="labeltext">Shift 1 Lead (Day):</span>{' '}
          <span className="sign-line">{summary.shift1Lead || '______________________'}</span>
        </div>
        <div className="tcell sign-item">
          <span className="labeltext">Shift 2 Lead (Night):</span>{' '}
          <span className="sign-line">{summary.shift2Lead || '______________________'}</span>
        </div>
        <div className="tcell sign-item">
          <span className="labeltext">Plant Production Manager:</span>{' '}
          <span className="sign-line">{summary.plantManager || '______________________'}</span>
        </div>
      </div>
    </div>
  );
});

export default ReportSheet;
