export default function KpiStrip({ derived }) {
  if (!derived) return null;

  const eng = derived.engineering || {};
  const hasCapacity = eng.nominalCapacityKgH > 0;

  return (
    <div className="kpi-section no-print">
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-value">
            {derived.operatingHours.toFixed(1)}
            <span className="kpi-unit">h</span>
          </div>
          <div className="kpi-label">Operating Hours</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {derived.totalDowntimeHours.toFixed(1)}
            <span className="kpi-unit">h</span>
          </div>
          <div className="kpi-label">Total Downtime</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {eng.actualRateKgH ? eng.actualRateKgH : '-'}
            <span className="kpi-unit">kg/h</span>
          </div>
          <div className="kpi-label">
            Actual Output Rate {hasCapacity ? `(${eng.capacityUtilizationPct}% of ${eng.nominalCapacityKgH} kg/h)` : ''}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {derived.aStr}
          </div>
          <div className="kpi-label">Availability (A = Op/24)</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {derived.pStr}
          </div>
          <div className="kpi-label">Performance (P = Act/Tgt)</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {derived.qStr}
          </div>
          <div className="kpi-label">Quality (Q = Good/Act)</div>
        </div>

        <div className="kpi-card kpi-card-hl">
          <div className="kpi-value">
            {derived.oeeStr}
          </div>
          <div className="kpi-label">Overall OEE (A × P × Q)</div>
        </div>
      </div>

      <div className="kpi-formula-bar">
        <span className="formula-tag">ENGINEERING OEE BREAKDOWN</span>
        <span className="formula-text">
          <b>Overall OEE</b> = <b>Availability</b> ({derived.aStr}) &times; <b>Performance</b> ({derived.pStr}) &times; <b>Quality</b> ({derived.qStr}) = <b className="formula-res">{derived.oeeStr}</b>
        </span>
        {hasCapacity ? (
          <span className="capacity-badge">
            Capacity Utilization: <b>{eng.capacityUtilizationPct}%</b> ({eng.actualRateKgH} kg/h actual vs {eng.nominalCapacityKgH} kg/h nominal)
          </span>
        ) : null}
      </div>
    </div>
  );
}
