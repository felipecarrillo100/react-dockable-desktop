/**
 * @file PanelOverlayRoot.tsx
 * @description The Panel Overlay root: provides the overlay contexts and draws the corner drop zones.
 */
import React, { useState, useRef, useCallback, useMemo, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import type { FloatAnchor } from '../WindowManagerContext';
import type { ManagedWidget, Stretch, ToolbarPosition } from './types';
import { PanelToolbarContext, PanelManagerContext, PanelOverlayContext } from './context';
import type { PanelOverlayCtx, PanelToolbarCtx, PanelManagerCtx, ManagedPlacement } from './context';
import { forgetPanelDom } from '../domPreservation';
import { bucketsFor, ANCHORS } from '../../core/stretch';
import { ManagedFloatingWindow } from './FloatingWidget';
import { useWidgetHosting } from './useWidgetHosting';
import { ContextMenuContext } from '../ContextMenu';
import { initialFocusFor } from '../workspace/helpers';

/** Where a managed widget starts: its config's corner, stretch and size, docked. */
const seedPlacement = (config: ManagedWidget): ManagedPlacement => ({
  anchor: config.anchor ?? 'top-right',
  stretch: config.stretch ?? null,
  mode: 'docked',
  freePos: null,
  size: { w: config.width ?? 320, h: config.height ?? 240 },
});

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
  // The context menu the title icon opens; none outside a provider, and then the icon stays decorative.
  const contextMenu = useContext(ContextMenuContext);

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
    const reopened = configsRef.current.has(id);
    configsRef.current.set(id, config);
    if (reopened) refreshHosted(id, config);
    setManagedWindows(prev => {
      const next = new Map(prev);
      next.set(id, config);
      return next;
    });
    // Re-opening a live id refreshes its config but leaves it where the user put it.
    setManagedPlacements(prev => (id in prev ? prev : { ...prev, [id]: seedPlacement(config) }));
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
    locationOf: hosting.location,
  }), [managedWindowIds, openManaged, closeManaged, closeAllManaged, hosting.move, hosting.location]);

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
                  {createPortal(cfg.content, el)}
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
