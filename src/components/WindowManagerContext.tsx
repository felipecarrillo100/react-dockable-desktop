import React, { createContext, useContext, useState, useRef, useMemo, useCallback } from 'react';
import { PanelRegistry } from './PanelRegistry';
import { defaultPredefinedMessages } from './predefinedMessages';
import type { PredefinedMessageKey } from './predefinedMessages';
export type { PredefinedMessageKey } from './predefinedMessages';
export { defaultPredefinedMessages } from './predefinedMessages';

/**
 * Structure representing localizable message descriptors used in context menus.
 */
export interface ContextMenuPredefinedMessage {
  /** Translation dictionary key. */
  id: string;
  /** Fallback label text if translation key is missing. */
  defaultMessage?: string;
  /** Values injected into the translated text placeholder. */
  values?: Record<string, string | number>;
}

/** Function type interface responsible for resolving localizable messages to flat strings. */
export type MessageFormatter = (msg: ContextMenuPredefinedMessage) => string;

/** Orientation modifier indicating split directions. */
export type SplitOrientation = 'horizontal' | 'vertical';

/**
 * Grid layout branch node containing nested splits and relative flex sizes.
 */
export interface LayoutGridNode {
  type: 'branch';
  /** Split orientation orientation indicator. */
  orientation: SplitOrientation;
  /** Children branches or leaf panels. */
  children: LayoutNode[];
  /** Relative percentage sizes of each child layout block. */
  sizes: number[];
}

/**
 * Grid layout leaf node containing active tab groups and panel arrays.
 */
export interface LayoutLeafNode {
  type: 'leaf';
  /** Unique leaf identifier. */
  id: string;
  /** Array of panel IDs mounted inside this group. */
  panels: string[];
  /** The currently active panel tab ID. */
  activePanelId: string | null;
  /** If false, close menu buttons are disabled for this group's tabs. */
  canClose?: boolean;
  /** When true, the group persists in the layout even after its last panel is closed. */
  keepOnEmpty?: boolean;
}

/** Union type representing either a branch or a leaf node in the layout grid. */
export type LayoutNode = LayoutGridNode | LayoutLeafNode;

/**
 * Bounds and depth metadata for floated panel windows.
 */
export interface FloatingWindow {
  /** Unique ID of the floating window. */
  id: string;
  /** CSS left position offset (supports number/px or percentage strings). */
  x: number | string;
  /** CSS top position offset. */
  y: number | string;
  /** CSS width value. */
  width: number | string;
  /** CSS height value. */
  height: number | string;
  /** Rendering depth stack index layer. */
  z: number;
  /** True if the window is currently maximized to full workspace bounds. */
  maximized?: boolean;
  /** Sticky right flag. */
  stickyRight?: boolean;
  /** Sticky bottom flag. */
  stickyBottom?: boolean;
}

/**
 * Stores active runtime properties and status metadata for individual panel instances.
 */
export interface PanelInfo {
  /** Unique panel identifier. */
  id: string;
  /** Plain text label or localizable message descriptor. */
  title: string | ContextMenuPredefinedMessage;
  /** String matching the component registration ID in the {@link PanelRegistry}. */
  component: string;
  /** Current workspace placement mode. */
  state: 'docked' | 'floating' | 'minimized';
  /** Last state held before panel was minimized. */
  previousState?: 'docked' | 'floating';
  /** Saved position boundaries used when returning the panel to a floating state. */
  lastFloatingRect?: { x: number; y: number; width: number; height: number; stickyRight?: boolean; stickyBottom?: boolean };
  /** The leaf group ID this panel was docked in prior to being floated. */
  lastLeafId?: string;
  /** True if the panel contains unsaved user edits. */
  dirty?: boolean;
}

/**
 * Global window manager state tree representing grid nodes, windows, and panels.
 */
export interface WindowState {
  /** Root branch node representing the grid. */
  gridRoot: LayoutNode;
  /** Array of active floated windows. */
  floating: FloatingWindow[];
  /** Array of minimized panels waiting in the taskbar dock. */
  minimized: { id: string; title: string | ContextMenuPredefinedMessage; component: string }[];
  /** Map indexing panel metadata descriptors. */
  panels: Record<string, PanelInfo>;
  /** The ID of the panel tab currently being dragged. */
  draggedPanelId: string | null;
  /** Close execution warning intercept status container, or null. */
  pendingClose: { id: string; resolve: (discard: boolean) => void } | null;
  /** The ID of the active/focused panel. */
  activePanelId: string | null;
}

/**
 * Interface mapping layout actions, event bus handles, and serialization methods.
 */
