/**
 * @file WorkspaceGrid.tsx
 * @description The split layout: a branch of the layout tree with its resizer bars, down to its leaf groups.
 */
import React from 'react';
import { isComputedRtl } from '../../utils/rtl';
import { useWindowManagerActions } from '../WindowManagerContext';
import type { LayoutNode, DropPosition } from '../../types';
import { startPointerDrag } from '../dragResize';
import { LeafGroup } from './LeafGroup';

export interface WorkspaceGridProps {
  node: LayoutNode;
  path: number[];
  onTabRightClick: (id: string, e: React.MouseEvent) => void;
  activeDropZone: { leafId: string; position: DropPosition } | null;
  onHoverDropZone: (leafId: string, position: DropPosition | null) => void;
  onTabDragStart: (id: string, e: React.PointerEvent) => void;
  hoveredTab: { leafId: string; panelId: string; index: number; side: 'left' | 'right' } | null;
  onTabHover: (leafId: string, panelId: string, index: number, side: 'left' | 'right' | null) => void;
  defaultPanelIcon?: React.ReactNode;
  onRequestClosePanel: (id: string) => Promise<void> | void;
}

export const WorkspaceGrid: React.FC<WorkspaceGridProps> = ({ node, path, onTabRightClick, activeDropZone, onHoverDropZone, onTabDragStart, hoveredTab, onTabHover, defaultPanelIcon, onRequestClosePanel }) => {
  const { updateSplitSizes } = useWindowManagerActions();

  if (node.type === 'leaf') {
    return <LeafGroup leaf={node} onTabRightClick={onTabRightClick} activeDropZone={activeDropZone} onHoverDropZone={onHoverDropZone} onTabDragStart={onTabDragStart} hoveredTab={hoveredTab} onTabHover={onTabHover} defaultPanelIcon={defaultPanelIcon} onRequestClosePanel={onRequestClosePanel} />;
  }

  const isRow = node.orientation === 'horizontal';

  const handleResizerPointerDown = (idx: number, e: React.PointerEvent) => {
    e.preventDefault();
    const resizerEl = e.currentTarget as HTMLDivElement;
    const parentEl = resizerEl.parentElement;
    const parentSize = parentEl
      ? (isRow ? parentEl.clientWidth : parentEl.clientHeight)
      : (isRow ? 1000 : 800);
    const rtl = isComputedRtl(parentEl);

    startPointerDrag({
      element: resizerEl,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      captureStart: () => [...node.sizes],
      activeClasses: [
        { el: resizerEl, classes: ['rdd-active'] },
        { el: document.body, classes: ['rdd-resizing-active', isRow ? 'rdd-resizing-col-active' : 'rdd-resizing-row-active'] },
      ],
      onMove: (dx, dy, startSizes) => {
        // A row reverses under RTL, so children[idx] is the pane to the divider's *right*: a
        // rightward drag must shrink it. Pointer deltas are physical; sizes are in child order.
        const sign = isRow && rtl ? -1 : 1;
        const deltaPercentage = (isRow ? sign * dx : dy) / parentSize;
        const newSizes = [...startSizes];
        newSizes[idx] += deltaPercentage;
        newSizes[idx + 1] -= deltaPercentage;
        if (newSizes[idx] > 0.1 && newSizes[idx + 1] > 0.1) {
          updateSplitSizes(path, newSizes);
        }
      },
    });
  };

  return (
    <div className={`rdd-split ${isRow ? 'rdd-split--row' : 'rdd-split--column'}`}>
      {node.children.map((child, idx) => {
        const size = node.sizes[idx] * 100;
        return (
          <React.Fragment key={idx}>
            <div className="rdd-split-child" style={{ flexGrow: node.sizes[idx], flexBasis: `${size}%` }}>
              <WorkspaceGrid node={child} path={[...path, idx]} onTabRightClick={onTabRightClick} activeDropZone={activeDropZone} onHoverDropZone={onHoverDropZone} onTabDragStart={onTabDragStart} hoveredTab={hoveredTab} onTabHover={onTabHover} defaultPanelIcon={defaultPanelIcon} onRequestClosePanel={onRequestClosePanel} />
            </div>
            {idx < node.children.length - 1 && (
              <div
                onPointerDown={(e) => handleResizerPointerDown(idx, e)}
                className={`rdd-resizer-bar ${isRow ? 'rdd-resizer-bar--vertical' : 'rdd-resizer-bar--horizontal'}`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
