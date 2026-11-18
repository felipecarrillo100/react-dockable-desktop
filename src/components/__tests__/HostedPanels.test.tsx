/**
 * Hosted panels (7.11.0, step 1 groundwork): a workspace panel that shows a managed widget moved
 * out of its owner panel. Internal in M1, so these drive the core directly.
 *
 * HP1: optionsFor: an ordinary panel gets its type's options; a hosted panel gets the hosted base
 *      plus its own canFloat/canDock; a minimized entry falls back to its component
 * HP2: openHostedPanel docks beside its owner (split or tab), or floats exactly at its rect
 * HP3: ...and refuses, changing nothing, when the owner isn't docked or the id is taken
 * HP4: saveLayout never writes a hosted panel and never reports it as excluded
 * HP5: loadLayout and initialState drop a hosted panel found in a layout, with every reference,
 *      and strip a hand-made `owner`
 * HP6: closePanel on a hosted panel calls its close handler; removeHostedPanel does not
 * HP7: setHostedOptions changes what the user may do (isDropAllowed)
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createWorkspace, type Workspace } from '../../index';
import { optionsFor, HOSTED_COMPONENT } from '../../core/panelOptions';
import type { InternalWindowActions, WorkspaceState, PanelOwner } from '../../types';
import { PanelRegistry } from '../PanelRegistry';

const Plain: React.FC = () => <div />;

type Core = { actions: InternalWindowActions; getSnapshot(): WorkspaceState };
const coreOf = (ws: Workspace) => (ws as unknown as { _core: Core })._core;

/** A workspace with a docked owner panel "map" and, optionally, a floating panel "f". */
function setup(initialState?: string) {
  const ws = createWorkspace({
    panels: { plain: { component: Plain }, pinned: { component: Plain, defaultOptions: { canClose: false } } },
    ...(initialState ? { initialState } : {}),
  });
  const core = coreOf(ws);
  if (!initialState) ws.openPanel('map', 'plain');
  return { ws, core, actions: core.actions, state: () => core.getSnapshot() };
}

const owner = (options?: PanelOwner['options']): PanelOwner => ({ panelId: 'map', widgetId: 'table', ...(options ? { options } : {}) });
const leafOf = (s: WorkspaceState, id: string): string | null => {
  const walk = (n: WorkspaceState['gridRoot']): string | null =>
    n.type === 'leaf' ? (n.panels.includes(id) ? n.id : null) : n.children.map(walk).find(Boolean) ?? null;
  return walk(s.gridRoot);
};

describe('HP1: optionsFor', () => {
  const registry = new PanelRegistry();
  registry.register('plain', Plain, { canFloat: false, title: 'Plain' });

  it('an ordinary panel gets its type\'s options', () => {
    expect(optionsFor(registry, { id: 'a', title: 'A', component: 'plain', state: 'docked', serializable: true }))
      .toEqual({ canFloat: false, title: 'Plain' });
  });

  it('a hosted panel gets the hosted base, and its own canFloat/canDock (false unless allowed)', () => {
    const base = { id: 'h', title: 'H', component: HOSTED_COMPONENT, state: 'docked' as const, serializable: false };
    expect(optionsFor(registry, { ...base, owner: owner() }))
      .toEqual({ canDrag: true, canClose: true, canMinimize: true, keepAlive: true, canFloat: false, canDock: false });
    expect(optionsFor(registry, { ...base, owner: owner({ canFloat: true, canDock: true }) }))
      .toMatchObject({ canFloat: true, canDock: true });
  });

  it('an id no longer open falls back to its component (a minimized entry\'s own copy)', () => {
    expect(optionsFor(registry, undefined, 'plain')).toEqual({ canFloat: false, title: 'Plain' });
    expect(optionsFor(registry, undefined)).toBeUndefined();
  });
});

describe('HP2–HP3: openHostedPanel', () => {
  it('docks below its owner, and publishes panel:opened with the reserved component', () => {
    const { ws, actions, state } = setup();
    const opened = vi.fn();
    ws.subscribe('panel:opened', opened);
    expect(actions.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } })).toBe(true);
    const s = state();
    expect(s.panels['map/table']).toMatchObject({ component: HOSTED_COMPONENT, state: 'docked', owner: owner() });
    expect(leafOf(s, 'map/table')).not.toBe(leafOf(s, 'map'));                   // a split, not a tab
    expect(s.activePanelId).toBe('map/table');
    expect(opened).toHaveBeenCalledWith({ id: 'map/table', component: HOSTED_COMPONENT });
  });

  it('"center" opens it as a tab in its owner\'s group', () => {
    const { actions, state } = setup();
    actions.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'center' } });
    expect(leafOf(state(), 'map/table')).toBe(leafOf(state(), 'map'));
  });

  it('floats exactly at its rect, not cascaded off a window already there', () => {
    const { ws, actions, state } = setup();
    ws.openPanel('f', 'plain', { initialTarget: 'floating' });
    const taken = state().floating.find(w => w.id === 'f')!;
    const rect = { x: taken.x as number, y: taken.y as number, width: 300, height: 200 };
    actions.openHostedPanel('map/table', owner(), 'Table', { kind: 'float', rect });
    expect(state().floating.find(w => w.id === 'map/table')).toMatchObject(rect);
  });

  it('refuses, changing nothing, when the owner isn\'t docked or the id is taken', () => {
    const { ws, actions, state } = setup();
    ws.openPanel('f', 'plain', { initialTarget: 'floating' });
    const before = state();
    expect(actions.openHostedPanel('f/w', { panelId: 'f', widgetId: 'w' }, 'W', { kind: 'dock', dockTo: { panel: 'f', position: 'bottom' } })).toBe(false);
    expect(actions.openHostedPanel('map', owner(), 'Taken', { kind: 'float', rect: { x: 0, y: 0, width: 10, height: 10 } })).toBe(false);
    expect(state()).toBe(before);
  });
});

