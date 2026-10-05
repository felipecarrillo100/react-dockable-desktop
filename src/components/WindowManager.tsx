/**
 * @file WindowManager.tsx
 * @description Core component for react-dockable-desktop layout engine.
 * Renders the workspace desktop containing docked splits, tabbed panels, floated windows,
 * resize handles, context menus, and taskbar docks. Exposes lifecycle event listeners.
 */

import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useIsClient } from '../utils/useIsClient';
import { forgetPanelDom } from './domPreservation';
import { usePanelHost } from './workspace/panelHost';
import { claimDocumentMirror, releaseDocumentMirror } from '../utils/documentMirror';
import { useWindowManagerState, useWindowManagerActionsInternal, useFormatMessage, formatLabel, usePredefinedMessages, useStyleClasses, useRegistry } from './WindowManagerContext';
import { DefaultContextMenuAdapter, ContextMenuContext } from './ContextMenu';
import type { ContextMenuHandle, ContextMenuAdapter } from './ContextMenu';
import { usePanelActions } from './PanelProviderContext';
import ConfirmationForm from '../forms/ConfirmationForm';
import { useColorScheme } from '../hooks/useColorScheme';
import { renderPanelContent, FormContainerProviderWrapper } from './workspace/panelMount';
import { WorkspaceGrid } from './workspace/WorkspaceGrid';
import { WorkspaceZones } from './workspace/WorkspaceZones';
import { FloatingWindows } from './workspace/FloatingWindows';
import { Taskbar } from './workspace/Taskbar';
import { useDragTargets } from './workspace/useDragTargets';
import { createTabDrag } from './workspace/tabDrag';
import { createWorkspaceMenus } from './workspace/workspaceMenus';
import { useWorkspaceSize } from './workspace/useWorkspaceSize';
import { createFloatingWindowDrag } from './workspace/floatingWindowDrag';



// ==========================================
// 5. WindowManager (Main Render Component)
// ==========================================

/** Controls when the minimized-panel taskbar is visible. */
export type TaskbarVisibility = 'always' | 'compact' | 'autohide';

/** Props for `<RddDesktop>`. */
export interface RddDesktopProps {
  /** Built-in skin name or a custom skin key registered via CSS. @default 'vscode' */
  skin?: string;
  /** Fallback icon shown in panel tabs when no panel-specific icon is provided. */
  defaultPanelIcon?: React.ReactNode;
  /**
   * Controls taskbar visibility.
   * - `'always'` — permanent bar at the bottom
   * - `'compact'` — only visible when minimized panels exist
   * - `'autohide'` — overlay bar with 8 px peek strip (default)
   * @default 'autohide'
   */
  taskbarVisibility?: TaskbarVisibility;
  /** Enables the library's own transitions/animations (tab hover, dock preview, etc.). Never affects the consumer's own page. @default true */
  animations?: boolean;
}

/**
 * The desktop itself: the docked grid of tab groups, the floating windows, the taskbar of
 * minimized panels, and the drop targets while a panel is dragged. Render it inside
 * `<DockableDesktopProvider>`, in a container that gives it a size (`rdd-fill-viewport` fills the
 * page), and import `react-dockable-desktop/styles.css` once.
 *
 * Exported as `RddDesktop`.
 *
 * @example
 * ```tsx
 * <DockableDesktopProvider workspace={workspace}>
 *   <div className="rdd-fill-viewport">
 *     <RddDesktop skin="vscode" taskbarVisibility="autohide" />
 *   </div>
 *   <RddModals />
 * </DockableDesktopProvider>
 * ```
 */
