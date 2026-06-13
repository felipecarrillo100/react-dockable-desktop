import React, { createContext, useContext, useState, useRef, useMemo, useCallback, useEffect, useSyncExternalStore } from 'react';
import { useFormContainer } from './FormContainerContext';
import { PanelRegistry, type PanelRegistryClass } from './PanelRegistry';
import type { WorkspaceClient } from '../WorkspaceClient';
import { defaultPredefinedMessages } from './predefinedMessages';
import type { PredefinedMessageKey } from './predefinedMessages';
export type { PredefinedMessageKey } from './predefinedMessages';
export { defaultPredefinedMessages } from './predefinedMessages';
import type { DirtyStateOptions } from './dirtyOptions';
export type { DirtyStateOptions };
import type { ContextMenuItem } from 'replace-react-contexify';

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

/** The four cardinal directions a panel can be docked relative to another. */
export type SplitDirection = 'left' | 'right' | 'top' | 'bottom';

/** All possible drop positions — cardinal directions plus center (same group). */
export type DropPosition = SplitDirection | 'center';

/** The target leaf and position for a drag-and-drop dock operation. */
export interface DropTarget {
  leafId: string;
  position: DropPosition;
}

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
  /** Custom options applied to the automatic unsaved changes modal. */
  dirtyOptions?: DirtyStateOptions;
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
  /** The ID of the active/focused panel. */
  activePanelId: string | null;
  /** Current layout direction ('ltr' or 'rtl') */
  dir: 'ltr' | 'rtl';
  /** Convenient boolean flag indicating RTL direction */
  isRtl: boolean;
}

/**
 * All layout mutation methods, event bus handles, and serialization methods
 * exposed by the `WindowManagerProvider`.
 *
 * Obtain this object via {@link useWindowManagerActions} inside a component,
 * or via {@link WorkspaceClient} methods from outside the React tree.
 *
 * @group Hooks
 * @example
 * ```tsx
 * function MyToolbar() {
 *   const actions = useWindowManagerActions();
 *   return <button onClick={() => actions.openPanel('map-1', 'map')}>Open Map</button>;
 * }
 * ```
 */
