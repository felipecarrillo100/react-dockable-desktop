import type { ComponentType, ReactNode } from 'react';
import { PanelRegistry } from './components/PanelRegistry';
import type { PanelRegistryEntry } from './components/PanelRegistry';
import { createWorkspaceCore, type WorkspaceCore } from './components/WindowManagerContext';
import type {
  WorkspaceActions,
  MessageFormatter,
  MessageDescriptor,
  DropPosition,
  SplitDirection,
  DirtyStateOptions,
  FloatingWindow,
} from './components/WindowManagerContext';
import type { ShowContextMenuOptions } from './components/ContextMenu';

/** Built-in lifecycle events always available on the workspace event bus. */
export interface BuiltInEvents {
  'panel:opened':    { id: string; component: string };
  'panel:closed':    { id: string };
  'panel:minimized': { id: string };
  'panel:restored':  { id: string };
  /**
   * Fires whenever something `saveLayout()` would capture changes — open/close/minimize/restore,
   * float/dock/re-order/dock-to-edge, closing a group, maximizing a minimized panel, and an
   * `openPanel` `dedupeKey` redirect. Coalesces those into one signal for autosave-style
   * consumers, so they don't need to subscribe to separate events. Does **not** cover a
   * `registerStateProvider` callback's return value changing on its own — that's a pull, there's
   * no way to observe it changing without the panel separately notifying — nor resize/split-ratio
   * drag, which has no hook yet.
   */
  'layout:changed': Record<string, never>;
  /**
   * Fires from inside `saveLayout()` itself, only when that specific call excluded at least one
   * panel (a panel whose current `props` — static or from a `registerStateProvider` — failed
   * {@link isSerializable}). A passive `PanelInfo.serializable` flag alone isn't enough for this:
   * nobody may be polling it at the exact moment a save happens and something silently drops out
   * (e.g. a floating window rendering data from a live class instance). This is deliberately just
   * a signal, not a UI opinion — decide for yourself whether that becomes a toast, a console
   * warning, or nothing.
   */
  'layout:panels-excluded': { panels: { id: string; component: string }[] };
}

/** Per-panel definition supplied to `createWorkspace({ panels })`. */
export interface PanelDefinition {
  component: ComponentType<any>;
  defaultOptions?: PanelRegistryEntry['defaultOptions'];
}

/** Configuration object accepted by `createWorkspace()`. */
export interface WorkspaceClientConfig {
  /**
   * Declarative panel catalog. Replaces imperative globalPanelRegistry.register() calls.
   * Keys are the component identifiers used in openPanel() and serialised layouts.
   */
  panels?: Record<string, PanelDefinition>;
  /**
   * Serialised layout produced by a previous saveLayout() call.
   * Pass null or omit to start with an empty canvas.
   *
   * Parsed synchronously before the first render. The restored `activePanelId` is the one the
   * snapshot recorded, or — for layouts saved before that was persisted — the selected tab of
   * the first leaf in the grid.
   */
  initialState?: string | null;
  /** Custom i18n formatter for all internal strings. */
  formatMessage?: MessageFormatter;
  /** Override any subset of the built-in predefined message catalog. */
  predefinedMessages?: Record<string, MessageDescriptor>;
  /** Initial layout direction. */
  dir?: 'ltr' | 'rtl';
  /**
   * Fraction of the target panel the new panel takes when dropped on a panel's
   * top/bottom/left/right cross target. Range 0.1–0.9. Default: 0.5.
   */
  defaultSplitRatio?: number;
  /**
   * Fraction of the workspace the new panel takes when dropped on the workspace
   * outer edge. Range 0.1–0.9. Default: 0.2.
   */
  defaultEdgeSplitRatio?: number;
  /**
   * Starting z-index for floating windows and the library's own chrome overlays
   * (context menu, toolbar flyout, modal stack, toast, workspace edge zones),
   * all of which shift together via `--rdd-z-base`. Set this above/below a host
   * app's own modal z-index range to control stacking against it. Default: 1000.
   */
  zIndexBase?: number;
}

