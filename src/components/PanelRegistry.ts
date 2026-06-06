import type { ComponentType } from 'react';

export interface PanelRegistryEntry {
  Component: ComponentType<any>;
  defaultOptions?: {
    title?: string;
    icon?: React.ReactNode;
    initialTarget?: 'floating' | 'docked' | 'tabbed';
    favoritePosition?: { x: number | string; y: number | string; width: number | string; height: number | string };
    canDrag?: boolean;
    canMinimize?: boolean;
    canClose?: boolean;
    defaultStickyRight?: boolean;
    defaultStickyBottom?: boolean;
  };
}

class PanelRegistryClass {
  private registry = new Map<string, PanelRegistryEntry>();

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

  get(id: string): PanelRegistryEntry | undefined {
    return this.registry.get(id);
  }

  getRegisteredIds(): string[] {
    return Array.from(this.registry.keys());
  }
}

export const PanelRegistry = new PanelRegistryClass();
export default PanelRegistry;
