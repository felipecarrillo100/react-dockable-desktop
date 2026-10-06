/**
 * @file workspaceCore.ts
 * @description The workspace store: the layout state, every action on it, and the event bus. It
 * has no React dependency; a provider only subscribes to it.
 */
import type React from 'react';
import type { DirtyStateOptions } from '../components/dirtyOptions';
import type { ContextMenuItem, ShowContextMenuOptions } from '../components/ContextMenu';
import { isSerializable } from '../components/serializable';
import { sameTitle, sameDirtyOptions } from '../components/sameUpdate';
import type { PanelDropTarget, MessageDescriptor, SplitOrientation, SplitDirection, DropPosition, LayoutLeafNode, LayoutNode, FloatAnchor, FloatingWindow, PanelInfo, OpenPanelOptions, WorkspaceState, InternalWindowActions, SerializedLayout, WorkspaceCoreConfig, WorkspaceCore } from '../types';
import { PanelEventBus } from './eventBus';
import { EMPTY_LEAF, isVisibleActiveTarget, deriveActivePanelId, resolveActivePanelId, removePanelFromTree, addPanelToLeaf, isLoneOccupant, hasLeaf, findFirstLeafId, findLeafIdOf, splitLeafInTree } from './layoutTree';
import { DEFAULT_FLOAT_RECT, parseLayoutPayload, parseInitialState } from './serialize';

/**
 * @internal Builds a workspace store: the layout state, every action on it, and the event bus.
 * It has no React dependency — it exists (and accepts calls) before any provider mounts, and a
 * provider only subscribes to it. See `createWorkspace()` for the public face.
 */
