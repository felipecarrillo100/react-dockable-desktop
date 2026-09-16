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
import { WindowStateContext, formatLabel, useFormatMessage, usePredefinedMessages } from './WindowManagerContext';
import type { FloatAnchor } from './WindowManagerContext';
// Type-only, so this stays a one-way dependency: PanelProviderContext imports nothing from here.
import type { PanelTitle } from './PanelProviderContext';
import { flipZoneHorizontal } from './anchorGeometry';
import { startPointerDrag, computeResizedRect } from './dragResize';
import type { ResizeDir } from './dragResize';
export type { FloatAnchor };

// ─── Types ────────────────────────────────────────────────────────────────────

/** Edge of a panel to which a `PanelToolbar` attaches. */
export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Which of a docked widget's axes span the host panel instead of carrying a fixed size.
 *
 * A docked widget normally pins one end of each axis and carries an explicit size. A stretched
 * axis pins **both** ends and carries no size at all, so the widget tracks the panel as it
 * resizes — with no `ResizeObserver` and no JS, because CSS already does exactly this.
 *
 * - `'width'` — spans the panel's inline axis; height still fixed. A status or timeline strip.
 * - `'height'` — spans the block axis; width still fixed. A full-height side column.
 * - `'both'` — fills the panel, the inner-widget equivalent of maximizing a floating window.
 */
export type Stretch = 'width' | 'height' | 'both';

/**
 * Where a docked widget sits: which corner it is anchored to, plus which axes (if any) span the
 * panel. Reported as a unit because a single gesture can change both at once — dropping a
 * full-width bottom strip onto the left edge flips the anchor *and* the stretched axis together,
 * and reporting those separately would expose a state that is never actually valid.
 */
export interface PanelFloatPlacement {
  anchor: FloatAnchor;
  stretch: Stretch | null;
}

const stretchesInline = (s: Stretch | null): boolean => s === 'width' || s === 'both';
const stretchesBlock = (s: Stretch | null): boolean => s === 'height' || s === 'both';

/** Adds one axis to a stretch value, keeping whatever was already stretched. */
const addAxis = (s: Stretch | null, axis: 'inline' | 'block'): Stretch => {
  if (axis === 'inline') return stretchesBlock(s) ? 'both' : 'width';
  return stretchesInline(s) ? 'both' : 'height';
};

/** Drops one axis from a stretch value, keeping the other. */
const releaseAxis = (s: Stretch | null, axis: 'inline' | 'block'): Stretch | null => {
  if (axis === 'inline') return s === 'both' ? 'height' : stretchesInline(s) ? null : s;
  return s === 'both' ? 'width' : stretchesBlock(s) ? null : s;
};

/**
 * Which stack buckets a placement occupies.
 *
 * The four corner buckets are really a proxy for *"do these overlap on the inline axis?"* — two
 * widgets in the same corner overlap and so stack; widgets in opposite corners sit side by side and
 * don't. A full-width strip overlaps everything on its edge, so it belongs to **both** buckets of
 * that edge and pushes the widgets in each. (Computing real inline overlap was rejected: widths
 * change continuously during a resize drag, so widgets would reshuffle mid-gesture.)
 *
 * A block-stretched widget spans the very axis stacking uses to separate siblings, so it can't
 * participate at all and occupies no bucket — z-order decides any overlap.
 */
const bucketsFor = (anchor: FloatAnchor, stretch: Stretch | null): FloatAnchor[] => {
  if (stretchesBlock(stretch)) return [];
  if (stretchesInline(stretch)) {
    return anchor.startsWith('top-')
      ? ['top-left', 'top-right']
      : ['bottom-left', 'bottom-right'];
  }
  return [anchor];
};

/** Replaces one half of a corner anchor, leaving the other axis alone. */
const withInlineHalf = (a: FloatAnchor, half: 'left' | 'right'): FloatAnchor =>
  `${a.startsWith('top-') ? 'top' : 'bottom'}-${half}` as FloatAnchor;
const withBlockHalf = (a: FloatAnchor, half: 'top' | 'bottom'): FloatAnchor =>
  `${half}-${a.endsWith('-right') ? 'right' : 'left'}` as FloatAnchor;

