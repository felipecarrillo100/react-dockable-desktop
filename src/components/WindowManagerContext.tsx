import React, { createContext, useContext, useState, useRef, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useFormContainer } from './FormContainerContext';
import { globalPanelRegistry, type PanelRegistry } from './PanelRegistry';
import type { WorkspaceClient } from '../WorkspaceClient';
import { defaultPredefinedMessages } from './predefinedMessages';
import type { MessageKey } from './predefinedMessages';
export type { MessageKey } from './predefinedMessages';
export { defaultPredefinedMessages } from './predefinedMessages';
import type { DirtyStateOptions } from './dirtyOptions';
export type { DirtyStateOptions };
import type { ContextMenuItem, ShowContextMenuOptions } from './ContextMenu';
import { isSerializable } from './serializable';

/**
 * Structure representing localizable message descriptors used in context menus.
 */
export interface MessageDescriptor {
  /** Translation dictionary key. */
  id: string;
  /** Fallback label text if translation key is missing. */
  defaultMessage?: string;
  /** Values injected into the translated text placeholder. */
  values?: Record<string, string | number>;
}

/** Function type interface responsible for resolving localizable messages to flat strings. */
export type MessageFormatter = (msg: MessageDescriptor) => string;

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
 * Corner of the workspace a floating window can be pinned to.
 *
 * When `anchor` is set on a `FloatingWindow`, the window is positioned
 * relative to that corner using CSS `right`/`left` + `top`/`bottom` and
 * stacks with other windows sharing the same anchor (8 px gap, uncapped).
 * Dragging a window away from its corner clears the anchor and returns it
 * to free-float mode. The value is RTL-aware — `'top-left'` always means the
 * logical start corner regardless of document direction.
 */
export type FloatAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

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
  /** Corner of the workspace this window is pinned to, or null when free-floating. */
  anchor?: FloatAnchor | null;
}

/**
 * Stores active runtime properties and status metadata for individual panel instances.
 */
export interface PanelInfo {
  /** Unique panel identifier. */
  id: string;
  /** Plain text label or localizable message descriptor. */
  title: string | MessageDescriptor;
  /** String matching the component registration ID in the workspace's {@link PanelRegistry}. */
  component: string;
  /** Current workspace placement mode. */
  state: 'docked' | 'floating' | 'minimized';
  /** Last state held before panel was minimized. */
  previousState?: 'docked' | 'floating';
  /** Saved position boundaries used when returning the panel to a floating state. */
  lastFloatingRect?: { x: number; y: number; width: number; height: number; anchor?: FloatAnchor | null };
  /** The leaf group ID this panel was docked in prior to being floated. */
  lastLeafId?: string;
  /** True if the panel contains unsaved user edits. */
  dirty?: boolean;
  /** Custom options applied to the automatic unsaved changes modal. */
  dirtyOptions?: DirtyStateOptions;
  /** Custom per-instance data passed via `openPanel(id, component, { props })`. Unconstrained —
   *  any value is accepted, but only a value that passes {@link isSerializable} is actually
   *  included in {@link WorkspaceActions.saveLayout}'s output. See {@link PanelInfo.serializable}. */
  props?: Record<string, unknown>;
  /** Whether this panel's current `props` can round-trip through `saveLayout()`/`loadLayout()`.
   *  Computed automatically — `true` when no `props` were passed, or when they were and passed
   *  {@link isSerializable}. A panel with `serializable: false` still renders and works normally;
   *  it's simply excluded from the next `saveLayout()` call (and pruned from `gridRoot`/
   *  `floating`/`minimized` in that saved snapshot) rather than corrupting or throwing. */
  serializable: boolean;
  /** Optional dedup key. If another open panel of the same `component` already has this exact
   *  key, `openPanel` focuses that existing panel instead of creating a new one — see
   *  {@link WorkspaceActions.openPanel}'s `dedupeKey` option and {@link WorkspaceActions.findPanelId}. */
  dedupeKey?: string;
}

/**
 * Options accepted by {@link WorkspaceActions.openPanel}.
 */
export interface OpenPanelOptions<P extends object = Record<string, unknown>> {
  /** Override the panel tab/window title. Accepts a plain string or an i18n message descriptor. */
  title?: string | MessageDescriptor;
  /** Initial placement: `'floating'`, `'docked'` (default when a grid exists), or `'tabbed'`. */
  initialTarget?: 'floating' | 'docked' | 'tabbed';
  /** Pin the new floating window to a workspace corner on creation. Has no effect when
   *  `initialTarget` is `'docked'` or `'tabbed'`. */
  anchor?: FloatAnchor | null;
  /** Set `state.activePanelId` to this panel. @default true */
  focus?: boolean;
  /**
   * Custom per-instance data spread onto the panel component alongside `panelId`, matching
   * `openModal`/`openLeftPanel`/`openRightPanel`'s already-unconstrained `props` argument — no
   * type restriction here either. Whether a specific value round-trips through `saveLayout()` is
   * a runtime fact, not a type-level guarantee: see {@link PanelInfo.serializable} and the
   * `'layout:panels-excluded'` event.
   */
  props?: P;
  /**
   * If set, and another currently-open panel of the same `component` already has this exact
   * `dedupeKey`, that existing panel is focused instead of opening a new one — the `id`/`props`
   * passed to *this* call are ignored in that case, the same way re-opening an already-open exact
   * `id` already focuses it instead of duplicating it. Use this when multiple call sites might
   * not agree on the same literal `id` for what is semantically the same entity (e.g. "the panel
   * for the document at this path"). See also {@link WorkspaceActions.findPanelId}.
   */
  dedupeKey?: string;
}

/**
 * Global window manager state tree representing grid nodes, windows, and panels.
 */
export interface WorkspaceState {
  /** Root branch node representing the grid. */
  gridRoot: LayoutNode;
  /** Array of active floated windows. */
  floating: FloatingWindow[];
  /** Array of minimized panels waiting in the taskbar dock. */
  minimized: { id: string; title: string | MessageDescriptor; component: string }[];
  /** Map indexing panel metadata descriptors. */
  panels: Record<string, PanelInfo>;
  /** The ID of the panel tab currently being dragged. */
  draggedPanelId: string | null;
  /**
   * The ID of the active/focused panel — the one contributions are read from
   * (see `useActiveContribution`) and the one drawn with focused chrome.
   *
   * Always a panel the user can actually see: the selected tab of its leaf, or a floating
   * window. Never a minimized panel, except when an app explicitly calls `focusPanel()` on
   * one. Restored layouts resolve it from the saved snapshot's own `activePanelId`, falling
   * back to the first leaf's selected tab — never to an arbitrary entry in `panels`.
   */
  activePanelId: string | null;
  /** Current layout direction ('ltr' or 'rtl') */
  dir: 'ltr' | 'rtl';
  /** Convenient boolean flag indicating RTL direction */
  isRtl: boolean;
  /** Split ratio for panel cross-target drops (0.1–0.9). Default 0.5. */
  splitRatio: number;
  /** Split ratio for workspace outer-edge drops (0.1–0.9). Default 0.2. */
  edgeSplitRatio: number;
}

/**
 * Every layout action, the event bus, and layout serialization — the methods of a workspace.
 *
 * Call them on the workspace from `useWorkspace()` inside a component, or on the object
 * `createWorkspace()` returned, from anywhere.
 *
 * @example
 * ```tsx
 * function OpenMapButton() {
 *   const { openPanel } = useWorkspace();
 *   return <button onClick={() => openPanel('map-1', 'map')}>Open Map</button>;
 * }
 * ```
 */
