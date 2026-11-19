/**
 * @file useWidgetHosting.ts
 * @description Moving a panel overlay's managed widgets out of their owner panel and back (7.11.0).
 *
 * A widget out of its panel is shown by a hosted panel: a workspace panel of the reserved kind
 * `'rdd:widget'`, owned by this overlay, whose body attaches the widget's content element. The
 * content itself stays rendered here, in the owner panel's tree, so nothing remounts and it keeps
 * its owner's contexts. This overlay owns its hosted panels: it opens and removes them, closes the
 * widget when the user closes one, and removes them all when it unmounts (the owner closed).
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { FormContainerContext } from '../FormContainerContext';
import { WindowStoreSyncContext, useOptionalWindowManagerActionsInternal, useOptionalWindowManagerState, useRegistry } from '../WindowManagerContext';
import { useOptionalPanelHost } from '../workspace/panelHost';
import { optionsFor } from '../../core/panelOptions';
import { findLeafIdOf } from '../../core/layoutTree';
import type { HostedPanelPlacement, PanelInfo, WorkspaceState } from '../../types';
import type { ContextMenuItem } from '../ContextMenu';
import type { OutTarget } from '../../core/widgetPlacement';
import { setPreserveEmbeds } from '../domMove';
import type { ManagedWidget, MoveResult, WidgetLocation, WidgetTarget } from './types';

interface HostingDeps {
  /** Each open widget's content element. */
  contentEls: Map<string, HTMLDivElement>;
  /** Each open widget's config, kept current by open and close. */
  configs: { current: Map<string, ManagedWidget> };
  /** The overlay root, to find a widget's frame on screen. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Closes a widget for real: the user closed its hosted panel. */
  closeWidget: { current: (id: string) => void };
}

export interface WidgetHosting {
  /** Widget id → its hosted panel's id, for the widgets that are out of the panel. */
  hostedIds: Record<string, string>;
  move(id: string, to: WidgetTarget): MoveResult;
  location(id: string): WidgetLocation | null;
  /** Removes a widget's hosted panel, if it has one, without closing anything: for close(). */
  release(id: string): void;
  /** Re-applies a re-opened widget's title, icon and capabilities to its hosted panel. */
  refresh(id: string, config: ManagedWidget): void;
  /** The widget's `titleMenu` items for where it is now; empty without one. */
  menuItems(id: string): ContextMenuItem[];
  /** The owner panel's id, or null when the overlay isn't in a workspace panel. */
  ownerPanelId: string | null;
  /**
   * A widget that keeps its embeds is inside its owner panel's element, which moves whenever the
   * grid changes around it (as it does when a hosted panel docks beside it): that element must
   * move with moveBefore() too, so this marks it, for the rest of its life.
   */
  preserveOwner(): void;
  /** Where a widget out of its panel is, as a saved placement's target; null in the panel. */
  outTarget(id: string): OutTarget | null;
  /** Subscribes to a widget's `onWillMove` / `onMoved`. */
  listen(id: string, kind: 'will' | 'moved', cb: () => void): () => void;
  /** The widget is in its new container: calls `onMoved` once it has a size. */
  settled(id: string): void;
}

/**
 * Which container a widget is in, as a string that changes exactly when the element moves: its
 * location plus, in the grid, the group. Reactive; `hostedId` is undefined while in the panel.
 */
export function useWidgetContainer(hostedId: string | undefined, ownerId: string): { location: WidgetLocation; key: string } {
  const key = useOptionalWindowManagerState((st: WorkspaceState) => containerKey(st, hostedId, ownerId), 'panel');
  return { location: key.split('|')[0] as WidgetLocation, key };
}

function containerKey(st: WorkspaceState, hostedId: string | undefined, ownerId: string): string {
  const panel = hostedId ? st.panels[hostedId] : undefined;
  if (!hostedId || !panel) return 'panel';
  if (panel.state === 'floating') return 'floating';
  if (panel.state === 'minimized') return 'minimized';
  const leaf = findLeafIdOf(st.gridRoot, hostedId);
  return `${leaf === findLeafIdOf(st.gridRoot, ownerId) ? 'tabbed' : 'docked'}|${leaf ?? ''}`;
}