export interface WindowActions {
  /**
   * Opens a registered panel into the workspace.
   * If the panel ID is already open, the panel is focused instead of duplicated.
   * @param id - Unique instance identifier for this panel.
   * @param component - Component key registered in the panel catalog.
   * @param options - Optional display and placement overrides.
   * @example
   * ```ts
   * actions.openPanel('map-1', 'map', { title: 'Satellite View', initialTarget: 'floating' });
   * ```
   */
  openPanel: (id: string, component: string, options?: { title?: string | ContextMenuPredefinedMessage; initialTarget?: 'floating' | 'docked' | 'tabbed'; stickyRight?: boolean; stickyBottom?: boolean }) => void;
  /**
   * Closes a panel immediately, bypassing dirty-state close guards.
   * For guarded close, use {@link requestClosePanel}.
   * @param id - Panel instance ID.
   */
  closePanel: (id: string) => void;
  /**
   * Minimizes a panel to the bottom taskbar dock, preserving its layout position.
   * @param id - Panel instance ID.
   */
  minimizePanel: (id: string) => void;
  /**
   * Restores a minimized panel back to its last docked or floating position.
   * @param id - Panel instance ID.
   */
  restorePanel: (id: string) => void;
  /**
   * Detaches a docked panel, converting it to a resizable floating window.
   * @param id - Panel instance ID.
   * @param rect - Optional initial position and size for the floating window.
   */
  floatPanel: (id: string, rect?: { x: number; y: number; width: number; height: number }) => void;
  /**
   * Returns a floating window to a docked grid tab group.
   * @param id - Panel instance ID.
   * @param targetLeafId - Target leaf group ID. Defaults to the panel's last leaf.
   */
  dockPanel: (id: string, targetLeafId?: string) => void;
  /**
   * Maximizes a floating window to cover the entire workspace viewport.
   * @param id - Panel instance ID.
   */
  maximizePanel: (id: string) => void;
  /**
   * Resizes the flex split proportions of a branch node's children.
   * @param path - Index path from root to the branch node.
   * @param sizes - New proportional sizes (must sum to 1.0).
   */
  updateSplitSizes: (path: number[], sizes: number[]) => void;
  /**
   * Updates the position or size of a floating window.
   * @param id - Panel instance ID.
   * @param updates - Partial update to `x`, `y`, `width`, `height`, `stickyRight`, or `stickyBottom`.
   */
  updateFloatingPosition: (id: string, updates: Partial<Pick<FloatingWindow, 'x' | 'y' | 'width' | 'height' | 'stickyRight' | 'stickyBottom'>>) => void;
  /**
   * Activates the given panel regardless of its current state.
   * - Floating panel: raises z-index so the window appears on top of others.
   * - Docked panel: selects the tab within its leaf group.
   * @param id - Panel instance ID.
   * @example
   * ```ts
   * // Ensure a panel is visible before updating its content:
   * if (actions.isOpen('map-1')) actions.focusPanel('map-1');
   * ```
   */
  focusPanel: (id: string) => void;
  /**
   * Returns `true` if a panel with the given ID is currently open (docked, floating, or minimized).
   * Uses a synchronous `stateRef` read — safe to call outside of render.
   * @param id - Panel instance ID.
   * @returns `true` if the panel is open.
   * @example
   * ```ts
   * if (!actions.isOpen('map-1')) {
   *   actions.openPanel('map-1', 'map');
   * } else {
   *   actions.focusPanel('map-1');
   * }
   * ```
   */
  isOpen: (id: string) => boolean;
  /**
   * Returns the IDs of all currently open panels (docked, floating, and minimized).
   * Uses a synchronous `stateRef` read — safe to call outside of render.
   * @returns Array of panel instance IDs.
   */
  getOpenPanelIds: () => string[];
  /**
   * Serializes the entire workspace state to a JSON string.
   * Includes grid layout, floating window positions, minimized panels, and panel metadata.
   * @returns JSON string suitable for storage and later restoration via {@link loadLayout}.
   * @example
   * ```ts
   * localStorage.setItem('layout', actions.saveLayout());
   * ```
   */
  saveLayout: () => string;
  /**
   * Restores a previously serialized workspace from a JSON string.
   * Replaces the entire current layout — all panels not in the snapshot are closed.
   * @param layoutJson - JSON string produced by {@link saveLayout}.
   * @returns `true` if the layout was successfully parsed and applied, `false` otherwise.
   */
  loadLayout: (layoutJson: string) => boolean;
  /**
   * Publishes an event to the inter-panel pub/sub event bus.
   * @param event - Event name string.
   * @param data - Arbitrary payload passed to all subscribers.
   */
  publish: (event: string, data: any) => void;
  /**
   * Subscribes a callback to the inter-panel pub/sub event bus.
   * @param event - Event name string.
   * @param callback - Function called with the event payload.
   * @returns Unsubscribe function — call it to remove the listener.
   * @example
   * ```ts
   * useEffect(() => actions.subscribe('map:zoom', ({ level }) => setZoom(level)), []);
   * ```
   */
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  /** @internal Stores reference to the active tab ID being dragged. */
  setDraggedPanelId: (id: string | null) => void;
  /**
   * Splits an existing leaf group and docks a panel to the given side.
   * @param id - Panel instance ID to dock.
   * @param targetLeafId - Leaf group ID to split.
   * @param position - Which side of the target to split and dock into.
   */
  dockPanelToGroup: (id: string, targetLeafId: string, position: DropPosition) => void;
  /**
   * Reorders a panel's tab index within a docked leaf group.
   * @param panelId - Panel instance ID to move.
   * @param targetLeafId - Destination leaf group ID.
   * @param targetIndex - New tab index within the target group.
   */
  movePanelOrder: (panelId: string, targetLeafId: string, targetIndex: number) => void;
  /**
   * Closes an empty leaf group (removes it from the grid tree).
   * @param leafId - Leaf node ID to remove.
   */
  closeLeafGroup: (leafId: string) => void;
  /**
   * Registers a close guard that can intercept and cancel panel close requests.
   * @param id - Panel instance ID to guard.
   * @param guard - Function returning `true` (allow close) or `false` / `Promise<false>` (block).
   */
  registerCloseGuard: (id: string, guard: () => boolean | Promise<boolean>) => void;
  /**
   * Removes a previously registered close guard.
   * @param id - Panel instance ID.
   */
  unregisterCloseGuard: (id: string) => void;
  /**
   * Marks a panel as dirty (has unsaved changes). Dirty panels show a visual indicator
   * and the built-in close guard prompts the user before closing.
   * @param id - Panel instance ID.
   * @param dirty - `true` to mark dirty, `false` to clear.
   * @param options - Custom confirmation dialog options.
   */
  setPanelDirty: (id: string, dirty: boolean, options?: DirtyStateOptions) => void;
  /**
   * Updates the display title of an open panel.
   * @param id - Panel instance ID.
   * @param title - New title string or localizable message descriptor.
   */
  updatePanelTitle: (id: string, title: string | ContextMenuPredefinedMessage) => void;
  /**
   * Closes a panel, first running any registered close guards.
   * If the panel is dirty, shows the built-in unsaved-changes confirmation dialog.
   * @param id - Panel instance ID.
   * @param options - `force: true` bypasses guards; `onConfirm` provides a custom dialog.
   */
  requestClosePanel: (id: string, options?: { force?: boolean; onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }) => Promise<void>;
  /**
   * Docks a floating panel to a workspace edge, creating a full-width or full-height column/row.
   * @param id - Panel instance ID.
   * @param position - Edge to dock to.
   */
  dockPanelToWorkspaceEdge: (id: string, position: SplitDirection) => void;
  /**
   * Overrides the workspace layout direction.
   * @param dir - `'ltr'` or `'rtl'`.
   */
  setDirection: (dir: 'ltr' | 'rtl') => void;
}

