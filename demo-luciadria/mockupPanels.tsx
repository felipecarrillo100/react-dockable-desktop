import React, {useEffect, useRef, useState} from 'react';
import {PanelRegistry, useFormContainer, useWindowManagerActions} from '../src/index';
import PanelManagerForm from './PanelManagerForm';
import {getReference} from '@luciad/ria/reference/ReferenceProvider.js';
import {RIAMap} from '@luciad/ria/view/RIAMap.js';
import {throttle} from "./utils/throttle.ts";
import type {GestureEvent} from "@luciad/ria/view/input/GestureEvent";

// ==========================================
// 1. Panel Mockup Components
// ==========================================

export const CodeEditor: React.FC = () => (
  <div className="w-100 h-100 p-3 bg-transparent font-monospace text-start" style={{ color: '#abb2bf', overflow: 'auto' }}>
    <div className="text-secondary small mb-2">// Custom Workspace Editor</div>
    <div><span className="text-warning">import</span> React <span className="text-warning">from</span> <span className="text-success">'react'</span>;</div>
    <div><span className="text-warning">import</span> &#123; WindowManager &#125; <span className="text-warning">from</span> <span className="text-success">'dockable-windows'</span>;</div>
    <br />
    <div><span className="text-primary">const</span> <span className="text-info">AppLayout</span> = () =&gt; &#123;</div>
    <div className="ps-3"><span className="text-warning">return</span> (</div>
    <div className="ps-4 text-white-50">&lt;<span className="text-danger">WindowManager</span> /&gt;</div>
    <div className="ps-3">);</div>
    <div>&#125;;</div>
  </div>
);

export const TerminalConsole: React.FC = () => (
  <div className="w-100 h-100 p-3 font-monospace text-start" style={{ backgroundColor: 'var(--panel-card-bg)', color: 'var(--panel-text)', overflow: 'auto' }}>
    <div style={{ color: 'var(--panel-title-color)' }}>[system] Custom Window Manager registered.</div>
    <div style={{ color: 'var(--panel-title-color)' }}>[system] Drag split lines or float tabs by right clicking.</div>
    <div>[info] Floating windows cascade algorithms ready.</div>
    <div className="mt-2" style={{ fontWeight: 'bold' }}>$ npm run dev</div>
    <div style={{ opacity: 0.7 }}>  VITE v8.0.12  ready in 200 ms</div>
  </div>
);

