/**
 * Widgets out of the panel (7.11.0, M3): `useFloatingWidgets().move()` / `location()`, through the
 * public API, in a real desktop.
 *
 * WO1: docked beside the owner: a hosted panel shows the same content element; nothing remounts
 * WO2: tabbed, floating at a rect, and minimised report their location
 * WO3: back into the panel: the frame returns where it was, with the same element and state
 * WO4: from one place out of the panel to another, still without a remount
 * WO5: refusals (not-open, owner-not-docked, owner-not-kept-alive, no-workspace) change nothing
 * WO6: ownership: an in-page close of the hosted panel, close(), closeAll() and the owner closing
 *      all close the widget; a layout load sends it back into the panel
 * WO7: the owner minimised: the widget stays out and on screen
 * WO8: the hosted panel follows the widget's title and icon, also on a re-open
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  createWorkspace, DockableDesktopProvider, RddDesktop, RddPanelOverlay, useFloatingWidgets,
  type Workspace, type FloatingWidgetsApi, type ManagedWidget,
} from '../../index';
import { findLeafIdOf } from '../../core/layoutTree';

let api: FloatingWidgetsApi | null = null;
const mounts = vi.fn();
const unmounts = vi.fn();

/** Widget content with state, and a record of every mount and unmount. */
const Table: React.FC = () => {
  const [n, setN] = useState(0);
  useEffect(() => { mounts(); return () => unmounts(); }, []);
  return <button id="wo-count" onClick={() => setN(x => x + 1)}>{n}</button>;
};
const Grab: React.FC = () => { api = useFloatingWidgets(); return null; };
const Owner: React.FC = () => <RddPanelOverlay><Grab /></RddPanelOverlay>;
const Plain: React.FC = () => <div />;

const table: ManagedWidget = { title: 'Table', content: <Table />, anchor: 'bottom-left', width: 240, height: 160 };

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(): Workspace {
  const ws = createWorkspace({
    panels: {
      map: { component: Owner },
      lazy: { component: Owner, defaultOptions: { keepAlive: false } },
      plain: { component: Plain },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<DockableDesktopProvider workspace={ws}><RddDesktop /></DockableDesktopProvider>); });
  act(() => { ws.openPanel('map', 'map', { title: 'Map' }); });
  act(() => { api!.open('table', table); });
  return ws;
}
const $ = (sel: string) => container!.querySelector(sel);
const content = () => document.querySelector('.rdd-panel-float__content') as HTMLElement | null;
const frame = () => $('[data-rdd-widget="table"]');
const click = () => act(() => { (document.getElementById('wo-count') as HTMLElement).click(); });
const count = () => document.getElementById('wo-count')?.textContent;
const state = (ws: Workspace) => (ws as unknown as { _core: { getSnapshot(): import('../../types').WorkspaceState } })._core.getSnapshot();

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null; container = null; api = null;
  mounts.mockClear(); unmounts.mockClear();
  document.getElementById('preserved-dom-container')?.remove();
});

describe('WO1: docked beside the owner', () => {
  it('opens a hosted panel that shows the same element, and nothing remounts', () => {
    const ws = mount();
    const el = content();
    click(); click();
    let r: ReturnType<FloatingWidgetsApi['move']> | undefined;
    act(() => { r = api!.move('table', { to: 'docked', position: 'bottom', size: 0.3 }); });
    expect(r).toEqual({ ok: true });
    const s = state(ws);
    expect(s.panels['map/table']).toMatchObject({ component: 'rdd:widget', state: 'docked', owner: { panelId: 'map', widgetId: 'table' } });
    expect(findLeafIdOf(s.gridRoot, 'map/table')).not.toBe(findLeafIdOf(s.gridRoot, 'map'));
    expect(content()).toBe(el);
    expect(el!.parentElement!.classList.contains('rdd-hosted-widget')).toBe(true);
    expect(el!.closest('[data-rdd-panel="map/table"]')).not.toBeNull();
    expect(frame()).toBeNull();
    expect(count()).toBe('2');
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(unmounts).not.toHaveBeenCalled();
    expect(api!.location('table')).toBe('docked');
    expect(api!.openIds).toEqual(['table']);
    expect(ws.getOpenPanelIds()).toContain('map/table');
    expect(ws.saveLayout()).not.toContain('map/table');
  });
});

