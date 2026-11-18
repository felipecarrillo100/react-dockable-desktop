/**
 * @file panelHost.ts
 * @description Where one workspace keeps its panels' DOM, sizes and lifecycle handlers.
 *
 * One host per provider, never module-level. These used to be three module-level maps keyed by
 * panel id alone, so every workspace on the page shared them: each workspace's cleanup deleted the
 * other workspaces' cached elements (their panels remounted blank), and two workspaces with the same
 * panel id rendered into one element and fired each other's lifecycle handlers. vdd's `PanelDomCache`
 * and ndd's `PanelHost` are per desktop for the same reason.
 */
import { createContext, useContext, type Context } from 'react';
import { trackPanelDom } from '../domPreservation';
import type { ContainerType } from '../FormContainerContext';

export interface PanelLifecycleRegistry {
  onClose: Set<() => void>;
  onMinimize: Set<() => void>;
  onRestore: Set<() => void>;
  onResize: Set<(w: number, h: number) => void>;
  onActivate: Set<() => void>;
  onDeactivate: Set<() => void>;
  onContainerTypeChange: Set<(type: ContainerType) => void>;
}

export interface PanelHost {
  /** The panel's preserved element: created on first use, then moved between slots, never remounted. */
  getOrCreateElement(id: string): HTMLDivElement;
  /** The panel's element if it has one. */
  getElement(id: string): HTMLDivElement | undefined;
  /** Ids of the panels this host holds an element for. */
  ids(): string[];
  /** Drops a closed panel's element (and with it, its recorded scroll and focus). */
  forget(id: string): void;
  /**
   * Parks an element in the hidden store of this host's document, while no slot shows it. The
   * store is found or created in that document, not the global one, so a host bound to another
   * document (a pop-out window, later) parks there.
   */
  park(el: HTMLElement): void;
  /** The panel's last on-screen size, or undefined before it was first laid out. */
  getDimensions(id: string): { width: number; height: number } | undefined;
  setDimensions(id: string, size: { width: number; height: number }): void;
  getLifecycle(id: string): PanelLifecycleRegistry | undefined;
  getOrCreateLifecycle(id: string): PanelLifecycleRegistry;
  deleteLifecycle(id: string): void;
}

/**
 * Where a panel's element waits while no slot shows it: one per document, shared on purpose. Every
 * workspace's elements are distinct, so parking them side by side in one hidden node is harmless.
 */
const hiddenContainerId = 'preserved-dom-container';

/**
 * @param ownerDocument The document this host creates and parks its elements in. Defaults to the
 *   global one, looked up on first use rather than here, so a provider can be created where there
 *   is no DOM (server rendering) as long as no element is asked for. vdd's `PanelDomCache` takes
 *   the same optional document.
 */
export function createPanelHost(ownerDocument?: Document): PanelHost {
  const doc = (): Document => ownerDocument ?? document;
  const elements = new Map<string, HTMLDivElement>();
  const dimensions = new Map<string, { width: number; height: number }>();
  const lifecycle = new Map<string, PanelLifecycleRegistry>();

  return {
    getOrCreateElement(id) {
      let el = elements.get(id);
      if (!el) {
        el = doc().createElement('div');
        el.className = 'rdd-panel-dom';
        elements.set(id, el);
        trackPanelDom(el);
      }
      return el;
    },
    getElement: (id) => elements.get(id),
    ids: () => Array.from(elements.keys()),
    forget: (id) => { elements.delete(id); },
    park(el) {
      const d = doc();
      let store = d.getElementById(hiddenContainerId);
      if (!store) {
        store = d.createElement('div');
        store.id = hiddenContainerId;
        store.style.display = 'none';
        d.body.appendChild(store);
      }
      store.appendChild(el);
    },
    getDimensions: (id) => dimensions.get(id),
    setDimensions: (id, size) => { dimensions.set(id, size); },
    getLifecycle: (id) => lifecycle.get(id),
    getOrCreateLifecycle(id) {
      let entry = lifecycle.get(id);
      if (!entry) {
        entry = {
          onClose: new Set(),
          onMinimize: new Set(),
          onRestore: new Set(),
          onResize: new Set(),
          onActivate: new Set(),
          onDeactivate: new Set(),
          onContainerTypeChange: new Set(),
        };
        lifecycle.set(id, entry);
      }
      return entry;
    },
    deleteLifecycle: (id) => { lifecycle.delete(id); },
  };
}

/** @internal The nearest provider's panel host. */
export const PanelHostContext: Context<PanelHost | null> = createContext<PanelHost | null>(null);

/** @internal The nearest provider's panel host. Throws outside a provider, as the slots never render there. */
export function usePanelHost(): PanelHost {
  const host = useContext(PanelHostContext);
  if (!host) throw new Error('[react-dockable-desktop] panel slots must render inside <DockableDesktopProvider>');
  return host;
}
