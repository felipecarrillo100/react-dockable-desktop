import React, { useState, useRef, useEffect } from 'react';
import {
  PanelRegistry,
  useFormContainer,
  usePanelContext,
  useWindowManagerState,
  useWindowManagerActions,
  usePanelActions,
  ConfirmationForm,
} from '../src/index';
import PanelManagerForm from './PanelManagerForm';
import Editor from '@monaco-editor/react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default marker icon paths in Vite builds
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ==========================================
// 0. API Code Snippets for Live Inspection
// ==========================================

const CODE_SNIPPETS: Record<string, string> = {
  editor: `// Code Editor Component Registration
PanelRegistry.register('editor', CodeEditor, {
  title: 'Code Editor',
  icon: '📝',
  initialTarget: 'docked'
});

// Marking a form/editor as containing unsaved changes (dirty state)
const container = useFormContainer();
container.setDirty(true); // Blocks close and triggers ConfirmationForm`,

  dirtyForm: `// Unsaved Changes Confirmation Prompt Setup
PanelRegistry.register('dirtyForm', DirtyFormDemoPanel, {
  title: 'Intercept Form',
  icon: '⚠️',
  initialTarget: 'floating'
});

// When close is clicked, WindowManager calls requestClosePanel(id, {
//   onConfirm: (customOpts) => new Promise((resolve) => {
//     openModal(ConfirmationForm, {
//       title: customOpts?.title || "Unsaved Changes",
//       message: "Discard your changes and close the panel?",
//       onOK: () => resolve(true),      // Confirms close
//       onCancel: () => resolve(false)  // Cancels close
//     });
//   })
// })`,

  mainMap: `// 1. Locked Main Map Panel (Persistent Layout Anchor)
PanelRegistry.register('mainMap', MainMap, {
  title: 'Main Map',
  icon: '🗺️',
  initialTarget: 'docked',
  canClose: false,      // Locked: cannot be closed
  canMinimize: false,   // Locked: cannot be minimized
  canDrag: false,       // Locked: cannot be dragged out of layout
  disableLivePreview: true, // Live thumbnail preview disabled
  renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="mainMap" />
});`,
  luciadMap: `// 2. Leaflet Map Panel (Supports multiple floating/draggable instances)
PanelRegistry.register('luciadMap', LeafletMapPanel, {
  title: 'Leaflet Map',
  icon: '🌍',
  initialTarget: 'docked',  // Can be spawned as a floating window dynamically
  disableLivePreview: true, // Live thumbnail preview disabled for interactive map
  // Note: Inherits default behavior (canClose: true, canMinimize: true, canDrag: true)
  renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="luciadMap" />
});`,

  showcaseControl: `// Dockable Control Center Dashboard Setup
PanelRegistry.register('showcaseControl', ShowcaseControlCenter, {
  title: 'Control Center',
  icon: '🚀',
  initialTarget: 'docked'
});

// Modifying the layout dynamically
const { loadLayout } = useWindowManagerActions();
loadLayout(JSON_LAYOUT_STRING);`
};

export const CodeSnippetButton: React.FC<{ panelId: string; type: string }> = ({ panelId, type }) => {
  const { openModal } = usePanelActions();
  const snippet = CODE_SNIPPETS[type] || '// No snippet available';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const SnippetModal: React.FC = () => {
      const { requestClose } = useFormContainer();
      const [copied, setCopied] = useState(false);

      const handleCopy = () => {
        navigator.clipboard.writeText(snippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      };

      return (
        <div className="p-3 text-white text-start d-flex flex-column h-100 font-monospace" style={{ minHeight: '320px' }}>
          <div className="flex-grow-1 overflow-auto bg-dark bg-opacity-40 p-3 rounded border border-secondary border-opacity-35 position-relative">
            <pre className="m-0 text-info" style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', fontFamily: 'var(--bs-font-monospace)' }}>
              {snippet}
            </pre>
            <button
              onClick={handleCopy}
              className={`btn btn-xs position-absolute end-0 top-0 m-2 font-monospace ${copied ? 'btn-success' : 'btn-outline-light'}`}
              style={{ fontSize: '0.7rem' }}
            >
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
          <div className="d-flex justify-content-end mt-3 border-top border-secondary border-opacity-30 pt-3">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => requestClose()}>
              Close
            </button>
          </div>
        </div>
      );
    };

    openModal(SnippetModal, {}, { title: `✏️ API Blueprint: ${type}`, size: 'medium' });
  };

  return (
    <button
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      className="btn btn-link p-0 d-flex align-items-center justify-content-center rounded-circle border-0 text-secondary"
      style={{
        width: '20px',
        height: '20px',
        backgroundColor: 'var(--panel-card-border)',
        opacity: 0.8,
        transition: 'all 0.2s ease',
      }}
      title="Inspect Panel API Code"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ verticalAlign: 'middle' }}>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    </button>
  );
};

