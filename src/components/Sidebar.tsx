/**
 * @file Sidebar.tsx
 * @description Sidebar navigation strip and drawer container component.
 * Supports eager/lazy mounting, state preservation (display: none), and positioning (left/right).
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  useContext,
  useMemo,
  createContext,
  forwardRef,
} from 'react';
import { useFormatMessage, usePredefinedMessages } from './WindowManagerContext';


// ==========================================
// Types
// ==========================================

/**
 * Per-tab configuration supplied by the consuming application.
 */
export interface SidebarTab {
  id: string;
  label: string;
  icon: React.ReactNode;
  /**
   * Mount immediately when the Sidebar first renders, not on first user click.
   * Implies `preserveState: true`.
   * Use when other parts of the app need to interact with the panel before
   * the user has opened it (e.g. push data into a context, warm up a WebGL map).
   * Default: false
   */
  eagerMount?: boolean;
  /**
   * Once mounted for the first time, keep the component alive in the DOM
   * behind `display: none` when closed instead of unmounting it.
   * Use for panels with expensive local state (long forms, WebGL scenes, etc.).
   * Ignored when `eagerMount` is true (eagerly mounted panels are always preserved).
   * Default: false
   */
  preserveState?: boolean;
  /**
   * Called to obtain the drawer content for this tab.
   * @param tabId   - the id of this tab
   * @param onClose - call to collapse the sidebar drawer
   * @param onOpen  - call to expand the drawer and select this tab programmatically
   *                  (useful when the panel itself detects it has new data to show)
   */
  renderContent: (tabId: string, onClose: () => void, onOpen: () => void) => React.ReactNode;
}

export interface SidebarProps {
  /** Which side the tab strip and drawer appear on. Default: 'right' */
  position?: 'left' | 'right';
  tabs: SidebarTab[];
  /** Width of the open drawer. Default: '220px' */
  drawerWidth?: string;
  /** Controlled active tab id. Leave undefined to use internal state. */
  activeTabId?: string | null;
  /** Called when the active tab changes in uncontrolled mode. */
  onActiveTabChange?: (tabId: string | null) => void;
  /** Main workspace content, rendered between the strip and drawer (or around them). */
  children?: React.ReactNode;
}

/**
 * Imperative handle exposed by `<Sidebar ref={...}>` via forwardRef.
 * Allows external components (outside the sidebar tree) to control
 * which tab is open without prop drilling.
 */
export interface SidebarHandle {
  /** Expand the drawer and activate the tab with the given id. */
  openTab: (tabId: string) => void;
  /** Collapse the drawer (equivalent to clicking the active tab icon). */
  closeDrawer: () => void;
  /** Returns the currently active tab id, or null if the drawer is collapsed. */
  getActiveTab: () => string | null;
}

/**
 * Value provided by `useSidebar()`. Available to any component inside the
 * `<Sidebar>` React tree, including panels rendered via `{children}`.
 */
export interface SidebarContextValue {
  /** Expand the drawer and activate the tab with the given id. */
  openTab: (tabId: string) => void;
  /** Collapse the drawer. */
  closeDrawer: () => void;
  /** Returns the currently active tab id, or null if the drawer is collapsed. */
  getActiveTab: () => string | null;
}

/**
 * Value provided by `useSidebarTab()`. Available only to components rendered
 * inside a sidebar tab's `renderContent` tree.
 */
export interface SidebarTabContextValue {
  /** The id of this tab. */
  tabId: string;
  /** Expand the drawer and activate this tab. */
  onOpen: () => void;
  /** Collapse the drawer. */
  onClose: () => void;
  /** Expand the drawer and switch to a different tab. */
  openTab: (tabId: string) => void;
}

// ==========================================
// Contexts
// ==========================================

const SidebarContext = createContext<SidebarContextValue | null>(null);
const SidebarTabContext = createContext<SidebarTabContextValue | null>(null);

// ==========================================
// SidebarTabProvider (internal)
// ==========================================

interface SidebarTabProviderProps {
  tabId: string;
  onClose: () => void;
  onOpen: () => void;
  setActiveTabId: (id: string | null) => void;
  children: React.ReactNode;
}

function SidebarTabProvider({ tabId, onClose, onOpen, setActiveTabId, children }: SidebarTabProviderProps) {
  const value = useMemo<SidebarTabContextValue>(() => ({
    tabId,
    onClose,
    onOpen,
    openTab: (otherId: string) => setActiveTabId(otherId),
  }), [tabId, onClose, onOpen, setActiveTabId]);

  return <SidebarTabContext.Provider value={value}>{children}</SidebarTabContext.Provider>;
}

// ==========================================
// Component
// ==========================================

/**
 * Sidebar component rendering a tab strip and a collapsible content drawer.
 * Supports imperative method bindings like openTab and closeDrawer via forwardRef.
 */
