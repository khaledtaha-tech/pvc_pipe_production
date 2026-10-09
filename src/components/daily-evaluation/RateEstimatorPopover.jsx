import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Gauge,
  X,
  Check,
  AlertTriangle,
  ArrowRight,
  Info,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { getMachinePhysicalSpecs } from '../../logic/machineSettingsConfig.js';
import {
  calculateAdvisoryRate,
  hasAdvisoryRateDifference,
  DEFAULT_MAX_LINEAR_SPEED,
  DEFAULT_PIPE_LENGTH
} from '../../logic/estimationHelper.js';

/**
 * Dynamic Capacity & Rate Estimator Popover
 * Provides advisory physical bottleneck analysis (Weight-based vs Speed/Cooling-based limits)
 * and allows one-click application to standard rate without destructively overwriting established rates.
 */
export default function RateEstimatorPopover({
  lineId,
  lineName = '',
  nominalCap: passedNominalCap = 0,
  stdWeight = 0,
  pipeLength: passedPipeLength = null,
  maxLinearSpeed: passedMaxLinearSpeed = null,
  currentRate = 0,
  onApplyRate,
  buttonClassName = '',
  align = 'right'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTweaking, setIsTweaking] = useState(false);
  const popoverRef = useRef(null);

  // Machine physical specs from config / persistent overrides
  const machineSpecs = useMemo(() => {
    return getMachinePhysicalSpecs(lineId);
  }, [lineId]);

  // Working parameters (allow manual tweaking inside popover)
  const defaultNominal = Number(passedNominalCap) > 0 ? Number(passedNominalCap) : (machineSpecs?.nominalCap || 0);
  const defaultSpeed = Number(passedMaxLinearSpeed) > 0 ? Number(passedMaxLinearSpeed) : (machineSpecs?.maxLinearSpeed || DEFAULT_MAX_LINEAR_SPEED);
  const defaultLength = Number(passedPipeLength) > 0 ? Number(passedPipeLength) : (machineSpecs?.pipeLength || DEFAULT_PIPE_LENGTH);

  const [tweakCap, setTweakCap] = useState(defaultNominal);
  const [tweakSpeed, setTweakSpeed] = useState(defaultSpeed);
  const [tweakLength, setTweakLength] = useState(defaultLength);

  // Reset tweaks when inputs or open state change
  useEffect(() => {
    setTweakCap(defaultNominal);
    setTweakSpeed(defaultSpeed);
    setTweakLength(defaultLength);
    setIsTweaking(false);
  }, [defaultNominal, defaultSpeed, defaultLength, isOpen]);

  // Dynamic Advisory Calculation
  const advisory = useMemo(() => {
    const nominal = isTweaking ? Number(tweakCap) : defaultNominal;
    const speed = isTweaking ? Number(tweakSpeed) : defaultSpeed;
    const length = isTweaking ? Number(tweakLength) : defaultLength;

    return calculateAdvisoryRate({
      nominalCap: nominal,
      stdWeight: Number(stdWeight) || 0,
      maxLinearSpeed: speed,
      pipeLength: length
    });
  }, [isTweaking, tweakCap, tweakSpeed, tweakLength, defaultNominal, defaultSpeed, defaultLength, stdWeight]);

  const hasDiff = useMemo(() => {
    return hasAdvisoryRateDifference(currentRate, advisory.suggestedRate, 0.5);
  }, [currentRate, advisory.suggestedRate]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleApply = (e) => {
    e?.stopPropagation?.();
    if (typeof onApplyRate === 'function' && advisory.suggestedRate > 0) {
      onApplyRate(advisory.suggestedRate);
    }
    setIsOpen(false);
  };

  const isPositiveAdv = advisory.suggestedRate > 0;

  return (
    <div className="relative inline-flex items-center" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`p-1 rounded transition flex items-center justify-center ${
          hasDiff
            ? 'text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 ring-1 ring-amber-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
        } ${buttonClassName}`}
        title={
          isPositiveAdv
            ? `Dynamic Rate Advisor: Suggested ${advisory.suggestedRate} Pcs/h (${advisory.bottleneckLabel})`
            : 'Open Dynamic Capacity & Rate Estimator'
        }
        aria-label="Dynamic Capacity & Rate Estimator"
      >
        <Sparkles size={13} className={hasDiff ? 'animate-pulse text-amber-400' : ''} />
      </button>

      {/* Popover Dropdown Card */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full z-50 mt-1.5 w-80 max-w-[90vw] p-3.5 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl text-left text-xs text-slate-200 font-sans backdrop-blur-sm ${
            align === 'left' ? 'left-0' : 'right-0'
          }`}
          style={{ minWidth: '290px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <Gauge size={15} className="text-cyan-400" />
              <div>
                <div className="font-bold text-slate-100 text-xs tracking-wide">
                  Dynamic Rate Estimator
                </div>
                <div className="text-[10px] text-slate-400">
                  {lineId ? `${lineId} • ` : ''}Physical Limits Advisory
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          {/* Key Rates Comparison */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 mb-2.5">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                  Dynamic Suggested Rate
                </div>
                <div className="text-base font-extrabold text-cyan-300 font-mono flex items-baseline gap-1.5">
                  {advisory.suggestedRate > 0 ? (
                    <>
                      <span>{advisory.suggestedRate}</span>
                      <span className="text-[11px] font-normal text-slate-400">Pcs/h</span>
                      {advisory.advisoryRatePcsH !== advisory.suggestedRate && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({advisory.advisoryRatePcsH})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-500 text-xs font-normal">Insufficient Specs</span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                  Current Assigned
                </div>
                <div className="text-xs font-bold text-slate-300 font-mono">
                  {Number(currentRate) > 0 ? `${currentRate} Pcs/h` : '0 Pcs/h'}
                </div>
                {hasDiff && advisory.suggestedRate > 0 && (
                  <div
                    className={`text-[10px] font-mono font-semibold ${
                      advisory.suggestedRate > currentRate ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {advisory.suggestedRate > currentRate ? '+' : ''}
                    {Math.round((advisory.suggestedRate - (Number(currentRate) || 0)) * 10) / 10} diff
                  </div>
                )}
              </div>
            </div>

            {/* Bottleneck Badge */}
            {advisory.bottleneckLabel && (
              <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Dominant Bottleneck:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
                    advisory.isSpeedLimited
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                  }`}
                >
                  {advisory.bottleneckLabel}
                </span>
              </div>
            )}
          </div>

          {/* Physical Factors Breakdown */}
          <div className="space-y-1.5 mb-3 text-[11px]">
            {/* 1. Extruder Melt Capacity */}
            <div
              className={`p-2 rounded border transition ${
                advisory.isCapacityLimited
                  ? 'bg-blue-950/30 border-blue-800/60 text-slate-200'
                  : 'bg-slate-950/40 border-slate-800/60 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      advisory.isCapacityLimited ? 'bg-blue-400' : 'bg-slate-600'
                    }`}
                  />
                  Extruder Melt Capacity:
                </span>
                <span className="font-mono text-slate-200">
                  {advisory.weightBasedPcsH != null ? `${advisory.weightBasedPcsH} Pcs/h` : 'N/A'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 pl-2.5">
                Cap: {Math.round(advisory.nominalCap)} kg/h &divide; Std Wt:{' '}
                {Number(stdWeight) > 0 ? `${Number(stdWeight).toFixed(2)} kg/pc` : '0 kg'}
              </div>
            </div>

            {/* 2. Haul-off / Cooling Speed */}
            <div
              className={`p-2 rounded border transition ${
                advisory.isSpeedLimited
                  ? 'bg-amber-950/30 border-amber-800/60 text-slate-200'
                  : 'bg-slate-950/40 border-slate-800/60 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      advisory.isSpeedLimited ? 'bg-amber-400' : 'bg-slate-600'
                    }`}
                  />
                  Cooling &amp; Haul-off Speed:
                </span>
                <span className="font-mono text-slate-200">{advisory.speedBasedPcsH} Pcs/h</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 pl-2.5">
                Max: {advisory.maxLinearSpeed.toFixed(1)} m/min &times; 60 &divide; Length:{' '}
                {advisory.pipeLength.toFixed(1)}m
              </div>
            </div>
          </div>

          {/* Bottleneck Narrative Note */}
          {advisory.bottleneckReason && (
            <div className="text-[10.5px] text-slate-300 bg-slate-800/50 rounded p-2 mb-3 border border-slate-700/50 flex items-start gap-1.5 leading-snug">
              <Info size={13} className="text-cyan-400 shrink-0 mt-0.5" />
              <span>{advisory.bottleneckReason}</span>
            </div>
          )}

          {/* Collapsible Parameter Tweaker */}
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setIsTweaking((prev) => !prev)}
              className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition"
            >
              <SlidersHorizontal size={10} />
              <span>{isTweaking ? 'Hide Parameter Adjuster' : 'Adjust Parameters / Simulation'}</span>
              <ChevronDown
                size={10}
                className={`transition-transform ${isTweaking ? 'rotate-180' : ''}`}
              />
            </button>

            {isTweaking && (
              <div className="mt-2 p-2 bg-slate-950/80 rounded border border-slate-800 space-y-1.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400">Melt Capacity (kg/h):</label>
                  <input
                    type="number"
                    step="10"
                    min="10"
                    value={tweakCap}
                    onChange={(e) => setTweakCap(e.target.value)}
                    className="w-16 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-right font-mono text-slate-200"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-slate-400">Max Speed (m/min):</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={tweakSpeed}
                    onChange={(e) => setTweakSpeed(e.target.value)}
                    className="w-16 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-right font-mono text-slate-200"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-slate-400">Pipe Length (m):</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={tweakLength}
                    onChange={(e) => setTweakLength(e.target.value)}
                    className="w-16 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded text-right font-mono text-slate-200"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1.5 rounded text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Dismiss
            </button>

            <button
              type="button"
              disabled={!isPositiveAdv}
              onClick={handleApply}
              style={{ color: '#ffffff' }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition ${
                isPositiveAdv
                  ? 'bg-blue-600 hover:bg-blue-500 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Check size={13} style={{ color: '#ffffff' }} />
              <span>Apply Suggestion ({advisory.suggestedRate} Pcs/h)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
