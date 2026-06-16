import React, { useState, useRef, useEffect } from 'react';
import {
  PanelRegistry,
  useFormContainer,
  usePanelContext,
  useSidebar,
  useToolbar,
  useWindowManagerState,
  useWindowManagerActions,
  usePanelActions,
  usePanelId,
  usePanelContextMenu,
  ConfirmationForm,
  PanelOverlayRoot,
  PanelToolbar,
  ToolbarButton,
  ToolbarToggle,
  ToolbarSpacer,
  ToolbarCenter,
  PanelToolbarSeparator,
  usePanelFloatingWindowManager,
  toast,
} from '../src/index';
import type { ContextMenuItem } from '../src/index';
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
loadLayout(JSON_LAYOUT_STRING);`,

  v3features: `// v3.0: F6 — DockableDesktopProvider (wraps both providers)
<DockableDesktopProvider client={workspace}>
  <WindowManager />
  <ModalStackRenderer />
</DockableDesktopProvider>

// v3.0: F7 — usePanelId() — no prop drilling needed
function MyPanel() {
  const panelId = usePanelId();
  return <button onClick={() => ws.closePanel(panelId)}>Close me</button>;
}

// v3.0: F4 — State Selector (skips re-renders on unrelated changes)
const activeId = useWindowManagerState(s => s.activePanelId);
const count   = useWindowManagerState(s => Object.keys(s.panels).length);

// v3.0: F5 — Lifecycle callbacks via WorkspaceClient
workspace.onPanelOpen((id, component) =>
  analytics.track('panel_open', { id, component })
);