export const PreviewOutput: React.FC = () => {
  const [count, setCount] = useState(0);
  return (
    <div className="w-100 h-100 p-3 bg-transparent text-start d-flex flex-column justify-content-between" style={{ color: 'var(--panel-text)', overflow: 'auto' }}>
      <div>
        <div className="d-flex align-items-center justify-content-between border-bottom pb-2 mb-3" style={{ borderColor: 'var(--panel-card-border)' }}>
          <h6 className="mb-0 font-monospace" style={{ fontSize: '0.8rem', color: 'var(--panel-title-color)' }}>live-preview-window</h6>
        </div>
        <div className="p-3 rounded mb-3" style={{ backgroundColor: 'var(--panel-card-bg)', border: '1px solid var(--panel-card-border)' }}>
          <h6 className="mb-2" style={{ fontSize: '0.9rem', color: 'var(--panel-text)' }}>UI Sandbox Widget</h6>
          <div className="d-flex align-items-center gap-2 mt-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary font-monospace px-3"
              style={{ fontSize: '0.75rem' }}
              onClick={() => setCount(prev => prev + 1)}
            >
              Clicks: {count}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const HelpCenter: React.FC = () => (
  <div className="w-100 h-100 p-4 bg-transparent text-start" style={{ color: 'var(--panel-text)', opacity: 0.85, overflow: 'auto' }}>
    <h5 className="border-bottom pb-2 mb-3" style={{ color: 'var(--panel-text)', borderColor: 'var(--panel-card-border)' }}>Workspace Guide</h5>
    <ul className="small d-flex flex-column gap-2 ps-3">
      <li><strong>Float Tabs:</strong> Click the "▢" in a tab header or right-click to float a docked tab.</li>
      <li><strong>Minimize:</strong> Minimize panels to see them slide into the macOS taskbar at the bottom.</li>
      <li><strong>Save & Restore:</strong> Save your customized layout to JSON and restore it instantly.</li>
    </ul>
  </div>
);

export const LayerTree: React.FC = () => (
  <div className="w-100 h-100 p-3 bg-transparent text-start" style={{ color: 'var(--panel-text)', overflow: 'auto' }}>
    <h6 className="border-bottom pb-2" style={{ color: 'var(--panel-title-color)', borderColor: 'var(--panel-card-border)' }}>Layer Catalog Explorer</h6>
    <div className="d-flex flex-column gap-2 mt-3">
      {['World Imagery (XYZ)', 'Terrain Grid (EPSG:4978)', 'Weather Overlay (WMS)', 'City Vector Model'].map((l, i) => (
        <div key={l} className="d-flex align-items-center justify-content-between p-2 rounded" style={{ backgroundColor: 'var(--panel-card-bg)', border: '1px solid var(--panel-card-border)' }}>
          <span className="font-monospace small" style={{ color: 'var(--panel-text)' }}>{l}</span>
          <div className="form-check form-switch m-0">
            <input className="form-check-input" type="checkbox" defaultChecked={i < 2} role="switch" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const TimeControl: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(50);
  return (
    <div className="w-100 h-100 p-3 bg-transparent text-start d-flex align-items-center gap-3" style={{ color: 'var(--panel-text)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setIsPlaying(!isPlaying)}
        className="btn btn-outline-primary btn-sm font-monospace px-3"
      >
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>
      <div className="flex-grow-1">
        <input
          type="range"
          value={time}
          onChange={(e) => setTime(Number(e.target.value))}
          className="form-range"
        />
      </div>
      <span className="font-monospace small" style={{ minWidth: '100px', color: 'var(--panel-title-color)' }}>
        Frame: {time} / 100
      </span>
    </div>
  );
};

export const OverviewMap: React.FC = () => (
  <div className="w-100 h-100 bg-secondary d-flex align-items-center justify-content-center border border-dark">
    <div className="text-white font-monospace text-center">
      <div className="small text-white-50">Overview Locator</div>
      <div className="h6 text-info">2D Map Outline</div>
    </div>
  </div>
);

export const TablePanel: React.FC = () => (
  <div className="w-100 h-100 p-2 bg-transparent text-start" style={{ color: 'var(--panel-text)', overflow: 'auto' }}>
    <table className="table table-sm table-striped font-monospace" style={{ fontSize: '0.75rem', color: 'var(--panel-text)' }}>
      <thead>
        <tr>
          <th>ID</th>
          <th>Feature</th>
          <th>Reference</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>01</td><td>Luciad 3D Earth</td><td>EPSG:4978</td><td>Active</td></tr>
        <tr><td>02</td><td>Layer Catalog</td><td>Properties</td><td>Ready</td></tr>
        <tr><td>03</td><td>Timeline control</td><td>Epoch Sync</td><td>Idle</td></tr>
      </tbody>
    </table>
  </div>
);

export const ToolPanel: React.FC = () => (
  <div className="w-100 h-100 p-3 bg-transparent text-start" style={{ color: 'var(--panel-text)', overflow: 'auto' }}>
    <h6 className="border-bottom pb-2" style={{ color: 'var(--panel-title-color)', borderColor: 'var(--panel-card-border)' }}>Operations Toolbox</h6>
    <div className="d-flex flex-wrap gap-2 mt-3">
      <button type="button" className="btn btn-sm btn-outline-primary font-monospace">Measure Line</button>
      <button type="button" className="btn btn-sm btn-outline-success font-monospace">Point Buffer</button>
      <button type="button" className="btn btn-sm btn-outline-info font-monospace">Export KML</button>
    </div>
  </div>
);

export const LuciadMapPanel: React.FC<{ panelId: string }> = ({panelId}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<RIAMap | null>(null);
  const contract = useFormContainer();
  const { setActivePanel } = useWindowManagerActions();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

      // 1. Get the form container contract

    try {
      // Create the map on the HTML DOM element in EPSG:4978
      mapRef.current = new RIAMap(container, {
          reference: getReference('EPSG:4978'),
      });

      if (mapRef.current) {
          mapRef.current.onClick = () => {
              setActivePanel(panelId);
              return false;
          }
      }

        // 2. Subscribe to the window resize emitter instead of local ResizeObserver
        const unsubscribeResize = contract.onResize?.(throttle((_width, _height) => {
            if (mapRef.current) {
                // You receive the width & height directly!
                mapRef.current.resize();
                console.log("I was resized!")
            }
        }, 200, {
            leading: true,   // Execute immediately on the first event
            trailing: true   // Execute one last time after the user stops resizing
        }));

        const unsubscribeMinimize = contract.onMinimize?.(()=>{
            mapRef.current?.invalidate();
        });

      // const resizeObserver = new ResizeObserver(() => {
      //   if (mapRef.current) {
      //     mapRef.current.resize();
      //   }
      // });
     // resizeObserver.observe(container);

      return () => {
       // resizeObserver.disconnect();
          unsubscribeMinimize?.();
          unsubscribeResize?.();
          if (mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
        }
      };
    } catch (e) {
      console.error("Failed to initialize LuciadRIA Map in EPSG:4978:", e);
    }
  }, []);

  return (
    <div className="position-relative" style={{ overflow: 'hidden' ,width: '100%', height: "100%", backgroundColor: "orange"  }}>
      <div ref={containerRef} className="map-mini" style={{ width: '100%', height: "100%" , backgroundColor: "pink" }} />
      <div className="position-absolute top-0 start-0 rounded bg-black bg-opacity-75 text-info font-monospace small" style={{ width:"100%", zIndex: 10, pointerEvents: 'none' }}>
        LuciadRIA 3D Earth (EPSG:4978)
      </div>
    </div>
  );
};

export const MainMap: React.FC<{ panelId: string }> = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<RIAMap | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      const map = new RIAMap(container, {
        reference: getReference('EPSG:4978'),
      });
      mapRef.current = map;

      const resizeObserver = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        if (mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
        }
      };
    } catch (e) {
      console.error("Failed to initialize MainMap in EPSG:4978:", e);
    }
  }, []);

  return (
    <div className="w-100 h-100 position-relative bg-dark" style={{ overflow: 'hidden' }}>
      <div ref={containerRef} style={{width: "100%", height: "100%"}} className="mini-me"  />
      <div className="position-absolute top-0 start-0 m-2 p-1 px-2 rounded bg-black bg-opacity-75 text-success font-monospace small" style={{ zIndex: 1, pointerEvents: 'none' }}>
        🗺️ Main Global Map View (EPSG:4978) [Locked Layout]
      </div>
    </div>
  );
};