export interface WindowActions {
  /** Instantiates a registered panel into the workspace. */
  openPanel: (id: string, component: string, options?: { title?: string | ContextMenuPredefinedMessage; initialTarget?: 'floating' | 'docked' | 'tabbed'; stickyRight?: boolean; stickyBottom?: boolean }) => void;
  /** Directly closes a panel by ID, bypassing close confirmation dialogs. */
  closePanel: (id: string) => void;
  /** Minimizes a panel to the bottom taskbar, saving its current layout positioning. */
  minimizePanel: (id: string) => void;
  /** Restores a minimized panel back to its previous position in the grid or as a float. */
  restorePanel: (id: string) => void;
  /** Detaches a docked panel, turning it into a floating resizable window. */
  floatPanel: (id: string, rect?: { x: number; y: number; width: number; height: number }) => void;
  /** Returns a floating window back to a docked grid tab group. */
  dockPanel: (id: string, targetLeafId?: string) => void;
  /** Maximizes a floating window to cover the entire layout screen boundaries. */
  maximizePanel: (id: string) => void;
  /** Resizes flex dimensions of children inside split layout rows/columns. */
  updateSplitSizes: (path: number[], sizes: number[]) => void;
  /** Updates bounds or positioning attributes on a floating window. */
  updateFloatingPosition: (id: string, updates: Partial<Pick<FloatingWindow, 'x' | 'y' | 'width' | 'height' | 'stickyRight' | 'stickyBottom'>>) => void;
  /** Pushes a floating window z-index layer to render on top of others. */
  bringToFront: (id: string) => void;
  /** Serializes the active grid node structures and panel targets to JSON. */
  saveLayout: () => string;
  /** Rebuilds the grid layouts and floating window placements from a JSON string. */
  loadLayout: (layoutJson: string) => void;
  /** Publishes an event to the global inter-panel message bus. */
  publish: (event: string, data: any) => void;
  /** Subscribes callback listeners to inter-panel event messages. */
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  /** Stores reference to the active tab ID being dragged. */
  setDraggedPanelId: (id: string | null) => void;
  /** Splits an existing tab group to dock a dragged panel next to it. */
  dockPanelToGroup: (id: string, targetLeafId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center') => void;
  /** Reorders tab indices inside a docked leaf group. */
  movePanelOrder: (panelId: string, targetLeafId: string, targetIndex: number) => void;
  /** Closes an empty split group. */
  closeLeafGroup: (leafId: string) => void;
  /** Binds a close intercept confirmation guard. */
  registerCloseGuard: (id: string, guard: () => boolean | Promise<boolean>) => void;
  /** Removes close confirmation guards. */
  unregisterCloseGuard: (id: string) => void;
  /** Set panel dirty state flag. */
  setPanelDirty: (id: string, dirty: boolean) => void;
  /** Change title header. */
  updatePanelTitle: (id: string, title: string | ContextMenuPredefinedMessage) => void;
  /** Intercepts close panel requests, prompting warning dialogs if dirty. */
  requestClosePanel: (id: string, options?: { force?: boolean }) => Promise<void>;
  /** Dispatches decision choice when discarding or cancelling close events. */
  resolvePendingClose: (discard: boolean) => void;
  /** Docks a panel directly to workspace edges. */
  dockPanelToWorkspaceEdge: (id: string, position: 'left' | 'right' | 'top' | 'bottom') => void;
  /** Update active focused tab reference. */
  setActivePanel: (id: string | null) => void;
}

const WindowStateContext = createContext<WindowState | null>(null);
const WindowActionsContext = createContext<WindowActions | null>(null);
const WindowI18nContext = createContext<MessageFormatter | null>(null);

const WindowPredefinedMessagesContext = createContext<Record<PredefinedMessageKey, ContextMenuPredefinedMessage>>(defaultPredefinedMessages);

/** Represents custom CSS classes injected into layout parts. */
export interface StyleClasses {
  modalClass?: string;
  modalBodyClass?: string;
  sidePanelClass?: string;
  sidePanelBodyClass?: string;
  windowClass?: string;
  windowBodyClass?: string;
}

const StyleClassContext = createContext<StyleClasses>({});

/** Custom hook to read configured style class contexts. */
export const useStyleClasses = () => useContext(StyleClassContext);

// Event Bus class for pub-sub communication between panels
class PanelEventBus {
  private listeners: Record<string, ((data: any) => void)[]> = {};

