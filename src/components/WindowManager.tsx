import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWindowManagerState, useWindowManagerActions, useFormatMessage, formatLabel, usePredefinedMessages, useStyleClasses } from './WindowManagerContext';
import type { LayoutNode, LayoutLeafNode } from './WindowManagerContext';
import { PanelRegistry } from './PanelRegistry';
import { JsonContextMenu, type JsonContextMenuRef } from 'replace-react-contexify';
import 'replace-react-contexify/styles.css';
import { FormContainerProvider } from './FormContainerContext';
import type { FormContainerContract } from './FormContainerContext';

// DOM Element Cache for preserving contexts (WebGL map, text area etc.)
const domCache = new Map<string, HTMLDivElement>();
const hiddenContainerId = 'preserved-dom-container';

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

const renderPanelContent = (id: string, componentKey: string) => {
  const registryEntry = PanelRegistry.get(componentKey);
  if (!registryEntry) {
    return (
      <div className="w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-dark text-danger font-monospace p-3 text-center" style={{ border: '2px dashed var(--bs-danger, #dc3545)' }}>
        <h6 className="fw-bold mb-1">⚠️ Component Unregistered</h6>
        <span className="small text-muted">Key: {componentKey}</span>
      </div>
    );
  }
  const Component = registryEntry.Component;
  return <Component panelId={id} />;
};

const PreservedDOMWrapper: React.FC<{ panelId: string }> = ({ panelId }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const cachedEl = getOrCreateDomCacheElement(panelId);
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
  }, [panelId]);

  return <div ref={hostRef} className="w-100 h-100" />;
};

