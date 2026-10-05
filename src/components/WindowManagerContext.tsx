import React, { createContext, useContext, useState, useRef, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useFormContainer } from './FormContainerContext';
import { globalPanelRegistry } from './PanelRegistry';
import { createPanelHost, PanelHostContext, type PanelHost } from './workspace/panelHost';
import { claimDocumentMirror, releaseDocumentMirror } from '../utils/documentMirror';
import type { PanelRegistry } from './PanelRegistry';
import { defaultPredefinedMessages } from './predefinedMessages';
import type { MessageKey } from './predefinedMessages';
import type { DirtyStateOptions } from './dirtyOptions';
import type { ContextMenuItem } from './ContextMenu';
import type { MessageDescriptor, MessageFormatter, WorkspaceState, WorkspaceActions, InternalWindowActions, HostClasses, WindowManagerProviderProps, WorkspaceCore } from '../types';
import { defaultFormatMessage } from '../core/messages';
import { createWorkspaceCore } from '../core/workspaceCore';
export type { MessageKey } from './predefinedMessages';
export { defaultPredefinedMessages } from './predefinedMessages';
export type { DirtyStateOptions };

// Moved in 7.6.1; re-exported so every existing import of this module keeps working.
export type { MessageDescriptor, MessageFormatter, SplitOrientation, SplitDirection, DropPosition, DropTarget, LayoutGridNode, LayoutLeafNode, LayoutNode, FloatAnchor, FloatingWindow, PanelInfo, OpenPanelOptions, WorkspaceState, WorkspaceActions, InternalWindowActions, HostClasses, SerializedLayout, WindowManagerProviderProps, WorkspaceCoreConfig, WorkspaceCore } from '../types';
export { defaultFormatMessage, formatLabel } from '../core/messages';
export { createWorkspaceCore } from '../core/workspaceCore';

const WindowActionsContext = createContext<InternalWindowActions | null>(null);
const WindowI18nContext = createContext<MessageFormatter | null>(null);

interface WindowStoreSyncContextValue {
  getSnapshot: () => WorkspaceState;
  subscribeToState: (callback: () => void) => () => void;
}
/** @internal Snapshot + subscribe for selector hooks (`useWorkspaceState(selector)`, `usePanel`). */
export const WindowStoreSyncContext: React.Context<WindowStoreSyncContextValue | null> = createContext<WindowStoreSyncContextValue | null>(null);

const WindowPredefinedMessagesContext = createContext<Record<MessageKey, MessageDescriptor>>(defaultPredefinedMessages);


const StyleClassContext = createContext<HostClasses>({});

/** Custom hook to read configured style class contexts. */
export const useStyleClasses = (): HostClasses => useContext(StyleClassContext);

const RegistryContext = createContext<PanelRegistry>(globalPanelRegistry);

/**
 * React hook to read the scoped {@link PanelRegistry} for the current provider.
 * When the provider was given a workspace from {@link createWorkspace}, this returns that workspace's
 * private registry. Otherwise it returns the global `globalPanelRegistry` singleton.
 *
 * @group Hooks
 * @returns The panel registry instance in scope.
 * @example
 * ```tsx
 * function MyComponent() {
 *   const registry = useRegistry();
 *   const entry = registry.get('map');
 *   return entry ? <entry.Component panelId="preview" /> : null;
 * }
 * ```
 */
export const useRegistry = (): PanelRegistry => useContext(RegistryContext);