/**
 * A workspace: the layout, every action on it, the panel registry and the event bus. Create one
 * with `createWorkspace()` outside the React tree and pass it to
 * `<DockableDesktopProvider workspace={…}>`; inside the tree, `useWorkspace()` returns it.
 *
 * Pattern: TanStack QueryClient / Redux store — configuration and imperative access live on the
 * workspace; rendering is delegated to the thin React provider.
 *
 * @remarks
 * The workspace is live from the moment it is created: calls made before any provider mounts
 * apply immediately, and a provider that mounts later shows the result.
 *
 * @example
 * const workspace = createWorkspace<MyEvents>({
 *   panels: {
 *     map:    { component: MapPanel },
 *     editor: { component: EditorPanel, defaultOptions: { title: 'Code Editor' } },
 *   },
 *   initialState: localStorage.getItem('layout'),
 * });
 *
 * <DockableDesktopProvider workspace={workspace}>
 *   <RddDesktop />
 * </DockableDesktopProvider>
 *
 * // Imperative access from anywhere:
 * workspace.saveLayout();
 * workspace.openPanel('map-1', 'map');
 * workspace.focusPanel('map-1');
 */
// `object`, not `Record<string, unknown>`: an event map declared as an `interface` (the form the
// docs use) has no index signature and so never satisfied the Record constraint (TS2344).
export class WorkspaceClient<TUserEvents extends object = Record<string, unknown>> {
  /** Scoped panel registry — fully independent from the global singleton. */
  readonly registry: PanelRegistry;

  /** Serialised layout to restore on mount, or null to start with an empty canvas. */
  readonly initialState: string | null;

  /** Non-rendering configuration forwarded to the provider. */
  readonly config: Pick<WorkspaceClientConfig, 'formatMessage' | 'predefinedMessages' | 'dir' | 'defaultSplitRatio' | 'defaultEdgeSplitRatio' | 'zIndexBase'>;

  /** @internal The workspace store. Live from construction; a provider only subscribes to it. */
  readonly _core: WorkspaceCore;

  /** The store's actions, to which every method below forwards. */
  private get _actions(): WorkspaceActions { return this._core.actions; }

  constructor(config: WorkspaceClientConfig = {}) {
    this.registry = new PanelRegistry();
    this.initialState = config.initialState ?? null;
    this.config = {
      formatMessage: config.formatMessage,
      predefinedMessages: config.predefinedMessages,
      dir: config.dir,
      defaultSplitRatio: config.defaultSplitRatio,
      defaultEdgeSplitRatio: config.defaultEdgeSplitRatio,
      zIndexBase: config.zIndexBase,
    };

    if (config.panels) {
      for (const [id, def] of Object.entries(config.panels)) {
        this.registry.register(id, def.component, def.defaultOptions);
      }
    }

    // Every method is bound to this workspace, so `const { openPanel } = useWorkspace()` works —
    // destructuring a class instance's methods otherwise loses `this`.
    for (const key of Object.getOwnPropertyNames(WorkspaceClient.prototype) as Array<keyof this>) {
      const descriptor = Object.getOwnPropertyDescriptor(WorkspaceClient.prototype, key);
      if (key === 'constructor' || !descriptor || typeof descriptor.value !== 'function') continue;
      (this as Record<keyof this, unknown>)[key] = (descriptor.value as (...a: unknown[]) => unknown).bind(this);
    }

    this._core = createWorkspaceCore({
      registry: this.registry,
      initialState: this.initialState,
      dir: config.dir,
      zIndexBase: config.zIndexBase,
      defaultSplitRatio: config.defaultSplitRatio,
      defaultEdgeSplitRatio: config.defaultEdgeSplitRatio,
    });
  }

  private _dispatch(fn: (actions: WorkspaceActions) => void): void {
    fn(this._actions);
  }

  private _subscribeRaw(event: string, cb: (data: unknown) => void): () => void {
    return this._actions.subscribe(event, cb);
  }

  // ── Forwarding methods — mirrors the WorkspaceActions public interface ────────

  openPanel(...args: Parameters<WorkspaceActions['openPanel']>): void { this._actions.openPanel(...args); }

