/**
 * @file context.ts
 * @description The Panel Overlay's internal React contexts, shared by the overlay root, the
 * toolbars and the floating widgets.
 */
import type React from 'react';
import { createContext } from 'react';
import type { FloatAnchor } from '../../types';
import type { ManagedWidget, Stretch, ToolbarPosition } from './types';

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
