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

const renderPanelContent = (id: string, componentKey: string) => {
  const registryEntry = PanelRegistry.get(componentKey);
  if (!registryEntry) {
    return (
      <div className="w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-transparent text-danger font-monospace p-3 text-center" style={{ border: '2px dashed var(--bs-danger, #dc3545)' }}>
        <h6 className="fw-bold mb-1">⚠️ Component Unregistered</h6>
        <span className="small text-muted">Key: {componentKey}</span>
      </div>
    );
  }
  const Component = registryEntry.Component;
  return <Component panelId={id} />;
};

const activePanelDimensions = new Map<string, { width: number; height: number }>();

const panelLifecycleRegistry = new Map<string, {
  onClose: Set<() => void>;
  onMinimize: Set<() => void>;
  onRestore: Set<() => void>;
  onResize: Set<(w: number, h: number) => void>;
}>();

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

  return <div ref={hostRef} className="w-100 h-100" />;
};

const PreviewDOMWrapper: React.FC<{ panelId: string }> = ({ panelId }) => {
  const state = useWindowManagerState();
  const hostRef = useRef<HTMLDivElement | null>(null);
  
  const panel = state.panels[panelId];
  const regEntry = panel ? PanelRegistry.get(panel.component) : null;
  const disableLivePreview = regEntry?.defaultOptions?.disableLivePreview || false;

  const [dimensions, setDimensions] = useState({ width: 800, height: 500, scale: 0.25 });

  useEffect(() => {
    if (disableLivePreview) return;

    const host = hostRef.current;
    if (!host) return;

    const cachedEl = domCache.get(panelId);
    if (!cachedEl) return;

    // 1. Read the panel's active dimensions before minimization
    const lastSize = activePanelDimensions.get(panelId) || { width: 800, height: 500 };
    const origW = lastSize.width;
    const origH = lastSize.height;

    // 2. Calculate scale factor to fit within a 220px x 140px thumbnail container
    const maxW = 220;
    const maxH = 140;
    const scale = Math.min(maxW / origW, maxH / origH);

    setDimensions({ width: origW, height: origH, scale });

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
    const lastSize = activePanelDimensions.get(panelId) || { width: 800, height: 500 };
    const maxW = 220;
    const maxH = 140;
    const scale = Math.min(maxW / lastSize.width, maxH / lastSize.height);
    const displayW = lastSize.width * scale;
    const displayH = lastSize.height * scale;

    const icon = regEntry?.defaultOptions?.icon || <span>🔳</span>;

    return (
      <div 
        className="taskbar-item-preview-frame d-flex flex-column align-items-center justify-content-center text-muted"
        style={{
          width: `${displayW}px`,
          height: `${displayH}px`,
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px dashed var(--taskbar-item-border, rgba(255, 255, 255, 0.15))'
        }}
      >
        <div className="taskbar-preview-placeholder-icon mb-1.5" style={{ transform: 'scale(1.2)', filter: 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.4))' }}>
          {icon}
        </div>
        <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.5px', opacity: 0.7, textTransform: 'uppercase' }}>
          Active Session
        </div>
      </div>
    );
  }

  return (
    <div 
      className="taskbar-item-preview-frame"
      style={{
        width: `${dimensions.width * dimensions.scale}px`,
        height: `${dimensions.height * dimensions.scale}px`,
      }}
    >
      <div 
        ref={hostRef} 
        className="taskbar-item-preview-host"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          transform: `scale(${dimensions.scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0
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
  activeDropZone: { leafId: string; position: 'left' | 'right' | 'top' | 'bottom' | 'center' } | null;
  onHoverDropZone: (leafId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center' | null) => void;
  onTabDragStart: (id: string, e: React.MouseEvent) => void;
  hoveredTab: { leafId: string; panelId: string; index: number; side: 'left' | 'right' } | null;
  onTabHover: (leafId: string, panelId: string, index: number, side: 'left' | 'right' | null) => void;
  defaultPanelIcon?: React.ReactNode;
}

const WorkspaceGrid: React.FC<WorkspaceGridProps> = ({ node, path, onTabRightClick, activeDropZone, onHoverDropZone, onTabDragStart, hoveredTab, onTabHover, defaultPanelIcon }) => {
  const { updateSplitSizes } = useWindowManagerActions();

  if (node.type === 'leaf') {
    return <LeafGroup leaf={node} onTabRightClick={onTabRightClick} activeDropZone={activeDropZone} onHoverDropZone={onHoverDropZone} onTabDragStart={onTabDragStart} hoveredTab={hoveredTab} onTabHover={onTabHover} defaultPanelIcon={defaultPanelIcon} />;
  }

  const isRow = node.orientation === 'horizontal';

  const handleResizerMouseDown = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startOffset = isRow ? e.clientX : e.clientY;
    const startSizes = [...node.sizes];
    
    // Add active classes directly for zero-latency DOM responsiveness during drag
    const resizerEl = e.currentTarget as HTMLDivElement;
    resizerEl.classList.add('active');
    document.body.classList.add('resizing-active', isRow ? 'resizing-row-active' : 'resizing-col-active');

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
      resizerEl.classList.remove('active');
      document.body.classList.remove('resizing-active', 'resizing-row-active', 'resizing-col-active');
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
              <WorkspaceGrid node={child} path={[...path, idx]} onTabRightClick={onTabRightClick} activeDropZone={activeDropZone} onHoverDropZone={onHoverDropZone} onTabDragStart={onTabDragStart} hoveredTab={hoveredTab} onTabHover={onTabHover} defaultPanelIcon={defaultPanelIcon} />
            </div>
            {idx < node.children.length - 1 && (
              <div 
                onMouseDown={(e) => handleResizerMouseDown(idx, e)}
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
  activeDropZone: { leafId: string; position: 'left' | 'right' | 'top' | 'bottom' | 'center' } | null;
  onHoverDropZone: (leafId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center' | null) => void;
  onTabDragStart: (id: string, e: React.MouseEvent) => void;
  hoveredTab: { leafId: string; panelId: string; index: number; side: 'left' | 'right' } | null;
  onTabHover: (leafId: string, panelId: string, index: number, side: 'left' | 'right' | null) => void;
  defaultPanelIcon?: React.ReactNode;
}

const LeafGroup: React.FC<LeafGroupProps> = ({ leaf, onTabRightClick, activeDropZone, onHoverDropZone, onTabDragStart, hoveredTab, onTabHover, defaultPanelIcon }) => {
  const state = useWindowManagerState();
  const { requestClosePanel, openPanel, closeLeafGroup, setActivePanel } = useWindowManagerActions();
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
      className={`workspace-panel w-100 h-100 d-flex flex-column ${windowClass ?? ''}`} 
      style={{ overflow: 'hidden', position: 'relative' }}
    >
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
            const isSelected = leaf.activePanelId === id;
            const isGloballyActive = state.activePanelId === id;
            
            const registryEntry = PanelRegistry.get(panel.component);
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
                className={`workspace-tab ${tabFocusClass} ${sideClass}`}
                style={{ cursor: options?.canDrag === false ? 'default' : 'pointer' }}
              >
                <span className="text-truncate d-flex align-items-center" style={{ maxWidth: '120px' }}>
                  <span className="workspace-tab-icon">{options?.icon || defaultPanelIcon || DefaultGridIcon}</span>
                  <span>
                    {formatLabel(panel.title, formatMessage)}
                    {panel.dirty ? ' *' : ''}
                  </span>
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
      <div className={`flex-grow-1 w-100 h-100 bg-transparent ${windowBodyClass ?? ''}`} style={{ position: 'relative', overflow: 'hidden' }}>
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

export interface WindowManagerProps {
  skin?: string;
  defaultPanelIcon?: React.ReactNode;
}

export const WindowManager: React.FC<WindowManagerProps> = ({ skin = 'vscode', defaultPanelIcon }) => {
  const state = useWindowManagerState();
  const { restorePanel, minimizePanel, requestClosePanel, resolvePendingClose, maximizePanel, updateFloatingPosition, bringToFront, floatPanel, setDraggedPanelId, dockPanelToGroup, movePanelOrder, dockPanelToWorkspaceEdge, setActivePanel } = useWindowManagerActions();
  const formatMessage = useFormatMessage();
  const messages = usePredefinedMessages();
  const { windowClass, windowBodyClass } = useStyleClasses();
  const [instantiatedPanels, setInstantiatedPanels] = useState<string[]>([]);
  const taskbarRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<JsonContextMenuRef>(null);

  const [hoveredMinimized, setHoveredMinimized] = useState<{ id: string; rect: DOMRect; title: string | any; component: string } | null>(null);
  const minimizedTooltipTimeoutRef = useRef<any>(null);
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

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 1024, height: 768 });

  // Dynamically observe the workspace container bounds (accounts for sidebar expanding/collapsing and taskbar showing/hiding)
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const rect = entries[0].contentRect;
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

  // Global Window Focus Event Delegation (Left-click anywhere inside a window or grid panel focuses it)
  useEffect(() => {
    const handleMouseDownGlobal = (e: MouseEvent) => {
      // Only handle left clicks (button === 0)
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 1. Check if click is inside a floating window
      const windowEl = target.closest('.floating-window') as HTMLElement | null;
      if (windowEl) {
        const winId = windowEl.getAttribute('data-window-id');
        if (winId) {
          setActivePanel(winId);
          bringToFront(winId);
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

    document.addEventListener('mousedown', handleMouseDownGlobal);
    return () => {
      document.removeEventListener('mousedown', handleMouseDownGlobal);
    };
  }, [bringToFront, setActivePanel]);

  // Floating Window dragging handler
  const startDrag = (id: string, e: React.MouseEvent) => {
    const floatingWin = state.floating.find(w => w.id === id);
    if (!floatingWin || floatingWin.maximized) return;
    bringToFront(id);

    const startX = e.clientX;
    const startY = e.clientY;
    const titlebarEl = e.currentTarget as HTMLDivElement;
    const windowEl = titlebarEl.closest('.floating-window') as HTMLDivElement | null;
    const startPosX = windowEl ? windowEl.offsetLeft : 0;
    const startPosY = windowEl ? windowEl.offsetTop : 0;
    let dragStarted = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (!dragStarted && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        dragStarted = true;
        setDraggedPanelId(id);
      }

      if (dragStarted) {
        const newX = startPosX + dx;
        const newY = startPosY + dy;

        // Dragging clears all sticky anchoring
        updateFloatingPosition(id, {
          x: newX,
          y: newY,
          stickyRight: false,
          stickyBottom: false
        });
      }
    };

    const handleMouseUp = () => {
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
        }
        setDraggedPanelId(null);
        setActiveDropZone(null);
        activeDropZoneRef.current = null;
        setHoveredTab(null);
        hoveredTabRef.current = null;
        setActiveEdgeDrop(null);
      }
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

      let newWidth = Math.max(200, startW + dw);
      let newHeight = Math.max(150, startH + dh);

      let newX = floatingWin.x;
      let newY = floatingWin.y;

      const viewW = workspaceSize.width;
      const viewH = workspaceSize.height;

      const parsedX = typeof floatingWin.x === 'string' ? parseFloat(floatingWin.x) : floatingWin.x;
      const parsedY = typeof floatingWin.y === 'string' ? parseFloat(floatingWin.y) : floatingWin.y;
      const parsedW = typeof floatingWin.width === 'string' ? parseFloat(floatingWin.width) : floatingWin.width;
      const parsedH = typeof floatingWin.height === 'string' ? parseFloat(floatingWin.height) : floatingWin.height;

      const isRightSnapped = Math.abs(parsedX + parsedW - viewW) < 4;
      const isBottomSnapped = Math.abs(parsedY + parsedH - viewH) < 4;

      if (isRightSnapped) {
        newX = viewW - newWidth;
        if (newX < 0) {
          newX = 0;
          newWidth = viewW;
        }
      }

      if (isBottomSnapped) {
        newY = viewH - newHeight;
        if (newY < 0) {
          newY = 0;
          newHeight = viewH;
        }
      }

      updateFloatingPosition(id, {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
        stickyRight: isRightSnapped,
        stickyBottom: isBottomSnapped
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

  // Fetch the active bs-theme from documentElement to make sure nested variables resolve correctly
  const [currentBsTheme, setCurrentBsTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const updateThemeState = () => {
      const activeTheme = document.documentElement.getAttribute('data-bs-theme') === 'light' ? 'light' : 'dark';
      setCurrentBsTheme(activeTheme);
    };
    updateThemeState();
    const obs = new MutationObserver(updateThemeState);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
    return () => obs.disconnect();
  }, []);

  return (
    <div 
      data-workspace-skin={skin}
      data-bs-theme={currentBsTheme}
      className="d-flex flex-column w-100 h-100 overflow-hidden" 
      style={{ userSelect: 'none' }}
    >
      
      {/* 1. Main Workspace Viewport (Grids & Floating Panels) */}
      <div 
        ref={workspaceRef} 
        className={`flex-grow-1 w-100 position-relative ${state.draggedPanelId ? 'dragging-active' : ''}`}
        style={{ overflow: 'hidden' }}
      >
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
        
        {/* 1.1 Viewport Split Grid Layout */}
        <div className="w-100 h-100" style={{ overflow: 'hidden', position: 'relative' }}>
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
            />
          ) : (
            <div className="w-100 h-100 d-flex align-items-center justify-content-center text-muted font-monospace small">
              Grid Empty
            </div>
          )}
        </div>

        {/* 1.2 Floating Windows Absolute Container Overlay */}
        {(() => {
          const maxZ = state.floating.length > 0 ? Math.max(...state.floating.map(w => w.z)) : 0;
          return state.floating.map(w => {
            const panel = state.panels[w.id];
            if (!panel) return null;
            
            const isMaximized = w.maximized;
            const isDragged = state.draggedPanelId === w.id;
            const isFocused = state.activePanelId === w.id;

            const registryEntry = PanelRegistry.get(panel.component);
            const options = registryEntry?.defaultOptions;

            return (
              <div
                key={w.id}
                data-window-id={w.id}
                onMouseDownCapture={() => {
                  setActivePanel(w.id);
                  bringToFront(w.id);
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
                  onMouseDown={(e) => {
                    if (options?.canDrag !== false) {
                      startDrag(w.id, e);
                    }
                  }}
                  className="floating-window-titlebar d-flex flex-row justify-content-between align-items-center cursor-move"
                  style={{ cursor: isMaximized || options?.canDrag === false ? 'default' : 'move' }}
                >
                  <span className="floating-window-title text-truncate me-2 d-flex align-items-center">
                    <span className="window-title-icon">{options?.icon || defaultPanelIcon || DefaultGridIcon}</span>
                    <span>
                      {formatLabel(panel.title, formatMessage)}
                      {panel.dirty ? ' *' : ''}
                    </span>
                  </span>
                  <div className="d-flex align-items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
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
          });
        })()}
      </div>

      {/* 2. macOS / Windows 11-style Taskbar Sibling Footer (Flex-shrinked at bottom) */}
      {state.minimized.length > 0 && (
        <div className="flex-shrink-0 w-100 d-flex flex-row align-items-center taskbar-footer-container px-3 py-1.5 justify-content-center" style={{ height: '48px', zIndex: 100 }}>
          <button 
            type="button" 
            onClick={() => scrollTaskbar('left')}
            className="btn btn-sm btn-link taskbar-nav-btn text-decoration-none py-0 font-monospace"
            style={{ display: state.minimized.length > 4 ? 'block' : 'none' }}
          >
            ◀
          </button>
          
          <div 
            ref={taskbarRef}
            className="d-flex flex-row gap-2 overflow-x-auto align-items-center mx-2 px-1 py-0.5 scrollbar-hidden"
            style={{
              maxWidth: '800px',
              scrollbarWidth: 'none',
              scrollSnapType: 'x mandatory'
            }}
          >
            {state.minimized.map(m => {
              const regEntry = PanelRegistry.get(m.component);
              const icon = regEntry?.defaultOptions?.icon || defaultPanelIcon || DefaultGridIcon;

              return (
                <div
                  key={m.id}
                  onClick={() => {
                    setHoveredMinimized(null);
                    restorePanel(m.id);
                  }}
                  onContextMenu={(e) => handleMinimizedRightClick(m.id, e)}
                  onMouseEnter={(e) => {
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
                  onMouseLeave={() => {
                    minimizedTooltipTimeoutRef.current = setTimeout(() => {
                      setHoveredMinimized(null);
                    }, 150);
                  }}
                  className="taskbar-glassmorphic-item rounded d-flex align-items-center justify-content-center cursor-pointer hover-elevate"
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
                  <span className="taskbar-item-icon d-flex align-items-center justify-content-center">
                    {icon}
                  </span>
                </div>
              );
            })}
          </div>

          {hoveredMinimized && createPortal(
            <div 
              className="taskbar-item-tooltip d-flex flex-column gap-1"
              style={{
                position: 'fixed',
                left: `${hoveredMinimized.rect.left + hoveredMinimized.rect.width / 2}px`,
                top: `${hoveredMinimized.rect.top - 8}px`,
                transform: 'translateX(-50%) translateY(-100%)',
                opacity: 1,
                pointerEvents: 'auto',
                zIndex: 999999
              }}
              onMouseEnter={() => {
                if (minimizedTooltipTimeoutRef.current) {
                  clearTimeout(minimizedTooltipTimeoutRef.current);
                }
              }}
              onMouseLeave={() => {
                setHoveredMinimized(null);
              }}
              onClick={() => {
                restorePanel(hoveredMinimized.id);
                setHoveredMinimized(null);
              }}
            >
               <div className="d-flex flex-row align-items-center justify-content-between w-100 gap-3 px-1 py-0.5">
                  <span className="tooltip-title-text text-truncate" style={{ maxWidth: '140px' }}>
                    {formatLabel(hoveredMinimized.title, formatMessage)}
                    {state.panels[hoveredMinimized.id]?.dirty ? ' *' : ''}
                  </span>
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      requestClosePanel(hoveredMinimized.id);
                      setHoveredMinimized(null);
                    }}
                    title={formatLabel(messages.closePanel, formatMessage)}
                    className="tooltip-close-x d-flex align-items-center justify-content-center"
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
            className="btn btn-sm btn-link taskbar-nav-btn text-decoration-none py-0 font-monospace"
            style={{ display: state.minimized.length > 4 ? 'block' : 'none' }}
          >
            ▶
          </button>
        </div>
      )}

      {/* 3. Persistence Port: Portals rendering panels into off-screen elements */}
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

      {/* 6. Dirty warning dialog overlay */}
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