/**
 * Extension of {@link WindowActions} used internally by WindowManager components.
 * `setActivePanel` is not part of the public API — it is a low-level tab-focus
 * primitive used exclusively within this library's rendering layer.
 * @internal
 */
export interface InternalWindowActions extends WindowActions {
  /** @internal */
  setActivePanel: (id: string | null) => void;
  /** @internal */
  registerPanelContextMenu: (panelId: string, getItems: () => ContextMenuItem[]) => () => void;
  /** @internal */
  getPanelContextMenuItems: (panelId: string) => ContextMenuItem[];
}

const WindowStateContext = createContext<WindowState | null>(null);
const WindowActionsContext = createContext<InternalWindowActions | null>(null);
const WindowI18nContext = createContext<MessageFormatter | null>(null);

interface WindowStoreSyncContextValue {
  getSnapshot: () => WindowState;
  subscribeToState: (callback: () => void) => () => void;
}
const WindowStoreSyncContext = createContext<WindowStoreSyncContextValue | null>(null);

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
export const useStyleClasses = (): StyleClasses => useContext(StyleClassContext);

const RegistryContext = createContext<PanelRegistryClass>(PanelRegistry);

/**
 * React hook to read the scoped {@link PanelRegistryClass} for the current provider.
 * When the provider was created with a {@link WorkspaceClient}, this returns the client's
 * private registry. Otherwise it returns the global `PanelRegistry` singleton.
 *
 * @group Hooks
 * @returns The panel registry instance in scope.
 * @example
 * ```tsx
 * function MyComponent() {
 *   const registry = useRegistry();
 *   const entry = registry.get('map');
 *   return entry ? <entry.Component panelId="preview" /> : null;
 * }
 * ```
 */
