/**
 * @file DragGhost.tsx
 * @description The tab that follows the pointer while a docked panel is dragged. It alone reads the pointer position, so a move re-renders it and nothing else.
 */
import React, { useSyncExternalStore } from 'react';
import type { DragPos } from './useDragTargets';

export const DragGhost: React.FC<{ dragPos: DragPos; children: React.ReactNode }> = ({ dragPos, children }) => {
  const pos = useSyncExternalStore(dragPos.subscribe, dragPos.get, dragPos.get);
  return (
    <div className="rdd-drag-ghost-tab" style={{ left: pos.x + 12, top: pos.y + 12 }}>
      {children}
    </div>
  );
};