// v3.0: F8 — Typed WorkspaceClient<TUserEvents>
interface AppEvents { 'layer:toggle': { layerId: string; visible: boolean } }
const ws = new WorkspaceClient<AppEvents>({ panels });
ws.publish('layer:toggle', { layerId: 'markers', visible: true }); // typed
ws.subscribe('panel:opened', d => console.log(d.id));             // built-in`,

  contextMenu: `// Custom context menu entries via usePanelContextMenu hook
// Items live inside the panel — no central config needed.
// The array is re-read each time the menu opens, so items
// can react to component state (dirty, selection, mode, etc.)

import { usePanelContextMenu } from 'dockable-windows';
import type { ContextMenuItem } from 'dockable-windows';

function DirtyEditor() {
  const [isDirty, setIsDirty] = useState(false);

  // Always provide an icon — keeps text aligned with system items.
  // Items update automatically when isDirty changes.
  const menuItems: ContextMenuItem[] = isDirty
    ? [
        { label: 'Save Changes', icon: <SaveIcon />, action: () => save() },
        { separator: true },
        { label: 'Reset Content', icon: <ResetIcon />, action: () => reset() },
      ]
    : [{ label: 'Reset Content', icon: <ResetIcon />, action: () => reset() }];

  usePanelContextMenu(menuItems);
  // ...
}

// Tab  → right-click → system items + separator + custom items
// Float → ⋮ button  → custom items only (button absent if empty)`,

  rtlShowcase: `// RTL Content Showcase Panel
PanelRegistry.register('rtlShowcase', RTLShowcasePanel, {
  title: 'RTL Showcase',
  icon: '🔄',
  initialTarget: 'docked'
});

// Reading direction from the WindowManager state
const state = useWindowManagerState();
console.log(state.dir);   // 'ltr' | 'rtl'
console.log(state.isRtl); // boolean

// All panels inherit dir automatically via DOM.
// Panels render content based on the active direction.`
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
  const [activeTab, setActiveTab] = useState<'tour' | 'presets' | 'theme' | 'monitor' | 'v3'>('tour');

  // F4 — state selectors: only re-render this hook when these specific values change
  const activePanelId = useWindowManagerState(s => s.activePanelId);
  const panelCount = useWindowManagerState(s => Object.keys(s.panels).length);
  const floatingCount = useWindowManagerState(s => s.floating.length);

  // F5 — lifecycle event log via panel event bus
  const [lifecycleLog, setLifecycleLog] = useState<Array<{ type: string; id: string }>>([]);
  const { subscribe } = usePanelContext();
  useEffect(() => {
    const addLog = (type: string) => (d: unknown) => {
      const { id } = d as { id: string };
      setLifecycleLog(prev => [{ type, id }, ...prev].slice(0, 12));
    };
    const unsubs = [
      subscribe('panel:opened', addLog('opened')),
      subscribe('panel:closed', addLog('closed')),
      subscribe('panel:minimized', addLog('minimized')),
      subscribe('panel:restored', addLog('restored')),
    ];
    return () => unsubs.forEach(u => u());
  }, [subscribe]);

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
        <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', padding: '2px 8px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-color, #38bdf8)', border: '1px solid rgba(56, 189, 248, 0.4)' }}>
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
        <button
          className={`btn btn-link py-1 px-2 text-decoration-none font-monospace ${activeTab === 'v3' ? 'text-primary border-bottom border-primary fw-bold' : 'text-secondary'}`}
          onClick={() => setActiveTab('v3')}
          style={{ fontSize: '0.75rem' }}
        >
          ⚡ v3
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

        {activeTab === 'v3' && (
          <div className="d-flex flex-column gap-3 font-monospace small">

            {/* F4 — State Selectors */}
            <div>
              <h6 className="text-uppercase text-secondary mb-1" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>F4 — State Selectors (live)</h6>
              <div className="p-2 rounded border border-secondary border-opacity-15" style={{ background: 'var(--panel-card-bg)' }}>
                <div className="d-flex justify-content-between mb-1">
                  <span className="text-secondary" style={{ fontSize: '0.7rem' }}>activePanelId:</span>
                  <span className="text-info" style={{ fontSize: '0.7rem', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activePanelId || '—'}</span>
                </div>
                <div className="d-flex justify-content-between mb-1">
                  <span className="text-secondary" style={{ fontSize: '0.7rem' }}>panel count:</span>
                  <span className="text-success fw-bold" style={{ fontSize: '0.7rem' }}>{panelCount}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span className="text-secondary" style={{ fontSize: '0.7rem' }}>floating count:</span>
                  <span className="text-warning fw-bold" style={{ fontSize: '0.7rem' }}>{floatingCount}</span>
                </div>
                <pre className="mt-2 mb-0 text-muted" style={{ fontSize: '0.62rem', whiteSpace: 'pre-wrap' }}>{`// Only re-renders when activePanelId changes:\nconst id = useWindowManagerState(\n  s => s.activePanelId\n);`}</pre>
              </div>
            </div>

            {/* F5 — Lifecycle Events */}
            <div>
              <h6 className="text-uppercase text-secondary mb-1" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>F5 — Lifecycle Events (live log)</h6>
              <div className="p-2 rounded border border-secondary border-opacity-15 overflow-auto" style={{ background: 'var(--panel-card-bg)', maxHeight: '120px' }}>
                {lifecycleLog.length === 0 ? (
                  <span className="text-muted" style={{ fontSize: '0.7rem' }}>No events yet — open or close a panel</span>
                ) : (
                  lifecycleLog.map((entry, i) => (
                    <div key={i} className="d-flex gap-2" style={{ fontSize: '0.7rem' }}>
                      <span className={`${entry.type === 'opened' ? 'text-success' : entry.type === 'closed' ? 'text-danger' : 'text-info'}`} style={{ minWidth: '62px' }}>
                        {entry.type}
                      </span>
                      <span className="text-white text-truncate" style={{ maxWidth: '130px' }}>{entry.id}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* F6/F7/F8 — Quick References */}
            <div>
              <h6 className="text-uppercase text-secondary mb-1" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>F6/F7/F8 — Quick Reference</h6>
              <pre className="mb-0 text-muted p-2 rounded border border-secondary border-opacity-15 overflow-auto" style={{ fontSize: '0.62rem', whiteSpace: 'pre-wrap', background: 'var(--panel-card-bg)', maxHeight: '120px' }}>{`// F6: one provider replaces two\n<DockableDesktopProvider client={ws}>\n  ...\n</DockableDesktopProvider>\n\n// F7: panel reads own ID without props\nconst id = usePanelId();\n\n// F8: fully-typed event bus\nconst ws = new WorkspaceClient<MyEvents>({...});\nws.publish('layer:toggle', { id: 'a' });`}</pre>
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
  const [wordWrap, setWordWrap] = useState(false);

  useEffect(() => {
    const updateTheme = () => {
      const currentTheme = document.documentElement.getAttribute('data-color-scheme');
      setEditorTheme(currentTheme === 'light' ? 'light' : 'vs-dark');
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme'] });
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
    toast.success('Code saved successfully!');
  };

  const PlayIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <polygon points="3,1 13,8 3,15" />
    </svg>
  );
  const FormatIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="10" y2="8" /><line x1="2" y1="12" x2="12" y2="12" />
    </svg>
  );
  const WrapIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="11" y2="8" />
      <path d="M11 8 Q14 8 14 11 L14 12" /><polyline points="11,10 14,12 11,14" />
      <line x1="2" y1="12" x2="8" y2="12" />
    </svg>
  );
  const SaveIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2 h9 l3 3 v9 a1 1 0 0 1-1 1 H3 a1 1 0 0 1-1-1 Z" />
      <rect x="5" y="2" width="5" height="4" rx="0.5" /><rect x="4" y="9" width="8" height="5" rx="0.5" />
    </svg>
  );

  return (
    <PanelOverlayRoot>
      <PanelToolbar
        position="top"
        variant="solid"
        buttonVariant="outlined"
        style={{ padding: '2px 0' }}
      >
        <ToolbarSpacer />
        <ToolbarButton icon={PlayIcon} onClick={() => {}} title="Run" />
        <PanelToolbarSeparator />
        <ToolbarButton icon={FormatIcon} onClick={() => {}} title="Format" />
        <ToolbarToggle
          icon={WrapIcon}
          active={wordWrap}
          onToggle={() => setWordWrap(v => !v)}
          title="Word wrap"
        />
        <PanelToolbarSeparator />
        <ToolbarButton
          icon={SaveIcon}
          onClick={handleSave}
          disabled={!isDirty}
          title={isDirty ? 'Save changes' : 'Saved'}
        />
      </PanelToolbar>
      <div className="w-100 h-100" style={{ paddingTop: 36, boxSizing: 'border-box' }}>
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
            wordWrap: wordWrap ? 'on' : 'off',
          }}
        />
      </div>
    </PanelOverlayRoot>
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

export const HelpCenter: React.FC = () => {
  const panelId = usePanelId();
  return (
    <div className="w-100 h-100 p-4 bg-transparent text-start" style={{ color: 'var(--panel-text)', opacity: 0.85, overflow: 'auto' }}>
      <h5 className="border-bottom pb-2 mb-3" style={{ color: 'var(--panel-text)', borderColor: 'var(--panel-card-border)' }}>Workspace Guide</h5>
      <ul className="small d-flex flex-column gap-2 ps-3">
        <li><strong>Float Tabs:</strong> Click the "▢" in a tab header or right-click to float a docked tab.</li>
        <li><strong>Minimize:</strong> Minimize panels to see them slide into the macOS taskbar at the bottom.</li>
        <li><strong>Save & Restore:</strong> Save your customized layout to JSON and restore it instantly.</li>
      </ul>
      <div className="mt-4 pt-3 border-top small font-monospace d-flex align-items-center gap-2" style={{ borderColor: 'var(--panel-card-border)' }}>
        <span className="text-secondary" style={{ fontSize: '0.75rem' }}>usePanelId()</span>
        <span className="text-muted">→</span>
        <code className="text-info" style={{ fontSize: '0.75rem' }}>{panelId}</code>
      </div>
    </div>
  );
};

const LAYER_DEFINITIONS = [
  { id: 'basemap', name: '🗺️ CartoDB Dark/Voyager', defaultVisible: true, locked: true },
  { id: 'markers', name: '📍 London Landmarks', defaultVisible: true, locked: false },
  { id: 'polygons', name: '🏛️ District Boundaries', defaultVisible: true, locked: false },
  { id: 'polylines', name: '🌊 Thames River Path', defaultVisible: false, locked: false },
];

export const LayerTree: React.FC = () => {
  const { publish } = usePanelContext();
  const { openTab, closeDrawer } = useSidebar();
  const { getActiveInGroup } = useToolbar();
  const activeTool = getActiveInGroup('tool');
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
      <div className="p-2 rounded mb-2 font-monospace small" style={{ background: 'var(--panel-card-bg)', border: '1px solid var(--panel-card-border)', color: 'var(--panel-title-color)' }}>
        Active tool: <strong>{activeTool ?? 'none'}</strong>
      </div>
      <div className="d-flex gap-1 mb-1">
        <button
          type="button"
          className="btn btn-sm btn-outline-info flex-fill font-monospace"
          style={{ fontSize: '0.75rem' }}
          onClick={() => openTab('search')}
        >
          Open Search Results
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary flex-fill font-monospace"
          style={{ fontSize: '0.75rem' }}
          onClick={() => closeDrawer()}
        >
          Close Search Results
        </button>
      </div>
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

    const isLight = document.documentElement.getAttribute('data-color-scheme') === 'light';
    const tileUrl = isLight
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    const tileLayer = L.tileLayer(tileUrl, { attribution }).addTo(map);
    tileLayerRef.current = tileLayer;

    const updateMapTheme = () => {
      const light = document.documentElement.getAttribute('data-color-scheme') === 'light';
      const newUrl = light
        ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      if (tileLayerRef.current) {
        tileLayerRef.current.setUrl(newUrl);
      }
    };
    const observer = new MutationObserver(updateMapTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme'] });

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

// ─── Camera definitions ───────────────────────────────────────────────────────

const CAMERAS = [
  { id: 'cam-bigben',  name: 'Big Ben',           coords: [-0.1276, 51.5074] as [number, number], color: '#38bdf8' },
  { id: 'cam-tower',   name: 'Tower of London',   coords: [-0.0762, 51.5081] as [number, number], color: '#a78bfa' },
  { id: 'cam-eye',     name: 'London Eye',         coords: [-0.1194, 51.5034] as [number, number], color: '#34d399' },
  { id: 'cam-palace',  name: 'Buckingham Palace', coords: [-0.1416, 51.5014] as [number, number], color: '#fb923c' },
  { id: 'cam-stpauls', name: "St Paul's",          coords: [-0.0983, 51.5138] as [number, number], color: '#f472b6' },
  { id: 'cam-oxford',  name: 'Oxford Circus',     coords: [-0.1534, 51.5194] as [number, number], color: '#facc15' },
];

const CORNERS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const;

// ─── MockCameraFeed ───────────────────────────────────────────────────────────

const MockCameraFeed: React.FC<{ name: string; color: string }> = ({ name, color }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const bitrate = (2.1 + (tick % 5) * 0.3).toFixed(1);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Simulated video area */}
      <div style={{
        flex: 1,
        background: `linear-gradient(135deg, #0a0e17 0%, ${color}18 100%)`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Scan-line overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)',
        }} />
        {/* Corner crosshair */}
        <div style={{ position: 'absolute', top: 10, left: 10, width: 16, height: 16,
          borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}`, opacity: 0.6 }} />
        <div style={{ position: 'absolute', top: 10, right: 10, width: 16, height: 16,
          borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}`, opacity: 0.6 }} />
        <div style={{ position: 'absolute', bottom: 10, left: 10, width: 16, height: 16,
          borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}`, opacity: 0.6 }} />
        <div style={{ position: 'absolute', bottom: 10, right: 10, width: 16, height: 16,
          borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}`, opacity: 0.6 }} />
        {/* LIVE badge */}
        <div style={{
          position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontFamily: 'monospace', color: '#ef4444', fontWeight: 700, letterSpacing: 1,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#ef4444',
            boxShadow: '0 0 6px #ef4444',
            animation: 'none',
            opacity: tick % 2 === 0 ? 1 : 0.4,
            transition: 'opacity 0.4s',
          }} />
          LIVE
        </div>
        {/* Camera name */}
        <div style={{
          position: 'absolute', bottom: 8, left: 8, right: 8,
          fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)',
        }}>
          {name}
        </div>
      </div>
      {/* Metadata strip */}
      <div style={{
        padding: '4px 8px', fontSize: 10, fontFamily: 'monospace',
        color: 'rgba(255,255,255,0.45)', background: 'rgba(0,0,0,0.4)',
        display: 'flex', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span>1920×1080 · H.264</span>
        <span style={{ color: color, opacity: 0.8 }}>{bitrate} Mbps</span>
      </div>
    </div>
  );
};

// ─── Static content components for managed floating windows ──────────────────

const MapLegendContent: React.FC = () => (
  <div style={{ padding: '12px', fontSize: 12, color: 'var(--panel-text)' }}>
    {[
      { label: 'Cameras', color: '#38bdf8' },
      { label: 'Districts', color: '#a78bfa' },
      { label: 'Thames Path', color: '#22d3ee' },
    ].map(({ label, color }) => (
      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ opacity: 0.8 }}>{label}</span>
      </div>
    ))}
  </div>
);