export interface WorkspaceActions {
  /**
   * Opens a registered panel into the workspace.
   * If the panel ID is already open, the panel is focused instead of duplicated.
   * Becomes `state.activePanelId` by default — pass `options.focus: false` to open
   * without stealing focus from whatever is currently active.
   * @param id - Unique instance identifier for this panel.
   * @param component - Component key registered in the panel catalog.
   * @param options.title - Override the panel tab/window title. Accepts a plain string or an i18n message descriptor.
   * @param options.initialTarget - Initial placement: `'floating'`, `'docked'` (default when a grid exists), or `'tabbed'`.
   * @param options.anchor - Pin the new floating window to a workspace corner on creation. Has no effect when `initialTarget` is `'docked'` or `'tabbed'`.
   * @param options.focus - Set `state.activePanelId` to this panel. @default true
   * @param options.props - Custom per-instance data spread onto the component alongside `panelId`. Unconstrained, like `openModal`/`openLeftPanel`/`openRightPanel`'s `props` — see {@link PanelInfo.serializable} for what determines whether it survives `saveLayout()`.
   * @param options.dedupeKey - If another open panel of the same `component` already has this key, that panel is focused instead of opening a new one.
   * @example
   * ```ts
   * // Open floating and pin to the top-right corner:
   * actions.openPanel('layers', 'layertree', { initialTarget: 'floating', anchor: 'top-right' });
   *
   * // Open in the background without stealing focus:
   * actions.openPanel('prefetch', 'report', { focus: false });
   *
   * // Open with per-instance data, deduped by document path:
   * actions.openPanel(crypto.randomUUID(), 'document', {
   *   props: { path: '/notes/todo.md' },
   *   dedupeKey: '/notes/todo.md',
   * });
   * ```
   */
  openPanel: <P extends object = Record<string, unknown>>(id: string, component: string, options?: OpenPanelOptions<P>) => void;
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
   * @param options.focus - Set `state.activePanelId` to the restored panel. @default true
   */
  restorePanel: (id: string, options?: { focus?: boolean }) => void;
  /**
   * Detaches a docked panel, converting it to a resizable floating window.
   * @param id - Panel instance ID.
   * @param rect - Optional initial position and size. Omit to use the last known position or a cascaded default.
   * @param anchor - Optional corner to pin the new floating window to. Omit (or pass `null`) for free-float.
   */
  floatPanel: (id: string, rect?: { x: number; y: number; width: number; height: number }, anchor?: FloatAnchor | null) => void;
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
   * @param updates - Partial update to `x`, `y`, `width`, `height`, or `anchor`.
   */
  updateFloatingPosition: (id: string, updates: Partial<Pick<FloatingWindow, 'x' | 'y' | 'width' | 'height' | 'anchor'>>) => void;
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
   * Finds the ID of an already-open panel of the given `component` with a matching `dedupeKey`
   * (set via `openPanel`'s `dedupeKey` option). Uses a synchronous `stateRef` read — safe to
   * call outside of render.
   * @param component - Component key registered in the panel catalog.
   * @param dedupeKey - The dedup key to search for.
   * @returns The matching panel's ID, or `null` if none is open.
   */
  findPanelId: (component: string, dedupeKey: string) => string | null;
  /**
   * Serializes the entire workspace state to a JSON string.
   * Includes grid layout, floating window positions, minimized panels, panel metadata, and the
   * globally active panel (see {@link SerializedLayout.activePanelId}).
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
   *
   * `state.activePanelId` is resolved from the snapshot's own `activePanelId` when that panel is
   * still visible in it, and otherwise from the first leaf's selected tab (which is also the path
   * layouts saved before that field existed take). It is never seeded from an arbitrary entry in
   * `panels`.
   *
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
   * Closes a leaf group: each of its panels is closed through the guarded close path (as if by
   * its own tab ×), then the group is removed once empty. A close guard that refuses, or a dirty
   * panel that `onConfirm` doesn't approve, keeps that panel — and therefore the group.
   * A group with `canClose: false` is left alone.
   * @param leafId - Leaf node ID to close.
   * @param options.onConfirm - Asked for each dirty panel; resolve `true` to discard its changes.
   * @returns Resolves once every close request has been settled.
   */
  closeLeafGroup: (leafId: string, options?: { onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }) => Promise<void>;
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
   * Registers a callback reporting a docked/floating panel's *current* restorable state, pulled
   * fresh every `saveLayout()` call — for panels whose props alone can't capture state they
   * accumulate after opening (scroll position, an in-progress edit, a view-mode toggle). A panel
   * that registers nothing keeps its static open-time `props` (or none). The returned value goes
   * through the same {@link isSerializable} check as static props, re-evaluated on every save —
   * a provider-backed panel's serializability can flip over its lifetime.
   * @param id - Panel instance ID.
   * @param provider - Called synchronously at each `saveLayout()`; return the current state (or
   * `undefined` to fall back to the static `props` this panel was opened with).
   */
  registerStateProvider: (id: string, provider: () => unknown) => void;
  /**
   * Removes a previously registered state provider.
   * @param id - Panel instance ID.
   */
  unregisterStateProvider: (id: string) => void;
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
  updatePanelTitle: (id: string, title: string | MessageDescriptor) => void;
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
  /**
   * Imperatively shows the workspace context menu at the given position.
   * Uses the workspace's context menu (the `contextMenuAdapter` given to
   * `<DockableDesktopProvider>`, or an enclosing `<RddContextMenu>`).
   */
  showContextMenu: (options: ShowContextMenuOptions) => void;
}

/**
 * Extension of {@link WorkspaceActions} used internally by WindowManager components.
 * `setActivePanel` is not part of the public API — it is a low-level tab-focus
 * primitive used exclusively within this library's rendering layer.
 * @internal
 */
export interface InternalWindowActions extends WorkspaceActions {
  /** @internal */
  setActivePanel: (id: string | null) => void;
  /** @internal */
  registerPanelContextMenu: (panelId: string, getItems: () => ContextMenuItem[]) => () => void;
  /** @internal */
  getPanelContextMenuItems: (panelId: string) => ContextMenuItem[];
  /** @internal */
  registerContextMenuFn: (fn: (options: ShowContextMenuOptions) => void) => () => void;
}

export const WindowStateContext: React.Context<WorkspaceState | null> = createContext<WorkspaceState | null>(null);
const WindowActionsContext = createContext<InternalWindowActions | null>(null);
const WindowI18nContext = createContext<MessageFormatter | null>(null);

interface WindowStoreSyncContextValue {
  getSnapshot: () => WorkspaceState;
  subscribeToState: (callback: () => void) => () => void;
}
/** @internal Snapshot + subscribe for selector hooks (`useWorkspaceState(selector)`, `usePanel`). */
export const WindowStoreSyncContext: React.Context<WindowStoreSyncContextValue | null> = createContext<WindowStoreSyncContextValue | null>(null);

const WindowPredefinedMessagesContext = createContext<Record<MessageKey, MessageDescriptor>>(defaultPredefinedMessages);

/** Represents custom CSS classes injected into layout parts. */
export interface HostClasses {
  modalClass?: string;
  modalBodyClass?: string;
  sidePanelClass?: string;
  sidePanelBodyClass?: string;
  windowClass?: string;
  windowBodyClass?: string;
}

const StyleClassContext = createContext<HostClasses>({});

/** Custom hook to read configured style class contexts. */
export const useStyleClasses = (): HostClasses => useContext(StyleClassContext);

const RegistryContext = createContext<PanelRegistry>(globalPanelRegistry);

/**
 * React hook to read the scoped {@link PanelRegistry} for the current provider.
 * When the provider was given a workspace from {@link createWorkspace}, this returns that workspace's
 * private registry. Otherwise it returns the global `globalPanelRegistry` singleton.
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
export const useRegistry = (): PanelRegistry => useContext(RegistryContext);

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

/** The on-disk shape produced by `saveLayout()` and accepted by `loadLayout()`/`initialState`. */
export interface SerializedLayout {
  /** Schema version — absent on layouts saved before this field was introduced (treated as 0). */
  version?: number;
  /**
   * The globally active panel at save time — the one the user was actually looking at.
   *
   * Omitted when nothing was active, and when the active panel didn't survive this snapshot's
   * serializability pruning (see {@link WorkspaceActions.saveLayout}) — so it never names a panel
   * absent from this payload's own `panels`. Absent on every layout saved before this field
   * existed, in which case the restore derives it from `gridRoot`'s own per-leaf selection
   * instead; a present-but-no-longer-valid value falls back to the same derivation. `version`
   * is deliberately not bumped for this: the field is optional and its absence is a supported,
   * fully-handled case rather than a schema a migration has to branch on.
   */
  activePanelId?: string | null;
  gridRoot: LayoutNode;
  floating: FloatingWindow[];
  minimized: { id: string; title: string | MessageDescriptor; component: string }[];
  panels: Record<string, PanelInfo>;
}

type ParsedLayoutPayload = Pick<SerializedLayout, 'gridRoot' | 'floating' | 'minimized' | 'panels'> & {
  /** Resolved by `parseLayoutPayload` — the persisted value when still valid, else derived. */
  activePanelId: string | null;
};

/** The subset of a layout needed to reason about which panel is visibly active. */
type ActiveTargetScope = Pick<SerializedLayout, 'gridRoot' | 'floating' | 'panels'>;

/**
 * Whether `id` names a panel the user can actually see, and which may therefore be the globally
 * active one: the selected tab of some leaf, or a floating window. A minimized panel never
 * qualifies — it stays mounted (see the persistence port in `WindowManager.tsx`), so leaving it
 * active would keep routing `useActiveContribution()` to a panel that isn't on screen.
 *
 * Used both to validate a persisted `activePanelId` on load and to guard the one written by
 * `saveLayout`, so the two directions can't disagree about what "active" is allowed to mean.
 */
function isVisibleActiveTarget(id: string, scope: ActiveTargetScope): boolean {
  const info = scope.panels[id];
  if (!info || info.state === 'minimized') return false;
  if (scope.floating.some(w => w.id === id)) return true;
  const isLeafSelection = (node: LayoutNode): boolean =>
    node.type === 'leaf'
      ? node.activePanelId === id
      : node.children.some(isLeafSelection);
  return scope.gridRoot ? isLeafSelection(scope.gridRoot) : false;
}

/**
 * Derives the globally active panel for a restored layout.
 *
 * Replaces the original `Object.keys(panels)[0]` seed, which picked the first key of a flat,
 * insertion-ordered record that knows nothing about tab order or docked/floating/minimized — so
 * unless the user happened to have the first-opened panel selected when they saved, the workspace
 * came back with one panel visible and a *different*, invisible one marked active. Every
 * `LayoutLeafNode` already persists its own `activePanelId`, so the answer was on disk all along.
 *
 * Order:
 *   1. The first leaf in document order whose own selected tab is a valid target.
 *   2. Otherwise the frontmost (highest `z`) floating window — matching `focusPanel`'s own
 *      "highest z is on top" rule, and keeping float-only layouts from restoring with nothing
 *      active at all.
 *   3. Otherwise `null`.
 *
 * Depth-first, not breadth-first: for a grid whose first child is itself a split, a level-by-level
 * walk reaches the *second* child's leaf before the first child's leaves and picks the wrong tab.
 * Mirrors `findFirstLeafId`'s traversal shape for exactly that reason.
 */
function deriveActivePanelId(scope: ActiveTargetScope): string | null {
  const isCandidate = (id: string | null): boolean =>
    id !== null && !!scope.panels[id] && scope.panels[id].state !== 'minimized';

  const fromLeaves = (node: LayoutNode): string | null => {
    if (node.type === 'leaf') {
      return isCandidate(node.activePanelId) ? node.activePanelId : null;
    }
    for (const child of node.children) {
      const found = fromLeaves(child);
      if (found) return found;
    }
    return null;
  };

  const selected = scope.gridRoot ? fromLeaves(scope.gridRoot) : null;
  if (selected) return selected;

  let frontmost: FloatingWindow | null = null;
  for (const w of scope.floating) {
    if (!isCandidate(w.id)) continue;
    if (!frontmost || w.z > frontmost.z) frontmost = w;
  }
  return frontmost?.id ?? null;
}

/**
 * The globally active panel after a placement action (float / dock / move / close-group).
 *
 * Those actions change which tab a leaf shows without going through `focusPanel`, and each one
 * used to leave `activePanelId` wherever it was — often on a tab the move had just hidden, so the
 * visible tab rendered unfocused and `useActiveContribution()` kept serving the hidden
 * panel's controls. The moved panel is what the user just acted on, so it wins when it is
 * visible; otherwise the previous active panel is kept if it still is; otherwise it is derived.
 */
function resolveActivePanelId(
  next: ActiveTargetScope & { activePanelId: string | null },
  preferId: string | null,
): string | null {
  if (preferId && isVisibleActiveTarget(preferId, next)) return preferId;
  if (next.activePanelId && isVisibleActiveTarget(next.activePanelId, next)) return next.activePanelId;
  return deriveActivePanelId(next);
}

/**
 * Shared shape-check + migration for a parsed (but not yet validated) layout payload,
 * used by both `parseInitialState` (the `initialState`/`createWorkspace({ initialState })`
 * entry point) and `loadLayout` — previously these duplicated the check independently
 * and only one of them ran the stickyRight/stickyBottom migration, so a layout fed
 * through `initialState` silently skipped it. `version` is read but not yet branched on
 * — it's read here so a future migration has a version to gate on without needing
 * another ad hoc field-presence sniff like this one.
 *
 * Also resolves `activePanelId`, for the same reason the shape-check lives here: both entry
 * points need it and previously seeded it themselves, identically wrongly, in two places.
 */
/**
 * Heal a saved layout that names the same panel twice, or names none of them.
 *
 * Until 6.3.1, dropping a lone docked panel onto its own group put that panel in two leaves,
 * and `saveLayout()` wrote the result out — so the duplicate came back on every reload, for
 * good. Repairing on read means a layout stored by an affected version loads clean with
 * nothing asked of the application. It changes only what is *read*: `saveLayout()`'s output
 * format is untouched.
 *
 * Four repairs, in order: a panel id that appears in more than one leaf is kept in the first
 * one only; a leaf emptied by that keeps existing only if it asked to (`keepOnEmpty`); a
 * branch left with one child collapses into it, with sizes re-normalised; and a panel the
 * layout says is docked but that no leaf lists is appended to the first leaf, since "open but
 * in no group" renders nothing and cannot be reached.
 */
function repairLayoutTree(
  gridRoot: LayoutNode,
  panels: Record<string, PanelInfo>
): { gridRoot: LayoutNode; repairs: string[] } {
  const repairs: string[] = [];
  const seen = new Set<string>();

  const walk = (node: LayoutNode): LayoutNode | null => {
    if (node.type === 'leaf') {
      const kept = node.panels.filter(panelId => {
        if (seen.has(panelId)) {
          repairs.push(`panel "${panelId}" was listed in more than one group`);
          return false;
        }
        seen.add(panelId);
        return true;
      });
      if (kept.length === node.panels.length) return node;
      if (kept.length === 0 && !node.keepOnEmpty) return null;
      const activePanelId = node.activePanelId && kept.includes(node.activePanelId)
        ? node.activePanelId
        : (kept[0] ?? null);
      return { ...node, panels: kept, activePanelId };
    }

    const children = node.children.map(walk).filter((c): c is LayoutNode => c !== null);
    // Identity, not count: a child can survive the walk and still have been repaired inside.
    // Comparing lengths alone returned the original branch and discarded those repairs.
    if (children.length === node.children.length && children.every((c, i) => c === node.children[i])) {
      return node;
    }
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    const sizes = node.sizes.slice(0, children.length);
    const sum = sizes.reduce((a, b) => a + b, 0) || 1;
    return { ...node, children, sizes: sizes.map(s => s / sum) };
  };

  let root = walk(gridRoot) || EMPTY_LEAF;

  const orphans = Object.values(panels).filter(p => p.state === 'docked' && !seen.has(p.id));
  if (orphans.length > 0) {
    const attach = (node: LayoutNode): LayoutNode => {
      if (node.type === 'leaf') {
        const ids = orphans.map(p => p.id);
        return { ...node, panels: [...node.panels, ...ids], activePanelId: node.activePanelId ?? ids[0] };
      }
      return { ...node, children: [attach(node.children[0]), ...node.children.slice(1)] };
    };
    for (const orphan of orphans) {
      repairs.push(`panel "${orphan.id}" is docked but was in no group`);
    }
    root = attach(root);
  }

  return { gridRoot: root, repairs };
}

function parseLayoutPayload(parsed: any): ParsedLayoutPayload | null {
  if (!parsed || !parsed.gridRoot || !Array.isArray(parsed.floating) || !Array.isArray(parsed.minimized) || !parsed.panels) {
    return null;
  }
  // const version = typeof parsed.version === 'number' ? parsed.version : 0; // reserved for future migrations
  const floating = (parsed.floating as any[]).map((fw: any) => {
    if ('stickyRight' in fw || 'stickyBottom' in fw) {
      const anchor: FloatAnchor | null = fw.stickyRight && fw.stickyBottom ? 'bottom-right'
        : fw.stickyRight ? 'top-right'
        : fw.stickyBottom ? 'bottom-left'
        : null;
      const { stickyRight: _sr, stickyBottom: _sb, ...rest } = fw;
      return { ...rest, anchor };
    }
    return fw;
  });
  // Repair before anything reads the tree: activePanelId resolution below asks which panels
  // are visible, and a duplicated or orphaned panel would make that answer meaningless.
  const repaired = repairLayoutTree(parsed.gridRoot as LayoutNode, parsed.panels as Record<string, PanelInfo>);
  if (repaired.repairs.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn(
      `[react-dockable-desktop] Repaired the saved layout on load: ${repaired.repairs.join('; ')}. ` +
      `Layouts saved by versions before 6.3.1 can contain this — dropping a lone docked panel ` +
      `onto its own group duplicated it — and the repair is applied every time it is read, so ` +
      `saving again from this session stores the corrected layout.`
    );
  }
  const gridRoot = repaired.gridRoot;
  const scope: ActiveTargetScope = { gridRoot, floating, panels: parsed.panels };

  // A persisted value wins when it still names a visible panel; anything stale (the panel was
  // closed, minimized, or pruned from this snapshot) falls back to deriving from the grid, which
  // is also the path every pre-`activePanelId` layout takes.
  const persisted = typeof parsed.activePanelId === 'string' ? parsed.activePanelId : null;
  let activePanelId: string | null = null;
  if (persisted !== null) {
    if (isVisibleActiveTarget(persisted, scope)) {
      activePanelId = persisted;
    } else if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[react-dockable-desktop] Ignoring the saved layout's activePanelId ("${persisted}") — ` +
        `it doesn't name a currently visible panel (it may have been closed, minimized, or ` +
        `excluded from the snapshot as non-serializable). Falling back to the selected tab of ` +
        `the first leaf in the grid.`
      );
    }
  }
  if (activePanelId === null) activePanelId = deriveActivePanelId(scope);

  return { gridRoot, floating, minimized: parsed.minimized, panels: parsed.panels, activePanelId };
}

