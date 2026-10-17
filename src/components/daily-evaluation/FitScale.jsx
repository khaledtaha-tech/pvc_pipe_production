import { useEffect, useRef, useState } from 'react';

export default function FitScale({ children }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const [isFitMode, setIsFitMode] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const targetWidth = 1120; // Reference sheet width with border padding

      if (contentRef.current) {
        setContentHeight(contentRef.current.offsetHeight);
      }

      if (isFitMode && containerWidth > 0 && containerWidth < targetWidth) {
        // Leave a comfortable 16px safety margin so borders never hit container edge
        const newScale = Math.max(0.45, Math.min(1, (containerWidth - 16) / targetWidth));
        setScale(newScale);
      } else {
        setScale(1);
      }
    };

    updateScale();

    const resizeObserver = new ResizeObserver(() => {
      updateScale();
    });

    resizeObserver.observe(containerRef.current);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    window.addEventListener('resize', updateScale);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [isFitMode]);

  const isScaled = scale < 0.999 && isFitMode;

  return (
    <div className="sheet-scale-wrapper w-full" ref={containerRef}>
      {/* Zoom / Scale Indicator & Mode Toggle */}
      <div className="sheet-scale-controls no-print flex items-center justify-between mb-2.5 px-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {isScaled
              ? `Auto-Fit Active (${Math.round(scale * 100)}% Scale)`
              : '100% Full Width (Original)'}
          </span>
          {isScaled && (
            <span className="hidden sm:inline text-slate-500 dark:text-slate-400 text-xs">
              Entire 24-hour sheet auto-scaled to fit display without edge clipping
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFitMode(!isFitMode)}
            className={`px-3 py-1 rounded-md text-xs font-semibold border transition-all ${
              isFitMode
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm hover:bg-emerald-700'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle between Auto-Fit to Screen and 100% Scrollable view"
          >
            {isFitMode ? '✓ Auto-Fit to Screen' : 'Fit to Screen'}
          </button>
        </div>
      </div>

      {/* Sheet Stage Container with Scale Height Reservation */}
      <div
        className="sheet-scroll-container"
        style={{
          width: '100%',
          overflowX: isScaled ? 'hidden' : 'auto',
          minHeight: isScaled && contentHeight > 0 ? `${Math.ceil(contentHeight * scale) + 12}px` : undefined,
          position: 'relative',
          paddingBottom: isScaled ? '12px' : '24px'
        }}
      >
        <div
          style={
            isScaled
              ? {
                  width: `${Math.ceil(1120 * scale)}px`,
                  height: `${Math.ceil(contentHeight * scale)}px`,
                  margin: '0 auto',
                  position: 'relative'
                }
              : {
                  width: '100%',
                  minWidth: '1100px',
                  margin: '0 auto'
                }
          }
        >
          <div
            style={
              isScaled
                ? {
                    width: '1120px',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    transition: 'transform 0.15s ease-out'
                  }
                : {
                    width: '100%'
                  }
            }
          >
            <div ref={contentRef} className="sheet-content-host w-full">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
