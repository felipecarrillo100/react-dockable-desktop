import type { ComponentType } from 'react';
import { PanelRegistryClass } from './components/PanelRegistry';
import type { PanelRegistryEntry } from './components/PanelRegistry';
import type {
  WindowActions,
  MessageFormatter,
  ContextMenuPredefinedMessage,
  DropPosition,
  SplitDirection,
  DirtyStateOptions,
  FloatingWindow,
} from './components/WindowManagerContext';
import type { ShowContextMenuOptions } from './components/ContextMenu';

/** Built-in lifecycle events always available on the WorkspaceClient event bus. */
export interface BuiltInPanelEvents {
  'panel:opened':    { id: string; component: string };
  'panel:closed':    { id: string };
  'panel:minimized': { id: string };
  'panel:restored':  { id: string };
}

/** Per-panel definition supplied to WorkspaceClient constructor. */
export interface PanelDefinition {
  component: ComponentType<any>;
  defaultOptions?: PanelRegistryEntry['defaultOptions'];
}

/** Configuration object accepted by the WorkspaceClient constructor. */
export interface WorkspaceClientConfig {
  /**
   * Declarative panel catalog. Replaces imperative PanelRegistry.register() calls.
   * Keys are the component identifiers used in openPanel() and serialised layouts.
   */
  panels?: Record<string, PanelDefinition>;
  /**
   * Serialised layout produced by a previous saveLayout() call.
   * Pass null or omit to start with an empty canvas.
   */
  initialState?: string | null;
  /** Custom i18n formatter for all internal strings. */
  formatMessage?: MessageFormatter;
  /** Override any subset of the built-in predefined message catalog. */
  predefinedMessages?: Record<string, ContextMenuPredefinedMessage>;
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
}

/**
 * WorkspaceClient is the central configuration and imperative API object for
 * react-dockable-desktop. Create one instance outside the React tree and pass
 * it to `<WindowManagerProvider client={client}>`.
 *
 * Pattern: TanStack QueryClient / Redux store — configuration and imperative
 * access live on the client; rendering is delegated to the thin React provider.
 *
 * @remarks
 * Calls made before the provider mounts are queued and replayed automatically
 * in order once `_connect()` fires. Duplicate `openPanel` calls for the same
 * ID are deduplicated while queued. Subscriptions made before mount are
 * buffered and re-registered on each connect/reconnect.
 *
 * @example
 * const workspace = new WorkspaceClient<MyEvents>({
 *   panels: {
 *     map:    { component: MapPanel },
 *     editor: { component: EditorPanel, defaultOptions: { title: 'Code Editor' } },
 *   },
 *   initialState: localStorage.getItem('layout'),
 * });
 *
 * <WindowManagerProvider client={workspace}>
 *   <WindowManager />
 * </WindowManagerProvider>
 *
 * // Imperative access from anywhere:
 * workspace.saveLayout();
 * workspace.openPanel('map-1', 'map');
 * workspace.focusPanel('map-1');
 */
export class WorkspaceClient<TUserEvents extends Record<string, unknown> = Record<string, unknown>> {
  /** Scoped panel registry — fully independent from the global singleton. */
  readonly registry: PanelRegistryClass;

  /** Serialised layout to restore on mount, or null to start with an empty canvas. */
  readonly initialState: string | null;

  /** Non-rendering configuration forwarded to the provider. */
  readonly config: Pick<WorkspaceClientConfig, 'formatMessage' | 'predefinedMessages' | 'dir' | 'defaultSplitRatio' | 'defaultEdgeSplitRatio'>;

  private _actions: WindowActions | null = null;
  private _initialized = false;

  /** Calls queued before _connect() fires — replayed in order on first connect. */
  private _pendingCalls: Array<(actions: WindowActions) => void> = [];

  /** Tracks openPanel IDs in the pending queue to prevent duplicates before mount. */
  private _pendingOpenPanelIds = new Set<string>();

  /** Subscriptions buffered before connect — re-registered on every connect/reconnect. */
  private _pendingSubscriptions: Array<{
    event: string;
    callback: (data: unknown) => void;
    unsub: (() => void) | null;
  }> = [];