export const WindowManagerProvider: React.FC<WindowManagerProviderProps> = ({
  children,
  client,
  formatMessage,
  predefinedMessages,
  dir: dirProp,
  modalClass,
  modalBodyClass,
  sidePanelClass,
  sidePanelBodyClass,
  windowClass,
  windowBodyClass,
  zIndexBase: zIndexBaseProp
}) => {
  // The workspace store: the client's own, or one owned by this provider (then panels come from
  // the global globalPanelRegistry, as before). The store is live before this mounts; nothing connects.
  const [core] = useState<WorkspaceCore>(() => {
    const c = client
      ? client._core
      : createWorkspaceCore({ registry: globalPanelRegistry, dir: dirProp, zIndexBase: zIndexBaseProp });
    c.applyProviderDefaults({ dir: dirProp, zIndexBase: zIndexBaseProp });
    return c;
  });
  const registry = client?.registry ?? globalPanelRegistry;
  // This workspace's own panel DOM, sizes and lifecycle handlers — never shared with another provider.
  const [panelHost] = useState<PanelHost>(createPanelHost);
  const actions = core.actions;

  // Effective config: client config takes precedence over individual provider props
  const effectiveFormatMessage = client?.config.formatMessage ?? formatMessage;
  const effectivePredefinedMessages = client?.config.predefinedMessages ?? predefinedMessages;
  const effectiveDir = client?.config.dir ?? dirProp;
  const effectiveZIndexBase = client?.config.zIndexBase ?? zIndexBaseProp ?? 1000;

  const mergedMessages = useMemo(() => ({
    ...defaultPredefinedMessages,
    ...effectivePredefinedMessages
  }), [effectivePredefinedMessages]);

  // Mirror the z-index base onto document.documentElement as a CSS variable so the
  // library's portaled chrome (ContextMenu, Toast, Toolbar's flyout, ModalStackRenderer),
  // which renders outside this provider's own DOM subtree, shifts in lockstep with
  // the floating windows' z counter.
  // Through the document mirror, keyed by this workspace's panel host (as RddDesktop's skin is), so
  // two workspaces on one page don't strip each other's base on unmount.
  useEffect(() => {
    claimDocumentMirror(panelHost, { zBase: effectiveZIndexBase });
  }, [panelHost, effectiveZIndexBase]);
  useEffect(() => () => releaseDocumentMirror(panelHost, ['zBase']), [panelHost]);

  useEffect(() => {
    if (effectiveDir) actions.setDirection(effectiveDir);
  }, [effectiveDir, actions]);


  const styleClasses = useMemo(() => ({
    modalClass,
    modalBodyClass,
    sidePanelClass,
    sidePanelBodyClass,
    windowClass,
    windowBodyClass
  }), [modalClass, modalBodyClass, sidePanelClass, sidePanelBodyClass, windowClass, windowBodyClass]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    // Check 1: styles.css sentinel — catches the "forgot to import" case precisely
    try {
      const sentinel = getComputedStyle(document.documentElement)
        .getPropertyValue('--rdd-styles-loaded').trim();
      if (sentinel !== '1') {
        console.error(
          "[react-dockable-desktop] styles.css is not imported.\n" +
          "Add this to your entry file (main.tsx / index.tsx):\n" +
          "  import 'react-dockable-desktop/styles.css'\n" +
          "Without it the workspace renders as a black screen with no console errors."
        );
      }
    } catch { /* getComputedStyle unavailable (SSR) */ }

  }, []);

  const syncContextValue = useMemo<WindowStoreSyncContextValue>(
    () => ({ getSnapshot: core.getSnapshot, subscribeToState: core.subscribeToState }),
    [core]
  );

  return (
    <StyleClassContext.Provider value={styleClasses}>
      <RegistryContext.Provider value={registry}>
        <WindowStoreSyncContext.Provider value={syncContextValue}>
          <WindowActionsContext.Provider value={actions}>
            <WindowI18nContext.Provider value={effectiveFormatMessage || defaultFormatMessage}>
              <WindowPredefinedMessagesContext.Provider value={mergedMessages}>
                <PanelHostContext.Provider value={panelHost}>
                  {children}
                </PanelHostContext.Provider>
              </WindowPredefinedMessagesContext.Provider>
            </WindowI18nContext.Provider>
          </WindowActionsContext.Provider>
        </WindowStoreSyncContext.Provider>
      </RegistryContext.Provider>
    </StyleClassContext.Provider>
  );
};

const noopSubscribe = (_cb: () => void): (() => void) => () => {};
const noopRead = (): null => null;

/**
 * The live workspace state. The component re-renders whenever it changes — or, given a selector,
 * only when the selected value changes.
 *
 * For reads without a subscription, call the workspace's `isOpen()` or `getOpenPanelIds()`.
 *
 * The selector must return a value that stays the same while the state does — a primitive, or a
 * part of the state as it is (`s => s.panels[id]`). A selector that builds a new object or array
 * on each call (`s => ({ n: s.floating.length })`, `s => s.floating.map(...)`) is a new value
 * every time React asks, and React stops with "Maximum update depth exceeded". Select the parts
 * separately, or
 * derive the object with `useMemo` from what you selected.
 *
 * @returns The current workspace state, or the selector's result.
 * @throws Error if used outside `<DockableDesktopProvider>`.
 * @example
 * ```tsx
 * function PanelCount() {
 *   const count = useWorkspaceState(s => Object.keys(s.panels).length);
 *   return <span>{count} open</span>;
 * }
 * ```
 */