export function createWorkspaceCore(config: WorkspaceCoreConfig): WorkspaceCore {
  const registry = config.registry;

  const effectiveDir = config.dir;
  const effectiveZIndexBase = config.zIndexBase ?? 1000;

  let state: WorkspaceState = (() => {
    const layout = parseInitialState(config.initialState ?? null);
    return {
      ...layout,
      draggedPanelId: null,
      dir: effectiveDir || 'ltr',
      isRtl: effectiveDir === 'rtl',
      splitRatio: Math.min(0.9, Math.max(0.1, config.defaultSplitRatio ?? 0.5)),
      edgeSplitRatio: Math.min(0.9, Math.max(0.1, config.defaultEdgeSplitRatio ?? 0.2)),
    };
  })();

  // The state lives here, outside React: actions apply immediately, before or after any provider
  // mounts, and the provider reads it through useSyncExternalStore.
  const listeners = new Set<() => void>();
  const setState = (update: WorkspaceState | ((prev: WorkspaceState) => WorkspaceState)): void => {
    const prev = state;
    const next = typeof update === 'function' ? update(prev) : update;
    if (next === prev) return;
    state = next;
    listeners.forEach(listener => listener());
  };
  // Read-only view kept under the old name, so every `stateRef.current` read sees live state.
  const stateRef = { get current(): WorkspaceState { return state; } };
  const getSnapshot = (): WorkspaceState => state;
  const subscribeToState = (cb: () => void): (() => void) => {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  };

  const closeGuardsRef: { current: Record<string, () => boolean | Promise<boolean>> } = { current: {} };
  const stateProvidersRef: { current: Record<string, () => unknown> } = { current: {} };

  const eventBusRef = { current: new PanelEventBus() };
  // Seeded from the restored windows (7.4.1): starting at the base, a focused restored window was
  // given a z below the others and dropped behind them, and a new float opened beneath them.
  const topZ = (floating: FloatingWindow[]): number =>
    floating.reduce((top, w) => (Number.isFinite(w.z) && w.z > top ? w.z : top), effectiveZIndexBase);
  const maxZRef = { current: topZ(state.floating) };

  const subscribe: InternalWindowActions['subscribe'] = (event, callback) => {
    return eventBusRef.current.subscribe(event, callback);
  };

  const publish: InternalWindowActions['publish'] = (event, data) => {
    eventBusRef.current.publish(event, data);
  };

  // Helper: Find free cascading location for floating window
  const getCascadedPosition = (
    fav: { x: number | string; y: number | string; width: number | string; height: number | string },
    currentFloating: FloatingWindow[]
  ) => {
    let x = typeof fav.x === 'string' ? parseFloat(fav.x) : fav.x;
    let y = typeof fav.y === 'string' ? parseFloat(fav.y) : fav.y;
    let width = typeof fav.width === 'string' ? parseFloat(fav.width) : fav.width;
    let height = typeof fav.height === 'string' ? parseFloat(fav.height) : fav.height;

    // Fallbacks if parseFloat fails and returns NaN
    if (isNaN(x)) x = 300;
    if (isNaN(y)) y = 150;
    if (isNaN(width)) width = 450;
    if (isNaN(height)) height = 350;

    const isOverlapping = (pos: { x: number; y: number }) => {
      return currentFloating.some(w => {
        const wx = typeof w.x === 'string' ? parseFloat(w.x) : w.x;
        const wy = typeof w.y === 'string' ? parseFloat(w.y) : w.y;
        return !w.maximized && Math.abs(wx - pos.x) < 20 && Math.abs(wy - pos.y) < 20;
      });
    };

    let attempts = 0;
    while (isOverlapping({ x, y }) && attempts < 10) {
      x += 30;
      y += 30;
      attempts++;
    }

    // Capture safe viewport boundaries (min 1024x768 fallback if not measured or in headless environments)
    // (and on the server, where a workspace can already be opened into before anything mounts)
    const viewW = Math.max(100, (typeof window !== 'undefined' && window.innerWidth) || 1024);
    const viewH = Math.max(100, (typeof window !== 'undefined' && window.innerHeight) || 768);

    if (x + width > viewW || y + height > viewH) {
      x = 100 + (attempts % 5) * 30;
      y = 100 + (attempts % 5) * 30;
    }

    // Final safety clamp to make sure window title bar is always visible and clickable
    x = Math.max(0, Math.min(x, viewW - 100));
    y = Math.max(0, Math.min(y, viewH - 40));

    return { x, y, width, height };
  };

  const focusPanel = (id: string) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      if (panel.state === 'floating') {
        const win = prev.floating.find(w => w.id === id);
        if (!win) return prev;
        const alreadyTop = !prev.floating.some(w => w.z > win.z);
        if (alreadyTop && prev.activePanelId === id) return prev; // no-op — StrictMode safe
        if (!alreadyTop) maxZRef.current += 1;
        return {
          ...prev,
          floating: prev.floating.map(w =>
            w.id === id ? { ...w, z: alreadyTop ? win.z : maxZRef.current } : w
          ),
          activePanelId: id
        };
      } else if (panel.state === 'docked') {
        if (prev.activePanelId === id) return prev; // no-op
        const selectActiveInTree = (node: LayoutNode): LayoutNode => {
          if (node.type === 'leaf') {
            if (node.panels.includes(id)) {
              return { ...node, activePanelId: id };
            }
            return node;
          } else {
            return { ...node, children: node.children.map(selectActiveInTree) };
          }
        };
        return {
          ...prev,
          gridRoot: selectActiveInTree(prev.gridRoot),
          activePanelId: id
        };
      }
      if (prev.activePanelId === id) return prev; // no-op for minimized
      return { ...prev, activePanelId: id };
    });
  };


  // State transitions shared by more than one action. Each takes the previous state and returns
  // the next one (or `prev` itself when there is nothing to do), so an action can chain them
  // inside a single `setState` — maximizing a minimized panel is restore, then float, then
  // maximize, and must not render the intermediate states.

  /** Brings a minimized panel back where it was: its old floating rect, or its old group. */
  const applyRestore = (prev: WorkspaceState, id: string, activate: boolean): WorkspaceState => {
    const panel = prev.panels[id];
    if (!panel || panel.state !== 'minimized') return prev;

    const nextMinimized = prev.minimized.filter(m => m.id !== id);
    const prevState = panel.previousState || 'docked';
    // A restored panel is, by definition, visible again — so unlike the minimize path there is
    // nothing to derive: it is itself the only correct candidate. Leaving activePanelId behind
    // reproduced the 6de3381 defect class in reverse (visible tab rendered unfocused, and every
    // contributed control stayed bound to whatever replaced this panel while it was minimized).
    const nextActive = activate ? id : prev.activePanelId;
    const entry = registry.get(panel.component);

    const floatBack = (): WorkspaceState => {
      maxZRef.current += 1;
      const favPos = panel.lastFloatingRect || entry?.defaultOptions?.favoritePosition || { x: 300, y: 150, width: 450, height: 350 };
      const cascaded = getCascadedPosition(favPos, prev.floating);
      return {
        ...prev,
        minimized: nextMinimized,
        floating: [
          ...prev.floating,
          {
            ...cascaded,
            id,
            z: maxZRef.current,
            anchor: panel.lastFloatingRect?.anchor ?? null
          }
        ],
        panels: { ...prev.panels, [id]: { ...panel, state: 'floating' } },
        activePanelId: nextActive
      };
    };

    if (prevState === 'floating') return floatBack();

    if (panel.lastLeafId && hasLeaf(prev.gridRoot, panel.lastLeafId)) {
      return {
        ...prev,
        minimized: nextMinimized,
        gridRoot: addPanelToLeaf(prev.gridRoot, panel.lastLeafId, id),
        panels: { ...prev.panels, [id]: { ...panel, state: 'docked' } },
        activePanelId: nextActive
      };
    }
    // Leaf group ceased to exist: float it instead if floatable!
    if (entry?.defaultOptions?.canDrag !== false) return floatBack();

    // Leaf group ceased to exist but not floatable: dock into fallback leaf group
    const targetLeafId = findFirstLeafId(prev.gridRoot) || 'group-default';
    return {
      ...prev,
      minimized: nextMinimized,
      gridRoot: addPanelToLeaf(prev.gridRoot, targetLeafId, id),
      panels: { ...prev.panels, [id]: { ...panel, state: 'docked' } },
      activePanelId: nextActive
    };
  };

  /** Turns a docked panel into a floating window. Refused for `canDrag: false` panels. */
  const applyFloat = (
    prev: WorkspaceState,
    id: string,
    { rect, anchor, activate = true }: { rect?: { x: number; y: number; width: number; height: number }; anchor?: FloatAnchor | null; activate?: boolean } = {},
  ): WorkspaceState => {
    const panel = prev.panels[id];
    if (!panel) return prev;

    const entry = registry.get(panel.component);
    if (entry?.defaultOptions?.canDrag === false) return prev;

    const favPos = rect || entry?.defaultOptions?.favoritePosition || DEFAULT_FLOAT_RECT;
    const cleanRoot = removePanelFromTree(prev.gridRoot, id);
    // Floating an already-floating panel re-places it rather than adding a second window.
    const otherWindows = prev.floating.filter(w => w.id !== id);
    maxZRef.current += 1;
    const cascaded = getCascadedPosition(favPos, otherWindows);

    const next: WorkspaceState = {
      ...prev,
      gridRoot: cleanRoot || { type: 'leaf', id: 'group-default', panels: [], activePanelId: null },
      floating: [...otherWindows, { ...cascaded, id, z: maxZRef.current, anchor: anchor ?? null }],
      panels: {
        ...prev.panels,
        [id]: { ...panel, state: 'floating' }
      }
    };
    return { ...next, activePanelId: resolveActivePanelId(next, activate ? id : null) };
  };

  /** Docks a panel into `targetLeafId`, or the first group when that id is missing. */
  const applyDock = (prev: WorkspaceState, id: string, targetLeafId?: string, activate = true): WorkspaceState => {
    const panel = prev.panels[id];
    if (!panel) return prev;

    const nextFloating = prev.floating.filter(w => w.id !== id);
    const cleanRoot = removePanelFromTree(prev.gridRoot, id) || EMPTY_LEAF;
    // The caller asked for this panel to be docked, so an id that no longer names a group
    // falls back to the first one rather than docking it nowhere. Removing the panel can
    // itself delete the requested group, which is why this is checked against `cleanRoot`.
    const requested = targetLeafId && hasLeaf(cleanRoot, targetLeafId) ? targetLeafId : undefined;
    const leafId = requested || findFirstLeafId(cleanRoot) || EMPTY_LEAF.id;

    const next: WorkspaceState = {
      ...prev,
      gridRoot: addPanelToLeaf(cleanRoot, leafId, id),
      floating: nextFloating,
      panels: {
        ...prev.panels,
        [id]: { ...panel, state: 'docked' }
      }
    };
    return { ...next, activePanelId: resolveActivePanelId(next, activate ? id : null) };
  };

  const openPanel = <P extends object = Record<string, unknown>>(id: string, component: string, options?: OpenPanelOptions<P>) => {
    // Dedup redirect: resolve to an already-open panel of the same component/dedupeKey, if any,
    // before anything else runs — the caller's own `id`/`props` are ignored for this call in
    // that case, the same way re-opening an already-open exact `id` already focuses it instead
    // of duplicating it.
    let resolvedId = id;
    if (options?.dedupeKey !== undefined) {
      const match = Object.values(stateRef.current.panels).find(
        p => p.component === component && p.dedupeKey === options.dedupeKey
      );
      if (match) resolvedId = match.id;
    }
    const isNew = !(resolvedId in stateRef.current.panels);
    const isRedirect = resolvedId !== id;
    const shouldFocus = options?.focus !== false;
    const propsProvided = options?.props !== undefined;
    const serializable = propsProvided ? isSerializable(options.props) : true;

    // Re-opening a minimized panel is a restore, and must land where `restorePanel` would: its
    // old group or floating rect. This used to re-place it from the registry's initial target
    // (the first group, or the default floating position) and publish nothing, so an autosave
    // keyed on `layout:changed` missed it. An explicit `initialTarget` still wins.
    if (stateRef.current.panels[resolvedId]?.state === 'minimized') {
      const explicitTarget = options?.initialTarget;
      setState(prev => {
        const restored = applyRestore(prev, resolvedId, shouldFocus);
        const state = restored.panels[resolvedId]?.state;
        if (explicitTarget === 'floating' && state === 'docked') {
          return applyFloat(restored, resolvedId, { activate: shouldFocus });
        }
        if (explicitTarget && explicitTarget !== 'floating' && state === 'floating') {
          return applyDock(restored, resolvedId, undefined, shouldFocus);
        }
        return restored;
      });
      eventBusRef.current.publish('panel:restored', { id: resolvedId });
      eventBusRef.current.publish('layout:changed', {});
      return;
    }

    const dockTo = options?.dockTo;
    if (dockTo && isNew && process.env.NODE_ENV === 'development' && !findLeafIdOf(stateRef.current.gridRoot, dockTo.panel)) {
      console.warn(
        `[react-dockable-desktop] openPanel("${resolvedId}") could not dock beside "${dockTo.panel}": ` +
        `that panel is not docked (not open, floating or minimized), so the new panel was placed as usual.`
      );
    }

    setState(prev => {
      const exists = prev.panels[resolvedId];
      const entry = registry.get(component);
      const title = options?.title || entry?.defaultOptions?.title || resolvedId;
      const target = options?.initialTarget || entry?.defaultOptions?.initialTarget || 'docked';
      const favPos = entry?.defaultOptions?.favoritePosition || { x: 300, y: 150, width: 450, height: 350 };
      const activePanelId = shouldFocus ? resolvedId : prev.activePanelId;

      // Case 1: Already exists (a minimized one was handled above, before this update)
      if (exists) {
        if (exists.state === 'minimized') {
          return applyRestore(prev, resolvedId, shouldFocus);
        } else if (exists.state === 'floating') {
          if (shouldFocus) focusPanel(resolvedId);
          return prev;
        } else {
          // Focus in tab group
          const selectActiveInTree = (node: LayoutNode): LayoutNode => {
            if (node.type === 'leaf') {
              if (node.panels.includes(resolvedId)) {
                return { ...node, activePanelId: resolvedId };
              }
              return node;
            } else {
              return { ...node, children: node.children.map(selectActiveInTree) };
            }
          };
          return {
            ...prev,
            gridRoot: selectActiveInTree(prev.gridRoot),
            activePanelId
          };
        }
      }

      // Case 2: New panel. `dockTo` beside a docked panel wins over the target.
      const dockLeaf = dockTo ? findLeafIdOf(prev.gridRoot, dockTo.panel) : null;
      const targetState = dockLeaf ? 'docked' : (target === 'tabbed' ? 'docked' : target);
      const newPanelInfo: PanelInfo = {
        id: resolvedId,
        title,
        component,
        state: targetState,
        props: options?.props as Record<string, unknown> | undefined,
        serializable,
        dedupeKey: options?.dedupeKey,
      };
      const nextPanels = { ...prev.panels, [resolvedId]: newPanelInfo };

      if (dockTo && dockLeaf) {
        const share = Math.min(0.9, Math.max(0.1, dockTo.size ?? prev.splitRatio));
        return {
          ...prev,
          gridRoot: dockTo.position === 'center'
            ? addPanelToLeaf(prev.gridRoot, dockLeaf, resolvedId)
            : splitLeafInTree(prev.gridRoot, dockLeaf, resolvedId, dockTo.position, share),
          panels: nextPanels,
          activePanelId
        };
      }

      if (target === 'floating') {
        maxZRef.current += 1;
        const cascaded = getCascadedPosition(favPos, prev.floating);

        const anchor = options?.anchor ?? entry?.defaultOptions?.defaultAnchor ?? null;

        return {
          ...prev,
          floating: [...prev.floating, { ...cascaded, id: resolvedId, z: maxZRef.current, anchor }],
          panels: nextPanels,
          activePanelId
        };
      } else {
        const firstLeaf = findFirstLeafId(prev.gridRoot) || 'group-default';
        return {
          ...prev,
          gridRoot: addPanelToLeaf(prev.gridRoot, firstLeaf, resolvedId),
          panels: nextPanels,
          activePanelId
        };
      }
    });
    if (isNew) eventBusRef.current.publish('panel:opened', { id: resolvedId, component });
    if (isNew || isRedirect) eventBusRef.current.publish('layout:changed', {});
  };

  const closePanel = (id: string) => {
    const exists = id in stateRef.current.panels;
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const registryEntry = registry.get(panel.component);
      if (registryEntry?.defaultOptions?.canClose === false) {
        return prev;
      }

      delete closeGuardsRef.current[id];
      delete stateProvidersRef.current[id];

      const nextPanels = { ...prev.panels };
      delete nextPanels[id];

      const nextRoot = removePanelFromTree(prev.gridRoot, id)
        || { type: 'leaf' as const, id: 'group-default', panels: [], activePanelId: null };
      const nextFloating = prev.floating.filter(w => w.id !== id);

      // Closing the active panel used to leave `activePanelId` pointing at the panel just deleted.
      // `removePanelFromTree` has already promoted the next tab in its leaf, so re-deriving picks
      // whatever the user can now actually see.
      const nextActivePanelId = prev.activePanelId === id
        ? deriveActivePanelId({ gridRoot: nextRoot, floating: nextFloating, panels: nextPanels })
        : prev.activePanelId;

      return {
        ...prev,
        gridRoot: nextRoot,
        floating: nextFloating,
        minimized: prev.minimized.filter(m => m.id !== id),
        panels: nextPanels,
        activePanelId: nextActivePanelId
      };
    });
    if (exists) {
      eventBusRef.current.publish('panel:closed', { id });
      eventBusRef.current.publish('layout:changed', {});
    }
  };

  const registerCloseGuard = (id: string, guard: () => boolean | Promise<boolean>) => {
    closeGuardsRef.current[id] = guard;
  };

  const unregisterCloseGuard = (id: string) => {
    delete closeGuardsRef.current[id];
  };

  const registerStateProvider = (id: string, provider: () => unknown) => {
    stateProvidersRef.current[id] = provider;
  };

  const unregisterStateProvider = (id: string) => {
    delete stateProvidersRef.current[id];
  };

  const setPanelDirty = (id: string, dirty: boolean, options?: DirtyStateOptions) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;
      if (!!panel.dirty === dirty && sameDirtyOptions(panel.dirtyOptions, options)) return prev;
      return {
        ...prev,
        panels: {
          ...prev.panels,
          [id]: { ...panel, dirty, dirtyOptions: options }
        }
      };
    });
  };

  const updatePanelTitle = (id: string, title: string | MessageDescriptor | (() => string)) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;
      if (sameTitle(panel.title, title)) return prev;
      return {
        ...prev,
        panels: {
          ...prev.panels,
          [id]: { ...panel, title }
        }
      };
    });
  };

  const setPanelIcon = (id: string, icon: React.ReactNode | null) => {
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;
      const next = icon ?? undefined;
      if (panel.icon === next) return prev;
      return { ...prev, panels: { ...prev.panels, [id]: { ...panel, icon: next } } };
    });
  };

  const requestClosePanel = async (id: string, options?: { force?: boolean; onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }) => {
    if (options?.force) {
      closePanel(id);
      return;
    }

    // 1. Check custom close guard
    const guard = closeGuardsRef.current[id];
    if (guard) {
      const canClose = await guard();
      if (!canClose) return;
    }

    // 2. Check automatic dirty flag
    const panel = stateRef.current.panels[id];
    if (panel?.dirty) {
      if (options?.onConfirm) {
        const discard = await options.onConfirm(panel.dirtyOptions);
        if (!discard) return;
      } else {
        return;
      }
    }

    closePanel(id);
  };

  const minimizePanel = (id: string) => {
    const wasActive = stateRef.current.panels[id]?.state !== 'minimized' && id in stateRef.current.panels;
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel || panel.state === 'minimized') return prev;

      const registryEntry = registry.get(panel.component);
      if (registryEntry?.defaultOptions?.canMinimize === false) {
        return prev;
      }

      let lastFloatingRect: PanelInfo['lastFloatingRect'] = undefined;
      let lastLeafId: string | undefined = undefined;

      if (panel.state === 'floating') {
        const win = prev.floating.find(w => w.id === id);
        if (win) {
          lastFloatingRect = {
            x: Number(win.x),
            y: Number(win.y),
            width: Number(win.width),
            height: Number(win.height),
            anchor: win.anchor ?? null
          };
        }
      } else if (panel.state === 'docked') {
        const findLeafForPanel = (node: LayoutNode): string | null => {
          if (node.type === 'leaf') {
            return node.panels.includes(id) ? node.id : null;
          } else {
            for (const child of node.children) {
              const res = findLeafForPanel(child);
              if (res) return res;
            }
            return null;
          }
        };
        lastLeafId = findLeafForPanel(prev.gridRoot) ?? undefined;
      }

      const nextRoot = removePanelFromTree(prev.gridRoot, id)
        || { type: 'leaf' as const, id: 'group-default', panels: [], activePanelId: null };
      const nextFloating = prev.floating.filter(w => w.id !== id);
      const nextPanels: Record<string, PanelInfo> = {
        ...prev.panels,
        [id]: {
          ...panel,
          state: 'minimized',
          previousState: panel.state,
          lastFloatingRect,
          lastLeafId
        }
      };

      // A minimized panel is off screen but still mounted (see the persistence port in
      // WindowManager.tsx), so leaving it active kept `useActivePanelContribution()` — and every
      // contributed control — wired to a panel the user can't see. `deriveActivePanelId` skips
      // minimized panels, so this lands on whatever became visible in its place.
      const nextActivePanelId = prev.activePanelId === id
        ? deriveActivePanelId({ gridRoot: nextRoot, floating: nextFloating, panels: nextPanels })
        : prev.activePanelId;

      return {
        ...prev,
        gridRoot: nextRoot,
        floating: nextFloating,
        minimized: [...prev.minimized, { id, title: panel.title, component: panel.component }],
        panels: nextPanels,
        activePanelId: nextActivePanelId
      };
    });
    if (wasActive) {
      eventBusRef.current.publish('panel:minimized', { id });
      eventBusRef.current.publish('layout:changed', {});
    }
  };

  const restorePanel = (id: string, options?: { focus?: boolean }) => {
    const wasMinimized = stateRef.current.panels[id]?.state === 'minimized';
    const shouldFocus = options?.focus !== false;
    setState(prev => applyRestore(prev, id, shouldFocus));
    if (wasMinimized) {
      eventBusRef.current.publish('panel:restored', { id });
      eventBusRef.current.publish('layout:changed', {});
    }
  };

  const floatPanel = (id: string, rect?: { x: number; y: number; width: number; height: number }, anchor?: FloatAnchor | null) => {
    const panel = stateRef.current.panels[id];
    const willFloat = !!panel && registry.get(panel.component)?.defaultOptions?.canDrag !== false;
    setState(prev => applyFloat(prev, id, { rect, anchor }));
    if (willFloat) eventBusRef.current.publish('layout:changed', {});
  };

  const dockPanel = (id: string, targetLeafId?: string) => {
    const exists = id in stateRef.current.panels;
    setState(prev => applyDock(prev, id, targetLeafId));
    if (exists) eventBusRef.current.publish('layout:changed', {});
  };


  const setDraggedPanelId = (id: string | null) => {
    setState(prev => ({ ...prev, draggedPanelId: id }));
  };

  const dockPanelToGroup = (id: string, targetLeafId: string, position: DropPosition) => {
    const before = stateRef.current;
    const willMove = id in before.panels
      && hasLeaf(before.gridRoot, targetLeafId)
      && !isLoneOccupant(before.gridRoot, targetLeafId, id);
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      // Dropping a lone panel onto its own group asks for the layout it already has. Taking
      // it literally deletes the target leaf on the way in, and the split then ran against
      // the pre-removal tree, leaving the same panel in two leaves — one of them showing
      // nothing, since a panel's DOM can only live in one slot.
      if (isLoneOccupant(prev.gridRoot, targetLeafId, id)) return prev;

      // A group that is not in the tree cannot receive anything. Placing into it would strip
      // the panel from the layout and leave it "open" but in no group — visible nowhere, and
      // recoverable only by minimizing and restoring it.
      if (!hasLeaf(prev.gridRoot, targetLeafId)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[react-dockable-desktop] dockPanelToGroup("${id}", "${targetLeafId}") was ignored: ` +
            `no group with that id is in the layout. Emptying a group removes it, so an id held ` +
            `across a layout change can name a group that no longer exists.`
          );
        }
        return prev;
      }

      const nextFloating = prev.floating.filter(w => w.id !== id);
      // `null` from removePanelFromTree means the tree is now empty — not "nothing was
      // removed". Falling back to `prev.gridRoot` here is what put the panel in two leaves.
      const cleanRoot = removePanelFromTree(prev.gridRoot, id) || EMPTY_LEAF;

      let newRoot: LayoutNode;
      if (position === 'center') {
        newRoot = addPanelToLeaf(cleanRoot, targetLeafId, id);
      } else {
        newRoot = splitLeafInTree(cleanRoot, targetLeafId, id, position, prev.splitRatio);
      }

      const next: WorkspaceState = {
        ...prev,
        gridRoot: newRoot,
        floating: nextFloating,
        panels: {
          ...prev.panels,
          [id]: { ...panel, state: 'docked' }
        },
        draggedPanelId: null
      };
      return { ...next, activePanelId: resolveActivePanelId(next, id) };
    });
    if (willMove) eventBusRef.current.publish('layout:changed', {});
  };

  const dockPanelToWorkspaceEdge = (id: string, position: SplitDirection) => {
    const before = stateRef.current;
    const willMove = id in before.panels && removePanelFromTree(before.gridRoot, id) !== null;
    setState(prev => {
      const panel = prev.panels[id];
      if (!panel) return prev;

      const nextFloating = prev.floating.filter(w => w.id !== id);
      const cleanRoot = removePanelFromTree(prev.gridRoot, id);

      // The sole docked panel already fills the workspace, so docking it to an edge asks for
      // the layout it has. Acting on it duplicated the panel into the new edge leaf while the
      // old one still listed it, exactly as a drop on its own group did.
      if (cleanRoot === null) return prev;

      const newLeaf: LayoutLeafNode = {
        type: 'leaf',
        id: `group-edge-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        panels: [id],
        activePanelId: id
      };

      const orientation: SplitOrientation = (position === 'left' || position === 'right') ? 'horizontal' : 'vertical';
      const children = (position === 'left' || position === 'top')
        ? [newLeaf, cleanRoot]
        : [cleanRoot, newLeaf];

      const r = prev.edgeSplitRatio;
      const newRoot: LayoutNode = {
        type: 'branch',
        orientation,
        sizes: (position === 'left' || position === 'top') ? [r, 1 - r] : [1 - r, r],
        children
      };

      const next: WorkspaceState = {
        ...prev,
        gridRoot: newRoot,
        floating: nextFloating,
        panels: {
          ...prev.panels,
          [id]: { ...panel, state: 'docked' }
        },
        draggedPanelId: null
      };
      return { ...next, activePanelId: resolveActivePanelId(next, id) };
    });
    if (willMove) eventBusRef.current.publish('layout:changed', {});
  };

  const movePanelOrder = (panelId: string, targetLeafId: string, targetIndex: number) => {
    const before = stateRef.current;
    const willMove = panelId in before.panels
      && hasLeaf(before.gridRoot, targetLeafId)
      && !isLoneOccupant(before.gridRoot, targetLeafId, panelId);
    setState(prev => {
      const panel = prev.panels[panelId];
      if (!panel) return prev;

      // A lone panel dropped on its own tab strip is already where it is being sent. Today
      // the reinsertion happens to cancel out; guarded so that stays true rather than
      // depending on it.
      if (isLoneOccupant(prev.gridRoot, targetLeafId, panelId)) return prev;

      if (!hasLeaf(prev.gridRoot, targetLeafId)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[react-dockable-desktop] movePanelOrder("${panelId}", "${targetLeafId}") was ignored: ` +
            `no group with that id is in the layout.`
          );
        }
        return prev;
      }

      // 1. Remove panel from its current group in the layout tree
      const cleanRoot = removePanelFromTree(prev.gridRoot, panelId);

      // 2. Insert panel at specific index in target leaf ID
      const insertInLeaf = (node: LayoutNode): LayoutNode => {
        if (node.type === 'leaf') {
          if (node.id === targetLeafId) {
            const remaining = node.panels.filter(p => p !== panelId);
            const index = Math.max(0, Math.min(targetIndex, remaining.length));
            const newPanels = [...remaining];
            newPanels.splice(index, 0, panelId);
            return {
              ...node,
              panels: newPanels,
              activePanelId: panelId
            };
          }
          return node;
        } else {
          return {
            ...node,
            children: node.children.map(insertInLeaf)
          };
        }
      };

      const newRoot = insertInLeaf(cleanRoot || EMPTY_LEAF);
      const nextFloating = prev.floating.filter(w => w.id !== panelId);

      const next: WorkspaceState = {
        ...prev,
        gridRoot: newRoot,
        floating: nextFloating,
        panels: {
          ...prev.panels,
          [panelId]: { ...panel, state: 'docked' }
        },
        draggedPanelId: null
      };
      return { ...next, activePanelId: resolveActivePanelId(next, panelId) };
    });
    if (willMove) eventBusRef.current.publish('layout:changed', {});
  };

  const closeLeafGroup = async (leafId: string, options?: { onConfirm?: (opts?: DirtyStateOptions) => Promise<boolean> }) => {
    const findLeaf = (node: LayoutNode): LayoutLeafNode | null => {
      if (node.type === 'leaf') return node.id === leafId ? node : null;
      for (const child of node.children) {
        const found = findLeaf(child);
        if (found) return found;
      }
      return null;
    };

    const leaf = findLeaf(stateRef.current.gridRoot);
    if (!leaf || leaf.canClose === false) return;

    // Closing a group closes its tabs, each through the same guarded path as the tab's own ×:
    // a close guard can refuse, and a dirty panel is kept unless `onConfirm` agrees. Removing
    // the leaf outright used to leave its panels "open" but in no group — rendered nowhere.
    for (const panelId of [...leaf.panels]) {
      await requestClosePanel(panelId, { onConfirm: options?.onConfirm });
    }

    const removeLeafFromTree = (node: LayoutNode): LayoutNode | null => {
      if (node.type === 'leaf') {
        return node.id === leafId ? null : node;
      }
      const children = node.children
        .map(c => removeLeafFromTree(c))
        .filter((c): c is LayoutNode => c !== null);

      if (children.length === 0) return null;
      if (children.length === 1) return children[0];

      // Re-normalize sizes
      const sizes = node.sizes.slice(0, children.length);
      const sum = sizes.reduce((a, b) => a + b, 0);
      return {
        ...node,
        children,
        sizes: sizes.map(s => s / sum)
      };
    };

    // A panel that refused to close keeps its group. An emptied `keepOnEmpty` group is still in
    // the tree at this point, and is the one case left to remove here.
    // Each closed tab already published its own layout:changed; publish here only if this step
    // changed the layout too.
    let removed = false;
    setState(prev => {
      const current = findLeaf(prev.gridRoot);
      if (!current || current.panels.length > 0) return prev;
      removed = true;
      const next: WorkspaceState = {
        ...prev,
        gridRoot: removeLeafFromTree(prev.gridRoot) || { type: 'leaf', id: 'group-default', panels: [], activePanelId: null }
      };
      return { ...next, activePanelId: resolveActivePanelId(next, null) };
    });
    if (removed) eventBusRef.current.publish('layout:changed', {});
  };

  const maximizePanel = (id: string) => {
    const panel = stateRef.current.panels[id];
    if (!panel) return;

    if (panel.state === 'minimized') {
      // "Maximize" on a minimized panel (the taskbar menu offers it) is restore + maximize.
      // Only floating windows maximize, so a panel that comes back docked is floated first —
      // unless it can't be dragged, in which case it is just restored to its group. The
      // taskbar menu hides the item for that case.
      setState(prev => {
        const restored = applyRestore(prev, id, true);
        if (restored === prev) return prev;
        let next = restored;
        if (restored.panels[id]?.state === 'docked') {
          next = applyFloat(restored, id);
          if (next === restored) return restored;
        }
        return {
          ...next,
          floating: next.floating.map(w => w.id === id ? { ...w, maximized: true } : w),
          activePanelId: id
        };
      });
      eventBusRef.current.publish('panel:restored', { id });
      eventBusRef.current.publish('layout:changed', {});
      return;
    }

    if (panel.state === 'docked') {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[react-dockable-desktop] maximizePanel("${id}") was ignored: only floating windows can ` +
          `be maximized. Float the panel first with floatPanel("${id}").`
        );
      }
      return;
    }

    setState(prev => ({
      ...prev,
      floating: prev.floating.map(w => w.id === id ? { ...w, maximized: !w.maximized } : w)
    }));
  };

  const updateSplitSizes = (path: number[], sizes: number[]) => {
    const updateInTree = (node: LayoutNode, depth: number): LayoutNode => {
      if (node.type === 'leaf') return node;
      if (depth === path.length) {
        return { ...node, sizes };
      }
      const idx = path[depth];
      const children = node.children.map((c, i) => i === idx ? updateInTree(c, depth + 1) : c);
      return { ...node, children };
    };

    setState(prev => ({
      ...prev,
      gridRoot: updateInTree(prev.gridRoot, 0)
    }));
  };

  const updateFloatingPosition = (id: string, updates: Partial<Pick<FloatingWindow, 'x' | 'y' | 'width' | 'height' | 'anchor'>>) => {
    setState(prev => ({
      ...prev,
      floating: prev.floating.map(w => w.id === id ? { ...w, ...updates } : w)
    }));
  };

  // Docking rules (7.9.0): what the *user* may do. The type's own canFloat / canDock first, then
  // the app's canDrop. Never consulted by the app's own API calls.
  const isDropAllowed = (panelId: string, to: PanelDropTarget): boolean => {
    const panel = stateRef.current.panels[panelId];
    if (!panel) return false;
    const options = registry.get(panel.component)?.defaultOptions;
    if (to.kind === 'float') {
      // Blocks *becoming* floating; a window that already floats may still change corner.
      if (options?.canFloat === false && panel.state !== 'floating') return false;
    } else if (options?.canDock === false) {
      return false;
    }
    if (!config.canDrop) return true;
    try {
      return config.canDrop({ panelId, component: panel.component, to }) !== false;
    } catch (e) {
      console.error('[react-dockable-desktop] canDrop threw; the move is allowed:', e);
      return true;
    }
  };

  const saveLayout = () => {
    const currentPanels = stateRef.current.panels;
    const excludedIds: string[] = [];
    const includedPanels: Record<string, PanelInfo> = {};

    // A registered state provider (see registerStateProvider) is pulled fresh on every save —
    // a panel's serializability can flip over its lifetime, so this is never cached from open
    // time for provider-backed panels. Panels with no provider keep their static open-time
    // props/serializable classification unchanged.
    for (const [id, info] of Object.entries(currentPanels)) {
      const provider = stateProvidersRef.current[id];
      const dynamicValue = provider?.();
      const hasDynamicValue = provider !== undefined && dynamicValue !== undefined;
      const effectiveProps = hasDynamicValue ? (dynamicValue as Record<string, unknown>) : info.props;
      const effectiveSerializable = hasDynamicValue ? isSerializable(dynamicValue) : info.serializable;

      if (effectiveSerializable) {
        // The runtime icon is a React element: never part of a saved layout.
        const { icon: _icon, ...saved } = info;
        // A function title (7.4.0) can't be saved; the restored panel takes its registered default.
        if (typeof saved.title === 'function') delete (saved as Partial<PanelInfo>).title;
        includedPanels[id] = hasDynamicValue ? { ...saved, props: effectiveProps, serializable: effectiveSerializable } : saved;
      } else {
        excludedIds.push(id);
      }
    }

    // Non-serializable panels are excluded from this saved snapshot — pruned from gridRoot/
    // floating/minimized too, so a restore never references a panel with no data to recreate it
    // meaningfully. This computes a derived copy for the JSON string only; none of this touches
    // stateRef/setState, so the live, on-screen workspace is completely unaffected — an excluded
    // panel keeps existing and working normally on screen, it simply won't be there after the
    // *next* loadLayout().
    let gridRoot = stateRef.current.gridRoot;
    let floating = stateRef.current.floating;
    let minimized = stateRef.current.minimized;
    for (const id of excludedIds) {
      gridRoot = removePanelFromTree(gridRoot, id) || { type: 'leaf', id: 'group-default', panels: [], activePanelId: null };
      floating = floating.filter(w => w.id !== id);
      minimized = minimized.filter(m => m.id !== id);
    }

    if (excludedIds.length > 0) {
      eventBusRef.current.publish('layout:panels-excluded', {
        panels: excludedIds.map(id => ({ id, component: currentPanels[id].component }))
      });
    }

    // Validated against the *pruned* snapshot, not the live state: if the active panel was itself
    // excluded above, or is minimized, the field is omitted entirely rather than persisted as an id
    // this payload's own `panels` doesn't contain. A restore then derives it — see
    // `deriveActivePanelId`.
    const liveActive = stateRef.current.activePanelId;
    const activePanelId = liveActive !== null && isVisibleActiveTarget(liveActive, { gridRoot, floating, panels: includedPanels })
      ? liveActive
      : null;

    const payload: SerializedLayout = {
      version: 2, // v2: panels may carry `props`/`dedupeKey`; the payload may omit panels the
                  // live workspace still has open (see the exclusion pass above).
      ...(activePanelId !== null ? { activePanelId } : {}),
      gridRoot,
      floating,
      minimized: minimized.map(m => (typeof m.title === 'function' ? { id: m.id, component: m.component } : m)) as SerializedLayout['minimized'],
      panels: includedPanels
    };
    return JSON.stringify(payload);
  };

  const loadLayout = (layoutJson: string): boolean => {
    try {
      const payload = parseLayoutPayload(JSON.parse(layoutJson));
      if (!payload) return false;
      maxZRef.current = Math.max(maxZRef.current, topZ(payload.floating));
      setState(prev => {
        // A panel that stays open keeps its runtime icon: the component that set it isn't
        // re-mounted, so it wouldn't set it again.
        const panels: Record<string, PanelInfo> = {};
        for (const [id, saved] of Object.entries(payload.panels)) {
          // A panel saved without a title — it had a function title, which a layout can't hold —
          // takes its registered default title, as a newly opened one would.
          const info = saved.title ? saved : { ...saved, title: registry.get(saved.component)?.defaultOptions?.title || id };
          const was = prev.panels[id];
          panels[id] = was?.icon !== undefined && was.component === info.component ? { ...info, icon: was.icon } : info;
        }
        const titleOf = (m: { id: string; title?: PanelInfo['title'] }) => m.title || panels[m.id]?.title || m.id;
        return {
          ...prev,
          gridRoot: payload.gridRoot,
          floating: payload.floating,
          minimized: payload.minimized.map(m => (m.title ? m : { ...m, title: titleOf(m) })),
          panels,
          draggedPanelId: null,
          activePanelId: payload.activePanelId
        };
      });
      return true;
    } catch (e) {
      console.error('Failed to parse layout configuration:', e);
      return false;
    }
  };

  const setActivePanel = (id: string | null) => {
    setState(prev => {
      if (prev.activePanelId === id) return prev;
      return { ...prev, activePanelId: id };
    });
  };

  const setDirection = (dir: 'ltr' | 'rtl') => {
    setState(prev => {
      if (prev.dir === dir) return prev;
      return { ...prev, dir, isRtl: dir === 'rtl' };
    });
  };

  const isOpen = (id: string) => id in stateRef.current.panels;

  const getOpenPanelIds = () => Object.keys(stateRef.current.panels);

  const findPanelId = (component: string, dedupeKey: string): string | null => {
    const match = Object.values(stateRef.current.panels).find(
      p => p.component === component && p.dedupeKey === dedupeKey
    );
    return match?.id ?? null;
  };

  const customMenuGettersRef: { current: Map<string, () => ContextMenuItem[]> } = { current: new Map() };

  const showContextMenuFnRef: { current: ((options: ShowContextMenuOptions) => void) | null } = { current: null };
  const registerContextMenuFn = (fn: (options: ShowContextMenuOptions) => void) => {
    showContextMenuFnRef.current = fn;
    return () => { showContextMenuFnRef.current = null; };
  };
  // The menu is portaled out of the workspace: tell it the workspace's direction, for a menu opened
  // without an event to take it from (the menu prefers the event's target when there is one).
  const showContextMenu = (options: ShowContextMenuOptions) => {
    showContextMenuFnRef.current?.({ dir: stateRef.current.dir, ...options });
  };

  const registerPanelContextMenu = (panelId: string, getItems: () => ContextMenuItem[]) => {
    customMenuGettersRef.current.set(panelId, getItems);
    return () => { customMenuGettersRef.current.delete(panelId); };
  };

  const getPanelContextMenuItems = (panelId: string): ContextMenuItem[] =>
    customMenuGettersRef.current.get(panelId)?.() ?? [];

  const actions: InternalWindowActions = {
    openPanel,
    closePanel,
    minimizePanel,
    restorePanel,
    floatPanel,
    dockPanel,
    maximizePanel,
    updateSplitSizes,
    updateFloatingPosition,
    isDropAllowed,
    focusPanel,
    isOpen,
    getOpenPanelIds,
    findPanelId,
    saveLayout,
    loadLayout,
    publish,
    subscribe,
    setDraggedPanelId,
    dockPanelToGroup,
    movePanelOrder,
    closeLeafGroup,
    registerCloseGuard,
    unregisterCloseGuard,
    registerStateProvider,
    unregisterStateProvider,
    setPanelDirty,
    updatePanelTitle,
    setPanelIcon,
    requestClosePanel,
    dockPanelToWorkspaceEdge,
    setActivePanel,
    setDirection,
    registerPanelContextMenu,
    getPanelContextMenuItems,
    showContextMenu,
    registerContextMenuFn,
  };

  const applyProviderDefaults = (defaults: { dir?: 'ltr' | 'rtl'; zIndexBase?: number }): void => {
    if (config.dir === undefined && defaults.dir) setDirection(defaults.dir);
    if (config.zIndexBase === undefined && defaults.zIndexBase !== undefined && state.floating.length === 0) {
      maxZRef.current = defaults.zIndexBase;
    }
  };

  return { actions, getSnapshot, subscribeToState, applyProviderDefaults };
}
