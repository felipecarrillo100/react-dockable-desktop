/**
 * @file Sidebar.tsx
 * @description Sidebar activity bar (strip) and resizable content drawer.
 * The strip and drawer are independently controllable via `visible` and
 * `stripVisible`. Drawer width is pixel-based and user-draggable using the
 * same pointer-capture interaction as the panel grid resizer.
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
  memo,
} from 'react';
import { startPointerDrag } from './dragResize';

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
   * Default: false
   */
  eagerMount?: boolean;
  /**
   * Keep the component alive behind `display: none` when closed instead of
   * unmounting it. Use for panels with expensive local state.
   * Default: false
   */
  preserveState?: boolean;
  /**
   * Called to obtain the drawer content for this tab.
   * @param tabId   - the id of this tab
   * @param onClose - call to collapse the sidebar drawer
   * @param onOpen  - call to expand the drawer and select this tab
   */
  renderContent: (tabId: string, onClose: () => void, onOpen: () => void) => React.ReactNode;
}

export interface SidebarProps {
  /** Which side the activity bar and drawer appear on. Default: 'right' */
  position?: 'left' | 'right';
  tabs: SidebarTab[];
  /** Initial drawer width in pixels. Default: 280 */
  defaultWidth?: number;
  /** Minimum drawer width in pixels during drag-resize. Default: 150 */
  minWidth?: number;
  /** Maximum drawer width in pixels during drag-resize. Default: 600 */
  maxWidth?: number;
  /** Called during drag resize and on setWidth() with the new pixel width. */
  onWidthChange?: (px: number) => void;
  /** Controlled active tab id. Omit to use internal state. */
  activeTabId?: string | null;
  /** Called when the active tab changes. */
  onActiveTabChange?: (tabId: string | null) => void;
  /** Collapse the entire sidebar (strip + drawer). Default: true */
  visible?: boolean;
  /** Called when show/hide/toggle is invoked on the imperative handle. */
  onVisibilityChange?: (visible: boolean) => void;
  /** Collapse only the activity bar strip, leaving the drawer unaffected. Default: true */
  stripVisible?: boolean;
  /** Called when showStrip/hideStrip is invoked on the imperative handle. */
  onStripVisibilityChange?: (visible: boolean) => void;
  /** Main workspace content rendered alongside the sidebar. */
  children?: React.ReactNode;
}

/**
 * Imperative handle exposed by `<Sidebar ref={...}>`.
 */
export interface SidebarHandle {
  openTab: (tabId: string) => void;
  closeDrawer: () => void;
  getActiveTab: () => string | null;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  showStrip: () => void;
  hideStrip: () => void;
  setWidth: (px: number) => void;
  getWidth: () => number;
}

/**
 * Value provided by `useSidebar()`. Available to any component inside the
 * `<Sidebar>` React tree, including panels rendered via `{children}`.
 */
export interface SidebarContextValue {
  openTab: (tabId: string) => void;
  closeDrawer: () => void;
  getActiveTab: () => string | null;
}

/**
 * Value provided by `useSidebarTab()`. Available only to components rendered
 * inside a sidebar tab's `renderContent` tree.
 */
