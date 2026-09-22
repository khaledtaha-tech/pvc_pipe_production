import { useState, useMemo } from 'react';
import {
  filterAnalyticsRecords,
  calculatePlantMetrics,
  calculateDowntimeBreakdown,
  calculateMachineComparison
} from '../../logic/analytics.js';
import { MACHINES } from '../../config/machines.js';
import { convertLogRowToReport } from '../../logic/excelParser.js';

export default function PlantAnalytics({
  records = [],
  machineMaster = MACHINES,
  onSelectReport,
  onSwitchTab,
  onNotify,
  isMonochrome = false,
  onToggleMonochrome,
  onExportSop
}) {
  // Extract all available unique dates sorted chronologically
  const availableDates = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      if (r.date && !String(r.date).toLowerCase().includes('total')) {
        set.add(r.date);
      }
    });
    return Array.from(set).sort();
  }, [records]);

  const earliestDate = availableDates[0] || '';
  const latestDate = availableDates[availableDates.length - 1] || '';

  // Filter state
  const [fromDate, setFromDate] = useState(earliestDate);
  const [toDate, setToDate] = useState(latestDate);
  const [selectedLine, setSelectedLine] = useState('ALL');

  // Keep from/to in sync when availableDates change if uninitialized
  useMemo(() => {
    if (!fromDate && earliestDate) setFromDate(earliestDate);
    if (!toDate && latestDate) setToDate(latestDate);
  }, [earliestDate, latestDate]);

  // Quick preset actions
  const handlePresetAll = () => {
    setFromDate(earliestDate);
    setToDate(latestDate);
    if (onNotify) onNotify(`Filter set to All Dates (${earliestDate} to ${latestDate})`);
  };

  const handlePresetLast7 = () => {
    if (availableDates.length === 0) return;
    const startIdx = Math.max(0, availableDates.length - 7);
    const startD = availableDates[startIdx];
    const endD = latestDate;
    setFromDate(startD);
    setToDate(endD);
    if (onNotify) onNotify(`Filter set to Last 7 Days (${startD} to ${endD})`);
  };

  const handlePresetSingle = () => {
    if (!latestDate) return;
    setFromDate(latestDate);
    setToDate(latestDate);
    if (onNotify) onNotify(`Filter set to Single Day (${latestDate})`);
  };

  // Filtered dataset for selected scope
  const filtered = useMemo(() => {
    return filterAnalyticsRecords(records, {
      fromDate,
      toDate,
      lineId: selectedLine
    });
  }, [records, fromDate, toDate, selectedLine]);

  // Aggregated KPIs
  const plantMetrics = useMemo(() => {
    return calculatePlantMetrics(filtered);
  }, [filtered]);

  // Downtime cause ranking
  const downtimeList = useMemo(() => {
    return calculateDowntimeBreakdown(filtered);
  }, [filtered]);

  // Machine comparison matrix
  const machineMatrix = useMemo(() => {
    return calculateMachineComparison(filtered, machineMaster);
  }, [filtered, machineMaster]);

  // Best performing line highlight
  const topMachine = useMemo(() => {
    const active = machineMatrix.filter((m) => m.operatingHours > 0);
    if (active.length === 0) return null;
    return [...active].sort((a, b) => b.oeePct - a.oeePct)[0];
  }, [machineMatrix]);

  // Lines requiring attention
  const attentionLines = useMemo(() => {
    return machineMatrix.filter(
      (m) =>
        m.operatingHours > 0 &&
        (m.statusType === 'danger' || m.statusType === 'warning')
    );
  }, [machineMatrix]);

  const handleViewLineSheet = (m) => {
    if (!m.latestRecord) {
      if (onNotify) onNotify(`No production entries found for line ${m.machineId} in this period`);
      return;
    }
    const rep = convertLogRowToReport(m.latestRecord);
    if (onSelectReport) onSelectReport(rep);
    if (onSwitchTab) onSwitchTab('sheet');
    if (onNotify) onNotify(`Viewing 24-hour follow sheet for ${m.machineId} (${m.latestRecord.date})`);
  };

  const handlePrintAnalytics = () => {
    document.body.classList.add('print-analytics-active');
    const cleanup = () => {
      document.body.classList.remove('print-analytics-active');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1500);
  };

  return (
    <div className="analytics-root plant-analytics-container">
      {/* 1. Header & Executive Controls */}
      <section className="card analytics-header-card">
        <div className="card-head">
          <div>
            <h2>Plant Analytics &amp; Performance Dashboard</h2>
            <span className="card-note">
              Executive multi-line OEE, capacity utilization, scrap analysis, and downtime Pareto statistics
            </span>
          </div>
          <div className="analytics-header-actions no-print">
            {typeof onToggleMonochrome === 'function' && (
              <label
                className="laser-toggle-label"
                title="Toggle high-contrast grayscale theme for laser printing"
              >
                <input
                  type="checkbox"
                  checked={isMonochrome}
                  onChange={(e) => onToggleMonochrome(e.target.checked)}
                />
                <span>Laser B&amp;W Theme</span>
              </label>
            )}
            {typeof onExportSop === 'function' && (
              <button
                type="button"
                className="btn btn-sop btn-sm"
                onClick={onExportSop}
                title="Download active machine's official SOP (DOC-Ext.-03) follow sheet PDF"
              >
                Download SOP (DOC-Ext.-03) PDF
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePrintAnalytics}
              title="Print clean executive summary"
            >
              Print Analytics Report
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="analytics-toolbar no-print">
          <div className="toolbar-group">
            <label className="field narrow">
              <span className="field-label">From Date</span>
              <select
                className="input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              >
                {availableDates.map((d) => (
                  <option key={`from_${d}`} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="field narrow">
              <span className="field-label">To Date</span>
              <select
                className="input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              >
                {availableDates.map((d) => (
                  <option key={`to_${d}`} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <div className="preset-btn-group">
              <span className="preset-label">Presets:</span>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handlePresetAll}
              >
                All Dates
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handlePresetLast7}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handlePresetSingle}
              >
                Single Day
              </button>
            </div>
          </div>

          <div className="toolbar-group">
            <label className="field medium">
              <span className="field-label">Extrusion Line Scope</span>
              <select
                className="input"
                value={selectedLine}
                onChange={(e) => setSelectedLine(e.target.value)}
              >
                <option value="ALL">All Lines (Entire Factory Scope)</option>
                {machineMaster.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} - {m.name} ({m.capacityKgH ? `${m.capacityKgH} kg/h` : m.detail})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {records.length === 0 ? (
        <section className="card analytics-table-card">
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <h3 style={{ margin: '0 0 8px', color: '#1e293b' }}>No Production Data Loaded</h3>
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '13px' }}>
              All imported production records have been cleared. Upload an Excel workbook in the Uploader or reload the demo file to view plant analytics.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSwitchTab && onSwitchTab('uploader')}
            >
              Go to Excel Uploader
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Scope Banner (Visible in Print & Screen) */}
          <div className="analytics-scope-banner">
            <div className="scope-text">
              <b>Active Scope:</b>{' '}
              {fromDate === toDate ? `Date: ${fromDate}` : `Period: ${fromDate || 'Start'} to ${toDate || 'End'}`} &middot;{' '}
              {selectedLine === 'ALL' ? 'Plant-Wide (9 Extrusion Lines)' : `Extruder: ${selectedLine}`} &middot;{' '}
              <b>{filtered.length}</b> Production Logs Aggregated
            </div>
          </div>

          {/* 2. Executive Summary KPI Cards */}
      <section className="analytics-kpi-grid">
        {/* Card 1: Total Good Output */}
        <div className="analytics-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">TOTAL GOOD PRODUCTION</span>
            <span className="kpi-tag kpi-tag-blue">Output FG</span>
          </div>
          <div className="kpi-card-main">
            <span className="kpi-val-hero">{plantMetrics.totalGoodWeightMT}</span>
            <span className="kpi-val-unit">MT</span>
          </div>
          <div className="kpi-sub-row">
            <span className="kpi-sub-item">
              <b>{plantMetrics.totalPcs.toLocaleString()}</b> Finished Pipes (FG)
            </span>
          </div>
          <div className="kpi-sub-row text-muted">
            {plantMetrics.totalGoodWeightKg.toLocaleString()} kg Total Good Run Weight
          </div>
        </div>

        {/* Card 2: Scrap & Scrap Rate */}
        <div className="analytics-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">SCRAP WEIGHT &amp; RATE</span>
            <span
              className={
                'kpi-tag ' +
                (plantMetrics.scrapRatePct < 1.5
                  ? 'kpi-tag-green'
                  : plantMetrics.scrapRatePct <= 2.5
                  ? 'kpi-tag-yellow'
                  : 'kpi-tag-red')
              }
            >
              {plantMetrics.scrapRatePct}% Rate
            </span>
          </div>
          <div className="kpi-card-main">
            <span className="kpi-val-hero scrap-text">
              {plantMetrics.totalScrapKg.toLocaleString()}
            </span>
            <span className="kpi-val-unit">kg</span>
          </div>
          <div className="kpi-sub-row">
            <span className="kpi-sub-item">
              Scrap Ratio: <b>{plantMetrics.scrapRatePct}%</b> of gross output
            </span>
          </div>
          <div className="kpi-sub-row text-muted">
            Formula: Scrap / (Good Wt + Scrap Wt) &times; 100
          </div>
        </div>

        {/* Card 3: Plant Average OEE */}
        <div className="analytics-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">PLANT AVERAGE OEE</span>
            <span
              className={
                'kpi-tag ' +
                (plantMetrics.oeePct >= 75
                  ? 'kpi-tag-green'
                  : plantMetrics.oeePct >= 50
                  ? 'kpi-tag-blue'
                  : 'kpi-tag-red')
              }
            >
              Target: 85.0%
            </span>
          </div>
          <div className="kpi-card-main">
            <span className="kpi-val-hero">{plantMetrics.oeePct}%</span>
          </div>
          <div className="kpi-oee-strip">
            <div className="oee-col">
              <span className="oee-label">A (Avail)</span>
              <span className="oee-val">{plantMetrics.availabilityPct}%</span>
            </div>
            <div className="oee-sep">&times;</div>
            <div className="oee-col">
              <span className="oee-label">P (Perf)</span>
              <span className="oee-val">{plantMetrics.performancePct}%</span>
            </div>
            <div className="oee-sep">&times;</div>
            <div className="oee-col">
              <span className="oee-label">Q (Qual)</span>
              <span className="oee-val">{plantMetrics.qualityPct}%</span>
            </div>
          </div>
          <div className="kpi-sub-row text-muted">
            Weighted by planned hours &amp; line benchmark capacities
          </div>
        </div>

        {/* Card 4: Capacity Utilization */}
        <div className="analytics-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">CAPACITY UTILIZATION</span>
            <span className="kpi-tag kpi-tag-blue">Benchmark</span>
          </div>
          <div className="kpi-card-main">
            <span className="kpi-val-hero">{plantMetrics.capacityUtilizationPct}%</span>
          </div>
          <div className="kpi-sub-row">
            <span className="kpi-sub-item">
              Plant Avg Rate: <b>{plantMetrics.avgActualRateKgH} kg/h</b>
            </span>
          </div>
          <div className="kpi-sub-row text-muted">
            Actual output kg/h versus nominal benchmark capacity
          </div>
        </div>

        {/* Card 5: Operating vs Downtime */}
        <div className="analytics-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">OPERATING VS DOWNTIME</span>
            <span className="kpi-tag kpi-tag-gray">{plantMetrics.totalPlannedHours}h Planned</span>
          </div>
          <div className="kpi-card-main">
            <span className="kpi-val-hero op-text">{plantMetrics.operatingHours}</span>
            <span className="kpi-val-unit">h Run</span>
          </div>
          <div className="kpi-sub-row">
            <span className="kpi-sub-item">
              Lost Downtime: <b className="dt-text">{plantMetrics.downtimeHours} h</b> ({plantMetrics.downtimePct}%)
            </span>
          </div>
          <div className="kpi-sub-row text-muted">
            Operating: {plantMetrics.operatingPct}% &middot; Stoppage: {plantMetrics.downtimePct}%
          </div>
        </div>
      </section>

      {/* 3. Performance Alerts & Top Line Highlights */}
      <div className="analytics-highlights-row">
        {topMachine ? (
          <div className="highlight-pill highlight-top">
            <span className="highlight-badge">TOP PERFORMING LINE</span>
            <span className="highlight-desc">
              <b>{topMachine.machineId}</b> ({topMachine.machineName}) achieved highest OEE at{' '}
              <b>{topMachine.oeePct}%</b> ({topMachine.totalGoodWeightMT} MT output, {topMachine.operatingHours}h run).
            </span>
          </div>
        ) : null}

        {attentionLines.length > 0 ? (
          <div className="highlight-pill highlight-attention">
            <span className="highlight-badge">MAINTENANCE / TOOLING ATTENTION</span>
            <span className="highlight-desc">
              {attentionLines.map((m) => (
                <span key={m.machineId} className="attention-item">
                  <b>{m.machineId}</b>: {m.status} (DT: {m.downtimeHours}h, Util: {m.capacityUtilizationPct}%, Scrap: {m.scrapRatePct}%)
                </span>
              ))}
            </span>
          </div>
        ) : (
          <div className="highlight-pill highlight-top">
            <span className="highlight-badge">PLANT STATUS</span>
            <span className="highlight-desc">All operating extrusion lines are functioning within standard benchmark thresholds.</span>
          </div>
        )}
      </div>

      {/* 4. Analytical Tables Grid */}
      <div className="analytics-tables-grid">
        {/* Downtime & Stoppage Pareto Breakdown */}
        <section className="card analytics-table-card">
          <div className="card-head">
            <div>
              <h3>Downtime &amp; Stoppage Analysis (Reason Breakdown)</h3>
              <span className="card-note">
                Aggregated from Column J stoppage logs &middot; Ranked by total lost duration
              </span>
            </div>
            <span className="table-count-badge">{downtimeList.length} Categories</span>
          </div>

          <div className="table-responsive">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Breakdown / Downtime Reason</th>
                  <th style={{ textAlign: 'center' }}>Events</th>
                  <th style={{ textAlign: 'right' }}>Duration (Hours)</th>
                  <th style={{ textAlign: 'right' }}>Duration (Min)</th>
                  <th style={{ textAlign: 'right' }}>% of Lost Time</th>
                  <th style={{ width: '140px' }}>Pareto Share</th>
                </tr>
              </thead>
              <tbody>
                {downtimeList.length > 0 ? (
                  downtimeList.map((item, idx) => (
                    <tr key={item.reason}>
                      <td className="cell-bold">{idx + 1}</td>
                      <td className="cell-reason">{item.reason}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="event-count-badge">{item.occurrences}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {item.totalHours} h
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {item.totalMinutes.toLocaleString()} min
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {item.pctOfTotal}%
                      </td>
                      <td>
                        <div className="pareto-bar-track">
                          <div
                            className="pareto-bar-fill"
                            style={{ width: `${Math.min(100, item.pctOfTotal)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="cell-empty">
                      Zero downtime recorded for this scope. All lines ran continuously.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Machine Performance Comparison Matrix */}
        <section className="card analytics-table-card">
          <div className="card-head">
            <div>
              <h3>Machine Performance Comparison Matrix</h3>
              <span className="card-note">
                Multi-line benchmark evaluation: Output, Scrap %, Nominal vs Actual kg/h, Utilization &amp; OEE
              </span>
            </div>
            <span className="table-count-badge">{machineMatrix.length} Lines</span>
          </div>

          <div className="table-responsive">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Line ID &amp; Extruder</th>
                  <th style={{ textAlign: 'center' }}>Op / DT Hours</th>
                  <th style={{ textAlign: 'right' }}>Good Output (MT)</th>
                  <th style={{ textAlign: 'right' }}>FG Pcs</th>
                  <th style={{ textAlign: 'right' }}>Scrap</th>
                  <th style={{ textAlign: 'right' }}>Actual / Nominal</th>
                  <th style={{ textAlign: 'right' }}>Util %</th>
                  <th style={{ textAlign: 'right' }}>OEE %</th>
                  <th style={{ textAlign: 'center' }}>Operational Status</th>
                  <th className="no-print" style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {machineMatrix.map((m) => {
                  const isTop = topMachine && topMachine.machineId === m.machineId && m.operatingHours > 0;
                  return (
                    <tr key={m.machineId} className={isTop ? 'row-top-performer' : ''}>
                      <td>
                        <div className="line-cell">
                          <b>{m.machineId}</b>
                          <span className="line-name-sub">{m.machineName}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="hours-cell">
                          <span className="op-val">{m.operatingHours}h</span>
                          <span className="dt-val">
                            {m.downtimeHours > 0 ? ` / ${m.downtimeHours}h DT` : ''}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {m.totalGoodWeightMT} MT
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {m.totalPcs.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={m.scrapRatePct > 2.0 ? 'scrap-high' : ''}>
                          {m.scrapRatePct}%
                        </span>
                        <span className="scrap-kg-sub">({m.totalScrapKg} kg)</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <b>{m.avgActualRateKgH}</b>
                        <span className="nominal-sub"> / {m.nominalCapacityKgH} kg/h</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {m.capacityUtilizationPct}%
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        <span
                          className={
                            m.oeePct >= 75
                              ? 'oee-high'
                              : m.oeePct >= 50
                              ? 'oee-mid'
                              : m.operatingHours > 0
                              ? 'oee-low'
                              : 'oee-zero'
                          }
                        >
                          {m.operatingHours > 0 ? `${m.oeePct}%` : '-'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`status-badge status-${m.statusType}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="no-print" style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleViewLineSheet(m)}
                          disabled={!m.latestRecord}
                          title="Open single-page 24-hour follow sheet for this line"
                        >
                          View Sheet
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </section>
        </div>
      </>
    )}
  </div>
  );
}
