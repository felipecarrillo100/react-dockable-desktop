/**
 * @file floatingWindowDrag.ts
 * @description Moving a floating window by its title bar (mouse, or touch long-press), dropping it on a dock target or corner, and resizing it from any of its eight handles.
 */
import React from 'react';
import type { SplitDirection, WorkspaceState, InternalWindowActions } from '../../types';
import { startPointerDrag, computeResizedRect } from '../dragResize';
import type { ResizeDir } from '../dragResize';
import { LONG_PRESS_MS, CANCEL_MOVE_PX } from './helpers';
import type { DragTargets } from './useDragTargets';

export interface FloatingWindowDragDeps {
  state: WorkspaceState;
  workspaceSize: { width: number; height: number };
  targets: DragTargets;
  actions: Pick<InternalWindowActions, 'focusPanel' | 'updateFloatingPosition' | 'dockPanelToWorkspaceEdge' | 'movePanelOrder' | 'dockPanelToGroup' | 'setDraggedPanelId'>;
}

export function createFloatingWindowDrag(deps: FloatingWindowDragDeps): { startDrag: (id: string, e: React.PointerEvent) => void; startResize: (id: string, dir: ResizeDir, e: React.PointerEvent) => void } {
  const { state, workspaceSize } = deps;
  const { activeDropZoneRef, hoveredTabRef, activeEdgeDropRef, activeCornerAnchorRef, setActiveCornerAnchor, clearDragState, flipRtl, updateHoverFromPoint } = deps.targets;
  const { focusPanel, updateFloatingPosition, dockPanelToWorkspaceEdge, movePanelOrder, dockPanelToGroup, setDraggedPanelId } = deps.actions;

  // Floating Window dragging handler
  const startDrag = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    const floatingWin = state.floating.find(w => w.id === id);
    if (!floatingWin || floatingWin.maximized) return;
    focusPanel(id);

    const el = e.currentTarget as HTMLDivElement;
    const windowEl = el.closest('.rdd-floating-window') as HTMLDivElement | null;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = windowEl ? windowEl.offsetLeft : 0;
    const startPosY = windowEl ? windowEl.offsetTop : 0;

    const executeFWDrop = () => {
      const dropZone = activeDropZoneRef.current;
      const targetTab = hoveredTabRef.current;
      const edgeDrop = activeEdgeDropRef.current;
      const cornerAnchor = activeCornerAnchorRef.current;
      if (cornerAnchor) {
        updateFloatingPosition(id, { anchor: cornerAnchor }); // already the anchor — see the tab drop above
      } else if (edgeDrop) {
        dockPanelToWorkspaceEdge(id, flipRtl(edgeDrop) as SplitDirection);
      } else if (targetTab) {
        let targetIndex = targetTab.index;
        if (targetTab.side === 'right') targetIndex += 1;
        movePanelOrder(id, targetTab.leafId, targetIndex);
      } else if (dropZone) {
        dockPanelToGroup(id, dropZone.leafId, flipRtl(dropZone.position));
      }
      setActiveCornerAnchor(null);
      clearDragState();
    };

    if (e.pointerType === 'touch') {
      const pointerId = e.pointerId;
      let cancelled = false;

      const cancel = () => {
        cancelled = true;
        clearTimeout(timer);
        el.removeEventListener('pointermove', onPreMove);
        el.removeEventListener('pointerup', cancel);
        el.removeEventListener('pointercancel', cancel);
      };

      const onPreMove = (me: PointerEvent) => {
        if (Math.hypot(me.clientX - startX, me.clientY - startY) > CANCEL_MOVE_PX) cancel();
      };

      const timer = setTimeout(() => {
        if (cancelled) return;
        el.removeEventListener('pointermove', onPreMove);
        el.removeEventListener('pointerup', cancel);
        el.removeEventListener('pointercancel', cancel);

        try { el.setPointerCapture(pointerId); } catch { return; }
        el.classList.add('rdd-long-press-active');
        document.body.classList.add('rdd-dragging-active');
        setDraggedPanelId(id);

        const onMove = (me: PointerEvent) => {
          const dx = me.clientX - startX;
          const dy = me.clientY - startY;
          updateFloatingPosition(id, { x: startPosX + dx, y: startPosY + dy, anchor: null });
          updateHoverFromPoint(me.clientX, me.clientY);
        };

        const onEnd = () => {
          el.classList.remove('rdd-long-press-active');
          document.body.classList.remove('rdd-dragging-active');
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onEnd);
          el.removeEventListener('pointercancel', onCancel);
          window.removeEventListener('blur', onCancel);
          executeFWDrop();
        };

        const onCancel = () => {
          el.classList.remove('rdd-long-press-active');
          document.body.classList.remove('rdd-dragging-active');
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onEnd);
          el.removeEventListener('pointercancel', onCancel);
          window.removeEventListener('blur', onCancel);
          clearDragState();
        };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onEnd);
        el.addEventListener('pointercancel', onCancel);
        // The window losing focus ends the drag, as a pointercancel would (7.4.1).
        window.addEventListener('blur', onCancel);
      }, LONG_PRESS_MS);

      el.addEventListener('pointermove', onPreMove);
      el.addEventListener('pointerup', cancel);
      el.addEventListener('pointercancel', cancel);
    } else {
      // Mouse / pen: window-level listeners WITHOUT setPointerCapture so that
      // onPointerEnter/Leave on drop zones and edge triggers still fire normally.
      let dragStarted = false;

      const onMove = (me: PointerEvent) => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        if (!dragStarted && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          dragStarted = true;
          setDraggedPanelId(id);
        }
        if (dragStarted) {
          updateFloatingPosition(id, { x: startPosX + dx, y: startPosY + dy, anchor: null });
        }
      };

      const onEnd = () => {
        document.body.classList.remove('rdd-dragging-active');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('blur', onCancel);
        if (dragStarted) executeFWDrop();
      };

      const onCancel = () => {
        document.body.classList.remove('rdd-dragging-active');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('blur', onCancel);
        if (dragStarted) clearDragState();
      };

      document.body.classList.add('rdd-dragging-active');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onCancel);
      // The window losing focus ends the drag, as a pointercancel would (7.4.1): the next click
      // can't dock the window into the zone it was over.
      window.addEventListener('blur', onCancel);
    }
  };

  // Floating Window resizing handler — supports 8 directions
  const startResize = (id: string, dir: ResizeDir, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const floatingWin = state.floating.find(w => w.id === id);
    if (!floatingWin || floatingWin.maximized) return;
    focusPanel(id);

    const el = e.currentTarget as HTMLDivElement;
    const windowEl = el.closest('.rdd-floating-window') as HTMLDivElement | null;
    const startRect = {
      x: windowEl ? windowEl.offsetLeft : 0,
      y: windowEl ? windowEl.offsetTop : 0,
      w: windowEl ? windowEl.offsetWidth : 400,
      h: windowEl ? windowEl.offsetHeight : 300,
    };

    const viewW = workspaceSize.width;
    const viewH = workspaceSize.height;
    const parsedX = typeof floatingWin.x === 'string' ? parseFloat(floatingWin.x) : floatingWin.x;
    const parsedY = typeof floatingWin.y === 'string' ? parseFloat(floatingWin.y) : floatingWin.y;
    const parsedW = typeof floatingWin.width === 'string' ? parseFloat(floatingWin.width) : floatingWin.width;
    const parsedH = typeof floatingWin.height === 'string' ? parseFloat(floatingWin.height) : floatingWin.height;
    const isRightSnapped = dir === 'se' && Math.abs(parsedX + parsedW - viewW) < 4;
    const isBottomSnapped = dir === 'se' && Math.abs(parsedY + parsedH - viewH) < 4;

    startPointerDrag({
      element: el,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      captureStart: () => startRect,
      activeClasses: [{ el: document.body, classes: ['rdd-resizing-active'] }],
      // No maxW/maxH/minX/minY: this window is intentionally allowed to grow
      // unbounded and be dragged fully off-screen, same as before this refactor.
      onMove: (dx, dy, start) => {
        const resized = computeResizedRect(dir, dx, dy, start, { minW: 200, minH: 150 });
        let { x: newX, y: newY, w: newW, h: newH } = resized;

        // Snap adjustments for SE corner when previously snapped to workspace edges
        if (isRightSnapped) {
          newX = viewW - newW;
          if (newX < 0) { newX = 0; newW = viewW; }
        }
        if (isBottomSnapped) {
          newY = viewH - newH;
          if (newY < 0) { newY = 0; newH = viewH; }
        }

        updateFloatingPosition(id, { x: newX, y: newY, width: newW, height: newH });
      },
    });
  };

  return { startDrag, startResize };
}
