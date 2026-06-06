import React from 'react';

interface SidebarContentProps {
  activeTab: string | null;
  onClose: () => void;
  openPanels?: { id: string; title: string; isActive: boolean; isFloating: boolean; isMaximized: boolean; component: string }[];
  minimizedList?: { id: string; title: string; component: string; floating?: boolean }[];
  onClosePanel: (id: string) => void;
  onMinimizePanel: (id: string) => void;
  onMaximizePanel: (id: string) => void;
  onBringToFrontPanel: (id: string) => void;
  onRestorePanel: (panel: any) => void;
}

export const SidebarContent: React.FC<SidebarContentProps> = ({
  activeTab,
  onClose,
  openPanels = [],
  minimizedList = [],
  onClosePanel,
  onMinimizePanel,
  onMaximizePanel,
  onBringToFrontPanel,
  onRestorePanel
}) => {
  if (!activeTab) return null;

  const getTabTitle = (tabId: string) => {
    switch (tabId) {
      case 'search': return 'Search Results';
      case 'edit_measure': return 'Edit & Measure';
      case 'windows': return 'Windows Manager';
      case 'settings': return 'Settings';
      default: return tabId;
    }
  };

  return (
    <div 
      className="h-100 bg-body-secondary border-start border-secondary-subtle d-flex flex-column"
      style={{ width: '220px', overflow: 'hidden' }}
    >
      <div className="d-flex align-items-center justify-content-between border-bottom border-secondary-subtle px-3 py-2 bg-body-tertiary">
        <span className="fw-semibold text-uppercase font-monospace small tracking-wider text-white">
          {getTabTitle(activeTab)}
        </span>
        <button 
          type="button" 
          onClick={onClose}
          className="btn btn-link p-0 text-secondary hover-text-white d-flex align-items-center"
          style={{ textDecoration: 'none' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div className="flex-grow-1 overflow-auto">
        {/* Search Results Panel */}
        <div style={{ display: activeTab === 'search' ? 'block' : 'none' }} className="p-3">
          <h6 className="text-uppercase font-monospace text-secondary mb-3" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>
            Search Results
          </h6>
          <div className="d-flex flex-column gap-3 text-start small">
            <div className="position-relative">
              <input 
                type="text" 
                className="form-control form-control-sm bg-dark border-secondary text-white pe-4" 
                placeholder="Search workspace..." 
                defaultValue="Workspace"
              />
              <span className="position-absolute end-0 top-50 translate-middle-y me-2 text-secondary">🔍</span>
            </div>
            <div className="text-secondary mb-1">3 matches found:</div>
            <div className="p-2 bg-dark-subtle rounded border border-secondary-subtle hover-bg cursor-pointer">
              <div className="fw-semibold text-info">Workspace.tsx</div>
              <div className="text-muted text-truncate" style={{ fontSize: '0.75rem' }}>Line 18: const DockableWorkspace...</div>
            </div>
            <div className="p-2 bg-dark-subtle rounded border border-secondary-subtle hover-bg cursor-pointer">
              <div className="fw-semibold text-info">App.tsx</div>
              <div className="text-muted text-truncate" style={{ fontSize: '0.75rem' }}>Line 213: &lt;Workspace onApiReady...</div>
            </div>
            <div className="p-2 bg-dark-subtle rounded border border-secondary-subtle hover-bg cursor-pointer">
              <div className="fw-semibold text-info">index.css</div>
              <div className="text-muted text-truncate" style={{ fontSize: '0.75rem' }}>Line 40: .workspace-grid &#123;</div>
            </div>
          </div>
        </div>

        {/* Edit & Measure Panel */}
        <div style={{ display: activeTab === 'edit_measure' ? 'block' : 'none' }} className="p-3">
          <h6 className="text-uppercase font-monospace text-secondary mb-3" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>
            Edit & Measure
          </h6>
          <div className="small text-white-50 text-start d-flex flex-column gap-3">
            <div>
              <label className="form-label d-block mb-1 text-white small">Measurement Mode</label>
              <select className="form-select form-select-sm bg-dark border-secondary text-white">
                <option>Ruler (Distance)</option>
                <option>Protractor (Angle)</option>
                <option>Area Calculator</option>
              </select>
            </div>
            <div>
              <label className="form-label d-block mb-1 text-white small">Edit Brush Size</label>
              <div className="d-flex align-items-center gap-2">
                <input type="range" className="form-range" min="1" max="50" defaultValue="15" />
                <span className="text-white font-monospace">15px</span>
              </div>
            </div>
            <div className="d-flex flex-column gap-2 mt-2">
              <button type="button" className="btn btn-sm btn-outline-light w-100">Clear Measure Guides</button>
              <button type="button" className="btn btn-sm btn-primary w-100">Apply Edits</button>
            </div>
          </div>
        </div>

        {/* Windows Manager Panel */}
        <div style={{ display: activeTab === 'windows' ? 'block' : 'none' }} className="p-3 text-start">
          <h6 className="text-uppercase font-monospace text-secondary mb-3" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>
            Open Windows ({openPanels.length})
          </h6>
          
          {openPanels.length === 0 ? (
            <div className="text-muted small mb-4 italic">No active windows</div>
          ) : (
            <div className="d-flex flex-column gap-2 mb-4">
              {openPanels.map((panel) => (
                <div 
                  key={panel.id} 
                  className="p-2 rounded border"
                  style={{
                    borderColor: panel.isActive ? 'rgba(170, 59, 255, 0.5)' : 'rgba(255, 255, 255, 0.08)',
                    backgroundColor: panel.isActive ? 'rgba(170, 59, 255, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className={`text-truncate fw-semibold small ${panel.isActive ? 'text-info' : 'text-white-50'}`} style={{ maxWidth: '120px' }}>
                      {panel.title}
                    </span>
                    <span className="badge bg-secondary-subtle text-white-50" style={{ fontSize: '0.65rem' }}>
                      {panel.isFloating ? 'Float' : 'Grid'}
                    </span>
                  </div>
                  
                  <div className="d-flex align-items-center justify-content-between border-top border-secondary-subtle pt-1 mt-1">
                    <button 
                      type="button" 
                      className="btn btn-xs btn-outline-info py-0 px-2 font-monospace" 
                      style={{ fontSize: '0.65rem', minWidth: '46px' }}
                      onClick={() => onBringToFrontPanel(panel.id)}
                    >
                      Front
                    </button>
                    <div className="d-flex gap-2">
                      <button 
                        type="button" 
                        className="btn btn-link text-white-50 p-0 text-decoration-none" 
                        title="Minimize" 
                        onClick={() => onMinimizePanel(panel.id)}
                        style={{ fontSize: '0.85rem' }}
                      >
                        _
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-link text-white-50 p-0 text-decoration-none" 
                        title="Maximize" 
                        onClick={() => onMaximizePanel(panel.id)}
                        style={{ fontSize: '0.8rem' }}
                      >
                        {panel.isMaximized ? '🗗' : '🗖'}
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-link text-danger p-0 text-decoration-none fw-bold" 
                        title="Close" 
                        onClick={() => onClosePanel(panel.id)}
                        style={{ fontSize: '0.8rem' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h6 className="text-uppercase font-monospace text-secondary mb-3" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>
            Minimized ({minimizedList.length})
          </h6>

          {minimizedList.length === 0 ? (
            <div className="text-muted small italic">No minimized windows</div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {minimizedList.map((panel) => (
                <div 
                  key={panel.id} 
                  className="p-2 rounded border border-secondary-subtle bg-black opacity-75"
                >
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className="text-truncate text-white-50 small" style={{ maxWidth: '125px' }}>
                      {panel.title}
                    </span>
                    <span className="badge bg-dark-subtle text-muted" style={{ fontSize: '0.65rem' }}>Min</span>
                  </div>

                  <div className="d-flex align-items-center justify-content-between border-top border-secondary-subtle pt-1 mt-1">
                    <button 
                      type="button" 
                      className="btn btn-xs btn-outline-success py-0 px-2 font-monospace" 
                      style={{ fontSize: '0.65rem', minWidth: '55px' }}
                      onClick={() => onRestorePanel(panel)}
                    >
                      Restore
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-link text-danger p-0 text-decoration-none fw-bold" 
                      title="Close" 
                      onClick={() => onClosePanel(panel.id)}
                      style={{ fontSize: '0.8rem' }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings Panel */}
        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }} className="p-3">
          <h6 className="text-uppercase font-monospace text-secondary mb-3" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>
            Settings
          </h6>
          <div className="small text-white-50 text-start d-flex flex-column gap-3">
            <div>
              <label className="form-label d-block mb-1 text-white">Window Opacity</label>
              <input type="range" className="form-range" defaultValue="85" />
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="gridSwitch" defaultChecked />
              <label className="form-check-input-label text-white ms-1" htmlFor="gridSwitch">Show Grid Pattern</label>
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="animationSwitch" defaultChecked />
              <label className="form-check-input-label text-white ms-1" htmlFor="animationSwitch">Enable Animations</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