  subscribe(event: string, callback: (data: any) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  publish(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}

const initialLayout: LayoutNode = {
  type: 'branch',
  orientation: 'vertical',
  sizes: [0.75, 0.25],
  children: [
    {
      type: 'leaf',
      id: 'group-left-top',
      panels: ['main-map', 'main-editor'],
      activePanelId: 'main-map',
    },
    {
      type: 'leaf',
      id: 'group-left-bottom',
      panels: ['system-console', 'help-docs'],
      activePanelId: 'system-console',
    }
  ]
};

const initialPanels: Record<string, PanelInfo> = {
  'main-map': { id: 'main-map', title: 'Main Map', component: 'mainMap', state: 'docked' },
  'main-editor': { id: 'main-editor', title: 'Code Editor', component: 'editor', state: 'docked' },
  'system-console': { id: 'system-console', title: 'Console Output', component: 'terminal', state: 'docked' },
  'help-docs': { id: 'help-docs', title: 'Help Center', component: 'help', state: 'docked' },
  'live-preview': { id: 'live-preview', title: 'Live Preview Output', component: 'preview', state: 'floating' }
};

const initialFloating: FloatingWindow[] = [
  { id: 'live-preview', x: 450, y: 200, width: 320, height: 250, z: 1000 }
];

export interface WindowManagerProviderProps {
  children: React.ReactNode;
  formatMessage?: MessageFormatter;
  predefinedMessages?: Record<string, ContextMenuPredefinedMessage>;
  modalClass?: string;
  modalBodyClass?: string;
  sidePanelClass?: string;
  sidePanelBodyClass?: string;
  windowClass?: string;
  windowBodyClass?: string;
}

export const WindowManagerProvider: React.FC<WindowManagerProviderProps> = ({
  children,
  formatMessage,
  predefinedMessages,
  modalClass,
  modalBodyClass,
  sidePanelClass,
  sidePanelBodyClass,
  windowClass,
  windowBodyClass
}) => {
  const [state, setState] = useState<WindowState>({
    gridRoot: initialLayout,
    floating: initialFloating,
    minimized: [],
    panels: initialPanels,
    draggedPanelId: null,
    pendingClose: null,
    activePanelId: 'main-map'
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const closeGuardsRef = useRef<Record<string, () => boolean | Promise<boolean>>>({});

  const mergedMessages = useMemo(() => ({
    ...defaultPredefinedMessages,
    ...predefinedMessages
  }), [predefinedMessages]);

  const eventBusRef = useRef(new PanelEventBus());
  const maxZRef = useRef(1000);

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    return eventBusRef.current.subscribe(event, callback);
  }, []);

  const publish = useCallback((event: string, data: any) => {
    eventBusRef.current.publish(event, data);
  }, []);

  // Helper: Find free cascading location for floating window
  const getCascadedPosition = useCallback((
    fav: { x: number | string; y: number | string; width: number | string; height: number | string },
    currentFloating: FloatingWindow[]
  ) => {
    let x = typeof fav.x === 'string' ? parseFloat(fav.x) : fav.x;
    let y = typeof fav.y === 'string' ? parseFloat(fav.y) : fav.y;
    let width = typeof fav.width === 'string' ? parseFloat(fav.width) : fav.width;
    let height = typeof fav.height === 'string' ? parseFloat(fav.height) : fav.height;

    // Fallbacks if parseFloat fails and returns NaN
    if (isNaN(x)) x = 300;
    if (isNaN(y)) y = 150;
    if (isNaN(width)) width = 450;
    if (isNaN(height)) height = 350;

    const isOverlapping = (pos: { x: number; y: number }) => {
      return currentFloating.some(w => {
        const wx = typeof w.x === 'string' ? parseFloat(w.x) : w.x;
        const wy = typeof w.y === 'string' ? parseFloat(w.y) : w.y;
        return !w.maximized && Math.abs(wx - pos.x) < 20 && Math.abs(wy - pos.y) < 20;
      });
    };

    let attempts = 0;
    while (isOverlapping({ x, y }) && attempts < 10) {
      x += 30;
      y += 30;
      attempts++;
    }

    // Capture safe viewport boundaries (min 1024x768 fallback if not measured or in headless environments)
    const viewW = Math.max(100, window.innerWidth || 1024);
    const viewH = Math.max(100, window.innerHeight || 768);

    if (x + width > viewW || y + height > viewH) {
      x = 100 + (attempts % 5) * 30;
      y = 100 + (attempts % 5) * 30;
    }

    // Final safety clamp to make sure window title bar is always visible and clickable
    x = Math.max(0, Math.min(x, viewW - 100));
    y = Math.max(0, Math.min(y, viewH - 40));

    return { x, y, width, height };
  }, []);

  const bringToFront = useCallback((id: string) => {
    maxZRef.current += 1;
    const z = maxZRef.current;
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      if (panel.state === 'floating') {
        return {
          ...prev,
          floating: prev.floating.map(w => w.id === id ? { ...w, z } : w),
          activePanelId: id
        };
      } else if (panel.state === 'docked') {
        const selectActiveInTree = (node: LayoutNode): LayoutNode => {
          if (node.type === 'leaf') {
            if (node.panels.includes(id)) {
              return { ...node, activePanelId: id };
            }
            return node;
          } else {
            return { ...node, children: node.children.map(selectActiveInTree) };
          }
        };
        return {
          ...prev,
          gridRoot: selectActiveInTree(prev.gridRoot),
          activePanelId: id
        };
      }
      return { ...prev, activePanelId: id };
    });
  }, []);

  // Recursive helpers to manipulate layout tree
  const removePanelFromTree = (node: LayoutNode, id: string): LayoutNode | null => {
    if (node.type === 'leaf') {
      const idx = node.panels.indexOf(id);
      if (idx === -1) return node;
      const panels = node.panels.filter(p => p !== id);
      const activePanelId = node.activePanelId === id
        ? (panels[idx] || panels[idx - 1] || panels[0] || null)
        : node.activePanelId;
      const updatedLeaf = { ...node, panels, activePanelId };
      // Auto-remove this leaf when it becomes empty, unless keepOnEmpty is set
      if (panels.length === 0 && !node.keepOnEmpty) return null;
      return updatedLeaf;
    } else {
      const children = node.children
        .map(c => removePanelFromTree(c, id))
        .filter((c): c is LayoutNode => c !== null);

      if (children.length === 0) return null;
      if (children.length === 1) return children[0];

      // Re-normalize sizes
      const sizes = node.sizes.slice(0, children.length);
      const sum = sizes.reduce((a, b) => a + b, 0);
      return {
        ...node,
        children,
        sizes: sizes.map(s => s / sum)
      };
    }
  };

