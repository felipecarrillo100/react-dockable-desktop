import React, {
  useState,
  useContext,
  createContext,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { createPortal } from 'react-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Edge of a panel to which a `PanelToolbar` attaches. */
export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right';

/** Corner of a `PanelOverlayRoot` to which a `PanelFloatingWindow` docks. */
export type FloatAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const ANCHORS: readonly FloatAnchor[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Configuration for a window spawned imperatively via `usePanelFloatingWindowManager().open()`.
 * @see usePanelFloatingWindowManager
 */
export interface ManagedWindowConfig {
  /** Text shown in the window's header bar. */
  title: string;
  /** Optional icon shown to the left of the title in the header. */
  icon?: React.ReactNode;
  /** Window body content. */
  content: React.ReactNode;
  /** Corner of the panel to dock to on first render. @default 'top-right' */
  anchor?: FloatAnchor;
  /** Initial width in pixels. */
  width?: number;
  /** Initial height in pixels. */
  height?: number;
}

// ─── Internal contexts ────────────────────────────────────────────────────────

interface PanelToolbarCtx {
  registerToolbar(pos: ToolbarPosition, size: number): () => void;
  insetTop: number;
  insetBottom: number;
}
const PanelToolbarContext = createContext<PanelToolbarCtx | null>(null);

interface PanelManagerCtx {
  managedWindowIds: string[];
  openManaged(id: string, config: ManagedWindowConfig): void;
  closeManaged(id: string): void;
  closeAllManaged(): void;
}
const PanelManagerContext = createContext<PanelManagerCtx | null>(null);

interface PanelOverlayCtx {
  topId: string | null;
  zOrders: Record<string, number>;
  focusWindow(id: string): void;
  containerRef: React.RefObject<HTMLDivElement>;
  stacks: Record<FloatAnchor, string[]>;
  dockedSizes: Record<string, number>;
  dockWindow(id: string, anchor: FloatAnchor): void;
  undockWindow(id: string): void;
  reportDockedSize(id: string, size: number): void;
  draggingId: string | null;
  setDraggingId(id: string | null): void;
  hoveredZone: FloatAnchor | null;
  setHoveredZone(zone: FloatAnchor | null): void;
  insetTop: number;
  insetBottom: number;
}
const PanelOverlayContext = createContext<PanelOverlayCtx | null>(null);

// ─── Helper ───────────────────────────────────────────────────────────────────

const DROP_ZONE_SIZE = 80;

function getHoveredZone(container: HTMLElement, clientX: number, clientY: number): FloatAnchor | null {
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < DROP_ZONE_SIZE && y < DROP_ZONE_SIZE) return 'top-left';
  if (x > rect.width - DROP_ZONE_SIZE && y < DROP_ZONE_SIZE) return 'top-right';
  if (x < DROP_ZONE_SIZE && y > rect.height - DROP_ZONE_SIZE) return 'bottom-left';
  if (x > rect.width - DROP_ZONE_SIZE && y > rect.height - DROP_ZONE_SIZE) return 'bottom-right';
  return null;
}

// ─── PanelOverlayRoot ─────────────────────────────────────────────────────────

/** Props for `<PanelOverlayRoot>`. */
export interface PanelOverlayRootProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Context provider and layout root for the Panel Overlay system. Wrap your panel content
 * with this to enable `PanelToolbar`, `PanelFloatingWindow`, and `usePanelFloatingWindowManager`.
 * @example
 * function MyPanel() {
 *   return (
 *     <PanelOverlayRoot style={{ position: 'relative', width: '100%', height: '100%' }}>
 *       <PanelToolbar position="top">...</PanelToolbar>
 *       <div className="panel-body">content</div>
 *     </PanelOverlayRoot>
 *   );
 * }
 */
export function PanelOverlayRoot({ children, className, style }: PanelOverlayRootProps): React.ReactElement {
  const [toolbarSizes, setToolbarSizes] = useState<Partial<Record<ToolbarPosition, number>>>({});
  const [zOrders, setZOrders] = useState<Record<string, number>>({});
  const [stacks, setStacks] = useState<Record<FloatAnchor, string[]>>({
    'top-left': [], 'top-right': [], 'bottom-left': [], 'bottom-right': [],
  });
  const [dockedSizes, setDockedSizes] = useState<Record<string, number>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredZone, setHoveredZone] = useState<FloatAnchor | null>(null);
  const [topId, setTopId] = useState<string | null>(null);
  const [managedWindows, setManagedWindows] = useState<Map<string, ManagedWindowConfig>>(() => new Map());
  const zCounterRef = useRef(100);
  const containerRef = useRef<HTMLDivElement>(null);

  const registerToolbar = useCallback((pos: ToolbarPosition, size: number): (() => void) => {
    setToolbarSizes(prev => ({ ...prev, [pos]: size }));
    return () => setToolbarSizes(prev => {
      const next = { ...prev };
      delete next[pos];
      return next;
    });
  }, []);

  const focusWindow = useCallback((id: string): void => {
    zCounterRef.current += 1;
    const z = zCounterRef.current;
    setZOrders(prev => ({ ...prev, [id]: z }));
    setTopId(id);
  }, []);

  const dockWindow = useCallback((id: string, anchor: FloatAnchor): void => {
    setStacks(prev => {
      const next: Record<FloatAnchor, string[]> = {
        'top-left': prev['top-left'].filter(x => x !== id),
        'top-right': prev['top-right'].filter(x => x !== id),
        'bottom-left': prev['bottom-left'].filter(x => x !== id),
        'bottom-right': prev['bottom-right'].filter(x => x !== id),
      };
      next[anchor] = [...next[anchor], id];
      return next;
    });
  }, []);

  const undockWindow = useCallback((id: string): void => {
    setStacks(prev => ({
      'top-left': prev['top-left'].filter(x => x !== id),
      'top-right': prev['top-right'].filter(x => x !== id),
      'bottom-left': prev['bottom-left'].filter(x => x !== id),
      'bottom-right': prev['bottom-right'].filter(x => x !== id),
    }));
  }, []);

  const reportDockedSize = useCallback((id: string, size: number): void => {
    setDockedSizes(prev => {
      if (prev[id] === size) return prev;
      return { ...prev, [id]: size };
    });
  }, []);

  const openManaged = useCallback((id: string, config: ManagedWindowConfig): void => {
    setManagedWindows(prev => {
      const next = new Map(prev);
      next.set(id, config);
      return next;
    });
  }, []);

  const closeManaged = useCallback((id: string): void => {
    setManagedWindows(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const closeAllManaged = useCallback((): void => {
    setManagedWindows(new Map());
  }, []);

  const managedWindowIds = useMemo(() => Array.from(managedWindows.keys()), [managedWindows]);

  const toolbarCtxValue = useMemo<PanelToolbarCtx>(() => ({
    registerToolbar,
    insetTop: toolbarSizes.top ?? 0,
    insetBottom: toolbarSizes.bottom ?? 0,
  }), [registerToolbar, toolbarSizes]);

  const managerCtxValue = useMemo<PanelManagerCtx>(() => ({
    managedWindowIds,
    openManaged,
    closeManaged,
    closeAllManaged,
  }), [managedWindowIds, openManaged, closeManaged, closeAllManaged]);

  const coreCtxValue = useMemo<PanelOverlayCtx>(() => ({
    topId,
    zOrders,
    focusWindow,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    stacks,
    dockedSizes,
    dockWindow,
    undockWindow,
    reportDockedSize,
    draggingId,
    setDraggingId,
    hoveredZone,
    setHoveredZone,
    insetTop: toolbarSizes.top ?? 0,
    insetBottom: toolbarSizes.bottom ?? 0,
  }), [topId, zOrders, focusWindow, stacks, dockedSizes, dockWindow, undockWindow,
      reportDockedSize, draggingId, hoveredZone, toolbarSizes]);

  return (
    <PanelToolbarContext.Provider value={toolbarCtxValue}>
      <PanelManagerContext.Provider value={managerCtxValue}>
        <PanelOverlayContext.Provider value={coreCtxValue}>
          <div
            ref={containerRef}
            className={`dw-panel-overlay-root${draggingId !== null ? ' dragging-active' : ''}${className ? ' ' + className : ''}`}
            style={style}
          >
            {children}
            {draggingId !== null && <DropZoneOverlay hoveredZone={hoveredZone} />}
            {Array.from(managedWindows.entries()).map(([id, cfg]) => (
              <PanelFloatingWindow
                key={id}
                id={id}
                title={cfg.title}
                icon={cfg.icon}
                open={true}
                onClose={() => closeManaged(id)}
                defaultAnchor={cfg.anchor ?? 'top-right'}
                defaultWidth={cfg.width ?? 320}
                defaultHeight={cfg.height ?? 240}
              >
                {cfg.content}
              </PanelFloatingWindow>
            ))}
          </div>
        </PanelOverlayContext.Provider>
      </PanelManagerContext.Provider>
    </PanelToolbarContext.Provider>
  );
}

// ─── Internal: DropZoneOverlay ────────────────────────────────────────────────

function DropZoneOverlay({ hoveredZone }: { hoveredZone: FloatAnchor | null }): React.ReactElement {
  return (
    <>
      {ANCHORS.map(zone => (
        <div
          key={zone}
          className={`dw-panel-float-dropzone dw-panel-float-dropzone--${zone}${hoveredZone === zone ? ' dw-panel-float-dropzone--hovered' : ''}`}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

// ─── PanelToolbar ─────────────────────────────────────────────────────────────

/** Background style of a `PanelToolbar`. */
export type ToolbarVariant = 'transparent' | 'frosted' | 'solid';

/** Visual style applied to `ToolbarButton` and `ToolbarToggle` components. */
export type ButtonVariant = 'ghost' | 'soft' | 'outlined' | 'filled';

/** Props for `<PanelToolbar>`. */
export interface PanelToolbarProps {
  /** Edge of the panel overlay to attach to. @see ToolbarPosition */
  position: ToolbarPosition;
  /** Background style of the toolbar strip. @default 'transparent' */
  variant?: ToolbarVariant;
  /** Default button style inherited by `ToolbarButton` and `ToolbarToggle` children. @default 'ghost' */
  buttonVariant?: ButtonVariant;
  /** Icon size in pixels for all buttons in this toolbar. Falls back to CSS default when unset. */
  buttonSize?: number;
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Toolbar strip that attaches to any edge of a `PanelOverlayRoot`.
 * Left/right toolbars inset automatically to avoid overlapping top/bottom toolbars.
 * RTL layouts are detected and handled automatically.
 * @example
 * <PanelToolbar position="top" variant="frosted">
 *   <ToolbarButton icon={<SaveIcon />} title="Save" onClick={save} />
 *   <ToolbarToggle icon={<GridIcon />} title="Grid" active={grid} onToggle={() => setGrid(v => !v)} />
 * </PanelToolbar>
 */
export function PanelToolbar({ position, variant = 'transparent', buttonVariant = 'ghost', buttonSize, style, className, children }: PanelToolbarProps): React.ReactElement {
  const ctx = useContext(PanelToolbarContext);
  const ref = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!ctx) return;
    const size = (position === 'top' || position === 'bottom') ? el.offsetHeight : el.offsetWidth;
    cleanupRef.current?.();
    cleanupRef.current = ctx.registerToolbar(position, size);
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
    // ctx?.registerToolbar is a stable useCallback — depending on ctx directly
    // would re-run on every toolbarSizes update, causing an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, ctx?.registerToolbar]);

  const posStyle: React.CSSProperties = { position: 'absolute', zIndex: 5, pointerEvents: 'none', boxSizing: 'border-box' };

  if (position === 'top') {
    posStyle.top = 0; posStyle.left = 0; posStyle.right = 0;
  } else if (position === 'bottom') {
    posStyle.bottom = 0; posStyle.left = 0; posStyle.right = 0;
  } else if (position === 'left') {
    posStyle.insetInlineStart = 0;
    posStyle.top = ctx?.insetTop ?? 0;
    posStyle.bottom = ctx?.insetBottom ?? 0;
  } else {
    posStyle.insetInlineEnd = 0;
    posStyle.top = ctx?.insetTop ?? 0;
    posStyle.bottom = ctx?.insetBottom ?? 0;
  }

  const isSide = position === 'left' || position === 'right';
  const sideStyle: React.CSSProperties = isSide ? {
    ...(ctx?.insetTop ?? 0) > 0 ? { paddingTop: 0 } : {},
    ...(ctx?.insetBottom ?? 0) > 0 ? { paddingBottom: 0 } : {},
  } : {};

  const sizeStyle: React.CSSProperties = buttonSize != null
    ? { ['--panel-toolbar-btn-size' as string]: `${buttonSize}px` }
    : {};

  return (
    <div
      ref={ref}
      className={`dw-panel-toolbar dw-panel-toolbar--${position}${className ? ' ' + className : ''}`}
      data-variant={variant}
      data-btn-variant={buttonVariant}
      style={{ ...posStyle, ...sideStyle, ...sizeStyle, ...style }}
    >
      {children}
    </div>
  );
}

// ─── ToolbarButton ────────────────────────────────────────────────────────────

/** Props for `<ToolbarButton>`. */
export interface ToolbarButtonProps {
  /** Button icon — typically a small SVG component. */
  icon: React.ReactNode;
  /** Click handler. */
  onClick(): void;
  disabled?: boolean;
  /** Tooltip text and accessible `aria-label`. */
  title?: string;
  /** Visual style override. Falls back to the parent `PanelToolbar`'s `buttonVariant`. */
  variant?: ButtonVariant;
}

/** Icon button for use inside a `PanelToolbar`. */
export function ToolbarButton({ icon, onClick, disabled, title, variant }: ToolbarButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className="dw-panel-toolbar-btn"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      {...(variant ? { 'data-variant': variant } : {})}
    >
      {icon}
    </button>
  );
}

// ─── ToolbarToggle ────────────────────────────────────────────────────────────

/** Props for `<ToolbarToggle>`. */
export interface ToolbarToggleProps {
  /** Button icon — typically a small SVG component. */
  icon: React.ReactNode;
  /** Whether the toggle is in the active/pressed state. Sets `aria-pressed` automatically. */
  active: boolean;
  /** Called when the button is clicked. Toggle `active` in response. */
  onToggle(): void;
  disabled?: boolean;
  /** Tooltip text and accessible `aria-label`. */
  title?: string;
  /** Visual style override. Falls back to the parent `PanelToolbar`'s `buttonVariant`. */
  variant?: ButtonVariant;
}

/** Two-state icon toggle button for use inside a `PanelToolbar`. Sets `aria-pressed` automatically. */
export function ToolbarToggle({ icon, active, onToggle, disabled, title, variant }: ToolbarToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      className={`dw-panel-toolbar-btn${active ? ' dw-panel-toolbar-btn--active' : ''}`}
      onClick={onToggle}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      {...(variant ? { 'data-variant': variant } : {})}
    >
      {icon}
    </button>
  );
}

// ─── ToolbarSeparator ─────────────────────────────────────────────────────────

/** Vertical (or horizontal) divider line between groups of toolbar items. */
export function ToolbarSeparator(): React.ReactElement {
  return <span className="dw-panel-toolbar__sep" aria-hidden="true" />;
}

// ─── ToolbarSpacer ────────────────────────────────────────────────────────────

/** Flex-grow spacer that pushes subsequent toolbar items to the far edge. */
export function ToolbarSpacer(): React.ReactElement {
  return <span className="dw-panel-toolbar__spacer" aria-hidden="true" />;
}

// ─── ToolbarItem (custom control wrapper) ────────────────────────────────────

/** Wrapper for a custom non-button control (e.g. a dropdown or input) inside a `PanelToolbar`. */
export function ToolbarItem({ children }: { children: React.ReactNode }): React.ReactElement {
  return <span className="dw-panel-toolbar__item">{children}</span>;
}

// ─── ToolbarCenter ────────────────────────────────────────────────────────────

/** Centers its children within the toolbar using absolute positioning. */
export function ToolbarCenter({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="dw-panel-toolbar__center">{children}</div>;
}

// ─── ToolbarSearchInput ───────────────────────────────────────────────────────

/** A single result item returned by `ToolbarSearchInputProps.onSearch`. */
export interface SearchResult {
  /** Unique identifier for this result — passed to `onSelect`. */
  id: string;
  /** Primary display text. */
  label: string;
  /** Optional secondary text shown below the label in the dropdown. */
  description?: string;
  /** Optional group header used to bucket results visually. */
  group?: string;
  /** Optional icon shown to the left of the label. */
  icon?: React.ReactNode;
}

/** Props for `<ToolbarSearchInput>`. */
export interface ToolbarSearchInputProps {
  /** Placeholder text shown in the expanded input field. @default 'Search…' */
  placeholder?: string;
  /**
   * Called with the current query and an `AbortSignal` each time the input changes (debounced).
   * Return `SearchResult[]` directly for synchronous sources, or `Promise<SearchResult[]>` for async.
   * Abort in-flight requests when the signal fires to prevent stale result races.
   */
  onSearch(query: string, signal: AbortSignal): Promise<SearchResult[]> | SearchResult[];
  /** Called when the user selects a result from the dropdown. */
  onSelect(result: SearchResult): void;
}

/**
 * Debounced async search field for use inside a `PanelToolbar`.
 * Renders as a compact icon button that expands into a text input on activation.
 * Results appear in a portal-rendered dropdown below the input.
 * @example
 * <ToolbarSearchInput
 *   placeholder="Find layer…"
 *   onSearch={(q, signal) => fetchLayers(q, { signal })}
 *   onSelect={result => workspace.focusLayer(result.id)}
 * />
 */
export function ToolbarSearchInput({ placeholder = 'Search…', onSearch, onSelect }: ToolbarSearchInputProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSearch = (): void => {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closeSearch = (): void => {
    setExpanded(false);
    setQuery('');
    setResults([]);
    setDropdownPos(null);
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const q = e.target.value;
    setQuery(q);
    abortRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setDropdownPos(null); return; }

    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await onSearch(q, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setResults(res);
          const el = containerRef.current;
          if (el && res.length > 0) {
            const r = el.getBoundingClientRect();
            const dropW = Math.max(r.width, 240);
            let left = r.left;
            if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8;
            setDropdownPos({ top: r.bottom + 4, left, width: dropW });
          } else {
            setDropdownPos(null);
          }
        }
      } catch {
        // AbortError or user-thrown — ignore
      }
    }, 300);
  };

  const handleSelect = (result: SearchResult): void => {
    onSelect(result);
    closeSearch();
  };

  const handleBlur = (e: React.FocusEvent): void => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      closeSearch();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') closeSearch();
  };

  const grouped = useMemo((): Record<string, SearchResult[]> => {
    const map: Record<string, SearchResult[]> = {};
    for (const r of results) {
      const g = r.group ?? '';
      if (!map[g]) map[g] = [];
      map[g].push(r);
    }
    return map;
  }, [results]);

  const SearchIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="6.5" r="4.5" />
      <line x1="10" y1="10" x2="14" y2="14" />
    </svg>
  );

  if (!expanded) {
    return (
      <div ref={containerRef} className="dw-panel-toolbar-search">
        <button type="button" className="dw-panel-toolbar-btn" onClick={openSearch} title="Search" aria-label="Search">
          {SearchIcon}
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="dw-panel-toolbar-search dw-panel-toolbar-search--open" onBlur={handleBlur}>
      <button type="button" className="dw-panel-toolbar-btn" onClick={closeSearch} aria-label="Close search" title="Close search">
        {SearchIcon}
      </button>
      <input
        ref={inputRef}
        className="dw-panel-toolbar-search__input"
        type="text"
        value={query}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {dropdownPos && results.length > 0 && createPortal(
        <div
          className="dw-panel-toolbar-search__dropdown"
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9502 }}
          onMouseDown={e => e.preventDefault()}
        >
          {Object.entries(grouped).map(([group, items]) => (
            <React.Fragment key={group || '__default__'}>
              {group && <div className="dw-panel-toolbar-search__group">{group}</div>}
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="dw-panel-toolbar-search__item"
                  onClick={() => handleSelect(item)}
                >
                  {item.icon && <span className="dw-panel-toolbar-search__item-icon">{item.icon}</span>}
                  <span className="dw-panel-toolbar-search__item-label">{item.label}</span>
                  {item.description && <span className="dw-panel-toolbar-search__item-desc">{item.description}</span>}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── PanelFloatingWindow ──────────────────────────────────────────────────────

/** Props for `<PanelFloatingWindow>`. */
export interface PanelFloatingWindowProps {
  /** Unique identifier within the panel overlay. Used for z-order and stack tracking. */
  id: string;
  /** Text shown in the window's header bar. */
  title: string;
  /** Optional icon shown to the left of the title in the header. */
  icon?: React.ReactNode;
  /** Whether the window is mounted and visible. Set to `false` to close/unmount it. */
  open: boolean;
  /** Called when the user clicks the × button. Set `open` to `false` in response. */
  onClose(): void;
  /** Corner of the panel to dock to on first render. @see FloatAnchor */
  defaultAnchor: FloatAnchor;
  /** Initial width in pixels. */
  defaultWidth: number;
  /** Initial height in pixels. */
  defaultHeight: number;
  children?: React.ReactNode;
}

/**
 * Declarative floating window anchored inside a `PanelOverlayRoot`.
 * Supports 8-direction resize, drag-to-free, and drag-to-dock at any corner.
 * Multiple windows docked to the same corner stack vertically with animated offsets.
 * @example
 * const info = usePanelFloatingWindow();
 * <PanelFloatingWindow
 *   id="layer-info" title="Layer Info"
 *   open={info.isOpen} onClose={info.close}
 *   defaultAnchor="top-right" defaultWidth={300} defaultHeight={200}
 * >
 *   <LayerInfoContent />
 * </PanelFloatingWindow>
 */
export function PanelFloatingWindow(props: PanelFloatingWindowProps): React.ReactElement | null {
  const ctx = useContext(PanelOverlayContext);
  if (!props.open) return null;
  return <FloatingWindowBody key={props.id} ctx={ctx} {...props} />;
}

// ─── Internal: FloatingWindowBody ─────────────────────────────────────────────

interface FloatingWindowBodyProps extends PanelFloatingWindowProps {
  ctx: PanelOverlayCtx | null;
}

type WindowMode = 'docked' | 'free';
type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

const MIN_W = 120;
const MIN_H = 60;
const DOCK_INSET = 8;
const DOCK_GAP = 8;

function FloatingWindowBody({ id, title, icon, defaultAnchor, defaultWidth, defaultHeight, children, ctx, onClose }: FloatingWindowBodyProps): React.ReactElement {
  const [mode, setMode] = useState<WindowMode>('docked');
  const [currentAnchor, setCurrentAnchor] = useState<FloatAnchor>(defaultAnchor);
  const [freePos, setFreePos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: defaultWidth, h: defaultHeight });
  const windowRef = useRef<HTMLDivElement>(null);

  // Refs to avoid stale closures in pointer handlers
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const freePosRef = useRef(freePos);
  freePosRef.current = freePos;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const dragState = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number; hasDragged: boolean } | null>(null);
  const resizeState = useRef<{ dir: ResizeDir; mouseX: number; mouseY: number; startX: number; startY: number; w: number; h: number } | null>(null);

  // Register in stack on mount; unregister on unmount (close).
  // Close resets to defaultAnchor on next open (fresh mount = fresh state).
  useLayoutEffect(() => {
    ctx?.dockWindow(id, defaultAnchor);
    return () => { ctx?.undockWindow(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Report height whenever size changes so stack peers can compute their offset.
  useEffect(() => {
    ctx?.reportDockedSize(id, size.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.h]);

  const zOrder = ctx?.zOrders[id] ?? 101;

  const isActive = !ctx || ctx.topId === id;

  const getContainerBounds = (): { cw: number; ch: number } => {
    const container = windowRef.current?.offsetParent as HTMLElement | null;
    return { cw: container?.clientWidth ?? 9999, ch: container?.clientHeight ?? 9999 };
  };

  const handleWindowPointerDown = (): void => {
    ctx?.focusWindow(id);
  };

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();

    let startX: number;
    let startY: number;

    if (modeRef.current === 'docked') {
      // Snapshot rendered position before undocking so there's no visual jump
      const el = windowRef.current;
      const container = ctx?.containerRef?.current;
      if (el && container) {
        const elRect = el.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        startX = elRect.left - cRect.left;
        startY = elRect.top - cRect.top;
      } else {
        startX = DOCK_INSET;
        startY = ctx?.insetTop ?? 0;
      }
      ctx?.undockWindow(id);
      setMode('free');
      setFreePos({ x: startX, y: startY });
    } else {
      startX = freePosRef.current?.x ?? 0;
      startY = freePosRef.current?.y ?? 0;
    }

    dragState.current = { mouseX: e.clientX, mouseY: e.clientY, posX: startX, posY: startY, hasDragged: false };
    windowRef.current?.setPointerCapture(e.pointerId);
  };

  const handleResizePointerDown = (dir: ResizeDir) => (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Snapshot current rendered position for offset-from-edge calculations
    let startX = 0, startY = 0;
    if (modeRef.current === 'free') {
      startX = freePosRef.current?.x ?? 0;
      startY = freePosRef.current?.y ?? 0;
    } else {
      const el = windowRef.current;
      const container = el?.offsetParent as HTMLElement | null;
      if (el && container) {
        const er = el.getBoundingClientRect();
        const cr = container.getBoundingClientRect();
        startX = er.left - cr.left;
        startY = er.top - cr.top;
      }
    }
    resizeState.current = { dir, mouseX: e.clientX, mouseY: e.clientY, startX, startY, w: sizeRef.current.w, h: sizeRef.current.h };
    windowRef.current?.setPointerCapture(e.pointerId);
  };

  const handleWindowPointerMove = (e: React.PointerEvent): void => {
    if (dragState.current) {
      const ds = dragState.current;
      if (!ds.hasDragged) {
        const dist = Math.abs(e.clientX - ds.mouseX) + Math.abs(e.clientY - ds.mouseY);
        if (dist < 4) return;
        ds.hasDragged = true;
        ctx?.setDraggingId(id);
      }
      const { cw, ch } = getContainerBounds();
      const newX = Math.max(0, Math.min(ds.posX + e.clientX - ds.mouseX, cw - sizeRef.current.w));
      const newY = Math.max(0, Math.min(ds.posY + e.clientY - ds.mouseY, ch - sizeRef.current.h));
      setFreePos({ x: newX, y: newY });

      const container = ctx?.containerRef?.current;
      if (container) {
        ctx?.setHoveredZone(getHoveredZone(container, e.clientX, e.clientY));
      }
    } else if (resizeState.current) {
      const rs = resizeState.current;
      const dx = e.clientX - rs.mouseX;
      const dy = e.clientY - rs.mouseY;
      const { cw, ch } = getContainerBounds();

      let newX = rs.startX, newY = rs.startY, newW = rs.w, newH = rs.h;

      if (rs.dir.includes('e')) {
        newW = Math.max(MIN_W, Math.min(rs.w + dx, cw - rs.startX));
      }
      if (rs.dir.includes('s')) {
        newH = Math.max(MIN_H, Math.min(rs.h + dy, ch - rs.startY));
      }
      if (rs.dir.includes('n')) {
        const clampedDY = Math.max(-(rs.startY), Math.min(dy, rs.h - MIN_H));
        newH = rs.h - clampedDY;
        newY = rs.startY + clampedDY;
      }
      if (rs.dir.includes('w')) {
        const clampedDX = Math.max(-(rs.startX), Math.min(dx, rs.w - MIN_W));
        newW = rs.w - clampedDX;
        newX = rs.startX + clampedDX;
      }

      setSize({ w: newW, h: newH });
      if (modeRef.current === 'free') {
        setFreePos({ x: newX, y: newY });
      }
    }
  };

  const handleWindowPointerUp = (): void => {
    if (dragState.current) {
      const zone = ctx?.hoveredZone;
      if (zone) {
        ctx?.dockWindow(id, zone);
        setCurrentAnchor(zone);
        setMode('docked');
        setFreePos(null);
      }
      ctx?.setHoveredZone(null);
      ctx?.setDraggingId(null);
    }
    dragState.current = null;
    resizeState.current = null;
  };

  // ── Compute position style ─────────────────────────────────────────────────
  let windowStyle: React.CSSProperties;

  if (mode === 'docked' && ctx) {
    const stack = ctx.stacks[currentAnchor] ?? [];
    const idx = stack.indexOf(id);
    let stackOffset = 0;
    for (let i = 0; i < idx; i++) {
      stackOffset += (ctx.dockedSizes[stack[i]] ?? defaultHeight) + DOCK_GAP;
    }

    windowStyle = {
      width: size.w,
      height: size.h,
      zIndex: zOrder,
      transition: 'top 0.2s ease, bottom 0.2s ease',
      // Hide until registered in stack (first layout effect hasn't run yet)
      opacity: idx === -1 ? 0 : undefined,
      pointerEvents: idx === -1 ? 'none' : undefined,
    };

    if (currentAnchor.endsWith('-right')) {
      windowStyle.right = DOCK_INSET;
    } else {
      windowStyle.left = DOCK_INSET;
    }

    if (currentAnchor.startsWith('top-')) {
      windowStyle.top = ctx.insetTop + stackOffset;
    } else {
      windowStyle.bottom = ctx.insetBottom + stackOffset;
    }
  } else {
    windowStyle = {
      left: freePos?.x ?? 0,
      top: freePos?.y ?? 0,
      width: size.w,
      height: size.h,
      zIndex: zOrder,
    };
  }

  const CloseIcon = (
    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="1" x2="9" y2="9" />
      <line x1="9" y1="1" x2="1" y2="9" />
    </svg>
  );

  return (
    <div
      ref={windowRef}
      className={`dw-panel-float${isActive ? ' dw-panel-float--active' : ''}`}
      style={windowStyle}
      onPointerDown={handleWindowPointerDown}
      onPointerMove={handleWindowPointerMove}
      onPointerUp={handleWindowPointerUp}
    >
      <div className="dw-panel-float__header" onPointerDown={handleHeaderPointerDown}>
        {icon && <span className="dw-panel-float__icon">{icon}</span>}
        <span className="dw-panel-float__title">{title}</span>
        <button
          type="button"
          className="dw-panel-float__close"
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
          title="Close"
          aria-label="Close"
        >
          {CloseIcon}
        </button>
      </div>
      <div className="dw-panel-float__body">{children}</div>
      {mode === 'free' && <>
        <div className="resize-handle resize-n"  onPointerDown={handleResizePointerDown('n')}  />
        <div className="resize-handle resize-ne" onPointerDown={handleResizePointerDown('ne')} />
        <div className="resize-handle resize-nw" onPointerDown={handleResizePointerDown('nw')} />
      </>}
      <div className="resize-handle resize-e"  onPointerDown={handleResizePointerDown('e')}  />
      <div className="resize-handle resize-se" onPointerDown={handleResizePointerDown('se')} />
      <div className="resize-handle resize-s"  onPointerDown={handleResizePointerDown('s')}  />
      <div className="resize-handle resize-sw" onPointerDown={handleResizePointerDown('sw')} />
      <div className="resize-handle resize-w"  onPointerDown={handleResizePointerDown('w')}  />
    </div>
  );
}

// ─── usePanelFloatingWindow ───────────────────────────────────────────────────

/** Return type of `usePanelFloatingWindow`. @see usePanelFloatingWindow */
export interface UsePanelFloatingWindowReturn {
  /** Whether the floating window is currently open. */
  isOpen: boolean;
  /** Open the floating window. */
  open(): void;
  /** Close the floating window. */
  close(): void;
}

/**
 * Manages the open/close boolean state for a single `PanelFloatingWindow`.
 * Pass `isOpen` to `open`, `close` to `onClose` on the component directly.
 * @returns A stable `UsePanelFloatingWindowReturn` object.
 * @example
 * const info = usePanelFloatingWindow();
 * <PanelFloatingWindow id="info" open={info.isOpen} onClose={info.close} ... />
 */
export function usePanelFloatingWindow(): UsePanelFloatingWindowReturn {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback((): void => { setIsOpen(true); }, []);
  const close = useCallback((): void => { setIsOpen(false); }, []);
  return { isOpen, open, close };
}

// ─── usePanelFloatingWindowManager ───────────────────────────────────────────

const EMPTY_IDS: string[] = [];

/**
 * Imperative handle returned by `usePanelFloatingWindowManager`.
 * @see usePanelFloatingWindowManager
 */
export interface PanelFloatingWindowManagerHandle {
  /** Spawn or reconfigure a named window. Safe to call with an already-open ID to update config. */
  open(id: string, config: ManagedWindowConfig): void;
  /** Close a named window by ID. No-op if the window is not open. */
  close(id: string): void;
  /** Close all managed windows. */
  closeAll(): void;
  /** Returns `true` if the named window is currently open. */
  isOpen(id: string): boolean;
  /** IDs of all currently open managed windows. Changes to this array trigger re-renders. */
  openIds: string[];
}

/**
 * Imperative hook for spawning N named floating windows at runtime from data or event handlers.
 * All windows share z-ordering, drag, and corner-docking infrastructure of the `PanelOverlayRoot`.
 *
 * Must be called inside a **descendant** of `PanelOverlayRoot`, not in the component that renders the root.
 * @returns A stable `PanelFloatingWindowManagerHandle`.
 * @example
 * const manager = usePanelFloatingWindowManager();
 * manager.open('feature-42', { title: 'Feature 42', content: <FeatureDetail id={42} />, anchor: 'top-right' });
 */
export function usePanelFloatingWindowManager(): PanelFloatingWindowManagerHandle {
  const ctx = useContext(PanelManagerContext);
  const ids = ctx?.managedWindowIds ?? EMPTY_IDS;

  return useMemo(() => ({
    open: (id: string, config: ManagedWindowConfig) => ctx?.openManaged(id, config),
    close: (id: string) => ctx?.closeManaged(id),
    closeAll: () => ctx?.closeAllManaged(),
    isOpen: (id: string) => ids.includes(id),
    openIds: ids,
  }), [ctx, ids]);
}