export const useRegistry = (): PanelRegistryClass => useContext(RegistryContext);

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

const EMPTY_LEAF: LayoutLeafNode = {
  type: 'leaf',
  id: 'group-default',
  panels: [],
  activePanelId: null,
};

function parseInitialState(json: string | null): Pick<WindowState, 'gridRoot' | 'floating' | 'minimized' | 'panels' | 'activePanelId'> {
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.gridRoot && Array.isArray(parsed.floating) && Array.isArray(parsed.minimized) && parsed.panels) {
        return {
          gridRoot: parsed.gridRoot,
          floating: parsed.floating,
          minimized: parsed.minimized,
          panels: parsed.panels,
          activePanelId: Object.keys(parsed.panels)[0] ?? null,
        };
      }
    } catch {
      // fall through to empty canvas
    }
  }
  return { gridRoot: EMPTY_LEAF, floating: [], minimized: [], panels: {}, activePanelId: null };
}

export interface WindowManagerProviderProps {
  children: React.ReactNode;
  /** WorkspaceClient instance created outside the React tree. When provided, its registry
   *  and config take precedence over the individual props below. */
  client?: WorkspaceClient;
  formatMessage?: MessageFormatter;
  predefinedMessages?: Record<string, ContextMenuPredefinedMessage>;
  dir?: 'ltr' | 'rtl';
  modalClass?: string;
  modalBodyClass?: string;
  sidePanelClass?: string;
  sidePanelBodyClass?: string;
  windowClass?: string;
  windowBodyClass?: string;
}