const ANCHORS: readonly FloatAnchor[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Configuration for a window spawned imperatively via `usePanelFloatingWindowManager().open()`.
 * @see usePanelFloatingWindowManager
 */
export interface ManagedWindowConfig {
  /**
   * Text shown in the window's header bar. Accepts a plain string or an i18n message descriptor.
   *
   * A descriptor is re-resolved on every render, so the header follows a language change without
   * the window being closed and reopened — which a plain string cannot do here, because this
   * config is stored by the overlay rather than re-read from your own render.
   */
  title: PanelTitle;
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
  /**
   * Which axes span the panel instead of carrying a fixed size. `width`/`height` above still apply
   * to any axis that isn't spanning, and are what a spanning axis returns to when released.
   * @see Stretch
   */
  stretch?: Stretch;
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
  dockWindow(id: string, anchor: FloatAnchor, stretch?: Stretch | null): void;
  undockWindow(id: string): void;
  reportDockedSize(id: string, size: number): void;
  draggingId: string | null;
  setDraggingId(id: string | null): void;
  hoveredZone: FloatAnchor | null;
  setHoveredZone(zone: FloatAnchor | null): void;
  /** Block-axis space claimed by `PanelToolbar`s on the top/bottom edges. */
  insetTop: number;
  insetBottom: number;
  /**
   * Inline-axis space claimed by `PanelToolbar`s on the `left`/`right` edges. Logical, matching
   * how `PanelToolbar` positions itself (`insetInlineStart`/`insetInlineEnd`), so `left` means
   * inline-start regardless of direction. `registerToolbar` has always recorded these; they simply
   * weren't surfaced, so nothing could keep clear of a side toolbar the way the block axis does.
   */
  insetInlineStart: number;
  insetInlineEnd: number;
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

  const dockWindow = useCallback((id: string, anchor: FloatAnchor, stretch: Stretch | null = null): void => {
    const buckets = bucketsFor(anchor, stretch);
    setStacks(prev => {
      const next: Record<FloatAnchor, string[]> = {
        'top-left': prev['top-left'].filter(x => x !== id),
        'top-right': prev['top-right'].filter(x => x !== id),
        'bottom-left': prev['bottom-left'].filter(x => x !== id),
        'bottom-right': prev['bottom-right'].filter(x => x !== id),
      };
      for (const bucket of buckets) next[bucket] = [...next[bucket], id];
      // Re-registering identical membership would allocate fresh arrays on every placement effect
      // and churn every consumer of `stacks`, so bail out when nothing actually moved.
      const unchanged = ANCHORS.every(a =>
        next[a].length === prev[a].length && next[a].every((x, i) => x === prev[a][i]));
      return unchanged ? prev : next;
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
    insetInlineStart: toolbarSizes.left ?? 0,
    insetInlineEnd: toolbarSizes.right ?? 0,
  }), [topId, zOrders, focusWindow, stacks, dockedSizes, dockWindow, undockWindow,
      reportDockedSize, draggingId, hoveredZone, toolbarSizes]);

  return (
    <PanelToolbarContext.Provider value={toolbarCtxValue}>
      <PanelManagerContext.Provider value={managerCtxValue}>
        <PanelOverlayContext.Provider value={coreCtxValue}>
          <div
            ref={containerRef}
            className={`rdd-panel-overlay-root${draggingId !== null ? ' rdd-dragging-active' : ''}${className ? ' ' + className : ''}`}
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
                defaultStretch={cfg.stretch}
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
          className={`rdd-panel-float-dropzone rdd-panel-float-dropzone--${zone}${hoveredZone === zone ? ' rdd-panel-float-dropzone--hovered' : ''}`}
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
    const measure = () => {
      const size = (position === 'top' || position === 'bottom') ? el.offsetHeight : el.offsetWidth;
      cleanupRef.current?.();
      cleanupRef.current = ctx.registerToolbar(position, size);
    };
    measure();
    // A one-shot measurement is correct for a live mount (already at final size), but during a
    // layout restore (loadLayout()/initialState) the panel's DOM isn't necessarily settled yet at
    // this exact instant — without re-measuring, a wrong size (often 0) is baked in permanently,
    // and every docked float ends up positioned at the toolbar's own y/x, covering it. This also
    // catches any later size change (button wrapping, a buttonSize/variant change, content change).
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
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
    ? { ['--rdd-panel-toolbar-btn-size' as string]: `${buttonSize}px` }
    : {};

  return (
    <div
      ref={ref}
      className={`rdd-panel-toolbar rdd-panel-toolbar--${position}${className ? ' ' + className : ''}`}
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
      className="rdd-panel-toolbar-btn"
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
      className={`rdd-panel-toolbar-btn${active ? ' rdd-panel-toolbar-btn--active' : ''}`}
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
  return <span className="rdd-panel-toolbar__sep" aria-hidden="true" />;
}

// ─── ToolbarSpacer ────────────────────────────────────────────────────────────

/** Flex-grow spacer that pushes subsequent toolbar items to the far edge. */
export function ToolbarSpacer(): React.ReactElement {
  return <span className="rdd-panel-toolbar__spacer" aria-hidden="true" />;
}

// ─── ToolbarItem (custom control wrapper) ────────────────────────────────────

/** Wrapper for a custom non-button control (e.g. a dropdown or input) inside a `PanelToolbar`. */
export function ToolbarItem({ children }: { children: React.ReactNode }): React.ReactElement {
  return <span className="rdd-panel-toolbar__item">{children}</span>;
}

// ─── ToolbarCenter ────────────────────────────────────────────────────────────

/** Centers its children within the toolbar using absolute positioning. */
export function ToolbarCenter({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="rdd-panel-toolbar__center">{children}</div>;
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
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
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
      <div ref={containerRef} className="rdd-panel-toolbar-search">
        <button type="button" className="rdd-panel-toolbar-btn" onClick={openSearch} title="Search" aria-label="Search">
          {SearchIcon}
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rdd-panel-toolbar-search rdd-panel-toolbar-search--open" onBlur={handleBlur}>
      <button type="button" className="rdd-panel-toolbar-btn" onClick={closeSearch} aria-label="Close search" title="Close search">
        {SearchIcon}
      </button>
      <input
        ref={inputRef}
        className="rdd-panel-toolbar-search__input"
        type="text"
        value={query}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {dropdownPos && results.length > 0 && createPortal(
        <div
          className="rdd-panel-toolbar-search__dropdown"
          // z-index from .rdd-panel-toolbar-search__dropdown (+8502), not inline, so
          // zIndexBase shifts it too. Resolves to the same 9502 by default.
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
          onMouseDown={e => e.preventDefault()}
        >
          {Object.entries(grouped).map(([group, items]) => (
            <React.Fragment key={group || '__default__'}>
              {group && <div className="rdd-panel-toolbar-search__group">{group}</div>}
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="rdd-panel-toolbar-search__item"
                  onClick={() => handleSelect(item)}
                >
                  {item.icon && <span className="rdd-panel-toolbar-search__item-icon">{item.icon}</span>}
                  <span className="rdd-panel-toolbar-search__item-label">{item.label}</span>
                  {item.description && <span className="rdd-panel-toolbar-search__item-desc">{item.description}</span>}
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
  /** Text shown in the window's header bar. Accepts a plain string or an i18n message descriptor. */
  title: PanelTitle;
  /** Optional icon shown to the left of the title in the header. */
  icon?: React.ReactNode;
  /** Whether the window is mounted and visible. Set to `false` to close/unmount it. */
  open: boolean;
  /** Called when the user clicks the × button. Set `open` to `false` in response. */
  onClose(): void;
  /** Corner of the panel to dock to on first render. @see FloatAnchor */
  defaultAnchor: FloatAnchor;
  /** Initial width in pixels. Ignored on an axis that starts stretched, and restored to when that
   *  axis is later released. */
  defaultWidth: number;
  /** Initial height in pixels. Ignored on an axis that starts stretched, and restored to when that
   *  axis is later released. */
  defaultHeight: number;
  /**
   * Which axes span the panel on first render. Uncontrolled: gestures update it from here.
   * @see Stretch
   */
  defaultStretch?: Stretch;
  /**
   * Controlled stretch state. When provided — **including as `null`** — the caller is the single
   * source of truth: gestures report through {@link PanelFloatingWindowProps.onPlacementChange}
   * instead of updating internally, and the caller must echo the new value back. Omit entirely
   * (`undefined`) for uncontrolled behaviour, matching `ToolbarToggleItem.active` and
   * `Sidebar.activeTabId`.
   */
  stretch?: Stretch | null;
  /**
   * Called whenever a gesture changes where the widget sits — a stretched axis released, a
   * re-dock, or a detach. Reports anchor and stretch **together**, because one gesture can change
   * both at once and reporting them separately would surface a state that is never valid.
   *
   * This is also the only way to persist placement: the library serialises nothing about inner
   * widgets, so store what you receive here and feed it back via `defaultAnchor`/`stretch`.
   */
  onPlacementChange?: (placement: PanelFloatPlacement) => void;
  /**
   * Whether this widget may span the panel at all. `false` disables resize-to-stretch snapping,
   * for content that only makes sense at a bounded size. Default `true`.
   */
  stretchable?: boolean;
  children?: React.ReactNode;
}

/**
 * Declarative floating window anchored inside a `PanelOverlayRoot`.
 *
 * Docks to any corner, drags free of it, and drops back onto one. Windows sharing a corner stack
 * along the block axis with animated offsets. An axis can also **span the panel** instead of
 * carrying a fixed size, so the window tracks the panel as it resizes — see
 * {@link PanelFloatingWindowProps.defaultStretch} and {@link Stretch}.
 *
 * Resize handles follow what is actually movable: a free-floating window is pinned by nothing and
 * offers all eight, while a docked one offers only its free edges — plus both ends of any spanning
 * axis, either of which releases it.
 *
 * @example
 * const info = usePanelFloatingWindow();
 * <PanelFloatingWindow
 *   id="layer-info" title="Layer Info"
 *   open={info.isOpen} onClose={info.close}
 *   defaultAnchor="top-right" defaultWidth={300} defaultHeight={200}
 * >
 *   <LayerInfoContent />
 * </PanelFloatingWindow>
 *
 * @example
 * // A full-width status strip along the bottom, tracking the panel's width.
 * // defaultHeight still applies; defaultWidth is what the inline axis returns to if released.
 * <PanelFloatingWindow
 *   id="timeline" title="Timeline"
 *   open onClose={close}
 *   defaultAnchor="bottom-left" defaultStretch="width"
 *   defaultWidth={240} defaultHeight={120}
 * >
 *   <TimelineContent />
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

const MIN_W = 120;
const MIN_H = 60;
const DOCK_INSET = 8;
const DOCK_GAP = 8;
/**
 * Resize-to-stretch snapping. Asymmetric on purpose: arming within `SNAP_IN` of the full extent
 * but only disarming once the drag pulls back past the wider `SNAP_OUT`. Without that hysteresis,
 * releasing a stretched axis by dragging a few pixels inward would immediately re-arm and snap
 * straight back on release, which makes the gesture feel broken.
 */
const SNAP_IN = 16;
const SNAP_OUT = 40;

function FloatingWindowBody({ id, title, icon, defaultAnchor, defaultWidth, defaultHeight, defaultStretch, stretch: stretchProp, onPlacementChange, stretchable = true, children, ctx, onClose }: FloatingWindowBodyProps): React.ReactElement {
  const isRtl = useContext(WindowStateContext)?.isRtl ?? false;
  // Resolved here rather than at the call site, so a descriptor title re-resolves whenever the
  // formatter changes. Both hooks fall back to the message's own `defaultMessage` when there is no
  // provider, so an overlay used outside a WindowManager keeps working.
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  const [mode, setMode] = useState<WindowMode>('docked');
  const [currentAnchor, setCurrentAnchor] = useState<FloatAnchor>(defaultAnchor);
  // `size` is deliberately left untouched while an axis is stretched — the render branch below
  // simply stops reading it, exactly as a maximized workspace window keeps its x/y/w/h. Releasing
  // the axis therefore restores the previous size with no snapshot and no bookkeeping.
  const [internalStretch, setInternalStretch] = useState<Stretch | null>(defaultStretch ?? null);
  // Controlled when the prop is present at all — `null` is a meaningful value ("not stretched"),
  // so only `undefined` means "manage it yourself".
  const isStretchControlled = stretchProp !== undefined;
  const stretch = isStretchControlled ? (stretchProp ?? null) : internalStretch;
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
  const stretchRef = useRef(stretch);
  stretchRef.current = stretch;
  const currentAnchorRef = useRef(currentAnchor);
  currentAnchorRef.current = currentAnchor;
  const onPlacementChangeRef = useRef(onPlacementChange);
  onPlacementChangeRef.current = onPlacementChange;
  /** Which axes would snap to stretched if the drag were released now — drives the visual cue. */
  const [snapArmed, setSnapArmed] = useState<{ inline: boolean; block: boolean }>({ inline: false, block: false });
  const snapArmedRef = useRef(snapArmed);
  snapArmedRef.current = snapArmed;
  /** The block extent available to this widget depends on what it is stacked behind. */
  const stackOffsetRef = useRef(0);

  /**
   * The single write path for placement. Anchor is always internal; stretch is internal only when
   * uncontrolled. Either way the pair is reported once, so a listener never observes a half-applied
   * transition.
   */
  const applyPlacement = useCallback((anchor: FloatAnchor, next: Stretch | null): void => {
    setCurrentAnchor(anchor);
    if (!isStretchControlled) setInternalStretch(next);
    onPlacementChangeRef.current?.({ anchor, stretch: next });
  }, [isStretchControlled]);

  const dragState = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number; hasDragged: boolean } | null>(null);

  // Bucket membership depends on the whole placement (see bucketsFor), so this re-runs whenever
  // the anchor or a stretched axis changes — not only on mount. Free-floating widgets are in no
  // stack at all.
  useLayoutEffect(() => {
    if (mode !== 'docked') return;
    ctx?.dockWindow(id, currentAnchor, stretch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, currentAnchor, stretch]);

  // Leave the stack on unmount (close). Closing resets to the defaults on the next open, since a
  // fresh mount means fresh state.
  useLayoutEffect(() => () => { ctx?.undockWindow(id); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  // Dev-only: a block-stretched widget spans the whole block axis, so it cannot stack with
  // anything — it will simply overlap siblings on its own inline side, with z-order deciding.
  // Warns once per widget, matching the warning conventions in Sidebar/WindowManager.
  const blockStretchWarnedRef = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (blockStretchWarnedRef.current) return;
    if (mode !== 'docked' || !stretchesBlock(stretch) || !ctx) return;
    const half = currentAnchor.endsWith('-right') ? 'right' : 'left';
    const neighbours = ([`top-${half}`, `bottom-${half}`] as FloatAnchor[])
      .flatMap(bucket => ctx.stacks[bucket] ?? [])
      .filter(other => other !== id);
    if (neighbours.length === 0) return;
    blockStretchWarnedRef.current = true;
    console.warn(
      `[react-dockable-desktop] PanelFloatingWindow "${id}" stretches the block axis ` +
      `(stretch: "${stretch}") while ${neighbours.length} other widget(s) are anchored to the ` +
      `same side (${neighbours.join(', ')}). A block-stretched widget spans the axis that stacking ` +
      `uses to separate siblings, so it cannot stack and will overlap them — z-order decides which ` +
      `is on top. Either give it a fixed height, or move the other widgets to the opposite side.`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stretch, currentAnchor, ctx?.stacks, id]);

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

  /**
   * The band a docked widget is allowed to occupy, in physical pixels from the container's edges.
   *
   * The block axis keeps clear of top/bottom `PanelToolbar`s only; the inline axis also adds the
   * `DOCK_INSET` gutter, matching how a docked widget is already positioned (one inline inset of
   * `DOCK_INSET`, one block inset of the toolbar size). Growth previously stopped at the raw
   * container edge, so a docked widget could be resized straight over the toolbar on the far side —
   * which the library elsewhere treats as a bug (a 5.x fix stopped docked floats *positioning*
   * themselves over a toolbar; the resize path never got the same treatment).
   *
   * Inline is converted from logical to physical here because handle directions and measured rects
   * are physical, while `PanelToolbar` claims its space logically.
   */
  const dockedBand = (): { left: number; right: number; top: number; bottom: number } => {
    const logicalStart = ctx?.insetInlineStart ?? 0;
    const logicalEnd = ctx?.insetInlineEnd ?? 0;
    return {
      left: (isRtl ? logicalEnd : logicalStart) + DOCK_INSET,
      right: (isRtl ? logicalStart : logicalEnd) + DOCK_INSET,
      top: ctx?.insetTop ?? 0,
      bottom: ctx?.insetBottom ?? 0,
    };
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
      // Snapshot the rendered position so that *if* this becomes a real drag, switching to free
      // positioning causes no visual jump. Undocking itself is deferred to the drag threshold
      // below — doing it here meant a plain click on the header silently tore the widget off its
      // anchor: it looked unchanged, but its stacked siblings reflowed to close the gap and it
      // stopped tracking the corner on every later panel resize.
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
    // For a stretched axis the stored size is stale by design (the render branch stops reading it),
    // so the drag has to start from the *measured* extent or the widget would jump.
    const measured = windowRef.current?.getBoundingClientRect();
    const startRect = {
      x: startX,
      y: startY,
      w: stretchesInline(stretchRef.current) && measured ? measured.width : sizeRef.current.w,
      h: stretchesBlock(stretchRef.current) && measured ? measured.height : sizeRef.current.h,
    };

    // Dragging an end of a stretched axis releases that axis: the edge under the pointer becomes
    // the moving one and the opposite end becomes the new pin, so it reads exactly like an ordinary
    // resize. Done once per drag; `released` guards against repeat moves before the re-render.
    const dragsInline = dir.includes('e') || dir.includes('w');
    const dragsBlock = dir.includes('n') || dir.includes('s');
    let released = false;
    let armed = { inline: false, block: false };
    const releaseIfNeeded = (): void => {
      if (released || modeRef.current !== 'docked') return;
      const st = stretchRef.current;
      const releasingInline = dragsInline && stretchesInline(st);
      const releasingBlock = dragsBlock && stretchesBlock(st);
      if (!releasingInline && !releasingBlock) return;
      released = true;

      let next = st;
      let nextAnchor = currentAnchorRef.current;
      if (releasingInline) {
        next = releaseAxis(next, 'inline');
        // Pin the end opposite the dragged edge. Handle dirs are physical, anchors are logical.
        const pinsPhysicalLeft = dir.includes('e');
        nextAnchor = withInlineHalf(nextAnchor, (pinsPhysicalLeft !== isRtl) ? 'left' : 'right');
      }
      if (releasingBlock) {
        next = releaseAxis(next, 'block');
        nextAnchor = withBlockHalf(nextAnchor, dir.includes('s') ? 'top' : 'bottom');
      }
      applyPlacement(nextAnchor, next);
    };

    startPointerDrag({
      element: e.currentTarget,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      captureStart: () => startRect,
      activeClasses: [{ el: document.body, classes: ['rdd-resizing-active'] }],
      onMove: (dx, dy, start) => {
        // Re-measured every move, matching the original's live re-measurement —
        // the container can in principle change size during a drag.
        const { cw, ch } = getContainerBounds();
        // Docked widgets stop at the toolbar band; free-floating ones stay unconstrained beyond the
        // container itself, since "free" means free.
        const band = modeRef.current === 'docked'
          ? dockedBand()
          : { left: 0, right: 0, top: 0, bottom: 0 };
        const { x: newX, y: newY, w: newW, h: newH } = computeResizedRect(dir, dx, dy, start, {
          minW: MIN_W, minH: MIN_H,
          maxW: (cw - band.right) - start.x, maxH: (ch - band.bottom) - start.y,
          minX: band.left, minY: band.top,
        });
        releaseIfNeeded();

        // ── resize-to-stretch snapping ──
        // The clamps above already stop growth exactly where a stretched axis would sit, so an
        // armed drag is already visually at its target; the cue is an outline rather than a ghost.
        if (modeRef.current === 'docked' && stretchable) {
          const fullInline = cw - band.left - band.right;
          const fullBlock = ch - band.top - band.bottom - stackOffsetRef.current;
          const st = stretchRef.current;
          const nextArmed = { ...armed };
          if (dragsInline && !stretchesInline(st)) {
            if (newW >= fullInline - SNAP_IN) nextArmed.inline = true;
            else if (armed.inline && newW < fullInline - SNAP_OUT) nextArmed.inline = false;
          }
          if (dragsBlock && !stretchesBlock(st)) {
            if (newH >= fullBlock - SNAP_IN) nextArmed.block = true;
            else if (armed.block && newH < fullBlock - SNAP_OUT) nextArmed.block = false;
          }
          if (nextArmed.inline !== armed.inline || nextArmed.block !== armed.block) {
            armed = nextArmed;
            setSnapArmed(nextArmed);
          }
        }
        // Only write an axis that carries a size. A still-stretched axis must keep its stored
        // value, so releasing it later restores the size it had before stretching.
        const st = released ? releaseAxis(releaseAxis(stretchRef.current,
          dragsInline ? 'inline' : 'block'), dragsBlock ? 'block' : 'inline') : stretchRef.current;
        setSize(prev => ({
          w: stretchesInline(st) ? prev.w : newW,
          h: stretchesBlock(st) ? prev.h : newH,
        }));
        if (modeRef.current === 'free') {
          setFreePos({ x: newX, y: newY });
        }
      },
      onEnd: (start) => {
        if (!armed.inline && !armed.block) {
          if (snapArmedRef.current.inline || snapArmedRef.current.block) {
            setSnapArmed({ inline: false, block: false });
          }
          return;
        }
        // Restore the size the axis had *before* this drag: while an axis is stretched its stored
        // size is what releasing it later returns to, so it should be the size the user last chose
        // deliberately — not the full-bleed value the drag happened to pass through.
        setSize(prev => ({
          w: armed.inline ? start.w : prev.w,
          h: armed.block ? start.h : prev.h,
        }));
        let next = stretchRef.current;
        if (armed.inline) next = addAxis(next, 'inline');
        if (armed.block) next = addAxis(next, 'block');
        applyPlacement(currentAnchorRef.current, next);
        setSnapArmed({ inline: false, block: false });
      },
    });
  };

  const handleWindowPointerMove = (e: React.PointerEvent): void => {
    if (dragState.current) {
      const ds = dragState.current;
      if (!ds.hasDragged) {
        const dist = Math.abs(e.clientX - ds.mouseX) + Math.abs(e.clientY - ds.mouseY);
        if (dist < 4) return;
        ds.hasDragged = true;
        // This, not pointerdown, is the moment the widget leaves its anchor.
        if (modeRef.current === 'docked') {
          // A stretched axis carries no size, so free mode — which positions from an explicit box —
          // would otherwise snap back to whatever the size was before stretching. Materialise what
          // is actually on screen, then clear stretch: "free" and "spanning the panel" are
          // mutually exclusive.
          if (stretchRef.current) {
            const r = windowRef.current?.getBoundingClientRect();
            if (r) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
            applyPlacement(currentAnchorRef.current, null);
          }
          ctx?.undockWindow(id);
          setMode('free');
        }
        document.body.classList.add('rdd-dragging-active');
        ctx?.setDraggingId(id);
      }
      const { cw, ch } = getContainerBounds();
      const newX = Math.max(0, Math.min(ds.posX + e.clientX - ds.mouseX, cw - sizeRef.current.w));
      const newY = Math.max(0, Math.min(ds.posY + e.clientY - ds.mouseY, ch - sizeRef.current.h));
      setFreePos({ x: newX, y: newY });

      const container = ctx?.containerRef?.current;
      if (container) {
        const rawZone = getHoveredZone(container, e.clientX, e.clientY);
        ctx?.setHoveredZone(rawZone && isRtl ? flipZoneHorizontal(rawZone) : rawZone);
      }
    }
  };

  const handleWindowPointerUp = (): void => {
    if (dragState.current?.hasDragged) {
      const zone = ctx?.hoveredZone;
      if (zone) {
        ctx?.dockWindow(id, zone, stretchRef.current);
        setMode('docked');
        setFreePos(null);
        applyPlacement(zone, stretchRef.current);
      }
      ctx?.setHoveredZone(null);
      ctx?.setDraggingId(null);
    }
    document.body.classList.remove('rdd-dragging-active');
    dragState.current = null;
  };

  const handleWindowPointerCancel = (): void => {
    if (dragState.current?.hasDragged) {
      ctx?.setHoveredZone(null);
      ctx?.setDraggingId(null);
    }
    document.body.classList.remove('rdd-dragging-active');
    dragState.current = null;
  };

  // ── Compute position style ─────────────────────────────────────────────────
  let windowStyle: React.CSSProperties;

  if (mode === 'docked' && ctx) {
    // Offset is the largest offset across every bucket this widget occupies, so a strip spanning
    // an edge clears whatever is stacked in *both* of that edge's corners.
    const buckets = bucketsFor(currentAnchor, stretch);
    let stackOffset = 0;
    // A widget with no buckets (block-stretched) is never "in" a stack, so it must not be held
    // invisible by the not-yet-registered guard below.
    let registered = buckets.length === 0;
    for (const bucket of buckets) {
      const stack = ctx.stacks[bucket] ?? [];
      const idx = stack.indexOf(id);
      if (idx === -1) continue;
      registered = true;
      let offset = 0;
      for (let i = 0; i < idx; i++) {
        offset += (ctx.dockedSizes[stack[i]] ?? defaultHeight) + DOCK_GAP;
      }
      stackOffset = Math.max(stackOffset, offset);
    }
    stackOffsetRef.current = stackOffset;

    const band = dockedBand();

    windowStyle = {
      zIndex: zOrder,
      transition: 'top 0.2s ease, bottom 0.2s ease',
      // Hide until registered in stack (first layout effect hasn't run yet)
      opacity: registered ? undefined : 0,
      pointerEvents: registered ? undefined : 'none',
    };

    // Inline axis: one inset plus an explicit width, or both insets and no width at all. Setting
    // both ends is the whole mechanism — CSS then keeps the widget spanning the panel for free.
    if (stretchesInline(stretch)) {
      windowStyle.insetInlineStart = (ctx.insetInlineStart ?? 0) + DOCK_INSET;
      windowStyle.insetInlineEnd = (ctx.insetInlineEnd ?? 0) + DOCK_INSET;
    } else {
      windowStyle[currentAnchor.endsWith('-right') ? 'insetInlineEnd' : 'insetInlineStart'] = DOCK_INSET;
      windowStyle.width = size.w;
    }

    // Block axis: same idea. Note the block insets carry no DOCK_INSET gutter, matching how a
    // docked widget has always been positioned against a top/bottom toolbar (flush, not inset).
    if (stretchesBlock(stretch)) {
      windowStyle.top = band.top;
      windowStyle.bottom = band.bottom;
    } else if (currentAnchor.startsWith('top-')) {
      windowStyle.top = band.top + stackOffset;
      windowStyle.height = size.h;
    } else {
      windowStyle.bottom = band.bottom + stackOffset;
      windowStyle.height = size.h;
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

  // ── Which resize handles this window offers ────────────────────────────────
  // Free-floating: all eight, nothing is pinned.
  //
  // Docked: only the edges that can actually move. A docked window has one edge pinned per axis
  // (see the positioning block above — `top-*` pins `top`, `bottom-*` pins `bottom`, `*-left`
  // pins `insetInlineStart`, `*-right` pins `insetInlineEnd`), so dragging a handle on a pinned
  // side moves the *opposite* edge instead of the one under the cursor, and can't move it further
  // than that side's own inset before `computeResizedRect`'s bounds stop it — an inert stub with a
  // resize cursor on it. The handle set used to be hardcoded to the five non-northern directions
  // regardless of anchor, which made that harmless-looking for top anchors but left every
  // bottom-anchored window with no working vertical resize at all: `n` wasn't rendered, and `s`
  // was the stub.
  //
  // Restricting docked mode to free edges also means the existing resize bounds are already
  // correct for every direction that remains: `maxW`/`maxH` apply only to eastward/southward
  // growth (where the top-left origin genuinely is pinned), while `minX`/`minY` bound the moving
  // edge for westward/northward growth — so no change to the resize math is needed.
  const handleDirs: ResizeDir[] = React.useMemo(() => {
    if (mode === 'free') return ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

    // Block axis is direction-agnostic; the inline axis is not. The pin is a logical property
    // (`insetInlineEnd`) but the handle classes are physical (`.rdd-resize-e { right: -4px }`), so
    // which *physical* side is pinned depends on the window's own `dir`.
    const freeBlock: ResizeDir = currentAnchor.startsWith('top-') ? 's' : 'n';
    const pinsPhysicalRight = currentAnchor.endsWith('-right') !== isRtl;
    const freeInline: ResizeDir = pinsPhysicalRight ? 'w' : 'e';

    const inlineStretched = stretchesInline(stretch);
    const blockStretched = stretchesBlock(stretch);

    // A stretched axis has both ends pinned, but both are *releasable*: dragging either end moves
    // that edge and pins the opposite one, so the widget leaves stretch at the width the drag
    // produced. Hence handles on both ends — which is also what keeps the fully-stretched state
    // from being a dead end with nothing to grab.
    const dirs: ResizeDir[] = [];
    dirs.push(...(inlineStretched ? (['e', 'w'] as ResizeDir[]) : [freeInline]));
    dirs.push(...(blockStretched ? (['n', 's'] as ResizeDir[]) : [freeBlock]));
    // The corner belongs only to the all-pinned state; in a stretched state it would mix a resize
    // and a release into one gesture.
    if (!inlineStretched && !blockStretched) dirs.push(`${freeBlock}${freeInline}` as ResizeDir);
    return dirs;
  }, [mode, currentAnchor, isRtl, stretch]);

  const CloseIcon = (
    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="1" x2="9" y2="9" />
      <line x1="9" y1="1" x2="1" y2="9" />
    </svg>
  );

  return (
    <div
      ref={windowRef}
      dir={isRtl ? 'rtl' : 'ltr'}
      className={[
        'rdd-panel-float',
        isActive ? 'rdd-panel-float--active' : '',
        snapArmed.inline || snapArmed.block ? 'rdd-panel-float--snapping' : '',
      ].filter(Boolean).join(' ')}
      style={windowStyle}
      onPointerDown={handleWindowPointerDown}
      onPointerMove={handleWindowPointerMove}
      onPointerUp={handleWindowPointerUp}
      onPointerCancel={handleWindowPointerCancel}
    >
      <div className="rdd-panel-float__header" onPointerDown={handleHeaderPointerDown}>
        {icon && <span className="rdd-panel-float__icon">{icon}</span>}
        <span className="rdd-panel-float__title">{formatLabel(title, formatMessage)}</span>
        <button
          type="button"
          className="rdd-panel-float__close"
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
          title={formatLabel(messages.closeTooltip, formatMessage)}
          aria-label={formatLabel(messages.closeTooltip, formatMessage)}
        >
          {CloseIcon}
        </button>
      </div>
      <div className="rdd-panel-float__body">{children}</div>
      {handleDirs.map(dir => (
        <div
          key={dir}
          className={`rdd-resize-handle rdd-resize-${dir}`}
          onPointerDown={handleResizePointerDown(dir)}
        />
      ))}
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
 * All windows share z-ordering, drag, and corner-docking infrastructure of the `PanelOverlayRoot`,
 * and accept the same placement options — including {@link ManagedWindowConfig.stretch} to span an
 * axis of the panel.
 *
 * Must be called inside a **descendant** of `PanelOverlayRoot`, not in the component that renders the root.
 * @returns A stable `PanelFloatingWindowManagerHandle`.
 * @example
 * const manager = usePanelFloatingWindowManager();
 * manager.open('feature-42', { title: 'Feature 42', content: <FeatureDetail id={42} />, anchor: 'top-right' });
 *
 * // A full-width strip along the bottom edge:
 * manager.open('timeline', { title: 'Timeline', content: <Timeline />, anchor: 'bottom-left', stretch: 'width', height: 120 });
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
