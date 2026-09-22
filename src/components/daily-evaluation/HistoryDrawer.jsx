import { useMemo } from 'react';
import { machineLabel } from '../../config/machines.js';

export default function HistoryDrawer({ items, currentId, onClose, onLoad, onDelete, isLoading }) {
  const sorted = useMemo(() => {
    return [...(items || [])].sort((a, b) => {
      const timeA = a.updatedAt || a.createdAt || (a.timestamp ? a.timestamp : 0);
      const timeB = b.updatedAt || b.createdAt || (b.timestamp ? b.timestamp : 0);
      return timeB - timeA;
    });
  }, [items]);

  return (
    <div className="drawer-backdrop no-print" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3>Saved Daily Reports</h3>
            {isLoading ? <span className="chip chip-cloud chip-sm">Syncing...</span> : null}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer-body">
          {sorted.length === 0 ? (
            <div className="empty-note">
              {isLoading ? 'Connecting to database...' : 'No saved reports yet. Generate a log and press Save to History.'}
            </div>
          ) : (
            sorted.map((r) => {
              const active = r.id === currentId || (r.client_id && r.client_id === currentId);
              const headerLine = r.header?.lineId;
              const line = headerLine === '__CUSTOM__'
                ? r.header?.lineCustom || 'Custom Line'
                : machineLabel(headerLine || r.line_machine);

              const outputPcs = (r.slots && r.slots.length > 0)
                ? r.slots.reduce((a, s) => a + (Number(s.actual) || 0), 0).toLocaleString() + ' Pcs'
                : (r.total_output_pcs != null
                    ? Number(r.total_output_pcs).toLocaleString() + ' Pcs'
                    : (r.summaryPcs != null ? Number(r.summaryPcs).toLocaleString() + ' Pcs' : 'Draft'));

              const dateStr = r.header?.date || r.report_date || 'No date';
              const timeVal = r.updatedAt || r.createdAt || r.timestamp || Date.now();

              return (
                <div className={'hist-item' + (active ? ' active' : '')} key={r.id || r.client_id}>
                  <div className="hist-main" onClick={() => onLoad(r)}>
                    <div className="hist-title">
                      {dateStr} - {line}
                    </div>
                    <div className="hist-meta" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      <span>Saved {new Date(timeVal).toLocaleString()} &middot; {outputPcs}</span>
                      {r.oee_pct != null ? <span>&middot; OEE: {Number(r.oee_pct).toFixed(1)}%</span> : null}
                      {active ? <span className="chip chip-hl chip-sm">Current</span> : null}
                      {r.isSynced ? <span className="chip chip-synced chip-sm">MySQL Synced</span> : null}
                      {r.isRemote ? (
                        <span className="chip chip-cloud chip-sm">Central DB</span>
                      ) : (
                        !r.isSynced ? <span className="chip chip-local chip-sm">Local</span> : null
                      )}
                    </div>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (window.confirm('Delete this saved report?')) onDelete(r.id, r.isRemote);
                    }}
                  >
                    Delete
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
