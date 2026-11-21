/**
 * @file PanelOverlayRoot.tsx
 * @description The Panel Overlay root: provides the overlay contexts and draws the corner drop zones.
 */
import React, { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { resizeObserverFor } from '../../utils/domContext';
import type { FloatAnchor } from '../WindowManagerContext';
import type { ManagedWidget, Stretch, ToolbarPosition } from './types';
import { PanelToolbarContext, PanelManagerContext, PanelOverlayContext } from './context';
import type { PanelOverlayCtx, PanelToolbarCtx, PanelManagerCtx, ManagedPlacement } from './context';
import { forgetPanelDom } from '../domPreservation';
import { setPreserveEmbeds } from '../domMove';
import { toPanelForm, fromPanelForm, parsePlacement } from '../../core/widgetPlacement';
import type { PanelBox, PanelForm, OutTarget } from '../../core/widgetPlacement';
import type { WidgetPlacement, WidgetTarget } from './types';
import { useOptionalWindowManagerState } from '../WindowManagerContext';
import { bucketsFor, ANCHORS } from '../../core/stretch';
import { ManagedFloatingWindow } from './FloatingWidget';
import { useWidgetHosting, useWidgetContainer } from './useWidgetHosting';
import type { WidgetHosting } from './useWidgetHosting';
import { WidgetContext } from './widgetContext';
import type { WidgetHandle } from './widgetContext';
import { ContextMenuContext } from '../ContextMenu';
import { initialFocusFor } from '../workspace/helpers';
import { WorkspaceInstanceContext } from '../WorkspaceInstanceContext';
import { PanelWindowContext, PopoutWrapperContext, usePanelWindow } from '../workspace/panelWindow';
import { usePanelWindowOf } from '../workspace/panelMount';

/** Where a managed widget starts: its config's corner, stretch and size, docked. */
const seedPlacement = (config: ManagedWidget): ManagedPlacement => ({
  anchor: config.anchor ?? 'top-right',
  stretch: config.stretch ?? null,
  mode: 'docked',
  freePos: null,
  size: { w: config.width ?? 320, h: config.height ?? 240 },
});

/** A saved out-of-panel target as a move; a floating rect is clamped into the workspace as it is now. */
function targetOf(out: OutTarget, root: HTMLElement | null): WidgetTarget {
  if (out.at === 'tabbed') return { to: 'tabbed' };
  if (out.at === 'docked') return { to: 'docked', position: out.position, ...(out.size !== undefined ? { size: out.size } : {}) };
  const viewport = root?.closest('.rdd-workspace-viewport') as HTMLElement | null | undefined;
  const vw = viewport?.clientWidth ?? 0;
  const vh = viewport?.clientHeight ?? 0;
  const r = out.rect;
  if (vw <= 0 || vh <= 0) return { to: 'floating', rect: r };
  const width = Math.min(r.width, vw);
  const height = Math.min(r.height, vh);
  return { to: 'floating', rect: { x: Math.min(r.x, vw - width), y: Math.min(r.y, vh - height), width, height } };
}

// ─── PanelOverlayRoot ─────────────────────────────────────────────────────────

/** Props for `<RddPanelOverlay>`. */
export interface RddPanelOverlayProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Context provider and layout root for the Panel Overlay system. Wrap your panel content
 * with this to enable `RddPanelToolbar`, `RddFloatingWidget`, and `useFloatingWidgets`.
 * @example
 * function MyPanel() {
 *   return (
 *     <RddPanelOverlay style={{ position: 'relative', width: '100%', height: '100%' }}>
 *       <RddPanelToolbar position="top">...</RddPanelToolbar>
 *       <div className="my-panel-body">content</div>
 *     </RddPanelOverlay>
 *   );
 * }
 */
export function PanelOverlayRoot({ children, className, style }: RddPanelOverlayProps): React.ReactElement {
  const [toolbarSizes, setToolbarSizes] = useState<Partial<Record<ToolbarPosition, number>>>({});
  const [zOrders, setZOrders] = useState<Record<string, number>>({});
  const [stacks, setStacks] = useState<Record<FloatAnchor, string[]>>({
    'top-left': [], 'top-right': [], 'bottom-left': [], 'bottom-right': [],
  });
  const [dockedSizes, setDockedSizes] = useState<Record<string, number>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredZone, setHoveredZone] = useState<FloatAnchor | null>(null);
  const [topId, setTopId] = useState<string | null>(null);
  const [managedWindows, setManagedWindows] = useState<Map<string, ManagedWidget>>(() => new Map());
  // Where each managed widget sits and how big it is, owned here rather than inside its frame, so
  // the overlay always knows and the frame can unmount (vdd's and ndd's overlay stores keep the
  // same record). Seeded once per open from the config, then updated by gestures; closing drops
  // it, so close-then-open is the reset.
  const [managedPlacements, setManagedPlacements] = useState<Record<string, ManagedPlacement>>({});
  // Each managed widget's content element, `div.rdd-panel-float__content`. The content is rendered
  // into it once, for the widget's whole life, and the element is what moves: so its state, and
  // the DOM state of what it holds, survive whatever happens to the frame.
  // A stable Map, written only by open and close, never during render.
  const [contentEls] = useState(() => new Map<string, HTMLDivElement>());
  // The configs again, for code that must read them synchronously (moving a widget out).
  const configsRef = useRef(new Map<string, ManagedWidget>());
  const zCounterRef = useRef(100);
  const containerRef = useRef<HTMLDivElement>(null);
  // Set below; the hosting hook needs it before it exists (a user's close of a hosted panel).
  const closeWidgetRef = useRef<(id: string) => void>(() => {});
  const hosting = useWidgetHosting({ contentEls, configs: configsRef, containerRef, closeWidget: closeWidgetRef });
  const { release: releaseHosted, refresh: refreshHosted } = hosting;
  // move() and outTarget() change identity each render; open and placement() call the latest.
  const hostingRef = useRef(hosting);
  useEffect(() => { hostingRef.current = hosting; });
  const isRtl = useOptionalWindowManagerState(s => s.isRtl, false);
  const isRtlRef = useRef(isRtl);
  useEffect(() => { isRtlRef.current = isRtl; });
  // The store again, for placement(), which is called between renders.
  const placementsRef = useRef(managedPlacements);
  useEffect(() => { placementsRef.current = managedPlacements; });
  // Restored free positions waiting for the panel to have a size (a hidden panel measures 0×0).
  const pendingRef = useRef(new Map<string, PanelForm>());
  const [pendingCount, setPendingCount] = useState(0);
  /** The panel's size and direction now, or null while it has none. */
  const boxNow = (): PanelBox | null => {
    const el = containerRef.current;
    return el && el.clientWidth > 0 && el.clientHeight > 0
      ? { width: el.clientWidth, height: el.clientHeight, rtl: isRtlRef.current } : null;
  };
  // The context menu the title icon opens; none outside a provider, and then the icon stays decorative.
  const contextMenu = useContext(ContextMenuContext);
  // For the development warning on a widget's canPopOut (7.12.0).
  const popOuts = useContext(WorkspaceInstanceContext)?._popOut ?? null;
  const popOutsRef = useRef(popOuts);
  useEffect(() => { popOutsRef.current = popOuts; });
  const warnedRef = useRef(new Set<string>());

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

  const openManaged = useCallback((id: string, config: ManagedWidget): void => {
    if (!contentEls.has(id)) {
      const el = (containerRef.current?.ownerDocument ?? document).createElement('div');
      el.className = 'rdd-panel-float__content';
      // The content is portalled into this element, so React events in it don't reach the frame:
      // bring the widget to the front natively, as a pointerdown anywhere in the frame does.
      el.addEventListener('pointerdown', () => focusWindow(id));
      contentEls.set(id, el);
    }
    if (config.canPopOut && popOutsRef.current && !popOutsRef.current.enabled && process.env.NODE_ENV === 'development' && !warnedRef.current.has(id)) {
      warnedRef.current.add(id);
      console.warn(
        `[react-dockable-desktop] Widget "${id}" sets canPopOut, but this workspace was created without ` +
        `popOut, so it can't open in its own window. Pass createWorkspace({ popOut: true }) to enable it.`
      );
    }
    const reopened = configsRef.current.has(id);
    configsRef.current.set(id, config);
    setPreserveEmbeds(contentEls.get(id)!, config.preserveEmbeds === true);
    if (config.preserveEmbeds) hostingRef.current.preserveOwner();
    if (reopened) refreshHosted(id, config);
    setManagedWindows(prev => {
      const next = new Map(prev);
      next.set(id, config);
      return next;
    });
    if (reopened) return;   // a re-open of a live id refreshes its config, but leaves it where it is
    // A saved placement, read and applied to the panel as it is now; else the config's own.
    const saved = config.placement !== undefined ? parsePlacement(config.placement) : null;
    let seed = seedPlacement(config);
    if (saved?.home) {
      const { state, deferred } = fromPanelForm(saved.home, boxNow());
      seed = state;
      if (deferred) { pendingRef.current.set(id, saved.home); setPendingCount(c => c + 1); }
    }
    setManagedPlacements(prev => (id in prev ? prev : { ...prev, [id]: seed }));
    // Out of the panel, as saved. A refusal leaves it in the panel.
    if (saved?.out) hostingRef.current.move(id, targetOf(saved.out, containerRef.current));
  }, [contentEls, focusWindow, refreshHosted]);

  /** Drops a closed widget's content element; its content unmounts with the portal. */
  const forgetContentEl = useCallback((id: string): void => {
    const el = contentEls.get(id);
    if (!el) return;
    contentEls.delete(id);
    forgetPanelDom(el);
    el.remove();
  }, [contentEls]);

  const closeManaged = useCallback((id: string): void => {
    pendingRef.current.delete(id);
    releaseHosted(id);
    configsRef.current.delete(id);
    setManagedWindows(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setManagedPlacements(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    forgetContentEl(id);
  }, [forgetContentEl, releaseHosted]);
  useEffect(() => { closeWidgetRef.current = closeManaged; });

  const closeAllManaged = useCallback((): void => {
    pendingRef.current.clear();
    Array.from(configsRef.current.keys()).forEach(releaseHosted);
    configsRef.current.clear();
    setManagedWindows(new Map());
    setManagedPlacements({});
    Array.from(contentEls.keys()).forEach(forgetContentEl);
  }, [contentEls, forgetContentEl, releaseHosted]);

  /**
   * A gesture's report. Ignored for a widget that is no longer open: a gesture can land after a
   * close, and writing then would leave a placement that the next open would wrongly reuse.
   */
  const updateManagedPlacement = useCallback(
    (id: string, patch: (prev: ManagedPlacement) => Partial<ManagedPlacement>): void => {
      setManagedPlacements(prev => (id in prev ? { ...prev, [id]: { ...prev[id], ...patch(prev[id]) } } : prev));
    }, []);

  /** Where a widget is, as JSON to save: see `WidgetPlacement`. */
  const placementOf = useCallback((id: string): WidgetPlacement | null => {
    if (!configsRef.current.has(id)) return null;
    const pending = pendingRef.current.get(id);
    const current = placementsRef.current[id];
    const home = pending ?? (current ? toPanelForm(current, boxNow()) : null);
    if (!home) return null;
    const out = hostingRef.current.outTarget(id);
    return (out ? { v: 1, home, ...out } : home) as unknown as WidgetPlacement;
  }, []);

  // Apply restored free positions once the panel has a size.
  useEffect(() => {
    if (pendingCount === 0) return;
    const apply = (): void => {
      const box = boxNow();
      if (!box || pendingRef.current.size === 0) return;
      for (const [id, form] of pendingRef.current) {
        const { state } = fromPanelForm(form, box);
        updateManagedPlacement(id, () => state);
      }
      pendingRef.current.clear();
      setPendingCount(0);
    };
    apply();
    const el = containerRef.current;
    // From the container's own window: it may be in a pop-out's document.
    const ro = el ? resizeObserverFor(el, apply) : null;
    if (!el || !ro) return;
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount]);

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
    moveManaged: hosting.move,
    popOutManaged: hosting.popOut,
    locationOf: hosting.location,
    placementOf,
  }), [managedWindowIds, openManaged, closeManaged, closeAllManaged, hosting.move, hosting.popOut, hosting.location, placementOf]);

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
            {Array.from(managedWindows.entries()).map(([id, cfg]) => {
              const placement = managedPlacements[id] ?? seedPlacement(cfg);
              const el = contentEls.get(id);
              if (!el) return null;   // openManaged always sets it first; defensive only
              return (
                <React.Fragment key={id}>
                  {createPortal(<WidgetScope id={id} hosting={hosting}>{cfg.content}</WidgetScope>, el)}
                  {/* Out of the panel, a hosted panel shows the content and there is no frame. */}
                  {!(id in hosting.hostedIds) && <ManagedFloatingWindow
                    id={id}
                    title={cfg.title}
                    icon={cfg.icon}
                    open={true}
                    onClose={() => closeManaged(id)}
                    controlled={{ placement, update: patch => updateManagedPlacement(id, patch) }}
                    contentEl={el}
                    onTitleMenu={cfg.titleMenu && contextMenu ? (e) => {
                      const items = hosting.menuItems(id);
                      if (items.length > 0) contextMenu.show({ event: e, items, initialFocus: initialFocusFor(e) });
                    } : undefined}
                  />}
                </React.Fragment>
              );
            })}
          </div>
        </PanelOverlayContext.Provider>
      </PanelManagerContext.Provider>
    </PanelToolbarContext.Provider>
  );
}