// ==========================================
// 1. Panel Mockup Components
// ==========================================

export const ShowcaseControlCenter: React.FC = () => {
  const state = useWindowManagerState();
  const { openPanel } = useWindowManagerActions();
  const { openLeftPanel, openRightPanel } = usePanelActions();
  const [activeTab, setActiveTab] = useState<'tour' | 'presets' | 'theme' | 'monitor'>('tour');

  // Tutorial checklist state
  const [steps, setSteps] = useState({
    drag: false,
    float: false,
    minimize: false,
    dirty: false,
    drawer: false,
  });

  const markStep = (step: keyof typeof steps) => {
    setSteps(prev => ({ ...prev, [step]: true }));
  };

  // Helper to change skin
  const changeSkin = (skin: string) => {
    window.dispatchEvent(new CustomEvent('demo-change-skin', { detail: skin }));
  };

  // Helper to toggle theme
  const toggleTheme = () => {
    window.dispatchEvent(new CustomEvent('demo-change-theme'));
  };

  // Helper for drawers
  const triggerDrawer = (side: 'left' | 'right') => {
    markStep('drawer');
    if (side === 'left') {
      openLeftPanel(
        PanelRegistry.get('dirtyForm')?.Component || (() => null),
        {},
        { title: 'Left Side Panel (Dirty Intercept)' }
      );
    } else {
      openRightPanel(
        PanelRegistry.get('dirtyForm')?.Component || (() => null),
        {},
        { title: 'Right Side Panel (Dirty Intercept)' }
      );
    }
  };

  // Preset Layout Configs
  const resetLayout = () => {
    window.dispatchEvent(new CustomEvent('demo-apply-layout', { detail: 'default' }));
  };

  const applyDev = () => {
    window.dispatchEvent(new CustomEvent('demo-apply-layout', { detail: 'developer' }));
  };

  const applyEditor = () => {
    window.dispatchEvent(new CustomEvent('demo-apply-layout', { detail: 'editor' }));
  };

  const applyData = () => {
    window.dispatchEvent(new CustomEvent('demo-apply-layout', { detail: 'data' }));
  };

  // Check if any floating window exists or was closed
  useEffect(() => {
    if (state.floating.length > 0) {
      markStep('float');
    }
    if (state.minimized.length > 0) {
      markStep('minimize');
    }
  }, [state.floating, state.minimized]);

  return (
    <div className="w-100 h-100 p-3 bg-transparent text-start d-flex flex-column" style={{ color: 'var(--panel-text)', overflow: 'hidden' }}>
      <div className="border-bottom pb-2 mb-3 d-flex align-items-center justify-content-between" style={{ borderColor: 'var(--panel-card-border)' }}>
        <h5 className="m-0 text-primary fw-bold d-flex align-items-center gap-2" style={{ fontSize: '1.05rem' }}>
          🚀 Control Center
        </h5>
        <span className="badge bg-primary bg-opacity-20 text-primary border border-primary border-opacity-35 font-monospace small px-2 py-0.5" style={{ fontSize: '0.7rem' }}>
          Interactive
        </span>
      </div>

      {/* Tabs */}
      <div className="d-flex border-bottom mb-3" style={{ borderColor: 'var(--panel-card-border)', fontSize: '0.8rem' }}>
        <button
          className={`btn btn-link py-1 px-2 text-decoration-none font-monospace ${activeTab === 'tour' ? 'text-primary border-bottom border-primary fw-bold' : 'text-secondary'}`}
          onClick={() => setActiveTab('tour')}
          style={{ fontSize: '0.75rem' }}
        >
          🎓 Tour Guide
        </button>
        <button
          className={`btn btn-link py-1 px-2 text-decoration-none font-monospace ${activeTab === 'presets' ? 'text-primary border-bottom border-primary fw-bold' : 'text-secondary'}`}
          onClick={() => setActiveTab('presets')}
          style={{ fontSize: '0.75rem' }}
        >
          🗂 Presets
        </button>
        <button
          className={`btn btn-link py-1 px-2 text-decoration-none font-monospace ${activeTab === 'theme' ? 'text-primary border-bottom border-primary fw-bold' : 'text-secondary'}`}
          onClick={() => setActiveTab('theme')}
          style={{ fontSize: '0.75rem' }}
        >
          🎨 Customizer
        </button>
        <button
          className={`btn btn-link py-1 px-2 text-decoration-none font-monospace ${activeTab === 'monitor' ? 'text-primary border-bottom border-primary fw-bold' : 'text-secondary'}`}
          onClick={() => setActiveTab('monitor')}
          style={{ fontSize: '0.75rem' }}
        >
          📊 Stats
        </button>
      </div>

      {/* Content */}
      <div className="flex-grow-1 overflow-auto pe-1" style={{ fontSize: '0.8rem' }}>
        {activeTab === 'tour' && (
          <div className="d-flex flex-column gap-3">
            <div className="p-2 rounded bg-body-tertiary bg-opacity-10 border border-secondary border-opacity-20 text-muted small">
              Welcome to the Interactive Workspace Showcase! Walk through the tasks below to master the desktop features.
            </div>

            <div className="d-flex flex-column gap-2">
              {/* Step 1 */}
              <div className="p-2 rounded border" style={{ borderColor: steps.drag ? 'var(--bs-success)' : 'var(--panel-card-border)', backgroundColor: 'var(--panel-card-bg)' }}>
                <div className="d-flex align-items-center justify-content-between">
                  <span className="fw-semibold">1. Grid Drag & Split</span>
                  <input type="checkbox" className="form-check-input" checked={steps.drag} onChange={(e) => setSteps(s => ({ ...s, drag: e.target.checked }))} />
                </div>
                <p className="text-secondary small mt-1 mb-2">Drag any tab header to the edge of another tab or the grid border to tile the layout.</p>
                <button className="btn btn-xs btn-outline-primary py-0 px-2 font-monospace" style={{ fontSize: '0.7rem' }} onClick={() => { markStep('drag'); openPanel(`new-test-${Date.now()}`, 'help', { title: 'Test Widget' }); }}>
                  ➕ Spawn Drag-Test Tab
                </button>
              </div>

              {/* Step 2 */}
              <div className="p-2 rounded border" style={{ borderColor: steps.float ? 'var(--bs-success)' : 'var(--panel-card-border)', backgroundColor: 'var(--panel-card-bg)' }}>
                <div className="d-flex align-items-center justify-content-between">
                  <span className="fw-semibold">2. Floating Windows</span>
                  <input type="checkbox" className="form-check-input" checked={steps.float} readOnly />
                </div>
                <p className="text-secondary small mt-1 mb-2">Float a tab using the double window icon in the header, or spawn a floating window directly.</p>
                <button className="btn btn-xs btn-outline-primary py-0 px-2 font-monospace" style={{ fontSize: '0.7rem' }} onClick={() => openPanel(`floating-tool-${Date.now()}`, 'help', { title: 'Floating Utility', initialTarget: 'floating' })}>
                  🪟 Spawn Floating Window
                </button>
              </div>

              {/* Step 3 */}
              <div className="p-2 rounded border" style={{ borderColor: steps.minimize ? 'var(--bs-success)' : 'var(--panel-card-border)', backgroundColor: 'var(--panel-card-bg)' }}>
                <div className="d-flex align-items-center justify-content-between">
                  <span className="fw-semibold">3. Minimize & Taskbar</span>
                  <input type="checkbox" className="form-check-input" checked={steps.minimize} readOnly />
                </div>
                <p className="text-secondary small mt-1 mb-2">Minimize a floating window to see it shrink into the bottom taskbar. Click the taskbar item to restore it.</p>
              </div>

              {/* Step 4 */}
              <div className="p-2 rounded border" style={{ borderColor: steps.dirty ? 'var(--bs-success)' : 'var(--panel-card-border)', backgroundColor: 'var(--panel-card-bg)' }}>
                <div className="d-flex align-items-center justify-content-between">
                  <span className="fw-semibold">4. Unsaved Close Intercept</span>
                  <input type="checkbox" className="form-check-input" checked={steps.dirty} onChange={(e) => setSteps(s => ({ ...s, dirty: e.target.checked }))} />
                </div>
                <p className="text-secondary small mt-1 mb-2">Edit content in the editor to make it "dirty", then close it to trigger the custom confirmation prompt.</p>
                <button className="btn btn-xs btn-outline-warning text-dark py-0 px-2 font-monospace" style={{ fontSize: '0.7rem' }} onClick={() => { markStep('dirty'); openPanel('dirtyeditor-main', 'dirtyEditor'); }}>
                  ⚠️ Open Dirty Editor
                </button>
              </div>

              {/* Step 5 */}
              <div className="p-2 rounded border" style={{ borderColor: steps.drawer ? 'var(--bs-success)' : 'var(--panel-card-border)', backgroundColor: 'var(--panel-card-bg)' }}>
                <div className="d-flex align-items-center justify-content-between">
                  <span className="fw-semibold">5. Slide Drawer Menus</span>
                  <input type="checkbox" className="form-check-input" checked={steps.drawer} readOnly />
                </div>
                <p className="text-secondary small mt-1 mb-2">Open collapsible side drawer panels (left or right) to access sidebar utilities.</p>
                <div className="d-flex gap-2">
                  <button className="btn btn-xs btn-outline-info py-0 px-2 font-monospace" style={{ fontSize: '0.7rem' }} onClick={() => triggerDrawer('left')}>
                    🚪 Left Drawer
                  </button>
                  <button className="btn btn-xs btn-outline-info py-0 px-2 font-monospace" style={{ fontSize: '0.7rem' }} onClick={() => triggerDrawer('right')}>
                    🚪 Right Drawer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'presets' && (
          <div className="d-flex flex-column gap-3">
            <h6 className="text-uppercase font-monospace text-secondary mb-1" style={{ fontSize: '0.75rem' }}>Layout Templates</h6>
            <div className="d-flex flex-column gap-2">
              <button className="btn btn-sm btn-outline-light text-start p-2 d-flex flex-column gap-1" onClick={applyDev}>
                <span className="fw-bold">🗺️ Developer Layout</span>
                <span className="text-secondary small text-start" style={{ fontSize: '0.7rem' }}>Map and Code Editor on top, System Console on bottom.</span>
              </button>
              <button className="btn btn-sm btn-outline-light text-start p-2 d-flex flex-column gap-1" onClick={applyEditor}>
                <span className="fw-bold">✏️ Code Editor Focus</span>
                <span className="text-secondary small text-start" style={{ fontSize: '0.7rem' }}>Maximize editor window with a floating terminal preview.</span>
              </button>
              <button className="btn btn-sm btn-outline-light text-start p-2 d-flex flex-column gap-1" onClick={applyData}>
                <span className="fw-bold">📊 Data Analysis</span>
                <span className="text-secondary small text-start" style={{ fontSize: '0.7rem' }}>Full screen map and docked Attribute Database table.</span>
              </button>
              <button className="btn btn-sm btn-outline-danger text-start p-2 d-flex flex-column gap-1" onClick={resetLayout}>
                <span className="fw-bold text-danger">🔄 Reset Default Layout</span>
                <span className="text-secondary small text-start" style={{ fontSize: '0.7rem' }}>Restore original workspace split grid configuration.</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'theme' && (
          <div className="d-flex flex-column gap-3">
            <div>
              <h6 className="text-uppercase font-monospace text-secondary mb-2" style={{ fontSize: '0.75rem' }}>Select Skin</h6>
              <div className="row g-2">
                {['vscode', 'macos', 'chrome', 'slate', 'nord', 'obsidian', 'tokyo'].map((s) => (
                  <div key={s} className="col-6">
                    <button
                      className={`btn btn-sm w-100 text-capitalize py-1 ${state.skin === s ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => changeSkin(s)}
                      style={{ fontSize: '0.7rem' }}
                    >
                      {s === 'macos' ? 'macOS Glass' : s}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-top border-secondary border-opacity-25 pt-3">
              <h6 className="text-uppercase font-monospace text-secondary mb-2" style={{ fontSize: '0.75rem' }}>Global Theme</h6>
              <button className="btn btn-sm btn-outline-secondary w-100 py-1.5 font-monospace" onClick={toggleTheme}>
                🌓 Toggle Dark / Light Mode
              </button>
            </div>
          </div>
        )}

        {activeTab === 'monitor' && (
          <div className="d-flex flex-column gap-3 font-monospace small">
            <div className="p-2.5 rounded bg-body-tertiary bg-opacity-25 border border-secondary border-opacity-15">
              <div className="d-flex justify-content-between mb-1.5">
                <span className="text-secondary">Open Panels:</span>
                <span className="text-white fw-bold">{Object.keys(state.panels).length}</span>
              </div>
              <div className="d-flex justify-content-between mb-1.5">
                <span className="text-secondary">Floating Windows:</span>
                <span className="text-warning fw-bold">{state.floating.length}</span>
              </div>
              <div className="d-flex justify-content-between mb-1.5">
                <span className="text-secondary">Minimized to Taskbar:</span>
                <span className="text-info fw-bold">{state.minimized.length}</span>
              </div>
            </div>

            <div>
              <h6 className="text-uppercase font-monospace text-secondary mb-2" style={{ fontSize: '0.75rem' }}>Active Panels list</h6>
              <div className="d-flex flex-column gap-1.5 max-height-200 overflow-auto">
                {Object.values(state.panels).map(p => (
                  <div key={p.id} className="d-flex justify-content-between align-items-center p-1 rounded border border-secondary border-opacity-10 bg-body-tertiary bg-opacity-10">
                    <span className="text-truncate" style={{ maxWidth: '120px' }}>{p.icon} {p.title}</span>
                    <span className={`badge ${p.state === 'floating' ? 'bg-warning text-dark' : p.state === 'minimized' ? 'bg-info' : 'bg-secondary'}`} style={{ fontSize: '0.65rem' }}>
                      {p.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


const defaultCode = `import React from 'react';
import { WindowManager, WindowManagerProvider } from 'dockable-windows';

// Customize your React Desktop Dashboard layout!
const AppLayout = () => {
  return (
    <WindowManagerProvider>
      <WindowManager />
    </WindowManagerProvider>
  );
};

export default AppLayout;
`;

export const CodeEditor: React.FC = () => {
  const container = useFormContainer();
  const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [currentVal, setCurrentVal] = useState(defaultCode);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const updateTheme = () => {
      const currentTheme = document.documentElement.getAttribute('data-bs-theme');
      setEditorTheme(currentTheme === 'light' ? 'light' : 'vs-dark');
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
    return () => observer.disconnect();
  }, []);

  const handleEditorChange = (value: string | undefined) => {
    const nextVal = value ?? '';
    setCurrentVal(nextVal);

    if (nextVal !== defaultCode) {
      if (!isDirty) {
        setIsDirty(true);
        container.setDirty(true);
      }
    } else {
      if (isDirty) {
        setIsDirty(false);
        container.setDirty(false);
      }
    }
  };

  const handleSave = () => {
    setIsDirty(false);
    container.setDirty(false);
    alert('Code saved successfully!');
  };

  return (
    <div className="w-100 h-100 text-start d-flex flex-column" style={{ overflow: 'hidden' }}>
      <div className="d-flex align-items-center justify-content-between p-2 border-bottom border-secondary border-opacity-30 bg-body-tertiary bg-opacity-20">
        <span className="small text-muted font-monospace">// app.tsx</span>
        <button
          type="button"
          className={`btn btn-xs py-0 px-2 btn-sm ${isDirty ? 'btn-warning text-dark' : 'btn-outline-success'}`}
          onClick={handleSave}
          disabled={!isDirty}
          style={{ fontSize: '0.75rem' }}
        >
          {isDirty ? '💾 Save Changes' : '✅ Saved'}
        </button>
      </div>
      <div className="flex-grow-1">
        <Editor
          height="100%"
          defaultLanguage="typescript"
          theme={editorTheme}
          value={currentVal}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
};

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

const LAYER_DEFINITIONS = [
  { id: 'basemap', name: '🗺️ CartoDB Dark/Voyager', defaultVisible: true, locked: true },
  { id: 'markers', name: '📍 London Landmarks', defaultVisible: true, locked: false },
  { id: 'polygons', name: '🏛️ District Boundaries', defaultVisible: true, locked: false },
  { id: 'polylines', name: '🌊 Thames River Path', defaultVisible: false, locked: false },
];

export const LayerTree: React.FC = () => {
  const { publish } = usePanelContext();
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    LAYER_DEFINITIONS.forEach(l => { initial[l.id] = l.defaultVisible; });
    return initial;
  });

  // Publish initial layer states on mount
  useEffect(() => {
    LAYER_DEFINITIONS.forEach(layer => {
      if (!layer.locked) {
        publish('layer-visibility', { layerId: layer.id, visible: layer.defaultVisible });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = (layerId: string) => {
    setVisibility(prev => {
      const next = { ...prev, [layerId]: !prev[layerId] };
      publish('layer-visibility', { layerId, visible: next[layerId] });
      return next;
    });
  };

  return (
    <div className="w-100 h-100 p-3 bg-transparent text-start" style={{ color: 'var(--panel-text)', overflow: 'auto' }}>
      <h6 className="border-bottom pb-2" style={{ color: 'var(--panel-title-color)', borderColor: 'var(--panel-card-border)' }}>Layer Catalog Explorer</h6>
      <div className="d-flex flex-column gap-2 mt-3">
        {LAYER_DEFINITIONS.map(layer => (
          <div key={layer.id} className="d-flex align-items-center justify-content-between p-2 rounded" style={{ backgroundColor: 'var(--panel-card-bg)', border: '1px solid var(--panel-card-border)' }}>
            <span className="font-monospace small" style={{ opacity: visibility[layer.id] ? 1 : 0.5, color: 'var(--panel-text)' }}>{layer.name}</span>
            <div className="form-check form-switch m-0">
              <input
                className="form-check-input"
                type="checkbox"
                role="switch"
                checked={visibility[layer.id]}
                disabled={layer.locked}
                onChange={() => handleToggle(layer.id)}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 small text-secondary">
        Toggle layers to show/hide vector data on the map.
      </div>
    </div>
  );
};

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
        <tr><td>01</td><td>Leaflet Map View</td><td>OpenStreetMap</td><td>Active</td></tr>
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

export const LeafletMapPanel: React.FC<{ panelId: string }> = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center: [51.505, -0.09], // London
      zoom: 13,
      zoomControl: false,
    });
    mapRef.current = map;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const isLight = document.documentElement.getAttribute('data-bs-theme') === 'light';
    const tileUrl = isLight
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    const tileLayer = L.tileLayer(tileUrl, { attribution }).addTo(map);
    tileLayerRef.current = tileLayer;

    const updateMapTheme = () => {
      const light = document.documentElement.getAttribute('data-bs-theme') === 'light';
      const newUrl = light
        ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      if (tileLayerRef.current) {
        tileLayerRef.current.setUrl(newUrl);
      }
    };
    const observer = new MutationObserver(updateMapTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="w-100 h-100 position-relative bg-dark" style={{ overflow: 'hidden' }}>
      <div ref={containerRef} className="w-100 h-100" style={{ minHeight: '100px' }} />
      <div className="position-absolute top-0 start-0 m-2 p-1 px-2 rounded bg-black bg-opacity-75 text-info font-monospace small" style={{ zIndex: 1000, pointerEvents: 'none' }}>
        Leaflet Map (London)
      </div>
    </div>
  );
};

// GeoJSON vector data for London demo layers
const LONDON_LANDMARKS: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1276, 51.5074] }, properties: { name: 'Big Ben' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.0762, 51.5081] }, properties: { name: 'Tower of London' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1194, 51.5034] }, properties: { name: 'London Eye' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1416, 51.5014] }, properties: { name: 'Buckingham Palace' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.0983, 51.5138] }, properties: { name: 'St Paul\'s Cathedral' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1534, 51.5194] }, properties: { name: 'Oxford Circus' } },
  ]
};

const DISTRICT_BOUNDARIES: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[-0.14, 51.50], [-0.12, 51.50], [-0.12, 51.515], [-0.14, 51.515], [-0.14, 51.50]]]
      },
      properties: { name: 'Westminster' }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[-0.10, 51.505], [-0.07, 51.505], [-0.07, 51.52], [-0.10, 51.52], [-0.10, 51.505]]]
      },
      properties: { name: 'City of London' }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[-0.16, 51.495], [-0.14, 51.495], [-0.14, 51.51], [-0.16, 51.51], [-0.16, 51.495]]]
      },
      properties: { name: 'Kensington' }
    }
  ]
};

const THAMES_PATH: number[][] = [
  [-0.18, 51.485], [-0.16, 51.487], [-0.14, 51.490], [-0.13, 51.498],
  [-0.12, 51.501], [-0.115, 51.504], [-0.10, 51.506], [-0.08, 51.508],
  [-0.06, 51.507], [-0.04, 51.505], [-0.02, 51.503], [0.00, 51.502]
];

export const MainMap: React.FC<{ panelId: string }> = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupsRef = useRef<Record<string, L.LayerGroup>>({});
  const { subscribe } = usePanelContext();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center: [51.505, -0.09], // London
      zoom: 13,
      zoomControl: false,
    });
    mapRef.current = map;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const isLight = document.documentElement.getAttribute('data-bs-theme') === 'light';
    const tileUrl = isLight
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    const tileLayer = L.tileLayer(tileUrl, { attribution }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Create vector layer groups
    // Markers layer
    const markersGroup = L.layerGroup();
    L.geoJSON(LONDON_LANDMARKS, {
      pointToLayer: (_feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 7,
          fillColor: '#38bdf8',
          color: '#0ea5e9',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        });
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties?.name) {
          layer.bindTooltip(feature.properties.name, { permanent: false, direction: 'top', className: 'leaflet-tooltip-custom' });
        }
      }
    }).addTo(markersGroup);
    markersGroup.addTo(map);
    layerGroupsRef.current['markers'] = markersGroup;

    // Polygons layer
    const polygonsGroup = L.layerGroup();
    L.geoJSON(DISTRICT_BOUNDARIES, {
      style: {
        fillColor: '#a78bfa',
        color: '#7c3aed',
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.15
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties?.name) {
          layer.bindTooltip(feature.properties.name, { permanent: true, direction: 'center', className: 'leaflet-tooltip-custom' });
        }
      }
    }).addTo(polygonsGroup);
    polygonsGroup.addTo(map);
    layerGroupsRef.current['polygons'] = polygonsGroup;

    // Polylines layer (Thames river path)
    const polylinesGroup = L.layerGroup();
    L.polyline(
      THAMES_PATH.map(coord => [coord[1], coord[0]] as L.LatLngTuple),
      {
        color: '#22d3ee',
        weight: 3,
        opacity: 0.8,
        dashArray: '8, 4'
      }
    ).bindTooltip('Thames River Path', { permanent: false, direction: 'center' }).addTo(polylinesGroup);
    // Thames polyline is default hidden, don't add to map
    layerGroupsRef.current['polylines'] = polylinesGroup;

    const updateMapTheme = () => {
      const light = document.documentElement.getAttribute('data-bs-theme') === 'light';
      const newUrl = light
        ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      if (tileLayerRef.current) {
        tileLayerRef.current.setUrl(newUrl);
      }
    };
    const observer = new MutationObserver(updateMapTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupsRef.current = {};
    };
  }, []);

  // Subscribe to layer visibility events
  useEffect(() => {
    const unsubscribe = subscribe('layer-visibility', (data: { layerId: string; visible: boolean }) => {
      const map = mapRef.current;
      const layerGroup = layerGroupsRef.current[data.layerId];
      if (!map || !layerGroup) return;

      if (data.visible) {
        if (!map.hasLayer(layerGroup)) {
          map.addLayer(layerGroup);
        }
      } else {
        if (map.hasLayer(layerGroup)) {
          map.removeLayer(layerGroup);
        }
      }
    });
    return unsubscribe;
  }, [subscribe]);

  return (
    <div className="w-100 h-100 position-relative bg-dark" style={{ overflow: 'hidden' }}>
      <div ref={containerRef} className="w-100 h-100" style={{ minHeight: '100px', zIndex: 1 }} />
      <div className="position-absolute top-0 start-0 m-2 p-1 px-2 rounded bg-black bg-opacity-75 text-success font-monospace small" style={{ zIndex: 1000, pointerEvents: 'none' }}>
        🗺️ Main Global Map View (Leaflet) [Locked Layout]
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
    <div className="w-100 h-100 p-3 bg-transparent text-body d-flex flex-column text-start" style={{ overflow: 'auto' }}>
      <h6 className="border-bottom border-secondary pb-2 text-info">Dirty State & Close Interception Form</h6>
      <div className="d-flex flex-column gap-3 mt-3">
        <div className="p-3 bg-body-tertiary bg-opacity-30 rounded border border-secondary">
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

        <div className="p-3 bg-body-tertiary bg-opacity-30 rounded border border-secondary">
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

        <div className="p-3 bg-body-tertiary bg-opacity-30 rounded border border-secondary">
          <label className="form-label small text-info">3. Try Dynamic Title Update</label>
          <input
            type="text"
            className="form-control form-control-sm bg-body text-body border-secondary"
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
    <div className="w-100 h-100 p-3 bg-transparent text-body text-start d-flex flex-column gap-2" style={{ overflow: 'hidden' }}>
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
        className="form-control bg-body text-body font-monospace flex-grow-1 border-secondary p-3 mt-1"
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
        icon: '🗺️',
        initialTarget: 'docked',
        canClose: false,
        canMinimize: false,
        canDrag: false,
        disableLivePreview: true,
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="mainMap" />
    });
    PanelRegistry.register('editor', CodeEditor, { 
        title: 'Code Editor', 
        icon: '⚛️',
        initialTarget: 'docked',
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="editor" />
    });
    PanelRegistry.register('terminal', TerminalConsole, { 
        title: 'Console Output', 
        icon: '💻',
        initialTarget: 'docked',
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="editor" />
    });
    PanelRegistry.register('preview', PreviewOutput, { 
        title: 'Sandbox Widget', 
        icon: '📦',
        initialTarget: 'floating',
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="editor" />
    });
    PanelRegistry.register('help', HelpCenter, { 
        title: 'Workspace Help', 
        icon: '❓',
        initialTarget: 'docked',
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="showcaseControl" />
    });
    PanelRegistry.register('showcaseControl', ShowcaseControlCenter, {
        title: 'Control Center',
        icon: '🚀',
        initialTarget: 'docked',
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="showcaseControl" />
    });
    PanelRegistry.register('luciadMap', LeafletMapPanel, { 
        title: 'Leaflet Map', 
        icon: '🌍',
        initialTarget: 'docked',
        disableLivePreview: true,
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="luciadMap" />
    });
    PanelRegistry.register('layertree', LayerTree, { 
        title: 'Layer tree', 
        icon: '🌿',
        initialTarget: 'floating', 
        favoritePosition: { x: 10, y: 50, width: 300, height: 400 }, 
        defaultStickyRight: true,
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="mainMap" />
    });
    PanelRegistry.register('timecontrol', TimeControl, {
        title: 'Time Control bar',
        icon: '⏱️',
        initialTarget: 'floating',
        favoritePosition: {
            x: '10px',
            y: 'calc(100% - 130px)',
            width: 'calc(100% - 20px)',
            height: '100px'
        },
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="dirtyForm" />
    });
    PanelRegistry.register('overviewmap', OverviewMap, { 
        title: 'Overview locator', 
        icon: '👁️',
        initialTarget: 'floating', 
        favoritePosition: { x: 80, y: 500, width: 220, height: 180 },
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="mainMap" />
    });
    PanelRegistry.register('table', TablePanel, { 
        title: 'Attribute Table', 
        icon: '📋',
        initialTarget: 'docked',
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="mainMap" />
    });
    PanelRegistry.register('toolpanels', ToolPanel, { 
        title: 'Toolbox Panel', 
        icon: '🔧',
        initialTarget: 'docked',
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="dirtyForm" />
    });
    PanelRegistry.register('panelmanager', PanelManagerForm, { 
        title: 'Panel Registry Form', 
        icon: '⚙️',
        initialTarget: 'floating', 
        favoritePosition: { x: 400, y: 150, width: 500, height: 420 },
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="showcaseControl" />
    });
    PanelRegistry.register('dirtyForm', DirtyFormDemoPanel, { 
        title: 'Intercept Form', 
        icon: '⚠️',
        initialTarget: 'floating', 
        favoritePosition: { x: 350, y: 150, width: 450, height: 420 },
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="dirtyForm" />
    });
    PanelRegistry.register('dirtyEditor', DirtyEditorDemoPanel, { 
        title: 'Intercept Editor', 
        icon: '📝',
        initialTarget: 'docked',
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="dirtyForm" />
    });
}