const FormContainerProviderWrapper: React.FC<{ panelId: string; children: React.ReactNode }> = ({ panelId, children }) => {
  const { requestClosePanel, setPanelDirty, registerCloseGuard, unregisterCloseGuard, updatePanelTitle } = useWindowManagerActions();
  
  const contract = React.useMemo<FormContainerContract>(() => ({
    requestClose: (options) => requestClosePanel(panelId, options),
    setDirty: (dirty) => setPanelDirty(panelId, dirty),
    onCloseRequested: (handler) => {
      registerCloseGuard(panelId, handler);
      return () => unregisterCloseGuard(panelId);
    },
    setTitle: (title) => updatePanelTitle(panelId, title),
    instanceId: panelId
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
  activeDropZone: { leafId: string; position: 'left' | 'right' | 'top' | 'bottom' | 'center' } | null;
  onHoverDropZone: (leafId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center' | null) => void;
  onTabDragStart: (id: string, e: React.MouseEvent) => void;
  hoveredTab: { leafId: string; panelId: string; index: number; side: 'left' | 'right' } | null;
  onTabHover: (leafId: string, panelId: string, index: number, side: 'left' | 'right' | null) => void;
}

const WorkspaceGrid: React.FC<WorkspaceGridProps> = ({ node, path, onTabRightClick, activeDropZone, onHoverDropZone, onTabDragStart, hoveredTab, onTabHover }) => {
  const { updateSplitSizes } = useWindowManagerActions();

  if (node.type === 'leaf') {
    return <LeafGroup leaf={node} onTabRightClick={onTabRightClick} activeDropZone={activeDropZone} onHoverDropZone={onHoverDropZone} onTabDragStart={onTabDragStart} hoveredTab={hoveredTab} onTabHover={onTabHover} />;
  }

  const isRow = node.orientation === 'horizontal';

  const handleResizerMouseDown = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startOffset = isRow ? e.clientX : e.clientY;
    const startSizes = [...node.sizes];
    
    // Capture the parent element and its size synchronously on mousedown
    const parentEl = e.currentTarget.parentElement;
    const parentSize = parentEl 
      ? (isRow ? parentEl.clientWidth : parentEl.clientHeight) 
      : (isRow ? 1000 : 800);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentOffset = isRow ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentOffset - startOffset;

      const deltaPercentage = delta / parentSize;
      
      const newSizes = [...startSizes];
      newSizes[idx] += deltaPercentage;
      newSizes[idx + 1] -= deltaPercentage;

      // Restrict range bounds
      if (newSizes[idx] > 0.1 && newSizes[idx + 1] > 0.1) {
        updateSplitSizes(path, newSizes);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      className={`d-flex w-100 h-100 ${isRow ? 'flex-row' : 'flex-column'}`}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      {node.children.map((child, idx) => {
        const size = node.sizes[idx] * 100;
        return (
          <React.Fragment key={idx}>
            <div style={{ flexGrow: node.sizes[idx], flexBasis: `${size}%`, overflow: 'hidden', position: 'relative' }}>
              <WorkspaceGrid node={child} path={[...path, idx]} onTabRightClick={onTabRightClick} activeDropZone={activeDropZone} onHoverDropZone={onHoverDropZone} onTabDragStart={onTabDragStart} hoveredTab={hoveredTab} onTabHover={onTabHover} />
            </div>
            {idx < node.children.length - 1 && (
              <div 
                onMouseDown={(e) => handleResizerMouseDown(idx, e)}
                style={{
                  cursor: isRow ? 'col-resize' : 'row-resize',
                  width: isRow ? '6px' : '100%',
                  height: isRow ? '100%' : '6px',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  zIndex: 20,
                  transition: 'background-color 0.2s',
                }}
                className="resizer-bar hover-highlight"
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
  activeDropZone: { leafId: string; position: 'left' | 'right' | 'top' | 'bottom' | 'center' } | null;
  onHoverDropZone: (leafId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center' | null) => void;
  onTabDragStart: (id: string, e: React.MouseEvent) => void;
  hoveredTab: { leafId: string; panelId: string; index: number; side: 'left' | 'right' } | null;
  onTabHover: (leafId: string, panelId: string, index: number, side: 'left' | 'right' | null) => void;
}

const LeafGroup: React.FC<LeafGroupProps> = ({ leaf, onTabRightClick, activeDropZone, onHoverDropZone, onTabDragStart, hoveredTab, onTabHover }) => {
  const state = useWindowManagerState();
  const { requestClosePanel, openPanel, closeLeafGroup } = useWindowManagerActions();
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  const { windowClass, windowBodyClass } = useStyleClasses();

  const selectTab = (id: string) => {
    openPanel(id, state.panels[id].component);
  };

  return (
    <div className={`workspace-panel w-100 h-100 d-flex flex-column ${windowClass ?? ''}`} style={{ overflow: 'hidden', position: 'relative' }}>
      {/* Tab Headers */}
      <div className="workspace-tab-bar d-flex flex-row justify-content-between align-items-center" style={{ minHeight: '38px' }}>
        <div 
          className="d-flex flex-row overflow-x-auto flex-grow-1 tab-headers-container" 
          style={{ scrollbarWidth: 'none' }}
          onMouseMove={(e) => {
            if (state.draggedPanelId && e.target === e.currentTarget) {
              onTabHover(leaf.id, 'EMPTY', leaf.panels.length, 'right');
            }
          }}
          onMouseLeave={(e) => {
            if (state.draggedPanelId && e.target === e.currentTarget) {
              onTabHover(leaf.id, '', -1, null);
            }
          }}
        >
          {leaf.panels.map((id, idx) => {
            const panel = state.panels[id];
            if (!panel) return null;
            const isActive = leaf.activePanelId === id;
            
            const registryEntry = PanelRegistry.get(panel.component);
            const options = registryEntry?.defaultOptions;

            const isHovered = hoveredTab && hoveredTab.leafId === leaf.id && hoveredTab.panelId === id;
            const isLast = idx === leaf.panels.length - 1;
            const isHoveredEmpty = hoveredTab && hoveredTab.leafId === leaf.id && hoveredTab.panelId === 'EMPTY' && isLast;
            const sideClass = isHovered 
              ? (hoveredTab.side === 'left' ? 'drag-hover-left' : 'drag-hover-right') 
              : (isHoveredEmpty ? 'drag-hover-right' : '');

            return (
              <div 
                key={id}
                onClick={() => selectTab(id)}
                onMouseDown={(e) => {
                  if (options?.canDrag !== false) {
                    onTabDragStart(id, e);
                  }
                }}
                onContextMenu={(e) => onTabRightClick(id, e)}
                onMouseMove={(e) => {
                  if (state.draggedPanelId) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relativeX = e.clientX - rect.left;
                    const side = relativeX < rect.width / 2 ? 'left' : 'right';
                    onTabHover(leaf.id, id, idx, side);
                  }
                }}
                onMouseLeave={() => {
                  if (state.draggedPanelId) {
                    onTabHover(leaf.id, '', -1, null);
                  }
                }}
                className={`workspace-tab ${isActive ? 'active workspace-tab-active' : 'workspace-tab-inactive'} ${sideClass}`}
                style={{ cursor: options?.canDrag === false ? 'default' : 'pointer' }}
              >
                <span className="text-truncate" style={{ maxWidth: '120px' }}>
                  {formatLabel(panel.title, formatMessage)}
                  {panel.dirty ? ' *' : ''}
                </span>
                {options?.canClose !== false && (
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      requestClosePanel(id);
                    }}
                    title={formatLabel(messages.closeTab, formatMessage)}
                    className="close-tab-x ms-auto d-flex align-items-center justify-content-center"
                    style={{ width: '18px', height: '18px' }}
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
            className="close-tab-x d-flex align-items-center justify-content-center me-2 header-close-empty-group"
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
      <div className={`flex-grow-1 w-100 h-100 bg-dark ${windowBodyClass ?? ''}`} style={{ position: 'relative', overflow: 'hidden' }}>
        {leaf.activePanelId && state.panels[leaf.activePanelId] ? (
          <PreservedDOMWrapper key={leaf.activePanelId} panelId={leaf.activePanelId} />
        ) : (
          <div className="w-100 h-100 d-flex align-items-center justify-content-center font-monospace text-muted small empty-leaf-placeholder">
            <span>Empty Workspace Section</span>
          </div>
        )}

        {/* Drag overlay targets cross */}
        {state.draggedPanelId !== null && (
          <div className="dock-drop-zone-overlay">
            <div className="dock-target-cross">
              {/* Top target */}
              <div 
                onMouseEnter={() => onHoverDropZone(leaf.id, 'top')}
                onMouseLeave={() => onHoverDropZone(leaf.id, null)}
                className="dock-target-box dock-target-top"
              >
                ▲
              </div>
              {/* Bottom target */}
              <div 
                onMouseEnter={() => onHoverDropZone(leaf.id, 'bottom')}
                onMouseLeave={() => onHoverDropZone(leaf.id, null)}
                className="dock-target-box dock-target-bottom"
              >
                ▼
              </div>
              {/* Left target */}
              <div 
                onMouseEnter={() => onHoverDropZone(leaf.id, 'left')}
                onMouseLeave={() => onHoverDropZone(leaf.id, null)}
                className="dock-target-box dock-target-left"
              >
                ◀
              </div>
              {/* Right target */}
              <div 
                onMouseEnter={() => onHoverDropZone(leaf.id, 'right')}
                onMouseLeave={() => onHoverDropZone(leaf.id, null)}
                className="dock-target-box dock-target-right"
              >
                ▶
              </div>
              {/* Center target */}
              <div 
                onMouseEnter={() => onHoverDropZone(leaf.id, 'center')}
                onMouseLeave={() => onHoverDropZone(leaf.id, null)}
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

export const WindowManager: React.FC = () => {
  const state = useWindowManagerState();
  const { restorePanel, minimizePanel, requestClosePanel, resolvePendingClose, maximizePanel, updateFloatingPosition, bringToFront, dockPanel, floatPanel, setDraggedPanelId, dockPanelToGroup, movePanelOrder, dockPanelToWorkspaceEdge } = useWindowManagerActions();
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  const { windowClass, windowBodyClass } = useStyleClasses();
  const [instantiatedPanels, setInstantiatedPanels] = useState<string[]>([]);
  const taskbarRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<JsonContextMenuRef>(null);

  const [activeDropZone, setActiveDropZone] = useState<{ leafId: string; position: 'left' | 'right' | 'top' | 'bottom' | 'center' } | null>(null);
  const activeDropZoneRef = useRef<{ leafId: string; position: 'left' | 'right' | 'top' | 'bottom' | 'center' } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [activeEdgeDrop, setActiveEdgeDropState] = useState<'left' | 'right' | 'top' | 'bottom' | null>(null);
  const activeEdgeDropRef = useRef<'left' | 'right' | 'top' | 'bottom' | null>(null);
  const setActiveEdgeDrop = (val: 'left' | 'right' | 'top' | 'bottom' | null) => {
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

  const handleHoverDropZone = (leafId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center' | null) => {
    const val = position ? { leafId, position } : null;
    setActiveDropZone(val);
    activeDropZoneRef.current = val;
  };

  const handleTabDragStart = (id: string, e: React.MouseEvent) => {
    // Only handle left click drags
    if (e.button !== 0) return;
    
    const startX = e.clientX;
    const startY = e.clientY;
    let dragStarted = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      // Threshold trigger (5px)
      if (!dragStarted && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        dragStarted = true;
        setDraggedPanelId(id);
      }

      if (dragStarted) {
        setDragPos({ x: moveEvent.clientX, y: moveEvent.clientY });
      }
    };

    const handleMouseUp = (moveEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUpWrapper);
      
      if (dragStarted) {
        const dropZone = activeDropZoneRef.current;
        const targetTab = hoveredTabRef.current;
        const edgeDrop = activeEdgeDropRef.current;

        if (edgeDrop) {
          dockPanelToWorkspaceEdge(id, edgeDrop);
        } else if (targetTab) {
          let targetIndex = targetTab.index;
          if (targetTab.side === 'right') {
            targetIndex += 1;
          }
          movePanelOrder(id, targetTab.leafId, targetIndex);
        } else if (dropZone) {
          dockPanelToGroup(id, dropZone.leafId, dropZone.position);
        } else {
          // Float at dropped coordinates
          floatPanel(id, {
            x: moveEvent.clientX - 150,
            y: moveEvent.clientY - 15,
            width: 450,
            height: 350
          });
        }
        setDraggedPanelId(null);
        setActiveDropZone(null);
        activeDropZoneRef.current = null;
        setHoveredTab(null);
        hoveredTabRef.current = null;
        setActiveEdgeDrop(null);
      }
    };

    const handleMouseUpWrapper = (moveEvent: MouseEvent) => {
      handleMouseUp(moveEvent);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUpWrapper);
  };

  const handleTabRightClick = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const panel = state.panels[id];
    if (!panel) return;
    const registryEntry = PanelRegistry.get(panel.component);
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
        action: () => requestClosePanel(id)
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
            action: () => requestClosePanel(id)
          }
        ]
      }
    });
  };

  // Sync state.panels keys to dynamic DOM tree to mount components inside hidden Persistent Port
  useEffect(() => {
    const keys = Object.keys(state.panels);
    setInstantiatedPanels(keys);

    // Clean up domCache for panels that are no longer in state.panels
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

  // Floating Window dragging handler
  const startDrag = (id: string, e: React.MouseEvent) => {
    const floatingWin = state.floating.find(w => w.id === id);
    if (!floatingWin || floatingWin.maximized) return;
    bringToFront(id);
    setDraggedPanelId(id);

    const startX = e.clientX;
    const startY = e.clientY;
    const titlebarEl = e.currentTarget as HTMLDivElement;
    const windowEl = titlebarEl.closest('.floating-window') as HTMLDivElement | null;
    const startPosX = windowEl ? windowEl.offsetLeft : 0;
    const startPosY = windowEl ? windowEl.offsetTop : 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      updateFloatingPosition(id, {
        x: startPosX + dx,
        y: startPosY + dy
      });
    };

    const handleMouseUp = () => {
      const dropZone = activeDropZoneRef.current;
      const targetTab = hoveredTabRef.current;
      const edgeDrop = activeEdgeDropRef.current;

      if (edgeDrop) {
        dockPanelToWorkspaceEdge(id, edgeDrop);
      } else if (targetTab) {
        let targetIndex = targetTab.index;
        if (targetTab.side === 'right') {
          targetIndex += 1;
        }
        movePanelOrder(id, targetTab.leafId, targetIndex);
      } else if (dropZone) {
        dockPanelToGroup(id, dropZone.leafId, dropZone.position);
      }
      setDraggedPanelId(null);
      setActiveDropZone(null);
      activeDropZoneRef.current = null;
      setHoveredTab(null);
      hoveredTabRef.current = null;
      setActiveEdgeDrop(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Floating Window resizing handler
  const startResize = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const floatingWin = state.floating.find(w => w.id === id);
    if (!floatingWin || floatingWin.maximized) return;
    bringToFront(id);

    const startX = e.clientX;
    const startY = e.clientY;
    const handleEl = e.currentTarget as HTMLDivElement;
    const windowEl = handleEl.closest('.floating-window') as HTMLDivElement | null;
    const startW = windowEl ? windowEl.offsetWidth : 400;
    const startH = windowEl ? windowEl.offsetHeight : 300;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dw = moveEvent.clientX - startX;
      const dh = moveEvent.clientY - startY;
      updateFloatingPosition(id, {
        width: Math.max(200, startW + dw),
        height: Math.max(150, startH + dh)
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // horizontal scroll for minimized taskbar
  const scrollTaskbar = (direction: 'left' | 'right') => {
    if (taskbarRef.current) {
      const amount = direction === 'left' ? -150 : 150;
      taskbarRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  return (
    <div className={`window-manager-workspace w-100 h-100 d-flex flex-column overflow-hidden position-relative ${state.draggedPanelId ? 'dragging-active' : ''}`} style={{ userSelect: 'none' }}>
      
      {/* Workspace outer edge drop zone targets */}
      {state.draggedPanelId !== null && (
        <>
          <div 
            className="workspace-edge-trigger edge-trigger-left"
            onMouseEnter={() => setActiveEdgeDrop('left')}
            onMouseLeave={() => setActiveEdgeDrop(null)}
          />
          <div 
            className="workspace-edge-trigger edge-trigger-right"
            onMouseEnter={() => setActiveEdgeDrop('right')}
            onMouseLeave={() => setActiveEdgeDrop(null)}
          />
          <div 
            className="workspace-edge-trigger edge-trigger-top"
            onMouseEnter={() => setActiveEdgeDrop('top')}
            onMouseLeave={() => setActiveEdgeDrop(null)}
          />
          <div 
            className="workspace-edge-trigger edge-trigger-bottom"
            onMouseEnter={() => setActiveEdgeDrop('bottom')}
            onMouseLeave={() => setActiveEdgeDrop(null)}
          />
        </>
      )}

      {/* Edge drop visual preview overlay */}
      {state.draggedPanelId !== null && activeEdgeDrop !== null && (
        <div className={`workspace-edge-preview edge-preview-${activeEdgeDrop}`} />
      )}
      
      {/* 1. Viewport Split Grid Layout */}
      <div className="flex-grow-1 w-100" style={{ overflow: 'hidden', position: 'relative' }}>
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
          />
        ) : (
          <div className="w-100 h-100 d-flex align-items-center justify-content-center text-muted font-monospace small">
            Grid Empty
          </div>
        )}
      </div>

      {/* 2. Floating Windows Absolute Container Overlay */}
      {state.floating.map(w => {
        const panel = state.panels[w.id];
        if (!panel) return null;
        
        const isMaximized = w.maximized;
        const isDragged = state.draggedPanelId === w.id;

        const registryEntry = PanelRegistry.get(panel.component);
        const options = registryEntry?.defaultOptions;

        return (
          <div
            key={w.id}
            onMouseDown={() => bringToFront(w.id)}
            className={`floating-window ${isMaximized ? 'maximized' : ''} ${windowClass ?? ''}`}
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
              onMouseDown={(e) => {
                if (options?.canDrag !== false) {
                  startDrag(w.id, e);
                }
              }}
              className="floating-window-titlebar d-flex flex-row justify-content-between align-items-center cursor-move"
              style={{ cursor: isMaximized || options?.canDrag === false ? 'default' : 'move' }}
            >
              <span className="floating-window-title text-truncate me-2">
                {formatLabel(panel.title, formatMessage)}
                {panel.dirty ? ' *' : ''}
              </span>
              <div className="d-flex align-items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
                {options?.canDrag !== false && (
                  <button 
                    type="button" 
                    title={formatLabel(messages.dockWindow, formatMessage)}
                    onClick={() => dockPanel(w.id)}
                    className="custom-tab-btn"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <path d="M9 3v18M3 9h18"/>
                    </svg>
                  </button>
                )}
                {options?.canMinimize !== false && (
                  <button 
                    type="button" 
                    title={formatLabel(messages.minimize, formatMessage)}
                    onClick={() => minimizePanel(w.id)}
                    className="custom-tab-btn"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 12h14"/>
                    </svg>
                  </button>
                )}
                <button 
                  type="button" 
                  title={isMaximized
                    ? formatLabel(messages.restoreSize, formatMessage)
                    : formatLabel(messages.maximize, formatMessage)}
                  onClick={() => maximizePanel(w.id)}
                  className="custom-tab-btn"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="4" y="4" width="16" height="16" rx="1.5"/>
                  </svg>
                </button>
                {options?.canClose !== false && (
                  <button 
                    type="button" 
                    title={formatLabel(messages.close, formatMessage)}
                    onClick={() => requestClosePanel(w.id)}
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
            <div className={`flex-grow-1 w-100 overflow-hidden ${windowBodyClass ?? ''}`} style={{ position: 'relative' }}>
              <PreservedDOMWrapper key={w.id} panelId={w.id} />
            </div>

            {/* Resize Handle */}
            {!isMaximized && (
              <div
                onMouseDown={(e) => startResize(w.id, e)}
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: '14px',
                  height: '14px',
                  cursor: 'se-resize',
                  zIndex: 30,
                  background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.2) 50%)'
                }}
              />
            )}
          </div>
        );
      })}

      {/* 3. macOS / Windows 11-style Taskbar at the bottom */}
      {state.minimized.length > 0 && (
        <div className="d-flex flex-row align-items-center bg-black bg-opacity-75 border-top border-secondary border-opacity-30 px-3 py-1.5 justify-content-center" style={{ height: '48px', zIndex: 100 }}>
          <button 
            type="button" 
            onClick={() => scrollTaskbar('left')}
            className="btn btn-sm btn-link text-white-50 text-decoration-none py-0 font-monospace"
            style={{ display: state.minimized.length > 5 ? 'block' : 'none' }}
          >
            ◀
          </button>
          
          <div 
            ref={taskbarRef}
            className="d-flex flex-row gap-2 overflow-x-auto align-items-center justify-content-center mx-2 px-1 py-0.5 scrollbar-hidden"
            style={{
              maxWidth: '600px',
              scrollbarWidth: 'none',
              scrollSnapType: 'x mandatory'
            }}
          >
            {state.minimized.map(m => (
              <div
                key={m.id}
                onClick={() => restorePanel(m.id)}
                onContextMenu={(e) => handleMinimizedRightClick(m.id, e)}
                className="taskbar-glassmorphic-item px-3 py-1 text-info rounded border border-info border-opacity-20 d-flex align-items-center gap-2 cursor-pointer font-monospace small hover-elevate"
                style={{
                  backgroundColor: 'rgba(0, 240, 255, 0.08)',
                  backdropFilter: 'blur(6px)',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  scrollSnapAlign: 'start',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>🔳</span>
                <span className="text-truncate" style={{ maxWidth: '120px' }}>
                  {formatLabel(m.title, formatMessage)}
                  {state.panels[m.id]?.dirty ? ' *' : ''}
                </span>
                <span 
                  onClick={(e) => {
                    e.stopPropagation();
                    requestClosePanel(m.id);
                  }}
                  title={formatLabel(messages.closePanel, formatMessage)}
                  className="close-tab-x d-flex align-items-center justify-content-center"
                  style={{ width: '18px', height: '18px' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </span>
              </div>
            ))}
          </div>

          <button 
            type="button" 
            onClick={() => scrollTaskbar('right')}
            className="btn btn-sm btn-link text-white-50 text-decoration-none py-0 font-monospace"
            style={{ display: state.minimized.length > 5 ? 'block' : 'none' }}
          >
            ▶
          </button>
        </div>
      )}

      {/* 4. Persistence Port: Portals rendering panels into off-screen elements */}
      {instantiatedPanels.map((id) => {
        const panel = state.panels[id];
        if (!panel) return null;
        const targetEl = getOrCreateDomCacheElement(id);
        return createPortal(
          <FormContainerProviderWrapper panelId={id}>
            <div style={{ width: '100%', height: '100%' }}>
              {renderPanelContent(id, panel.component)}
            </div>
          </FormContainerProviderWrapper>,
          targetEl,
          id
        );
      })}

      {/* 5. Context Menu (replace-react-contexify JSON mode) */}
      <JsonContextMenu ref={contextMenuRef} id="workspace-context-menu" theme="dark" />

      {/* 6. Dragging Tab Ghost Representation */}
      {state.draggedPanelId !== null && !state.floating.some(w => w.id === state.draggedPanelId) && (
        <div 
          className="position-fixed bg-black bg-opacity-80 border border-info rounded text-info font-monospace px-3 py-1.5 shadow-lg d-flex align-items-center gap-2"
          style={{
            left: dragPos.x + 12,
            top: dragPos.y + 12,
            zIndex: 100000,
            pointerEvents: 'none',
            fontSize: '0.75rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            borderLeft: '3px solid var(--accent-color)',
            whiteSpace: 'nowrap'
          }}
        >
          📄 {formatLabel(state.panels[state.draggedPanelId]?.title, formatMessage) || 'Tab'}
        </div>
      )}

      {/* 7. Dirty warning dialog overlay */}
      {state.pendingClose && (() => {
        const pendingPanel = state.panels[state.pendingClose.id];
        const panelTitle = pendingPanel ? formatLabel(pendingPanel.title, formatMessage) : 'Panel';
        return (
          <div className="close-warning-overlay">
            <div className="close-warning-modal">
              <div className="close-warning-header">
                <div className="close-warning-icon">⚠️</div>
                <h5 className="close-warning-title">Unsaved Changes</h5>
              </div>
              <p className="close-warning-message">
                "{panelTitle}" has unsaved changes. Do you want to discard your changes and close the panel?
              </p>
              <div className="close-warning-footer">
                <button
                  type="button"
                  className="btn-warning-action btn-warning-cancel"
                  onClick={() => resolvePendingClose(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-warning-action btn-warning-discard"
                  onClick={() => resolvePendingClose(true)}
                >
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      
    </div>
  );
};

export default WindowManager;
