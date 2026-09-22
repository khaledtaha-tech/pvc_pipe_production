import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Download, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw,
  Database,
  Cpu,
  Layers,
  HardDrive
} from 'lucide-react';
import { parseSheetToJsonWithDynamicHeader } from '../../utils/dataCleaner.js';
import { t } from '../../utils/translations.js';

export default function DataHub({
  onDataLoaded,
  onLoadSample,
  onUploadHistoricalFile,
  onLoadHistoricalSample,
  onClearHistoricalData,
  onExportMasterPlan,
  onExportUniqueCatalog,
  activeRecordCount = 0,
  historicalRecordCount = 0,
  totalMasterCount = 0,
  uniqueCatalogCount = 0,
  currentSheetName = 'Daily Production Log',
  theme = 'dark',
  lang = 'en'
}) {
  const isLight = theme === 'light';
  const isAr = lang === 'ar';

  // State for Dropzone 1 (Daily Production Log)
  const [activeDragging, setActiveDragging] = useState(false);
  const [activeFileName, setActiveFileName] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState(currentSheetName);
  const [activeWbRef, setActiveWbRef] = useState(null);
  const [activeError, setActiveError] = useState('');
  const activeFileInputRef = useRef(null);

  // State for Dropzone 2 (Historical ERP Data)
  const [erpDragging, setErpDragging] = useState(false);
  const [erpFileName, setErpFileName] = useState('');
  const [erpError, setErpError] = useState('');
  const erpFileInputRef = useRef(null);

  // --- Dropzone 1 Handler: Active Production Log ---
  const handleActiveFile = async (file) => {
    if (!file) return;
    setActiveError('');
    setActiveFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { cellDates: true, cellNF: false, cellText: false });
      setActiveWbRef(wb);
      setSheetNames(wb.SheetNames);

      const target = wb.SheetNames.find(s => 
        /daily|production|\u0625\u0646\u062a\u0627\u062c/i.test(s)
      ) || wb.SheetNames[0];

      setSelectedSheet(target);
      extractActiveSheet(wb, target);
    } catch (err) {
      console.error(err);
      setActiveError(isAr 
        ? '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0642\u0631\u0627\u0621\u0629 \u0645\u0644\u0641 \u0627\u0644\u0625\u0646\u062a\u0627\u062c.' 
        : 'Failed to read production log file.');
    }
  };

  const extractActiveSheet = (wb, sheetName) => {
    try {
      const ws = wb.Sheets[sheetName];
      const jsonData = parseSheetToJsonWithDynamicHeader(ws, XLSX);
      if (!jsonData || jsonData.length === 0) {
        setActiveError(isAr ? `\u0627\u0644\u0648\u0631\u0642\u0629 "${sheetName}" \u0641\u0627\u0631\u063a\u0629.` : `Sheet "${sheetName}" is empty.`);
        return;
      }
      onDataLoaded(jsonData, sheetName);
    } catch (err) {
      console.error(err);
      setActiveError(isAr ? '\u062a\u0639\u0630\u0631 \u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0648\u0631\u0642\u0629.' : 'Failed to extract sheet rows.');
    }
  };

  const handleActiveSheetChange = (e) => {
    const s = e.target.value;
    setSelectedSheet(s);
    if (activeWbRef) extractActiveSheet(activeWbRef, s);
  };

  // --- Dropzone 2 Handler: Historical ERP Data ---
  const handleErpFile = async (file) => {
    if (!file) return;
    setErpError('');
    setErpFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { cellDates: true, cellNF: false, cellText: false });
      const targetSheet = wb.SheetNames.find(s => 
        /pipes|daily|production|receipts|\u0625\u0646\u062a\u0627\u062c|\u0627\u0633\u062a\u0644\u0627\u0645/i.test(s)
      ) || wb.SheetNames[0];

      const ws = wb.Sheets[targetSheet];
      const jsonData = parseSheetToJsonWithDynamicHeader(ws, XLSX);

      if (!jsonData || jsonData.length === 0) {
        setErpError(isAr ? '\u0645\u0644\u0641 ERP \u0641\u0627\u0631\u063a \u0623\u0648 \u062a\u0639\u0630\u0631 \u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0635\u0641\u0648\u0641.' : 'ERP file is empty or headers could not be detected.');
        return;
      }

      onUploadHistoricalFile(jsonData, file.name);
    } catch (err) {
      console.error(err);
      setErpError(isAr ? '\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0642\u0631\u0627\u0621\u0629 \u0645\u0644\u0641 ERP.' : 'Failed to parse historical ERP file.');
    }
  };

  return (
    <section className={`rounded-2xl border transition-all ${
      isLight 
        ? 'bg-white border-[#dfd7ca] shadow-sm text-stone-800' 
        : 'bg-slate-900/90 border-slate-800 shadow-xl text-slate-100'
    } p-5 sm:p-6 space-y-6 relative overflow-hidden`}>
      
      {/* Subtle Background Glow */}
      <div className={`absolute -top-12 -right-12 w-64 h-64 rounded-full blur-3xl pointer-events-none ${
        isLight ? 'bg-teal-500/5' : 'bg-cyan-500/10'
      }`} />
      <div className={`absolute -bottom-12 -left-12 w-64 h-64 rounded-full blur-3xl pointer-events-none ${
        isLight ? 'bg-purple-500/5' : 'bg-purple-500/10'
      }`} />

      {/* Hub Top Bar: Header & Dual Primary Export Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-inherit relative z-10">
        
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-xl flex items-center justify-center ${
            isLight 
              ? 'bg-[#0f766e] text-white shadow-sm ring-1 ring-teal-600/30' 
              : 'bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-900/30'
          }`}>
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-base font-bold tracking-tight ${isLight ? 'text-stone-900' : 'text-white'}`}>
                {t('hubTitle', lang)}
              </h2>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                isLight 
                  ? 'bg-teal-50 text-teal-800 border border-teal-300' 
                  : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
              }`}>
                <HardDrive className="w-3 h-3 text-teal-600" />
                <span>{t('indexedDbBadge', lang)}</span>
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-stone-600' : 'text-slate-400'}`}>
              {t('hubSubtitle', lang)}
            </p>
          </div>
        </div>

        {/* Dual Primary Export Buttons */}
        <div className="flex flex-wrap items-center gap-3 self-end lg:self-auto">
          
          {/* Export 1: Master Production Log (All Runs) */}
          <button
            onClick={onExportMasterPlan}
            disabled={totalMasterCount === 0}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition transform active:scale-95 cursor-pointer shadow-sm ${
              totalMasterCount === 0
                ? 'opacity-50 cursor-not-allowed bg-stone-300 text-stone-600'
                : isLight
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-2 border-emerald-600'
                  : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white shadow-md shadow-emerald-950/40 border border-emerald-500/40'
            }`}
            title="Download full 18-column extrusion production log"
          >
            <Download className={`w-4 h-4 ${isLight ? 'text-emerald-700' : ''}`} />
            <span>{t('exportMasterLogBtn', lang)}</span>
            {totalMasterCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
                isLight ? 'bg-emerald-200 text-emerald-950' : 'bg-black/30 text-white'
              }`}>
                {totalMasterCount.toLocaleString()}
              </span>
            )}
          </button>

          {/* Export 2: Unique Planning Catalog (1 Row Per Item) */}
          <button
            onClick={onExportUniqueCatalog}
            disabled={uniqueCatalogCount === 0 && totalMasterCount === 0}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition transform active:scale-95 cursor-pointer shadow-sm ${
              uniqueCatalogCount === 0 && totalMasterCount === 0
                ? 'opacity-50 cursor-not-allowed bg-stone-300 text-stone-600'
                : isLight
                  ? 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-2 border-purple-600'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-950/40 border border-purple-500/40'
            }`}
            title="Download clean 12-column engineering catalog with 1 row per unique pipe item"
          >
            <Layers className={`w-4 h-4 ${isLight ? 'text-purple-700' : ''}`} />
            <span>{t('exportUniqueCatalogBtn', lang)}</span>
            {uniqueCatalogCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
                isLight ? 'bg-purple-200 text-purple-950' : 'bg-black/30 text-white'
              }`}>
                {uniqueCatalogCount}
              </span>
            )}
          </button>

        </div>

      </div>

      {/* Side-by-Side Dual Ingestion Dropzones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 relative z-10">
        
        {/* Dropzone 1: Daily Production Log (With Recorded Machines) */}
        <div className={`flex flex-col justify-between rounded-xl border-2 border-dashed p-5 transition-all ${
          activeDragging 
            ? (isLight ? 'border-[#0f766e] bg-[#e6f4f2]' : 'border-cyan-400 bg-cyan-950/30') 
            : (isLight ? 'border-[#dfd7ca] hover:border-[#0f766e] bg-[#fbf9f6]' : 'border-slate-800 hover:border-slate-700 bg-slate-950/50')
        }`}>
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${isLight ? 'bg-teal-50 text-[#0f766e]' : 'bg-cyan-500/10 text-cyan-400'}`}>
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-xs font-bold ${isLight ? 'text-stone-900' : 'text-slate-100'}`}>
                    {t('dropzone1Title', lang)}
                  </h3>
                  <p className={`text-[11px] ${isLight ? 'text-stone-500' : 'text-slate-400'}`}>
                    {t('dropzone1Desc', lang)}
                  </p>
                </div>
              </div>

              {activeRecordCount > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  isLight ? 'bg-teal-50 text-teal-800 border border-teal-300' : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                }`}>
                  {activeRecordCount} {t('dropzone1ActiveBadge', lang)}
                </span>
              )}
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setActiveDragging(true); }}
              onDragLeave={() => setActiveDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setActiveDragging(false);
                if (e.dataTransfer.files?.[0]) handleActiveFile(e.dataTransfer.files[0]);
              }}
              onClick={() => activeFileInputRef.current?.click()}
              className="py-6 px-4 text-center cursor-pointer rounded-lg border border-transparent hover:border-inherit transition"
            >
              <input
                ref={activeFileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleActiveFile(e.target.files[0]);
                }}
              />
              <UploadCloud className={`w-8 h-8 mx-auto mb-2 ${isLight ? 'text-[#0f766e]' : 'text-cyan-400'} animate-pulse`} />
              <p className={`text-xs font-semibold ${isLight ? 'text-stone-800' : 'text-slate-200'}`}>
                {t('dropzone1Action', lang)}
              </p>
              <p className={`text-[10px] mt-0.5 ${isLight ? 'text-stone-500' : 'text-slate-500'}`}>
                {t('dropzone1Hint', lang)}
              </p>
            </div>

            {/* Active File status & Sheet selector */}
            {activeFileName && (
              <div className={`mt-3 p-2.5 rounded-lg text-xs flex flex-col gap-2 ${
                isLight ? 'bg-white border border-stone-200' : 'bg-slate-900 border border-slate-800'
              }`}>
                <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="truncate">{activeFileName}</span>
                </div>
                {sheetNames.length > 1 && (
                  <div className="flex items-center gap-2">
                    <label className={`text-[10px] ${isLight ? 'text-stone-500' : 'text-slate-400'}`}>
                      {t('selectSheet', lang)}
                    </label>
                    <select
                      value={selectedSheet}
                      onChange={handleActiveSheetChange}
                      className={`flex-1 rounded-md px-2 py-1 text-[11px] font-mono border ${
                        isLight ? 'bg-stone-50 border-stone-300 text-stone-800' : 'bg-slate-950 border-slate-700 text-slate-200'
                      }`}
                    >
                      {sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {activeError && (
              <div className="mt-2 text-rose-500 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{activeError}</span>
              </div>
            )}
          </div>

          {/* Bottom Action: Load Sample Button */}
          <div className="mt-4 pt-3 border-t border-inherit flex items-center justify-between">
            <button
              onClick={onLoadSample}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isLight 
                  ? 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 shadow-2xs' 
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${isLight ? 'text-teal-600' : 'text-cyan-400'}`} />
              <span>{t('dropzone1SampleBtn', lang)}</span>
            </button>
            <span className={`text-[10px] font-mono ${isLight ? 'text-stone-400' : 'text-slate-500'}`}>
              {t('dropzone1Target', lang)}
            </span>
          </div>
        </div>

        {/* Dropzone 2: Historical ERP Data (Without Machines - Inference Engine) */}
        <div className={`flex flex-col justify-between rounded-xl border-2 border-dashed p-5 transition-all ${
          erpDragging 
            ? (isLight ? 'border-purple-600 bg-purple-50/50' : 'border-purple-500 bg-purple-950/30') 
            : (isLight ? 'border-[#dfd7ca] hover:border-purple-500 bg-[#fbf9f6]' : 'border-slate-800 hover:border-slate-700 bg-slate-950/50')
        }`}>
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${isLight ? 'bg-purple-50 text-purple-700' : 'bg-purple-500/10 text-purple-400'}`}>
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-xs font-bold ${isLight ? 'text-stone-900' : 'text-slate-100'}`}>
                    {t('dropzone2Title', lang)}
                  </h3>
                  <p className={`text-[11px] ${isLight ? 'text-stone-500' : 'text-slate-400'}`}>
                    {t('dropzone2Desc', lang)}
                  </p>
                </div>
              </div>

              {historicalRecordCount > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  isLight ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-purple-950 text-purple-300 border border-purple-800'
                }`}>
                  {historicalRecordCount.toLocaleString()} {t('dropzone2Badge', lang)}
                </span>
              )}
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setErpDragging(true); }}
              onDragLeave={() => setErpDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setErpDragging(false);
                if (e.dataTransfer.files?.[0]) handleErpFile(e.dataTransfer.files[0]);
              }}
              onClick={() => erpFileInputRef.current?.click()}
              className="py-6 px-4 text-center cursor-pointer rounded-lg border border-transparent hover:border-inherit transition"
            >
              <input
                ref={erpFileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleErpFile(e.target.files[0]);
                }}
              />
              <UploadCloud className={`w-8 h-8 mx-auto mb-2 ${isLight ? 'text-purple-600' : 'text-purple-400'} animate-pulse`} />
              <p className={`text-xs font-semibold ${isLight ? 'text-stone-800' : 'text-slate-200'}`}>
                {t('dropzone2Action', lang)}
              </p>
              <p className={`text-[10px] mt-0.5 ${isLight ? 'text-stone-500' : 'text-slate-500'}`}>
                {t('dropzone2Hint', lang)}
              </p>
            </div>

            {/* ERP File status */}
            {erpFileName && (
              <div className={`mt-3 p-2.5 rounded-lg text-xs flex items-center justify-between ${
                isLight ? 'bg-white border border-stone-200' : 'bg-slate-900 border border-slate-800'
              }`}>
                <div className="flex items-center gap-2 text-purple-600 font-semibold truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{erpFileName}</span>
                </div>
              </div>
            )}

            {erpError && (
              <div className="mt-2 text-rose-500 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{erpError}</span>
              </div>
            )}
          </div>

          {/* Bottom Action: Load Sample ERP & Clear */}
          <div className="mt-4 pt-3 border-t border-inherit flex items-center justify-between gap-2">
            <button
              onClick={onLoadHistoricalSample}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isLight 
                  ? 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 shadow-2xs' 
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Cpu className={`w-3.5 h-3.5 ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />
              <span>{t('dropzone2SampleBtn', lang)}</span>
            </button>

            {historicalRecordCount > 0 && (
              <button
                onClick={onClearHistoricalData}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition cursor-pointer ${
                  isLight ? 'text-rose-600 hover:bg-rose-50' : 'text-rose-400 hover:bg-rose-950/40'
                }`}
                title="Clear loaded historical ERP runs"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('dropzone2ClearBtn', lang)}</span>
              </button>
            )}
          </div>
        </div>

      </div>

    </section>
  );
}
