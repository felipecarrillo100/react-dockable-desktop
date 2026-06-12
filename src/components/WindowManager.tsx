/**
 * @file WindowManager.tsx
 * @description Core component for react-dockable-desktop layout engine.
 * Renders the workspace desktop containing docked splits, tabbed panels, floated windows,
 * resize handles, context menus, and taskbar docks. Exposes lifecycle event listeners.
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWindowManagerState, useWindowManagerActions, useWindowManagerActionsInternal, useFormatMessage, formatLabel, usePredefinedMessages, useStyleClasses, useRegistry } from './WindowManagerContext';
import type { LayoutNode, LayoutLeafNode, SplitDirection, DropPosition } from './WindowManagerContext';
import type { PanelRegistryClass } from './PanelRegistry';
import { isElementRtl } from '../utils/rtl';
import { JsonContextMenu, type JsonContextMenuRef } from 'replace-react-contexify';
import 'replace-react-contexify/styles.css';
import { FormContainerProvider } from './FormContainerContext';
import type { FormContainerContract } from './FormContainerContext';
import { usePanelActions } from './PanelProviderContext';
import ConfirmationForm from '../forms/ConfirmationForm';

// DOM Element Cache for preserving contexts (WebGL map, text area etc.)
const domCache = new Map<string, HTMLDivElement>();
const hiddenContainerId = 'preserved-dom-container';

const DefaultGridIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

const getOrCreateDomCacheElement = (id: string): HTMLDivElement => {
  let el = domCache.get(id);
  if (!el) {
    el = document.createElement('div');
    el.style.width = '100%';
    el.style.height = '100%';
    domCache.set(id, el);
  }
  return el;
};


// ==========================================
// 3. Persistent DOM Container Host & Slot
// ==========================================

const renderPanelContent = (id: string, componentKey: string, registry: PanelRegistryClass) => {
  const registryEntry = registry.get(componentKey);
  if (!registryEntry) {
    console.warn(
      `[react-dockable-desktop] Panel "${id}" references component key "${componentKey}" ` +
      `which is not registered. Add it to the WorkspaceClient panels config:\n` +
      `  new WorkspaceClient({ panels: { "${componentKey}": { component: YourComponent } } })`
    );
    return (
      <div className="dw-unregistered-panel" style={{ border: '2px dashed #dc3545' }}>
        <h6 style={{ fontWeight: 700, marginBottom: '0.25rem' }}>⚠️ Component Unregistered</h6>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #94a3b8)' }}>Key: {componentKey}</span>
      </div>
    );
  }
  const Component = registryEntry.Component;
  return <Component panelId={id} />;
};

const activePanelDimensions = new Map<string, { width: number; height: number }>();

interface PanelLifecycleRegistry {
  onClose: Set<() => void>;
  onMinimize: Set<() => void>;
  onRestore: Set<() => void>;
  onResize: Set<(w: number, h: number) => void>;
}

const panelLifecycleRegistry = new Map<string, PanelLifecycleRegistry>();

const getOrCreateLifecycleRegistry = (panelId: string) => {
  let entry = panelLifecycleRegistry.get(panelId);
  if (!entry) {
    entry = {
      onClose: new Set(),
      onMinimize: new Set(),
      onRestore: new Set(),
      onResize: new Set(),
    };
    panelLifecycleRegistry.set(panelId, entry);
  }
  return entry;
};

const PreservedDOMWrapper: React.FC<{ panelId: string }> = ({ panelId }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const cachedEl = getOrCreateDomCacheElement(panelId);
    host.appendChild(cachedEl);

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          activePanelDimensions.set(panelId, { width, height });
          const lifecycle = panelLifecycleRegistry.get(panelId);
          if (lifecycle) {
            lifecycle.onResize.forEach(h => h(width, height));
          }
        }
      }
    });
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      let hiddenContainer = document.getElementById(hiddenContainerId);
      if (!hiddenContainer) {
        hiddenContainer = document.createElement('div');
        hiddenContainer.id = hiddenContainerId;
        hiddenContainer.style.display = 'none';
        document.body.appendChild(hiddenContainer);
      }
      hiddenContainer.appendChild(cachedEl);
    };
  }, [panelId]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
};

const PreviewDOMWrapper: React.FC<{ panelId: string }> = ({ panelId }) => {
  const state = useWindowManagerState();
  const registry = useRegistry();
  const formatMessage = useFormatMessage();
  const hostRef = useRef<HTMLDivElement | null>(null);

  const panel = state.panels[panelId];
  const regEntry = panel ? registry.get(panel.component) : null;
  const disableLivePreview = regEntry?.defaultOptions?.disableLivePreview || false;

  const lastSize = activePanelDimensions.get(panelId) || { width: 800, height: 500 };
  const origW = lastSize.width;
  const origH = lastSize.height;
  const maxW = 220;
  const maxH = 140;
  const scale = Math.min(maxW / origW, maxH / origH);

  useEffect(() => {
    if (disableLivePreview) return;

    const host = hostRef.current;
    if (!host) return;

    const cachedEl = domCache.get(panelId);
    if (!cachedEl) return;

    host.appendChild(cachedEl);

    return () => {
      let hiddenContainer = document.getElementById(hiddenContainerId);
      if (!hiddenContainer) {
        hiddenContainer = document.createElement('div');
        hiddenContainer.id = hiddenContainerId;
        hiddenContainer.style.display = 'none';
        document.body.appendChild(hiddenContainer);
      }
      hiddenContainer.appendChild(cachedEl);
    };
  }, [panelId, disableLivePreview]);

  if (disableLivePreview) {
    const displayW = origW * scale;
    const displayH = origH * scale;
    const rawTitle = panel?.title || regEntry?.defaultOptions?.title || 'Panel';
    const title = formatLabel(rawTitle, formatMessage);
    const initialChar = (Array.from(title)[0] || 'P').toUpperCase();

    return (
      <div
        className="taskbar-item-preview-frame"
        style={{
          width: `${displayW}px`,
          height: `${displayH}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(108, 117, 125, 0.15)',
          border: '1px dashed var(--taskbar-item-border, rgba(255, 255, 255, 0.15))'
        }}
      >
        <div
          style={{
            fontSize: '2rem',
            fontWeight: 600,
            color: 'var(--panel-title-color, var(--panel-text, rgba(255, 255, 255, 0.85)))',
            userSelect: 'none'
          }}
        >
          {initialChar}
        </div>
      </div>
    );
  }

  return (
    <div
      className="taskbar-item-preview-frame"
      style={{
        width: `${origW * scale}px`,
        height: `${origH * scale}px`,
      }}
    >
      <div
        ref={hostRef}
        className="taskbar-item-preview-host"
        style={{
          width: `${origW}px`,
          height: `${origH}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
          ['--preview-scale' as string]: scale
        }}
      />
    </div>
  );
};

const FormContainerProviderWrapper: React.FC<{ panelId: string; children: React.ReactNode }> = ({ panelId, children }) => {
  const state = useWindowManagerState();
  const { requestClosePanel, setPanelDirty, registerCloseGuard, unregisterCloseGuard, updatePanelTitle } = useWindowManagerActions();

  const isMin = state.minimized.some(m => m.id === panelId);
  const prevMinRef = useRef(isMin);

  useEffect(() => {
    const entry = panelLifecycleRegistry.get(panelId);
    if (!entry) return;

    if (isMin && !prevMinRef.current) {
      entry.onMinimize.forEach(h => h());
    } else if (!isMin && prevMinRef.current) {
      entry.onRestore.forEach(h => h());
    }
    prevMinRef.current = isMin;
  }, [isMin, panelId]);

  useEffect(() => {
    return () => {
      const entry = panelLifecycleRegistry.get(panelId);
      if (entry) {
        entry.onClose.forEach(h => h());
        panelLifecycleRegistry.delete(panelId);
      }
    };
  }, [panelId]);

  const contract = React.useMemo<FormContainerContract>(() => ({
    requestClose: (options) => requestClosePanel(panelId, options),
    setDirty: (dirty) => setPanelDirty(panelId, dirty),
    onCloseRequested: (handler) => {
      registerCloseGuard(panelId, handler);
      return () => unregisterCloseGuard(panelId);
    },
    setTitle: (title) => updatePanelTitle(panelId, title),
    instanceId: panelId,
    onClose: (handler) => {
      const reg = getOrCreateLifecycleRegistry(panelId);
      reg.onClose.add(handler);
      return () => reg.onClose.delete(handler);
    },
    onMinimize: (handler) => {
      const reg = getOrCreateLifecycleRegistry(panelId);
      reg.onMinimize.add(handler);
      return () => reg.onMinimize.delete(handler);
    },
    onRestore: (handler) => {
      const reg = getOrCreateLifecycleRegistry(panelId);
      reg.onRestore.add(handler);
      return () => reg.onRestore.delete(handler);
    },
    onResize: (handler) => {
      const reg = getOrCreateLifecycleRegistry(panelId);
      reg.onResize.add(handler);
      return () => reg.onResize.delete(handler);
    }
  }), [panelId, requestClosePanel, setPanelDirty, registerCloseGuard, unregisterCloseGuard, updatePanelTitle]);

  return (
    <FormContainerProvider value={contract}>
      {children}
    </FormContainerProvider>
  );
};




// ==========================================
// 4. Panel Tab Headers & Split Layout Component
// ==========================================

interface WorkspaceGridProps {
  node: LayoutNode;
  path: number[];
  onTabRightClick: (id: string, e: React.MouseEvent) => void;
  activeDropZone: { leafId: string; position: DropPosition } | null;
  onHoverDropZone: (leafId: string, position: DropPosition | null) => void;
  onTabDragStart: (id: string, e: React.PointerEvent) => void;
  hoveredTab: { leafId: string; panelId: string; index: number; side: 'left' | 'right' } | null;
  onTabHover: (leafId: string, panelId: string, index: number, side: 'left' | 'right' | null) => void;
  defaultPanelIcon?: React.ReactNode;
  onRequestClosePanel: (id: string) => void;
}

const WorkspaceGrid: React.FC<WorkspaceGridProps> = ({ node, path, onTabRightClick, activeDropZone, onHoverDropZone, onTabDragStart, hoveredTab, onTabHover, defaultPanelIcon, onRequestClosePanel }) => {
  const { updateSplitSizes } = useWindowManagerActions();

  if (node.type === 'leaf') {
    return <LeafGroup leaf={node} onTabRightClick={onTabRightClick} activeDropZone={activeDropZone} onHoverDropZone={onHoverDropZone} onTabDragStart={onTabDragStart} hoveredTab={hoveredTab} onTabHover={onTabHover} defaultPanelIcon={defaultPanelIcon} onRequestClosePanel={onRequestClosePanel} />;
  }

  const isRow = node.orientation === 'horizontal';

  const handleResizerPointerDown = (idx: number, e: React.PointerEvent) => {
    e.preventDefault();
    const resizerEl = e.currentTarget as HTMLDivElement;
    resizerEl.setPointerCapture(e.pointerId);

    const startOffset = isRow ? e.clientX : e.clientY;
    const startSizes = [...node.sizes];

    resizerEl.classList.add('active');
    document.body.classList.add('resizing-active', isRow ? 'resizing-col-active' : 'resizing-row-active');

    const parentEl = resizerEl.parentElement;
    const parentSize = parentEl
      ? (isRow ? parentEl.clientWidth : parentEl.clientHeight)
      : (isRow ? 1000 : 800);

    const onMove = (me: PointerEvent) => {
      const delta = (isRow ? me.clientX : me.clientY) - startOffset;
      const deltaPercentage = delta / parentSize;
      const newSizes = [...startSizes];
      newSizes[idx] += deltaPercentage;
      newSizes[idx + 1] -= deltaPercentage;
      if (newSizes[idx] > 0.1 && newSizes[idx + 1] > 0.1) {
        updateSplitSizes(path, newSizes);
      }
    };

    const onEnd = () => {
      resizerEl.classList.remove('active');
      document.body.classList.remove('resizing-active', 'resizing-row-active', 'resizing-col-active');
      resizerEl.removeEventListener('pointermove', onMove);
      resizerEl.removeEventListener('pointerup', onEnd);
      resizerEl.removeEventListener('pointercancel', onEnd);
    };

    resizerEl.addEventListener('pointermove', onMove);
    resizerEl.addEventListener('pointerup', onEnd);
    resizerEl.addEventListener('pointercancel', onEnd);
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: isRow ? 'row' : 'column', width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      {node.children.map((child, idx) => {
        const size = node.sizes[idx] * 100;
        return (
          <React.Fragment key={idx}>
            <div style={{ flexGrow: node.sizes[idx], flexBasis: `${size}%`, overflow: 'hidden', position: 'relative' }}>
              <WorkspaceGrid node={child} path={[...path, idx]} onTabRightClick={onTabRightClick} activeDropZone={activeDropZone} onHoverDropZone={onHoverDropZone} onTabDragStart={onTabDragStart} hoveredTab={hoveredTab} onTabHover={onTabHover} defaultPanelIcon={defaultPanelIcon} onRequestClosePanel={onRequestClosePanel} />
            </div>
            {idx < node.children.length - 1 && (
              <div
                onPointerDown={(e) => handleResizerPointerDown(idx, e)}
                style={{
                  cursor: isRow ? 'col-resize' : 'row-resize',
                  width: isRow ? '1px' : '100%',
                  height: isRow ? '100%' : '1px',
                  zIndex: 20,
                }}
                className="resizer-bar"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

interface LeafGroupProps {
  leaf: LayoutLeafNode;
  onTabRightClick: (id: string, e: React.MouseEvent) => void;
  activeDropZone: { leafId: string; position: DropPosition } | null;
  onHoverDropZone: (leafId: string, position: DropPosition | null) => void;
  onTabDragStart: (id: string, e: React.PointerEvent) => void;
  hoveredTab: { leafId: string; panelId: string; index: number; side: 'left' | 'right' } | null;
  onTabHover: (leafId: string, panelId: string, index: number, side: 'left' | 'right' | null) => void;
  defaultPanelIcon?: React.ReactNode;
  onRequestClosePanel: (id: string) => void;
}

const LeafGroup: React.FC<LeafGroupProps> = ({ leaf, onTabRightClick, activeDropZone, onHoverDropZone, onTabDragStart, hoveredTab, onTabHover, defaultPanelIcon, onRequestClosePanel }) => {
  const state = useWindowManagerState();
  const registry = useRegistry();
  const { openPanel, closeLeafGroup, setActivePanel } = useWindowManagerActionsInternal();
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  const { windowClass, windowBodyClass } = useStyleClasses();

  const selectTab = (id: string) => {
    openPanel(id, state.panels[id].component);
    setActivePanel(id);
  };

  return (
    <div
      data-active-panel-id={leaf.activePanelId || ''}
      className={`workspace-panel ${windowClass ?? ''}`}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      {/* Tab Headers */}
      <div className="workspace-tab-bar" style={{ minHeight: '38px' }}>
        <div
          className="tab-headers-container"
          style={{ scrollbarWidth: 'none' }}
          onPointerMove={(e) => {
            if (state.draggedPanelId && e.target === e.currentTarget) {
              onTabHover(leaf.id, 'EMPTY', leaf.panels.length, 'right');
            }
          }}
          onPointerLeave={(e) => {
            if (state.draggedPanelId && e.target === e.currentTarget) {
              onTabHover(leaf.id, '', -1, null);
            }
          }}
        >
          {leaf.panels.map((id, idx) => {
            const panel = state.panels[id];
            if (!panel) return null;
            const isSelected = leaf.activePanelId === id;
            const isGloballyActive = state.activePanelId === id;

            const registryEntry = registry.get(panel.component);
            const options = registryEntry?.defaultOptions;

            const isHovered = hoveredTab && hoveredTab.leafId === leaf.id && hoveredTab.panelId === id;
            const isLast = idx === leaf.panels.length - 1;
            const isHoveredEmpty = hoveredTab && hoveredTab.leafId === leaf.id && hoveredTab.panelId === 'EMPTY' && isLast;
            const sideClass = isHovered
              ? (hoveredTab.side === 'left' ? 'drag-hover-left' : 'drag-hover-right')
              : (isHoveredEmpty ? 'drag-hover-right' : '');

            const tabFocusClass = isSelected
              ? (isGloballyActive ? 'active workspace-tab-active-focused' : 'active workspace-tab-active-unfocused')
              : 'workspace-tab-inactive';

            return (
              <div
                key={id}
                data-tab-id={id}
                data-leaf-id={leaf.id}
                data-tab-index={String(idx)}
                onClick={() => selectTab(id)}
                onPointerDown={(e) => {
                  if (options?.canDrag !== false) {
                    onTabDragStart(id, e);
                  }
                }}
                onContextMenu={(e) => onTabRightClick(id, e)}
                onPointerMove={(e) => {
                  if (state.draggedPanelId && e.pointerType !== 'touch') {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relativeX = e.clientX - rect.left;
                    const side = relativeX < rect.width / 2 ? 'left' : 'right';
                    onTabHover(leaf.id, id, idx, side);
                  }
                }}
                onPointerLeave={() => {
                  if (state.draggedPanelId) {
                    onTabHover(leaf.id, '', -1, null);
                  }
                }}
                className={`workspace-tab ${tabFocusClass} ${sideClass}`}
                style={{ cursor: options?.canDrag === false ? 'default' : 'pointer' }}
              >
                <span className="text-truncate" style={{ maxWidth: '120px', display: 'flex', alignItems: 'center' }}>
                  <span className="workspace-tab-icon">{options?.icon || defaultPanelIcon || DefaultGridIcon}</span>
                  <span>
                    {formatLabel(panel.title, formatMessage)}
                    {panel.dirty ? ' *' : ''}
                  </span>
                </span>
                {options?.renderHeaderActions && (
                  <span
                    className="tab-header-actions"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {options.renderHeaderActions(id)}
                  </span>
                )}
                {options?.canClose !== false && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestClosePanel(id);
                    }}
                    title={formatLabel(messages.closeTab, formatMessage)}
                    className="close-tab-x"
                    style={{ width: '18px', height: '18px', ...(options?.renderHeaderActions ? {} : { marginInlineStart: 'auto' }) }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty group close button — only visible when keepOnEmpty keeps the group alive */}
        {leaf.panels.length === 0 && leaf.keepOnEmpty && leaf.canClose !== false && (
          <span
            onClick={() => closeLeafGroup(leaf.id)}
            className="close-tab-x header-close-empty-group"
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            title={formatLabel(messages.closeEmptyGroup, formatMessage)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </span>
        )}
      </div>

      {/* Tab Content Display Area */}
      <div className={`dw-panel-body ${windowBodyClass ?? ''}`} style={{ position: 'relative', overflow: 'hidden' }}>
        {leaf.activePanelId && state.panels[leaf.activePanelId] ? (
          <PreservedDOMWrapper key={leaf.activePanelId} panelId={leaf.activePanelId} />
        ) : (
          <div className="empty-leaf-placeholder">
            <span>Empty Workspace Section</span>
          </div>
        )}

        {/* Drag overlay targets cross */}
        {state.draggedPanelId !== null && (
          <div className="dock-drop-zone-overlay">
            <div className="dock-target-cross">
              {/* Top target */}
              <div
                data-leaf-id={leaf.id}
                data-drop-zone="top"
                onPointerEnter={() => onHoverDropZone(leaf.id, 'top')}
                onPointerLeave={() => onHoverDropZone(leaf.id, null)}
                className="dock-target-box dock-target-top"
              >
                ▲
              </div>
              {/* Bottom target */}
              <div
                data-leaf-id={leaf.id}
                data-drop-zone="bottom"
                onPointerEnter={() => onHoverDropZone(leaf.id, 'bottom')}
                onPointerLeave={() => onHoverDropZone(leaf.id, null)}
                className="dock-target-box dock-target-bottom"
              >
                ▼
              </div>
              {/* Left target */}
              <div
                data-leaf-id={leaf.id}
                data-drop-zone="left"
                onPointerEnter={() => onHoverDropZone(leaf.id, 'left')}
                onPointerLeave={() => onHoverDropZone(leaf.id, null)}
                className="dock-target-box dock-target-left"
              >
                ◀
              </div>
              {/* Right target */}
              <div
                data-leaf-id={leaf.id}
                data-drop-zone="right"
                onPointerEnter={() => onHoverDropZone(leaf.id, 'right')}
                onPointerLeave={() => onHoverDropZone(leaf.id, null)}
                className="dock-target-box dock-target-right"
              >
                ▶
              </div>
              {/* Center target */}
              <div
                data-leaf-id={leaf.id}
                data-drop-zone="center"
                onPointerEnter={() => onHoverDropZone(leaf.id, 'center')}
                onPointerLeave={() => onHoverDropZone(leaf.id, null)}
                className="dock-target-box dock-target-center"
              >
                ▣
              </div>
            </div>
          </div>
        )}

        {/* Visual preview highlight overlay */}
        {state.draggedPanelId !== null && activeDropZone !== null && activeDropZone.leafId === leaf.id && (
          <div
            className="dock-preview-highlight"
            style={{
              left: activeDropZone.position === 'right' ? '50%' : '0',
              top: activeDropZone.position === 'bottom' ? '50%' : '0',
              width: (activeDropZone.position === 'left' || activeDropZone.position === 'right') ? '50%' : '100%',
              height: (activeDropZone.position === 'top' || activeDropZone.position === 'bottom') ? '50%' : '100%',
            }}
          />
        )}
      </div>
    </div>
  );
};


// ==========================================
// 5. WindowManager (Main Render Component)
// ==========================================

export interface WindowManagerProps {
  skin?: string;
  defaultPanelIcon?: React.ReactNode;
}

export const WindowManager: React.FC<WindowManagerProps> = ({ skin = 'vscode', defaultPanelIcon }) => {
  const state = useWindowManagerState();
  const registry = useRegistry();
  const { restorePanel, minimizePanel, requestClosePanel, maximizePanel, updateFloatingPosition, focusPanel, floatPanel, setDraggedPanelId, dockPanelToGroup, movePanelOrder, dockPanelToWorkspaceEdge, setActivePanel, setDirection } = useWindowManagerActionsInternal();
  const { openModal } = usePanelActions();
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();

  const handleRequestClose = React.useCallback((id: string) => {
    const panel = state.panels[id];
    requestClosePanel(id, {
      onConfirm: (customOpts) => new Promise<boolean>((resolve) => {
        const opts = customOpts || panel?.dirtyOptions;
        const baseTitle = panel ? formatLabel(panel.title, formatMessage) : 'Panel';
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
            onOK: () => resolve(true),
            onCancel: () => resolve(false),
          },
          { size: 'small' }
        );
      })
    });
  }, [requestClosePanel, state.panels, formatMessage, openModal, messages]);

  const { windowClass, windowBodyClass } = useStyleClasses();
  const taskbarRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<JsonContextMenuRef>(null);

  const [hoveredMinimized, setHoveredMinimized] = useState<{ id: string; rect: DOMRect; title: string | any; component: string } | null>(null);
  const minimizedTooltipTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);

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

  const [activeDropZone, setActiveDropZone] = useState<{ leafId: string; position: DropPosition } | null>(null);
  const activeDropZoneRef = useRef<{ leafId: string; position: DropPosition } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [activeEdgeDrop, setActiveEdgeDropState] = useState<SplitDirection | null>(null);
  const activeEdgeDropRef = useRef<SplitDirection | null>(null);
  const setActiveEdgeDrop = (val: SplitDirection | null) => {
    setActiveEdgeDropState(val);
    activeEdgeDropRef.current = val;
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
          const pos = el.dataset.dropZone as DropPosition;
          setActiveDropZone({ leafId, position: pos });
          activeDropZoneRef.current = { leafId, position: pos };
          foundDropZone = true;
        }
      }

      if (!foundEdge && el.dataset.edgeTrigger) {
        setActiveEdgeDrop(el.dataset.edgeTrigger as SplitDirection);
        foundEdge = true;
      }

      if (!foundTab && el.dataset.tabId) {
        const leafId = el.dataset.leafId;
        const tabIdx = parseInt(el.dataset.tabIndex || '0', 10);
        if (leafId) {
          const rect = el.getBoundingClientRect();
          const side = (x - rect.left) < rect.width / 2 ? 'left' : 'right';
          setHoveredTab({ leafId, panelId: el.dataset.tabId, index: tabIdx, side });
          hoveredTabRef.current = { leafId, panelId: el.dataset.tabId, index: tabIdx, side };
          foundTab = true;
        }
      }

      if (foundDropZone && foundEdge && foundTab) break;
    }

    if (!foundDropZone) { setActiveDropZone(null); activeDropZoneRef.current = null; }
    if (!foundEdge) setActiveEdgeDrop(null);
    if (!foundTab) { setHoveredTab(null); hoveredTabRef.current = null; }
  };

  const LONG_PRESS_MS = 300;
  const CANCEL_MOVE_PX = 8;

  const clearDragState = () => {
    setDraggedPanelId(null);
    setActiveDropZone(null);
    activeDropZoneRef.current = null;
    setHoveredTab(null);
    hoveredTabRef.current = null;
    setActiveEdgeDrop(null);
  };

  const executeDrop = (id: string, me: PointerEvent) => {
    const dropZone = activeDropZoneRef.current;
    const targetTab = hoveredTabRef.current;
    const edgeDrop = activeEdgeDropRef.current;

    if (edgeDrop) {
      dockPanelToWorkspaceEdge(id, edgeDrop);
    } else if (targetTab) {
      let targetIndex = targetTab.index;
      if (targetTab.side === 'right') targetIndex += 1;
      movePanelOrder(id, targetTab.leafId, targetIndex);
    } else if (dropZone) {
      dockPanelToGroup(id, dropZone.leafId, dropZone.position);
    } else {
      floatPanel(id, { x: me.clientX - 150, y: me.clientY - 15, width: 450, height: 350 });
    }
    clearDragState();
  };

  const handleTabDragStart = (id: string, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

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
        el.classList.add('long-press-active');
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
          el.classList.remove('long-press-active');
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onEnd);
          el.removeEventListener('pointercancel', onCancel);

          if (dragStarted) {
            executeDrop(id, me);
          } else {
            // Release without drag → context menu
            handleTabRightClick(id, me as unknown as React.MouseEvent);
          }
        };

        const onCancel = () => {
          el.classList.remove('long-press-active');
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onEnd);
          el.removeEventListener('pointercancel', onCancel);
          if (dragStarted) clearDragState();
        };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onEnd);
        el.addEventListener('pointercancel', onCancel);
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
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        if (dragStarted) executeDrop(id, me);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
    }
  };

  const handleTabRightClick = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const panel = state.panels[id];
    if (!panel) return;
    const registryEntry = registry.get(panel.component);
    const options = registryEntry?.defaultOptions;

    const items = [];
    if (options?.canDrag !== false) {
      items.push({
        label: formatLabel(messages.floatWindow, formatMessage),
        action: () => floatPanel(id)
      });
    }
    if (options?.canMinimize !== false) {
      items.push({
        label: formatLabel(messages.minimizePanel, formatMessage),
        action: () => minimizePanel(id)
      });
    }
    if (items.length > 0 && options?.canClose !== false) {
      items.push({ separator: true as const });
    }
    if (options?.canClose !== false) {
      items.push({
        label: formatLabel(messages.closeTab, formatMessage),
        action: () => handleRequestClose(id)
      });
    }

    if (items.length === 0) return;

    contextMenuRef.current?.show({
      event: e,
      contextMenu: { items }
    });
  };

  const handleMinimizedRightClick = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setHoveredMinimized(null);
    contextMenuRef.current?.show({
      event: e,
      contextMenu: {
        items: [
          {
            label: formatLabel(messages.restorePanel, formatMessage),
            action: () => restorePanel(id)
          },
          {
            label: formatLabel(messages.maximizePanel, formatMessage),
            action: () => maximizePanel(id)
          },
          { separator: true },
          {
            label: formatLabel(messages.closePanel, formatMessage),
            action: () => handleRequestClose(id)
          }
        ]
      }
    });
  };

  // Clean up domCache for panels that are no longer in state.panels
  useEffect(() => {
    const keys = Object.keys(state.panels);
    for (const cachedId of Array.from(domCache.keys())) {
      if (!keys.includes(cachedId)) {
        domCache.delete(cachedId);
      }
    }
  }, [state.panels]);

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
  const [workspaceSize, setWorkspaceSize] = useState({ width: 1024, height: 768 });

  // Dynamically observe the workspace container bounds (accounts for sidebar expanding/collapsing and taskbar showing/hiding)
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;

    let heightWarnShown = false;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const rect = entries[0].contentRect;

      if (process.env.NODE_ENV === 'development' && rect.height < 10 && !heightWarnShown) {
        heightWarnShown = true;

        // Walk up the ancestor chain to find the highest zero-height element
        let culprit: Element = el;
        let cursor = el.parentElement;
        while (cursor && cursor !== document.documentElement) {
          if (cursor.getBoundingClientRect().height < 10) {
            culprit = cursor;
          } else {
            break;
          }
          cursor = cursor.parentElement;
        }

        const tag = culprit.tagName.toLowerCase();
        const id  = culprit.id ? ` id="${culprit.id}"` : '';
        const cls = culprit.className ? ` class="${culprit.className}"` : '';
        const who = culprit === el
          ? 'the WindowManager container itself'
          : `a wrapper element: <${tag}${id}${cls}>`;

        console.warn(
          `[react-dockable-desktop] Workspace height is 0px — the workspace will be invisible.\n\n` +
          `Zero height found at: ${who}\n\n` +
          `Root cause: in CSS, "height: 100%" only works when the parent has an explicit height.\n` +
          `If any ancestor has height: auto (the default for <div>), the chain breaks and\n` +
          `everything inside collapses to 0px.\n\n` +
          `Fix options:\n` +
          `  1. Use height: 100vh directly on the workspace wrapper:\n` +
          `       <div style={{ height: '100vh', overflow: 'hidden' }}>\n` +
          `         <WindowManager />\n` +
          `       </div>\n\n` +
          `  2. Use CSS Grid/Flex and let the workspace fill remaining space:\n` +
          `       .layout { display: flex; flex-direction: column; height: 100vh; }\n` +
          `       .workspace { flex: 1; min-height: 0; }\n\n` +
          `  3. Verify styles.css is imported — it anchors html, body, #root to 100% height.`
        );
      }

      setWorkspaceSize({
        width: Math.max(100, rect.width),
        height: Math.max(100, rect.height)
      });
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Dynamically observe document/container direction changes
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;

    const updateDir = () => {
      const isRtl = isElementRtl(el);
      setDirection(isRtl ? 'rtl' : 'ltr');
    };

    updateDir();

    const observer = new MutationObserver(updateDir);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['dir'] });

    const closestDir = el.closest('[dir]');
    if (closestDir && closestDir !== document.documentElement && closestDir !== document.body) {
      observer.observe(closestDir, { attributes: true, attributeFilter: ['dir'] });
    }

    return () => {
      observer.disconnect();
    };
  }, [setDirection]);

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

      // Clamp window size if it exceeds the new workspace size
      if (newWidth > viewW) {
        newWidth = Math.max(200, viewW - 20);
        changed = true;
      }
      if (newHeight > viewH) {
        newHeight = Math.max(150, viewH - 40);
        changed = true;
      }

      const GAP = 10;

      // Align sticky borders
      if (w.stickyRight) {
        newX = viewW - newWidth - GAP;
        changed = true;
      } else {
        // Bounding clamp for non-sticky windows to prevent falling off-screen
        const maxX = viewW - 100; // Keep at least 100px of titlebar visible
        if (newX > maxX) {
          newX = Math.max(0, maxX);
          changed = true;
        }
      }

      if (w.stickyBottom) {
        newY = viewH - newHeight - GAP;
        changed = true;
      } else {
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
      const windowEl = target.closest('.floating-window') as HTMLElement | null;
      if (windowEl) {
        const winId = windowEl.getAttribute('data-window-id');
        if (winId) {
          setActivePanel(winId);
          focusPanel(winId);
        }
        return;
      }

      // 2. Check if click is inside a grid split pane
      const panelEl = target.closest('.workspace-panel') as HTMLElement | null;
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

  // Floating Window dragging handler
  const startDrag = (id: string, e: React.PointerEvent) => {
    const floatingWin = state.floating.find(w => w.id === id);
    if (!floatingWin || floatingWin.maximized) return;
    focusPanel(id);

    const el = e.currentTarget as HTMLDivElement;
    const windowEl = el.closest('.floating-window') as HTMLDivElement | null;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = windowEl ? windowEl.offsetLeft : 0;
    const startPosY = windowEl ? windowEl.offsetTop : 0;

    const executeFWDrop = () => {
      const dropZone = activeDropZoneRef.current;
      const targetTab = hoveredTabRef.current;
      const edgeDrop = activeEdgeDropRef.current;
      if (edgeDrop) {
        dockPanelToWorkspaceEdge(id, edgeDrop);
      } else if (targetTab) {
        let targetIndex = targetTab.index;
        if (targetTab.side === 'right') targetIndex += 1;
        movePanelOrder(id, targetTab.leafId, targetIndex);
      } else if (dropZone) {
        dockPanelToGroup(id, dropZone.leafId, dropZone.position);
      }
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
        el.classList.add('long-press-active');
        setDraggedPanelId(id);

        const onMove = (me: PointerEvent) => {
          const dx = me.clientX - startX;
          const dy = me.clientY - startY;
          updateFloatingPosition(id, { x: startPosX + dx, y: startPosY + dy, stickyRight: false, stickyBottom: false });
          updateHoverFromPoint(me.clientX, me.clientY);
        };

        const onEnd = () => {
          el.classList.remove('long-press-active');
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onEnd);
          el.removeEventListener('pointercancel', onCancel);
          executeFWDrop();
        };

        const onCancel = () => {
          el.classList.remove('long-press-active');
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onEnd);
          el.removeEventListener('pointercancel', onCancel);
          clearDragState();
        };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onEnd);
        el.addEventListener('pointercancel', onCancel);
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
          updateFloatingPosition(id, { x: startPosX + dx, y: startPosY + dy, stickyRight: false, stickyBottom: false });
        }
      };

      const onEnd = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        if (dragStarted) executeFWDrop();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
    }
  };

  type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

  // Floating Window resizing handler — supports 8 directions
  const startResize = (id: string, dir: ResizeDir, e: React.PointerEvent) => {
    e.stopPropagation();
    const floatingWin = state.floating.find(w => w.id === id);
    if (!floatingWin || floatingWin.maximized) return;
    focusPanel(id);

    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const windowEl = el.closest('.floating-window') as HTMLDivElement | null;
    const startW = windowEl ? windowEl.offsetWidth : 400;
    const startH = windowEl ? windowEl.offsetHeight : 300;
    const startPosX = windowEl ? windowEl.offsetLeft : 0;
    const startPosY = windowEl ? windowEl.offsetTop : 0;

    const viewW = workspaceSize.width;
    const viewH = workspaceSize.height;
    const parsedX = typeof floatingWin.x === 'string' ? parseFloat(floatingWin.x) : floatingWin.x;
    const parsedY = typeof floatingWin.y === 'string' ? parseFloat(floatingWin.y) : floatingWin.y;
    const parsedW = typeof floatingWin.width === 'string' ? parseFloat(floatingWin.width) : floatingWin.width;
    const parsedH = typeof floatingWin.height === 'string' ? parseFloat(floatingWin.height) : floatingWin.height;
    const isRightSnapped = dir === 'se' && Math.abs(parsedX + parsedW - viewW) < 4;
    const isBottomSnapped = dir === 'se' && Math.abs(parsedY + parsedH - viewH) < 4;

    const onMove = (me: PointerEvent) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;

      let newX = startPosX;
      let newY = startPosY;
      let newW = startW;
      let newH = startH;

      if (dir.includes('e')) newW = Math.max(200, startW + dx);
      if (dir.includes('w')) { newW = Math.max(200, startW - dx); newX = startPosX + startW - newW; }
      if (dir.includes('s')) newH = Math.max(150, startH + dy);
      if (dir.includes('n')) { newH = Math.max(150, startH - dy); newY = startPosY + startH - newH; }

      // Snap adjustments for SE corner when previously snapped to workspace edges
      if (isRightSnapped) {
        newX = viewW - newW;
        if (newX < 0) { newX = 0; newW = viewW; }
      }
      if (isBottomSnapped) {
        newY = viewH - newH;
        if (newY < 0) { newY = 0; newH = viewH; }
      }

      updateFloatingPosition(id, {
        x: newX, y: newY,
        width: newW, height: newH,
        stickyRight: isRightSnapped,
        stickyBottom: isBottomSnapped
      });
    };

    const onEnd = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
  };

  // horizontal scroll for minimized taskbar
  const scrollTaskbar = (direction: 'left' | 'right') => {
    if (taskbarRef.current) {
      const amount = direction === 'left' ? -150 : 150;
      taskbarRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Fetch the active color-scheme from documentElement to make sure nested variables resolve correctly
  const [currentColorScheme, setCurrentColorScheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const updateThemeState = () => {
      const activeTheme = document.documentElement.getAttribute('data-color-scheme') === 'light' ? 'light' : 'dark';
      setCurrentColorScheme(activeTheme);
    };
    updateThemeState();
    const obs = new MutationObserver(updateThemeState);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme'] });
    return () => obs.disconnect();
  }, []);

  return (
    <div
      data-workspace-skin={skin}
      data-color-scheme={currentColorScheme}
      style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden', userSelect: 'none' }}
      dir={state.dir}
    >

      {/* 1. Main Workspace Viewport (Grids & Floating Panels) */}
      <div
        ref={workspaceRef}
        className={state.draggedPanelId ? 'dragging-active' : undefined}
        style={{ flexGrow: 1, width: '100%', position: 'relative', overflow: 'hidden' }}
      >
        {/* Workspace outer edge drop zone targets */}
        {state.draggedPanelId !== null && (
          <>
            <div
              data-edge-trigger="left"
              className="workspace-edge-trigger edge-trigger-left"
              onPointerEnter={() => setActiveEdgeDrop('left')}
              onPointerLeave={() => setActiveEdgeDrop(null)}
            />
            <div
              data-edge-trigger="right"
              className="workspace-edge-trigger edge-trigger-right"
              onPointerEnter={() => setActiveEdgeDrop('right')}
              onPointerLeave={() => setActiveEdgeDrop(null)}
            />
            <div
              data-edge-trigger="top"
              className="workspace-edge-trigger edge-trigger-top"
              onPointerEnter={() => setActiveEdgeDrop('top')}
              onPointerLeave={() => setActiveEdgeDrop(null)}
            />
            <div
              data-edge-trigger="bottom"
              className="workspace-edge-trigger edge-trigger-bottom"
              onPointerEnter={() => setActiveEdgeDrop('bottom')}
              onPointerLeave={() => setActiveEdgeDrop(null)}
            />
          </>
        )}

        {/* Edge drop visual preview overlay */}
        {state.draggedPanelId !== null && activeEdgeDrop !== null && (
          <div className={`workspace-edge-preview edge-preview-${activeEdgeDrop}`} />
        )}

        {/* 1.1 Viewport Split Grid Layout */}
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
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
            <div className="empty-workspace-grid">
              Grid Empty
            </div>
          )}
        </div>

        {(() => {
          return state.floating.map(w => {
            const panel = state.panels[w.id];
            if (!panel) return null;

            const isMaximized = w.maximized;
            const isDragged = state.draggedPanelId === w.id;
            const isFocused = state.activePanelId === w.id;

            const registryEntry = registry.get(panel.component);
            const options = registryEntry?.defaultOptions;

            return (
              <div
                key={w.id}
                data-window-id={w.id}
                dir={state.dir}
                onPointerDownCapture={() => {
                  setActivePanel(w.id);
                  focusPanel(w.id);
                }}
                className={`floating-window ${isMaximized ? 'maximized' : ''} ${isFocused ? 'v2-window-focused' : ''} ${windowClass ?? ''}`}
                style={{
                  position: 'absolute',
                  left: isMaximized ? 0 : (typeof w.x === 'number' ? `${w.x}px` : w.x),
                  top: isMaximized ? 0 : (typeof w.y === 'number' ? `${w.y}px` : w.y),
                  width: isMaximized ? '100%' : (typeof w.width === 'number' ? `${w.width}px` : w.width),
                  height: isMaximized ? '100%' : (typeof w.height === 'number' ? `${w.height}px` : w.height),
                  zIndex: w.z,
                  pointerEvents: isDragged ? 'none' : 'auto',
                }}
              >
                {/* Title Bar */}
                <div
                  onDoubleClick={() => maximizePanel(w.id)}
                  onPointerDown={(e) => {
                    if (options?.canDrag !== false) {
                      startDrag(w.id, e);
                    }
                  }}
                  className="floating-window-titlebar cursor-move"
                  style={{ cursor: isMaximized || options?.canDrag === false ? 'default' : 'move' }}
                >
                  <span className="floating-window-title">
                    <span className="window-title-icon">{options?.icon || defaultPanelIcon || DefaultGridIcon}</span>
                    <span>
                      {formatLabel(panel.title, formatMessage)}
                      {panel.dirty ? ' *' : ''}
                    </span>
                  </span>
                  <div className="fw-titlebar-actions" style={{ gap: 'var(--header-button-gap, 4px)' }} onPointerDown={(e) => e.stopPropagation()}>
                    {options?.renderHeaderActions && (
                      <div className="window-header-actions">
                        {options.renderHeaderActions(w.id)}
                      </div>
                    )}
                    {options?.canDrag !== false && (
                      <button
                        type="button"
                        title={formatLabel(messages.windowAnchoringOptions, formatMessage)}
                        onClick={(e) => {
                          const isRight = !!w.stickyRight;
                          const isBottom = !!w.stickyBottom;
                          contextMenuRef.current?.show({
                            event: e,
                            contextMenu: {
                              items: [
                                {
                                  label: formatLabel(messages.anchorToRightEdge, formatMessage),
                                  checkbox: {
                                    active: true,
                                    enabled: true,
                                    value: isRight
                                  },
                                  action: () => {
                                    const viewW = workspaceSize.width;
                                    const winW = typeof w.width === 'string' ? parseFloat(w.width) : w.width;
                                    const GAP = 10;
                                    if (!isRight) {
                                      updateFloatingPosition(w.id, { x: viewW - winW - GAP, stickyRight: true });
                                    } else {
                                      updateFloatingPosition(w.id, { stickyRight: false });
                                    }
                                  }
                                },
                                {
                                  label: formatLabel(messages.anchorToBottomEdge, formatMessage),
                                  checkbox: {
                                    active: true,
                                    enabled: true,
                                    value: isBottom
                                  },
                                  action: () => {
                                    const viewH = workspaceSize.height;
                                    const winH = typeof w.height === 'string' ? parseFloat(w.height) : w.height;
                                    const GAP = 10;
                                    if (!isBottom) {
                                      updateFloatingPosition(w.id, { y: viewH - winH - GAP, stickyBottom: true });
                                    } else {
                                      updateFloatingPosition(w.id, { stickyBottom: false });
                                    }
                                  }
                                }
                              ]
                            }
                          });
                        }}
                        className="custom-tab-btn btn-anchor-tab"
                      >
                        <svg className={`anchor-icon ${(w.stickyRight && w.stickyBottom) ? 'anchor-sticky-both' : w.stickyRight ? 'anchor-sticky-right' : w.stickyBottom ? 'anchor-sticky-bottom' : ''}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="5" r="2" />
                          <path d="M12 7v7m0 0a4 4 0 0 1-4-4M12 14a4 4 0 0 0 4-4M5 18h14" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      title={isMaximized
                        ? formatLabel(messages.restoreSize, formatMessage)
                        : formatLabel(messages.maximize, formatMessage)}
                      onClick={() => maximizePanel(w.id)}
                      className="custom-tab-btn btn-maximize-tab"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="4" y="4" width="16" height="16" rx="1.5"/>
                      </svg>
                    </button>
                    {options?.canMinimize !== false && (
                      <button
                        type="button"
                        title={formatLabel(messages.minimize, formatMessage)}
                        onClick={() => minimizePanel(w.id)}
                        className="custom-tab-btn btn-minimize-tab"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M5 12h14"/>
                        </svg>
                      </button>
                    )}
                    {options?.canClose !== false && (
                      <button
                        type="button"
                        title={formatLabel(messages.close, formatMessage)}
                        onClick={() => handleRequestClose(w.id)}
                        className="custom-tab-btn btn-close-tab"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Window Content */}
                <div className={windowBodyClass ?? undefined} style={{ flexGrow: 1, width: '100%', overflow: 'hidden', position: 'relative', isolation: 'isolate' }}>
                  <PreservedDOMWrapper key={w.id} panelId={w.id} />
                </div>

                {/* 8-direction resize handles */}
                {!isMaximized && (
                  <>
                    <div onPointerDown={(e) => startResize(w.id, 'n',  e)} className="resize-handle resize-n"  />
                    <div onPointerDown={(e) => startResize(w.id, 'ne', e)} className="resize-handle resize-ne" />
                    <div onPointerDown={(e) => startResize(w.id, 'e',  e)} className="resize-handle resize-e"  />
                    <div onPointerDown={(e) => startResize(w.id, 'se', e)} className="resize-handle resize-se" />
                    <div onPointerDown={(e) => startResize(w.id, 's',  e)} className="resize-handle resize-s"  />
                    <div onPointerDown={(e) => startResize(w.id, 'sw', e)} className="resize-handle resize-sw" />
                    <div onPointerDown={(e) => startResize(w.id, 'w',  e)} className="resize-handle resize-w"  />
                    <div onPointerDown={(e) => startResize(w.id, 'nw', e)} className="resize-handle resize-nw" />
                  </>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* 2. macOS / Windows 11-style Taskbar Sibling Footer (Flex-shrinked at bottom) */}
      {state.minimized.length > 0 && (
        <div className="taskbar-footer-container" style={{ height: '48px', zIndex: 100 }}>
          <button
            type="button"
            onClick={() => scrollTaskbar('left')}
            className="taskbar-nav-btn"
            style={{ display: state.minimized.length > 4 ? 'block' : 'none' }}
          >
            ◀
          </button>

          <div
            ref={taskbarRef}
            className="taskbar-items-container"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {state.minimized.map(m => {
              const regEntry = registry.get(m.component);
              const icon = regEntry?.defaultOptions?.icon || defaultPanelIcon || DefaultGridIcon;

              return (
                <div
                  key={m.id}
                  onClick={() => {
                    setHoveredMinimized(null);
                    restorePanel(m.id);
                  }}
                  onContextMenu={(e) => handleMinimizedRightClick(m.id, e)}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'touch') return;
                    if (isContextMenuOpen) return;
                    if (minimizedTooltipTimeoutRef.current) {
                      clearTimeout(minimizedTooltipTimeoutRef.current);
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const isInside = (
                      e.clientX >= rect.left &&
                      e.clientX <= rect.right &&
                      e.clientY >= rect.top &&
                      e.clientY <= rect.bottom
                    );
                    if (!isInside) return;
                    setHoveredMinimized({ id: m.id, rect, title: m.title, component: m.component });
                  }}
                  onPointerLeave={() => {
                    minimizedTooltipTimeoutRef.current = setTimeout(() => {
                      setHoveredMinimized(null);
                    }, 150);
                  }}
                  className="taskbar-glassmorphic-item"
                  style={{
                    backdropFilter: 'blur(6px)',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    scrollSnapAlign: 'start',
                    width: '38px',
                    height: '38px',
                    position: 'relative',
                    padding: 0
                  }}
                >
                  <span className="taskbar-item-icon">
                    {icon}
                  </span>
                </div>
              );
            })}
          </div>

          {hoveredMinimized && createPortal(
            <div
              className="taskbar-item-tooltip"
              dir={state.dir}
              style={{
                position: 'fixed',
                left: `${hoveredMinimized.rect.left + hoveredMinimized.rect.width / 2}px`,
                top: `${hoveredMinimized.rect.top - 8}px`,
                transform: 'translateX(-50%) translateY(-100%)',
                opacity: 1,
                pointerEvents: 'auto',
                zIndex: 999999
              }}
              onPointerEnter={() => {
                if (minimizedTooltipTimeoutRef.current) {
                  clearTimeout(minimizedTooltipTimeoutRef.current);
                }
              }}
              onPointerLeave={() => {
                setHoveredMinimized(null);
              }}
              onClick={() => {
                restorePanel(hoveredMinimized.id);
                setHoveredMinimized(null);
              }}
            >
               <div className="tooltip-header-row">
                  <span className="tooltip-title-text text-truncate" style={{ maxWidth: '140px' }}>
                    {formatLabel(hoveredMinimized.title, formatMessage)}
                    {state.panels[hoveredMinimized.id]?.dirty ? ' *' : ''}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRequestClose(hoveredMinimized.id);
                      setHoveredMinimized(null);
                    }}
                    title={formatLabel(messages.closePanel, formatMessage)}
                    className="tooltip-close-x"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </span>
               </div>
               <PreviewDOMWrapper panelId={hoveredMinimized.id} />
            </div>,
            document.body
          )}

          <button
            type="button"
            onClick={() => scrollTaskbar('right')}
            className="taskbar-nav-btn"
            style={{ display: state.minimized.length > 4 ? 'block' : 'none' }}
          >
            ▶
          </button>
        </div>
      )}

      {/* 3. Persistence Port: Portals rendering panels into off-screen elements */}
      {Object.keys(state.panels).map((id) => {
        const panel = state.panels[id];
        if (!panel) return null;
        const targetEl = getOrCreateDomCacheElement(id);
        return createPortal(
          <FormContainerProviderWrapper panelId={id}>
            <div style={{ width: '100%', height: '100%' }}>
              {renderPanelContent(id, panel.component, registry)}
            </div>
          </FormContainerProviderWrapper>,
          targetEl,
          id
        );
      })}

      {/* 4. Context Menu (replace-react-contexify JSON mode) */}
      <JsonContextMenu
        ref={contextMenuRef}
        id="workspace-context-menu"
        theme="dark"
        onShow={() => setIsContextMenuOpen(true)}
        onHide={() => setIsContextMenuOpen(false)}
      />

      {/* 5. Dragging Tab Ghost Representation */}
      {state.draggedPanelId !== null && !state.floating.some(w => w.id === state.draggedPanelId) && (
        <div
          className="drag-ghost-tab"
          style={{
            left: dragPos.x + 12,
            top: dragPos.y + 12,
            zIndex: 100000,
          }}
        >
          📄 {formatLabel(state.panels[state.draggedPanelId]?.title, formatMessage) || 'Tab'}
        </div>
      )}



    </div>
  );
};

export default WindowManager;