describe('HP4: saveLayout', () => {
  it('never writes a hosted panel, and never reports it as excluded', () => {
    const { ws, actions } = setup();
    actions.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } });
    actions.openHostedPanel('map/chart', { panelId: 'map', widgetId: 'chart' }, 'Chart', { kind: 'float', rect: { x: 10, y: 10, width: 200, height: 100 } });
    const excluded = vi.fn();
    ws.onPanelsExcluded(excluded);
    const saved = ws.saveLayout();
    expect(saved).not.toContain('map/table');
    expect(saved).not.toContain('map/chart');
    expect(saved).not.toContain(HOSTED_COMPONENT);
    expect(excluded).not.toHaveBeenCalled();
    expect(JSON.parse(saved).panels).toHaveProperty('map');
  });
});

describe('HP5: loading a layout that names a hosted panel', () => {
  const crafted = () => {
    const { ws, actions } = setup();
    ws.openPanel('f', 'plain', { initialTarget: 'floating' });
    actions.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'center' } });
    actions.openHostedPanel('map/chart', { panelId: 'map', widgetId: 'chart' }, 'Chart', { kind: 'float', rect: { x: 10, y: 10, width: 200, height: 100 } });
    // What saveLayout would have written without its guard: the hosted panels and their places.
    const s = coreOf(ws).getSnapshot();
    const panels = Object.fromEntries(Object.entries(s.panels).map(([id, p]) => [id, { ...p, owner: undefined }]));
    panels.map = { ...panels.map, owner: { panelId: 'x', widgetId: 'y' } } as never;   // a hand-made owner on an ordinary panel
    return JSON.stringify({ version: 2, gridRoot: s.gridRoot, floating: s.floating, minimized: [], panels, activePanelId: 'map/table' });
  };

  it('loadLayout drops it from panels, the tree and the floating windows, and strips a hand-made owner', () => {
    const json = crafted();
    const { ws, state } = setup();
    expect(ws.loadLayout(json)).toBe(true);
    const s = state();
    expect(Object.keys(s.panels).sort()).toEqual(['f', 'map']);
    expect(leafOf(s, 'map/table')).toBeNull();
    expect(s.floating.map(w => w.id)).toEqual(['f']);
    expect(s.panels.map.owner).toBeUndefined();
    expect(s.activePanelId).not.toBe('map/table');
  });

  it('initialState drops it the same way', () => {
    const { state } = setup(crafted());
    expect(Object.keys(state().panels).sort()).toEqual(['f', 'map']);
    expect(state().floating.map(w => w.id)).toEqual(['f']);
  });

  it('a live hosted panel is not in a loaded layout, so the load removes it', () => {
    const { ws, actions, state } = setup();
    const layout = ws.saveLayout();
    actions.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } });
    ws.loadLayout(layout);
    expect(state().panels['map/table']).toBeUndefined();
  });
});

describe('HP6: closing', () => {
  it('closePanel on a hosted panel removes it and calls its close handler once', () => {
    const { ws, actions, state } = setup();
    actions.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } });
    const onClose = vi.fn();
    actions.registerHostedCloseHandler('map/table', onClose);
    const closed = vi.fn();
    ws.onPanelClose(closed);
    ws.closePanel('map/table');
    expect(state().panels['map/table']).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledWith('map/table');
  });

  it('removeHostedPanel removes it without calling the handler (the widget is going back)', () => {
    const { ws, actions, state } = setup();
    actions.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } });
    const onClose = vi.fn();
    actions.registerHostedCloseHandler('map/table', onClose);
    const closed = vi.fn();
    ws.onPanelClose(closed);
    actions.removeHostedPanel('map/table');
    expect(state().panels['map/table']).toBeUndefined();
    expect(onClose).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledWith('map/table');
  });

  it('removeHostedPanel leaves an ordinary panel alone; an unregistered handler is not called', () => {
    const { ws, actions, state } = setup();
    actions.removeHostedPanel('map');
    expect(state().panels.map).toBeDefined();
    actions.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } });
    const onClose = vi.fn();
    const unregister = actions.registerHostedCloseHandler('map/table', onClose);
    unregister();
    ws.closePanel('map/table');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('HP7: setHostedOptions', () => {
  it('changes what the user may do with the hosted panel', () => {
    const { actions } = setup();
    actions.openHostedPanel('map/table', owner(), 'Table', { kind: 'dock', dockTo: { panel: 'map', position: 'bottom' } });
    expect(actions.isDropAllowed('map/table', { kind: 'float', anchor: null })).toBe(false);
    actions.setHostedOptions('map/table', { canFloat: true, canDock: false });
    expect(actions.isDropAllowed('map/table', { kind: 'float', anchor: null })).toBe(true);
    expect(actions.isDropAllowed('map/table', { kind: 'edge', side: 'left' })).toBe(false);
    actions.setHostedOptions('map/table', { canFloat: true, canDock: true });
    expect(actions.isDropAllowed('map/table', { kind: 'edge', side: 'left' })).toBe(true);
  });
});
