import React, { useState } from 'react';
import { useWindowManagerActions, useWindowManagerState, PanelRegistry, type PanelTitle } from '../src/index';

export const PanelManagerForm: React.FC = () => {
  const state = useWindowManagerState();
  const { openPanel, closePanel, minimizePanel, restorePanel, bringToFront } = useWindowManagerActions();
  const [search, setSearch] = useState('');

  const registeredIds = PanelRegistry.getRegisteredIds();

  // Combine registered components and dynamically opened panels
  const allPanelItems = registeredIds.map(id => {
    const registryEntry = PanelRegistry.get(id);
    const activeInstance = Object.values(state.panels).find(p => p.component === id);
    return {
      componentId: id,
      title: registryEntry?.defaultOptions?.title || activeInstance?.title || id,
      instance: activeInstance,
    };
  });

  const getTitleString = (title: PanelTitle | undefined): string => {
    if (!title) return '';
    if (typeof title === 'string') return title;
    return title.defaultMessage || title.id || '';
  };

  const filtered = allPanelItems.filter(item => {
    const titleStr = getTitleString(item.title);
    const compIdStr = typeof item.componentId === 'string' ? item.componentId : '';
    return titleStr.toLowerCase().includes(search.toLowerCase()) ||
           compIdStr.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="w-100 h-100 p-3 bg-transparent text-white d-flex flex-column text-start" style={{ overflow: 'auto' }}>
      <div className="border-bottom border-secondary pb-2 mb-3 d-flex justify-content-between align-items-center">
        <h5 className="mb-0 text-info fw-bold">Panel & Window Manager</h5>
        <span className="badge bg-secondary font-monospace" style={{ fontSize: '0.75rem' }}>
          {registeredIds.length} Registered | {Object.keys(state.panels).length} Active
        </span>
      </div>

      <div className="mb-3">
        <input 
          type="text" 
          placeholder="Search registered windows and forms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-control bg-black text-white border-secondary font-monospace"
          style={{ fontSize: '0.85rem' }}
        />
      </div>

      <div className="flex-grow-1 overflow-auto d-flex flex-column gap-2 pe-1">
        {filtered.map(item => {
          const isOpened = !!item.instance;
          const isMinimized = item.instance?.state === 'minimized';
          const registryEntry = PanelRegistry.get(item.componentId);
          const options = registryEntry?.defaultOptions;

          return (
            <div 
              key={item.componentId} 
              className="p-2 bg-black bg-opacity-40 border border-secondary rounded d-flex justify-content-between align-items-center hover-bg"
              style={{ transition: 'background-color 0.2s' }}
            >
              <div 
                className="flex-grow-1"
                onClick={() => {
                  if (isOpened) {
                    if (isMinimized) {
                      restorePanel(item.instance!.id);
                    }
                    bringToFront(item.instance!.id);
                  }
                }}
                style={{ cursor: isOpened ? 'pointer' : 'default' }}
              >
                <div className="fw-semibold text-white-50 font-monospace" style={{ fontSize: '0.85rem' }}>
                  {getTitleString(item.title)}
                </div>
                <div className="text-muted font-monospace" style={{ fontSize: '0.7rem' }}>
                  ID: {item.componentId} {isOpened && <span className="text-info">• {item.instance?.state}</span>}
                </div>
              </div>

              <div className="d-flex align-items-center gap-2">
                {isOpened ? (
                  <>
                    {isMinimized ? (
                      <button 
                        type="button" 
                        onClick={() => restorePanel(item.instance!.id)}
                        className="btn btn-sm btn-outline-success font-monospace py-0 px-2"
                        style={{ fontSize: '0.7rem' }}
                      >
                        Restore
                      </button>
                    ) : (
                      options?.canMinimize !== false && (
                        <button 
                          type="button" 
                          onClick={() => minimizePanel(item.instance!.id)}
                          className="btn btn-sm btn-outline-warning font-monospace py-0 px-2"
                          style={{ fontSize: '0.7rem' }}
                        >
                          Minimize
                        </button>
                      )
                    )}
                    {options?.canClose !== false && (
                      <button 
                        type="button" 
                        onClick={() => closePanel(item.instance!.id)}
                        className="btn btn-sm btn-outline-danger font-monospace py-0 px-2"
                        style={{ fontSize: '0.7rem' }}
                      >
                        Close
                      </button>
                    )}
                  </>
                ) : (
                  <button 
                    type="button" 
                    onClick={() => openPanel(item.componentId, item.componentId)}
                    className="btn btn-sm btn-outline-info font-monospace py-0 px-2"
                    style={{ fontSize: '0.7rem' }}
                  >
                    Launch
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center text-muted font-monospace py-4">
            No matching panels found
          </div>
        )}
      </div>
    </div>
  );
};

export default PanelManagerForm;
