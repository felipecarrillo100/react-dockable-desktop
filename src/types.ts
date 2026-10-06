/**
 * @file types.ts
 * @description The workspace's data types: messages, the layout tree, floating windows, panels,
 * the state snapshot, the actions, the serialized layout and the store's configuration.
 */
import type React from 'react';
import type { PanelRegistry } from './components/PanelRegistry';
import type { WorkspaceClient } from './WorkspaceClient';
import type { DirtyStateOptions } from './components/dirtyOptions';
import type { ContextMenuItem, ShowContextMenuOptions } from './components/ContextMenu';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- referenced by the {@link}s below
import { isSerializable } from './components/serializable';

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
  /** Split orientation: `horizontal` places the children side by side, `vertical` stacks them. */
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
  title: string | MessageDescriptor | (() => string);
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
  /** Icon set at runtime with `usePanel().setIcon()` or {@link WorkspaceActions.setPanelIcon},
   *  shown instead of the registration's `defaultOptions.icon`. Never saved by `saveLayout()`;
   *  `loadLayout()` keeps it for a panel that is still open. */
  icon?: React.ReactNode;
}

/**
 * Options accepted by {@link WorkspaceActions.openPanel}.
 */
export interface OpenPanelOptions<P extends object = Record<string, unknown>> {
  /** Override the panel tab/window title. Accepts a plain string or an i18n message descriptor. */
  title?: string | MessageDescriptor | (() => string);
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
  /**
   * Dock the new panel beside an open, docked panel: in that panel's group (`position: 'center'`,
   * as a tab) or in a new group split off on one side of it. `size` is the new group's share of
   * that split, from 0.1 to 0.9 (the workspace's default split ratio when omitted). Wins over
   * `initialTarget`. If `panel` is not docked (not open, floating or minimized), the new panel is
   * placed as usual and a development warning says why. Applies only to a newly opened panel. (7.8.0)
   *
   * @example
   * ```ts
   * ws.openPanel('legend', 'legend', { dockTo: { panel: 'chart-1', position: 'right', size: 0.25 } });
   * ```
   */
  dockTo?: { panel: string; position: DropPosition; size?: number };
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
  minimized: { id: string; title: string | MessageDescriptor | (() => string); component: string }[];
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
   * For guarded close, use {@link WorkspaceActions.requestClosePanel}.
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
   * @returns JSON string suitable for storage and later restoration via {@link WorkspaceActions.loadLayout}.
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
   * @param layoutJson - JSON string produced by {@link WorkspaceActions.saveLayout}.
   * @returns `true` if the layout was successfully parsed and applied, `false` otherwise.
   */
  loadLayout: (layoutJson: string) => boolean;
  /**
   * Publishes an event to the inter-panel pub/sub event bus.
   * @param event - Event name string.
   * @param data - Arbitrary payload passed to all subscribers.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public: subscribers read fields off the payload; typed events are opt-in
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public: subscribers read fields off the payload; typed events are opt-in
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
  updatePanelTitle: (id: string, title: string | MessageDescriptor | (() => string)) => void;
  /**
   * Sets the icon shown on an open panel's tab, floating title bar and taskbar button, in place
   * of its registration's `defaultOptions.icon`. `null` restores the registration's icon. The icon
   * lives only in memory: `saveLayout()` never writes it.
   * @param id - Panel instance ID.
   * @param icon - The icon, or `null` to go back to the registration's.
   */
  setPanelIcon: (id: string, icon: React.ReactNode | null) => void;
  /**
   * Closes a panel the way its tab's × does: registered close guards run first, and a dirty panel
   * closes only if `onConfirm` resolves `true` — without `onConfirm`, a dirty panel stays open.
   * (The tab's own ×, which passes an `onConfirm`, is what shows the built-in unsaved-changes
   * dialog.)
   * @param id - Panel instance ID.
   * @param options - `force: true` bypasses guards and the dirty check; `onConfirm` is asked
   *   whether to discard a dirty panel's changes.
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

/** Represents custom CSS classes injected into layout parts. */
export interface HostClasses {
  modalClass?: string;
  modalBodyClass?: string;
  sidePanelClass?: string;
  sidePanelBodyClass?: string;
  windowClass?: string;
  windowBodyClass?: string;
}

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
  minimized: { id: string; title: string | MessageDescriptor | (() => string); component: string }[];
  panels: Record<string, PanelInfo>;
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