  const addPanelToLeaf = (node: LayoutNode, leafId: string, panelId: string): LayoutNode => {
    if (node.type === 'leaf') {
      if (node.id === leafId) {
        const panels = node.panels.includes(panelId) ? node.panels : [...node.panels, panelId];
        return { ...node, panels, activePanelId: panelId };
      }
      return node;
    } else {
      return {
        ...node,
        children: node.children.map(c => addPanelToLeaf(c, leafId, panelId))
      };
    }
  };

  const findFirstLeafId = (node: LayoutNode): string | null => {
    if (node.type === 'leaf') return node.id;
    for (const child of node.children) {
      const id = findFirstLeafId(child);
      if (id) return id;
    }
    return null;
  };

  const openPanel = useCallback((id: string, component: string, options?: { title?: string | ContextMenuPredefinedMessage; initialTarget?: 'floating' | 'docked' | 'tabbed'; stickyRight?: boolean; stickyBottom?: boolean }) => {
    setState(prev => {
      const exists = prev.panels[id];
      const entry = PanelRegistry.get(component);
      const title = options?.title || options?.title || entry?.defaultOptions?.title || id;
      const target = options?.initialTarget || entry?.defaultOptions?.initialTarget || 'docked';
      const favPos = entry?.defaultOptions?.favoritePosition || { x: 300, y: 150, width: 450, height: 350 };

      // Case 1: Already exists
      if (exists) {
        if (exists.state === 'minimized') {
          // Restore
          const nextMinimized = prev.minimized.filter(m => m.id !== id);
          if (target === 'floating' || !prev.gridRoot) {
            maxZRef.current += 1;
            const cascaded = getCascadedPosition(favPos, prev.floating);
            return {
              ...prev,
              minimized: nextMinimized,
              floating: [...prev.floating, { ...cascaded, id, z: maxZRef.current }],
              panels: { ...prev.panels, [id]: { ...exists, state: 'floating' } }
            };
          } else {
            const firstLeaf = findFirstLeafId(prev.gridRoot) || 'group-left-top';
            return {
              ...prev,
              minimized: nextMinimized,
              gridRoot: addPanelToLeaf(prev.gridRoot, firstLeaf, id),
              panels: { ...prev.panels, [id]: { ...exists, state: 'docked' } }
            };
          }
        } else if (exists.state === 'floating') {
          bringToFront(id);
          return prev;
        } else {
          // Focus in tab group
          const selectActiveInTree = (node: LayoutNode): LayoutNode => {
            if (node.type === 'leaf') {
              if (node.panels.includes(id)) {
                return { ...node, activePanelId: id };
              }
              return node;
            } else {
              return { ...node, children: node.children.map(selectActiveInTree) };
            }
          };
          return {
            ...prev,
            gridRoot: selectActiveInTree(prev.gridRoot)
          };
        }
      }

      // Case 2: New panel
      const targetState = target === 'tabbed' ? 'docked' : target;
      const newPanelInfo: PanelInfo = { id, title, component, state: targetState };
      const nextPanels = { ...prev.panels, [id]: newPanelInfo };

      if (target === 'floating') {
        maxZRef.current += 1;
        const cascaded = getCascadedPosition(favPos, prev.floating);

        const stickyRight = options?.stickyRight ?? entry?.defaultOptions?.defaultStickyRight ?? false;
        const stickyBottom = options?.stickyBottom ?? entry?.defaultOptions?.defaultStickyBottom ?? false;

        const viewW = Math.max(100, window.innerWidth || 1024);
        const viewH = Math.max(100, window.innerHeight || 768);
        const winW = typeof cascaded.width === 'string' ? parseFloat(cascaded.width) : cascaded.width;
        const winH = typeof cascaded.height === 'string' ? parseFloat(cascaded.height) : cascaded.height;

        let initialX = cascaded.x;
        let initialY = cascaded.y;

        const GAP = 10;
        if (stickyRight) {
          initialX = viewW - winW - GAP;
        }
        if (stickyBottom) {
          initialY = viewH - winH - GAP;
        }

        return {
          ...prev,
          floating: [...prev.floating, { ...cascaded, id, z: maxZRef.current, x: initialX, y: initialY, stickyRight, stickyBottom }],
          panels: nextPanels
        };
      } else {
        const firstLeaf = findFirstLeafId(prev.gridRoot) || 'group-left-top';
        return {
          ...prev,
          gridRoot: addPanelToLeaf(prev.gridRoot, firstLeaf, id),
          panels: nextPanels
        };
      }
    });
  }, [getCascadedPosition, bringToFront]);

