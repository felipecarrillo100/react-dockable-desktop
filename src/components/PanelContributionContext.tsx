/**
 * @file PanelContributionContext.tsx
 * @description Lets any panel publish toolbar items and/or sidebar sections that
 * should only be surfaced while it is the globally active panel (`state.activePanelId`).
 * Optional, additive module — `DockableDesktopProvider` wires it up automatically.
 * Neither `<Toolbar>` nor `<Sidebar>` reads from this automatically; the app shell
 * merges `useActivePanelContribution()`'s result into its own `items`/`tabs` calls.
 */

import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ToolbarItem } from './Toolbar';
import type { SidebarTab } from './Sidebar';
import { usePanelId, useWindowManagerState } from './WindowManagerContext';

/** A single named, labeled slot of content a panel contributes to the app's Sidebar while active. */
export interface PanelSidebarSection {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

/**
 * What a panel publishes via `usePanelContribution()`. Both fields are optional and
 * independent — a panel may contribute only toolbar items, only sidebar sections,
 * both, or neither. The app decides what "toolbar items" and "sidebar sections" mean
 * for its own domain (map controls, document formatting, anything else).
 */
export interface PanelContribution {
  toolbarItems?: ToolbarItem[];
  sidebarSections?: PanelSidebarSection[];
}

type Listener = () => void;

interface PanelContributionStore {
  publish(panelId: string, contribution: PanelContribution): () => void;
  get(panelId: string): PanelContribution | null;
  subscribe(listener: Listener): () => void;
}

function createPanelContributionStore(): PanelContributionStore {
  const contributions = new Map<string, PanelContribution>();
  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach(l => l());

  return {
    publish(panelId, contribution) {
      contributions.set(panelId, contribution);
      notify();
      return () => {
        // Only clear if nothing else re-published for this id in the meantime.
        if (contributions.get(panelId) === contribution) {
          contributions.delete(panelId);
          notify();
        }
      };
    },
    get(panelId) {
      return contributions.get(panelId) ?? null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const PanelContributionContext = createContext<PanelContributionStore | null>(null);

/**
 * Provider enabling `usePanelContribution()` / `useActivePanelContribution()`.
 * Mounted automatically by `DockableDesktopProvider` — only needed manually when
 * composing `WindowManagerProvider` directly without it.
 */
export const PanelContributionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useMemo(() => createPanelContributionStore(), []);
  return <PanelContributionContext.Provider value={store}>{children}</PanelContributionContext.Provider>;
};

/**
 * Publish this panel's toolbar items and/or sidebar sections. Call on every render —
 * republishes automatically whenever `contribution` changes, and is cleared when the
 * panel unmounts. Memoize the object (and its array/callback contents, e.g. with
 * `useMemo`/`useCallback`) to avoid republishing on every unrelated re-render.
 *
 * Contributions are only ever surfaced while this panel is `state.activePanelId` —
 * see `useActivePanelContribution()`. No-op outside a `PanelContributionProvider` tree.
 *
 * @example
 * function MapPanel() {
 *   const [controller, setController] = useState<'pan' | 'draw' | 'measure'>('pan');
 *   usePanelContribution({
 *     toolbarItems: (['pan', 'draw', 'measure'] as const).map(id => ({
 *       type: 'toggle', id, label: id, icon: icons[id],
 *       active: controller === id, onToggle: () => setController(id),
 *     })),
 *     sidebarSections: [{ id: 'layers', label: 'Layers', content: <LayerList /> }],
 *   });
 *   // ...
 * }
 */
export function usePanelContribution(contribution: PanelContribution): void {
  const panelId = usePanelId();
  const store = useContext(PanelContributionContext);
  const cleanupRef = useRef<(() => void) | null>(null);

  if (!store) {
    console.warn('usePanelContribution() called outside <PanelContributionProvider>. Returning no-op.');
  }

  useLayoutEffect(() => {
    if (!store) return;
    cleanupRef.current?.();
    cleanupRef.current = store.publish(panelId, contribution);
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [store, panelId, contribution]);
}

/**
 * Returns whatever the currently active panel (`state.activePanelId`) has published
 * via `usePanelContribution()`, or `null` if no panel is active or the active panel
 * hasn't contributed anything. Intended for the app shell to merge into its own
 * `<Toolbar items={...}>` / `<Sidebar tabs={...}>` calls.
 */
export function useActivePanelContribution(): PanelContribution | null {
  const activePanelId = useWindowManagerState(s => s.activePanelId);
  const store = useContext(PanelContributionContext);

  if (!store) {
    console.warn('useActivePanelContribution() called outside <PanelContributionProvider>. Returning null.');
  }

  const subscribe = useCallback(
    (onChange: Listener) => (store ? store.subscribe(onChange) : () => {}),
    [store]
  );
  const getSnapshot = () => (store && activePanelId ? store.get(activePanelId) : null);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Converts a contributed sidebar section into a `SidebarTab` for `<Sidebar tabs={...}>`.
 * `SidebarTab.icon` is required, so supply `fallbackIcon` for sections that omit one.
 * `eagerMount`/`preserveState` have no contribution-side equivalent — a contribution
 * only exists while its owning panel is mounted and active, so both are left unset.
 */
export function sidebarSectionToTab(section: PanelSidebarSection, fallbackIcon: React.ReactNode = null): SidebarTab {
  return {
    id: section.id,
    label: section.label,
    icon: section.icon ?? fallbackIcon,
    renderContent: () => section.content,
  };
}

/**
 * Convenience wrapper around `useActivePanelContribution()` for the common case:
 * append the active panel's contributed toolbar items (behind a separator) to a
 * static list. Returns `staticItems` unchanged when there's nothing to add.
 * For manual control (a different merge position, no separator, etc.), call
 * `useActivePanelContribution()` directly instead.
 */
export function useMergedToolbarItems(staticItems: ToolbarItem[]): ToolbarItem[] {
  const active = useActivePanelContribution();
  return active?.toolbarItems?.length
    ? [...staticItems, { type: 'separator' }, ...active.toolbarItems]
    : staticItems;
}

/**
 * Convenience wrapper around `useActivePanelContribution()` for the common case:
 * append the active panel's contributed sidebar sections (via `sidebarSectionToTab`)
 * to a static tab list, as dynamic tabs that appear only while their panel is active.
 * Returns `staticTabs` unchanged when there's nothing to add.
 */
export function useMergedSidebarTabs(staticTabs: SidebarTab[], fallbackIcon: React.ReactNode = null): SidebarTab[] {
  const active = useActivePanelContribution();
  return active?.sidebarSections?.length
    ? [...staticTabs, ...active.sidebarSections.map(section => sidebarSectionToTab(section, fallbackIcon))]
    : staticTabs;
}
