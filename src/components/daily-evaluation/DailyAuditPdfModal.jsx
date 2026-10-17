import React, { useState, useEffect, useRef, useMemo } from 'react';
import html2pdf from 'html2pdf.js';
import {
  getYesterdayDate,
  findLatestRecordedDate,
  buildDailyAuditReportData
} from '../../logic/dailyAuditPdfHelper.js';
import DailyAuditPdfSheet from './DailyAuditPdfSheet.jsx';
import { MACHINES } from '../../config/machines.js';

export default function DailyAuditPdfModal({
  isOpen,
  onClose,
  records = [],
  selectedDate = '',
  machineMaster = MACHINES,
  onNotify = null
}) {
  // 1. Automatic Yesterday Binding (relative to selectedDate or current system date)
  const [auditDate, setAuditDate] = useState(() => getYesterdayDate(selectedDate));
  const [isDownloading, setIsDownloading] = useState(false);
  const sheetRef = useRef(null);

  // Sync when selectedDate changes and modal opens
  useEffect(() => {
    if (isOpen) {
      const yesterday = getYesterdayDate(selectedDate);
      setAuditDate(yesterday);
    }
  }, [isOpen, selectedDate]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Latest recorded production date in database / uploaded records
  const latestRecordedDate = useMemo(() => {
    return findLatestRecordedDate(records);
  }, [records]);

  // Compile full structured audit data
  const auditData = useMemo(() => {
    if (!auditDate) return null;
    return buildDailyAuditReportData({
      date: auditDate,
      records,
      machineMaster
    });
  }, [auditDate, records, machineMaster]);

  if (!isOpen) return null;

  // Date navigation handlers
  const handlePrevDay = () => {
    if (!auditDate) return;
    setAuditDate(getYesterdayDate(auditDate));
  };

  const handleNextDay = () => {
    if (!auditDate) return;
    const [y, m, d] = auditDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + 1);
    const nextStr = dateObj.toISOString().slice(0, 10);
    setAuditDate(nextStr);
  };

  const handleSetYesterday = () => {
    setAuditDate(getYesterdayDate(selectedDate));
  };

  const handleSetLatest = () => {
    if (latestRecordedDate) {
      setAuditDate(latestRecordedDate);
    }
  };

  // High-fidelity Native Browser Print trigger
  const handlePrint = () => {
    document.body.classList.add('print-daily-audit-active');

    let pageStyle = document.getElementById('daily-audit-page-style');
    if (!pageStyle) {
      pageStyle = document.createElement('style');
      pageStyle.id = 'daily-audit-page-style';
      document.head.appendChild(pageStyle);
    }
    pageStyle.innerHTML = '@page { size: A4 landscape; margin: 8mm 10mm; }';

    if (onNotify) {
      onNotify(`Opening print dialog for Daily Audit Report (${auditDate})...`);
    }

    setTimeout(() => {
      window.print();
      // Clean up after print dialog
      setTimeout(() => {
        document.body.classList.remove('print-daily-audit-active');
      }, 1000);
    }, 200);
  };

  // Download PDF via html2pdf
  const handleDownloadPdf = async () => {
    if (!sheetRef.current || isDownloading) return;
    setIsDownloading(true);

    if (onNotify) {
      onNotify('Generating Daily Audit PDF...');
    }

    const filename = `Daily_Operational_Audit_Report_${auditDate}.pdf`;
    const opt = {
      margin: [8, 10, 8, 10],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2.5,
        useCORS: true,
        letterRendering: true,
        logging: false,
        backgroundColor: '#FFFFFF',
        windowWidth: 1400,
        scrollY: 0,
        scrollX: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().set(opt).from(sheetRef.current).save();
      if (onNotify) {
        onNotify(`Daily Audit PDF downloaded successfully: ${filename}`);
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      if (onNotify) {
        onNotify('PDF generator encountered an error. Opening browser print dialog.');
      }
      handlePrint();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="daily-audit-modal-backdrop no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 overflow-y-auto">
      <div
        className="daily-audit-modal-dialog bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col w-full max-w-6xl max-h-[95vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-audit-modal-title"
      >
        {/* Modal Controls Toolbar Header */}
        <div className="daily-audit-toolbar flex items-center justify-between flex-wrap gap-2 px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-white">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white uppercase tracking-wider">
              Executive PDF
            </span>
            <h2 id="daily-audit-modal-title" className="text-sm font-bold text-slate-100">
              Daily Operational Audit Report
            </h2>
            <span className="text-xs text-slate-400 hidden sm:inline">&bull; Single-Page A4 Landscape</span>
          </div>

          {/* Quick Date Controls */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700 text-xs">
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
              title="Previous Day"
            >
              &larr;
            </button>
            <input
              type="date"
              value={auditDate}
              onChange={(e) => setAuditDate(e.target.value)}
              className="bg-slate-900 text-white border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono font-medium focus:border-blue-500 cursor-pointer"
              title="Target Audit Date"
            />
            <button
              type="button"
              onClick={handleNextDay}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition cursor-pointer"
              title="Next Day"
            >
              &rarr;
            </button>

            <button
              type="button"
              onClick={handleSetYesterday}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition cursor-pointer"
              title="Set to Yesterday relative to system"
            >
              Yesterday
            </button>

            {latestRecordedDate && (
              <button
                type="button"
                onClick={handleSetLatest}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-900/60 hover:bg-blue-800/80 text-blue-200 border border-blue-700/60 transition cursor-pointer"
                title={`Set to latest logged production date (${latestRecordedDate})`}
              >
                Latest ({latestRecordedDate})
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition cursor-pointer"
              style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
              title="Print or Save as PDF via native browser print engine"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2">
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              <span>Print / Save as PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: '#059669', color: '#ffffff' }}
              title="Download high-resolution PDF file directly"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{isDownloading ? 'Generating...' : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close dialog"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Sheet Preview Container */}
        <div className="daily-audit-preview-body p-4 overflow-auto bg-slate-950/60 flex justify-center">
          <div className="daily-audit-preview-wrapper shadow-2xl rounded-sm border border-slate-300">
            <DailyAuditPdfSheet ref={sheetRef} data={auditData} />
          </div>
        </div>
      </div>
    </div>
  );
}
