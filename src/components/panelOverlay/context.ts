/**
 * @file context.ts
 * @description The Panel Overlay's internal React contexts, shared by the overlay root, the
 * toolbars and the floating widgets.
 */
import type React from 'react';
import { createContext } from 'react';
import type { FloatAnchor } from '../../types';
import type { ManagedWidget, MoveResult, PanelFloatPlacement, Stretch, ToolbarPosition, WidgetLocation, WidgetPlacement, WidgetTarget } from './types';

// ─── Internal types ───────────────────────────────────────────────────────────

/**
 * Everything about where a managed widget sits and how big it is: the public anchor and stretch,
 * plus whether it is docked or free, its free position and its size. Kept in the overlay's store
 * (`PanelOverlayRoot`), not in the frame, so it survives the frame unmounting: from 7.11 a widget
 * moved out of its panel has no frame, and coming back must find it where it was.
 */
export interface ManagedPlacement extends PanelFloatPlacement {
  mode: 'docked' | 'free';
  freePos: { x: number; y: number } | null;
  size: { w: number; h: number };
}

/** How a frame reads and writes a placement it doesn't own. `update` merges what it returns. */
export interface ControlledPlacement {
  placement: ManagedPlacement;
  update(patch: (prev: ManagedPlacement) => Partial<ManagedPlacement>): void;
}

// ─── Internal contexts ────────────────────────────────────────────────────────

export interface PanelToolbarCtx {
  registerToolbar(pos: ToolbarPosition, size: number): () => void;
  insetTop: number;
  insetBottom: number;
}
export const PanelToolbarContext: React.Context<PanelToolbarCtx | null> = createContext<PanelToolbarCtx | null>(null);

export interface PanelManagerCtx {
  managedWindowIds: string[];
  openManaged(id: string, config: ManagedWidget): void;
  closeManaged(id: string): void;
  closeAllManaged(): void;
  moveManaged(id: string, to: WidgetTarget): MoveResult;
  locationOf(id: string): WidgetLocation | null;
  placementOf(id: string): WidgetPlacement | null;
}
export const PanelManagerContext: React.Context<PanelManagerCtx | null> = createContext<PanelManagerCtx | null>(null);

export interface PanelOverlayCtx {
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
export const PanelOverlayContext: React.Context<PanelOverlayCtx | null> = createContext<PanelOverlayCtx | null>(null);