// ==========================================
// 2. Close Interception & Dirty State Test Panels
// ==========================================

export const DirtyFormDemoPanel: React.FC = () => {
  const container = useFormContainer();
  const [dirty, setDirtyState] = useState(false);
  const [customGuard, setCustomGuard] = useState(false);
  const [titleInput, setTitleInput] = useState('');

  const toggleDirty = () => {
    const next = !dirty;
    setDirtyState(next);
    container.setDirty(next);
  };

  useEffect(() => {
    if (customGuard) {
      // Register custom guard that blocks closure completely
      const cleanup = container.onCloseRequested(() => {
        alert("Close guard triggered: closing is BLOCKED because the lock switch is ON!");
        return false;
      });
      return cleanup;
    }
  }, [customGuard, container]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitleInput(e.target.value);
    container.setTitle(e.target.value || 'Intercept Form');
  };

  return (
    <div className="w-100 h-100 p-3 bg-transparent text-white text-start" style={{ overflow: 'auto' }}>
      <h6 className="border-bottom border-secondary pb-2 text-info">Dirty State & Close Interception Form</h6>
      <div className="d-flex flex-column gap-3 mt-3">
        <div className="p-3 bg-black bg-opacity-30 rounded border border-secondary">
          <label className="form-label small text-info">1. Try Marking Dirty State</label>
          <div className="d-flex align-items-center justify-content-between">
            <span className="small text-secondary">Is Form Dirty (Unsaved Changes)?</span>
            <button
              type="button"
              className={`btn btn-sm ${dirty ? 'btn-danger' : 'btn-outline-secondary'}`}
              onClick={toggleDirty}
            >
              {dirty ? '🔴 Unsaved (Dirty)' : '🟢 Clean'}
            </button>
          </div>
          <div className="small text-muted mt-2">
            When dirty, attempting to close this tab/window shows a warning modal asking to Discard or Cancel.
          </div>
        </div>

        <div className="p-3 bg-black bg-opacity-30 rounded border border-secondary">
          <label className="form-label small text-info">2. Try Blocking Close (Custom Guard)</label>
          <div className="form-check form-switch d-flex justify-content-between align-items-center p-0">
            <span className="small text-secondary">Lock Close Preventer:</span>
            <input
              className="form-check-input ms-0"
              type="checkbox"
              role="switch"
              checked={customGuard}
              onChange={(e) => setCustomGuard(e.target.checked)}
            />
          </div>
          <div className="small text-muted mt-2">
            When locked, custom logic blocks the panel from closing entirely (onCloseRequested returns false).
          </div>
        </div>

        <div className="p-3 bg-black bg-opacity-30 rounded border border-secondary">
          <label className="form-label small text-info">3. Try Dynamic Title Update</label>
          <input
            type="text"
            className="form-control form-control-sm bg-dark text-white border-secondary"
            placeholder="Type new panel title..."
            value={titleInput}
            onChange={handleTitleChange}
          />
        </div>

        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-danger flex-grow-1"
            onClick={() => container.requestClose()}
          >
            Close Programmatically
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => container.requestClose({ force: true })}
            title="Bypasses all dirty checks and guards"
          >
            Force Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const DirtyEditorDemoPanel: React.FC = () => {
  const container = useFormContainer();
  const [content, setContent] = useState('// Type something here, changes make the tab dirty.\n// Click Save to clear the dirty state.');
  const [isDirty, setIsDirty] = useState(false);

  const handleEdit = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    if (!isDirty) {
      setIsDirty(true);
      container.setDirty(true);
    }
  };

  const handleSave = () => {
    setIsDirty(false);
    container.setDirty(false);
    alert('Changes saved successfully!');
  };

  return (
    <div className="w-100 h-100 p-3 bg-transparent text-white text-start d-flex flex-column gap-2" style={{ overflow: 'hidden' }}>
      <div className="d-flex align-items-center justify-content-between border-bottom border-secondary pb-2">
        <h6 className="mb-0 text-info">Dirty Code Editor</h6>
        <button
          type="button"
          className={`btn btn-sm ${isDirty ? 'btn-warning' : 'btn-outline-success'}`}
          onClick={handleSave}
          disabled={!isDirty}
        >
          {isDirty ? '💾 Save Changes' : '✅ Saved'}
        </button>
      </div>
      <textarea
        className="form-control bg-black text-info font-monospace flex-grow-1 border-secondary p-3 mt-1"
        style={{ resize: 'none', fontSize: '0.85rem', height: 'calc(100% - 40px)' }}
        value={content}
        onChange={handleEdit}
      />
    </div>
  );
};