/** A widget's own capabilities, as its hosted panel's options. */
const capabilities = (config: ManagedWidget): { canFloat: boolean; canDock: boolean } =>
  ({ canFloat: config.canFloat ?? false, canDock: config.canDock ?? false });

const NO_HOSTED: Record<string, string> = {};

export function useWidgetHosting({ contentEls, configs, containerRef, closeWidget }: HostingDeps): WidgetHosting {
  const actions = useOptionalWindowManagerActionsInternal();
  const sync = useContext(WindowStoreSyncContext);
  const panelHost = useOptionalPanelHost();
  const registry = useRegistry();
  const ownerId = useContext(FormContainerContext).instanceId;
  const [hostedIds, setHostedIds] = useState<Record<string, string>>(NO_HOSTED);
  // The same record, read synchronously by move() and the cleanup; with each one's close-handler unregister.
  // `target` is the last move's target, for placement(): what the grid alone can't say (which side, how big).
  const hostedRef = useRef(new Map<string, { panelId: string; unregister: () => void; target: WidgetTarget }>());
  // Each widget's onWillMove / onMoved callbacks, and the container each hosted one was last seen in.
  const listenersRef = useRef(new Map<string, { will: Set<() => void>; moved: Set<() => void> }>());
  const lastKeyRef = useRef(new Map<string, string>());
  const fire = (id: string, kind: 'will' | 'moved'): void => {
    listenersRef.current.get(id)?.[kind].forEach(cb => cb());
  };
  // The hosted panels' menu getters are registered once, so they call the latest functions.
  const latestRef = useRef<{ menuItems: (id: string) => ContextMenuItem[] }>({ menuItems: () => [] });

  const setHosted = (id: string, panelId: string | null): void => {
    setHostedIds(prev => {
      if (panelId === null) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return prev[id] === panelId ? prev : { ...prev, [id]: panelId };
    });
  };

  /** Forgets a widget's hosted panel; removes it from the workspace unless it is already gone. */
  const detach = useCallback((id: string, remove: boolean): void => {
    const entry = hostedRef.current.get(id);
    if (!entry) return;
    hostedRef.current.delete(id);
    lastKeyRef.current.delete(id);
    entry.unregister();
    if (remove) actions?.removeHostedPanel(entry.panelId);
    panelHost?.setHostedContent(entry.panelId, null);
    setHosted(id, null);
  }, [actions, panelHost]);

  /** Where the widget's frame is on screen, in workspace pixels: where `'floating'` opens by default. */
  const frameRect = (id: string, config: ManagedWidget): { x: number; y: number; width: number; height: number } => {
    const root = containerRef.current;
    const frame = root
      ? Array.from(root.querySelectorAll<HTMLElement>('[data-rdd-widget]')).find(el => el.getAttribute('data-rdd-widget') === id)
      : undefined;
    const viewport = root?.closest('.rdd-workspace-viewport');
    const f = frame?.getBoundingClientRect();
    const v = viewport?.getBoundingClientRect();
    return {
      x: f && v ? Math.round(f.left - v.left) : 0,
      y: f && v ? Math.round(f.top - v.top) : 0,
      width: f && f.width > 0 ? Math.round(f.width) : (config.width ?? 320),
      height: f && f.height > 0 ? Math.round(f.height) : (config.height ?? 240),
    };
  };

  const move = (id: string, to: WidgetTarget): MoveResult => {
    const config = configs.current.get(id);
    const el = contentEls.get(id);
    if (!config || !el) return { ok: false, reason: 'not-open' };
    const current = hostedRef.current.get(id);
    if (to.to === 'panel') {
      if (current) fire(id, 'will');
      detach(id, true);
      return { ok: true };
    }
    const s = sync?.getSnapshot();
    const owner = s?.panels[ownerId];
    // An overlay in a modal, a drawer or outside any provider has no workspace panel to move beside.
    if (!actions || !panelHost || !owner || owner.owner) return { ok: false, reason: 'no-workspace' };
    if (optionsFor(registry, owner)?.keepAlive === false) return { ok: false, reason: 'owner-not-kept-alive' };
    if (to.to !== 'floating' && owner.state !== 'docked') return { ok: false, reason: 'owner-not-docked' };

    const at: HostedPanelPlacement = to.to === 'floating'
      ? { kind: 'float', rect: to.rect ?? frameRect(id, config) }
      : to.to === 'tabbed'
        ? { kind: 'dock', dockTo: { panel: ownerId, position: 'center' } }
        : { kind: 'dock', dockTo: { panel: ownerId, position: to.position, ...(to.size !== undefined ? { size: to.size } : {}) } };
    fire(id, 'will');
    // Already out: the hosted panel is replaced rather than moved, so every target takes one path.
    // Its content stays rendered here throughout; only the element moves. The new panel keeps the
    // title the old one had, which the app may have set with updatePanelTitle (7.11.0-next.1).
    const title = (current && s?.panels[current.panelId]?.title) ?? (config.title as PanelInfo['title']);
    if (current) detach(id, true);
    const panelId = `${ownerId}/${id}`;
    panelHost.setHostedContent(panelId, el);
    // Its hosted panel's element moves the content wherever the user takes it: it keeps embeds too.
    if (config.preserveEmbeds) setPreserveEmbeds(panelHost.getOrCreateElement(panelId), true);
    const opened = actions.openHostedPanel(panelId, { panelId: ownerId, widgetId: id, options: capabilities(config) }, title, at);
    if (!opened) {
      panelHost.setHostedContent(panelId, null);
      return { ok: false, reason: 'owner-not-docked' };
    }
    if (config.icon !== undefined) actions.setPanelIcon(panelId, config.icon);
    // An in-page close of the hosted panel closes the widget (D17); going back is move({ to: 'panel' }).
    const unregisterClose = actions.registerHostedCloseHandler(panelId, () => {
      detach(id, false);
      closeWidget.current(id);
    }, () => fire(id, 'will'));   // a layout load is about to drop it: the reconcile below sends it home
    // The app's titleMenu items lead the hosted panel's own menus.
    const unregisterMenu = actions.registerPanelContextMenu(panelId, () => latestRef.current.menuItems(id));
    const unregister = (): void => { unregisterClose(); unregisterMenu(); };
    hostedRef.current.set(id, { panelId, unregister, target: to.to === 'floating' ? { to: 'floating', rect: at.kind === 'float' ? at.rect : undefined } : to });
    if (sync) lastKeyRef.current.set(id, containerKey(sync.getSnapshot(), panelId, ownerId));
    setHosted(id, panelId);
    return { ok: true };
  };

  const location = (id: string): WidgetLocation | null => {
    if (!configs.current.has(id)) return null;
    const entry = hostedRef.current.get(id);
    const s = sync?.getSnapshot();
    if (!entry || !s) return 'panel';
    return containerKey(s, entry.panelId, ownerId).split('|')[0] as WidgetLocation;
  };

  const release = useCallback((id: string): void => detach(id, true), [detach]);

  const refresh = (id: string, config: ManagedWidget): void => {
    const entry = hostedRef.current.get(id);
    if (!entry || !actions) return;
    actions.updatePanelTitle(entry.panelId, config.title as PanelInfo['title']);
    actions.setPanelIcon(entry.panelId, config.icon ?? null);
    actions.setHostedOptions(entry.panelId, capabilities(config));
  };

  const menuItems = (id: string): ContextMenuItem[] => {
    const config = configs.current.get(id);
    if (!config?.titleMenu) return [];
    return config.titleMenu({
      id,
      location: location(id) ?? 'panel',
      ...capabilities(config),
      move: to => move(id, to),
      close: () => closeWidget.current(id),
    });
  };
  useEffect(() => { latestRef.current = { menuItems }; });

  const listen = useCallback((id: string, kind: 'will' | 'moved', cb: () => void): (() => void) => {
    let entry = listenersRef.current.get(id);
    if (!entry) { entry = { will: new Set(), moved: new Set() }; listenersRef.current.set(id, entry); }
    entry[kind].add(cb);
    return () => { entry[kind].delete(cb); };
  }, []);

  /** onMoved, once: on the element's first size in its new container, else after two frames. */
  const settled = useCallback((id: string): void => {
    const el = contentEls.get(id);
    if (!el) return;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      observer?.disconnect();
      fire(id, 'moved');
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      if (entries.some(e => e.contentRect.width > 0 && e.contentRect.height > 0)) finish();
    });
    observer?.observe(el);
    const frame = typeof requestAnimationFrame === 'undefined'
      ? (cb: () => void) => setTimeout(cb, 16)
      : requestAnimationFrame;
    frame(() => frame(finish));
  }, [contentEls]);

  const ownerPanelId = sync && sync.getSnapshot().panels[ownerId] ? ownerId : null;

  const preserveOwner = (): void => {
    const el = panelHost?.getElement(ownerId);
    if (el) setPreserveEmbeds(el, true);
  };

  const outTarget = (id: string): OutTarget | null => {
    const entry = hostedRef.current.get(id);
    const s = sync?.getSnapshot();
    if (!entry || !s?.panels[entry.panelId]) return null;
    const where = containerKey(s, entry.panelId, ownerId).split('|')[0];
    const win = s.floating.find(w => w.id === entry.panelId);
    if (where === 'floating' && win) {
      const n = (v: number | string) => (typeof v === 'number' ? v : parseFloat(v) || 0);
      return { at: 'floating', rect: { x: n(win.x), y: n(win.y), width: n(win.width), height: n(win.height) } };
    }
    if (where === 'tabbed') return { at: 'tabbed' };
    const t = entry.target;
    if (where === 'docked') {
      // The side and size it was docked with; a user's drag elsewhere in the grid keeps them.
      return t.to === 'docked' ? { at: 'docked', position: t.position, ...(t.size !== undefined ? { size: t.size } : {}) } : { at: 'docked', position: 'bottom' };
    }
    // Minimised: where it was before.
    if (t.to === 'floating' && t.rect) return { at: 'floating', rect: t.rect };
    if (t.to === 'docked') return { at: 'docked', position: t.position, ...(t.size !== undefined ? { size: t.size } : {}) };
    return { at: 'tabbed' };
  };

  // A hosted panel that left the workspace without this overlay asking (only loadLayout can do
  // that: it never keeps one) sends its widget back into the panel.
  const alive = useOptionalWindowManagerState(
    (st: WorkspaceState) => Object.values(hostedIds).filter(h => h in st.panels).join('\n'), '');
  useEffect(() => {
    const present = new Set(alive.split('\n'));
    for (const [id, panelId] of Object.entries(hostedIds)) {
      if (present.has(panelId) || !hostedRef.current.has(id)) continue;
      detach(id, false);
    }
  }, [alive, hostedIds, detach]);

  // The user moving a hosted panel (a drag to another group, floating, docking, minimising,
  // restoring): the store notifies synchronously, before React moves any DOM, so this is still
  // "before the element moves". The overlay's own moves are fired by move() itself.
  useEffect(() => {
    if (!sync) return;
    return sync.subscribeToState(() => {
      const st = sync.getSnapshot();
      for (const [id, entry] of hostedRef.current) {
        if (!(entry.panelId in st.panels)) continue;   // gone: a close, or the reconcile above
        const key = containerKey(st, entry.panelId, ownerId);
        // Floating: remember its window, so a later minimise still knows where it was.
        const win = key === 'floating' ? st.floating.find(w => w.id === entry.panelId) : undefined;
        if (win && typeof win.x === 'number' && typeof win.y === 'number' && typeof win.width === 'number' && typeof win.height === 'number') {
          entry.target = { to: 'floating', rect: { x: win.x, y: win.y, width: win.width, height: win.height } };
        }
        const last = lastKeyRef.current.get(id);
        lastKeyRef.current.set(id, key);
        if (last !== undefined && last !== key) fire(id, 'will');
      }
    });
  }, [sync, ownerId]);

  // The owner closed, or its overlay unmounted: its widgets go with it, and so do their hosted panels.
  const detachRef = useRef(detach);
  useEffect(() => { detachRef.current = detach; });
  useEffect(() => () => {
    for (const id of Array.from(hostedRef.current.keys())) detachRef.current(id, true);
  }, []);

  // Fresh functions each render are fine: callers reach them through the manager context's memo.
  return useMemo(() => ({ hostedIds, move, location, release, refresh, menuItems, ownerPanelId, listen, settled, outTarget, preserveOwner }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hostedIds, actions, sync, panelHost, registry, ownerId, release, ownerPanelId, listen, settled]);
}