export const Sidebar: React.ForwardRefExoticComponent<SidebarProps & React.RefAttributes<SidebarHandle>> = forwardRef<SidebarHandle, SidebarProps>(function Sidebar(
  {
    position = 'right',
    tabs,
    drawerWidth = '220px',
    activeTabId: controlledActiveTabId,
    onActiveTabChange,
    children,
  },
  ref
) {
  const isControlled = controlledActiveTabId !== undefined;
  const formatMessage = useFormatMessage();
  const predefinedMessages = usePredefinedMessages();

  // Internal active tab state (used when uncontrolled)
  const [internalActiveTabId, setInternalActiveTabId] = useState<string | null>(null);

  // The effective active tab id — either from props (controlled) or internal state
  const activeTabId = isControlled ? controlledActiveTabId : internalActiveTabId;

  // Track which tabs have been mounted at least once
  // Pre-populate with all eagerMount tabs
  const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const tab of tabs) {
      if (tab.eagerMount) initial.add(tab.id);
    }
    return initial;
  });

  // When tabs change (e.g. new eagerMount tabs added), mount them immediately
  useEffect(() => {
    const newEager = tabs.filter(t => t.eagerMount && !mountedTabIds.has(t.id));
    if (newEager.length > 0) {
      setMountedTabIds(prev => {
        const next = new Set(prev);
        for (const tab of newEager) next.add(tab.id);
        return next;
      });
    }
  }, [tabs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable ref to active tab for imperative handle
  const activeTabIdRef = useRef<string | null>(activeTabId ?? null);
  useEffect(() => {
    activeTabIdRef.current = activeTabId ?? null;
  }, [activeTabId]);

  const setActiveTabId = useCallback(
    (id: string | null) => {
      if (isControlled) {
        onActiveTabChange?.(id);
      } else {
        setInternalActiveTabId(id);
        onActiveTabChange?.(id);
      }
    },
    [isControlled, onActiveTabChange]
  );

  // Expose imperative handle
  useImperativeHandle(
    ref,
    () => ({
      openTab: (tabId: string) => setActiveTabId(tabId),
      closeDrawer: () => setActiveTabId(null),
      getActiveTab: () => activeTabIdRef.current,
    }),
    [setActiveTabId]
  );

  const handleTabClick = (tabId: string) => {
    setActiveTabId(activeTabId === tabId ? null : tabId);
  };

  const handleClose = useCallback(() => setActiveTabId(null), [setActiveTabId]);

  // Stable context value for useSidebar() consumers
  const sidebarContextValue = useMemo<SidebarContextValue>(() => ({
    openTab: (tabId: string) => setActiveTabId(tabId),
    closeDrawer: () => setActiveTabId(null),
    getActiveTab: () => activeTabIdRef.current,
  }), [setActiveTabId]);

  // On first open of a non-eager tab, add it to mounted set
  useEffect(() => {
    if (activeTabId && !mountedTabIds.has(activeTabId)) {
      setMountedTabIds(prev => {
        const next = new Set(prev);
        next.add(activeTabId);
        return next;
      });
    }
  }, [activeTabId, mountedTabIds]);

  // On close of a standard tab (neither eagerMount nor preserveState), unmount it
  useEffect(() => {
    if (activeTabId !== null) return; // drawer just opened or is still open
    setMountedTabIds(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        const tab = tabs.find(t => t.id === id);
        if (tab && !tab.eagerMount && !tab.preserveState) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeTabId, tabs]);

  // ---- Render helpers ----

  const tabStrip = (
    <div className={`sidebar-tabs-strip ${position}`} style={{ width: '56px', height: '100%' }}>
      {tabs.map(tab => {
        const isActive = activeTabId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={`sidebar-tab-btn ${isActive ? 'active' : ''}`}
            title={tab.label}
            aria-pressed={isActive}
          >
            {tab.icon}
          </button>
        );
      })}
    </div>
  );

  const drawer = (
    <div
      className={`sidebar-content-drawer h-100 ${position}`}
      style={{
        width: activeTabId ? drawerWidth : '0px',
        minWidth: activeTabId ? drawerWidth : '0px',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Render all mounted tabs; only the active one is visible */}
      {tabs.map(tab => {
        const isMounted = mountedTabIds.has(tab.id);
        if (!isMounted) return null;

        const isCurrent = activeTabId === tab.id;

        // Stable onOpen per tab id
        const onOpen = () => setActiveTabId(tab.id);

        return (
          <div
            key={tab.id}
            style={{
              display: isCurrent ? 'flex' : 'none',
              flexDirection: 'column',
              height: '100%',
              width: '100%',
            }}
          >
            {/* Drawer header */}
            <div className="sidebar-drawer-header">
              <span className="sidebar-header-title">{tab.label}</span>
              <button
                type="button"
                onClick={handleClose}
                className="sidebar-close-btn"
                title={formatMessage(predefinedMessages.closePanelTooltip)}
                aria-label={formatMessage(predefinedMessages.closePanelTooltip)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Drawer body — consumer-supplied content */}
            <div className="sidebar-drawer-body">
              <SidebarTabProvider
                tabId={tab.id}
                onClose={handleClose}
                onOpen={onOpen}
                setActiveTabId={setActiveTabId}
              >
                {tab.renderContent(tab.id, handleClose, onOpen)}
              </SidebarTabProvider>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <SidebarContext.Provider value={sidebarContextValue}>
      {position === 'left' && tabStrip}
      {position === 'left' && drawer}
      {children}
      {position === 'right' && drawer}
      {position === 'right' && tabStrip}
    </SidebarContext.Provider>
  );
});

// ==========================================
// Hooks
// ==========================================

/**
 * Returns sidebar control functions from anywhere inside a `<Sidebar>` tree,
 * including floating panels rendered via `{children}`.
 *
 * Returns a no-op object with a console warning when called outside a Sidebar.
 */
export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    console.warn('useSidebar() called outside a <Sidebar> tree. Returning no-op.');
    return { openTab: () => {}, closeDrawer: () => {}, getActiveTab: () => null };
  }
  return ctx;
}

/**
 * Returns tab-specific control functions for components rendered inside a
 * sidebar tab's `renderContent` tree.
 *
 * Returns a no-op object with a console warning when called outside tab content.
 */
export function useSidebarTab(): SidebarTabContextValue {
  const ctx = useContext(SidebarTabContext);
  if (!ctx) {
    console.warn('useSidebarTab() called outside a <Sidebar> tab renderContent tree. Returning no-op.');
    return { tabId: '', onOpen: () => {}, onClose: () => {}, openTab: () => {} };
  }
  return ctx;
}

export default Sidebar;