  const closePanel = useCallback((id: string) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const registryEntry = PanelRegistry.get(panel.component);
      if (registryEntry?.defaultOptions?.canClose === false) {
        return prev;
      }

      delete closeGuardsRef.current[id];

      const nextPanels = { ...prev.panels };
      delete nextPanels[id];

      const cleanRoot = removePanelFromTree(prev.gridRoot, id);
      return {
        ...prev,
        gridRoot: cleanRoot || { type: 'leaf', id: 'group-default', panels: [], activePanelId: null },
        floating: prev.floating.filter(w => w.id !== id),
        minimized: prev.minimized.filter(m => m.id !== id),
        panels: nextPanels
      };
    });
  }, []);

  const registerCloseGuard = useCallback((id: string, guard: () => boolean | Promise<boolean>) => {
    closeGuardsRef.current[id] = guard;
  }, []);

  const unregisterCloseGuard = useCallback((id: string) => {
    delete closeGuardsRef.current[id];
  }, []);

  const setPanelDirty = useCallback((id: string, dirty: boolean) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;
      return {
        ...prev,
        panels: {
          ...prev.panels,
          [id]: { ...panel, dirty }
        }
      };
    });
  }, []);

  const updatePanelTitle = useCallback((id: string, title: string | ContextMenuPredefinedMessage) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;
      return {
        ...prev,
        panels: {
          ...prev.panels,
          [id]: { ...panel, title }
        }
      };
    });
  }, []);

  const resolvePendingClose = useCallback((discard: boolean) => {
    setState(prev => {
      if (!prev.pendingClose) return prev;
      prev.pendingClose.resolve(discard);
      return { ...prev, pendingClose: null };
    });
  }, []);

  const requestClosePanel = useCallback(async (id: string, options?: { force?: boolean }) => {
    if (options?.force) {
      closePanel(id);
      return;
    }

    // 1. Check custom close guard
    const guard = closeGuardsRef.current[id];
    if (guard) {
      const canClose = await guard();
      if (!canClose) return;
    }

    // 2. Check automatic dirty flag
    const panel = stateRef.current.panels[id];
    if (panel?.dirty) {
      const discard = await new Promise<boolean>(resolve => {
        setState(prev => ({
          ...prev,
          pendingClose: { id, resolve }
        }));
      });
      if (!discard) return;
    }

    closePanel(id);
  }, [closePanel]);

  const minimizePanel = useCallback((id: string) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel || panel.state === 'minimized') return prev;

      const registryEntry = PanelRegistry.get(panel.component);
      if (registryEntry?.defaultOptions?.canMinimize === false) {
        return prev;
      }

      let lastFloatingRect: any = undefined;
      let lastLeafId: any = undefined;

      if (panel.state === 'floating') {
        const win = prev.floating.find(w => w.id === id);
        if (win) {
          lastFloatingRect = { 
            x: win.x, 
            y: win.y, 
            width: win.width, 
            height: win.height,
            stickyRight: win.stickyRight,
            stickyBottom: win.stickyBottom
          };
        }
      } else if (panel.state === 'docked') {
        const findLeafForPanel = (node: LayoutNode): string | null => {
          if (node.type === 'leaf') {
            return node.panels.includes(id) ? node.id : null;
          } else {
            for (const child of node.children) {
              const res = findLeafForPanel(child);
              if (res) return res;
            }
            return null;
          }
        };
        lastLeafId = findLeafForPanel(prev.gridRoot);
      }

      const cleanRoot = removePanelFromTree(prev.gridRoot, id);
      return {
        ...prev,
        gridRoot: cleanRoot || { type: 'leaf', id: 'group-default', panels: [], activePanelId: null },
        floating: prev.floating.filter(w => w.id !== id),
        minimized: [...prev.minimized, { id, title: panel.title, component: panel.component }],
        panels: {
          ...prev.panels,
          [id]: {
            ...panel,
            state: 'minimized',
            previousState: panel.state,
            lastFloatingRect,
            lastLeafId
          }
        }
      };
    });
  }, []);

  const restorePanel = useCallback((id: string) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel || panel.state !== 'minimized') return prev;

      const nextMinimized = prev.minimized.filter(m => m.id !== id);
      const prevState = panel.previousState || 'docked';

      if (prevState === 'floating') {
        maxZRef.current += 1;
        const entry = PanelRegistry.get(panel.component);
        const favPos = panel.lastFloatingRect || entry?.defaultOptions?.favoritePosition || { x: 300, y: 150, width: 450, height: 350 };
        const cascaded = getCascadedPosition(favPos, prev.floating);
        return {
          ...prev,
          minimized: nextMinimized,
          floating: [
            ...prev.floating, 
            { 
              ...cascaded, 
              id, 
              z: maxZRef.current,
              stickyRight: !!panel.lastFloatingRect?.stickyRight,
              stickyBottom: !!panel.lastFloatingRect?.stickyBottom
            }
          ],
          panels: { ...prev.panels, [id]: { ...panel, state: 'floating' } }
        };
      } else {
        const leafExists = (node: LayoutNode, targetId: string): boolean => {
          if (node.type === 'leaf') return node.id === targetId;
          return node.children.some(c => leafExists(c, targetId));
        };

        const parentLeafExists = panel.lastLeafId && leafExists(prev.gridRoot, panel.lastLeafId);
        const entry = PanelRegistry.get(panel.component);
        const canDrag = entry?.defaultOptions?.canDrag !== false;

        if (parentLeafExists) {
          return {
            ...prev,
            minimized: nextMinimized,
            gridRoot: addPanelToLeaf(prev.gridRoot, panel.lastLeafId!, id),
            panels: { ...prev.panels, [id]: { ...panel, state: 'docked' } }
          };
        } else if (canDrag) {
          // Leaf group ceased to exist: float it instead if floatable!
          maxZRef.current += 1;
          const favPos = panel.lastFloatingRect || entry?.defaultOptions?.favoritePosition || { x: 300, y: 150, width: 450, height: 350 };
          const cascaded = getCascadedPosition(favPos, prev.floating);
          return {
            ...prev,
            minimized: nextMinimized,
            floating: [
              ...prev.floating, 
              { 
                ...cascaded, 
                id, 
                z: maxZRef.current,
                stickyRight: !!panel.lastFloatingRect?.stickyRight,
                stickyBottom: !!panel.lastFloatingRect?.stickyBottom
              }
            ],
            panels: { ...prev.panels, [id]: { ...panel, state: 'floating' } }
          };
        } else {
          // Leaf group ceased to exist but not floatable: dock into fallback leaf group
          const targetLeafId = findFirstLeafId(prev.gridRoot) || 'group-left-top';
          return {
            ...prev,
            minimized: nextMinimized,
            gridRoot: addPanelToLeaf(prev.gridRoot, targetLeafId, id),
            panels: { ...prev.panels, [id]: { ...panel, state: 'docked' } }
          };
        }
      }
    });
  }, [getCascadedPosition]);

  const floatPanel = useCallback((id: string, rect?: { x: number; y: number; width: number; height: number }) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const registryEntry = PanelRegistry.get(panel.component);
      if (registryEntry?.defaultOptions?.canDrag === false) {
        return prev;
      }

      const entry = PanelRegistry.get(panel.component);
      const favPos = rect || entry?.defaultOptions?.favoritePosition || { x: 300, y: 150, width: 450, height: 350 };

      const cleanRoot = removePanelFromTree(prev.gridRoot, id);
      maxZRef.current += 1;
      const cascaded = getCascadedPosition(favPos, prev.floating);

      return {
        ...prev,
        gridRoot: cleanRoot || { type: 'leaf', id: 'group-default', panels: [], activePanelId: null },
        floating: [...prev.floating, { ...cascaded, id, z: maxZRef.current }],
        panels: {
          ...prev.panels,
          [id]: { ...panel, state: 'floating' }
        }
      };
    });
  }, [getCascadedPosition]);

  const dockPanel = useCallback((id: string, targetLeafId?: string) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const nextFloating = prev.floating.filter(w => w.id !== id);
      const cleanRoot = removePanelFromTree(prev.gridRoot, id);
      const leafId = targetLeafId || findFirstLeafId(cleanRoot || prev.gridRoot) || 'group-left-top';

      return {
        ...prev,
        gridRoot: addPanelToLeaf(cleanRoot || prev.gridRoot, leafId, id),
        floating: nextFloating,
        panels: {
          ...prev.panels,
          [id]: { ...panel, state: 'docked' }
        }
      };
    });
  }, []);

  // Helper to split a layout leaf node into a branch (for drag split targets)
  const splitLeafInTree = (
    node: LayoutNode,
    leafId: string,
    panelId: string,
    position: 'left' | 'right' | 'top' | 'bottom'
  ): LayoutNode => {
    if (node.type === 'leaf') {
      if (node.id === leafId) {
        const newLeaf: LayoutLeafNode = {
          type: 'leaf',
          id: `group-split-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          panels: [panelId],
          activePanelId: panelId
        };
        const orientation: SplitOrientation = (position === 'left' || position === 'right') ? 'horizontal' : 'vertical';
        const children = (position === 'left' || position === 'top') ? [newLeaf, node] : [node, newLeaf];
        return {
          type: 'branch',
          orientation,
          sizes: [0.5, 0.5],
          children
        };
      }
      return node;
    } else {
      return {
        ...node,
        children: node.children.map(c => splitLeafInTree(c, leafId, panelId, position))
      };
    }
  };

  const setDraggedPanelId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, draggedPanelId: id }));
  }, []);

  const dockPanelToGroup = useCallback((id: string, targetLeafId: string, position: 'left' | 'right' | 'top' | 'bottom' | 'center') => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const nextFloating = prev.floating.filter(w => w.id !== id);
      const cleanRoot = removePanelFromTree(prev.gridRoot, id);

      let newRoot: LayoutNode;
      if (position === 'center') {
        newRoot = addPanelToLeaf(cleanRoot || prev.gridRoot, targetLeafId, id);
      } else {
        newRoot = splitLeafInTree(cleanRoot || prev.gridRoot, targetLeafId, id, position);
      }

      return {
        ...prev,
        gridRoot: newRoot,
        floating: nextFloating,
        panels: {
          ...prev.panels,
          [id]: { ...panel, state: 'docked' }
        },
        draggedPanelId: null
      };
    });
  }, []);

  const dockPanelToWorkspaceEdge = useCallback((id: string, position: 'left' | 'right' | 'top' | 'bottom') => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const nextFloating = prev.floating.filter(w => w.id !== id);
      const cleanRoot = removePanelFromTree(prev.gridRoot, id);

      const newLeaf: LayoutLeafNode = {
        type: 'leaf',
        id: `group-edge-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        panels: [id],
        activePanelId: id
      };

      const orientation: SplitOrientation = (position === 'left' || position === 'right') ? 'horizontal' : 'vertical';
      const children = (position === 'left' || position === 'top')
        ? [newLeaf, cleanRoot || prev.gridRoot]
        : [cleanRoot || prev.gridRoot, newLeaf];

      const newRoot: LayoutNode = {
        type: 'branch',
        orientation,
        sizes: (position === 'left' || position === 'top') ? [0.3, 0.7] : [0.7, 0.3],
        children
      };

      return {
        ...prev,
        gridRoot: newRoot,
        floating: nextFloating,
        panels: {
          ...prev.panels,
          [id]: { ...panel, state: 'docked' }
        },
        draggedPanelId: null
      };
    });
  }, []);

  const movePanelOrder = useCallback((panelId: string, targetLeafId: string, targetIndex: number) => {
    setState(prev => {
      const panel = prev.panels[panelId];
      if (!panel) return prev;

      // 1. Remove panel from its current group in the layout tree
      const cleanRoot = removePanelFromTree(prev.gridRoot, panelId);

      // 2. Insert panel at specific index in target leaf ID
      const insertInLeaf = (node: LayoutNode): LayoutNode => {
        if (node.type === 'leaf') {
          if (node.id === targetLeafId) {
            const remaining = node.panels.filter(p => p !== panelId);
            const index = Math.max(0, Math.min(targetIndex, remaining.length));
            const newPanels = [...remaining];
            newPanels.splice(index, 0, panelId);
            return {
              ...node,
              panels: newPanels,
              activePanelId: panelId
            };
          }
          return node;
        } else {
          return {
            ...node,
            children: node.children.map(insertInLeaf)
          };
        }
      };

      const newRoot = insertInLeaf(cleanRoot || prev.gridRoot);
      const nextFloating = prev.floating.filter(w => w.id !== panelId);

      return {
        ...prev,
        gridRoot: newRoot,
        floating: nextFloating,
        panels: {
          ...prev.panels,
          [panelId]: { ...panel, state: 'docked' }
        },
        draggedPanelId: null
      };
    });
  }, []);

  const closeLeafGroup = useCallback((leafId: string) => {
    setState(prev => {
      const removeLeafFromTree = (node: LayoutNode): LayoutNode | null => {
        if (node.type === 'leaf') {
          if (node.id === leafId && node.canClose !== false) {
            return null;
          }
          return node;
        } else {
          const children = node.children
            .map(c => removeLeafFromTree(c))
            .filter((c): c is LayoutNode => c !== null);

          if (children.length === 0) return null;
          if (children.length === 1) return children[0];

          // Re-normalize sizes
          const sizes = node.sizes.slice(0, children.length);
          const sum = sizes.reduce((a, b) => a + b, 0);
          return {
            ...node,
            children,
            sizes: sizes.map(s => s / sum)
          };
        }
      };

      const newRoot = removeLeafFromTree(prev.gridRoot);
      return {
        ...prev,
        gridRoot: newRoot || { type: 'leaf', id: 'group-default', panels: [], activePanelId: null }
      };
    });
  }, []);

  const maximizePanel = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      floating: prev.floating.map(w => w.id === id ? { ...w, maximized: !w.maximized } : w)
    }));
  }, []);

  const updateSplitSizes = useCallback((path: number[], sizes: number[]) => {
    const updateInTree = (node: LayoutNode, depth: number): LayoutNode => {
      if (node.type === 'leaf') return node;
      if (depth === path.length) {
        return { ...node, sizes };
      }
      const idx = path[depth];
      const children = node.children.map((c, i) => i === idx ? updateInTree(c, depth + 1) : c);
      return { ...node, children };
    };

    setState(prev => ({
      ...prev,
      gridRoot: updateInTree(prev.gridRoot, 0)
    }));
  }, []);

  const updateFloatingPosition = useCallback((id: string, updates: Partial<Pick<FloatingWindow, 'x' | 'y' | 'width' | 'height' | 'stickyRight' | 'stickyBottom'>>) => {
    setState(prev => ({
      ...prev,
      floating: prev.floating.map(w => w.id === id ? { ...w, ...updates } : w)
    }));
  }, []);

  const saveLayout = useCallback(() => {
    return JSON.stringify({
      gridRoot: state.gridRoot,
      floating: state.floating,
      minimized: state.minimized,
      panels: state.panels
    });
  }, [state]);

  const loadLayout = useCallback((layoutJson: string) => {
    try {
      const parsed = JSON.parse(layoutJson);
      if (parsed.gridRoot && parsed.floating && parsed.minimized && parsed.panels) {
        const firstActive = Object.keys(parsed.panels)[0] || null;
        setState({
          gridRoot: parsed.gridRoot,
          floating: parsed.floating,
          minimized: parsed.minimized,
          panels: parsed.panels,
          draggedPanelId: null,
          pendingClose: null,
          activePanelId: firstActive
        });
      }
    } catch (e) {
      console.error('Failed to parse layout configuration:', e);
    }
  }, []);

  const setActivePanel = useCallback((id: string | null) => {
    setState(prev => {
      if (prev.activePanelId === id) return prev;
      return { ...prev, activePanelId: id };
    });
  }, []);

  const actions = useMemo<WindowActions>(() => ({
    openPanel,
    closePanel,
    minimizePanel,
    restorePanel,
    floatPanel,
    dockPanel,
    maximizePanel,
    updateSplitSizes,
    updateFloatingPosition,
    bringToFront,
    saveLayout,
    loadLayout,
    publish,
    subscribe,
    setDraggedPanelId,
    dockPanelToGroup,
    movePanelOrder,
    closeLeafGroup,
    registerCloseGuard,
    unregisterCloseGuard,
    setPanelDirty,
    updatePanelTitle,
    requestClosePanel,
    resolvePendingClose,
    dockPanelToWorkspaceEdge,
    setActivePanel
  }), [
    openPanel,
    closePanel,
    minimizePanel,
    restorePanel,
    floatPanel,
    dockPanel,
    maximizePanel,
    updateSplitSizes,
    updateFloatingPosition,
    bringToFront,
    saveLayout,
    loadLayout,
    publish,
    subscribe,
    setDraggedPanelId,
    dockPanelToGroup,
    movePanelOrder,
    closeLeafGroup,
    registerCloseGuard,
    unregisterCloseGuard,
    setPanelDirty,
    updatePanelTitle,
    requestClosePanel,
    resolvePendingClose,
    dockPanelToWorkspaceEdge,
    setActivePanel
  ]);

  const defaultFormatMessage: MessageFormatter = (msg) => {
    let text = msg.defaultMessage || msg.id;
    if (msg.values) {
      Object.entries(msg.values).forEach(([key, value]) => {
        text = text.replace(`{${key}}`, String(value));
      });
    }
    return text;
  };

  const styleClasses = useMemo(() => ({
    modalClass,
    modalBodyClass,
    sidePanelClass,
    sidePanelBodyClass,
    windowClass,
    windowBodyClass
  }), [modalClass, modalBodyClass, sidePanelClass, sidePanelBodyClass, windowClass, windowBodyClass]);

  return (
    <StyleClassContext.Provider value={styleClasses}>
      <WindowStateContext.Provider value={state}>
        <WindowActionsContext.Provider value={actions}>
          <WindowI18nContext.Provider value={formatMessage || defaultFormatMessage}>
            <WindowPredefinedMessagesContext.Provider value={mergedMessages}>
              {children}
            </WindowPredefinedMessagesContext.Provider>
          </WindowI18nContext.Provider>
        </WindowActionsContext.Provider>
      </WindowStateContext.Provider>
    </StyleClassContext.Provider>
  );
};

