/**
 * @file tabDrag.ts
 * @description Dragging a tab: a mouse drag, or a touch long-press that drags on move and opens the menu on release; and the drop that docks, reorders or floats the panel.
 */
import React from 'react';
import type { SplitDirection, WorkspaceState, InternalWindowActions } from '../../types';
import { findLeaf, LONG_PRESS_MS, CANCEL_MOVE_PX } from './helpers';
import type { DragTargets } from './useDragTargets';

export interface TabDragDeps {
  state: WorkspaceState;
  targets: DragTargets;
  actions: Pick<InternalWindowActions, 'dockPanelToWorkspaceEdge' | 'movePanelOrder' | 'dockPanelToGroup' | 'floatPanel' | 'setDraggedPanelId'>;
  handleTabRightClick: (id: string, e: React.MouseEvent) => void;
}

export function createTabDrag(deps: TabDragDeps): { executeDrop: (id: string, me: PointerEvent) => void; handleTabDragStart: (id: string, e: React.PointerEvent) => void } {
  const { state, handleTabRightClick } = deps;
  const { activeDropZoneRef, hoveredTabRef, activeEdgeDropRef, activeCornerAnchorRef, setActiveCornerAnchor, clearDragState, flipRtl, setDragPos, updateHoverFromPoint } = deps.targets;
  const { dockPanelToWorkspaceEdge, movePanelOrder, dockPanelToGroup, floatPanel, setDraggedPanelId } = deps.actions;

  const executeDrop = (id: string, me: PointerEvent) => {
    const dropZone = activeDropZoneRef.current;
    const targetTab = hoveredTabRef.current;
    const edgeDrop = activeEdgeDropRef.current;
    const cornerAnchor = activeCornerAnchorRef.current;

    if (edgeDrop) {
      dockPanelToWorkspaceEdge(id, flipRtl(edgeDrop) as SplitDirection);
    } else if (targetTab) {
      let targetIndex = targetTab.index;
      if (targetTab.side === 'right') targetIndex += 1;
      // DOM tab indices are pre-removal. movePanelOrder removes the panel before
      // inserting, shifting subsequent positions down by 1 in the same leaf.
      // Compensate when the dragged panel currently sits before the drop target.
      const targetLeaf = findLeaf(state.gridRoot, targetTab.leafId);
      if (targetLeaf) {
        const currentIdx = targetLeaf.panels.indexOf(id);
        if (currentIdx !== -1 && currentIdx < targetIndex) targetIndex -= 1;
      }
      movePanelOrder(id, targetTab.leafId, targetIndex);
    } else if (dropZone) {
      dockPanelToGroup(id, dropZone.leafId, flipRtl(dropZone.position));
    } else if (cornerAnchor) {
      // The zone's name is already the anchor: the CSS mirrors the zones under RTL, and an anchor is
      // drawn mirrored too. Flipping it here as well sent the window to the opposite corner.
      floatPanel(id, undefined, cornerAnchor);
    } else {
      floatPanel(id, { x: me.clientX - 150, y: me.clientY - 15, width: 450, height: 350 });
    }
    setActiveCornerAnchor(null);
    clearDragState();
  };

  const handleTabDragStart = (id: string, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();

    const el = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const startY = e.clientY;

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
        if (navigator.vibrate) navigator.vibrate(10);

        // Long-press captured: move → drag, release → context menu
        let dragStarted = false;

        const onMove = (me: PointerEvent) => {
          if (!dragStarted) {
            dragStarted = true;
            setDraggedPanelId(id);
          }
          setDragPos({ x: me.clientX, y: me.clientY });
          updateHoverFromPoint(me.clientX, me.clientY);
        };

        const onEnd = (me: PointerEvent) => {
          el.classList.remove('rdd-long-press-active');
          document.body.classList.remove('rdd-dragging-active');
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onEnd);
          el.removeEventListener('pointercancel', onCancel);
          window.removeEventListener('blur', onCancel);

          if (dragStarted) {
            executeDrop(id, me);
          } else {
            // Release without drag → context menu
            handleTabRightClick(id, me as unknown as React.MouseEvent);
          }
        };

        const onCancel = () => {
          el.classList.remove('rdd-long-press-active');
          document.body.classList.remove('rdd-dragging-active');
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onEnd);
          el.removeEventListener('pointercancel', onCancel);
          window.removeEventListener('blur', onCancel);
          if (dragStarted) clearDragState();
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
        if (dragStarted) setDragPos({ x: me.clientX, y: me.clientY });
      };

      const onEnd = (me: PointerEvent) => {
        document.body.classList.remove('rdd-dragging-active');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('blur', onCancel);
        if (dragStarted) executeDrop(id, me);
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
      // The window losing focus (an alt-tab, an iframe taking it) ends the drag, as a
      // pointercancel would (7.4.1): the listeners, the hovered zone and the body class all go,
      // so the next click can't drop the panel into the zone it was over.
      window.addEventListener('blur', onCancel);
    }
  };

  return { executeDrop, handleTabDragStart };
}