describe('WO2: tabbed, floating and minimised', () => {
  it('a tab in the owner\'s group', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'tabbed' }); });
    const s = state(ws);
    expect(findLeafIdOf(s.gridRoot, 'map/table')).toBe(findLeafIdOf(s.gridRoot, 'map'));
    expect(api!.location('table')).toBe('tabbed');
  });

  it('a floating window at the given rect', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'floating', rect: { x: 40, y: 50, width: 300, height: 200 } }); });
    expect(state(ws).floating.find(w => w.id === 'map/table')).toMatchObject({ x: 40, y: 50, width: 300, height: 200 });
    expect(api!.location('table')).toBe('floating');
    expect(content()!.closest('[data-rdd-panel="map/table"]')).not.toBeNull();
  });

  it('a floating window without a rect takes the widget\'s size', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'floating' }); });
    expect(state(ws).floating.find(w => w.id === 'map/table')).toMatchObject({ width: 240, height: 160 });
  });

  it('minimised by the user', () => {
    const ws = mount();
    act(() => { api!.move('table', { to: 'docked', position: 'right' }); });
    act(() => { ws.minimizePanel('map/table'); });
    expect(api!.location('table')).toBe('minimized');
  });
});

describe('WO3: back into the panel', () => {
  it('the frame returns where it was, with the same element and state; the hosted panel leaves', () => {
    const ws = mount();
    const el = content();
    const style = (frame() as HTMLElement).getAttribute('style');
    click();
    const closed = vi.fn();
    ws.onPanelClose(closed);
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    let r: ReturnType<FloatingWidgetsApi['move']> | undefined;
    act(() => { r = api!.move('table', { to: 'panel' }); });
    expect(r).toEqual({ ok: true });
    expect(state(ws).panels['map/table']).toBeUndefined();
    expect(closed).toHaveBeenCalledWith('map/table');
    expect(frame()).not.toBeNull();
    expect((frame() as HTMLElement).getAttribute('style')).toBe(style);
    expect(content()).toBe(el);
    expect(el!.parentElement!.classList.contains('rdd-panel-float__body')).toBe(true);
    expect(count()).toBe('1');
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(api!.location('table')).toBe('panel');
    expect(api!.isOpen('table')).toBe(true);
  });

  it('is a no-op success when already in the panel', () => {
    mount();
    expect(api!.move('table', { to: 'panel' })).toEqual({ ok: true });
    expect(frame()).not.toBeNull();
  });
});

describe('WO4: from one place out to another', () => {
  it('docked, then floating, then tabbed: one hosted panel, the same element, no remount', () => {
    const ws = mount();
    const el = content();
    click();
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    act(() => { api!.move('table', { to: 'floating', rect: { x: 10, y: 10, width: 200, height: 150 } }); });
    expect(api!.location('table')).toBe('floating');
    act(() => { api!.move('table', { to: 'tabbed' }); });
    expect(api!.location('table')).toBe('tabbed');
    expect(Object.keys(state(ws).panels).sort()).toEqual(['map', 'map/table']);
    expect(state(ws).floating).toEqual([]);
    expect(content()).toBe(el);
    expect(count()).toBe('1');
    expect(mounts).toHaveBeenCalledTimes(1);
  });
});

describe('WO5: refusals', () => {
  it('not-open', () => {
    mount();
    expect(api!.move('nope', { to: 'tabbed' })).toEqual({ ok: false, reason: 'not-open' });
    expect(api!.location('nope')).toBeNull();
  });

  it('owner-not-docked for docked and tabbed; a floating owner can still float it', () => {
    const ws = mount();
    act(() => { ws.floatPanel('map'); });
    const before = state(ws);
    expect(api!.move('table', { to: 'docked', position: 'left' })).toEqual({ ok: false, reason: 'owner-not-docked' });
    expect(api!.move('table', { to: 'tabbed' })).toEqual({ ok: false, reason: 'owner-not-docked' });
    expect(state(ws)).toBe(before);
    expect(frame()).not.toBeNull();
    let r: ReturnType<FloatingWidgetsApi['move']> | undefined;
    act(() => { r = api!.move('table', { to: 'floating' }); });
    expect(r).toEqual({ ok: true });
  });

  it('owner-not-kept-alive', () => {
    const ws = mount();
    act(() => { ws.closePanel('map'); });
    act(() => { ws.openPanel('lz', 'lazy'); });
    act(() => { api!.open('table', table); });
    const before = state(ws);
    expect(api!.move('table', { to: 'docked', position: 'bottom' })).toEqual({ ok: false, reason: 'owner-not-kept-alive' });
    expect(state(ws)).toBe(before);
  });

  it('no-workspace outside a provider', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<Owner />); });
    act(() => { api!.open('table', table); });
    expect(api!.move('table', { to: 'floating' })).toEqual({ ok: false, reason: 'no-workspace' });
    expect(api!.location('table')).toBe('panel');
  });
  it('no-workspace inside a provider but not in a workspace panel (as in a modal or drawer)', () => {
    const ws = createWorkspace({ panels: { plain: { component: Plain } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<DockableDesktopProvider workspace={ws}><Owner /><RddDesktop /></DockableDesktopProvider>); });
    act(() => { api!.open('table', table); });
    const before = state(ws);
    expect(api!.move('table', { to: 'floating' })).toEqual({ ok: false, reason: 'no-workspace' });
    expect(state(ws)).toBe(before);
  });
});