export const WindowManager: React.FC<RddDesktopProps> = ({ skin = 'vscode', defaultPanelIcon, taskbarVisibility = 'autohide', animations = true }) => {
  // The context menu comes from <DockableDesktopProvider contextMenuAdapter={…}>. This built-in
  // fallback only renders when no provider supplies one (the library's own tests).
  const contextMenuAdapter: ContextMenuAdapter = DefaultContextMenuAdapter;
  const state = useWindowManagerState();
  const panelHost = usePanelHost();
  const registry = useRegistry();
  const { restorePanel, minimizePanel, requestClosePanel, maximizePanel, updateFloatingPosition, focusPanel, floatPanel, setDraggedPanelId, dockPanelToGroup, movePanelOrder, dockPanelToWorkspaceEdge, setActivePanel, getPanelContextMenuItems, showContextMenu, registerContextMenuFn } = useWindowManagerActionsInternal();
  const { openModal } = usePanelActions();
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();

  const handleRequestClose = React.useCallback((id: string) => {
    const panel = state.panels[id];
    return requestClosePanel(id, {
      onConfirm: (customOpts) => new Promise<boolean>((resolve) => {
        const opts = customOpts || panel?.dirtyOptions;
        const baseTitle = formatLabel(panel ? panel.title : messages.untitledPanel, formatMessage);
        openModal(
          ConfirmationForm,
          {
            title: opts?.title || messages.unsavedChangesTitle,
            message: opts?.message || {
              id: messages.unsavedChangesMessage.id,
              defaultMessage: messages.unsavedChangesMessage.defaultMessage,
              values: { title: baseTitle }
            },
            alert: opts?.alert,
            alertType: opts?.alertType || 'danger',
            useYesNoTitles: true,
            // Settles on every exit: Yes, No, Escape, the backdrop, the × or closeAll (7.7.0).
            onSettled: resolve,
          },
          { size: 'small' }
        );
      })
    });
  }, [requestClosePanel, state.panels, formatMessage, openModal, messages]);

  const { windowClass, windowBodyClass } = useStyleClasses();
  const ctxMenu = useContext(ContextMenuContext);
  const contextMenuRef = useRef<ContextMenuHandle>(null);

  useEffect(() => {
    if (ctxMenu !== null) {
      return registerContextMenuFn((opts) => ctxMenu.show(opts));
    } else {
      return registerContextMenuFn((opts) => contextMenuRef.current?.show(opts));
    }
  }, [ctxMenu, registerContextMenuFn]);

  const taskbarRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [taskbarExpanded, setTaskbarExpanded] = useState(false);
  const taskbarCollapseTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  // The pointer is on the taskbar: it must not slide away under it (a press there would be lost).
  const taskbarHoveredRef = useRef(false);
  const prevMinimizedLengthRef = useRef(state.minimized.length);

  const [hoveredMinimized, setHoveredMinimized] = useState<{ id: string; rect: DOMRect; title: string | any; component: string; fromTouch?: boolean } | null>(null);
  const minimizedTooltipTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const lastTaskbarPointerTypeRef = useRef<string>('mouse');
  const [internalContextMenuOpen, setInternalContextMenuOpen] = useState(false);
  const isContextMenuOpen = ctxMenu !== null ? ctxMenu.isOpen : internalContextMenuOpen;

  useEffect(() => {
    return () => {
      if (minimizedTooltipTimeoutRef.current) {
        clearTimeout(minimizedTooltipTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hoveredMinimized) {
      const isStillMinimized = state.minimized.some(m => m.id === hoveredMinimized.id);
      if (!isStillMinimized) {
        setHoveredMinimized(null);
      }
    }
  }, [state.minimized, hoveredMinimized]);

  useEffect(() => {
    if (!hoveredMinimized?.fromTouch) return;
    const handler = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (tooltipRef.current?.contains(e.target as Node)) return;
      setHoveredMinimized(null);
    };
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, { capture: true });
  }, [hoveredMinimized?.fromTouch]);

  // Where a dragged panel would land; read by the drag handlers below and drawn by the zones.
  const targets = useDragTargets({ setDraggedPanelId, isRtl: state.isRtl });
  const { activeDropZone, setActiveDropZone, dragPos, activeEdgeDrop, setActiveEdgeDrop, activeCornerAnchor, setActiveCornerAnchor, hoveredTab, setHoveredTab, handleTabHover, handleHoverDropZone } = targets;

  const { handleTabRightClick, handleMinimizedRightClick } = createWorkspaceMenus({
    state, registry, messages, formatMessage, handleRequestClose, setHoveredMinimized,
    actions: { floatPanel, minimizePanel, restorePanel, maximizePanel, getPanelContextMenuItems, showContextMenu },
  });

  const { handleTabDragStart } = createTabDrag({
    state, targets, handleTabRightClick,
    actions: { dockPanelToWorkspaceEdge, movePanelOrder, dockPanelToGroup, floatPanel, setDraggedPanelId },
  });

  // Drop the preserved DOM of panels that are no longer open — this workspace's own only.
  useEffect(() => {
    const keys = Object.keys(state.panels);
    for (const cachedId of panelHost.ids()) {
      if (!keys.includes(cachedId)) {
        const el = panelHost.getElement(cachedId);
        panelHost.forget(cachedId);
        if (el) forgetPanelDom(el);
      }
    }
  }, [state.panels, panelHost]);

  // Safe window blur handler to cancel sticky dragging states when iframe/webview loses focus
  useEffect(() => {
    const handleWindowBlur = () => {
      if (state.draggedPanelId !== null) {
        setDraggedPanelId(null);
        setActiveDropZone(null);
        setHoveredTab(null);
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [state.draggedPanelId]);

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const workspaceSize = useWorkspaceSize(workspaceRef);

  // Sync / Realignment Effect when actual workspace size changes
  useEffect(() => {
    const viewW = workspaceSize.width;
    const viewH = workspaceSize.height;

    state.floating.forEach(w => {
      const winW = typeof w.width === 'string' ? parseFloat(w.width) : w.width;
      const winH = typeof w.height === 'string' ? parseFloat(w.height) : w.height;
      const winX = typeof w.x === 'string' ? parseFloat(w.x) : w.x;
      const winY = typeof w.y === 'string' ? parseFloat(w.y) : w.y;

      let newWidth = winW;
      let newHeight = winH;
      let newX = winX;
      let newY = winY;
      let changed = false;

      // Clamp window size if it exceeds the new workspace size (applies whether anchored or free-floating)
      if (newWidth > viewW) {
        newWidth = Math.max(200, viewW - 20);
        changed = true;
      }
      if (newHeight > viewH) {
        newHeight = Math.max(150, viewH - 40);
        changed = true;
      }

      // Anchored windows are positioned entirely by `anchor` + `dir` at render time (see the
      // floating-window style callback below), so x/y don't affect their visual position —
      // only free-floating windows need off-screen bounds clamping here.
      if (!w.anchor) {
        const maxX = viewW - 100; // Keep at least 100px of titlebar visible
        if (newX > maxX) {
          newX = Math.max(0, maxX);
          changed = true;
        }
        const maxY = viewH - 40; // Keep titlebar clickable
        if (newY > maxY) {
          newY = Math.max(0, maxY);
          changed = true;
        }
      }

      if (changed) {
        updateFloatingPosition(w.id, {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight
        });
      }
    });
  }, [workspaceSize, state.floating, updateFloatingPosition]);

  // Global Window Focus Event Delegation (Left-click/touch anywhere inside a window or grid panel focuses it)
  useEffect(() => {
    const handlePointerDownGlobal = (e: PointerEvent) => {
      // Only handle primary button (left-click or first touch point)
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;

      // 1. Check if click is inside a floating window
      const windowEl = target.closest('.rdd-floating-window') as HTMLElement | null;
      if (windowEl) {
        const winId = windowEl.getAttribute('data-window-id');
        if (winId) {
          setActivePanel(winId);
          focusPanel(winId);
        }
        return;
      }

      // 2. Check if click is inside a grid split pane
      const panelEl = target.closest('.rdd-workspace-panel') as HTMLElement | null;
      if (panelEl) {
        const panelId = panelEl.getAttribute('data-active-panel-id');
        if (panelId) {
          setActivePanel(panelId);
        }
      }
    };

    document.addEventListener('pointerdown', handlePointerDownGlobal);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownGlobal);
    };
  }, [focusPanel, setActivePanel]);

  const { startDrag, startResize } = createFloatingWindowDrag({
    state, workspaceSize, targets,
    actions: { focusPanel, updateFloatingPosition, dockPanelToWorkspaceEdge, movePanelOrder, dockPanelToGroup, setDraggedPanelId },
  });

  // horizontal scroll for minimized taskbar
  const scrollTaskbar = (direction: 'left' | 'right') => {
    if (taskbarRef.current) {
      const amount = direction === 'left' ? -150 : 150;
      taskbarRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Every collapse goes through here: it replaces any pending timer (never leaves one behind to
  // fire later), and does nothing while the pointer is on the taskbar.
  const scheduleCollapseTaskbar = useCallback((delayMs: number) => {
    if (taskbarCollapseTimerRef.current) clearTimeout(taskbarCollapseTimerRef.current);
    taskbarCollapseTimerRef.current = setTimeout(() => {
      taskbarCollapseTimerRef.current = null;
      if (!taskbarHoveredRef.current) setTaskbarExpanded(false);
    }, delayMs);
  }, []);

  const expandTaskbar = useCallback(() => {
    taskbarHoveredRef.current = true;
    if (taskbarCollapseTimerRef.current) clearTimeout(taskbarCollapseTimerRef.current);
    setTaskbarExpanded(true);
  }, []);

  const leaveTaskbar = useCallback(() => {
    taskbarHoveredRef.current = false;
    scheduleCollapseTaskbar(400);
  }, [scheduleCollapseTaskbar]);

  useEffect(() => () => { if (taskbarCollapseTimerRef.current) clearTimeout(taskbarCollapseTimerRef.current); }, []);

  useEffect(() => {
    if (taskbarVisibility === 'autohide' && state.minimized.length > prevMinimizedLengthRef.current) {
      setTaskbarExpanded(true);
      scheduleCollapseTaskbar(2000);
    }
    // The autohide taskbar unmounts when nothing is minimized; a pointer that was on it then gets
    // no pointerleave, so forget it here.
    if (state.minimized.length === 0) taskbarHoveredRef.current = false;
    prevMinimizedLengthRef.current = state.minimized.length;
  }, [state.minimized.length, taskbarVisibility, scheduleCollapseTaskbar]);

  // Fetch the active color-scheme from documentElement to make sure nested variables resolve correctly
  const currentColorScheme = useColorScheme();
  const isClient = useIsClient();

  // Mirror the skin and the animations opt-out onto <html>, so what renders outside the workspace
  // element (RddToolbar, RddSidebar, portaled menus, toasts, flyouts) gets them too. Through the
  // document mirror, keyed by this workspace: with several on one page the newest wins, and unmounting
  // one hands <html> back to the others rather than clearing it. The claim and its release are
  // separate effects so a skin change updates the claim in place instead of re-stacking it.
  useEffect(() => {
    claimDocumentMirror(panelHost, { skin: skin || null, noAnimations: !animations });
  }, [panelHost, skin, animations]);
  useEffect(() => () => releaseDocumentMirror(panelHost, ['skin', 'noAnimations']), [panelHost]);

  return (
    <div
      className={`rdd-workspace${animations ? '' : ' rdd-no-animations'}`}
      data-rdd-skin={skin}
      data-color-scheme={currentColorScheme}
      dir={state.dir}
      // Focusable from script only: where keyboard focus goes when the last tab it was on closes.
      tabIndex={-1}
    >

      {/* 1. Main Workspace Viewport (Grids & Floating Panels) */}
      <div
        ref={workspaceRef}
        className={`rdd-workspace-viewport${state.draggedPanelId ? ' rdd-dragging-active' : ''}`}
      >
        <WorkspaceZones state={state} activeEdgeDrop={activeEdgeDrop} activeCornerAnchor={activeCornerAnchor} setActiveEdgeDrop={setActiveEdgeDrop} setActiveCornerAnchor={setActiveCornerAnchor} />

        {/* 1.1 Viewport Split Grid Layout */}
        <div className="rdd-workspace-grid-host">
          {state.gridRoot ? (
            <WorkspaceGrid
              node={state.gridRoot}
              path={[]}
              onTabRightClick={handleTabRightClick}
              activeDropZone={activeDropZone}
              onHoverDropZone={handleHoverDropZone}
              onTabDragStart={handleTabDragStart}
              hoveredTab={hoveredTab}
              onTabHover={handleTabHover}
              defaultPanelIcon={defaultPanelIcon}
              onRequestClosePanel={handleRequestClose}
            />
          ) : (
            <div className="rdd-empty-workspace-grid">
              {formatLabel(messages.emptyGrid, formatMessage)}
            </div>
          )}
        </div>

        <FloatingWindows
          state={state}
          registry={registry}
          windowClass={windowClass}
          windowBodyClass={windowBodyClass}
          defaultPanelIcon={defaultPanelIcon}
          messages={messages}
          formatMessage={formatMessage}
          setActivePanel={setActivePanel}
          focusPanel={focusPanel}
          maximizePanel={maximizePanel}
          minimizePanel={minimizePanel}
          getPanelContextMenuItems={getPanelContextMenuItems}
          showContextMenu={showContextMenu}
          handleRequestClose={handleRequestClose}
          startDrag={startDrag}
          startResize={startResize}
        />
      </div>

      {/* 2. macOS / Windows 11-style Taskbar Sibling Footer (Flex-shrinked at bottom) */}
      <Taskbar
        state={state}
        registry={registry}
        taskbarVisibility={taskbarVisibility}
        taskbarExpanded={taskbarExpanded}
        expandTaskbar={expandTaskbar}
        leaveTaskbar={leaveTaskbar}
        scrollTaskbar={scrollTaskbar}
        taskbarRef={taskbarRef}
        tooltipRef={tooltipRef}
        defaultPanelIcon={defaultPanelIcon}
        messages={messages}
        formatMessage={formatMessage}
        lastTaskbarPointerTypeRef={lastTaskbarPointerTypeRef}
        hoveredMinimized={hoveredMinimized}
        setHoveredMinimized={setHoveredMinimized}
        minimizedTooltipTimeoutRef={minimizedTooltipTimeoutRef}
        isContextMenuOpen={isContextMenuOpen}
        handleMinimizedRightClick={handleMinimizedRightClick}
        handleRequestClose={handleRequestClose}
        restorePanel={restorePanel}
      />

      {/* 3. Persistence Port: Portals rendering panels into off-screen elements. Client only:
          the server has no DOM to create them in, and panel bodies fill in after hydration. */}
      {isClient && Object.keys(state.panels).map((id) => {
        const panel = state.panels[id];
        if (!panel) return null;
        const targetEl = panelHost.getOrCreateElement(id);
        return createPortal(
          <FormContainerProviderWrapper panelId={id}>
            <div className="rdd-panel-content" data-rdd-panel={id} dir={state.dir}>
              {renderPanelContent(id, panel, registry, messages, formatMessage)}
            </div>
          </FormContainerProviderWrapper>,
          targetEl,
          id
        );
      })}

      {/* 4. Context Menu — only rendered when no parent ContextMenuProvider is in the tree */}
      {ctxMenu === null && (
        <contextMenuAdapter.Component
          ref={contextMenuRef}
          theme="dark"
          formatMessageProvider={formatMessage}
          onShow={() => setInternalContextMenuOpen(true)}
          onHide={() => setInternalContextMenuOpen(false)}
        />
      )}

      {/* 5. Dragging Tab Ghost Representation */}
      {state.draggedPanelId !== null && !state.floating.some(w => w.id === state.draggedPanelId) && (
        <div
          className="rdd-drag-ghost-tab"
          style={{
            left: dragPos.x + 12,
            top: dragPos.y + 12,
          }}
        >
          📄 {formatLabel(state.panels[state.draggedPanelId]?.title || messages.untitledPanel, formatMessage)}
        </div>
      )}



    </div>
  );
};

export default WindowManager;
