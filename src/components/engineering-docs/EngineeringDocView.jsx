import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileText,
  BookOpen,
  Download,
  Printer,
  Save,
  RotateCcw,
  Edit3,
  Eye,
  Check,
  Search,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Layers,
  ListTree,
  AlertTriangle,
  X
} from 'lucide-react';
import {
  loadEngineeringDoc,
  saveEngineeringDoc,
  resetEngineeringDoc,
  downloadDocumentAsWord
} from '../../logic/engineeringDocHelper.js';

export default function EngineeringDocView({
  theme = 'dark',
  lang = 'en',
  onNotify = null
}) {
  const isLight = theme === 'light';
  const [doc, setDoc] = useState(() => loadEngineeringDoc());
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('sec-1');
  const [zoomLevel, setZoomLevel] = useState(100); // 80% to 140%
  const [collapsedSections, setCollapsedSections] = useState({});
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [isSaved, setIsSaved] = useState(true);
  const [highlightedSecId, setHighlightedSecId] = useState(null);

  const documentContainerRef = useRef(null);

  // Sync state when loaded
  useEffect(() => {
    const loaded = loadEngineeringDoc();
    setDoc(loaded);
  }, []);

  const notify = (msg, type = 'success') => {
    if (typeof onNotify === 'function') {
      onNotify(msg, type);
    }
  };

  // Save changes to localStorage
  const handleSave = () => {
    try {
      saveEngineeringDoc(doc);
      setIsSaved(true);
      notify('Engineering documentation saved to local storage', 'success');
    } catch (err) {
      notify('Failed to save document: ' + (err.message || 'Unknown error'), 'error');
    }
  };

  // Reset to default seed
  const handleReset = () => {
    try {
      const defaultDoc = resetEngineeringDoc();
      setDoc(defaultDoc);
      setIsSaved(true);
      setIsResetConfirmOpen(false);
      notify('Documentation reset to default seed payload', 'info');
    } catch (err) {
      notify('Reset error: ' + (err.message || 'Unknown error'), 'error');
    }
  };

  // Export to Word (.docx)
  const handleExportWord = async () => {
    try {
      setIsExportingWord(true);
      notify('Compiling OpenXML Word (.docx) package...', 'info');
      await downloadDocumentAsWord(doc, 'Engineering_Governance_Documentation.docx');
      notify('Word document (.docx) downloaded successfully!', 'success');
    } catch (err) {
      console.error('Word export error:', err);
      notify('Failed to export Word document: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setIsExportingWord(false);
    }
  };

  // Print / PDF via browser print
  const handlePrint = () => {
    window.print();
  };

  // Smooth scroll to section in document canvas
  const handleScrollToSection = (secId) => {
    setActiveSectionId(secId);
    setHighlightedSecId(secId);
    setTimeout(() => {
      setHighlightedSecId((prev) => (prev === secId ? null : prev));
    }, 2000);

    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Filter sections and items based on search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return doc.sections || [];
    const q = searchQuery.toLowerCase().trim();
    return (doc.sections || []).filter((sec) => {
      const headingMatch = (sec.heading || '').toLowerCase().includes(q);
      const itemMatch = Array.isArray(sec.items) && sec.items.some((it) => it.toLowerCase().includes(q));
      return headingMatch || itemMatch;
    });
  }, [doc.sections, searchQuery]);

  // Section collapsing in Navigation Pane
  const toggleSectionCollapse = (secId) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [secId]: !prev[secId]
    }));
  };

  // Document Editing Mutators
  const updateTitle = (val) => {
    setDoc((prev) => ({ ...prev, title: val }));
    setIsSaved(false);
  };

  const updateSubtitle = (val) => {
    setDoc((prev) => ({ ...prev, subtitle: val }));
    setIsSaved(false);
  };

  const updateSectionHeading = (secIndex, val) => {
    setDoc((prev) => {
      const nextSecs = [...prev.sections];
      nextSecs[secIndex] = { ...nextSecs[secIndex], heading: val };
      return { ...prev, sections: nextSecs };
    });
    setIsSaved(false);
  };

  const updateSectionItem = (secIndex, itemIndex, val) => {
    setDoc((prev) => {
      const nextSecs = [...prev.sections];
      const nextItems = [...nextSecs[secIndex].items];
      nextItems[itemIndex] = val;
      nextSecs[secIndex] = { ...nextSecs[secIndex], items: nextItems };
      return { ...prev, sections: nextSecs };
    });
    setIsSaved(false);
  };

  const addSectionItem = (secIndex) => {
    setDoc((prev) => {
      const nextSecs = [...prev.sections];
      const nextItems = [...(nextSecs[secIndex].items || []), ''];
      nextSecs[secIndex] = { ...nextSecs[secIndex], items: nextItems };
      return { ...prev, sections: nextSecs };
    });
    setIsSaved(false);
  };

  const removeSectionItem = (secIndex, itemIndex) => {
    setDoc((prev) => {
      const nextSecs = [...prev.sections];
      const nextItems = nextSecs[secIndex].items.filter((_, idx) => idx !== itemIndex);
      nextSecs[secIndex] = { ...nextSecs[secIndex], items: nextItems };
      return { ...prev, sections: nextSecs };
    });
    setIsSaved(false);
  };

  const addSection = () => {
    const newId = `sec-${Date.now()}`;
    setDoc((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: newId,
          heading: `Section ${prev.sections.length + 1}`,
          items: ['']
        }
      ]
    }));
    setIsSaved(false);
    setTimeout(() => handleScrollToSection(newId), 100);
  };

  const removeSection = (secIndex) => {
    setDoc((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, idx) => idx !== secIndex)
    }));
    setIsSaved(false);
  };

  return (
    <div className={`engineering-hub-root flex flex-col h-[calc(100vh-5.5rem)] rounded-2xl overflow-hidden shadow-2xl border ${
      isLight ? 'bg-slate-100 border-slate-300' : 'bg-[#0a0f1d] border-slate-800'
    }`}>
      {/* Top Microsoft Word-style Ribbon / Action Bar */}
      <header className={`doc-ribbon-bar shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b select-none z-10 ${
        isLight ? 'bg-white border-slate-200 shadow-2xs' : 'bg-[#0f172a] border-slate-800 shadow-md'
      }`}>
        {/* Left: Branding & View Mode Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center brand-gradient text-white shadow-xs">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold leading-tight flex items-center gap-2">
                <span className={isLight ? 'text-slate-900' : 'text-slate-100'}>
                  Engineering Governance & Sizing Hub
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 font-bold">
                  DOCX / A4
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Interactive Factory Documentation & Technical Standards
              </p>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 hidden sm:block" />

          {/* Reading View vs Edit Mode Toggle */}
          <div className="flex items-center rounded-lg p-0.5 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setIsEditMode(false)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                !isEditMode
                  ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Switch to formatted Reading View"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Reading View</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditMode(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                isEditMode
                  ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Switch to Edit Mode to customize text"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Mode</span>
            </button>
          </div>
        </div>

        {/* Right: Actions (Save, Reset, Export Word, Print, Zoom) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Zoom controls */}
          <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-600 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(80, z - 10))}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] w-9 text-center font-bold">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(140, z + 10))}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset to Seed */}
          <button
            type="button"
            onClick={() => setIsResetConfirmOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
            title="Reset document to default factory seed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Seed</span>
          </button>

          {/* Save Changes */}
          <button
            type="button"
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
              !isSaved
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-sm animate-pulse'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
            title="Save changes to browser localStorage"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaved ? 'Saved' : 'Save Changes'}</span>
          </button>

          {/* Print / PDF */}
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            title="Print document or save as PDF"
          >
            <Printer className="w-3.5 h-3.5 text-teal-500" />
            <span>Print / PDF</span>
          </button>

          {/* Download Word (.docx) */}
          <button
            type="button"
            disabled={isExportingWord}
            onClick={handleExportWord}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold brand-gradient text-white shadow-sm shadow-emerald-600/30 ring-1 ring-white/20 hover:brightness-110 transition cursor-pointer disabled:opacity-50"
            title="Export genuine Microsoft Word (.docx) document"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExportingWord ? 'Exporting...' : 'Word (.docx)'}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Area: Left Navigation Pane + Word Page Canvas */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left-Hand Navigation Pane (Word Headings Tree) */}
        <aside className={`doc-nav-pane w-72 sm:w-80 shrink-0 border-r flex flex-col select-none overflow-hidden ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#070d18] border-slate-800'
        }`}>
          {/* Navigation Pane Header */}
          <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTree className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Navigation
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {doc.sections?.length || 0} Headings
              </span>
            </div>

            {/* Live Search Headings Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search headings & points..."
                className="w-full pl-8 pr-7 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tree List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredSections.map((sec, sIdx) => {
              const isCollapsed = Boolean(collapsedSections[sec.id]);
              const isActive = activeSectionId === sec.id;
              const hasItems = Array.isArray(sec.items) && sec.items.length > 0;

              return (
                <div key={sec.id || sIdx} className="space-y-0.5">
                  {/* Level 1 Heading Node */}
                  <div className={`group flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium transition cursor-pointer ${
                    isActive
                      ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-bold border-l-2 border-teal-500'
                      : isLight
                      ? 'text-slate-700 hover:bg-slate-200/60'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handleScrollToSection(sec.id)}
                      className="flex-1 text-left rtl:text-right truncate pr-1"
                      title={sec.heading}
                    >
                      <span className="font-mono text-[10px] text-teal-600 dark:text-teal-400 mr-1.5 font-bold">
                        §{sIdx + 1}
                      </span>
                      <span className="truncate">{sec.heading || `Section ${sIdx + 1}`}</span>
                    </button>

                    {hasItems && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSectionCollapse(sec.id);
                        }}
                        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title={isCollapsed ? 'Expand items' : 'Collapse items'}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Level 2 Sub-Items Tree */}
                  {!isCollapsed && hasItems && (
                    <div className="pl-4 rtl:pl-0 rtl:pr-4 space-y-0.5 border-l border-slate-200 dark:border-slate-800 ml-2 rtl:ml-0 rtl:mr-2">
                      {sec.items.map((it, iIdx) => {
                        const snippet = it.length > 55 ? `${it.slice(0, 52)}...` : it;
                        return (
                          <button
                            key={iIdx}
                            type="button"
                            onClick={() => handleScrollToSection(sec.id)}
                            className="w-full text-left rtl:text-right px-2 py-1 rounded text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/40 truncate transition cursor-pointer block"
                            title={it}
                          >
                            <span className="font-mono text-[9px] text-slate-400 mr-1">
                              {sIdx + 1}.{iIdx + 1}
                            </span>
                            <span>{snippet}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredSections.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching headings found.
              </div>
            )}

            {isEditMode && (
              <button
                type="button"
                onClick={addSection}
                className="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-dashed border-teal-500/40 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Section</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Document Canvas Viewport (Scrollable Word Page Presentation) */}
        <div
          ref={documentContainerRef}
          className={`doc-canvas-viewport flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center ${
            isLight ? 'bg-slate-200/80' : 'bg-[#060a14]'
          }`}
        >
          {/* A4 Document Card Sheet */}
          <article
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease'
            }}
            className={`doc-page-sheet w-full max-w-[850px] min-h-[1100px] p-8 sm:p-14 rounded-xl shadow-2xl transition-all border ${
              isLight
                ? 'bg-white text-slate-900 border-slate-300 ring-1 ring-slate-900/5'
                : 'bg-[#0f172a] text-slate-100 border-slate-800 ring-1 ring-white/5'
            }`}
            dir="rtl"
          >
            {/* Document Header Title & Subtitle */}
            <header className="doc-page-header pb-6 mb-8 border-b-2 border-teal-600/40 text-center space-y-2">
              {isEditMode ? (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 text-right">
                    Document Title (Arabic RTL):
                  </label>
                  <input
                    type="text"
                    value={doc.title || ''}
                    onChange={(e) => updateTitle(e.target.value)}
                    className="w-full px-3 py-2 text-lg sm:text-2xl font-black rounded-lg border border-teal-500/50 bg-teal-50/20 dark:bg-teal-950/30 text-slate-900 dark:text-slate-100 text-center focus:ring-2 focus:ring-teal-500"
                  />
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 text-right">
                    Subtitle / Architecture Header:
                  </label>
                  <input
                    type="text"
                    value={doc.subtitle || ''}
                    onChange={(e) => updateSubtitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-center focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              ) : (
                <>
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50 leading-relaxed">
                    {doc.title}
                  </h1>
                  {doc.subtitle && (
                    <p className="text-xs sm:text-sm font-medium text-teal-700 dark:text-teal-300 tracking-normal font-sans">
                      {doc.subtitle}
                    </p>
                  )}
                </>
              )}

              {/* Document Meta Badges */}
              <div className="pt-2 flex items-center justify-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                  <Sparkles className="w-3 h-3 text-teal-500" />
                  Canonical Architecture v2.0
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-100/70 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800">
                  Linear Weight: kg/m
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-100/70 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800">
                  Standard Length: 6.0m
                </span>
              </div>
            </header>

            {/* Document Content Sections */}
            <div className="doc-sections-body space-y-8 text-right leading-relaxed">
              {(doc.sections || []).map((sec, sIdx) => {
                const isTargetHighlighted = highlightedSecId === sec.id;

                return (
                  <section
                    key={sec.id || sIdx}
                    id={sec.id}
                    className={`doc-section p-4 sm:p-5 rounded-xl transition-all duration-300 ${
                      isTargetHighlighted
                        ? 'ring-2 ring-teal-500 bg-teal-50/40 dark:bg-teal-950/40 shadow-lg'
                        : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Section Header (Level 1) */}
                    <div className="flex items-center justify-between gap-3 pb-2.5 mb-3.5 border-b border-teal-600/30">
                      <div className="flex-1">
                        {isEditMode ? (
                          <input
                            type="text"
                            value={sec.heading || ''}
                            onChange={(e) => updateSectionHeading(sIdx, e.target.value)}
                            className="w-full px-3 py-1.5 text-base font-bold rounded-lg border border-teal-500/50 bg-teal-50/20 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200 focus:ring-2 focus:ring-teal-500"
                          />
                        ) : (
                          <h2 className="text-base sm:text-lg font-bold text-teal-700 dark:text-teal-300 flex items-center gap-2">
                            <span>{sec.heading}</span>
                          </h2>
                        )}
                      </div>

                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => removeSection(sIdx)}
                          className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          title="Delete section"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Section Items (Numbered List) */}
                    <div className="space-y-3">
                      {(sec.items || []).map((item, iIdx) => (
                        <div
                          key={iIdx}
                          className="doc-item group flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200"
                        >
                          {isEditMode ? (
                            <div className="flex-1 flex items-start gap-2">
                              <textarea
                                value={item}
                                onChange={(e) => updateSectionItem(sIdx, iIdx, e.target.value)}
                                rows={2}
                                className="flex-1 p-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-teal-500"
                              />
                              <button
                                type="button"
                                onClick={() => removeSectionItem(sIdx, iIdx)}
                                className="p-1 text-slate-400 hover:text-rose-500 rounded cursor-pointer mt-1"
                                title="Delete point"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex-1 leading-relaxed bg-slate-50/50 dark:bg-slate-800/20 p-2.5 rounded-lg border border-slate-200/50 dark:border-slate-800/60">
                              <p className="whitespace-pre-wrap">{item}</p>
                            </div>
                          )}
                        </div>
                      ))}

                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => addSectionItem(sIdx)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 border border-dashed border-teal-500/30 transition cursor-pointer mt-2"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Point</span>
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* Document Footer (Word Page Sign-Off) */}
            <footer className="doc-page-footer mt-12 pt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 select-none">
              <div>
                <span>PVC Production Suite — Engineering Sizing Standards</span>
              </div>
              <div className="font-mono">
                <span>Page 1 of 1</span>
              </div>
            </footer>
          </article>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl shadow-2xl border ${
            isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
          }`}>
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Confirm Reset to Default Seed
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
              Are you sure you want to discard your custom edits and restore the original Arabic documentation seed payload? This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition cursor-pointer"
              >
                Reset to Seed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