function parseInitialState(json: string | null): Pick<WorkspaceState, 'gridRoot' | 'floating' | 'minimized' | 'panels' | 'activePanelId'> {
  if (json) {
    try {
      const payload = parseLayoutPayload(JSON.parse(json));
      if (payload) return payload;
    } catch {
      // fall through to empty canvas
    }
  }
  return { gridRoot: EMPTY_LEAF, floating: [], minimized: [], panels: {}, activePanelId: null };
}

/**
 * Props for `<DockableDesktopProvider>`.
 * Also exported as `DockableDesktopProviderProps` for consumers who use
 * the composite provider.
 * @see DockableDesktopProviderProps
 */
export interface WindowManagerProviderProps {
  children: React.ReactNode;
  /** Workspace created with `createWorkspace()` outside the React tree. When provided, its panel
   *  registry and config take precedence over the individual props below. */
  client?: WorkspaceClient;
  /** Custom i18n formatter. Receives a `{ id, defaultMessage }` descriptor and returns
   *  the translated string. When omitted, `defaultMessage` is used as-is. */
  formatMessage?: MessageFormatter;
  /** Override the built-in predefined UI strings (confirm button labels, close tooltips, etc.).
   *  Merge with or replace `defaultMessages` to localise system strings. */
  predefinedMessages?: Record<string, MessageDescriptor>;
  /** Layout direction. `'rtl'` mirrors all controls, tab order, and drop zones.
   *  Can also be changed at runtime via `workspace.setDirection()`. @default 'ltr' */
  dir?: 'ltr' | 'rtl';
  /** CSS class applied to the outer wrapper element of every modal overlay. */
  modalClass?: string;
  /** CSS class applied to the inner content area of every modal overlay. */
  modalBodyClass?: string;
  /** CSS class applied to the outer wrapper of left/right side-panel drawers. */
  sidePanelClass?: string;
  /** CSS class applied to the inner content area of side-panel drawers. */
  sidePanelBodyClass?: string;
  /** CSS class applied to the outer wrapper of floating panel windows. */
  windowClass?: string;
  /** CSS class applied to the inner content area of floating panel windows. */
  windowBodyClass?: string;
  /**
   * Starting z-index for floating windows and the library's own chrome overlays
   * (context menu, toolbar flyout, modal stack, toast, workspace edge zones),
   * all of which shift together via `--rdd-z-base`. Set this above/below a host
   * app's own modal z-index range to control stacking against it. @default 1000
   */
  zIndexBase?: number;
}

