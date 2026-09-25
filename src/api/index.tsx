/**
 * The 7.0 public API layer: `createWorkspace()`, the hooks a panel or an app component uses, and
 * the two components that replace several 6.x ones (`RddSidePanels`, `RddContextMenu`).
 *
 * Everything here is built on the library's internal modules; `src/index.ts` exports it together
 * with the internal components under their 7.0 names.
 */
import React, { forwardRef, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { WorkspaceClient, type WorkspaceClientConfig } from '../WorkspaceClient';
import { WorkspaceInstanceContext } from '../components/WorkspaceInstanceContext';
import { WindowStoreSyncContext, type MessageDescriptor, type WorkspaceState, type PanelInfo } from '../components/WindowManagerContext';
import { useFormContainer, type CloseOptions, type ContainerType, type FormContainerContract } from '../components/FormContainerContext';
import type { DirtyStateOptions } from '../components/dirtyOptions';
import { usePanelActions, usePanelState, type OverlayInstance, type OverlayId, type ModalOptions, type SidePanelOptions } from '../components/PanelProviderContext';
export type { OverlayInstance, OverlayId };
import SidePanelRenderer, { LeftPanelRenderer, RightPanelRenderer } from '../components/SidePanelRenderer';
import { ContextMenu, ContextMenuProvider, type ContextMenuAdapter, type ContextMenuHandle, type ContextMenuProps } from '../components/ContextMenu';

// ─── Workspace ──────────────────────────────────────────────────────────────────

/** Configuration for {@link createWorkspace}. */
export interface WorkspaceConfig extends Omit<WorkspaceClientConfig, 'predefinedMessages'> {
  /** Overrides any subset of the built-in message table. */
  messages?: Record<string, MessageDescriptor>;
}

/**
 * A workspace: the layout, every action on it, the panel registry and the event bus. It is live
 * from the moment it is created — calls made before any `<DockableDesktopProvider>` mounts apply
 * immediately.
 */
// An interface rather than an alias, so the API reference lists the members under this name.
export interface Workspace<TEvents extends object = Record<string, unknown>> extends WorkspaceClient<TEvents> {}

/**
 * Creates a workspace. Pass it to `<DockableDesktopProvider workspace={…}>`.
 *
 * @example
 * ```ts
 * interface AppEvents { 'layer:select': { layerId: string } }
 * export const workspace = createWorkspace<AppEvents>({
 *   panels: { map: { component: MapPanel } },
 *   initialState: localStorage.getItem('layout'),
 * });
 * ```
 */
export function createWorkspace<TEvents extends object = Record<string, unknown>>(config: WorkspaceConfig = {}): Workspace<TEvents> {
  const { messages, ...rest } = config;
  return new WorkspaceClient<TEvents>({ ...rest, predefinedMessages: messages });
}

/**
 * The workspace of the nearest `<DockableDesktopProvider>`. A stable object: it never changes, so
 * a component that only calls actions never re-renders because of it.
 */
export function useWorkspace<TEvents extends object = Record<string, unknown>>(): Workspace<TEvents> {
  const ws = useContext(WorkspaceInstanceContext);
  if (!ws) throw new Error('useWorkspace must be used within <DockableDesktopProvider>');
  return ws as Workspace<TEvents>;
}

// ─── Panel side ─────────────────────────────────────────────────────────────────

const noopSubscribe = () => () => {};

/** Reads workspace state if there is a workspace; `fallback` otherwise (standalone use). */
function useOptionalWorkspaceState<T>(selector: (s: WorkspaceState) => T, fallback: T): T {
  const sync = useContext(WindowStoreSyncContext);
  const selectorRef = useRef(selector);
  useLayoutEffect(() => { selectorRef.current = selector; });
  const read = () => (sync ? selector(sync.getSnapshot()) : fallback);
  return useSyncExternalStore(sync?.subscribeToState ?? noopSubscribe, read, read);
}

/** The state of a workspace panel: where it is. */
export type PanelState = PanelInfo['state'];

/**
 * What a panel component knows about, and can do to, its own container. See {@link usePanel}.
 *
 * **Identity.** `id` and the five functions (`close`, `minimize`, `setDirty`, `setTitle`,
 * `setIcon`) never change identity for the panel's lifetime. The handle object itself changes
 * when `containerType`, `isActive`, `isMinimized` or `isFloating` does. So don't list the handle
 * in a dependency array: depend on the function you call, or on the values you write.
 */
export interface PanelHandle {
  /** This panel's instance id. */
  id: string;
  /** Where it is rendered. Updates live (a docked panel that is floated re-renders as `'floating-window'`). */
  containerType: ContainerType;
  /** A workspace panel that is the globally active one. Always false in a modal or drawer. */
  isActive: boolean;
  /** A workspace panel that is minimized to the taskbar. */
  isMinimized: boolean;
  /** A workspace panel shown as a floating window. */
  isFloating: boolean;
  /** Asks the container to close, honouring close guards and the dirty flag. */
  close: (options?: CloseOptions) => void;
  /** Minimizes a workspace panel. No effect in a modal or drawer. */
  minimize: () => void;
  /** Marks the panel as having unsaved changes. */
  setDirty: (dirty: boolean, options?: DirtyStateOptions) => void;
  /** Changes the title shown on the tab, window or modal. */
  setTitle: (title: string | MessageDescriptor) => void;
  /**
   * Changes the icon on the panel's tab, floating title bar and taskbar button, or in a modal's or
   * drawer's header. In a workspace panel, `null` goes back to the registration's
   * `defaultOptions.icon`. The icon is not saved by `saveLayout()`.
   */
  setIcon: (icon: React.ReactNode) => void;
}

/**
 * The panel's own container: its id, where it is, and what it can do. Works in docked panels,
 * floating windows, modals and side drawers.
 *
 * The functions on the handle are stable; the handle object is not (see {@link PanelHandle}).
 * To keep the tab title in step with a document:
 *
 * ```tsx
 * const { setTitle, setDirty } = usePanel();
 * useEffect(() => { setTitle(doc.title); setDirty(doc.dirty); }, [setTitle, setDirty, doc.title, doc.dirty]);
 * ```
 */
export function usePanel(): PanelHandle {
  const c = useFormContainer();
  const id = c.instanceId;
  // Select primitives only: a selector returning the whole panel record would give a new handle
  // on every write to the panel (title, dirty, props), including the panel's own writes.
  const state = useOptionalWorkspaceState(s => s.panels[id]?.state, undefined);
  const isActive = useOptionalWorkspaceState(s => s.activePanelId === id, false);
  const containerType: ContainerType = state
    ? (state === 'floating' ? 'floating-window' : 'dockable-panel')
    : (c.containerType ?? 'standalone');
  // A modal's or drawer's container object changes when its title or dirty flag does, so the
  // mutators read it through a ref and never change identity themselves.
  const cRef = useRef(c);
  useLayoutEffect(() => { cRef.current = c; });
  const mutators = useMemo(() => ({
    close: (options?: CloseOptions) => cRef.current.requestClose(options),
    minimize: () => cRef.current.requestMinimize?.(),
    setDirty: (dirty: boolean, options?: DirtyStateOptions) => cRef.current.setDirty(dirty, options),
    setTitle: (title: string | MessageDescriptor) => cRef.current.setTitle(title as Parameters<FormContainerContract['setTitle']>[0]),
    setIcon: (icon: React.ReactNode) => cRef.current.setIcon?.(icon),
  }), [id]);
  return useMemo<PanelHandle>(() => ({
    id,
    containerType,
    isActive: !!state && isActive,
    isMinimized: state === 'minimized',
    isFloating: state === 'floating',
    ...mutators,
  }), [mutators, id, containerType, state, isActive]);
}

/** Lifecycle callbacks for {@link usePanelEvents}. Each is called at the moment it describes. */
export interface PanelEvents {
  onActivate?: () => void;
  onDeactivate?: () => void;
  onMinimize?: () => void;
  onRestore?: () => void;
  onClose?: () => void;
  onResize?: (width: number, height: number) => void;
  onContainerTypeChange?: (type: ContainerType) => void;
}

/**
 * Subscribes to the panel's lifecycle. Call it at the top level of the panel component; it always
 * calls the latest callbacks passed in and cleans up on unmount — no dependency array.
 */
export function usePanelEvents(events: PanelEvents): void {
  const c = useFormContainer();
  const ref = useRef(events);
  useLayoutEffect(() => { ref.current = events; });
  useEffect(() => {
    const offs = [
      c.onActivate?.(() => ref.current.onActivate?.()),
      c.onDeactivate?.(() => ref.current.onDeactivate?.()),
      c.onMinimize?.(() => ref.current.onMinimize?.()),
      c.onRestore?.(() => ref.current.onRestore?.()),
      c.onClose?.(() => ref.current.onClose?.()),
      c.onResize?.((w, h) => ref.current.onResize?.(w, h)),
      c.onContainerTypeChange?.((t) => ref.current.onContainerTypeChange?.(t)),
    ];
    return () => { offs.forEach(off => off?.()); };
  }, [c]);
}

/**
 * Registers a close guard: resolve `false` to keep the panel open (ask the user, save first, …).
 * Pass `null` to register none. Always calls the latest guard passed in.
 */
export function useBeforeClose(guard: (() => boolean | Promise<boolean>) | null): void {
  const c = useFormContainer();
  const ref = useRef(guard);
  useLayoutEffect(() => { ref.current = guard; });
  // Registered once; a null guard allows the close, so switching it off needs no re-registration.
  useEffect(() => c.onCloseRequested(() => (ref.current ? ref.current() : true)), [c]);
}

/**
 * Reports the panel's restorable state, pulled fresh on every `saveLayout()` and saved as the
 * panel's props. Pass `null` to report none. Always calls the latest function passed in.
 */
export function useSaveState(getState: (() => unknown) | null): void {
  const c = useFormContainer();
  const ref = useRef(getState);
  useLayoutEffect(() => { ref.current = getState; });
  // Registered once; reporting undefined (a null function) means "use the panel's static props".
  useEffect(() => c.registerStateProvider?.(() => ref.current?.()), [c]);
}

// ─── Overlays: modals and side drawers ──────────────────────────────────────────

type OverlayUpdate = Partial<Pick<OverlayInstance, 'props' | 'options' | 'dirty' | 'dirtyOptions'>>;

/** Returned by {@link useModals}. */
export interface ModalsApi {
  /** Open modals, bottom to top. */
  stack: OverlayInstance[];
  /** The top modal, or null. */
  topmost: OverlayInstance | null;
  open: <P extends object>(component: React.ComponentType<P>, props: P, options?: ModalOptions) => OverlayId;
  close: (id: OverlayId) => void;
  closeAll: () => void;
  get: (id: OverlayId) => OverlayInstance | undefined;
  update: (id: OverlayId, updates: OverlayUpdate) => void;
  setDirty: (id: OverlayId, dirty: boolean, options?: DirtyStateOptions) => void;
}

/** Returned by {@link useSidePanels}. */
export interface SidePanelsApi {
  left: OverlayInstance | null;
  right: OverlayInstance | null;
  openLeft: <P extends object>(component: React.ComponentType<P>, props: P, options?: SidePanelOptions) => Promise<OverlayId | null>;
  openRight: <P extends object>(component: React.ComponentType<P>, props: P, options?: SidePanelOptions) => Promise<OverlayId | null>;
  close: (id: OverlayId) => void;
  /** Closes both drawers. */
  closeAll: () => void;
  get: (id: OverlayId) => OverlayInstance | undefined;
  update: (id: OverlayId, updates: OverlayUpdate) => void;
  setDirty: (id: OverlayId, dirty: boolean, options?: DirtyStateOptions) => void;
}

/** Opens and tracks modals. */
export function useModals(): ModalsApi {
  const { modals } = usePanelState();
  const a = usePanelActions();
  return useMemo<ModalsApi>(() => ({
    stack: modals,
    topmost: modals[modals.length - 1] ?? null,
    open: a.openModal,
    close: a.close,
    closeAll: a.closeAllModals,
    get: a.getInstance,
    update: a.updateInstance,
    setDirty: a.setDirty,
  }), [modals, a]);
}

/** Opens and tracks the left and right side drawers. */
export function useSidePanels(): SidePanelsApi {
  const { leftPanel, rightPanel } = usePanelState();
  const a = usePanelActions();
  return useMemo<SidePanelsApi>(() => ({
    left: leftPanel,
    right: rightPanel,
    openLeft: a.openLeftPanel,
    openRight: a.openRightPanel,
    close: a.close,
    closeAll: () => {
      if (leftPanel) a.close(leftPanel.id);
      if (rightPanel) a.close(rightPanel.id);
    },
    get: a.getInstance,
    update: a.updateInstance,
    setDirty: a.setDirty,
  }), [leftPanel, rightPanel, a]);
}

// ─── Components ─────────────────────────────────────────────────────────────────

/** Props for {@link RddSidePanels}. */
export interface RddSidePanelsProps {
  /** Render only one side's drawer. Omit to render both. */
  side?: 'left' | 'right';
  /** Width used when an `openLeft`/`openRight` call doesn't give one. Number = px. @default 400 */
  defaultWidth?: number | string;
}

/** Renders the side drawers opened through {@link useSidePanels}. */
export function RddSidePanels({ side, defaultWidth }: RddSidePanelsProps): React.ReactElement {
  if (side === 'left') return <LeftPanelRenderer defaultWidth={defaultWidth} />;
  if (side === 'right') return <RightPanelRenderer defaultWidth={defaultWidth} />;
  return <SidePanelRenderer defaultWidth={defaultWidth} />;
}

/** Props for {@link RddContextMenu}. */
export type RddContextMenuProps = ContextMenuProps & {
  /** With children: the context-menu implementation for them. @default the built-in menu */
  adapter?: ContextMenuAdapter;
  /**
   * With children, `RddContextMenu` provides a context menu to them (`useContextMenu()` inside
   * shows it) — for a surface outside `<DockableDesktopProvider>`, or to override the menu for a
   * subtree. Without children, it is a single menu you drive through its `ref`.
   */
  children?: React.ReactNode;
};

/**
 * A context menu. Inside `<DockableDesktopProvider>` one is already provided — use
 * `useContextMenu()` or `showContextMenu()` and you need no `RddContextMenu` at all.
 */
export const RddContextMenu: React.ForwardRefExoticComponent<RddContextMenuProps & React.RefAttributes<ContextMenuHandle>> = forwardRef<ContextMenuHandle, RddContextMenuProps>(function RddContextMenu(
  { children, adapter, ...menuProps },
  ref,
) {
  if (children !== undefined) {
    return <ContextMenuProvider adapter={adapter} {...menuProps}>{children}</ContextMenuProvider>;
  }
  return <ContextMenu ref={ref} {...menuProps} />;
});
