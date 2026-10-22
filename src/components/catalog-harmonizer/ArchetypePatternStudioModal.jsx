import React, { useState, useEffect, useMemo } from 'react';
import {
  Sliders,
  Layers,
  Sparkles,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  CheckCircle2,
  X,
  Info,
  Eye,
  RefreshCw,
  Copy
} from 'lucide-react';

import harmonizerConfig from '../../data/harmonizerConfig.json' with { type: 'json' };
import {
  loadArchetypes,
  saveArchetypes,
  resetArchetypes,
  synthesizeDescription,
  formatTokenValue
} from '../../logic/catalogHarmonizer.js';

export default function ArchetypePatternStudioModal({
  isOpen,
  onClose,
  stagedItems = [],
  onApplyArchetypeToSandbox = () => {},
  theme = 'dark',
  lang = 'en',
  onNotify = () => {}
}) {
  const isAr = lang === 'ar';
  const isLight = theme === 'light';

  // Archetypes templates state
  const [archetypes, setArchetypes] = useState(() => loadArchetypes());
  const [selectedArchetypeId, setSelectedArchetypeId] = useState(() => {
    const list = loadArchetypes();
    return list[0]?.id || 'pattern_1_metric_pressure';
  });

  // Selected sample item for Live Preview (either default seed or chosen staged item)
  const [sampleSource, setSampleSource] = useState('seed'); // 'seed' | 'staged'
  const [selectedStagedIndex, setSelectedStagedIndex] = useState(0);

  // Drag and Drop state
  const [draggedTokenIndex, setDraggedTokenIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Token Library lookup map
  const tokenMap = useMemo(() => {
    const map = {};
    (harmonizerConfig.tokenLibrary || []).forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, []);

  // Active Archetype Object
  const activeArchetype = useMemo(() => {
    return archetypes.find((a) => a.id === selectedArchetypeId) || archetypes[0];
  }, [archetypes, selectedArchetypeId]);

  // Current active token sequence
  const currentSequence = useMemo(() => {
    return activeArchetype?.tokenSequence || [];
  }, [activeArchetype]);

  // Active Sample Item for Live Preview
  const currentSampleItem = useMemo(() => {
    if (sampleSource === 'staged' && stagedItems.length > 0) {
      return stagedItems[selectedStagedIndex] || stagedItems[0];
    }
    return activeArchetype?.sampleItem || {
      productType: 'PVC PIPE',
      odMm: 110,
      sizeDisplay: '110',
      wallThicknessMm: 5.3,
      ratingClass: 'PN10',
      standard: 'SASO-ISO 1452-2',
      joint: 'R/R',
      lengthM: 6.0
    };
  }, [sampleSource, stagedItems, selectedStagedIndex, activeArchetype]);

  // Live Synthesized Preview
  const livePreviewString = useMemo(() => {
    return synthesizeDescription(currentSampleItem, currentSequence);
  }, [currentSampleItem, currentSequence]);

  // Available tokens not yet in current sequence (or can be re-added)
  const availableTokens = useMemo(() => {
    return harmonizerConfig.tokenLibrary || [];
  }, []);

  // Update active archetype sequence
  const updateSequence = (newSequence) => {
    setArchetypes((prev) =>
      prev.map((a) => (a.id === activeArchetype.id ? { ...a, tokenSequence: newSequence } : a))
    );
  };

  // Drag & Drop handlers
  const handleDragStart = (e, index) => {
    setDraggedTokenIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedTokenIndex === null || draggedTokenIndex === dropIndex) {
      setDraggedTokenIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...currentSequence];
    const [movedItem] = updated.splice(draggedTokenIndex, 1);
    updated.splice(dropIndex, 0, movedItem);

    updateSequence(updated);
    setDraggedTokenIndex(null);
    setDragOverIndex(null);
  };

  // Move token Left / Right via buttons
  const moveTokenLeft = (index) => {
    if (index <= 0) return;
    const updated = [...currentSequence];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    updateSequence(updated);
  };

  const moveTokenRight = (index) => {
    if (index >= currentSequence.length - 1) return;
    const updated = [...currentSequence];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    updateSequence(updated);
  };

  // Remove token from sequence
  const removeToken = (index) => {
    const updated = currentSequence.filter((_, i) => i !== index);
    updateSequence(updated);
  };

  // Add token from library palette
  const addToken = (tokenId) => {
    const updated = [...currentSequence, tokenId];
    updateSequence(updated);
  };

  // Save Archetypes to persistent storage
  const handleSave = () => {
    saveArchetypes(archetypes);
    onNotify('Archetype pattern templates saved successfully', 'success');
  };

  // Reset Archetypes to factory seed defaults
  const handleReset = () => {
    if (confirm('Reset all archetype patterns to factory default templates?')) {
      const resetList = resetArchetypes();
      setArchetypes(resetList);
      if (resetList[0]) {
        setSelectedArchetypeId(resetList[0].id);
      }
      onNotify('Reset archetypes to factory seed templates', 'info');
    }
  };

  // Create New Custom Archetype
  const handleCreateCustom = () => {
    const newId = `custom_pattern_${Date.now()}`;
    const newArchetype = {
      id: newId,
      name: `Pattern #${archetypes.length + 1}: Custom Pattern`,
      code: `ARCH-0${archetypes.length + 1}`,
      description: 'Custom user-defined product naming archetype',
      tokenSequence: ['PRODUCT_TYPE', 'OD_SIZE', 'WT', 'RATING_PN_SDR', 'STANDARD', 'LENGTH'],
      sampleItem: {
        productType: 'PVC PIPE',
        odMm: 110,
        sizeDisplay: '110',
        wallThicknessMm: 5.3,
        ratingClass: 'PN10',
        standard: 'SASO-ISO 1452-2',
        joint: 'R/R',
        lengthM: 6.0
      },
      targetExample: 'PVC PIPE 110 x 5.3mm PN10 SASO-ISO 1452-2 6.0M'
    };
    const updated = [...archetypes, newArchetype];
    setArchetypes(updated);
    setSelectedArchetypeId(newId);
    saveArchetypes(updated);
    onNotify('New custom archetype created', 'success');
  };

  // Apply Active Pattern to Sandbox
  const handleApplyToSandbox = (mode = 'matching') => {
    onApplyArchetypeToSandbox(activeArchetype, mode);
    onClose();
  };

  // Helper color badge class
  const getTokenColorClass = (colorKey = 'blue') => {
    switch (colorKey) {
      case 'blue':
        return isLight ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-blue-950/60 text-blue-300 border-blue-800';
      case 'amber':
        return isLight ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-amber-950/60 text-amber-300 border-amber-800';
      case 'emerald':
        return isLight ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-emerald-950/60 text-emerald-300 border-emerald-800';
      case 'purple':
        return isLight ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-purple-950/60 text-purple-300 border-purple-800';
      case 'rose':
        return isLight ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-rose-950/60 text-rose-300 border-rose-800';
      case 'cyan':
        return isLight ? 'bg-cyan-100 text-cyan-700 border-cyan-300' : 'bg-cyan-950/60 text-cyan-300 border-cyan-800';
      case 'indigo':
        return isLight ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-indigo-950/60 text-indigo-300 border-indigo-800';
      case 'teal':
        return isLight ? 'bg-teal-100 text-teal-700 border-teal-300' : 'bg-teal-950/60 text-teal-300 border-teal-800';
      case 'orange':
        return isLight ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-orange-950/60 text-orange-300 border-orange-800';
      default:
        return isLight ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className={`relative w-full max-w-5xl rounded-2xl shadow-2xl border flex flex-col max-h-[92vh] overflow-hidden z-10 ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f172a] border-slate-800 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`p-4 sm:p-5 border-b flex items-center justify-between ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-600 text-white flex items-center justify-center shadow-md">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">
                  {isAr ? '\u0627\u0633\u062A\u062F\u064A\u0648 \u0623\u0646\u0645\u0627\u0637 \u0627\u0644\u062A\u0633\u0645\u064A\u0629 (Archetype Pattern Studio)' : 'Archetype Pattern Studio'}
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                  DRAG & DROP BUILDER
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {isAr
                  ? '\u0628\u0646\u0627\u0621 \u0648\u062A\u0639\u062F\u064A\u0644 \u0648\u0625\u0639\u0627\u062F\u0629 \u062A\u0631\u062A\u064A\u062F \u0642\u0648\u0627\u0644\u0628 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0627\u0644\u0642\u064A\u0627\u0633\u064A\u0629 \u0628\u0627\u0644\u0633\u062D\u0628 \u0648\u0627\u0644\u0625\u0641\u0644\u0627\u062A'
                  : 'Visually construct, re-order, and calibrate standardized product description archetypes with live sample previews'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className={`p-2 rounded-xl border text-xs text-slate-400 hover:text-rose-500 transition cursor-pointer ${
                isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
              }`}
              title="Reset templates to factory defaults"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-xl border text-slate-400 hover:text-slate-200 transition cursor-pointer ${
                isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Archetype Selector Tabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {isAr ? '\u0627\u0644\u0642\u0648\u0627\u0644\u0628 \u0627\u0644\u0645\u062A\u0627\u062D\u0629 (Archetypes)' : 'Select Archetype Template'}
              </span>
              <button
                type="button"
                onClick={handleCreateCustom}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 hover:text-emerald-400 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? '\u0625\u0636\u0627\u0641\u0629 \u0642\u0627\u0644\u0628 \u0645\u062E\u0635\u0635' : '+ Add Custom Archetype'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {archetypes.map((arch) => {
                const isSelected = arch.id === selectedArchetypeId;
                return (
                  <button
                    key={arch.id}
                    type="button"
                    onClick={() => setSelectedArchetypeId(arch.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border ${
                      isSelected
                        ? 'bg-cyan-600 text-white border-cyan-500 shadow-md shadow-cyan-600/30'
                        : isLight
                        ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    <span>{arch.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-500/20 text-slate-400'
                      }`}
                    >
                      {arch.code || 'ARCH'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Archetype Details Bar */}
          <div
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black">{activeArchetype?.name}</span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-500 border border-cyan-500/30">
                  {activeArchetype?.code || 'ARCH'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{activeArchetype?.description}</p>
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              Tokens in Sequence: <strong className="text-cyan-400">{currentSequence.length}</strong>
            </div>
          </div>

          {/* Drag & Drop Canvas / Drop Zone */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <GripVertical className="w-4 h-4 text-cyan-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {isAr ? '\u0645\u0633\u0627\u062D\u0629 \u0627\u0644\u062A\u0631\u062A\u064A\u0628 (Token Canvas)' : 'Pattern Sequence Canvas (Drag & Drop or Click Chevrons)'}
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                Drag chips or use left/right arrows to reorder
              </span>
            </div>

            <div
              className={`p-4 rounded-2xl border-2 border-dashed transition-all min-h-[90px] flex flex-wrap items-center gap-2.5 ${
                isLight
                  ? 'bg-slate-50/80 border-slate-300'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              {currentSequence.length === 0 ? (
                <div className="w-full py-4 text-center text-xs text-slate-500">
                  No tokens in sequence. Click token chips below to add them to this pattern.
                </div>
              ) : (
                currentSequence.map((tokenId, index) => {
                  const tokenDef = tokenMap[tokenId] || {
                    id: tokenId,
                    label: tokenId,
                    badgeColor: 'slate',
                    sampleValue: tokenId
                  };
                  const isBeingDragged = draggedTokenIndex === index;
                  const isOver = dragOverIndex === index;

                  return (
                    <div
                      key={`${tokenId}-${index}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      className={`group relative flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold select-none transition-all cursor-grab active:cursor-grabbing shadow-xs ${getTokenColorClass(
                        tokenDef.badgeColor
                      )} ${isBeingDragged ? 'opacity-40 scale-95' : 'opacity-100'} ${
                        isOver ? 'ring-2 ring-cyan-500 scale-105' : ''
                      }`}
                    >
                      <GripVertical className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 -ml-1 text-slate-400" />
                      
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] opacity-60">#{index + 1}</span>
                          <span className="tracking-tight">{tokenDef.label}</span>
                        </div>
                        <span className="text-[10px] font-mono opacity-80 font-normal">
                          {formatTokenValue(currentSampleItem, tokenId) || tokenDef.sampleValue}
                        </span>
                      </div>

                      {/* Controls: Left, Right, Remove */}
                      <div className="flex items-center gap-0.5 ml-1.5 pl-1.5 border-l border-current/20">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveTokenLeft(index)}
                          className="p-0.5 hover:bg-black/15 rounded disabled:opacity-20 cursor-pointer"
                          title="Move Left"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={index === currentSequence.length - 1}
                          onClick={() => moveTokenRight(index)}
                          className="p-0.5 hover:bg-black/15 rounded disabled:opacity-20 cursor-pointer"
                          title="Move Right"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeToken(index)}
                          className="p-0.5 hover:bg-rose-500/20 text-rose-500 rounded cursor-pointer ml-0.5"
                          title="Remove token"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Token Library Palette */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {isAr ? '\u0645\u0643\u062A\u0628\u0629 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 (Token Palette - Click to Add)' : 'Available Token Palette (Click to Add into Sequence)'}
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {availableTokens.map((token) => {
                const countInSeq = currentSequence.filter((id) => id === token.id).length;
                return (
                  <button
                    key={token.id}
                    type="button"
                    onClick={() => addToken(token.id)}
                    className={`p-2.5 rounded-xl border text-left transition hover:scale-[1.02] cursor-pointer flex flex-col justify-between ${
                      isLight
                        ? 'bg-white border-slate-200 hover:border-cyan-500 shadow-xs'
                        : 'bg-slate-900 border-slate-800 hover:border-cyan-500 shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">
                          {token.category}
                        </span>
                        {countInSeq > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-400">
                            {countInSeq}x
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                        <span>{token.label}</span>
                        <Plus className="w-3.5 h-3.5 text-cyan-500" />
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      {token.sampleValue}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Preview Example Box */}
          <div
            className={`p-4 rounded-2xl border ${
              isLight ? 'bg-cyan-50/60 border-cyan-200' : 'bg-cyan-950/20 border-cyan-800/60'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-cyan-500/20">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-500" />
                <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
                  Live Dynamic Preview Example
                </span>
              </div>

              {/* Sample Source Switcher */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 text-[11px]">Preview Target:</span>
                <button
                  type="button"
                  onClick={() => setSampleSource('seed')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    sampleSource === 'seed'
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Archetype Sample
                </button>
                {stagedItems.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSampleSource('staged')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        sampleSource === 'staged'
                          ? 'bg-cyan-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Staged Sandbox Item
                    </button>
                    {sampleSource === 'staged' && (
                      <select
                        value={selectedStagedIndex}
                        onChange={(e) => setSelectedStagedIndex(Number(e.target.value))}
                        className="text-xs h-7 px-2 rounded border bg-transparent font-mono"
                      >
                        {stagedItems.map((item, idx) => (
                          <option key={item.id} value={idx} className="bg-slate-900 text-slate-100">
                            {item.itemCode || `Item #${idx + 1}`} - {item.productType} {item.sizeDisplay || item.odMm}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Synthesized Live String Display */}
            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-emerald-400 font-mono text-sm font-bold tracking-wide break-all flex items-center justify-between">
                <span>{livePreviewString || '(Empty sequence)'}</span>
                <span className="text-[10px] text-slate-500 font-normal ml-2 whitespace-nowrap">
                  Synthesized Output
                </span>
              </div>

              {activeArchetype?.targetExample && sampleSource === 'seed' && (
                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                  <span className="text-slate-500">Target Benchmark:</span>
                  <span className="text-slate-300">{activeArchetype.targetExample}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className={`p-4 border-t flex flex-wrap items-center justify-between gap-3 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-700 text-white transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-cyan-600/25"
            >
              <Check className="w-4 h-4" />
              <span>{isAr ? '\u062D\u0641\u0638 \u0642\u0627\u0644\u0628 \u0627\u0644\u0646\u0645\u0637' : 'Save Archetype Template'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {stagedItems.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => handleApplyToSandbox('matching')}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Apply to all items matching this archetype"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Apply to Matching Items</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyToSandbox('all')}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-emerald-500/50 hover:bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 transition cursor-pointer"
                  title="Force re-synthesis on all staged items using this archetype sequence"
                >
                  <span>Apply to ALL ({stagedItems.length})</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