  closePanel(id: string): void { this._dispatch(a => a.closePanel(id)); }

  minimizePanel(id: string): void { this._dispatch(a => a.minimizePanel(id)); }

  restorePanel(...args: Parameters<WorkspaceActions['restorePanel']>): void {
    this._dispatch(a => a.restorePanel(...args));
  }

  floatPanel(...args: Parameters<WorkspaceActions['floatPanel']>): void {
    this._dispatch(a => a.floatPanel(...args));
  }

  dockPanel(...args: Parameters<WorkspaceActions['dockPanel']>): void {
    this._dispatch(a => a.dockPanel(...args));
  }

  maximizePanel(id: string): void { this._dispatch(a => a.maximizePanel(id)); }

  /**
   * Activates the given panel regardless of its current state.
   * For floating panels: raises z-index so the window appears on top.
   * For docked panels: selects the tab within its leaf group.
   */
  focusPanel(id: string): void { this._dispatch(a => a.focusPanel(id)); }

  /** Returns `true` if a panel with this ID is currently open. */
  isOpen(id: string): boolean { return this._actions.isOpen(id); }

  /** Returns the IDs of all currently open panels. */
  getOpenPanelIds(): string[] { return this._actions.getOpenPanelIds(); }

  /** Finds an already-open panel of the given component with a matching `dedupeKey` (set via
   * `openPanel`'s `dedupeKey` option). Returns `null` if none is open. */
  findPanelId(component: string, dedupeKey: string): string | null {
    return this._actions.findPanelId(component, dedupeKey);
  }

  saveLayout(): string { return this._actions.saveLayout(); }

  loadLayout(json: string): boolean { return this._actions.loadLayout(json); }

  setDirection(dir: 'ltr' | 'rtl'): void { this._dispatch(a => a.setDirection(dir)); }

  /** Updates the split-size fractions at the given grid path. */
  updateSplitSizes(path: number[], sizes: number[]): void {
    this._dispatch(a => a.updateSplitSizes(path, sizes));
  }

  /** Updates position/size/anchor of a floating panel. */
  updateFloatingPosition(id: string, updates: Partial<Pick<FloatingWindow, 'x' | 'y' | 'width' | 'height' | 'anchor'>>): void {
    this._dispatch(a => a.updateFloatingPosition(id, updates));
  }

  /** @internal Drives the drag-in-progress visual state; normally only the library's own drag UI calls this. */
  setDraggedPanelId(id: string | null): void { this._dispatch(a => a.setDraggedPanelId(id)); }

  /** Docks a panel into an existing leaf group at the given drop position. */
  dockPanelToGroup(id: string, targetLeafId: string, position: DropPosition): void {
    this._dispatch(a => a.dockPanelToGroup(id, targetLeafId, position));
  }

  /** Reorders a panel's tab within its leaf group. */
  movePanelOrder(panelId: string, targetLeafId: string, targetIndex: number): void {
    this._dispatch(a => a.movePanelOrder(panelId, targetLeafId, targetIndex));
  }

  /**
   * Closes a leaf group: each of its tabs is closed through the guarded close path, then the
   * group is removed once empty. A tab whose close guard refuses — or a dirty tab that
   * `onConfirm` doesn't approve — stays open, and so does its group.
   * Resolves once every close request has been settled.
   */
  closeLeafGroup(leafId: string, options?: { onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }): Promise<void> {
    return this._actions.closeLeafGroup(leafId, options);
  }

  /** Registers a guard that can veto closing the given panel. */
  registerCloseGuard(id: string, guard: () => boolean | Promise<boolean>): void {
    this._dispatch(a => a.registerCloseGuard(id, guard));
  }

  /** Removes a previously registered close guard. */
  unregisterCloseGuard(id: string): void { this._dispatch(a => a.unregisterCloseGuard(id)); }

  /** Registers a callback reporting a panel's current restorable state, pulled fresh on every
   * `saveLayout()` call — see {@link BuiltInEvents}'s `'layout:panels-excluded'` doc and
   * `FormContainerContract.registerStateProvider`. */
  registerStateProvider(id: string, provider: () => unknown): void {
    this._dispatch(a => a.registerStateProvider(id, provider));
  }

