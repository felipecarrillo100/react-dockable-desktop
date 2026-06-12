import type { ComponentType } from 'react';
import { PanelRegistryClass } from './components/PanelRegistry';
import type { PanelRegistryEntry } from './components/PanelRegistry';
import type { WindowActions, MessageFormatter, ContextMenuPredefinedMessage } from './components/WindowManagerContext';

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
 * in order once `_connect()` fires. If the client is never connected to a
 * provider (e.g. `client={workspace}` was forgotten), a console warning is
 * emitted in development after 1 second.
 *
 * `subscribe()` and `saveLayout()` return values immediately and cannot be
 * queued — they return safe defaults (`() => {}` and `''`) when disconnected.
 *
 * @example
 * const workspace = new WorkspaceClient({
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
export class WorkspaceClient {
  /** Scoped panel registry — fully independent from the global singleton. */
  readonly registry: PanelRegistryClass;

  /** Serialised layout to restore on mount, or null to start with an empty canvas. */
  readonly initialState: string | null;

  /** Non-rendering configuration forwarded to the provider. */
  readonly config: Pick<WorkspaceClientConfig, 'formatMessage' | 'predefinedMessages' | 'dir'>;

  private _actions: WindowActions | null = null;

  /** Calls queued before _connect() fires — replayed in order on first connect. */
  private _pendingCalls: Array<(actions: WindowActions) => void> = [];

  /** DEV-only timer that warns if _connect() is never called within 1 second. */
  private _disconnectedWarnTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WorkspaceClientConfig = {}) {
    this.registry = new PanelRegistryClass();
    this.initialState = config.initialState ?? null;
    this.config = {
      formatMessage: config.formatMessage,
      predefinedMessages: config.predefinedMessages,
      dir: config.dir,
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
    const pending = this._pendingCalls.splice(0); // drain atomically
    for (const fn of pending) fn(actions);
  }

  /** @internal Called by WindowManagerProvider on unmount. */
  _disconnect(): void {
    this._actions = null;
  }

  /** True while the provider is mounted and React state is accessible. */
  get isConnected(): boolean {
    return this._actions !== null;
  }

  // ── Internal dispatch helper ──────────────────────────────────────────────

  /**
   * Dispatches a void action immediately if connected, or queues it for replay.
   * In development, warns if the client is still not connected after 1 second.
   */
  private _dispatch(fn: (actions: WindowActions) => void): void {
    if (this._actions) {
      fn(this._actions);
    } else {
      this._pendingCalls.push(fn);
      if (process.env.NODE_ENV !== 'production' && this._disconnectedWarnTimer === null) {
        this._disconnectedWarnTimer = setTimeout(() => {
          if (!this.isConnected && this._pendingCalls.length > 0) {
            console.warn(
              '[react-dockable-desktop] WorkspaceClient has queued calls but was never ' +
              'connected to a provider. Did you forget client={workspace} on ' +
              '<WindowManagerProvider client={workspace}>?'
            );
          }
        }, 1000);
      }
    }
  }

  // ── Forwarding methods — mirrors the WindowActions public interface ────────

  openPanel(...args: Parameters<WindowActions['openPanel']>): void {
    this._dispatch(a => a.openPanel(...args));
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

  publish(event: string, data: unknown): void { this._dispatch(a => a.publish(event, data)); }

  subscribe(event: string, callback: (data: unknown) => void): () => void {
    return this._actions?.subscribe(event, callback) ?? (() => {});
  }
}
