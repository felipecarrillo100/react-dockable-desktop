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
    Toolbar,
    useMergedToolbarItems,
    useMergedSidebarTabs,
    useFormContainer,
    type ContextMenuPredefinedMessage,
    useFormatMessage,
    formatLabel,
    toast,
    ToastContainer,
} from '../src/index';
import type { SidebarTab, SidebarHandle, ToolbarItem } from '../src/index';
import { PanelRegistry } from '../src/index';
import { IntlProvider, useIntl } from 'react-intl';
import { enMessages, esMessages, nlMessages, frMessages, zhMessages, arMessages } from './i18nMessages';
import {
    EditAndMeasureIcon, SearchResultsIcon, SettingsIcon, WindowsIcon,
    MinimizeIcon, MaximizeIcon, RestoreIcon, CloseIcon,
} from "./resources/SvgIcons.tsx";

interface AppProps {
  locale?: string;
  onLocaleChange?: (locale: string) => void;
  rtlLayout?: boolean;
  setRtlLayout?: (val: boolean) => void;
}

function AppContent({ locale = 'en', onLocaleChange, rtlLayout = false, setRtlLayout }: AppProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [skin, setSkin] = useState<string>('vscode');
  const [sidebarPosition, setSidebarPosition] = useState<'left' | 'right'>('left');
  const [windowOpacity, setWindowOpacity] = useState<number>(85);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [enableAnimations, setEnableAnimations] = useState<boolean>(true);
  const [showToolbar, setShowToolbar] = useState<boolean>(true);
  const [toolbarPosition, setToolbarPosition] = useState<'left' | 'right' | 'top' | 'bottom'>('right');
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<string | null>(null);
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
        <div className="p-3 text-white">
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
        <div className="p-3 text-white d-flex flex-column justify-content-between h-100" style={{ minHeight: '180px' }}>
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
    document.documentElement.style.setProperty('--rdd-toast-offset-top', '68px');
  }, []);

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
      document.documentElement.style.setProperty('--rdd-bg-primary', '#f8f9fa');
      document.documentElement.style.setProperty('--rdd-bg-workspace', '#e9ecef');
      document.documentElement.style.setProperty('--rdd-text-primary', '#212529');
    } else {
      document.documentElement.style.setProperty('--rdd-bg-primary', '#090a0f');
      document.documentElement.style.setProperty('--rdd-bg-workspace', '#0f1015');
      document.documentElement.style.setProperty('--rdd-text-primary', '#f8f9fa');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const spawnFloatingWindow = () => {
    const id = `floating-tool-${Date.now()}`;
    openPanel(id, 'help', { title: `Utility Tool`, initialTarget: 'floating' });
  };

  const spawnLeafletMapWindow = () => {
    const id = `leaflet-map-${Date.now()}`;
    openPanel(id, 'luciadMap', { title: `Leaflet Map`, initialTarget: 'floating' });
  };

  const resetWorkspaceLayout = React.useCallback(() => {
    const initialConfig = JSON.stringify({
      gridRoot: {
        type: 'branch',
        orientation: 'horizontal',
        sizes: [0.8, 0.2],
        children: [
          {
            type: 'branch',
            orientation: 'vertical',
            sizes: [0.8, 0.2],
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
    const handleSkin = (e: CustomEvent<string>) => setSkin(e.detail);
    const handleTheme = () => toggleTheme();
    const handleLayout = (e: CustomEvent<string>) => {
      switch (e.detail) {
        case 'default': resetWorkspaceLayout(); break;
        case 'developer': applyDeveloperLayout(); break;
        case 'editor': applyEditorOnlyLayout(); break;
        case 'data': applyDataAnalysisLayout(); break;
      }
    };

    window.addEventListener('demo-change-skin', handleSkin as EventListener);
    window.addEventListener('demo-change-theme', handleTheme);
    window.addEventListener('demo-apply-layout', handleLayout as EventListener);

    return () => {
      window.removeEventListener('demo-change-skin', handleSkin as EventListener);
      window.removeEventListener('demo-change-theme', handleTheme);
      window.removeEventListener('demo-apply-layout', handleLayout as EventListener);
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

  // Elements listing for navbar dropdown
  const N = 8;
  const openPanelsList = Object.values(state.panels).filter(p => p.state !== 'minimized');
  const visiblePanels = openPanelsList.slice(0, N);
  const hasMore = openPanelsList.length > N;

  // ---- Toolbar item definitions ----
  const toolbarItems: ToolbarItem[] = [
    {
      type: 'group',
      id: 'draw-tool',
      label: 'Drawing Tools',
      activeItemId: activeTool,
      onActiveItemChange: (id) => setActiveTool(id),
      defaultIcon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 2l9 5.5-4 1L6.5 13 3 2z" />
        </svg>
      ),
      items: [
        {
          id: 'tool-cursor',
          label: 'Select / Cursor',
          shortcut: 'V',
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2l9 5.5-4 1L6.5 13 3 2z" />
            </svg>
          ),
        },
        {
          id: 'tool-pen',
          label: 'Draw / Pen',
          shortcut: 'P',
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 2l3 3-8 8H3v-3L11 2z" />
            </svg>
          ),
        },
        {
          id: 'tool-ruler',
          label: 'Measure / Ruler',
          shortcut: 'M',
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="12" height="4" rx="0.5" />
              <line x1="5" y1="6" x2="5" y2="8" />
              <line x1="8" y1="6" x2="8" y2="9" />
              <line x1="11" y1="6" x2="11" y2="8" />
            </svg>
          ),
        },
        { type: 'separator' },
        {
          id: 'tool-eraser',
          label: 'Erase',
          shortcut: 'E',
          icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L13 6 6 13H3v-3L10 3z" />
              <line x1="7" y1="5" x2="11" y2="9" />
            </svg>
          ),
        },
      ],
    },
    {
      type: 'action',
      id: 'map-revert',
      label: 'Simulate Map Revert (clears active tool)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8a5 5 0 1 0 1.5-3.5" />
          <polyline points="1 4 3 8 7 6" />
        </svg>
      ),
      onClick: () => setActiveTool(null),
    },
    { type: 'separator' },
    {
      type: 'toggle', id: 'snap-to-grid', label: 'Snap to Grid',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="4" r="1" />
          <circle cx="8" cy="4" r="1" />
          <circle cx="12" cy="4" r="1" />
          <circle cx="4" cy="8" r="1" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="12" cy="8" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="8" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
        </svg>
      ),
    },
    {
      type: 'toggle', id: 'show-grid-overlay', label: 'Show Grid Overlay',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="12" height="12" rx="1" />
          <line x1="6.67" y1="2" x2="6.67" y2="14" />
          <line x1="10.33" y1="2" x2="10.33" y2="14" />
          <line x1="2" y1="6.67" x2="14" y2="6.67" />
          <line x1="2" y1="10.33" x2="14" y2="10.33" />
        </svg>
      ),
    },
    { type: 'separator' },
    {
      type: 'action', id: 'open-layers', label: 'Open Layer Tree',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="8 2 2 5.5 8 9 14 5.5 8 2" />
          <polyline points="2 10.5 8 14 14 10.5" />
          <polyline points="2 7.5 8 11 14 7.5" />
        </svg>
      ),
      onClick: () => openPanel('layertree-main', 'layertree'),
    },
  ];

  // Merge in whatever the currently active panel has contributed (e.g. the Markdown
  // Editor's formatting buttons) — only appended when there's actually something to show.
  const mergedToolbarItems = useMergedToolbarItems(toolbarItems);

  // ---- Sidebar Tab definitions (all state captured by closure) ----
  const sidebarTabs: SidebarTab[] = [
    {
      id: 'search',
      label: 'Search Results',
      icon: (SearchResultsIcon),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      renderContent: (_tabId, _onClose, _onOpen) => (
        <div className="sb-section">
          <div className="sb-section-title">Search Results</div>
          <div className="sb-field">
            <div style={{ position: 'relative' }}>
              <input type="text" className="sb-input" placeholder="Search workspace..." defaultValue="Workspace"
                style={{ paddingRight: '28px' }} />
              <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.45, display: 'flex' }}>
                {SearchResultsIcon}
              </span>
            </div>
          </div>
          <div className="sb-empty-state" style={{ textAlign: 'start', marginBottom: '8px' }}>3 matches found:</div>
          <div className="sb-card">
            <div className="sb-card-title">Workspace.tsx</div>
            <div className="sb-card-meta">Line 18: const DockableWorkspace...</div>
          </div>
          <div className="sb-card">
            <div className="sb-card-title">App.tsx</div>
            <div className="sb-card-meta">Line 213: &lt;Workspace onApiReady...</div>
          </div>
          <div className="sb-card">
            <div className="sb-card-title">index.css</div>
            <div className="sb-card-meta">Line 40: .workspace-grid &#123;</div>
          </div>
        </div>
      ),
    },
    {
      id: 'edit_measure',
      label: 'Edit and Measure',
      icon: (EditAndMeasureIcon),
      eagerMount: true,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      renderContent: (_tabId, _onClose, _onOpen) => (
        <div className="sb-section">
          <div className="sb-section-title">Edit &amp; Measure</div>
          <div className="sb-field">
            <label className="sb-label">Measurement Mode</label>
            <select className="sb-select">
              <option>Ruler (Distance)</option>
              <option>Protractor (Angle)</option>
              <option>Area Calculator</option>
            </select>
          </div>
          <div className="sb-field">
            <label className="sb-label">Edit Brush Size</label>
            <div className="sb-field-row">
              <input type="range" className="sb-range" min="1" max="50" defaultValue="15" />
              <span className="sb-field-value">15px</span>
            </div>
          </div>
          <div className="sb-separator" />
          <button type="button" className="sb-btn-outline" style={{ width: '100%' }} onClick={_onClose}>Close Panel</button>
          <button type="button" className="sb-btn-outline" style={{ width: '100%', marginTop: '8px' }}>Clear Measure Guides</button>
          <button type="button" className="sb-btn" style={{ width: '100%', marginTop: '8px' }}>Apply Edits</button>
        </div>
      ),
    },
    {
      id: 'windows',
      label: 'Windows List',
      icon: (WindowsIcon),
      renderContent: () => {
        // Derives panel lists from WindowManager state via closure
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
          <div className="sb-section">
            <div className="sb-section-title">Open Windows ({openPanels.length})</div>
            {openPanels.length === 0 ? (
              <div className="sb-empty-state">No active windows</div>
            ) : (
              openPanels.map(panel => (
                <div key={panel.id} className="sb-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span className="sb-card-title">{panel.title}</span>
                    <span className="sb-badge">{panel.isFloating ? 'Float' : 'Grid'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button type="button" className="sb-btn-outline" onClick={() => focusPanel(panel.id)}>Front</button>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {panel.canMinimize && (
                        <button type="button" className="sb-btn-ghost" title="Minimize" onClick={() => minimizePanel(panel.id)}>{MinimizeIcon}</button>
                      )}
                      {panel.isFloating && (
                        <button type="button" className="sb-btn-ghost" title={panel.isMaximized ? 'Restore' : 'Maximize'} onClick={() => maximizePanel(panel.id)}>
                          {panel.isMaximized ? RestoreIcon : MaximizeIcon}
                        </button>
                      )}
                      {panel.canClose && (
                        <button type="button" className="sb-btn-ghost danger" title="Close" onClick={() => closePanel(panel.id)}>{CloseIcon}</button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            <div className="sb-separator" />
            <div className="sb-section-title">Minimized ({minimizedList.length})</div>
            {minimizedList.length === 0 ? (
              <div className="sb-empty-state">No minimized windows</div>
            ) : (
              minimizedList.map(panel => (
                <div key={panel.id} className="sb-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span className="sb-card-title">{panel.title}</span>
                    <span className="sb-badge">Min</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button type="button" className="sb-btn-outline" onClick={() => restorePanel(panel.id)}>Restore</button>
                    {panel.canClose && (
                      <button type="button" className="sb-btn-ghost danger" title="Close" onClick={() => closePanel(panel.id)}>{CloseIcon}</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        );
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (SettingsIcon),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      renderContent: (_tabId, _onClose, _onOpen) => (
        <div className="sb-section">
          <div className="sb-section-title">Settings</div>

          <div className="sb-field">
            <label className="sb-label">Window Opacity</label>
            <div className="sb-field-row">
              <input type="range" className="sb-range" min="20" max="100" value={windowOpacity} onChange={e => setWindowOpacity(Number(e.target.value))} />
              <span className="sb-field-value">{windowOpacity}%</span>
            </div>
          </div>

          <div className="sb-toggle-row">
            <input type="checkbox" id="gridSwitch" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
            <label className="sb-toggle-label" htmlFor="gridSwitch">Show Grid Pattern</label>
          </div>
          <div className="sb-toggle-row">
            <input type="checkbox" id="animationSwitch" checked={enableAnimations} onChange={e => setEnableAnimations(e.target.checked)} />
            <label className="sb-toggle-label" htmlFor="animationSwitch">Enable Animations</label>
          </div>
          <div className="sb-toggle-row">
            <input type="checkbox" id="toolbarVisSwitch" checked={showToolbar} onChange={e => setShowToolbar(e.target.checked)} />
            <label className="sb-toggle-label" htmlFor="toolbarVisSwitch">Show Toolbar</label>
          </div>
          <div className="sb-toggle-row">
            <input type="checkbox" id="sidebarVisSwitch" checked={showSidebar} onChange={e => setShowSidebar(e.target.checked)} />
            <label className="sb-toggle-label" htmlFor="sidebarVisSwitch">Show Sidebar</label>
          </div>
          <div className="sb-toggle-row">
            <input type="checkbox" id="rtlSwitch" checked={rtlLayout} onChange={e => setRtlLayout?.(e.target.checked)} />
            <label className="sb-toggle-label" htmlFor="rtlSwitch">RTL Layout</label>
          </div>

          <div className="sb-separator" />

          <div className="sb-field">
            <label className="sb-label">Toolbar Position</label>
            <select className="sb-select" value={toolbarPosition} onChange={e => setToolbarPosition(e.target.value as 'left' | 'right' | 'top' | 'bottom')}>
              <option value="left">Left Side</option>
              <option value="right">Right Side</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>

          <div className="sb-field">
            <label className="sb-label">Sidebar Position</label>
            <select className="sb-select" value={sidebarPosition} onChange={e => setSidebarPosition(e.target.value as 'left' | 'right')}>
              <option value="right">Right Side</option>
              <option value="left">Left Side</option>
            </select>
          </div>

          <div className="sb-field">
            <label className="sb-label">Workspace Language</label>
            <select className="sb-select" value={locale} onChange={e => onLocaleChange?.(e.target.value)}>
              <option value="en">English (EN)</option>
              <option value="es">Español (ES)</option>
              <option value="nl">Nederlands (NL)</option>
              <option value="fr">Français (FR)</option>
              <option value="zh">中文 (ZH)</option>
              <option value="ar">العربية (AR)</option>
            </select>
          </div>

          <div className="sb-separator" />
          <div className="sb-section-title">Toast Notifications</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button type="button" className="sb-btn-outline" onClick={() => toast.info('Information message')}>Info</button>
            <button type="button" className="sb-btn-outline" onClick={() => toast.success('Operation completed')}>Success</button>
            <button type="button" className="sb-btn-outline" onClick={() => toast.warning('Check your settings')}>Warning</button>
            <button type="button" className="sb-btn-outline" onClick={() => toast.error('Something went wrong')}>Error</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
            <button type="button" className="sb-btn-outline" onClick={() => toast.error('Network error', { duration: 0, closable: true })}>Sticky</button>
            <button type="button" className="sb-btn-outline" onClick={() => toast.dismiss()}>Dismiss all</button>
            <button type="button" className="sb-btn-outline" onClick={() => {
              toast.promise(
                new Promise<string>(resolve => setTimeout(() => resolve('done'), 2000)),
                { pending: 'Saving…', success: r => `Saved: ${r}`, error: 'Save failed' }
              );
            }}>Promise</button>
          </div>
        </div>
      ),
    },
  ];

  // Same idea as mergedToolbarItems, for the app's Sidebar — contributed sections
  // appear as dynamic tabs (present only while their panel is active), not merged
  // into an existing tab's content, and never steal focus from whatever tab the
  // user already has open.
  const mergedSidebarTabs = useMergedSidebarTabs(sidebarTabs);

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
            <span>Dockable Desktop</span>
          </Navbar.Brand>

          <Navbar.Toggle aria-controls="responsive-navbar-nav" />
          <Navbar.Collapse id="responsive-navbar-nav">
            <Nav className="me-auto font-monospace align-items-center" style={{ fontSize: '0.85rem' }}>
              <span className="navbar-text me-3 font-monospace text-primary bg-primary bg-opacity-10 px-2 py-0.5 rounded border border-primary border-opacity-25" style={{ fontSize: '0.75rem' }}>
                🚀 Interactive Showcase
              </span>

              {/* Presets and layout control */}
              <NavDropdownMenu title="Workspace Presets" id="presets-dropdown">
                <NavDropdown.Item onClick={resetWorkspaceLayout}>Reset Default Grid</NavDropdown.Item>
                <NavDropdown.Item onClick={spawnFloatingWindow}>Spawn Floating Window</NavDropdown.Item>
                <NavDropdown.Item onClick={spawnLeafletMapWindow}>Spawn Leaflet Map</NavDropdown.Item>
                <NavDropdown.Divider />
                <DropdownSubmenu title="Layout Templates">
                  <NavDropdown.Item onClick={applyDeveloperLayout}>🗺️ Developer (Map + Editor + Console)</NavDropdown.Item>
                  <NavDropdown.Item onClick={applyEditorOnlyLayout}>✏️ Editor Focus (Code + Console)</NavDropdown.Item>
                  <NavDropdown.Item onClick={applyDataAnalysisLayout}>📊 Data Analysis (Map + Table)</NavDropdown.Item>
                </DropdownSubmenu>
              </NavDropdownMenu>


              {/* Tools and components spawning - fixed IDs so repeated clicks re-focus instead of spawning duplicates */}
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
                <NavDropdown.Item onClick={() => openPanel('rtlshowcase-main', 'rtlShowcase')}>🔄 RTL Content Showcase</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel('markdown-main', 'markdownEditor')}>📄 Markdown Editor</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel(`markdown-${Date.now()}`, 'markdownEditor')}>📄+ New Markdown Editor Instance</NavDropdown.Item>
              </NavDropdownMenu>
             {/* Elements dropdown showing active windows, with limit N + Show All */}
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

              {/* Toast demos */}
              <NavDropdownMenu title="Notifications" id="notifications-dropdown">
                <NavDropdown.Item onClick={() => toast.info('This is an info notification.')}>ℹ️ Info</NavDropdown.Item>
                <NavDropdown.Item onClick={() => toast.success('Operation completed successfully.')}>✅ Success</NavDropdown.Item>
                <NavDropdown.Item onClick={() => toast.warning('Proceed with caution.')}>⚠️ Warning</NavDropdown.Item>
                <NavDropdown.Item onClick={() => toast.error('Something went wrong.')}>❌ Error</NavDropdown.Item>
              </NavDropdownMenu>
            </Nav>

            <Nav className="align-items-center gap-3">
              {/* Documentation Link */}
              <a
                href="https://felipecarrillo100.github.io/react-dockable-desktop/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1 font-monospace"
                style={{ fontSize: '0.75rem' }}
                title="API Documentation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
                Docs
              </a>

              {/* GitHub Repo Link */}
              <a
                href="https://github.com/felipecarrillo100/react-dockable-desktop"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 font-monospace"
                style={{ fontSize: '0.75rem' }}
                title="View on GitHub"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                  <path d="M9 18c-4.51 2-5-2-7-2" />
                </svg>
                GitHub
              </a>

              {/* npm Package Link */}
              <a
                href="https://www.npmjs.com/package/react-dockable-desktop"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1 font-monospace"
                style={{ fontSize: '0.75rem' }}
                title="View on npm"
              >
                <span className="fw-bold" style={{ fontSize: '0.7rem' }}>npm</span>
              </a>

              {/* Skin Dropdown */}
              <select
                value={skin}
                onChange={(e) => setSkin(e.target.value)}
                className="form-select form-select-sm font-monospace"
                style={{ width: '130px', fontSize: '0.75rem', backgroundColor: 'var(--rdd-bg-panel)', color: 'var(--rdd-text-primary)', borderColor: 'var(--rdd-border-color)' }}
                title="Select Workspace Preset Skin"
              >
                <option value="vscode">VS Code</option>
                <option value="macos">macOS Glass</option>
                <option value="chrome">Chrome Tab</option>
                <option value="slate">Fluent Slate</option>
                <option value="nord">Nordic Frost</option>
                <option value="obsidian">Midnight Obsidian</option>
                <option value="tokyo">Tokyo Night</option>
              </select>

              {/* Theme Toggle Button */}
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

      {/* Main Container: Toolbar + Sidebar + WindowManager */}
      <div
        className={`flex-grow-1 w-100 d-flex overflow-hidden ${toolbarPosition === 'top' || toolbarPosition === 'bottom' ? 'flex-column' : 'flex-row'}`}
        style={{ position: 'relative' }}
      >
        {(toolbarPosition === 'left' || toolbarPosition === 'top') && (
          <Toolbar
            position={toolbarPosition}
            items={mergedToolbarItems}
            visible={showToolbar}
            onVisibilityChange={setShowToolbar}
          />
        )}
        <Sidebar
          ref={sidebarRef}
          position={sidebarPosition}
          tabs={mergedSidebarTabs}
          defaultWidth={280}
          visible={showSidebar}
          onVisibilityChange={setShowSidebar}
          headerAction={{
            // Demonstrates the fully-custom render path: a real Bootstrap button, kept
            // exactly as-is — the library never touches this markup. The glyph is a plain
            // inline SVG (stroke="currentColor") rather than Bootstrap's own
            // .navbar-toggler-icon, since that class only gets a visible icon inside a real
            // .navbar or under [data-bs-theme=dark] — neither applies to a standalone button,
            // so it would render blank in light mode. currentColor instead tracks
            // .btn-outline-secondary's own (already theme-aware) color for free.
            // The action itself is entirely up to the app: here it opens the existing
            // "Left Side Panel" demo, the same way Google Maps' own hamburger opens a
            // detailed menu.
            render: () => (
              <button
                type="button"
                className="btn btn-outline-secondary d-flex align-items-center justify-content-center p-0"
                style={{ width: 40, height: 40 }}
                title="Menu"
                aria-label="Menu"
                onClick={spawnLeftDrawer}
              >
                <svg width="20" height="20" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 7h22M4 15h22M4 23h22" />
                </svg>
              </button>
            ),
          }}
        >
          <WindowManager
            skin={skin}
            animations={enableAnimations}
            defaultPanelIcon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', opacity: 0.85 }}>
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            }
          />
        </Sidebar>
        {(toolbarPosition === 'right' || toolbarPosition === 'bottom') && (
          <Toolbar
            position={toolbarPosition}
            items={mergedToolbarItems}
            visible={showToolbar}
            onVisibilityChange={setShowToolbar}
          />
        )}
        <SidePanelRenderer />
      </div>
      <ModalStackRenderer />
      <ToastContainer progressBar />
    </div>
  );
}

const messagesMap: Record<string, Record<string, string>> = {
  en: enMessages,
  es: esMessages,
  nl: nlMessages,
  fr: frMessages,
  zh: zhMessages,
  ar: arMessages
};

interface AppWithIntlProps extends AppProps {
  locale: string;
  onLocaleChange: (locale: string) => void;
}

function AppWithIntl({ locale, onLocaleChange }: AppWithIntlProps) {
  const [rtlLayout, setRtlLayout] = useState<boolean>(false);
  const intl = useIntl();

  useEffect(() => {
    document.documentElement.dir = rtlLayout ? 'rtl' : 'ltr';
    return () => { document.documentElement.dir = 'ltr'; };
  }, [rtlLayout]);

  const handleFormatMessage = (msg: ContextMenuPredefinedMessage) => {
    return intl.formatMessage({ id: msg.id, defaultMessage: msg.defaultMessage }, msg.values);
  };

  return (
    <DockableDesktopProvider
      formatMessage={handleFormatMessage}
      predefinedMessages={defaultPredefinedMessages}
      dir={rtlLayout ? 'rtl' : 'ltr'}
    >
      <AppContent locale={locale} onLocaleChange={onLocaleChange} rtlLayout={rtlLayout} setRtlLayout={setRtlLayout} />
    </DockableDesktopProvider>
  );
}

export function App(): React.JSX.Element {
  const [locale, setLocale] = useState<string>('en');

  return (
    <IntlProvider locale={locale} messages={messagesMap[locale] || enMessages}>
      <AppWithIntl locale={locale} onLocaleChange={setLocale} />
    </IntlProvider>
  );
}

export default App;