const MapInfoContent: React.FC = () => (
  <div style={{ padding: '12px', fontSize: 12, color: 'var(--panel-text)' }}>
    {[
      { label: 'Center', value: '51.505°N, 0.090°W' },
      { label: 'Zoom', value: '13' },
      { label: 'Projection', value: 'EPSG:3857' },
      { label: 'Scale', value: '1 : 72,224' },
      { label: 'Tile Provider', value: 'CartoDB' },
    ].map(({ label, value }) => (
      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ opacity: 0.55 }}>{label}</span>
        <span style={{ opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
    ))}
  </div>
);

// MainMap is a thin wrapper so that MainMapInner is a child of PanelOverlayRoot
// and can correctly call usePanelFloatingWindowManager() inside the context.
export const MainMap: React.FC<{ panelId: string }> = () => (
  <PanelOverlayRoot className="bg-dark">
    <MainMapInner />
  </PanelOverlayRoot>
);

const MainMapInner: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupsRef = useRef<Record<string, L.LayerGroup>>({});
  const { subscribe } = usePanelContext();
  const floats = usePanelFloatingWindowManager();
  const floatsRef = useRef(floats);
  useEffect(() => { floatsRef.current = floats; });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center: [51.505, -0.09], // London
      zoom: 13,
      zoomControl: false,
    });
    mapRef.current = map;

    const isLight = document.documentElement.getAttribute('data-color-scheme') === 'light';
    const tileUrl = isLight
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    const tileLayer = L.tileLayer(tileUrl, { attribution }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Create vector layer groups
    // Camera markers layer — each marker click opens/closes its feed window
    const markersGroup = L.layerGroup();
    CAMERAS.forEach((cam, i) => {
      const marker = L.circleMarker([cam.coords[1], cam.coords[0]], {
        radius: 8,
        fillColor: cam.color,
        color: cam.color,
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.7,
      });
      marker.bindTooltip(`📷 ${cam.name}`, { permanent: false, direction: 'top', className: 'leaflet-tooltip-custom' });
      marker.on('click', () => {
        const f = floatsRef.current;
        if (f.isOpen(cam.id)) {
          f.close(cam.id);
        } else {
          f.open(cam.id, {
            title: `📷 ${cam.name}`,
            content: <MockCameraFeed name={cam.name} color={cam.color} />,
            anchor: CORNERS[i % CORNERS.length],
            width: 280,
            height: 200,
          });
        }
      });
      marker.addTo(markersGroup);
    });
    // Polygons layer — added before markers so markers render on top and remain clickable
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

    markersGroup.addTo(map);
    layerGroupsRef.current['markers'] = markersGroup;

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
      const light = document.documentElement.getAttribute('data-color-scheme') === 'light';
      const newUrl = light
        ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      if (tileLayerRef.current) {
        tileLayerRef.current.setUrl(newUrl);
      }
    };
    const observer = new MutationObserver(updateMapTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme'] });

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

  const ZoomInIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="6.5" r="5" /><line x1="10.5" y1="10.5" x2="14" y2="14" />
      <line x1="6.5" y1="4" x2="6.5" y2="9" /><line x1="4" y1="6.5" x2="9" y2="6.5" />
    </svg>
  );
  const ZoomOutIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="6.5" r="5" /><line x1="10.5" y1="10.5" x2="14" y2="14" />
      <line x1="4" y1="6.5" x2="9" y2="6.5" />
    </svg>
  );
  const LayersIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="8 1 1 5 8 9 15 5 8 1" /><polyline points="1 11 8 15 15 11" /><polyline points="1 8 8 12 15 8" />
    </svg>
  );
  const InfoIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6.5" /><line x1="8" y1="7" x2="8" y2="11.5" /><circle cx="8" cy="4.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
  const HomeIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 7 8 1 15 7" /><path d="M3 6.5V14a0.5 0.5 0 0 0 0.5 0.5h3.5V10h2v4.5h3.5a0.5 0.5 0 0 0 0.5-0.5V6.5" />
    </svg>
  );

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleResetView = () => mapRef.current?.setView([51.505, -0.09], 13);

  return (
    <>
      <PanelToolbar position="top">
        <ToolbarCenter>
          <ToolbarButton icon={HomeIcon} onClick={handleResetView} title="Reset view" />
        </ToolbarCenter>
        <ToolbarSpacer />
        <ToolbarToggle
          icon={InfoIcon}
          active={floats.isOpen('map-info')}
          onToggle={() => floats.isOpen('map-info')
            ? floats.close('map-info')
            : floats.open('map-info', { title: 'Map Info', content: <MapInfoContent />, anchor: 'top-left', width: 220, height: 180 })
          }
          title="Map info"
        />
        <ToolbarToggle
          icon={LayersIcon}
          active={floats.isOpen('map-legend')}
          onToggle={() => floats.isOpen('map-legend')
            ? floats.close('map-legend')
            : floats.open('map-legend', { title: 'Map Layers', content: <MapLegendContent />, anchor: 'top-right', width: 200, height: 240 })
          }
          title="Legend"
        />
      </PanelToolbar>

      <PanelToolbar position="right">
        <ToolbarSpacer />
        <ToolbarButton icon={ZoomInIcon} onClick={handleZoomIn} title="Zoom in" />
        <ToolbarButton icon={ZoomOutIcon} onClick={handleZoomOut} title="Zoom out" />
      </PanelToolbar>

      <div ref={containerRef} className="w-100 h-100" style={{ minHeight: '100px', zIndex: 1 }} />
    </>
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

const dirtyEditorDefault = '// Type something here, changes make the tab dirty.\n// Click Save to clear the dirty state.';

export const DirtyEditorDemoPanel: React.FC = () => {
  const container = useFormContainer();
  const [content, setContent] = useState(dirtyEditorDefault);
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
    toast.success('Changes saved successfully!');
  };

  const handleReset = () => {
    setContent(dirtyEditorDefault);
    setIsDirty(false);
    container.setDirty(false);
  };

  const iconSave = (
    <span className="wm-menu-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
    </span>
  );
  const iconReset = (
    <span className="wm-menu-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
    </span>
  );

  // Dynamic context menu: "Save Changes" only appears when there is something to save.
  // The array is rebuilt on every render — the hook re-reads it each time the menu opens.
  const menuItems: ContextMenuItem[] = isDirty
    ? [
        { label: 'Save Changes', icon: iconSave, action: handleSave },
        { separator: true },
        { label: 'Reset Content', icon: iconReset, action: handleReset },
      ]
    : [{ label: 'Reset Content', icon: iconReset, action: handleReset }];

  usePanelContextMenu(menuItems);

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

// ==========================================
// RTL Content Showcase Panel
// ==========================================

const RTL_CONTENT = {
  rtl: {
    badge: 'RTL — من اليمين إلى اليسار',
    heading: 'عرض محتوى ثنائي الاتجاه',
    subtitle: 'هذه اللوحة تثبت أن سمة dir="rtl" تنتقل بشكل صحيح إلى محتوى اللوحة.',
    article: {
      title: '📰 مقال تجريبي',
      body: 'يُعد نظام إدارة النوافذ القابلة للإرساء منصة مرنة وقوية لبناء تطبيقات سطح المكتب الحديثة. يدعم النظام تخطيطات متعددة، ونوافذ عائمة، وأدراج جانبية، ونوافذ مودال متداخلة.',
      author: 'المؤلف: فريق التطوير',
    },
    form: {
      title: '📝 نموذج إدخال',
      name: 'الاسم الكامل',
      namePlaceholder: 'أدخل اسمك...',
      email: 'البريد الإلكتروني',
      emailPlaceholder: 'user@example.com',
      notes: 'ملاحظات',
      notesPlaceholder: 'اكتب ملاحظاتك هنا...',
      submit: '✅ إرسال',
    },
    table: {
      title: '📊 بيانات المشروع',
      headers: ['الميزة', 'الحالة', 'الأولوية'],
      rows: [
        ['دعم RTL', '✅ مكتمل', '🔴 عالية'],
        ['النوافذ العائمة', '✅ مكتمل', '🔴 عالية'],
        ['السحب والإفلات', '✅ مكتمل', '🟡 متوسطة'],
        ['الأدراج الجانبية', '✅ مكتمل', '🟢 منخفضة'],
      ],
    },
    footer: 'جميع العناصر أعلاه ترث اتجاه dir="rtl" من حاوية اللوحة تلقائياً.',
  },
  ltr: {
    badge: 'LTR — Left to Right',
    heading: 'Bidirectional Content Showcase',
    subtitle: 'This panel proves that the dir attribute propagates correctly to panel content.',
    article: {
      title: '📰 Sample Article',
      body: 'The Dockable Desktop window manager is a flexible, powerful platform for building modern desktop applications. It supports multi-pane layouts, floating windows, side drawers, and stacked modals — all with full RTL support.',
      author: 'Author: Development Team',
    },
    form: {
      title: '📝 Input Form',
      name: 'Full Name',
      namePlaceholder: 'Enter your name...',
      email: 'Email Address',
      emailPlaceholder: 'user@example.com',
      notes: 'Notes',
      notesPlaceholder: 'Write your notes here...',
      submit: '✅ Submit',
    },
    table: {
      title: '📊 Project Data',
      headers: ['Feature', 'Status', 'Priority'],
      rows: [
        ['RTL Support', '✅ Complete', '🔴 High'],
        ['Floating Windows', '✅ Complete', '🔴 High'],
        ['Drag & Drop', '✅ Complete', '🟡 Medium'],
        ['Side Drawers', '✅ Complete', '🟢 Low'],
      ],
    },
    footer: 'All elements above inherit the dir="ltr" direction from the panel container automatically.',
  },
};

export const RTLShowcasePanel: React.FC = () => {
  const state = useWindowManagerState();
  const isRtl = state.dir === 'rtl';
  const c = isRtl ? RTL_CONTENT.rtl : RTL_CONTENT.ltr;

  return (
    <div
      className="w-100 h-100 p-3 d-flex flex-column gap-3 text-start overflow-auto"
      style={{ color: 'var(--panel-text)', fontFamily: isRtl ? '"Noto Sans Arabic", "Segoe UI", sans-serif' : 'inherit' }}
    >
      {/* Direction badge */}
      <div className="d-flex align-items-center gap-2">
        <span
          className="badge rounded-pill px-3 py-2"
          style={{
            background: isRtl
              ? 'linear-gradient(135deg, #00b09b, #96c93d)'
              : 'linear-gradient(135deg, #667eea, #764ba2)',
            fontSize: '0.85rem',
            letterSpacing: isRtl ? '0' : '0.5px',
          }}
        >
          {c.badge}
        </span>
        <code className="text-secondary small" style={{ fontFamily: 'var(--bs-font-monospace)' }}>
          dir="{state.dir}"
        </code>
      </div>

      {/* Heading */}
      <div style={{ textAlign: 'start' }}>
        <h5 className="mb-1 fw-bold" style={{ color: 'var(--accent-color)', textAlign: 'start' }}>{c.heading}</h5>
        <p className="text-secondary mb-0 small" style={{ textAlign: 'start' }}>{c.subtitle}</p>
      </div>

      {/* Article card */}
      <div className="rounded-3 p-3" style={{ background: 'var(--panel-card-bg, rgba(255,255,255,0.05))', border: '1px solid var(--border-panel)', textAlign: 'start' }}>
        <h6 className="mb-2" style={{ color: 'var(--panel-title-color)', textAlign: 'start' }}>{c.article.title}</h6>
        <p className="mb-2 small" style={{ lineHeight: '1.7', color: 'var(--panel-text)', textAlign: 'start' }}>{c.article.body}</p>
        <small className="text-secondary fst-italic">{c.article.author}</small>
      </div>

      {/* Table */}
      <div className="rounded-3 p-3" style={{ background: 'var(--panel-card-bg, rgba(255,255,255,0.05))', border: '1px solid var(--border-panel)', textAlign: 'start' }}>
        <h6 className="mb-2" style={{ color: 'var(--panel-title-color)', textAlign: 'start' }}>{c.table.title}</h6>
        <table className="table table-sm table-borderless mb-0 small" style={{ color: 'var(--panel-text)', textAlign: 'start' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-panel)' }}>
              {c.table.headers.map((h, i) => (
                <th key={i} className="py-1 text-secondary fw-normal" style={{ textAlign: 'start' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.table.rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-panel, rgba(255,255,255,0.05))' }}>
                {row.map((cell, j) => (
                  <td key={j} className="py-1" style={{ textAlign: 'start' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form */}
      <div className="rounded-3 p-3" style={{ background: 'var(--panel-card-bg, rgba(255,255,255,0.05))', border: '1px solid var(--border-panel)', textAlign: 'start' }}>
        <h6 className="mb-2" style={{ color: 'var(--panel-title-color)', textAlign: 'start' }}>{c.form.title}</h6>
        <div className="d-flex flex-column gap-2">
          <div>
            <label className="form-label small text-secondary mb-1">{c.form.name}</label>
            <input type="text" className="form-control form-control-sm bg-dark text-white border-secondary" placeholder={c.form.namePlaceholder} style={{ textAlign: 'start' }} />
          </div>
          <div>
            <label className="form-label small text-secondary mb-1">{c.form.email}</label>
            <input type="email" className="form-control form-control-sm bg-dark text-white border-secondary" placeholder={c.form.emailPlaceholder} dir="ltr" />
          </div>
          <div>
            <label className="form-label small text-secondary mb-1">{c.form.notes}</label>
            <textarea className="form-control form-control-sm bg-dark text-white border-secondary" rows={2} placeholder={c.form.notesPlaceholder} style={{ textAlign: 'start' }} />
          </div>
          <button className="btn btn-sm btn-outline-success" style={{ alignSelf: isRtl ? 'flex-end' : 'flex-start' }}>{c.form.submit}</button>
        </div>
      </div>

      {/* Footer note */}
      <div className="text-center small text-secondary fst-italic border-top pt-2" style={{ borderColor: 'var(--border-panel) !important' }}>
        {c.footer}
      </div>
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
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="v3features" />
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
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="contextMenu" />
    });
    PanelRegistry.register('rtlShowcase', RTLShowcasePanel, {
        title: 'RTL Showcase',
        icon: '🔄',
        initialTarget: 'docked',
        renderHeaderActions: (id) => <CodeSnippetButton panelId={id} type="rtlShowcase" />
    });
}