export const WindowManagerProvider: React.FC<WindowManagerProviderProps> = ({
  children,
  client,
  formatMessage,
  predefinedMessages,
  dir: dirProp,
  modalClass,
  modalBodyClass,
  sidePanelClass,
  sidePanelBodyClass,
  windowClass,
  windowBodyClass
}) => {
  // Scoped registry: client's own instance, or fall back to the global singleton for backward compat
  const registry = useRef(client?.registry ?? PanelRegistry).current;

  // Effective config: client props take precedence over individual provider props
  const effectiveFormatMessage = client?.config.formatMessage ?? formatMessage;
  const effectivePredefinedMessages = client?.config.predefinedMessages ?? predefinedMessages;
  const effectiveDir = client?.config.dir ?? dirProp;

  const [state, setState] = useState<WindowState>(() => {
    const layout = parseInitialState(client?.initialState ?? null);
    return {
      ...layout,
      draggedPanelId: null,
      dir: effectiveDir || 'ltr',
      isRtl: effectiveDir === 'rtl',
    };
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const stateSubscribersRef = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    stateSubscribersRef.current.forEach(cb => cb());
  }, [state]);

  const getSnapshot = useCallback((): WindowState => stateRef.current, []);
  const subscribeToState = useCallback((cb: () => void): (() => void) => {
    stateSubscribersRef.current.add(cb);
    return () => stateSubscribersRef.current.delete(cb);
  }, []);

  const closeGuardsRef = useRef<Record<string, () => boolean | Promise<boolean>>>({});

  const mergedMessages = useMemo(() => ({
    ...defaultPredefinedMessages,
    ...effectivePredefinedMessages
  }), [effectivePredefinedMessages]);

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

  const focusPanel = useCallback((id: string) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      if (panel.state === 'floating') {
        const win = prev.floating.find(w => w.id === id);
        if (!win) return prev;
        const alreadyTop = !prev.floating.some(w => w.z > win.z);
        if (alreadyTop && prev.activePanelId === id) return prev; // no-op — StrictMode safe
        if (!alreadyTop) maxZRef.current += 1;
        return {
          ...prev,
          floating: prev.floating.map(w =>
            w.id === id ? { ...w, z: alreadyTop ? win.z : maxZRef.current } : w
          ),
          activePanelId: id
        };
      } else if (panel.state === 'docked') {
        if (prev.activePanelId === id) return prev; // no-op
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
      if (prev.activePanelId === id) return prev; // no-op for minimized
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
    const isNew = !(id in stateRef.current.panels);
    setState(prev => {
      const exists = prev.panels[id];
      const entry = registry.get(component);
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
            const firstLeaf = findFirstLeafId(prev.gridRoot) || 'group-default';
            return {
              ...prev,
              minimized: nextMinimized,
              gridRoot: addPanelToLeaf(prev.gridRoot, firstLeaf, id),
              panels: { ...prev.panels, [id]: { ...exists, state: 'docked' } }
            };
          }
        } else if (exists.state === 'floating') {
          focusPanel(id);
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
        const firstLeaf = findFirstLeafId(prev.gridRoot) || 'group-default';
        return {
          ...prev,
          gridRoot: addPanelToLeaf(prev.gridRoot, firstLeaf, id),
          panels: nextPanels
        };
      }
    });
    if (isNew) eventBusRef.current.publish('panel:opened', { id, component });
  }, [getCascadedPosition, focusPanel]);

  const closePanel = useCallback((id: string) => {
    const exists = id in stateRef.current.panels;
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const registryEntry = registry.get(panel.component);
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
    if (exists) eventBusRef.current.publish('panel:closed', { id });
  }, []);

  const registerCloseGuard = useCallback((id: string, guard: () => boolean | Promise<boolean>) => {
    closeGuardsRef.current[id] = guard;
  }, []);

  const unregisterCloseGuard = useCallback((id: string) => {
    delete closeGuardsRef.current[id];
  }, []);

  const setPanelDirty = useCallback((id: string, dirty: boolean, options?: DirtyStateOptions) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;
      return {
        ...prev,
        panels: {
          ...prev.panels,
          [id]: { ...panel, dirty, dirtyOptions: options }
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

  const requestClosePanel = useCallback(async (id: string, options?: { force?: boolean; onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }) => {
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
      if (options?.onConfirm) {
        const discard = await options.onConfirm(panel.dirtyOptions);
        if (!discard) return;
      } else {
        return;
      }
    }

    closePanel(id);
  }, [closePanel]);

  const minimizePanel = useCallback((id: string) => {
    const wasActive = stateRef.current.panels[id]?.state !== 'minimized' && id in stateRef.current.panels;
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel || panel.state === 'minimized') return prev;

      const registryEntry = registry.get(panel.component);
      if (registryEntry?.defaultOptions?.canMinimize === false) {
        return prev;
      }

      let lastFloatingRect: PanelInfo['lastFloatingRect'] = undefined;
      let lastLeafId: string | undefined = undefined;

      if (panel.state === 'floating') {
        const win = prev.floating.find(w => w.id === id);
        if (win) {
          lastFloatingRect = {
            x: Number(win.x),
            y: Number(win.y),
            width: Number(win.width),
            height: Number(win.height),
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
        lastLeafId = findLeafForPanel(prev.gridRoot) ?? undefined;
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
    if (wasActive) eventBusRef.current.publish('panel:minimized', { id });
  }, []);

  const restorePanel = useCallback((id: string) => {
    const wasMinimized = stateRef.current.panels[id]?.state === 'minimized';
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel || panel.state !== 'minimized') return prev;

      const nextMinimized = prev.minimized.filter(m => m.id !== id);
      const prevState = panel.previousState || 'docked';

      if (prevState === 'floating') {
        maxZRef.current += 1;
        const entry = registry.get(panel.component);
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
        const entry = registry.get(panel.component);
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
          const targetLeafId = findFirstLeafId(prev.gridRoot) || 'group-default';
          return {
            ...prev,
            minimized: nextMinimized,
            gridRoot: addPanelToLeaf(prev.gridRoot, targetLeafId, id),
            panels: { ...prev.panels, [id]: { ...panel, state: 'docked' } }
          };
        }
      }
    });
    if (wasMinimized) eventBusRef.current.publish('panel:restored', { id });
  }, [getCascadedPosition]);

  const floatPanel = useCallback((id: string, rect?: { x: number; y: number; width: number; height: number }) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const registryEntry = registry.get(panel.component);
      if (registryEntry?.defaultOptions?.canDrag === false) {
        return prev;
      }

      const entry = registry.get(panel.component);
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
      const leafId = targetLeafId || findFirstLeafId(cleanRoot || prev.gridRoot) || 'group-default';

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
    position: SplitDirection
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

  const dockPanelToGroup = useCallback((id: string, targetLeafId: string, position: DropPosition) => {
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

  const dockPanelToWorkspaceEdge = useCallback((id: string, position: SplitDirection) => {
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
      gridRoot: stateRef.current.gridRoot,
      floating: stateRef.current.floating,
      minimized: stateRef.current.minimized,
      panels: stateRef.current.panels
    });
  }, []);

  const loadLayout = useCallback((layoutJson: string): boolean => {
    try {
      const parsed = JSON.parse(layoutJson);
      if (parsed.gridRoot && parsed.floating && parsed.minimized && parsed.panels) {
        const firstActive = Object.keys(parsed.panels)[0] || null;
        setState(prev => ({
          ...prev,
          gridRoot: parsed.gridRoot,
          floating: parsed.floating,
          minimized: parsed.minimized,
          panels: parsed.panels,
          draggedPanelId: null,
          activePanelId: firstActive
        }));
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to parse layout configuration:', e);
      return false;
    }
  }, []);

  const setActivePanel = useCallback((id: string | null) => {
    setState(prev => {
      if (prev.activePanelId === id) return prev;
      return { ...prev, activePanelId: id };
    });
  }, []);

  const setDirection = useCallback((dir: 'ltr' | 'rtl') => {
    setState(prev => {
      if (prev.dir === dir) return prev;
      return { ...prev, dir, isRtl: dir === 'rtl' };
    });
  }, []);

  const isOpen = useCallback((id: string) => id in stateRef.current.panels, []);

  const getOpenPanelIds = useCallback(() => Object.keys(stateRef.current.panels), []);

  useEffect(() => {
    if (effectiveDir) {
      setState(prev => {
        if (prev.dir === effectiveDir) return prev;
        return { ...prev, dir: effectiveDir, isRtl: effectiveDir === 'rtl' };
      });
    }
  }, [effectiveDir]);

  const customMenuGettersRef = useRef<Map<string, () => ContextMenuItem[]>>(new Map());

  const registerPanelContextMenu = useCallback(
    (panelId: string, getItems: () => ContextMenuItem[]) => {
      customMenuGettersRef.current.set(panelId, getItems);
      return () => { customMenuGettersRef.current.delete(panelId); };
    }, []
  );

  const getPanelContextMenuItems = useCallback(
    (panelId: string): ContextMenuItem[] =>
      customMenuGettersRef.current.get(panelId)?.() ?? [],
    []
  );

  const actions = useMemo<InternalWindowActions>(() => ({
    openPanel,
    closePanel,
    minimizePanel,
    restorePanel,
    floatPanel,
    dockPanel,
    maximizePanel,
    updateSplitSizes,
    updateFloatingPosition,
    focusPanel,
    isOpen,
    getOpenPanelIds,
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
    dockPanelToWorkspaceEdge,
    setActivePanel,
    setDirection,
    registerPanelContextMenu,
    getPanelContextMenuItems
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
    focusPanel,
    isOpen,
    getOpenPanelIds,
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
    dockPanelToWorkspaceEdge,
    setActivePanel,
    setDirection,
    registerPanelContextMenu,
    getPanelContextMenuItems
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

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    // Check 1: styles.css sentinel — catches the "forgot to import" case precisely
    try {
      const sentinel = getComputedStyle(document.documentElement)
        .getPropertyValue('--rdd-styles-loaded').trim();
      if (sentinel !== '1') {
        console.error(
          "[react-dockable-desktop] styles.css is not imported.\n" +
          "Add this to your entry file (main.tsx / index.tsx):\n" +
          "  import 'react-dockable-desktop/styles.css'\n" +
          "Without it the workspace renders as a black screen with no console errors."
        );
      }
    } catch { /* getComputedStyle unavailable (SSR) */ }

    // Check 2: replace-react-contexify CSS — context menus need this stylesheet
    let found = false;
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          if (rules.some((r: CSSRule) => r.cssText?.includes('react-contexify'))) {
            found = true;
            break;
          }
        } catch { /* CORS-restricted stylesheet — skip */ }
      }
    } catch { /* document.styleSheets unavailable (SSR) */ }
    if (!found) {
      console.warn(
        '[react-dockable-desktop] replace-react-contexify CSS not detected. ' +
        'Context menus may not render correctly.\n' +
        'Add: import "replace-react-contexify/dist/ReactContexify.css"'
      );
    }
  }, []);

  useEffect(() => {
    if (client) {
      client._connect(actions);
      return () => { client._disconnect(); };
    }
  }, [client, actions]);

  const syncContextValue = useMemo<WindowStoreSyncContextValue>(
    () => ({ getSnapshot, subscribeToState }),
    [getSnapshot, subscribeToState]
  );

  return (
    <StyleClassContext.Provider value={styleClasses}>
      <RegistryContext.Provider value={registry}>
        <WindowStoreSyncContext.Provider value={syncContextValue}>
          <WindowStateContext.Provider value={state}>
            <WindowActionsContext.Provider value={actions}>
              <WindowI18nContext.Provider value={effectiveFormatMessage || defaultFormatMessage}>
                <WindowPredefinedMessagesContext.Provider value={mergedMessages}>
                  {children}
                </WindowPredefinedMessagesContext.Provider>
              </WindowI18nContext.Provider>
            </WindowActionsContext.Provider>
          </WindowStateContext.Provider>
        </WindowStoreSyncContext.Provider>
      </RegistryContext.Provider>
    </StyleClassContext.Provider>
  );
};