export function useWindowManagerState(): WorkspaceState;
export function useWindowManagerState<T>(selector: (state: WorkspaceState) => T): T;
export function useWindowManagerState<T>(selector?: (state: WorkspaceState) => T): WorkspaceState | T {
  // Straight from the store, with the selector inside the subscription: until 7.7.2 this also read
  // a context holding the whole state, so it re-rendered on every change whatever the selector
  // returned.
  const syncCtx = useContext(WindowStoreSyncContext);
  const read = (): WorkspaceState | T => {
    const snap = syncCtx!.getSnapshot();
    return selector ? selector(snap) : snap;
  };
  const value = useSyncExternalStore(syncCtx?.subscribeToState ?? noopSubscribe, syncCtx ? read : noopRead, syncCtx ? read : noopRead);
  if (!syncCtx) throw new Error('useWorkspaceState must be used within <DockableDesktopProvider>');
  return value;
}

/**
 * @internal `useWorkspaceState(selector)` for components that may also render outside a provider
 * (sidebar, toasts, panel overlays, a panel used standalone): `fallback` there instead of throwing.
 */
export function useOptionalWindowManagerState<T>(selector: (state: WorkspaceState) => T, fallback: T): T {
  const syncCtx = useContext(WindowStoreSyncContext);
  const read = (): T => (syncCtx ? selector(syncCtx.getSnapshot()) : fallback);
  return useSyncExternalStore(syncCtx?.subscribeToState ?? noopSubscribe, read, read);
}

/**
 * React hook to retrieve all layout mutation actions.
 * Returns the public {@link WorkspaceActions} interface.
 *
 * @group Hooks
 * @returns The full set of workspace mutation methods.
 * @throws Error if used outside of a {@link DockableDesktopProvider}.
 * @example
 * ```tsx
 * function Toolbar() {
 *   const actions = useWindowManagerActions();
 *   return (
 *     <button onClick={() => actions.openPanel('map-1', 'map')}>Open Map</button>
 *   );
 * }
 * ```
 */
export const useWindowManagerActions = (): WorkspaceActions => {
  const ctx = useContext(WindowActionsContext);
  if (!ctx) throw new Error('useWorkspace must be used within <DockableDesktopProvider>');
  return ctx;
};

/**
 * @internal — used by WindowManager.tsx rendering components only.
 * Returns the full {@link InternalWindowActions} including `setActivePanel`.
 */
export const useWindowManagerActionsInternal = (): InternalWindowActions => {
  const ctx = useContext(WindowActionsContext);
  if (!ctx) throw new Error('react-dockable-desktop components must be used within <DockableDesktopProvider>');
  return ctx;
};


/**
 * React hook to retrieve the active i18n formatter.
 */
export const useFormatMessage = (): MessageFormatter => {
  const formatter = useContext(WindowI18nContext);
  return formatter || defaultFormatMessage;
};


/**
 * React hook providing pub-sub helper methods for inter-panel event messaging.
 */
export const usePanelContext = (): Pick<WorkspaceActions, 'publish' | 'subscribe'> => {
  const { publish, subscribe } = useWindowManagerActions();
  return { publish, subscribe };
};

/**
 * React hook to fetch the localizable predefined message map catalog.
 */
export const usePredefinedMessages = (): Record<MessageKey, MessageDescriptor> => {
  return useContext(WindowPredefinedMessagesContext);
};

/**
 * React hook to retrieve the panel instance ID for the component currently rendered inside
 * the dockable desktop. Works for docked, floating, modal, and side-panel containers.
 * Opt-in — components that don't need the ID require no changes.
 *
 * @group Hooks
 * @returns The unique panel instance ID string.
 * @example
 * ```tsx
 * function MyPanel() {
 *   const panelId = usePanelId();
 *   const { closePanel } = useWindowManagerActions();
 *   return <button onClick={() => closePanel(panelId)}>Close</button>;
 * }
 * ```
 */
export const usePanelId = (): string => useFormContainer().instanceId;

/**
 * React hook for injecting custom context menu items into a panel's context menu from inside the panel component.
 * Items are dynamic — the array is re-read each time the menu opens, so state-driven changes (enable/disable, add/remove) work automatically.
 * The hook knows which panel it is in — no id needed.
 *
 * @param items - Array of `ContextMenuItem` entries (simple items, separators, submenus).
 * @example
 * ```tsx
 * import { usePanelContextMenu } from 'dockable-windows';
 *
 * function MyPanel() {
 *   const [dirty, setDirty] = useState(false);
 *   usePanelContextMenu([
 *     { label: 'Save', action: () => save() },
 *     { label: 'Revert', action: () => revert() },
 *   ]);
 *   return <Editor onChange={() => setDirty(true)} />;
 * }
 * ```
 */
export function usePanelContextMenu(items: ContextMenuItem[]): void {
  const ctx = useContext(WindowActionsContext);
  const panelId = usePanelId();
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!ctx?.registerPanelContextMenu || !panelId) return;
    return ctx.registerPanelContextMenu(panelId, () => itemsRef.current);
  }, [panelId, ctx?.registerPanelContextMenu]);
}
