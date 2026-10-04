/**
 * @file PanelOverlayRoot.tsx
 * @description The Panel Overlay root: provides the overlay contexts and draws the corner drop zones.
 */
import React, { useState, useRef, useCallback, useMemo } from 'react';
import type { FloatAnchor } from '../WindowManagerContext';
import type { ManagedWidget, Stretch, ToolbarPosition } from './types';
import { PanelToolbarContext, PanelManagerContext, PanelOverlayContext } from './context';
import type { PanelOverlayCtx, PanelToolbarCtx, PanelManagerCtx } from './context';
import { bucketsFor, ANCHORS } from '../../core/stretch';
import { PanelFloatingWindow } from './FloatingWidget';

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

  const openManaged = useCallback((id: string, config: ManagedWidget): void => {
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