/** Everything a workspace store needs from its configuration. */
export interface WorkspaceCoreConfig {
  registry: PanelRegistry;
  initialState?: string | null;
  dir?: 'ltr' | 'rtl';
  zIndexBase?: number;
  defaultSplitRatio?: number;
  defaultEdgeSplitRatio?: number;
}

/** @internal What a workspace store exposes: its actions, and a subscribable snapshot. */
export interface WorkspaceCore {
  actions: InternalWindowActions;
  getSnapshot: () => WorkspaceState;
  subscribeToState: (cb: () => void) => () => void;
  /** Provider props fill in what the workspace's own config left unset (dir, zIndexBase). */
  applyProviderDefaults: (defaults: { dir?: 'ltr' | 'rtl'; zIndexBase?: number }) => void;
}

/**
 * @internal Builds a workspace store: the layout state, every action on it, and the event bus.
 * It has no React dependency — it exists (and accepts calls) before any provider mounts, and a
 * provider only subscribes to it. See {@link createWorkspace} for the public face.
 */
export function createWorkspaceCore(config: WorkspaceCoreConfig): WorkspaceCore {
  const registry = config.registry;

  const effectiveDir = config.dir;
  const effectiveZIndexBase = config.zIndexBase ?? 1000;

  let state: WorkspaceState = (() => {
    const layout = parseInitialState(config.initialState ?? null);
    return {
      ...layout,
      draggedPanelId: null,
      dir: effectiveDir || 'ltr',
      isRtl: effectiveDir === 'rtl',
      splitRatio: Math.min(0.9, Math.max(0.1, config.defaultSplitRatio ?? 0.5)),
      edgeSplitRatio: Math.min(0.9, Math.max(0.1, config.defaultEdgeSplitRatio ?? 0.2)),
    };
  })();

  // The state lives here, outside React: actions apply immediately, before or after any provider
  // mounts, and the provider reads it through useSyncExternalStore.
  const listeners = new Set<() => void>();
  const setState = (update: WorkspaceState | ((prev: WorkspaceState) => WorkspaceState)): void => {
    const prev = state;
    const next = typeof update === 'function' ? update(prev) : update;
    if (next === prev) return;
    state = next;
    listeners.forEach(listener => listener());
  };
  // Read-only view kept under the old name, so every `stateRef.current` read sees live state.
  const stateRef = { get current(): WorkspaceState { return state; } };
  const getSnapshot = (): WorkspaceState => state;
  const subscribeToState = (cb: () => void): (() => void) => {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  };

  const closeGuardsRef: { current: Record<string, () => boolean | Promise<boolean>> } = { current: {} };
  const stateProvidersRef: { current: Record<string, () => unknown> } = { current: {} };

  const eventBusRef = { current: new PanelEventBus() };
  const maxZRef = { current: effectiveZIndexBase };

  const subscribe = (event: string, callback: (data: any) => void) => {
    return eventBusRef.current.subscribe(event, callback);
  };

  const publish = (event: string, data: any) => {
    eventBusRef.current.publish(event, data);
  };

  // Helper: Find free cascading location for floating window
  const getCascadedPosition = (
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
  };

  const focusPanel = (id: string) => {
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
  };

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

  /**
   * Is `panelId` the only panel in `leafId`?
   *
   * The question every dock reducer has to ask *before* it removes anything. Removing a
   * panel deletes an emptied leaf, so a drop onto the dragged panel's own leaf destroys the
   * very target it names — and the placement that follows has nowhere to go. Dropping a lone
   * panel onto itself is a no-op by definition: the result would be the layout it already
   * has.
   */
  const isLoneOccupant = (node: LayoutNode, leafId: string, panelId: string): boolean => {
    if (node.type === 'leaf') {
      return node.id === leafId && node.panels.length === 1 && node.panels[0] === panelId;
    }
    return node.children.some(c => isLoneOccupant(c, leafId, panelId));
  };

  /** Does `leafId` name a leaf that is actually in the tree? */
  const hasLeaf = (node: LayoutNode, leafId: string): boolean =>
    node.type === 'leaf' ? node.id === leafId : node.children.some(c => hasLeaf(c, leafId));

  const findFirstLeafId = (node: LayoutNode): string | null => {
    if (node.type === 'leaf') return node.id;
    for (const child of node.children) {
      const id = findFirstLeafId(child);
      if (id) return id;
    }
    return null;
  };

  // State transitions shared by more than one action. Each takes the previous state and returns
  // the next one (or `prev` itself when there is nothing to do), so an action can chain them
  // inside a single `setState` — maximizing a minimized panel is restore, then float, then
  // maximize, and must not render the intermediate states.

  /** Brings a minimized panel back where it was: its old floating rect, or its old group. */
  const applyRestore = (prev: WorkspaceState, id: string, activate: boolean): WorkspaceState => {
    const panel = prev.panels[id];
    if (!panel || panel.state !== 'minimized') return prev;

    const nextMinimized = prev.minimized.filter(m => m.id !== id);
    const prevState = panel.previousState || 'docked';
    // A restored panel is, by definition, visible again — so unlike the minimize path there is
    // nothing to derive: it is itself the only correct candidate. Leaving activePanelId behind
    // reproduced the 6de3381 defect class in reverse (visible tab rendered unfocused, and every
    // contributed control stayed bound to whatever replaced this panel while it was minimized).
    const nextActive = activate ? id : prev.activePanelId;
    const entry = registry.get(panel.component);

    const floatBack = (): WorkspaceState => {
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
            anchor: panel.lastFloatingRect?.anchor ?? null
          }
        ],
        panels: { ...prev.panels, [id]: { ...panel, state: 'floating' } },
        activePanelId: nextActive
      };
    };

    if (prevState === 'floating') return floatBack();

    if (panel.lastLeafId && hasLeaf(prev.gridRoot, panel.lastLeafId)) {
      return {
        ...prev,
        minimized: nextMinimized,
        gridRoot: addPanelToLeaf(prev.gridRoot, panel.lastLeafId, id),
        panels: { ...prev.panels, [id]: { ...panel, state: 'docked' } },
        activePanelId: nextActive
      };
    }
    // Leaf group ceased to exist: float it instead if floatable!
    if (entry?.defaultOptions?.canDrag !== false) return floatBack();

    // Leaf group ceased to exist but not floatable: dock into fallback leaf group
    const targetLeafId = findFirstLeafId(prev.gridRoot) || 'group-default';
    return {
      ...prev,
      minimized: nextMinimized,
      gridRoot: addPanelToLeaf(prev.gridRoot, targetLeafId, id),
      panels: { ...prev.panels, [id]: { ...panel, state: 'docked' } },
      activePanelId: nextActive
    };
  };

  /** Turns a docked panel into a floating window. Refused for `canDrag: false` panels. */
  const applyFloat = (
    prev: WorkspaceState,
    id: string,
    { rect, anchor, activate = true }: { rect?: { x: number; y: number; width: number; height: number }; anchor?: FloatAnchor | null; activate?: boolean } = {},
  ): WorkspaceState => {
    const panel = prev.panels[id];
    if (!panel) return prev;

    const entry = registry.get(panel.component);
    if (entry?.defaultOptions?.canDrag === false) return prev;

    const favPos = rect || entry?.defaultOptions?.favoritePosition || { x: 300, y: 150, width: 450, height: 350 };
    const cleanRoot = removePanelFromTree(prev.gridRoot, id);
    // Floating an already-floating panel re-places it rather than adding a second window.
    const otherWindows = prev.floating.filter(w => w.id !== id);
    maxZRef.current += 1;
    const cascaded = getCascadedPosition(favPos, otherWindows);

    const next: WorkspaceState = {
      ...prev,
      gridRoot: cleanRoot || { type: 'leaf', id: 'group-default', panels: [], activePanelId: null },
      floating: [...otherWindows, { ...cascaded, id, z: maxZRef.current, anchor: anchor ?? null }],
      panels: {
        ...prev.panels,
        [id]: { ...panel, state: 'floating' }
      }
    };
    return { ...next, activePanelId: resolveActivePanelId(next, activate ? id : null) };
  };

  /** Docks a panel into `targetLeafId`, or the first group when that id is missing. */
  const applyDock = (prev: WorkspaceState, id: string, targetLeafId?: string, activate = true): WorkspaceState => {
    const panel = prev.panels[id];
    if (!panel) return prev;

    const nextFloating = prev.floating.filter(w => w.id !== id);
    const cleanRoot = removePanelFromTree(prev.gridRoot, id) || EMPTY_LEAF;
    // The caller asked for this panel to be docked, so an id that no longer names a group
    // falls back to the first one rather than docking it nowhere. Removing the panel can
    // itself delete the requested group, which is why this is checked against `cleanRoot`.
    const requested = targetLeafId && hasLeaf(cleanRoot, targetLeafId) ? targetLeafId : undefined;
    const leafId = requested || findFirstLeafId(cleanRoot) || EMPTY_LEAF.id;

    const next: WorkspaceState = {
      ...prev,
      gridRoot: addPanelToLeaf(cleanRoot, leafId, id),
      floating: nextFloating,
      panels: {
        ...prev.panels,
        [id]: { ...panel, state: 'docked' }
      }
    };
    return { ...next, activePanelId: resolveActivePanelId(next, activate ? id : null) };
  };

  const openPanel = <P extends object = Record<string, unknown>>(id: string, component: string, options?: OpenPanelOptions<P>) => {
    // Dedup redirect: resolve to an already-open panel of the same component/dedupeKey, if any,
    // before anything else runs — the caller's own `id`/`props` are ignored for this call in
    // that case, the same way re-opening an already-open exact `id` already focuses it instead
    // of duplicating it.
    let resolvedId = id;
    if (options?.dedupeKey !== undefined) {
      const match = Object.values(stateRef.current.panels).find(
        p => p.component === component && p.dedupeKey === options.dedupeKey
      );
      if (match) resolvedId = match.id;
    }
    const isNew = !(resolvedId in stateRef.current.panels);
    const isRedirect = resolvedId !== id;
    const shouldFocus = options?.focus !== false;
    const propsProvided = options?.props !== undefined;
    const serializable = propsProvided ? isSerializable(options.props) : true;

    // Re-opening a minimized panel is a restore, and must land where `restorePanel` would: its
    // old group or floating rect. This used to re-place it from the registry's initial target
    // (the first group, or the default floating position) and publish nothing, so an autosave
    // keyed on `layout:changed` missed it. An explicit `initialTarget` still wins.
    if (stateRef.current.panels[resolvedId]?.state === 'minimized') {
      const explicitTarget = options?.initialTarget;
      setState(prev => {
        const restored = applyRestore(prev, resolvedId, shouldFocus);
        const state = restored.panels[resolvedId]?.state;
        if (explicitTarget === 'floating' && state === 'docked') {
          return applyFloat(restored, resolvedId, { activate: shouldFocus });
        }
        if (explicitTarget && explicitTarget !== 'floating' && state === 'floating') {
          return applyDock(restored, resolvedId, undefined, shouldFocus);
        }
        return restored;
      });
      eventBusRef.current.publish('panel:restored', { id: resolvedId });
      eventBusRef.current.publish('layout:changed', {});
      return;
    }

    setState(prev => {
      const exists = prev.panels[resolvedId];
      const entry = registry.get(component);
      const title = options?.title || options?.title || entry?.defaultOptions?.title || resolvedId;
      const target = options?.initialTarget || entry?.defaultOptions?.initialTarget || 'docked';
      const favPos = entry?.defaultOptions?.favoritePosition || { x: 300, y: 150, width: 450, height: 350 };
      const activePanelId = shouldFocus ? resolvedId : prev.activePanelId;

      // Case 1: Already exists (a minimized one was handled above, before this update)
      if (exists) {
        if (exists.state === 'minimized') {
          return applyRestore(prev, resolvedId, shouldFocus);
        } else if (exists.state === 'floating') {
          if (shouldFocus) focusPanel(resolvedId);
          return prev;
        } else {
          // Focus in tab group
          const selectActiveInTree = (node: LayoutNode): LayoutNode => {
            if (node.type === 'leaf') {
              if (node.panels.includes(resolvedId)) {
                return { ...node, activePanelId: resolvedId };
              }
              return node;
            } else {
              return { ...node, children: node.children.map(selectActiveInTree) };
            }
          };
          return {
            ...prev,
            gridRoot: selectActiveInTree(prev.gridRoot),
            activePanelId
          };
        }
      }

      // Case 2: New panel
      const targetState = target === 'tabbed' ? 'docked' : target;
      const newPanelInfo: PanelInfo = {
        id: resolvedId,
        title,
        component,
        state: targetState,
        props: options?.props as Record<string, unknown> | undefined,
        serializable,
        dedupeKey: options?.dedupeKey,
      };
      const nextPanels = { ...prev.panels, [resolvedId]: newPanelInfo };

      if (target === 'floating') {
        maxZRef.current += 1;
        const cascaded = getCascadedPosition(favPos, prev.floating);

        const anchor = options?.anchor ?? entry?.defaultOptions?.defaultAnchor ?? null;

        return {
          ...prev,
          floating: [...prev.floating, { ...cascaded, id: resolvedId, z: maxZRef.current, anchor }],
          panels: nextPanels,
          activePanelId
        };
      } else {
        const firstLeaf = findFirstLeafId(prev.gridRoot) || 'group-default';
        return {
          ...prev,
          gridRoot: addPanelToLeaf(prev.gridRoot, firstLeaf, resolvedId),
          panels: nextPanels,
          activePanelId
        };
      }
    });
    if (isNew) eventBusRef.current.publish('panel:opened', { id: resolvedId, component });
    if (isNew || isRedirect) eventBusRef.current.publish('layout:changed', {});
  };

  const closePanel = (id: string) => {
    const exists = id in stateRef.current.panels;
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const registryEntry = registry.get(panel.component);
      if (registryEntry?.defaultOptions?.canClose === false) {
        return prev;
      }

      delete closeGuardsRef.current[id];
      delete stateProvidersRef.current[id];

      const nextPanels = { ...prev.panels };
      delete nextPanels[id];

      const nextRoot = removePanelFromTree(prev.gridRoot, id)
        || { type: 'leaf' as const, id: 'group-default', panels: [], activePanelId: null };
      const nextFloating = prev.floating.filter(w => w.id !== id);

      // Closing the active panel used to leave `activePanelId` pointing at the panel just deleted.
      // `removePanelFromTree` has already promoted the next tab in its leaf, so re-deriving picks
      // whatever the user can now actually see.
      const nextActivePanelId = prev.activePanelId === id
        ? deriveActivePanelId({ gridRoot: nextRoot, floating: nextFloating, panels: nextPanels })
        : prev.activePanelId;

      return {
        ...prev,
        gridRoot: nextRoot,
        floating: nextFloating,
        minimized: prev.minimized.filter(m => m.id !== id),
        panels: nextPanels,
        activePanelId: nextActivePanelId
      };
    });
    if (exists) {
      eventBusRef.current.publish('panel:closed', { id });
      eventBusRef.current.publish('layout:changed', {});
    }
  };

  const registerCloseGuard = (id: string, guard: () => boolean | Promise<boolean>) => {
    closeGuardsRef.current[id] = guard;
  };

  const unregisterCloseGuard = (id: string) => {
    delete closeGuardsRef.current[id];
  };

  const registerStateProvider = (id: string, provider: () => unknown) => {
    stateProvidersRef.current[id] = provider;
  };

  const unregisterStateProvider = (id: string) => {
    delete stateProvidersRef.current[id];
  };

  const setPanelDirty = (id: string, dirty: boolean, options?: DirtyStateOptions) => {
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
  };

  const updatePanelTitle = (id: string, title: string | MessageDescriptor) => {
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
  };

  const requestClosePanel = async (id: string, options?: { force?: boolean; onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }) => {
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
  };

  const minimizePanel = (id: string) => {
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
            anchor: win.anchor ?? null
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

      const nextRoot = removePanelFromTree(prev.gridRoot, id)
        || { type: 'leaf' as const, id: 'group-default', panels: [], activePanelId: null };
      const nextFloating = prev.floating.filter(w => w.id !== id);
      const nextPanels: Record<string, PanelInfo> = {
        ...prev.panels,
        [id]: {
          ...panel,
          state: 'minimized',
          previousState: panel.state,
          lastFloatingRect,
          lastLeafId
        }
      };

      // A minimized panel is off screen but still mounted (see the persistence port in
      // WindowManager.tsx), so leaving it active kept `useActivePanelContribution()` — and every
      // contributed control — wired to a panel the user can't see. `deriveActivePanelId` skips
      // minimized panels, so this lands on whatever became visible in its place.
      const nextActivePanelId = prev.activePanelId === id
        ? deriveActivePanelId({ gridRoot: nextRoot, floating: nextFloating, panels: nextPanels })
        : prev.activePanelId;

      return {
        ...prev,
        gridRoot: nextRoot,
        floating: nextFloating,
        minimized: [...prev.minimized, { id, title: panel.title, component: panel.component }],
        panels: nextPanels,
        activePanelId: nextActivePanelId
      };
    });
    if (wasActive) {
      eventBusRef.current.publish('panel:minimized', { id });
      eventBusRef.current.publish('layout:changed', {});
    }
  };

  const restorePanel = (id: string, options?: { focus?: boolean }) => {
    const wasMinimized = stateRef.current.panels[id]?.state === 'minimized';
    const shouldFocus = options?.focus !== false;
    setState(prev => applyRestore(prev, id, shouldFocus));
    if (wasMinimized) {
      eventBusRef.current.publish('panel:restored', { id });
      eventBusRef.current.publish('layout:changed', {});
    }
  };

  const floatPanel = (id: string, rect?: { x: number; y: number; width: number; height: number }, anchor?: FloatAnchor | null) => {
    const panel = stateRef.current.panels[id];
    const willFloat = !!panel && registry.get(panel.component)?.defaultOptions?.canDrag !== false;
    setState(prev => applyFloat(prev, id, { rect, anchor }));
    if (willFloat) eventBusRef.current.publish('layout:changed', {});
  };

  const dockPanel = (id: string, targetLeafId?: string) => {
    const exists = id in stateRef.current.panels;
    setState(prev => applyDock(prev, id, targetLeafId));
    if (exists) eventBusRef.current.publish('layout:changed', {});
  };

  // Helper to split a layout leaf node into a branch (for drag split targets)
  const splitLeafInTree = (
    node: LayoutNode,
    leafId: string,
    panelId: string,
    position: SplitDirection,
    splitRatio: number
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
        const sizes = (position === 'left' || position === 'top')
          ? [splitRatio, 1 - splitRatio]
          : [1 - splitRatio, splitRatio];
        return {
          type: 'branch',
          orientation,
          sizes,
          children
        };
      }
      return node;
    } else {
      return {
        ...node,
        children: node.children.map(c => splitLeafInTree(c, leafId, panelId, position, splitRatio))
      };
    }
  };

  const setDraggedPanelId = (id: string | null) => {
    setState(prev => ({ ...prev, draggedPanelId: id }));
  };

  const dockPanelToGroup = (id: string, targetLeafId: string, position: DropPosition) => {
    const before = stateRef.current;
    const willMove = id in before.panels
      && hasLeaf(before.gridRoot, targetLeafId)
      && !isLoneOccupant(before.gridRoot, targetLeafId, id);
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      // Dropping a lone panel onto its own group asks for the layout it already has. Taking
      // it literally deletes the target leaf on the way in, and the split then ran against
      // the pre-removal tree, leaving the same panel in two leaves — one of them showing
      // nothing, since a panel's DOM can only live in one slot.
      if (isLoneOccupant(prev.gridRoot, targetLeafId, id)) return prev;

      // A group that is not in the tree cannot receive anything. Placing into it would strip
      // the panel from the layout and leave it "open" but in no group — visible nowhere, and
      // recoverable only by minimizing and restoring it.
      if (!hasLeaf(prev.gridRoot, targetLeafId)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[react-dockable-desktop] dockPanelToGroup("${id}", "${targetLeafId}") was ignored: ` +
            `no group with that id is in the layout. Emptying a group removes it, so an id held ` +
            `across a layout change can name a group that no longer exists.`
          );
        }
        return prev;
      }

      const nextFloating = prev.floating.filter(w => w.id !== id);
      // `null` from removePanelFromTree means the tree is now empty — not "nothing was
      // removed". Falling back to `prev.gridRoot` here is what put the panel in two leaves.
      const cleanRoot = removePanelFromTree(prev.gridRoot, id) || EMPTY_LEAF;

      let newRoot: LayoutNode;
      if (position === 'center') {
        newRoot = addPanelToLeaf(cleanRoot, targetLeafId, id);
      } else {
        newRoot = splitLeafInTree(cleanRoot, targetLeafId, id, position, prev.splitRatio);
      }

      const next: WorkspaceState = {
        ...prev,
        gridRoot: newRoot,
        floating: nextFloating,
        panels: {
          ...prev.panels,
          [id]: { ...panel, state: 'docked' }
        },
        draggedPanelId: null
      };
      return { ...next, activePanelId: resolveActivePanelId(next, id) };
    });
    if (willMove) eventBusRef.current.publish('layout:changed', {});
  };

  const dockPanelToWorkspaceEdge = (id: string, position: SplitDirection) => {
    const before = stateRef.current;
    const willMove = id in before.panels && removePanelFromTree(before.gridRoot, id) !== null;
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const nextFloating = prev.floating.filter(w => w.id !== id);
      const cleanRoot = removePanelFromTree(prev.gridRoot, id);

      // The sole docked panel already fills the workspace, so docking it to an edge asks for
      // the layout it has. Acting on it duplicated the panel into the new edge leaf while the
      // old one still listed it, exactly as a drop on its own group did.
      if (cleanRoot === null) return prev;

      const newLeaf: LayoutLeafNode = {
        type: 'leaf',
        id: `group-edge-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        panels: [id],
        activePanelId: id
      };

      const orientation: SplitOrientation = (position === 'left' || position === 'right') ? 'horizontal' : 'vertical';
      const children = (position === 'left' || position === 'top')
        ? [newLeaf, cleanRoot]
        : [cleanRoot, newLeaf];

      const r = prev.edgeSplitRatio;
      const newRoot: LayoutNode = {
        type: 'branch',
        orientation,
        sizes: (position === 'left' || position === 'top') ? [r, 1 - r] : [1 - r, r],
        children
      };

      const next: WorkspaceState = {
        ...prev,
        gridRoot: newRoot,
        floating: nextFloating,
        panels: {
          ...prev.panels,
          [id]: { ...panel, state: 'docked' }
        },
        draggedPanelId: null
      };
      return { ...next, activePanelId: resolveActivePanelId(next, id) };
    });
    if (willMove) eventBusRef.current.publish('layout:changed', {});
  };

  const movePanelOrder = (panelId: string, targetLeafId: string, targetIndex: number) => {
    const before = stateRef.current;
    const willMove = panelId in before.panels
      && hasLeaf(before.gridRoot, targetLeafId)
      && !isLoneOccupant(before.gridRoot, targetLeafId, panelId);
    setState(prev => {
      const panel = prev.panels[panelId];
      if (!panel) return prev;

      // A lone panel dropped on its own tab strip is already where it is being sent. Today
      // the reinsertion happens to cancel out; guarded so that stays true rather than
      // depending on it.
      if (isLoneOccupant(prev.gridRoot, targetLeafId, panelId)) return prev;

      if (!hasLeaf(prev.gridRoot, targetLeafId)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[react-dockable-desktop] movePanelOrder("${panelId}", "${targetLeafId}") was ignored: ` +
            `no group with that id is in the layout.`
          );
        }
        return prev;
      }

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

      const newRoot = insertInLeaf(cleanRoot || EMPTY_LEAF);
      const nextFloating = prev.floating.filter(w => w.id !== panelId);

      const next: WorkspaceState = {
        ...prev,
        gridRoot: newRoot,
        floating: nextFloating,
        panels: {
          ...prev.panels,
          [panelId]: { ...panel, state: 'docked' }
        },
        draggedPanelId: null
      };
      return { ...next, activePanelId: resolveActivePanelId(next, panelId) };
    });
    if (willMove) eventBusRef.current.publish('layout:changed', {});
  };

  const closeLeafGroup = async (leafId: string, options?: { onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }) => {
    const findLeaf = (node: LayoutNode): LayoutLeafNode | null => {
      if (node.type === 'leaf') return node.id === leafId ? node : null;
      for (const child of node.children) {
        const found = findLeaf(child);
        if (found) return found;
      }
      return null;
    };

    const leaf = findLeaf(stateRef.current.gridRoot);
    if (!leaf || leaf.canClose === false) return;

    // Closing a group closes its tabs, each through the same guarded path as the tab's own ×:
    // a close guard can refuse, and a dirty panel is kept unless `onConfirm` agrees. Removing
    // the leaf outright used to leave its panels "open" but in no group — rendered nowhere.
    for (const panelId of [...leaf.panels]) {
      await requestClosePanel(panelId, { onConfirm: options?.onConfirm });
    }

    const removeLeafFromTree = (node: LayoutNode): LayoutNode | null => {
      if (node.type === 'leaf') {
        return node.id === leafId ? null : node;
      }
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
    };

    // A panel that refused to close keeps its group. An emptied `keepOnEmpty` group is still in
    // the tree at this point, and is the one case left to remove here.
    setState(prev => {
      const current = findLeaf(prev.gridRoot);
      if (!current || current.panels.length > 0) return prev;
      const next: WorkspaceState = {
        ...prev,
        gridRoot: removeLeafFromTree(prev.gridRoot) || { type: 'leaf', id: 'group-default', panels: [], activePanelId: null }
      };
      return { ...next, activePanelId: resolveActivePanelId(next, null) };
    });
    eventBusRef.current.publish('layout:changed', {});
  };

  const maximizePanel = (id: string) => {
    const panel = stateRef.current.panels[id];
    if (!panel) return;

    if (panel.state === 'minimized') {
      // "Maximize" on a minimized panel (the taskbar menu offers it) is restore + maximize.
      // Only floating windows maximize, so a panel that comes back docked is floated first —
      // unless it can't be dragged, in which case it is just restored to its group. The
      // taskbar menu hides the item for that case.
      setState(prev => {
        const restored = applyRestore(prev, id, true);
        if (restored === prev) return prev;
        let next = restored;
        if (restored.panels[id]?.state === 'docked') {
          next = applyFloat(restored, id);
          if (next === restored) return restored;
        }
        return {
          ...next,
          floating: next.floating.map(w => w.id === id ? { ...w, maximized: true } : w),
          activePanelId: id
        };
      });
      eventBusRef.current.publish('panel:restored', { id });
      eventBusRef.current.publish('layout:changed', {});
      return;
    }

    if (panel.state === 'docked') {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[react-dockable-desktop] maximizePanel("${id}") was ignored: only floating windows can ` +
          `be maximized. Float the panel first with floatPanel("${id}").`
        );
      }
      return;
    }

    setState(prev => ({
      ...prev,
      floating: prev.floating.map(w => w.id === id ? { ...w, maximized: !w.maximized } : w)
    }));
  };

  const updateSplitSizes = (path: number[], sizes: number[]) => {
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
  };

  const updateFloatingPosition = (id: string, updates: Partial<Pick<FloatingWindow, 'x' | 'y' | 'width' | 'height' | 'anchor'>>) => {
    setState(prev => ({
      ...prev,
      floating: prev.floating.map(w => w.id === id ? { ...w, ...updates } : w)
    }));
  };

  const saveLayout = () => {
    const currentPanels = stateRef.current.panels;
    const excludedIds: string[] = [];
    const includedPanels: Record<string, PanelInfo> = {};

    // A registered state provider (see registerStateProvider) is pulled fresh on every save —
    // a panel's serializability can flip over its lifetime, so this is never cached from open
    // time for provider-backed panels. Panels with no provider keep their static open-time
    // props/serializable classification unchanged.
    for (const [id, info] of Object.entries(currentPanels)) {
      const provider = stateProvidersRef.current[id];
      const dynamicValue = provider?.();
      const hasDynamicValue = provider !== undefined && dynamicValue !== undefined;
      const effectiveProps = hasDynamicValue ? (dynamicValue as Record<string, unknown>) : info.props;
      const effectiveSerializable = hasDynamicValue ? isSerializable(dynamicValue) : info.serializable;

      if (effectiveSerializable) {
        includedPanels[id] = hasDynamicValue ? { ...info, props: effectiveProps, serializable: effectiveSerializable } : info;
      } else {
        excludedIds.push(id);
      }
    }

    // Non-serializable panels are excluded from this saved snapshot — pruned from gridRoot/
    // floating/minimized too, so a restore never references a panel with no data to recreate it
    // meaningfully. This computes a derived copy for the JSON string only; none of this touches
    // stateRef/setState, so the live, on-screen workspace is completely unaffected — an excluded
    // panel keeps existing and working normally on screen, it simply won't be there after the
    // *next* loadLayout().
    let gridRoot = stateRef.current.gridRoot;
    let floating = stateRef.current.floating;
    let minimized = stateRef.current.minimized;
    for (const id of excludedIds) {
      gridRoot = removePanelFromTree(gridRoot, id) || { type: 'leaf', id: 'group-default', panels: [], activePanelId: null };
      floating = floating.filter(w => w.id !== id);
      minimized = minimized.filter(m => m.id !== id);
    }

    if (excludedIds.length > 0) {
      eventBusRef.current.publish('layout:panels-excluded', {
        panels: excludedIds.map(id => ({ id, component: currentPanels[id].component }))
      });
    }

    // Validated against the *pruned* snapshot, not the live state: if the active panel was itself
    // excluded above, or is minimized, the field is omitted entirely rather than persisted as an id
    // this payload's own `panels` doesn't contain. A restore then derives it — see
    // `deriveActivePanelId`.
    const liveActive = stateRef.current.activePanelId;
    const activePanelId = liveActive !== null && isVisibleActiveTarget(liveActive, { gridRoot, floating, panels: includedPanels })
      ? liveActive
      : null;

    const payload: SerializedLayout = {
      version: 2, // v2: panels may carry `props`/`dedupeKey`; the payload may omit panels the
                  // live workspace still has open (see the exclusion pass above).
      ...(activePanelId !== null ? { activePanelId } : {}),
      gridRoot,
      floating,
      minimized,
      panels: includedPanels
    };
    return JSON.stringify(payload);
  };

  const loadLayout = (layoutJson: string): boolean => {
    try {
      const payload = parseLayoutPayload(JSON.parse(layoutJson));
      if (!payload) return false;
      setState(prev => ({
        ...prev,
        gridRoot: payload.gridRoot,
        floating: payload.floating,
        minimized: payload.minimized,
        panels: payload.panels,
        draggedPanelId: null,
        activePanelId: payload.activePanelId
      }));
      return true;
    } catch (e) {
      console.error('Failed to parse layout configuration:', e);
      return false;
    }
  };

  const setActivePanel = (id: string | null) => {
    setState(prev => {
      if (prev.activePanelId === id) return prev;
      return { ...prev, activePanelId: id };
    });
  };

  const setDirection = (dir: 'ltr' | 'rtl') => {
    setState(prev => {
      if (prev.dir === dir) return prev;
      return { ...prev, dir, isRtl: dir === 'rtl' };
    });
  };

  const isOpen = (id: string) => id in stateRef.current.panels;

  const getOpenPanelIds = () => Object.keys(stateRef.current.panels);

  const findPanelId = (component: string, dedupeKey: string): string | null => {
    const match = Object.values(stateRef.current.panels).find(
      p => p.component === component && p.dedupeKey === dedupeKey
    );
    return match?.id ?? null;
  };

  const customMenuGettersRef: { current: Map<string, () => ContextMenuItem[]> } = { current: new Map() };

  const showContextMenuFnRef: { current: ((options: ShowContextMenuOptions) => void) | null } = { current: null };
  const registerContextMenuFn = (fn: (options: ShowContextMenuOptions) => void) => {
    showContextMenuFnRef.current = fn;
    return () => { showContextMenuFnRef.current = null; };
  };
  const showContextMenu = (options: ShowContextMenuOptions) => {
    showContextMenuFnRef.current?.(options);
  };

  const registerPanelContextMenu = (panelId: string, getItems: () => ContextMenuItem[]) => {
    customMenuGettersRef.current.set(panelId, getItems);
    return () => { customMenuGettersRef.current.delete(panelId); };
  };

  const getPanelContextMenuItems = (panelId: string): ContextMenuItem[] =>
    customMenuGettersRef.current.get(panelId)?.() ?? [];

  const actions: InternalWindowActions = {
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
    findPanelId,
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
    registerStateProvider,
    unregisterStateProvider,
    setPanelDirty,
    updatePanelTitle,
    requestClosePanel,
    dockPanelToWorkspaceEdge,
    setActivePanel,
    setDirection,
    registerPanelContextMenu,
    getPanelContextMenuItems,
    showContextMenu,
    registerContextMenuFn,
  };

  const applyProviderDefaults = (defaults: { dir?: 'ltr' | 'rtl'; zIndexBase?: number }): void => {
    if (config.dir === undefined && defaults.dir) setDirection(defaults.dir);
    if (config.zIndexBase === undefined && defaults.zIndexBase !== undefined && state.floating.length === 0) {
      maxZRef.current = defaults.zIndexBase;
    }
  };

  return { actions, getSnapshot, subscribeToState, applyProviderDefaults };
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
  windowBodyClass,
  zIndexBase: zIndexBaseProp
}) => {
  // The workspace store: the client's own, or one owned by this provider (then panels come from
  // the global globalPanelRegistry, as before). The store is live before this mounts; nothing connects.
  const [core] = useState<WorkspaceCore>(() => {
    const c = client
      ? client._core
      : createWorkspaceCore({ registry: globalPanelRegistry, dir: dirProp, zIndexBase: zIndexBaseProp });
    c.applyProviderDefaults({ dir: dirProp, zIndexBase: zIndexBaseProp });
    return c;
  });
  const registry = client?.registry ?? globalPanelRegistry;
  const state = useSyncExternalStore(core.subscribeToState, core.getSnapshot, core.getSnapshot);
  const actions = core.actions;

  // Effective config: client config takes precedence over individual provider props
  const effectiveFormatMessage = client?.config.formatMessage ?? formatMessage;
  const effectivePredefinedMessages = client?.config.predefinedMessages ?? predefinedMessages;
  const effectiveDir = client?.config.dir ?? dirProp;
  const effectiveZIndexBase = client?.config.zIndexBase ?? zIndexBaseProp ?? 1000;

  const mergedMessages = useMemo(() => ({
    ...defaultPredefinedMessages,
    ...effectivePredefinedMessages
  }), [effectivePredefinedMessages]);

  // Mirror the z-index base onto document.documentElement as a CSS variable so the
  // library's portaled chrome (ContextMenu, Toast, Toolbar's flyout, ModalStackRenderer),
  // which renders outside this provider's own DOM subtree, shifts in lockstep with
  // the floating windows' z counter.
  useEffect(() => {
    document.documentElement.style.setProperty('--rdd-z-base', String(effectiveZIndexBase));
    return () => { document.documentElement.style.removeProperty('--rdd-z-base'); };
  }, [effectiveZIndexBase]);

  useEffect(() => {
    if (effectiveDir) actions.setDirection(effectiveDir);
  }, [effectiveDir, actions]);


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

  }, []);

  const syncContextValue = useMemo<WindowStoreSyncContextValue>(
    () => ({ getSnapshot: core.getSnapshot, subscribeToState: core.subscribeToState }),
    [core]
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
 * The live workspace state. The component re-renders whenever it changes — or, given a selector,
 * only when the selected value changes.
 *
 * For reads without a subscription, call the workspace's `isOpen()` or `getOpenPanelIds()`.
 *
 * @returns The current workspace state, or the selector's result.
 * @throws Error if used outside `<DockableDesktopProvider>`.
 * @example
 * ```tsx
 * function PanelCount() {
 *   const count = useWorkspaceState(s => Object.keys(s.panels).length);
 *   return <span>{count} open</span>;
 * }
 * ```
 */
const noopSubscribe = (_cb: () => void): (() => void) => () => {};

export function useWindowManagerState(): WorkspaceState;
export function useWindowManagerState<T>(selector: (state: WorkspaceState) => T): T;
export function useWindowManagerState<T>(selector?: (state: WorkspaceState) => T): WorkspaceState | T {
  const stateCtx = useContext(WindowStateContext);
  const syncCtx = useContext(WindowStoreSyncContext);
  const selectorRef = useRef<((state: WorkspaceState) => T) | undefined>(selector);
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

  if (!stateCtx) throw new Error('useWorkspaceState must be used within <DockableDesktopProvider>');
  if (!selector) return stateCtx;
  return syncResult;
}

/**
 * React hook to retrieve all layout mutation actions.
 * Returns the public {@link WorkspaceActions} interface.
 *
 * @group Hooks
 * @returns The full set of workspace mutation methods.
 * @throws Error if used outside of a {@link DockableDesktopProvider}.
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
export const useWindowManagerActions = (): WorkspaceActions => {
  const ctx = useContext(WindowActionsContext);
  if (!ctx) throw new Error('useWorkspace must be used within <DockableDesktopProvider>');
  return ctx;
};

/**
 * @internal — used by WindowManager.tsx rendering components only.
 * Returns the full {@link InternalWindowActions} including `setActivePanel`.
 */
export const useWindowManagerActionsInternal = (): InternalWindowActions => {
  const ctx = useContext(WindowActionsContext);
  if (!ctx) throw new Error('react-dockable-desktop components must be used within <DockableDesktopProvider>');
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
  label: string | MessageDescriptor | undefined,
  formatter: MessageFormatter
): string => {
  if (!label) return '';
  if (typeof label === 'string') return label;
  return formatter(label);
};

/**
 * React hook providing pub-sub helper methods for inter-panel event messaging.
 */
export const usePanelContext = (): Pick<WorkspaceActions, 'publish' | 'subscribe'> => {
  const { publish, subscribe } = useWindowManagerActions();
  return { publish, subscribe };
};

/**
 * React hook to fetch the localizable predefined message map catalog.
 */
export const usePredefinedMessages = (): Record<MessageKey, MessageDescriptor> => {
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
 * The hook knows which panel it is in — no id needed.
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
