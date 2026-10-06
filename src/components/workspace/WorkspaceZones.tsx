/**
 * @file WorkspaceZones.tsx
 * @description The drop targets shown while a panel is dragged: the workspace edges, the corner anchors, and the preview of an edge drop.
 */
import React from 'react';
import type { SplitDirection, FloatAnchor, WorkspaceState, PanelDropTarget } from '../../types';

export interface WorkspaceZonesProps {
  state: WorkspaceState;
  activeEdgeDrop: SplitDirection | null;
  activeCornerAnchor: FloatAnchor | null;
  setActiveEdgeDrop: (val: SplitDirection | null) => void;
  setActiveCornerAnchor: (val: FloatAnchor | null) => void;
  /** Whether the dragged panel may go to a target; a forbidden one isn't offered (7.9.0). */
  isDropAllowed: (panelId: string, to: PanelDropTarget) => boolean;
}

/** The side an edge drop applies: edges are drawn by screen side, and the move flips them under RTL. */
const appliedSide = (side: SplitDirection, rtl: boolean): SplitDirection =>
  rtl && (side === 'left' || side === 'right') ? (side === 'left' ? 'right' : 'left') : side;

export const WorkspaceZones = ({ state, activeEdgeDrop, activeCornerAnchor, setActiveEdgeDrop, setActiveCornerAnchor, isDropAllowed }: WorkspaceZonesProps): React.ReactElement => {
  const dragged = state.draggedPanelId;
  const edge = (side: SplitDirection) => dragged !== null && isDropAllowed(dragged, { kind: 'edge', side: appliedSide(side, state.isRtl) });
  const cornerOffered = (anchor: FloatAnchor) => dragged !== null && isDropAllowed(dragged, { kind: 'float', anchor });
  return (
  <>
    {/* Workspace outer edge drop zone targets */}
    {state.draggedPanelId !== null && (
      <>
        {edge('left') && <div
          data-edge-trigger="left"
          className="rdd-workspace-edge-trigger rdd-edge-trigger-left"
          onPointerEnter={() => setActiveEdgeDrop('left')}
          onPointerLeave={() => setActiveEdgeDrop(null)}
        />}
        {edge('right') && <div
          data-edge-trigger="right"
          className="rdd-workspace-edge-trigger rdd-edge-trigger-right"
          onPointerEnter={() => setActiveEdgeDrop('right')}
          onPointerLeave={() => setActiveEdgeDrop(null)}
        />}
        {edge('top') && <div
          data-edge-trigger="top"
          className="rdd-workspace-edge-trigger rdd-edge-trigger-top"
          onPointerEnter={() => setActiveEdgeDrop('top')}
          onPointerLeave={() => setActiveEdgeDrop(null)}
        />}
        {edge('bottom') && <div
          data-edge-trigger="bottom"
          className="rdd-workspace-edge-trigger rdd-edge-trigger-bottom"
          onPointerEnter={() => setActiveEdgeDrop('bottom')}
          onPointerLeave={() => setActiveEdgeDrop(null)}
        />}
      </>
    )}

    {/* Corner anchor drop zones — appear during floating window drag */}
    {state.draggedPanelId !== null && (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as FloatAnchor[]).filter(cornerOffered).map(corner => (
      <div
        key={corner}
        className={`rdd-corner-zone rdd-corner-zone--${corner}${activeCornerAnchor === corner ? ' rdd-corner-zone--hovered' : ''}`}
        onPointerEnter={() => { setActiveCornerAnchor(corner); setActiveEdgeDrop(null); }}
        onPointerLeave={() => setActiveCornerAnchor(null)}
        aria-hidden="true"
      />
    ))}

    {/* Edge drop visual preview overlay */}
    {state.draggedPanelId !== null && activeEdgeDrop !== null && (
      <div
        className="rdd-workspace-edge-preview"
        style={(() => {
          const pct = `${state.edgeSplitRatio * 100}%`;
          switch (activeEdgeDrop) {
            case 'left':   return { left: 0, top: 0, bottom: 0, width: pct };
            case 'right':  return { right: 0, top: 0, bottom: 0, width: pct };
            case 'top':    return { top: 0, left: 0, right: 0, height: pct };
            case 'bottom': return { bottom: 0, left: 0, right: 0, height: pct };
          }
        })()}
      />
    )}
  </>
  );
};