  /** Removes a previously registered state provider. */
  unregisterStateProvider(id: string): void { this._dispatch(a => a.unregisterStateProvider(id)); }

  /** Sets/clears a panel's dirty (unsaved changes) flag. */
  setPanelDirty(id: string, dirty: boolean, options?: DirtyStateOptions): void {
    this._dispatch(a => a.setPanelDirty(id, dirty, options));
  }

  /** Updates a panel's displayed title. */
  updatePanelTitle(id: string, title: string | MessageDescriptor): void {
    this._dispatch(a => a.updatePanelTitle(id, title));
  }

  /** Sets an open panel's tab/window/taskbar icon; `null` restores its registration's icon. Not saved by `saveLayout()`. */
  setPanelIcon(id: string, icon: ReactNode | null): void {
    this._dispatch(a => a.setPanelIcon(id, icon));
  }

  /**
   * Requests that a panel close, honoring its dirty flag and any registered close guard.
   * Resolves once the close (or user cancellation) has been resolved.
   */
  requestClosePanel(id: string, options?: { force?: boolean; onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }): Promise<void> {
    return this._actions.requestClosePanel(id, options);
  }

  /** Docks a panel to one of the workspace's outer edges. */
  dockPanelToWorkspaceEdge(id: string, position: SplitDirection): void {
    this._dispatch(a => a.dockPanelToWorkspaceEdge(id, position));
  }

  /** Shows a context menu using the app's configured ContextMenuAdapter. */
  showContextMenu(options: ShowContextMenuOptions): void { this._dispatch(a => a.showContextMenu(options)); }

  // ── Typed event bus ───────────────────────────────────────────────────────

  publish<K extends keyof (TUserEvents & BuiltInEvents)>(
    event: K,
    data: (TUserEvents & BuiltInEvents)[K]
  ): void {
    this._dispatch(a => a.publish(event as string, data));
  }

  subscribe<K extends keyof (TUserEvents & BuiltInEvents)>(
    event: K,
    callback: (data: (TUserEvents & BuiltInEvents)[K]) => void
  ): () => void {
    return this._subscribeRaw(event as string, callback as (data: unknown) => void);
  }

  // ── Lifecycle callbacks ───────────────────────────────────────────────────

  /** Subscribe to panel open events. Fires only for newly created panels. */
  onPanelOpen(callback: (id: string, component: string) => void): () => void {
    return this._subscribeRaw('panel:opened', data => {
      const d = data as BuiltInEvents['panel:opened'];
      callback(d.id, d.component);
    });
  }

  /** Subscribe to panel close events. */
  onPanelClose(callback: (id: string) => void): () => void {
    return this._subscribeRaw('panel:closed', data => {
      callback((data as BuiltInEvents['panel:closed']).id);
    });
  }

  /** Subscribe to panel minimize events. */
  onPanelMinimize(callback: (id: string) => void): () => void {
    return this._subscribeRaw('panel:minimized', data => {
      callback((data as BuiltInEvents['panel:minimized']).id);
    });
  }

  /** Subscribe to panel restore events. */
  onPanelRestore(callback: (id: string) => void): () => void {
    return this._subscribeRaw('panel:restored', data => {
      callback((data as BuiltInEvents['panel:restored']).id);
    });
  }

  /** Subscribe to the coalesced layout-change signal — see {@link BuiltInEvents}'s
   * `'layout:changed'` doc for exactly what it covers (and doesn't). */
  onLayoutChanged(callback: () => void): () => void {
    return this._subscribeRaw('layout:changed', () => callback());
  }

  /** Subscribe to notification that a `saveLayout()` call excluded one or more panels because
   * their current props weren't serializable — see {@link BuiltInEvents}'s
   * `'layout:panels-excluded'` doc. */
  onPanelsExcluded(callback: (panels: { id: string; component: string }[]) => void): () => void {
    return this._subscribeRaw('layout:panels-excluded', data => {
      callback((data as BuiltInEvents['layout:panels-excluded']).panels);
    });
  }
}