  /** Timer that emits an error if _connect() is never called with pending work. */
  private _disconnectedWarnTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WorkspaceClientConfig = {}) {
    this.registry = new PanelRegistryClass();
    this.initialState = config.initialState ?? null;
    this.config = {
      formatMessage: config.formatMessage,
      predefinedMessages: config.predefinedMessages,
      dir: config.dir,
      defaultSplitRatio: config.defaultSplitRatio,
      defaultEdgeSplitRatio: config.defaultEdgeSplitRatio,
    };

    if (config.panels) {
      for (const [id, def] of Object.entries(config.panels)) {
        this.registry.register(id, def.component, def.defaultOptions);
      }
    }
  }

  // ── Internal lifecycle ────────────────────────────────────────────────────

  /** @internal Called by WindowManagerProvider after mount. */
  _connect(actions: WindowActions): void {
    this._actions = actions;
    if (this._disconnectedWarnTimer !== null) {
      clearTimeout(this._disconnectedWarnTimer);
      this._disconnectedWarnTimer = null;
    }
    if (!this._initialized) {
      this._initialized = true;
    }
    for (const entry of this._pendingSubscriptions) {
      entry.unsub = actions.subscribe(entry.event, entry.callback);
    }
    const pending = this._pendingCalls.splice(0);
    for (const fn of pending) fn(actions);
  }

  /** @internal Called by WindowManagerProvider on unmount. */
  _disconnect(): void {
    this._actions = null;
    for (const entry of this._pendingSubscriptions) {
      entry.unsub?.();
      entry.unsub = null;
    }
  }

  /** True while the provider is mounted and React state is accessible. */
  get isConnected(): boolean {
    return this._actions !== null;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _startWarnTimer(): void {
    if (this._disconnectedWarnTimer === null) {
      this._disconnectedWarnTimer = setTimeout(() => {
        if (!this.isConnected && this._pendingCalls.length > 0) {
          console.error(
            '[react-dockable-desktop] WorkspaceClient has ' + this._pendingCalls.length +
            ' queued call(s) but was never connected to a WindowManagerProvider. ' +
            'Did you forget client={workspace} on <WindowManagerProvider>?'
          );
        }
      }, process.env.NODE_ENV === 'production' ? 5000 : 1000);
    }
  }

  private _dispatch(fn: (actions: WindowActions) => void): void {
    if (this._actions) {
      fn(this._actions);
    } else {
      this._pendingCalls.push(fn);
      this._startWarnTimer();
    }
  }

  private _subscribeRaw(event: string, cb: (data: unknown) => void): () => void {
    if (this._actions) return this._actions.subscribe(event, cb);
    const entry = { event, callback: cb, unsub: null as (() => void) | null };
    this._pendingSubscriptions.push(entry);
    return () => {
      entry.unsub?.();
      entry.unsub = null;
      const idx = this._pendingSubscriptions.indexOf(entry);
      if (idx !== -1) this._pendingSubscriptions.splice(idx, 1);
    };
  }

  // ── Forwarding methods — mirrors the WindowActions public interface ────────

  openPanel(...args: Parameters<WindowActions['openPanel']>): void {
    if (this._actions) {
      this._actions.openPanel(...args);
      return;
    }
    const id = args[0];
    if (!this._pendingOpenPanelIds.has(id)) {
      this._pendingOpenPanelIds.add(id);
      this._pendingCalls.push(a => {
        this._pendingOpenPanelIds.delete(id);
        a.openPanel(...args);
      });
      this._startWarnTimer();
    }
  }

  closePanel(id: string): void { this._dispatch(a => a.closePanel(id)); }

  minimizePanel(id: string): void { this._dispatch(a => a.minimizePanel(id)); }

  restorePanel(id: string): void { this._dispatch(a => a.restorePanel(id)); }

  floatPanel(...args: Parameters<WindowActions['floatPanel']>): void {
    this._dispatch(a => a.floatPanel(...args));
  }

  dockPanel(...args: Parameters<WindowActions['dockPanel']>): void {
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
  isOpen(id: string): boolean { return this._actions?.isOpen(id) ?? false; }

  /** Returns the IDs of all currently open panels. */
  getOpenPanelIds(): string[] { return this._actions?.getOpenPanelIds() ?? []; }

  saveLayout(): string { return this._actions?.saveLayout() ?? ''; }

  loadLayout(json: string): boolean {
    if (this._actions) return this._actions.loadLayout(json);
    this._pendingCalls.push(a => { a.loadLayout(json); });
    return false;
  }

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

  /** Closes an entire leaf group (all of its tabs) at once. */
  closeLeafGroup(leafId: string): void { this._dispatch(a => a.closeLeafGroup(leafId)); }

  /** Registers a guard that can veto closing the given panel. */
  registerCloseGuard(id: string, guard: () => boolean | Promise<boolean>): void {
    this._dispatch(a => a.registerCloseGuard(id, guard));
  }

  /** Removes a previously registered close guard. */
  unregisterCloseGuard(id: string): void { this._dispatch(a => a.unregisterCloseGuard(id)); }

  /** Sets/clears a panel's dirty (unsaved changes) flag. */
  setPanelDirty(id: string, dirty: boolean, options?: DirtyStateOptions): void {
    this._dispatch(a => a.setPanelDirty(id, dirty, options));
  }

  /** Updates a panel's displayed title. */
  updatePanelTitle(id: string, title: string | ContextMenuPredefinedMessage): void {
    this._dispatch(a => a.updatePanelTitle(id, title));
  }

  /**
   * Requests that a panel close, honoring its dirty flag and any registered close guard.
   * Resolves once the close (or user cancellation) has been resolved.
   *
   * @remarks If called before the provider mounts, the request is queued and this
   * returns an already-resolved promise immediately — the caller can't observe the
   * eventual outcome of a queued call, only that the request was accepted.
   */
  requestClosePanel(id: string, options?: { force?: boolean; onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }): Promise<void> {
    if (this._actions) return this._actions.requestClosePanel(id, options);
    this._pendingCalls.push(a => { a.requestClosePanel(id, options); });
    return Promise.resolve();
  }

  /** Docks a panel to one of the workspace's outer edges. */
  dockPanelToWorkspaceEdge(id: string, position: SplitDirection): void {
    this._dispatch(a => a.dockPanelToWorkspaceEdge(id, position));
  }

  /** Shows a context menu using the app's configured ContextMenuAdapter. */
  showContextMenu(options: ShowContextMenuOptions): void { this._dispatch(a => a.showContextMenu(options)); }

  // ── Typed event bus ───────────────────────────────────────────────────────

  publish<K extends keyof (TUserEvents & BuiltInPanelEvents)>(
    event: K,
    data: (TUserEvents & BuiltInPanelEvents)[K]
  ): void {
    this._dispatch(a => a.publish(event as string, data));
  }

  subscribe<K extends keyof (TUserEvents & BuiltInPanelEvents)>(
    event: K,
    callback: (data: (TUserEvents & BuiltInPanelEvents)[K]) => void
  ): () => void {
    return this._subscribeRaw(event as string, callback as (data: unknown) => void);
  }

  // ── Lifecycle callbacks ───────────────────────────────────────────────────

  /** Subscribe to panel open events. Fires only for newly created panels. */
  onPanelOpen(callback: (id: string, component: string) => void): () => void {
    return this._subscribeRaw('panel:opened', data => {
      const d = data as BuiltInPanelEvents['panel:opened'];
      callback(d.id, d.component);
    });
  }

  /** Subscribe to panel close events. */
  onPanelClose(callback: (id: string) => void): () => void {
    return this._subscribeRaw('panel:closed', data => {
      callback((data as BuiltInPanelEvents['panel:closed']).id);
    });
  }

  /** Subscribe to panel minimize events. */
  onPanelMinimize(callback: (id: string) => void): () => void {
    return this._subscribeRaw('panel:minimized', data => {
      callback((data as BuiltInPanelEvents['panel:minimized']).id);
    });
  }

  /** Subscribe to panel restore events. */
  onPanelRestore(callback: (id: string) => void): () => void {
    return this._subscribeRaw('panel:restored', data => {
      callback((data as BuiltInPanelEvents['panel:restored']).id);
    });
  }
}
