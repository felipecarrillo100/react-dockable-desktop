/**
 * @file useDragTargets.ts
 * @description Where a dragged panel would land: the hovered drop zone, tab, workspace edge or corner, kept both as state (to render) and in refs (to read in pointer handlers), and the ghost position.
 */
import React, { useState, useRef } from 'react';
import type { SplitDirection, DropPosition, FloatAnchor, InternalWindowActions } from '../../types';
import { tabDropSide } from './helpers';

type DropZoneTarget = { leafId: string; position: DropPosition };
type Point = { x: number; y: number };
type TabTarget = { leafId: string; panelId: string; index: number; side: 'left' | 'right' };

/**
 * The tab-drag ghost's position. Written on every pointer move and read only by the ghost, so it
 * lives outside React state: a move re-renders the ghost, not the desktop (7.7.2).
 */
export interface DragPos {
  get: () => Point;
  set: (v: Point) => void;
  subscribe: (cb: () => void) => () => void;
}

const createDragPos = (): DragPos => {
  let pos: Point = { x: 0, y: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => pos,
    set: (v) => { pos = v; listeners.forEach(l => l()); },
    subscribe: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };
};

const sameDropZone = (a: DropZoneTarget | null, b: DropZoneTarget | null) =>
  a === b || (!!a && !!b && a.leafId === b.leafId && a.position === b.position);
const sameTab = (a: TabTarget | null, b: TabTarget | null) =>
  a === b || (!!a && !!b && a.leafId === b.leafId && a.panelId === b.panelId && a.index === b.index && a.side === b.side);

/** What `useDragTargets` returns. */
export interface DragTargets {
  activeDropZone: DropZoneTarget | null;
  setActiveDropZone: (v: DropZoneTarget | null) => void;
  activeDropZoneRef: React.RefObject<DropZoneTarget | null>;
  dragPos: DragPos;
  setDragPos: (v: Point) => void;
  activeEdgeDrop: SplitDirection | null;
  activeEdgeDropRef: React.RefObject<SplitDirection | null>;
  setActiveEdgeDrop: (val: SplitDirection | null) => void;
  activeCornerAnchor: FloatAnchor | null;
  activeCornerAnchorRef: React.RefObject<FloatAnchor | null>;
  setActiveCornerAnchor: (val: FloatAnchor | null) => void;
  hoveredTab: TabTarget | null;
  setHoveredTab: (v: TabTarget | null) => void;
  hoveredTabRef: React.RefObject<TabTarget | null>;
  handleTabHover: (leafId: string, panelId: string, index: number, side: 'left' | 'right' | null) => void;
  handleHoverDropZone: (leafId: string, position: DropPosition | null) => void;
  updateHoverFromPoint: (x: number, y: number) => void;
  clearDragState: () => void;
  flipRtl: (pos: DropPosition) => DropPosition;
}

export function useDragTargets({ setDraggedPanelId, isRtl }: { setDraggedPanelId: InternalWindowActions['setDraggedPanelId']; isRtl: boolean }): DragTargets {
  const [activeDropZone, setActiveDropZone] = useState<{ leafId: string; position: DropPosition } | null>(null);
  const activeDropZoneRef = useRef<{ leafId: string; position: DropPosition } | null>(null);
  const [dragPos] = useState(createDragPos);
  const setDragPos = dragPos.set;

  const [activeEdgeDrop, setActiveEdgeDropState] = useState<SplitDirection | null>(null);
  const activeEdgeDropRef = useRef<SplitDirection | null>(null);
  const setActiveEdgeDrop = (val: SplitDirection | null) => {
    setActiveEdgeDropState(val);
    activeEdgeDropRef.current = val;
  };

  const [activeCornerAnchor, setActiveCornerAnchorState] = useState<FloatAnchor | null>(null);
  const activeCornerAnchorRef = useRef<FloatAnchor | null>(null);
  const setActiveCornerAnchor = (val: FloatAnchor | null) => {
    setActiveCornerAnchorState(val);
    activeCornerAnchorRef.current = val;
  };

  const [hoveredTab, setHoveredTab] = useState<{ leafId: string; panelId: string; index: number; side: 'left' | 'right' } | null>(null);
  const hoveredTabRef = useRef<{ leafId: string; panelId: string; index: number; side: 'left' | 'right' } | null>(null);

  const handleTabHover = (leafId: string, panelId: string, index: number, side: 'left' | 'right' | null) => {
    const val = side ? { leafId, panelId, index, side } : null;
    setHoveredTab(val);
    hoveredTabRef.current = val;
  };

  const handleHoverDropZone = (leafId: string, position: DropPosition | null) => {
    const val = position ? { leafId, position } : null;
    setActiveDropZone(val);
    activeDropZoneRef.current = val;
    // A leaf's cross commonly overlaps the workspace edge/corner zones underneath it —
    // the more specific per-leaf target wins, matching the corner zone's own handler,
    // which already clears the edge the same way.
    if (val) {
      setActiveEdgeDrop(null);
      setActiveCornerAnchor(null);
    }
  };

  // Used during touch drag (pointer capture suppresses hover events on other elements)
  const updateHoverFromPoint = (x: number, y: number) => {
    const elements = document.elementsFromPoint(x, y);
    let foundDropZone = false;
    let foundEdge = false;
    let foundTab = false;

    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;

      if (!foundDropZone && el.dataset.dropZone) {
        const leafId = el.dataset.leafId;
        if (leafId) {
          const val = { leafId, position: el.dataset.dropZone as DropPosition };
          setActiveDropZone(prev => sameDropZone(prev, val) ? prev : val);
          activeDropZoneRef.current = val;
          foundDropZone = true;
        }
      }

      // Tabs checked before edge triggers — precise tab intent beats the coarse edge zone
      if (!foundTab && el.dataset.tabId) {
        const leafId = el.dataset.leafId;
        const tabIdx = parseInt(el.dataset.tabIndex || '0', 10);
        if (leafId) {
          const val = { leafId, panelId: el.dataset.tabId, index: tabIdx, side: tabDropSide(el, x) };
          setHoveredTab(prev => sameTab(prev, val) ? prev : val);
          hoveredTabRef.current = val;
          foundTab = true;
        }
      }

      if (!foundEdge && el.dataset.edgeTrigger) {
        setActiveEdgeDrop(el.dataset.edgeTrigger as SplitDirection);
        foundEdge = true;
      }

      if (foundDropZone && foundEdge && foundTab) break;
    }

    if (!foundDropZone) { setActiveDropZone(null); activeDropZoneRef.current = null; }
    if (!foundEdge) setActiveEdgeDrop(null);
    if (!foundTab) { setHoveredTab(null); hoveredTabRef.current = null; }
  };


  const clearDragState = () => {
    setDraggedPanelId(null);
    setActiveDropZone(null);
    activeDropZoneRef.current = null;
    setHoveredTab(null);
    hoveredTabRef.current = null;
    setActiveEdgeDrop(null);
    setActiveCornerAnchor(null);
  };

  const flipRtl = (pos: DropPosition): DropPosition => {
    if (!isRtl) return pos;
    if (pos === 'left') return 'right';
    if (pos === 'right') return 'left';
    return pos;
  };

  return {
    activeDropZone, setActiveDropZone, activeDropZoneRef, dragPos, setDragPos,
    activeEdgeDrop, activeEdgeDropRef, setActiveEdgeDrop,
    activeCornerAnchor, activeCornerAnchorRef, setActiveCornerAnchor,
    hoveredTab, setHoveredTab, hoveredTabRef,
    handleTabHover, handleHoverDropZone, updateHoverFromPoint, clearDragState, flipRtl,
  };
}
