import { useState, useRef, useMemo } from 'react';
import html2pdf from 'html2pdf.js';
import JSZip from 'jszip';
import { parseExcelWorkbook, convertLogRowToReport } from '../../logic/excelParser.js';
import { MACHINES } from '../../config/machines.js';
import { buildAll } from '../../logic/engine.js';
import ReportSheet from './ReportSheet.jsx';
import {
  getOperatingRecordsForDate,
  formatPdfFilename,
  formatZipFilename,
  downloadBlob
} from '../../logic/batchZipExport.js';
import { exportAllMachinesToExcel } from '../../logic/excelExport.js';
import {
  loadPersistedMeta,
  savePersistedRecords,
  clearPersistedRecords
} from '../../data/store.js';

export default function ExcelUploader({
  records: externalRecords,
  machineMaster: externalMaster,
  onWorkbookParsed,
  onSelectReport,
  onNotify
}) {
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState(() => loadPersistedMeta().fileName || '');
  const [sheetName, setSheetName] = useState(() => loadPersistedMeta().sheetName || '');
  const [localRecords, setLocalRecords] = useState([]);
  const [localMaster, setLocalMaster] = useState(MACHINES);
  const [selectedDate, setSelectedDate] = useState('ALL');
  const [selectedMachine, setSelectedMachine] = useState('ALL');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const records = externalRecords !== undefined ? externalRecords : localRecords;
  const machineMaster = externalMaster !== undefined ? externalMaster : localMaster;

  // Batch export state
  const [batchProgress, setBatchProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    machine: '',
    status: ''
  });
  const [batchItem, setBatchItem] = useState(null);
  const batchSheetRef = useRef(null);

  // Available unique dates (excluding summary total rows)
  const dates = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      if (r.date && !String(r.date).toLowerCase().includes('total')) {
        set.add(r.date);
      }
    });
    return Array.from(set).sort();
  }, [records]);

  // Operating records for the currently selected date
  const operatingForDate = useMemo(() => {
    if (selectedDate === 'ALL') return [];
    return getOperatingRecordsForDate(records, selectedDate, machineMaster);
  }, [records, selectedDate, machineMaster]);

  // Filtered records
  const filtered = useMemo(() => {
    return records.filter((r) => {
      const matchD = selectedDate === 'ALL' || r.date === selectedDate;
      const matchM = selectedMachine === 'ALL' || r.machineId === selectedMachine;
      return matchD && matchM;
    });
  }, [records, selectedDate, selectedMachine]);

  // Summary stats
  const stats = useMemo(() => {
    const totalPcs = filtered.reduce((a, r) => a + (r.productionQty || 0), 0);
    const totalWt = filtered.reduce((a, r) => a + (r.totalWeight || 0), 0);
    const totalScrap = filtered.reduce((a, r) => a + (r.scrapKg || 0), 0);
    const avgOpHours =
      filtered.length > 0
        ? (filtered.reduce((a, r) => a + (r.operatingHours || 0), 0) / filtered.length).toFixed(1)
        : 0;
    const avgUtilization =
      filtered.length > 0
        ? (
            filtered.reduce((a, r) => a + (r.capacityUtilizationPct || 0), 0) /
            filtered.filter((r) => r.capacityUtilizationPct > 0).length || 1
          ).toFixed(1)
        : 0;

    return { totalPcs, totalWt, totalScrap, avgOpHours, avgUtilization, count: filtered.length };
  }, [filtered]);

  const processBuffer = (buffer, name) => {
    try {
      setLoading(true);
      const res = parseExcelWorkbook(buffer);
      setFileName(name);
      setSheetName(res.sheetName);
      setLocalRecords(res.rows);
      if (res.machineMaster && res.machineMaster.length > 0) {
        setLocalMaster(res.machineMaster);
      }
      savePersistedRecords(res.rows, {
        machineMaster: res.machineMaster,
        fileName: name,
        sheetName: res.sheetName
      });
      if (onWorkbookParsed) {
        onWorkbookParsed({
          rows: res.rows,
          machineMaster: res.machineMaster,
          fileName: name,
          sheetName: res.sheetName
        });
      }

      if (res.rows.length > 0) {
        const firstD = res.rows[0].date;
        if (firstD) setSelectedDate(firstD);
        onNotify(
          `Parsed ${res.rows.length} logs from "${res.sheetName}" & ${res.machineMaster?.length || 9} lines from Machine_Master`
        );
      } else {
        onNotify('No production rows found in the selected file.');
      }
    } catch (err) {
      console.error(err);
      onNotify(`Failed to parse Excel file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const buf = evt.target?.result;
      if (buf) processBuffer(buf, file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const buf = evt.target?.result;
      if (buf) processBuffer(buf, file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleLoadMaster = async () => {
    setLoading(true);
    try {
      const resp = await fetch('./Master_Upload.xlsx');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      processBuffer(buf, 'Master_Upload.xlsx');
    } catch (err) {
      console.error(err);
      onNotify('Could not load Master_Upload.xlsx from public folder.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = () => {
    setLocalRecords([]);
    setFileName('');
    setSheetName('');
    setSelectedDate('ALL');
    setSelectedMachine('ALL');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    clearPersistedRecords();
    if (onWorkbookParsed) {
      onWorkbookParsed({
        rows: [],
        machineMaster: MACHINES,
        fileName: '',
        sheetName: '',
        cleared: true
      });
    }
    if (onNotify) {
      onNotify('Cleared all imported Excel production data.');
    }
  };

  const handleConvertRow = (row) => {
    const report = convertLogRowToReport(row);
    onSelectReport(report);
    onNotify(`Generated 24-hour log for ${row.machineName} (${row.date})`);
  };

  const handleBatchExportZip = async () => {
    if (selectedDate === 'ALL') {
      onNotify('Please select a specific Production Date for batch export.');
      return;
    }

    const targetRows = getOperatingRecordsForDate(records, selectedDate, machineMaster);
    if (targetRows.length === 0) {
      onNotify(`No active operating lines found for date ${selectedDate}`);
      return;
    }

    setBatchProgress({
      active: true,
      current: 0,
      total: targetRows.length,
      machine: '',
      status: 'Initializing batch archive...'
    });

    const zip = new JSZip();

    try {
      for (let i = 0; i < targetRows.length; i += 1) {
        const row = targetRows[i];
        const rep = convertLogRowToReport(row);
        const der = buildAll(rep.slots, rep.refs, rep.summary?.startCounter, rep.engineering);

        const machineDisplay = row.machineName || row.machineId || `Line_${i + 1}`;
        setBatchItem({ report: rep, derived: der });
        setBatchProgress({
          active: true,
          current: i + 1,
          total: targetRows.length,
          machine: machineDisplay,
          status: `Rendering PDF ${i + 1} of ${targetRows.length}...`
        });

        // Allow React to commit the ReportSheet DOM update
        await new Promise((resolve) => setTimeout(resolve, 150));

        const sheetEl = batchSheetRef.current;
        if (!sheetEl) {
          throw new Error('Report container element not found in DOM.');
        }

        const pdfFilename = formatPdfFilename(
          row.date,
          row.machineId || 'Line',
          row.machineRaw || row.machineName || 'Machine'
        );

        const opt = {
          margin: [4, 4, 4, 4],
          filename: pdfFilename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2.5,
            useCORS: true,
            letterRendering: true,
            logging: false,
            backgroundColor: '#FFFFFF',
            windowWidth: 1120,
            scrollY: 0,
            scrollX: 0
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
          pagebreak: { mode: ['avoid-all'] }
        };

        const pdfBlob = await html2pdf().set(opt).from(sheetEl).output('blob');
        zip.file(pdfFilename, pdfBlob);
      }

      setBatchProgress((prev) => ({
        ...prev,
        status: 'Compressing ZIP archive...'
      }));

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const zipFilename = formatZipFilename(selectedDate);
      downloadBlob(zipBlob, zipFilename);
      onNotify(`Downloaded ZIP with ${targetRows.length} machine reports for ${selectedDate}`);
    } catch (err) {
      console.error('Batch ZIP export error:', err);
      onNotify(`Batch export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setBatchItem(null);
      setBatchProgress({
        active: false,
        current: 0,
        total: 0,
        machine: '',
        status: ''
      });
    }
  };

  const handleExportAllMachinesExcel = () => {
    if (selectedDate === 'ALL') {
      onNotify('Please select a specific Production Date for batch export.');
      return;
    }
    try {
      const res = exportAllMachinesToExcel(records, selectedDate, machineMaster);
      if (!res.success) {
        if (res.reason === 'no_records') {
          onNotify(`No active operating lines found for date ${selectedDate}`);
        } else {
          onNotify('Failed to generate Excel workbook.');
        }
        return;
      }
      onNotify(`Exported Excel workbook for ${res.count} machines (${res.filename})`);
    } catch (err) {
      console.error('Failed to export all machines Excel:', err);
      onNotify('Failed to generate Excel workbook.');
    }
  };

  return (
    <div className="uploader-root">
      {/* 1. Upload Header & Drop Area */}
      <section className="card uploader-card">
        <div className="card-head">
          <div>
            <h2>Factory Consolidated Excel Parser (Master_Upload.xlsx)</h2>
            <span className="card-note">
              Unified workbook parser: extracts <b>Machine_Master</b> capacities, <b>Daily Production Log</b>, and Column J <b>Reason of Stop</b>
            </span>
          </div>
          <div className="header-btn-wrap">
            {records.length > 0 ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleClearData}
                disabled={loading}
                title="Clear all imported Excel production records from the application and local storage"
              >
                Clear Data
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleLoadMaster}
              disabled={loading}
              title="Load master production logs and machine capacities"
            >
              {records.length > 0 ? 'Reload Master_Upload.xlsx' : 'Load Demo Sample (Master_Upload.xlsx)'}
            </button>
          </div>
        </div>

        {/* Dynamic Machine Master Ribbon */}
        <div className="machine-master-ribbon">
          <div className="ribbon-title">FACTORY MACHINE BENCHMARK CAPACITY (Machine_Master):</div>
          <div className="ribbon-chips">
            {machineMaster.map((m) => (
              <span className="ribbon-chip" key={m.id}>
                <b>{m.id}</b> {m.name}: <span className="chip-rate">{m.capacityKgH ? `${m.capacityKgH} kg/h` : m.detail}</span>
              </span>
            ))}
          </div>
        </div>

        <div
          className={'drop-zone' + (isDragOver ? ' drag-active' : '')}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".xlsx, .xls"
            onChange={handleFileChange}
          />
          <div className="drop-icon">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div className="drop-title">
            {loading
              ? 'Parsing Excel workbook & Machine_Master...'
              : fileName
              ? `Loaded: ${fileName} (Sheet: ${sheetName})`
              : 'Drag & Drop Master_Upload.xlsx here, or click to browse'}
          </div>
          <div className="drop-sub">
            Reads Date, Line ID, Item Code, Specs, Production Qty, Total Weight, Scrap kg, Operating Hours, and Reason of Stop
          </div>
        </div>
      </section>

      {/* 2. Filter & Stats Bar */}
      {records.length > 0 ? (
        <>
          <section className="card filter-card">
            <div className="filter-controls">
              <label className="field narrow">
                <span className="field-label">Production Date</span>
                <select
                  className="input"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                >
                  <option value="ALL">All Dates ({dates.length})</option>
                  {dates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field narrow">
                <span className="field-label">Extrusion Line</span>
                <select
                  className="input"
                  value={selectedMachine}
                  onChange={(e) => setSelectedMachine(e.target.value)}
                >
                  <option value="ALL">All Lines ({machineMaster.length})</option>
                  {machineMaster.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} - {m.name} ({m.capacityKgH} kg/h)
                    </option>
                  ))}
                </select>
              </label>

              <div className="batch-export-wrap">
                <button
                  type="button"
                  className="btn btn-batch-export"
                  onClick={handleBatchExportZip}
                  disabled={batchProgress.active || (selectedDate !== 'ALL' && operatingForDate.length === 0)}
                  title="Generate single-page A4 landscape PDFs for all operating lines and download as a ZIP archive"
                >
                  {batchProgress.active ? (
                    <>
                      <span className="spinner-sm" />
                      <span>
                        Generating {batchProgress.current}/{batchProgress.total}...
                      </span>
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Download All Machines (ZIP)</span>
                      {selectedDate !== 'ALL' && operatingForDate.length > 0 ? (
                        <span className="batch-count-badge">{operatingForDate.length} Lines</span>
                      ) : null}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-batch-export btn-batch-excel"
                  onClick={handleExportAllMachinesExcel}
                  disabled={selectedDate === 'ALL' || operatingForDate.length === 0}
                  title="Export all operating lines for selected date to a combined multi-sheet Excel workbook (.xlsx)"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="16" y2="17" />
                  </svg>
                  <span>Export All Machines (Excel)</span>
                  {selectedDate !== 'ALL' && operatingForDate.length > 0 ? (
                    <span className="batch-count-badge">{operatingForDate.length} Lines</span>
                  ) : null}
                </button>
              </div>
            </div>

            <div className="stats-row">
              <div className="stat-pill">
                <span className="stat-num">{stats.count}</span>
                <span className="stat-desc">Lines Logged</span>
              </div>
              <div className="stat-pill">
                <span className="stat-num">{stats.totalPcs.toLocaleString()}</span>
                <span className="stat-desc">Total Pipes (FG)</span>
              </div>
              <div className="stat-pill">
                <span className="stat-num">{stats.totalWt.toLocaleString()} kg</span>
                <span className="stat-desc">Total Run Weight</span>
              </div>
              <div className="stat-pill">
                <span className="stat-num">{stats.totalScrap.toLocaleString()} kg</span>
                <span className="stat-desc">Total Scrap</span>
              </div>
              <div className="stat-pill">
                <span className="stat-num">{stats.avgOpHours} h</span>
                <span className="stat-desc">Avg Op Hours</span>
              </div>
              <div className="stat-pill stat-pill-hl">
                <span className="stat-num">{stats.avgUtilization}%</span>
                <span className="stat-desc">Avg Capacity Util</span>
              </div>
            </div>
          </section>

          {/* 3. Parsed Data Table */}
          <section className="card table-card">
            <div className="card-head">
              <h2>Production Log Records &amp; Engineering Metrics ({filtered.length})</h2>
              <span className="card-note">
                Actual kg/h = Total Weight / Operating Hours &middot; Capacity Util % = Actual kg/h / Nominal kg/h
              </span>
            </div>

            <div className="table-responsive">
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Machine</th>
                    <th>Item Code</th>
                    <th>Product Description &amp; Specs</th>
                    <th>Production Qty (FG)</th>
                    <th>Unit Wt</th>
                    <th>Total Wt</th>
                    <th>Scrap (kg)</th>
                    <th>Actual Rate vs Nominal</th>
                    <th>Operating / Downtime</th>
                    <th>Reason of Stop</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isFullRun = r.operatingHours >= 24;
                    return (
                      <tr key={r.id}>
                        <td className="cell-bold">{r.date}</td>
                        <td>
                          <span className="machine-tag">
                            {r.machineId ? `${r.machineId} (${r.machineRaw})` : r.machineRaw}
                          </span>
                        </td>
                        <td className="cell-code">{r.itemCode}</td>
                        <td className="cell-desc" title={r.description}>
                          {r.description}
                        </td>
                        <td className="cell-num cell-qty">{r.productionQty.toLocaleString()} pcs</td>
                        <td className="cell-num">{r.unitWeight} kg</td>
                        <td className="cell-num">{r.totalWeight.toLocaleString()} kg</td>
                        <td className="cell-num scrap-num">
                          {r.scrapKg > 0 ? `${r.scrapKg} kg` : '0'}
                        </td>
                        <td>
                          <div className="rate-cell">
                            <b>{r.actualRateKgH} kg/h</b>
                            <span className="rate-sub">
                              {r.nominalCapacityKgH > 0
                                ? `${r.capacityUtilizationPct}% of ${r.nominalCapacityKgH} kg/h`
                                : '-'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="op-badge-wrap">
                            <span className={'op-badge ' + (isFullRun ? 'op-full' : 'op-partial')}>
                              {r.operatingHours}h Run
                            </span>
                            {r.downtimeHours > 0 ? (
                              <span className="dt-badge">{r.downtimeHours}h Downtime</span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span className="reason-text" title={r.reasonOfStop}>
                            {r.reasonOfStop || (r.downtimeHours > 0 ? 'Die Change & Sizing Setup' : 'None')}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleConvertRow(r)}
                          >
                            Generate 24h Follow Sheet
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {/* Batch Export Progress Dialog */}
      {batchProgress.active ? (
        <div className="batch-modal-backdrop" role="dialog" aria-modal="true">
          <div className="batch-modal">
            <div className="batch-modal-title">Generating Batch PDF Archive</div>
            <div className="batch-modal-sub">
              Compiling single-page A4 landscape reports for <b>{selectedDate}</b>
            </div>

            {batchProgress.machine ? (
              <div className="batch-modal-machine">
                Packaging Line: <b>{batchProgress.machine}</b>
              </div>
            ) : null}

            <div className="batch-progress-bar">
              <div
                className="batch-progress-fill"
                style={{
                  width: `${
                    batchProgress.total > 0
                      ? (batchProgress.current / batchProgress.total) * 100
                      : 0
                  }%`
                }}
              />
            </div>

            <div className="batch-modal-status">
              {batchProgress.status} ({batchProgress.current} of {batchProgress.total})
            </div>
          </div>
        </div>
      ) : null}

      {/* Staging element for off-screen batch rendering */}
      {batchItem ? (
        <div className="batch-stage-container" aria-hidden="true">
          <ReportSheet
            ref={batchSheetRef}
            report={batchItem.report}
            derived={batchItem.derived}
            isMonochrome={true}
            isExporting={true}
          />
        </div>
      ) : null}
    </div>
  );
}