/**
 * React hook to subscribe to the live {@link WindowState} inside a component.
 * The component re-renders whenever the state changes.
 *
 * For imperative reads without a subscription, use {@link WorkspaceClient} methods
 * like `isOpen()` and `getOpenPanelIds()` instead.
 *
 * @group Hooks
 * @returns The current workspace state tree.
 * @throws Error if used outside of a {@link WindowManagerProvider}.
 * @example
 * ```tsx
 * function PanelList() {
 *   const { panels } = useWindowManagerState();
 *   return <ul>{Object.keys(panels).map(id => <li key={id}>{id}</li>)}</ul>;
 * }
 * ```
 */
const noopSubscribe = (_cb: () => void): (() => void) => () => {};

export function useWindowManagerState(): WindowState;
export function useWindowManagerState<T>(selector: (state: WindowState) => T): T;
export function useWindowManagerState<T>(selector?: (state: WindowState) => T): WindowState | T {
  const stateCtx = useContext(WindowStateContext);
  const syncCtx = useContext(WindowStoreSyncContext);
  const selectorRef = useRef<((state: WindowState) => T) | undefined>(selector);
  selectorRef.current = selector;

  const syncResult = useSyncExternalStore(
    selector ? (syncCtx?.subscribeToState ?? noopSubscribe) : noopSubscribe,
    (): T => {
      const snap = syncCtx?.getSnapshot() ?? stateCtx!;
      return (selectorRef.current ? selectorRef.current(snap) : snap) as T;
    },
    (): T => {
      const snap = syncCtx?.getSnapshot() ?? stateCtx!;
      return (selectorRef.current ? selectorRef.current(snap) : snap) as T;
    }
  );

  if (!stateCtx) throw new Error('useWindowManagerState must be used within WindowManagerProvider');
  if (!selector) return stateCtx;
  return syncResult;
}

