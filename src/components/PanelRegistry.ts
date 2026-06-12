import type { ComponentType } from 'react';

/**
 * Represents a registered component configuration template inside the panel catalog registry.
 */
export interface PanelRegistryEntry {
  /** The React component type registered. */
  Component: ComponentType<any>;
  /** Default metadata settings configuration applied on instantiation. */
  defaultOptions?: {
    /** Tab and window headers text — plain string or i18n descriptor. */
    title?: string | { id: string; defaultMessage?: string; values?: Record<string, string | number> };
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
    /** Affixes the panel to the right edge. */
    defaultStickyRight?: boolean;
    /** Affixes the panel to the bottom edge. */
    defaultStickyBottom?: boolean;
    /** Disables live WebGL rendering canvas thumbnails inside the taskbar hover popup previews. */
    disableLivePreview?: boolean;
    /** Custom header actions renderer, placing custom components in the window/tab titlebar. */
    renderHeaderActions?: (panelId: string) => React.ReactNode;
  };
}

/**
 * Registry mapping catalog entries to allow programmatic panel instantiation
 * inside dynamic layout cells or floating windows.
 */
class PanelRegistryClass {
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
      Component: Component as ComponentType<any>,
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
export const PanelRegistry = new PanelRegistryClass();
export default PanelRegistry;