// ─── Internal: WidgetScope ────────────────────────────────────────────────────

/**
 * Provides `useWidget()` to one managed widget's content, and calls its `onMoved` callbacks
 * whenever its element has landed in another container.
 */
function WidgetScope({ id, hosting, children }: { id: string; hosting: WidgetHosting; children: React.ReactNode }): React.ReactElement {
  const { location, key } = useWidgetContainer(hosting.hostedIds[id], hosting.ownerPanelId ?? '');
  const { listen, settled, ownerPanelId } = hosting;
  const lastKey = useRef(key);
  useLayoutEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    settled(id);
  }, [key, id, settled]);
  // Its own panel's id while it is out of its panel; a widget in the panel has none.
  const panelId = hosting.hostedIds[id] ?? null;
  const isPoppedOut = key === 'floating|out';
  const handle = useMemo<WidgetHandle>(() => ({
    id,
    ownerPanelId,
    panelId,
    location,
    isPoppedOut,
    onWillMove: cb => listen(id, 'will', cb),
    onMoved: cb => listen(id, 'moved', cb),
  }), [id, ownerPanelId, panelId, location, isPoppedOut, listen]);
  // The window its content is in (7.12.0): its own panel's when out of its owner panel (in the page,
  // or in a pop-out), else its owner's. With pop-outs on, the app's popoutWrapper is around it too,
  // for its whole life, so a CSS-in-JS cache follows the widget into its window.
  const ownerWindow = usePanelWindow();
  const ownWindow = usePanelWindowOf(panelId ?? '');
  const panelWindow = panelId ? ownWindow : ownerWindow;
  const enabled = !!useContext(WorkspaceInstanceContext)?._popOut.enabled;
  const Wrapper = useContext(PopoutWrapperContext);
  return (
    <WidgetContext.Provider value={handle}>
      <PanelWindowContext.Provider value={panelWindow}>
        {enabled && Wrapper
          // The app's component from the provider, stable across renders: not one made here.
          // eslint-disable-next-line react-hooks/static-components
          ? <Wrapper window={panelWindow.window} document={panelWindow.document}>{children}</Wrapper>
          : children}
      </PanelWindowContext.Provider>
    </WidgetContext.Provider>
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