/**
 * React hook to retrieve all layout mutation actions.
 * Returns the public {@link WindowActions} interface.
 *
 * @group Hooks
 * @returns The full set of workspace mutation methods.
 * @throws Error if used outside of a {@link WindowManagerProvider}.
 * @example
 * ```tsx
 * function Toolbar() {
 *   const actions = useWindowManagerActions();
 *   return (
 *     <button onClick={() => actions.openPanel('map-1', 'map')}>Open Map</button>
 *   );
 * }
 * ```
 */
export const useWindowManagerActions = (): WindowActions => {
  const ctx = useContext(WindowActionsContext);
  if (!ctx) throw new Error('useWindowManagerActions must be used within WindowManagerProvider');
  return ctx;
};

/**
 * @internal — used by WindowManager.tsx rendering components only.
 * Returns the full {@link InternalWindowActions} including `setActivePanel`.
 */
export const useWindowManagerActionsInternal = (): InternalWindowActions => {
  const ctx = useContext(WindowActionsContext);
  if (!ctx) throw new Error('useWindowManagerActionsInternal must be used within WindowManagerProvider');
  return ctx;
};

/**
 * React hook to retrieve the active i18n formatter.
 */
export const useFormatMessage = (): MessageFormatter => {
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
export const usePanelContext = (): Pick<WindowActions, 'publish' | 'subscribe'> => {
  const { publish, subscribe } = useWindowManagerActions();
  return { publish, subscribe };
};

/**
 * React hook to fetch the localizable predefined message map catalog.
 */
export const usePredefinedMessages = (): Record<PredefinedMessageKey, ContextMenuPredefinedMessage> => {
  return useContext(WindowPredefinedMessagesContext);
};

/**
 * React hook to retrieve the panel instance ID for the component currently rendered inside
 * the dockable desktop. Works for docked, floating, modal, and side-panel containers.
 * Opt-in — components that don't need the ID require no changes.
 *
 * @group Hooks
 * @returns The unique panel instance ID string.
 * @example
 * ```tsx
 * function MyPanel() {
 *   const panelId = usePanelId();
 *   const { closePanel } = useWindowManagerActions();
 *   return <button onClick={() => closePanel(panelId)}>Close</button>;
 * }
 * ```
 */
export const usePanelId = (): string => useFormContainer().instanceId;

/**
 * React hook for injecting custom context menu items into a panel's context menu from inside the panel component.
 * Items are dynamic — the array is re-read each time the menu opens, so state-driven changes (enable/disable, add/remove) work automatically.
 * The hook reads the panel ID internally via {@link usePanelId} — no prop needed.
 *
 * @param items - Array of `ContextMenuItem` entries (simple items, separators, submenus).
 * @example
 * ```tsx
 * import { usePanelContextMenu } from 'dockable-windows';
 *
 * function MyPanel() {
 *   const [dirty, setDirty] = useState(false);
 *   usePanelContextMenu([
 *     { label: 'Save', action: () => save() },
 *     { label: 'Revert', action: () => revert() },
 *   ]);
 *   return <Editor onChange={() => setDirty(true)} />;
 * }
 * ```
 */
export function usePanelContextMenu(items: ContextMenuItem[]): void {
  const ctx = useContext(WindowActionsContext);
  const panelId = usePanelId();
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!ctx?.registerPanelContextMenu || !panelId) return;
    return ctx.registerPanelContextMenu(panelId, () => itemsRef.current);
  }, [panelId, ctx?.registerPanelContextMenu]);
}