/**
 * React hook to retrieve the active Window Manager layout state.
 * @throws Error if used outside of a {@link WindowManagerProvider}.
 */
export const useWindowManagerState = () => {
  const ctx = useContext(WindowStateContext);
  if (!ctx) throw new Error('useWindowManagerState must be used within WindowManagerProvider');
  return ctx;
};

/**
 * React hook to retrieve layouts mutation actions (dock, float, minimize, save/load).
 * @throws Error if used outside of a {@link WindowManagerProvider}.
 */
export const useWindowManagerActions = () => {
  const ctx = useContext(WindowActionsContext);
  if (!ctx) throw new Error('useWindowManagerActions must be used within WindowManagerProvider');
  return ctx;
};

/**
 * React hook to retrieve the active i18n formatter.
 */
export const useFormatMessage = () => {
  const formatter = useContext(WindowI18nContext);
  return formatter || ((msg) => {
    let text = msg.defaultMessage || msg.id;
    if (msg.values) {
      Object.entries(msg.values).forEach(([key, value]) => {
        text = text.replace(`{${key}}`, String(value));
      });
    }
    return text;
  });
};

/**
 * Helper to resolve dynamic label strings or localizable descriptor objects into text.
 */
export const formatLabel = (
  label: string | ContextMenuPredefinedMessage | undefined,
  formatter: MessageFormatter
): string => {
  if (!label) return '';
  if (typeof label === 'string') return label;
  return formatter(label);
};

/**
 * React hook providing pub-sub helper methods for inter-panel event messaging.
 */
export const usePanelContext = () => {
  const { publish, subscribe } = useWindowManagerActions();
  return { publish, subscribe };
};

/**
 * React hook to fetch the localizable predefined message map catalog.
 */
export const usePredefinedMessages = () => {
  return useContext(WindowPredefinedMessagesContext);
};