export interface SidebarTabContextValue {
  tabId: string;
  onOpen: () => void;
  onClose: () => void;
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
// SidebarTabStrip (internal sub-component)
// Re-renders only when tabs, selection, or strip visibility changes —
// not on drawer width changes during drag.
// ==========================================

interface SidebarTabStripProps {
  tabs: SidebarTab[];
  activeTabId: string | null | undefined;
  isVisible: boolean;
  position: 'left' | 'right';
  onTabClick: (tabId: string) => void;
}

const SidebarTabStrip = memo(function SidebarTabStrip({
  tabs,
  activeTabId,
  isVisible,
  position,
  onTabClick,
}: SidebarTabStripProps) {
  return (
    // Outer div drives the collapse transition via overflow:hidden.
    // The inner rdd-sidebar-tabs-strip must NOT have overflow:hidden so the active
    // tab's negative margin can extend into the drawer border without clipping.
    <div
      style={{
        width: isVisible ? '56px' : '0px',
        height: '100%',
        overflow: 'hidden',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        flexShrink: 0,
      }}
    >
      <div className={`rdd-sidebar-tabs-strip rdd-${position}`} style={{ width: '56px', height: '100%' }}>
        {tabs.map(tab => {
          const isActive = activeTabId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabClick(tab.id)}
              className={`rdd-sidebar-tab-btn${isActive ? ' rdd-active' : ''}`}
              title={tab.label}
              aria-pressed={isActive}
            >
              {tab.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
});

// ==========================================
// SidebarResizeHandle (internal sub-component)
// Encapsulates all pointer-capture drag logic.
// Identical interaction pattern to the panel grid resizer in WindowManager.tsx.
// ==========================================

interface SidebarResizeHandleProps {
  position: 'left' | 'right';
  currentWidth: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (newWidth: number) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

function SidebarResizeHandle({
  position,
  currentWidth,
  minWidth,
  maxWidth,
  onWidthChange,
  rootRef,
}: SidebarResizeHandleProps) {
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const activeClasses: Array<{ el: HTMLElement; classes: string[] }> = [
      { el, classes: ['rdd-active'] },
      { el: document.body, classes: ['rdd-resizing-active', 'rdd-resizing-col-active'] },
    ];
    // Suppress the drawer's CSS transition so drag feels instant.
    if (rootRef.current) activeClasses.push({ el: rootRef.current, classes: ['rdd-sidebar-resizing'] });

    startPointerDrag({
      element: el,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      captureStart: () => currentWidth,
      activeClasses,
      onMove: (dx, _dy, startWidth) => {
        // Right sidebar: dragging left (negative dx) widens the drawer
        const newW = position === 'right' ? startWidth - dx : startWidth + dx;
        onWidthChange(Math.max(minWidth, Math.min(maxWidth, newW)));
      },
    });
  };

  return (
    <div
      className="rdd-resizer-bar"
      style={{
        cursor: 'col-resize',
        width: '1px',
        height: '100%',
        flexShrink: 0,
        zIndex: 20,
      }}
      onPointerDown={handlePointerDown}
    />
  );
}

// ==========================================
// Sidebar (main component)
// ==========================================

export const Sidebar: React.ForwardRefExoticComponent<SidebarProps & React.RefAttributes<SidebarHandle>> =
  forwardRef<SidebarHandle, SidebarProps>(function Sidebar(
    {
      position = 'right',
      tabs,
      defaultWidth,
      minWidth = 150,
      maxWidth = 600,
      onWidthChange,
      activeTabId: controlledActiveTabId,
      onActiveTabChange,
      visible,
      onVisibilityChange,
      stripVisible,
      onStripVisibilityChange,
      children,
    },
    ref
  ) {
    const isControlled = controlledActiveTabId !== undefined;

    const [width, setWidthState] = useState<number>(() => defaultWidth ?? 280);

    const setWidth = useCallback((px: number) => {
      setWidthState(px);
      onWidthChange?.(px);
    }, [onWidthChange]);

    // Internal active tab state (uncontrolled mode)
    const [internalActiveTabId, setInternalActiveTabId] = useState<string | null>(null);
    const activeTabId = isControlled ? controlledActiveTabId : internalActiveTabId;

    // Tracks which non-eager tabs have been mounted at least once (for lazy-mount / preserveState).
    // eagerMount tabs are folded in via effectiveMountedTabIds below, so no effect needed for them.
    const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(() => new Set<string>());

    // Derives the full mounted set during render — no effect needed.
    // Includes: accumulated mountedTabIds + the currently active tab (handles controlled
    // prop changes where setActiveTabId is never called) + all eagerMount tabs.
    const effectiveMountedTabIds = useMemo(() => {
      const result = new Set(mountedTabIds);
      if (activeTabId) result.add(activeTabId);
      for (const tab of tabs) {
        if (tab.eagerMount) result.add(tab.id);
      }
      return result;
    }, [mountedTabIds, activeTabId, tabs]);

    // Stable refs for imperative handle
    const activeTabIdRef = useRef<string | null>(activeTabId ?? null);
    useEffect(() => { activeTabIdRef.current = activeTabId ?? null; }, [activeTabId]);

    const widthRef = useRef<number>(width);
    useEffect(() => { widthRef.current = width; }, [width]);

    // Ref to the root flex container — used by SidebarResizeHandle to toggle
    // the rdd-sidebar-resizing class that suppresses the CSS width transition during drag
    const rootRef = useRef<HTMLDivElement | null>(null);

    const setActiveTabId = useCallback(
      (id: string | null) => {
        // Update mounted set in the same render batch as the tab switch — avoids setState-in-effect.
        if (id !== null) {
          setMountedTabIds(prev => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        } else {
          // Drawer closing: evict transient tabs (non-eager, non-preserveState).
          setMountedTabIds(prev => {
            let changed = false;
            const next = new Set(prev);
            for (const tabId of prev) {
              const tab = tabs.find(t => t.id === tabId);
              if (tab && !tab.eagerMount && !tab.preserveState) {
                next.delete(tabId);
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }
        if (isControlled) {
          onActiveTabChange?.(id);
        } else {
          setInternalActiveTabId(id);
          onActiveTabChange?.(id);
        }
      },
      [isControlled, onActiveTabChange, tabs]
    );

    // If the active tab stops existing in `tabs` (its contributing panel changed/closed,
    // or the tab was otherwise removed), close the drawer rather than leaving it open and
    // empty with no tab button left to click closed — never silently fall back to a
    // different tab the user didn't choose.
    useEffect(() => {
      if (activeTabId != null && !tabs.some(t => t.id === activeTabId)) {
        setActiveTabId(null);
      }
    }, [activeTabId, tabs, setActiveTabId]);

    useImperativeHandle(ref, () => ({
      openTab: (tabId: string) => setActiveTabId(tabId),
      closeDrawer: () => setActiveTabId(null),
      getActiveTab: () => activeTabIdRef.current,
      show: () => onVisibilityChange?.(true),
      hide: () => onVisibilityChange?.(false),
      toggle: () => onVisibilityChange?.(visible === false ? true : false),
      showStrip: () => onStripVisibilityChange?.(true),
      hideStrip: () => onStripVisibilityChange?.(false),
      setWidth: (px: number) => setWidth(Math.max(minWidth, Math.min(maxWidth, px))),
      getWidth: () => widthRef.current,
    }), [setActiveTabId, visible, onVisibilityChange, onStripVisibilityChange, setWidth, minWidth, maxWidth]);

    const handleTabClick = useCallback((tabId: string) => {
      setActiveTabId(activeTabId === tabId ? null : tabId);
    }, [activeTabId, setActiveTabId]);

    const handleClose = useCallback(() => setActiveTabId(null), [setActiveTabId]);


    // Stable context value for useSidebar() consumers
    const sidebarContextValue = useMemo<SidebarContextValue>(() => ({
      openTab: (tabId: string) => setActiveTabId(tabId),
      closeDrawer: () => setActiveTabId(null),
      getActiveTab: () => activeTabIdRef.current,
    }), [setActiveTabId]);

    // ---- Derived visibility flags ----
    const isSidebarVisible = visible !== false;
    const isStripVisible = isSidebarVisible && stripVisible !== false;
    const isDrawerOpen = isSidebarVisible && activeTabId != null;

    // ---- Drawer element (shared between left and right) ----
    const drawer = (
      <div
        className={`rdd-sidebar-content-drawer rdd-${position}`}
        style={{
          // flex-basis drives the visible width; width: 0px has no effect in flex context
          // when flex-basis is set — so we animate flex-basis, not width.
          flexBasis: isDrawerOpen ? `${width}px` : '0px',
          flexShrink: 1,
          flexGrow: 0,
          minWidth: isDrawerOpen ? `${minWidth}px` : '0px',
          maxWidth: isDrawerOpen ? `${maxWidth}px` : '0px',
          overflow: 'hidden',
          // transition is suppressed during drag via .rdd-sidebar-resizing on the root
          transition: 'flex-basis 0.2s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.2s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {tabs.map(tab => {
          const isMounted = effectiveMountedTabIds.has(tab.id);
          if (!isMounted) return null;

          const isCurrent = activeTabId === tab.id;
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
              {/* Drawer header — tab label only, no close button (click active tab icon to close) */}
              <div className="rdd-sidebar-drawer-header">
                <span className="rdd-sidebar-header-title">{tab.label}</span>
              </div>

              {/* Drawer body — consumer-supplied content */}
              <div className="rdd-sidebar-drawer-body">
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

    // ---- Resize handle (only interactive when drawer is open) ----
    const resizeHandle = isDrawerOpen ? (
      <SidebarResizeHandle
        position={position}
        currentWidth={width}
        minWidth={minWidth}
        maxWidth={maxWidth}
        onWidthChange={setWidth}
        rootRef={rootRef}
      />
    ) : null;

    return (
      <SidebarContext.Provider value={sidebarContextValue}>
        <div
          ref={rootRef}
          style={{
            display: 'flex',
            flexDirection: 'row',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {position === 'left' && (
            <SidebarTabStrip
              tabs={tabs}
              activeTabId={activeTabId}
              isVisible={isStripVisible}
              position={position}
              onTabClick={handleTabClick}
            />
          )}
          {position === 'left' && drawer}
          {position === 'left' && resizeHandle}

          {/* Workspace content — fills all remaining space */}
          <div style={{ flex: '1 1 0%', minWidth: 0, overflow: 'hidden' }}>
            {children}
          </div>

          {position === 'right' && resizeHandle}
          {position === 'right' && drawer}
          {position === 'right' && (
            <SidebarTabStrip
              tabs={tabs}
              activeTabId={activeTabId}
              isVisible={isStripVisible}
              position={position}
              onTabClick={handleTabClick}
            />
          )}
        </div>
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
 * @throws Error if used outside of a {@link Sidebar}.
 */
export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within Sidebar');
  return ctx;
}

/**
 * Returns tab-specific control functions for components rendered inside a
 * sidebar tab's `renderContent` tree.
 *
 * @throws Error if used outside of a {@link Sidebar} tab's `renderContent` tree.
 */
export function useSidebarTab(): SidebarTabContextValue {
  const ctx = useContext(SidebarTabContext);
  if (!ctx) throw new Error('useSidebarTab must be used within a Sidebar tab renderContent tree');
  return ctx;
}

export default Sidebar;
