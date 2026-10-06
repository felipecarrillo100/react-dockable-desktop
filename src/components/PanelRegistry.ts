import type { ComponentType } from 'react';
import type { FloatAnchor } from '../types';

/**
 * Represents a registered component configuration template inside the panel catalog registry.
 */
export interface PanelRegistryEntry {
  /** The React component type registered. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- public: a registry holds components with different props; unknown would reject them
  Component: ComponentType<any>;
  /** Default metadata settings configuration applied on instantiation. */
  defaultOptions?: {
    /** Tab and window headers text — plain string or i18n descriptor. */
    title?: string | { id: string; defaultMessage?: string; values?: Record<string, string | number> } | (() => string);
    /** Icon placed next to title tags. */
    icon?: React.ReactNode;
    /** Initial mounting state inside the desktop layout grid. */
    initialTarget?: 'floating' | 'docked' | 'tabbed';
    /** Custom default bounds applied when the container is floated. */
    favoritePosition?: { x: number | string; y: number | string; width: number | string; height: number | string };
    /** Enables/disables window drag interactions. */
    canDrag?: boolean;
    /** Enables/disables minimizing of the panel instance. */
    canMinimize?: boolean;
    /** Enables/disables closing actions for the tab/window. */
    canClose?: boolean;
    /** Corner of the workspace to anchor newly-opened floating windows to. */
    defaultAnchor?: FloatAnchor;
    /** Disables live WebGL rendering canvas thumbnails inside the taskbar hover popup previews. */
    disableLivePreview?: boolean;
    /** Custom header actions renderer, placing custom components in the window/tab titlebar. */
    renderHeaderActions?: (panelId: string) => React.ReactNode;
    /**
     * Class added to each panel of this type, on its own content element (`.rdd-panel-content`),
     * which moves with the panel between groups, windows and the taskbar preview. (7.8.0)
     */
    className?: string;
    /** Class added to the tab of each panel of this type. (7.8.0) */
    tabClassName?: string;
    /**
     * `false` unmounts the panel's component while it is hidden (an unselected tab, or minimized)
     * and mounts it afresh when it is shown, to free what a heavy, rarely shown panel holds. Its
     * own state is lost each time; its tab, title and lifecycle continue (`onClose` is not called),
     * and the taskbar shows a placeholder instead of a live preview. While it is unmounted, a
     * guard it registered with `useBeforeClose` is not active (its dirty flag still is), and
     * `saveLayout()` saves its open-time props. @default true: panels stay mounted and keep their
     * state, as they always have. (7.8.0)
     */
    keepAlive?: boolean;
  };
}

/**
 * Registry mapping catalog entries to allow programmatic panel instantiation
 * inside dynamic layout cells or floating windows.
 * Exported so `createWorkspace()` can create scoped, per-instance registries.
 */
export class PanelRegistry {
  private registry = new Map<string, PanelRegistryEntry>();

  /**
   * Register a new component to the panel catalog registry.
   * @param id - Unique string identifier.
   * @param Component - React component instance template.
   * @param defaultOptions - Custom default settings configuration.
   */
  register<P extends object>(
    id: string,
    Component: ComponentType<P>,
    defaultOptions?: PanelRegistryEntry['defaultOptions']
  ): void {
    this.registry.set(id, {
      Component: Component as PanelRegistryEntry['Component'],
      defaultOptions
    });
  }

  /**
   * Retrieve a registered panel configuration by identifier.
   */
  get(id: string): PanelRegistryEntry | undefined {
    return this.registry.get(id);
  }

  /**
   * Returns a list of all registered panel entry identifiers.
   */
  getRegisteredIds(): string[] {
    return Array.from(this.registry.keys());
  }
}

/** Global singleton instance of the Panel Registry. */
export const globalPanelRegistry: PanelRegistry = new PanelRegistry();