// Register all panels
export function registerDemoPanels() {
  PanelRegistry.register('mainMap', MainMap, {
    title: 'Main Map',
    initialTarget: 'docked',
    canClose: false,
    canMinimize: false,
    canDrag: false
  });
  PanelRegistry.register('editor', CodeEditor, { title: 'Code Editor', initialTarget: 'docked' });
  PanelRegistry.register('terminal', TerminalConsole, { title: 'Console Output', initialTarget: 'docked' });
  PanelRegistry.register('preview', PreviewOutput, { title: 'Sandbox Widget', initialTarget: 'floating' });
  PanelRegistry.register('help', HelpCenter, { title: 'Workspace Help', initialTarget: 'docked' });
  PanelRegistry.register('luciadMap', LuciadMapPanel, { title: 'LuciadRIA Earth 3D', initialTarget: 'docked' });
  PanelRegistry.register('layertree', LayerTree, { title: 'Layer tree', initialTarget: 'floating', favoritePosition: { x: 1000, y: 100, width: 300, height: 400 } });
  PanelRegistry.register('timecontrol', TimeControl, {
    title: 'Time Control bar',
    initialTarget: 'floating',
    favoritePosition: {
      x: '10px',
      y: 'calc(100% - 130px)',
      width: 'calc(100% - 20px)',
      height: '100px'
    }
  });
  PanelRegistry.register('overviewmap', OverviewMap, { title: 'Overview locator', initialTarget: 'floating', favoritePosition: { x: 80, y: 500, width: 220, height: 180 } });
  PanelRegistry.register('table', TablePanel, { title: 'Attribute Table', initialTarget: 'docked' });
  PanelRegistry.register('toolpanels', ToolPanel, { title: 'Toolbox Panel', initialTarget: 'docked' });
  PanelRegistry.register('panelmanager', PanelManagerForm, { title: 'Panel Registry Form', initialTarget: 'floating', favoritePosition: { x: 400, y: 150, width: 500, height: 420 } });
  PanelRegistry.register('dirtyForm', DirtyFormDemoPanel, { title: 'Intercept Form', initialTarget: 'floating', favoritePosition: { x: 350, y: 150, width: 450, height: 420 } });
  PanelRegistry.register('dirtyEditor', DirtyEditorDemoPanel, { title: 'Intercept Editor', initialTarget: 'docked' });
}
