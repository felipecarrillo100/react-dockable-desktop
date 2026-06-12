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
 * it to <WindowManagerProvider client={client}>.
 *
 * Pattern: TanStack QueryClient / Redux store — configuration and imperative
 * access live on the client; rendering is delegated to the thin React provider.
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
 * workspace.openPanel('map', 'map');
 */
export class WorkspaceClient {
  /** Scoped panel registry — fully independent from the global singleton. */
  readonly registry: PanelRegistryClass;

  /** Serialised layout to restore on mount, or null to start with an empty canvas. */
  readonly initialState: string | null;

  /** Non-rendering configuration forwarded to the provider. */
  readonly config: Pick<WorkspaceClientConfig, 'formatMessage' | 'predefinedMessages' | 'dir'>;

  private _actions: WindowActions | null = null;

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

  /** @internal Called by WindowManagerProvider after mount. */
  _connect(actions: WindowActions): void {
    this._actions = actions;
  }

  /** @internal Called by WindowManagerProvider on unmount. */
  _disconnect(): void {
    this._actions = null;
  }

  /** True while the provider is mounted and React state is accessible. */
  get isConnected(): boolean {
    return this._actions !== null;
  }

  // ── Forwarding methods — mirrors the WindowActions interface ──────────────

  saveLayout(): string { return this._actions?.saveLayout() ?? ''; }
  loadLayout(json: string): void { this._actions?.loadLayout(json); }

  openPanel(...args: Parameters<WindowActions['openPanel']>): void {
    this._actions?.openPanel(...args);
  }
  closePanel(id: string): void { this._actions?.closePanel(id); }
  minimizePanel(id: string): void { this._actions?.minimizePanel(id); }
  restorePanel(id: string): void { this._actions?.restorePanel(id); }

  floatPanel(...args: Parameters<WindowActions['floatPanel']>): void {
    this._actions?.floatPanel(...args);
  }
  dockPanel(...args: Parameters<WindowActions['dockPanel']>): void {
    this._actions?.dockPanel(...args);
  }
  maximizePanel(id: string): void { this._actions?.maximizePanel(id); }
  bringToFront(id: string): void { this._actions?.bringToFront(id); }

  setDirection(dir: 'ltr' | 'rtl'): void { this._actions?.setDirection(dir); }

  publish(event: string, data: unknown): void { this._actions?.publish(event, data); }
  subscribe(event: string, callback: (data: unknown) => void): () => void {
    return this._actions?.subscribe(event, callback) ?? (() => {});
  }
}
