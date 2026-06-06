import { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-bootstrap-submenu/dist/index.css';
import { Navbar, Nav, Container, NavDropdown } from 'react-bootstrap';
import { NavDropdownMenu, DropdownSubmenu } from 'react-bootstrap-submenu';
import { WindowManagerProvider, useWindowManagerState, useWindowManagerActions } from './components/WindowManagerContext';
import Desktop from './components/Desktop';
import { SidebarTabs } from './components/SidebarTabs';
import { SidebarContent } from './components/SidebarContent';

function AppContent() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeSidebarTab, setActiveSidebarTab] = useState<string | null>('search');
  const state = useWindowManagerState();
  const { openPanel, loadLayout, saveLayout } = useWindowManagerActions();

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-bs-theme', nextTheme);
    
    if (nextTheme === 'light') {
      document.documentElement.style.setProperty('--bg-primary', '#f8f9fa');
      document.documentElement.style.setProperty('--bg-workspace', '#e9ecef');
      document.documentElement.style.setProperty('--text-primary', '#212529');
    } else {
      document.documentElement.style.setProperty('--bg-primary', '#090a0f');
      document.documentElement.style.setProperty('--bg-workspace', '#0f1015');
      document.documentElement.style.setProperty('--text-primary', '#f8f9fa');
    }
  };

  const handleTabClick = (tabId: string) => {
    if (activeSidebarTab === tabId) {
      setActiveSidebarTab(null);
    } else {
      setActiveSidebarTab(tabId);
    }
  };

  const spawnFloatingWindow = () => {
    const id = `floating-tool-${Date.now()}`;
    openPanel(id, 'help', { title: `Utility Tool`, initialTarget: 'floating' });
  };

  const spawnLuciadMapWindow = () => {
    const id = `luciad-map-${Date.now()}`;
    openPanel(id, 'luciadMap', { title: `LuciadRIA Earth 3D`, initialTarget: 'floating' });
  };

  const resetWorkspaceLayout = () => {
    // Standard initial grid setup
    const initialConfig = JSON.stringify({
      gridRoot: {
        type: 'branch',
        orientation: 'horizontal',
        sizes: [0.7, 0.3],
        children: [
          {
            type: 'branch',
            orientation: 'vertical',
            sizes: [0.6, 0.4],
            children: [
              {
                type: 'leaf',
                id: 'group-left-top',
                panels: ['main-editor'],
                activePanelId: 'main-editor',
              },
              {
                type: 'leaf',
                id: 'group-left-bottom',
                panels: ['system-console'],
                activePanelId: 'system-console',
              }
            ]
          },
          {
            type: 'leaf',
            id: 'group-right',
            panels: ['help-docs'],
            activePanelId: 'help-docs',
          }
        ]
      },
      floating: [],
      minimized: [],
      panels: {
        'main-editor': { id: 'main-editor', title: 'Code Editor', component: 'editor', state: 'docked' },
        'system-console': { id: 'system-console', title: 'Console Output', component: 'terminal', state: 'docked' },
        'help-docs': { id: 'help-docs', title: 'Help Center', component: 'help', state: 'docked' }
      }
    });
    loadLayout(initialConfig);
  };

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

  // Elements listing logic in dropdown
  const N = 4; // Display limit
  const openPanelsList = Object.values(state.panels).filter(p => p.state !== 'minimized');
  const visiblePanels = openPanelsList.slice(0, N);
  const hasMore = openPanelsList.length > N;

  return (
    <div className="full-viewport-layout">
      {/* Top Navbar */}
      <Navbar collapseOnSelect expand="lg" bg={theme} variant={theme} className="border-bottom border-secondary-subtle py-2 px-3 shadow-sm" style={{ zIndex: 10 }}>
        <Container fluid>
          <Navbar.Brand href="#home" className="fw-bold d-flex align-items-center gap-2">
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
            <span>Custom Desktop dashboard</span>
          </Navbar.Brand>
          
          <Navbar.Toggle aria-controls="responsive-navbar-nav" />
          <Navbar.Collapse id="responsive-navbar-nav">
            <Nav className="me-auto font-monospace" style={{ fontSize: '0.85rem' }}>
              <Nav.Link href="#home">Home</Nav.Link>
              
              {/* Presets and layout control */}
              <NavDropdownMenu title="Workspace Presets" id="presets-dropdown">
                <NavDropdown.Item onClick={resetWorkspaceLayout}>Reset Default Grid</NavDropdown.Item>
                <NavDropdown.Item onClick={spawnFloatingWindow}>Spawn Floating Window</NavDropdown.Item>
                <NavDropdown.Item onClick={spawnLuciadMapWindow}>Spawn LuciadRIA Earth</NavDropdown.Item>
                <NavDropdown.Divider />
                <DropdownSubmenu title="Layout Templates">
                  <NavDropdown.Item href="#template/dev">Standard Developer</NavDropdown.Item>
                  <NavDropdown.Item href="#template/editor-only">Editor Only</NavDropdown.Item>
                </DropdownSubmenu>
              </NavDropdownMenu>

              {/* Tools and components spawning */}
              <NavDropdownMenu title="Spawn Tools" id="tools-dropdown">
                <NavDropdown.Item onClick={() => openPanel('layertree-main', 'layertree')}>Layer Tree</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel('timecontrol-main', 'timecontrol')}>Time Control</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel('overviewmap-main', 'overviewmap')}>Overview Map</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel('table-main', 'table')}>Attribute Table</NavDropdown.Item>
                <NavDropdown.Item onClick={() => openPanel('toolpanels-main', 'toolpanels')}>Operations Toolbox</NavDropdown.Item>
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
                    🟢 {p.title} ({p.state})
                  </NavDropdown.Item>
                ))}
                {openPanelsList.length === 0 && (
                  <NavDropdown.Item className="text-muted small disabled">No active windows</NavDropdown.Item>
                )}
                {hasMore && (
                  <>
                    <NavDropdown.Divider />
                    <NavDropdown.Item 
                      onClick={() => openPanel('manager-panel', 'panelmanager', { title: 'Panel Registry Explorer', initialTarget: 'floating' })}
                      className="text-info fw-bold text-center small"
                    >
                      Show All ({openPanelsList.length - N} more)
                    </NavDropdown.Item>
                  </>
                )}
              </NavDropdownMenu>

              {/* Save / Load layout actions */}
              <NavDropdownMenu title="Session Layout" id="layout-dropdown">
                <NavDropdown.Item onClick={handleSaveToLocalStorage}>💾 Save Layout</NavDropdown.Item>
                <NavDropdown.Item onClick={handleLoadFromLocalStorage}>📂 Load Layout</NavDropdown.Item>
              </NavDropdownMenu>
            </Nav>

            <Nav className="align-items-center gap-3">
              {/* Reset Layout Shortcut Button */}
              <button 
                type="button"
                onClick={resetWorkspaceLayout}
                className="btn btn-sm btn-outline-info d-flex align-items-center gap-1 font-monospace"
                style={{ fontSize: '0.75rem' }}
                title="Restore default panels layout"
              >
                Reset Grid
              </button>

              {/* Spawn Floating Window Shortcut Button */}
              <button 
                type="button"
                onClick={spawnFloatingWindow}
                className="btn btn-sm btn-primary d-flex align-items-center gap-1 font-monospace"
                style={{ fontSize: '0.75rem' }}
                title="Create a new floating tool window"
              >
                + Float Window
              </button>

              {/* Spawn Luciad Map Button */}
              <button 
                type="button" 
                onClick={spawnLuciadMapWindow}
                className="btn btn-sm btn-success d-flex align-items-center gap-1 font-monospace"
                style={{ fontSize: '0.75rem' }}
                title="Create a new floating LuciadRIA 3D Earth map (EPSG:4978)"
              >
                + LuciadRIA EPSG:4978
              </button>

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

      {/* Main Container containing Collapsible Sidebar and Custom Desktop Workspace */}
      <div className="flex-grow-1 w-100 d-flex flex-row overflow-hidden" style={{ position: 'relative' }}>
        
        {/* Custom Desktop workspace */}
        <Desktop />

        {/* Collapsible Sidebar Content Panel (sliding Drawer) */}
        <div 
          className="sidebar-content-drawer h-100" 
          style={{ width: activeSidebarTab ? '220px' : '0px' }}
        >
          <SidebarContent 
            activeTab={activeSidebarTab} 
            onClose={() => setActiveSidebarTab(null)} 
            openPanels={[]}
            minimizedList={[]}
            onClosePanel={() => {}}
            onMinimizePanel={() => {}}
            onMaximizePanel={() => {}}
            onBringToFrontPanel={() => {}}
            onRestorePanel={() => {}}
          />
        </div>

        {/* Sidebar Vertical Tabs Strip */}
        <SidebarTabs activeTab={activeSidebarTab} onTabClick={handleTabClick} />
      </div>
    </div>
  );
}

function App() {
  return (
    <WindowManagerProvider>
      <AppContent />
    </WindowManagerProvider>
  );
}

export default App;
