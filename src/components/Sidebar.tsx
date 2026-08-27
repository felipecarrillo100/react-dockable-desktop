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
  /** Required unless `hidden` is true — a hidden tab never renders a rail button, so it has no icon to show. */
  icon?: React.ReactNode;
  /**
   * Omit this tab's rail button entirely — no icon, no click target — while it
   * remains fully openable via `openTab()` / `useSidebar().openTab()` / a controlled
   * `activeTabId`. Use for menu-driven panels with no persistent icon (e.g. a
   * Google-Maps-style hamburger that opens content not otherwise pinned to the rail).
   * Default: false
   */
  hidden?: boolean;
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

/**
 * Simple case for `SidebarProps.headerAction`/`footerAction`: the library renders a
 * default-styled icon button (visually consistent with the regular tab buttons) and forwards
 * the click.
 */
export interface SidebarHeaderActionButton {
  /** Only needed when used inside a `SidebarRailEntry[]` array, for the React key. */
  id?: string;
  icon: React.ReactNode;
  /** Tooltip and aria-label — same convention as `SidebarTab.label`. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Full-control case for `SidebarProps.headerAction`/`footerAction`: the consumer supplies their
 * own markup (a Material UI `IconButton`, a Bootstrap `Button`, a Tailwind-styled `<button>`, or
 * anything else) wholesale. The library renders exactly what this returns, unwrapped, so the
 * consumer's own hover/active/focus/ripple behavior and click handling are untouched.
 */
export interface SidebarHeaderActionCustom {
  /** Only needed when used inside a `SidebarRailEntry[]` array, for the React key. */
  id?: string;
  render: () => React.ReactNode;
}

/**
 * A single, non-toggling action button shown above the tab strip (e.g. a hamburger menu).
 * Unlike `SidebarTab`, it never affects `activeTabId` or the drawer — the library only renders
 * it and forwards the click; what happens next (opening a side panel, a modal, anything else)
 * is entirely up to the consumer.
 */
export type SidebarHeaderAction = SidebarHeaderActionButton | SidebarHeaderActionCustom;

/**
 * A single entry inside `SidebarProps.headerAction`/`footerAction` when used as an array: either
 * a non-toggling action button/custom render (see `SidebarHeaderAction`), or a real `SidebarTab`
 * that behaves exactly like a main-list tab — it mounts, activates, and closes through the same
 * lifecycle, so e.g. a "Settings" entry pinned to the footer can expand like any other tab.
 */
export type SidebarRailEntry = SidebarTab | SidebarHeaderActionButton | SidebarHeaderActionCustom;

function isRailTab(entry: SidebarRailEntry): entry is SidebarTab {
  return 'renderContent' in entry;
}

function isRailCustom(entry: SidebarRailEntry): entry is SidebarHeaderActionCustom {
  return 'render' in entry;
}

function toRailArray(value: SidebarRailEntry | SidebarRailEntry[] | undefined): SidebarRailEntry[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export interface SidebarProps {
  /** Which side the activity bar and drawer appear on. Default: 'right' */
  position?: 'left' | 'right';
  tabs: SidebarTab[];
  /**
   * One or more non-toggling action buttons and/or real tabs shown above the tabs, in their
   * own `.rdd-sidebar-header-area` — independent of the tabs' own inter-item gap. Pass a single
   * `{ icon, label, onClick }`/`{ render }` object (the common case), or an array mixing action
   * buttons, custom renders, and `SidebarTab` entries — a tab entry here behaves exactly like a
   * main-list tab (mounts, activates, closes through the same lifecycle). Override
   * `--rdd-sidebar-header-area-padding-top`/`--rdd-sidebar-header-area-padding-bottom`
   * (both default `8px`) to control its spacing/effective height.
   */
  headerAction?: SidebarRailEntry | SidebarRailEntry[];
  /**
   * Mirror of `headerAction`, pinned to the bottom of the tab strip via its own
   * `.rdd-sidebar-footer-area` — e.g. a "Settings" tab that should always sit at the bottom
   * regardless of tab count. Override `--rdd-sidebar-footer-area-padding-top`/
   * `--rdd-sidebar-footer-area-padding-bottom` (both default `8px`) to control its spacing.
   */
  footerAction?: SidebarRailEntry | SidebarRailEntry[];
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
  /**
   * Show an "X" close button in the expanded drawer's header, as an additional way to collapse
   * the sidebar (equivalent to clicking the active tab's own icon again). Opt-in. Default: false.
   * Has no effect once the default header is suppressed — via `hideDefaultHeader`, or simply by
   * passing `renderHeader` (either one is sufficient) — since the entire default header, this
   * button included, is skipped for every tab in that case.
   */
  showCloseButton?: boolean;
  /**
   * Suppress the library's own drawer header (title + `showCloseButton`'s close
   * button) for every tab, so `renderHeader` (or each tab's own `renderContent`)
   * can supply a header, border, and styling instead. Applies uniformly across
   * all tabs — there's no per-tab override. Passing `renderHeader` by itself has
   * the same suppressing effect even if this is left unset — the two conditions
   * are combined with OR, precisely so that supplying `renderHeader` alone is
   * never a silent no-op. The close mechanism is unaffected either way: the
   * `onClose` parameter passed to `renderContent`/`renderHeader`, or
   * `useSidebarTab().onClose` from anywhere in a tab's content tree.
   * Default: false
   */
  hideDefaultHeader?: boolean;
  /**
   * Custom header renderer used in place of the library's own drawer header.
   * Passing `renderHeader` is by itself sufficient to suppress the default
   * header, whether or not `hideDefaultHeader` is also set — the two props are
   * combined with OR. Called once for whichever tab is currently active, so
   * the same header markup (e.g. a hamburger icon, a search field, a close
   * button) is shared uniformly across every tab instead of being repeated
   * inside each tab's own `renderContent`. Omit `renderHeader` and set
   * `hideDefaultHeader: true` to render no header at all and let each tab's
   * `renderContent` supply its own instead.
   * @param tab     - the currently active tab
   * @param onClose - call to collapse the sidebar drawer
   * @param onOpen  - call to (re-)select this tab
   */
  renderHeader?: (tab: SidebarTab, onClose: () => void, onOpen: () => void) => React.ReactNode;
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
// renderRailEntry (internal helper)
// Shared by the header/footer areas only — dispatches a SidebarRailEntry to a tab button,
// a default-styled action button, or a fully custom render. The main tabs-list keeps its own
// inline JSX below since it only ever renders SidebarTab entries.
// ==========================================

function renderRailEntry(
  entry: SidebarRailEntry,
  index: number,
  activeTabId: string | null | undefined,
  onTabClick: (tabId: string) => void
): React.ReactNode {
  if (isRailCustom(entry)) {
    return <React.Fragment key={entry.id ?? index}>{entry.render()}</React.Fragment>;
  }
  if (isRailTab(entry)) {
    if (entry.hidden) return null;
    const isActive = activeTabId === entry.id;
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => onTabClick(entry.id)}
        className={`rdd-sidebar-tab-btn${isActive ? ' rdd-active' : ''}`}
        title={entry.label}
        aria-pressed={isActive}
      >
        {entry.icon}
      </button>
    );
  }
  return (
    <button
      key={entry.id ?? index}
      type="button"
      onClick={entry.onClick}
      disabled={entry.disabled}
      className="rdd-sidebar-tab-btn rdd-sidebar-header-action-btn"
      title={entry.label}
      aria-label={entry.label}
    >
      {entry.icon}
    </button>
  );
}

// ==========================================
// SidebarTabStrip (internal sub-component)
// Re-renders only when tabs, selection, or strip visibility changes —
// not on drawer width changes during drag.
// ==========================================

interface SidebarTabStripProps {
  tabs: SidebarTab[];
  headerEntries: SidebarRailEntry[];
  footerEntries: SidebarRailEntry[];
  activeTabId: string | null | undefined;
  isVisible: boolean;
  position: 'left' | 'right';
  onTabClick: (tabId: string) => void;
}

const SidebarTabStrip = memo(function SidebarTabStrip({
  tabs,
  headerEntries,
  footerEntries,
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
      <div
        className={`rdd-sidebar-tabs-strip rdd-${position}${headerEntries.length ? ' rdd-sidebar-tabs-strip--has-header-action' : ''}${footerEntries.length ? ' rdd-sidebar-tabs-strip--has-footer-action' : ''}`}
        style={{ width: '56px', height: '100%' }}
      >
        {headerEntries.length > 0 && (
          <div className="rdd-sidebar-header-area">
            {headerEntries.map((entry, i) => renderRailEntry(entry, i, activeTabId, onTabClick))}
          </div>
        )}
        <div className="rdd-sidebar-tabs-list">
          {tabs.map(tab => {
            if (tab.hidden) return null;
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
        {footerEntries.length > 0 && (
          <div className="rdd-sidebar-footer-area">
            {footerEntries.map((entry, i) => renderRailEntry(entry, i, activeTabId, onTabClick))}
          </div>
        )}
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
      headerAction,
      footerAction,
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
      showCloseButton = false,
      hideDefaultHeader = false,
      renderHeader,
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

    // Normalized header/footer rail entries, and the SidebarTab-shaped subset of each — a
    // header/footer tab (e.g. "Settings") must share the exact same lifecycle as a main tab.
    const normalizedHeaderEntries = useMemo(() => toRailArray(headerAction), [headerAction]);
    const normalizedFooterEntries = useMemo(() => toRailArray(footerAction), [footerAction]);
    const headerTabs = useMemo(() => normalizedHeaderEntries.filter(isRailTab), [normalizedHeaderEntries]);
    const footerTabs = useMemo(() => normalizedFooterEntries.filter(isRailTab), [normalizedFooterEntries]);
    const allTabs = useMemo(() => [...headerTabs, ...tabs, ...footerTabs], [headerTabs, tabs, footerTabs]);

    // Tracks which non-eager tabs have been mounted at least once (for lazy-mount / preserveState).
    // eagerMount tabs are folded in via effectiveMountedTabIds below, so no effect needed for them.
    const [mountedTabIds, setMountedTabIds] = useState<Set<string>>(() => new Set<string>());

    // Derives the full mounted set during render — no effect needed.
    // Includes: accumulated mountedTabIds + the currently active tab (handles controlled
    // prop changes where setActiveTabId is never called) + all eagerMount tabs.
    const effectiveMountedTabIds = useMemo(() => {
      const result = new Set(mountedTabIds);
      if (activeTabId) result.add(activeTabId);
      for (const tab of allTabs) {
        if (tab.eagerMount) result.add(tab.id);
      }
      return result;
    }, [mountedTabIds, activeTabId, allTabs]);

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
              const tab = allTabs.find(t => t.id === tabId);
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
      [isControlled, onActiveTabChange, allTabs]
    );

    // If the active tab stops existing in `tabs`/`headerAction`/`footerAction` (its contributing
    // panel changed/closed, or the tab was otherwise removed), close the drawer rather than
    // leaving it open and empty with no tab button left to click closed — never silently fall
    // back to a different tab the user didn't choose.
    useEffect(() => {
      if (activeTabId != null && !allTabs.some(t => t.id === activeTabId)) {
        setActiveTabId(null);
      }
    }, [activeTabId, allTabs, setActiveTabId]);

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

    // `renderHeader` alone (no `hideDefaultHeader`) also suppresses the default
    // header — see the render condition below. Derived once here so both that
    // condition and the dev-warning effect stay in sync.
    const hasHeaderOverride = hideDefaultHeader || renderHeader != null;

    // Dev-only: showCloseButton renders nothing once the default header is
    // suppressed, since its close button is part of that (now-skipped) header.
    // Warns once per mounted Sidebar — closeButtonWarnedRef lives in component
    // scope (not inside the effect) so it survives re-renders; depending on the
    // derived boolean rather than `renderHeader` itself avoids re-running this
    // on every render, since `renderHeader` is typically passed as a fresh
    // inline arrow function each time.
    const closeButtonWarnedRef = useRef(false);
    useEffect(() => {
      if (process.env.NODE_ENV !== 'development') return;
      if (!showCloseButton || !hasHeaderOverride) return;
      if (closeButtonWarnedRef.current) return;
      closeButtonWarnedRef.current = true;
      console.warn(
        '[react-dockable-desktop] `showCloseButton` has no effect because the default header is ' +
        'suppressed (`hideDefaultHeader` is set, or `renderHeader` was passed). The "X" close button ' +
        'only renders as part of the library\'s own default header, which is skipped in this case. ' +
        'Add your own close control inside `renderHeader` (or `renderContent`), wired to its `onClose` ' +
        'parameter or `useSidebarTab().onClose`.'
      );
    }, [showCloseButton, hasHeaderOverride]);

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
        {allTabs.map(tab => {
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
              {/* Drawer header — tab label, plus an optional close button (showCloseButton) as
                  an extra way to collapse the sidebar; clicking the active tab icon still works too.
                  Suppressed for every tab when hideDefaultHeader is set, OR simply when renderHeader
                  is passed (either alone is sufficient — see hasHeaderOverride above, which keeps
                  this in sync with the dev-warning effect) — onClose/onOpen still flow to either
                  one regardless. */}
              {hasHeaderOverride ? (
                renderHeader?.(tab, handleClose, onOpen)
              ) : (
                <div className="rdd-sidebar-drawer-header">
                  <span className="rdd-sidebar-header-title">{tab.label}</span>
                  {showCloseButton && (
                    <button
                      type="button"
                      className="rdd-sidebar-drawer-close-button"
                      onClick={handleClose}
                      title="Close"
                      aria-label="Close"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )}

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
              headerEntries={normalizedHeaderEntries}
              footerEntries={normalizedFooterEntries}
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
              headerEntries={normalizedHeaderEntries}
              footerEntries={normalizedFooterEntries}
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
