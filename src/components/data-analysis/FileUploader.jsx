import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { parseSheetToJsonWithDynamicHeader } from '../../utils/dataCleaner.js';
import { UploadCloud, FileSpreadsheet, Sparkles, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function FileUploader({ onDataLoaded, onLoadSample, lang }) {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [workbookRef, setWorkbookRef] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  const isAr = lang === 'ar';

  const processFile = async (file) => {
    if (!file) return;
    setLoading(true);
    setErrorMessage('');
    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { cellDates: true, cellNF: false, cellText: false });
      setWorkbookRef(wb);
      setSheetNames(wb.SheetNames);

      // Auto-select "Daily Production Log" or the first sheet
      const targetSheet = wb.SheetNames.find(s => 
        s.toLowerCase().includes('daily') || 
        s.toLowerCase().includes('production') || 
        s.toLowerCase().includes('إنتاج')
      ) || wb.SheetNames[0];

      setSelectedSheet(targetSheet);
      extractSheetData(wb, targetSheet);
    } catch (err) {
      console.error(err);
      setErrorMessage(isAr ? 'حدث خطأ أثناء قراءة ملف الإكسيل. تأكد من سلامة الملف.' : 'Error reading Excel file. Please ensure it is valid.');
    } finally {
      setLoading(false);
    }
  };

  const extractSheetData = (wb, sheetName) => {
    try {
      const ws = wb.Sheets[sheetName];
      // Convert sheet to json array of objects using dynamic header detection
      const jsonData = parseSheetToJsonWithDynamicHeader(ws, XLSX);
      if (jsonData.length === 0) {
        setErrorMessage(isAr ? `الورقة "${sheetName}" فارغة.` : `Sheet "${sheetName}" is empty.`);
        return;
      }
      onDataLoaded(jsonData, sheetName);
    } catch (err) {
      console.error(err);
      setErrorMessage(isAr ? 'تعذر استخراج البيانات من الورقة المحددة.' : 'Failed to parse sheet data.');
    }
  };

  const handleSheetChange = (e) => {
    const newSheet = e.target.value;
    setSelectedSheet(newSheet);
    if (workbookRef) {
      extractSheetData(workbookRef, newSheet);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
        
        {/* Upload Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex-1 w-full border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
            isDragging 
              ? 'border-cyan-400 bg-cyan-950/30 scale-[1.01]' 
              : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 bg-slate-950/40'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                processFile(e.target.files[0]);
              }
            }}
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="p-3 bg-cyan-500/10 rounded-full text-cyan-400">
              <UploadCloud className="w-8 h-8 animate-bounce" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">
                {isAr ? 'اسحب وأفلت شيت الإكسيل هنا، أو انقر للاختيار' : 'Drag & drop your Excel file here, or browse'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {isAr ? 'يدعم صيغ .xlsx, .xls, .csv (مثل Daily Production Log)' : 'Supports .xlsx, .xls, .csv (e.g. Daily Production Log)'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Panel / Current File Info */}
        <div className="w-full md:w-80 flex flex-col justify-between space-y-4">
          {fileName ? (
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>{isAr ? 'تم تحميل الملف بنجاح' : 'File Loaded Successfully'}</span>
              </div>
              <p className="text-xs text-slate-200 font-medium truncate" title={fileName}>
                📄 {fileName}
              </p>

              {sheetNames.length > 1 && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    {isAr ? 'اختر الورقة (Sheet):' : 'Select Sheet:'}
                  </label>
                  <select
                    value={selectedSheet}
                    onChange={handleSheetChange}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {sheetNames.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-3">
                {isAr ? 'أو يمكنك البدء فوراً بالعينة المطابقة للصورة:' : 'Or test immediately with image demo data:'}
              </p>
              <button
                onClick={onLoadSample}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs shadow-lg shadow-cyan-900/30 transition transform active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-cyan-200" />
                <span>{isAr ? 'تجربة بيانات الصورة المرفقة' : 'Load Demo from Screenshot'}</span>
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-950/40 border border-rose-800/60 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
