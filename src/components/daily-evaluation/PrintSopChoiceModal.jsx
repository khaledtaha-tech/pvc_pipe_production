import { useEffect } from 'react';

/**
 * Morning Blank SOP (DOC-Ext.-03) Print Mode Selection Modal
 * Provides two primary workflows:
 * Option A: Universal Blank Sheet (Single Template with writing lines for manual pen entry)
 * Option B: Configured Machine Lines (Current Batch Mode with machine specs & historical speeds)
 */
export default function PrintSopChoiceModal({
  isOpen,
  onClose,
  onSelectUniversalBlankPrint,
  onSelectUniversalBlankPdf,
  onSelectConfiguredBatch,
  isGenerating = false
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isGenerating, onClose]);

  if (!isOpen) return null;

  return (
    <div className="export-modal-backdrop no-print" onClick={!isGenerating ? onClose : undefined}>
      <div
        className="export-modal-dialog print-sop-choice-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-sop-choice-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="export-modal-header">
          <div>
            <div className="print-sop-title-wrap">
              <span className="print-sop-badge-sop">DOC-Ext.-03</span>
              <h3 id="print-sop-choice-title" className="export-modal-title">
                Morning SOP Print Workflow
              </h3>
            </div>
            <p className="export-modal-subtitle">
              Select your print scenario for shift follow-up sheets (A4 Portrait, 5mm margins).
            </p>
          </div>
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            disabled={isGenerating}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        {/* Option Selection Cards */}
        <div className="print-sop-choice-container">
          {/* Option A Card */}
          <div className="print-sop-choice-card option-universal">
            <div className="print-sop-choice-badge-row">
              <span className="print-sop-choice-badge tag-universal">Option A</span>
              <span className="print-sop-choice-pages">1 Clean Page</span>
            </div>
            <h4 className="print-sop-choice-card-title">Universal Blank Sheet</h4>
            <p className="print-sop-choice-card-desc">
              Generates a single empty template for manual handwritten pen entry by shift supervisors.
            </p>
            <ul className="print-sop-choice-features">
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="check-icon">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Blank Line No. & Date with underline writing fields
              </li>
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="check-icon">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Blank Product Code, Specs & Reference Speeds
              </li>
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="check-icon">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Empty Standard Production (Pcs) column for custom targets
              </li>
            </ul>
            <div className="print-sop-choice-actions">
              <button
                type="button"
                className="btn btn-primary btn-choice-action"
                onClick={onSelectUniversalBlankPrint}
                disabled={isGenerating}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print Universal Blank (1 Page)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-choice-action-sub"
                onClick={onSelectUniversalBlankPdf}
                disabled={isGenerating}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 5 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="12" y2="18" />
                  <line x1="15" y1="15" x2="12" y2="18" />
                </svg>
                Download PDF
              </button>
            </div>
          </div>

          {/* Option B Card */}
          <div className="print-sop-choice-card option-configured">
            <div className="print-sop-choice-badge-row">
              <span className="print-sop-choice-badge tag-configured">Option B</span>
              <span className="print-sop-choice-pages">Multi-Line Batch</span>
            </div>
            <h4 className="print-sop-choice-card-title">Configured Machine Lines</h4>
            <p className="print-sop-choice-card-desc">
              Pre-populate nominal speeds, specifications, and calculated standard pieces for selected machines.
            </p>
            <ul className="print-sop-choice-features">
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="check-icon">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Select Current Line or All Operating Lines
              </li>
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="check-icon">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Auto-inherits latest logged operational run specs
              </li>
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="check-icon">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Auto-calculates standard pieces/hour based on speed & length
              </li>
            </ul>
            <div className="print-sop-choice-actions">
              <button
                type="button"
                className="btn btn-outline btn-choice-action btn-choice-accent"
                onClick={onSelectConfiguredBatch}
                disabled={isGenerating}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Configure Machine Lines &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="export-modal-footer print-sop-choice-footer">
          <span className="print-sop-choice-note">
            Formatted strictly for A4 Portrait with 5mm margins.
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={isGenerating}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