describe('WO6: ownership', () => {
  const out = (ws: Workspace) => { act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); }); return ws; };

  it('an in-page close of the hosted panel closes the widget', () => {
    const ws = out(mount());
    act(() => { ws.closePanel('map/table'); });
    expect(api!.isOpen('table')).toBe(false);
    expect(unmounts).toHaveBeenCalledTimes(1);
    expect(content()).toBeNull();
  });

  it('the tab\'s × closes it the same way', () => {
    out(mount());
    act(() => { ($('[data-rdd-tab="map/table"] .rdd-close-tab-x') as HTMLElement).click(); });
    expect(api!.isOpen('table')).toBe(false);
  });

  it('close() and closeAll() remove the hosted panel', () => {
    const ws = out(mount());
    act(() => { api!.close('table'); });
    expect(state(ws).panels['map/table']).toBeUndefined();
    expect(unmounts).toHaveBeenCalledTimes(1);
    act(() => { api!.open('table', table); });
    out(ws);
    act(() => { api!.closeAll(); });
    expect(state(ws).panels['map/table']).toBeUndefined();
    expect(unmounts).toHaveBeenCalledTimes(2);
  });

  it('the owner closing closes the widget and removes its hosted panel', () => {
    const ws = out(mount());
    act(() => { ws.closePanel('map'); });
    expect(state(ws).panels['map/table']).toBeUndefined();
    expect(unmounts).toHaveBeenCalledTimes(1);
  });

  it('a layout load drops the hosted panel and the widget goes back into its panel', () => {
    const ws = mount();
    const layout = ws.saveLayout();
    click();
    out(ws);
    act(() => { ws.loadLayout(layout); });
    expect(state(ws).panels['map/table']).toBeUndefined();
    expect(api!.isOpen('table')).toBe(true);
    expect(api!.location('table')).toBe('panel');
    expect(frame()).not.toBeNull();
    expect(content()!.parentElement!.classList.contains('rdd-panel-float__body')).toBe(true);
    expect(count()).toBe('1');
  });
});

describe('WO7: the owner minimised', () => {
  it('leaves the widget out and on screen', () => {
    const ws = mount();
    act(() => { ws.openPanel('other', 'plain', { dockTo: { panel: 'map', position: 'right' } }); });
    act(() => { api!.move('table', { to: 'docked', position: 'bottom' }); });
    act(() => { ws.minimizePanel('map'); });
    expect(state(ws).panels['map/table'].state).toBe('docked');
    expect(content()!.closest('[data-rdd-panel="map/table"]')).not.toBeNull();
    expect(content()!.isConnected).toBe(true);
    expect(mounts).toHaveBeenCalledTimes(1);
  });
});

describe('WO8: title and icon', () => {
  it('the hosted panel takes the widget\'s title and icon, and a re-open updates them', () => {
    const ws = mount();
    act(() => { api!.open('table', { ...table, icon: <i className="t-icon" /> }); });
    act(() => { api!.move('table', { to: 'tabbed' }); });
    expect(state(ws).panels['map/table'].title).toBe('Table');
    expect($('[data-rdd-tab="map/table"] .t-icon')).not.toBeNull();
    act(() => { api!.open('table', { ...table, title: 'Rows', icon: <i className="r-icon" /> }); });
    expect(state(ws).panels['map/table'].title).toBe('Rows');
    expect($('[data-rdd-tab="map/table"] .r-icon')).not.toBeNull();
    expect(api!.location('table')).toBe('tabbed');            // a re-open doesn't move it
  });
});
