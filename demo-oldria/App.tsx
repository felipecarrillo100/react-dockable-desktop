import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-bootstrap-submenu/dist/index.css';
import { Navbar, Nav, Container, NavDropdown } from 'react-bootstrap';
import { NavDropdownMenu, DropdownSubmenu } from 'react-bootstrap-submenu';
import {
    DockableDesktopProvider,
    useWindowManagerState,
    useWindowManagerActions,
    WindowManager,
    defaultPredefinedMessages,
    SidePanelRenderer,
    ModalStackRenderer,
    usePanelActions,
    ConfirmationForm,
    Sidebar,
    useFormContainer,
    type ContextMenuPredefinedMessage,
    useFormatMessage,
    formatLabel,
} from '../src/index';
import type { SidebarTab, SidebarHandle } from '../src/index';
import { PanelRegistry } from '../src/index';
import { IntlProvider, useIntl } from 'react-intl';
import { enMessages, esMessages, nlMessages, frMessages } from './i18nMessages';
import { EditAndMeasureIcon, SearchResultsIcon, SettingsIcon, WindowsIcon } from "../demo-luciadria/resources/SvgIcons.tsx";

interface AppProps {
  locale?: string;
  onLocaleChange?: (locale: string) => void;
}

function AppContent({ locale = 'en', onLocaleChange }: AppProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [sidebarPosition, setSidebarPosition] = useState<'left' | 'right'>('right');
  const [windowOpacity, setWindowOpacity] = useState<number>(85);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [enableAnimations, setEnableAnimations] = useState<boolean>(true);
  const sidebarRef = React.useRef<SidebarHandle>(null);
  const state = useWindowManagerState();
  const { openPanel, loadLayout, saveLayout } = useWindowManagerActions();
  const { closePanel, minimizePanel, maximizePanel, focusPanel, restorePanel } = useWindowManagerActions();
  const { openLeftPanel, openRightPanel, openModal } = usePanelActions();
  const formatMessage = useFormatMessage();

  const spawnLeftDrawer = () => {
    openLeftPanel(
      PanelRegistry.get('dirtyForm')?.Component || (() => null),
      {},
      { title: 'Left Side Panel (Dirty Intercept)' }
    );
  };

  const spawnRightDrawer = () => {
    openRightPanel(
      PanelRegistry.get('dirtyForm')?.Component || (() => null),
      {},
      { title: 'Right Side Panel (Dirty Intercept)'}
    );
  };

  const spawnNestedModal = (level: number = 1) => {
    const NestComponent: React.FC = () => {
      return (
        <div className="p-3 text-white text-start">
          <p className="mb-2">This is Nested Modal Level {level}!</p>
          <p className="small text-muted mb-3">Press ESC to close only this topmost modal.</p>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-info"
              onClick={() => spawnNestedModal(level + 1)}
            >
              Open Level {level + 1} Modal
            </button>
          </div>
        </div>
      );
    };

    openModal(NestComponent, {}, { title: `Nested Modal Lvl ${level}`, size: 'small' });
  };

  const spawnConfirmationFormModal = () => {
    openModal(ConfirmationForm, {
      message: 'Are you sure you want to proceed with this high-risk database migration operation?',
      alert: 'Warning: This action will permanently affect 14 active database tables.',
      alertType: 'warning',
      useYesNoTitles: true,
      onOK: () => alert('Confirmed: Yes clicked!'),
      onCancel: () => alert('Cancelled: No clicked!'),
    }, {
      title: 'Confirm Critical System Action',
      size: 'medium',
    });
  };

  const spawnSizeModal = (size: 'small' | 'medium' | 'large' | 'fullscreen' | 'auto') => {
    const ModalContent: React.FC = () => {
      const { requestClose } = useFormContainer();
      const [showLongContent, setShowLongContent] = useState(false);

      return (
        <div className="p-3 text-white text-start d-flex flex-column justify-content-between h-100" style={{ minHeight: '180px' }}>
          <div>
            <h5 className="mb-2">{size.toUpperCase()} Modal</h5>
            <p className="mb-3">This modal has been opened with size preset <code>'{size}'</code>.</p>

            <div className="form-check form-switch mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                role="switch"
                id="longContentSwitch"
                checked={showLongContent}
                onChange={(e) => setShowLongContent(e.target.checked)}
              />
              <label className="form-check-label small text-info" htmlFor="longContentSwitch">
                Inject Long Overflowing Content
              </label>
            </div>

            {showLongContent ? (
              <div className="alert alert-warning small">
                <h6>Overflow Scenario Activated:</h6>
                <p>This paragraph contains a lot of filler text to force the modal container to reach its aspect-ratio limit. Once the threshold height is met, the body should scroll cleanly while the header and footer buttons remain docked in place.</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam feugiat leo ac ex gravida rhoncus. Suspendisse non sapien ex. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vestibulum sed tristique sem. Cras et erat pulvinar, accumsan lorem sed, ultrices eros. Proin vel congue sem. Integer id arcu vitae erat molestie rhoncus sit amet convallis dolor.</p>
                <p>Sed vel nisl et justo mollis rhoncus. Phasellus lacinia nisl massa, non rhoncus ipsum iaculis ac. Quisque ac magna id ante aliquam pulvinar. Mauris sodales magna in dolor accumsan pretium. Ut eu erat in felis efficitur iaculis. Integer rhoncus scelerisque nibh, sit amet convallis magna rhoncus at.</p>
              </div>
            ) : (
              <div className="alert alert-info py-2 px-3 small">
                <strong>Shrink-to-fit Scenario:</strong> Currently displaying minimum content. The modal height wraps this area snugly.
              </div>
            )}
          </div>

          <div className="d-flex justify-content-end gap-2 border-top border-secondary border-opacity-30 pt-3 mt-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => requestClose()}
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                alert(`Submitted ${size} modal!`);
                requestClose();
              }}
            >
              Submit
            </button>
          </div>
        </div>
      );
    };

    openModal(ModalContent, {}, {
      title: `${size.charAt(0).toUpperCase() + size.slice(1)} Modal Preview`,
      size,
    });
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--rdd-window-opacity', String(windowOpacity / 100));
  }, [windowOpacity]);

  useEffect(() => {
    if (showGrid) {
      document.documentElement.classList.add('show-grid');
    } else {
      document.documentElement.classList.remove('show-grid');
    }
  }, [showGrid]);

  useEffect(() => {
    document.documentElement.setAttribute('data-color-scheme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme); // Bootstrap needs its own attribute for bg-body-* variables
    if (theme === 'light') {
      document.documentElement.style.setProperty('--bg-primary', '#f8f9fa');
      document.documentElement.style.setProperty('--bg-workspace', '#e9ecef');
      document.documentElement.style.setProperty('--text-primary', '#212529');
    } else {
      document.documentElement.style.setProperty('--bg-primary', '#090a0f');
      document.documentElement.style.setProperty('--bg-workspace', '#0f1015');
      document.documentElement.style.setProperty('--text-primary', '#f8f9fa');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const spawnFloatingWindow = () => {
    const id = `floating-tool-${Date.now()}`;
    openPanel(id, 'help', { title: `Utility Tool`, initialTarget: 'floating' });
  };

  const spawnLuciadMapWindow = () => {
    const id = `luciad-map-${Date.now()}`;
    openPanel(id, 'luciadMap', { title: `LuciadRIA Earth 3D`, initialTarget: 'floating' });
  };

  const resetWorkspaceLayout = React.useCallback(() => {
    const initialConfig = JSON.stringify({
      gridRoot: {
        type: 'branch',
        orientation: 'horizontal',
        sizes: [0.72, 0.28],
        children: [
          {
            type: 'branch',
            orientation: 'vertical',
            sizes: [0.65, 0.35],
            children: [
              {
                type: 'leaf',
                id: 'group-left-top',
                panels: ['main-map', 'main-editor'],
                activePanelId: 'main-map',
              },
              {
                type: 'leaf',
                id: 'group-left-bottom',
                panels: ['system-console', 'help-docs'],
                activePanelId: 'system-console',
              }
            ]
          },
          {
            type: 'leaf',
            id: 'group-right-sidebar',
            panels: ['control-center'],
            activePanelId: 'control-center',
          }
        ]
      },
      floating: [],
      minimized: [],
      panels: {
        'main-map': { id: 'main-map', title: 'Main Map', component: 'mainMap', state: 'docked' },
        'main-editor': { id: 'main-editor', title: 'Code Editor', component: 'editor', state: 'docked' },
        'system-console': { id: 'system-console', title: 'Console Output', component: 'terminal', state: 'docked' },
        'help-docs': { id: 'help-docs', title: 'Help Center', component: 'help', state: 'docked' },
        'control-center': { id: 'control-center', title: 'Control Center', component: 'showcaseControl', state: 'docked' }
      }
    });
    loadLayout(initialConfig);
  }, [loadLayout]);

  const applyDeveloperLayout = React.useCallback(() => {
    const devConfig = JSON.stringify({
      gridRoot: {
        type: 'branch',
        orientation: 'horizontal',
        sizes: [0.72, 0.28],
        children: [
          {
            type: 'branch',
            orientation: 'vertical',
            sizes: [0.65, 0.35],
            children: [
              {
                type: 'branch',
                orientation: 'horizontal',
                sizes: [0.55, 0.45],
                children: [
                  {
                    type: 'leaf',
                    id: 'dev-map',
                    panels: ['main-map'],
                    activePanelId: 'main-map',
                  },
                  {
                    type: 'leaf',
                    id: 'dev-editor',
                    panels: ['main-editor', 'help-docs'],
                    activePanelId: 'main-editor',
                  }
                ]
              },
              {
                type: 'leaf',
                id: 'dev-console',
                panels: ['system-console'],
                activePanelId: 'system-console',
              }
            ]
          },
          {
            type: 'leaf',
            id: 'dev-control',
            panels: ['control-center'],
            activePanelId: 'control-center',
          }
        ]
      },
      floating: [
        { id: 'dev-layertree', x: 20, y: 60, width: 260, height: 380, z: 1000 }
      ],
      minimized: [],
      panels: {
        'main-map': { id: 'main-map', title: 'Main Map', component: 'mainMap', state: 'docked' },
        'main-editor': { id: 'main-editor', title: 'Code Editor', component: 'editor', state: 'docked' },
        'system-console': { id: 'system-console', title: 'Console Output', component: 'terminal', state: 'docked' },
        'help-docs': { id: 'help-docs', title: 'Help Center', component: 'help', state: 'docked' },
        'dev-layertree': { id: 'dev-layertree', title: 'Layer Tree', component: 'layertree', state: 'floating' },
        'control-center': { id: 'control-center', title: 'Control Center', component: 'showcaseControl', state: 'docked' }
      }
    });
    loadLayout(devConfig);
  }, [loadLayout]);

  const applyEditorOnlyLayout = React.useCallback(() => {
    const editorConfig = JSON.stringify({
      gridRoot: {
        type: 'branch',
        orientation: 'horizontal',
        sizes: [0.72, 0.28],
        children: [
          {
            type: 'branch',
            orientation: 'vertical',
            sizes: [0.75, 0.25],
            children: [
              {
                type: 'leaf',
                id: 'editor-main',
                panels: ['main-editor'],
                activePanelId: 'main-editor'
              },
              {
                type: 'leaf',
                id: 'editor-console',
                panels: ['system-console'],
                activePanelId: 'system-console'
              }
            ]
          },
          {
            type: 'leaf',
            id: 'editor-control',
            panels: ['control-center'],
            activePanelId: 'control-center'
          }
        ]
      },
      floating: [
        { id: 'editor-preview', x: 300, y: 100, width: 380, height: 280, z: 1000 }
      ],
      minimized: [],
      panels: {
        'main-editor': { id: 'main-editor', title: 'Code Editor', component: 'editor', state: 'docked' },
        'system-console': { id: 'system-console', title: 'Console Output', component: 'terminal', state: 'docked' },
        'editor-preview': { id: 'editor-preview', title: 'Sandbox Widget', component: 'preview', state: 'floating' },
        'control-center': { id: 'control-center', title: 'Control Center', component: 'showcaseControl', state: 'docked' }
      }
    });
    loadLayout(editorConfig);
  }, [loadLayout]);

  const applyDataAnalysisLayout = React.useCallback(() => {
    const dataConfig = JSON.stringify({
      gridRoot: {
        type: 'branch',
        orientation: 'horizontal',
        sizes: [0.72, 0.28],
        children: [
          {
            type: 'branch',
            orientation: 'vertical',
            sizes: [0.6, 0.4],
            children: [
              {
                type: 'branch',
                orientation: 'horizontal',
                sizes: [0.6, 0.4],
                children: [
                  {
                    type: 'leaf',
                    id: 'data-map',
                    panels: ['main-map'],
                    activePanelId: 'main-map'
                  },
                  {
                    type: 'leaf',
                    id: 'data-tools',
                    panels: ['help-docs', 'toolpanels-main'],
                    activePanelId: 'help-docs'
                  }
                ]
              },
              {
                type: 'leaf',
                id: 'data-table',
                panels: ['table-main'],
                activePanelId: 'table-main'
              }
            ]
          },
          {
            type: 'leaf',
            id: 'data-control',
            panels: ['control-center'],
            activePanelId: 'control-center'
          }
        ]
      },
      floating: [
        { id: 'data-overview', x: 30, y: 80, width: 240, height: 200, z: 1000 }
      ],
      minimized: [],
      panels: {
        'main-map': { id: 'main-map', title: 'Main Map', component: 'mainMap', state: 'docked' },
        'help-docs': { id: 'help-docs', title: 'Help Center', component: 'help', state: 'docked' },
        'toolpanels-main': { id: 'toolpanels-main', title: 'Toolbox', component: 'toolpanels', state: 'docked' },
        'table-main': { id: 'table-main', title: 'Attribute Table', component: 'table', state: 'docked' },
        'data-overview': { id: 'data-overview', title: 'Overview Map', component: 'overviewmap', state: 'floating' },
        'control-center': { id: 'control-center', title: 'Control Center', component: 'showcaseControl', state: 'docked' }
      }
    });
    loadLayout(dataConfig);
  }, [loadLayout]);

  // Listen for control center custom events
  useEffect(() => {
    const handleSkin = (e: any) => setSkin(e.detail);
    const handleTheme = () => toggleTheme();
    const handleLayout = (e: any) => {
      switch (e.detail) {
        case 'default': resetWorkspaceLayout(); break;
        case 'developer': applyDeveloperLayout(); break;
        case 'editor': applyEditorOnlyLayout(); break;
        case 'data': applyDataAnalysisLayout(); break;
      }
    };

    window.addEventListener('demo-change-skin', handleSkin);
    window.addEventListener('demo-change-theme', handleTheme);
    window.addEventListener('demo-apply-layout', handleLayout);

    return () => {
      window.removeEventListener('demo-change-skin', handleSkin);
      window.removeEventListener('demo-change-theme', handleTheme);
      window.removeEventListener('demo-apply-layout', handleLayout);
    };
  }, [toggleTheme, resetWorkspaceLayout, applyDeveloperLayout, applyEditorOnlyLayout, applyDataAnalysisLayout]);

  // Initial layout loading effect
  useEffect(() => {
    const saved = localStorage.getItem('custom_window_layout');
    if (saved) {
      loadLayout(saved);
    } else {
      resetWorkspaceLayout();
    }
  }, [loadLayout, resetWorkspaceLayout]);

  // Save/Load layout helpers
  const handleSaveToLocalStorage = () => {
    const saved = saveLayout();
    localStorage.setItem('custom_window_layout', saved);
    alert('Layout saved to Local Storage!');
  };

  const handleLoadFromLocalStorage = () => {
    const saved = localStorage.getItem('custom_window_layout');
    if (saved) {
      loadLayout(saved);
    } else {
      alert('No saved layout found in Local Storage.');
    }
  };

  const N = 8;
  const openPanelsList = Object.values(state.panels).filter(p => p.state !== 'minimized');
  const visiblePanels = openPanelsList.slice(0, N);
  const hasMore = openPanelsList.length > N;

  const sidebarTabs: SidebarTab[] = [
    {
      id: 'search',
      label: 'Search Results',
      icon: SearchResultsIcon,
      renderContent: (_tabId, _onClose, _onOpen) => (
        <div className="p-3">
          <h6 className="text-uppercase font-monospace text-secondary mb-3" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>Search Results</h6>
          <div className="d-flex flex-column gap-3 text-start small">
            <div className="position-relative">
              <input type="text" className="form-control form-control-sm bg-dark border-secondary text-white pe-4" placeholder="Search workspace..." defaultValue="Workspace" />
              <span className="position-absolute end-0 top-50 translate-middle-y me-2 text-secondary">🔍</span>
            </div>
            <div className="text-secondary mb-1">3 matches found:</div>
            <div className="p-2 bg-dark-subtle rounded border border-secondary-subtle">
              <div className="fw-semibold text-info">Workspace.tsx</div>
              <div className="text-muted text-truncate" style={{ fontSize: '0.75rem' }}>Line 18: const DockableWorkspace...</div>
            </div>
            <div className="p-2 bg-dark-subtle rounded border border-secondary-subtle">
              <div className="fw-semibold text-info">App.tsx</div>
              <div className="text-muted text-truncate" style={{ fontSize: '0.75rem' }}>Line 213: &lt;Workspace onApiReady...</div>
            </div>
            <div className="p-2 bg-dark-subtle rounded border border-secondary-subtle">
              <div className="fw-semibold text-info">index.css</div>
              <div className="text-muted text-truncate" style={{ fontSize: '0.75rem' }}>Line 40: .workspace-grid &#123;</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'edit_measure',
      label: 'Edit and Measure',
      icon: EditAndMeasureIcon,
      eagerMount: true,
      renderContent: (_tabId, _onClose, _onOpen) => (
        <div className="p-3">
          <h6 className="text-uppercase font-monospace text-secondary mb-3" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>Edit &amp; Measure</h6>
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
              <button type="button" className="btn btn-sm btn-outline-light w-100" onClick={_onClose}>Close</button>
              <button type="button" className="btn btn-sm btn-outline-light w-100">Clear Measure Guides</button>
              <button type="button" className="btn btn-sm btn-primary w-100">Apply Edits</button>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'windows',
      label: 'Windows List',
      icon: WindowsIcon,
      renderContent: () => {
        const openPanels = Object.values(state.panels)
          .filter(p => p.state !== 'minimized')
          .map(p => {
            const options = PanelRegistry.get(p.component)?.defaultOptions;
            const isMax = p.state === 'floating' && state.floating.find(w => w.id === p.id)?.maximized;
            return {
              id: p.id,
              title: formatLabel(p.title, formatMessage),
              component: p.component,
              isFloating: p.state === 'floating',
              isMaximized: !!isMax,
              canMinimize: options?.canMinimize !== false,
              canClose: options?.canClose !== false,
            };
          });

        const minimizedList = state.minimized.map(p => {
          const options = PanelRegistry.get(p.component)?.defaultOptions;
          return {
            id: p.id,
            title: formatLabel(p.title, formatMessage),
            canClose: options?.canClose !== false,
          };
        });

        return (
          <div className="p-3 text-start">
            <h6 className="text-uppercase font-monospace text-secondary mb-3" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>Open Windows ({openPanels.length})</h6>
            {openPanels.length === 0 ? (
              <div className="text-muted small mb-4">No active windows</div>
            ) : (
              <div className="d-flex flex-column gap-2 mb-4">
                {openPanels.map(panel => (
                  <div key={panel.id} className="sb-card">
                    <div className="d-flex align-items-center justify-content-between">
                      <span className="sb-card-title">{panel.title}</span>
                      <span className="sb-badge">{panel.isFloating ? 'Float' : 'Grid'}</span>
                    </div>
                    <div className="d-flex align-items-center justify-content-between border-top border-secondary-subtle pt-1 mt-1">
                      <button type="button" className="sb-btn-outline" onClick={() => focusPanel(panel.id)}>Front</button>
                      <div className="d-flex gap-2">
                        {panel.canMinimize && (
                          <button type="button" className="btn btn-link text-white-50 p-0 text-decoration-none" title="Minimize" onClick={() => minimizePanel(panel.id)} style={{ fontSize: '0.85rem' }}>_</button>
                        )}
                        {panel.isFloating && (
                          <button type="button" className="btn btn-link text-white-50 p-0 text-decoration-none" title="Maximize" onClick={() => maximizePanel(panel.id)} style={{ fontSize: '0.8rem' }}>{panel.isMaximized ? '🗗' : '🗖'}</button>
                        )}
                        {panel.canClose && (
                          <button type="button" className="btn btn-link text-danger p-0 text-decoration-none fw-bold" title="Close" onClick={() => closePanel(panel.id)} style={{ fontSize: '0.8rem' }}>✕</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h6 className="text-uppercase font-monospace text-secondary mb-3" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>Minimized ({minimizedList.length})</h6>
            {minimizedList.length === 0 ? (
              <div className="text-muted small">No minimized windows</div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {minimizedList.map(panel => (
                  <div key={panel.id} className="sb-card">
                    <div className="d-flex align-items-center justify-content-between">
                      <span className="sb-card-title">{panel.title}</span>
                      <span className="sb-badge">Min</span>
                    </div>
                    <div className="d-flex align-items-center justify-content-between border-top border-secondary-subtle pt-1 mt-1">
                      <button type="button" className="sb-btn-outline" onClick={() => restorePanel(panel.id)}>Restore</button>
                      {panel.canClose && (
                        <button type="button" className="btn btn-link text-danger p-0 text-decoration-none fw-bold" title="Close" onClick={() => closePanel(panel.id)} style={{ fontSize: '0.8rem' }}>✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: SettingsIcon,
      renderContent: (_tabId, _onClose, _onOpen) => (
        <div className="p-3">
          <h6 className="text-uppercase font-monospace text-secondary mb-3" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>Settings</h6>
          <div className="small text-white-50 text-start d-flex flex-column gap-3">
            <div>
              <label className="form-label d-block mb-1 text-white">Window Opacity</label>
              <div className="d-flex align-items-center gap-2">
                <input type="range" className="form-range" min="20" max="100" value={windowOpacity} onChange={e => setWindowOpacity(Number(e.target.value))} />
                <span className="text-white font-monospace small">{windowOpacity}%</span>
              </div>
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="gridSwitch" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
              <label className="form-check-input-label text-white ms-1" htmlFor="gridSwitch">Show Grid Pattern</label>
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="animationSwitch" checked={enableAnimations} onChange={e => setEnableAnimations(e.target.checked)} />
              <label className="form-check-input-label text-white ms-1" htmlFor="animationSwitch">Enable Animations</label>
            </div>
            <div className="mt-2 border-top border-secondary-subtle pt-3">
              <label className="form-label d-block mb-1 text-white small font-monospace text-uppercase">Sidebar Position</label>
              <select className="form-select form-select-sm bg-dark border-secondary text-white font-monospace" value={sidebarPosition} onChange={e => setSidebarPosition(e.target.value as 'left' | 'right')}>
                <option value="right">Right Side</option>
                <option value="left">Left Side</option>
              </select>
            </div>
            <div className="mt-2 border-top border-secondary-subtle pt-3">
              <label className="form-label d-block mb-1 text-white small font-monospace text-uppercase">Workspace Language</label>
              <select className="form-select form-select-sm bg-dark border-secondary text-white font-monospace" value={locale} onChange={e => onLocaleChange?.(e.target.value)}>
                <option value="en">English (EN)</option>
                <option value="es">Español (ES)</option>
                <option value="nl">Nederlands (NL)</option>
                <option value="fr">Français (FR)</option>
              </select>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="full-viewport-layout">
      {/* Top Navbar */}
      <Navbar collapseOnSelect expand="lg" bg={theme} variant={theme} className="border-bottom border-secondary-subtle py-2 px-3 shadow-sm" style={{ zIndex: 10000 }}>
        <Container fluid>
          <Navbar.Brand className="fw-bold d-flex align-items-center gap-2" style={{ cursor: 'default' }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
              <path d="M16 12H9" />
            </svg>
            <span>Old LuciadRIA Desktop</span>
          </Navbar.Brand>

          <Navbar.Toggle aria-controls="responsive-navbar-nav" />
          <Navbar.Collapse id="responsive-navbar-nav">
            <Nav className="me-auto font-monospace align-items-center" style={{ fontSize: '0.85rem' }}>
              <span className="navbar-text me-3 font-monospace text-primary bg-primary bg-opacity-10 px-2 py-0.5 rounded border border-primary border-opacity-25" style={{ fontSize: '0.75rem' }}>
                🚀 Old RIA Earth 3D
              </span>

              {/* Presets and layout control */}
              <NavDropdownMenu title="Workspace Presets" id="presets-dropdown">
                <NavDropdown.Item onClick={resetWorkspaceLayout}>Reset Default Grid</NavDropdown.Item>
                <NavDropdown.Item onClick={spawnFloatingWindow}>Spawn Floating Window</NavDropdown.Item>
                <NavDropdown.Item onClick={spawnLuciadMapWindow}>Spawn LuciadRIA Earth</NavDropdown.Item>
                <NavDropdown.Divider />
                <DropdownSubmenu title="Layout Templates">
                  <NavDropdown.Item onClick={applyDeveloperLayout}>🗺️ Developer (Map + Editor + Console)</NavDropdown.Item>
                  <NavDropdown.Item onClick={applyEditorOnlyLayout}>✏️ Editor Focus (Code + Console)</NavDropdown.Item>
                  <NavDropdown.Item onClick={applyDataAnalysisLayout}>📊 Data Analysis (Map + Table)</NavDropdown.Item>
                </DropdownSubmenu>
              </NavDropdownMenu>

              {/* Tools and components spawning */}
              <NavDropdownMenu title="Spawn Tools" id="tools-dropdown">
                <NavDropdown.Item onClick={() => openPanel('layertree-main', 'layertree')}>🌿 Layer Tree</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel('timecontrol-main', 'timecontrol')}>⏱ Time Control</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel('overviewmap-main', 'overviewmap')}>🗺 Overview Map</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel('table-main', 'table')}>📋 Attribute Table</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel('toolpanels-main', 'toolpanels')}>🔧 Operations Toolbox</NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item onClick={() => openPanel('dirtyform-main', 'dirtyForm')}>⚠️ Intercept Form (Floating)</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel('dirtyeditor-main', 'dirtyEditor')}>📝 Intercept Editor (Tabbed)</NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item onClick={spawnLeftDrawer}>🚪 Left Side Panel Drawer</NavDropdown.Item>
                <NavDropdown.Item onClick={spawnRightDrawer}>🚪 Right Side Panel Drawer</NavDropdown.Item>
                <NavDropdown.Item onClick={() => spawnNestedModal(1)}>🥞 Stacked Nested Modals</NavDropdown.Item>
                <NavDropdown.Item onClick={spawnConfirmationFormModal}>❓ Reusable ConfirmationForm</NavDropdown.Item>
                <DropdownSubmenu title="💬 Modals by Size">
                  <NavDropdown.Item onClick={() => spawnSizeModal('small')}>🔹 Small (360px)</NavDropdown.Item>
                  <NavDropdown.Item onClick={() => spawnSizeModal('medium')}>🔸 Medium (560px)</NavDropdown.Item>
                  <NavDropdown.Item onClick={() => spawnSizeModal('large')}>🟩 Large (800px)</NavDropdown.Item>
                  <NavDropdown.Item onClick={() => spawnSizeModal('fullscreen')}>🖥️ Fullscreen</NavDropdown.Item>
                  <NavDropdown.Item onClick={() => spawnSizeModal('auto')}>⚡ Auto (fits content)</NavDropdown.Item>
                </DropdownSubmenu>
                <NavDropdown.Divider />
                <NavDropdown.Item onClick={spawnFloatingWindow}>🪟 Spawn Help Window</NavDropdown.Item>
              </NavDropdownMenu>

              {/* Elements dropdown */}
              <NavDropdownMenu title={`Active Elements (${openPanelsList.length})`} id="elements-dropdown">
                {visiblePanels.map(p => (
                  <NavDropdown.Item
                    key={p.id}
                    onClick={() => openPanel(p.id, p.component)}
                    className="small text-truncate"
                    style={{ maxWidth: '200px' }}
                  >
                    🟢 {formatLabel(p.title, formatMessage)} ({p.state})
                  </NavDropdown.Item>
                ))}
                {openPanelsList.length === 0 && (
                  <NavDropdown.Item className="text-muted small disabled">No active windows</NavDropdown.Item>
                )}
                <>
                  <NavDropdown.Divider />
                  <NavDropdown.Item
                    onClick={() => openPanel('manager-panel', 'panelmanager', { title: 'Panel Registry Explorer', initialTarget: 'floating' })}
                    className="text-info fw-bold text-center small"
                  >
                    Show All {hasMore ? `(${openPanelsList.length - N} more)` : ''}
                  </NavDropdown.Item>
                </>
              </NavDropdownMenu>

              {/* Save / Load layout actions */}
              <NavDropdownMenu title="Session Layout" id="layout-dropdown">
                <NavDropdown.Item onClick={handleSaveToLocalStorage}>💾 Save Layout</NavDropdown.Item>
                <NavDropdown.Item onClick={handleLoadFromLocalStorage}>📂 Load Layout</NavDropdown.Item>
              </NavDropdownMenu>
            </Nav>

            <Nav className="align-items-center gap-3">
              {/* Reset Layout Shortcut */}
              <button
                type="button"
                onClick={resetWorkspaceLayout}
                className="btn btn-sm btn-outline-info d-flex align-items-center gap-1 font-monospace"
                style={{ fontSize: '0.75rem' }}
                title="Restore default panels layout"
              >
                Reset Grid
              </button>

              {/* Spawn Floating Window */}
              <button
                type="button"
                onClick={spawnFloatingWindow}
                className="btn btn-sm btn-primary d-flex align-items-center gap-1 font-monospace"
                style={{ fontSize: '0.75rem' }}
                title="Create a new floating tool window"
              >
                + Float Window
              </button>

              {/* Spawn Luciad Map */}
              <button
                type="button"
                onClick={spawnLuciadMapWindow}
                className="btn btn-sm btn-success d-flex align-items-center gap-1 font-monospace"
                style={{ fontSize: '0.75rem' }}
                title="Create a new floating LuciadRIA 3D Earth map (EPSG:4978)"
              >
                + LuciadRIA EPSG:4978
              </button>

              {/* Theme Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center p-2 rounded-circle"
                style={{ width: '36px', height: '36px' }}
                title="Toggle Dark/Light Theme"
              >
                {theme === 'dark' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2" />
                    <path d="M12 20v2" />
                    <path d="m4.93 4.93 1.41 1.41" />
                    <path d="m17.66 17.66 1.41 1.41" />
                    <path d="M2 12h2" />
                    <path d="M20 12h2" />
                    <path d="m6.34 17.66-1.41 1.41" />
                    <path d="m19.07 4.93-1.41 1.41" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                )}
              </button>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      {/* Main Container: Sidebar + WindowManager */}
      <div className="flex-grow-1 w-100 d-flex flex-row overflow-hidden" style={{ position: 'relative' }}>
        <Sidebar
          ref={sidebarRef}
          position={sidebarPosition}
          tabs={sidebarTabs}
        >
          <WindowManager animations={enableAnimations} />
        </Sidebar>
        <SidePanelRenderer />
      </div>
      <ModalStackRenderer />
    </div>
  );
}

const messagesMap: Record<string, Record<string, string>> = {
  en: enMessages,
  es: esMessages,
  nl: nlMessages,
  fr: frMessages
};

interface AppWithIntlProps extends AppProps {
  locale: string;
  onLocaleChange: (locale: string) => void;
}

function AppWithIntl({ locale, onLocaleChange }: AppWithIntlProps) {
  const intl = useIntl();

  const handleFormatMessage = (msg: ContextMenuPredefinedMessage) => {
    return intl.formatMessage({ id: msg.id, defaultMessage: msg.defaultMessage }, msg.values);
  };

  return (
    <DockableDesktopProvider formatMessage={handleFormatMessage} predefinedMessages={defaultPredefinedMessages}>
      <AppContent locale={locale} onLocaleChange={onLocaleChange} />
    </DockableDesktopProvider>
  );
}

export function App() {
  const [locale, setLocale] = useState<string>('en');

  return (
    <IntlProvider locale={locale} messages={messagesMap[locale] || enMessages}>
      <AppWithIntl locale={locale} onLocaleChange={setLocale} />
    </IntlProvider>
  );
}

export default App;
